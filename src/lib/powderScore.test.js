import { test } from "node:test"
import assert from "node:assert/strict"
import {
  clamp,
  safePercent,
  computeRawPowderScore,
  powderTierForScore,
  normalizePowderScores,
} from "./powderScore.js"

// ── Terrain: exclude and rescale ────────────────────────────────────────────
//
// Terrain is worth 15 of the 100 points. It is the one component the app can
// fail to *fetch* rather than observe — 7 Ikon resorts plus Telluride are
// HTML-scraped and those pages break. Scoring an unknown as 0 caps a resort at
// 85/100; assuming half-open hands it 7.5 free points. So: use whichever pair
// we have (scaled to the full 15), and if we have neither, drop terrain and
// rescale the other four weighted components (max 85) up to fill 0-100.
//
// Every expected number below is hand-computed in the comment above it.

test("terrain scores 0-15 from both pairs when both are available", () => {
  // temp 25F -> 20 | runs 50% -> 5 | lifts 50% -> 2.5 | nothing else
  assert.equal(
    computeRawPowderScore({ tempF: 25, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10 }),
    27.5
  )
  // temp 25F -> 20 | runs 100% -> 10 | lifts 100% -> 5
  assert.equal(
    computeRawPowderScore({ tempF: 25, runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10 }),
    35
  )
})

test("lifts-only terrain is scaled to the full 15 points", () => {
  // temp 25F -> 20 | lifts 80% x 15 -> 12 (NOT 80% x 5 -> 4) | runs unknown
  assert.equal(
    computeRawPowderScore({ tempF: 25, liftsOpen: 8, liftsTotal: 10, runsOpen: null, runsTotal: null }),
    32
  )
})

test("runs-only terrain is scaled to the full 15 points", () => {
  // temp 25F -> 20 | runs 50% x 15 -> 7.5 (NOT 50% x 10 -> 5) | lifts unknown
  assert.equal(
    computeRawPowderScore({ tempF: 25, runsOpen: 50, runsTotal: 100, liftsOpen: null, liftsTotal: null }),
    27.5
  )
})

test("missing terrain drops out and the other four components rescale by 100/85", () => {
  // fresh 4in x 5 -> 20 | temp 26F -> 20 | base 40in / 20 -> 2 | terrain absent
  // (20 + 0 + 20 + 2) x (100 / 85) = 42 x 1.176470... = 49.411764... -> 49.4
  assert.equal(
    computeRawPowderScore({
      tempF: 26, snowPrev24in: 4, baseDepth: 40,
      runsOpen: null, runsTotal: null, liftsOpen: null, liftsTotal: null,
    }),
    49.4
  )
})

test("a perfect snow/temp/base day with no terrain data can still reach 100", () => {
  // fresh 32 + 8 = 40 | incoming 15 + 5 = 20 | temp 20 | base 100in / 20 -> 5
  // 85 x (100 / 85) = 100 exactly. The old formula capped this case at 92.5.
  assert.equal(
    computeRawPowderScore({
      tempF: 25, windMph: 0, forecastText: "Clear",
      snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
      baseDepth: 100,
      runsOpen: null, runsTotal: null, liftsOpen: null, liftsTotal: null,
    }),
    100
  )
})

test("missing terrain data cannot inflate a cold, snowless day (Kyle's case)", () => {
  // The complaint this whole task exists for: cold, zero fresh snow, zero
  // incoming, no lift/run data. temp 22F -> 20 | base 70in / 20 -> 3.5 |
  // (20 + 3.5) x (100 / 85) = 27.647... | wind 3mph x 0.75 = 2.25 penalty
  // -> 25.397... -> 25.4. Under the old formula it was 30.3, and 7.5 of that
  // was the phantom "half the mountain is probably open" terrain credit.
  const score = computeRawPowderScore({
    tempF: 22, windMph: 3, forecastText: "Sunny",
    snowPrev24in: 0, snowPrev48in: 0, snow24in: 0, snow48in: 0,
    baseDepth: 70,
    runsOpen: null, runsTotal: null, liftsOpen: null, liftsTotal: null,
  })
  assert.equal(score, 25.4)
  assert.ok(score <= 50, "expected <= 50, got " + score)
})

test("a zero total counts as missing terrain, not as 0% open", () => {
  // runsTotal 0 / liftsTotal 0 means "we parsed nothing", not "nothing is open".
  // temp 25F -> 20, rescaled: 20 x (100 / 85) = 23.529... -> 23.5
  assert.equal(
    computeRawPowderScore({ tempF: 25, runsOpen: 0, runsTotal: 0, liftsOpen: 0, liftsTotal: 0 }),
    23.5
  )
})

test("an open count without its total counts as a missing pair", () => {
  // runs has no total -> unusable, so this is the lifts-only path:
  // temp 25F -> 20 | lifts 80% x 15 -> 12
  assert.equal(
    computeRawPowderScore({ tempF: 25, runsOpen: 50, runsTotal: null, liftsOpen: 8, liftsTotal: 10 }),
    32
  )
})

