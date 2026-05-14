-- Migration 007: "Down to ski?" quick pings
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

CREATE TABLE IF NOT EXISTS ski_pings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID REFERENCES auth.users NOT NULL,
  message     TEXT,
  resort_key  TEXT,
  ski_date    DATE,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '3 days'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ski_pings_sender ON ski_pings (sender_id);

CREATE TABLE IF NOT EXISTS ski_ping_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ping_id     UUID REFERENCES ski_pings ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users NOT NULL,
  response    TEXT NOT NULL CHECK (response IN ('yes','maybe','no')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ping_id, user_id)
);

CREATE TABLE IF NOT EXISTS ski_ping_recipients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ping_id     UUID REFERENCES ski_pings ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users NOT NULL,
  UNIQUE (ping_id, user_id)
);

ALTER TABLE ski_pings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ski_ping_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ski_ping_recipients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- ski_pings
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_pings' AND policyname='Pings visible to recipients') THEN
    CREATE POLICY "Pings visible to recipients" ON ski_pings FOR SELECT TO authenticated
      USING (sender_id = auth.uid() OR EXISTS (SELECT 1 FROM ski_ping_recipients WHERE ping_id = ski_pings.id AND user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_pings' AND policyname='Authenticated can create pings') THEN
    CREATE POLICY "Authenticated can create pings" ON ski_pings FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_pings' AND policyname='Sender can delete ping') THEN
    CREATE POLICY "Sender can delete ping" ON ski_pings FOR DELETE TO authenticated USING (sender_id = auth.uid());
  END IF;

  -- ski_ping_recipients
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_ping_recipients' AND policyname='Recipients visible to sender') THEN
    CREATE POLICY "Recipients visible to sender" ON ski_ping_recipients FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_ping_recipients' AND policyname='Sender adds recipients') THEN
    CREATE POLICY "Sender adds recipients" ON ski_ping_recipients FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  -- ski_ping_responses
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_ping_responses' AND policyname='Responses visible to ping participants') THEN
    CREATE POLICY "Responses visible to ping participants" ON ski_ping_responses FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_ping_responses' AND policyname='Users respond own') THEN
    CREATE POLICY "Users respond own" ON ski_ping_responses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_ping_responses' AND policyname='Users update own response') THEN
    CREATE POLICY "Users update own response" ON ski_ping_responses FOR UPDATE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
