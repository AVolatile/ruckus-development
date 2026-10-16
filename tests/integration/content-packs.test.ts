import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { connectDatabase } from "../../server/db/client.js";
import { user } from "../../server/db/auth-schema.js";
import { memberships } from "../../server/db/workspace-schema.js";
import {
  contentPacks,
  contentRevisions,
} from "../../server/db/content-schema.js";
import { eventSnapshots } from "../../server/db/event-schema.js";
import { ContentPackService } from "../../server/content-packs/service.js";
import { EventService } from "../../server/events/service.js";
import { WorkspaceService } from "../../server/workspaces/service.js";
import { MemoryEmailTransport } from "../../server/email/transport.js";
import { personalWorkspace } from "../../server/workspaces/policy.js";
import { seedContent } from "../../server/content-packs/seed.js";
import { builtInPacks } from "../../server/content-packs/built-ins.js";
import { emptyPack, defaultPackId } from "../../shared/content-packs.js";
import { emptyEvent } from "../../shared/events.js";
import { DEFAULT_SETTINGS } from "../../shared/catalog.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.NODE_ENV === "production")
  throw Error("Explicit test database required.");
const parsed = new URL(url);
if (
  !["127.0.0.1", "localhost", "postgres"].includes(parsed.hostname) ||
  !/^\/ruckus_test(?:_[a-z0-9]+)?$/.test(parsed.pathname)
)
  throw Error("Only isolated local/CI test databases allowed.");
const { db, pool } = connectDatabase(url),
  service = new ContentPackService(db),
  events = new EventService(db),
  ws = new WorkspaceService(
    db,
    new MemoryEmailTransport(),
    "http://localhost:4314",
  );
after(() => pool.end());
async function person() {
  const id = randomUUID();
  await db.insert(user).values({
    id,
    name: "Content test",
    email: `${id}@example.test`,
    emailVerified: true,
  });
  return { id, wid: await personalWorkspace(db, id) };
}
function document(name = "Pack integrity") {
  return {
    ...emptyPack("hotwire", name),
    status: "ready" as const,
    content: {
      gameType: "hotwire" as const,
      items: [
        {
          id: "question-1",
          title: "Which word is first?",
          options: ["First", "Second"],
          answer: 0,
          explanation: "First is the first choice.",
        },
      ],
    },
  };
}
const causedBy = (message: string) => (error: unknown) =>
  String((error as { cause?: unknown })?.cause ?? error).includes(message);
const code = (expected: string) => (e: unknown) =>
  !!e && typeof e === "object" && "code" in e && e.code === expected;
