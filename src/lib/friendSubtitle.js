/**
 * Formatting for the Crew tab's Friends sub-tab rows (TASK 22.0, Friends slice).
 *
 * This module imports NOTHING on purpose. `npm test` is `node --test src/lib/*.test.js`,
 * and anything that reaches `./supabase` cannot be loaded under plain Node --
 * src/lib/supabase.js reads `import.meta.env` and throws when it is undefined. Keeping
 * the formatting here (and the supabase call in socialApi.js) is the same split
 * skiBuddyOptions.js, activityComments.js and skiDayDetails.js already use, and it is
 * the only reason any of this is covered by a test at all.
 */

/**
 * profiles.skill_level stores a KEY, not a label. These five keys are the complete set
 * ProfilePage.jsx:31-37 and ProfileSetup.jsx can write, and these labels are the exact
 * strings DirectMessageView.jsx:15-21 already shows -- lifted here rather than copied a
 * third time, so the same skill level can never be spelled two ways in two screens.
 */
export const SKILL_LABELS = {
  green:        "Green",
  blue:         "Blue",
  black:        "Black Diamond",
  double_black: "Double Black",
  experts_only: "Experts Only",
}

/**
 * @param {string|null|undefined} key a profiles.skill_level value
 * @returns {string|null} the display label, or null for missing/unknown keys
 */
export function skillLabel(key) {
  if (typeof key !== "string") return null
  return SKILL_LABELS[key] || null
}

/** Trim, then treat whitespace-only as absent. A profile saved with a spacebar in the
 *  mountain field must not render " · Blue" with a dangling separator. */
function cleaned(value) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * The mockup's friend-row subtitle: `favorite_mountain · skill_level`.
 *
 * Live data (2026-09-03) has skill_level set on 1 of 6 profiles and favorite_mountain on
 * 4 of 6, so the partial and empty branches are the ordinary cases, not edge cases. When
 * neither is set we fall back to @username -- which is what the row showed before this
 * slice, so nobody loses information -- and to "" only when there is genuinely nothing,
 * at which point the caller should render no subtitle line at all.
 *
 * @param {{favorite_mountain?: string|null, skill_level?: string|null, username?: string|null}|null|undefined} profile
 * @returns {string} never null; "" means "render nothing"
 */
export function formatFriendSubtitle(profile) {
  const parts = [cleaned(profile?.favorite_mountain), skillLabel(profile?.skill_level)]
    .filter(Boolean)

  if (parts.length > 0) return parts.join(" · ")

  const username = cleaned(profile?.username)
  return username ? `@${username}` : ""
}

/**
 * The mockup's request-row subtitle.
 *
 * Returns null rather than "0 mutual friends" for a zero count: a row that announces an
 * absence is worse than a row that stays quiet. Also returns null for a count that never
 * arrived or failed to load, so a per-row fetch failure degrades to silence instead of
 * "NaN mutual friends".
 *
 * @param {unknown} count
 * @returns {string|null}
 */
export function formatMutualFriends(count) {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 1) return null
  return `${count} mutual friend${count === 1 ? "" : "s"}`
}

/**
 * Coerce whatever PostgREST hands back for the get_mutual_friend_count RPC into a
 * non-negative integer. The function is declared RETURNS INT, but the value arrives as
 * JSON, and a wrapper that trusts it blindly is exactly how "NaN mutual friends" gets on
 * screen. Negative and non-numeric inputs collapse to 0, which formatMutualFriends then
 * renders as no subtitle.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeMutualCount(value) {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}
