import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  sessionSummarySchema,
  type SessionSummary,
} from "../../shared/history.js";
import type { Database } from "../db/client.js";
import {
  historyReceipts as receipts,
  historyOutbox as jobs,
} from "../db/outbox-schema.js";
import { sessionRuns } from "../db/history-schema.js";
import { SessionHistoryService, summaryHash } from "./service.js";
import { OperationalError, failureCode, log, metrics } from "../ops/log.js";
import { lockWorkspace } from "../workspaces/policy.js";

export const MAX_ATTEMPTS = 8;
export const LEASE_MS = 60000;
export function retryDelay(attempt: number, random = Math.random) {
  return (
    Math.min(60000, 1000 * 2 ** Math.max(0, attempt - 1)) +
    Math.floor(random() * 250)
  );
}
export function validatedSummary(input: unknown) {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(input);
  } catch {
    throw new OperationalError("HISTORY_PAYLOAD_INVALID");
  }
  if (!serialized || Buffer.byteLength(serialized) > 2_000_000)
    throw new OperationalError("HISTORY_PAYLOAD_INVALID");
  const parsed = sessionSummarySchema.safeParse(input);
  if (!parsed.success) throw new OperationalError("HISTORY_PAYLOAD_INVALID");
  return parsed.data;
}
export type ClaimedJob = {
  id: string;
  workspace_id: string;
  locked_by: string;
  attempt_count: number;
};
export class HistoryOutbox {
  constructor(private db: Database) {}
  async enqueue(
    input: SessionSummary,
  ): Promise<"pending" | "saved" | "retired"> {
    const s = validatedSummary(input),
      hash = summaryHash(s);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`set local synchronous_commit='on'`);
      await lockWorkspace(tx, s.workspaceId);
      const inserted = await tx
        .insert(receipts)
        .values({ id: s.id, workspaceId: s.workspaceId, payloadHash: hash })
        .onConflictDoNothing()
        .returning({ id: receipts.id });
      const [receipt] = await tx
        .select()
        .from(receipts)
        .where(eq(receipts.id, s.id))
        .for("update");
      if (receipt.workspaceId !== s.workspaceId || receipt.payloadHash !== hash)
        throw new OperationalError("HISTORY_PAYLOAD_MISMATCH");
      if (receipt.deletedAt) return "retired";
      const [existing] = await tx
        .select({ hash: sessionRuns.contentHash })
        .from(sessionRuns)
        .where(eq(sessionRuns.id, s.id));
      if (existing) {
        if (existing.hash !== hash)
          throw new OperationalError("HISTORY_PAYLOAD_MISMATCH");
        return "saved";
      }
      const [queued] = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(eq(jobs.id, s.id));
      if (!queued && !inserted.length) return "retired";
      await tx
        .insert(jobs)
        .values({
          id: s.id,
          workspaceId: s.workspaceId,
          payload: s,
          payloadHash: hash,
        })
        .onConflictDoNothing();
      return "pending";
    });
  }
  async claim(workspaceId?: string): Promise<ClaimedJob | undefined> {
    // One bounded SQL claim; different workers skip held rows. Expired leases count as attempts.
    const token = randomUUID();
    const result = await this.db.execute(sql`
      with candidate as (
        select id from session_history_outbox
        where ((status='pending' and available_at<=now()) or (status='processing' and locked_at < now() - interval '60 seconds')) and ${workspaceId ? sql`workspace_id=${workspaceId}::uuid` : sql`true`}
        order by available_at,id for update skip locked limit 1
      ) update session_history_outbox j set
        status=case when attempt_count>=${MAX_ATTEMPTS} then 'failed' else 'processing' end,
        attempt_count=least(attempt_count+1,${MAX_ATTEMPTS}),
        locked_at=case when attempt_count>=${MAX_ATTEMPTS} then null else now() end,
        locked_by=case when attempt_count>=${MAX_ATTEMPTS} then null else ${token}::uuid end,
        last_error_code=case when attempt_count>=${MAX_ATTEMPTS} then 'LEASE_EXHAUSTED' else last_error_code end,
        updated_at=now()
      from candidate where j.id=candidate.id returning j.id,j.workspace_id,j.locked_by,j.attempt_count`);
    const row = result.rows[0] as ClaimedJob | undefined;
    if (row && !row.locked_by)
      log(
        "history.lease_exhausted",
        {
          sessionId: row.id,
          attempt: row.attempt_count,
          code: "LEASE_EXHAUSTED",
        },
        "error",
      );
    return row?.locked_by ? row : undefined;
  }
  async materialize(job: ClaimedJob) {
    const start = performance.now();
    const completed = await this.db.transaction(async (tx) => {
      await lockWorkspace(tx, job.workspace_id);
      // Same lock order as deletion and enqueue; a deleted receipt cannot resurrect results.
      const [receipt] = await tx
        .select()
        .from(receipts)
        .where(eq(receipts.id, job.id))
        .for("update");
      if (!receipt || receipt.deletedAt) return false;
      const [row] = await tx
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.id, job.id),
            eq(jobs.lockedBy, job.locked_by),
            eq(jobs.status, "processing"),
          ),
        )
        .for("update");
      if (!row) return false;
      const s = validatedSummary(row.payload);
      if (
        s.id !== row.id ||
        s.workspaceId !== row.workspaceId ||
        row.payloadHash !== receipt.payloadHash ||
        summaryHash(s) !== receipt.payloadHash
      )
        throw new OperationalError("HISTORY_PAYLOAD_MISMATCH");
      await new SessionHistoryService(this.db).finalize(s, tx);
      // Results, accountability and queue acknowledgement share one commit.
      await tx
        .update(jobs)
        .set({
          status: "completed",
          payload: null,
          lockedAt: null,
          lockedBy: null,
          completedAt: new Date(),
          updatedAt: new Date(),
          lastErrorCode: null,
        })
        .where(eq(jobs.id, job.id));
      return true;
    });
    if (!completed) return false;
    metrics.materialized++;
    metrics.materializationMs += performance.now() - start;
    log("history.materialized", {
      sessionId: job.id,
      attempt: job.attempt_count,
      durationMs: Math.round(performance.now() - start),
    });
    return true;
  }
  async fail(job: ClaimedJob, error: unknown) {
    const code = failureCode(error),
      terminal =
        job.attempt_count >= MAX_ATTEMPTS ||
        ["HISTORY_PAYLOAD_MISMATCH", "HISTORY_PAYLOAD_INVALID"].includes(code);
    const result = await this.db
      .update(jobs)
      .set({
        status: terminal ? "failed" : "pending",
        availableAt: new Date(Date.now() + retryDelay(job.attempt_count)),
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: code,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, job.id), eq(jobs.lockedBy, job.locked_by)))
      .returning({ id: jobs.id });
    metrics.materializationFailures++;
    log(
      "history.materialization_failed",
      {
        sessionId: job.id,
        attempt: job.attempt_count,
        code,
        result: terminal ? "failed" : "retry",
      },
      "error",
    );
    return result.length > 0 && terminal;
  }
  async prune() {
    // Never touch pending/leased work. Remove completed queue rows, not durable receipts.
    const pruned = await this.db.execute(
      sql`with old as (select id from session_history_outbox where status='completed' and updated_at<now()-interval '7 days' order by updated_at,id limit 100 for update skip locked) delete from session_history_outbox where id in (select id from old) returning id`,
    );
    await this.db.execute(
      sql`with old as (select id from session_history_outbox where status='failed' and payload is not null and updated_at<now()-interval '30 days' order by updated_at,id limit 100 for update skip locked) update session_history_outbox set payload=null where id in (select id from old)`,
    );
    await this.db.execute(
      sql`with old as (select id from session_history_outbox where status='failed' and updated_at<now()-interval '90 days' order by updated_at,id limit 100 for update skip locked) delete from session_history_outbox where id in (select id from old)`,
    );
    return pruned.rowCount;
  }
  async snapshot() {
    const r = await this.db.execute(
      sql`select status,count(*)::int as count,coalesce(extract(epoch from now()-min(created_at)),0)::int as oldest_seconds from session_history_outbox group by status`,
    );
    return r.rows;
  }
  /** Bounded terminal-state observation, including work completed by another process. */
  async states(ids: string[]) {
    if (!ids.length) return [];
    const result = await this.db.execute(sql`select r.id,
      case when s.id is not null then 'saved'
           when r.deleted_at is not null or j.status='failed' or j.id is null then 'failed'
           else 'pending' end as status
      from session_history_receipts r left join session_runs s on s.id=r.id
      left join session_history_outbox j on j.id=r.id
      where r.id in (${sql.join(
        ids.slice(0, 500).map((id) => sql`${id}::uuid`),
        sql`,`,
      )})`);
    return result.rows as {
      id: string;
      status: "saved" | "failed" | "pending";
    }[];
  }
  async retry(id: string) {
    // Operator command only; an explicit, validated ID, never automatic infinite retries.
    return this.db
      .update(jobs)
      .set({
        status: "pending",
        attemptCount: 0,
        availableAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jobs.id, id),
          eq(jobs.status, "failed"),
          sql`${jobs.payload} is not null`,
        ),
      )
      .returning({ id: jobs.id });
  }
}
