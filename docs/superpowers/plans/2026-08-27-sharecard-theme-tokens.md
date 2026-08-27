# ShareStatCard Theme Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ShareStatCard.jsx`'s canvas-drawn share card (season recap + session recap) repaint in the user's chosen theme, instead of being permanently locked to Blizzard-blue, by giving it a small JS mirror of the 5-theme CSS token system.

**Architecture:** `ShareStatCard.jsx` draws directly to a `<canvas>` with the 2D context API, so it cannot read CSS custom properties (`var(--color-accent)` etc.) the way the rest of the app does. This plan adds `src/lib/shareCardTokens.js`, a small hand-maintained JS object mirroring the 5 `[data-theme="..."]` blocks in `src/index.css` for exactly the token families the canvas draw calls use (background, accent, accent-deep/teal). `ShareStatCard` then reads `profile?.theme`, looks up the matching theme object, and uses its values (plus a `rgba()` helper for alpha blending) everywhere it currently hardcodes a Blizzard-blue hex literal. Colors the app already treats as theme-invariant (skill-level ring colors, the neutral glass-card backgrounds, the gold "Top Resort" badge) are left untouched — matching the established convention in `src/index.css` and `ui/Badge.jsx`.

**Tech Stack:** Vanilla JS, Canvas 2D API, `node --test` (existing repo test runner — no new dependency).

## Global Constraints