// ── Base depth: 100 inches for full credit, not 70 ──────────────────────────

test("a 70-inch base no longer maxes the base component", () => {
  // temp 25F -> 20 | terrain 50%/50% -> 7.5 | base 70 / 20 = 3.5 -> 31
  assert.equal(
    computeRawPowderScore({
      tempF: 25, baseDepth: 70, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10,
    }),
    31
  )
})

test("a 100-inch base maxes the base component and deeper adds nothing", () => {
  // temp 25F -> 20 | terrain 7.5 | base min(100 / 20, 5) = 5 -> 32.5
  const at100 = computeRawPowderScore({
    tempF: 25, baseDepth: 100, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10,
  })
  const at180 = computeRawPowderScore({
    tempF: 25, baseDepth: 180, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10,
  })
  assert.equal(at100, 32.5)
  assert.equal(at180, 32.5)
})

// ── PRD 7.1 calibration examples, as permanent regression fixtures ──────────
//
// These four scenarios are the PRD's own statement of intent for the formula.
// PRD.md 7.1 lists them without concrete inputs, so the exact inputs live
// HERE and PRD.md quotes these numbers back. If you change a weight and one of
// these moves, that is the signal to update the PRD in the same commit.

const EPIC_POWDER_DAY = {
  tempF: 26, windMph: 5, forecastText: "Snow showers",
  snowPrev24in: 12, snowPrev48in: 18, snow24in: 6, snow48in: 4,
  baseDepth: 80,
  runsOpen: 70, runsTotal: 70, liftsOpen: 20, liftsTotal: 20,
  drivePenalty: 0,
}

const SOLID_MIDWINTER_DAY = {
  tempF: 28, windMph: 6, forecastText: "Partly cloudy",
  snowPrev24in: 3, snowPrev48in: 5, snow24in: 1, snow48in: 1,
  baseDepth: 50,
  runsOpen: 80, runsTotal: 100, liftsOpen: 8, liftsTotal: 10,
  drivePenalty: 0,
}

const WARM_BLUEBIRD_NO_SNOW = {
  tempF: 38, windMph: 8, forecastText: "Sunny",
  snowPrev24in: 0, snowPrev48in: 0, snow24in: 0, snow48in: 0,
  baseDepth: 40,
  runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
  drivePenalty: 0,
}

const LATE_SEASON_SLUSH = {
  tempF: 45, windMph: 4, forecastText: "Sunny and warm",
  snowPrev24in: 0, snowPrev48in: 0, snow24in: 0, snow48in: 0,
  baseDepth: 30,
  runsOpen: 60, runsTotal: 100, liftsOpen: 6, liftsTotal: 10,
  drivePenalty: 0,
}

test("calibration: an epic powder day is Elite", () => {
  // fresh min(60,32) + min(27,8) = 40 | incoming min(21,15) + 4 = 19 | temp 20
  // terrain 10 + 5 = 15 | base 80 / 20 = 4 | hint +2 | wind 5 x 0.75 = -3.75
  // = 96.25 -> 96.3   (was 97.3 when base was /14)
  assert.equal(computeRawPowderScore(EPIC_POWDER_DAY), 96.3)
  assert.equal(powderTierForScore(Math.round(96.3)), "Elite")
})

test("calibration: a solid mid-winter day is Good", () => {
  // fresh 15 + 7.5 = 22.5 | incoming 3.5 + 1 = 4.5 | temp 20
  // terrain 8 + 4 = 12 | base 50 / 20 = 2.5 | no hint | wind -4.5
  // = 57   (was 58.1 when base was /14)
  assert.equal(computeRawPowderScore(SOLID_MIDWINTER_DAY), 57)
  assert.equal(powderTierForScore(Math.round(57)), "Good")
})

test("calibration: a warm bluebird day with no snow is Poor", () => {
  // fresh 0 | incoming 0 | temp 38F -> 11 | terrain 15 | base 40 / 20 = 2
  // no hint | wind 8 x 0.75 = -6  => 22   (was 22.9 when base was /14)
  assert.equal(computeRawPowderScore(WARM_BLUEBIRD_NO_SNOW), 22)
  assert.equal(powderTierForScore(Math.round(22)), "Poor")
})

test("calibration: late-season slush is Poor", () => {
  // temp 45F -> 4 | terrain 6 + 3 = 9 | base 30 / 20 = 1.5 | wind -3
  // = 11.5   (was 12.1 when base was /14)
  assert.equal(computeRawPowderScore(LATE_SEASON_SLUSH), 11.5)
  assert.equal(powderTierForScore(Math.round(11.5)), "Poor")
})

// ── Unchanged behaviour this extraction must not regress ────────────────────

test("an empty input object scores without throwing or returning NaN", () => {
  // Everything missing: temp defaults to 25F -> 20, terrain absent,
  // 20 x (100 / 85) = 23.529... -> 23.5
  assert.equal(computeRawPowderScore({}), 23.5)
})

