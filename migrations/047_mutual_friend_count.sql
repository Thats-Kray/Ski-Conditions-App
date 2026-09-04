-- Migration 047: mutual friend count for the Friends sub-tab's request rows
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS
--
-- The Crew tab's Friends sub-tab (ROADMAP.md TASK 22.0, the last slice of the 5-way
-- split) restyles each incoming friend request to the mockup's row, whose subtitle is a
-- mutual-friend count -- "3 mutual friends". The client cannot compute that number.
--
-- WHY THE CLIENT CANNOT COMPUTE IT
--
-- friend_requests' SELECT policy is caller-scoped, and was re-verified against the live
-- project on 2026-09-03 immediately before this migration was written:
--
--   friend_requests_select_own  SELECT  USING ((auth.uid() = requester_id)
--                                           OR (auth.uid() = recipient_id))
--
-- So a client session can only ever see MY OWN edges -- which is exactly why
-- getAcceptedFriends() (socialApi.js:1558-1562) works at all. The requester's own friend
-- list is invisible to me by design, and intersecting two friend lists in the browser
-- would need precisely the read that policy refuses.
--
-- That policy is CORRECT and this migration does not touch it. It was checked rather than
-- assumed because this app has twice found a USING (true) hiding behind a spec's prose:
-- activity_feed_reactions (045) and seven trip_* tables (042). This one was already right.
-- The only thing added here is the one server-side function that can do the intersection
-- without widening any read.
--
-- WHY SECURITY DEFINER STABLE, AND WHY IT IS SAFE
--
-- Same shape as are_friends() (032:61-70), can_see_activity() (045) and
-- can_see_ski_session() (046:105-115). SECURITY DEFINER so the two reads happen outside
-- the policy evaluator; STABLE so it inlines and is not re-executed per candidate row
-- (032:52-57).
--
-- The function is safe to expose despite reading rows the caller cannot SELECT, because
-- it returns ONE INTEGER and never a row, an id, or a name. A caller learns "you and this
-- person have 3 friends in common" -- which is what every social product shows on a friend
-- request -- and cannot learn WHICH three, nor enumerate anyone's friend list. It is
-- deliberately not a set-returning function for that reason: get_mutual_friends()
-- returning profiles would leak the friend graph this table's policy exists to protect.
--
-- WHY THE TWO <> EXCLUSIONS ARE THERE ANYWAY
--
-- friend_requests carries CHECK (requester_id <> recipient_id) (constraint
-- friend_requests_check, verified live), so no self-friendship row can exist, and neither
-- exclusion below can currently fire. They are kept as one line of defence-in-depth in
-- case that constraint is ever relaxed: without them, dropping the CHECK would silently
-- make every count off by one rather than fail. Documented as a deliberate no-op so a
-- future reader does not "simplify" them away without also checking the constraint.
--
-- WHY COUNT(*) IS CORRECT TODAY: THE UNIQUE INDEX IS LOAD-BEARING
--
-- The two <> exclusions above guard against a self-friendship row; they do NOT guard
-- against a reciprocal duplicate (requester/recipient swapped for the same pair) double-
-- counting a shared friend in the join above. What actually prevents that is a separate,
-- pre-existing constraint on friend_requests: a unique index on the normalized pair,
-- UNIQUE (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id))
-- (friend_requests_unique_pair_idx, live-verified). That index is what makes COUNT(*)
-- correct rather than merely usually-correct -- if it were ever dropped, a duplicated
-- reciprocal pair for the same two people would silently double-count that shared friend,
-- the same "off by one, not a failure" risk the <> exclusions call out above.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--
-- No policy is created, altered or dropped. No table is created. No notification is
-- written. No bulk/batch variant is added -- the UI calls this once per incoming friend
-- request row, and request volume is inherently tiny (the whole production database has
-- 4 accepted friendships today), matching the N-small-calls pattern socialApi.js already
-- uses everywhere else rather than introducing a first array-argument RPC.
--
-- ROLLBACK, if anything breaks:
--   DROP FUNCTION IF EXISTS public.get_mutual_friend_count(UUID);
--   -- Nothing else to undo: this migration adds one function and touches nothing else.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_mutual_friend_count(other_user_id UUID)
RETURNS INT
LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COUNT(*)::int
  FROM (
    SELECT CASE WHEN fr.requester_id = auth.uid()
                THEN fr.recipient_id ELSE fr.requester_id END AS friend_id
      FROM friend_requests fr
     WHERE fr.status = 'accepted'
       AND (fr.requester_id = auth.uid() OR fr.recipient_id = auth.uid())
  ) mine
  JOIN (
    SELECT CASE WHEN fr.requester_id = other_user_id
                THEN fr.recipient_id ELSE fr.requester_id END AS friend_id
      FROM friend_requests fr
     WHERE fr.status = 'accepted'
       AND (fr.requester_id = other_user_id OR fr.recipient_id = other_user_id)
  ) theirs
    ON theirs.friend_id = mine.friend_id
  WHERE mine.friend_id <> auth.uid()
    AND mine.friend_id <> other_user_id;
$$;

-- Not optional. A SECURITY DEFINER function is executable by PUBLIC by default, which
-- would hand the anon role a friend-graph oracle. Same two lines as 032:87-88 and
-- 046:102-103.
REVOKE ALL ON FUNCTION public.get_mutual_friend_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mutual_friend_count(UUID) TO authenticated;

-- The REVOKE ALL FROM PUBLIC above is NOT sufficient on its own in this project: an
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public grant (set schema-wide, not by any app
-- migration) hands EXECUTE to anon directly at CREATE FUNCTION time, and a PUBLIC-only
-- revoke never touches a grant already made directly to a named role. Confirmed live
-- that this same gap already exists on are_friends()/can_see_activity()/
-- can_see_ski_session() -- all anon-executable today despite the identical REVOKE-FROM-
-- PUBLIC pattern. Those three are deliberately left alone here (backlogged as a separate
-- anon-grants audit); this explicit revoke closes the gap for this function only.
REVOKE EXECUTE ON FUNCTION public.get_mutual_friend_count(UUID) FROM anon;

COMMIT;
