-- Migration 024: User theme preference
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'blizzard'
  CHECK (theme IN ('blizzard', 'alpine-dawn', 'storm-chaser', 'aurora-peak', 'base-lodge'));
