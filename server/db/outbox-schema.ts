import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  check,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspace-schema.js";
import type { SessionSummary } from "../../shared/history.js";
const utc = (n: string) =>
  timestamp(n, { withTimezone: true }).notNull().defaultNow();
/** Minimal deduplication/deletion marker, retained without participant data. */
export const historyReceipts = pgTable(
  "session_history_receipts",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    payloadHash: text("payload_hash").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: utc("created_at"),
  },
  (t) => [
    index("history_receipts_workspace_idx").on(t.workspaceId),
    check("receipt_hash", sql`${t.payloadHash} ~ '^[a-f0-9]{64}$'`),
  ],
);
export const historyOutbox = pgTable(
  "session_history_outbox",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => historyReceipts.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    summaryVersion: integer("summary_version").notNull().default(1),
    payload: jsonb("payload").$type<SessionSummary>(),
    payloadHash: text("payload_hash").notNull(),
    status: text("status")
      .$type<"pending" | "processing" | "completed" | "failed">()
      .notNull()
      .default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: utc("available_at"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: uuid("locked_by"),
    lastErrorCode: text("last_error_code"),
    createdAt: utc("created_at"),
    updatedAt: utc("updated_at"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("history_outbox_pending_idx")
      .on(t.availableAt, t.id)
      .where(sql`${t.status} = 'pending'`),
    index("history_outbox_lease_idx")
      .on(t.lockedAt)
      .where(sql`${t.status} = 'processing'`),
    index("history_outbox_retention_idx").on(t.status, t.updatedAt, t.id),
    index("history_outbox_workspace_idx").on(t.workspaceId),
    check(
      "outbox_state",
      sql`${t.status} in ('pending','processing','completed','failed')`,
    ),
    check("outbox_attempts", sql`${t.attemptCount} between 0 and 8`),
    check("outbox_version", sql`${t.summaryVersion} = 1`),
    check(
      "outbox_payload_bound",
      sql`${t.payload} is null or octet_length(${t.payload}::text) <= 2000000`,
    ),
    check(
      "outbox_pending_payload",
      sql`${t.status} not in ('pending','processing') or ${t.payload} is not null`,
    ),
    check(
      "outbox_lease",
      sql`(${t.status} = 'processing') = (${t.lockedAt} is not null and ${t.lockedBy} is not null)`,
    ),
  ],
);
