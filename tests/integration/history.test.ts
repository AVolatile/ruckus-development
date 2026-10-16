import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { connectDatabase } from "../../server/db/client.js";
import { user } from "../../server/db/auth-schema.js";
import { WorkspaceService } from "../../server/workspaces/service.js";
import { MemoryEmailTransport } from "../../server/email/transport.js";
import { memberships } from "../../server/db/workspace-schema.js";
import {
  sessionRuns,
  sessionParticipants,
  sessionSegments,
} from "../../server/db/history-schema.js";
import { personalWorkspace } from "../../server/workspaces/policy.js";
import { SessionHistoryService } from "../../server/history/service.js";
import { SessionFinalizer } from "../../server/history/finalizer.js";
import { historyQuerySchema } from "../../shared/history.js";
import { BoardService } from "../../server/boards/service.js";
import { ContentPackService } from "../../server/content-packs/service.js";
import { defaultPackId } from "../../shared/content-packs.js";
import { EventService } from "../../server/events/service.js";
import { EventRuntime } from "../../server/events/runtime.js";
import { emptyEvent } from "../../shared/events.js";
import { newBoard } from "../../shared/boards.js";
import { roomSummary, playRoom } from "../support/history.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.NODE_ENV === "production")
  throw Error("Explicit test database required.");
const parsed = new URL(url);
if (
  !["localhost", "127.0.0.1", "postgres"].includes(parsed.hostname) ||
  !/^\/ruckus_test(?:_[a-z0-9]+)?$/.test(parsed.pathname)
)
  throw Error("Only local/CI test database allowed.");
const { db, pool } = connectDatabase(url),
  service = new SessionHistoryService(db),
  q = historyQuerySchema.parse({ range: "all" });
