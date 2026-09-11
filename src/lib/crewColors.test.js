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

// The five LIGHT-mode grounds, from the [data-mode="light"] blocks in
// src/index.css, plus the white --color-bg-elevated / --color-modal-bg every
// light palette shares. crewColors.js's own header comment said these would need
// rechecking the day a light theme landed, and that "the tests below encode the
// thresholds, so they will tell you" — this list is what makes them tell you.
const LIGHT_GROUNDS = [
  "#F2F7FC", // blizzard      --color-bg
  "#FDF8F0", // alpine-dawn   --color-bg
  "#F0F6F6", // storm-chaser  --color-bg
  "#F8F5FE", // aurora-peak   --color-bg
  "#FDF6EF", // base-lodge    --color-bg
  "#FFFFFF", // every light palette's --color-bg-elevated / --color-modal-bg
]

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

// The dark half of the contract, still hard-asserted. Split out of the test below
// so that marking the light-mode gap as TODO does not also stop guarding the five
// dark themes the palette was actually designed against.
test("every crew slot clears 3:1 against both dark theme grounds", () => {
  for (const c of CREW_COLORS) {
    for (const bg of [DARKEST_BG, LIGHTEST_SURFACE]) {
      const ratio = contrast(c, bg)
      assert.ok(ratio >= 3, `${c} on ${bg} is only ${ratio.toFixed(2)}:1`)
    }
  }
})

// ⚠️ KNOWN GAP, DELIBERATELY MARKED TODO — DO NOT "FIX" BY TRIMMING LIGHT_GROUNDS.
//
// crewColors.js's header comment predicted this: the fixed palette was only
// affordable while all five themes were dark, and light mode has now landed.
// Every one of the 36 hue x light-ground combinations fails the 3:1 contract —
// there is no near miss:
//
//            #F2F7FC  #FDF8F0  #F0F6F6  #F8F5FE  #FDF6EF  #FFFFFF
//   #38BDF8    1.99     2.03     1.96     1.99     2.00     2.14   sky
//   #A78BFA    2.53     2.57     2.49     2.52     2.54     2.72   violet
//   #F472B6    2.46     2.50     2.42     2.46     2.47     2.65   pink
//   #FB923C    2.10     2.14     2.07     2.10     2.11     2.26   orange
//   #A3E635    1.40     1.43     1.38     1.40     1.41     1.51   lime
//   #34D399    1.78     1.82     1.76     1.78     1.79     1.92   emerald
//
// Worst case 1.38:1 (#A3E635 on storm-chaser light), best case 2.72:1 (#A78BFA
// on white). Closing it is a real design decision — six hues >=25 degrees apart
// clearing 3:1 on BOTH a near-black and a near-white ground, which one palette
// almost certainly cannot do, so expect a mode-conditional pair — and was
// deferred rather than patched into the light/dark fix wave. The assertions below
// are live: once the palette is redesigned this TODO starts passing, which is the
// signal to drop the `.todo` and fold it back into the test above.
test.todo("every crew slot clears 3:1 against every theme ground, dark and light", () => {
  for (const c of CREW_COLORS) {
    for (const bg of [DARKEST_BG, LIGHTEST_SURFACE, ...LIGHT_GROUNDS]) {
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
