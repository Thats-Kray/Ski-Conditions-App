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
  arapahoebasin:  "💎",
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
  arapahoebasin:  "#94a3b8",
  steamboat:      "#d97706",
  eldora:         "#2dd4bf",
  aspensnowmass:  "#e2e8f0",
}

export function resortName(key) {
  if (!key) return ""
  const k = String(key).trim().toLowerCase().replace(/\s+/g, "")
  return RESORT_NAMES[k] || key
}

export function resortEmoji(key) {
  if (!key) return "⛷️"
  const k = String(key).trim().toLowerCase().replace(/\s+/g, "")
  return RESORT_EMOJI[k] || "⛷️"
}