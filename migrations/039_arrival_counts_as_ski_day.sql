-- Migration 039: checking in as "Arrived" counts as a ski day
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS
--
-- Kyle, 2026-08-25: "when a user checks in for their ski day as 'Arrived' it should count
-- towards their ski day count. They don't need to track activity in order for the ski day to
-- be added to their season stats and leaderboard."
--
-- Being on the mountain is the ski day. GPS tracking is optional colour on top of it, and
-- requiring it meant the people who just ski showed a season total of zero.
--
-- WHY THIS IS A TRIGGER AND NOT APP CODE
--
-- Several paths set status='arrived': markArrival(), SkiCheckInForm's submit through
-- buildPlanUpsert(), and anything added later. Patching each one is the exact mistake that
-- produced TASK 19.6 — a writer census that was wrong by one, for months, because it was
-- maintained by hand. A trigger on daily_plans covers every writer that exists now and every
-- writer anyone adds later, without anyone having to remember.
--
-- get_leaderboard counts ski_sessions rows directly, so one insert here feeds both the season
-- stats and the leaderboard. No second write path.
--
-- PART TWO IS NOT OPTIONAL: resort_name normalisation.
--
-- ski_sessions.resort_name was being written two different ways:
--   trip-derived and Strava -> raw keys      'vail', 'winterpark', 'arapahoebasin'
--   manually logged         -> display names 'Vail', 'Winter Park', 'Arapahoe Basin'
--
-- The UNIQUE constraint is (user_id, session_date, resort_name), so 'vail' and 'Vail' are
-- DIFFERENT ROWS. Today that has not double-counted any day, purely because the two styles
-- happen to fall on different dates -- verified, 0 collisions. But this trigger writes
-- daily_plans.resort_key, which is a raw key, so from now on a day that is both checked into
-- AND manually logged would become two ski days. The feature cannot be correct without
-- picking one spelling first.
--
-- The key wins: it is what daily_plans, ski_trips and resorts.js all use, and the UI already
-- renders keys through resortName(). It also fixes a live bug in get_leaderboard, which does
-- count(distinct resort_name) and therefore currently reports 'Vail' and 'vail' as two
-- different resorts visited.
--
-- Only three display names exist in the data. 'Strava Import' and 'Unknown Resort' are
-- sentinels, not resorts, and are deliberately left alone.
--
-- ROLLBACK, if anything breaks:
--   DROP TRIGGER IF EXISTS daily_plans_log_arrival ON daily_plans;
--   DROP FUNCTION IF EXISTS public.log_session_on_arrival();
--   -- and to undo the rename (this is the complete list; nothing else was touched):
--   UPDATE ski_sessions SET resort_name='Arapahoe Basin' WHERE resort_name='arapahoebasin' AND trip_id IS NULL;
--   UPDATE ski_sessions SET resort_name='Vail'           WHERE resort_name='vail'          AND trip_id IS NULL;
--   UPDATE ski_sessions SET resort_name='Winter Park'    WHERE resort_name='winterpark'    AND trip_id IS NULL;
--   -- NOTE the trip_id IS NULL guard: without it this would also rename the trip-derived
--   -- rows that were already keys and were never changed by this migration.

BEGIN;

-- ── 1. Normalise resort_name to canonical keys ──────────────────────────────
-- Mirrors RESORT_NAMES in src/lib/resorts.js. Guarded against collisions: if a user somehow
-- already has BOTH spellings for one day, renaming would violate the unique constraint, so
-- those are skipped and left for inspection rather than silently dropped.

UPDATE ski_sessions s
   SET resort_name = m.key
  FROM (VALUES
    ('Vail',            'vail'),
    ('Beaver Creek',    'beavercreek'),
    ('Breckenridge',    'breckenridge'),
    ('Winter Park',     'winterpark'),
    ('Copper Mountain', 'coppermountain'),
    ('Arapahoe Basin',  'arapahoebasin'),
    ('Steamboat',       'steamboat'),
    ('Eldora',          'eldora'),
    ('Aspen Snowmass',  'aspensnowmass')
  ) AS m(display, key)
 WHERE s.resort_name = m.display
   AND NOT EXISTS (
     SELECT 1 FROM ski_sessions dup
      WHERE dup.user_id = s.user_id
        AND dup.session_date = s.session_date
        AND dup.resort_name = m.key
   );

-- ── 2. Arrival writes the ski day ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_session_on_arrival()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- "Open — no preference" is a real resort_key sentinel meaning the user has not picked a
  -- mountain. Arriving at it is not a place, so it cannot be a ski day at one.
  IF NEW.resort_key IS NULL OR NEW.resort_key = 'open' THEN
    RETURN NEW;
  END IF;

  -- DO NOTHING, never DO UPDATE: a session may already exist from Strava, a trip or a manual
  -- log, carrying vertical_feet, notes and stats. A check-in must never overwrite richer data
  -- with a bare row — it only fills the gap when there is nothing there.
  INSERT INTO ski_sessions (user_id, resort_name, session_date, is_powder_day)
  VALUES (NEW.user_id, NEW.resort_key, NEW.ski_date, false)
  ON CONFLICT (user_id, session_date, resort_name) DO NOTHING;

  RETURN NEW;
END;
$$;

-- SECURITY DEFINER is safe here: NEW.user_id is the daily_plans row's owner, and RLS on
-- daily_plans ("users can manage own daily plans", auth.uid() = user_id) means a client can
-- only ever create a row for themselves. The trigger cannot be aimed at another user.
REVOKE ALL ON FUNCTION public.log_session_on_arrival() FROM PUBLIC;

DROP TRIGGER IF EXISTS daily_plans_log_arrival ON public.daily_plans;
CREATE TRIGGER daily_plans_log_arrival
  AFTER INSERT OR UPDATE ON public.daily_plans
  FOR EACH ROW
  WHEN (NEW.status = 'arrived')
  EXECUTE FUNCTION public.log_session_on_arrival();

-- ── 3. Backfill anyone already checked in as arrived ────────────────────────
-- The trigger only fires on future writes, so without this a user who is already marked
-- arrived would have to check in again to be credited.

INSERT INTO ski_sessions (user_id, resort_name, session_date, is_powder_day)
SELECT dp.user_id, dp.resort_key, dp.ski_date, false
  FROM daily_plans dp
 WHERE dp.status = 'arrived'
   AND dp.resort_key IS NOT NULL
   AND dp.resort_key <> 'open'
ON CONFLICT (user_id, session_date, resort_name) DO NOTHING;

COMMIT;
