import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspace-schema.js";
export * from "./workspace-schema.js";
import { user } from "./auth-schema.js";
import type { CustomBoard } from "../../shared/boards.js";
const utc = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();
export const boardsTable = pgTable(
  "boards",
  {
    id: uuid("id").primaryKey(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("draft"),
    schemaVersion: integer("schema_version").notNull().default(1),
    currentRevisionId: uuid("current_revision_id").notNull(),
    clientImportKey: text("client_import_key"),
    createdAt: utc("created_at"),
    updatedAt: utc("updated_at"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("boards_active_workspace_updated_idx")
      .on(table.workspaceId, table.updatedAt, table.id)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex("boards_workspace_import_key_idx")
      .on(table.workspaceId, table.clientImportKey)
      .where(sql`${table.clientImportKey} is not null`),
    check("boards_schema_version_check", sql`${table.schemaVersion} = 1`),
    check("boards_status_check", sql`${table.status} in ('draft', 'ready')`),
  ],
);
export const revisionsTable = pgTable(
  "board_revisions",
  {
    id: uuid("id").primaryKey(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boardsTable.id),
    revisionNumber: integer("revision_number").notNull(),
    content: jsonb("content").$type<CustomBoard>().notNull(),
    contentHash: text("content_hash").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),
    source: text("source").notNull(),
    createdAt: utc("created_at"),
  },
  (table) => [
    unique("board_revisions_board_number_unique").on(
      table.boardId,
      table.revisionNumber,
    ),
    unique("board_revisions_board_id_id_unique").on(table.boardId, table.id),
    check("board_revisions_number_check", sql`${table.revisionNumber} > 0`),
  ],
);

export * from "./event-schema.js";
export * from "./content-schema.js";
