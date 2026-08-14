-- Migration 029: Admin capability + moderation-hold release path (Sprint 32, TASK 15.1)
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- Closes the gap left in 028_ski_buddy_board.sql: is_held_for_review could be set
-- true (moderation route) but never back to false. Without a release path, a
-- false-positive moderation flag would permanently hide a post, so this must land
-- before OPENAI_API_KEY goes live in production.
--
-- All access to held posts goes through the SECURITY DEFINER RPCs below. No RLS
-- policy is widened and no GRANT UPDATE on ski_buddy_posts is added or broadened
-- by this migration — release_held_post() runs as the function owner (which
-- bypasses RLS/column grants under SECURITY DEFINER), matching the pattern
-- already used by create_ski_buddy_post()/respond_to_ski_buddy_post().

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Admin-check helper, mirroring is_verified() from 026_verification_infrastructure.sql
-- shape-for-shape (SECURITY DEFINER, explicit search_path, scoped REVOKE/GRANT).
CREATE OR REPLACE FUNCTION public.is_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_admin FROM profiles WHERE id = check_user_id), false);
$$;

REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

-- Releases a held ski_buddy_posts row. Admin-only. Idempotent: releasing a post
-- that is already not held (or calling it twice) is a no-op success, not an error
-- — only POST_NOT_FOUND and NOT_ADMIN raise.
CREATE OR REPLACE FUNCTION public.release_held_post(p_post_id UUID)
RETURNS ski_buddy_posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row ski_buddy_posts;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  SELECT * INTO v_row FROM ski_buddy_posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POST_NOT_FOUND';
  END IF;

  IF v_row.is_held_for_review THEN
    UPDATE ski_buddy_posts
    SET is_held_for_review = false
    WHERE id = p_post_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.release_held_post(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_held_post(UUID) TO authenticated;

-- Lists held posts for the admin release surface. Admin-only. RLS on
-- ski_buddy_posts hides held posts from everyone except their own owner, so
-- without this SECURITY DEFINER RPC the admin surface has nothing to render.
CREATE OR REPLACE FUNCTION public.get_held_posts()
RETURNS TABLE (
  id           UUID,
  user_id      UUID,
  resort_key   TEXT,
  ski_date     DATE,
  description  TEXT,
  created_at   TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_ADMIN';
  END IF;

  RETURN QUERY
  SELECT p.id, p.user_id, p.resort_key, p.ski_date, p.description, p.created_at
  FROM ski_buddy_posts p
  WHERE p.is_held_for_review
  ORDER BY p.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_held_posts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_held_posts() TO authenticated;
