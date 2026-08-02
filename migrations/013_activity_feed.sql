-- Migration 013: Activity feed + reactions
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS activity_feed (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('ski_session','trip_rsvp','trip_created')),
  subject_id   UUID,
  subject_type TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_feed_created ON activity_feed (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_feed_actor ON activity_feed (actor_id);

ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_feed' AND policyname = 'Friends and self view activity') THEN
    CREATE POLICY "Friends and self view activity" ON activity_feed FOR SELECT TO authenticated
      USING (
        actor_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM friend_requests fr
          WHERE fr.status = 'accepted'
            AND ((fr.requester_id = auth.uid() AND fr.recipient_id = activity_feed.actor_id)
              OR (fr.recipient_id = auth.uid() AND fr.requester_id = activity_feed.actor_id))
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_feed' AND policyname = 'Authenticated users insert own activity') THEN
    CREATE POLICY "Authenticated users insert own activity" ON activity_feed FOR INSERT TO authenticated
      WITH CHECK (actor_id = auth.uid());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS activity_feed_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID REFERENCES activity_feed(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  emoji       TEXT NOT NULL CHECK (emoji IN ('🎿','❄️','🔥','👑')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, user_id)
);

ALTER TABLE activity_feed_reactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_feed_reactions' AND policyname = 'Auth users view activity reactions') THEN
    CREATE POLICY "Auth users view activity reactions" ON activity_feed_reactions FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_feed_reactions' AND policyname = 'Users manage own activity reaction') THEN
    CREATE POLICY "Users manage own activity reaction" ON activity_feed_reactions FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
