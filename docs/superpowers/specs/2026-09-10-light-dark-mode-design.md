# Light / Dark Mode — Design Spec

**Date:** 2026-09-10
**Status:** Approved by Kyle, ready for planning

## Context

The app already has a 5-theme cosmetic system (`Blizzard`, `Alpine Dawn`, `Storm Chaser`,
`Aurora Peak`, `Base Lodge`) — 95 CSS custom properties in `src/index.css`, switched via a
`[data-theme="..."]` attribute on `<html>`, with a live picker in `ProfilePage.jsx`
(`THEME_OPTIONS`, `handleSelectTheme`). **All five are dark palettes** — different accent hues
on dark backgrounds. `color-scheme: dark` is hardcoded at `:root`, and there is no light-mode
handling anywhere in the codebase (confirmed by grep — zero `prefers-color-scheme` /
alternate `color-scheme` usages). This spec adds light mode as a new, independent axis.

## Decisions (confirmed with Kyle)

1. **Every one of the 5 existing cosmetic themes gets both a dark and a light variant** (10
   total palettes), not a single light palette bolted onto the default theme alone.
2. **Manual toggle only** — no `prefers-color-scheme` auto-detection, no system-follow option.
   Simpler, fewer edge cases, consistent with how the cosmetic theme picker already works
   (explicit user choice, not inferred).
3. **Default mode is dark for everyone** — existing users and new signups alike. Nothing
   changes for anyone until they explicitly flip the toggle. Zero-risk default.

## Architecture

### Data model
New `profiles.theme_mode` column, values `'dark'` | `'light'`, default `'dark'`. Independent of
the existing `theme` column (the 5 cosmetic keys) — mode and cosmetic theme are orthogonal
choices, matching the UI (two separate controls, not 10 flat theme options).

**Write path:** routed through the existing `buildProfileUpdate()` / `PROFILE_WRITE_FIELDS`
whitelist introduced in the Profile page slice specifically to prevent a write path from
silently omitting a field (the exact bug class that has bitten this app — Edit Profile
previously nulled `username`/`favorite_mountain` this way). Add `theme_mode` to
`PROFILE_WRITE_FIELDS` and confirm all profile-write call sites route through it. Per this
app's established convention, `ProfileSetup.jsx` and `OnboardingFlow.jsx` (account-creation-time
writers, not yet migrated to `buildProfileUpdate`) are out of scope for this change too — same
deferral already logged in ROADMAP, not something this spec should re-open.

### CSS token architecture
Mirror the existing `[data-theme="X"]` pattern with an orthogonal `[data-mode="light"]`
attribute on `<html>`, combined as `[data-theme="X"][data-mode="light"]`. `:root` remains the
Blizzard-dark baseline unchanged (zero risk to current behavior); the 4 existing
`[data-theme="X"]` dark blocks are untouched.

**5 new blocks are added**, one per theme:
```css
[data-theme="blizzard"][data-mode="light"] { /* full palette */ }
[data-theme="alpine-dawn"][data-mode="light"] { /* full palette */ }
[data-theme="storm-chaser"][data-mode="light"] { /* full palette */ }
[data-theme="aurora-peak"][data-mode="light"] { /* full palette */ }
[data-theme="base-lodge"][data-mode="light"] { /* full palette */ }
```

Each block redefines the full set of visually-relevant tokens for that theme (bg, bg-elevated,
surface, surface-hover, border, border-subtle, accent + its dim/glow/2 variants, text-1/2/3/muted,
nav-bg, badge-border, gradient-primary/elite/bg/cta, shadow-card/accent/button, accent-soft/
strong/deep/teal, modal-bg, bg-deep, surface-popover, banner-heading/highlight) — **not** a
blind inversion of the dark values. Accent colors tuned for a dark background frequently fail
contrast on a light one and need independent tuning, the same way each of the 5 existing dark
themes got its own hand-tuned palette rather than a formula applied to Blizzard's numbers.

