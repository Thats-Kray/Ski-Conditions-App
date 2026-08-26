-- Migration 042: a trip's chat and contents belong to the trip
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS
--
-- Kyle, 2026-08-26: "if User 2 has plans, but User 1 and 3 weren't invited, when they clicked
-- I'm in, then I'm interested, they were able to access the private groups messages/chat. They
-- should not have access to the chat if they are not included/approved."
--
-- Correct, and it was never the Interested flow that opened it. The chat was readable by
-- EVERY authenticated user in the app, and had been all along:
--
--   trip_comments       SELECT USING (true)     the chat
--   trip_updates        SELECT USING (true)     host announcements
--   trip_polls          SELECT USING (true)     polls
--   trip_poll_votes     SELECT USING (true)     who voted for what
--   trip_carpools       SELECT USING (true)     who is driving, meeting spots
--   trip_carpool_riders SELECT USING (true)     who is in whose car
--   trip_rsvps          SELECT USING (true)     the guest list
--
-- And trip_carpools INSERT was `WITH CHECK (true)` — any user could add a car to any trip.
--
-- trip_media and trip_recaps were already scoped to host-or-going. So the correct pattern
-- existed in this schema the whole time; it just was not applied to the other seven tables.
-- Finding this needed enumerating every table with a trip_id, not fixing the one that was
-- reported — the same lesson as the daily_plans writer census.
--
-- THE RULE. Trip content is for people ON the trip: the host, a going/maybe RSVP, or someone
-- holding an invitation. Explicitly NOT someone with kind='request' — being Interested is
-- asking to join, and it must not come with the keys. That is precisely what Kyle reported.
--
-- trip_rsvps is deliberately looser than the rest. It is the guest list, and "6 going" plus
-- the avatars is what makes a friend's trip legible on the calendar at all. It follows
-- ski_trips instead: host, friend-of-host, or already involved. Friends can see WHO is going;
-- strangers cannot, and nobody outside the trip sees the conversation.
--
-- ROLLBACK, if anything breaks: each of these restores one wide-open policy.
--   CREATE POLICY "Anyone authenticated can view comments" ON trip_comments FOR SELECT USING (true);
--   CREATE POLICY "Anyone authenticated can view trip updates" ON trip_updates FOR SELECT USING (true);
--   CREATE POLICY "Auth users view polls" ON trip_polls FOR SELECT USING (true);
--   CREATE POLICY "Auth users view votes" ON trip_poll_votes FOR SELECT USING (true);
--   CREATE POLICY "Carpools visible to authenticated" ON trip_carpools FOR SELECT USING (true);
--   CREATE POLICY "Riders visible to authenticated" ON trip_carpool_riders FOR SELECT USING (true);
--   CREATE POLICY "Anyone authenticated can view rsvps" ON trip_rsvps FOR SELECT USING (true);
--   DROP FUNCTION IF EXISTS public.can_see_trip_content(UUID);
--   DROP FUNCTION IF EXISTS public.can_see_trip_poll(UUID);
--   DROP FUNCTION IF EXISTS public.can_see_trip_carpool(UUID);

BEGIN;

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so the policies never read an RLS-protected relation inline — the mistake
-- migration 041 nearly shipped with, and that 20260515_crew_rls_fix.sql / 022 exist to undo.
-- STABLE so they inline and do not re-run per candidate row (032:52-57).

CREATE OR REPLACE FUNCTION public.can_see_trip_content(p_trip_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM ski_trips WHERE id = p_trip_id AND host_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM trip_rsvps
         WHERE trip_id = p_trip_id AND user_id = auth.uid() AND status IN ('going','maybe')
      )
      -- An invitation, not a request. kind='request' is someone asking to be let in, and
      -- must not grant access to the thing they are asking to join.
      OR EXISTS (
        SELECT 1 FROM trip_invites
         WHERE trip_id = p_trip_id AND invitee_id = auth.uid() AND kind = 'invite'
      );
$$;

