/**
 * Crew → color mapping for the friends calendar.
 *
 * Spec decision #6: color encodes CREW. Decision #7: the color rides the person
 * (an avatar ring), never the mountain card — a mountain can hold skiers from two
 * crews, so a card cannot take one color without an arbitrary tie-break.
 *
 * WHY THESE ARE FIXED HEX AND NOT THEME TOKENS
 *
 * These were six `var(--color-accent-*)` tokens. That reskinned the calendar for
 * free in every theme — and produced six shades of orange in Base Lodge, six
 * violets in Aurora Peak, and a similar collapse in a third theme. Crew color is
 * the ENTIRE basis of the "whose plans am I looking at" read, so a palette that
 * works in two themes out of five is a palette that does not work.
 *
 * Fixed hues are the trade: the calendar no longer reskins with the theme, but it
 * stays readable in all of them. This is affordable because all five themes are
 * dark (backgrounds run #020510 to #0C0704), so one palette clears every ground.
 * If a LIGHT theme is ever added, these need rechecking — the tests below encode
 * the thresholds, so they will tell you.
 *
 * Do not "restore" the theme tokens. That is the bug, not the feature.
 *
 * The constraints, all asserted in crewColors.test.js with real color math:
 *   - six distinct literal hex values
 *   - no two within 25° of hue (actual minimum: ~40°)
 *   - every one ≥3:1 against the darkest theme bg and the lightest elevated surface
 */

export const CREW_COLORS = [
  "#38BDF8", // sky      198°
  "#A78BFA", // violet   255°
  "#F472B6", // pink     329°
  "#FB923C", // orange    27°
  "#A3E635", // lime      83°
  "#34D399", // emerald  160°
]

/**
 * You. Deliberately not a member of CREW_COLORS — a near-white ring reads as
 * "me" against every crew hue, and stays correct in all five dark themes.
 */
export const SELF_RING = "var(--color-text-1)"

/**
 * A friend visible via "All Friends" but in no selected crew.
 *
 * Fixed slate rather than var(--color-text-3), which is the active theme's own
 * accent at 45% alpha — orange in Base Lodge, i.e. a crew hue. An unaffiliated
 * friend would have been indistinguishable from a member of the orange crew.
 */
export const NEUTRAL_RING = "#64748B"

/**
 * @param {number} stableIndex position in getMyCrews() order — NOT position among
 *   the selected crews. Using the selected position would reshuffle every color
 *   whenever a chip is toggled.
 */
export function crewColor(stableIndex) {
  return CREW_COLORS[stableIndex % CREW_COLORS.length]
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
