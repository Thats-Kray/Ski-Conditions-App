-- Migration 046: ski day details — title, photos, friend tags
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS
--
-- Feed slice C1 (ROADMAP.md TASK 22.0) lets a user title a ski day, attach photos to
-- it, and tag the friends they skied with — from all three places a day is created or
-- edited today (LogDayModal, SessionRecapModal, SessionEditForm) — and renders all
-- three on the Feed's ski_session cards.
--
-- WHY JOIN TABLES AND NOT ARRAY COLUMNS
--
-- Migration 037's own rationale for plan_parties (vs. a column on daily_plans) applies
-- unchanged. ski_sessions already has five independent writers — the arrival trigger,
-- logSkiDay()'s upsert, GPS session start, GPS session end (flushSessionToSupabase),
-- and the Strava sync — and logSkiDay() in particular does an UPSERT on
-- (user_id, session_date, resort_name). An array column on ski_sessions would be
-- silently nulled by any writer that does not know about it. A join table sidesteps
-- that whole class of bug. `title` is a scalar the user types once, so it is a plain
-- column; photos and tags are sets that other writers must not be able to clobber.
--
-- THE VISIBILITY RULE. Everything hanging off a ski day is visible to exactly whoever
-- can see the day: the owner, or a friend of the owner. Tagged people additionally see
-- their own tag rows, so a tag is never invisible to its subject.
--
-- WHY TWO SECURITY DEFINER HELPERS
--
-- No policy here reads ski_sessions inline. That is the mistake migration 041 nearly
-- shipped and that 20260515_crew_rls_fix.sql and 022 exist to undo. Both helpers are
-- SECURITY DEFINER so the read happens outside the policy evaluator, and STABLE so
-- they inline and do not re-execute per candidate row (032:52-57). This is
-- can_see_activity()'s exact shape from migration 045, one table over.
--
-- WHY are_friends() TAKES ONE ARGUMENT
--
-- are_friends(p_other) is ALWAYS relative to auth.uid() (032:61-70). There is no
-- two-argument form; calling one aborts the migration with 42883. So the tag INSERT
-- policy below expresses "the OWNER and the tagged user are friends" by first pinning
-- the caller to both roles:
--
--   tagged_by = auth.uid()                  the caller is the tagger
--   owns_ski_session(session_id)            the caller owns this specific session
--   are_friends(tagged_user_id)             the caller and the tagged user are friends
--
-- All three are load-bearing. Drop the first and A could write a row claiming B did
-- the tagging. Drop the second and anyone could tag people onto someone else's day.
-- Drop the third and a stranger could be tagged onto your day. Only with all three
-- does are_friends(tagged_user_id) mean what the design intended.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--
-- ski_sessions carries a live SELECT policy, "authenticated users can view all
-- sessions", with qual (auth.uid() IS NOT NULL) — every logged-in user can already
-- read every session row. That is the same USING (true) class migration 045 closed on
-- activity_feed_reactions, but closing it here would change what the leaderboard,
-- getMySessions, the trip backfill and the arrival trigger can read. It is a separate
-- slice. The two new tables are deliberately STRICTER than the table they hang off.
--
-- Also not here, by design: no notifications row on tag (tagging is silent), no photo
-- caption column, no lightbox-supporting metadata (width/height/thumbnail path).
--
-- ROLLBACK, if anything breaks:
--   DROP TABLE IF EXISTS public.ski_session_tags;
--   DROP TABLE IF EXISTS public.ski_session_photos;
--   DROP FUNCTION IF EXISTS public.can_see_ski_session(UUID);
--   DROP FUNCTION IF EXISTS public.owns_ski_session(UUID);
--   ALTER TABLE public.ski_sessions DROP CONSTRAINT IF EXISTS ski_sessions_title_length;
--   ALTER TABLE public.ski_sessions DROP COLUMN IF EXISTS title;
--   DROP POLICY IF EXISTS "Authenticated users can upload ski day media" ON storage.objects;
--   DROP POLICY IF EXISTS "Ski day media is publicly readable" ON storage.objects;
--   DROP POLICY IF EXISTS "Users can delete their own ski day media" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'ski-day-media';

BEGIN;

-- ── The title column ────────────────────────────────────────────────────────
-- Nullable with no default: every one of the 112 existing rows keeps reading NULL,
-- and the Feed's title line is simply absent for them. The CHECK mirrors the 60-char
-- client cap so a raw supabase-js call cannot exceed it either. notes is left alone
-- and is NOT backfilled into title — it holds mixed-intent private free text that a
-- blind copy would publish to the Feed.

ALTER TABLE public.ski_sessions ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE public.ski_sessions DROP CONSTRAINT IF EXISTS ski_sessions_title_length;
ALTER TABLE public.ski_sessions ADD CONSTRAINT ski_sessions_title_length
  CHECK (title IS NULL OR char_length(title) <= 60);

-- ── The two visibility helpers ──────────────────────────────────────────────
-- Same shape as can_see_activity() (045), which is itself modelled on
-- can_see_trip_content() (042:56-69).

