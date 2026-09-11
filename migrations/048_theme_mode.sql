-- Migration 048: Light/dark mode preference
-- Independent of the `theme` column added by 024 — `theme` picks one of the 5
-- cosmetic palettes, `theme_mode` picks light or dark within it. Defaults to
-- 'dark' for every existing row and every new signup, so nothing changes for
-- anyone until they flip the toggle in Profile > Appearance.
--
-- ORDER OF OPERATIONS MATTERS — APPLY THIS BEFORE DEPLOYING THE BRANCH:
--   1. Run this whole file (the ALTER *and* the GRANT) in the Supabase SQL Editor.
--   2. NOTIFY pgrst, 'reload schema';
--   3. Only then deploy/push the frontend code.
-- Getting that order wrong breaks the app two different ways:
--   * Deploying the code first (column absent): `upsertMyProfile` sends
--     `theme_mode` on every profile write, so EVERY profile save fails with
--     PostgREST error PGRST204 ("column not found in schema cache").
--   * Running the ALTER without the GRANT below: `profiles` has NO table-level
--     SELECT grant — migration 031 revoked it and replaced it with an explicit
--     column list, and a table-level grant is what would have covered new
--     columns automatically. `PROFILE_SELECT_COLUMNS` in src/lib/socialApi.js
--     now names `theme_mode`, so getMyProfile(), upsertMyProfile() (every save,
--     via RETURNING) and signUpWithProfile() all fail with Postgres error 42501
--     ("permission denied for column theme_mode").
--
-- Only SELECT needs a column-level grant here. INSERT and UPDATE on public.profiles
-- are still table-level (031 only column-scoped SELECT), so they cover a new column
-- automatically.
--
-- ROLLBACK, if anything breaks:
--   ALTER TABLE profiles DROP COLUMN IF EXISTS theme_mode;
--   (the column grant disappears with the column)

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme_mode TEXT NOT NULL DEFAULT 'dark'
  CHECK (theme_mode IN ('dark', 'light'));

GRANT SELECT (theme_mode) ON public.profiles TO authenticated, anon;
