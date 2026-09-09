import { test } from "node:test"
import assert from "node:assert/strict"
import {
  SEASON_GRID_COLUMNS,
  VERTICAL_TIER_BREAKS,
  seasonDayKeys,
  sessionTier,
} from "./seasonGrid.js"

// ── seasonDayKeys ───────────────────────────────────────────────────────────

test("seasonDayKeys spans Oct 1 through May 31 inclusive", () => {
  const keys = seasonDayKeys(2025)
  assert.equal(keys[0], "2025-10-01")
  assert.equal(keys[keys.length - 1], "2026-05-31")
  assert.equal(keys.length, 243)          // 31+30+31+31+28+31+30+31
})

test("seasonDayKeys picks up the extra day in a leap season", () => {
  const keys = seasonDayKeys(2027)        // February 2028 has 29 days
  assert.equal(keys.length, 244)
  assert.ok(keys.includes("2028-02-29"))
})

test("seasonDayKeys is chronological, unique and zero-padded", () => {
  const keys = seasonDayKeys(2025)
  assert.equal(new Set(keys).size, keys.length)
  assert.deepEqual([...keys].sort(), keys)
  for (const k of keys) assert.match(k, /^\d{4}-\d{2}-\d{2}$/)
})

test("seasonDayKeys crosses the new year without skipping a day", () => {
  const keys = seasonDayKeys(2025)
  const i = keys.indexOf("2025-12-31")
  assert.ok(i > 0)
  assert.equal(keys[i + 1], "2026-01-01")
})

// ── sessionTier ─────────────────────────────────────────────────────────────
// 0 no session · 1 light day · 2 solid day · 3 big day · 4 powder day.

test("sessionTier is 0 for a day with no session", () => {
  assert.equal(sessionTier(undefined), 0)
  assert.equal(sessionTier(null), 0)
})

test("sessionTier grades a non-powder day by vertical feet", () => {
  assert.equal(VERTICAL_TIER_BREAKS[0], 10000)
  assert.equal(VERTICAL_TIER_BREAKS[1], 25000)
  assert.equal(sessionTier({ vertical_feet: 0 }),     1)
  assert.equal(sessionTier({ vertical_feet: 9999 }),  1)
  assert.equal(sessionTier({ vertical_feet: 10000 }), 2)
  assert.equal(sessionTier({ vertical_feet: 24999 }), 2)
  assert.equal(sessionTier({ vertical_feet: 25000 }), 3)
  assert.equal(sessionTier({ vertical_feet: 90000 }), 3)
})

test("sessionTier treats an unrecorded vertical as the lightest logged day, never as no-session", () => {
  assert.equal(sessionTier({}), 1)
  assert.equal(sessionTier({ vertical_feet: null }), 1)
  assert.equal(sessionTier({ vertical_feet: "not a number" }), 1)
})

test("sessionTier accepts the numeric string a Postgres numeric can arrive as", () => {
  assert.equal(sessionTier({ vertical_feet: "30000" }), 3)
})

test("a powder day is always the top tier, whatever its vertical", () => {
  assert.equal(sessionTier({ is_powder_day: true }), 4)
  assert.equal(sessionTier({ is_powder_day: true, vertical_feet: 0 }), 4)
  assert.equal(sessionTier({ is_powder_day: true, vertical_feet: 90000 }), 4)
})

test("the grid is 18 columns wide, matching the mockup", () => {
  assert.equal(SEASON_GRID_COLUMNS, 18)
})
