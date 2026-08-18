/**
 * Crew → color mapping for the friends calendar.
 *
 * Spec decision #6: color encodes CREW. Decision #7: the color rides the person
 * (an avatar ring), never the mountain card — a mountain can hold skiers from two
 * crews, so a card cannot take one color without an arbitrary tie-break.
 *
 * Every value here is a `var(--color-*)` token that src/index.css already
 * redefines per [data-theme], so all five themes reskin the calendar for free and
 * any theme added later works with no change to this file. That is also why there
 * is no JS color math and no getComputedStyle: nothing here needs to know what the
 * token resolves to.
 *
 * These strings must never be concatenated with a hex alpha suffix (`${c}22`) —
 * var() references break when suffixed. Use a separate rgba overlay instead.
 */

export const CREW_COLOR_VARS = [
  "var(--color-accent)",
  "var(--color-accent-2)",
  "var(--color-accent-soft)",
  "var(--color-accent-strong)",
  "var(--color-accent-teal)",
  "var(--color-accent-deep)",
]

/**
 * You. Deliberately NOT a member of CREW_COLOR_VARS — slot 0 is --color-accent,
 * so reusing it would make "me" indistinguishable from the first crew.
 */
export const SELF_RING = "var(--color-text-1)"

/** A friend visible via "All Friends" but in no selected crew. */
export const NEUTRAL_RING = "var(--color-text-3)"

/**
 * @param {number} stableIndex position in getMyCrews() order — NOT position among
 *   the selected crews. Using the selected position would reshuffle every color
 *   whenever a chip is toggled.
 */
export function crewColor(stableIndex) {
  return CREW_COLOR_VARS[stableIndex % CREW_COLOR_VARS.length]
}

/**
 * @typedef {Object} CrewColorContext
 * @property {string|null} currentUserId
 * @property {string[]} selectedCrewIds  crew ids currently toggled on, in chip order
 * @property {Map<string, number>} crewIndexById  crew id → stable index
 * @property {Map<string, Set<string>>} crewMemberIds  crew id → member user ids
 */

/**
 * Ring color for one person, per spec §4.6:
 *   1. the signed-in user  → SELF_RING
 *   2. one selected crew   → that crew's stable color
 *   3. two or more         → the first in chip order (the rest survive as badges)
 *   4. none                → NEUTRAL_RING
 *
 * @param {string} userId
 * @param {CrewColorContext} ctx
 */
export function ringColorFor(userId, ctx) {
  if (userId && userId === ctx.currentUserId) return SELF_RING
  for (const crewId of ctx.selectedCrewIds) {
    if (ctx.crewMemberIds.get(crewId)?.has(userId)) {
      return crewColor(ctx.crewIndexById.get(crewId) ?? 0)
    }
  }
  return NEUTRAL_RING
}

/**
 * Every selected crew this user belongs to, in chip order. The ring can only show
 * one; the day panel uses this so the other memberships are not lost.
 *
 * @param {string} userId
 * @param {CrewColorContext} ctx
 * @returns {string[]} crew ids
 */
export function crewBadgesFor(userId, ctx) {
  return ctx.selectedCrewIds.filter((crewId) => ctx.crewMemberIds.get(crewId)?.has(userId))
}
