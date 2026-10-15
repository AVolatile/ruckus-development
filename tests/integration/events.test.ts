import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { connectDatabase } from "../../server/db/client.js";
import { createAuthentication } from "../../server/auth/create-auth.js";
import { MemoryEmailTransport } from "../../server/email/transport.js";
import { WorkspaceService } from "../../server/workspaces/service.js";
import { BoardService } from "../../server/boards/service.js";
import { BrandService } from "../../server/brand/service.js";
import { PostgresBrandAssetStore } from "../../server/brand/assets.js";
import { EventService } from "../../server/events/service.js";
import {
  eventRevisions,
  eventSnapshots,
  eventSnapshotAssets,
  events,
} from "../../server/db/event-schema.js";
import { memberships } from "../../server/db/workspace-schema.js";
import { emptyEvent, eventTemplate } from "../../shared/events.js";
import { newBoard } from "../../shared/boards.js";
import { defaultBrandConfig } from "../../shared/brand.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.NODE_ENV === "production")
  throw new Error("Explicit isolated test database required.");
const parsed = new URL(url);
if (
  !["localhost", "127.0.0.1", "postgres"].includes(parsed.hostname) ||
  !/^\/ruckus_test(?:_[a-z0-9]+)?$/.test(parsed.pathname)
)
  throw new Error("Only local/CI test databases allowed.");
const { db, pool } = connectDatabase(url),
  mail = new MemoryEmailTransport(),
  origin = "http://localhost:4314",
  auth = createAuthentication(
    db,
    {
      origin,
      secret: randomBytes(48).toString("base64url"),
      production: false,
    },
    mail,
  ),
  ws = new WorkspaceService(db, mail, origin),
  boards = new BoardService(db),
  brands = new BrandService(db),
  assets = new PostgresBrandAssetStore(db),
  service = new EventService(db);
