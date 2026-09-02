-- Migration 045: activity feed comments, and the reactions read hole next door
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS
--
-- Feed slice B adds comments to activity feed cards (ROADMAP.md TASK 22.0). The new
-- table is shaped exactly like trip_comments -- the app's existing lightweight comment
-- table -- scoped to activity_feed instead of ski_trips.
--
-- While building it, the identical vulnerability class migration 042 fixed across seven
-- trip-content tables turned out to be live, right next door:
--
--   activity_feed_reactions  SELECT USING (true)    who reacted to whose day
--
-- Lower stakes than a trip's private chat (an emoji plus a user_id, not free text), but
-- the same mistake: readable by EVERY authenticated user regardless of friendship, while
-- the activity_feed row it hangs off has been correctly scoped to actor-or-friend since
-- migration 013. Kyle's call was to fix the whole class in the same pass rather than
-- leave a known-identical gap next to brand-new code, which is migration 042's own
-- reasoning applied one table over.
--
-- THE RULE. Everything hanging off an activity is visible to exactly whoever can see the
-- activity: the actor, or a friend of the actor. That is not a new rule -- it is
-- activity_feed's own SELECT policy from migration 013, lifted into a reusable helper so
-- two more tables can share it instead of restating it.
--
-- can_see_activity() is SECURITY DEFINER so no policy ever reads an RLS-protected
-- relation inline (the bug migration 041 nearly shipped), and STABLE so it inlines and
-- does not re-execute per candidate row (032:52-57). It calls are_friends(), whose body
-- is character-for-character the friendship half of activity_feed's own policy.
--
-- WHY content_reports IS TOUCHED HERE
--
-- Comments are reportable through the app's one existing report path,
-- reportContent(type, id, reason) -> the report_content RPC -> content_reports. That path
-- is allowlisted in two places, both of which reject 'activity_comment' today:
--
--   * content_reports_target_type_check   (migration 026:17)
--   * the report_content RPC's own guard  (migration 027:14)
--
-- So the Report button on a comment cannot work without widening both. The RPC below is
-- migration 027's body verbatim with one value added -- the dedupe ON CONFLICT and the
-- empty-reason guard are preserved exactly; nothing else about reporting changes.
-- (moderation_flags is a different table entirely, written only by the server's
-- service-role moderation endpoint, and is NOT on this path.)
--
-- ROLLBACK, if anything breaks:
--   -- reactions (WARNING: this re-opens the read hole; emergencies only)
--   DROP POLICY IF EXISTS activity_feed_reactions_select ON public.activity_feed_reactions;
--   CREATE POLICY "Auth users view activity reactions" ON public.activity_feed_reactions
--     FOR SELECT TO authenticated USING (true);
--   -- comments
--   DROP TABLE IF EXISTS public.activity_feed_comments;
--   DROP FUNCTION IF EXISTS public.can_see_activity(UUID);
--   -- reports allowlist (fails if any activity_comment report already exists; delete those first)
--   ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_target_type_check;
--   ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_target_type_check
--     CHECK (target_type IN ('post', 'response', 'profile', 'username'));
--   -- then re-apply migrations/027_report_content_dedupe.sql's report_content body verbatim.

BEGIN;

-- ── The visibility helper ───────────────────────────────────────────────────
-- Mirrors can_see_trip_content()'s exact shape (042:56-69), wrapping the rule
-- activity_feed's own SELECT policy has enforced since migration 013.

CREATE OR REPLACE FUNCTION public.can_see_activity(p_activity_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM activity_feed af
     WHERE af.id = p_activity_id
       AND (af.actor_id = auth.uid() OR public.are_friends(af.actor_id))
  );
$$;

