/**
 * Pure season-stat helpers shared by the own-profile and friend-profile views.
 *
 * These live in lib/ rather than beside the ProfileStats components so that
 * ProfileStats.jsx exports only components — react-refresh/only-export-components
 * errors otherwise, and the repo already keeps pure helpers here (format.js).
 */

export function computeStats(sessions) {
  const days       = sessions.length
  const vertical   = sessions.reduce((s, r) => s + (r.vertical_feet  || 0), 0)
  const miles      = sessions.reduce((s, r) => s + (r.miles_skied    || 0), 0)
  const powderDays = sessions.filter(r => r.is_powder_day).length
  const resortSet  = new Set(sessions.map(r => r.resort_name).filter(Boolean))
  const resorts    = resortSet.size

  const counts = {}
  for (const s of sessions) {
    if (s.resort_name) counts[s.resort_name] = (counts[s.resort_name] || 0) + 1
  }
  const topResort = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null

  const totalRuns       = sessions.reduce((acc, s) => acc + (s.runs_logged || 0), 0)
  const topSpeed         = sessions.reduce((max, s) => (s.top_speed_mph != null && (max == null || s.top_speed_mph > max) ? s.top_speed_mph : max), null)
  const timeOnMountain   = sessions.reduce((acc, s) => acc + (s.time_on_mountain_min || 0), 0)

  return { days, vertical, miles: parseFloat(miles.toFixed(1)), powderDays, resorts, topResort, totalRuns, topSpeed, timeOnMountain }
}

export function formatMinutes(mins) {
  if (!mins) return "—"
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}
