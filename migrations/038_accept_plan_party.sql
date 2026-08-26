-- Migration 038: accept_plan_party() (Sprint 38)
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS
--
-- 037's join_plan_party() joins the CALLER, which covers exactly one of the two flows:
--
--   invite   owner invites you  -> YOU accept   -> you are the caller, you join.      OK
--   request  you ask to join    -> OWNER approves -> the owner is the caller, but the
--                                 person who needs to be added is the REQUESTER.      BROKEN
--
-- Without this, an approved request would sit there doing nothing until the requester
-- happened to open the app again and join themselves. This closes that.
--
-- THE SYMMETRY THAT MAKES IT ONE FUNCTION, NOT TWO
--
-- In both flows the person taking the action is crew_invites.invitee_id -- the one who
-- RECEIVED the row. Only the roles differ:
--
--   kind='invite'   owner = inviter_id, joiner = invitee_id (the caller joins someone's party)
--   kind='request'  owner = invitee_id, joiner = inviter_id (the caller admits someone)
--
-- So the authorization check is the same single line for both: caller must be invitee_id.
-- That is the whole reason this is one function with a CASE rather than two near-copies that
-- can drift apart -- which is the failure mode that produced TASK 19.6.
--
-- The party is created lazily here. Nobody has a party until someone actually links up, so a
-- solo skier never generates a row, and "does this person have a party" stays a real question
-- rather than being true for everyone by default.
--
-- ROLLBACK, if anything breaks:
--   DROP FUNCTION IF EXISTS public.accept_plan_party(UUID);
--   (037's join_plan_party remains and still covers the invite direction.)

CREATE OR REPLACE FUNCTION public.accept_plan_party(p_invite_id UUID)
RETURNS public.plan_party_members
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv    crew_invites;
  v_owner  UUID;
  v_joiner UUID;
  v_party  plan_parties;
  v_row    plan_party_members;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT * INTO v_inv FROM crew_invites WHERE id = p_invite_id;
  IF v_inv IS NULL THEN
    RAISE EXCEPTION 'No such invite or request';
  END IF;

  -- Both flows: only the recipient of the row may act on it.
  IF v_inv.invitee_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only respond to invites and requests sent to you';
  END IF;

  IF v_inv.kind = 'invite' THEN
    v_owner  := v_inv.inviter_id;
    v_joiner := v_inv.invitee_id;
  ELSE
    v_owner  := v_inv.invitee_id;
    v_joiner := v_inv.inviter_id;
  END IF;

  UPDATE crew_invites
     SET status = 'accepted', updated_at = NOW()
   WHERE id = p_invite_id;

  -- The owner's party for that date, created on first link-up.
  INSERT INTO plan_parties (owner_id, ski_date)
  VALUES (v_owner, v_inv.ski_date)
  ON CONFLICT (owner_id, ski_date)
  DO UPDATE SET owner_id = EXCLUDED.owner_id   -- no-op, so RETURNING yields the existing row
  RETURNING * INTO v_party;

  -- The owner is a member of their own party.
  INSERT INTO plan_party_members (party_id, user_id, ski_date)
  VALUES (v_party.id, v_owner, v_inv.ski_date)
  ON CONFLICT (user_id, ski_date)
  DO UPDATE SET party_id = EXCLUDED.party_id, joined_at = NOW();

  -- And the joiner. UNIQUE (user_id, ski_date) means joining a new party for a day moves you
  -- out of the previous one rather than putting you in two places at once.
  INSERT INTO plan_party_members (party_id, user_id, ski_date)
  VALUES (v_party.id, v_joiner, v_inv.ski_date)
  ON CONFLICT (user_id, ski_date)
  DO UPDATE SET party_id = EXCLUDED.party_id, joined_at = NOW()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_plan_party(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_plan_party(UUID) TO authenticated;
