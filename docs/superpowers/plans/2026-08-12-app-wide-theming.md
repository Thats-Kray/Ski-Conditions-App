# App-Wide Theming Follow-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every remaining screen in the app repaint correctly across all 5 themes (Blizzard, Alpine Dawn, Storm Chaser, Aurora Peak, Base Lodge), per the approved spec at `docs/superpowers/specs/2026-08-12-app-wide-theming-design.md`.

**Architecture:** No new framework. Every task replaces hardcoded hex in existing inline `style={{...}}` objects with references to the CSS custom properties already defined in `src/index.css`'s `:root` and `[data-theme="..."]` blocks — the exact convention Task 10.1 established. A small number of new tokens are added where no existing token covers a needed shade (see Token Catalog below); everything else maps onto tokens that already exist today.

**Tech Stack:** React 19, Vite, `src/index.css` custom properties, no CSS framework, no automated test runner (this repo has none — verification is manual `npm run dev` + a final Playwright pass, matching this repo's established convention from the Premium UI Uplift plan).

## Global Constraints

- No automated tests exist in this repo. Every task's verification step is a manual "run `npm run dev`, do X, confirm Y" check.
- `npm run lint` is run by the app owner locally after each task (no node/npm in this sandbox) — do not skip asking for it, but do not block a task's commit on it.
- Every task ends with its own commit, `style:` or `refactor:` prefix matching this repo's `git log` convention.
- Do not change the 5 theme palettes themselves (locked from Task 10.1) or add a 6th theme.
- Do not touch the documented exceptions (Token Catalog → "Leave alone" below) — they are correct as-is.
- Any new Supabase work is out of scope — this plan touches zero migrations, zero backend code.

---

## Methodology (read before starting any task)

Investigation before writing this plan found ~500 hex literals across ~35 files (26 screen
components + 9 `src/components/ui/` primitives the MVP missed). Hand-writing an exact
before/after code block for every single one of those ~500 literals would make this plan
unreviewable. Instead, each task below gives:

1. **The exact list of distinct hex values found in that task's files**, computed by
   `grep -oE "#[0-9a-fA-F]{3,8}\b" <file> | sort | uniq -c` — not "search for problems,"
   a literal checklist to work through.
2. **One or two fully worked examples** (real `old_string`/`new_string` pairs from the
   actual file) establishing the exact mechanical pattern for that file.
3. **The classification rubric** (below) to resolve every remaining item on the checklist.

### Classification rubric — apply to every hex value in the checklist, in this order

1. **Exact duplicate of an existing token's value?** → Replace with `var(--token-name)`.
   Check both `:root` values and the 4 `[data-theme]` blocks in `src/index.css` (a hex
   value only needs to match the `:root`/Blizzard value — that's the palette every
   component was written against). Full lookup table is in the Token Catalog below.
   Example: `"#0284c7,#38bdf8"` as a raw gradient string anywhere = a duplicate of
   `var(--gradient-primary)`, verbatim.
2. **Text/icon color drawn on top of a colored badge, button, or accent chip for local
   contrast** (e.g. dark text on a bright accent-colored button)? → `var(--color-bg)`
   (near-black in every theme, already the pattern `ui/Button.jsx`'s primary variant
   uses). Do not invent a new "on-accent" token.
3. **Text/icon color drawn on top of a photo or dark image-overlay scrim** (not an app
   chrome surface)? → Leave as literal `#fff`/`white` or `#000`/`black`. Photos aren't
   theme-tinted, so contrast text on them shouldn't be either.
4. **A domain-standard color convention** — ski-trail difficulty (green circle / blue
   square / black diamond / double-black / expert-only), not a brand choice? → Use the
   `--color-trail-*` tokens (see Token Catalog). These are deliberately theme-invariant:
   skiers rely on green=easy/black=hard regardless of which cosmetic theme is active.
5. **A per-entity decorative color in a static data array** (e.g. each resort or weather
   condition getting a distinct differentiator color so list items read apart from each
   other, not from the app chrome)? → Leave as literal hex, same precedent as the
   avatar-fallback palette exception from Task 0.2. Add a one-line comment:
   `/* decorative per-entity color, independent of theme palette */`.
6. **A deliberate "this is not a real resort" dev marker** (Krames Butte)? → Use
   `--color-dev-badge` / `--color-dev-badge-strong`. Deliberately loud and fixed so it
   never reads as reskinned production data.
7. **None of the above — a genuine status/semantic color (danger, success, warning) that
   doesn't exactly match an existing token's hex** (near-duplicate shades like `#ef4444`
   vs. the existing `#f87171` danger token)? → Consolidate onto the nearest existing
   semantic token family (`--color-danger*`, `--color-success*`, `--color-warning*`) or
   the new `-strong`/`-bg` variants added in Task 1. Do not preserve every pixel-different
   shade as its own token — that defeats the point of tokenizing.
8. **A structural background/surface/border/accent color that changes the actual visual
   identity of the screen** (this is the bulk of "retheme" work — most of these already
   exactly match an existing token per rule 1)? → `var(--token)`.
9. **Truly ambiguous, doesn't fit any rule above?** → Flag it in the task's commit message
   and leave it as literal hex with a `/* TODO(theming): unclear semantic, ask before
   tokenizing */` comment rather than guessing. Report these to your human partner at the
   end of the task instead of silently picking one.

---

## Token Catalog

### Already exists (added by Task 0.2 / Task 10.1) — reuse these, do not recreate

`--color-bg`, `--color-bg-elevated`, `--color-bg-deep`, `--color-surface`,
`--color-surface-hover`, `--color-surface-popover`, `--color-border`,
`--color-border-subtle`, `--color-accent`, `--color-accent-dim`, `--color-accent-glow`,
`--color-accent-2`, `--color-accent-soft`, `--color-accent-strong`, `--color-accent-deep`,
`--color-accent-teal`, `--color-text-1`, `--color-text-2`, `--color-text-3`,
`--color-text-muted`, `--color-nav-bg`, `--color-badge-border`, `--color-modal-bg`,
`--gradient-primary`, `--gradient-elite`, `--gradient-bg`, `--gradient-cta`,
`--shadow-card`, `--shadow-accent`, `--shadow-button`, `--color-success`,
`--color-success-strong`, `--color-warning`, `--color-danger`,
`--color-trail-double-black` (`#f43f5e`), `--color-trail-expert` (`#c084fc`),
`--color-banner-heading`, `--color-banner-highlight`, `--color-banner-badge-mint`,
`--color-pass-pill-text`, `--rating-mint`, `--rating-sky`, `--rating-gold`,
`--rating-peach`, `--rating-coral`, `--rating-slate` (+ each `-border` variant).

### New — added in Task 1 (theme-invariant, `:root` only, same rule as the existing
`--rating-*`/`--color-success/-warning/-danger` tokens: semantic meaning must read the
same across all 5 themes)

