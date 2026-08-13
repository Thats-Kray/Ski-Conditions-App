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
