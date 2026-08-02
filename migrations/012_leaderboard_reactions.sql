-- Migration 012: Leaderboard emoji reactions
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS leaderboard_reactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  stat_type      TEXT NOT NULL,
  emoji          TEXT NOT NULL CHECK (emoji IN ('🎿','❄️','🔥','👑')),
  season         TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, target_user_id, stat_type, season)
);

CREATE INDEX IF NOT EXISTS leaderboard_reactions_target
  ON leaderboard_reactions (target_user_id, stat_type, season);

ALTER TABLE leaderboard_reactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'leaderboard_reactions' AND policyname = 'Auth users view reactions'
  ) THEN
    CREATE POLICY "Auth users view reactions"
      ON leaderboard_reactions FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'leaderboard_reactions' AND policyname = 'Users manage own reactions'
  ) THEN
    CREATE POLICY "Users manage own reactions"
      ON leaderboard_reactions FOR ALL
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
