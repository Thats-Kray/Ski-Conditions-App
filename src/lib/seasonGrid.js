/**
 * Geometry and colour-tier logic for the Profile page's Season grid
 * (TASK 22.0, Profile slice).
 *
 * Lives in lib/ rather than beside SeasonCalendar.jsx so it is covered by
 * `npm test` — the repo's only runner is `node --test src/lib/*.test.js`, with
 * no DOM. Same split as calendarDates.js and profileStats.js.
 *
 * Date keys are ALWAYS built from local date parts via dateKeyOf(), never
 * toISOString(): ski_sessions.session_date is a plain date string, and a UTC
 * key shifts every cell one day for anyone in a negative-offset timezone
 * (i.e. all of Colorado), silently mismatching the whole grid.
 */

import { dateKeyOf } from "./calendarDates.js"

/** The mockup's fixed-column grid (PowDays Reorg Mockup.dc.html:462). */
export const SEASON_GRID_COLUMNS = 18

/**
 * Vertical-feet boundaries between the three non-powder tiers, in feet. A
 * Colorado day runs roughly 10-25k vertical, so: under 10k reads as a half day
 * or a lift-line day, 10-25k as a normal day, 25k and up as a big day.
 */
export const VERTICAL_TIER_BREAKS = [10000, 25000]

/**
 * Colour intensity for one grid cell.
 *
 *   0  no session logged that day
 *   1  logged, under 10k vertical (or vertical not recorded)
 *   2  logged, 10k-25k vertical
 *   3  logged, 25k+ vertical
 *   4  powder day — always top tier regardless of vertical, because a powder
 *      day is the thing the grid exists to show and short powder days are
 *      common (first chair, then the mountain closes on wind hold by noon).
 *
 * @param {{is_powder_day?: boolean, vertical_feet?: number|string|null}|null|undefined} session
 * @returns {0|1|2|3|4}
 */
export function sessionTier(session) {
  if (!session) return 0
  if (session.is_powder_day) return 4
  const vert = Number(session.vertical_feet)
  const feet = Number.isFinite(vert) ? vert : 0
  if (feet >= VERTICAL_TIER_BREAKS[1]) return 3
  if (feet >= VERTICAL_TIER_BREAKS[0]) return 2
  return 1
}

/**
 * Every local date key in one ski season, Oct 1 through May 31 — the same
 * window seasonDateRange() uses in leaderboardApi.js, so the grid can never
 * show a day the season's own session query would have excluded.
 *
 * 243 keys, 244 in a leap season. Bounded by construction: no input makes this
 * grow, which is why the grid is safe to render as one page of cells with no
 * virtualisation, and why the All-Time toggle deliberately does not widen it
 * (Deviation 1).
 *
 * @param {number} startYear the season's opening calendar year
 * @returns {string[]}
 */
export function seasonDayKeys(startYear) {
  const keys = []
  const end = new Date(startYear + 1, 4, 31)   // May 31
  const cur = new Date(startYear, 9, 1)        // Oct 1
  while (cur <= end) {
    keys.push(dateKeyOf(cur.getFullYear(), cur.getMonth(), cur.getDate()))
    cur.setDate(cur.getDate() + 1)
  }
  return keys
}