test("system seed is repeatable, exact and independent of workspace packs", async () => {
  const before = await db
    .select()
    .from(contentRevisions)
    .where(
      sql`${contentRevisions.packId} in (select id from content_packs where owner_type='ruckus')`,
    );
  assert.ok(
    (await seedContent(db, true)).every((r) => r.action === "unchanged"),
  );
  assert.ok(
    (await seedContent(db, true)).every((r) => r.action === "unchanged"),
  );
  assert.deepEqual(
    await db
      .select()
      .from(contentRevisions)
      .where(
        sql`${contentRevisions.packId} in (select id from content_packs where owner_type='ruckus')`,
      ),
    before,
  );
  const a = await person();
  for (const p of builtInPacks) {
    const r = await service.get(a.id, null, p.id);
    assert.deepEqual(r.document, p.document);
  }
});
test("workspace permissions, non-enumeration, immutable history, optimistic concurrency and no-op saves", async () => {
  const a = await person(),
    b = await person(),
    v = await person(),
    h = await person(),
    org = await ws.create(a.id, "Content collaboration");
  await db.insert(memberships).values([
    { id: randomUUID(), workspaceId: org.id, userId: v.id, role: "viewer" },
    { id: randomUUID(), workspaceId: org.id, userId: h.id, role: "host" },
  ]);
  const r = await service.create(h.id, org.id, document());
  assert.equal(r.revisionNumber, 1);
  assert.equal((await service.get(v.id, org.id, r.id)).name, r.name);
  await assert.rejects(
    () => service.get(b.id, b.wid, r.id),
    code("CONTENT_PACK_NOT_FOUND"),
  );
  await assert.rejects(
    () => service.get(b.id, org.id, r.id),
    code("WORKSPACE_NOT_FOUND"),
  );
  await assert.rejects(
    () => service.create(v.id, org.id, document()),
    code("PERMISSION_DENIED"),
  );
  await assert.rejects(
    () => service.save(v.id, org.id, r.id, r.document, r.revisionId),
    code("PERMISSION_DENIED"),
  );
  await assert.rejects(
    () => service.archive(h.id, org.id, r.id),
    code("PERMISSION_DENIED"),
  );
  assert.equal(
    (await service.save(h.id, org.id, r.id, r.document, r.revisionId))
      .revisionId,
    r.revisionId,
  );
  const results = await Promise.allSettled([
    service.save(
      h.id,
      org.id,
      r.id,
      { ...r.document, name: "Edit A" },
      r.revisionId,
    ),
    service.save(
      a.id,
      org.id,
      r.id,
      { ...r.document, name: "Edit B" },
      r.revisionId,
    ),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    results.filter(
      (x) => x.status === "rejected" && code("CONTENT_CONFLICT")(x.reason),
    ).length,
    1,
  );
  assert.deepEqual(
    (
      await db
        .select()
        .from(contentRevisions)
        .where(eq(contentRevisions.id, r.revisionId))
    )[0].document,
    r.document,
  );
  await assert.rejects(
    () =>
      db
        .update(contentRevisions)
        .set({ itemCount: 0 })
        .where(eq(contentRevisions.id, r.revisionId)),
    causedBy("immutable"),
  );
  await assert.rejects(
    () =>
      db.delete(contentRevisions).where(eq(contentRevisions.id, r.revisionId)),
    causedBy("immutable"),
  );
  await assert.rejects(
    () =>
      db
        .update(contentPacks)
        .set({ currentRevisionId: randomUUID() })
        .where(eq(contentPacks.id, r.id)),
    causedBy("foreign key"),
  );
  await assert.rejects(
    () =>
      service.save(
        a.id,
        org.id,
        defaultPackId("hotwire"),
        builtInPacks[0].document,
        r.revisionId,
      ),
    code("CONTENT_PACK_NOT_FOUND"),
  );
  await service.archive(a.id, org.id, r.id);
  await assert.rejects(
    () => service.get(a.id, org.id, r.id),
    code("CONTENT_PACK_NOT_FOUND"),
  );
});
test("search summaries, filters, private copies and frozen Event revisions remain scoped and immutable", async () => {
  const a = await person(),
    org = await ws.create(a.id, "Copy destination"),
    r = await service.create(a.id, a.wid, document("Needle food launch"));
  const list = await service.list(a.id, a.wid, {
    q: "NEEDLE",
    game: "hotwire",
    source: "workspace",
    season: "evergreen",
  });
  assert.equal(list.items.length, 1);
  assert.equal("document" in list.items[0], false);
  assert.equal(
    (await service.list(a.id, null, { q: "NEEDLE" })).items.length,
    0,
  );
  const cp = await service.copy(a.id, a.wid, r.id, org.id);
  const unicodePack = await service.create(
    a.id,
    a.wid,
    document("a".repeat(92) + "😀" + "z".repeat(6)),
  );
  const unicodeCopy = await service.copy(a.id, a.wid, unicodePack.id, org.id);
  assert.equal(unicodeCopy.name, "a".repeat(92) + " (copy)");
  assert.notEqual(cp.id, r.id);
  assert.equal(cp.revisionNumber, 1);
  assert.equal(cp.provenance, "copied");
  assert.equal("sourcePackId" in cp, false);
  const d = emptyEvent("Pinned packs");
  d.playlist = [
    {
      type: "original",
      gameSlug: "hotwire",
      contentPackId: r.id,
      itemId: randomUUID(),
      order: 0,
      enabled: true,
      displayTitle: "",
      hostNote: "",
      transitionLabel: "",
      settings: { rounds: 2, pace: "quick", pack: "mixed" },
    },
    {
      type: "original",
      gameSlug: "room-temperature",
      itemId: randomUUID(),
      order: 1,
      enabled: true,
      displayTitle: "",
      hostNote: "",
      transitionLabel: "",
      settings: { rounds: 1, pace: "normal", pack: "work" },
    },
  ];
  const e = await events.create(a.id, a.wid, d),
    snapshot = await events.launch(a.id, a.wid, e.id, e.revisionId);
  assert.equal(snapshot.segments[0].contentPack!.revisionId, r.revisionId);
  assert.equal(
    snapshot.segments[1].contentPack!.packId,
    defaultPackId("room-temperature"),
  );
  const edited = structuredClone(r.document);
  edited.content.items[0].title = "Changed after launch";
  await service.save(a.id, a.wid, r.id, edited, r.revisionId);
  const frozen = (
    await db
      .select()
      .from(eventSnapshots)
      .where(eq(eventSnapshots.id, snapshot.id))
  )[0].snapshot;
  assert.equal(frozen.segments[0].prompts![0].title, "Which word is first?");
  assert.equal(frozen.segments[0].contentPack!.revisionId, r.revisionId);
  const copiedEvent = await events.copy(a.id, a.wid, e.id, org.id),
    item = copiedEvent.definition.playlist[0];
  assert.equal(item.type, "original");
  if (item.type !== "original") throw Error();
  assert.notEqual(item.contentPackId, r.id);
  assert.equal(
    (await service.get(a.id, org.id, item.contentPackId!)).document.content
      .items[0].title,
    "Changed after launch",
  );
  await service.archive(a.id, a.wid, r.id);
  await assert.rejects(
    () => events.launch(a.id, a.wid, e.id, e.revisionId),
    code("EVENT_NOT_READY"),
  );
  await assert.rejects(
    () =>
      service.forStandalone(
        a.id,
        { ...DEFAULT_SETTINGS, playlist: ["hotwire"] },
        {
          workspaceId: org.id,
          selections: { hotwire: defaultPackId("sellout") },
        },
      ),
    code("CONTENT_UNAVAILABLE"),
  );
});
test("Phase 3 upgrade fixture adds content tables without changing existing Event revision or snapshot rows", async () => {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const schema = "content_fixture_" + randomUUID().replaceAll("-", "");
    await c.query(`create schema ${schema}`);
    await c.query(`set local search_path to ${schema}`);
    const apply = async (file: string) => {
      for (const s of (await readFile(file, "utf8"))
        .replaceAll('"public".', `"${schema}".`)
        .split("--> statement-breakpoint"))
        if (s.trim()) await c.query(s);
    };
    for (const file of [
      "0000_host_cloud_foundation.sql",
      "0001_revision_invariants.sql",
      "0002_workspaces_brand_kits.sql",
      "0003_events.sql",
    ]) {
      let path = `migrations/${file}`;
      if (file === "0003_events.sql") {
        const { readdir } = await import("node:fs/promises");
        path =
          "migrations/" +
          (await readdir("migrations")).find(
            (f) => f.startsWith("0003_") && f.endsWith(".sql"),
          )!;
      }
      await apply(path);
    }
    const a = randomUUID(),
      eid = randomUUID(),
      rid = randomUUID(),
      sid = randomUUID();
    await c.query('insert into "user"(id,name,email) values($1,$2,$3)', [
      a,
      "Old host",
      `${a}@example.test`,
    ]);
    const wid = (
      await c.query("select id from workspaces where created_by_user_id=$1", [
        a,
      ])
    ).rows[0].id;
    const d = emptyEvent("Historical unchanged");
    await c.query(
      "insert into events(id,workspace_id,name,status,current_revision_id,created_by_user_id) values($1,$2,$3,$4,$5,$6)",
      [eid, wid, d.title, "draft", rid, a],
    );
    await c.query(
      "insert into event_revisions(id,event_id,revision_number,definition,content_hash,created_by_user_id) values($1,$2,1,$3,$4,$5)",
      [rid, eid, d, "historical-hash", a],
    );
    await c.query(
      "insert into event_launch_snapshots(id,event_id,event_revision_id,workspace_id,launched_by,snapshot) values($1,$2,$3,$4,$5,$6)",
      [sid, eid, rid, wid, a, { definition: d, legacy: true }],
    );
    await c.query("set constraints all immediate");
    await c.query("set constraints all deferred");
    const before = await c.query(
      "select row_to_json(e) as row from events e union all select row_to_json(r) from event_revisions r union all select row_to_json(s) from event_launch_snapshots s",
    );
    await apply("migrations/0004_adorable_eternity.sql");
    const after = await c.query(
      "select row_to_json(e) as row from events e union all select row_to_json(r) from event_revisions r union all select row_to_json(s) from event_launch_snapshots s",
    );
    assert.deepEqual(after.rows, before.rows);
  } finally {
    await c.query("rollback");
    c.release();
  }
});

