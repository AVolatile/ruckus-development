import { createHash, randomInt, randomUUID } from "node:crypto";
import { and, eq, isNull, desc, lt, or, sql } from "drizzle-orm";
import {
  events,
  eventRevisions,
  eventSnapshots,
  eventSnapshotAssets,
} from "../db/event-schema.js";
import { boardsTable, revisionsTable } from "../db/schema.js";
import {
  brandKits,
  brandRevisions,
  brandAssets,
} from "../db/workspace-schema.js";
import {
  eventDefinitionSchema,
  type EventDefinition,
  type EventRecord,
  type LaunchSnapshot,
  type FrozenSegment,
} from "../../shared/events.js";
import { resolveBrandSnapshot } from "../../shared/brand.js";
import { validateBoard } from "../../shared/boards.js";
import { gameById, DEFAULT_SETTINGS } from "../../shared/catalog.js";
import {
  authorize,
  lockWorkspace,
  type Transaction,
  type Connection,
} from "../workspaces/policy.js";
import { audit } from "../workspaces/audit.js";
import { ApiError } from "../api/errors.js";
import { settingsSchema } from "../validation.js";
import { ContentPackService } from "../content-packs/service.js";
import { defaultPackId } from "../../shared/content-packs.js";
import { contentHash } from "../boards/content.js";
import type { Database } from "../db/client.js";
const missing = () =>
  new ApiError(404, "EVENT_NOT_FOUND", "That event isn’t available.");
export const eventHash = (d: EventDefinition) =>
  createHash("sha256")
    .update(JSON.stringify(eventDefinitionSchema.parse(d)))
    .digest("hex");
