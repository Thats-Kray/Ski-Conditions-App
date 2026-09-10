import { test } from "node:test"
import assert from "node:assert/strict"
import { getShareCardTheme, rgba, inkAlpha, overlayAlpha } from "./shareCardTokens.js"

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

test("light mode returns a different, still-complete token set", () => {
  const darkBlizzard  = getShareCardTheme("blizzard", "dark")
  const lightBlizzard = getShareCardTheme("blizzard", "light")
  assert.equal(darkBlizzard.bg, "#04080f")
  assert.equal(lightBlizzard.bg, "#f2f7fc")
  assert.equal(lightBlizzard.accent, "#0369a1")
  assert.notEqual(lightBlizzard.accent, darkBlizzard.accent)
})

test("all 5 light themes are present with the full token shape", () => {
  const keys = ["blizzard", "alpine-dawn", "storm-chaser", "aurora-peak", "base-lodge"]
  for (const key of keys) {
    const theme = getShareCardTheme(key, "light")
    for (const field of ["bgDeep", "bgElevated", "bg", "accent", "accentDeep", "accentTeal", "ink"]) {
      assert.equal(typeof theme[field], "string", `light ${key}.${field} should be a string`)
      assert.match(theme[field], /^#[0-9a-f]{6}$/i, `light ${key}.${field} should be a hex color`)
    }
  }
})

test("ink is white in dark mode and slate-900 in light mode, in every theme", () => {
  const keys = ["blizzard", "alpine-dawn", "storm-chaser", "aurora-peak", "base-lodge"]
  for (const key of keys) {
    assert.equal(getShareCardTheme(key, "dark").ink, "#ffffff")
    assert.equal(getShareCardTheme(key, "light").ink, "#0f172a")
  }
})

test("an unknown or missing mode falls back to dark", () => {
  const blizzardDark = getShareCardTheme("blizzard", "dark")
  assert.deepEqual(getShareCardTheme("blizzard"), blizzardDark)
  assert.deepEqual(getShareCardTheme("blizzard", null), blizzardDark)
  assert.deepEqual(getShareCardTheme("blizzard", "sepia"), blizzardDark)
})

test("an unknown theme key falls back to blizzard within the requested mode", () => {
  assert.deepEqual(getShareCardTheme("not-a-real-theme", "light"), getShareCardTheme("blizzard", "light"))
})

test("inkAlpha is the identity in dark mode and the solved value in light mode", () => {
  assert.equal(inkAlpha(0.45, "dark"), 0.45)
  assert.equal(inkAlpha(0.45), 0.45)
  assert.equal(inkAlpha(0.45, "light"), 0.6)
  assert.equal(inkAlpha(0.2, "light"), 0.25)
  assert.equal(inkAlpha(0.9, "light"), 0.98)
})

test("overlayAlpha keeps low steps identical and raises the ones above 0.10", () => {
  assert.equal(overlayAlpha(0.06, "dark"), 0.06)
  assert.equal(overlayAlpha(0.06, "light"), 0.06)
  assert.equal(overlayAlpha(0.18, "light"), 0.22)
  assert.equal(overlayAlpha(0.25, "light"), 0.34)
})

test("both alpha helpers pass through an unmapped value unchanged", () => {
  assert.equal(inkAlpha(0.33, "light"), 0.33)
  assert.equal(overlayAlpha(0.99, "light"), 0.99)
})
