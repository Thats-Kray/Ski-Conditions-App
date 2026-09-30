import { test } from "node:test"
import assert from "node:assert/strict"
import { computePowderScore } from "./powderScore.js"

// ── Base-depth gate: 0" is not skiable ──────────────────────────────────────
//
// Mirrors src/lib/powderScore.js's equivalent tests exactly — see that
// file's comments for the full reasoning. The server has no existing test
// harness (no server/*.test.js prior to this file); this is a direct
// `node --test` file, runnable standalone since computePowderScore is a
// pure function with no I/O: `node --test server/powderScore.test.js`.

test("a zero base depth forces the score to 0 and tier to Not Skiable, regardless of otherwise-elite inputs", () => {
  const { powderScore, powderTier } = computePowderScore({
    tempF: 25, windMph: 0, forecastText: "Clear",
    snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
    baseDepth: 0,
    runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
  })
  assert.equal(powderScore, 0)
  assert.equal(powderTier, "Not Skiable")
})

test("a thin base under 12 inches caps the score at 20", () => {
  const { powderScore, powderTier } = computePowderScore({
    tempF: 25, windMph: 0, forecastText: "Clear",
    snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
    baseDepth: 6,
    runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
  })
  assert.equal(powderScore, 20)
  assert.equal(powderTier, "Poor")
})

test("the thin-base cap boundary is exclusive at 12 inches", () => {
  const justUnder = computePowderScore({
    tempF: 25, windMph: 0, forecastText: "Clear",
    snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
    baseDepth: 11.9,
    runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
  })
  const at12 = computePowderScore({
    tempF: 25, windMph: 0, forecastText: "Clear",
    snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
    baseDepth: 12,
    runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
  })
  assert.equal(justUnder.powderScore, 20, "11.9\" base should still be capped at 20")
  assert.ok(at12.powderScore > 20, "12\" base should NOT be capped — got " + at12.powderScore)
})

test("a missing base depth does not trigger the gate", () => {
  // fresh 40 | incoming 20 | temp 25F->20 | base null->0 | terrain 15
  // no hint, no wind, no drive = 95 exactly -> Elite (>= 80).
  const { powderScore, powderTier } = computePowderScore({
    tempF: 25, windMph: 0, forecastText: "Clear",
    snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
    baseDepth: null,
    runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
  })
  assert.equal(powderScore, 95)
  assert.equal(powderTier, "Elite")
})

test("an omitted base depth (default param) does not trigger the gate", () => {
  // Same as the null case above, but relying on computePowderScore's own
  // default parameter rather than passing baseDepth explicitly — guards
  // against a future regression where the default reverts to 0.
  const { powderScore } = computePowderScore({
    tempF: 25, windMph: 0, forecastText: "Clear",
    snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
    runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
  })
  assert.equal(powderScore, 95)
})
