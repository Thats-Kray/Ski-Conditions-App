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

/**
 * The Sunday that starts the week containing `d`, as a JS Date. Shared by
 * weekBounds and weekDayKeys so the two never disagree about which day a week
 * starts on.
 */
function sundayOf(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
}

/**
 * First and last date key of the Sunday–Saturday week containing `d`.
 *
 * Sunday-start matches the "Su Mo Tu We Th Fr Sa" header PlanCalendar renders,
 * so the week view and the month grid never disagree about which column a day
 * belongs in.
 *
 * Built from local date parts for the same reason documented at the top of this
 * file: toISOString() shifts a day east of Greenwich for every negative-offset
 * timezone, which is all of Colorado.
 */
export function weekBounds(d) {
  const sunday = sundayOf(d)
  const saturday = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 6)
  return { start: localDateKey(sunday), end: localDateKey(saturday) }
}

/** The seven date keys of the week containing `d`, Sunday first. */
export function weekDayKeys(d) {
  const sunday = sundayOf(d)
  return Array.from({ length: 7 }, (_, i) =>
    localDateKey(new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i))
  )
}

/**
 * How far the Plans agenda list reaches, in days.
 *
 * Not a mockup-stated number: the mockup shows a plain scrolling list with no
 * navigator, so the window size is this app's choice (design spec decision #1).
 * 21 days forward covers "this weekend and the next two", which is the horizon
 * people actually plan on; 7 days back is what the "Show past days" disclosure
 * reveals and nothing more, because a plan you can no longer act on is history.
 */
export const AGENDA_PAST_DAYS = 7
export const AGENDA_FORWARD_DAYS = 21

/**
 * Hard cap on how far agendaRange will widen for `includeKey`. This value can
 * arrive from untrusted free text (a notification's target_id column has no
 * schema constraint forcing it to be a real date), so widening must never be
 * allowed to reach years out — that would freeze the tab building the range.
 */
export const AGENDA_MAX_WIDEN_DAYS = 180

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The rolling agenda window around `todayKey`, as local date keys.
 *
 * Takes a date KEY, not a Date, on purpose: the caller already holds one from
 * localDateKey(), and a string argument makes the result stable under useMemo —
 * `new Date()` is a fresh object on every render and would refetch the calendar
 * forever.
 *
 * Day arithmetic goes through `new Date(y, m, d + i)`, which normalises month and
 * year rollover for free and is immune to DST. Adding 86_400_000ms would duplicate
 * a key across the spring-forward Sunday; there is a test for exactly that.
 *
 * @param {string} todayKey "YYYY-MM-DD", local, from localDateKey()
 * @param {Object} [opts]
 * @param {number} [opts.past=AGENDA_PAST_DAYS] days before todayKey
 * @param {number} [opts.forward=AGENDA_FORWARD_DAYS] days after todayKey
 * @param {string|null} [opts.includeKey=null] a day that MUST be inside the
 *   window. A notification can point at a ski day past either edge, and a
 *   calendar that cannot show the day you tapped is a dead end. Widens the
 *   relevant side only; never narrows either.
 * @returns {{start: string, end: string, keys: string[]}}
 */
export function agendaRange(todayKey, {
  past = AGENDA_PAST_DAYS, forward = AGENDA_FORWARD_DAYS, includeKey = null,
} = {}) {
  const [y, m, d] = todayKey.split("-").map(Number)
  let back = Math.max(0, past)
  let ahead = Math.max(0, forward)

  if (includeKey && DATE_KEY_RE.test(includeKey) && includeKey !== todayKey) {
    const [iy, im, id] = includeKey.split("-").map(Number)
    // Reject a digit-shaped but calendrically invalid key (e.g. "2026-13-40")
    // rather than letting Date's month/day rollover silently normalize it into
    // an unrelated day far from what was actually asked for.
    if (localDateKey(new Date(iy, im - 1, id)) === includeKey) {
      // Date.UTC on both sides: same construction, so the difference is exact whole
      // days with no DST hour left over to round away.
      const delta = Math.round(
        (Date.UTC(iy, im - 1, id) - Date.UTC(y, m - 1, d)) / 86400000
      )
      // Capped: includeKey can arrive from untrusted notification text, so it
      // must never be able to blow the window out to years — that would block
      // the main thread building millions of date keys.
      const widen = Math.min(Math.abs(delta), AGENDA_MAX_WIDEN_DAYS)
      if (delta > 0) ahead = Math.max(ahead, widen)
      else back = Math.max(back, widen)
    }
  }

  const keys = []
  for (let i = -back; i <= ahead; i++) {
    keys.push(localDateKey(new Date(y, m - 1, d + i)))
  }
  return { start: keys[0], end: keys[keys.length - 1], keys }
}