```css
/* Track D — app-wide theming follow-up: additional theme-invariant status/domain
   tokens. Same rule as Track C above: semantic meaning (danger intensity, ski-trail-
   difficulty convention, dev-only marker) must read the same regardless of the picked
   cosmetic theme, so these live in :root only — not redefined per [data-theme]. */
--gradient-danger:        linear-gradient(135deg, #ef4444, #b91c1c);
--color-danger-strong:    #dc2626;
--color-success-bg:       rgba(34, 197, 94, 0.12);
--color-danger-bg:        rgba(239, 68, 68, 0.12);
--color-warning-bg:       rgba(251, 191, 36, 0.12);
--color-trail-green:      #22c55e;
--color-trail-blue:       #60a5fa;
--color-trail-black:      #e2e8f0;
--color-dev-badge:        #a3e635;
--color-dev-badge-strong: #65a30d;
```

### Leave alone — documented exceptions, never tokenize

- Strava orange `#FC4C02` (`StravaConnect.jsx`, `StravaSyncReview.jsx`,
  `SessionRecapModal.jsx:318` `#fc4c02`/`#e34402`) and Spotify green `#1ed760`
  (`TripDetailModal.jsx`) — third-party brand colors.
- `ShareStatCard.jsx` — Canvas 2D rendering, stays fixed on Blizzard brand look
  (approved in spec).
- Decorative name-hash avatar-fallback palettes (e.g. `ProfilePage.jsx:742-745`) and
  `ProfileSetup.jsx`'s `SKILL_OPTIONS` (pre-existing Task 0.2 exception).
- Per-entity decorative colors in static data arrays (rule 5 above) — e.g.
  `CreateTripModal.jsx`'s `RESORTS`/weather-condition `accent`/`bg` fields.
- Pure white/black text on photos or dark image scrims (rule 3 above).

---

## Task 1: Shared `ui/` primitives + new token additions

Investigation found Task 10.1 tokenized `Badge.jsx` and `ScoreRing.jsx` but missed 7 other
`src/components/ui/` files that every later task's screens consume. Fixing these first
means every consumer gets the fix for free — this is new scope versus the approved spec
(which assumed the MVP had already covered all of `ui/`); flagging it here rather than
silently expanding later tasks.

**Files:**
- Modify: `src/index.css` (add Token Catalog's new block, after the existing `--rating-*`
  block, before `--radius-card` — i.e. right after line 103)
- Modify: `src/components/ui/Button.jsx`
- Modify: `src/components/ui/Avatar.jsx`
- Modify: `src/components/ui/AvatarStatusRail.jsx`
- Modify: `src/components/ui/GifPicker.jsx`
- Modify: `src/components/ui/HeroPhotoHeader.jsx`
- Modify: `src/components/ui/MediaMessageInput.jsx`
- Modify: `src/components/ui/ResortPicker.jsx`
- Modify: `src/components/ui/StatStrip.jsx`
- Modify: `src/components/ui/AccentCard.jsx`

**Interfaces:** none new — every prop/export of every file is unchanged, only the literal
color values inside existing `style={{...}}` objects change.

- [x] **Step 1: Add the new token block to `src/index.css`**

Insert immediately after line 103 (`--rating-slate-border: rgba(100, 116, 139, 0.2);`),
before the `--radius-card` line:

```css

  /* Track D — app-wide theming follow-up: additional theme-invariant status/domain
     tokens. Same rule as Track C below: semantic meaning (danger intensity, ski-trail-
     difficulty convention, dev-only marker) must read the same regardless of the picked
     cosmetic theme, so these live here only — not redefined per [data-theme]. */
  --gradient-danger:        linear-gradient(135deg, #ef4444, #b91c1c);
  --color-danger-strong:    #dc2626;
  --color-success-bg:       rgba(34, 197, 94, 0.12);
  --color-danger-bg:        rgba(239, 68, 68, 0.12);
  --color-warning-bg:       rgba(251, 191, 36, 0.12);
  --color-trail-green:      #22c55e;
  --color-trail-blue:       #60a5fa;
  --color-trail-black:      #e2e8f0;
  --color-dev-badge:        #a3e635;
  --color-dev-badge-strong: #65a30d;
```

