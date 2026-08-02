-- Migration 010: GPS ski run/lift segment tracking
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

-- First extend ski_sessions with new tracking columns
ALTER TABLE ski_sessions
  ADD COLUMN IF NOT EXISTS runs_logged          INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifts_ridden         INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS top_speed_mph        DECIMAL(5,1),
  ADD COLUMN IF NOT EXISTS avg_speed_mph        DECIMAL(5,1),
  ADD COLUMN IF NOT EXISTS time_on_mountain_min INT,
  ADD COLUMN IF NOT EXISTS time_on_lifts_min    INT,
  ADD COLUMN IF NOT EXISTS longest_run_ft       INT,
  ADD COLUMN IF NOT EXISTS calories_burned      INT,
  ADD COLUMN IF NOT EXISTS session_started_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS session_ended_at     TIMESTAMPTZ;

-- Individual run/lift segments table
CREATE TABLE IF NOT EXISTS ski_runs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID        NOT NULL REFERENCES ski_sessions(id) ON DELETE CASCADE,
  run_type       TEXT        NOT NULL CHECK (run_type IN ('run', 'lift', 'rest')),
  run_number     INT,
  started_at     TIMESTAMPTZ NOT NULL,
  ended_at       TIMESTAMPTZ,
  vertical_ft    INT,
  distance_mi    DECIMAL(6,2),
  speed_max_mph  DECIMAL(5,1),
  speed_avg_mph  DECIMAL(5,1),
  lift_name      TEXT,
  gps_track      JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fetching all runs within a session
CREATE INDEX IF NOT EXISTS ski_runs_session_id_idx ON ski_runs(session_id);

-- RLS
ALTER TABLE ski_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_runs' AND policyname='Users can read own ski runs') THEN
    CREATE POLICY "Users can read own ski runs"
      ON ski_runs FOR SELECT
      USING (
        session_id IN (
          SELECT id FROM ski_sessions WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_runs' AND policyname='Users can insert own ski runs') THEN
    CREATE POLICY "Users can insert own ski runs"
      ON ski_runs FOR INSERT
      WITH CHECK (
        session_id IN (
          SELECT id FROM ski_sessions WHERE user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_runs' AND policyname='Users can update own ski runs') THEN
    CREATE POLICY "Users can update own ski runs"
      ON ski_runs FOR UPDATE
      USING (
        session_id IN (
          SELECT id FROM ski_sessions WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;
