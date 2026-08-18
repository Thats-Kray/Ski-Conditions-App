import { test } from "node:test"
import assert from "node:assert/strict"
import {
  CREW_COLOR_VARS, SELF_RING, NEUTRAL_RING, crewColor, ringColorFor,
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

test("the six crew slots are all distinct theme tokens", () => {
  assert.equal(CREW_COLOR_VARS.length, 6)
  assert.equal(new Set(CREW_COLOR_VARS).size, 6)
  CREW_COLOR_VARS.forEach((c) => assert.match(c, /^var\(--color-[a-z0-9-]+\)$/))
})

test("SELF_RING does not collide with any crew slot", () => {
  assert.ok(!CREW_COLOR_VARS.includes(SELF_RING))
})

test("crewColor wraps past six crews", () => {
  assert.equal(crewColor(0), CREW_COLOR_VARS[0])
  assert.equal(crewColor(6), CREW_COLOR_VARS[0])
  assert.equal(crewColor(7), CREW_COLOR_VARS[1])
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