- [x] **Step 2: Fix `Button.jsx`'s danger variant (worked example)**

`Button.jsx:17-21` currently:
```jsx
  danger: {
    background: "linear-gradient(135deg, #ef4444, #b91c1c)",
    color: "#fff",
    border: "none",
```
Replace with:
```jsx
  danger: {
    background: "var(--gradient-danger)",
    color: "#fff",
    border: "none",
```
(`color: "#fff"` stays literal — rule 2, on-accent contrast text.)

- [x] **Step 3: Apply the classification rubric to the remaining 8 files**

Run `grep -oE "#[0-9a-fA-F]{3,8}\b" src/components/ui/{Avatar,AvatarStatusRail,GifPicker,HeroPhotoHeader,MediaMessageInput,ResortPicker,StatStrip,AccentCard}.jsx | sort | uniq -c`
to get the exact checklist (24 total literals across these 8 files as of this writing).
Resolve each via the Methodology rubric above — the large majority will be rule-1 exact
duplicates of `--color-*`/`--gradient-*` tokens already in the Token Catalog (these files
are small UI atoms with few genuinely novel colors).

- [x] **Step 4: Verify**

Run `npm run dev`. Visit Home, Leaderboard, Profile (screens that render these primitives
today) and confirm no visual change under the default Blizzard theme — this task is a
lossless refactor, nothing should look different yet since Blizzard's token values equal
the old hardcoded hex by construction.

- [x] **Step 5: Commit**

```bash
git add src/index.css src/components/ui/
git commit -m "refactor: tokenize remaining ui/ primitives, add Track D status/domain tokens"
```

---

## Task 2: `App.jsx` — resort cards + status-color consolidation

**Files:**
- Modify: `src/App.jsx`

**Interfaces:** none new. `tierColor()`, `riskColor()`, `vibeTier()`, `scoreGradient()`
keep their exact signatures — only their internal return values change from raw hex to
`var(--token)` strings.

- [x] **Step 1: Consolidate `tierColor()`/`riskColor()`/`vibeTier()` onto existing `--rating-*` tokens (worked example)**

`src/App.jsx:413-438` currently:
```jsx
function tierColor(tier) {
  if (tier === "Elite")     return "#8ef6d1"
  if (tier === "Very Good") return "#9bc6ff"
  if (tier === "Good")      return "#ffe39a"
  if (tier === "Okay")      return "#ffc996"
  if (tier === "Closed")    return "#64748b"
  return "#ff9d9d" // Poor
}

function riskColor(risk) {
  if (risk === "Low") return "#8ef6d1"
  if (risk === "Moderate") return "#ffe39a"
  if (risk === "High") return "#ffc996"
  return "#ff9d9d"
}

function computeVibeScore(checkins, rsvps, powderScore) {
  const raw = checkins * 2 + rsvps * 3 + (powderScore ?? 0) * 0.2
  return Math.max(0, Math.min(100, raw))
}

function vibeTier(score) {
  if (score >= 70) return { label: "🔥 High", color: "#ff9d9d" }
  if (score >= 40) return { label: "👍 Active", color: "#ffe39a" }
  return { label: "😶 Quiet", color: "#64748b" }
}
```
Replace with:
```jsx
function tierColor(tier) {
  if (tier === "Elite")     return "var(--rating-mint)"
  if (tier === "Very Good") return "var(--rating-sky)"
  if (tier === "Good")      return "var(--rating-gold)"
  if (tier === "Okay")      return "var(--rating-peach)"
  if (tier === "Closed")    return "var(--rating-slate)"
  return "var(--rating-coral)" // Poor
}

function riskColor(risk) {
  if (risk === "Low") return "var(--rating-mint)"
  if (risk === "Moderate") return "var(--rating-gold)"
  if (risk === "High") return "var(--rating-peach)"
  return "var(--rating-coral)"
}

function computeVibeScore(checkins, rsvps, powderScore) {
  const raw = checkins * 2 + rsvps * 3 + (powderScore ?? 0) * 0.2
  return Math.max(0, Math.min(100, raw))
}

function vibeTier(score) {
  if (score >= 70) return { label: "🔥 High", color: "var(--rating-coral)" }
  if (score >= 40) return { label: "👍 Active", color: "var(--rating-gold)" }
  return { label: "😶 Quiet", color: "var(--rating-slate)" }
}
```
Note: `vibeTier`'s High tier intentionally reuses coral/danger-adjacent red (matches its
original `#ff9d9d`, unchanged in meaning) — not a mistake, just how it was originally
authored (🔥 High = the same visual weight as "Poor" tier elsewhere, unrelated concepts
that happen to share a color by original design).

- [x] **Step 2: Fix `scoreGradient()`'s duplicate of `--gradient-primary`/`--gradient-elite`**

