CREATE TABLE "workspace_audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_length" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"content_hash" text NOT NULL,
	"binary_content" "bytea" NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "assets_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "asset_kind" CHECK ("brand_assets"."kind" in ('logo','background')),
	CONSTRAINT "asset_mime" CHECK ("brand_assets"."mime_type" in ('image/png','image/jpeg','image/webp')),
	CONSTRAINT "asset_bounds" CHECK ("brand_assets"."byte_length" between 1 and 5242880 and "brand_assets"."width" between 1 and 4096 and "brand_assets"."height" between 1 and 4096)
);
--> statement-breakpoint
CREATE TABLE "brand_kits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"current_revision_id" uuid NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "brand_kit_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"brand_kit_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_revision_number_unique" UNIQUE("brand_kit_id","revision_number"),
	CONSTRAINT "brand_revision_kit_id_unique" UNIQUE("brand_kit_id","id"),
	CONSTRAINT "brand_revision_positive" CHECK ("brand_kit_revisions"."revision_number">0)
);
--> statement-breakpoint
CREATE TABLE "workspace_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email_normalized" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "workspace_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invite_email_normalized" CHECK ("workspace_invitations"."email_normalized" = lower(btrim("workspace_invitations"."email_normalized"))),
	CONSTRAINT "invite_role" CHECK ("workspace_invitations"."role" in ('owner','admin','host','viewer'))
);
--> statement-breakpoint
CREATE TABLE "workspace_memberships" (
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_by_user_id" text,
	CONSTRAINT "workspace_membership_unique" UNIQUE("workspace_id","user_id"),
	CONSTRAINT "membership_role" CHECK ("workspace_memberships"."role" in ('owner','admin','host','viewer'))
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "workspace_kind" CHECK ("workspaces"."kind" in ('personal','organization')),
	CONSTRAINT "personal_not_archived" CHECK ("workspaces"."kind" <> 'personal' or "workspaces"."archived_at" is null)
);
--> statement-breakpoint
ALTER TABLE "boards" RENAME COLUMN "owner_user_id" TO "created_by_user_id";--> statement-breakpoint
ALTER TABLE "boards" DROP CONSTRAINT "boards_owner_user_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "boards_active_owner_updated_idx";--> statement-breakpoint
DROP INDEX "boards_owner_import_key_idx";--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "workspace_id" uuid;
--> statement-breakpoint
INSERT INTO workspaces (id, kind, name, created_by_user_id, created_at, updated_at)
 SELECT gen_random_uuid(), 'personal', 'Personal workspace', id, created_at, created_at FROM "user";
--> statement-breakpoint
INSERT INTO workspace_memberships (workspace_id,user_id,role,joined_at)
 SELECT id, created_by_user_id, 'owner', created_at FROM workspaces WHERE kind='personal';