test("catalog keyset pagination is bounded, literal search is escaped and the workspace safeguard is enforced", async () => {
  const a = await person();
  for (let n = 0; n < 100; n++)
    await service.create(a.id, a.wid, {
      ...document(`Page fixture ${String(n).padStart(3, "0")}`),
      tags: ["page-fixture"],
    });
  await assert.rejects(
    () =>
      service.list(a.id, a.wid, {
        cursor: Buffer.from(
          JSON.stringify({
            id: "-".repeat(36),
            updatedAt: new Date().toISOString(),
          }),
        ).toString("base64url"),
      }),
    code("VALIDATION_ERROR"),
  );
  const first = await service.list(a.id, a.wid, {
    source: "workspace",
    q: "page-fixture",
  });
  assert.equal(first.items.length, 50);
  assert.ok(first.nextCursor);
  const second = await service.list(a.id, a.wid, {
    source: "workspace",
    q: "page-fixture",
    cursor: first.nextCursor!,
  });
  assert.equal(second.items.length, 50);
  assert.equal(second.nextCursor, null);
  assert.equal(
    new Set([...first.items, ...second.items].map((i) => i.id)).size,
    100,
  );
  assert.equal((await service.list(a.id, a.wid, { q: "%_" })).items.length, 0);
  await assert.rejects(
    () => service.create(a.id, a.wid, document()),
    code("CONTENT_PACK_LIMIT"),
  );
});
test("approved system releases append history; divergent seed markers are refused without overwriting", async () => {
  const p = builtInPacks[0],
    before = await service.row(db, null, p.id),
    original = p.document.shortDescription;
  try {
    p.document.shortDescription = original + " Release verification.";
    assert.equal((await seedContent(db, true))[0].action, "new revision");
    const changed = await service.row(db, null, p.id);
    assert.equal(
      changed.revision.revisionNumber,
      before.revision.revisionNumber + 1,
    );
    assert.equal(
      (
        await db
          .select()
          .from(contentRevisions)
          .where(eq(contentRevisions.id, before.revision.id))
      )[0].contentHash,
      before.revision.contentHash,
    );
    await db
      .update(contentPacks)
      .set({ lastSeedHash: "unreviewed" })
      .where(eq(contentPacks.id, p.id));
    await assert.rejects(() => seedContent(db, true), /diverged/);
    assert.equal(
      (await service.row(db, null, p.id)).revision.id,
      changed.revision.id,
    );
    await db
      .update(contentPacks)
      .set({ lastSeedHash: changed.revision.contentHash })
      .where(eq(contentPacks.id, p.id));
  } finally {
    p.document.shortDescription = original;
    const current = await service.row(db, null, p.id);
    await db
      .update(contentPacks)
      .set({ lastSeedHash: current.revision.contentHash })
      .where(eq(contentPacks.id, p.id));
    await seedContent(db, true);
  }
  assert.deepEqual(
    (await service.row(db, null, p.id)).revision.document,
    p.document,
  );
});
