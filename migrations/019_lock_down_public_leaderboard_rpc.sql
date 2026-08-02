-- Migration 019: Revoke unauthenticated access to get_leaderboard
-- Run in Supabase SQL Editor.
--
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, and migration 011's
-- `grant execute ... to authenticated` is additive — it never revoked that
-- default. Since get_leaderboard's `p_mode = 'public'` branch has no
-- auth.uid() check, this meant anyone holding the project's anon key could
-- call `/rest/v1/rpc/get_leaderboard` directly (no login required) and get
-- every user's full_name/avatar_url/skill_level plus their season stats.
--
-- Revoking from PUBLIC removes the implicit grant that the `anon` role was
-- relying on. The `authenticated` role keeps its own explicit grant from
-- migration 011, so this changes nothing for real, logged-in app users —
-- PostgREST already sends every real call as `authenticated`.
REVOKE EXECUTE ON FUNCTION public.get_leaderboard(int, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard(int, text) FROM anon;
