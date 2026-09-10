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
    ink: "#ffffff",
  },
  "alpine-dawn": {
    bgDeep: "#060b18", bgElevated: "#0a1628", bg: "#020510",
    accent: "#f59e0b", accentDeep: "#b45309", accentTeal: "#2563eb",
    ink: "#ffffff",
  },
  "storm-chaser": {
    bgDeep: "#060c18", bgElevated: "#0f1c30", bg: "#080e18",
    accent: "#14b8a6", accentDeep: "#0f766e", accentTeal: "#1d4ed8",
    ink: "#ffffff",
  },
  "aurora-peak": {
    bgDeep: "#0a0618", bgElevated: "#0d0a23", bg: "#050310",
    accent: "#a855f7", accentDeep: "#7e22ce", accentTeal: "#059669",
    ink: "#ffffff",
  },
  "base-lodge": {
    bgDeep: "#130a03", bgElevated: "#1c1208", bg: "#0c0704",
    accent: "#f97316", accentDeep: "#c2410c", accentTeal: "#d97706",
    ink: "#ffffff",
  },
}

// The light half of the mirror. Every hex here is copied from the matching
// [data-mode="light"] block in src/index.css: bgDeep is --color-bg-deep,
// bgElevated is --color-bg-elevated, bg is --color-bg, accent is
// --color-accent, accentDeep is --color-accent-deep, accentTeal is
// --color-accent-teal. If you change one there, change it here.
const THEMES_LIGHT = {
  blizzard: {
    bgDeep: "#e3edf7", bgElevated: "#ffffff", bg: "#f2f7fc",
    accent: "#0369a1", accentDeep: "#0c4a6e", accentTeal: "#0e7490",
    ink: "#0f172a",
  },
  "alpine-dawn": {
    bgDeep: "#f6ebda", bgElevated: "#ffffff", bg: "#fdf8f0",
    accent: "#b45309", accentDeep: "#78350f", accentTeal: "#1d4ed8",
    ink: "#0f172a",
  },
  "storm-chaser": {
    bgDeep: "#dfedec", bgElevated: "#ffffff", bg: "#f0f6f6",
    accent: "#0f766e", accentDeep: "#134e4a", accentTeal: "#1e40af",
    ink: "#0f172a",
  },
  "aurora-peak": {
    bgDeep: "#ede6fb", bgElevated: "#ffffff", bg: "#f8f5fe",
    accent: "#7e22ce", accentDeep: "#581c87", accentTeal: "#0f766e",
    ink: "#0f172a",
  },
  "base-lodge": {
    bgDeep: "#f5e7d8", bgElevated: "#ffffff", bg: "#fdf6ef",
    accent: "#c2410c", accentDeep: "#7c2d12", accentTeal: "#b45309",
    ink: "#0f172a",
  },
}

// JS twins of the --ink-* and --overlay-* ramps in src/index.css. The canvas
// cannot read CSS variables, and a light-mode share card that mirrored the
// dark alphas 1:1 would render its @username line at 2.5:1 instead of 3.5:1.
// Keys are the DARK alpha; values are the light one. Same numbers as the CSS.
const INK_ALPHA_LIGHT = {
  0.2: 0.25, 0.25: 0.32, 0.28: 0.37, 0.3: 0.4, 0.32: 0.43, 0.35: 0.47,
  0.38: 0.52, 0.4: 0.54, 0.42: 0.57, 0.45: 0.6, 0.48: 0.63, 0.5: 0.65,
  0.52: 0.67, 0.55: 0.7, 0.58: 0.72, 0.6: 0.74, 0.62: 0.76, 0.65: 0.78,
  0.68: 0.81, 0.7: 0.82, 0.72: 0.84, 0.74: 0.85, 0.75: 0.86, 0.78: 0.88,
  0.8: 0.9, 0.82: 0.92, 0.85: 0.94, 0.88: 0.96, 0.9: 0.98,
}

const OVERLAY_ALPHA_LIGHT = {
  0.02: 0.02, 0.03: 0.03, 0.035: 0.035, 0.04: 0.04, 0.05: 0.05, 0.06: 0.06,
  0.065: 0.065, 0.07: 0.07, 0.08: 0.08, 0.09: 0.09, 0.1: 0.1, 0.11: 0.12,
  0.12: 0.14, 0.13: 0.15, 0.14: 0.16, 0.15: 0.18, 0.16: 0.2, 0.18: 0.22,
  0.2: 0.26, 0.22: 0.28, 0.25: 0.34,
}

/**
 * @param {string|null|undefined} themeKey one of the 5 cosmetic theme keys
 * @param {"dark"|"light"} [mode] anything other than "light" is treated as dark
 * @returns {{bgDeep:string,bgElevated:string,bg:string,accent:string,accentDeep:string,accentTeal:string,ink:string}}
 */
export function getShareCardTheme(themeKey, mode = "dark") {
  const table = mode === "light" ? THEMES_LIGHT : THEMES
  return table[themeKey] || table.blizzard
}

/** Text/icon alpha. @param {number} darkAlpha @param {"dark"|"light"} [mode] */
export function inkAlpha(darkAlpha, mode = "dark") {
  if (mode !== "light") return darkAlpha
  const mapped = INK_ALPHA_LIGHT[darkAlpha]
  return mapped === undefined ? darkAlpha : mapped
}

/** Surface/border alpha. @param {number} darkAlpha @param {"dark"|"light"} [mode] */
export function overlayAlpha(darkAlpha, mode = "dark") {
  if (mode !== "light") return darkAlpha
  const mapped = OVERLAY_ALPHA_LIGHT[darkAlpha]
  return mapped === undefined ? darkAlpha : mapped
}

export function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
