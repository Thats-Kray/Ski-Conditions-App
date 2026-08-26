-- Migration 040: trips are join-by-invite-or-approval, and stop being world-readable
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS
--
-- Kyle, 2026-08-25: "I can also join User 2's ski trip plan, even though I was not invited."
--
-- Two separate problems sat behind that one sentence.
--
-- 1. THE PRODUCT RULE. Joining a friend's trip uninvited now needs the host's approval, the
--    same rule already chosen for plan parties (migrations 037/038). Friends still SEE each
--    other's trips — getAllVisibleTrips deliberately builds a "discover" list of friends'
--    trips and that stays — but seeing is not joining.
--
-- 2. THE HOLE, which was much wider than the report. RLS enforced nothing at all:
--      trip_rsvps  ALL     USING (user_id = auth.uid())   -- ANY user, ANY trip, no checks
--      ski_trips   SELECT  USING (true)                   -- every trip in the database
--      trip_invites SELECT USING (true)                   -- every invite in the database
--    The client scoped its queries to friends; the database did not. A total stranger could
--    RSVP to any trip and read every trip and invite in the app. That part is not a product
--    decision and would need fixing whatever rule was chosen.
--
-- GRANDFATHERING. Four existing RSVPs have no invite, all from friends of the host, dating
-- back to May — that is how the feature has worked in practice. They are left alone. The new
-- restriction is on INSERT only; UPDATE and DELETE stay open to the row's owner, so anyone who
-- already RSVP'd can still change to "maybe" or withdraw. Locking those down too would trap
-- people in trips they could no longer leave.
--
-- WHY REQUESTS REUSE trip_invites RATHER THAN A NEW TABLE
--
-- trip_invites has UNIQUE (trip_id, invitee_id). Modelling a request as "invitee_id = the
-- host" would collide the moment two people asked to join the same trip. So invitee_id stays
-- "the person who would attend" for BOTH kinds, and that unique constraint then means exactly
-- the right thing: one pending membership record per person per trip. A request is simply a
-- row the would-be guest created about themselves.
--
-- ROLLBACK, if anything breaks:
--   DROP POLICY IF EXISTS trip_rsvps_insert_allowed ON trip_rsvps;
--   DROP POLICY IF EXISTS trip_rsvps_update_own ON trip_rsvps;
--   DROP POLICY IF EXISTS trip_rsvps_delete_own ON trip_rsvps;
--   CREATE POLICY "User can manage their own rsvp" ON trip_rsvps FOR ALL TO authenticated
--     USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
--   DROP POLICY IF EXISTS ski_trips_select_visible ON ski_trips;
--   CREATE POLICY "Anyone authenticated can view trips" ON ski_trips FOR SELECT TO authenticated USING (true);
--   DROP POLICY IF EXISTS trip_invites_select_involved ON trip_invites;
--   CREATE POLICY "Auth users view invites" ON trip_invites FOR SELECT TO authenticated USING (true);
--   DROP FUNCTION IF EXISTS public.approve_trip_request(UUID);
--   DROP FUNCTION IF EXISTS public.may_join_trip(UUID);
--   DROP FUNCTION IF EXISTS public.is_trip_participant(UUID);
--   DROP FUNCTION IF EXISTS public.is_trip_host(UUID);

BEGIN;

ALTER TABLE public.trip_invites
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'invite';

ALTER TABLE public.trip_invites DROP CONSTRAINT IF EXISTS trip_invites_kind_check;
ALTER TABLE public.trip_invites ADD CONSTRAINT trip_invites_kind_check
  CHECK (kind IN ('invite','request'));

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- STABLE + SECURITY DEFINER + SET search_path, per migration 032's notes: VOLATILE cannot be
-- inlined and re-runs per candidate row, and a policy must never read an RLS-protected
-- relation inline (the recursion class 20260515_crew_rls_fix.sql and 022 exist to undo).

CREATE OR REPLACE FUNCTION public.is_trip_host(p_trip_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM ski_trips WHERE id = p_trip_id AND host_id = auth.uid());
$$;

-- Already involved: RSVP'd, invited, or has asked to join.
CREATE OR REPLACE FUNCTION public.is_trip_participant(p_trip_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM trip_rsvps   WHERE trip_id = p_trip_id AND user_id   = auth.uid())
      OR EXISTS (SELECT 1 FROM trip_invites WHERE trip_id = p_trip_id AND invitee_id = auth.uid());
$$;

-- May I put myself on this trip's guest list?
-- The host always may. Everyone else needs an invite, or a request the host accepted.
CREATE OR REPLACE FUNCTION public.may_join_trip(p_trip_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM ski_trips WHERE id = p_trip_id AND host_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM trip_invites
         WHERE trip_id = p_trip_id
           AND invitee_id = auth.uid()
           AND (kind = 'invite' OR status = 'accepted')
      );
