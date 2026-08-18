-- Migration 033: require actual consent to become someone's friend (Sprint 34)
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS: friend_requests let a user manufacture their own friendship.
--
--   friend_requests_insert_own  WITH CHECK (auth.uid() = requester_id)
--
-- checks who the requester is but says nothing about `status`, so any signed-in
-- user could INSERT a row already marked 'accepted' naming anyone as recipient.
-- No approval, no notification. Reproduced against the live database before
-- writing this file: as a non-friend, public.are_friends(victim) flipped false
-- -> true and the victim's daily_plans became readable, from one INSERT. The
-- test row was deleted immediately afterwards.
--
-- Second path, same table: friend_requests_update_own's WITH CHECK cannot see
-- the pre-update row, so the RECIPIENT of any row could rewrite requester_id to
-- a victim, keep themselves as recipient, set status='accepted', and pass both
-- USING (party to the old row) and WITH CHECK (party to the new row).
--
-- WHY NOW: these policies pre-date Sprint 34, but until migration 032 the
-- daily_plans friends policy read the empty `friendships` table and matched
-- nothing, so the friendship grant was inert for plans. 032 made it live — and
-- daily_plans is forward-looking location data (which mountain, which day, ETA),
-- which is materially worse to leak than the already-world-readable ski_sessions.
--
-- THE FIX, in three parts:
--   1. INSERT may only create 'pending' rows.
--   2. UPDATE: the recipient may set any status (they are the consenting party);
--      the requester may only leave it 'pending' — no self-accept.
--   3. Column-scope UPDATE to (status, updated_at), matching migration 028's
--      pattern, so requester_id/recipient_id can never be rewritten. This is
--      what closes path two, since WITH CHECK has no access to the old row.
--
-- APP CHANGE THIS DEPENDS ON: sendFriendRequest's "revive a declined request"
-- branch used to UPDATE requester_id/recipient_id to flip the direction. It now
-- deletes the declined row and inserts a fresh pending one. Deploy the frontend
-- with that change before applying this migration, or reviving a declined
-- request will fail.
--
-- NOT CLOSED HERE — crew_members, tracked as ROADMAP.md TASK 18.3:
--   "crew members can insert members" WITH CHECK ((user_id = auth.uid()) OR ...)
-- lets a user insert themselves into ANY crew_id, and "members can update own
-- row" lets a pending member self-activate — which defeats the status='active'
-- guard in shares_crew_with(). Both are deliberately left alone: the first
-- branch is what lets a crew's creator bootstrap the first membership row, and
-- the self-update IS the accept-invite flow (acceptCrewInvite), so closing them
-- needs a SECURITY DEFINER create/join RPC rather than a policy tweak. It is
-- also much harder to exploit: it requires knowing a crew UUID, and crew ids are
-- not enumerable (crews/crew_members SELECT both require membership), whereas
-- the friend path only needed a user id, and profiles are world-readable.
--
-- ROLLBACK, if anything breaks:
--   DROP POLICY IF EXISTS friend_requests_insert_own ON friend_requests;
--   CREATE POLICY friend_requests_insert_own ON friend_requests
--     FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id);
--   DROP POLICY IF EXISTS friend_requests_update_own ON friend_requests;
--   CREATE POLICY friend_requests_update_own ON friend_requests
--     FOR UPDATE TO authenticated
--     USING (auth.uid() = requester_id OR auth.uid() = recipient_id)
--     WITH CHECK (auth.uid() = requester_id OR auth.uid() = recipient_id);
--   GRANT UPDATE ON friend_requests TO authenticated;

-- ── INSERT: pending only ────────────────────────────────────────────────────

DROP POLICY IF EXISTS friend_requests_insert_own ON friend_requests;

CREATE POLICY friend_requests_insert_own ON friend_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id AND status = 'pending');

-- ── UPDATE: only the recipient may accept ───────────────────────────────────

DROP POLICY IF EXISTS friend_requests_update_own ON friend_requests;

CREATE POLICY friend_requests_update_own ON friend_requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id)
  WITH CHECK (
    -- The recipient is the consenting party: accept, decline, or reopen.
    auth.uid() = recipient_id
    -- The requester may touch their own row but never self-accept.
    OR (auth.uid() = requester_id AND status = 'pending')
  );

-- ── Column-scoped UPDATE grant ──────────────────────────────────────────────
-- RLS restricts rows, not columns. Without this, the recipient of any row could
-- repoint requester_id at a victim and accept — WITH CHECK cannot see the old
-- row, so it cannot tell that the counterparty changed.

REVOKE UPDATE ON friend_requests FROM authenticated;
GRANT UPDATE (status, updated_at) ON friend_requests TO authenticated;
