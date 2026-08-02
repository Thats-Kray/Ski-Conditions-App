import { supabase } from "./supabase"
import { getCurrentUser, getAcceptedFriends, logActivity } from "./socialApi"
import { computeSegmentStats, computeSessionSummary } from "./useGpsTracker"

// ── Season helpers ────────────────────────────────────────────────────────────

export function getCurrentSeason() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // 1-12
  // Ski season: Oct–Apr. Oct–Dec = year/year+1, Jan–Apr = prev/year
  const startYear = month >= 10 ? year : year - 1
  return { startYear, label: `${startYear}–${String(startYear + 1).slice(2)}` }
}

function seasonDateRange(startYear) {
  return {
    from: `${startYear}-10-01`,
    to:   `${startYear + 1}-05-31`,
  }
}

// ── Log a ski day ──────────────────────────────────────────────────────────────

export async function logSkiDay({ resortName, sessionDate, isPowderDay = false, notes = null, tripId = null }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in to log a ski day.")

  const { data, error } = await supabase
    .from("ski_sessions")
    .upsert(
      { user_id: user.id, resort_name: resortName, session_date: sessionDate, is_powder_day: isPowderDay, notes, trip_id: tripId },
      { onConflict: "user_id,session_date,resort_name" }
    )
    .select()
    .single()

  if (error) throw error

  await logActivity("ski_session", { subjectId: data.id, subjectType: "ski_sessions", metadata: { resort_name: data.resort_name, is_powder_day: data.is_powder_day } })

  return data
}

export async function deleteSkiDay(sessionId) {
  const { error } = await supabase
    .from("ski_sessions")
    .delete()
    .eq("id", sessionId)
  if (error) throw error
}

// ── Update a session's manual stats (runs, vertical, miles, top speed) ────────