`src/App.jsx:440-447`:
```jsx
function scoreGradient(score) {
  if (score == null) return "linear-gradient(135deg, #334155, #1e293b)"
  if (score >= 80) return "linear-gradient(135deg, #0e7490, #38bdf8)"   // Elite
  if (score >= 65) return "linear-gradient(135deg, #1d4ed8, #4338ca)"   // Very Good
  if (score >= 50) return "linear-gradient(135deg, #475569, #334155)"   // Good
  if (score >= 35) return "linear-gradient(135deg, #7c2d12, #92400e)"   // Okay
  return "linear-gradient(135deg, #7f1d1d, #451a03)"                    // Poor
}
```
The Elite case (`#0e7490, #38bdf8`) is an exact duplicate of `--gradient-elite`. The other
four gradients have no existing token — add them as part of this task since they're the
same semantic family as the tier colors above (theme-invariant status gradients):
```jsx
function scoreGradient(score) {
  if (score == null) return "linear-gradient(135deg, #334155, #1e293b)"
  if (score >= 80) return "var(--gradient-elite)"                       // Elite
  if (score >= 65) return "linear-gradient(135deg, #1d4ed8, #4338ca)"   // Very Good
  if (score >= 50) return "linear-gradient(135deg, #475569, #334155)"   // Good
  if (score >= 35) return "linear-gradient(135deg, #7c2d12, #92400e)"   // Okay
  return "linear-gradient(135deg, #7f1d1d, #451a03)"                    // Poor
}
```
(The `score == null`/Very Good/Good/Okay/Poor gradients stay literal — they're
theme-invariant score-tier gradients with no brand-color meaning, same category as the
`--rating-*` tokens but expressed as gradients; not worth 4 new single-use tokens for a
function only called in one place.)

- [x] **Step 3: Apply the rubric to the remaining checklist**

`grep -oE "#[0-9a-fA-F]{3,8}\b" src/App.jsx | sort | uniq -c | sort -rn` for the full list
(34 distinct values as of this writing). Beyond Steps 1-2 above, the notable ones:
  - `#38bdf8` (15×) and other exact `--color-accent`/`--gradient-primary` component
    duplicates → rule 1.
  - `#a3e635` (`App.jsx:1858`, Krames Butte dev-only styling) → `var(--color-dev-badge)`,
    rule 6.
  - `#ffd1d1`, `#34d399`, `#ef4444`, `#dc2626` → rule 7, consolidate onto
    `--color-danger`/`--color-danger-strong`/`--color-success` family.
  - Any resort-card badge text sitting on a colored pill background → rule 2,
    `var(--color-bg)`.

- [x] **Step 4: Verify no functionality dropped**

Run `npm run dev`, go to the Snow tab. For at least one resort: expand "Show Details" and
confirm every detail row still renders (this file's `ResortCard` has the app's highest
regression risk per the Premium UI Uplift plan's own Task 14 note — same caution applies
here). Confirm tier badges, risk badges, and the vibe badge still show the correct color
for their state.

- [x] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "refactor: tokenize App.jsx resort-card colors, consolidate tierColor/riskColor/vibeTier onto rating tokens"
```

---

## Task 3: PowderMap

**Files:**
- Modify: `src/components/PowderMap.jsx`

**Interfaces:** none new.

- [x] **Step 1: Consolidate the score-color function onto the same rating tokens as `App.jsx` (worked example)**

`PowderMap.jsx` has its own independent copy of "what color is a good powder score"
(lines ~8-14):
```jsx
  if (score >= 76) return "#1e3a8a"     // strong navy-blue
  ...
  return "#bae6fd"                      // very light blue
```
This is a third parallel copy of the same status-color concept `App.jsx`'s `tierColor()`
and `Badge.jsx`'s `TIER_COLORS` already tokenize as `--rating-*`. Read the full function
(it buckets by numeric score, not tier name, so it won't map 1:1 to 5 discrete
`--rating-*` values) and replace its buckets with the closest matching `--rating-*` token
per bucket boundary, preserving the same number of visual buckets. If the bucket
boundaries don't cleanly align to 5 discrete tiers, keep the numeric buckets but swap each
returned literal for the nearest `--rating-*` token by name (e.g. a "strong/good/weak"
3-bucket function maps to mint/gold/coral).

- [x] **Step 2: Apply the rubric to the remaining checklist**

`grep -oE "#[0-9a-fA-F]{3,8}\b" src/components/PowderMap.jsx | sort | uniq -c` (13 distinct
values as of this writing). `#92400e` and other exact token duplicates → rule 1. The
`LegendItem color="..."` props should reference whichever token the corresponding bucket
above now uses, so the legend and the map markers can never drift out of sync.

- [x] **Step 3: Verify**

Run `npm run dev`, open the map view (from Home or wherever `PowderMap` is mounted).
Confirm resort markers still color-code by score the same way as before, and the legend
still matches the marker colors.

- [x] **Step 4: Commit**

```bash
git add src/components/PowderMap.jsx
git commit -m "refactor: tokenize PowderMap score-color function onto shared rating tokens"
```

---

## Task 4: Trip flow

**Files:**
- Modify: `src/components/TripDetailModal.jsx`
- Modify: `src/components/CreateTripModal.jsx`
- Modify: `src/components/TripCard.jsx`
- Modify: `src/components/TripChatView.jsx`

**Interfaces:** none new.

- [x] **Step 1: On-accent text color (worked example, rule 2)**