test("the wind penalty caps at 15", () => {
  // temp 20 | terrain 7.5 | wind 40 x 0.75 = 30, capped to 15 -> 12.5
  assert.equal(
    computeRawPowderScore({
      tempF: 25, windMph: 40, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10,
    }),
    12.5
  )
})

test("the drive penalty caps at 10", () => {
  // temp 20 | terrain 7.5 | drive 20 capped to 10 -> 17.5
  assert.equal(
    computeRawPowderScore({
      tempF: 25, drivePenalty: 20, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10,
    }),
    17.5
  )
})

test("wintry forecast text adds a flat 2 points", () => {
  // temp 20 | terrain 7.5 | hint +2 -> 29.5
  assert.equal(
    computeRawPowderScore({
      tempF: 25, forecastText: "Wintry mix", runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10,
    }),
    29.5
  )
})

test("fresh snow caps at 40 points", () => {
  // 20in x 5 = 100 capped 32, 20in x 1.5 = 30 capped 8 -> 40 | temp 20 | terrain 7.5
  assert.equal(
    computeRawPowderScore({
      tempF: 25, snowPrev24in: 20, snowPrev48in: 20,
      runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10,
    }),
    67.5
  )
})

test("incoming snow caps at 20 points", () => {
  // 20in x 3.5 = 70 capped 15, 20in x 1 = 20 capped 5 -> 20 | temp 20 | terrain 7.5
  assert.equal(
    computeRawPowderScore({
      tempF: 25, snow24in: 20, snow48in: 20,
      runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10,
    }),
    47.5
  )
})

test("the score never goes below 0", () => {
  // temp 60F -> 0 | terrain 0% open -> 0 | wind -15  => -15, clamped to 0
  assert.equal(
    computeRawPowderScore({
      tempF: 60, windMph: 40, runsOpen: 0, runsTotal: 100, liftsOpen: 0, liftsTotal: 10,
    }),
    0
  )
})

test("safePercent returns null for missing values and zero totals", () => {
  assert.equal(safePercent(null, 100), null)
  assert.equal(safePercent(50, null), null)
  assert.equal(safePercent(undefined, undefined), null)
  assert.equal(safePercent(0, 0), null)
  assert.equal(safePercent(0, 100), 0)
  assert.equal(safePercent(50, 100), 0.5)
})

test("clamp bounds both ends", () => {
  assert.equal(clamp(-5, 0, 15), 0)
  assert.equal(clamp(20, 0, 15), 15)
  assert.equal(clamp(7.5, 0, 15), 7.5)
})

// ── Tier thresholds (absolute, unchanged) ───────────────────────────────────

test("powderTierForScore maps every absolute threshold boundary", () => {
  assert.equal(powderTierForScore(0), "Poor")
  assert.equal(powderTierForScore(34), "Poor")
  assert.equal(powderTierForScore(35), "Okay")
  assert.equal(powderTierForScore(49), "Okay")
  assert.equal(powderTierForScore(50), "Good")
  assert.equal(powderTierForScore(64), "Good")
  assert.equal(powderTierForScore(65), "Very Good")
  assert.equal(powderTierForScore(79), "Very Good")
  assert.equal(powderTierForScore(80), "Elite")
  assert.equal(powderTierForScore(100), "Elite")
})

test("normalizePowderScores rounds the raw score before tiering", () => {
  const rows = normalizePowderScores([
    { name: "a", rawPowderScore: 34.4 },
    { name: "b", rawPowderScore: 34.5 },
    { name: "c", rawPowderScore: 79.4 },
    { name: "d", rawPowderScore: 79.5 },
  ])
  assert.deepEqual(rows.map((r) => [r.powderScore, r.powderTier]), [
    [34, "Poor"],
    [35, "Okay"],
    [79, "Very Good"],
    [80, "Elite"],
  ])
})

test("normalizePowderScores blanks the score for a closed resort", () => {
  const [row] = normalizePowderScores([{ name: "a", isOpen: false, rawPowderScore: 92 }])
  assert.equal(row.powderScore, null)
  assert.equal(row.powderTier, "Closed")
})

test("normalizePowderScores marks a row with no raw score Unknown", () => {
  const [row] = normalizePowderScores([{ name: "a", isOpen: true, rawPowderScore: null }])
  assert.equal(row.powderScore, null)
  assert.equal(row.powderTier, "Unknown")
})

test("normalizePowderScores preserves every other field on the row", () => {
  const [row] = normalizePowderScores([
    { name: "Vail", resortKey: "vail", pass: "Epic", isOpen: true, rawPowderScore: 71.4 },
  ])
  assert.equal(row.name, "Vail")
  assert.equal(row.resortKey, "vail")
  assert.equal(row.pass, "Epic")
  assert.equal(row.isOpen, true)
  assert.equal(row.rawPowderScore, 71.4)
  assert.equal(row.powderScore, 71)
  assert.equal(row.powderTier, "Very Good")
})
