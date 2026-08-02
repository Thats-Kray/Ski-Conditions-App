ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS strava_athlete_id   BIGINT,
  ADD COLUMN IF NOT EXISTS strava_access_token  TEXT,
  ADD COLUMN IF NOT EXISTS strava_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS strava_token_expires_at TIMESTAMPTZ;
