import { reliabilityDatabase } from "../support/reliability-database.js";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { connectDatabase } from "../../server/db/client.js";
import { user } from "../../server/db/auth-schema.js";
import {
  historyOutbox as jobs,
  historyReceipts as receipts,
} from "../../server/db/outbox-schema.js";
import {
  sessionRuns,
  sessionSegments,
  sessionParticipants,
} from "../../server/db/history-schema.js";
import { memberships, workspaces } from "../../server/db/workspace-schema.js";
import { HistoryOutbox } from "../../server/history/outbox.js";
import { HistoryWorker } from "../../server/history/worker.js";
import {
  SessionHistoryService,
  summaryHash,
} from "../../server/history/service.js";
import { personalWorkspace } from "../../server/workspaces/policy.js";
import { WorkspaceService } from "../../server/workspaces/service.js";
import { MemoryEmailTransport } from "../../server/email/transport.js";
import { Readiness } from "../../server/ops/readiness.js";
import { migrationCompatible } from "../../server/db/compatibility.js";
import { historyQuerySchema } from "../../shared/history.js";
import { playRoom, roomSummary } from "../support/history.js";
const database = await reliabilityDatabase();
const { db, pool, url } = database,
  queue = new HistoryOutbox(db),
  history = new SessionHistoryService(db);
const ids: string[] = [];
after(async () => {
  if (ids.length) {
    await db.delete(jobs).where(sql`${jobs.id} in ${ids}`);
    await db.delete(receipts).where(sql`${receipts.id} in ${ids}`);
    await db.delete(sessionRuns).where(sql`${sessionRuns.id} in ${ids}`);
  }
  await database.close();
});
async function fixture() {
  const id = randomUUID();
  await db.insert(user).values({
    id,
    name: "Reliability fixture",
    email: `reliability-${id}@example.test`,
    emailVerified: true,
  });
  const wid = await personalWorkspace(db, id),
    r = playRoom("caption-this");
  try {
    const s = roomSummary(r, wid, id);
    ids.push(s.id);
    return { id, wid, s };
  } finally {
    r.dispose();
  }
}
async function ownClaim(id: string) {
  const wid = (await row(id)).workspaceId;
  const claim = await queue.claim(wid);
  assert.equal(claim?.id, id);
  return claim!;
}
const row = async (id: string) =>
  (await db.select().from(jobs).where(eq(jobs.id, id)))[0];
