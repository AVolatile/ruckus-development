CREATE TABLE "session_participants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"avatar" integer NOT NULL,
	"demo" boolean NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"completed" boolean NOT NULL,
	"final_score" integer,
	"final_rank" integer,
	"segments_participated" integer NOT NULL,
	"segments_completed" integer NOT NULL,
	CONSTRAINT "session_participant_bounds" CHECK ("session_participants"."avatar" between 0 and 19 and ("session_participants"."final_rank" is null or "session_participants"."final_rank">0) and ("session_participants"."final_score" is null or "session_participants"."final_score">=0) and "session_participants"."segments_completed" between 0 and "session_participants"."segments_participated" and "session_participants"."segments_participated" between 0 and 50)
);
--> statement-breakpoint
CREATE TABLE "session_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"host_user_id" text,
	"room_code" text NOT NULL,
	"session_type" text NOT NULL,
	"title" text NOT NULL,
	"source" jsonb NOT NULL,
	"brand" jsonb,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"player_count_joined" integer NOT NULL,
	"player_count_completed" integer NOT NULL,
	"demo_count" integer NOT NULL,
	"details_omitted" integer NOT NULL,
	"segment_count" integer NOT NULL,
	"status" text NOT NULL,
	"launch_snapshot_version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_type_check" CHECK ("session_runs"."session_type" in ('original','studio','event')),
	CONSTRAINT "session_status_check" CHECK ("session_runs"."status" in ('completed','ended_early')),
	CONSTRAINT "session_bounds_check" CHECK ("session_runs"."ended_at">="session_runs"."started_at" and "session_runs"."duration_seconds" between 0 and 1000000 and "session_runs"."player_count_joined">="session_runs"."player_count_completed" and "session_runs"."player_count_completed">=0 and "session_runs"."player_count_joined">=0 and "session_runs"."demo_count" between 0 and "session_runs"."player_count_joined" and "session_runs"."details_omitted" between 0 and "session_runs"."player_count_joined" and "session_runs"."segment_count" between 1 and 50 and "session_runs"."launch_snapshot_version"=1)
);
--> statement-breakpoint
CREATE TABLE "session_segments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"sequence_index" integer NOT NULL,
	"segment_type" text NOT NULL,
	"title" text NOT NULL,
	"source" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"completed" boolean NOT NULL,
	"scored" boolean NOT NULL,
	"rounds" integer NOT NULL,
	"participant_count" integer NOT NULL,
	"submissions" integer NOT NULL,
	"votes" integer NOT NULL,
	"results" jsonb NOT NULL,
	CONSTRAINT "session_segment_sequence_unique" UNIQUE("run_id","sequence_index"),
	CONSTRAINT "session_segment_bounds" CHECK ("session_segments"."sequence_index" between 0 and 49 and "session_segments"."segment_type" in ('original','studio') and "session_segments"."ended_at">="session_segments"."started_at" and "session_segments"."duration_seconds">=0 and "session_segments"."rounds">0 and "session_segments"."participant_count" between 0 and 300 and "session_segments"."submissions">=0 and "session_segments"."votes">=0 and jsonb_array_length("session_segments"."results")<=300)
);
--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_run_id_session_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."session_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_runs" ADD CONSTRAINT "session_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_runs" ADD CONSTRAINT "session_runs_host_user_id_user_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_segments" ADD CONSTRAINT "session_segments_run_id_session_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."session_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_participants_rank_idx" ON "session_participants" USING btree ("run_id","final_rank","id");--> statement-breakpoint
CREATE INDEX "sessions_workspace_started_idx" ON "session_runs" USING btree ("workspace_id","started_at","id");--> statement-breakpoint
CREATE INDEX "sessions_workspace_type_started_idx" ON "session_runs" USING btree ("workspace_id","session_type","started_at","id");--> statement-breakpoint
CREATE INDEX "sessions_workspace_event_idx" ON "session_runs" USING btree ("workspace_id",("source"->>'eventId'),"started_at");--> statement-breakpoint
CREATE INDEX "session_segments_game_idx" ON "session_segments" USING btree (("source"->>'gameType'),"run_id");--> statement-breakpoint
CREATE FUNCTION protect_session_outcome_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Account erasure may remove attribution without modifying any result.
  IF TG_TABLE_NAME = 'session_runs' AND NEW.host_user_id IS NULL AND
     (to_jsonb(NEW) - 'host_user_id') = (to_jsonb(OLD) - 'host_user_id') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Finalized session outcomes cannot be updated' USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER session_runs_immutable BEFORE UPDATE ON session_runs FOR EACH ROW EXECUTE FUNCTION protect_session_outcome_update();
--> statement-breakpoint
CREATE FUNCTION protect_session_child_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Finalized session outcomes cannot be updated' USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER session_segments_immutable BEFORE UPDATE ON session_segments FOR EACH ROW EXECUTE FUNCTION protect_session_child_update();
--> statement-breakpoint
CREATE TRIGGER session_participants_immutable BEFORE UPDATE ON session_participants FOR EACH ROW EXECUTE FUNCTION protect_session_child_update();
