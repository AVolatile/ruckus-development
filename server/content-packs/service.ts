import { z } from "zod/v3";
import { randomUUID, randomInt } from "node:crypto";
import {
  and,
  or,
  eq,
  isNull,
  desc,
  lt,
  sql,
  inArray,
  ilike,
} from "drizzle-orm";
import {
  contentPacks as packs,
  contentRevisions as revisions,
} from "../db/content-schema.js";
import {
  authorize,
  lockWorkspace,
  personalWorkspace,
  type Connection,
  type Transaction,
} from "../workspaces/policy.js";
import { audit } from "../workspaces/audit.js";
import { ApiError } from "../api/errors.js";
import type { Database } from "../db/client.js";
import {
  validatePack,
  packFiltersSchema,
  selectPackPrompts,
  defaultPackId,
  copyPackName,
  type PackDocument,
  type PackRecord,
  type PackReference,
} from "../../shared/content-packs.js";
import type { GameId, Settings } from "../../shared/types.js";
import { packHash } from "./hash.js";
const missing = () =>
  new ApiError(
    404,
    "CONTENT_PACK_NOT_FOUND",
    "That content pack isn’t available.",
  );
const metadata = (d: PackDocument) => ({
  name: d.name,
  shortDescription: d.shortDescription,
  description: d.description,
  category: d.category,
  season: d.season,
  difficulty: d.difficulty,
  tags: d.tags,
  status: d.status,
});
export class ContentPackService {
  constructor(private db: Database) {}
  async row(c: Connection, wid: string | null, id: string) {
    const [r] = await c
      .select({ pack: packs, revision: revisions })
      .from(packs)
      .innerJoin(revisions, eq(packs.currentRevisionId, revisions.id))
      .where(
        and(
          eq(packs.id, id),
          isNull(packs.archivedAt),
          wid
            ? or(eq(packs.ownerType, "ruckus"), eq(packs.workspaceId, wid))
            : eq(packs.ownerType, "ruckus"),
        ),
      );
    if (!r) throw missing();
    return r;
  }
  record(r: Awaited<ReturnType<ContentPackService["row"]>>): PackRecord {
    return {
      id: r.pack.id,
      workspaceId: r.pack.workspaceId,
      ownerType: r.pack.ownerType,
      gameType: r.pack.gameType,
      name: r.pack.name,
      shortDescription: r.pack.shortDescription,
      category: r.pack.category,
      season: r.pack.season,
      difficulty: r.pack.difficulty,
      status: r.pack.status,
      itemCount: r.revision.itemCount,
      updatedAt: r.pack.updatedAt.toISOString(),
      revisionId: r.revision.id,
      revisionNumber: r.revision.revisionNumber,
      document: r.revision.document,
      provenance: r.pack.provenance,
    };
  }
  async get(actor: string, wid: string | null, id: string) {
    if (wid) await authorize(this.db, actor, wid, "content.read");
    return this.record(await this.row(this.db, wid, id));
  }
  async list(actor: string, wid: string | null, input: unknown) {
    if (wid) await authorize(this.db, actor, wid, "content.read");
    const f = packFiltersSchema.parse(input);
    let cursor: { updatedAt: string; id: string } | undefined;
    if (f.cursor) {
      try {
        cursor = z
          .object({ updatedAt: z.string().datetime(), id: z.string().uuid() })
          .strict()
          .parse(JSON.parse(Buffer.from(f.cursor, "base64url").toString()));
      } catch {
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Reload the pack list to continue.",
        );
      }
    }
    const search = f.q?.replace(/[\\%_]/g, "\\$&");
    const rows = await this.db
      .select({
        id: packs.id,
        workspaceId: packs.workspaceId,
        ownerType: packs.ownerType,
        gameType: packs.gameType,
        name: packs.name,
        shortDescription: packs.shortDescription,
        category: packs.category,
        season: packs.season,
        difficulty: packs.difficulty,
        status: packs.status,
        itemCount: revisions.itemCount,
        updatedAt: packs.updatedAt,
      })
      .from(packs)
      .innerJoin(revisions, eq(packs.currentRevisionId, revisions.id))
      .where(
        and(
          isNull(packs.archivedAt),
          wid
            ? or(eq(packs.ownerType, "ruckus"), eq(packs.workspaceId, wid))
            : eq(packs.ownerType, "ruckus"),
          f.source ? eq(packs.ownerType, f.source) : undefined,
          f.game ? eq(packs.gameType, f.game) : undefined,
          f.category ? eq(packs.category, f.category) : undefined,
          f.season ? eq(packs.season, f.season) : undefined,
          f.difficulty ? eq(packs.difficulty, f.difficulty) : undefined,
          f.status ? eq(packs.status, f.status) : undefined,
          search
            ? or(
                ilike(packs.name, `%${search}%`),
                ilike(packs.description, `%${search}%`),
                sql`array_to_string(${packs.tags}, ' ') ilike ${`%${search}%`}`,
              )
            : undefined,
          cursor
            ? or(
                lt(packs.updatedAt, new Date(cursor.updatedAt)),
                and(
                  eq(packs.updatedAt, new Date(cursor.updatedAt)),
                  lt(packs.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(packs.updatedAt), desc(packs.id))
      .limit(51);
    const items = rows
        .slice(0, 50)
        .map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })),
      last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > 50 && last
          ? Buffer.from(
              JSON.stringify({ updatedAt: last.updatedAt, id: last.id }),
            ).toString("base64url")
          : null,
    };
  }
  async insert(
    tx: Transaction,
    actor: string,
    wid: string,
    d: PackDocument,
    source?: { packId: string; revisionId: string },
  ) {
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(packs)
      .where(and(eq(packs.workspaceId, wid), isNull(packs.archivedAt)));
    if (n >= 100)
      throw new ApiError(
        409,
        "CONTENT_PACK_LIMIT",
        "Archive an unused pack before adding more. This workspace has reached the 100 active-pack technical safeguard.",
      );
    const id = randomUUID(),
      rid = randomUUID();
    await tx.insert(packs).values({
      id,
      workspaceId: wid,
      ownerType: "workspace",
      visibility: "workspace_private",
      gameType: d.content.gameType,
      ...metadata(d),
      currentRevisionId: rid,
      createdByUserId: actor,
      provenance: source ? "copied" : "workspace_authored",
      sourcePackId: source?.packId,
      sourceRevisionId: source?.revisionId,
    });
    await tx.insert(revisions).values({
      id: rid,
      packId: id,
      revisionNumber: 1,
      schemaVersion: 1,
      document: d,
      contentHash: packHash(d),
      itemCount: d.content.items.length,
      createdByUserId: actor,
    });
    await audit(
      tx,
      wid,
      actor,
      source ? "content_pack.copied" : "content_pack.created",
      "content_pack",
      id,
      { name: d.name, revisionId: rid },
    );
    return this.record(await this.row(tx, wid, id));
  }
  async create(actor: string, wid: string, value: unknown) {
    const d = this.parse(value);
    return this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, actor, wid, "content.create");
      return this.insert(tx, actor, wid, d);
    });
  }
  private parse(value: unknown) {
    try {
      return validatePack(value);
    } catch (e) {
      if (e instanceof Error && !("issues" in e))
        throw new ApiError(422, "CONTENT_INVALID", e.message);
      throw e;
    }
  }
  async save(
    actor: string,
    wid: string,
    id: string,
    value: unknown,
    base: string,
  ) {
    const d = this.parse(value);
    return this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, actor, wid, "content.update");
      const r = await this.row(tx, wid, id);
      if (r.pack.workspaceId !== wid) throw missing();
      if (r.pack.gameType !== d.content.gameType)
        throw new ApiError(
          422,
          "CONTENT_GAME_MISMATCH",
          "A pack’s game cannot change. Create a separate pack instead.",
        );
      if (r.revision.id !== base)
        throw new ApiError(
          409,
          "CONTENT_CONFLICT",
          "Someone saved a newer pack. Your edits are still here. Export them or load the latest version.",
        );
      const hash = packHash(d);
      if (hash === r.revision.contentHash) return this.record(r);
      const rid = randomUUID();
      await tx.insert(revisions).values({
        id: rid,
        packId: id,
        revisionNumber: r.revision.revisionNumber + 1,
        schemaVersion: 1,
        document: d,
        contentHash: hash,
        itemCount: d.content.items.length,
        createdByUserId: actor,
      });
      await tx
        .update(packs)
        .set({ ...metadata(d), currentRevisionId: rid, updatedAt: new Date() })
        .where(eq(packs.id, id));
      await audit(tx, wid, actor, "content_pack.updated", "content_pack", id, {
        revisionId: rid,
      });
      return this.record(await this.row(tx, wid, id));
    });
  }
  async archive(actor: string, wid: string, id: string) {
    await this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, actor, wid, "content.archive");
      const r = await this.row(tx, wid, id);
      if (r.pack.workspaceId !== wid) throw missing();
      await tx
        .update(packs)
        .set({
          status: "archived",
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(packs.id, id));
      await audit(tx, wid, actor, "content_pack.archived", "content_pack", id);
    });
  }
  async copyIn(
    tx: Transaction,
    actor: string,
    source: string | null,
    id: string,
    target: string,
  ) {
    if (source) await authorize(tx, actor, source, "content.read");
    await authorize(tx, actor, target, "content.create");
    const r = await this.row(tx, source, id);
    return this.insert(
      tx,
      actor,
      target,
      { ...r.revision.document, name: copyPackName(r.pack.name) },
      { packId: r.pack.id, revisionId: r.revision.id },
    );
  }
  async copy(actor: string, source: string | null, id: string, target: string) {
    return this.db.transaction(async (tx) => {
      for (const wid of [
        ...new Set([source, target].filter((w): w is string => !!w)),
      ].sort())
        await lockWorkspace(tx, wid);
      return this.copyIn(tx, actor, source, id, target);
    });
  }
  async resolveMany(c: Connection, wid: string, ids: string[]) {
    if (!ids.length)
      return new Map<string, Awaited<ReturnType<ContentPackService["row"]>>>();
    const rows = await c
      .select({ pack: packs, revision: revisions })
      .from(packs)
      .innerJoin(revisions, eq(packs.currentRevisionId, revisions.id))
      .where(
        and(
          inArray(packs.id, [...new Set(ids)]),
          isNull(packs.archivedAt),
          or(eq(packs.ownerType, "ruckus"), eq(packs.workspaceId, wid)),
        ),
      );
    return new Map(rows.map((r) => [r.pack.id, r]));
  }
  freeze(
    r: Awaited<ReturnType<ContentPackService["row"]>> | undefined,
    game: GameId,
    rounds: number,
    topic: string,
    offset: number,
  ) {
    if (!r || r.pack.status !== "ready" || r.pack.gameType !== game)
      throw new ApiError(
        422,
        "CONTENT_UNAVAILABLE",
        "Choose a ready, compatible content pack available in this workspace.",
      );
    const d = this.parse(r.revision.document);
    if (d.status !== "ready")
      throw new ApiError(422, "CONTENT_UNAVAILABLE", "This pack isn’t ready.");
    const reference: PackReference = {
      packId: r.pack.id,
      revisionId: r.revision.id,
      revisionNumber: r.revision.revisionNumber,
      schemaVersion: 1,
      name: r.pack.name,
      gameType: game,
    };
    return {
      reference,
      prompts: selectPackPrompts(d.content, rounds, topic, offset),
    };
  }
  async forStandalone(
    actor: string,
    settings: Settings,
    reference?: {
      workspaceId: string;
      selections: Partial<Record<GameId, string>>;
    },
  ) {
    return this.db.transaction(async (tx) => {
      const wid =
        reference?.workspaceId ?? (await personalWorkspace(tx, actor));
      await lockWorkspace(tx, wid);
      await authorize(tx, actor, wid, "boards.launch");
      await authorize(tx, actor, wid, "content.read");
      const ids = settings.playlist.map(
          (g) => reference?.selections[g] ?? defaultPackId(g),
        ),
        rows = await this.resolveMany(tx, wid, ids);
      const offset = randomInt(500);
      return settings.playlist.map((g, n) =>
        this.freeze(
          rows.get(ids[n]),
          g,
          settings.rounds,
          settings.pack,
          offset,
        ),
      );
    });
  }
}