after(() => pool.end());
async function actor() {
  const id = randomUUID();
  await db.insert(user).values({
    id,
    name: "History fixture",
    email: `history-${id}@example.test`,
    emailVerified: true,
  });
  return { id, wid: await personalWorkspace(db, id) };
}
test("real PostgreSQL finalization is atomic, concurrent-idempotent, immutable and retention-safe", async () => {
  const a = await actor(),
    r = playRoom("caption-this");
  try {
    const s = roomSummary(r, a.wid, a.id),
      out = await Promise.all([service.finalize(s), service.finalize(s)]);
    assert.equal(out.filter((o) => o.created).length, 1);
    assert.equal((await service.list(a.id, a.wid, q)).items.length, 1);
    const detail = await service.get(a.id, a.wid, s.id);
    assert.equal(detail.segments.length, 1);
    assert.equal(detail.participants.length, 2);
    assert.equal(detail.segments[0].votes, 2);
    await assert.rejects(
      () => service.finalize({ ...s, title: "Different finalization" }),
      /Conflicting/,
    );
    await assert.rejects(() =>
      db
        .update(sessionRuns)
        .set({ title: "Rewritten" })
        .where(eq(sessionRuns.id, s.id)),
    );
    await assert.rejects(() =>
      db
        .update(sessionParticipants)
        .set({ finalScore: 999 })
        .where(eq(sessionParticipants.runId, s.id)),
    );
    await assert.rejects(() =>
      db
        .update(sessionSegments)
        .set({ rounds: 9 })
        .where(eq(sessionSegments.runId, s.id)),
    );
    const audit = await db.execute(
      sql`select count(*)::int n from workspace_audit_events where target_id=${s.id} and action='session.completed'`,
    );
    assert.equal(audit.rows[0].n, 1);
    await db.delete(sessionRuns).where(eq(sessionRuns.id, s.id));
    assert.equal(
      (
        await db
          .select()
          .from(sessionParticipants)
          .where(eq(sessionParticipants.runId, s.id))
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .select()
          .from(sessionSegments)
          .where(eq(sessionSegments.runId, s.id))
      ).length,
      0,
    );
  } finally {
    r.dispose();
  }
});
test("workspace roles, non-enumerating isolation, keyset ties, filters and SQL aggregates", async () => {
  const owner = await actor(),
    org = await new WorkspaceService(
      db,
      new MemoryEmailTransport(),
      "http://localhost",
    ).create(owner.id, "History role fixture"),
    a = { id: owner.id, wid: org.id },
    b = await actor(),
    r = playRoom();
  try {
    const original = roomSummary(r, a.wid, a.id),
      started = new Date(Date.now() - 300_000),
      ended = new Date(started.getTime() + 120_000),
      day = started.toISOString().slice(0, 10);
    for (let n = 0; n < 4; n++) {
      const s = structuredClone(original);
      s.id = randomUUID();
      s.participants = s.participants.map((p) => ({ ...p, id: randomUUID() }));
      s.segments = s.segments.map((g) => ({
        ...g,
        results: g.results.map((p, i) => ({
          ...p,
          participantId: s.participants[i].id,
        })),
      }));
      s.startedAt = started.toISOString();
      s.endedAt = ended.toISOString();
      s.participants = s.participants.map((p) => ({
        ...p,
        joinedAt: s.startedAt,
      }));
      s.segments = s.segments.map((g) => ({
        ...g,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationSeconds: 120,
      }));
      s.durationSeconds = 120;
      await service.finalize(s);
    }
    const first = await service.list(a.id, a.wid, { ...q, limit: 2 }),
      second = await service.list(a.id, a.wid, {
        ...q,
        limit: 2,
        cursor: first.nextCursor!,
      });
    assert.equal(
      new Set([...first.items, ...second.items].map((s) => s.id)).size,
      4,
    );
    assert.equal(second.nextCursor, null);
    assert.ok(!("participants" in first.items[0]));
    assert.equal(
      (await service.list(a.id, a.wid, { ...q, type: "studio" })).items.length,
      0,
    );
    assert.equal(
      (await service.list(a.id, a.wid, { ...q, game: "caption-this" })).items
        .length,
      0,
    );
    const aggregates = await service.analytics(a.id, a.wid, q);
    assert.equal(aggregates.sessions, 4);
    assert.equal(aggregates.attendances, 8);
    assert.equal(aggregates.averageAttendance, 2);
    assert.equal(aggregates.totalSeconds, 480);
    assert.equal(aggregates.averageSeconds, 120);
    assert.equal(aggregates.games[0].plays, 4);
    assert.equal(aggregates.activity[0].sessions, 4);
    assert.equal(
      (await service.list(a.id, a.wid, { ...q, from: day, to: day })).items
        .length,
      4,
    );
    assert.equal(
      (
        await service.analytics(a.id, a.wid, {
          ...q,
          from: "2000-01-01",
          to: "2000-01-07",
        })
      ).sessions,
      0,
    );
    await assert.rejects(
      () => service.list(b.id, a.wid, q),
      (e) => (e as { code: string }).code === "WORKSPACE_NOT_FOUND",
    );
    await assert.rejects(
      () => service.get(b.id, b.wid, first.items[0].id),
      (e) => (e as { code: string }).code === "SESSION_NOT_FOUND",
    );
    await assert.rejects(
      () => service.get(b.id, b.wid, randomUUID()),
      (e) => (e as { code: string }).code === "SESSION_NOT_FOUND",
    );
    // A real membership, not client role claims, grants read to every supported role.
    for (const role of ["owner", "admin", "host", "viewer"] as const) {
      await db
        .insert(memberships)
        .values({ workspaceId: a.wid, userId: b.id, role })
        .onConflictDoUpdate({
          target: [memberships.workspaceId, memberships.userId],
          set: { role },
        });
      assert.equal((await service.list(b.id, a.wid, q)).items.length, 4);
      assert.equal((await service.analytics(b.id, a.wid, q)).sessions, 4);
    }
    await assert.rejects(
      () => service.list(a.id, a.wid, { ...q, cursor: "nonsense" }),
      (e) => (e as { code: string }).code === "VALIDATION_ERROR",
    );
  } finally {
    r.dispose();
  }
});
test("Studio provenance stays frozen through edit/deletion; unscored outcomes remain unscored", async () => {
  const a = await actor(),
    boards = new BoardService(db),
    b = newBoard();
  b.title = "Frozen poll";
  b.questions[0] = {
    ...b.questions[0],
    prompt: "Choose",
    answers: ["Yes", "No"],
    type: "poll",
    correctAnswer: null,
    scoreMode: "no-score",
  };
  const created = await boards.create(a.id, b, undefined, a.wid),
    launch = await boards.forLaunchWithRevision(a.id, a.wid, created.board.id),
    r = playRoom("hotwire", launch.board);
  try {
    const s = roomSummary(r, a.wid, a.id);
    s.source = {
      boardId: created.board.id,
      boardRevisionId: launch.revisionId,
    };
    s.segments[0].source = s.source;
    await service.finalize(s);
    await boards.save(
      a.id,
      created.board.id,
      { ...created.board, title: "Changed source" },
      created.revisionId,
      a.wid,
    );
    await boards.delete(a.id, created.board.id, a.wid);
    const recap = await service.get(a.id, a.wid, s.id);
    assert.equal(recap.title, "Frozen poll");
    assert.equal(recap.source.boardRevisionId, launch.revisionId);
    assert.ok(
      recap.participants.every(
        (p) => p.finalRank === null && p.finalScore === null,
      ),
    );
  } finally {
    r.dispose();
  }
});
test("Event runtime summary persists source versions, segment order and aggregate scores after archive", async () => {
  const a = await actor(),
    events = new EventService(db),
    definition = emptyEvent("History Event");
  const packs = new ContentPackService(db),
    pack = await packs.copy(
      a.id,
      null,
      defaultPackId("room-temperature"),
      a.wid,
    );
  definition.eventSettings.showEventIntro = false;
  definition.eventSettings.showFinalEventLeaderboard = false;
  definition.eventSettings.showIntermissionBetweenGames = false;
  definition.playlist = [
    {
      itemId: randomUUID(),
      type: "original",
      gameSlug: "room-temperature",
      contentPackId: pack.id,
      enabled: true,
      order: 0,
      displayTitle: "",
      hostNote: "Private note",
      transitionLabel: "",
      settings: { rounds: 1, pace: "quick", pack: "mixed" },
    },
  ];
  const event = await events.create(a.id, a.wid, definition),
    snapshot = await events.launch(a.id, a.wid, event.id, event.revisionId),
    r = new EventRuntime("ABCDE", snapshot, "http://localhost", () => {});
  try {
    const p = r.join("First", 0, "a"),
      p2 = r.join("Second", 1, "b");
    r.command("start", r.sequence);
    r.command("advance", r.sequence);
    r.action("next");
    r.submit(p.id, { choice: 0 });
    r.submit(p2.id, { choice: 0 });
    r.action("next");
    r.action("next");
    r.command("advance", r.sequence);
    const s = r.historySummary()!;
    await service.finalize(s);
    await service.finalize(s);
    await events.save(
      a.id,
      a.wid,
      event.id,
      { ...event.definition, title: "Changed Event" },
      event.revisionId,
    );
    await packs.save(
      a.id,
      a.wid,
      pack.id,
      { ...pack.document, name: "Changed material" },
      pack.revisionId,
    );
    await packs.archive(a.id, a.wid, pack.id);
    await events.archive(a.id, a.wid, event.id);
    const recap = await service.get(a.id, a.wid, s.id);
    assert.equal(recap.title, "History Event");
    assert.deepEqual(
      recap.participants.map((p) => p.name),
      r.view().event!.scores.map((p) => r.players.get(p.playerId)!.public.name),
    );
    assert.deepEqual(
      recap.participants.map((p) => p.finalOrder),
      [1, 2],
    );
    assert.equal(recap.source.eventRevisionId, event.revisionId);
    assert.equal(recap.segments[0].source.packName, pack.document.name);
    assert.equal(
      recap.segments[0].source.packRevisionId,
      snapshot.segments[0].contentPack!.revisionId,
    );
    assert.ok(
      recap.participants.every(
        (p) => p.finalScore === 1000 && p.finalRank === 1,
      ),
    );
    assert.equal((await service.analytics(a.id, a.wid, q)).events[0].plays, 1);
    assert.equal(
      (await service.list(a.id, a.wid, { ...q, eventId: event.id })).items
        .length,
      1,
    );
    assert.ok(!JSON.stringify(recap).includes("Private note"));
  } finally {
    r.dispose();
  }
});
test("real database rejection at the live completion callback never blocks the final phase", async () => {
  const a = await actor(),
    states: string[] = [],
    badWorkspace = randomUUID();
  const writer = new SessionFinalizer(
    (v) => service.finalize(v),
    [1],
    () => {},
  );
  let task: Promise<void> | undefined;
  const r = playRoom("hotwire", undefined, (room) => {
    if (room.phase === "final" && !task)
      task = writer.submit(roomSummary(room, badWorkspace, a.id), (v) =>
        states.push(v.status),
      );
  });
  try {
    assert.equal(r.phase, "final");
    assert.equal(r.stats.rounds, 1);
    assert.equal(states[0], "saving");
    assert.ok(task);
    await task;
    assert.equal(r.phase, "final");
    assert.deepEqual(states, ["saving", "failed"]);
    assert.equal((await service.list(a.id, a.wid, q)).items.length, 0);
  } finally {
    r.dispose();
  }
});

test("all migrations apply twice to a fresh disposable test database without historical backfill", async () => {
  const name = `ruckus_test_phase5_${randomUUID().replaceAll("-", "")}`,
    freshUrl = new URL(url!);
  freshUrl.pathname = "/" + name;
  await pool.query(`CREATE DATABASE "${name}"`);
  const fresh = connectDatabase(freshUrl.toString());
  try {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(fresh.db, { migrationsFolder: "migrations" });
    await migrate(fresh.db, { migrationsFolder: "migrations" });
    const rows = await fresh.pool.query(
      "select (select count(*) from session_runs)::int runs,(select count(*) from session_segments)::int segments,(select count(*) from session_participants)::int participants,(select count(*) from drizzle.__drizzle_migrations)::int migrations",
    );
    assert.deepEqual(rows.rows[0], {
      runs: 0,
      segments: 0,
      participants: 0,
      migrations: 8,
    });
  } finally {
    await fresh.pool.end();
    await pool.query(`DROP DATABASE "${name}"`);
  }
});
