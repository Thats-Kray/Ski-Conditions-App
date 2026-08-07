-- Migration 023: Mountain Page Events widget
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

CREATE TABLE IF NOT EXISTS mountain_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resort_key   TEXT NOT NULL REFERENCES resort_coordinates(resort_key),
  title        TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description  TEXT CHECK (description IS NULL OR char_length(description) <= 500),
  event_date   DATE NOT NULL,
  link_url     TEXT CHECK (link_url IS NULL OR link_url ~* '^https?://'),
  created_by   UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mountain_events_resort_date ON mountain_events (resort_key, event_date);

ALTER TABLE mountain_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mountain_events' AND policyname='Authenticated can read events') THEN
    CREATE POLICY "Authenticated can read events" ON mountain_events FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mountain_events' AND policyname='Authenticated can create own events') THEN
    CREATE POLICY "Authenticated can create own events" ON mountain_events FOR INSERT TO authenticated
      WITH CHECK (created_by = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mountain_events' AND policyname='Authenticated can delete own events') THEN
    CREATE POLICY "Authenticated can delete own events" ON mountain_events FOR DELETE TO authenticated
      USING (created_by = auth.uid());
  END IF;
END $$;
