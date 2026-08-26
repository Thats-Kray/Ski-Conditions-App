import { test } from "node:test"
import assert from "node:assert/strict"
import {
  OPEN_RESORT_KEY, OPEN_RESORT_LABEL,
  RESORT_NAMES, RESORT_EMOJI,
  resortName, resortEmoji, normalizeResortKey, PICKER_RESORT_LABELS,
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

// ── Out-of-region resorts (migration 039) ────────────────────────────────────
//
// ski_sessions.resort_name is now stored as a normalised key everywhere, so that a day
// checked in AND manually logged is ONE row rather than 'vail' plus 'Vail'. But the manual
// logger's picker offers 34 resorts and only 12 are Colorado ones with keys here, so without
// a display name for the rest, normalising turns "Whistler Blackcomb" into "whistlerblackcomb"
// on screen.

test("out-of-region resorts from the manual logger still display properly", () => {
  assert.equal(resortName("whistlerblackcomb"), "Whistler Blackcomb")
  assert.equal(resortName("jacksonhole"), "Jackson Hole")
  assert.equal(resortName("alta"), "Alta")
  assert.equal(resortName("parkcity"), "Park City")
})

test("every resort the manual logger offers has a display name", () => {
  // If someone adds a resort to ResortPicker and not here, logging a day there shows a
  // lowercase key on the leaderboard. This test is the reminder.
  for (const label of PICKER_RESORT_LABELS) {
    const key = normalizeResortKey(label)
    assert.equal(resortName(key), label, `${label} normalises to "${key}" with no display name`)
  }
})

test("out-of-region names do not leak into the pickers built from RESORT_NAMES", () => {
  // RESORT_NAMES drives the Colorado resort pickers (plan editor, check-in). Whistler must
  // not appear in "where are you skiing today".
  assert.ok(!Object.keys(RESORT_NAMES).includes("whistlerblackcomb"))
  assert.ok(!Object.keys(RESORT_NAMES).includes("alta"))
  assert.equal(Object.keys(RESORT_NAMES).length, 12)
})
