import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  index,
  unique,
  uniqueIndex,
  check,
  customType,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";
import type { BrandConfig } from "../../shared/brand.js";
import type { WorkspaceRole } from "../../shared/workspaces.js";
const utc = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey(),
    kind: text("kind").$type<"personal" | "organization">().notNull(),
    name: text("name").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: utc("created_at"),
    updatedAt: utc("updated_at"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("workspaces_personal_user_unique")
      .on(t.createdByUserId)
      .where(sql`${t.kind} = 'personal'`),
    check("workspace_kind", sql`${t.kind} in ('personal','organization')`),
    check(
      "personal_not_archived",
      sql`${t.kind} <> 'personal' or ${t.archivedAt} is null`,
    ),
  ],
);
export const memberships = pgTable(
  "workspace_memberships",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role").$type<WorkspaceRole>().notNull(),
    joinedAt: utc("joined_at"),
    invitedByUserId: text("invited_by_user_id").references(() => user.id),
  },
  (t) => [
    unique("workspace_membership_unique").on(t.workspaceId, t.userId),
    index("membership_user_idx").on(t.userId),
    check(
      "membership_role",
      sql`${t.role} in ('owner','admin','host','viewer')`,
    ),
  ],
);
export const invitations = pgTable(
  "workspace_invitations",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    email: text("email_normalized").notNull(),
    role: text("role").$type<WorkspaceRole>().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: utc("created_at"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("invitations_workspace_idx").on(t.workspaceId, t.createdAt),
    uniqueIndex("invitations_pending_email_unique")
      .on(t.workspaceId, t.email)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
    check(
      "invite_email_normalized",
      sql`${t.email} = lower(btrim(${t.email}))`,
    ),
    check("invite_role", sql`${t.role} in ('owner','admin','host','viewer')`),
  ],
);
export const auditEvents = pgTable(
  "workspace_audit_events",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    actorUserId: text("actor_user_id").references(() => user.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: utc("created_at"),
  },
  (t) => [
    index("audit_workspace_time_idx").on(t.workspaceId, t.createdAt, t.id),
  ],
);
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
export const brandAssets = pgTable(
  "brand_assets",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    kind: text("kind").$type<"logo" | "background">().notNull(),
    mimeType: text("mime_type").notNull(),
    byteLength: integer("byte_length").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    contentHash: text("content_hash").notNull(),
    binaryContent: bytea("binary_content").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: utc("created_at"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("assets_workspace_idx").on(t.workspaceId),
    unique("assets_workspace_id_unique").on(t.workspaceId, t.id),
    check("asset_kind", sql`${t.kind} in ('logo','background')`),
    check(
      "asset_mime",
      sql`${t.mimeType} in ('image/png','image/jpeg','image/webp')`,
    ),
    check(
      "asset_bounds",
      sql`${t.byteLength} between 1 and 5242880 and ${t.width} between 1 and 4096 and ${t.height} between 1 and 4096`,
    ),
  ],
);
export const brandKits = pgTable(
  "brand_kits",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    currentRevisionId: uuid("current_revision_id").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: utc("created_at"),
    updatedAt: utc("updated_at"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("brand_workspace_updated_idx").on(t.workspaceId, t.updatedAt, t.id),
    uniqueIndex("brand_workspace_default_unique")
      .on(t.workspaceId)
      .where(sql`${t.isDefault} and ${t.deletedAt} is null`),
  ],
);
export const brandRevisions = pgTable(
  "brand_kit_revisions",
  {
    id: uuid("id").primaryKey(),
    brandKitId: uuid("brand_kit_id")
      .notNull()
      .references(() => brandKits.id),
    revisionNumber: integer("revision_number").notNull(),
    name: text("name").notNull(),
    config: jsonb("config").$type<BrandConfig>().notNull(),
    contentHash: text("content_hash").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    createdAt: utc("created_at"),
  },
  (t) => [
    unique("brand_revision_number_unique").on(t.brandKitId, t.revisionNumber),
    unique("brand_revision_kit_id_unique").on(t.brandKitId, t.id),
    check("brand_revision_positive", sql`${t.revisionNumber}>0`),
  ],
);
