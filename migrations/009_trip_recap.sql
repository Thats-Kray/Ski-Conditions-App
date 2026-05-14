-- Migration 009: Post-trip recap + photo/video sharing
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
-- Also create a Supabase Storage bucket named "trip-media" (public or with RLS policies).

CREATE TABLE IF NOT EXISTS trip_recaps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID REFERENCES ski_trips ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users NOT NULL,
  rating      INTEGER,    -- 1-5 stars
  conditions  TEXT,       -- e.g. 'powder','groomed','icy','slushy'
  highlight   TEXT,       -- one-line best moment
  notes       TEXT,       -- longer free-form note
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, user_id)
);

CREATE INDEX IF NOT EXISTS trip_recaps_trip ON trip_recaps (trip_id);

CREATE TABLE IF NOT EXISTS trip_media (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID REFERENCES ski_trips ON DELETE CASCADE NOT NULL,
  user_id      UUID REFERENCES auth.users NOT NULL,
  storage_path TEXT NOT NULL,     -- Supabase Storage path in trip-media bucket
  media_type   TEXT NOT NULL,     -- 'photo' or 'video'
  caption      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trip_media_trip ON trip_media (trip_id);

ALTER TABLE trip_recaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_media  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- trip_recaps
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_recaps' AND policyname='Recaps visible to trip participants') THEN
    CREATE POLICY "Recaps visible to trip participants" ON trip_recaps FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM ski_trips WHERE id = trip_id AND host_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM trip_rsvps WHERE trip_id = trip_recaps.trip_id AND user_id = auth.uid() AND status = 'going'
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_recaps' AND policyname='Users submit own recap') THEN
    CREATE POLICY "Users submit own recap" ON trip_recaps FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_recaps' AND policyname='Users update own recap') THEN
    CREATE POLICY "Users update own recap" ON trip_recaps FOR UPDATE TO authenticated USING (auth.uid() = user_id);
  END IF;

  -- trip_media
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_media' AND policyname='Media visible to trip participants') THEN
    CREATE POLICY "Media visible to trip participants" ON trip_media FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM ski_trips WHERE id = trip_id AND host_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM trip_rsvps WHERE trip_id = trip_media.trip_id AND user_id = auth.uid() AND status = 'going'
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_media' AND policyname='Users upload own media') THEN
    CREATE POLICY "Users upload own media" ON trip_media FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_media' AND policyname='Users delete own media') THEN
    CREATE POLICY "Users delete own media" ON trip_media FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
