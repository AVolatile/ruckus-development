import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  boolean,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspace-schema.js";
import { user } from "./auth-schema.js";
import type {
  SessionSource,
  SessionSummary,
  SessionSegment,
} from "../../shared/history.js";
export const sessionRuns = pgTable(
  "session_runs",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    hostUserId: text("host_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    roomCode: text("room_code").notNull(),
    type: text("session_type").$type<SessionSummary["type"]>().notNull(),
    title: text("title").notNull(),
    source: jsonb("source").$type<SessionSource>().notNull(),
    brand: jsonb("brand").$type<SessionSummary["brand"]>(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    playerCountJoined: integer("player_count_joined").notNull(),
    playerCountCompleted: integer("player_count_completed").notNull(),
    demoCount: integer("demo_count").notNull(),
    detailsOmitted: integer("details_omitted").notNull(),
    segmentCount: integer("segment_count").notNull(),
    status: text("status").$type<SessionSummary["status"]>().notNull(),
    launchSnapshotVersion: integer("launch_snapshot_version").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sessions_workspace_started_idx").on(
      t.workspaceId,
      t.startedAt,
      t.id,
    ),
    index("sessions_workspace_type_started_idx").on(
      t.workspaceId,
      t.type,
      t.startedAt,
      t.id,
    ),
    index("sessions_workspace_event_idx").on(
      t.workspaceId,
      sql`(${t.source}->>'eventId')`,
      t.startedAt,
    ),
    check(
      "session_type_check",
      sql`${t.type} in ('original','studio','event')`,
    ),
    check(
      "session_status_check",
      sql`${t.status} in ('completed','ended_early')`,
    ),
    check(
      "session_bounds_check",
      sql`${t.endedAt}>=${t.startedAt} and ${t.durationSeconds} between 0 and 1000000 and ${t.playerCountJoined}>=${t.playerCountCompleted} and ${t.playerCountCompleted}>=0 and ${t.playerCountJoined}>=0 and ${t.demoCount} between 0 and ${t.playerCountJoined} and ${t.detailsOmitted} between 0 and ${t.playerCountJoined} and ${t.segmentCount} between 1 and 50 and ${t.launchSnapshotVersion}=1`,
    ),
  ],
);
export const sessionSegments = pgTable(
  "session_segments",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => sessionRuns.id, { onDelete: "cascade" }),
    sequence: integer("sequence_index").notNull(),
    type: text("segment_type").$type<SessionSegment["type"]>().notNull(),
    title: text("title").notNull(),
    source: jsonb("source").$type<SessionSource>().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    completed: boolean("completed").notNull(),
    scored: boolean("scored").notNull(),
    rounds: integer("rounds").notNull(),
    participantCount: integer("participant_count").notNull(),
    submissions: integer("submissions").notNull(),
    votes: integer("votes").notNull(),
    results: jsonb("results").$type<SessionSegment["results"]>().notNull(),
  },
  (t) => [
    unique("session_segment_sequence_unique").on(t.runId, t.sequence),
    index("session_segments_game_idx").on(
      sql`(${t.source}->>'gameType')`,
      t.runId,
    ),
    check(
      "session_segment_bounds",
      sql`${t.sequence} between 0 and 49 and ${t.type} in ('original','studio') and ${t.endedAt}>=${t.startedAt} and ${t.durationSeconds}>=0 and ${t.rounds}>0 and ${t.participantCount} between 0 and 1500 and ${t.submissions}>=0 and ${t.votes}>=0 and jsonb_array_length(${t.results})<=300`,
    ),
  ],
);
export const sessionParticipants = pgTable(
  "session_participants",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => sessionRuns.id, { onDelete: "cascade" }),
    name: text("display_name").notNull(),
    avatar: integer("avatar").notNull(),
    demo: boolean("demo").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
    completed: boolean("completed").notNull(),
    finalScore: integer("final_score"),
    finalRank: integer("final_rank"),
    finalOrder: integer("final_order"),
    segmentsParticipated: integer("segments_participated").notNull(),
    segmentsCompleted: integer("segments_completed").notNull(),
  },
  (t) => [
    index("session_participants_rank_idx").on(t.runId, t.finalRank, t.id),
    check(
      "session_participant_bounds",
      sql`${t.avatar} between 0 and 19 and (${t.finalRank} is null or ${t.finalRank}>0) and (${t.finalScore} is null or ${t.finalScore}>=0) and ${t.segmentsCompleted} between 0 and ${t.segmentsParticipated} and ${t.segmentsParticipated} between 0 and 50`,
    ),
  ],
);
