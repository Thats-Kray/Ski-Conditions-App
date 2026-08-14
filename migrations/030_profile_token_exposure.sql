-- Migration 030: Close the `profiles` Strava token exposure (Sprint 33)
--
-- ⚠️  DEPLOYMENT ORDERING — READ BEFORE APPLYING ⚠️
-- REVOKE SELECT on a column makes PostgREST `select("*")` THROW, not silently
-- omit, for every remaining caller. This migration must NOT be applied until:
--   1. The Sprint 33 frontend build (explicit column lists replacing every
--      `select("*")` against `profiles` in src/lib/socialApi.js) is merged
--      to main, deployed, and confirmed live on powdays.app.
--   2. Kyle has explicitly approved applying this migration.
-- Applying this migration before the frontend is live breaks `profiles`
-- reads for every signed-in user (getMyProfile, getAcceptedFriends,
-- getReceivedCrewInvites, getSentCrewInvites, and any other unmigrated
-- `select("*")` caller).
--
-- Problem: `profiles` has two RLS SELECT policies, both `USING (true)` for
-- `authenticated`, plus column-level SELECT grants on strava_access_token,
-- strava_refresh_token, strava_token_expires_at. Any signed-in user can read
-- every other user's Strava OAuth credentials (bearer tokens) via
-- `select("*")`. The server-side Strava integration (server/index.js,
-- server/cron.js) uses SUPABASE_SERVICE_ROLE_KEY, which bypasses column
-- grants entirely, so revoking these columns from authenticated/anon cannot
-- break sync, disconnect, refresh, or cron.
--
-- Known residual (deliberately not fixed here — see ROADMAP.md Section 17):
-- alert_phone stays broadcastable to a determined signed-in user who queries
-- it directly (policy stays USING (true), column grant stays). This
-- migration only stops it being broadcast to other users' browsers via the
-- app's own `select("*")` calls, which is closed by the Sprint 33 frontend
-- change, not by this migration.

-- 1. Revoke SELECT on the three Strava OAuth token columns from the roles
--    PostgREST uses for browser requests. Service-role access (server/) is
--    unaffected — it does not go through PostgREST's role-based grants.
REVOKE SELECT (strava_access_token, strava_refresh_token, strava_token_expires_at)
  ON public.profiles
  FROM authenticated, anon;

-- 2. Consolidate duplicate RLS policies. `profiles` currently carries two
--    functionally identical SELECT policies and two functionally identical
--    UPDATE policies (created at different times, never cleaned up). Keep
--    exactly one of each; drop the redundant one. Semantics are unchanged —
--    this is policy consolidation only, no tightening.
DROP POLICY IF EXISTS "profiles are readable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "users can update own profile" ON public.profiles;

-- Surviving policies (unchanged, listed here for reference only):
--   SELECT "Users can view all profiles"      USING (true)
--   UPDATE "Users can update their own profile" USING (auth.uid() = id)
