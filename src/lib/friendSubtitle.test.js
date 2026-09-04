import { test } from "node:test"
import assert from "node:assert/strict"
import {
  SKILL_LABELS,
  skillLabel,
  formatFriendSubtitle,
  formatMutualFriends,
  normalizeMutualCount,
} from "./friendSubtitle.js"

// ── skillLabel ──────────────────────────────────────────────────────────────
// profiles.skill_level stores a KEY ("double_black"), never a label. Rendering the
// raw column is the bug this map exists to prevent.

test("skillLabel maps every stored key to a human label", () => {
  assert.equal(skillLabel("green"), "Green")
  assert.equal(skillLabel("blue"), "Blue")
  assert.equal(skillLabel("black"), "Black Diamond")
  assert.equal(skillLabel("double_black"), "Double Black")
  assert.equal(skillLabel("experts_only"), "Experts Only")
})

test("skillLabel returns null for null, undefined, empty and unknown keys", () => {
  // 5 of 6 live profiles have skill_level NULL, so this is the common path.
  assert.equal(skillLabel(null), null)
  assert.equal(skillLabel(undefined), null)
  assert.equal(skillLabel(""), null)
  assert.equal(skillLabel("expert"), null)
})

test("SKILL_LABELS covers exactly the five keys ProfilePage can write", () => {
  // If ProfilePage.jsx:31-37 gains a sixth option, this fails and points at the map
  // that needs updating -- rather than silently dropping the new level from the row.
  assert.deepEqual(
    Object.keys(SKILL_LABELS).sort(),
    ["black", "blue", "double_black", "experts_only", "green"],
  )
})

// ── formatFriendSubtitle ────────────────────────────────────────────────────

test("formatFriendSubtitle joins mountain and skill with a middot", () => {
  assert.equal(
    formatFriendSubtitle({ favorite_mountain: "Winter Park", skill_level: "experts_only" }),
    "Winter Park · Experts Only",
  )
})

test("formatFriendSubtitle drops the missing half instead of leaving a dangling separator", () => {
  assert.equal(formatFriendSubtitle({ favorite_mountain: "Vail", skill_level: null }), "Vail")
  assert.equal(
    formatFriendSubtitle({ favorite_mountain: null, skill_level: "double_black" }),
    "Double Black",
  )
})

test("formatFriendSubtitle falls back to @username when neither field is set", () => {
  // The live majority case: 2 of 6 profiles have no favorite_mountain.
  assert.equal(formatFriendSubtitle({ username: "stumpswithsteez" }), "@stumpswithsteez")
})

test("formatFriendSubtitle returns an empty string when there is nothing at all to say", () => {
  assert.equal(formatFriendSubtitle({}), "")
  assert.equal(formatFriendSubtitle(null), "")
  assert.equal(formatFriendSubtitle(undefined), "")
})

test("formatFriendSubtitle ignores whitespace-only values", () => {
  // A profile saved with a spacebar in the mountain field must not render " · Blue".
  assert.equal(
    formatFriendSubtitle({ favorite_mountain: "   ", skill_level: "blue" }),
    "Blue",
  )
  assert.equal(formatFriendSubtitle({ favorite_mountain: "  ", username: "  " }), "")
})

test("formatFriendSubtitle trims surrounding whitespace on the mountain", () => {
  assert.equal(
    formatFriendSubtitle({ favorite_mountain: " Breckenridge ", skill_level: "green" }),
    "Breckenridge · Green",
  )
})

// ── formatMutualFriends ─────────────────────────────────────────────────────

test("formatMutualFriends pluralises correctly", () => {
  assert.equal(formatMutualFriends(1), "1 mutual friend")
  assert.equal(formatMutualFriends(3), "3 mutual friends")
  assert.equal(formatMutualFriends(12), "12 mutual friends")
})

test("formatMutualFriends returns null for zero, so the row shows no subtitle at all", () => {
  // "0 mutual friends" is worse than nothing -- it draws the eye to an absence.
  assert.equal(formatMutualFriends(0), null)
})

test("formatMutualFriends returns null for a failed or not-yet-loaded count", () => {
  // The count is a decoration fetched per row; a failure must degrade to silence,
  // never to "NaN mutual friends".
  assert.equal(formatMutualFriends(null), null)
  assert.equal(formatMutualFriends(undefined), null)
  assert.equal(formatMutualFriends(NaN), null)
  assert.equal(formatMutualFriends("3"), null)
  assert.equal(formatMutualFriends(-1), null)
})

// ── normalizeMutualCount ────────────────────────────────────────────────────
// The RPC returns an INT, but PostgREST hands back JSON, and a wrapper that trusts
// it blindly is how "NaN mutual friends" reaches a screen.

test("normalizeMutualCount passes through a valid count", () => {
  assert.equal(normalizeMutualCount(0), 0)
  assert.equal(normalizeMutualCount(7), 7)
})

test("normalizeMutualCount coerces a numeric string, which is how PostgREST can return bigints", () => {
  assert.equal(normalizeMutualCount("4"), 4)
})

test("normalizeMutualCount returns 0 for null, undefined, garbage and negatives", () => {
  assert.equal(normalizeMutualCount(null), 0)
  assert.equal(normalizeMutualCount(undefined), 0)
  assert.equal(normalizeMutualCount("many"), 0)
  assert.equal(normalizeMutualCount({}), 0)
  assert.equal(normalizeMutualCount(-3), 0)
})

test("normalizeMutualCount floors a non-integer rather than rendering '2.5 mutual friends'", () => {
  assert.equal(normalizeMutualCount(2.5), 2)
})
