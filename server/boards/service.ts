import {
  authorize,
  lockWorkspace,
  personalWorkspace,
  type Transaction,
} from "../workspaces/policy.js";
import { audit } from "../workspaces/audit.js";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { boardIssues, type CustomBoard } from "../../shared/boards.js";
import type {
  BoardPage,
  BoardRecord,
  ImportResult,
} from "../../shared/cloud.js";
import type { Database } from "../db/client.js";
import {
  boardsTable as boards,
  revisionsTable as revisions,
} from "../db/schema.js";
import { ApiError } from "../api/errors.js";
import { contentHash, parseDraft } from "./content.js";
const missing = () =>
  new ApiError(
    404,
    "BOARD_NOT_FOUND",
    "That board isn’t available in this workspace.",
  );
const scope = (owner: string, id?: string) =>
  and(
    eq(boards.workspaceId, owner),
    isNull(boards.deletedAt),
    id ? eq(boards.id, id) : undefined,
  );
export class BoardService {
  constructor(private db: Database) {}
  async get(
    owner: string,
    id: string,
    workspaceId?: string,
  ): Promise<BoardRecord> {
    const wid = workspaceId || (await personalWorkspace(this.db, owner));
    await authorize(this.db, owner, wid, "boards.read");
    const [row] = await this.db
      .select({
        board: revisions.content,
        revisionId: revisions.id,
        revisionNumber: revisions.revisionNumber,
      })
      .from(boards)
      .innerJoin(revisions, eq(boards.currentRevisionId, revisions.id))
      .where(scope(wid, id));
    if (!row) throw missing();
    return row;
  }
  async forLaunch(
    actor: string,
    wid: string,
    id: string,
  ): Promise<CustomBoard> {
    return this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, actor, wid, "boards.launch");
      const [row] = await tx
        .select({ board: revisions.content })
        .from(boards)
        .innerJoin(revisions, eq(boards.currentRevisionId, revisions.id))
        .where(scope(wid, id));
      if (!row) throw missing();
      return row.board;
    });
  }
  async list(
    owner: string,
    limit = 30,
    cursor?: { updatedAt: string; id: string },
    workspaceId?: string,
  ): Promise<BoardPage> {
    const wid = workspaceId || (await personalWorkspace(this.db, owner));
    await authorize(this.db, owner, wid, "boards.read");
    const rows = await this.db
      .select({
        id: boards.id,
        title: boards.title,
        description: boards.description,
        createdAt: boards.createdAt,
        updatedAt: boards.updatedAt,
        revisionId: boards.currentRevisionId,
        category: sql<string>`${revisions.content}->>'category'`,
        coverStyle: sql<
          CustomBoard["coverStyle"]
        >`${revisions.content}->'coverStyle'`,
        questionCount: sql<number>`jsonb_array_length(${revisions.content}->'questions')`,
        minutes: sql<number>`greatest(1, ceil((5 + (select sum((q->>'timer')::int + 9) from jsonb_array_elements(${revisions.content}->'questions') q)) / 60.0))::int`,
      })
      .from(boards)
      .innerJoin(revisions, eq(boards.currentRevisionId, revisions.id))
      .where(
        and(
          scope(wid),
          cursor
            ? or(
                lt(boards.updatedAt, new Date(cursor.updatedAt)),
                and(
                  eq(boards.updatedAt, new Date(cursor.updatedAt)),
                  lt(boards.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(boards.updatedAt), desc(boards.id))
      .limit(limit + 1);
    const items = rows.slice(0, limit).map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(
              JSON.stringify({ updatedAt: last.updatedAt, id: last.id }),
            ).toString("base64url")
          : null,
    };
  }
  async create(
    owner: string,
    value: unknown,
    clientKey?: string,
    source = "studio",
    workspaceId?: string,
  ): Promise<BoardRecord> {
    let draft: CustomBoard;
    try {
      draft = parseDraft(value);
    } catch {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "This board has an unsupported or unsafe draft format.",
      );
    }
    const wid = workspaceId || (await personalWorkspace(this.db, owner));
    return this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, owner, wid, "boards.create");
      return this.insert(tx, owner, wid, draft, clientKey, source);
    });
  }
  private async insert(
    tx: Transaction,
    owner: string,
    wid: string,
    draft: CustomBoard,
    clientKey: string | undefined,
    source: string,
  ): Promise<BoardRecord> {
    // Serialize retry keys even when their first board row has not committed yet.
    if (clientKey) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${wid + ":" + clientKey}, 0))`,
      );
      const [existing] = await tx
        .select()
        .from(boards)
        .where(
          and(
            eq(boards.workspaceId, wid),
            eq(boards.clientImportKey, clientKey),
          ),
        );
      if (existing) {
        if (existing.deletedAt)
          throw new ApiError(
            409,
            "IMPORT_RETIRED",
            "This board was already imported and later deleted. Create a new copy if you want it again.",
          );
        const [revision] = await tx
          .select()
          .from(revisions)
          .where(eq(revisions.id, existing.currentRevisionId));
        return {
          board: revision.content,
          revisionId: revision.id,
          revisionNumber: revision.revisionNumber,
        };
      }
    }
    const id = randomUUID(),
      revisionId = randomUUID(),
      now = new Date();
    const board = {
      ...draft,
      id,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await tx.insert(boards).values({
      id,
      createdByUserId: owner,
      workspaceId: wid,
      title: board.title,
      description: board.description,
      status: boardIssues(board).length ? "draft" : "ready",
      currentRevisionId: revisionId,
      clientImportKey: clientKey,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(revisions).values({
      id: revisionId,
      boardId: id,
      revisionNumber: 1,
      content: board,
      contentHash: contentHash(board),
      createdByUserId: owner,
      source,
    });
    await audit(tx, wid, owner, "board.created", "board", id);
    return { board, revisionId, revisionNumber: 1 };
  }
  async save(
    owner: string,
    id: string,
    value: unknown,
    baseRevisionId: string,
    workspaceId?: string,
  ): Promise<BoardRecord> {
    let draft: CustomBoard;
    try {
      draft = parseDraft(value);
    } catch {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "This board has an unsupported or unsafe draft format.",
      );
    }
    const wid = workspaceId || (await personalWorkspace(this.db, owner));
    return this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, owner, wid, "boards.update");
      const [row] = await tx
        .select()
        .from(boards)
        .where(scope(wid, id))
        .for("update");
      if (!row) throw missing();
      const [current] = await tx
        .select()
        .from(revisions)
        .where(eq(revisions.id, row.currentRevisionId));
      if (row.currentRevisionId !== baseRevisionId)
        throw new ApiError(
          409,
          "BOARD_CONFLICT",
          "This board changed in another tab or device. Your edits have been kept here.",
          {
            revisionId: current.id,
            revisionNumber: current.revisionNumber,
            updatedAt: row.updatedAt.toISOString(),
          },
        );
      const hash = contentHash(draft);
      if (hash === current.contentHash)
        return {
          board: current.content,
          revisionId: current.id,
          revisionNumber: current.revisionNumber,
        };
      const now = new Date(),
        revisionId = randomUUID(),
        revisionNumber = current.revisionNumber + 1;
      const board = {
        ...draft,
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        updatedAt: now.toISOString(),
      };
      await tx.insert(revisions).values({
        id: revisionId,
        boardId: id,
        revisionNumber,
        content: board,
        contentHash: hash,
        createdByUserId: owner,
        source: "studio",
      });
      await tx
        .update(boards)
        .set({
          title: board.title,
          description: board.description,
          status: boardIssues(board).length ? "draft" : "ready",
          currentRevisionId: revisionId,
          updatedAt: now,
        })
        .where(eq(boards.id, id));
      return { board, revisionId, revisionNumber };
    });
  }
  async delete(owner: string, id: string, workspaceId?: string) {
    const wid = workspaceId || (await personalWorkspace(this.db, owner));
    await this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, owner, wid, "boards.delete");
      const rows = await tx
        .update(boards)
        .set({ deletedAt: new Date() })
        .where(scope(wid, id))
        .returning({ id: boards.id });
      if (!rows.length) throw missing();
      await audit(tx, wid, owner, "board.deleted", "board", id);
    });
  }
  async copy(
    actor: string,
    sourceWorkspace: string,
    id: string,
    targetWorkspace: string,
  ) {
    return this.db.transaction(async (tx) => {
      for (const wid of [...new Set([sourceWorkspace, targetWorkspace])].sort())
        await lockWorkspace(tx, wid);
      await authorize(tx, actor, sourceWorkspace, "boards.read");
      await authorize(tx, actor, targetWorkspace, "boards.create");
      const [source] = await tx
        .select({ content: revisions.content })
        .from(boards)
        .innerJoin(revisions, eq(boards.currentRevisionId, revisions.id))
        .where(scope(sourceWorkspace, id));
      if (!source) throw missing();
      const draft = {
        ...source.content,
        title: `${source.content.title || "Untitled board"} (copy)`.slice(
          0,
          60,
        ),
      };
      const saved = await this.insert(
        tx,
        actor,
        targetWorkspace,
        draft,
        undefined,
        "workspace-copy",
      );
      await audit(
        tx,
        targetWorkspace,
        actor,
        "board.copied_between_workspaces",
        "board",
        saved.board.id,
        { sourceWorkspaceId: sourceWorkspace, sourceBoardId: id },
      );
      return saved;
    });
  }

  async import(
    owner: string,
    items: { key: string; board: unknown }[],
    workspaceId?: string,
  ): Promise<ImportResult[]> {
    const results: ImportResult[] = [];
    for (const item of items) {
      try {
        const saved = await this.create(
          owner,
          item.board,
          `local:${item.key}`,
          "local-import",
          workspaceId,
        );
        results.push({ key: item.key, id: saved.board.id });
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        results.push({
          key: item.key,
          code: error.code,
          message: error.message,
        });
      }
    }
    return results;
  }
}
