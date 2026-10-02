import { test } from "node:test"
import assert from "node:assert/strict"
import { CONDITIONS_REPORT_WINDOW_DAYS, conditionsReportCutoffDateKey } from "./conditionsReportWindow.js"

// Every Date below is constructed from LOCAL parts (new Date(y, mIndex, d, …)), so every
// expected key holds in every timezone the test runner might be in — same convention as
// skiDayNudge.test.js's cutoff tests, which this mirrors.

test("CONDITIONS_REPORT_WINDOW_DAYS is 14", () => {
  assert.equal(CONDITIONS_REPORT_WINDOW_DAYS, 14)
})

test("conditionsReportCutoffDateKey returns the local date exactly 14 days back", () => {
  assert.equal(conditionsReportCutoffDateKey(new Date(2026, 2, 10, 12, 0)), "2026-02-24")
})

test("conditionsReportCutoffDateKey crosses a month boundary", () => {
  // 2026-03-05 minus 14 days walks back through Mar 1 into February, which has 28 days in
  // 2026 (not a leap year). Off-by-one here silently widens or narrows the whole window.
  assert.equal(conditionsReportCutoffDateKey(new Date(2026, 2, 5)), "2026-02-19")
})

test("conditionsReportCutoffDateKey crosses a year boundary", () => {
  assert.equal(conditionsReportCutoffDateKey(new Date(2026, 0, 3)), "2025-12-20")
})

test("conditionsReportCutoffDateKey handles a leap February", () => {
  // 2028 is a leap year, so Feb has 29 days and 2028-03-05 minus 14 is Feb 20, not Feb 19 as
  // it would be in a common year.
  assert.equal(conditionsReportCutoffDateKey(new Date(2028, 2, 5)), "2028-02-20")
})

test("conditionsReportCutoffDateKey is DST-safe across America/Denver's spring forward", () => {
  // Denver springs forward at 02:00 on 2026-03-08. Computing this cutoff as
  // `Date.now() - 14 * 864e5` from 2026-03-10T00:30 local would land one day off because the
  // interval spans a 23-hour day. Date-part arithmetic (getFullYear/getMonth/getDate, never a
  // raw millisecond subtraction) never touches a clock offset, so it stays correct.
  assert.equal(conditionsReportCutoffDateKey(new Date(2026, 2, 10, 0, 30)), "2026-02-24")
})
