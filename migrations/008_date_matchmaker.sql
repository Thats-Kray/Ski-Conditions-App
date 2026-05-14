-- Migration 008: Date Matchmaker — share a date range, friends vote availability
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

CREATE TABLE IF NOT EXISTS date_polls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  UUID REFERENCES auth.users NOT NULL,
  title       TEXT NOT NULL,
  resort_key  TEXT,
  message     TEXT,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS date_polls_creator ON date_polls (creator_id);

CREATE TABLE IF NOT EXISTS date_poll_options (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     UUID REFERENCES date_polls ON DELETE CASCADE NOT NULL,
  ski_date    DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poll_id, ski_date)
);

CREATE TABLE IF NOT EXISTS date_poll_votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id   UUID REFERENCES date_poll_options ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users NOT NULL,
  available   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (option_id, user_id)
);

CREATE TABLE IF NOT EXISTS date_poll_recipients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     UUID REFERENCES date_polls ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users NOT NULL,
  UNIQUE (poll_id, user_id)
);

ALTER TABLE date_polls           ENABLE ROW LEVEL SECURITY;
ALTER TABLE date_poll_options    ENABLE ROW LEVEL SECURITY;
ALTER TABLE date_poll_votes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE date_poll_recipients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- date_polls
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='date_polls' AND policyname='Polls visible to participants') THEN
    CREATE POLICY "Polls visible to participants" ON date_polls FOR SELECT TO authenticated
      USING (creator_id = auth.uid() OR EXISTS (SELECT 1 FROM date_poll_recipients WHERE poll_id = date_polls.id AND user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='date_polls' AND policyname='Authenticated can create date polls') THEN
    CREATE POLICY "Authenticated can create date polls" ON date_polls FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='date_polls' AND policyname='Creator can delete date poll') THEN
    CREATE POLICY "Creator can delete date poll" ON date_polls FOR DELETE TO authenticated USING (creator_id = auth.uid());
  END IF;

  -- date_poll_options
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='date_poll_options' AND policyname='Options visible to authenticated') THEN
    CREATE POLICY "Options visible to authenticated" ON date_poll_options FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='date_poll_options' AND policyname='Creator inserts options') THEN
    CREATE POLICY "Creator inserts options" ON date_poll_options FOR INSERT TO authenticated WITH CHECK (
      EXISTS (SELECT 1 FROM date_polls WHERE id = poll_id AND creator_id = auth.uid())
    );
  END IF;

  -- date_poll_votes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='date_poll_votes' AND policyname='Votes visible to authenticated') THEN
    CREATE POLICY "Votes visible to authenticated" ON date_poll_votes FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='date_poll_votes' AND policyname='Users vote own') THEN
    CREATE POLICY "Users vote own" ON date_poll_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='date_poll_votes' AND policyname='Users update own vote') THEN
    CREATE POLICY "Users update own vote" ON date_poll_votes FOR UPDATE TO authenticated USING (auth.uid() = user_id);
  END IF;

  -- date_poll_recipients
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='date_poll_recipients' AND policyname='Recipients visible to authenticated') THEN
    CREATE POLICY "Recipients visible to authenticated" ON date_poll_recipients FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='date_poll_recipients' AND policyname='Creator adds date poll recipients') THEN
    CREATE POLICY "Creator adds date poll recipients" ON date_poll_recipients FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
