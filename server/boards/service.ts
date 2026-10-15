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
    "That board isn’t available in your account.",
  );
const scope = (owner: string, id?: string) =>
  and(
    eq(boards.ownerUserId, owner),
    isNull(boards.deletedAt),
    id ? eq(boards.id, id) : undefined,
  );
export class BoardService {
  constructor(private db: Database) {}
  async get(owner: string, id: string): Promise<BoardRecord> {
    const [row] = await this.db
      .select({
        board: revisions.content,
        revisionId: revisions.id,
        revisionNumber: revisions.revisionNumber,
      })
      .from(boards)
      .innerJoin(revisions, eq(boards.currentRevisionId, revisions.id))
      .where(scope(owner, id));
    if (!row) throw missing();
    return row;
  }
  async list(
    owner: string,
    limit = 30,
    cursor?: { updatedAt: string; id: string },
  ): Promise<BoardPage> {
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
          scope(owner),
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
    return this.db.transaction(async (tx) => {
      // Serialize retry keys even when their first board row has not committed yet.
      if (clientKey) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${owner + ":" + clientKey}, 0))`,
        );
        const [existing] = await tx
          .select()
          .from(boards)
          .where(
            and(
              eq(boards.ownerUserId, owner),
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
        ownerUserId: owner,
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
      return { board, revisionId, revisionNumber: 1 };
    });
  }
  async save(
    owner: string,
    id: string,
    value: unknown,
    baseRevisionId: string,
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
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(boards)
        .where(scope(owner, id))
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
  async delete(owner: string, id: string) {
    const result = await this.db
      .update(boards)
      .set({ deletedAt: new Date() })
      .where(scope(owner, id))
      .returning({ id: boards.id });
    if (!result.length) throw missing();
  }
  async import(
    owner: string,
    items: { key: string; board: unknown }[],
  ): Promise<ImportResult[]> {
    const results: ImportResult[] = [];
    for (const item of items) {
      try {
        const saved = await this.create(
          owner,
          item.board,
          `local:${item.key}`,
          "local-import",
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
