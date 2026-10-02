/**
 * Pure date-window logic for the crowdsourced conditions-reports widget: how far back a ski
 * day's snow/crowd report still counts as "recent" on a resort's page.
 *
 * Lives in its own file rather than skiDayDetails.js, because that module's header states it
 * imports NOTHING on purpose and this needs localDateKey(). Mirrors skiDayNudge.js's
 * nudgeCutoffDateKey() exactly — same DST-safe local-date-part arithmetic, same reason: a UTC
 * or millisecond-subtraction cutoff drifts by a day around timezone/DST boundaries.
 */

import { localDateKey } from "./calendarDates.js"

/**
 * How far back the "Recent Reports" widget looks. Long enough that a lower-traffic resort's
 * widget doesn't look empty for days at a time; short enough that a three-week-old report —
 * actively misleading about today's conditions — never shows up as current.
 */
export const CONDITIONS_REPORT_WINDOW_DAYS = 14

/**
 * The oldest session_date still inside the window, as a "YYYY-MM-DD" key.
 *
 * Built from local date parts (new Date(y, mIndex, d - N)), not millisecond subtraction — see
 * nudgeCutoffDateKey's header comment in skiDayNudge.js for the DST/UTC reasoning this mirrors
 * exactly. The Date constructor normalizes day overflow across months, years, and leap days on
 * its own, so no month-length arithmetic is needed here.
 */
export function conditionsReportCutoffDateKey(now = new Date()) {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - CONDITIONS_REPORT_WINDOW_DAYS)
  return localDateKey(cutoff)
}
