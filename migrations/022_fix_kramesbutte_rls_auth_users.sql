-- Migration 022: Fix migration 021's RLS policies — they referenced
-- auth.users directly, but RLS policy expressions run with the querying
-- role's privileges (authenticated), which has no SELECT grant on
-- auth.users. This broke ALL reads of mountain_board_posts and
-- resort_coordinates for every resort, not just kramesbutte, because
-- Postgres checks privileges on every relation referenced by a policy
-- at plan time, regardless of which branch of an OR would actually be
-- taken. Fix: move the auth.users lookup into a SECURITY DEFINER helper
-- function, which runs with the function owner's privileges (postgres),
-- who CAN read auth.users.

CREATE OR REPLACE FUNCTION public.is_kramesbutte_owner()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid() AND u.email = 'raykyle1104@gmail.com'
  );
$$;

REVOKE ALL ON FUNCTION public.is_kramesbutte_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_kramesbutte_owner() TO authenticated;

DROP POLICY IF EXISTS "Authenticated can read resort coordinates" ON resort_coordinates;
CREATE POLICY "Authenticated can read resort coordinates" ON resort_coordinates
  FOR SELECT TO authenticated
  USING (
    resort_key <> 'kramesbutte'
    OR (SELECT public.is_kramesbutte_owner())
  );

DROP POLICY IF EXISTS "Authenticated can read visible posts" ON mountain_board_posts;
CREATE POLICY "Authenticated can read visible posts" ON mountain_board_posts
  FOR SELECT TO authenticated
  USING (
    NOT is_hidden AND expires_at > NOW()
    AND (
      resort_key <> 'kramesbutte'
      OR (SELECT public.is_kramesbutte_owner())
    )
  );