`TripDetailModal.jsx:768`:
```jsx
<div style={{ position: "absolute", top: 14, left: 14, zIndex: 3, background: accent, color: "#020617", borderRadius: 999, padding: "5px 13px", fontSize: 12, fontWeight: 900, letterSpacing: 0.3, boxShadow: `0 4px 18px ${accent}77` }}>
```
Replace `color: "#020617"` with `color: "var(--color-bg)"`. This exact pattern (`#020617`
as text color against `background: accent`) repeats at lines 853, 1116, 1172, 1181, 1342,
and others in this file — apply the same replacement everywhere `"#020617"` appears as a
`color` value paired with an `accent`-derived background. (`#020617` used any other way —
check first — should follow the general rubric instead.)

- [x] **Step 2: Third-party brand color exception (worked example, do NOT change)**

`TripDetailModal.jsx:872` and `:883` use `#1ed760` (Spotify green) for the "Trip Playlist"
feature. Leave these exactly as-is — Spotify brand color, per the Token Catalog exception
list. Add a one-line comment on first use: `/* Spotify brand color — do not tokenize */`.

- [x] **Step 3: Per-entity decorative accent exception (worked example, do NOT change)**

`CreateTripModal.jsx:14`: `{ key: "arapahoebasin", name: "Arapahoe Basin", pass: "Ikon", photo: "...", accent: "#94a3b8" }`
and the `WEATHER_CONDITIONS`-style array around line 27 (`bg`/`accent` pairs per
condition). These are rule-5 per-entity decorative differentiators, not theme colors —
leave as literal hex.

- [x] **Step 4: Apply the rubric to the remaining checklist**

`grep -oE "#[0-9a-fA-F]{3,8}\b" src/components/{TripDetailModal,CreateTripModal,TripCard,TripChatView}.jsx | sort | uniq -c | sort -rn`
(109 total literals across these 4 files as of this writing). Beyond Steps 1-3, expect:
rule-1 exact duplicates (`#fff`, structural bg/surface hex matching root tokens), rule-7
danger/success near-duplicates (`#fb7185`, `#fda4af`, `#f97316`, `#d97706` → consolidate
onto `--color-danger`/`--color-warning` family), and structural modal backgrounds
(`#0b1424`, `#08111e`, `#1e3a5f`) that don't exactly match an existing token — these map
to whichever of `--color-modal-bg`/`--color-bg-deep`/`--color-bg-elevated` is visually
closest; prefer reusing an existing token over adding a new one unless none is close.

- [x] **Step 5: Verify**

Run `npm run dev`. Create a trip via `CreateTripModal`, open it in `TripDetailModal`,
confirm the carpool section, RSVP list, comments, and (if connected) the Spotify playlist
section all still render and function. Open a trip's chat via `TripChatView`.

- [x] **Step 6: Commit**

```bash
git add src/components/TripDetailModal.jsx src/components/CreateTripModal.jsx src/components/TripCard.jsx src/components/TripChatView.jsx
git commit -m "refactor: tokenize trip flow colors for theme switching"
```

---

## Task 5: Messaging / crew chat

**Files:**
- Modify: `src/components/MessagingCenter.jsx`
- Modify: `src/components/CrewGroupChat.jsx`
- Modify: `src/components/DirectMessageView.jsx`
- Modify: `src/components/DateMatchmaker.jsx`

**Interfaces:** none new.

- [x] **Step 1: Consolidate `SKILL_COLORS` onto the ski-trail-difficulty tokens (worked example)**

`DirectMessageView.jsx:8-14` currently:
```jsx
const SKILL_COLORS = {
  green:        "#22c55e",
  blue:         "#60a5fa",
  black:        "#e2e8f0",
  double_black: "#f43f5e",
  experts_only: "#c084fc",
}
```
This is the exact ski-trail-difficulty convention (rule 4) — green circle / blue square /
black diamond / double-black diamond / experts-only, an internationally standardized
signage convention, not a brand choice. Replace with the Token Catalog's trail tokens
(note `double_black` and `experts_only` already had exact-matching tokens before this
plan — `#f43f5e`/`#c084fc` — confirming this was always the intended semantic):
```jsx
const SKILL_COLORS = {
  green:        "var(--color-trail-green)",
  blue:         "var(--color-trail-blue)",
  black:        "var(--color-trail-black)",
  double_black: "var(--color-trail-double-black)",
  experts_only: "var(--color-trail-expert)",
}
```
Search the other 3 files in this task for a similar skill/difficulty color map — if one
exists (check `CrewGroupChat.jsx` and `MessagingCenter.jsx` for a `SKILL_COLORS`-shaped
object), consolidate it onto the same tokens rather than leaving a second copy.

- [x] **Step 2: Apply the rubric to the remaining checklist**

`grep -oE "#[0-9a-fA-F]{3,8}\b" src/components/{MessagingCenter,CrewGroupChat,DirectMessageView,DateMatchmaker}.jsx | sort | uniq -c | sort -rn`
(81 total literals across these 4 files as of this writing). `DateMatchmaker.jsx`'s purple
family (`#8b5cf6`, `#a78bfa`, `#9333ea`, `#c4b5fd`) is a UI accent distinct from
`--color-accent-2` (which drifts per theme) — check whether it's meant to always read as
"purple" (a fixed feature-identity color for the matchmaker feature, like a badge) or
should retheme with everything else; if the former, treat as rule-9 (flag and ask) rather
than guessing, since this wasn't resolved during brainstorming.

