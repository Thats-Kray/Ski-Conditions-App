import { test } from "node:test"
import assert from "node:assert/strict"
import { getShareCardTheme, rgba } from "./shareCardTokens.js"

test("known theme keys return their own token set", () => {
  const blizzard = getShareCardTheme("blizzard")
  assert.equal(blizzard.accent, "#38bdf8")

  const auroraPeak = getShareCardTheme("aurora-peak")
  assert.equal(auroraPeak.accent, "#a855f7")
  assert.notEqual(auroraPeak.accent, blizzard.accent)
})

test("all 5 themes are present with the full token shape", () => {
  const keys = ["blizzard", "alpine-dawn", "storm-chaser", "aurora-peak", "base-lodge"]
  for (const key of keys) {
    const theme = getShareCardTheme(key)
    for (const field of ["bgDeep", "bgElevated", "bg", "accent", "accentDeep", "accentTeal"]) {
      assert.equal(typeof theme[field], "string", `${key}.${field} should be a string`)
      assert.match(theme[field], /^#[0-9a-f]{6}$/i, `${key}.${field} should be a hex color`)
    }
  }
})

test("unknown or missing theme keys fall back to blizzard", () => {
  const fallback1 = getShareCardTheme("not-a-real-theme")
  const fallback2 = getShareCardTheme(null)
  const fallback3 = getShareCardTheme(undefined)
  const blizzard = getShareCardTheme("blizzard")
  assert.deepEqual(fallback1, blizzard)
  assert.deepEqual(fallback2, blizzard)
  assert.deepEqual(fallback3, blizzard)
})

test("rgba converts a hex color and alpha into a canvas-ready rgba() string", () => {
  assert.equal(rgba("#38bdf8", 0.5), "rgba(56, 189, 248, 0.5)")
  assert.equal(rgba("#000000", 1), "rgba(0, 0, 0, 1)")
  assert.equal(rgba("#ffffff", 0), "rgba(255, 255, 255, 0)")
})
