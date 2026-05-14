-- Migration 005: Trip carpool / ride coordination
-- Run in Supabase SQL Editor

-- 1. ride_status on trip_rsvps
ALTER TABLE trip_rsvps
  ADD COLUMN IF NOT EXISTS ride_status TEXT
  CHECK (ride_status IN ('need_ride','driving','have_ride'));

-- 2. Cars / drivers table
CREATE TABLE IF NOT EXISTS trip_carpools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         UUID NOT NULL,
  driver_user_id  UUID REFERENCES auth.users,
  driver_name     TEXT NOT NULL,
  seats_total     INTEGER NOT NULL DEFAULT 3 CHECK (seats_total BETWEEN 1 AND 8),
  car_label       TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trip_carpools_trip_id ON trip_carpools (trip_id);

ALTER TABLE trip_carpools ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_carpools' AND policyname='Carpools visible to authenticated') THEN
    CREATE POLICY "Carpools visible to authenticated" ON trip_carpools FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_carpools' AND policyname='Authenticated can add carpools') THEN
    CREATE POLICY "Authenticated can add carpools" ON trip_carpools FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_carpools' AND policyname='Driver or host can remove carpool') THEN
    CREATE POLICY "Driver or host can remove carpool" ON trip_carpools FOR DELETE TO authenticated
      USING (driver_user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM ski_trips WHERE ski_trips.id = trip_carpools.trip_id AND ski_trips.host_id = auth.uid()
      ));
  END IF;
END $$;

-- 3. Riders claiming seats
CREATE TABLE IF NOT EXISTS trip_carpool_riders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carpool_id  UUID REFERENCES trip_carpools ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (carpool_id, user_id)
);

CREATE INDEX IF NOT EXISTS trip_carpool_riders_carpool ON trip_carpool_riders (carpool_id);

ALTER TABLE trip_carpool_riders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_carpool_riders' AND policyname='Riders visible to authenticated') THEN
    CREATE POLICY "Riders visible to authenticated" ON trip_carpool_riders FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_carpool_riders' AND policyname='Users claim own seat') THEN
    CREATE POLICY "Users claim own seat" ON trip_carpool_riders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trip_carpool_riders' AND policyname='Users release own seat') THEN
    CREATE POLICY "Users release own seat" ON trip_carpool_riders FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
