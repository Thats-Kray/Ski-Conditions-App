ALTER TABLE ski_sessions
  ADD COLUMN IF NOT EXISTS strava_activity_id BIGINT UNIQUE;

COMMENT ON COLUMN ski_sessions.strava_activity_id IS
  'Strava activity ID. Set when a session is synced from or uploaded to Strava. UNIQUE prevents duplicate imports.';
