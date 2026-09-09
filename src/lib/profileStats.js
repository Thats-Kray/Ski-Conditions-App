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

/**
 * The season-over-season sentence that used to be inline in SeasonStatsCard.
 * Returns null when there is nothing to compare, so the caller can skip the row.
 *
 * @param {{days: number}|null|undefined} stats       this season
 * @param {{days: number}|null|undefined} priorStats  last season
 * @returns {string|null}
 */
export function seasonDeltaLabel(stats, priorStats) {
  if (!stats || !priorStats) return null
  const diff = stats.days - priorStats.days
  if (diff === 0) return "Same days on mountain as last season"
  const n = Math.abs(diff)
  const unit = n === 1 ? "day" : "days"
  return diff > 0
    ? `↑ ${n} more ${unit} than last season`
    : `↓ ${n} fewer ${unit} than last season`
}

/**
 * A friend's profile has no session rows to aggregate — getLeaderboard() already
 * returns one row per accepted friend carrying the same nine facts under
 * different column names. This is the ONLY place that renaming happens.
 *
 * It must keep returning exactly computeStats()' key set: both shapes are handed
 * to the same ProfileStatStrip / ProfileExtraFacts pair, so a key present in one
 * and not the other renders as a silent blank on the friend view only — the
 * render path least likely to be clicked during review. profileStats.test.js
 * asserts the two key sets are equal.
 *
 * @param {object|null|undefined} row a getLeaderboard() row
 */
export function statsFromLeaderboardRow(row) {
  return {
    days:           row?.days           ?? 0,
    vertical:       row?.verticalFt     ?? 0,
    miles:          row?.milesSki       ?? 0,
    powderDays:     row?.powderDays     ?? 0,
    resorts:        row?.resorts        ?? 0,
    topResort:      row?.topResort      ?? null,
    totalRuns:      row?.totalRuns      ?? 0,
    topSpeed:       row?.topSpeed       ?? null,
    timeOnMountain: row?.timeOnMountain ?? 0,
  }
}
