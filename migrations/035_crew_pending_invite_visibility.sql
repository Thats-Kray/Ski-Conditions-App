-- Migration 035: let a pending invitee see their own crew invite (Sprint 34)
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS: crew invites have never been visible to the person invited.
--
--   "crew members can view members"  USING (my_crew_role(crew_id) IS NOT NULL)
--
-- and my_crew_role() only matches rows with status = 'active'. So a member whose
-- status is 'pending' cannot SELECT their own crew_members row. Two consequences,
-- both pre-dating Sprint 34 and both verified live:
--
--   * getPendingCrewInvites() filters on status='pending' — precisely the rows the
--     policy hides — so it has always returned []. The pending-invite UI never had
--     anything to show.
--   * acceptCrewInvite() issues UPDATE ... WHERE crew_id=? AND user_id=?. An UPDATE
--     must first find its row through the SELECT policy, so it matched nothing and
--     silently no-opped. Confirmed: as the real pending member of "Ray Ski Crew",
--     the accept UPDATE left status = 'pending'.
--
-- The app never hit this because the only way anyone joined a crew was being
-- inserted directly as 'active' — createCrew(memberIds) relied on the column
-- DEFAULT, i.e. it force-joined people rather than inviting them.
--
-- WHY IT MATTERS NOW: migration 034 removed the self-join hole and switched
-- createCrew(memberIds) to insert 'pending' rows, which is the correct consent
-- behaviour. Without this migration that would be a regression — invited members
-- would be invisible to themselves and unable to accept. 034 and 035 belong
-- together; 035 is separate only because 034 was already applied (same pattern as
-- 030 -> 031).
--
-- THE FIX: you may always see your own membership row, whatever its status. This
-- widens nothing else — a user could already read every member of any crew they
-- are active in, and this adds only their own row in crews they are not yet in.
--
-- ROLLBACK, if anything breaks:
--   DROP POLICY IF EXISTS "crew members can view members" ON crew_members;
--   CREATE POLICY "crew members can view members" ON crew_members
--     FOR SELECT TO public USING (my_crew_role(crew_id) IS NOT NULL);

DROP POLICY IF EXISTS "crew members can view members" ON crew_members;

CREATE POLICY "crew members can view members" ON crew_members
  FOR SELECT TO authenticated
  USING (
    -- Your own row, pending or active — this is what makes an invite visible
    -- and therefore acceptable.
    user_id = auth.uid()
    -- Everyone in a crew you are an active member of.
    OR public.my_crew_role(crew_id) IS NOT NULL
  );
