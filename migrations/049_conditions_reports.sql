-- Migration 049: crowdsourced conditions reports — snow quality, crowd level, comment
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THESE ARE PLAIN COLUMNS, NOT A NEW TABLE
--
-- ski_sessions already carries a live SELECT policy readable by ANY authenticated user —
-- "authenticated users can view all sessions" USING (auth.uid() IS NOT NULL) — deliberately
-- left open rather than tightened (migration 046's header comment documents this: Leaderboard,
-- Feed, trip-backfill, and the arrival trigger all depend on it reading broadly). `title`
-- already lives as a plain column on this same table for exactly this reason: a scalar the
-- user types once, at the same three entry points (LogDayModal, SessionRecapModal,
-- SessionEditForm) these three columns go through. A new table would mean re-deriving RLS and a
-- SECURITY DEFINER helper for visibility this table already grants today.
--
-- ROLLBACK, if anything breaks:
--   ALTER TABLE public.ski_sessions DROP CONSTRAINT IF EXISTS ski_sessions_snow_quality_check;
--   ALTER TABLE public.ski_sessions DROP CONSTRAINT IF EXISTS ski_sessions_crowd_level_check;
--   ALTER TABLE public.ski_sessions DROP CONSTRAINT IF EXISTS ski_sessions_conditions_comment_length;
--   ALTER TABLE public.ski_sessions DROP COLUMN IF EXISTS snow_quality;
--   ALTER TABLE public.ski_sessions DROP COLUMN IF EXISTS crowd_level;
--   ALTER TABLE public.ski_sessions DROP COLUMN IF EXISTS conditions_comment;

BEGIN;

ALTER TABLE public.ski_sessions
  ADD COLUMN IF NOT EXISTS snow_quality TEXT,
  ADD COLUMN IF NOT EXISTS crowd_level TEXT,
  ADD COLUMN IF NOT EXISTS conditions_comment TEXT;

ALTER TABLE public.ski_sessions
  ADD CONSTRAINT ski_sessions_snow_quality_check
    CHECK (snow_quality IS NULL OR snow_quality IN ('powder','groomed','icy','slushy'));

ALTER TABLE public.ski_sessions
  ADD CONSTRAINT ski_sessions_crowd_level_check
    CHECK (crowd_level IS NULL OR crowd_level IN ('empty','light','moderate','packed'));

ALTER TABLE public.ski_sessions
  ADD CONSTRAINT ski_sessions_conditions_comment_length
    CHECK (conditions_comment IS NULL OR char_length(conditions_comment) <= 140);

COMMIT;
