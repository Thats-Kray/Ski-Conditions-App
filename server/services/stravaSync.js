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

// Returns the ski/snowboard activities from this season that AREN'T already
// in ski_sessions, for the user to review before anything is written. Reads
// only — no writes happen here.
function getCurrentSeasonStart() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // 1-12
  // Mirrors src/lib/leaderboardApi.js's getCurrentSeason(): Oct–Apr counts
  // as the season starting that October; Jan–Apr counts as the season that
  // started the previous October.
  const startYear = month >= 10 ? year : year - 1
  return new Date(`${startYear}-10-01T00:00:00Z`)
}

export async function previewSyncableActivities(userId) {
  const accessToken = await getValidStravaToken(userId)
  const supabase = getSupabase()

  const { data: existing, error: existingErr } = await supabase
    .from("ski_sessions")
    .select("strava_activity_id")
    .eq("user_id", userId)
    .not("strava_activity_id", "is", null)

  if (existingErr) throw new Error(existingErr.message)
  const alreadyImported = new Set((existing || []).map((r) => r.strava_activity_id))

  const seasonStart = getCurrentSeasonStart()
  const afterEpoch = Math.floor(seasonStart.getTime() / 1000)

  let page = 1
  const candidates = []
  let skippedNonSki = 0

  while (true) {
    const url = `https://www.strava.com/api/v3/athlete/activities?per_page=100&page=${page}&after=${afterEpoch}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      throw new Error(`Strava API error ${res.status} on page ${page}`)
    }

    const activities = await res.json()
    if (!activities.length) break

    for (const activity of activities) {
      if (!SKI_SPORT_TYPES.has(activity.sport_type)) {
        skippedNonSki++
        continue
      }
      if (alreadyImported.has(activity.id)) continue

      candidates.push({
        stravaActivityId: activity.id,
        name:             activity.name || "Strava Activity",
        date:             activity.start_date.slice(0, 10),
        verticalFeet:     metersToFeet(activity.total_elevation_gain),
        milesSkied:       metersToMiles(activity.distance),
        topSpeedMph:      mpsToMph(activity.max_speed),
        movingTimeSecs:   activity.moving_time ?? null,
      })
    }

    page++
  }

  return { activities: candidates, skippedNonSki }
}

// Writes only the activities the caller explicitly selected. Re-fetches each
// one's full data from Strava by ID rather than trusting any stat values in
// `selections` — the client only ever contributes stravaActivityId,
// resortName, and (optionally) notes. This is what keeps a sync-time payload
// from being able to inject fabricated vertical/speed/etc. numbers.
export async function commitSyncedActivities(userId, selections) {
  const accessToken = await getValidStravaToken(userId)
  const supabase = getSupabase()

  let synced = 0
  const failed = []

  for (const sel of selections) {
    try {
      const res = await fetch(`https://www.strava.com/api/v3/activities/${sel.stravaActivityId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!res.ok) throw new Error(`Strava activity fetch failed: ${res.status}`)

      const activity = await res.json()

      if (!SKI_SPORT_TYPES.has(activity.sport_type)) {
        throw new Error(`Not a ski activity: ${activity.sport_type}`)
      }

      const row = activityToSession(activity, userId)
      row.resort_name = sel.resortName
      if (sel.notes) row.notes = sel.notes

      const { error } = await supabase
        .from("ski_sessions")
        .upsert(row, { onConflict: "strava_activity_id", ignoreDuplicates: false })

      if (error) throw new Error(error.message)
      synced++
    } catch (err) {
      failed.push({ stravaActivityId: sel.stravaActivityId, message: err.message })
    }
  }

  return { synced, failed }
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
