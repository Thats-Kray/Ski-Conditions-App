import { test } from "node:test"
import assert from "node:assert/strict"
import {
  NUDGE_RECENCY_DAYS,
  nudgeCutoffDateKey,
  isWithinNudgeWindow,
  isSessionUntouched,
  nudgeDismissKey,
} from "./skiDayNudge.js"

// ── nudgeCutoffDateKey ──────────────────────────────────────────────────────
//
// Every Date below is constructed from LOCAL parts (new Date(y, mIndex, d, …)),
// so every expected key holds in every timezone the test runner might be in.

test("NUDGE_RECENCY_DAYS is 7", () => {
  assert.equal(NUDGE_RECENCY_DAYS, 7)
})

test("nudgeCutoffDateKey returns the local date exactly 7 days back", () => {
  assert.equal(nudgeCutoffDateKey(new Date(2026, 2, 10, 12, 0)), "2026-03-03")
})

test("nudgeCutoffDateKey crosses a month boundary", () => {
  // 2026-03-05 minus 7 days walks back through Mar 1 into February, which has 28
  // days in 2026. Off-by-one here silently changes who gets nudged.
  assert.equal(nudgeCutoffDateKey(new Date(2026, 2, 5)), "2026-02-26")
})

test("nudgeCutoffDateKey crosses a year boundary", () => {
  assert.equal(nudgeCutoffDateKey(new Date(2026, 0, 3)), "2025-12-27")
})

test("nudgeCutoffDateKey handles a leap February", () => {
  // 2028 is a leap year, so Feb has 29 days and 2028-03-05 minus 7 is Feb 27,
  // not Feb 26 as it would be in a common year.
  assert.equal(nudgeCutoffDateKey(new Date(2028, 2, 5)), "2028-02-27")
})

test("nudgeCutoffDateKey is DST-safe across America/Denver's spring forward", () => {
  // Denver springs forward at 02:00 on 2026-03-08. Computing this cutoff as
  // `Date.now() - 7 * 864e5` from 2026-03-10T00:30 local lands on 2026-03-02,
  // one day early, because the interval spans a 23-hour day. Date-part
  // arithmetic never touches a clock offset, so it stays on 2026-03-03.
  assert.equal(nudgeCutoffDateKey(new Date(2026, 2, 10, 0, 30)), "2026-03-03")
})

// ── isWithinNudgeWindow ─────────────────────────────────────────────────────

const NOW = new Date(2026, 2, 10, 9, 0) // cutoff is 2026-03-03

test("isWithinNudgeWindow includes a session skied exactly 7 days ago", () => {
  // The inclusive far edge is the whole point of the window: someone who skied a
  // week ago and has not opened the app since is precisely who this nudges.
  assert.equal(isWithinNudgeWindow("2026-03-03", NOW), true)
})

test("isWithinNudgeWindow excludes a session skied 8 days ago", () => {
  assert.equal(isWithinNudgeWindow("2026-03-02", NOW), false)
})

test("isWithinNudgeWindow includes today, and does not cap the future", () => {
  assert.equal(isWithinNudgeWindow("2026-03-10", NOW), true)
  // Deliberate: the DB query is a single .gte(), and a JS upper bound the query
  // does not have is how the two drift apart.
  assert.equal(isWithinNudgeWindow("2026-03-11", NOW), true)
})

test("isWithinNudgeWindow rejects a non-date string instead of comparing it", () => {
  // Without the format guard this is TRUE: "not-a-date" > "2026-03-03" is a
  // perfectly ordinary lexicographic comparison, and a garbage session_date
  // would nudge forever.
  assert.equal(isWithinNudgeWindow("not-a-date", NOW), false)
})

test("isWithinNudgeWindow rejects an unpadded date key", () => {
  // "2026-3-3" is the same day as "2026-03-03" but sorts AFTER "2026-12-31",
  // so accepting it would break the comparison for every other input too.
  assert.equal(isWithinNudgeWindow("2026-3-3", NOW), false)
})

test("isWithinNudgeWindow rejects null, undefined, empty string and non-strings", () => {
  assert.equal(isWithinNudgeWindow(null, NOW), false)
  assert.equal(isWithinNudgeWindow(undefined, NOW), false)
  assert.equal(isWithinNudgeWindow("", NOW), false)
  assert.equal(isWithinNudgeWindow(20260303, NOW), false)
})

// ── isSessionUntouched ──────────────────────────────────────────────────────

test("isSessionUntouched is true only when title, photos and tags are ALL empty", () => {
  assert.equal(isSessionUntouched({ title: null, photos: [], tags: [] }), true)
  assert.equal(isSessionUntouched({ title: null, photos: null, tags: null }), true)
  assert.equal(isSessionUntouched({}), true)
  assert.equal(isSessionUntouched(), true)
})

test("isSessionUntouched is false when any one of the three is present", () => {
  // "All three empty", not "any one missing" — a user who titled the day made a
  // choice, and nudging them again is nagging.
  assert.equal(isSessionUntouched({ title: "Powder day", photos: [], tags: [] }), false)
  assert.equal(isSessionUntouched({ title: null, photos: [{ id: "p1" }], tags: [] }), false)
  assert.equal(isSessionUntouched({ title: null, photos: [], tags: [{ tagged_user_id: "u1" }] }), false)
})

test("isSessionUntouched treats a whitespace-only title as empty", () => {
  // updateSessionTitle stores clampTitle(title) || null, so "   " round-trips to
  // SQL NULL. Treating it as a real title here would make a session that looks
  // blank in the Feed permanently un-nudgeable.
  assert.equal(isSessionUntouched({ title: "   ", photos: [], tags: [] }), true)
  assert.equal(isSessionUntouched({ title: "", photos: [], tags: [] }), true)
})

// ── nudgeDismissKey ─────────────────────────────────────────────────────────

test("nudgeDismissKey is per-session and refuses a falsy id", () => {
  assert.equal(nudgeDismissKey("abc-123"), "pd_nudge_dismissed_abc-123")
  assert.notEqual(nudgeDismissKey("abc-123"), nudgeDismissKey("def-456"))
  // Never build "pd_nudge_dismissed_null" — one bad id would otherwise dismiss
  // every future session that also arrives with a bad id.
  assert.equal(nudgeDismissKey(null), null)
  assert.equal(nudgeDismissKey(undefined), null)
  assert.equal(nudgeDismissKey(""), null)
})
