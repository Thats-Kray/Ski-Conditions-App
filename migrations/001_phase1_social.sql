-- Phase 1: Partiful-style social enhancements
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ── 1. Core trip tables (create if not yet created) ─────────────────────────

CREATE TABLE IF NOT EXISTS ski_trips (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  host_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resort_key      TEXT        NOT NULL,
  ski_date        DATE        NOT NULL,
  title           TEXT,
  description     TEXT,
  meeting_spot    TEXT,
  departure_time  TEXT,
  status          TEXT        DEFAULT 'upcoming',
  spotify_playlist_url TEXT
);

CREATE TABLE IF NOT EXISTS trip_rsvps (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID        NOT NULL REFERENCES ski_trips(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL,
  plus_ones   INTEGER     DEFAULT 0,
  rsvp_message TEXT,
  rsvp_gif_url TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (trip_id, user_id)
);

CREATE TABLE IF NOT EXISTS trip_comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    UUID        NOT NULL REFERENCES ski_trips(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 2. Add new columns to existing tables (safe to run if tables already exist) ─

ALTER TABLE ski_trips
  ADD COLUMN IF NOT EXISTS spotify_playlist_url TEXT;

ALTER TABLE trip_rsvps
  ADD COLUMN IF NOT EXISTS plus_ones    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rsvp_message TEXT,
  ADD COLUMN IF NOT EXISTS rsvp_gif_url TEXT;

-- ── 3. Host announcements ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trip_updates (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    UUID        NOT NULL REFERENCES ski_trips(id)   ON DELETE CASCADE,
  host_id    UUID        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 4. Enable RLS on all trip tables ────────────────────────────────────────

ALTER TABLE ski_trips     ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_rsvps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_updates  ENABLE ROW LEVEL SECURITY;

-- ── 5. RLS policies ─────────────────────────────────────────────────────────

DO $$
BEGIN

  -- ski_trips
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_trips' AND policyname='Anyone authenticated can view trips') THEN
    CREATE POLICY "Anyone authenticated can view trips"
      ON ski_trips FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_trips' AND policyname='Host can insert trips') THEN
    CREATE POLICY "Host can insert trips"
      ON ski_trips FOR INSERT TO authenticated WITH CHECK (host_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_trips' AND policyname='Host can update their trips') THEN
    CREATE POLICY "Host can update their trips"
      ON ski_trips FOR UPDATE TO authenticated USING (host_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_trips' AND policyname='Host can delete their trips') THEN
    CREATE POLICY "Host can delete their trips"
      ON ski_trips FOR DELETE TO authenticated USING (host_id = auth.uid());
  END IF;

  -- trip_rsvps
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_rsvps' AND policyname='Anyone authenticated can view rsvps') THEN
    CREATE POLICY "Anyone authenticated can view rsvps"
      ON trip_rsvps FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_rsvps' AND policyname='User can manage their own rsvp') THEN
    CREATE POLICY "User can manage their own rsvp"
      ON trip_rsvps FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;

  -- trip_comments
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_comments' AND policyname='Anyone authenticated can view comments') THEN
    CREATE POLICY "Anyone authenticated can view comments"
      ON trip_comments FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_comments' AND policyname='User can insert their own comments') THEN
    CREATE POLICY "User can insert their own comments"
      ON trip_comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_comments' AND policyname='User can delete their own comments') THEN
    CREATE POLICY "User can delete their own comments"
      ON trip_comments FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;

  -- trip_updates
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_updates' AND policyname='Anyone authenticated can view trip updates') THEN
    CREATE POLICY "Anyone authenticated can view trip updates"
      ON trip_updates FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_updates' AND policyname='Host can insert trip updates') THEN
    CREATE POLICY "Host can insert trip updates"
      ON trip_updates FOR INSERT TO authenticated WITH CHECK (host_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_updates' AND policyname='Host can delete their updates') THEN
    CREATE POLICY "Host can delete their updates"
      ON trip_updates FOR DELETE TO authenticated USING (host_id = auth.uid());
  END IF;

END $$;