test("durable enqueue, competing claims, restart, expired lease fencing and atomic materialization", async () => {
  const { id, wid, s } = await fixture();
  await Promise.all([queue.enqueue(s), queue.enqueue(s)]);
  assert.equal((await row(s.id)).payloadHash, summaryHash(s));
  await assert.rejects(
    () => queue.enqueue({ ...s, title: "Conflicting" }),
    /HISTORY_PAYLOAD_MISMATCH/,
  );
  const claims = await Promise.all([
    queue.claim(wid),
    new HistoryOutbox(db).claim(wid),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  const abandoned = claims.find(Boolean)!;
  await db
    .update(jobs)
    .set({ lockedAt: new Date(Date.now() - 61000) })
    .where(eq(jobs.id, s.id));
  const replacement = await ownClaim(s.id);
  assert.equal(replacement.attempt_count, 2);
  assert.equal(await queue.materialize(abandoned), false);
  assert.equal(await queue.materialize(replacement), true);
  assert.equal(await queue.materialize(replacement), false);
  assert.equal((await row(s.id)).status, "completed");
  assert.equal((await row(s.id)).payload, null);
  assert.equal((await history.get(id, wid, s.id)).participants.length, 2);
  assert.equal(
    (
      await pool.query(
        "select count(*)::int n from workspace_audit_events where target_id=$1 and action='session.completed'",
        [s.id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(await queue.enqueue(s), "saved");
  assert.deepEqual(await queue.states([s.id]), [{ id: s.id, status: "saved" }]);
});
test("history committed before acknowledgement can be retried without a second recap or audit", async () => {
  const { s } = await fixture();
  await queue.enqueue(s);
  const job = await ownClaim(s.id);
  await history.finalize(s); // Simulate an older writer losing its acknowledgement after commit.
  await queue.materialize(job);
  assert.equal(
    (
      await pool.query(
        "select count(*)::int n from workspace_audit_events where target_id=$1 and action='session.completed'",
        [s.id],
      )
    ).rows[0].n,
    1,
  );
});
test("failed transaction rolls back, retries later and poisons malformed/hash-mismatched payloads safely", async () => {
  const { s } = await fixture();
  await queue.enqueue(s);
  let job = await ownClaim(s.id);
  await queue.fail(job, { code: "57014", message: "PRIVATE DATABASE URL" });
  assert.equal((await row(s.id)).status, "pending");
  assert.equal((await row(s.id)).lastErrorCode, "DB_TIMEOUT");
  assert.equal(await queue.claim(s.workspaceId), undefined);
  await db
    .update(jobs)
    .set({ availableAt: new Date(0), payload: { ...s, title: "Corrupt" } })
    .where(eq(jobs.id, s.id));
  job = await ownClaim(s.id);
  let failure: unknown;
  try {
    await queue.materialize(job);
  } catch (e) {
    failure = e;
  }
  assert.match(String(failure), /HISTORY_PAYLOAD_MISMATCH/);
  assert.equal(await queue.fail(job, failure), true);
  assert.equal((await row(s.id)).status, "failed");
  assert.equal(
    (await db.select().from(sessionRuns).where(eq(sessionRuns.id, s.id)))
      .length,
    0,
  );
  await db.update(jobs).set({ payload: s }).where(eq(jobs.id, s.id));
  await queue.retry(s.id);
  job = await ownClaim(s.id);
  await queue.materialize(job);
  const f = await fixture();
  await queue.enqueue(f.s);
  await db
    .update(jobs)
    .set({ payload: {} as typeof s })
    .where(eq(jobs.id, f.s.id));
  const bad = await ownClaim(f.s.id);
  await assert.rejects(() => queue.materialize(bad), /HISTORY_PAYLOAD_INVALID/);
  await queue.fail(bad, {});
  await db
    .update(jobs)
    .set({ status: "pending", attemptCount: 7, availableAt: new Date(0) })
    .where(eq(jobs.id, f.s.id));
  const last = await ownClaim(f.s.id);
  assert.equal(last.attempt_count, 8);
  assert.equal(await queue.fail(last, { code: "ECONNREFUSED" }), true);
});
test("confirmed deletion cascades numeric details, updates SQL analytics, audits safely and cannot resurrect", async () => {
  const { id, wid, s } = await fixture();
  await queue.enqueue(s);
  await queue.materialize(await ownClaim(s.id));
  const before = await history.analytics(
    id,
    wid,
    historyQuerySchema.parse({ range: "all" }),
  );
  assert.equal(before.sessions, 1);
  await history.delete(id, wid, s.id, randomUUID());
  for (const table of [sessionSegments, sessionParticipants])
    assert.equal(
      (await db.select().from(table).where(eq(table.runId, s.id))).length,
      0,
    );
  assert.equal(
    (
      await history.analytics(
        id,
        wid,
        historyQuerySchema.parse({ range: "all" }),
      )
    ).sessions,
    0,
  );
  assert.equal(await queue.enqueue(s), "retired");
  assert.equal(await queue.claim(s.workspaceId), undefined);
  const audit = (
    await pool.query(
      "select metadata from workspace_audit_events where target_id=$1 and action='session.history_deleted'",
      [s.id],
    )
  ).rows;
  assert.equal(audit.length, 1);
  assert.deepEqual(Object.keys(audit[0].metadata), ["requestId"]);
  await assert.rejects(() => history.get(id, wid, s.id), /available/);
});
test("Owner/Admin delete only; membership locking, missing and cross-workspace errors stay safe", async () => {
  const a = await fixture(),
    b = await fixture();
  const organization = await new WorkspaceService(
    db,
    new MemoryEmailTransport(),
    "http://localhost",
  ).create(a.id, "Retention fixture");
  const s = { ...a.s, workspaceId: organization.id };
  await queue.enqueue(s);
  await queue.materialize(await ownClaim(s.id));
  for (const role of ["viewer", "host", "admin"] as const) {
    await db
      .insert(memberships)
      .values({ workspaceId: organization.id, userId: b.id, role })
      .onConflictDoUpdate({
        target: [memberships.workspaceId, memberships.userId],
        set: { role },
      });
    if (role === "admin") await history.delete(b.id, organization.id, s.id);
    else
      await assert.rejects(
        () => history.delete(b.id, organization.id, s.id),
        /role/,
      );
  }
  await assert.rejects(() => history.delete(a.id, a.wid, s.id), /available/);
  // The actual workspace graph deliberately blocks ordinary hard deletion.
  await assert.rejects(
    () => db.delete(workspaces).where(eq(workspaces.id, a.wid)),
    /Failed query/,
  );
});
test("bounded retention prunes completed jobs, compacts old failed payloads and never touches pending", async () => {
  const a = await fixture(),
    b = await fixture(),
    c = await fixture();
  await queue.enqueue(a.s);
  await queue.materialize(await ownClaim(a.s.id));
  await queue.enqueue(b.s);
  const job = await ownClaim(b.s.id);
  await queue.fail({ ...job, attempt_count: 8 }, {});
  await queue.enqueue(c.s);
  const old = new Date(Date.now() - 31 * 86400000);
  await db
    .update(jobs)
    .set({ updatedAt: old })
    .where(sql`${jobs.id} in ${[a.s.id, b.s.id, c.s.id]}`);
  assert.equal(await queue.prune(), 1);
  assert.equal(await row(a.s.id), undefined);
  assert.equal((await row(b.s.id)).payload, null);
  assert.equal((await row(c.s.id)).status, "pending");
  assert.ok((await row(c.s.id)).payload);
  assert.equal(await queue.enqueue(a.s), "saved");
  assert.equal((await queue.retry(b.s.id)).length, 0);
  await db
    .update(jobs)
    .set({ updatedAt: new Date(Date.now() - 91 * 86400000) })
    .where(eq(jobs.id, b.s.id));
  await queue.prune();
  assert.equal(await row(b.s.id), undefined);
  assert.equal(await queue.enqueue(b.s), "retired");
  await db.delete(jobs).where(eq(jobs.id, c.s.id));
});
test("server statement and lock timeouts rollback bounded work without poisoning the pool", async () => {
  const a = await fixture();
  await assert.rejects(() =>
    db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout='30ms'`);
      await tx.execute(sql`select pg_sleep(0.2)`);
    }),
  );
  const lock = await pool.connect();
  await lock.query("begin");
  await lock.query("select id from workspaces where id=$1 for update", [a.wid]);
  try {
    await assert.rejects(() =>
      db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout='30ms'`);
        await tx.execute(
          sql`select id from workspaces where id=${a.wid}::uuid for update`,
        );
      }),
    );
  } finally {
    await lock.query("rollback");
    lock.release();
  }
  assert.equal((await pool.query("select 1 n")).rows[0].n, 1);
  const abandoned = await pool.connect();
  try {
    const terminated = new Promise<Error & { code?: string }>((resolve) =>
      abandoned.once("error", resolve),
    );
    await abandoned.query("set transaction_timeout='30ms'");
    await abandoned.query("begin");
    assert.equal((await terminated).code, "25P04");
  } finally {
    abandoned.release();
  }
  assert.equal((await pool.query("select 1 n")).rows[0].n, 1);
});
test("readiness and worker survive refused DB connections, drain and resume without public topology", async () => {
  const probe = new Readiness(url!, () => false),
    unavailable = new Readiness(
      "postgresql://invalid:private@127.0.0.1:1/ruckus_test",
      () => false,
    ),
    drained = new Readiness(url!, () => true);
  try {
    assert.equal(await probe.ready(), true);
    assert.equal(await drained.ready(), false);
    assert.equal(await drained.dependencyReady(), true);
    assert.equal(await unavailable.ready(), false);
    const broken = connectDatabase(
      "postgresql://invalid:private@127.0.0.1:1/ruckus_test",
    );
    try {
      const worker = new HistoryWorker(
        new HistoryOutbox(broken.db),
        async () => true,
      );
      await assert.doesNotReject(() => worker.tick());
      await worker.stop();
    } finally {
      await broken.pool.end();
    }
    await migrationCompatible(pool);
  } finally {
    await Promise.all([probe.close(), unavailable.close(), drained.close()]);
  }
});
