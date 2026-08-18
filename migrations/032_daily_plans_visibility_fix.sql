-- Migration 032: repair daily_plans friend visibility (Sprint 34)
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS: the "friends can read visible friend plans" policy tests
-- membership in public.friendships. That table has 0 rows — the app has always
-- written friendships to public.friend_requests (4 accepted rows today). The
-- policy therefore never matches, so no user can read any other user's plan.
-- This is the same bug supabase/migrations/20260515_ski_sessions_rls_fix.sql
-- fixed on ski_sessions; daily_plans was missed.
--
-- Two shipped features are silently degraded by it right now:
--   * TodaysCrew.jsx never shows a friend (its client-side friend filter runs
--     over rows RLS already stripped).
--   * getFriendsLeaderboard (socialApi.js) reports daysOnMountain: 0 for every
--     friend because its daily_plans query comes back empty.
--
-- The "group members can read group plans" policy is dead the same way:
-- public.groups and public.group_members both have 0 rows and no code path.
-- The app uses crews/crew_members (4 and 6 rows). Dropped here.
--
-- Sprint 34 adds a crew read path deliberately: a crew can contain someone you
-- have not friended, and without it the Crew calendar view would silently drop
-- those members with no explanation to the user.
--
-- Both helpers are SECURITY DEFINER rather than inline EXISTS clauses. Migration
-- 022 exists because referencing another RLS-protected relation directly inside
-- a policy expression breaks reads for everyone — Postgres checks privileges on
-- every referenced relation at plan time.
--
-- KNOWN GAP: daily_plans.group_id and the 'groups' value in the visibility CHECK
-- are left in place (non-destructive). group_id now points at a dead table. Note
-- the policy below keys off `visibility <> 'private'`, so a row saved as
-- visibility='groups' is readable by ALL friends and active crewmates, not by
-- that group — it is not owner-only. Nothing in the app writes 'groups' (the UI
-- offers only friends/private) and no live row uses it. Tracked as
-- ROADMAP.md TASK 18.1.
--
-- KNOWN GAP: daily_plans still has no CREATE TABLE migration — it predates
-- migrations/001. This file does not attempt to backfill one.
--
-- ROLLBACK, if anything breaks:
--   DROP POLICY IF EXISTS daily_plans_select_visible ON daily_plans;
--   CREATE POLICY "friends can read visible friend plans" ON daily_plans
--     FOR SELECT TO authenticated
--     USING (visibility = 'friends' AND EXISTS (
--       SELECT 1 FROM friendships f WHERE f.status = 'accepted'
--         AND ((f.requester_id = auth.uid() AND f.addressee_id = daily_plans.user_id)
--          OR  (f.addressee_id = auth.uid() AND f.requester_id = daily_plans.user_id))));
--   ALTER TABLE daily_plans ALTER COLUMN status SET DEFAULT 'planning';

-- ── Relationship helpers ────────────────────────────────────────────────────
--
-- Both are STABLE, not the default VOLATILE: a VOLATILE function cannot be
-- inlined and is re-executed for every candidate row inside the RLS qual, which
-- would defeat the daily_plans_date_range index on the month-range scans the
-- ski plan calendar issues. STABLE is correct here — neither writes, and both
-- read only within-statement-consistent data.

-- Accepted friendship in either direction. Reads friend_requests, which is what
-- the app actually writes (sendFriendRequest/respondToFriendRequest).
CREATE OR REPLACE FUNCTION public.are_friends(p_other UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM friend_requests
    WHERE status = 'accepted'
      AND ((requester_id = auth.uid() AND recipient_id = p_other)
        OR (recipient_id = auth.uid() AND requester_id = p_other))
  );
$$;

-- Shared crew membership. Both sides must be status='active' — crew_members
-- allows 'pending' (an unaccepted invite), and a pending invitee must NOT get
-- read access to anyone's plans.
CREATE OR REPLACE FUNCTION public.shares_crew_with(p_other UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM crew_members me
    JOIN crew_members them ON them.crew_id = me.crew_id
    WHERE me.user_id = auth.uid() AND me.status = 'active'
      AND them.user_id = p_other AND them.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.are_friends(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.are_friends(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.shares_crew_with(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shares_crew_with(UUID) TO authenticated;

-- ── Policies ────────────────────────────────────────────────────────────────
-- DROP + CREATE, not the guarded IF NOT EXISTS block: per migration 021 the
-- guarded form would silently skip and leave the broken policy in place.

DROP POLICY IF EXISTS "friends can read visible friend plans" ON daily_plans;
DROP POLICY IF EXISTS "group members can read group plans" ON daily_plans;
DROP POLICY IF EXISTS daily_plans_select_visible ON daily_plans;

CREATE POLICY daily_plans_select_visible ON daily_plans
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      visibility <> 'private'
      AND (public.are_friends(user_id) OR public.shares_crew_with(user_id))
    )
  );

-- ── Column default ──────────────────────────────────────────────────────────
-- The existing default 'planning' violates daily_plans_status_check, which only
-- allows planned|driving|arrived. Any INSERT omitting status fails today.

ALTER TABLE daily_plans ALTER COLUMN status SET DEFAULT 'planned';

-- ── Index ───────────────────────────────────────────────────────────────────
-- Supports the calendar's month-range scan (getVisiblePlansInRange).

CREATE INDEX IF NOT EXISTS daily_plans_date_range ON daily_plans (ski_date, user_id);
