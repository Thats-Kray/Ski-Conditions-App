-- Migration 025: Fix missing crews.created_by -> profiles.id foreign key
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- Root cause of the "getPendingCrewInvites error: PGRST200" seen in the app: crews.created_by
-- has always been a plain uuid column with no foreign key. crew_members.user_id and
-- crew_messages.user_id both already have an equivalent named FK to profiles(id)
-- (crew_members_user_profile_fk / crew_messages_user_profile_fk) - crews.created_by was the
-- one column in this feature that never got its matching constraint, so PostgREST can't
-- resolve socialApi.js's `creator:created_by ( full_name, username )` embed on the crews table.
-- Verified no orphaned rows (every crews.created_by already matches an existing profiles.id)
-- before writing this, so this ADD CONSTRAINT is safe to run as-is.

ALTER TABLE public.crews
  ADD CONSTRAINT crews_created_by_profile_fk
  FOREIGN KEY (created_by) REFERENCES public.profiles(id);