export async function updateSessionStats(sessionId, stats) {
  const { data, error } = await supabase
    .from("ski_sessions")
    .update(stats)
    .eq("id", sessionId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Fetch my sessions ─────────────────────────────────────────────────────────

export async function getMySessions(startYear) {
  const user = await getCurrentUser()
  if (!user) return []
  const { from, to } = seasonDateRange(startYear)
  const today = new Date().toISOString().slice(0, 10)

  // Fetch logged sessions + past trip attendance in parallel
  const [{ data: sessions, error }, { data: rsvps }, { data: hosted }] = await Promise.all([
    supabase
      .from("ski_sessions")
      .select("*")
      .eq("user_id", user.id)
      .gte("session_date", from)
      .lte("session_date", to)
      .order("session_date", { ascending: false }),

    // "Going" RSVPs on past trips — catches trips RSVPd while still future
    supabase
      .from("trip_rsvps")
      .select("trip_id, ski_trips!inner(resort_key, ski_date)")
      .eq("user_id", user.id)
      .eq("status", "going"),

    // Trips the user hosted that are in the past
    supabase
      .from("ski_trips")
      .select("id, resort_key, ski_date")
      .eq("host_id", user.id)
      .lte("ski_date", today)
      .gte("ski_date", from)
      .lte("ski_date", to),
  ])

  if (error) throw error

  // Build index of already-logged (date:resort) keys
  const loggedKeys = new Set((sessions || []).map(s => `${s.session_date}:${s.resort_name}`))

  // Collect trip-sourced entries that fall in the season and have no session yet
  const tripEntries = [
    ...(rsvps || []).map(r => ({
      trip_id: r.trip_id,
      resort_name: r.ski_trips?.resort_key,
      session_date: r.ski_trips?.ski_date,
    })),
    ...(hosted || []).map(t => ({
      trip_id: t.id,
      resort_name: t.resort_key,
      session_date: t.ski_date,
    })),
  ].filter(e =>
    e.resort_name &&
    e.session_date &&
    e.session_date <= today &&
    e.session_date >= from &&
    e.session_date <= to &&
    !loggedKeys.has(`${e.session_date}:${e.resort_name}`)
  )

  // Deduplicate trip entries by (date, resort)
  const seen = new Set()
  const uniqueTrips = tripEntries.filter(e => {
    const key = `${e.session_date}:${e.resort_name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Background-upsert the gaps so future loads are instant
  if (uniqueTrips.length > 0) {
    supabase
      .from("ski_sessions")
      .upsert(
        uniqueTrips.map(e => ({ user_id: user.id, resort_name: e.resort_name, session_date: e.session_date, trip_id: e.trip_id })),
        { onConflict: "user_id,session_date,resort_name" }
      )
      .then(() => {}).catch(() => {})
  }

  // Merge: real sessions take priority (they may have vertical_feet etc.)
  const synthetic = uniqueTrips.map(e => ({
    id: `trip-${e.trip_id}`,
    user_id: user.id,
    resort_name: e.resort_name,
    session_date: e.session_date,
    trip_id: e.trip_id,
    is_powder_day: false,
    vertical_feet: null,
    miles_skied: null,
    created_at: null,
  }))

  return [...(sessions || []), ...synthetic]
    .sort((a, b) => (b.session_date || "").localeCompare(a.session_date || ""))
}

// ── Leaderboard (via SECURITY DEFINER RPC — bypasses RLS) ────────────────────

async function fetchLeaderboard(startYear, mode) {
  const user = await getCurrentUser()
  if (!user) return []

  const { data, error } = await supabase.rpc("get_leaderboard", {
    p_start_year: startYear,
    p_mode: mode,
  })

  if (error) throw error

  return (data || []).map((row) => ({
    id:          row.id,
    full_name:   row.full_name,
    username:    row.username,
    avatar_url:  row.avatar_url,
    skill_level: row.skill_level,
    isMe:        row.id === user.id,
    days:        Number(row.days),
    resorts:     Number(row.resorts),
    powderDays:  Number(row.powder_days),
    verticalFt:  Number(row.vertical_ft),
    milesSki:    parseFloat(Number(row.miles_ski).toFixed(1)),
    topResort:   row.top_resort,
  }))
}

export async function getLeaderboard(startYear) {
  const user = await getCurrentUser()
  if (!user) return []

  // The DB's friends-mode filter may be stale, so we merge client-side:
  // 1. Public RPC (SECURITY DEFINER) reads all sessions regardless of RLS
  // 2. getAcceptedFriends() gives us the full friend profile list
  // 3. Filter public results to self + friends, then backfill friends with 0 days
  const [publicRows, friends] = await Promise.all([
    (async () => {
      const { data, error } = await supabase.rpc("get_leaderboard", {
        p_start_year: startYear,
        p_mode: "public",
      })
      if (error) throw error
      return data || []
    })(),
    getAcceptedFriends(),
  ])

  const friendIdSet = new Set(friends.map((f) => f.id))
  friendIdSet.add(user.id)

  const rowMap = new Map()
  for (const row of publicRows) {
    if (friendIdSet.has(row.id)) rowMap.set(row.id, row)
  }

  // Friends with no sessions this season still appear with 0 stats
  for (const friend of friends) {
    if (!rowMap.has(friend.id)) {
      rowMap.set(friend.id, {
        id: friend.id, full_name: friend.full_name, username: friend.username,
        avatar_url: friend.avatar_url, skill_level: friend.skill_level,
        days: 0, resorts: 0, powder_days: 0, vertical_ft: 0, miles_ski: 0, top_resort: null,
      })
    }
  }

  return [...rowMap.values()].map((row) => ({
    id:          row.id,
    full_name:   row.full_name,
    username:    row.username,
    avatar_url:  row.avatar_url,
    skill_level: row.skill_level,
    isMe:        row.id === user.id,
    days:        Number(row.days || 0),
    resorts:     Number(row.resorts || 0),
    powderDays:  Number(row.powder_days || 0),
    verticalFt:  Number(row.vertical_ft || 0),
    milesSki:    parseFloat(Number(row.miles_ski || 0).toFixed(1)),
    topResort:   row.top_resort,
  }))
}

export async function getPublicLeaderboard(startYear) {
  return fetchLeaderboard(startYear, "public")
}

// ── GPS session flush (Sprint 3) ────────────────────────────────────────────────

/**
 * Writes a completed GPS session to Supabase.
 * 1. Upserts/creates the ski_sessions row
 * 2. Batch-inserts all run/lift segments into ski_runs
 * 3. Updates ski_sessions summary columns
 *
 * @param {Object} params
 * @param {string} params.sessionId  - existing ski_sessions UUID (from "Start My Day")
 * @param {Array}  params.rawSegments - segments returned by stopTracking()
 * @param {string} params.startedAt  - ISO timestamp when session started
 * @param {string} params.endedAt    - ISO timestamp when session ended
 * @returns {Promise<{session, runs}>}
 */
export async function flushSessionToSupabase({ sessionId, rawSegments, startedAt, endedAt }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in")

  // Compute per-segment stats
  let runNumber = 0
  const processedSegments = rawSegments
    .map((seg) => {
      if (seg.type === "run") runNumber++
      return computeSegmentStats(seg, runNumber)
    })
    .filter(Boolean)

  // Compute session summary
  const summary = computeSessionSummary(processedSegments)

  // Insert all ski_runs rows
  const runRows = processedSegments.map((seg) => ({
    ...seg,
    session_id: sessionId,
  }))

  // Skip the insert call entirely when there's nothing to write — PostgREST
  // can reject an insert with an empty row array, and an empty session
  // (e.g. tracking started then immediately stopped) should still succeed.
  let runs = []
  if (runRows.length > 0) {
    const { data, error: runsError } = await supabase
      .from("ski_runs")
      .insert(runRows)
      .select()

    if (runsError) throw new Error(`ski_runs insert failed: ${runsError.message}`)
    runs = data
  }

  // Update ski_sessions with summary stats + timestamps
  const { data: session, error: sessionError } = await supabase
    .from("ski_sessions")
    .update({
      ...summary,
      session_started_at: startedAt,
      session_ended_at:   endedAt,
    })
    .eq("id", sessionId)
    .select()
    .single()

  if (sessionError) throw new Error(`ski_sessions update failed: ${sessionError.message}`)

  return { session, runs }
}
