/**
 * Local-date helpers for calendar grids.
 *
 * Date keys are ALWAYS built from local date parts, never toISOString(). Using
 * toISOString() shifts every cell one day east of Greenwich for anyone in a
 * negative-offset timezone (i.e. all of Colorado). Same constraint documented in
 * SeasonCalendar.jsx.
 *
 * These live in lib/ rather than beside PlanCalendar.jsx so that component file
 * exports only a component — react-refresh/only-export-components otherwise
 * errors, and the repo already keeps pure helpers here (format.js, geoMath.js).
 */

export function dateKeyOf(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** Local-date key for a JS Date. Use this instead of toISOString().slice(0,10). */
export function localDateKey(d = new Date()) {
  return dateKeyOf(d.getFullYear(), d.getMonth(), d.getDate())
}

/** First and last date key of the month containing `d`. */
export function monthBounds(d) {
  const start = dateKeyOf(d.getFullYear(), d.getMonth(), 1)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const end = dateKeyOf(d.getFullYear(), d.getMonth(), lastDay)
  return { start, end }
}
