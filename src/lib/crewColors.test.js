import { test } from "node:test"
import assert from "node:assert/strict"
import {
  CREW_COLORS, SELF_RING, NEUTRAL_RING, crewColor, ringColorFor,
} from "./crewColors.js"

const ctx = {
  currentUserId: "me",
  selectedCrewIds: ["crewA", "crewB"],
  crewIndexById: new Map([["crewA", 0], ["crewB", 1], ["crewC", 2]]),
  crewMemberIds: new Map([
    ["crewA", new Set(["me", "rafe", "gaby"])],
    ["crewB", new Set(["gaby", "kramer"])],
    ["crewC", new Set(["nate"])],
  ]),
}

// ── Palette math, so "these colors are distinct" is a test and not an opinion ──
//
// The crew slots used to be var(--color-accent-*) theme tokens, which reskinned for
// free but collapsed to six near-identical shades in three of the five themes. They
// are now fixed hex, and these assertions are what keep them distinguishable.

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

/** Smallest angle between two hues, 0-180. */
function hueGap(a, b) {
  const d = Math.abs(hue(a) - hue(b)) % 360
  return d > 180 ? 360 - d : d
}

/** WCAG relative luminance. */
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

// The extremes of the five dark themes, from src/index.css.
const DARKEST_BG = "#020510"   // aurora-peak
const LIGHTEST_SURFACE = "#1C1208" // base-lodge --color-bg-elevated

test("there are six crew slots and they are all distinct", () => {
  assert.equal(CREW_COLORS.length, 6)
  assert.equal(new Set(CREW_COLORS).size, 6)
})

test("every crew slot is a literal hex color, not a theme token", () => {
  // A var() here would reintroduce the collapse: --color-accent-* resolves to six
  // shades of one hue in base-lodge, sunset and aurora-peak.
  CREW_COLORS.forEach((c) => assert.match(c, /^#[0-9A-Fa-f]{6}$/))
})

test("no two crew slots sit within 25 degrees of hue", () => {
  // Crew color is the entire basis of the "whose plans am I looking at" read, so
  // adjacent slots have to be tellable apart at avatar-ring size.
  for (let i = 0; i < CREW_COLORS.length; i++) {
    for (let j = i + 1; j < CREW_COLORS.length; j++) {
      const gap = hueGap(CREW_COLORS[i], CREW_COLORS[j])
      assert.ok(
        gap >= 25,
        `slots ${i} (${CREW_COLORS[i]}) and ${j} (${CREW_COLORS[j]}) are only ${gap.toFixed(1)}° apart`
      )
    }
  }
})

test("every crew slot clears 3:1 against the darkest and lightest theme grounds", () => {
  for (const c of CREW_COLORS) {
    for (const bg of [DARKEST_BG, LIGHTEST_SURFACE]) {
      const ratio = contrast(c, bg)
      assert.ok(ratio >= 3, `${c} on ${bg} is only ${ratio.toFixed(2)}:1`)
    }
  }
})

test("SELF_RING does not collide with any crew slot", () => {
  assert.ok(!CREW_COLORS.includes(SELF_RING))
})

test("NEUTRAL_RING does not collide with any crew slot", () => {
  // It used to be var(--color-text-3), which is the theme's own accent at 45%
  // alpha — orange in base-lodge, which is a crew hue. A friend in no selected
  // crew would have been indistinguishable from a member of the orange one.
  assert.ok(!CREW_COLORS.includes(NEUTRAL_RING))
  assert.match(NEUTRAL_RING, /^#[0-9A-Fa-f]{6}$/)
  for (const c of CREW_COLORS) {
    assert.ok(
      hueGap(NEUTRAL_RING, c) >= 25 || contrast(NEUTRAL_RING, c) >= 1.6,
      `NEUTRAL_RING ${NEUTRAL_RING} is too close to crew slot ${c}`
    )
  }
})

test("crewColor wraps past six crews", () => {
  assert.equal(crewColor(0), CREW_COLORS[0])
  assert.equal(crewColor(6), CREW_COLORS[0])
  assert.equal(crewColor(7), CREW_COLORS[1])
})

test("the signed-in user always gets SELF_RING, even inside a selected crew", () => {
  assert.equal(ringColorFor("me", ctx), SELF_RING)
})

test("a member of exactly one selected crew gets that crew's color", () => {
  assert.equal(ringColorFor("rafe", ctx), crewColor(0))
})

test("a member of two selected crews takes the first in filter order", () => {
  assert.equal(ringColorFor("gaby", ctx), crewColor(0))
  assert.equal(ringColorFor("gaby", { ...ctx, selectedCrewIds: ["crewB", "crewA"] }), crewColor(1))
})

test("color follows the STABLE crew index, not the selected position", () => {
  // Only crewB is selected. Its color must still be slot 1 — the slot it owns
  // in getMyCrews() order — not slot 0 just because it is first in the filter.
  assert.equal(ringColorFor("kramer", { ...ctx, selectedCrewIds: ["crewB"] }), crewColor(1))
})

test("a friend in no selected crew gets the neutral ring", () => {
  assert.equal(ringColorFor("nate", ctx), NEUTRAL_RING)
})

test("an unknown user gets the neutral ring rather than throwing", () => {
  assert.equal(ringColorFor("stranger", ctx), NEUTRAL_RING)
})

test("crewBadgesFor lists every selected crew a user belongs to", async () => {
  const { crewBadgesFor } = await import("./crewColors.js")
  assert.deepEqual(crewBadgesFor("gaby", ctx), ["crewA", "crewB"])
  assert.deepEqual(crewBadgesFor("nate", ctx), [])
})
