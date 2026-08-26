-- AUDIT (not a migration): phantom trip-derived ski days
--
-- Run in the Supabase SQL Editor. Section 1 is read-only. Section 2 deletes and is commented
-- out on purpose — read section 1's output first, every time.
--
-- WHAT THIS LOOKS FOR
--
-- Before Sprint 37, leaderboardApi.getMySessions capped trip-derived sessions at "today" using
-- new Date().toISOString().slice(0,10). That is the UTC date, which becomes TOMORROW after
-- ~5pm Mountain. Entries passing the cap are then background-upserted into ski_sessions
-- (leaderboardApi.js:139-146), so on any evening the app was open, a trip scheduled for the
-- NEXT day could be persisted as a day already skied.
--
-- Fixed in Sprint 37 (localDateKey + a no-restricted-syntax lint rule that bans the pattern),
-- so this cannot recur. This script exists to clean up anything the bug left behind.
--
-- RESULT WHEN FIRST RUN, 2026-08-25: zero rows. All 10 trip-derived sessions were created on
-- or after the day they claim. Triggering the bug needed an RSVP'd or hosted trip dated
-- exactly tomorrow, during the evening window, and that combination never occurred.
--
-- WHY THE SIGNATURE IS "CREATED BEFORE THE DAY IT CLAIMS" AND NOT "IN THE FUTURE"
--
-- A future-dated session is the obvious tell, but it is a self-erasing one: the phantom was
-- written for tomorrow, and by the time anyone looks, tomorrow has passed and the row is
-- indistinguishable from a legitimate one. Comparing session_date against the row's OWN
-- created_at survives that, because it asks whether the day had actually happened when the
-- row was written.
--
-- America/Denver, not UTC. Comparing against a UTC date would reintroduce the very bug being
-- audited: a session legitimately created at 8pm Mountain looks like "tomorrow" in UTC.

-- ── 1. Inspect (read-only) ──────────────────────────────────────────────────

SELECT
  s.id,
  s.user_id,
  p.username,
  s.session_date,
  s.resort_name,
  s.trip_id,
  s.created_at,
  (s.created_at AT TIME ZONE 'America/Denver')::date AS created_local_date,
  s.session_date - (s.created_at AT TIME ZONE 'America/Denver')::date AS days_early,
  -- A row carrying real stats was skied, whatever its provenance. Never delete these.
  (s.vertical_feet IS NOT NULL
   OR s.miles_skied IS NOT NULL
   OR s.strava_activity_id IS NOT NULL
   OR s.notes IS NOT NULL)                                            AS has_real_data
FROM ski_sessions s
LEFT JOIN profiles p ON p.id = s.user_id
WHERE s.trip_id IS NOT NULL                                    -- only the auto-created ones
  AND s.session_date > (s.created_at AT TIME ZONE 'America/Denver')::date
ORDER BY s.session_date DESC;

-- ── 2. Delete (commented out — uncomment only after reading section 1) ──────
--
-- Restricted to trip-derived rows with no real data. A manually logged day is the user's own
-- statement about their weekend and is not this script's business, even if its date looks odd.
--
-- BEGIN;
--
-- DELETE FROM ski_sessions s
--  WHERE s.trip_id IS NOT NULL
--    AND s.session_date > (s.created_at AT TIME ZONE 'America/Denver')::date
--    AND s.vertical_feet IS NULL
--    AND s.miles_skied IS NULL
--    AND s.strava_activity_id IS NULL
--    AND s.notes IS NULL;
--
-- -- Check the count matches section 1 before committing. ROLLBACK; if it does not.
-- COMMIT;

-- ── 3. Related check: is any single day counted twice? ──────────────────────
-- Not the same bug. ski_sessions is UNIQUE on (user_id, session_date, resort_name), and
-- resort_name used to be written both as a key ('vail') and as a display name ('Vail'), which
-- made those two different rows for one day. Migration 039 normalised the existing rows to
-- keys; this re-checks. Expect zero.

SELECT user_id, session_date,
       array_agg(resort_name ORDER BY resort_name) AS spellings,
       count(*) AS rows_for_one_day
FROM ski_sessions
WHERE resort_name NOT IN ('Strava Import', 'Unknown Resort')
GROUP BY user_id, session_date, lower(replace(replace(resort_name, ' ', ''), '-', ''))
HAVING count(*) > 1;
