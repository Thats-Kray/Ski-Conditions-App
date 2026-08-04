-- Migration 020: Mountain Board — location-gated public resort feed
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

-- Reference table: single source of truth for the geofence check specifically.
-- (App.jsx's RESORTS constant and server/index.js each already hardcode their
-- own copy of these coordinates for other purposes — see sprint design notes.)
CREATE TABLE IF NOT EXISTS resort_coordinates (
  resort_key            TEXT PRIMARY KEY,
  lat                    DOUBLE PRECISION NOT NULL,
  lon                    DOUBLE PRECISION NOT NULL,
  geofence_radius_miles  DOUBLE PRECISION NOT NULL DEFAULT 3.0
);

INSERT INTO resort_coordinates (resort_key, lat, lon) VALUES
  ('vail',            39.6403, -106.3742),
  ('beavercreek',     39.6042, -106.5165),
  ('breckenridge',    39.4817, -106.0384),
  ('keystone',        39.6084, -105.9437),
  ('crestedbutte',    38.8996, -106.9653),
  ('telluride',       37.9363, -107.8466),
  ('winterpark',      39.8863, -105.7626),
  ('coppermountain',  39.5022, -106.1512),
  ('arapahoebasin',   39.6423, -105.8717),
  ('steamboat',       40.4572, -106.8047),
  ('eldora',          39.9372, -105.5842),
  ('aspensnowmass',   39.2097, -106.9499)
ON CONFLICT (resort_key) DO NOTHING;

-- Mirrors src/lib/geoMath.js's haversineDistanceMiles — duplicated on purpose,
-- see design notes above.
CREATE OR REPLACE FUNCTION public.haversine_miles(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision
LANGUAGE sql IMMUTABLE AS $$
  SELECT 3958.8 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

CREATE TABLE IF NOT EXISTS mountain_board_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  resort_key    TEXT NOT NULL REFERENCES resort_coordinates(resort_key),
  category      TEXT NOT NULL CHECK (category IN ('safety','lost_found','social','general')),
  content       TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 280),
  post_lat      DOUBLE PRECISION NOT NULL,
  post_lng      DOUBLE PRECISION NOT NULL,
  report_count  INT NOT NULL DEFAULT 0,
  is_hidden     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours')
);

CREATE INDEX IF NOT EXISTS mountain_board_posts_resort_feed ON mountain_board_posts (resort_key, created_at DESC);
CREATE INDEX IF NOT EXISTS mountain_board_posts_expires ON mountain_board_posts (expires_at);

CREATE TABLE IF NOT EXISTS mountain_board_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      UUID REFERENCES mountain_board_posts(id) ON DELETE CASCADE NOT NULL,
  reporter_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, reporter_id)
);

ALTER TABLE resort_coordinates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mountain_board_posts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mountain_board_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='resort_coordinates' AND policyname='Authenticated can read resort coordinates') THEN
    CREATE POLICY "Authenticated can read resort coordinates" ON resort_coordinates FOR SELECT TO authenticated USING (true);
  END IF;

  -- Deliberately no INSERT policy on either table below — all writes go
  -- through the SECURITY DEFINER functions further down.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mountain_board_posts' AND policyname='Authenticated can read visible posts') THEN
    CREATE POLICY "Authenticated can read visible posts" ON mountain_board_posts FOR SELECT TO authenticated
      USING (NOT is_hidden AND expires_at > NOW());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mountain_board_reports' AND policyname='Authenticated can view own reports') THEN
    CREATE POLICY "Authenticated can view own reports" ON mountain_board_reports FOR SELECT TO authenticated
      USING (reporter_id = auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_board_post(
  p_resort_key TEXT, p_category TEXT, p_content TEXT, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION
)
RETURNS mountain_board_posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_resort   resort_coordinates%ROWTYPE;
  v_distance DOUBLE PRECISION;
  v_post     mountain_board_posts;
BEGIN
  SELECT * INTO v_resort FROM resort_coordinates WHERE resort_key = p_resort_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_RESORT';
  END IF;

  v_distance := public.haversine_miles(p_lat, p_lng, v_resort.lat, v_resort.lon);
  IF v_distance > v_resort.geofence_radius_miles THEN
    RAISE EXCEPTION 'TOO_FAR:%', round(v_distance::numeric, 1);
  END IF;

  INSERT INTO mountain_board_posts (author_id, resort_key, category, content, post_lat, post_lng)
  VALUES (auth.uid(), p_resort_key, p_category, trim(p_content), p_lat, p_lng)
  RETURNING * INTO v_post;

  RETURN v_post;
END;
$$;

REVOKE ALL ON FUNCTION public.create_board_post(TEXT,TEXT,TEXT,DOUBLE PRECISION,DOUBLE PRECISION) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_board_post(TEXT,TEXT,TEXT,DOUBLE PRECISION,DOUBLE PRECISION) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_board_post(p_post_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO mountain_board_reports (post_id, reporter_id)
  VALUES (p_post_id, auth.uid())
  ON CONFLICT (post_id, reporter_id) DO NOTHING;

  SELECT count(*) INTO v_count FROM mountain_board_reports WHERE post_id = p_post_id;

  UPDATE mountain_board_posts
  SET report_count = v_count, is_hidden = (v_count >= 3)
  WHERE id = p_post_id;
END;
$$;

REVOKE ALL ON FUNCTION public.report_board_post(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_board_post(UUID) TO authenticated;
