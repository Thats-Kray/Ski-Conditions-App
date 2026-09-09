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