-- Poll votes and carpool riders hang off a parent rather than carrying trip_id.
CREATE OR REPLACE FUNCTION public.can_see_trip_poll(p_poll_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_polls WHERE id = p_poll_id AND public.can_see_trip_content(trip_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_see_trip_carpool(p_carpool_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_carpools WHERE id = p_carpool_id AND public.can_see_trip_content(trip_id)
  );
$$;

-- The guest list is deliberately wider than the content: friends of the host can see who is
-- going, which is what makes a friend's trip legible on the calendar.
CREATE OR REPLACE FUNCTION public.can_see_trip_guest_list(p_trip_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM ski_trips t
     WHERE t.id = p_trip_id
       AND (t.host_id = auth.uid() OR public.are_friends(t.host_id))
  ) OR public.is_trip_participant(p_trip_id);
$$;

REVOKE ALL ON FUNCTION public.can_see_trip_guest_list(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_see_trip_guest_list(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.can_see_trip_content(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_see_trip_poll(UUID)    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_see_trip_carpool(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_see_trip_content(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_trip_poll(UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_trip_carpool(UUID) TO authenticated;

-- ── The chat ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone authenticated can view comments" ON public.trip_comments;
DROP POLICY IF EXISTS trip_comments_select ON public.trip_comments;
CREATE POLICY trip_comments_select ON public.trip_comments
  FOR SELECT TO authenticated USING (public.can_see_trip_content(trip_id));

-- Posting needs the same standing as reading. It was only "the row is mine", so an outsider
-- could write into any trip's conversation.
DROP POLICY IF EXISTS "User can insert their own comments" ON public.trip_comments;
DROP POLICY IF EXISTS trip_comments_insert ON public.trip_comments;
CREATE POLICY trip_comments_insert ON public.trip_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_see_trip_content(trip_id));

-- ── Updates, polls, votes ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone authenticated can view trip updates" ON public.trip_updates;
DROP POLICY IF EXISTS trip_updates_select ON public.trip_updates;
CREATE POLICY trip_updates_select ON public.trip_updates
  FOR SELECT TO authenticated USING (public.can_see_trip_content(trip_id));

DROP POLICY IF EXISTS "Auth users view polls" ON public.trip_polls;
DROP POLICY IF EXISTS trip_polls_select ON public.trip_polls;
CREATE POLICY trip_polls_select ON public.trip_polls
  FOR SELECT TO authenticated USING (public.can_see_trip_content(trip_id));

DROP POLICY IF EXISTS "Auth users create polls" ON public.trip_polls;
DROP POLICY IF EXISTS trip_polls_insert ON public.trip_polls;
CREATE POLICY trip_polls_insert ON public.trip_polls
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = auth.uid() AND public.can_see_trip_content(trip_id));

DROP POLICY IF EXISTS "Auth users view votes" ON public.trip_poll_votes;
DROP POLICY IF EXISTS trip_poll_votes_select ON public.trip_poll_votes;
CREATE POLICY trip_poll_votes_select ON public.trip_poll_votes
  FOR SELECT TO authenticated USING (public.can_see_trip_poll(poll_id));

-- ── Carpools ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Carpools visible to authenticated" ON public.trip_carpools;
DROP POLICY IF EXISTS trip_carpools_select ON public.trip_carpools;
CREATE POLICY trip_carpools_select ON public.trip_carpools
  FOR SELECT TO authenticated USING (public.can_see_trip_content(trip_id));

-- Was WITH CHECK (true): any user could add a car to any trip in the app.
DROP POLICY IF EXISTS "Authenticated can add carpools" ON public.trip_carpools;
DROP POLICY IF EXISTS trip_carpools_insert ON public.trip_carpools;
CREATE POLICY trip_carpools_insert ON public.trip_carpools
  FOR INSERT TO authenticated WITH CHECK (public.can_see_trip_content(trip_id));

DROP POLICY IF EXISTS "Riders visible to authenticated" ON public.trip_carpool_riders;
DROP POLICY IF EXISTS trip_carpool_riders_select ON public.trip_carpool_riders;
CREATE POLICY trip_carpool_riders_select ON public.trip_carpool_riders
  FOR SELECT TO authenticated USING (public.can_see_trip_carpool(carpool_id));

DROP POLICY IF EXISTS "Users claim own seat" ON public.trip_carpool_riders;
DROP POLICY IF EXISTS trip_carpool_riders_insert ON public.trip_carpool_riders;
CREATE POLICY trip_carpool_riders_insert ON public.trip_carpool_riders
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_see_trip_carpool(carpool_id));

-- ── The guest list ──────────────────────────────────────────────────────────
-- Looser on purpose. "6 going" and the avatars are what make a friend's trip legible on the
-- calendar, so this follows ski_trips: host, friend-of-host, or already involved. Friends see
-- WHO is going; strangers see nothing, and neither sees the conversation.

DROP POLICY IF EXISTS "Anyone authenticated can view rsvps" ON public.trip_rsvps;
DROP POLICY IF EXISTS trip_rsvps_select ON public.trip_rsvps;
-- Via a definer helper, NOT an inline EXISTS on ski_trips. ski_trips is itself RLS-protected,
-- so an inline read would have that policy applied on top and the answer would depend on a
-- second policy's shape. That is the bug migration 041 nearly shipped with.
CREATE POLICY trip_rsvps_select ON public.trip_rsvps
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_see_trip_guest_list(trip_id));

COMMIT;
