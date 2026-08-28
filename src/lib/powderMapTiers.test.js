import { test } from "node:test"
import assert from "node:assert/strict"
import { scoreTier } from "./powderMapTiers.js"

test("scores >= 88 are mint (elite / best snow)", () => {
  assert.equal(scoreTier(88), "mint")
  assert.equal(scoreTier(95), "mint")
})

test("scores 76-87 are sky (very good)", () => {
  assert.equal(scoreTier(76), "sky")
  assert.equal(scoreTier(87), "sky")
})

test("scores 63-75 are gold (good)", () => {
  assert.equal(scoreTier(63), "gold")
  assert.equal(scoreTier(75), "gold")
})

test("scores 50-62 are peach (okay / decent)", () => {
  assert.equal(scoreTier(50), "peach")
  assert.equal(scoreTier(62), "peach")
})

test("scores below 50 are coral (low powder score)", () => {
  assert.equal(scoreTier(49), "coral")
  assert.equal(scoreTier(0), "coral")
})

test("null or undefined score is slate (no data)", () => {
  assert.equal(scoreTier(null), "slate")
  assert.equal(scoreTier(undefined), "slate")
})