- No new npm dependencies (ROADMAP.md's standing convention — see TASK 1.1-T for the two deliberate, already-approved exceptions; this is not a third one).
- `npm test` must stay green (126 passing at baseline in this worktree) and the lint baseline of 88 problems must not increase.
- Theme values in the new JS file must match `src/index.css`'s corresponding `[data-theme="..."]` block exactly (same hex values) — this is a mirror, not a redesign. If a value in `index.css` and this plan ever disagree, `index.css` is the source of truth.
- Colors already established as theme-invariant elsewhere in the app (skill-level trail colors, neutral white-alpha glass surfaces, the gold/amber "Top Resort" accent) stay theme-invariant here too — do not invent new per-theme variants for them.
- Every existing draw call's *visual weight* (opacity, gradient direction, stop positions) is preserved; only the *hue* changes per theme. Do not redesign the card layout.

---

## File Structure

- **Create:** `src/lib/shareCardTokens.js` — the theme mirror + an `rgba(hex, alpha)` helper + `getShareCardTheme(themeKey)` lookup with a Blizzard fallback.
- **Create:** `src/lib/shareCardTokens.test.js` — unit tests for the lookup and the rgba helper.
- **Modify:** `src/components/ShareStatCard.jsx` — thread `profile?.theme` through `renderCard()` and its drawing helpers (`drawAvatar`), replace hardcoded hex/rgba literals with theme-token lookups, and fix the watermark's stale `powderdays.app` domain to `powdays.app` (same domain bug already fixed in `index.html` under TASK 21.1/21.2 — this is a separate occurrence in a different file, not a naming-scope decision).

---

## Task 1: Build the theme token mirror

**Files:**
- Create: `src/lib/shareCardTokens.js`
- Test: `src/lib/shareCardTokens.test.js`

**Interfaces:**
- Produces: `getShareCardTheme(themeKey: string | null | undefined): ShareCardTheme` — never throws, falls back to the `"blizzard"` entry for `null`/`undefined`/unknown keys.
- Produces: `rgba(hex: string, alpha: number): string` — e.g. `rgba("#38bdf8", 0.5)` → `"rgba(56, 189, 248, 0.5)"`.
- `ShareCardTheme` shape (all values are hex strings, no CSS `var()`, no alpha baked in):
  ```
  {
    bgDeep: string,       // darkest background gradient stop
    bgElevated: string,   // mid background gradient stop
    bg: string,           // lightest/base background gradient stop
    accent: string,       // primary accent (mirrors --color-accent)
    accentDeep: string,   // mirrors --color-accent-deep
    accentTeal: string,   // mirrors --color-accent-teal
  }
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/shareCardTokens.test.js`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { getShareCardTheme, rgba } from "./shareCardTokens.js"

test("known theme keys return their own token set", () => {
  const blizzard = getShareCardTheme("blizzard")
  assert.equal(blizzard.accent, "#38bdf8")

  const auroraPeak = getShareCardTheme("aurora-peak")
  assert.equal(auroraPeak.accent, "#a855f7")
  assert.notEqual(auroraPeak.accent, blizzard.accent)
})

test("all 5 themes are present with the full token shape", () => {
  const keys = ["blizzard", "alpine-dawn", "storm-chaser", "aurora-peak", "base-lodge"]
  for (const key of keys) {
    const theme = getShareCardTheme(key)
    for (const field of ["bgDeep", "bgElevated", "bg", "accent", "accentDeep", "accentTeal"]) {
      assert.equal(typeof theme[field], "string", `${key}.${field} should be a string`)
      assert.match(theme[field], /^#[0-9a-f]{6}$/i, `${key}.${field} should be a hex color`)
    }
  }
})

test("unknown or missing theme keys fall back to blizzard", () => {
  const fallback1 = getShareCardTheme("not-a-real-theme")
  const fallback2 = getShareCardTheme(null)
  const fallback3 = getShareCardTheme(undefined)
  const blizzard = getShareCardTheme("blizzard")
  assert.deepEqual(fallback1, blizzard)
  assert.deepEqual(fallback2, blizzard)
  assert.deepEqual(fallback3, blizzard)
})

test("rgba converts a hex color and alpha into a canvas-ready rgba() string", () => {
  assert.equal(rgba("#38bdf8", 0.5), "rgba(56, 189, 248, 0.5)")
  assert.equal(rgba("#000000", 1), "rgba(0, 0, 0, 1)")
  assert.equal(rgba("#ffffff", 0), "rgba(255, 255, 255, 0)")
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/lib/shareCardTokens.test.js`
Expected: FAIL — `Cannot find module './shareCardTokens.js'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/shareCardTokens.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/lib/shareCardTokens.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: 130 passing (126 existing + 4 new), 0 failures

- [ ] **Step 6: Commit**

```bash
git add src/lib/shareCardTokens.js src/lib/shareCardTokens.test.js
git commit -m "feat: add JS theme-token mirror for canvas-drawn share cards"
```

---

## Task 2: Wire the theme into ShareStatCard's canvas draw calls

**Files:**
- Modify: `src/components/ShareStatCard.jsx`

**Interfaces:**
- Consumes: `getShareCardTheme(themeKey)` and `rgba(hex, alpha)` from `src/lib/shareCardTokens.js` (Task 1).
- Consumes: `profile?.theme` — already present on the `profile` object passed into `ShareStatCard` from both call sites (`ProfilePage.jsx:886`, `SessionRecapModal.jsx:366`, itself fed by `currentProfile` in `App.jsx`), so no prop-threading changes are needed upstream.

This task edits `renderCard()` and `drawAvatar()` in place. Both currently take positional/destructured args with no theme; add a `theme` parameter to each rather than reaching for a module-level global, since `drawAvatar` is a plain function called once per render and threading the value through is one extra argument, not a refactor.

- [ ] **Step 1: Import the token helpers and compute the active theme**

At the top of `src/components/ShareStatCard.jsx`, add the import:

```js
import { getShareCardTheme, rgba } from "../lib/shareCardTokens"
```

In `renderCard`, right after the existing `const mode = session ? "session" : "season"` line, add:

```js
  const theme = getShareCardTheme(profile?.theme)
```

- [ ] **Step 2: Theme the background gradient (no hero-photo case)**

Replace the "Plain gradient background" block (currently hardcoded `#050e20` / `#061628` / `#040b18`):

```js
    // Plain gradient background (existing season-mode look, also the session-mode fallback).
    const bg = ctx.createLinearGradient(0, 0, W * 0.6, H)
    bg.addColorStop(0, theme.bgDeep)
    bg.addColorStop(0.5, theme.bgElevated)
    bg.addColorStop(1, theme.bg)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // Ambient glow top-right
    const glow1 = ctx.createRadialGradient(W * 0.85, H * 0.15, 0, W * 0.85, H * 0.15, W * 0.55)
    glow1.addColorStop(0, rgba(theme.accent, 0.18))
    glow1.addColorStop(1, rgba(theme.accent, 0))
    ctx.fillStyle = glow1
    ctx.fillRect(0, 0, W, H)
```

(Leave the `heroImg` branch above it untouched — the dark overlay there is neutral near-black for text legibility over a photo, not theme-driven, matching how the rest of the app treats photo-overlay scrims.)

- [ ] **Step 3: Theme the header brand color and divider**

Replace:

```js
  // Top bar: branding
  ctx.font = `800 44px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`
  ctx.fillStyle = "#60a5fa"
```

with:

```js
  // Top bar: branding
  ctx.font = `800 44px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`
  ctx.fillStyle = theme.accent
```

And replace the divider:

```js
  // Divider
  ctx.strokeStyle = "rgba(96,165,250,0.2)"
```

with:

```js
  // Divider
  ctx.strokeStyle = rgba(theme.accent, 0.2)
```

- [ ] **Step 4: Theme the avatar gradient and glow**

`drawAvatar` is called as `drawAvatar(ctx, name, x, y, size, skillLevel)`. Add `theme` as a 6th parameter and update its call site.

Change the function signature and body:

```js
function drawAvatar(ctx, name, x, y, size, skillLevel, theme) {
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
  const r = size / 2
  const cx = x + r
  const cy = y + r

  // Outer glow
  const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.4)
  glow.addColorStop(0, rgba(theme.accentDeep, 0.35))
  glow.addColorStop(1, rgba(theme.accentDeep, 0))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2)
  ctx.fill()

  // Circle bg
  const grad = ctx.createLinearGradient(x, y, x + size, y + size)
  grad.addColorStop(0, theme.accentDeep)
  grad.addColorStop(1, theme.accentTeal)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  // Border — skill-level color is theme-invariant by design (same convention
  // as the app-wide trail-difficulty tokens in src/index.css), not themed here.
  const skillColor = SKILL_COLORS[skillLevel] || "#60a5fa"
  ctx.strokeStyle = skillColor
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  // Initials
  ctx.font = `900 ${size * 0.38}px -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif`
  ctx.fillStyle = "white"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(initials, cx, cy)
}
```

And update its call site inside `renderCard`:

```js
  drawAvatar(ctx, profile?.full_name || profile?.username, avatarX, avatarY, avatarSize, profile?.skill_level, theme)
```

- [ ] **Step 5: Theme the powder-day badge (session mode)**

Replace:

```js
      const pbBg = ctx.createLinearGradient(76, pbY, W - 76, pbY + 88)
      pbBg.addColorStop(0, "rgba(96,165,250,0.18)")
      pbBg.addColorStop(1, "rgba(8,145,178,0.10)")
      ctx.fillStyle = pbBg
      ctx.fill()
      drawRoundedRect(ctx, 76, pbY, W - 152, 88, 18)
      ctx.strokeStyle = "rgba(96,165,250,0.3)"
```

with:

```js
      const pbBg = ctx.createLinearGradient(76, pbY, W - 76, pbY + 88)
      pbBg.addColorStop(0, rgba(theme.accentDeep, 0.18))
      pbBg.addColorStop(1, rgba(theme.accentTeal, 0.10))
      ctx.fillStyle = pbBg
      ctx.fill()
      drawRoundedRect(ctx, 76, pbY, W - 152, 88, 18)
      ctx.strokeStyle = rgba(theme.accentDeep, 0.3)
```

Leave the "Top Resort" badge (gold/amber, `rgba(251,191,36,...)` / `rgba(234,88,12,...)`) and every stat-card background/border (the `rgba(255,255,255,0.0x)` glass-card family) untouched — these are the same theme-invariant "rating gold" and neutral-glass conventions already established for the rest of the app in `src/index.css` (the `--rating-*` tokens and `--color-surface`, which is identical across all 5 `[data-theme]` blocks).

- [ ] **Step 6: Fix the stale watermark domain**

Replace:

```js
  ctx.fillText("powderdays.app", W / 2, H - 44)
```

with:

```js
  ctx.fillText("powdays.app", W / 2, H - 44)
```

This is the same domain bug already fixed in `index.html`'s meta tags under TASK 21.1/21.2 (`powderdays.app` → `powdays.app`) — a separate occurrence in a different file, not part of the deliberately-deferred "PowderDays" in-app text decision (which is about the app *name* text, not the domain string).

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: 130 passing, 0 failures (canvas drawing has no unit tests — this task is verified visually in Task 3)

- [ ] **Step 8: Lint check**

Run: `npx eslint src/components/ShareStatCard.jsx src/lib/shareCardTokens.js`
Expected: no new errors/warnings beyond the existing 88-problem baseline (this file was not previously a source of lint errors, so expect 0 here)

- [ ] **Step 9: Commit**

```bash
git add src/components/ShareStatCard.jsx
git commit -m "fix: theme the canvas-drawn share card + fix stale watermark domain"
```

---

## Task 3: Visual verification across all 5 themes

**Files:** none (verification only)

Canvas output can't be asserted by `node --test` (no DOM/canvas in the runner — see `node_test_runner_is_the_test_harness` convention). This task is the actual proof the feature works, not a formality.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background)

- [ ] **Step 2: Log in and open Profile**

Navigate to the running app, log in with a real account, go to the **Me** tab.

- [ ] **Step 3: For each of the 5 themes, generate a season share card**

For each theme in `Blizzard, Alpine Dawn, Storm Chaser, Aurora Peak, Base Lodge`:
1. Tap the theme swatch in Profile settings to switch to it.
2. Trigger the season share card (the existing "Share" action on the Season Passport card).
3. Confirm the rendered PNG's background gradient, header "❄️ PowderDays" text color, divider, avatar ring background, and (if you have a powder day logged) the powder-day badge all shift to that theme's accent color — not fixed Blizzard blue.
4. Confirm the "Top Resort" badge stays gold/amber in every theme (deliberately theme-invariant).
5. Confirm the watermark at the bottom now reads `powdays.app`, not `powderdays.app`.

- [ ] **Step 4: Repeat for a session share card**

Trigger `SessionRecapModal`'s "Share" button (end an active session, or open a past session's recap if the UI supports replaying it) for at least 2 of the 5 themes, and confirm the same elements shift color.

- [ ] **Step 5: Report results**

If any theme looks wrong (a color didn't shift, or shifted somewhere unintended like the neutral glass cards), note exactly which element and which theme before proceeding — do not silently patch and re-verify only that one case; re-run the full 5-theme pass after any fix.

---

## Self-Review Notes

- **Spec coverage:** design doc's ask was "the JS token mirror for `ShareStatCard.jsx`" (ROADMAP.md TASK 21.1's "Open decisions/blockers" note) — covered by Task 1. "Fix ShareStatCard.jsx — it hardcodes its own colors... Build the small JS token mirror this needs" (this session's brief) — covered by Tasks 1–2. Visual proof, not just passing tests — covered by Task 3.
- **Deliberately out of scope:** the "❄️ PowderDays" branding text drawn on the canvas (line ~211) is left as-is — TASK 21.2 already explicitly deferred that specific text to a later pass, and this plan only touches *color*, not copy.
- **Type/name consistency check:** `getShareCardTheme` and `rgba` are the only two exports from `shareCardTokens.js`, and both Task 1 (definition) and Task 2 (usage) use identical names and signatures.
