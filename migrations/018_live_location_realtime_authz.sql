-- Migration 018: Realtime Authorization for live friend location channels
-- Run in Supabase SQL Editor.
--
-- Sprint 28 (live friend location sharing) broadcasts a user's GPS position
-- on a Supabase Realtime Broadcast channel named `mountain:live:{userId}`.
-- Realtime Broadcast channels are OPEN BY DEFAULT: any client holding the
-- project's anon key can `supabase.channel('mountain:live:<uid>').subscribe()`
-- directly and receive that user's live position, without ever being an
-- accepted friend, regardless of any client-side gating in the app's own UI.
-- User IDs are already exposed elsewhere in this app (profile modals, friend
-- search, skier lists), so this is a real, addressable-without-guessing
-- attack surface — not hypothetical. This migration closes it with Supabase
-- Realtime Authorization: https://supabase.com/docs/guides/realtime/authorization
--
-- Realtime Authorization requires TWO things together:
--   1. RLS policies on `realtime.messages` (this migration).
--   2. The client instantiates the channel with `{ config: { private: true } }`
--      — done in src/lib/useLiveFriendLocations.js (receiver) and
--      src/components/ActiveSessionBar.jsx (sender).
--
-- `realtime.messages` ships with RLS already enabled by Supabase on every
-- project — these policies only need to be added, not toggled on.
--
-- MANUAL STEP REQUIRED (cannot be done via SQL migration):
-- In the Supabase Dashboard → Realtime → Settings, the project-level
-- "Allow public access" toggle must be turned OFF. Per Supabase's own docs:
-- "To enforce private channels you need to disable the 'Allow public
-- access' setting in Realtime Settings." Without this, a client could
-- still bypass the `private: true` negotiation. This is a project setting,
-- not something expressible in a migration file — flag for whoever has
-- Supabase dashboard access to confirm/toggle before this ships to prod.
--
-- Topic format is `mountain:live:{userId}` — the owning user's ID is the
-- third colon-delimited segment. Both policies validate the topic against a
-- strict UUID-shaped regex before extracting/casting that segment, so a
-- malformed topic is denied outright rather than raising a cast error.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages'
      AND policyname = 'Accepted friends receive live location broadcasts'
  ) THEN
    CREATE POLICY "Accepted friends receive live location broadcasts"
    ON "realtime"."messages"
    FOR SELECT
    TO authenticated
    USING (
      realtime.messages.extension IN ('broadcast')
      AND (select realtime.topic()) ~ '^mountain:live:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      AND (
        -- the channel owner can always read their own channel
        (select auth.uid()) = split_part((select realtime.topic()), ':', 3)::uuid
        OR EXISTS (
          SELECT 1 FROM friend_requests fr
          WHERE fr.status = 'accepted'
            AND (
              (fr.requester_id = (select auth.uid()) AND fr.recipient_id = split_part((select realtime.topic()), ':', 3)::uuid)
              OR (fr.recipient_id = (select auth.uid()) AND fr.requester_id = split_part((select realtime.topic()), ':', 3)::uuid)
            )
        )
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages'
      AND policyname = 'Users broadcast their own live location'
  ) THEN
    CREATE POLICY "Users broadcast their own live location"
    ON "realtime"."messages"
    FOR INSERT
    TO authenticated
    WITH CHECK (
      realtime.messages.extension IN ('broadcast')
      AND (select realtime.topic()) ~ '^mountain:live:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      -- a user may only ever broadcast on their own channel, never impersonate
      -- another user's position
      AND (select auth.uid()) = split_part((select realtime.topic()), ':', 3)::uuid
    );
  END IF;
END $$;
