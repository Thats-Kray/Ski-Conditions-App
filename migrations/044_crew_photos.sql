-- Migration 044: crew photos
--
-- Lets a crew set a real photo instead of only an emoji/color-dot identity
-- (TASK 22.0 Crews-tab redesign). The default card icon becomes a flat color
-- dot via the existing crewColor() function; this column is the opt-in
-- override, same fallback shape Avatar.jsx already uses for people
-- (photo if set, else color+initial).
--
-- Bucket/policy shape mirrors supabase/migrations/20260519_chat_media.sql
-- exactly: any authenticated user can upload, bucket is publicly readable.
-- Admin-only editing is enforced at the UI layer (EditCrewModal is only
-- ever rendered when the caller is already a crew admin — see
-- CrewGroupChat.jsx's `isAdmin` check gating the Edit button), same as the
-- rest of this app's storage buckets; no per-crew storage RLS needed.
--
-- ROLLBACK, if anything breaks:
--   ALTER TABLE public.crews DROP COLUMN IF EXISTS photo_url;
--   DROP POLICY IF EXISTS "Authenticated users can upload crew photos" ON storage.objects;
--   DROP POLICY IF EXISTS "Crew photos are publicly readable" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'crew-photos';

BEGIN;

ALTER TABLE public.crews ADD COLUMN IF NOT EXISTS photo_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('crew-photos', 'crew-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload crew photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'crew-photos');

CREATE POLICY "Crew photos are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'crew-photos');

COMMIT;
