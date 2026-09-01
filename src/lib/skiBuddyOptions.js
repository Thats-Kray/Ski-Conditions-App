// Keep RIDING_STYLES' keys in sync with the Postgres valid_riding_styles()
// CHECK function in migrations/028_ski_buddy_board.sql — if one changes, so
// must the other.
export const RIDING_STYLES = [
  { key: "beginner_friendly", label: "Beginner-Friendly", emoji: "🌱" },
  { key: "cruiser",           label: "Cruiser",            emoji: "🎿" },
  { key: "park_terrain",      label: "Park/Terrain",       emoji: "🛹" },
  { key: "backcountry_curious", label: "Backcountry-Curious", emoji: "🏔️" },
  { key: "advanced_expert",   label: "Advanced/Expert",    emoji: "🔥" },
  { key: "anyone_chill",      label: "Anyone Chill",       emoji: "🤙" },
]

export const PASS_TYPES = [
  { key: "ikon",        label: "Ikon" },
  { key: "epic",         label: "Epic" },
  { key: "independent",  label: "Independent" },
  { key: "other",        label: "Other" },
]

export const CARPOOL_STATUSES = [
  { key: "none",     label: "No Carpool" },
  { key: "offering", label: "🚗 Offering Seats" },
  { key: "needing",  label: "🙋 Need a Seat" },
]

// Pass-badge colors, one per PASS_TYPES key (TASK 22.0 Board-slice redesign).
// Ikon/Epic match the mockup's sample board post's badge colors exactly;
// independent/other are new choices (the mockup's 2-item sample never shows
// either) picked for the same hue-separation and contrast bar the mockup's
// pair implies — see skiBuddyOptions.test.js for the actual thresholds.
const PASS_BADGE_COLORS = {
  ikon:        { text: "#8ef6d1", bg: "rgba(142,246,209,0.12)", border: "rgba(142,246,209,0.25)" },
  epic:        { text: "#9bc6ff", bg: "rgba(155,198,255,0.12)", border: "rgba(155,198,255,0.25)" },
  independent: { text: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.25)" },
  other:       { text: "#f472b6", bg: "rgba(244,114,182,0.12)", border: "rgba(244,114,182,0.25)" },
}

export function passColor(key) {
  return (PASS_BADGE_COLORS[key] || PASS_BADGE_COLORS.other).text
}

export function passBadgeStyle(key) {
  const c = PASS_BADGE_COLORS[key] || PASS_BADGE_COLORS.other
  return {
    fontSize: 10,
    fontWeight: 900,
    padding: "4px 9px",
    borderRadius: 999,
    color: c.text,
    background: c.bg,
    border: `1px solid ${c.border}`,
  }
}
