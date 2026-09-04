/**
 * Pure decision logic for the Feed slice C2 next-login nudge: is this ski day recent
 * enough to nudge about, and has anybody touched it yet?
 *
 * These live here rather than in skiDayDetails.js because that module's header states it
 * imports NOTHING on purpose, and these need localDateKey(). calendarDates.js is itself
 * import-free and already unit-tested, so `npm test` (node --test, no DOM, no bundler, no
 * Supabase client) still runs this module unmodified.
 *
 * Everything here is a pure function of its arguments — `now` is injected rather than read
 * from the clock so the window boundaries are actually testable.
 */

import { localDateKey } from "./calendarDates.js"

/**
 * How far back the nudge looks. Long enough to catch someone who did not open the app for
 * a few days after skiing; short enough that it never resurfaces a day from a month ago
 * that the user has clearly moved on from.
 *
 * This is the ONLY definition. socialApi.js's .gte(...) filter derives its cutoff from
 * nudgeCutoffDateKey() rather than repeating the number, so the query and the helper
 * cannot disagree.
 */
export const NUDGE_RECENCY_DAYS = 7

/** A session_date as PostgREST returns a DATE column: zero-padded, always 10 chars. */
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The oldest session_date still inside the window, as a "YYYY-MM-DD" key.
 *
 * Built with new Date(y, mIndex, d - N) and formatted with localDateKey() — deliberately
 * NOT `Date.now() - N * 864e5` and deliberately NOT toISOString():
 *
 *   - toISOString() is UTC. calendarDates.js's own header and App.jsx's session_date write
 *     path both warn about it: after the UTC rollover an evening in Colorado already reads
 *     as tomorrow, so a UTC cutoff is a day too new and drops the exact boundary session
 *     the window exists to catch.
 *   - Millisecond subtraction is not DST-safe. Seven days is 167 or 169 hours across a
 *     transition, not 168, so the result can land on the wrong calendar day.
 *
 * The Date constructor normalises day overflow across months, years and leap days on its
 * own, so no month-length arithmetic is needed here.
 */
export function nudgeCutoffDateKey(now = new Date()) {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - NUDGE_RECENCY_DAYS)
  return localDateKey(cutoff)
}

/**
 * Is this session_date inside the nudge window?
 *
 * The format guard is load-bearing, not defensive padding: date keys are compared as
 * STRINGS, and "not-a-date" >= "2026-03-03" is true. A row with a malformed session_date
 * would otherwise be treated as recent forever. Unpadded keys ("2026-3-3") are rejected
 * for the same reason — they sort after every padded key in December.
 *
 * There is no upper bound. The Supabase query is a single .gte(), and a JS-only ceiling
 * is how the two implementations of "recent" quietly stop agreeing.
 */
export function isWithinNudgeWindow(sessionDateKey, now = new Date()) {
  if (typeof sessionDateKey !== "string" || !DATE_KEY_RE.test(sessionDateKey)) return false
  return sessionDateKey >= nudgeCutoffDateKey(now)
}

/**
 * Has nobody touched this ski day at all?
 *
 * "Incomplete" is ALL THREE empty, never "any one missing". A user who typed a title but
 * skipped photos used the feature and made a choice; nudging them again is nagging. This
 * is for a day nobody has looked at since it was logged.
 *
 * A whitespace-only title counts as empty because that is what the storage layer does:
 * updateSessionTitle writes clampTitle(title) || null, and clampTitle trims.
 *
 * Callers pass the shapes their sources actually return — `photos` from getSessionPhotos()
 * and `tags` from getSessionTags(), both flat arrays — and only .length is read, so no
 * field of either row shape is depended on here.
 */
export function isSessionUntouched({ title, photos, tags } = {}) {
  if (typeof title === "string" && title.trim() !== "") return false
  if (photos?.length) return false
  if (tags?.length) return false
  return true
}

/**
 * The per-session localStorage dismissal key, mirroring OffseasonBanner's
 * "pd_offseason_banner_26" shape.
 *
 * Per-session and not global: dismissing today's prompt must not suppress next week's.
 * Returns null for a falsy id so a caller can never write "pd_nudge_dismissed_undefined",
 * which one bad row would turn into a permanent dismissal of every other bad row.
 */
export function nudgeDismissKey(sessionId) {
  return sessionId ? `pd_nudge_dismissed_${sessionId}` : null
}
