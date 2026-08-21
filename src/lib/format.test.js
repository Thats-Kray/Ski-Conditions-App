import { test } from "node:test"
import assert from "node:assert/strict"
import { etaToTimeInput, snapToQuarterHour, formatEtaShort } from "./format.js"

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
