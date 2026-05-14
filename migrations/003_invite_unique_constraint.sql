-- Migration 003: Fix trip_invites for reliable upsert
-- Run in Supabase SQL Editor

-- Step 1: Remove any duplicate (trip_id, invitee_id) rows keeping the newest
DELETE FROM trip_invites a
USING trip_invites b
WHERE a.created_at < b.created_at
  AND a.trip_id = b.trip_id
  AND a.invitee_id IS NOT NULL
  AND a.invitee_id = b.invitee_id;

-- Step 2: Add the UNIQUE constraint so upsert works correctly
-- (NULLs are exempt, so email-only invites with invitee_id = NULL are unaffected)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trip_invites_trip_invitee_unique'
      AND conrelid = 'trip_invites'::regclass
  ) THEN
    ALTER TABLE trip_invites
      ADD CONSTRAINT trip_invites_trip_invitee_unique
      UNIQUE (trip_id, invitee_id);
  END IF;
END $$;

-- Step 3: Allow invitees to read trips they've been invited to
-- (The existing "Anyone authenticated can view trips" policy already covers this,
--  so no additional policy is needed.)
