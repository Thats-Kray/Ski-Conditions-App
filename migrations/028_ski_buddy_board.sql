-- Migration 028: Ski Buddy Board (Sprint 31)
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

-- Attribution for moderation_flags rows — Sprint 30 left this column out
-- since the moderation route had no real caller yet; it does now (below).
ALTER TABLE moderation_flags ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Constrained tag list for riding_style — keep this array in sync with
-- RIDING_STYLES in src/lib/skiBuddyOptions.js if it ever changes.
CREATE OR REPLACE FUNCTION public.valid_riding_styles(p_styles TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE AS $$
  SELECT p_styles IS NOT NULL
     AND array_length(p_styles, 1) > 0
     AND p_styles <@ ARRAY['beginner_friendly','cruiser','park_terrain','backcountry_curious','advanced_expert','anyone_chill']::text[];
$$;

CREATE TABLE IF NOT EXISTS ski_buddy_posts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pass_type           TEXT NOT NULL CHECK (pass_type IN ('ikon', 'epic', 'independent', 'other')),
  resort_key          TEXT NOT NULL REFERENCES resort_coordinates(resort_key),
  ski_date            DATE NOT NULL,
  riding_style        TEXT[] NOT NULL CHECK (public.valid_riding_styles(riding_style)),
  group_size_wanted   INT,
  carpool_status      TEXT NOT NULL DEFAULT 'none' CHECK (carpool_status IN ('offering', 'needing', 'none')),
  carpool_seats       INT,
  description         TEXT,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'expired', 'removed')),
  is_held_for_review  BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ski_buddy_posts_browse ON ski_buddy_posts (ski_date, status);
CREATE INDEX IF NOT EXISTS ski_buddy_posts_user ON ski_buddy_posts (user_id);

CREATE TABLE IF NOT EXISTS ski_buddy_responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID NOT NULL REFERENCES ski_buddy_posts(id) ON DELETE CASCADE,
  responder_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, responder_id)
);

ALTER TABLE ski_buddy_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ski_buddy_responses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_buddy_posts' AND policyname='ski_buddy_posts_select') THEN
    CREATE POLICY "ski_buddy_posts_select" ON ski_buddy_posts FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR (NOT is_held_for_review AND status IN ('open','filled') AND ski_date >= CURRENT_DATE)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_buddy_posts' AND policyname='ski_buddy_posts_update_own') THEN
    CREATE POLICY "ski_buddy_posts_update_own" ON ski_buddy_posts FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_buddy_responses' AND policyname='ski_buddy_responses_select') THEN
    CREATE POLICY "ski_buddy_responses_select" ON ski_buddy_responses FOR SELECT TO authenticated
      USING (
        responder_id = auth.uid()
        OR EXISTS (SELECT 1 FROM ski_buddy_posts WHERE id = ski_buddy_responses.post_id AND user_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_buddy_responses' AND policyname='ski_buddy_responses_update_by_post_owner') THEN
    CREATE POLICY "ski_buddy_responses_update_by_post_owner" ON ski_buddy_responses FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM ski_buddy_posts WHERE id = ski_buddy_responses.post_id AND user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM ski_buddy_posts WHERE id = ski_buddy_responses.post_id AND user_id = auth.uid()));
  END IF;

  -- No INSERT policies on either table — writes go through the
  -- SECURITY DEFINER RPCs below, matching Sprint 29/30's convention.
END $$;

CREATE OR REPLACE FUNCTION public.create_ski_buddy_post(
  p_pass_type TEXT, p_resort_key TEXT, p_ski_date DATE, p_riding_style TEXT[],
  p_group_size_wanted INT, p_carpool_status TEXT, p_carpool_seats INT, p_description TEXT
)
RETURNS ski_buddy_posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row ski_buddy_posts;
BEGIN
  IF NOT public.is_verified(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_VERIFIED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM resort_coordinates WHERE resort_key = p_resort_key) THEN
    RAISE EXCEPTION 'UNKNOWN_RESORT';
  END IF;

  IF p_ski_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'SKI_DATE_IN_PAST';
  END IF;

  INSERT INTO ski_buddy_posts (
    user_id, pass_type, resort_key, ski_date, riding_style,
    group_size_wanted, carpool_status, carpool_seats, description
  )
  VALUES (
    auth.uid(), p_pass_type, p_resort_key, p_ski_date, p_riding_style,
    p_group_size_wanted, p_carpool_status, p_carpool_seats, p_description
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ski_buddy_post(TEXT,TEXT,DATE,TEXT[],INT,TEXT,INT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ski_buddy_post(TEXT,TEXT,DATE,TEXT[],INT,TEXT,INT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_ski_buddy_post(p_post_id UUID, p_message TEXT)
RETURNS ski_buddy_responses
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_post ski_buddy_posts;
  v_row  ski_buddy_responses;
BEGIN
  IF NOT public.is_verified(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_VERIFIED';
  END IF;

  SELECT * INTO v_post FROM ski_buddy_posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POST_NOT_FOUND';
  END IF;

  IF v_post.user_id = auth.uid() THEN
    RAISE EXCEPTION 'CANNOT_RESPOND_TO_OWN_POST';
  END IF;

  IF v_post.status <> 'open' THEN
    RAISE EXCEPTION 'POST_NOT_OPEN';
  END IF;

  INSERT INTO ski_buddy_responses (post_id, responder_id, message)
  VALUES (p_post_id, auth.uid(), NULLIF(trim(p_message), ''))
  ON CONFLICT (post_id, responder_id) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    SELECT * INTO v_row FROM ski_buddy_responses WHERE post_id = p_post_id AND responder_id = auth.uid();
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_ski_buddy_post(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_ski_buddy_post(UUID, TEXT) TO authenticated;
