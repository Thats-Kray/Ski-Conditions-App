-- Migration 034: require consent to join a crew (Sprint 34, TASK 18.3)
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS: crew membership was self-serve.
--
--   "crew members can insert members"
--     WITH CHECK ((user_id = auth.uid()) OR (my_crew_role(crew_id) IS NOT NULL))
--
-- The first branch checks only that you are inserting yourself — it says nothing
-- about the crew. Any signed-in user could INSERT themselves into ANY crew_id,
-- and crew_members.status DEFAULTs to 'active', so the row was live immediately
-- (not pending). Via public.shares_crew_with() that granted read access to every
-- member's daily_plans — which mountain, which day, ETA.
--
-- Second path: "members can update own row" pins only user_id, so a member of
-- one crew could rewrite their row's crew_id to any other crew, or set
-- role='admin' to gain moderation powers. WITH CHECK cannot see the pre-update
-- row, so it could not tell the crew or role had changed.
--
-- This is the companion to migration 033 (friend_requests). Same shape: a
-- consent-bearing table whose INSERT policy constrained who you claim to be but
-- not what you were claiming. 033 closed the friendship path; this closes the
-- crew path. Both feed the daily_plans read policy added in 032.
--
-- WHY THE PERMISSIVE BRANCH EXISTED: crew creation. createCrew() inserted the
-- crews row client-side and then inserted its own membership row — at which
-- point my_crew_role() is NULL, since no member exists yet. Removing the branch
-- without replacing that bootstrap would break crew creation entirely. Hence the
-- SECURITY DEFINER RPC below, which does both writes atomically.
--
-- BEHAVIOUR CHANGE, deliberate: createCrew(memberIds) used to insert the invited
-- members with the 'active' default, i.e. it force-joined people to a crew with
-- no invitation. They are now inserted as 'pending', matching what
-- inviteToCrewGroup() has always done and what getPendingCrewInvites()/the
-- invites UI already expect. Invitees now see a normal crew invite to accept.
--
-- APP CHANGE THIS DEPENDS ON: socialApi.createCrew() must call the new
-- public.create_crew() RPC instead of writing crews/crew_members directly.
-- Deploy the frontend first, or crew creation will fail against the new policy.
--
-- ROLLBACK, if anything breaks:
--   DROP POLICY IF EXISTS "crew members can insert members" ON crew_members;
--   CREATE POLICY "crew members can insert members" ON crew_members
--     FOR INSERT TO public
--     WITH CHECK ((user_id = auth.uid()) OR (my_crew_role(crew_id) IS NOT NULL));
--   GRANT UPDATE ON crew_members TO authenticated;
--   DROP FUNCTION IF EXISTS public.create_crew(TEXT, TEXT, TEXT, BOOLEAN, UUID[]);

-- ── Crew creation RPC ───────────────────────────────────────────────────────
-- SECURITY DEFINER so it can write the creator's own bootstrap membership row,
-- which the tightened INSERT policy below no longer permits from the client.

CREATE OR REPLACE FUNCTION public.create_crew(
  p_name        TEXT,
  p_emoji       TEXT DEFAULT '⛷️',
  p_description TEXT DEFAULT '',
  p_invite_only BOOLEAN DEFAULT true,
  p_member_ids  UUID[] DEFAULT '{}'
)
RETURNS crews
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_crew crews;
  v_name TEXT := NULLIF(btrim(p_name), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'CREW_NAME_REQUIRED';
  END IF;

  INSERT INTO crews (name, emoji, description, created_by, invite_only)
  VALUES (v_name, COALESCE(p_emoji, '⛷️'), COALESCE(p_description, ''), auth.uid(), COALESCE(p_invite_only, true))
  RETURNING * INTO v_crew;

  -- Creator is active immediately; they are the one consenting.
  INSERT INTO crew_members (crew_id, user_id, role, status)
  VALUES (v_crew.id, auth.uid(), 'admin', 'active');

  -- Everyone else is invited, not conscripted. Self-invite is ignored so the
  -- creator's admin row above is never downgraded to pending.
  IF p_member_ids IS NOT NULL AND array_length(p_member_ids, 1) > 0 THEN
    INSERT INTO crew_members (crew_id, user_id, role, status)
    SELECT v_crew.id, m, 'member', 'pending'
    FROM unnest(p_member_ids) AS m
    WHERE m <> auth.uid()
    ON CONFLICT (crew_id, user_id) DO NOTHING;
  END IF;

  RETURN v_crew;
END; $$;

REVOKE ALL ON FUNCTION public.create_crew(TEXT, TEXT, TEXT, BOOLEAN, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_crew(TEXT, TEXT, TEXT, BOOLEAN, UUID[]) TO authenticated;

-- ── INSERT: only existing active members may add people ─────────────────────
-- DROP + CREATE, not the guarded IF NOT EXISTS block: per migration 021 the
-- guarded form would silently skip and leave the permissive policy in place.

DROP POLICY IF EXISTS "crew members can insert members" ON crew_members;

CREATE POLICY "crew members can insert members" ON crew_members
  FOR INSERT TO authenticated
  WITH CHECK (public.my_crew_role(crew_id) IS NOT NULL);

-- ── Column-scoped UPDATE grant ──────────────────────────────────────────────
-- RLS restricts rows, not columns. acceptCrewInvite() is the only writer and it
-- only sets status, so scoping to that column keeps the accept-invite flow
-- working while making crew_id (join any crew) and role (self-promote to admin)
-- unwritable from the client.

REVOKE UPDATE ON crew_members FROM authenticated;
GRANT UPDATE (status) ON crew_members TO authenticated;
