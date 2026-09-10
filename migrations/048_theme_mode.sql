-- Migration 048: Light/dark mode preference
-- Independent of the `theme` column added by 024 — `theme` picks one of the 5
-- cosmetic palettes, `theme_mode` picks light or dark within it. Defaults to
-- 'dark' for every existing row and every new signup, so nothing changes for
-- anyone until they flip the toggle in Profile > Appearance.
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme_mode TEXT NOT NULL DEFAULT 'dark'
  CHECK (theme_mode IN ('dark', 'light'));