CREATE OR REPLACE FUNCTION public.owns_ski_session(p_session_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM ski_sessions s
     WHERE s.id = p_session_id
       AND s.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.owns_ski_session(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_ski_session(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_see_ski_session(p_session_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM ski_sessions s
     WHERE s.id = p_session_id
       AND (s.user_id = auth.uid() OR public.are_friends(s.user_id))
  );
$$;

REVOKE ALL ON FUNCTION public.can_see_ski_session(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_see_ski_session(UUID) TO authenticated;

-- ── Photos ──────────────────────────────────────────────────────────────────
-- storage_path, not a URL: public URLs are resolved at read time with
-- getPublicUrl(), the same way trip_media does it (socialApi.js:3420), so the bucket
-- can be renamed or fronted by a CDN without rewriting
-- rows. user_id is redundant with the session's owner today (only the owner can
-- insert) but is kept because it is what the storage self-delete policy's folder
-- convention is keyed on, and it makes an orphaned row traceable.

CREATE TABLE IF NOT EXISTS public.ski_session_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID REFERENCES public.ski_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  storage_path TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ski_session_photos_session
  ON public.ski_session_photos (session_id);

-- NOT optional, and NOT inherited: this is a brand-new table, and Supabase grants
-- `authenticated` full DML on new public-schema tables by default. A table with
-- policies but RLS disabled ignores those policies entirely. Migration 045 shipped
-- this line for the same reason after it was nearly omitted.
ALTER TABLE public.ski_session_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ski_session_photos_select ON public.ski_session_photos;
CREATE POLICY ski_session_photos_select ON public.ski_session_photos
  FOR SELECT TO authenticated USING (public.can_see_ski_session(session_id));

-- Both conjuncts matter: the first stops A writing a row attributed to B, the second
-- stops anyone attaching photos to a day they do not own.
DROP POLICY IF EXISTS ski_session_photos_insert ON public.ski_session_photos;
CREATE POLICY ski_session_photos_insert ON public.ski_session_photos
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.owns_ski_session(session_id));

DROP POLICY IF EXISTS ski_session_photos_delete ON public.ski_session_photos;
CREATE POLICY ski_session_photos_delete ON public.ski_session_photos
  FOR DELETE TO authenticated USING (public.owns_ski_session(session_id));

-- ── Tags ────────────────────────────────────────────────────────────────────
-- UNIQUE (session_id, tagged_user_id) makes re-tagging the same person idempotent
-- rather than an error the UI has to dedupe. tagged_by is kept even though it always
-- equals the session owner under the INSERT policy below: it is the audit trail if
-- that policy ever widens, and it costs one uuid per row.

CREATE TABLE IF NOT EXISTS public.ski_session_tags (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID REFERENCES public.ski_sessions(id) ON DELETE CASCADE NOT NULL,
  tagged_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tagged_by      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, tagged_user_id)
);

CREATE INDEX IF NOT EXISTS ski_session_tags_session
  ON public.ski_session_tags (session_id);

-- Feed-C2 will query "sessions I am tagged in" for the next-login nudge; this index
-- is the one that query needs, and it costs nothing to create now.
CREATE INDEX IF NOT EXISTS ski_session_tags_tagged_user
  ON public.ski_session_tags (tagged_user_id);

ALTER TABLE public.ski_session_tags ENABLE ROW LEVEL SECURITY;

-- The tagged person sees their own tag even if they are not (or are no longer) a
-- friend of the owner — a tag must never be invisible to its subject, or the
-- self-untag below would be unreachable.
DROP POLICY IF EXISTS ski_session_tags_select ON public.ski_session_tags;
CREATE POLICY ski_session_tags_select ON public.ski_session_tags
  FOR SELECT TO authenticated
  USING (public.can_see_ski_session(session_id) OR tagged_user_id = auth.uid());

-- Three conjuncts, all load-bearing. See "WHY are_friends() TAKES ONE ARGUMENT" above.
DROP POLICY IF EXISTS ski_session_tags_insert ON public.ski_session_tags;
CREATE POLICY ski_session_tags_insert ON public.ski_session_tags
  FOR INSERT TO authenticated
  WITH CHECK (
    tagged_by = auth.uid()
    AND public.owns_ski_session(session_id)
    AND public.are_friends(tagged_user_id)
  );

-- Owner removes a tag, or the tagged person removes themselves. One-way tagging with
-- no confirmation step is only acceptable because self-untag exists.
DROP POLICY IF EXISTS ski_session_tags_delete ON public.ski_session_tags;
CREATE POLICY ski_session_tags_delete ON public.ski_session_tags
  FOR DELETE TO authenticated
  USING (public.owns_ski_session(session_id) OR tagged_user_id = auth.uid());

-- ── Storage ─────────────────────────────────────────────────────────────────
-- Bucket created IN this migration, matching 044_crew_photos.sql and
-- 20260519_chat_media.sql. trip-media's bucket was a manual step outside its
-- migration, which is why a fresh environment cannot reproduce it; that gap is not
-- repeated here.
--
-- Path convention is `${user_id}/${session_id}/${timestamp}.${ext}` — USER ID FIRST,
-- so the self-delete policy's folder index is [1], matching chat-media exactly.
-- (trip-media uses `${trip_id}/${user_id}/…`, so its user id would be [2]. Do not
-- copy that one.)

INSERT INTO storage.buckets (id, name, public)
VALUES ('ski-day-media', 'ski-day-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload ski day media" ON storage.objects;
CREATE POLICY "Authenticated users can upload ski day media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'ski-day-media');

DROP POLICY IF EXISTS "Ski day media is publicly readable" ON storage.objects;
CREATE POLICY "Ski day media is publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'ski-day-media');

DROP POLICY IF EXISTS "Users can delete their own ski day media" ON storage.objects;
CREATE POLICY "Users can delete their own ski day media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'ski-day-media' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;