Tokens documented as **theme-invariant** (Track C/D/E: rating/risk tokens, trail-difficulty
tokens, season-grid tiers, danger/success/warning status tokens) stay theme-invariant across
modes too, per the same reasoning already recorded for them in `index.css` — their meaning
must read the same regardless of cosmetic theme OR mode.

`color-scheme` becomes mode-conditional (`light` under `[data-mode="light"]`, `dark` otherwise)
so native form controls, scrollbars, and date pickers render correctly in both modes.

### ProfilePage UI
Add a light/dark toggle to the existing theme section, alongside the 5 theme swatches — two
independent controls. `handleSelectTheme`'s pattern (set the DOM attribute immediately, persist
via `buildProfileUpdate`, roll back the attribute on save failure) is mirrored for the new
`handleSelectMode` handler.

### ShareStatCard canvas mirror
`src/lib/shareCardTokens.js` (hand-maintained JS mirror of the CSS tokens, needed because
`<canvas>` 2D context can't read CSS custom properties) currently has 5 dark theme objects.
Add 5 light theme objects, keyed the same way, consumed by `ShareStatCard.jsx` via
`profile?.theme` + `profile?.theme_mode` (both already flow through unchanged from existing call
sites — no new prop threading needed beyond passing `theme_mode` alongside the existing `theme`
lookup).

### Contrast audit
Repeat the WCAG audit already done for the 5 dark themes (4.5:1 body text / 3:1 large text)
against all 5 new light palettes. This is expected to be where real bugs surface — the earlier
audit found `--gradient-primary`/`--gradient-elite`'s white-on-accent-gradient buttons failing
in every dark theme; the equivalent light-mode failure mode is the opposite (dark-on-light-
accent, or the same white-text buttons now sitting on a light page background elsewhere) and
needs its own pass, not an assumption that the dark fixes carry over.

## Scope — REVISED during planning (2026-09-10, same day)

**The original scope claim below was wrong and is kept only as a record of the mistake.** The
"62 of 68 components already consume the token system" fact from the earlier theme-system work
was true for *accent/cosmetic* colors (blue vs. amber vs. purple), but a live grep during
planning found **1,023 hardcoded `rgba(255,255,255,...)` occurrences across 52 component files**,
plus **250 literal `color: white` / `#fff` usages** — a second, much larger hardcoding pattern
(white text, white-alpha "glass card" surfaces) that assumes the page behind it is always dark.
Kyle's own prior ruling on this app explicitly called that pattern "deliberate, not a defect" —
under a dark-only assumption that light mode invalidates. Flipping the CSS variables alone, as
originally scoped, would ship white text on a white page across most of the app.

**Kyle's call (2026-09-10): full app-wide retrofit, one plan, not decomposed into page-by-page
slices** (the TASK 22.0 pattern was offered as an alternative and declined).

**Actually touches:** `src/index.css` (10 new theme blocks — light AND dark variants confirmed
per-theme — plus a new adaptive "overlay" token scale to replace the hardcoded white-alpha
pattern), `ProfilePage.jsx` (toggle UI + write path), `src/lib/shareCardTokens.js` (5 new theme
objects), one new migration (`profiles.theme_mode` column + default), and **all 52 files
currently hardcoding white text/surfaces** — mechanical substitution onto the new tokens, not a
visual redesign of any of them.

~~**Does not touch:** any other component...~~ superseded above.

**Explicitly out of scope:** `prefers-color-scheme` auto-detection; a light variant of only the
default theme (rejected — all 5 get both); `ProfileSetup.jsx`/`OnboardingFlow.jsx` profile-write
migration to `buildProfileUpdate` (separate, already-tracked, pre-existing deferral).

## Testing

`src/index.css` and `shareCardTokens.js` are not covered by `npm test` (node --test over
`src/lib` only, no CSS/canvas coverage) — verification here is a contrast audit (computed WCAG
ratios, screenshot-style spot checks per the established pattern) plus Kyle's own click-through
of the toggle across all 5 themes, not an automated test count. `theme_mode`'s presence in
`PROFILE_WRITE_FIELDS` and `buildProfileUpdate`'s existing coverage of it CAN be asserted with a
unit test, matching the 9 existing `profileForm.js` tests.