after(() => pool.end());
async function person() {
  const email = `event-${randomUUID()}@example.test`;
  const r = await auth.handler(
    new Request(origin + "/api/auth/sign-up/email", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name: "Event host",
        password: "A private event test passphrase!",
      }),
    }),
  );
  assert.equal(r.status, 200);
  const p = (await r.json()).user as { id: string; email: string };
  const link = new URL(
    mail.messages
      .find((m) => m.to === email)!
      .text.split("\n")
      .find((l) => l.startsWith(origin))!,
  );
  const verified = await auth.handler(
    new Request(
      origin +
        "/api/auth/verify-email?token=" +
        encodeURIComponent(link.searchParams.get("token")!),
    ),
  );
  assert.equal(verified.status, 200);
  return p;
}
test("event revisions, roles, copy, conflicts, archive and non-enumerating workspace isolation", async () => {
  const a = await person(),
    b = await person(),
    org = await ws.create(a.id, "Event test workspace"),
    wid = org.id;
  await db
    .insert(memberships)
    .values({ workspaceId: wid, userId: b.id, role: "viewer" });
  const created = await service.create(
    a.id,
    wid,
    eventTemplate("team-warmup", randomUUID),
  );
  assert.equal(created.revisionNumber, 1);
  const noop = await service.save(
    a.id,
    wid,
    created.id,
    created.definition,
    created.revisionId,
  );
  assert.equal(noop.revisionId, created.revisionId);
  assert.equal((await service.list(b.id, wid)).items.length, 1);
  await assert.rejects(
    () =>
      service.save(
        b.id,
        wid,
        created.id,
        created.definition,
        created.revisionId,
      ),
    /role/,
  );
  await assert.rejects(
    () => service.launch(b.id, wid, created.id, created.revisionId),
    /role/,
  );
  await db
    .update(memberships)
    .set({ role: "host" })
    .where(and(eq(memberships.userId, b.id), eq(memberships.workspaceId, wid)));
  const next = { ...created.definition, title: "Changed event" };
  const results = await Promise.allSettled([
    service.save(a.id, wid, created.id, next, created.revisionId),
    service.save(
      b.id,
      wid,
      created.id,
      { ...next, title: "Concurrent edit" },
      created.revisionId,
    ),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  await assert.rejects(() => service.archive(b.id, wid, created.id), /role/);
  const other = (await ws.list(b.id)).find((w) => w.kind === "personal")!;
  await assert.rejects(
    () => service.get(a.id, other.id, created.id),
    /workspace/,
  );
  await assert.rejects(() => service.get(b.id, other.id, created.id), /event/);
  const copied = await service.copy(b.id, wid, created.id, other.id);
  assert.equal(copied.revisionNumber, 1);
  assert.notEqual(copied.id, created.id);
  assert.equal(copied.definition.brandKitId, null);
  await assert.rejects(
    () =>
      db
        .update(eventRevisions)
        .set({ contentHash: "modified" })
        .where(eq(eventRevisions.id, created.revisionId)),
    (e: unknown) =>
      String((e as { cause?: unknown }).cause ?? e).includes("immutable"),
  );
  await service.archive(a.id, wid, created.id);
  assert.equal((await service.list(a.id, wid)).items.length, 0);
  await assert.rejects(
    () => service.launch(a.id, wid, created.id, created.revisionId),
    /available/,
  );
  const [history] = await db
    .select()
    .from(eventRevisions)
    .where(eq(eventRevisions.id, created.revisionId));
  assert.equal(history.definition.title, created.definition.title);
});
test("launch transaction pins Event, Studio, Original prompts, Brand and copied private asset bytes", async () => {
  const a = await person(),
    wid = (await ws.list(a.id))[0].id;
  const source = newBoard();
  source.title = "Holiday questions";
  source.questions[0] = {
    ...source.questions[0],
    prompt: "A real question?",
    answers: ["Yes", "No"],
    correctAnswer: 0,
  };
  const board = await boards.create(a.id, source, undefined, wid);
  const image = await sharp({
    create: { width: 24, height: 24, channels: 4, background: "#2548f4" },
  })
    .png()
    .toBuffer();
  const asset = await assets.put(a.id, wid, "logo", "image/png", image);
  const brand = await brands.write(a.id, wid, {
    name: "Holiday Brand",
    config: {
      ...defaultBrandConfig,
      organizationDisplayName: "Holiday crew",
      logoAssetId: asset.id,
    },
  });
  const definition = eventTemplate("team-warmup", randomUUID);
  definition.brandKitId = brand.id;
  definition.playlist.splice(1, 0, {
    itemId: randomUUID(),
    type: "studio_board",
    boardId: board.board.id,
    enabled: true,
    order: 1,
    displayTitle: "",
    hostNote: "Private host instructions",
    transitionLabel: "Holiday trivia",
    settings: {},
  });
  definition.playlist = definition.playlist.map((p, order) => ({
    ...p,
    order,
  }));
  const event = await service.create(a.id, wid, definition),
    snapshot = await service.launch(a.id, wid, event.id, event.revisionId);
  assert.equal(snapshot.segments.length, 3);
  assert.equal(snapshot.segments[1].boardRevisionId, board.revisionId);
  assert.equal(snapshot.brand!.revisionId, brand.revisionId);
  assert.ok(snapshot.segments[0].prompts!.length);
  assert.ok(snapshot.assets.logo!.startsWith("/api/v1/event-assets/"));
  assert.ok(!snapshot.assets.logo!.includes(asset.id));
  const [frozenAsset] = await db
    .select()
    .from(eventSnapshotAssets)
    .where(eq(eventSnapshotAssets.snapshotId, snapshot.id));
  const bytes = Buffer.from(frozenAsset.binaryContent);
  const updated = { ...board.board, title: "Edited after launch" };
  await boards.save(a.id, board.board.id, updated, board.revisionId, wid);
  await brands.write(
    a.id,
    wid,
    {
      name: "Updated brand",
      baseRevisionId: brand.revisionId,
      config: { ...brand.config, primaryColor: "#000000", logoAssetId: null },
    },
    brand.id,
  );
  await brands.delete(a.id, wid, brand.id);
  const changed = await service.save(
    a.id,
    wid,
    event.id,
    { ...definition, title: "Changed after launch" },
    event.revisionId,
  );
  assert.notEqual(changed.revisionId, event.revisionId);
  const [saved] = await db
    .select()
    .from(eventSnapshots)
    .where(eq(eventSnapshots.id, snapshot.id));
  assert.equal(saved.snapshot.definition.title, definition.title);
  assert.equal(saved.snapshot.segments[1].board!.title, "Holiday questions");
  assert.equal(
    saved.snapshot.brand!.config.primaryColor,
    defaultBrandConfig.primaryColor,
  );
  assert.deepEqual(
    (
      await db
        .select()
        .from(eventSnapshotAssets)
        .where(eq(eventSnapshotAssets.id, frozenAsset.id))
    )[0].binaryContent,
    bytes,
  );
  await assert.rejects(
    () =>
      db
        .update(eventSnapshots)
        .set({ snapshot: { ...snapshot, segments: [] } })
        .where(eq(eventSnapshots.id, snapshot.id)),
    (e: unknown) =>
      String((e as { cause?: unknown }).cause ?? e).includes("immutable"),
  );
  await assert.rejects(
    () =>
      db
        .delete(eventSnapshotAssets)
        .where(eq(eventSnapshotAssets.id, frozenAsset.id)),
    (e: unknown) =>
      String((e as { cause?: unknown }).cause ?? e).includes("immutable"),
  );
  await assert.rejects(
    () =>
      db.transaction(async (tx) => {
        await tx.execute(sql`set constraints all deferred`);
        await tx
          .update(events)
          .set({ currentRevisionId: randomUUID() })
          .where(eq(events.id, event.id));
      }),
    (e: unknown) =>
      String((e as { cause?: unknown }).cause ?? e).includes("foreign key"),
  );
});
test("invalid enabled sources reject launch atomically; disabled sources are ignored; cross-workspace copies own their boards", async () => {
  const a = await person(),
    wid = (await ws.list(a.id))[0].id,
    org = await ws.create(a.id, "Event copy destination");
  const d = emptyEvent("Source repair");
  d.playlist = [
    {
      type: "studio_board",
      boardId: randomUUID(),
      itemId: randomUUID(),
      enabled: true,
      order: 0,
      displayTitle: "",
      hostNote: "",
      transitionLabel: "",
      settings: {},
    },
  ];
  const event = await service.create(a.id, wid, d);
  await assert.rejects(
    () => service.launch(a.id, wid, event.id, event.revisionId),
    /Repair/,
  );
  assert.equal(
    (
      await db
        .select()
        .from(eventSnapshots)
        .where(eq(eventSnapshots.eventId, event.id))
    ).length,
    0,
  );
  const source = newBoard();
  source.title = "Owned source";
  source.questions[0] = {
    ...source.questions[0],
    prompt: "Valid?",
    answers: ["Yes", "No"],
    correctAnswer: 0,
  };
  const b = await boards.create(a.id, source, undefined, wid);
  const fixed = {
    ...d,
    playlist: [
      { ...d.playlist[0], enabled: false },
      { ...d.playlist[0], itemId: randomUUID(), boardId: b.board.id, order: 1 },
    ],
  };
  const saved = await service.save(
    a.id,
    wid,
    event.id,
    fixed,
    event.revisionId,
  );
  assert.equal(
    (await service.launch(a.id, wid, event.id, saved.revisionId)).segments
      .length,
    1,
  );
  await assert.rejects(
    () => service.copy(a.id, wid, event.id, org.id),
    /unavailable/,
  );
  const repaired = await service.save(
    a.id,
    wid,
    event.id,
    { ...fixed, playlist: [{ ...fixed.playlist[1], order: 0 }] },
    saved.revisionId,
  );
  const copy = await service.copy(a.id, wid, event.id, org.id);
  assert.equal(copy.revisionNumber, 1);
  assert.equal(copy.definition.playlist[0].type, "studio_board");
  const item = copy.definition.playlist[0];
  if (item.type !== "studio_board") throw new Error("Expected Studio source");
  assert.notEqual(item.boardId, b.board.id);
  assert.equal(
    (await boards.get(a.id, item.boardId, org.id)).board.title,
    "Owned source",
  );
  assert.equal(repaired.definition.playlist.length, 1);
});
