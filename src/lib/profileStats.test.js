import { test } from "node:test"
import assert from "node:assert/strict"
import {
  computeStats,
  formatMinutes,
  seasonDeltaLabel,
  statsFromLeaderboardRow,
} from "./profileStats.js"

// ── computeStats ────────────────────────────────────────────────────────────
// Untested until now (2026-09-08) even though it feeds every number on the
// Profile page, the share card, and the milestone checks.

test("computeStats over no sessions is all zeros, not NaN", () => {
  assert.deepEqual(computeStats([]), {
    days: 0, vertical: 0, miles: 0, powderDays: 0, resorts: 0,
    topResort: null, totalRuns: 0, topSpeed: null, timeOnMountain: 0,
  })
})

test("computeStats sums vertical, miles, runs and minutes", () => {
  const s = computeStats([
    { vertical_feet: 12000, miles_skied: 14.25, runs_logged: 9, time_on_mountain_min: 300, resort_name: "winter-park" },
    { vertical_feet: 8000,  miles_skied: 10.05, runs_logged: 6, time_on_mountain_min: 240, resort_name: "copper" },
  ])
  assert.equal(s.days, 2)
  assert.equal(s.vertical, 20000)
  assert.equal(s.miles, 24.3)          // one decimal, not 24.299999999999997
  assert.equal(s.totalRuns, 15)
  assert.equal(s.timeOnMountain, 540)
  assert.equal(s.resorts, 2)
})

test("computeStats treats missing numeric fields as zero", () => {
  const s = computeStats([{ resort_name: "eldora" }, { resort_name: "eldora" }])
  assert.equal(s.vertical, 0)
  assert.equal(s.miles, 0)
  assert.equal(s.totalRuns, 0)
  assert.equal(s.timeOnMountain, 0)
  assert.equal(s.resorts, 1)
})

test("computeStats counts powder days and picks the most-visited resort", () => {
  const s = computeStats([
    { resort_name: "winter-park", is_powder_day: true },
    { resort_name: "winter-park" },
    { resort_name: "copper", is_powder_day: true },
  ])
  assert.equal(s.powderDays, 2)
  assert.equal(s.topResort, "winter-park")
})

test("computeStats topSpeed is the max, and null when nobody recorded one", () => {
  assert.equal(computeStats([{ top_speed_mph: 41 }, { top_speed_mph: 52 }, {}]).topSpeed, 52)
  assert.equal(computeStats([{}, {}]).topSpeed, null)
})

// ── formatMinutes ───────────────────────────────────────────────────────────

test("formatMinutes renders hours and minutes, and an em dash for nothing", () => {
  assert.equal(formatMinutes(0), "—")
  assert.equal(formatMinutes(null), "—")
  assert.equal(formatMinutes(undefined), "—")
  assert.equal(formatMinutes(59), "0h 59m")
  assert.equal(formatMinutes(540), "9h 0m")
  assert.equal(formatMinutes(545), "9h 5m")
})

// ── seasonDeltaLabel ────────────────────────────────────────────────────────

test("seasonDeltaLabel needs both seasons", () => {
  assert.equal(seasonDeltaLabel(null, { days: 3 }), null)
  assert.equal(seasonDeltaLabel({ days: 3 }, null), null)
  assert.equal(seasonDeltaLabel({ days: 3 }, undefined), null)
})

test("seasonDeltaLabel reads up, down and level, and singularises one day", () => {
  assert.equal(seasonDeltaLabel({ days: 8 }, { days: 5 }), "↑ 3 more days than last season")
  assert.equal(seasonDeltaLabel({ days: 6 }, { days: 5 }), "↑ 1 more day than last season")
  assert.equal(seasonDeltaLabel({ days: 4 }, { days: 5 }), "↓ 1 fewer day than last season")
  assert.equal(seasonDeltaLabel({ days: 2 }, { days: 5 }), "↓ 3 fewer days than last season")
  assert.equal(seasonDeltaLabel({ days: 5 }, { days: 5 }), "Same days on mountain as last season")
})

// ── statsFromLeaderboardRow ─────────────────────────────────────────────────
// The friend-profile view has no session rows to run computeStats over — it gets
// one aggregate row from getLeaderboard(). Both shapes feed the SAME two strip
// components, so if their key sets ever drift the friend view silently renders
// blanks. That is what the first test here exists to catch.

test("statsFromLeaderboardRow produces exactly computeStats' key set", () => {
  assert.deepEqual(
    Object.keys(statsFromLeaderboardRow({})).sort(),
    Object.keys(computeStats([])).sort(),
  )
})

test("statsFromLeaderboardRow renames the leaderboard's columns", () => {
  const row = {
    id: "u1", name: "Sam", days: 12, verticalFt: 96000, milesSki: 71.5,
    powderDays: 3, resorts: 4, topResort: "winter-park",
    totalRuns: 118, topSpeed: 47, timeOnMountain: 1980,
  }
  assert.deepEqual(statsFromLeaderboardRow(row), {
    days: 12, vertical: 96000, miles: 71.5, powderDays: 3, resorts: 4,
    topResort: "winter-park", totalRuns: 118, topSpeed: 47, timeOnMountain: 1980,
  })
})

test("statsFromLeaderboardRow defaults missing counts to 0 and missing facts to null", () => {
  const s = statsFromLeaderboardRow({ days: 2 })
  assert.equal(s.days, 2)
  assert.equal(s.vertical, 0)
  assert.equal(s.miles, 0)
  assert.equal(s.powderDays, 0)
  assert.equal(s.resorts, 0)
  assert.equal(s.totalRuns, 0)
  assert.equal(s.timeOnMountain, 0)
  assert.equal(s.topResort, null)
  assert.equal(s.topSpeed, null)
})
