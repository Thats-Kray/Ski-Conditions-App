import { test } from "node:test"
import assert from "node:assert/strict"
import { PASS_TYPES, passColor, passBadgeStyle } from "./skiBuddyOptions.js"

// ── Palette math, mirroring crewColors.test.js's approach: these colors need
// to be tellable apart and readable on a dark card, so that's a test, not an
// opinion. ──

function toRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  assert.ok(m, `${hex} must be a 6-digit hex color`)
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function hue(hex) {
  const [r, g, b] = toRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 0
  let h
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return (h * 60 + 360) % 360
}

function hueGap(a, b) {
  const d = Math.abs(hue(a) - hue(b)) % 360
  return d > 180 ? 360 - d : d
}

function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const DARKEST_BG = "#020510" // aurora-peak, the darkest of the 5 theme backgrounds

const KEYS = PASS_TYPES.map((p) => p.key)

test("every PASS_TYPES key has a distinct badge color", () => {
  const colors = KEYS.map(passColor)
  assert.equal(new Set(colors).size, KEYS.length)
})

test("passColor returns a literal hex color, not a theme token", () => {
  KEYS.forEach((k) => assert.match(passColor(k), /^#[0-9A-Fa-f]{6}$/))
})

test("no two pass colors sit within 20 degrees of hue", () => {
  for (let i = 0; i < KEYS.length; i++) {
    for (let j = i + 1; j < KEYS.length; j++) {
      const gap = hueGap(passColor(KEYS[i]), passColor(KEYS[j]))
      assert.ok(gap >= 20, `${KEYS[i]} and ${KEYS[j]} are only ${gap.toFixed(1)}° apart`)
    }
  }
})

test("every pass color clears 3:1 contrast against the darkest theme background", () => {
  KEYS.forEach((k) => {
    const ratio = contrast(passColor(k), DARKEST_BG)
    assert.ok(ratio >= 3, `${k} (${passColor(k)}) on ${DARKEST_BG} is only ${ratio.toFixed(2)}:1`)
  })
})

test("passColor falls back to the 'other' color for an unrecognized key", () => {
  assert.equal(passColor("nonsense"), passColor("other"))
})

test("passBadgeStyle returns a complete style object using passColor's value", () => {
  const style = passBadgeStyle("ikon")
  assert.equal(style.color, passColor("ikon"))
  assert.equal(typeof style.background, "string")
  assert.equal(typeof style.border, "string")
  assert.equal(style.fontWeight, 900)
})
