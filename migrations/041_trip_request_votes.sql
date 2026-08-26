-- Migration 041: crew votes on who joins a trip (Sprint 40)
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS
--
-- Kyle, 2026-08-25: "Instead of saying 'I'm In' the button should say 'Interested' and an
-- approval should be sent to the host... The Host has the final say, but the members can give
-- their approval, and the host will see the crews votes, and determine if that person should
-- be included in the Crew/Plan for that trip."
--
-- Members advise, the host decides. A vote is an input to the host's decision and NEVER an
-- automatic admission — there is deliberately no threshold at which enough yes votes let
-- somebody in by themselves. Admission still goes only through approve_trip_request() from
-- migration 040.
--
-- No new "interested" record is needed: migration 040 already made a trip_invites row with
-- kind='request' mean exactly that. An Interested person IS a pending request. This adds only
-- the endorsements hanging off it.
--
-- WHO MAY VOTE: anyone already on the trip — the host, or a going/maybe RSVP. Explicitly NOT
-- the requester. Voting yourself in is the hole this feature exists to close, so it is blocked
-- in the policy and not only in the UI.
--
-- THE MISTAKE THIS FILE ALMOST SHIPPED WITH, worth keeping as a warning.
--
-- The first version wrote the policies as `EXISTS (SELECT 1 FROM trip_invites ti WHERE ...)`
-- inline. That is the rule this codebase has broken and fixed three times already (see
-- 20260515_crew_rls_fix.sql, 022, and the note at 032:25-28): a policy that reads another
-- RLS-protected relation inline gets that relation's RLS applied too. trip_invites is only
-- visible to its inviter, invitee and host — so a MEMBER voting on a request could not see the
-- request row, the EXISTS came back false, and every member vote was refused. Caught by
-- testing a member vote rather than only testing that strangers were blocked.
--
-- Hence may_vote_on_request() / can_see_request_votes(): SECURITY DEFINER, so the lookup runs
-- without RLS, and the policy calls only the function.
--
-- ALSO WIDENS trip_invites SELECT. 040 scoped it to inviter/invitee/host, which would have
-- left the Interested tab empty for every member who is not the host — they could vote (via
-- the definer function) on rows they could not read. Members can now read requests for trips
-- they are on. Invitations stay private to the people named on them.
--
-- ROLLBACK, if anything breaks:
--   DROP TABLE IF EXISTS trip_request_votes;
--   DROP FUNCTION IF EXISTS public.may_vote_on_request(UUID);
--   DROP FUNCTION IF EXISTS public.can_see_request_votes(UUID);
--   DROP FUNCTION IF EXISTS public.is_trip_member(UUID);
--   DROP POLICY IF EXISTS trip_invites_select_involved ON trip_invites;
--   CREATE POLICY trip_invites_select_involved ON trip_invites FOR SELECT TO authenticated
--     USING (inviter_id = auth.uid() OR invitee_id = auth.uid() OR public.is_trip_host(trip_id));

BEGIN;

CREATE TABLE IF NOT EXISTS public.trip_request_votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.trip_invites(id) ON DELETE CASCADE,
  voter_id   UUID NOT NULL REFERENCES public.profiles(id)     ON DELETE CASCADE,
  vote       TEXT NOT NULL CHECK (vote IN ('yes','no')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, voter_id)          -- one member one vote; changing it is an update
);

CREATE INDEX IF NOT EXISTS trip_request_votes_request ON public.trip_request_votes (request_id);

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- STABLE, not VOLATILE: a VOLATILE function cannot be inlined and re-runs per candidate row
-- inside the qual (032:52-57).

-- On the trip already: hosting it, or going/maybe. "cantgo" is not membership.
CREATE OR REPLACE FUNCTION public.is_trip_member(p_trip_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM ski_trips WHERE id = p_trip_id AND host_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM trip_rsvps
         WHERE trip_id = p_trip_id AND user_id = auth.uid() AND status IN ('going','maybe')
      );
$$;

-- May I cast a vote on this request? On the trip, and not the person asking.
CREATE OR REPLACE FUNCTION public.may_vote_on_request(p_request_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_invites ti
     WHERE ti.id = p_request_id
       AND ti.kind = 'request'
       AND ti.invitee_id <> auth.uid()
       AND public.is_trip_member(ti.trip_id)
  );
$$;

-- May I see the votes? Same, minus the exclusion — the host is usually not voting but must
-- see the tally. The REQUESTER is excluded by is_trip_member: they are not on the trip yet,
-- which is the point. They never see who voted against them.
CREATE OR REPLACE FUNCTION public.can_see_request_votes(p_request_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_invites ti
     WHERE ti.id = p_request_id AND public.is_trip_member(ti.trip_id)
  );
$$;

REVOKE ALL ON FUNCTION public.is_trip_member(UUID)         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.may_vote_on_request(UUID)    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_see_request_votes(UUID)  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_trip_member(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.may_vote_on_request(UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_request_votes(UUID) TO authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.trip_request_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_request_votes_select ON public.trip_request_votes;
CREATE POLICY trip_request_votes_select ON public.trip_request_votes
  FOR SELECT TO authenticated USING (public.can_see_request_votes(request_id));

DROP POLICY IF EXISTS trip_request_votes_insert ON public.trip_request_votes;
CREATE POLICY trip_request_votes_insert ON public.trip_request_votes
  FOR INSERT TO authenticated
  WITH CHECK (voter_id = auth.uid() AND public.may_vote_on_request(request_id));

DROP POLICY IF EXISTS trip_request_votes_update ON public.trip_request_votes;
CREATE POLICY trip_request_votes_update ON public.trip_request_votes
  FOR UPDATE TO authenticated
  USING (voter_id = auth.uid()) WITH CHECK (voter_id = auth.uid());

DROP POLICY IF EXISTS trip_request_votes_delete ON public.trip_request_votes;
CREATE POLICY trip_request_votes_delete ON public.trip_request_votes
  FOR DELETE TO authenticated USING (voter_id = auth.uid());

REVOKE ALL ON public.trip_request_votes FROM anon;

-- ── Members can read the requests they are voting on ────────────────────────
-- Requests are visible to the whole trip; invitations stay private to the two people named.

DROP POLICY IF EXISTS trip_invites_select_involved ON public.trip_invites;
CREATE POLICY trip_invites_select_involved ON public.trip_invites
  FOR SELECT TO authenticated
  USING (
    inviter_id = auth.uid()
    OR invitee_id = auth.uid()
    OR public.is_trip_host(trip_id)
    OR (kind = 'request' AND public.is_trip_member(trip_id))
  );

COMMIT;
