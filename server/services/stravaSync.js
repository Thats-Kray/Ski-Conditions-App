import { createClient } from "@supabase/supabase-js"
import { getValidStravaToken } from "../routes/strava.js"

const SKI_SPORT_TYPES = new Set([
  "AlpineSki", "BackcountrySki", "Snowboard", "NordicSki", "Snowshoe"
])

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

function metersToFeet(m) {
  return m != null ? Math.round(m * 3.28084) : null
}

function metersToMiles(m) {
  return m != null ? Math.round((m / 1609.34) * 10) / 10 : null
}

function mpsToMph(mps) {
  return mps != null ? Math.round(mps * 2.23694 * 10) / 10 : null
}

// NOTE on field mapping (deviates from the Sprint 2 brief's example code):
// The live `ski_sessions` table schema was verified directly against Supabase
// before writing this file, and differs from the brief's assumed column names:
//   - the vertical gain column is `vertical_feet`, not `vertical_ft`
//     (`vertical_ft` is only the alias used by the get_leaderboard RPC output,
//     not an actual column on ski_sessions — see src/lib/leaderboardApi.js)
//   - there is no `time_on_mountain_min` column; the real column is
//     `moving_time_secs` (integer, stored in seconds — no /60 conversion)
//   - there is no `avg_speed_mph` column at all, so `average_speed` from
//     Strava is intentionally not persisted
// Mapping here targets the real schema so upserts don't fail with
// "column does not exist".
function activityToSession(activity, userId) {
  return {
    user_id:             userId,
    // Strava doesn't provide resort name — user can update later
    resort_name:         "Strava Import",
    session_date:        activity.start_date.slice(0, 10),
    notes:               activity.name || null,
    strava_activity_id:  activity.id,
    vertical_feet:       metersToFeet(activity.total_elevation_gain),
    miles_skied:         metersToMiles(activity.distance),
    moving_time_secs:    activity.moving_time ?? null,
    top_speed_mph:       mpsToMph(activity.max_speed),
    is_powder_day:       false,
  }
}

/**
 * Syncs all ski/snowboard activities for a user from Strava.
 * Returns { synced, skipped, errors } counts.
 */
export async function syncUserActivities(userId) {
  const accessToken = await getValidStravaToken(userId)
  const supabase = getSupabase()

  let page = 1
  let synced = 0
  let skipped = 0
  const errors = []

  while (true) {
    const url = `https://www.strava.com/api/v3/athlete/activities?per_page=100&page=${page}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      throw new Error(`Strava API error ${res.status} on page ${page}`)
    }

    const activities = await res.json()

    // Empty page = we've fetched everything
    if (!activities.length) break

    const skiActivities = activities.filter(a => SKI_SPORT_TYPES.has(a.sport_type))
    skipped += activities.length - skiActivities.length

    for (const activity of skiActivities) {
      const row = activityToSession(activity, userId)

      const { error } = await supabase
        .from("ski_sessions")
        .upsert(row, {
          onConflict: "strava_activity_id",
          ignoreDuplicates: false,  // update existing rows on re-sync
        })

      if (error) {
        errors.push({ activityId: activity.id, message: error.message })
      } else {
        synced++
      }
    }

    page++
  }

  return { synced, skipped, errors }
}

/**
 * Syncs a single Strava activity by ID.
 * Used by the webhook handler for new activity events.
 */
export async function syncSingleActivity(userId, stravaActivityId) {
  const accessToken = await getValidStravaToken(userId)
  const supabase = getSupabase()

  const res = await fetch(`https://www.strava.com/api/v3/activities/${stravaActivityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) throw new Error(`Strava activity fetch failed: ${res.status}`)

  const activity = await res.json()

  if (!SKI_SPORT_TYPES.has(activity.sport_type)) {
    return { skipped: true, reason: `Not a ski activity: ${activity.sport_type}` }
  }

  const row = activityToSession(activity, userId)
  const { error } = await supabase
    .from("ski_sessions")
    .upsert(row, { onConflict: "strava_activity_id", ignoreDuplicates: false })

  if (error) throw new Error(error.message)
  return { synced: true }
}
