import { test } from "node:test"
import assert from "node:assert/strict"
import { etaToTimeInput, snapToQuarterHour, formatEtaShort, formatSessionStat } from "./format.js"

test("an ISO timestamp round-trips to a zero-padded HH:MM local time", () => {
  const d = new Date(2026, 0, 15, 14, 5, 0) // 2:05 PM local
  assert.equal(etaToTimeInput(d.toISOString()), "14:05")
})

test("null input returns null", () => {
  assert.equal(etaToTimeInput(null), null)
})

test("undefined input returns null", () => {
  assert.equal(etaToTimeInput(undefined), null)
})

test("an unparseable string returns null, not \"NaN:NaN\"", () => {
  assert.equal(etaToTimeInput("not a time"), null)
})

test("single-digit hour and minute are both zero-padded", () => {
  const d = new Date(2026, 0, 15, 5, 3, 0) // 5:03 AM local
  assert.equal(etaToTimeInput(d.toISOString()), "05:03")
})

test("snapToQuarterHour leaves an exact quarter hour alone", () => {
  assert.equal(snapToQuarterHour("08:00"), "08:00")
  assert.equal(snapToQuarterHour("08:15"), "08:15")
  assert.equal(snapToQuarterHour("08:30"), "08:30")
  assert.equal(snapToQuarterHour("08:45"), "08:45")
})

test("snapToQuarterHour rounds to the nearest quarter at every boundary", () => {
  assert.equal(snapToQuarterHour("08:07"), "08:00")
  assert.equal(snapToQuarterHour("08:08"), "08:15")
  assert.equal(snapToQuarterHour("08:22"), "08:15")
  assert.equal(snapToQuarterHour("08:23"), "08:30")
  assert.equal(snapToQuarterHour("08:37"), "08:30")
  assert.equal(snapToQuarterHour("08:38"), "08:45")
  assert.equal(snapToQuarterHour("08:52"), "08:45")
})

test("snapToQuarterHour carries into the next hour past :52", () => {
  assert.equal(snapToQuarterHour("08:53"), "09:00")
  assert.equal(snapToQuarterHour("08:59"), "09:00")
})

test("snapToQuarterHour wraps midnight rather than producing hour 24", () => {
  assert.equal(snapToQuarterHour("23:53"), "00:00")
})

test("snapToQuarterHour zero-pads a single-digit hour", () => {
  assert.equal(snapToQuarterHour("9:07"), "09:00")
})

test("snapToQuarterHour returns null for empty or unparseable input", () => {
  assert.equal(snapToQuarterHour(null), null)
  assert.equal(snapToQuarterHour(undefined), null)
  assert.equal(snapToQuarterHour(""), null)
  assert.equal(snapToQuarterHour("not a time"), null)
  assert.equal(snapToQuarterHour("25:00"), null)
  assert.equal(snapToQuarterHour("08:99"), null)
})

test("formatEtaShort renders a stored ETA as a wall-clock time", () => {
  const iso = new Date(2026, 7, 22, 9, 0, 0).toISOString()
  // Locale-dependent punctuation, so assert on the parts rather than the exact
  // string — "9:00 AM" on en-US, "09:00" elsewhere.
  const out = formatEtaShort(iso)
  assert.match(out, /\b0?9[:.]00\b/)
})

test("formatEtaShort keeps the minutes on a half-hour ETA", () => {
  assert.match(formatEtaShort(new Date(2026, 7, 22, 8, 45, 0).toISOString()), /\b0?8[:.]45\b/)
})

test("formatEtaShort returns null rather than a label for a missing ETA", () => {
  // Returning null, not "No ETA": the three component copies this replaces
  // disagreed on the empty case, so the shared helper stays neutral and each
  // caller supplies its own fallback text.
  assert.equal(formatEtaShort(null), null)
  assert.equal(formatEtaShort(undefined), null)
  assert.equal(formatEtaShort(""), null)
})

test("formatEtaShort returns null for an unparseable value", () => {
  assert.equal(formatEtaShort("not a date"), null)
})

// ── formatSessionStat ────────────────────────────────────────────────────────
// Column names are ski_sessions' real ones: runs_logged and vertical_feet.
// (total_runs / vertical_ft are the get_leaderboard RPC's aggregate alias and
// ski_runs' per-segment column — neither exists on ski_sessions.)
// Number formatting is pinned to "en-US" in the implementation, so these exact
// strings are deterministic on any full-ICU Node build (the default).

test("formatSessionStat renders runs, vertical and the powder flag in the mockup's order", () => {
  assert.equal(
    formatSessionStat({ runs_logged: 18, vertical_feet: 24300, is_powder_day: true }),
    "18 runs · 24,300 ft · 🌨 powder day"
  )
})

test("formatSessionStat thousands-separates a six-figure vertical", () => {
  assert.equal(formatSessionStat({ vertical_feet: 124300 }), "124,300 ft")
})

test("formatSessionStat renders runs and vertical without a powder flag", () => {
  assert.equal(
    formatSessionStat({ runs_logged: 12, vertical_feet: 18500, is_powder_day: false }),
    "12 runs · 18,500 ft"
  )
})

test("formatSessionStat renders runs alone when no vertical was entered", () => {
  assert.equal(formatSessionStat({ runs_logged: 9, vertical_feet: null, is_powder_day: false }), "9 runs")
})

test("formatSessionStat renders vertical alone when no runs were entered", () => {
  assert.equal(formatSessionStat({ runs_logged: null, vertical_feet: 8200, is_powder_day: false }), "8,200 ft")
})

test("formatSessionStat renders the powder flag alone when nothing else was entered", () => {
  assert.equal(formatSessionStat({ runs_logged: null, vertical_feet: null, is_powder_day: true }), "🌨 powder day")
})

test("formatSessionStat omits a zero run count rather than rendering \"0 runs\"", () => {
  // runs_logged is `INT DEFAULT 0` (migration 010), so a session whose owner
  // never opened the stats form reads 0, not null. Zero is "not logged here".
  assert.equal(formatSessionStat({ runs_logged: 0, vertical_feet: null, is_powder_day: true }), "🌨 powder day")
  assert.equal(formatSessionStat({ runs_logged: 0, vertical_feet: 0, is_powder_day: false }), "")
})

test("formatSessionStat uses the singular for exactly one run", () => {
  assert.equal(formatSessionStat({ runs_logged: 1 }), "1 run")
})

test("formatSessionStat returns an empty string for a session with no stats at all", () => {
  assert.equal(formatSessionStat({ runs_logged: null, vertical_feet: null, is_powder_day: false }), "")
  assert.equal(formatSessionStat({}), "")
})

test("formatSessionStat returns an empty string for a missing session", () => {
  // The caller passes item.sessionStats straight through; that is null for a
  // ski_session activity whose session row was later deleted.
  assert.equal(formatSessionStat(null), "")
  assert.equal(formatSessionStat(undefined), "")
})

test("formatSessionStat formats numerics that arrive as strings", () => {
  // PostgREST hands back numeric/int8 columns as strings in some shapes; the
  // formatter coerces rather than emitting "NaN ft".
  assert.equal(formatSessionStat({ runs_logged: "18", vertical_feet: "24300" }), "18 runs · 24,300 ft")
})

test("formatSessionStat rounds a fractional vertical to whole feet", () => {
  assert.equal(formatSessionStat({ vertical_feet: 24300.6 }), "24,301 ft")
})
