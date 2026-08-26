-- Migration 043: notifications for invites/approvals, and somewhere to send you
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS
--
-- Kyle, 2026-08-26: "can we include these in the notification center... When clicking the
-- notification, it should take you to whatever triggered the notification."
--
-- TWO PROBLEMS, one of which would have thrown on the very first insert.
--
-- 1. The type CHECK did not know about anything built in the last three sprints:
--      invite | rsvp | host_update | chat | friend_request | trip_update | crew_invite
--    Sending "someone is interested in your trip" would have failed with 23514 — the exact
--    failure mode as TASK 19.6, where respondToCrewInvite wrote visibility:"public" against a
--    CHECK that did not allow it and threw on every single call for months. Widening the CHECK
--    is not optional bookkeeping; it is the difference between the feature working and the
--    feature throwing.
--
-- 2. Notifications could only ever point at a trip. `trip_id` is the only link column, so a
--    plan-party request or a ski-day invite had nowhere to point and clicking it could not
--    take you anywhere. Hence target_type/target_id.
--
-- target_id is TEXT, not UUID, on purpose: half of what we now link to is keyed by a DATE
-- ("2026-08-29" opens the Plans calendar on that day), and forcing that into a UUID column
-- would mean a second nullable column and a branch at every read site.
--
-- trip_id stays. It is populated on trip notifications, several existing readers use it, and
-- removing it would be churn for its own sake — target_type/target_id is the general case
-- layered over it, not a replacement.
--
-- ROLLBACK, if anything breaks:
--   ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
--   ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
--     CHECK (type IN ('invite','rsvp','host_update','chat','friend_request','trip_update','crew_invite'));
--   ALTER TABLE notifications DROP COLUMN IF EXISTS target_type;
--   ALTER TABLE notifications DROP COLUMN IF EXISTS target_id;

BEGIN;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    -- existing
    'invite', 'rsvp', 'host_update', 'chat', 'friend_request', 'trip_update', 'crew_invite',
    -- trips: someone wants in, and the host's answer (migrations 040/041)
    'trip_request', 'trip_request_approved', 'trip_request_declined', 'trip_request_vote',
    -- plan parties: skiing WITH someone, as opposed to at the same mountain (037/038)
    'party_request', 'party_joined'
  ));

-- Where clicking this notification should take you.
--   target_type 'trip'  -> target_id is a ski_trips.id, opens the trip
--   target_type 'plan'  -> target_id is a YYYY-MM-DD date key, opens the Plans calendar there
--   target_type 'crew'  -> target_id is a crews.id
--   target_type 'friend'-> no id needed, opens the friends list
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS target_type TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS target_id   TEXT;

-- Backfill the trips we already know about, so existing rows are clickable too rather than
-- only ones created from now on.
UPDATE public.notifications
   SET target_type = 'trip', target_id = trip_id::text
 WHERE trip_id IS NOT NULL AND target_type IS NULL;

CREATE INDEX IF NOT EXISTS notifications_user_unread
  ON public.notifications (user_id, read, created_at DESC);

COMMIT;
