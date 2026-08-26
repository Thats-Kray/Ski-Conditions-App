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

/**
 * Resorts the manual "log a day" picker offers that are NOT Colorado day-trip mountains.
 *
 * Deliberately a SEPARATE map from RESORT_NAMES. RESORT_NAMES drives the pickers for "where
 * are you skiing today" (plan editor, check-in, the calendar), which are Colorado-only by
 * design — Whistler has no business appearing there. These only need to exist so that a
 * logged day at one of them can be DISPLAYED.
 *
 * Why display names are needed at all: as of migration 039, ski_sessions.resort_name is stored
 * as a normalised key, so that a day both checked into and manually logged is one row rather
 * than 'vail' and 'Vail' counting as two ski days. Without an entry here, that normalisation
 * would render "Whistler Blackcomb" as "whistlerblackcomb" on the leaderboard.
 *
 * Keys are what normalizeResortKey() produces: lowercased, whitespace stripped.
 */
export const OUT_OF_REGION_RESORT_NAMES = {
  parkcity:          "Park City",
  heavenly:          "Heavenly",
  northstar:         "Northstar",
  kirkwood:          "Kirkwood",
  stowe:             "Stowe",
  whistlerblackcomb: "Whistler Blackcomb",
  snowbird:          "Snowbird",
  alta:              "Alta",
  parkcitymountain:  "Park City Mountain",
  mammothmountain:   "Mammoth Mountain",
  bigsky:            "Big Sky",
  jacksonhole:       "Jackson Hole",
  taos:              "Taos",
  sunvalley:         "Sun Valley",
  squawvalley:       "Squaw Valley",
  laketahoe:         "Lake Tahoe",
  palisadestahoe:    "Palisades Tahoe",
  loveland:          "Loveland",
  monarch:           "Monarch",
  wolfcreek:         "Wolf Creek",
  sunlight:          "Sunlight",
  powderhorn:        "Powderhorn",
}

/**
 * Every label the manual logger's ResortPicker offers, Colorado and beyond.
 *
 * ResortPicker used to hardcode its own list. Sourcing it here means a resort cannot be added
 * to the picker without also getting a display name — resorts.test.js asserts exactly that,
 * so the failure shows up as a red test rather than a lowercase key on someone's leaderboard.
 */
export const PICKER_RESORT_LABELS = [
  ...Object.values(RESORT_NAMES),
  ...Object.values(OUT_OF_REGION_RESORT_NAMES),
]

export function resortName(key) {
  if (!key) return ""
  const k = normalizeResortKey(key)
  if (k === OPEN_RESORT_KEY) return OPEN_RESORT_LABEL
  return RESORT_NAMES[k] || OUT_OF_REGION_RESORT_NAMES[k] || key
}

export function resortEmoji(key) {
  if (!key) return "⛷️"
  const k = normalizeResortKey(key)
  if (k === OPEN_RESORT_KEY) return OPEN_RESORT_EMOJI
  return RESORT_EMOJI[k] || "⛷️"
}
