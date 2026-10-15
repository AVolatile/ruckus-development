CREATE TABLE "event_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_revision_number_unique" UNIQUE("event_id","revision_number"),
	CONSTRAINT "event_revision_identity_unique" UNIQUE("event_id","id"),
	CONSTRAINT "event_revision_positive" CHECK ("event_revisions"."revision_number">0)
);
--> statement-breakpoint
CREATE TABLE "event_snapshot_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"source_asset_id" uuid,
	"kind" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_length" integer NOT NULL,
	"content_hash" text NOT NULL,
	"binary_content" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_asset_bounds" CHECK ("event_snapshot_assets"."byte_length" between 1 and 5242880 and octet_length("event_snapshot_assets"."binary_content")="event_snapshot_assets"."byte_length"),
	CONSTRAINT "event_asset_mime" CHECK ("event_snapshot_assets"."mime_type"='image/webp'),
	CONSTRAINT "event_asset_kind" CHECK ("event_snapshot_assets"."kind" in ('logo','background'))
);
--> statement-breakpoint
CREATE TABLE "event_launch_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"event_revision_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"launched_by" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_snapshot_event_id_unique" UNIQUE("event_id","id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"current_revision_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "event_status" CHECK ("events"."status" in ('draft','ready','archived'))
);
--> statement-breakpoint
ALTER TABLE "event_revisions" ADD CONSTRAINT "event_revisions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_revisions" ADD CONSTRAINT "event_revisions_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_snapshot_assets" ADD CONSTRAINT "event_snapshot_assets_snapshot_id_event_launch_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."event_launch_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_snapshot_assets" ADD CONSTRAINT "event_snapshot_assets_source_asset_id_brand_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."brand_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_launch_snapshots" ADD CONSTRAINT "event_launch_snapshots_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_launch_snapshots" ADD CONSTRAINT "event_launch_snapshots_event_revision_id_event_revisions_id_fk" FOREIGN KEY ("event_revision_id") REFERENCES "public"."event_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_launch_snapshots" ADD CONSTRAINT "event_launch_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_launch_snapshots" ADD CONSTRAINT "event_launch_snapshots_launched_by_user_id_fk" FOREIGN KEY ("launched_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_asset_snapshot_idx" ON "event_snapshot_assets" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "event_snapshot_event_time_idx" ON "event_launch_snapshots" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE INDEX "events_workspace_updated_idx" ON "events" USING btree ("workspace_id","updated_at","id") WHERE "events"."archived_at" is null;--> statement-breakpoint
ALTER TABLE events ADD CONSTRAINT event_current_revision_same_event FOREIGN KEY (id,current_revision_id) REFERENCES event_revisions(event_id,id) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE event_launch_snapshots ADD CONSTRAINT snapshot_revision_same_event FOREIGN KEY (event_id,event_revision_id) REFERENCES event_revisions(event_id,id);
--> statement-breakpoint
CREATE TRIGGER event_revision_immutable BEFORE UPDATE OR DELETE ON event_revisions FOR EACH ROW EXECUTE FUNCTION preserve_board_revision();
--> statement-breakpoint
CREATE TRIGGER event_snapshot_immutable BEFORE UPDATE OR DELETE ON event_launch_snapshots FOR EACH ROW EXECUTE FUNCTION preserve_board_revision();
--> statement-breakpoint
CREATE TRIGGER event_snapshot_asset_immutable BEFORE UPDATE OR DELETE ON event_snapshot_assets FOR EACH ROW EXECUTE FUNCTION preserve_board_revision();