export class EventService {
  constructor(private db: Database) {}
  private async row(c: Connection, wid: string, id: string) {
    const [row] = await c
      .select({ event: events, revision: eventRevisions })
      .from(events)
      .innerJoin(
        eventRevisions,
        eq(events.currentRevisionId, eventRevisions.id),
      )
      .where(
        and(
          eq(events.id, id),
          eq(events.workspaceId, wid),
          isNull(events.archivedAt),
        ),
      );
    if (!row) throw missing();
    return row;
  }
  private record(row: Awaited<ReturnType<EventService["row"]>>): EventRecord {
    return {
      id: row.event.id,
      workspaceId: row.event.workspaceId,
      revisionId: row.revision.id,
      revisionNumber: row.revision.revisionNumber,
      definition: row.revision.definition,
      status: row.event.status,
      updatedAt: row.event.updatedAt.toISOString(),
    };
  }
  async get(actor: string, wid: string, id: string) {
    await authorize(this.db, actor, wid, "events.read");
    return this.record(await this.row(this.db, wid, id));
  }
  async list(
    actor: string,
    wid: string,
    cursor?: { updatedAt: string; id: string },
  ) {
    await authorize(this.db, actor, wid, "events.read");
    const rows = await this.db
      .select({
        id: events.id,
        name: events.name,
        status: events.status,
        updatedAt: events.updatedAt,
      })
      .from(events)
      .where(
        and(
          eq(events.workspaceId, wid),
          isNull(events.archivedAt),
          cursor
            ? or(
                lt(events.updatedAt, new Date(cursor.updatedAt)),
                and(
                  eq(events.updatedAt, new Date(cursor.updatedAt)),
                  lt(events.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(events.updatedAt), desc(events.id))
      .limit(31);
    const items = rows
      .slice(0, 30)
      .map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > 30 && last
          ? Buffer.from(
              JSON.stringify({ updatedAt: last.updatedAt, id: last.id }),
            ).toString("base64url")
          : null,
    };
  }
  private async insert(
    tx: Transaction,
    actor: string,
    wid: string,
    definition: EventDefinition,
    action = "event.created",
  ) {
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(events)
      .where(and(eq(events.workspaceId, wid), isNull(events.archivedAt)));
    if (n >= 500)
      throw new ApiError(
        409,
        "EVENT_LIMIT",
        "This workspace has reached the 500 active-event technical safeguard. Archive an unused event.",
      );
    const id = randomUUID(),
      rid = randomUUID();
    await tx.insert(events).values({
      id,
      workspaceId: wid,
      name: definition.title,
      description: definition.description,
      status: "draft",
      currentRevisionId: rid,
      createdByUserId: actor,
    });
    await tx.insert(eventRevisions).values({
      id: rid,
      eventId: id,
      revisionNumber: 1,
      definition,
      contentHash: eventHash(definition),
      createdByUserId: actor,
    });
    await audit(tx, wid, actor, action, "event", id, {
      revisionId: rid,
      name: definition.title,
    });
    return this.record(await this.row(tx, wid, id));
  }
  async create(actor: string, wid: string, value: unknown) {
    const d = eventDefinitionSchema.parse(value);
    return this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, actor, wid, "events.create");
      return this.insert(tx, actor, wid, d);
    });
  }
  async save(
    actor: string,
    wid: string,
    id: string,
    value: unknown,
    base: string,
  ) {
    const d = eventDefinitionSchema.parse(value);
    return this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, actor, wid, "events.update");
      const row = await this.row(tx, wid, id);
      if (row.revision.id !== base)
        throw new ApiError(
          409,
          "EVENT_CONFLICT",
          "Someone saved a newer event. Your edits are still here. Export them or load the latest version.",
        );
      const hash = eventHash(d);
      if (hash === row.revision.contentHash) return this.record(row);
      const rid = randomUUID();
      await tx.insert(eventRevisions).values({
        id: rid,
        eventId: id,
        revisionNumber: row.revision.revisionNumber + 1,
        definition: d,
        contentHash: hash,
        createdByUserId: actor,
      });
      await tx
        .update(events)
        .set({
          name: d.title,
          description: d.description,
          currentRevisionId: rid,
          updatedAt: new Date(),
          status: "draft",
        })
        .where(eq(events.id, id));
      await audit(tx, wid, actor, "event.updated", "event", id, {
        revisionId: rid,
      });
      return this.record(await this.row(tx, wid, id));
    });
  }
  async archive(actor: string, wid: string, id: string) {
    await this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, actor, wid, "events.archive");
      await this.row(tx, wid, id);
      await tx
        .update(events)
        .set({
          archivedAt: new Date(),
          updatedAt: new Date(),
          status: "archived",
        })
        .where(eq(events.id, id));
      await audit(tx, wid, actor, "event.archived", "event", id);
    });
  }
  async copy(actor: string, source: string, id: string, target: string) {
    return this.db.transaction(async (tx) => {
      for (const wid of [...new Set([source, target])].sort())
        await lockWorkspace(tx, wid);
      await authorize(tx, actor, source, "events.read");
      await authorize(tx, actor, target, "events.create");
      const row = await this.row(tx, source, id);
      const d = structuredClone(row.revision.definition);
      d.title = `${d.title.slice(0, 93)} (copy)`;
      if (source !== target) {
        d.brandKitId = null;
        const copied = new Map<string, string>();
        const copiedPacks = new Map<string, string>();
        const packService = new ContentPackService(this.db);
        for (const item of d.playlist) {
          if (item.type === "original" && item.contentPackId) {
            const r = await packService.row(tx, source, item.contentPackId);
            if (r.pack.ownerType === "workspace") {
              let packId = copiedPacks.get(item.contentPackId);
              if (!packId) {
                packId = (
                  await packService.copyIn(
                    tx,
                    actor,
                    source,
                    item.contentPackId,
                    target,
                  )
                ).id;
                copiedPacks.set(item.contentPackId, packId);
              }
              item.contentPackId = packId;
            }
          }
          if (item.type !== "studio_board") continue;
          if (copied.has(item.boardId)) {
            item.boardId = copied.get(item.boardId)!;
            continue;
          }
          await authorize(tx, actor, source, "boards.read");
          await authorize(tx, actor, target, "boards.create");
          const [b] = await tx
            .select({ board: boardsTable, revision: revisionsTable })
            .from(boardsTable)
            .innerJoin(
              revisionsTable,
              eq(boardsTable.currentRevisionId, revisionsTable.id),
            )
            .where(
              and(
                eq(boardsTable.id, item.boardId),
                eq(boardsTable.workspaceId, source),
                isNull(boardsTable.deletedAt),
              ),
            );
          if (!b)
            throw new ApiError(
              409,
              "EVENT_SOURCE_UNAVAILABLE",
              "A Studio source is unavailable. Repair it before copying this event.",
            );
          const bid = randomUUID(),
            rid = randomUUID(),
            now = new Date();
          const content = {
            ...b.revision.content,
            id: bid,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          };
          await tx.insert(boardsTable).values({
            id: bid,
            workspaceId: target,
            createdByUserId: actor,
            title: content.title,
            description: content.description,
            currentRevisionId: rid,
          });
          await tx.insert(revisionsTable).values({
            id: rid,
            boardId: bid,
            revisionNumber: 1,
            content,
            contentHash: contentHash(content),
            createdByUserId: actor,
            source: "event-copy",
          });
          await audit(tx, target, actor, "board.copied", "board", bid, {
            sourceBoardId: item.boardId,
          });
          copied.set(item.boardId, bid);
          item.boardId = bid;
        }
      }
      d.playlist = d.playlist.map((i) => ({ ...i, itemId: randomUUID() }));
      return this.insert(tx, actor, target, d, "event.copied");
    });
  }
  private async resolve(
    tx: Transaction,
    actor: string,
    wid: string,
    d: EventDefinition,
  ) {
    const issues: { itemId?: string; message: string }[] = [];
    const segments: FrozenSegment[] = [];
    const packService = new ContentPackService(this.db);
    const originals = d.playlist.filter(
      (i) => i.enabled && i.type === "original",
    );
    const packRows = await packService.resolveMany(
      tx,
      wid,
      originals.map((i) =>
        i.type === "original"
          ? (i.contentPackId ?? defaultPackId(i.gameSlug))
          : "",
      ),
    );
    for (const item of d.playlist.filter((i) => i.enabled)) {
      try {
        if (item.type === "original") {
          const settings = settingsSchema.parse({
            ...DEFAULT_SETTINGS,
            ...item.settings,
            playlist: [item.gameSlug],
            lateJoins: d.eventSettings.allowLateJoin,
            autoAdvance: false,
          });
          const frozen = packService.freeze(
            packRows.get(item.contentPackId ?? defaultPackId(item.gameSlug)),
            item.gameSlug,
            settings.rounds,
            settings.pack,
            randomInt(500),
          );
          segments.push({
            itemId: item.itemId,
            title: item.displayTitle || gameById(item.gameSlug).name,
            transitionLabel: item.transitionLabel,
            settings,
            contentVersion: "content-pack-v1",
            contentPack: frozen.reference,
            prompts: frozen.prompts,
          });
        } else {
          await authorize(tx, actor, wid, "boards.read");
          const [b] = await tx
            .select({ board: boardsTable, revision: revisionsTable })
            .from(boardsTable)
            .innerJoin(
              revisionsTable,
              eq(boardsTable.currentRevisionId, revisionsTable.id),
            )
            .where(
              and(
                eq(boardsTable.id, item.boardId),
                eq(boardsTable.workspaceId, wid),
                isNull(boardsTable.deletedAt),
              ),
            );
          if (!b)
            throw new Error(
              "The Studio board is unavailable. Choose a replacement.",
            );
          const board = validateBoard(b.revision.content);
          segments.push({
            itemId: item.itemId,
            title: item.displayTitle || board.title,
            transitionLabel: item.transitionLabel,
            board,
            boardId: b.board.id,
            boardRevisionId: b.revision.id,
            contentVersion: "studio-v1",
            settings: {
              ...DEFAULT_SETTINGS,
              playlist: ["hotwire"],
              rounds: 1,
              autoAdvance: false,
              lateJoins: d.eventSettings.allowLateJoin,
            },
          });
        }
      } catch (error) {
        issues.push({
          itemId: item.itemId,
          message:
            error instanceof Error && !(error instanceof ApiError)
              ? error.message
              : "This segment is unavailable in this workspace.",
        });
      }
    }
    if (!d.playlist.some((i) => i.enabled))
      issues.push({ message: "Enable at least one game before launching." });
    let brand: LaunchSnapshot["brand"] = null;
    if (d.brandKitId) {
      const [b] = await tx
        .select({ kit: brandKits, revision: brandRevisions })
        .from(brandKits)
        .innerJoin(
          brandRevisions,
          eq(brandKits.currentRevisionId, brandRevisions.id),
        )
        .where(
          and(
            eq(brandKits.id, d.brandKitId),
            eq(brandKits.workspaceId, wid),
            isNull(brandKits.deletedAt),
          ),
        );
      if (!b)
        issues.push({
          message:
            "The selected Brand Kit is unavailable. Choose another or use Ruckus styling.",
        });
      else
        brand = resolveBrandSnapshot({
          id: b.kit.id,
          name: b.revision.name,
          revisionId: b.revision.id,
          revisionNumber: b.revision.revisionNumber,
          isDefault: b.kit.isDefault,
          updatedAt: b.kit.updatedAt.toISOString(),
          config: b.revision.config,
        });
    }
    const assets: (typeof brandAssets.$inferSelect)[] = [];
    for (const [kind, id] of [
      ["logo", brand?.config.logoAssetId],
      ["background", brand?.config.backgroundAssetId],
    ] as const) {
      if (!id) continue;
      const [a] = await tx
        .select()
        .from(brandAssets)
        .where(
          and(
            eq(brandAssets.id, id),
            eq(brandAssets.workspaceId, wid),
            eq(brandAssets.kind, kind),
            isNull(brandAssets.deletedAt),
          ),
        );
      if (!a)
        issues.push({
          message: `The Brand ${kind} is unavailable. Update the Brand Kit.`,
        });
      else assets.push(a);
    }
    return { segments, brand, assets, issues };
  }
  async validate(actor: string, wid: string, value: unknown) {
    const d = eventDefinitionSchema.parse(value);
    return this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, actor, wid, "events.read");
      const r = await this.resolve(tx, actor, wid, d);
      return {
        issues: r.issues,
        segments: r.segments.map((s) => ({
          itemId: s.itemId,
          title: s.title,
          boardId: s.boardId,
          contentPack: s.contentPack,
        })),
        warnings: [
          ...(!d.brandKitId ? ["Ruckus styling will be used."] : []),
          ...(!d.subtitle ? ["No optional subtitle is set."] : []),
          ...(r.brand && !r.brand.config.footerText
            ? ["No optional Brand footer is set."]
            : []),
          ...(r.segments.length === 1 ? ["This event has one segment."] : []),
          ...(!d.eventSettings.showFinalEventLeaderboard
            ? ["The final event leaderboard is hidden."]
            : []),
        ],
        brand: r.brand,
      };
    });
  }
  async launch(
    actor: string,
    wid: string,
    id: string,
    base: string,
  ): Promise<LaunchSnapshot> {
    return this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, actor, wid, "events.launch");
      const row = await this.row(tx, wid, id);
      if (row.revision.id !== base)
        throw new ApiError(
          409,
          "EVENT_CONFLICT",
          "The event changed. Reload it before launching.",
        );
      const d = eventDefinitionSchema.parse(row.revision.definition),
        r = await this.resolve(tx, actor, wid, d);
      if (r.issues.length)
        throw new ApiError(
          422,
          "EVENT_NOT_READY",
          "Repair the listed event sources before launching.",
          { issues: r.issues },
        );
      const snapshot: LaunchSnapshot = {
        id: randomUUID(),
        eventId: id,
        eventRevisionId: base,
        workspaceId: wid,
        launchedBy: actor,
        definition: d,
        brand: r.brand,
        segments: r.segments,
        assets: { logo: null, background: null },
      };
      const copies = r.assets.map((a) => ({
        id: randomUUID(),
        snapshotId: snapshot.id,
        sourceAssetId: a.id,
        kind: a.kind,
        mimeType: a.mimeType,
        byteLength: a.byteLength,
        contentHash: a.contentHash,
        binaryContent: a.binaryContent,
      }));
      for (const a of copies)
        snapshot.assets[a.kind as "logo" | "background"] =
          `/api/v1/event-assets/${a.id}`;
      await tx.insert(eventSnapshots).values({
        id: snapshot.id,
        eventId: id,
        eventRevisionId: base,
        workspaceId: wid,
        launchedBy: actor,
        snapshot,
      });
      if (copies.length) await tx.insert(eventSnapshotAssets).values(copies);
      await tx.update(events).set({ status: "ready" }).where(eq(events.id, id));
      await audit(tx, wid, actor, "event.launched", "event", id, {
        snapshotId: snapshot.id,
        revisionId: base,
      });
      return snapshot;
    });
  }
  async ended(snapshot: LaunchSnapshot, reason: string) {
    await this.db.transaction((tx) =>
      audit(
        tx,
        snapshot.workspaceId,
        snapshot.launchedBy,
        "event.ended",
        "event",
        snapshot.eventId,
        { snapshotId: snapshot.id, reason },
      ),
    );
  }
}