$$;

REVOKE ALL ON FUNCTION public.is_trip_host(UUID)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_trip_participant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.may_join_trip(UUID)       FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_trip_host(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trip_participant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.may_join_trip(UUID)       TO authenticated;

-- ── Approving a request ─────────────────────────────────────────────────────
-- The host is the caller but the requester is the one who needs the RSVP, so this cannot be a
-- policy — the same asymmetry that made accept_plan_party() necessary in migration 038.

CREATE OR REPLACE FUNCTION public.approve_trip_request(p_invite_id UUID)
RETURNS public.trip_rsvps
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv  trip_invites;
  v_trip ski_trips;
  v_row  trip_rsvps;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT * INTO v_inv FROM trip_invites WHERE id = p_invite_id;
  IF v_inv IS NULL THEN
    RAISE EXCEPTION 'No such request';
  END IF;
  IF v_inv.kind <> 'request' THEN
    RAISE EXCEPTION 'That is an invitation, not a join request';
  END IF;

  SELECT * INTO v_trip FROM ski_trips WHERE id = v_inv.trip_id;
  IF v_trip.host_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the trip host can approve join requests';
  END IF;

  UPDATE trip_invites SET status = 'accepted' WHERE id = p_invite_id;

  INSERT INTO trip_rsvps (trip_id, user_id, status)
  VALUES (v_inv.trip_id, v_inv.invitee_id, 'going')
  ON CONFLICT (trip_id, user_id) DO UPDATE SET status = 'going'
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_trip_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_trip_request(UUID) TO authenticated;

-- ── RLS: trip_rsvps ─────────────────────────────────────────────────────────
-- Unguarded DROP + CREATE, not the DO/IF NOT EXISTS form — per migration 021 the guarded form
-- silently skips and leaves the broken policy in place.

DROP POLICY IF EXISTS "User can manage their own rsvp" ON public.trip_rsvps;
DROP POLICY IF EXISTS trip_rsvps_insert_allowed ON public.trip_rsvps;
DROP POLICY IF EXISTS trip_rsvps_update_own     ON public.trip_rsvps;
DROP POLICY IF EXISTS trip_rsvps_delete_own     ON public.trip_rsvps;

CREATE POLICY trip_rsvps_insert_allowed ON public.trip_rsvps
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.may_join_trip(trip_id));

-- Deliberately NOT gated on may_join_trip: the four pre-existing uninvited RSVPs must stay
-- editable, and nobody should ever be unable to leave a trip.
CREATE POLICY trip_rsvps_update_own ON public.trip_rsvps
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY trip_rsvps_delete_own ON public.trip_rsvps
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── RLS: ski_trips ──────────────────────────────────────────────────────────
-- Was USING (true). Friends-of-host keeps the discover list working; participants covers an
-- invite from someone you have not friended yet.

DROP POLICY IF EXISTS "Anyone authenticated can view trips" ON public.ski_trips;
DROP POLICY IF EXISTS ski_trips_select_visible ON public.ski_trips;

CREATE POLICY ski_trips_select_visible ON public.ski_trips
  FOR SELECT TO authenticated
  USING (
    host_id = auth.uid()
    OR public.are_friends(host_id)
    OR public.is_trip_participant(id)
  );

-- ── RLS: trip_invites ───────────────────────────────────────────────────────
-- Was USING (true) — every invite in the database. The host needs to see requests aimed at
-- their trips, which is why is_trip_host is in the read path and not just inviter/invitee.

DROP POLICY IF EXISTS "Auth users view invites" ON public.trip_invites;
DROP POLICY IF EXISTS trip_invites_select_involved ON public.trip_invites;

CREATE POLICY trip_invites_select_involved ON public.trip_invites
  FOR SELECT TO authenticated
  USING (
    inviter_id = auth.uid()
    OR invitee_id = auth.uid()
    OR public.is_trip_host(trip_id)
  );

-- A request is a row you create about yourself; an invite is one you create about someone
-- else. Both require inviter_id to be you, so nobody can forge an invite in another
-- user's name.
DROP POLICY IF EXISTS "Inviter can insert invites" ON public.trip_invites;
DROP POLICY IF EXISTS trip_invites_insert_own ON public.trip_invites;

CREATE POLICY trip_invites_insert_own ON public.trip_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    inviter_id = auth.uid()
    AND (kind = 'invite' OR invitee_id = auth.uid())
  );

-- The invitee answers an invitation; the host answers a request.
DROP POLICY IF EXISTS "Invitee can update status" ON public.trip_invites;
DROP POLICY IF EXISTS trip_invites_update_involved ON public.trip_invites;

CREATE POLICY trip_invites_update_involved ON public.trip_invites
  FOR UPDATE TO authenticated
  USING (invitee_id = auth.uid() OR public.is_trip_host(trip_id));

COMMIT;
