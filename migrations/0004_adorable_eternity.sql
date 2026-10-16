CREATE TABLE "content_packs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid,
	"owner_type" text NOT NULL,
	"visibility" text NOT NULL,
	"system_slug" text,
	"game_type" text NOT NULL,
	"name" text NOT NULL,
	"short_description" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"season" text NOT NULL,
	"difficulty" text NOT NULL,
	"tags" text[] NOT NULL,
	"status" text NOT NULL,
	"current_revision_id" uuid NOT NULL,
	"created_by_user_id" text,
	"provenance" text NOT NULL,
	"source_pack_id" uuid,
	"source_revision_id" uuid,
	"last_seed_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "content_ownership" CHECK (("content_packs"."owner_type"='ruckus' and "content_packs"."workspace_id" is null and "content_packs"."visibility"='built_in' and "content_packs"."system_slug" is not null and "content_packs"."created_by_user_id" is null) or ("content_packs"."owner_type"='workspace' and "content_packs"."workspace_id" is not null and "content_packs"."visibility"='workspace_private' and "content_packs"."system_slug" is null and "content_packs"."created_by_user_id" is not null)),
	CONSTRAINT "content_status" CHECK ("content_packs"."status" in ('draft','ready','archived')),
	CONSTRAINT "content_game" CHECK ("content_packs"."game_type" in ('hotwire','room-temperature','sellout','caption-this','odd-one-in','scribble-shift')),
	CONSTRAINT "content_archive" CHECK (("content_packs"."status"='archived')=("content_packs"."archived_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "content_pack_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pack_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"schema_version" integer NOT NULL,
	"document" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"item_count" integer NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_revision_number_unique" UNIQUE("pack_id","revision_number"),
	CONSTRAINT "content_revision_identity_unique" UNIQUE("pack_id","id"),
	CONSTRAINT "content_revision_bounds" CHECK ("content_pack_revisions"."revision_number">0 and "content_pack_revisions"."schema_version"=1 and "content_pack_revisions"."item_count" between 0 and 500)
);
--> statement-breakpoint
ALTER TABLE "content_packs" ADD CONSTRAINT "content_packs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_packs" ADD CONSTRAINT "content_packs_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pack_revisions" ADD CONSTRAINT "content_pack_revisions_pack_id_content_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."content_packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pack_revisions" ADD CONSTRAINT "content_pack_revisions_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_workspace_updated_idx" ON "content_packs" USING btree ("workspace_id","updated_at","id") WHERE "content_packs"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "content_owner_game_status_idx" ON "content_packs" USING btree ("owner_type","game_type","status");--> statement-breakpoint
CREATE INDEX "content_game_category_idx" ON "content_packs" USING btree ("game_type","category");--> statement-breakpoint
CREATE INDEX "content_season_idx" ON "content_packs" USING btree ("season");--> statement-breakpoint
CREATE UNIQUE INDEX "content_system_slug_idx" ON "content_packs" USING btree ("system_slug");--> statement-breakpoint
ALTER TABLE content_packs ADD CONSTRAINT content_current_revision_same_pack FOREIGN KEY (id,current_revision_id) REFERENCES content_pack_revisions(pack_id,id) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE TRIGGER content_revision_immutable BEFORE UPDATE OR DELETE ON content_pack_revisions FOR EACH ROW EXECUTE FUNCTION preserve_board_revision();
--> statement-breakpoint
ALTER TABLE content_pack_revisions ADD CONSTRAINT content_document_shape CHECK (document->>'schemaVersion'='1' AND jsonb_typeof(document->'content'->'items')='array' AND jsonb_array_length(document->'content'->'items')=item_count);
