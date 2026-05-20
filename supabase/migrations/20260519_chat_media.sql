-- Add media columns to all message tables
ALTER TABLE direct_messages
  ADD COLUMN IF NOT EXISTS media_url  text,
  ADD COLUMN IF NOT EXISTS media_type text; -- 'image' | 'video' | 'gif'

ALTER TABLE crew_messages
  ADD COLUMN IF NOT EXISTS media_url  text,
  ADD COLUMN IF NOT EXISTS media_type text;

ALTER TABLE trip_comments
  ADD COLUMN IF NOT EXISTS media_url  text,
  ADD COLUMN IF NOT EXISTS media_type text;

-- Create public chat-media storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload chat media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-media');

-- Public read access (URLs embedded in messages are already shared)
CREATE POLICY "Chat media is publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'chat-media');

-- Users can delete files they uploaded (folder = their user_id)
CREATE POLICY "Users can delete their own chat media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = auth.uid()::text);
