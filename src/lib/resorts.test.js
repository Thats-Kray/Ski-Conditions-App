import { test } from "node:test"
import assert from "node:assert/strict"
import {
  OPEN_RESORT_KEY, OPEN_RESORT_LABEL,
  RESORT_NAMES, RESORT_EMOJI,
  resortName, resortEmoji, normalizeResortKey,
} from "./resorts.js"

test("the open sentinel resolves to a friendly label", () => {
  assert.equal(OPEN_RESORT_KEY, "open")
  assert.equal(resortName(OPEN_RESORT_KEY), OPEN_RESORT_LABEL)
})

test("the open sentinel has its own emoji, not the generic fallback", () => {
  assert.notEqual(resortEmoji(OPEN_RESORT_KEY), "⛷️")
  assert.equal(typeof resortEmoji(OPEN_RESORT_KEY), "string")
})

test("the sentinel survives normalizeResortKey untouched", () => {
  assert.equal(normalizeResortKey("open"), OPEN_RESORT_KEY)
  assert.equal(normalizeResortKey(" Open "), OPEN_RESORT_KEY)
  assert.equal(resortName("Open"), OPEN_RESORT_LABEL)
})

test("the sentinel is NOT in the resort maps that build pickers", () => {
  // Object.keys(RESORT_NAMES) populates the mountain dropdowns in MountainBoard,
  // PostSkiBuddyForm and SkiBuddyBoard. "Open" is not a mountain and must never
  // appear in them.
  assert.equal(RESORT_NAMES[OPEN_RESORT_KEY], undefined)
  assert.equal(RESORT_EMOJI[OPEN_RESORT_KEY], undefined)
  assert.ok(!Object.keys(RESORT_NAMES).includes(OPEN_RESORT_KEY))
})

test("real resorts are unaffected", () => {
  assert.equal(resortName("vail"), "Vail")
  assert.equal(resortName("Beaver Creek"), "Beaver Creek")
  assert.equal(resortName("coppermountain"), "Copper Mountain")
})

test("an unknown key still falls back to the raw string", () => {
  assert.equal(resortName("madeupmountain"), "madeupmountain")
  assert.equal(resortEmoji("madeupmountain"), "⛷️")
})
