-- Migration 031: actually close the Strava token exposure (Sprint 33 follow-up)
--
-- WHY THIS EXISTS: migration 030's column-level REVOKE was a silent no-op.
-- `authenticated` and `anon` hold TABLE-level SELECT on public.profiles, and in
-- Postgres a column-level REVOKE cannot subtract from a table-level grant — the
-- table grant keeps conferring SELECT on every column, including any column
-- added later. `apply_migration` reported success because the SQL was valid; it
-- simply had no effect. Verified after the fact via
-- information_schema.role_table_grants.
--
-- CORRECT FORM: drop the table-level SELECT, then grant SELECT on an explicit
-- column list omitting the three Strava OAuth token columns. Both statements are
-- in one migration so `profiles` is never left unreadable between them.
--
-- Columns granted = every current column of public.profiles EXCEPT
-- strava_access_token, strava_refresh_token, strava_token_expires_at.
-- strava_athlete_id is deliberately retained — it is not a secret, and
-- StravaConnect.jsx uses it for connected/disconnected state.
--
-- SAFE TO APPLY NOW: the Sprint 33 frontend (explicit column lists, no
-- select("*") and no bare .select() on profiles) is already live on
-- powdays.app as bundle index-CnsTqoiZ.js.
--
-- Server-side access is unaffected — server/index.js and server/cron.js use
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses these grants entirely. Strava sync,
-- token refresh, disconnect, and cron all continue to work.
--
-- ROLLBACK, if anything breaks:
--   GRANT SELECT ON public.profiles TO authenticated, anon;

REVOKE SELECT ON public.profiles FROM authenticated, anon;

GRANT SELECT (
  id, first_name, last_name, full_name, username, avatar_url,
  skill_level, sport_type, ski_passes, favorite_mountain,
  vehicle_label, vehicle_seats, powder_alerts_enabled, alert_phone,
  theme, is_admin, strava_athlete_id, home_city, primary_pass,
  ride_type, created_at, updated_at
) ON public.profiles TO authenticated, anon;
