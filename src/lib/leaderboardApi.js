import { supabase } from "./supabase"
import { getCurrentUser } from "./socialApi"

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

// ── Log a ski day ─────────────────────────────────────────────────────────────

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
  return data
}

export async function deleteSkiDay(sessionId) {
  const { error } = await supabase
    .from("ski_sessions")
    .delete()
    .eq("id", sessionId)
  if (error) throw error
}

// ── Fetch my sessions ─────────────────────────────────────────────────────────

export async function getMySessions(startYear) {
  const user = await getCurrentUser()
  if (!user) return []
  const { from, to } = seasonDateRange(startYear)

  const { data, error } = await supabase
    .from("ski_sessions")
    .select("*")
    .eq("user_id", user.id)
    .gte("session_date", from)
    .lte("session_date", to)
    .order("session_date", { ascending: false })

  if (error) throw error
  return data || []
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export async function getLeaderboard(startYear) {
  const user = await getCurrentUser()
  if (!user) return []

  const { from, to } = seasonDateRange(startYear)

  // Get accepted friend IDs
  const { data: friendships } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

  const friendIds = (friendships || []).map((f) =>
    f.requester_id === user.id ? f.addressee_id : f.requester_id
  )
  const allIds = [user.id, ...friendIds]

  // Fetch profiles
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url, skill_level")
    .in("id", allIds)

  // Fetch sessions for all users in date range
  const { data: sessions, error } = await supabase
    .from("ski_sessions")
    .select("user_id, resort_name, session_date, is_powder_day, vertical_feet, miles_skied")
    .in("user_id", allIds)
    .gte("session_date", from)
    .lte("session_date", to)

  if (error) throw error

  // Aggregate per user
  const entries = (profiles || []).map((profile) => {
    const userSessions = (sessions || []).filter((s) => s.user_id === profile.id)
    const days        = userSessions.length
    const resorts     = new Set(userSessions.map((s) => s.resort_name)).size
    const powderDays  = userSessions.filter((s) => s.is_powder_day).length
    const verticalFt  = userSessions.reduce((sum, s) => sum + (s.vertical_feet || 0), 0)
    const milesSki    = userSessions.reduce((sum, s) => sum + (s.miles_skied || 0), 0)
    const topResortMap = {}
    userSessions.forEach((s) => { topResortMap[s.resort_name] = (topResortMap[s.resort_name] || 0) + 1 })
    const topResort = Object.entries(topResortMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    return {
      ...profile,
      isMe: profile.id === user.id,
      days,
      resorts,
      powderDays,
      verticalFt,
      milesSki: parseFloat(milesSki.toFixed(1)),
      topResort,
    }
  })

  return entries
}
