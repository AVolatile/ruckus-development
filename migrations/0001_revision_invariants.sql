-- A completed board must always point to one of its own revisions.
ALTER TABLE boards ADD CONSTRAINT boards_current_revision_fk
 FOREIGN KEY (id, current_revision_id) REFERENCES board_revisions(board_id, id)
 DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE FUNCTION preserve_board_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Board revisions are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER board_revisions_immutable BEFORE UPDATE OR DELETE ON board_revisions
 FOR EACH ROW EXECUTE FUNCTION preserve_board_revision();
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT user_normalized_email CHECK (email = lower(btrim(email)));
--> statement-breakpoint
ALTER TABLE board_revisions ADD CONSTRAINT revision_document_identity
 CHECK (content->>'id' = board_id::text AND content->>'version' = '1' AND jsonb_typeof(content->'questions') = 'array' AND jsonb_array_length(content->'questions') BETWEEN 1 AND 50);