REVOKE ALL ON FUNCTION public.can_see_activity(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_see_activity(UUID) TO authenticated;

-- ── Comments ────────────────────────────────────────────────────────────────
-- Same shape as trip_comments, scoped to activity_feed instead of ski_trips.
-- user_id references auth.users(id), matching activity_feed.actor_id exactly, so
-- PostgREST resolves a `profiles:user_id(...)` embed the same way it already
-- resolves `profiles:actor_id(...)` on activity_feed (profiles.id is itself a
-- one-to-one FK onto auth.users(id)).

CREATE TABLE IF NOT EXISTS public.activity_feed_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID REFERENCES public.activity_feed(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_feed_comments_activity
  ON public.activity_feed_comments (activity_id);

-- NOT optional, and NOT inherited: this is a brand-new table, and Supabase grants
-- `authenticated` full DML on new public-schema tables by default. Without this line the
-- three policies below are inert and every logged-in user could read, write and delete
-- any comment. Migrations 013:17 and 013:49 carry the same line for the same reason.
ALTER TABLE public.activity_feed_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_feed_comments_select ON public.activity_feed_comments;
CREATE POLICY activity_feed_comments_select ON public.activity_feed_comments
  FOR SELECT TO authenticated USING (public.can_see_activity(activity_id));

-- Posting needs the same standing as reading -- the lesson migration 042 already
-- recorded for trip_comments ("It was only 'the row is mine', so an outsider could write
-- into any trip's conversation"). A stranger who somehow obtains an activity_id must not
-- be able to comment on an activity they cannot see.
DROP POLICY IF EXISTS activity_feed_comments_insert ON public.activity_feed_comments;
CREATE POLICY activity_feed_comments_insert ON public.activity_feed_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_see_activity(activity_id));

DROP POLICY IF EXISTS activity_feed_comments_delete ON public.activity_feed_comments;
CREATE POLICY activity_feed_comments_delete ON public.activity_feed_comments
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── The reactions read hole ─────────────────────────────────────────────────
-- Only the open SELECT is replaced. "Users manage own activity reaction" is FOR ALL
-- scoped to user_id = auth.uid() and is deliberately left alone: it already prevents
-- writing someone else's reaction, and because permissive policies OR together, its
-- USING clause keeps a user able to read their OWN reaction row even on an activity that
-- has since become invisible to them -- which is what addActivityReaction's
-- select-then-upsert round trip depends on.
--
-- Reactions' INSERT is deliberately NOT given a can_see_activity check. Unlike a comment,
-- a reaction on an activity you cannot read discloses nothing and displays nowhere; adding
-- the check would widen this fix past what is actually broken.

DROP POLICY IF EXISTS "Auth users view activity reactions" ON public.activity_feed_reactions;
DROP POLICY IF EXISTS activity_feed_reactions_select ON public.activity_feed_reactions;
CREATE POLICY activity_feed_reactions_select ON public.activity_feed_reactions
  FOR SELECT TO authenticated USING (public.can_see_activity(activity_id));

-- ── Reportable comments ─────────────────────────────────────────────────────
-- See "WHY content_reports IS TOUCHED HERE" above. Nothing in src/ reads
-- content_reports.target_type, so widening the allowlist breaks no consumer.

ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_target_type_check;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_target_type_check
  CHECK (target_type IN ('post', 'response', 'profile', 'username', 'activity_comment'));

-- Migration 027's body verbatim, with 'activity_comment' added to the guard. The
-- ON CONFLICT dedupe (027:25) and the empty-reason guard (027:19-21) are unchanged.
CREATE OR REPLACE FUNCTION public.report_content(p_target_type TEXT, p_target_id UUID, p_reason TEXT)
RETURNS content_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row content_reports;
  v_reason TEXT;
BEGIN
  IF p_target_type NOT IN ('post', 'response', 'profile', 'username', 'activity_comment') THEN
    RAISE EXCEPTION 'INVALID_TARGET_TYPE:%', p_target_type;
  END IF;

  v_reason := trim(coalesce(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'EMPTY_REASON';
  END IF;

  INSERT INTO content_reports (reporter_id, target_type, target_id, reason)
  VALUES (auth.uid(), p_target_type, p_target_id, v_reason)
  ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    SELECT * INTO v_row FROM content_reports
    WHERE reporter_id = auth.uid() AND target_type = p_target_type AND target_id = p_target_id;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.report_content(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_content(TEXT, UUID, TEXT) TO authenticated;

COMMIT;
