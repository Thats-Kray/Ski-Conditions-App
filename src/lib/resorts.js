export const RESORT_NAMES = {
  vail:           "Vail",
  beavercreek:    "Beaver Creek",
  breckenridge:   "Breckenridge",
  keystone:       "Keystone",
  crestedbutte:   "Crested Butte",
  telluride:      "Telluride",
  winterpark:     "Winter Park",
  coppermountain: "Copper Mountain",
  arapahoebasin:  "Arapahoe Basin",
  steamboat:      "Steamboat",
  eldora:         "Eldora",
  aspensnowmass:  "Aspen Snowmass",
}

export const RESORT_EMOJI = {
  vail:           "🏔️",
  beavercreek:    "⛰️",
  breckenridge:   "❄️",
  keystone:       "🎯",
  crestedbutte:   "🌨️",
  telluride:      "🌅",
  winterpark:     "🌲",
  coppermountain: "🔴",
  arapahoebasin:  "🏕️",
  steamboat:      "♨️",
  eldora:         "🌿",
  aspensnowmass:  "✨",
}

export const RESORT_PHOTOS = {
  vail:           "/resorts/vail.jpg",
  beavercreek:    "/resorts/beaver-creek.jpg",
  breckenridge:   "/resorts/breckenridge.jpg",
  keystone:       "/resorts/keystone.jpg",
  crestedbutte:   "/resorts/crested-butte.jpg",
  telluride:      "/resorts/telluride.jpg",
  winterpark:     "/resorts/winter-park.jpg",
  coppermountain: "/resorts/copper-mountain.jpg",
  arapahoebasin:  "/resorts/arapahoe-basin.jpg",
  steamboat:      "/resorts/steamboat.jpg",
  eldora:         "/resorts/eldora.jpg",
  aspensnowmass:  "/resorts/aspen-snowmass.jpg",
}

export const RESORT_ACCENTS = {
  vail:           "#60a5fa",
  beavercreek:    "#fbbf24",
  breckenridge:   "#34d399",
  keystone:       "#818cf8",
  crestedbutte:   "#c084fc",
  telluride:      "#fb7185",
  winterpark:     "#fb923c",
  coppermountain: "#f97316",
  arapahoebasin:  "#a3e635",
  steamboat:      "#d97706",
  eldora:         "#2dd4bf",
  aspensnowmass:  "#e2e8f0",
}

/**
 * "I'm skiing that day, I don't care where." daily_plans.resort_key is NOT NULL,
 * so this is a real sentinel value rather than an absent one.
 *
 * Deliberately NOT a member of RESORT_NAMES/RESORT_EMOJI: Object.keys(RESORT_NAMES)
 * builds the mountain dropdowns in MountainBoard, PostSkiBuddyForm and SkiBuddyBoard,
 * and "Open" is not a mountain you can post a buddy request for. The helpers below
 * special-case it so display works everywhere without polluting those pickers.
 */
export const OPEN_RESORT_KEY = "open"
export const OPEN_RESORT_LABEL = "Open — no preference"
export const OPEN_RESORT_EMOJI = "✳️"

/**
 * Collapses either form of a resort identifier onto the canonical resortKey:
 * a display name ("Beaver Creek", as ski_sessions.resort_name stores it for
 * real logged sessions) and an already-normalized key ("beavercreek", as trip
 * rows store it) both map to "beavercreek". Use this any time a resort string
 * of unknown provenance has to be matched against a resortKey.
 */
export function normalizeResortKey(key) {
  if (!key) return ""
  return String(key).trim().toLowerCase().replace(/\s+/g, "")
}

export function resortName(key) {
  if (!key) return ""
  const k = normalizeResortKey(key)
  if (k === OPEN_RESORT_KEY) return OPEN_RESORT_LABEL
  return RESORT_NAMES[k] || key
}

export function resortEmoji(key) {
  if (!key) return "⛷️"
  const k = normalizeResortKey(key)
  if (k === OPEN_RESORT_KEY) return OPEN_RESORT_EMOJI
  return RESORT_EMOJI[k] || "⛷️"
}
