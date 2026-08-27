// A hand-maintained JS mirror of the 5-theme CSS custom-property system in
// src/index.css, for the one surface in the app that can't read CSS
// variables: ShareStatCard.jsx draws directly to a <canvas> with the 2D
// context API, which only accepts literal color strings.
//
// Keep every hex value here in sync with the matching `[data-theme="..."]`
// block in src/index.css. This mirrors only the token families the share
// card's canvas draw calls actually use (background + accent family) — it
// is not a general-purpose token system and should not grow beyond that.

const THEMES = {
  blizzard: {
    bgDeep: "#0a0f1e", bgElevated: "#060d1a", bg: "#04080f",
    accent: "#38bdf8", accentDeep: "#2563eb", accentTeal: "#0891b2",
  },
  "alpine-dawn": {
    bgDeep: "#060b18", bgElevated: "#0a1628", bg: "#020510",
    accent: "#f59e0b", accentDeep: "#b45309", accentTeal: "#2563eb",
  },
  "storm-chaser": {
    bgDeep: "#060c18", bgElevated: "#0f1c30", bg: "#080e18",
    accent: "#14b8a6", accentDeep: "#0f766e", accentTeal: "#1d4ed8",
  },
  "aurora-peak": {
    bgDeep: "#0a0618", bgElevated: "#0d0a23", bg: "#050310",
    accent: "#a855f7", accentDeep: "#7e22ce", accentTeal: "#059669",
  },
  "base-lodge": {
    bgDeep: "#130a03", bgElevated: "#1c1208", bg: "#0c0704",
    accent: "#f97316", accentDeep: "#c2410c", accentTeal: "#d97706",
  },
}

export function getShareCardTheme(themeKey) {
  return THEMES[themeKey] || THEMES.blizzard
}

export function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
