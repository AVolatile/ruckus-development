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
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspace-schema.js";
import { user } from "./auth-schema.js";
import type { PackDocument } from "../../shared/content-packs.js";
import type { GameId } from "../../shared/types.js";
const utc = (n: string) =>
  timestamp(n, { withTimezone: true }).notNull().defaultNow();
export const contentPacks = pgTable(
  "content_packs",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    ownerType: text("owner_type").$type<"ruckus" | "workspace">().notNull(),
    visibility: text("visibility").notNull(),
    systemSlug: text("system_slug"),
    gameType: text("game_type").$type<GameId>().notNull(),
    name: text("name").notNull(),
    shortDescription: text("short_description").notNull(),
    description: text("description").notNull(),
    category: text("category").$type<PackDocument["category"]>().notNull(),
    season: text("season").$type<PackDocument["season"]>().notNull(),
    difficulty: text("difficulty")
      .$type<PackDocument["difficulty"]>()
      .notNull(),
    tags: text("tags").array().notNull(),
    status: text("status").$type<"draft" | "ready" | "archived">().notNull(),
    currentRevisionId: uuid("current_revision_id").notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id),
    provenance: text("provenance")
      .$type<"ruckus_original" | "workspace_authored" | "copied">()
      .notNull(),
    sourcePackId: uuid("source_pack_id"),
    sourceRevisionId: uuid("source_revision_id"),
    lastSeedHash: text("last_seed_hash"),
    createdAt: utc("created_at"),
    updatedAt: utc("updated_at"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("content_workspace_updated_idx")
      .on(t.workspaceId, t.updatedAt, t.id)
      .where(sql`${t.archivedAt} is null`),
    index("content_owner_game_status_idx").on(
      t.ownerType,
      t.gameType,
      t.status,
    ),
    index("content_game_category_idx").on(t.gameType, t.category),
    index("content_season_idx").on(t.season),
    uniqueIndex("content_system_slug_idx").on(t.systemSlug),
    check(
      "content_ownership",
      sql`(${t.ownerType}='ruckus' and ${t.workspaceId} is null and ${t.visibility}='built_in' and ${t.systemSlug} is not null and ${t.createdByUserId} is null) or (${t.ownerType}='workspace' and ${t.workspaceId} is not null and ${t.visibility}='workspace_private' and ${t.systemSlug} is null and ${t.createdByUserId} is not null)`,
    ),
    check("content_status", sql`${t.status} in ('draft','ready','archived')`),
    check(
      "content_game",
      sql`${t.gameType} in ('hotwire','room-temperature','sellout','caption-this','odd-one-in','scribble-shift')`,
    ),
    check(
      "content_archive",
      sql`(${t.status}='archived')=(${t.archivedAt} is not null)`,
    ),
  ],
);
export const contentRevisions = pgTable(
  "content_pack_revisions",
  {
    id: uuid("id").primaryKey(),
    packId: uuid("pack_id")
      .notNull()
      .references(() => contentPacks.id),
    revisionNumber: integer("revision_number").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    document: jsonb("document").$type<PackDocument>().notNull(),
    contentHash: text("content_hash").notNull(),
    itemCount: integer("item_count").notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id),
    createdAt: utc("created_at"),
  },
  (t) => [
    unique("content_revision_number_unique").on(t.packId, t.revisionNumber),
    unique("content_revision_identity_unique").on(t.packId, t.id),
    check(
      "content_revision_bounds",
      sql`${t.revisionNumber}>0 and ${t.schemaVersion}=1 and ${t.itemCount} between 0 and 500`,
    ),
  ],
);
