-- Phase 1 gap-fills: Polls, Invites, Themes
-- Run in Supabase SQL Editor after 001_phase1_social.sql

-- 1. Theme on trips
ALTER TABLE ski_trips ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'default';

-- 2. Trip invites (friends + email guests)
CREATE TABLE IF NOT EXISTS trip_invites (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID        NOT NULL REFERENCES ski_trips(id)   ON DELETE CASCADE,
  inviter_id   UUID        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  invitee_id   UUID        REFERENCES auth.users(id)           ON DELETE SET NULL,
  email        TEXT,
  invitee_name TEXT,
  status       TEXT        DEFAULT 'pending',
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE trip_invites ENABLE ROW LEVEL SECURITY;

-- 3. Polls
CREATE TABLE IF NOT EXISTS trip_polls (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    UUID        NOT NULL REFERENCES ski_trips(id)   ON DELETE CASCADE,
  creator_id UUID        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  question   TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trip_poll_options (
  id       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id  UUID    NOT NULL REFERENCES trip_polls(id) ON DELETE CASCADE,
  text     TEXT    NOT NULL,
  position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trip_poll_votes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id    UUID        NOT NULL REFERENCES trip_polls(id)        ON DELETE CASCADE,
  option_id  UUID        NOT NULL REFERENCES trip_poll_options(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (poll_id, user_id)
);

ALTER TABLE trip_polls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_poll_votes   ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies
DO $$
BEGIN
  -- trip_invites
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_invites' AND policyname='Auth users view invites') THEN
    CREATE POLICY "Auth users view invites" ON trip_invites FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_invites' AND policyname='Inviter can insert invites') THEN
    CREATE POLICY "Inviter can insert invites" ON trip_invites FOR INSERT TO authenticated WITH CHECK (inviter_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_invites' AND policyname='Inviter can delete invites') THEN
    CREATE POLICY "Inviter can delete invites" ON trip_invites FOR DELETE TO authenticated USING (inviter_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_invites' AND policyname='Invitee can update status') THEN
    CREATE POLICY "Invitee can update status" ON trip_invites FOR UPDATE TO authenticated USING (invitee_id = auth.uid());
  END IF;

  -- trip_polls
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_polls' AND policyname='Auth users view polls') THEN
    CREATE POLICY "Auth users view polls" ON trip_polls FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_polls' AND policyname='Auth users create polls') THEN
    CREATE POLICY "Auth users create polls" ON trip_polls FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_polls' AND policyname='Creator can delete polls') THEN
    CREATE POLICY "Creator can delete polls" ON trip_polls FOR DELETE TO authenticated USING (creator_id = auth.uid());
  END IF;

  -- trip_poll_options
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_poll_options' AND policyname='Auth users view options') THEN
    CREATE POLICY "Auth users view options" ON trip_poll_options FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_poll_options' AND policyname='Auth users insert options') THEN
    CREATE POLICY "Auth users insert options" ON trip_poll_options FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  -- trip_poll_votes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_poll_votes' AND policyname='Auth users view votes') THEN
    CREATE POLICY "Auth users view votes" ON trip_poll_votes FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_poll_votes' AND policyname='User manages their vote') THEN
    CREATE POLICY "User manages their vote" ON trip_poll_votes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