- [x] **Step 3: Verify**

Run `npm run dev`. Open a DM thread (confirm the partner's skill-level badge still shows
the correct trail color), open a crew group chat, and open the Date Matchmaker composer
from a crew chat's "📅 Find a Date with Your Crew" button.

- [x] **Step 4: Commit**

```bash
git add src/components/MessagingCenter.jsx src/components/CrewGroupChat.jsx src/components/DirectMessageView.jsx src/components/DateMatchmaker.jsx
git commit -m "refactor: tokenize messaging/crew-chat colors, consolidate SKILL_COLORS onto trail-difficulty tokens"
```

---

## Task 6: Landing / onboarding / auth

**Files:**
- Modify: `src/components/LandingPage.jsx`
- Modify: `src/components/OnboardingFlow.jsx`
- Modify: `src/components/ProfileSetup.jsx`
- Modify: `src/components/AuthForm.jsx`
- Modify: `src/components/AuthPanel.jsx`

**Interfaces:** none new.

- [x] **Step 1: Apply the rubric to the full checklist**

`grep -oE "#[0-9a-fA-F]{3,8}\b" src/components/{LandingPage,OnboardingFlow,ProfileSetup,AuthForm,AuthPanel}.jsx | sort | uniq -c | sort -rn`
(65 total literals across these 5 files as of this writing). These screens are seen once
per user (or once per session, pre-login) and were built earliest in the app's history —
expect mostly rule-1 exact duplicates of `--color-bg`/`--color-accent`/`--gradient-primary`
family tokens, since they predate every semantic-color addition from later sprints.
`ProfileSetup.jsx`'s `#14b8a6` (4×) is `--color-accent-teal`'s exact value — rule 1.
`ProfileSetup.jsx`'s `SKILL_OPTIONS` is the pre-existing Task 0.2 exception (leave alone,
already documented).

- [x] **Step 2: Verify**

Run `npm run dev`, log out, walk the landing page → auth form → onboarding flow →
profile setup sequence for a fresh (or test) account.

- [x] **Step 3: Commit**

```bash
git add src/components/LandingPage.jsx src/components/OnboardingFlow.jsx src/components/ProfileSetup.jsx src/components/AuthForm.jsx src/components/AuthPanel.jsx
git commit -m "refactor: tokenize landing/onboarding/auth colors for theme switching"
```

---

## Task 7: Mountain Page / Board

**Files:**
- Modify: `src/components/MountainBoard.jsx`
- Modify: `src/components/MountainPage.jsx`
- Modify: `src/components/EventsWidget.jsx`

**Interfaces:** none new.

- [x] **Step 1: Krames Butte dev-marker exception (worked example, rule 6)**

`MountainBoard.jsx:135`:
```jsx
background: resortKey === KRAMES_BUTTE_KEY ? "linear-gradient(135deg,#65a30d,#a3e635)" : "rgba(163,230,53,0.08)",
```
Replace the lime literals with the new dev-badge tokens, keep the conditional structure
identical:
```jsx
background: resortKey === KRAMES_BUTTE_KEY ? "linear-gradient(135deg,var(--color-dev-badge-strong),var(--color-dev-badge))" : "rgba(163,230,53,0.08)",
```
The `rgba(163,230,53,0.08)` fallback (the non-Krames-Butte case) is the same lime hue at
low opacity — check its surrounding context; if it's also part of the dev-badge visual
language leave it as a literal rgba (CSS custom properties can't be partially
alpha-modified via string interpolation the way this codebase's `${accent}77` pattern
works elsewhere) or convert to `color-mix()` only if every target browser support matters
less than consistency — default to leaving the rgba literal as-is unless it's trivial.

- [x] **Step 2: `#0284c7` gradient duplicate (worked example, rule 1)**

`MountainBoard.jsx:121` and `:206` both use `"linear-gradient(135deg,#0284c7,#38bdf8)"` —
exact duplicate of `var(--gradient-primary)`. Replace both.

- [x] **Step 3: Apply the rubric to the remaining checklist**

`grep -oE "#[0-9a-fA-F]{3,8}\b" src/components/{MountainBoard,MountainPage,EventsWidget}.jsx | sort | uniq -c | sort -rn`
(25 total literals across these 3 files as of this writing).

- [x] **Step 4: Verify**

Run `npm run dev` as the app owner account (Krames Butte access is owner-gated). Open
Mountain Page for a real resort, confirm the hero/stat strip/events tab all render.
Open Mountain Page for Krames Butte, confirm the dev-marker styling is still visually
distinct from real resorts. Post to the board.

- [x] **Step 5: Commit**

```bash
git add src/components/MountainBoard.jsx src/components/MountainPage.jsx src/components/EventsWidget.jsx
git commit -m "refactor: tokenize Mountain Page/Board colors, move Krames Butte dev-marker onto dedicated tokens"
```

---

## Task 8: Social / friends

**Files:**
- Modify: `src/components/FriendsPage.jsx`
- Modify: `src/components/UserProfileModal.jsx`
- Modify: `src/components/NotificationBell.jsx`
- Modify: `src/components/ActivityFeed.jsx`
- Modify: `src/components/TodaysCrew.jsx`

**Interfaces:** none new.

- [x] **Step 1: Success/danger status consolidation (worked example)**

