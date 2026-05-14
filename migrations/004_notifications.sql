-- Migration 004: Notifications table
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('invite','rsvp','host_update','chat','friend_request','trip_update')),
  title       TEXT NOT NULL,
  body        TEXT,
  trip_id     UUID,
  actor_id    UUID REFERENCES auth.users,
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_created
  ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users see own notifications'
  ) THEN
    CREATE POLICY "Users see own notifications"
      ON notifications FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users update own notifications'
  ) THEN
    CREATE POLICY "Users update own notifications"
      ON notifications FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Authenticated users insert notifications'
  ) THEN
    CREATE POLICY "Authenticated users insert notifications"
      ON notifications FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users delete own notifications'
  ) THEN
    CREATE POLICY "Users delete own notifications"
      ON notifications FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;
