import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  unique,
  check,
  customType,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";
import { workspaces, brandAssets } from "./workspace-schema.js";
import type { EventDefinition, LaunchSnapshot } from "../../shared/events.js";
const utc = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").$type<"draft" | "ready" | "archived">().notNull(),
    currentRevisionId: uuid("current_revision_id").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: utc("created_at"),
    updatedAt: utc("updated_at"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("events_workspace_updated_idx")
      .on(t.workspaceId, t.updatedAt, t.id)
      .where(sql`${t.archivedAt} is null`),
    check("event_status", sql`${t.status} in ('draft','ready','archived')`),
  ],
);
export const eventRevisions = pgTable(
  "event_revisions",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    revisionNumber: integer("revision_number").notNull(),
    definition: jsonb("definition").$type<EventDefinition>().notNull(),
    contentHash: text("content_hash").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: utc("created_at"),
  },
  (t) => [
    unique("event_revision_number_unique").on(t.eventId, t.revisionNumber),
    unique("event_revision_identity_unique").on(t.eventId, t.id),
    check("event_revision_positive", sql`${t.revisionNumber}>0`),
  ],
);
export const eventSnapshots = pgTable(
  "event_launch_snapshots",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    eventRevisionId: uuid("event_revision_id")
      .notNull()
      .references(() => eventRevisions.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    launchedBy: text("launched_by")
      .notNull()
      .references(() => user.id),
    snapshot: jsonb("snapshot").$type<LaunchSnapshot>().notNull(),
    createdAt: utc("created_at"),
  },
  (t) => [
    index("event_snapshot_event_time_idx").on(t.eventId, t.createdAt),
    unique("event_snapshot_event_id_unique").on(t.eventId, t.id),
  ],
);
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
export const eventSnapshotAssets = pgTable(
  "event_snapshot_assets",
  {
    id: uuid("id").primaryKey(),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => eventSnapshots.id),
    sourceAssetId: uuid("source_asset_id").references(() => brandAssets.id),
    kind: text("kind").notNull(),
    mimeType: text("mime_type").notNull(),
    byteLength: integer("byte_length").notNull(),
    contentHash: text("content_hash").notNull(),
    binaryContent: bytea("binary_content").notNull(),
    createdAt: utc("created_at"),
  },
  (t) => [
    index("event_asset_snapshot_idx").on(t.snapshotId),
    check(
      "event_asset_bounds",
      sql`${t.byteLength} between 1 and 5242880 and octet_length(${t.binaryContent})=${t.byteLength}`,
    ),
    check("event_asset_mime", sql`${t.mimeType}='image/webp'`),
    check("event_asset_kind", sql`${t.kind} in ('logo','background')`),
  ],
);