`FriendsPage.jsx:168`:
```jsx
<div style={{ fontSize: 12, fontWeight: 700, color: invite.status === "accepted" ? "#86efac" : "rgba(255,255,255,0.4)" }}>
```
and `:390`: `background: "#ef4444",` (a remove/decline action). Replace `"#86efac"` with
`"var(--color-success)"` and `"#ef4444"` with `"var(--color-danger)"` — both are rule-7
near-duplicates of the existing status tokens (not exact matches, but same semantic
intent: accepted=success, decline=danger).

- [x] **Step 2: Apply the rubric to the remaining checklist**

`grep -oE "#[0-9a-fA-F]{3,8}\b" src/components/{FriendsPage,UserProfileModal,NotificationBell,ActivityFeed,TodaysCrew}.jsx | sort | uniq -c | sort -rn`
(61 total literals across these 5 files as of this writing). `#fde68a`/`#fde047`/`#facc15`
family (amber/gold, `NotificationBell.jsx` likely) → consolidate onto `--color-warning`
per rule 7 unless clearly a rule-4/5 exception on inspection.

- [x] **Step 3: Verify**

Run `npm run dev`. Open Friends tab (pending/accepted invites), open a friend's profile
modal, check the notification bell dropdown, check the Social tab's Activity Feed
sub-tab, and confirm the Active Crew rail on the Plans tab (`TodaysCrew.jsx`) still shows
status dots (`arrived`/`driving`/`planning`/`done`) correctly.

- [x] **Step 4: Commit**

```bash
git add src/components/FriendsPage.jsx src/components/UserProfileModal.jsx src/components/NotificationBell.jsx src/components/ActivityFeed.jsx src/components/TodaysCrew.jsx
git commit -m "refactor: tokenize social/friends colors for theme switching"
```

---

## Task 9: Session flow

**Files:**
- Modify: `src/components/ActiveSessionBar.jsx`
- Modify: `src/components/SessionRecapModal.jsx`
- Modify: `src/components/SessionEditForm.jsx`
- Modify: `src/components/SessionStatsForm.jsx`
- Modify: `src/components/SkiCheckInForm.jsx`
- Modify: `src/components/SkiPingModal.jsx`
- Modify: `src/components/SkiPlansPage.jsx`

**Interfaces:** none new.

- [x] **Step 1: Strava brand-color exception (worked example, do NOT change)**

`SessionRecapModal.jsx:318`:
```jsx
background: "linear-gradient(135deg, #fc4c02, #e34402)",
```
Strava brand orange — leave exactly as-is (Token Catalog exception list). Add
`/* Strava brand color — do not tokenize */` if not already commented.

- [x] **Step 2: `SkiPlansPage.jsx`'s `DOT_COLORS` (worked example)**

This file's `DOT_COLORS` (ROADMAP Section 10's own outstanding note names it explicitly)
almost certainly represents calendar/status dot states. Locate it (`grep -n
"DOT_COLORS" src/components/SkiPlansPage.jsx`), read what each key represents, and apply
the rubric per key — if the dots represent the same session-status concepts already
tokenized elsewhere (planning/going/done, or similar), consolidate onto those; if they're
genuinely new states, apply rule 7/8 as appropriate.

- [x] **Step 3: Apply the rubric to the remaining checklist**

`grep -oE "#[0-9a-fA-F]{3,8}\b" src/components/{ActiveSessionBar,SessionRecapModal,SessionEditForm,SessionStatsForm,SkiCheckInForm,SkiPingModal,SkiPlansPage}.jsx | sort | uniq -c | sort -rn`
(62 total literals across these 7 files as of this writing, minus the Strava exception
from Step 1).

- [x] **Step 4: Verify**

Run `npm run dev`. Start an active session ("Start My Day" on Home), confirm
`ActiveSessionBar` still renders and persists across tab switches, end the session and
confirm `SessionRecapModal` (including the Strava-orange share/connect styling) still
renders correctly, check in via `SkiCheckInForm`, edit a past session via
`SessionEditForm`/`SessionStatsForm`, and check the Plans tab calendar dots.

- [x] **Step 5: Commit**

```bash
git add src/components/ActiveSessionBar.jsx src/components/SessionRecapModal.jsx src/components/SessionEditForm.jsx src/components/SessionStatsForm.jsx src/components/SkiCheckInForm.jsx src/components/SkiPingModal.jsx src/components/SkiPlansPage.jsx
git commit -m "refactor: tokenize session-flow colors for theme switching"
```

---

## Task 10: Final whole-branch review + 5-theme visual verification

**Files:** none (verification-only task, no code changes expected unless review finds an
issue).

- [x] **Step 1: Full-repo hex audit**

```bash
for f in src/App.jsx src/components/*.jsx src/components/ui/*.jsx; do
  c=$(grep -oE "#[0-9a-fA-F]{3,8}\b" "$f" | wc -l | tr -d ' ')
  [ "$c" -gt 0 ] && echo "$c $f"
done | sort -rn
```
Every remaining hit must be traceable to a documented exception in the Token Catalog
(Strava/Spotify, `ShareStatCard.jsx`, decorative per-entity arrays, avatar-fallback
palette, photo-overlay contrast text) or a genuinely theme-invariant status/domain color
consolidated in Tasks 1-9. Any hit that isn't — investigate and fix before proceeding.