--> statement-breakpoint
UPDATE boards b SET workspace_id=w.id FROM workspaces w WHERE w.kind='personal' AND w.created_by_user_id=b.created_by_user_id;
--> statement-breakpoint
SET CONSTRAINTS boards_current_revision_fk IMMEDIATE;
--> statement-breakpoint
ALTER TABLE boards ALTER COLUMN workspace_id SET NOT NULL;
--> statement-breakpoint
SET CONSTRAINTS boards_current_revision_fk DEFERRED;--> statement-breakpoint
ALTER TABLE "workspace_audit_events" ADD CONSTRAINT "workspace_audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_audit_events" ADD CONSTRAINT "workspace_audit_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kit_revisions" ADD CONSTRAINT "brand_kit_revisions_brand_kit_id_brand_kits_id_fk" FOREIGN KEY ("brand_kit_id") REFERENCES "public"."brand_kits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kit_revisions" ADD CONSTRAINT "brand_kit_revisions_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_workspace_time_idx" ON "workspace_audit_events" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
CREATE INDEX "assets_workspace_idx" ON "brand_assets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "brand_workspace_updated_idx" ON "brand_kits" USING btree ("workspace_id","updated_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_workspace_default_unique" ON "brand_kits" USING btree ("workspace_id") WHERE "brand_kits"."is_default" and "brand_kits"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "invitations_workspace_idx" ON "workspace_invitations" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_email_unique" ON "workspace_invitations" USING btree ("workspace_id","email_normalized") WHERE "workspace_invitations"."accepted_at" is null and "workspace_invitations"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "workspace_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_personal_user_unique" ON "workspaces" USING btree ("created_by_user_id") WHERE "workspaces"."kind" = 'personal';--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boards_active_workspace_updated_idx" ON "boards" USING btree ("workspace_id","updated_at","id") WHERE "boards"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "boards_workspace_import_key_idx" ON "boards" USING btree ("workspace_id","client_import_key") WHERE "boards"."client_import_key" is not null;
--> statement-breakpoint
ALTER TABLE brand_kits ADD CONSTRAINT brand_current_revision_fk FOREIGN KEY (id,current_revision_id) REFERENCES brand_kit_revisions(brand_kit_id,id) DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE TRIGGER brand_revisions_immutable BEFORE UPDATE OR DELETE ON brand_kit_revisions FOR EACH ROW EXECUTE FUNCTION preserve_board_revision();
--> statement-breakpoint
CREATE TRIGGER workspace_audit_immutable BEFORE UPDATE OR DELETE ON workspace_audit_events FOR EACH ROW EXECUTE FUNCTION preserve_board_revision();
--> statement-breakpoint
CREATE FUNCTION create_personal_workspace() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE wid uuid := gen_random_uuid();
BEGIN
 INSERT INTO workspaces(id,kind,name,created_by_user_id) VALUES(wid,'personal','Personal workspace',NEW.id);
 INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES(wid,NEW.id,'owner');
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER user_personal_workspace AFTER INSERT ON "user" FOR EACH ROW EXECUTE FUNCTION create_personal_workspace();
--> statement-breakpoint
CREATE FUNCTION protect_workspace_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR NEW.kind<>OLD.kind OR NEW.created_by_user_id<>OLD.created_by_user_id THEN RAISE EXCEPTION 'Workspace identity is permanent'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER workspace_identity BEFORE UPDATE OR DELETE ON workspaces FOR EACH ROW EXECUTE FUNCTION protect_workspace_identity();
--> statement-breakpoint
CREATE FUNCTION protect_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE wid uuid; w workspaces;
BEGIN
 wid := CASE WHEN TG_OP='DELETE' THEN OLD.workspace_id ELSE NEW.workspace_id END;
 SELECT * INTO w FROM workspaces WHERE id=wid FOR UPDATE;
 IF TG_OP='UPDATE' AND (OLD.workspace_id<>NEW.workspace_id OR OLD.user_id<>NEW.user_id) THEN RAISE EXCEPTION 'Membership identity is permanent'; END IF;
 IF w.kind='personal' AND (TG_OP='DELETE' OR NEW.user_id<>w.created_by_user_id OR NEW.role<>'owner') THEN RAISE EXCEPTION 'Personal membership is permanent'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER membership_policy BEFORE INSERT OR UPDATE OR DELETE ON workspace_memberships FOR EACH ROW EXECUTE FUNCTION protect_membership();
--> statement-breakpoint
CREATE FUNCTION require_workspace_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE wid uuid;
BEGIN
 IF TG_TABLE_NAME='workspaces' THEN wid:=NEW.id;
 ELSE wid:=CASE WHEN TG_OP='DELETE' THEN OLD.workspace_id ELSE NEW.workspace_id END; END IF;
 IF NOT EXISTS(SELECT 1 FROM workspace_memberships WHERE workspace_id=wid AND role='owner') THEN RAISE EXCEPTION 'Workspace must retain an owner'; END IF;
 RETURN NULL;
END; $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER workspace_requires_owner AFTER INSERT ON workspaces DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_workspace_owner();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER membership_requires_owner AFTER UPDATE OR DELETE ON workspace_memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION require_workspace_owner();
