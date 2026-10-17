import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import {
  sessionRuns as runs,
  sessionSegments as segments,
  sessionParticipants as participants,
} from "../db/history-schema.js";
import type { Database } from "../db/client.js";
import {
  authorize,
  lockWorkspace,
  type Transaction,
} from "../workspaces/policy.js";
import { historyReceipts, historyOutbox } from "../db/outbox-schema.js";
import { audit } from "../workspaces/audit.js";
import { ApiError } from "../api/errors.js";
import {
  historyDates,
  sessionSummarySchema,
  type SessionSummary,
  type HistoryQuery,
  type SessionListItem,
  type AnalyticsSummary,
} from "../../shared/history.js";
import { z } from "zod/v3";
const missing = () =>
  new ApiError(404, "SESSION_NOT_FOUND", "That recap isn’t available.");
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const summaryHash = (s: SessionSummary) =>
  createHash("sha256").update(canonical(s)).digest("hex");
function metadata(row: typeof runs.$inferSelect): SessionListItem {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    roomCode: row.roomCode,
    type: row.type,
    title: row.title,
    source: row.source,
    brand: row.brand,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt.toISOString(),
    durationSeconds: row.durationSeconds,
    playerCountJoined: row.playerCountJoined,
    playerCountCompleted: row.playerCountCompleted,
    demoCount: row.demoCount,
    detailsOmitted: row.detailsOmitted,
    status: row.status,
    launchSnapshotVersion: 1,
    segmentCount: row.segmentCount,
  };
}
function conditions(wid: string, q: HistoryQuery, now?: Date): SQL[] {
  const { start, end } = historyDates(q, now),
    all: SQL[] = [eq(runs.workspaceId, wid), sql`${runs.startedAt}<${end}`];
  if (start) all.push(sql`${runs.startedAt}>=${start}`);
  if (q.type) all.push(eq(runs.type, q.type));
  if (q.eventId) all.push(sql`${runs.source}->>'eventId'=${q.eventId}`);
  if (q.game)
    all.push(
      sql`exists (select 1 from ${segments} where ${segments.runId}=${runs.id} and ${segments.source}->>'gameType'=${q.game})`,
    );
  return all;
}
export class SessionHistoryService {
  constructor(private db: Database) {}
  /** Trusted runtime boundary only: never exposed as a client write endpoint. */
  async finalize(input: SessionSummary, transaction?: Transaction) {
    const s = sessionSummarySchema.parse(input),
      hash = summaryHash(s);
    if (Buffer.byteLength(JSON.stringify(s)) > 2_000_000)
      throw new Error("Session summary exceeds its storage bound.");
    const write = async (tx: Transaction) => {
      await tx.execute(sql`set local synchronous_commit='on'`);
      await tx.execute(sql`set local statement_timeout = '5s'`);
      await tx.execute(sql`set local lock_timeout = '3s'`);
      const { segments: gs, participants: ps, ...base } = s;
      const inserted = await tx
        .insert(runs)
        .values({
          ...base,
          startedAt: new Date(s.startedAt),
          endedAt: new Date(s.endedAt),
          segmentCount: gs.length,
          contentHash: hash,
        })
        .onConflictDoNothing({ target: runs.id })
        .returning({ id: runs.id });
      if (!inserted.length) {
        const [old] = await tx
          .select({ hash: runs.contentHash })
          .from(runs)
          .where(eq(runs.id, s.id));
        if (old?.hash !== hash)
          throw new Error("Conflicting session finalization.");
        return { id: s.id, created: false };
      }
      await tx.insert(segments).values(
        gs.map((g) => ({
          ...g,
          id: randomUUID(),
          runId: s.id,
          startedAt: new Date(g.startedAt),
          endedAt: new Date(g.endedAt),
        })),
      );
      if (ps.length)
        await tx.insert(participants).values(
          ps.map((p) => ({
            ...p,
            runId: s.id,
            joinedAt: new Date(p.joinedAt),
          })),
        );
      await audit(
        tx,
        s.workspaceId,
        s.hostUserId,
        `session.${s.status}`,
        "session",
        s.id,
        {
          type: s.type,
          ...s.source,
          participants: s.playerCountJoined,
          durationSeconds: s.durationSeconds,
        },
      );
      return { id: s.id, created: true };
    };
    return transaction ? write(transaction) : this.db.transaction(write);
  }
  async delete(actor: string, wid: string, id: string, requestId?: string) {
    return this.db.transaction(async (tx) => {
      await lockWorkspace(tx, wid);
      await authorize(tx, actor, wid, "history.delete");
      const [run] = await tx
        .select()
        .from(runs)
        .where(and(eq(runs.workspaceId, wid), eq(runs.id, id)));
      if (!run) throw missing();
      // Backfill only this deletion's minimal receipt for Phase 5 records.
      await tx
        .insert(historyReceipts)
        .values({ id, workspaceId: wid, payloadHash: run.contentHash })
        .onConflictDoNothing();
      await tx
        .select()
        .from(historyReceipts)
        .where(eq(historyReceipts.id, id))
        .for("update");
      await tx
        .update(historyReceipts)
        .set({ deletedAt: new Date() })
        .where(eq(historyReceipts.id, id));
      await tx.delete(historyOutbox).where(eq(historyOutbox.id, id));
      await tx
        .delete(runs)
        .where(and(eq(runs.id, id), eq(runs.workspaceId, wid)));
      await audit(tx, wid, actor, "session.history_deleted", "session", id, {
        ...(requestId ? { requestId } : {}),
      });
    });
  }
  async list(actor: string, wid: string, q: HistoryQuery) {
    await authorize(this.db, actor, wid, "history.read");
    const filters = conditions(wid, q);
    if (q.cursor) {
      try {
        const c = z
          .object({ startedAt: z.string().datetime(), id: z.string().uuid() })
          .strict()
          .parse(JSON.parse(Buffer.from(q.cursor, "base64url").toString()));
        filters.push(
          sql`(${runs.startedAt},${runs.id})<(${new Date(c.startedAt)},${c.id}::uuid)`,
        );
      } catch {
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Reload history to continue.",
        );
      }
    }
    const rows = await this.db
        .select()
        .from(runs)
        .where(and(...filters))
        .orderBy(desc(runs.startedAt), desc(runs.id))
        .limit(q.limit + 1),
      page = rows.slice(0, q.limit),
      last = page.at(-1);
    return {
      items: page.map(metadata),
      nextCursor:
        rows.length > q.limit && last
          ? Buffer.from(
              JSON.stringify({
                startedAt: last.startedAt.toISOString(),
                id: last.id,
              }),
            ).toString("base64url")
          : null,
    };
  }
  async get(actor: string, wid: string, id: string) {
    await authorize(this.db, actor, wid, "history.read");
    const [row] = await this.db
      .select()
      .from(runs)
      .where(and(eq(runs.workspaceId, wid), eq(runs.id, id)));
    if (!row) {
      const [pending] = await this.db
        .select({ status: historyOutbox.status })
        .from(historyOutbox)
        .where(
          and(eq(historyOutbox.id, id), eq(historyOutbox.workspaceId, wid)),
        );
      if (pending && ["pending", "processing"].includes(pending.status))
        throw new ApiError(
          409,
          "RECAP_PENDING",
          "Your recap is still saving. Try again in a moment.",
        );
      if (pending?.status === "failed")
        throw new ApiError(
          503,
          "RECAP_UNAVAILABLE",
          "Your recap couldn’t finish saving. Ask your host to contact Ruckus support.",
        );
      throw missing();
    }
    const [gs, ps] = await Promise.all([
      this.db
        .select()
        .from(segments)
        .where(eq(segments.runId, id))
        .orderBy(segments.sequence)
        .limit(50),
      this.db
        .select()
        .from(participants)
        .where(eq(participants.runId, id))
        .orderBy(participants.finalOrder, participants.id)
        .limit(300),
    ]);
    return {
      ...metadata(row),
      segments: gs.map(({ id: _id, runId: _rid, ...g }) => ({
        ...g,
        startedAt: g.startedAt.toISOString(),
        endedAt: g.endedAt.toISOString(),
      })),
      participants: ps.map(({ runId: _rid, ...p }) => ({
        ...p,
        joinedAt: p.joinedAt.toISOString(),
      })),
    };
  }
  async analytics(
    actor: string,
    wid: string,
    q: HistoryQuery,
  ): Promise<AnalyticsSummary> {
    await authorize(this.db, actor, wid, "analytics.read");
    const where = and(...conditions(wid, q))!,
      bucket = q.range === "all" && !q.from ? "month" : "day";
    const [totals, activity, types, games, packs, events] = await Promise.all([
      this.db.execute(
        sql`select count(*)::int as sessions, coalesce(sum(player_count_joined),0)::int as attendances, coalesce(sum(demo_count),0)::int as demos, count(*) filter(where status='completed')::int as completed, coalesce(sum(duration_seconds),0)::float8 as seconds, coalesce(avg(player_count_joined),0)::float8 as attendance, coalesce(avg(duration_seconds),0)::float8 as duration from ${runs} where ${where}`,
      ),
      this.db.execute(
        sql`select to_char(date_trunc(${bucket},${runs.startedAt} at time zone 'UTC'),'YYYY-MM-DD') as date,count(*)::int as sessions,sum(${runs.playerCountJoined})::int as attendances from ${runs} where ${where} group by 1 order by 1 desc limit 120`,
      ),
      this.db.execute(
        sql`select ${runs.type} as type,count(*)::int as sessions from ${runs} where ${where} group by 1 order by 2 desc,1`,
      ),
      this.db.execute(
        sql`select ${segments.source}->>'gameType' as id, ${segments.source}->>'gameType' as title,count(*)::int as plays from ${segments} join ${runs} on ${runs.id}=${segments.runId} where ${where} and ${segments.source}->>'gameType' is not null group by 1,2 order by 3 desc,1 limit 6`,
      ),
      this.db.execute(
        sql`select ${segments.source}->>'packId' as id,(array_agg(${segments.source}->>'packName' order by ${runs.startedAt} desc,${runs.id} desc))[1] as title,count(*)::int as plays from ${segments} join ${runs} on ${runs.id}=${segments.runId} where ${where} and ${segments.source}->>'packId' is not null group by 1 order by 3 desc,1 limit 10`,
      ),
      this.db.execute(
        sql`select ${runs.source}->>'eventId' as id,(array_agg(${runs.title} order by ${runs.startedAt} desc,${runs.id} desc))[1] as title,count(*)::int as plays from ${runs} where ${where} and ${runs.type}='event' group by 1 order by 3 desc,1 limit 10`,
      ),
    ]);
    const t = totals.rows[0] as Record<string, number>;
    return {
      sessions: t.sessions,
      attendances: t.attendances,
      demoAttendances: t.demos,
      completed: t.completed,
      totalSeconds: t.seconds,
      averageAttendance: t.attendance,
      averageSeconds: t.duration,
      activity: activity.rows.reverse() as AnalyticsSummary["activity"],
      types: types.rows as AnalyticsSummary["types"],
      games: games.rows as AnalyticsSummary["games"],
      packs: packs.rows as AnalyticsSummary["packs"],
      events: events.rows as AnalyticsSummary["events"],
      bucket,
    };
  }
}