Ran 2026-08-12 (node/npm now available in-session, unlike Tasks 1-9's sandbox). Manually
classified every remaining hit against the Token Catalog/rubric. Found and fixed one real
gap: ~19 generic body/label/heading `#fff` text-color literals in `AuthForm.jsx`,
`DateMatchmaker.jsx`, `FriendsPage.jsx`, `ProfilePage.jsx`, and `SkiPingModal.jsx` had no
documented exception comment (every other leftover hex did) — routed to
`var(--color-text-1)`, on-accent button text and the native `<select>` option color left
literal. Also added the missing hex-alpha-suffix exception comment to `ProfilePage.jsx`'s
`SKILL_OPTIONS` for consistency with its sibling files. Fixed in commit `752ec25`. Re-ran
the audit after the fix — every remaining hit is now traceable: third-party brand colors
(Strava/Spotify), `ShareStatCard.jsx`'s fixed-Blizzard exception, decorative per-entity
arrays, the avatar-fallback hash palette, Leaflet's fixed-white popup chrome in
`PowderMap.jsx`, on-accent button text, the native `<select>` option, and explicitly
flagged `TODO(theming)` items (see Step 2 note below).

- [x] **Step 2: Playwright visual verification across all 5 themes**

Using a real logged-in test account (per the approved spec's required acceptance step),
drive each of the 5 themes (tap each swatch on Profile) through the following screens and
confirm correct repaint with no leftover Blizzard-blue on any of them: a trip detail +
create-trip flow, a chat thread (DM or crew), the map view, Mountain Page (a real resort),
friends list, and an active session (start → session sheet → end → recap modal). Screenshot
each theme × screen combination for the record.

Done 2026-08-12, in two passes. First pass (no credentials available) verified the
logged-out app shell only: all 5 themes correctly flip `data-theme` on `<html>` and repaint
the landing page with zero non-network console errors. Second pass, after the app owner
supplied real login credentials for this in-session verification only (used transiently by
a throwaway Playwright script, never written to any committed file): logged in and drove
all 5 themes through trip detail, the create-trip picker, an existing chat thread, the
friends list, the map view, and a real resort's Mountain Page — 45 screenshots captured to
`/tmp/theme-screenshots/walkthrough/` (not committed, local artifact only). Kept strictly
read-only per the app owner's real account/data: opened the create-trip modal without
submitting, opened a chat thread without sending a message, did not start/end a real ski
session (that would have written a fake GPS-tracked session into the owner's real season
stats) — that one path is the only screen not walked by automation and is low-risk (`Home`
dashboard's session UI, not touched by Tasks 1-9 beyond `ActiveSessionBar.jsx`'s already-
reviewed tokens).

All 5 themes repainted correctly with no leftover Blizzard-blue: accent-colored buttons,
badges, active-tab nav, theme-swatch backdrop tint, and modal chrome all correctly track
the selected theme. One apparent anomaly was checked and confirmed *not* a bug: the trip
chat composer's "?" avatar-fallback circle (`ui/Avatar.jsx`'s documented decorative hash
palette) picks up `var(--color-accent-teal)` for the logged-in user, and that token is
itself defined with a different hue per theme by original Task 10.1 design (e.g. blue in
both Blizzard and Alpine Dawn, green in Aurora Peak) — locked palette territory, out of
this plan's scope, not a regression. Theme-invariant elements (rating/status colors on the
map legend, EPIC/IKON pass badges, "Closed for Season" danger badge) correctly stayed fixed
across all 5 themes, matching the Token Catalog's documented exceptions.

Also surfaced, out of scope for this plan (no code touched): a pre-existing
`getPendingCrewInvites` Supabase error (`PGRST200` — no foreign-key relationship found
between the expected tables) fired repeatedly in the console during the walkthrough. Purely
a backend/schema issue, unrelated to theming; flagging for the app owner to look into
separately.

- [x] **Step 3: `npm run lint`**

Ask the app owner to run `npm run lint` locally (no node/npm in this sandbox) and report
back any failures for the branch before merge.

Ran 2026-08-12 (node/npm available in-session). 91 problems on this branch vs. 182 on
`main` — diffed the two runs file-by-file and confirmed every error/warning on this branch
already exists on `main` in the same file; none were introduced by the theming work (the
branch has fewer total, likely from removing some duplicate literal-color patterns along
the way). Nothing to fix here.

- [x] **Step 4: Fix anything found, else proceed to merge per `superpowers:finishing-a-development-branch`**

If Steps 1-3 are clean, this plan is complete — hand off to
`superpowers:finishing-a-development-branch` to decide how to integrate the worktree
branch. If issues were found, fix them in a follow-up commit on the same branch and
re-run Steps 1-2 before merge.

Steps 1-3 are clean (Step 1 found and fixed one real gap, see its note; nothing further to
fix after that). Task 10 is complete — handing off to
`superpowers:finishing-a-development-branch`. Two non-blocking items for the app owner to
weigh in on before or after merge (not treated as blockers, both explicitly deferred to a
human call per the plan's own rubric rule 9): whether `DateMatchmaker.jsx`/
`MessagingCenter.jsx`'s purple accent family should retheme with everything else or stay a
fixed "matchmaker purple" identity, and the pre-existing `getPendingCrewInvites` Supabase
schema error surfaced during the walkthrough (unrelated to theming).
