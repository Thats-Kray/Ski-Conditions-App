-- Migration 021: Krames Butte — private dev-testing resort for Mountain Board
-- Owner-only fake resort that bypasses the geofence check in create_board_post.
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

INSERT INTO resort_coordinates (resort_key, lat, lon) VALUES
  ('kramesbutte', 39.5, -105.5)
ON CONFLICT (resort_key) DO NOTHING;

-- Replaces migration 020's blanket "Authenticated can read resort
-- coordinates" policy with one that adds a kramesbutte-only exception.
-- DROP + CREATE (not the guarded IF-NOT-EXISTS pattern from 020) is
-- deliberate: this is a redefinition of an existing policy, not a
-- first-time creation, and the guarded pattern would silently skip
-- redefinition, leaving the old (unrestricted) policy in place.
DROP POLICY IF EXISTS "Authenticated can read resort coordinates" ON resort_coordinates;
CREATE POLICY "Authenticated can read resort coordinates" ON resort_coordinates FOR SELECT TO authenticated
  USING (
    resort_key <> 'kramesbutte'
    OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND u.email = 'raykyle1104@gmail.com')
  );

-- Same exception on mountain_board_posts reads: kramesbutte posts are only
-- visible to the owner; every other resort's posts are unaffected (the
-- `resort_key <> 'kramesbutte'` clause short-circuits true for them).
DROP POLICY IF EXISTS "Authenticated can read visible posts" ON mountain_board_posts;
CREATE POLICY "Authenticated can read visible posts" ON mountain_board_posts FOR SELECT TO authenticated
  USING (
    NOT is_hidden AND expires_at > NOW()
    AND (
      resort_key <> 'kramesbutte'
      OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND u.email = 'raykyle1104@gmail.com')
    )
  );

-- create_board_post: add an owner-only, geofence-bypassing branch for
-- kramesbutte specifically, as an explicit early return. Every other
-- resort_key falls through to the unchanged distance check below —
-- this is NOT implemented as a large geofence_radius_miles value, so
-- there's no number here that could be mistaken for a real, satisfiable
-- distance requirement.
CREATE OR REPLACE FUNCTION public.create_board_post(
  p_resort_key TEXT, p_category TEXT, p_content TEXT, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION
)
RETURNS mountain_board_posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_resort   resort_coordinates%ROWTYPE;
  v_distance DOUBLE PRECISION;
  v_post     mountain_board_posts;
  v_is_owner BOOLEAN;
BEGIN
  IF p_resort_key = 'kramesbutte' THEN
    SELECT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND u.email = 'raykyle1104@gmail.com')
      INTO v_is_owner;
    IF NOT v_is_owner THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    INSERT INTO mountain_board_posts (author_id, resort_key, category, content, post_lat, post_lng)
    VALUES (auth.uid(), p_resort_key, p_category, trim(p_content), p_lat, p_lng)
    RETURNING * INTO v_post;

    RETURN v_post;
  END IF;

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
