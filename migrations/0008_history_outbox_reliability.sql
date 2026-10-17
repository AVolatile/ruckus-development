CREATE TABLE "session_history_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"summary_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb,
	"payload_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" uuid,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "outbox_state" CHECK ("session_history_outbox"."status" in ('pending','processing','completed','failed')),
	CONSTRAINT "outbox_attempts" CHECK ("session_history_outbox"."attempt_count" between 0 and 8),
	CONSTRAINT "outbox_version" CHECK ("session_history_outbox"."summary_version" = 1),
	CONSTRAINT "outbox_payload_bound" CHECK ("session_history_outbox"."payload" is null or octet_length("session_history_outbox"."payload"::text) <= 2000000),
	CONSTRAINT "outbox_pending_payload" CHECK ("session_history_outbox"."status" not in ('pending','processing') or "session_history_outbox"."payload" is not null),
	CONSTRAINT "outbox_lease" CHECK (("session_history_outbox"."status" = 'processing') = ("session_history_outbox"."locked_at" is not null and "session_history_outbox"."locked_by" is not null))
);
--> statement-breakpoint
CREATE TABLE "session_history_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_hash" CHECK ("session_history_receipts"."payload_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "session_history_outbox" ADD CONSTRAINT "session_history_outbox_id_session_history_receipts_id_fk" FOREIGN KEY ("id") REFERENCES "public"."session_history_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_history_outbox" ADD CONSTRAINT "session_history_outbox_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_history_receipts" ADD CONSTRAINT "session_history_receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "history_outbox_pending_idx" ON "session_history_outbox" USING btree ("available_at","id") WHERE "session_history_outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "history_outbox_lease_idx" ON "session_history_outbox" USING btree ("locked_at") WHERE "session_history_outbox"."status" = 'processing';--> statement-breakpoint
CREATE INDEX "history_outbox_retention_idx" ON "session_history_outbox" USING btree ("status","updated_at","id");--> statement-breakpoint
CREATE INDEX "history_outbox_workspace_idx" ON "session_history_outbox" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "history_receipts_workspace_idx" ON "session_history_receipts" USING btree ("workspace_id");