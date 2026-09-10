# Light / Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light mode to PowDays as a second, independent axis alongside the existing 5-theme cosmetic picker — 10 total palettes, chosen by a manual toggle in the Profile page's Appearance card, persisted in a new `profiles.theme_mode` column that defaults to `'dark'` so nothing changes for any existing user until they opt in — and retrofit the ~1,200 hardcoded white/dark colour literals across 67 files onto mode-adaptive tokens so the app is actually readable when the page turns white.

**Architecture:** Three layers. (1) **Data** — one migration adds `profiles.theme_mode TEXT NOT NULL DEFAULT 'dark' CHECK (theme_mode IN ('dark','light'))`, wired through the existing `PROFILE_SELECT_COLUMNS` / `PROFILE_WRITE_FIELDS` / `upsertMyProfile` triple exactly the way the existing `theme` column already is. (2) **Tokens** — `src/index.css` gains two new mode-scoped alpha scales (`--overlay-*` for surfaces/borders, `--ink-*` for text/icons) whose dark values are byte-identical to today's `rgba(255,255,255,alpha)` literals and whose light values are hand-tuned dark-on-light equivalents at matched WCAG contrast, plus five new light palettes selected by `[data-mode="light"]` (Blizzard, the baseline) and `[data-theme="X"][data-mode="light"]` (the other four). (3) **Retrofit** — 70 component files plus `src/index.css` have their hardcoded colour literals mechanically substituted onto those tokens by three fixed rules, grouped into 14 tasks by app area, each verified by a `grep -c` that must return a stated number.

**Tech Stack:** React 19 (function components, hooks, inline `style={{}}` objects), CSS custom properties on `<html>` via `data-theme` / `data-mode` attributes, Supabase JS v2 plus raw SQL migrations run by hand in the Supabase SQL editor, `node --test` over `src/lib/*.test.js` only, Vite 7, ESLint 9.

## Global Constraints

- **Source of truth:** `docs/superpowers/specs/2026-09-10-light-dark-mode-design.md`, including its "Scope — REVISED during planning" section. Every decision in it has a task below. Where this plan goes beyond the spec it says so explicitly, in "Deviations and discoveries".
- **Dark mode must not change.** Every token this plan adds is defined so that, with `data-mode` absent or `"dark"`, the computed value is byte-identical to the literal it replaced. There are exactly four knowing exceptions, all listed in "Deviation 4 — accepted dark-mode visual deltas". If you find yourself changing a dark-mode colour that is not on that list, stop: you have mis-applied a substitution rule.
- **Default mode is `'dark'` for everyone**, existing users and new signups. The migration's column default is `'dark'`, `upsertMyProfile` falls back to `'dark'`, `App.jsx` falls back to `'dark'`, and `index.html`'s pre-mount script only *sets* `data-mode` when localStorage says `light`. A user who never touches the toggle must never see a light pixel.
- **No `prefers-color-scheme` anywhere.** The spec rejects OS auto-detection. `grep -rn "prefers-color-scheme" src index.html` must return zero hits at the end of this branch, exactly as it does today.
- **`ProfileSetup.jsx` and `OnboardingFlow.jsx` are NOT migrated to `buildProfileUpdate()`.** They are account-creation-time writers with a pre-existing, separately tracked deferral. They ARE in scope for the colour retrofit (Task 20) and are NOT in scope for the write-path change (Task 1). Do not "fix" them.
- **`upsertMyProfile()` writes a WHOLE row.** `src/lib/socialApi.js:443-476` builds its payload from an explicit field list with `|| null` / `?? false` fallbacks, so any field missing from the object handed to it is written as null/false. Every profile write must go through `buildProfileUpdate()` from `src/lib/profileForm.js`. Adding `theme_mode` to `PROFILE_WRITE_FIELDS` without also adding it to `upsertMyProfile`'s payload would mean the toggle appears to work and then silently resets — Task 1 does both in one commit for that reason.
- **Colours come from CSS custom properties**, never raw hex or raw `rgba()`, with the documented exceptions listed in "The exception list" below. That list is exhaustive; anything not on it gets tokenised.
- **Test harness:** `npm test` is `node --test src/lib/*.test.js`. There is **no DOM, component, or visual-regression runner in this repo and this plan does not add one.** `src/index.css` and every `.jsx` file are therefore verified by (a) the exact `grep -c` command each task states, (b) `npm run build`, (c) `npx eslint <paths>`, and (d) Kyle's manual click-through from the list in Task 22. Do not invent a screenshot-diff mechanism.
- **Baselines measured in this worktree on 2026-09-10 at commit `b52cc49`:** `npm test` gives **294 tests, 294 pass, 0 fail**. `npx eslint .` gives **85 problems (78 errors, 7 warnings)**. Neither number may get worse. New tests only ever add to the 294.
- **Commit after every task**, one task per commit, message prefix `feat:` for behaviour, `refactor:` for the pure colour-substitution tasks, `chore:` for the migration file.
- **Migration files are never run by this plan.** `migrations/*.sql` are applied by Kyle by hand in the Supabase SQL editor, followed by `NOTIFY pgrst, 'reload schema';`. The plan writes the file and says so; it does not attempt to connect to a database.

---

## Verified against the live codebase (2026-09-10, worktree `light-dark-mode` at `b52cc49`)

Every claim below was checked on disk before this plan was written. Where a check contradicted the briefing, this plan follows the check and says so.

| # | Claim | Verified result |
|---|---|---|
| 1 | `src/index.css` has `:root` plus 4 `[data-theme]` blocks | **CONFIRMED.** `:root` = lines 4-165 (Blizzard dark baseline plus all theme-invariant tokens plus typography/spacing). `[data-theme="alpine-dawn"]` = 177-192, `[data-theme="storm-chaser"]` = 195-210, `[data-theme="aurora-peak"]` = 213-228, `[data-theme="base-lodge"]` = 233-248. There is **no** `[data-theme="blizzard"]` block. File is 635 lines. |
| 2 | Blizzard-light can be written as `[data-theme="blizzard"][data-mode="light"]` | **NO — THIS WOULD SHIP BROKEN.** `data-theme` is frequently *absent* from `<html>`: `index.html:38-41` only sets it when `localStorage.pd_theme` exists, and `App.jsx:749` only runs after a successful `getCurrentUser()`, which throws for signed-out visitors. A signed-out user, or a signed-in user on a fresh device before `loadHeaderUser()` resolves, has no `data-theme` at all. **Blizzard-light therefore uses the bare selector `[data-mode="light"]`**, mirroring how Blizzard-dark lives in `:root` rather than in a `[data-theme]` block. See Deviation 1. |
| 3 | Cascade order works out | **CONFIRMED by specificity arithmetic.** `:root` is (0,1,0). `[data-theme="alpine-dawn"]` is (0,1,0). `[data-mode="light"]` is (0,1,0). `[data-theme="alpine-dawn"][data-mode="light"]` is (0,2,0). Equal-specificity ties break on source order, so the file order **must** be: `:root`, then the 4 dark theme blocks, then `[data-mode="light"]`, then the 4 `[data-theme="X"][data-mode="light"]` blocks. Task 3 states that placement explicitly. |
| 4 | `.top-nav` and `.mobile-top-bar` bypass `--color-nav-bg` | **CONFIRMED, and it is a real latent bug.** `index.css:343` and `index.css:376` both hardcode `background: rgba(4, 8, 15, 0.92)` and `index.css:489` (`.bottom-nav`) hardcodes `rgba(4, 8, 15, 0.97)`, even though `--color-nav-bg` exists per-theme at `index.css:43`, `183`, `201`, `219`, `239` for exactly this purpose. **Today, in dark mode, all four non-Blizzard themes render a Blizzard-blue-black nav bar** — the token was added and never wired up. All three rules also hardcode `border-bottom`/`border-top: 1px solid rgba(56, 189, 248, 0.1)`, Blizzard's accent. Task 4 fixes all six declarations. |
| 5 | Hardcoded `rgba(255,255,255,alpha)` count | **1,093 occurrences across 67 files** (not 1,023 across 52). The briefing's list omitted `src/index.css` (12), `src/components/ui/*` (10 files, 31), `src/components/profile/*` (3 files, 16), and `ShareStatCard.jsx` (20). One of the 1,093 is `src/lib/shareCardTokens.test.js:38`, which is an assertion string in a unit test and **must not be touched**. Working total to retrofit: **1,092 across 66 files.** Full per-file inventory below. |
| 6 | Distinct alpha values in use | **50 distinct**, cleanly split by role: `color:`/`fill:`-family sites use only **0.2 to 0.9** (29 values, 380+ sites); `background`/`border`/`boxShadow`-family sites use only **0.02 to 0.25** (21 values, 483+ sites). The only overlap values are 0.2, 0.22 and 0.25. This split is what makes two scales (`--ink-*`, `--overlay-*`) cheaper and safer than one. |
| 7 | Literal white count | **273 occurrences across 60 files**: 271 as `color:`, 2 as `background:` (`LeaderboardPage.jsx:180`, `ActiveSessionBar.jsx:301` — both a knob/dot on a coloured track), plus 7 `ctx.fillStyle = "white"` canvas calls in `ShareStatCard.jsx`. One of the 273 is `shareCardTokens.test.js:38`'s `rgba("#ffffff", 0)` assertion — **do not touch**. |
| 8 | One rule covers all 271 `color: "white"` sites | **NO.** At least 40 of them are white text sitting on a saturated accent fill (`background: "var(--gradient-cta)", color: "white"`), where white stays correct in light mode because every light palette's accent is a deep, saturated shade. Blanket-replacing those with `var(--color-text-1)` would put near-black text on a dark blue button. **Two targets are required:** `--color-text-1` for white-on-glass, and a new `--color-on-accent` for white-on-accent-fill. `DirectMessageView.jsx:99` and `TripChatView.jsx:75` need *both* in one ternary — see Rule 2's worked example. |
| 9 | The 5 theme-invariant token families are safe to leave alone in light mode | **NO — `--color-danger` alone is used as a text colour 64 times.** Its dark value `#f87171` scores **2.2:1 on a near-white background**, far below AA. `--color-success` (19 uses), `--color-warning` (18), the six `--rating-*` (31), `--color-trail-black` `#e2e8f0` (invisible on white), `--color-dev-badge`, `--color-banner-badge-mint` and the `--season-grid-tier-*` scale all fail the same way. **These tokens stay theme-invariant but become mode-variant** — one set of light values in the `[data-mode="light"]` block, shared by all 5 light palettes. See Deviation 2. |
| 10 | A third hardcoding pattern exists | **YES, and the spec does not mention it.** About 62 occurrences across 23 files hardcode a *dark* literal — `rgba(4,8,15,0.85)`, `rgba(2,6,23,0.88)`, `rgba(10,14,30,0.98)`, `rgba(8,17,31,0.85)` — as modal backdrops, sheet panels and avatar ring borders. Left alone, every modal in the app stays a black panel in light mode. Rule 3 handles them. A subset of them are **photo overlays** that must stay dark in both modes; they are named individually in "The exception list". |
| 11 | `getShareCardTheme` has one call site | **CONFIRMED** — `ShareStatCard.jsx:155`, inside `renderCard`. All three `ShareStatCard` call sites (`ProfilePage.jsx:909`, `ProfileStats.jsx:220`, `SessionRecapModal.jsx:462`) pass the whole loaded `profile` object, so `theme_mode` reaches the canvas for free once it is in `PROFILE_SELECT_COLUMNS`. **No new prop threading is needed anywhere.** |
| 12 | `renderCard` already has a local called `mode` | **YES — `ShareStatCard.jsx:154` is `const mode = session ? "session" : "season"`.** The theme-mode variable inside `renderCard` **must** be called `themeMode`, not `mode`, or you will silently shadow the session/season switch that drives half the card's layout. |
| 13 | `PROFILE_SELECT_COLUMNS` and `upsertMyProfile` both name `theme` explicitly | **CONFIRMED** — `socialApi.js:23` (select list) and `socialApi.js:464` (`theme: profile.theme || "blizzard"`). `theme_mode` follows the identical pattern in both places. |
| 14 | Highest existing migration number | **CONFIRMED `047_mutual_friend_count.sql`.** The new file is `migrations/048_theme_mode.sql`. `migrations/` is a tracked directory inside this worktree (`ls migrations/` works from the worktree root). |
| 15 | `handleSelectTheme`'s optimistic pattern | **CONFIRMED** — `ProfilePage.jsx:421-436`: set the DOM attribute, write localStorage in a `try/catch`, `await upsertMyProfile(buildProfileUpdate(profile, {...}))`, `await load()`, and on throw restore the attribute from `profile?.theme` and `alert()`. `handleSelectMode` mirrors it exactly. |
| 16 | The Appearance card is one flex row with a label block and a swatch row | **CONFIRMED** — `ProfilePage.jsx:796-836`. `sectionLabelStyle` is declared at `:468-471`, `activeThemeKey`/`activeThemeLabel` at `:472-473`, `THEME_OPTIONS` at `:37-43`. Task 6 adds a second row inside the same card, not a second card. |
| 17 | `index.html`'s pre-mount script | **CONFIRMED** — lines 37-42, a bare `script` tag immediately before `<div id="root">` reading `localStorage.getItem("pd_theme")`. `<meta name="theme-color" content="#020617" />` is line 34. |
| 18 | `npm test` covers `src/lib` only | **CONFIRMED** — `package.json` `"test": "node --test src/lib/*.test.js"`. `shareCardTokens.js` and `profileForm.js` are therefore the only two files in this whole plan that can carry automated coverage. |

---

## Deviations and discoveries

### Deviation 1 — Blizzard-light uses the bare `[data-mode="light"]` selector

The spec and the briefing both describe five `[data-theme="X"][data-mode="light"]` blocks. Blizzard's cannot be one of them: `data-theme` is absent from `<html>` for any signed-out visitor and for the first paint of any signed-in one (Verified #2). A `[data-theme="blizzard"][data-mode="light"]` block would simply not match, and a light-mode user would get the Blizzard **dark** palette from `:root` with `color-scheme: light` on top — white form controls on a black page.

**Decision: Blizzard-light is the bare `[data-mode="light"]` block**, which is the exact mirror of Blizzard-dark living in `:root` rather than in a `[data-theme]` block. It doubles as the light-mode baseline that the other four override, and it is the only place the light `--ink-*` / `--overlay-*` scales and the light values of the mode-variant invariant tokens are declared. The other four themes keep their two-attribute selectors and win on specificity (0,2,0 beats 0,1,0).

### Deviation 2 — the "theme-invariant" token families become mode-variant

The spec says the Track C/D/E tokens (ratings, trail difficulty, status, season-grid tiers) "stay theme-invariant across modes too". Taken literally that ships `--color-danger: #f87171` at **2.2:1** on a white page, at 64 call sites, most of which are error messages.

**Decision: they stay theme-invariant and become mode-variant.** Their *meaning* still must not depend on which of the 5 cosmetic themes is picked — so they are declared exactly twice: once in `:root` (today's values, unchanged) and once in `[data-mode="light"]` (one shared light set for all 5 palettes). They are never redefined inside a `[data-theme="X"][data-mode="light"]` block. That preserves the property the spec actually cares about while making the tokens legible. Every light value is contrast-checked in the table in Task 3.

### Deviation 3 — a third hardcoding pattern (dark literals) is in scope

Neither the spec nor the briefing counted the ~62 hardcoded *dark* colours (`rgba(4,8,15,0.85)`, `rgba(2,6,23,0.88)`, `rgba(10,14,30,0.98)`, `rgba(8,17,31,0.85)`, and friends) used for modal backdrops, sheet panels, and the avatar/badge ring borders that fake a cut-out against the page background. Without them, light mode has black modals, black notification panels, black chat sheets, and dark rings around every avatar badge. They are folded into the same 14 retrofit tasks as Rule 3, because the implementer is already inside those files.

### Deviation 4 — accepted dark-mode visual deltas

Four, all deliberate, all small, all on the Task 22 click-test list:

1. **Literal `white` becomes `var(--color-text-1)`** at roughly 230 text sites, which in dark mode is each theme's near-white tint (`#e0f2fe` Blizzard, `#F8FAFC` Alpine Dawn, `#E2E8F0` Storm Chaser, `#FAF5FF` Aurora Peak, `#FFF7ED` Base Lodge) rather than pure `#ffffff`. This makes the cosmetic themes read more consistently and is the same token the surrounding text already uses. If Kyle dislikes it, the one-line rollback is to define `--color-text-1: #ffffff` in `:root` — do not un-tokenise 230 call sites.
2. **`.top-nav` / `.mobile-top-bar` go from `rgba(4,8,15,0.92)` to `var(--color-nav-bg)` (alpha 0.95), and `.bottom-nav` from `0.97` to `0.95`.** More importantly, all four non-Blizzard themes stop rendering a Blizzard-blue nav bar (Verified #4) — that is a bug fix, not a regression.
3. **Scrim alphas normalise onto a 3-step scale.** Today's backdrops use 0.72 / 0.82 / 0.85 / 0.88 / 0.92 / 0.94 / 0.96 at random; Rule 3 maps them to `--scrim-soft` (0.72), `--scrim` (0.85) and `--scrim-strong` (0.94). Up to a 0.06 alpha shift at some backdrops.
4. **Near-solid dark panels normalise onto `var(--color-modal-bg)`.** `rgba(10,14,30,0.98)`, `rgba(8,12,26,0.98)`, `rgba(8,14,28,0.98)` and `rgba(20,24,34,0.96)` all become the theme's `--color-modal-bg` (`#0f172a` in Blizzard). Panels become fully opaque and pick up their theme's hue.

### Discovery — a pre-existing contrast failure this plan does NOT fix

`--gradient-primary` in the Blizzard dark theme is `linear-gradient(135deg, #0284c7, #0897d7)` and is used with white text. White on `#0284c7` is **4.10:1**, and on `#0897d7` lower still — below AA for body text today, in dark mode, before this branch. `--gradient-danger`'s `#ef4444` stop is **3.3:1** with white. Both are out of scope here (this plan does not change dark-mode values) but both are **fixed in light mode**, where the new stops are chosen so white clears 4.5:1 on every stop. Recorded so the next person does not think this branch introduced them.

---

## The exception list — literals that must NOT be tokenised

Exhaustive. Anything not on this list gets substituted by Rules 1-3.

**E1 — `src/lib/shareCardTokens.test.js:38`.** `assert.equal(rgba("#ffffff", 0), "rgba(255, 255, 255, 0)")` is a unit-test assertion about the `rgba()` helper's string output. It contains both a literal `#ffffff` and a literal `rgba(255, 255, 255, 0)` and is not a colour. Never touch it. Task 7 adds tests to this file and must leave line 38 exactly as it is.

**E2 — `SKILL_OPTIONS` hex values.** `ProfilePage.jsx:26-32` and the identical array in `ProfileSetup.jsx`. These hexes feed alpha-suffix template literals, which `var()` cannot do. The array's existing in-file comment already says "do not tokenize". This includes `ProfilePage.jsx:29`'s `color: "rgba(255,255,255,0.9)"` for the "Black" skill level, which is a *data* value in that array, not a style — **it stays exactly as it is.** It is the single deliberate `rgba(255,255,255,...)` survivor in `ProfilePage.jsx`, which is why Task 19's grep for that file expects **1**, not 0.

**E3 — photo overlays.** Dark gradients painted on top of a resort photograph so white text stays readable. These stay dark in both modes — the photo underneath is a photo, not a theme surface. Exactly these lines:

- `src/components/TripDetailModal.jsx:57-63` — the seven `THEME` entries' `overlay:` strings.
- `src/components/TripCard.jsx:238`
- `src/components/TodayScreen.jsx:131`, and the chips at `:137`, `:140`, `:142`, `:143`, `:257` that sit on top of that same photo header.
- `src/components/CreateTripModal.jsx:269`, `:314`
- `src/components/ui/HeroPhotoHeader.jsx:10`
- `src/components/ui/HeroBannerStrip.jsx:10`
- `src/components/ShareStatCard.jsx:181-183` — the canvas photo overlay in `renderCard`.

**E4 — `rgba(0,0,0,alpha)`.** 55 occurrences, all drop shadows and full-screen click-catcher scrims. Black shadows and black scrims are correct on a light background too. Out of scope; leave every one of them alone.

**E5 — the `--rating-*`, `--color-trail-*`, `--color-success/-warning/-danger`, `--color-dev-badge*`, `--season-grid-tier-*` and `--color-banner-badge-mint` declarations inside `:root`.** These keep their current dark values forever. Their light counterparts are new declarations inside `[data-mode="light"]` (Task 3, Deviation 2) — you add, you never edit.

---

## The substitution rules

These three rules are the entire retrofit. Each of Tasks 8-21 says "apply Rules 1-3" and states its own file list and verification greps; the rules themselves are written out once, here.

### Rule 1 — `rgba(255,255,255,alpha)` becomes `var(--overlay-XX)` or `var(--ink-XX)`

Look at the **CSS property the value lands in**, following ternaries out to whichever property they are assigned to:

- The property is `color`, `fill`, `stroke`, `WebkitTextFillColor` or `caretColor` → **`var(--ink-XX)`**.
- Anything else — `background`, `backgroundColor`, `backgroundImage`, `border`, `borderTop`, `borderBottom`, `borderLeft`, `borderRight`, `borderColor`, `outline`, `boxShadow`, a gradient colour stop, or a CSS custom-property definition → **`var(--overlay-XX)`**.

`XX` is the alpha with the leading `0.` dropped: `0.06` becomes `06`, `0.4` becomes `40`, `0.035` becomes `035`, `0.1` becomes `10`. Note that `0.4` → `--ink-40` and `0.04` → `--overlay-04` are different tokens; read the digits carefully. The single occurrence of `rgba(255,255,255,0)` (a fully transparent gradient stop) becomes the keyword `transparent`.

Every alpha that actually occurs in the codebase has a token. The complete allowed sets:

```
--overlay-02   --overlay-03   --overlay-035  --overlay-04   --overlay-05   --overlay-06
--overlay-065  --overlay-07   --overlay-08   --overlay-09   --overlay-10   --overlay-11
--overlay-12   --overlay-13   --overlay-14   --overlay-15   --overlay-16   --overlay-18
--overlay-20   --overlay-22   --overlay-25

--ink-20  --ink-25  --ink-28  --ink-30  --ink-32  --ink-35  --ink-38  --ink-40  --ink-42
--ink-45  --ink-48  --ink-50  --ink-52  --ink-55  --ink-58  --ink-60  --ink-62  --ink-65
--ink-68  --ink-70  --ink-72  --ink-74  --ink-75  --ink-78  --ink-80  --ink-82  --ink-85
--ink-88  --ink-90
```

If you meet an alpha with no token in those lists, you have mis-read the digits — re-check. Do **not** invent a token; do **not** round to a neighbouring one.

**Worked example — `src/components/ProfilePage.jsx:799-803` (the Appearance card shell):**

```jsx
// BEFORE
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, padding: "10px 14px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>

// AFTER
          <div style={{
            background: "var(--overlay-03)", border: "1px solid var(--overlay-08)",
            borderRadius: 16, padding: "10px 14px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>
```

**Worked example — a ternary whose branches land in different properties, `src/components/LeaderboardPage.jsx:404-407`:**

```jsx
// BEFORE
              flex: 1, padding: "8px 0", borderRadius: 9,
              background: boardMode === mode.key ? "rgba(255,255,255,0.12)" : "transparent",
              border: boardMode === mode.key ? "1px solid rgba(255,255,255,0.18)" : "1px solid transparent",
              color: boardMode === mode.key ? "white" : "rgba(255,255,255,0.4)",

// AFTER
              flex: 1, padding: "8px 0", borderRadius: 9,
              background: boardMode === mode.key ? "var(--overlay-12)" : "transparent",
              border: boardMode === mode.key ? "1px solid var(--overlay-18)" : "1px solid transparent",
              color: boardMode === mode.key ? "var(--color-text-1)" : "var(--ink-40)",
```

The same `0.12` / `0.18` numbers land on `--overlay-*` because they are `background` / `border`, while `0.4` lands on `--ink-40` because it is `color`. The `"white"` in the same block is Rule 2.

### Rule 2 — literal `white` / `#fff` / `#ffffff` becomes `var(--color-text-1)` or `var(--color-on-accent)`

Applies to `"white"`, `'white'`, `"#fff"`, `"#ffffff"`, `"#FFF"`, `"#FFFFFF"` and the canvas form `ctx.fillStyle = "white"`.

- The element's own background is a **theme accent fill** — `var(--gradient-cta)`, `var(--gradient-primary)`, `var(--gradient-elite)`, `var(--gradient-danger)`, `var(--gradient-pass-pill)`, `var(--color-accent)`, `var(--color-accent-deep)`, `var(--color-accent-strong)`, or a literal accent gradient — → **`var(--color-on-accent)`** (which is `#ffffff` in *both* modes, because every light palette's accent is a deep saturated shade that clears 4.5:1 against white).
- Otherwise — text on a glass surface, on the page background, on an `--overlay-*`, or with no background of its own — → **`var(--color-text-1)`**.
- The two `background: "white"` knobs (`LeaderboardPage.jsx:180`, `ActiveSessionBar.jsx:301`) are the sliding dot on a coloured toggle track → **`var(--color-on-accent)`**.

To decide, read the `background` / `backgroundColor` on the *same* style object; if there isn't one, walk up to the nearest ancestor element in the same JSX block that sets one.

**Worked example — `src/components/DirectMessageView.jsx:99`, where one ternary needs both targets.** The bubble is an accent gradient when the message is mine and a glass surface when it isn't, but the text colour is currently one flat `"white"` for both:

```jsx
// BEFORE
                <div style={{ background: isMe ? "var(--gradient-cta)" : "rgba(255,255,255,0.09)", color: "white", borderRadius: isMe ? "14px 14px 0 14px" : "0 14px 14px 14px", padding: msg.media_url && !msg.content ? "6px" : "9px 13px", fontSize: 14, lineHeight: 1.45, wordBreak: "break-word", overflow: "hidden" }}>

// AFTER
                <div style={{ background: isMe ? "var(--gradient-cta)" : "var(--overlay-09)", color: isMe ? "var(--color-on-accent)" : "var(--color-text-1)", borderRadius: isMe ? "14px 14px 0 14px" : "0 14px 14px 14px", padding: msg.media_url && !msg.content ? "6px" : "9px 13px", fontSize: 14, lineHeight: 1.45, wordBreak: "break-word", overflow: "hidden" }}>
```

`src/components/TripChatView.jsx:75` is the same construct and gets the same treatment.

**Worked example — plain white-on-accent, `src/components/SkiPlansPage.jsx:174`:**

```jsx
// BEFORE
            background: "var(--gradient-cta)", border: "none", color: "white",

// AFTER
            background: "var(--gradient-cta)", border: "none", color: "var(--color-on-accent)",
```

### Rule 3 — hardcoded dark literals become scrim, panel, nav or badge-ring tokens

Applies to `rgba(R,G,B,alpha)` where R,G,B is a near-black navy or brown such as `4,8,15` / `2,6,23` / `8,17,31` / `10,14,30` / `10,14,26` / `8,12,26` / `8,12,28` / `8,14,28` / `8,17,30` / `4,8,20` / `4,8,26` / `20,24,34` / `2,5,16` / `5,3,16` / `12,7,4` / `30,10,10` / `10,30,10`.

- **Full-screen backdrop** (`position: "fixed", inset: 0` on the same style object, usually with `backdropFilter`) → the scrim scale, by nearest alpha:
  - alpha <= 0.78 → **`var(--scrim-soft)`**
  - 0.78 < alpha <= 0.90 → **`var(--scrim)`**
  - alpha > 0.90 → **`var(--scrim-strong)`**
- **A panel, sheet, popover or card's own background** → **`var(--color-modal-bg)`** (drop the alpha; these were all 0.96 or higher and are effectively opaque already).
- **A fixed top or bottom bar's background** → **`var(--color-nav-bg)`**.
- **A ring or border drawn around an avatar or badge to fake a cut-out against the page** (`border: "2px solid rgba(8,17,31,0.85)"`, `border: "1.5px solid rgba(4,8,15,1)"`) → **`var(--color-badge-border)`**.
- **A page-level background stop** (`LandingPage.jsx:260`'s `rgba(4,8,26,1)` behind a radial glow) → **`var(--color-bg)`**.
- **A photo overlay, or a chip sitting on one** → leave alone; it is on the E3 exception list.

**Worked example — `src/components/CrewGroupChat.jsx:84` (backdrop) and `:94` (panel), which sit ten lines apart:**

```jsx
// BEFORE
        background: "rgba(2,6,23,0.82)",
        ...
          background: "rgba(10,14,30,0.98)", border: "1px solid rgba(255,255,255,0.1)",

// AFTER
        background: "var(--scrim)",
        ...
          background: "var(--color-modal-bg)", border: "1px solid var(--overlay-10)",
```

**Worked example — `src/App.jsx:340` (badge ring plus a Rule 2 substitution in the same line):**

```jsx
// BEFORE
                  <span style={{ position: "absolute", top: -3, right: -5, minWidth: 16, height: 16, borderRadius: 999, background: "var(--gradient-danger)", color: "white", fontSize: 9, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: "1.5px solid rgba(4,8,15,1)", lineHeight: 1 }}>

// AFTER
                  <span style={{ position: "absolute", top: -3, right: -5, minWidth: 16, height: 16, borderRadius: 999, background: "var(--gradient-danger)", color: "var(--color-on-accent)", fontSize: 9, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: "1.5px solid var(--color-badge-border)", lineHeight: 1 }}>
```

---

## File Structure

**Create**

- `migrations/048_theme_mode.sql` — one `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme_mode ...`. Run by hand by Kyle; nothing in the repo executes it.

**Modify — infrastructure (Tasks 1-7)**

- `src/lib/profileForm.js` — one new entry in `PROFILE_WRITE_FIELDS`.
- `src/lib/profileForm.test.js` — `theme_mode` added to the `LOADED` fixture plus two new tests.
- `src/lib/socialApi.js` — `theme_mode` added to `PROFILE_SELECT_COLUMNS` (line 23) and to `upsertMyProfile`'s payload (after line 464).
- `src/index.css` — the whole token architecture: two new alpha scales, six new shell tokens, a `[data-mode="light"]` block (Blizzard-light plus the light invariants plus the light alpha scales), four `[data-theme="X"][data-mode="light"]` blocks, and the internal retrofit of the file's own 12 white-alpha and 9 dark literals.
- `index.html` — `data-mode` added to the pre-mount script, and a `theme-color` meta swap in the same script.
- `src/App.jsx` — `data-mode` and `pd_theme_mode` mirrored alongside `data-theme` and `pd_theme` inside `loadHeaderUser`.
- `src/components/ProfilePage.jsx` — `MODE_OPTIONS`, `handleSelectMode`, and a second row inside the existing Appearance card.
- `src/lib/shareCardTokens.js` — five light theme objects, an `ink` field on all ten, an `inkAlpha(darkAlpha, mode)` export, and a second parameter on `getShareCardTheme`.
- `src/lib/shareCardTokens.test.js` — light-mode coverage added; every existing assertion left untouched.

**Modify — colour retrofit only (Tasks 8-21)**

70 `.jsx` files. No behaviour changes, no JSX structure changes, no new props: only colour literals become `var(--token)`. Grouped below by app area, which is this repo's own convention for splitting large work.

| Task | Area | Files | white-alpha | literal white | dark literal |
|---|---|---|---|---|---|
| 8 | Share card | `ShareStatCard.jsx` | 20 | 9 | 4 |
| 9 | App shell and notifications | `App.jsx`, `NotificationBell.jsx` | 30 | 21 | 11 |
| 10 | Auth and landing | `LandingPage.jsx`, `AuthForm.jsx`, `AuthPanel.jsx` | 33 | 19 | 3 |
| 11 | Today tab | `TodayScreen.jsx`, `ResortListRow.jsx`, `MountainPage.jsx`, `PowderMap.jsx`, `TodaysCrew.jsx`, `NudgeBanner.jsx`, `EventsWidget.jsx` | 69 | 14 | 6 |
| 12 | Shared `ui/` primitives | `ui/Card.jsx`, `ui/AccentCard.jsx`, `ui/Badge.jsx`, `ui/StatStrip.jsx`, `ui/ScoreRing.jsx`, `ui/EventCard.jsx`, `ui/HeroPhotoHeader.jsx`, `ui/HeroBannerStrip.jsx`, `ui/Avatar.jsx`, `ui/Button.jsx`, `ui/ResortPicker.jsx`, `ui/MediaMessageInput.jsx`, `ui/GifPicker.jsx` | 31 | 12 | 2 |
| 13 | Trip detail modal | `TripDetailModal.jsx` | 135 | 26 | 8 |
| 14 | Trip creation and cards | `CreateTripModal.jsx`, `TripCard.jsx`, `TripChatView.jsx`, `FriendsGoingBadge.jsx` | 76 | 17 | 8 |
| 15 | Plans tab and calendars | `SkiPlansPage.jsx`, `SkiPlansTab.jsx`, `PlanCalendar.jsx`, `PlanEditorModal.jsx`, `DateMatchmaker.jsx`, `FriendsCalendar.jsx`, `SeasonCalendar.jsx`, `calendar/DayPlanCard.jsx` | 54 | 20 | 0 |
| 16 | Crew group chat | `CrewGroupChat.jsx` | 58 | 19 | 7 |
| 17 | Crew boards | `LeaderboardPage.jsx`, `SkiBuddyBoard.jsx`, `PostSkiBuddyForm.jsx`, `MountainBoard.jsx`, `ActivityFeed.jsx`, `ModerationQueue.jsx` | 89 | 37 | 1 |
| 18 | Crew people and messaging | `FriendsPage.jsx`, `FriendTagPicker.jsx`, `UserProfileModal.jsx`, `MessagingCenter.jsx`, `DirectMessageView.jsx`, `SkiPingModal.jsx`, `NudgeDetailsModal.jsx` | 63 | 11 | 5 |
| 19 | Profile screens | `ProfilePage.jsx`, `ProfileStats.jsx`, `profile/ProfileSettingsList.jsx`, `profile/ProfileStatStrip.jsx`, `profile/SettingsSheet.jsx` | 69 | 24 | 0 |
| 20 | Onboarding and integrations | `ProfileSetup.jsx`, `OnboardingFlow.jsx`, `StravaConnect.jsx`, `StravaSyncReview.jsx`, `VerificationUpgradeModal.jsx` | 87 | 33 | 3 |
| 21 | Track and session | `TrackScreen.jsx`, `ActiveSessionBar.jsx`, `SkiCheckInForm.jsx`, `SessionRecapModal.jsx`, `SessionEditForm.jsx`, `SessionStatsForm.jsx`, `SkiDayDetailsForm.jsx` | 75 | 34 | 4 |

**Never modified by this plan:** `src/lib/shareCardTokens.test.js:38` (exception E1), any file under `server/`, `supabase/` or `public/`, and every `src/lib/*.js` module other than `profileForm.js`, `socialApi.js` and `shareCardTokens.js`.

---

## Appendix A — the contrast maths behind every number in this plan

All ratios below were computed with the WCAG 2.x formula: linearise each sRGB channel (`c/255`, then `c/12.92` when `c <= 0.04045`, else `((c+0.055)/1.055)^2.4`), take `L = 0.2126*R + 0.7152*G + 0.0722*B`, then `contrast = (Lmax + 0.05) / (Lmin + 0.05)`. Translucent colours were alpha-composited over their background first (`out = alpha*fg + (1-alpha)*bg`, per channel, rounded) and the composite measured against that same background. Targets: **4.5:1 for body text, 3:1 for large text and UI component boundaries.**

### A.1 — the five light backgrounds

Each light palette's `--color-bg` carries its theme's character rather than defaulting to plain white, exactly as each dark palette's background does:

| Theme | dark `--color-bg` | light `--color-bg` | character |
|---|---|---|---|
| Blizzard | `#04080f` | `#F2F7FC` | cool sky-white |
| Alpine Dawn | `#020510` | `#FDF8F0` | warm cream |
| Storm Chaser | `#080E18` | `#F0F6F6` | cold mineral grey-teal |
| Aurora Peak | `#050310` | `#F8F5FE` | pale lilac |
| Base Lodge | `#0C0704` | `#FDF6EF` | warm sand |

### A.2 — the `--ink-*` scale: dark alpha to light alpha

`rgba(255,255,255,alpha)` over a near-black page and `rgba(15,23,42,beta)` over a near-white page do **not** produce the same contrast at the same alpha — a mid-grey loses far more contrast against white than against black. Naively mirroring the alpha would have shipped `--ink-45` (the app's single most common muted-text value, 51 sites) at **2.9:1** in light mode where it is **4.47:1** in dark. Each light alpha below was solved for so the resulting contrast matches its dark counterpart.

Columns: dark alpha, its contrast on `#04080f`, the chosen light alpha, and the resulting contrast on each of the five light backgrounds (Blizzard / Alpine Dawn / Storm Chaser / Aurora Peak / Base Lodge). Every row lands within about 2% of its dark counterpart on all five.

| token | dark alpha | dark CR | light alpha | Bl | AD | SC | AP | BL |
|---|---|---|---|---|---|---|---|---|
| `--ink-20` | 0.2  | 1.73 | 0.25 | 1.72 | 1.71 | 1.72 | 1.71 | 1.72 |
| `--ink-25` | 0.25 | 2.12 | 0.32 | 2.05 | 2.04 | 2.03 | 2.04 | 2.04 |
| `--ink-28` | 0.28 | 2.36 | 0.37 | 2.33 | 2.33 | 2.33 | 2.32 | 2.34 |
| `--ink-30` | 0.3  | 2.56 | 0.40 | 2.53 | 2.53 | 2.51 | 2.52 | 2.52 |
| `--ink-32` | 0.32 | 2.77 | 0.43 | 2.73 | 2.75 | 2.74 | 2.72 | 2.74 |
| `--ink-35` | 0.35 | 3.09 | 0.47 | 3.06 | 3.09 | 3.07 | 3.06 | 3.08 |
| `--ink-38` | 0.38 | 3.48 | 0.52 | 3.54 | 3.58 | 3.55 | 3.54 | 3.57 |
| `--ink-40` | 0.4  | 3.75 | 0.54 | 3.79 | 3.83 | 3.75 | 3.79 | 3.78 |
| `--ink-42` | 0.42 | 4.03 | 0.57 | 4.17 | 4.18 | 4.13 | 4.18 | 4.17 |
| `--ink-45` | 0.45 | 4.47 | 0.60 | 4.56 | 4.62 | 4.57 | 4.57 | 4.61 |
| `--ink-48` | 0.48 | 4.98 | 0.63 | 5.04 | 5.11 | 5.01 | 5.07 | 5.05 |
| `--ink-50` | 0.5  | 5.35 | 0.65 | 5.44 | 5.44 | 5.37 | 5.38 | 5.43 |
| `--ink-52` | 0.52 | 5.67 | 0.67 | 5.77 | 5.84 | 5.73 | 5.79 | 5.77 |
| `--ink-55` | 0.55 | 6.27 | 0.70 | 6.42 | 6.45 | 6.35 | 6.37 | 6.44 |
| `--ink-58` | 0.58 | 6.87 | 0.72 | 6.83 | 6.94 | 6.86 | 6.89 | 6.93 |
| `--ink-60` | 0.6  | 7.31 | 0.74 | 7.38 | 7.41 | 7.30 | 7.33 | 7.40 |
| `--ink-62` | 0.62 | 7.77 | 0.76 | 7.89 | 7.99 | 7.79 | 7.92 | 7.90 |
| `--ink-65` | 0.65 | 8.51 | 0.78 | 8.50 | 8.54 | 8.39 | 8.46 | 8.54 |
| `--ink-68` | 0.68 | 9.24 | 0.81 | 9.36 | 9.52 | 9.35 | 9.44 | 9.51 |
| `--ink-70` | 0.7  | 9.78 | 0.82 | 9.77 | 9.82 | 9.65 | 9.74 | 9.81 |
| `--ink-72` | 0.72 | 10.33 | 0.84 | 10.42 | 10.59 | 10.29 | 10.39 | 10.45 |
| `--ink-74` | 0.74 | 10.90 | 0.85 | 10.74 | 10.92 | 10.72 | 10.82 | 10.89 |
| `--ink-75` | 0.75 | 11.14 | 0.86 | 11.20 | 11.28 | 11.05 | 11.15 | 11.26 |
| `--ink-78` | 0.78 | 12.10 | 0.88 | 11.91 | 12.10 | 11.77 | 11.88 | 11.94 |
| `--ink-80` | 0.8  | 12.73 | 0.90 | 12.74 | 12.97 | 12.61 | 12.74 | 12.80 |
| `--ink-82` | 0.82 | 13.38 | 0.92 | 13.48 | 13.73 | 13.32 | 13.45 | 13.56 |
| `--ink-85` | 0.85 | 14.33 | 0.94 | 14.33 | 14.50 | 14.15 | 14.33 | 14.44 |
| `--ink-88` | 0.88 | 15.35 | 0.96 | 15.09 | 15.35 | 14.88 | 15.09 | 15.15 |
| `--ink-90` | 0.9  | 16.08 | 0.98 | 15.89 | 16.08 | 15.68 | 15.89 | 15.99 |

**Known and accepted:** every row from `--ink-20` through `--ink-40` is below 4.5:1 in **both** modes. That is a pre-existing property of the dark themes — the app already renders `rgba(255,255,255,0.4)` captions at 3.75:1 — and this plan reproduces it rather than silently restyling 300 call sites. `--ink-45` and up clear AA in both modes. Raising the low end is a separate design decision for Kyle, listed as an open question at the end of this plan.

### A.3 — the `--overlay-*` scale: dark alpha to light alpha

Surfaces and borders have no text-contrast floor, so the goal here is *equal perceived weight*: the light overlay must lift or drop off its background by the same contrast ratio the dark one does. At and below 0.10 the same alpha is already within 2%, so it is kept identical. Above 0.10 the light alpha is raised, because dark ink loses weight faster against a bright background.

| token | dark alpha (over `#04080f`) | dark CR | light alpha (over `#F2F7FC`) | light CR |
|---|---|---|---|---|
| `--overlay-02`  | 0.02  | 1.031 | 0.02  | 1.038 |
| `--overlay-03`  | 0.03  | 1.047 | 0.03  | 1.063 |
| `--overlay-035` | 0.035 | 1.060 | 0.035 | 1.073 |
| `--overlay-04`  | 0.04  | 1.069 | 0.04  | 1.082 |
| `--overlay-05`  | 0.05  | 1.089 | 0.05  | 1.103 |
| `--overlay-06`  | 0.06  | 1.116 | 0.06  | 1.125 |
| `--overlay-065` | 0.065 | 1.127 | 0.065 | 1.143 |
| `--overlay-07`  | 0.07  | 1.141 | 0.07  | 1.154 |
| `--overlay-08`  | 0.08  | 1.173 | 0.08  | 1.175 |
| `--overlay-09`  | 0.09  | 1.203 | 0.09  | 1.198 |
| `--overlay-10`  | 0.10  | 1.241 | 0.10  | 1.223 |
| `--overlay-11`  | 0.11  | 1.274 | 0.12  | 1.279 |
| `--overlay-12`  | 0.12  | 1.320 | 0.14  | 1.332 |
| `--overlay-13`  | 0.13  | 1.358 | 0.15  | 1.368 |
| `--overlay-14`  | 0.14  | 1.410 | 0.16  | 1.396 |
| `--overlay-15`  | 0.15  | 1.454 | 0.18  | 1.456 |
| `--overlay-16`  | 0.16  | 1.511 | 0.20  | 1.528 |
| `--overlay-18`  | 0.18  | 1.608 | 0.22  | 1.596 |
| `--overlay-20`  | 0.20  | 1.733 | 0.26  | 1.760 |
| `--overlay-22`  | 0.22  | 1.871 | 0.28  | 1.850 |
| `--overlay-25`  | 0.25  | 2.117 | 0.34  | 2.140 |

### A.4 — the five light palettes' text and accent tokens

Every value is measured against its own theme's `--color-bg`. The chosen `--color-accent` for each theme is that theme's existing `--color-accent-deep` hue family darkened until it clears 4.5:1 — never the dark theme's `--color-accent`, which fails in every case (`#38bdf8` is 1.9:1 on `#F2F7FC`).

| token | Blizzard | Alpine Dawn | Storm Chaser | Aurora Peak | Base Lodge |
|---|---|---|---|---|---|
| `--color-text-1`        | `#0B1B2B` **16.16** | `#26190B` **16.20** | `#0B1F1D` **15.65** | `#1C1030` **16.71** | `#2B1509` **16.15** |
| `--color-text-2`        | `#075985` **7.02** | `#92400E` **6.71** | `#115E59` **6.94** | `#6B21A8` **8.09** | `#9A3412` **6.82** |
| `--color-text-3` (text-2 at alpha 0.72) | **3.76** | **3.64** | **3.66** | **4.32** | **3.79** |
| `--color-text-muted`    | `#94A3B8` 2.38 | `#A8A29E` 2.39 | `#94A3B8` 2.35 | `#A1A1AA` 2.38 | `#A8A29E` 2.35 |
| `--color-accent`        | `#0369A1` **5.51** | `#B45309` **4.75** | `#0F766E` **5.01** | `#7E22CE` **6.48** | `#C2410C` **4.83** |
| `--color-accent-2`      | `#4338CA` **7.33** | `#1D4ED8` **6.34** | `#1D4ED8` **6.13** | `#0F766E` **5.08** | `#B45309` **4.69** |
| `--color-accent-soft`   | `#0369A1` **5.51** | `#B45309` **4.75** | `#0F766E` **5.01** | `#7E22CE` **6.48** | `#C2410C` **4.83** |
| `--color-accent-strong` | `#075985` **7.02** | `#92400E` **6.71** | `#115E59` **6.94** | `#6B21A8` **8.09** | `#9A3412` **6.82** |
| `--color-accent-deep`   | `#0C4A6E` **8.78** | `#78350F` **8.58** | `#134E4A` **8.67** | `#581C87` **10.09** | `#7C2D12` **8.75** |
| `--color-accent-teal`   | `#0E7490` **4.97** | `#1D4ED8` **6.34** | `#1E40AF` **7.98** | `#0F766E` **5.08** | `#B45309` **4.69** |
| `--color-banner-highlight` | `#1D4ED8` **6.22** | `#1D4ED8` **6.34** | `#115E59` **6.94** | `#6B21A8` **8.09** | `#9A3412` **6.82** |

Three notes on that table:

1. **`--color-text-3` at 0.72 alpha is an improvement, not a regression.** The dark themes' `--color-text-3` scores 3.10 / 3.40 / 3.41 / 2.31 / 2.57 — the light values (3.64 to 4.32) are equal or better everywhere. It is a caption token; the applicable bar is 3:1 large text.
2. **`--color-text-muted` is deliberately below AA in both modes.** It scores 1.94 / 4.28 / 2.55 / 2.16 / 1.46 in the dark themes today and is used at exactly **two** call sites app-wide. It is a disabled/placeholder tint, not readable text. Parity is the right target.
3. **`--color-accent-soft` equals `--color-accent` in every light palette.** In dark mode "soft" means a lighter tint that still reads on black; in light mode the lightest shade that still reads on white *is* the accent. `--color-accent-soft` is used as a text colour at 46 call sites, so it cannot be the pale tint the name suggests. The soft/strong/deep ladder is still monotonic (5.51 / 7.02 / 8.78 in Blizzard); it just starts at the accent.

### A.5 — white on every light accent fill

`--color-on-accent` is `#ffffff` in both modes, which only works if every light-mode surface it lands on is dark enough. Every gradient stop and solid accent that carries white text in light mode:

| colour | used as | white-on-it |
|---|---|---|
| `#075985` | Blizzard `--gradient-primary` stop 1, `--color-accent-strong` | **7.56** |
| `#0369A1` | Blizzard `--gradient-primary` stop 2, `--gradient-elite` stop 2, `--color-accent` | **5.93** |
| `#0E7490` | Blizzard `--gradient-elite` stop 1, `--color-accent-teal` | **5.36** |
| `#0C4A6E` | Blizzard `--color-accent-deep`, so `--gradient-cta` stop 1 | **9.46** |
| `#92400E` | Alpine Dawn `--gradient-primary` stop 1, `--color-accent-strong` | **7.09** |
| `#B45309` | Alpine Dawn `--color-accent`, Base Lodge `--color-accent-teal` | **5.02** |
| `#78350F` | Alpine Dawn `--color-accent-deep` | **9.07** |
| `#1D4ED8` | Alpine Dawn `--color-accent-teal`, `--color-banner-highlight` | **6.70** |
| `#115E59` | Storm Chaser `--gradient-primary` stop 1, `--color-accent-strong` | **7.58** |
| `#0F766E` | Storm Chaser `--color-accent`, Aurora Peak `--color-accent-teal` | **5.47** |
| `#134E4A` | Storm Chaser `--color-accent-deep` | **9.48** |
| `#1E40AF` | Storm Chaser `--color-accent-teal` | **8.72** |
| `#7E22CE` | Aurora Peak `--color-accent` | **6.98** |
| `#6B21A8` | Aurora Peak `--color-accent-strong` | **8.72** |
| `#581C87` | Aurora Peak `--color-accent-deep` | **10.88** |
| `#9A3412` | Base Lodge `--gradient-primary` stop 1, `--color-accent-strong` | **7.31** |
| `#C2410C` | Base Lodge `--color-accent` | **5.18** |
| `#7C2D12` | Base Lodge `--color-accent-deep` | **9.37** |
| `#4338CA` | Blizzard `--color-accent-2` | **7.90** |
| `#dc2626` | light `--gradient-danger` stop 1 | **4.83** |
| `#991b1b` | light `--gradient-danger` stop 2, `--color-danger-strong` | **8.31** |
| `#15803d` | light `--gradient-pass-pill` stop 1, `--color-success` | **5.02** |
| `#166534` | light `--color-success-strong` | **7.13** |

Lowest value in the table is **4.83**. Every light accent fill clears AA for body text with white on it — which is exactly what the dark themes' `--gradient-primary` does not do (see Discovery, above).

### A.6 — the mode-variant invariant tokens

One shared light set for all 5 palettes (Deviation 2). Each is checked against the **lowest-luminance** of the five light backgrounds, `#F0F6F6` (Storm Chaser), so the number shown is the worst case; every other palette scores 0.02 to 0.20 higher. The dark column is measured on `#04080f`.

| token | dark value | dark CR | light value | worst-case light CR |
|---|---|---|---|---|
| `--color-success`            | `#4ade80` | 11.51 | `#15803D` | **4.59** |
| `--color-success-strong`     | `#22c55e` | 8.80  | `#166534` | **6.53** |
| `--color-warning`            | `#fbbf24` | 12.02 | `#B45309` | **4.60** |
| `--color-danger`             | `#f87171` | 7.25  | `#B91C1C` | **5.92** |
| `--color-danger-strong`      | `#dc2626` | 4.15  | `#991B1B` | **7.60** |
| `--color-trail-green`        | `#22c55e` | 8.80  | `#15803D` | **4.59** |
| `--color-trail-blue`         | `#60a5fa` | 7.89  | `#2563EB` | **4.73** |
| `--color-trail-black`        | `#e2e8f0` | 16.27 | `#1E293B` | **13.39** |
| `--color-trail-double-black` | `#f43f5e` | 5.46  | `#BE123C` | **5.75** |
| `--color-trail-expert`       | `#c084fc` | 7.59  | `#7E22CE` | **6.39** |
| `--color-dev-badge`          | `#a3e635` | 13.30 | `#4D7C0F` | **4.57** |
| `--color-dev-badge-strong`   | `#65a30d` | 6.49  | `#3F6212` | **6.48** |
| `--color-banner-badge-mint`  | `#6ee7b7` | 13.16 | `#0F766E` | **5.01** |
| `--rating-mint`              | `#8ef6d1` | 15.53 | `#0F766E` | **5.01** |
| `--rating-sky`               | `#9bc6ff` | 11.38 | `#1D4ED8` | **6.13** |
| `--rating-gold`              | `#ffe39a` | 15.96 | `#854D0E` | **6.27** |
| `--rating-peach`             | `#ffc996` | 13.42 | `#C2410C` | **4.74** |
| `--rating-coral`             | `#ff9d9d` | 10.09 | `#BE123C` | **5.75** |
| `--rating-slate`             | `#64748b` | 4.22  | `#475569` | **6.93** |

`--rating-gold` uses `#854D0E` (yellow-800) rather than the more literally "gold" `#A16207` (amber-700), because `#A16207` scores **4.51** on Storm Chaser's background — inside rounding distance of the AA line. `#854D0E` is 6.27 and still reads as the warm step between `--rating-sky` (blue) and `--rating-peach` (orange).

---

## Task 1: `profiles.theme_mode` column and write path

**Files:**
- Create: `migrations/048_theme_mode.sql`
- Modify: `src/lib/profileForm.js:25-40` (the `PROFILE_WRITE_FIELDS` array)
- Modify: `src/lib/socialApi.js:22-23` (`PROFILE_SELECT_COLUMNS`) and `src/lib/socialApi.js:446-466` (`upsertMyProfile`'s payload)
- Test: `src/lib/profileForm.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks; this is the first task.
- Produces: `PROFILE_WRITE_FIELDS` gains the string `"theme_mode"` as its 15th and last entry. `buildProfileUpdate(profile, changes)` keeps its exact `(object|null, object) => object` signature and now returns a `theme_mode` key on every call. `getMyProfile()` now returns rows carrying `theme_mode: "dark" | "light" | null`. Tasks 5, 6, 7 and 8 all read `profile.theme_mode`.

- [ ] **Step 1: Write the failing tests**

Open `src/lib/profileForm.test.js`. Add `theme_mode: "light",` to the `LOADED` fixture, on the line immediately after `theme: "storm-chaser",` (currently line 15), so the tail of the fixture reads:

```js
  powder_alerts_enabled: true, alert_phone: "555-0100",
  theme: "storm-chaser",
  theme_mode: "light",
  is_admin: false, strava_athlete_id: 12345,
}
```

Then append these two tests to the end of the file:

```js
test("buildProfileUpdate carries theme_mode through when another screen saves", () => {
  // theme_mode is written by exactly one control (the Appearance card's light/dark
  // toggle). Every other save on the Profile page must preserve it, or flipping to
  // light mode and then editing your name would silently put you back in dark.
  const out = buildProfileUpdate(LOADED, { first_name: "Kyle", last_name: "Rayburn" })
  assert.equal(out.theme_mode, "light")
  assert.equal(PROFILE_WRITE_FIELDS.includes("theme_mode"), true)
})

test("buildProfileUpdate lets the Appearance toggle set theme_mode without disturbing theme", () => {
  const out = buildProfileUpdate(LOADED, { theme_mode: "dark" })
  assert.equal(out.theme_mode, "dark")
  assert.equal(out.theme, "storm-chaser")
  assert.equal(out.username, "kray")
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`

Expected: both new tests FAIL with `AssertionError: undefined !== 'light'` and `undefined !== 'dark'` — `theme_mode` is not yet in `PROFILE_WRITE_FIELDS`, so `buildProfileUpdate` never copies it onto the payload. The existing `buildProfileUpdate returns exactly the writable field set` test still passes, because it compares `Object.keys(out)` against `PROFILE_WRITE_FIELDS` and both are still missing the field.

- [ ] **Step 3: Add `theme_mode` to the write whitelist**

In `src/lib/profileForm.js`, change the end of the `PROFILE_WRITE_FIELDS` array (currently lines 39-40) from:

```js
  "theme",
]
```

to:

```js
  "theme",
  "theme_mode",
]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`

Expected: `tests 296`, `pass 296`, `fail 0` (294 baseline plus the 2 new tests).

- [ ] **Step 5: Add `theme_mode` to the read path**

In `src/lib/socialApi.js`, change line 23 from:

```js
  "id, first_name, last_name, full_name, username, avatar_url, skill_level, sport_type, ski_passes, favorite_mountain, vehicle_label, vehicle_seats, powder_alerts_enabled, alert_phone, theme, is_admin, strava_athlete_id";
```

to:

```js
  "id, first_name, last_name, full_name, username, avatar_url, skill_level, sport_type, ski_passes, favorite_mountain, vehicle_label, vehicle_seats, powder_alerts_enabled, alert_phone, theme, theme_mode, is_admin, strava_athlete_id";
```

This one line is what makes `profile.theme_mode` reach `App.jsx`, `ProfilePage.jsx` and all three `ShareStatCard` call sites with no new prop threading anywhere.

- [ ] **Step 6: Add `theme_mode` to the write payload**

In `src/lib/socialApi.js`, inside `upsertMyProfile`'s `payload` object, change line 464 from:

```js
    theme: profile.theme || "blizzard",
```

to:

```js
    theme: profile.theme || "blizzard",
    theme_mode: profile.theme_mode === "light" ? "light" : "dark",
```

The `=== "light" ? ... : "dark"` form (rather than `|| "dark"`) is deliberate: it coerces `null`, `undefined`, `""` and any junk value to `"dark"`, which is the guaranteed-safe default and the only other value the column's CHECK constraint accepts.

- [ ] **Step 7: Write the migration**

Create `migrations/048_theme_mode.sql` with exactly this content:

```sql
-- Migration 048: Light/dark mode preference
-- Independent of the `theme` column added by 024 — `theme` picks one of the 5
-- cosmetic palettes, `theme_mode` picks light or dark within it. Defaults to
-- 'dark' for every existing row and every new signup, so nothing changes for
-- anyone until they flip the toggle in Profile > Appearance.
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme_mode TEXT NOT NULL DEFAULT 'dark'
  CHECK (theme_mode IN ('dark', 'light'));
```

- [ ] **Step 8: Verify no other profile write path bypasses the whitelist**

Run: `grep -rn "upsertMyProfile(" src`

Expected: every call site either passes `buildProfileUpdate(...)`, or lives in `ProfileSetup.jsx` / `OnboardingFlow.jsx`, the two known account-creation-time exceptions named in the Global Constraints. If a *third* file passes a bare object literal, do not fix it here — record it and raise it, it is a separate bug.

- [ ] **Step 9: Confirm the suite and lint**

Run: `npm test`
Expected: `tests 296`, `pass 296`, `fail 0`.

Run: `npx eslint src/lib/profileForm.js src/lib/profileForm.test.js src/lib/socialApi.js`
Expected: no new problems beyond whatever the 85-problem baseline already reports for `socialApi.js`.

- [ ] **Step 10: Commit**

```bash
git add migrations/048_theme_mode.sql src/lib/profileForm.js src/lib/profileForm.test.js src/lib/socialApi.js
git commit -m "feat: add profiles.theme_mode column and route it through the profile write whitelist"
```

- [ ] **Step 11: Record the manual migration step in the handoff**

Nothing in this repo runs SQL. Add to the handoff note for Kyle: *"Run `migrations/048_theme_mode.sql` in the Supabase SQL editor, then `NOTIFY pgrst, 'reload schema';`. Until you do, the toggle from Task 6 will throw on save because PostgREST does not know the column exists."*

---

## Task 2: the adaptive `--overlay-*` and `--ink-*` scales

This is the mechanism that makes a 1,092-occurrence retrofit possible without inventing a bespoke token per call site. Nothing consumes these tokens yet — Task 2 only defines them. Dark values are byte-identical to the literals they will replace, so this task is a pure addition with zero rendering change.

**Files:**
- Modify: `src/index.css` — insert the dark scales into `:root` (after the Track E block that ends at line 129, immediately before `--radius-card:` at line 131), and create a new `[data-mode="light"]` block after the `[data-theme="base-lodge"]` block that ends at line 248, immediately before the `html {` rule at line 250.

**Interfaces:**
- Consumes: nothing.
- Produces: 21 `--overlay-*` and 29 `--ink-*` custom properties, spelled exactly as listed in Rule 1. Tasks 3, 4 and 8-21 all reference them. **The names are case-sensitive and the suffix is the DARK alpha times 100** — `--overlay-035` and `--overlay-065` keep three digits; every other suffix is two.

- [ ] **Step 1: Add the dark scales to `:root`**

In `src/index.css`, insert this block after line 129 (`--season-grid-tier-4: var(--rating-mint);` and its closing of the Track E comment block) and before line 131 (`--radius-card:         18px;`):

```css
  /* ── Track F: adaptive overlay + ink scales (light/dark mode) ────────
     Two mode-scoped alpha ramps that replace the ~1,090 hardcoded
     rgba(255,255,255,a) literals this app used for glass surfaces and
     muted text. They are mode-scoped, NOT theme-scoped: a 6%-white card
     lift reads the same in every cosmetic theme, and always did.

     --overlay-XX  surfaces, borders, shadows, gradient stops. Never text.
     --ink-XX      color / fill / stroke. Never a surface.

     XX is the DARK alpha times 100. Dark values below are byte-identical
     to the literals they replace, so dark mode does not shift by one bit.
     The light values are NOT the same alpha: dark ink loses contrast far
     faster against a bright background than light ink does against a dark
     one, so every --ink light alpha is solved for equal contrast (see the
     plan's Appendix A.2) and the --overlay steps above 0.10 are raised for
     equal perceived weight (A.3). Do not "simplify" them back to a mirror. */
  --overlay-02:  rgba(255, 255, 255, 0.02);
  --overlay-03:  rgba(255, 255, 255, 0.03);
  --overlay-035: rgba(255, 255, 255, 0.035);
  --overlay-04:  rgba(255, 255, 255, 0.04);
  --overlay-05:  rgba(255, 255, 255, 0.05);
  --overlay-06:  rgba(255, 255, 255, 0.06);
  --overlay-065: rgba(255, 255, 255, 0.065);
  --overlay-07:  rgba(255, 255, 255, 0.07);
  --overlay-08:  rgba(255, 255, 255, 0.08);
  --overlay-09:  rgba(255, 255, 255, 0.09);
  --overlay-10:  rgba(255, 255, 255, 0.1);
  --overlay-11:  rgba(255, 255, 255, 0.11);
  --overlay-12:  rgba(255, 255, 255, 0.12);
  --overlay-13:  rgba(255, 255, 255, 0.13);
  --overlay-14:  rgba(255, 255, 255, 0.14);
  --overlay-15:  rgba(255, 255, 255, 0.15);
  --overlay-16:  rgba(255, 255, 255, 0.16);
  --overlay-18:  rgba(255, 255, 255, 0.18);
  --overlay-20:  rgba(255, 255, 255, 0.2);
  --overlay-22:  rgba(255, 255, 255, 0.22);
  --overlay-25:  rgba(255, 255, 255, 0.25);
```

Immediately after that, still inside `:root`, add the ink ramp:

```css
  --ink-20: rgba(255, 255, 255, 0.2);
  --ink-25: rgba(255, 255, 255, 0.25);
  --ink-28: rgba(255, 255, 255, 0.28);
  --ink-30: rgba(255, 255, 255, 0.3);
  --ink-32: rgba(255, 255, 255, 0.32);
  --ink-35: rgba(255, 255, 255, 0.35);
  --ink-38: rgba(255, 255, 255, 0.38);
  --ink-40: rgba(255, 255, 255, 0.4);
  --ink-42: rgba(255, 255, 255, 0.42);
  --ink-45: rgba(255, 255, 255, 0.45);
  --ink-48: rgba(255, 255, 255, 0.48);
  --ink-50: rgba(255, 255, 255, 0.5);
  --ink-52: rgba(255, 255, 255, 0.52);
  --ink-55: rgba(255, 255, 255, 0.55);
  --ink-58: rgba(255, 255, 255, 0.58);
  --ink-60: rgba(255, 255, 255, 0.6);
  --ink-62: rgba(255, 255, 255, 0.62);
  --ink-65: rgba(255, 255, 255, 0.65);
  --ink-68: rgba(255, 255, 255, 0.68);
  --ink-70: rgba(255, 255, 255, 0.7);
  --ink-72: rgba(255, 255, 255, 0.72);
  --ink-74: rgba(255, 255, 255, 0.74);
  --ink-75: rgba(255, 255, 255, 0.75);
  --ink-78: rgba(255, 255, 255, 0.78);
  --ink-80: rgba(255, 255, 255, 0.8);
  --ink-82: rgba(255, 255, 255, 0.82);
  --ink-85: rgba(255, 255, 255, 0.85);
  --ink-88: rgba(255, 255, 255, 0.88);
  --ink-90: rgba(255, 255, 255, 0.9);
```

- [ ] **Step 2: Create the `[data-mode="light"]` block with the light scales**

In `src/index.css`, insert a new rule **after** the closing brace of `[data-theme="base-lodge"]` (currently line 248) and **before** `html {` (currently line 250). Source order matters: `[data-mode="light"]` and `:root` have identical specificity (0,1,0), so the light block only wins because it comes later in the file. Do not move it above the dark theme blocks.

```css
/* ══════════════════════════════════════════════════════════════════
   LIGHT MODE. Selected by data-mode="light" on <html>, set by the
   pre-mount script in index.html and by loadHeaderUser() in App.jsx.

   This bare [data-mode="light"] block is Blizzard-light AND the light
   baseline every other light theme overrides — the exact mirror of
   :root being Blizzard-dark AND the dark baseline. It is deliberately
   NOT [data-theme="blizzard"][data-mode="light"]: <html> often carries
   no data-theme at all (signed-out visitors, and the first paint of a
   signed-in one), and a two-attribute selector would not match them.
   ══════════════════════════════════════════════════════════════════ */
[data-mode="light"] {
  color-scheme: light;
  color: var(--color-text-1);
  background-color: var(--color-bg);

  /* Track F light ramp — see the plan's Appendix A.2 / A.3 for the
     contrast solve behind every alpha here. #0F172A is slate-900, the
     one neutral ink shared by all five light palettes. */
  --overlay-02:  rgba(15, 23, 42, 0.02);
  --overlay-03:  rgba(15, 23, 42, 0.03);
  --overlay-035: rgba(15, 23, 42, 0.035);
  --overlay-04:  rgba(15, 23, 42, 0.04);
  --overlay-05:  rgba(15, 23, 42, 0.05);
  --overlay-06:  rgba(15, 23, 42, 0.06);
  --overlay-065: rgba(15, 23, 42, 0.065);
  --overlay-07:  rgba(15, 23, 42, 0.07);
  --overlay-08:  rgba(15, 23, 42, 0.08);
  --overlay-09:  rgba(15, 23, 42, 0.09);
  --overlay-10:  rgba(15, 23, 42, 0.1);
  --overlay-11:  rgba(15, 23, 42, 0.12);
  --overlay-12:  rgba(15, 23, 42, 0.14);
  --overlay-13:  rgba(15, 23, 42, 0.15);
  --overlay-14:  rgba(15, 23, 42, 0.16);
  --overlay-15:  rgba(15, 23, 42, 0.18);
  --overlay-16:  rgba(15, 23, 42, 0.2);
  --overlay-18:  rgba(15, 23, 42, 0.22);
  --overlay-20:  rgba(15, 23, 42, 0.26);
  --overlay-22:  rgba(15, 23, 42, 0.28);
  --overlay-25:  rgba(15, 23, 42, 0.34);
}
```

- [ ] **Step 3: Add the light ink ramp to that same block**

Still inside `[data-mode="light"]`, immediately after `--overlay-25`, add:

```css
  --ink-20: rgba(15, 23, 42, 0.25);
  --ink-25: rgba(15, 23, 42, 0.32);
  --ink-28: rgba(15, 23, 42, 0.37);
  --ink-30: rgba(15, 23, 42, 0.4);
  --ink-32: rgba(15, 23, 42, 0.43);
  --ink-35: rgba(15, 23, 42, 0.47);
  --ink-38: rgba(15, 23, 42, 0.52);
  --ink-40: rgba(15, 23, 42, 0.54);
  --ink-42: rgba(15, 23, 42, 0.57);
  --ink-45: rgba(15, 23, 42, 0.6);
  --ink-48: rgba(15, 23, 42, 0.63);
  --ink-50: rgba(15, 23, 42, 0.65);
  --ink-52: rgba(15, 23, 42, 0.67);
  --ink-55: rgba(15, 23, 42, 0.7);
  --ink-58: rgba(15, 23, 42, 0.72);
  --ink-60: rgba(15, 23, 42, 0.74);
  --ink-62: rgba(15, 23, 42, 0.76);
  --ink-65: rgba(15, 23, 42, 0.78);
  --ink-68: rgba(15, 23, 42, 0.81);
  --ink-70: rgba(15, 23, 42, 0.82);
  --ink-72: rgba(15, 23, 42, 0.84);
  --ink-74: rgba(15, 23, 42, 0.85);
  --ink-75: rgba(15, 23, 42, 0.86);
  --ink-78: rgba(15, 23, 42, 0.88);
  --ink-80: rgba(15, 23, 42, 0.9);
  --ink-82: rgba(15, 23, 42, 0.92);
  --ink-85: rgba(15, 23, 42, 0.94);
  --ink-88: rgba(15, 23, 42, 0.96);
  --ink-90: rgba(15, 23, 42, 0.98);
```

- [ ] **Step 4: Verify both ramps are complete and correctly spelled**

Run: `grep -c -- "--overlay-" src/index.css`
Expected: **42** (21 dark declarations plus 21 light declarations).

Run: `grep -c -- "--ink-" src/index.css`
Expected: **58** (29 dark plus 29 light).

Run: `grep -n -- "--ink-45\|--overlay-06" src/index.css`
Expected: exactly four lines — `--overlay-06: rgba(255, 255, 255, 0.06);` and `--ink-45: rgba(255, 255, 255, 0.45);` inside `:root`, and `--overlay-06: rgba(15, 23, 42, 0.06);` and `--ink-45: rgba(15, 23, 42, 0.6);` inside `[data-mode="light"]`. If the light `--ink-45` reads `0.45`, you mirrored the alpha instead of using the solved value — go back to Appendix A.2.

- [ ] **Step 5: Verify the build still compiles the stylesheet**

Run: `npm run build`
Expected: build succeeds. (Vite parses CSS; a missing brace in the new block fails here.)

- [ ] **Step 6: Verify dark mode is untouched**

Run: `git diff --stat src/index.css`
Expected: `src/index.css` shows insertions only, **0 deletions**. This task adds lines; it never edits one. If the deletion count is non-zero you have modified an existing declaration.

- [ ] **Step 7: Commit**

```bash
git add src/index.css
git commit -m "feat: add mode-adaptive --overlay-* and --ink-* token scales"
```

---

## Task 3: the five light palettes

**Files:**
- Modify: `src/index.css` — extend the `[data-mode="light"]` block created in Task 2 (Blizzard-light plus the light values of the mode-variant invariant tokens), then add four new `[data-theme="X"][data-mode="light"]` blocks after it.

**Interfaces:**
- Consumes: the `[data-mode="light"]` block created by Task 2 Step 2.
- Produces: light values for all 32 per-theme tokens in all 5 palettes, and light values for the 19 mode-variant invariant tokens. Task 7 (`shareCardTokens.js`) reuses the exact hex strings for `--color-bg`, `--color-bg-elevated`, `--color-bg-deep`, `--color-accent`, `--color-accent-deep` and `--color-accent-teal` from each palette below — if you change a hex here you must change it there, and the file's own header comment says so.

Every hex in this task is contrast-verified in Appendix A.4 (per-theme) and A.6 (invariants). Do not substitute "nicer" values without redoing the maths.

- [ ] **Step 1: Add the Blizzard-light palette**

In `src/index.css`, inside the `[data-mode="light"]` block, immediately after the `--ink-90` line added in Task 2 Step 3, add:

```css

  /* ── Blizzard Light — cool sky-white. Accent is sky-700, not the dark
     theme's sky-400 (#38bdf8 scores 1.9:1 on this background). ──────── */
  --color-bg:            #F2F7FC;
  --color-bg-elevated:   #FFFFFF;
  --color-surface:       rgba(15, 23, 42, 0.04);
  --color-surface-hover: rgba(15, 23, 42, 0.07);
  --color-border:        rgba(3, 105, 161, 0.22);
  --color-border-subtle: rgba(3, 105, 161, 0.12);

  --color-accent:        #0369A1;
  --color-accent-dim:    rgba(3, 105, 161, 0.12);
  --color-accent-glow:   rgba(3, 105, 161, 0.22);
  --color-accent-2:      #4338CA;

  --color-text-1:        #0B1B2B;
  --color-text-2:        #075985;
  --color-text-3:        rgba(7, 89, 133, 0.72);
  --color-text-muted:    #94A3B8;

  --color-nav-bg:        rgba(242, 247, 252, 0.95);
  --color-badge-border:  rgba(242, 247, 252, 1);

  --gradient-primary:    linear-gradient(135deg, #075985, #0369a1);
  --gradient-elite:      linear-gradient(135deg, #0e7490, #0369a1);
  --gradient-bg:         radial-gradient(ellipse 80% 35% at 50% 0%, rgba(3,105,161,0.08) 0%, transparent 100%),
                         linear-gradient(180deg, #F2F7FC 0%, #FFFFFF 100%);

  --shadow-card:         0 4px 24px rgba(15, 23, 42, 0.1);
  --shadow-accent:       0 0 20px rgba(3, 105, 161, 0.18);
  --shadow-button:       0 6px 20px rgba(3, 105, 161, 0.22);

  --color-accent-soft:   #0369A1;
  --color-accent-strong: #075985;
  --color-accent-deep:   #0C4A6E;
  --color-accent-teal:   #0E7490;

  --color-modal-bg:        #FFFFFF;
  --color-bg-deep:         #E3EDF7;
  --color-surface-popover: #FFFFFF;

  --color-banner-heading:   #0B1B2B;
  --color-banner-highlight: #1D4ED8;

  --gradient-cta: linear-gradient(135deg, var(--color-accent-deep), var(--color-accent-teal));
```

`--color-accent-soft` intentionally equals `--color-accent`: it is used as a text colour at 46 call sites, so the light-mode "soft" step has to be the lightest shade that still clears 4.5:1, which is the accent itself (Appendix A.4, note 3).

- [ ] **Step 2: Add the light values of the mode-variant invariant tokens**

Still inside `[data-mode="light"]`, immediately after the `--gradient-cta` line you just added, add:

```css

  /* ── Track C/D/E tokens, light values. Still THEME-invariant (one set
     for all five light palettes, never redefined per data-theme) but
     necessarily MODE-variant: #f87171 danger text scores 2.2:1 on a
     near-white page and is used as a text colour at 64 call sites.
     Worst-case ratios are measured on #F0F6F6, the darkest of the five
     light backgrounds — see the plan's Appendix A.6. ─────────────────── */
  --color-success:        #15803D;
  --color-success-strong: #166534;
  --color-warning:        #B45309;
  --color-danger:         #B91C1C;
  --color-danger-strong:  #991B1B;
  --gradient-danger:      linear-gradient(135deg, #dc2626, #991b1b);
  --color-success-bg:     rgba(21, 128, 61, 0.12);
  --color-danger-bg:      rgba(185, 28, 28, 0.12);
  --color-warning-bg:     rgba(180, 83, 9, 0.12);

  --color-trail-green:        #15803D;
  --color-trail-blue:         #2563EB;
  --color-trail-black:        #1E293B;
  --color-trail-double-black: #BE123C;
  --color-trail-expert:       #7E22CE;

  --color-dev-badge:        #4D7C0F;
  --color-dev-badge-strong: #3F6212;

  --color-banner-badge-mint:   #0F766E;
  --gradient-banner-offseason: linear-gradient(135deg, #E3EDF7 0%, #C7DDF2 50%, #DCE9F7 100%);
  --gradient-pass-pill:        linear-gradient(135deg, #15803d, #0f766e);
  --color-pass-pill-text:      #FFFFFF;

  --rating-mint:         #0F766E;
  --rating-mint-border:  rgba(15, 118, 110, 0.28);
  --rating-sky:          #1D4ED8;
  --rating-sky-border:   rgba(29, 78, 216, 0.28);
  --rating-gold:         #854D0E;
  --rating-gold-border:  rgba(133, 77, 14, 0.28);
  --rating-peach:        #C2410C;
  --rating-peach-border: rgba(194, 65, 12, 0.28);
  --rating-coral:        #BE123C;
  --rating-coral-border: rgba(190, 18, 60, 0.28);
  --rating-slate:        #475569;
  --rating-slate-border: rgba(71, 85, 105, 0.28);

  --season-grid-tier-0: var(--overlay-06);
  --season-grid-tier-1: rgba(29, 78, 216, 0.22);
  --season-grid-tier-2: rgba(29, 78, 216, 0.5);
```

`--season-grid-tier-3` and `--season-grid-tier-4` are already `var(--rating-sky)` and `var(--rating-mint)` in `:root`; because `var()` resolves against the element's own computed custom properties, they pick up the light rating values above automatically. Do not redeclare them.

`--color-pass-pill-text` flips from `#052e2b` to `#FFFFFF` because the light `--gradient-pass-pill` is a *dark* green-teal (white on `#15803d` is 5.02:1) where the dark one is a bright mint that needed near-black text.

- [ ] **Step 3: Add the Alpine Dawn light palette**

In `src/index.css`, after the closing brace of `[data-mode="light"]` and before `html {`, add:

```css
/* Alpine Dawn Light — warm cream paper, deep amber accent, cobalt secondary.
   The one light theme whose neutrals are warm, mirroring how its dark
   counterpart keeps a cool navy bg under a warm accent (inverted here:
   warm paper reads as "dawn light" where cool paper would read as snow). */
[data-theme="alpine-dawn"][data-mode="light"] {
  --color-bg: #FDF8F0; --color-bg-elevated: #FFFFFF;
  --color-surface: rgba(15,23,42,0.04); --color-surface-hover: rgba(15,23,42,0.07);
  --color-border: rgba(180,83,9,0.22); --color-border-subtle: rgba(180,83,9,0.12);
  --color-accent: #B45309; --color-accent-dim: rgba(180,83,9,0.14); --color-accent-glow: rgba(180,83,9,0.24); --color-accent-2: #1D4ED8;
  --color-text-1: #26190B; --color-text-2: #92400E; --color-text-3: rgba(146,64,14,0.72); --color-text-muted: #A8A29E;
  --color-nav-bg: rgba(253,248,240,0.95); --color-badge-border: rgba(253,248,240,1);
  --gradient-primary: linear-gradient(135deg, #92400e, #b45309);
  --gradient-elite: linear-gradient(135deg, #b45309, #92400e);
  --gradient-bg: radial-gradient(ellipse 80% 35% at 50% 0%, rgba(180,83,9,0.08) 0%, transparent 100%), linear-gradient(180deg, #FDF8F0 0%, #FFFFFF 100%);
  --shadow-card: 0 4px 24px rgba(41,26,10,0.1); --shadow-accent: 0 0 20px rgba(180,83,9,0.18); --shadow-button: 0 6px 20px rgba(180,83,9,0.22);
  --color-accent-soft: #B45309; --color-accent-strong: #92400E; --color-accent-deep: #78350F; --color-accent-teal: #1D4ED8;
  --color-modal-bg: #FFFFFF; --color-bg-deep: #F6EBDA; --color-surface-popover: #FFFFFF;
  --color-banner-heading: #26190B; --color-banner-highlight: #1D4ED8;
  --gradient-cta: linear-gradient(135deg, var(--color-accent-deep), var(--color-accent-teal));
}
```

- [ ] **Step 4: Add the Storm Chaser light palette**

Immediately after the Alpine Dawn light block:

```css
/* Storm Chaser Light — cold mineral grey-teal paper, deep teal accent,
   cobalt secondary. Same hue family as its dark counterpart, two steps
   darker so it reads on white instead of on blue-black. */
[data-theme="storm-chaser"][data-mode="light"] {
  --color-bg: #F0F6F6; --color-bg-elevated: #FFFFFF;
  --color-surface: rgba(15,23,42,0.04); --color-surface-hover: rgba(15,23,42,0.07);
  --color-border: rgba(15,118,110,0.22); --color-border-subtle: rgba(15,118,110,0.12);
  --color-accent: #0F766E; --color-accent-dim: rgba(15,118,110,0.13); --color-accent-glow: rgba(15,118,110,0.24); --color-accent-2: #1D4ED8;
  --color-text-1: #0B1F1D; --color-text-2: #115E59; --color-text-3: rgba(17,94,89,0.72); --color-text-muted: #94A3B8;
  --color-nav-bg: rgba(240,246,246,0.95); --color-badge-border: rgba(240,246,246,1);
  --gradient-primary: linear-gradient(135deg, #115e59, #0f766e);
  --gradient-elite: linear-gradient(135deg, #0f766e, #115e59);
  --gradient-bg: radial-gradient(ellipse 80% 35% at 50% 0%, rgba(15,118,110,0.08) 0%, transparent 100%), linear-gradient(180deg, #F0F6F6 0%, #FFFFFF 100%);
  --shadow-card: 0 4px 24px rgba(11,31,29,0.1); --shadow-accent: 0 0 20px rgba(15,118,110,0.18); --shadow-button: 0 6px 20px rgba(15,118,110,0.22);
  --color-accent-soft: #0F766E; --color-accent-strong: #115E59; --color-accent-deep: #134E4A; --color-accent-teal: #1E40AF;
  --color-modal-bg: #FFFFFF; --color-bg-deep: #DFEDEC; --color-surface-popover: #FFFFFF;
  --color-banner-heading: #0B1F1D; --color-banner-highlight: #115E59;
  --gradient-cta: linear-gradient(135deg, var(--color-accent-deep), var(--color-accent-teal));
}
```

- [ ] **Step 5: Add the Aurora Peak light palette**

Immediately after the Storm Chaser light block:

```css
/* Aurora Peak Light — pale lilac paper, deep violet accent, emerald
   secondary. Keeps the dark theme's violet/green pairing, both darkened. */
[data-theme="aurora-peak"][data-mode="light"] {
  --color-bg: #F8F5FE; --color-bg-elevated: #FFFFFF;
  --color-surface: rgba(15,23,42,0.04); --color-surface-hover: rgba(15,23,42,0.07);
  --color-border: rgba(126,34,206,0.22); --color-border-subtle: rgba(126,34,206,0.12);
  --color-accent: #7E22CE; --color-accent-dim: rgba(126,34,206,0.13); --color-accent-glow: rgba(126,34,206,0.24); --color-accent-2: #0F766E;
  --color-text-1: #1C1030; --color-text-2: #6B21A8; --color-text-3: rgba(107,33,168,0.72); --color-text-muted: #A1A1AA;
  --color-nav-bg: rgba(248,245,254,0.95); --color-badge-border: rgba(248,245,254,1);
  --gradient-primary: linear-gradient(135deg, #7e22ce, #0f766e);
  --gradient-elite: linear-gradient(135deg, #115e59, #7e22ce);
  --gradient-bg: radial-gradient(ellipse 80% 35% at 50% 0%, rgba(126,34,206,0.08) 0%, transparent 100%), linear-gradient(180deg, #F8F5FE 0%, #FFFFFF 100%);
  --shadow-card: 0 4px 24px rgba(28,16,48,0.1); --shadow-accent: 0 0 20px rgba(126,34,206,0.18); --shadow-button: 0 6px 20px rgba(126,34,206,0.22);
  --color-accent-soft: #7E22CE; --color-accent-strong: #6B21A8; --color-accent-deep: #581C87; --color-accent-teal: #0F766E;
  --color-modal-bg: #FFFFFF; --color-bg-deep: #EDE6FB; --color-surface-popover: #FFFFFF;
  --color-banner-heading: #1C1030; --color-banner-highlight: #6B21A8;
  --gradient-cta: linear-gradient(135deg, var(--color-accent-deep), var(--color-accent-teal));
}
```

- [ ] **Step 6: Add the Base Lodge light palette**

Immediately after the Aurora Peak light block:

```css
/* Base Lodge Light — warm sand paper, burnt-ember accent, amber secondary.
   The warmest of the five, mirroring the one dark theme whose bg is warm. */
[data-theme="base-lodge"][data-mode="light"] {
  --color-bg: #FDF6EF; --color-bg-elevated: #FFFFFF;
  --color-surface: rgba(15,23,42,0.04); --color-surface-hover: rgba(15,23,42,0.07);
  --color-border: rgba(194,65,12,0.22); --color-border-subtle: rgba(194,65,12,0.12);
  --color-accent: #C2410C; --color-accent-dim: rgba(194,65,12,0.13); --color-accent-glow: rgba(194,65,12,0.24); --color-accent-2: #B45309;
  --color-text-1: #2B1509; --color-text-2: #9A3412; --color-text-3: rgba(154,52,18,0.72); --color-text-muted: #A8A29E;
  --color-nav-bg: rgba(253,246,239,0.95); --color-badge-border: rgba(253,246,239,1);
  --gradient-primary: linear-gradient(135deg, #9a3412, #c2410c);
  --gradient-elite: linear-gradient(135deg, #b45309, #c2410c);
  --gradient-bg: radial-gradient(ellipse 80% 35% at 50% 0%, rgba(194,65,12,0.08) 0%, transparent 100%), linear-gradient(180deg, #FDF6EF 0%, #FFFFFF 100%);
  --shadow-card: 0 4px 24px rgba(43,21,9,0.1); --shadow-accent: 0 0 20px rgba(194,65,12,0.18); --shadow-button: 0 6px 20px rgba(194,65,12,0.22);
  --color-accent-soft: #C2410C; --color-accent-strong: #9A3412; --color-accent-deep: #7C2D12; --color-accent-teal: #B45309;
  --color-modal-bg: #FFFFFF; --color-bg-deep: #F5E7D8; --color-surface-popover: #FFFFFF;
  --color-banner-heading: #2B1509; --color-banner-highlight: #9A3412;
  --gradient-cta: linear-gradient(135deg, var(--color-accent-deep), var(--color-accent-teal));
}
```

- [ ] **Step 7: Verify the five light blocks exist and are in the right order**

Run: `grep -n "data-mode" src/index.css`

Expected: exactly five matches, in this order: `[data-mode="light"] {`, then `[data-theme="alpine-dawn"][data-mode="light"] {`, `[data-theme="storm-chaser"][data-mode="light"] {`, `[data-theme="aurora-peak"][data-mode="light"] {`, `[data-theme="base-lodge"][data-mode="light"] {`. All five must come **after** the last `[data-theme="base-lodge"] {` dark block and **before** the `html {` rule.

Run: `grep -c -- "--color-accent-deep" src/index.css`
Expected: **10** (5 dark declarations, 5 light).

Run: `grep -c "color-scheme" src/index.css`
Expected: **2** — `color-scheme: dark;` in `:root` and `color-scheme: light;` in `[data-mode="light"]`.

- [ ] **Step 8: Verify no light value leaked into a dark block**

Run: `grep -n "F2F7FC\|FDF8F0\|F0F6F6\|F8F5FE\|FDF6EF" src/index.css`

Expected: each of the five light background hexes appears exactly **three** times — once as `--color-bg`, once inside its own `--gradient-bg`, and once inside its own `--color-nav-bg` as the decimal rgb triple... except that last one is written in decimal, so in practice expect **two** hex matches per background. If any of them appears inside `:root` or inside a dark `[data-theme]` block, you inserted in the wrong place.

- [ ] **Step 9: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 10: Verify dark mode is still untouched**

Run: `git diff --stat src/index.css`
Expected: insertions only, **0 deletions**, across Tasks 2 and 3 combined.

- [ ] **Step 11: Commit**

```bash
git add src/index.css
git commit -m "feat: add five hand-tuned light palettes and mode-variant status tokens"
```

---

## Task 4: shell tokens, and the retrofit of `src/index.css` itself

`index.css` hardcodes colours in its own rule bodies as well as in its token blocks. Three of them (`.top-nav`, `.mobile-top-bar`, `.bottom-nav`) bypass `--color-nav-bg` entirely, so **today, in dark mode, all four non-Blizzard themes already render a Blizzard-blue-black nav bar**. This task fixes that and adds the eight shell tokens Rules 2 and 3 depend on.

**Files:**
- Modify: `src/index.css` — `:root` (lines 4-165), the `[data-mode="light"]` block, and the rule bodies at lines 275, 293, 296, 307, 323-324, 343, 346, 376, 379, 489, 492, 568, 581, 590, 605, 614-615.

**Interfaces:**
- Consumes: `--overlay-*` (Task 2), the five light palettes (Task 3).
- Produces: `--color-on-accent`, `--color-button-reset-bg`, `--color-snowflake`, `--shadow-card-hover`, `--color-scrollbar-thumb`, `--color-scrollbar-thumb-hover`, `--scrim-soft`, `--scrim`, `--scrim-strong`. Rule 2 uses `--color-on-accent` in every retrofit task; Rule 3 uses the three scrim tokens.

- [ ] **Step 1: Add the shell tokens to `:root`**

In `src/index.css`, inside `:root`, immediately after the `--ink-90` line added in Task 2 Step 1, add:

```css

  /* ── Track G: shell tokens introduced by light mode ──────────────────
     --color-on-accent is #ffffff in BOTH modes: every light palette's
     accent is a deep saturated shade that clears 4.5:1 against white
     (plan Appendix A.5, lowest value 4.83). It exists so that "white text
     on a coloured button" and "white text on a dark page" stop being the
     same literal, because only the second one has to flip in light mode. */
  --color-on-accent:      #ffffff;
  --color-button-reset-bg: #1a1a1a;
  --color-snowflake:      rgba(186, 230, 253, 0.55);
  --shadow-card-hover:    0 20px 60px rgba(0, 0, 0, 0.45);
  --color-scrollbar-thumb:       rgba(56, 189, 248, 0.18);
  --color-scrollbar-thumb-hover: rgba(56, 189, 248, 0.32);

  /* Modal/sheet backdrops. Dark in both modes — a scrim's job is to push
     the page back, and a pale scrim does not do that — but lighter in
     light mode so the dimmed page still reads as a page. */
  --scrim-soft:   rgba(4, 8, 15, 0.72);
  --scrim:        rgba(4, 8, 15, 0.85);
  --scrim-strong: rgba(4, 8, 15, 0.94);
```

- [ ] **Step 2: Add their light counterparts**

In `src/index.css`, inside the `[data-mode="light"]` block, immediately after the `--season-grid-tier-2` line added in Task 3 Step 2, add:

```css

  /* Track G, light. --color-on-accent is deliberately absent: it is
     #ffffff in both modes and inherits from :root. */
  --color-button-reset-bg: #E9EEF4;
  --color-snowflake:      rgba(7, 89, 133, 0.3);
  --shadow-card-hover:    0 20px 60px rgba(15, 23, 42, 0.16);
  --color-scrollbar-thumb:       rgba(15, 23, 42, 0.22);
  --color-scrollbar-thumb-hover: rgba(15, 23, 42, 0.35);
  --scrim-soft:   rgba(15, 23, 42, 0.35);
  --scrim:        rgba(15, 23, 42, 0.45);
  --scrim-strong: rgba(15, 23, 42, 0.58);
```

- [ ] **Step 3: Tokenise the six `--color-surface` declarations**

Five theme blocks declare the same two white-alpha literals. Replace all ten values:

- `src/index.css:28-29` (inside `:root`) becomes:

```css
  --color-surface:       var(--overlay-035);
  --color-surface-hover: var(--overlay-06);
```

- `src/index.css:179` (inside `[data-theme="alpine-dawn"]`), `:197` (`storm-chaser`), `:215` (`aurora-peak`) and `:235` (`base-lodge"`) each become:

```css
  --color-surface: var(--overlay-035); --color-surface-hover: var(--overlay-06);
```

Leave the five **light** blocks' `--color-surface: rgba(15,23,42,0.04)` / `--color-surface-hover: rgba(15,23,42,0.07)` exactly as Task 3 wrote them. They are deliberately a hair stronger than `--overlay-035` / `--overlay-06` would give, because a 3.5% dark tint on cream paper is effectively invisible where a 3.5% white tint on near-black is not.

- [ ] **Step 4: Tokenise `--season-grid-tier-0`**

`src/index.css:125` becomes:

```css
  --season-grid-tier-0: var(--overlay-06);
```

- [ ] **Step 5: Tokenise the snowflake, links, button reset and scrollbar**

- `src/index.css:275` — `.snowflake`'s `background: rgba(186, 230, 253, 0.55);` becomes `background: var(--color-snowflake);`
- `src/index.css:293` — `a`'s `color: #38bdf8;` becomes `color: var(--color-accent);`
- `src/index.css:296` — `a:hover`'s `color: #7dd3fc;` becomes `color: var(--color-text-2);`
- `src/index.css:307` — `button`'s `background-color: #1a1a1a;` becomes `background-color: var(--color-button-reset-bg);`
- `src/index.css:323` — `::-webkit-scrollbar-thumb`'s `background: rgba(56,189,248,0.18);` becomes `background: var(--color-scrollbar-thumb);`
- `src/index.css:324` — `::-webkit-scrollbar-thumb:hover`'s `background: rgba(56,189,248,0.32);` becomes `background: var(--color-scrollbar-thumb-hover);`

The link colours are byte-identical for Blizzard (`--color-accent` is `#38bdf8`, `--color-text-2` is `#7dd3fc`). For the other four dark themes they stop being Blizzard-blue, which is the same latent bug as the nav bar.

- [ ] **Step 6: Wire the three nav bars to their tokens**

- `src/index.css:343` — `.top-nav`'s `background: rgba(4, 8, 15, 0.92);` becomes `background: var(--color-nav-bg);`
- `src/index.css:346` — `.top-nav`'s `border-bottom: 1px solid rgba(56, 189, 248, 0.1);` becomes `border-bottom: 1px solid var(--color-border);`
- `src/index.css:376` — `.mobile-top-bar`'s `background: rgba(4, 8, 15, 0.92);` becomes `background: var(--color-nav-bg);`
- `src/index.css:379` — `.mobile-top-bar`'s `border-bottom: 1px solid rgba(56, 189, 248, 0.1);` becomes `border-bottom: 1px solid var(--color-border);`
- `src/index.css:489` — `.bottom-nav`'s `background: rgba(4, 8, 15, 0.97);` becomes `background: var(--color-nav-bg);`
- `src/index.css:492` — `.bottom-nav`'s `border-top: 1px solid rgba(56, 189, 248, 0.1);` becomes `border-top: 1px solid var(--color-border);`

This is Deviation 4 item 2: the nav alpha normalises from 0.92 / 0.97 to `--color-nav-bg`'s 0.95, and the four non-Blizzard dark themes stop rendering a Blizzard nav bar.

- [ ] **Step 7: Tokenise the remaining rule bodies**

- `src/index.css:568` — `.resort-card:hover`'s `box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);` becomes `box-shadow: var(--shadow-card-hover);`
- `src/index.css:581` — `.sheet-handle`'s `background: rgba(255, 255, 255, 0.22);` becomes `background: var(--overlay-22);`
- `src/index.css:590` — `.notif-item:hover`'s `background: rgba(255, 255, 255, 0.04) !important;` becomes `background: var(--overlay-04) !important;`
- `src/index.css:605` — `.texture-snow-noise`'s `radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)` becomes `radial-gradient(var(--overlay-04) 1px, transparent 1px)`
- `src/index.css:614` and `:615` — `.texture-mountain-silhouette`'s two `rgba(255,255,255,0.03)` gradient stops both become `var(--overlay-03)`

- [ ] **Step 8: Point `:root`'s base `color` and `background-color` at the tokens**

`src/index.css:11-12` currently hardcodes Blizzard's values:

```css
  color: #e0f2fe;
  background-color: #04080f;
```

becomes:

```css
  color: var(--color-text-1);
  background-color: var(--color-bg);
```

Custom properties declared later in the same block are still visible to `var()` earlier in it, so this resolves correctly. It is byte-identical for Blizzard and corrects the other four dark themes, whose root text colour has always been Blizzard's `#e0f2fe`.

- [ ] **Step 9: Verify `index.css` has no white-alpha literals left**

Run: `grep -c "rgba(255, *255, *255" src/index.css`
Expected: **0**.

- [ ] **Step 10: Verify only the intended dark literals remain**

Run: `grep -n "rgba(4, *8, *15\|rgba(2,5,16\|rgba(8,14,24\|rgba(5,3,16\|rgba(12,7,4" src/index.css`

Expected: exactly **10** lines, all of them `--color-nav-bg` / `--color-badge-border` / `--scrim*` **token definitions** (lines 43-44 in `:root`, the equivalents inside the four dark theme blocks, and the three `--scrim*` lines from Step 1). **Zero** of them may be inside a `.top-nav`, `.mobile-top-bar` or `.bottom-nav` rule body — that is what Step 6 fixed.

- [ ] **Step 11: Verify no raw hex survives outside a token declaration**

Run: `grep -n "#38bdf8\|#7dd3fc\|#1a1a1a\|#e0f2fe" src/index.css`

Expected: exactly **3** lines, all inside `:root`'s token block — `--color-accent: #38bdf8;`, `--color-text-2: #7dd3fc;`, `--color-text-1: #e0f2fe;` — plus `--color-button-reset-bg: #1a1a1a;` from Step 1, so **4** lines total. No match may be inside an `a`, `a:hover`, `button` or `:root { color: ... }` declaration.

- [ ] **Step 12: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 13: Commit**

```bash
git add src/index.css
git commit -m "refactor: tokenise index.css's own colour literals and wire the nav bars to --color-nav-bg"
```

- [ ] **Step 14: Note for the click-test list**

Add to the running click-test list for Task 22: *"Dark mode, each of Alpine Dawn / Storm Chaser / Aurora Peak / Base Lodge: the top nav, mobile top bar and bottom nav should now match the theme's own background instead of Blizzard's blue-black. Links should match the theme accent. This is a fix, but it is a visible change to dark mode."*

---

## Task 5: mode bootstrap in `index.html` and `App.jsx`

Mirrors, for `data-mode` / `pd_theme_mode`, everything the app already does for `data-theme` / `pd_theme`: a pre-mount inline script that sets the attribute before React paints (so there is no flash of the wrong mode), and a write-back inside `loadHeaderUser()` once the profile is known.

**Files:**
- Modify: `index.html:34` (the `theme-color` meta) and `index.html:37-42` (the pre-mount script)
- Modify: `src/App.jsx:749-750` (inside `loadHeaderUser`)

**Interfaces:**
- Consumes: `profile.theme_mode` from Task 1 Step 5.
- Produces: `<html data-mode="light">` when and only when the user has chosen light; the attribute is **absent** otherwise. `localStorage.pd_theme_mode` holds `"light"` or `"dark"`. Task 6's `handleSelectMode` writes both.

- [ ] **Step 1: Extend the pre-mount script**

In `index.html`, replace the script block at lines 37-42:

```html
    <script>
      try {
        var t = localStorage.getItem("pd_theme")
        if (t) document.documentElement.setAttribute("data-theme", t)
      } catch (e) {}
    </script>
```

with:

```html
    <script>
      try {
        var t = localStorage.getItem("pd_theme")
        if (t) document.documentElement.setAttribute("data-theme", t)
        var m = localStorage.getItem("pd_theme_mode")
        if (m === "light") {
          document.documentElement.setAttribute("data-mode", "light")
          var mt = document.querySelector('meta[name="theme-color"]')
          if (mt) mt.setAttribute("content", "#F2F7FC")
        }
      } catch (e) {}
    </script>
```

Only `"light"` sets the attribute. `"dark"`, `null`, `""` and any junk leave `<html>` with no `data-mode` at all, which is the dark baseline — that is what makes dark the zero-risk default for every existing user.

`#F2F7FC` is Blizzard-light's `--color-bg` (Task 3 Step 1). The meta tag drives the iOS PWA status-bar tint and cannot read a CSS variable, so it is hardcoded here, deliberately, to the light **baseline** background. A light-mode Base Lodge user gets a very slightly cool status bar; that is acceptable and is not worth threading the cosmetic theme into a pre-mount script.

- [ ] **Step 2: Mirror the attribute write in `loadHeaderUser`**

In `src/App.jsx`, replace lines 749-750:

```jsx
      document.documentElement.setAttribute("data-theme", profile?.theme || "blizzard")
      try { localStorage.setItem("pd_theme", profile?.theme || "blizzard") } catch {}
```

with:

```jsx
      document.documentElement.setAttribute("data-theme", profile?.theme || "blizzard")
      try { localStorage.setItem("pd_theme", profile?.theme || "blizzard") } catch {}

      const mode = profile?.theme_mode === "light" ? "light" : "dark"
      if (mode === "light") document.documentElement.setAttribute("data-mode", "light")
      else document.documentElement.removeAttribute("data-mode")
      const metaTheme = document.querySelector('meta[name="theme-color"]')
      if (metaTheme) metaTheme.setAttribute("content", mode === "light" ? "#F2F7FC" : "#020617")
      try { localStorage.setItem("pd_theme_mode", mode) } catch {}
```

`removeAttribute` rather than `setAttribute("data-mode", "dark")` is deliberate and load-bearing: there is no `[data-mode="dark"]` block in `index.css`, so the absence of the attribute *is* dark mode. Setting it to `"dark"` would work too, but leaving the DOM clean means a stale `data-mode="light"` from a previous session on a shared device is actively cleared when a dark-mode user signs in.

`#020617` is the value already in `index.html:34` — do not change it, it is the existing dark status-bar tint.

- [ ] **Step 3: Verify the wiring**

Run: `grep -n "data-mode\|pd_theme_mode" index.html src/App.jsx`

Expected: **3** matches in `index.html` (the `getItem`, the `setAttribute`, and nothing else) and **4** matches in `src/App.jsx` (the `setAttribute`, the `removeAttribute`, the `setItem`, and the `theme_mode` read).

Run: `grep -rn "prefers-color-scheme" src index.html`
Expected: **0 matches**, per the Global Constraints.

- [ ] **Step 4: Verify the build and lint**

Run: `npm run build`
Expected: build succeeds.

Run: `npx eslint src/App.jsx`
Expected: no new problems beyond the baseline for this file.

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`, open the app, and in the browser console run `localStorage.setItem("pd_theme_mode","light")` then reload. `<html>` should carry `data-mode="light"` on first paint (check the Elements panel before anything renders — there must be no dark flash). Then run `localStorage.removeItem("pd_theme_mode")` and reload: the attribute must be gone. Most of the app will still look wrong at this point — the retrofit has not happened yet — but the page background, nav bars and links should be light.

- [ ] **Step 6: Commit**

```bash
git add index.html src/App.jsx
git commit -m "feat: bootstrap data-mode from localStorage before mount and from the profile after load"
```

---

## Task 6: the light/dark toggle in the Appearance card

**Files:**
- Modify: `src/components/ProfilePage.jsx` — add `MODE_OPTIONS` after `THEME_OPTIONS` (line 43), add `handleSelectMode` after `handleSelectTheme` (line 436), add `activeMode` next to `activeThemeKey` (line 472), and add a second row inside the existing Appearance card (lines 796-836).

**Interfaces:**
- Consumes: `buildProfileUpdate` (already imported in this file), `upsertMyProfile` (already imported), `profile.theme_mode` (Task 1 Step 5), the `data-mode` attribute contract and the `pd_theme_mode` key (Task 5).
- Produces: nothing other tasks consume. This is the only control in the app that writes `theme_mode`.

- [ ] **Step 1: Add `MODE_OPTIONS`**

In `src/components/ProfilePage.jsx`, immediately after the `THEME_OPTIONS` array (which ends at line 43), add:

```jsx
const MODE_OPTIONS = [
  { key: "dark",  label: "Dark",  icon: "🌙" },
  { key: "light", label: "Light", icon: "☀️" },
]
```

- [ ] **Step 2: Add `handleSelectMode`**

Immediately after `handleSelectTheme` (which ends at line 436), add:

```jsx
  // Same optimistic shape as handleSelectTheme above: paint first, persist
  // second, roll the attribute back if the write fails. The DOM attribute is
  // REMOVED rather than set to "dark", because index.css has no
  // [data-mode="dark"] block — absence of the attribute is dark mode.
  async function handleSelectMode(modeKey) {
    if (modeKey === "light") document.documentElement.setAttribute("data-mode", "light")
    else document.documentElement.removeAttribute("data-mode")
    const metaTheme = document.querySelector('meta[name="theme-color"]')
    if (metaTheme) metaTheme.setAttribute("content", modeKey === "light" ? "#F2F7FC" : "#020617")
    try {
      localStorage.setItem("pd_theme_mode", modeKey)
    } catch {
      // private browsing / storage disabled — the mode still applies for this
      // session and is persisted server-side just below.
    }
    try {
      await upsertMyProfile(buildProfileUpdate(profile, { theme_mode: modeKey }))
      await load()
    } catch (err) {
      const previous = profile?.theme_mode === "light" ? "light" : "dark"
      if (previous === "light") document.documentElement.setAttribute("data-mode", "light")
      else document.documentElement.removeAttribute("data-mode")
      if (metaTheme) metaTheme.setAttribute("content", previous === "light" ? "#F2F7FC" : "#020617")
      alert(err.message || "Could not save appearance mode.")
    }
  }
```

- [ ] **Step 3: Add `activeMode`**

Immediately after `activeThemeLabel` (line 473), add:

```jsx
  const activeMode = profile?.theme_mode === "light" ? "light" : "dark"
```

- [ ] **Step 4: Add the second row to the Appearance card**

The Appearance card today is one `<div>` containing a single label-plus-swatches flex row (`ProfilePage.jsx:799-834`). Turn it into two stacked rows separated by a hairline. Replace the whole card element — the `<div>` opened at line 799 through its closing `</div>` at line 834 — with:

```jsx
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, padding: "4px 14px",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              padding: "10px 0",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>Theme</div>
                <div style={{ fontSize: 11, color: "var(--color-accent-soft)", opacity: 0.7, marginTop: 2 }}>
                  {activeThemeLabel}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {THEME_OPTIONS.map((t) => {
                  const active = activeThemeKey === t.key
                  return (
                    <button
                      key={t.key}
                      onClick={() => handleSelectTheme(t.key)}
                      title={t.label}
                      aria-label={t.label}
                      aria-pressed={active}
                      style={{
                        width: 40, height: 44, padding: 0, background: "none", border: "none",
                        cursor: "pointer", display: "grid", placeItems: "center",
                      }}
                    >
                      <span style={{
                        width: 22, height: 22, borderRadius: "50%", display: "block",
                        background: t.swatch,
                        border: active ? "2px solid var(--color-text-1)" : "2px solid transparent",
                      }} />
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              padding: "10px 0",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>Appearance</div>
                <div style={{ fontSize: 11, color: "var(--color-accent-soft)", opacity: 0.7, marginTop: 2 }}>
                  {activeMode === "light" ? "Light" : "Dark"}
                </div>
              </div>
              <div style={{
                display: "flex", gap: 2, flexShrink: 0, padding: 2, borderRadius: 999,
                background: "rgba(255,255,255,0.06)",
              }}>
                {MODE_OPTIONS.map((m) => {
                  const active = activeMode === m.key
                  return (
                    <button
                      key={m.key}
                      onClick={() => handleSelectMode(m.key)}
                      title={m.label}
                      aria-label={`${m.label} mode`}
                      aria-pressed={active}
                      style={{
                        minHeight: 36, padding: "0 14px", borderRadius: 999, border: "none",
                        cursor: "pointer", fontSize: 12, fontWeight: 800,
                        background: active ? "var(--color-accent)" : "transparent",
                        color: active ? "var(--color-bg)" : "rgba(255,255,255,0.5)",
                        display: "flex", alignItems: "center", gap: 5,
                      }}
                    >
                      <span aria-hidden="true">{m.icon}</span>{m.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
```

The card's own colour literals are still raw here on purpose: this file is retrofitted onto tokens in Task 19, all at once, and splitting one file's substitution across two tasks makes Task 19's verification grep meaningless.

- [ ] **Step 5: Verify the control exists exactly once and is owner-only**

Run: `grep -n "MODE_OPTIONS\|handleSelectMode\|activeMode" src/components/ProfilePage.jsx`

Expected: **7** matches — the `MODE_OPTIONS` declaration, the `handleSelectMode` declaration, the `activeMode` declaration, one `activeMode ===` in the sub-label, one `activeMode === m.key` in the map, one `MODE_OPTIONS.map`, one `handleSelectMode(m.key)`.

The whole Appearance card is already inside the `{isOwnProfile && (` guard that opens at `ProfilePage.jsx:796`. Confirm the new row is inside that guard: viewing a friend's profile must never offer to change *your* mode. Run `sed -n '790,800p' src/components/ProfilePage.jsx` and check `{isOwnProfile && (` still opens before the card.

- [ ] **Step 6: Verify build and lint**

Run: `npm run build`
Expected: build succeeds.

Run: `npx eslint src/components/ProfilePage.jsx`
Expected: no new problems beyond the baseline for this file.

- [ ] **Step 7: Manual smoke check**

Run `npm run dev`, sign in, go to Profile, and click Light. The page should turn light immediately. Reload — it must still be light (that is the `pd_theme_mode` pre-mount path from Task 5). Click Dark, reload — back to dark. Most components will still look wrong in light mode; that is expected until Tasks 8-21 land.

If saving throws "Could not save appearance mode", migration 048 has not been run in Supabase yet (Task 1 Step 11).

- [ ] **Step 8: Commit**

```bash
git add src/components/ProfilePage.jsx
git commit -m "feat: add a light/dark toggle to the Profile Appearance card"
```

---

## Task 7: light theme objects and the alpha helpers in `shareCardTokens.js`

`ShareStatCard.jsx` draws to a `<canvas>`, whose 2D context only accepts literal colour strings — it cannot read a CSS custom property. `src/lib/shareCardTokens.js` is the hand-maintained JS mirror of the CSS tokens for exactly that reason, and its header comment already warns to keep the two in sync. This task adds the light half of the mirror, including a JS twin of the `--ink-*` / `--overlay-*` alpha solves so the canvas and the stylesheet cannot drift.

**Files:**
- Modify: `src/lib/shareCardTokens.js` (44 lines today)
- Test: `src/lib/shareCardTokens.test.js` (39 lines today — **line 38 is exception E1, do not touch it**)

**Interfaces:**
- Consumes: the exact hex values from Task 3's five light palettes.
- Produces:
  - `getShareCardTheme(themeKey, mode = "dark")` — the default argument keeps every existing caller working unchanged.
  - Every theme object gains one field, `ink`: `"#ffffff"` in dark, `"#0f172a"` in light.
  - `inkAlpha(darkAlpha, mode = "dark")` — number in, number out; the JS twin of the `--ink-*` scale.
  - `overlayAlpha(darkAlpha, mode = "dark")` — number in, number out; the JS twin of the `--overlay-*` scale.
  - `rgba(hex, alpha)` is unchanged.
  Task 8 consumes all four.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/shareCardTokens.test.js` (leave lines 1-39 exactly as they are):

```js
test("light mode returns a different, still-complete token set", () => {
  const darkBlizzard  = getShareCardTheme("blizzard", "dark")
  const lightBlizzard = getShareCardTheme("blizzard", "light")
  assert.equal(darkBlizzard.bg, "#04080f")
  assert.equal(lightBlizzard.bg, "#f2f7fc")
  assert.equal(lightBlizzard.accent, "#0369a1")
  assert.notEqual(lightBlizzard.accent, darkBlizzard.accent)
})

test("all 5 light themes are present with the full token shape", () => {
  const keys = ["blizzard", "alpine-dawn", "storm-chaser", "aurora-peak", "base-lodge"]
  for (const key of keys) {
    const theme = getShareCardTheme(key, "light")
    for (const field of ["bgDeep", "bgElevated", "bg", "accent", "accentDeep", "accentTeal", "ink"]) {
      assert.equal(typeof theme[field], "string", `light ${key}.${field} should be a string`)
      assert.match(theme[field], /^#[0-9a-f]{6}$/i, `light ${key}.${field} should be a hex color`)
    }
  }
})

test("ink is white in dark mode and slate-900 in light mode, in every theme", () => {
  const keys = ["blizzard", "alpine-dawn", "storm-chaser", "aurora-peak", "base-lodge"]
  for (const key of keys) {
    assert.equal(getShareCardTheme(key, "dark").ink, "#ffffff")
    assert.equal(getShareCardTheme(key, "light").ink, "#0f172a")
  }
})

test("an unknown or missing mode falls back to dark", () => {
  const blizzardDark = getShareCardTheme("blizzard", "dark")
  assert.deepEqual(getShareCardTheme("blizzard"), blizzardDark)
  assert.deepEqual(getShareCardTheme("blizzard", null), blizzardDark)
  assert.deepEqual(getShareCardTheme("blizzard", "sepia"), blizzardDark)
})

test("an unknown theme key falls back to blizzard within the requested mode", () => {
  assert.deepEqual(getShareCardTheme("not-a-real-theme", "light"), getShareCardTheme("blizzard", "light"))
})

test("inkAlpha is the identity in dark mode and the solved value in light mode", () => {
  assert.equal(inkAlpha(0.45, "dark"), 0.45)
  assert.equal(inkAlpha(0.45), 0.45)
  assert.equal(inkAlpha(0.45, "light"), 0.6)
  assert.equal(inkAlpha(0.2, "light"), 0.25)
  assert.equal(inkAlpha(0.9, "light"), 0.98)
})

test("overlayAlpha keeps low steps identical and raises the ones above 0.10", () => {
  assert.equal(overlayAlpha(0.06, "dark"), 0.06)
  assert.equal(overlayAlpha(0.06, "light"), 0.06)
  assert.equal(overlayAlpha(0.18, "light"), 0.22)
  assert.equal(overlayAlpha(0.25, "light"), 0.34)
})

test("both alpha helpers pass through an unmapped value unchanged", () => {
  assert.equal(inkAlpha(0.33, "light"), 0.33)
  assert.equal(overlayAlpha(0.99, "light"), 0.99)
})
```

Also change the import on line 3 of that file from:

```js
import { getShareCardTheme, rgba } from "./shareCardTokens.js"
```

to:

```js
import { getShareCardTheme, rgba, inkAlpha, overlayAlpha } from "./shareCardTokens.js"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`

Expected: FAIL. The first failure is `SyntaxError: The requested module './shareCardTokens.js' does not provide an export named 'inkAlpha'`, which aborts the whole file. That is the correct red state.

- [ ] **Step 3: Add `ink` to the five dark theme objects**

In `src/lib/shareCardTokens.js`, extend each entry of the existing `THEMES` object (lines 11-32) with `ink: "#ffffff",`. The block becomes:

```js
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
```

- [ ] **Step 4: Add the five light theme objects**

Immediately after the `THEMES` object, add:

```js
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
```

- [ ] **Step 5: Add the alpha-solve tables**

Immediately after `THEMES_LIGHT`, add:

```js
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
```

- [ ] **Step 6: Replace `getShareCardTheme` and add the two helpers**

Replace the existing `getShareCardTheme` (lines 34-36) with:

```js
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
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: `tests 304`, `pass 304`, `fail 0` (296 after Task 1, plus the 8 new tests here).

- [ ] **Step 8: Verify the CSS and the JS mirror agree**

Run: `grep -n "f2f7fc\|fdf8f0\|f0f6f6\|f8f5fe\|fdf6ef" src/lib/shareCardTokens.js`
Expected: **5** lines, one per light theme's `bg`.

Run: `grep -in "F2F7FC\|FDF8F0\|F0F6F6\|F8F5FE\|FDF6EF" src/index.css`
Expected: the same five background hexes appear in `index.css`. If a hex is in one file and not the other, the mirror has drifted — fix it now, not in Task 8.

- [ ] **Step 9: Confirm exception E1 is intact**

Run: `sed -n '38p' src/lib/shareCardTokens.test.js`
Expected: `  assert.equal(rgba("#ffffff", 0), "rgba(255, 255, 255, 0)")` — byte-identical to before this task.

- [ ] **Step 10: Commit**

```bash
git add src/lib/shareCardTokens.js src/lib/shareCardTokens.test.js
git commit -m "feat: add light-mode share card tokens and the ink/overlay alpha helpers"
```

---

## Task 8: `ShareStatCard.jsx` — canvas and shell

The only surface in the app that cannot use CSS variables. It gets the same three substitution rules, but expressed through `theme.ink`, `inkAlpha()` and `overlayAlpha()` from Task 7.

**Files:**
- Modify: `src/components/ShareStatCard.jsx` (525 lines) — `drawMountains` (line 28), `drawSnowflakes` (line 65), `drawAvatar` (line 115), `renderCard` (lines 153-426) and the JSX shell (lines 476-522).

**Interfaces:**
- Consumes: `getShareCardTheme(themeKey, mode)`, `inkAlpha(darkAlpha, mode)`, `overlayAlpha(darkAlpha, mode)`, `rgba(hex, alpha)` and the `ink` field, all from Task 7. `profile.theme_mode` from Task 1.
- Produces: nothing other tasks consume.

**Naming hazard (Verified #12):** `renderCard` already declares `const mode = session ? "session" : "season"` on line 154. The theme mode variable **must** be called `themeMode`. Shadowing `mode` breaks the session/season branch that drives half the card.

- [ ] **Step 1: Extend the import**

`src/components/ShareStatCard.jsx:4` becomes:

```jsx
import { getShareCardTheme, rgba, inkAlpha, overlayAlpha } from "../lib/shareCardTokens"
```

- [ ] **Step 2: Thread the theme into `drawMountains`**

Line 28's signature becomes `function drawMountains(ctx, W, H, theme) {`.

Line 31 becomes:

```jsx
  ctx.fillStyle = rgba(theme.accentDeep, 0.09)
```

Line 49 becomes:

```jsx
  ctx.fillStyle = rgba(theme.accentTeal, 0.08)
```

Those two literals were hardcoded Blizzard blues (`rgba(37,99,235,0.09)` and `rgba(8,145,178,0.08)`), so this also stops a Base Lodge card drawing blue mountains.

- [ ] **Step 3: Thread the theme into `drawSnowflakes`**

Line 65's signature becomes `function drawSnowflakes(ctx, W, H, seed, theme, themeMode) {`.

Line 69 becomes:

```jsx
  ctx.fillStyle = rgba(theme.ink, overlayAlpha(0.18, themeMode))
```

- [ ] **Step 4: Leave the avatar initials white, explicitly**

Line 115's `ctx.fillStyle = "white"` sits on the accent gradient painted at lines 97-99, so it is a Rule 2 `--color-on-accent` case: white in both modes. Make that visible rather than accidental:

```jsx
  // Rule 2 / --color-on-accent: this text sits on the accent gradient filled
  // just above, which is a deep saturated shade in light mode too. Stays white.
  ctx.fillStyle = "#ffffff"
```

This is the **one** literal-white survivor in this file; Step 12's grep expects exactly 1.

- [ ] **Step 5: Resolve the theme mode in `renderCard`**

Lines 153-155 become:

```jsx
async function renderCard(canvas, { profile, stats, season, session }) {
  const mode = session ? "session" : "season"
  const themeMode = profile?.theme_mode === "light" ? "light" : "dark"
  const theme = getShareCardTheme(profile?.theme, themeMode)
```

- [ ] **Step 6: Pass the theme to the two helpers**

Line 204 becomes:

```jsx
  drawSnowflakes(ctx, W, H, 42, theme, themeMode)
```

Line 207 becomes:

```jsx
  drawMountains(ctx, W, H, theme)
```

- [ ] **Step 7: Substitute every remaining canvas literal**

Leave lines 181-183 alone — they are the photo overlay, exception E3. Every other `rgba(255,255,255,x)` and `"white"` in `renderCard` becomes, in order:

| line | before | after |
|---|---|---|
| 219 | `ctx.fillStyle = "rgba(255,255,255,0.38)"` | `ctx.fillStyle = rgba(theme.ink, inkAlpha(0.38, themeMode))` |
| 241 | `ctx.fillStyle = "white"` | `ctx.fillStyle = theme.ink` |
| 248 | `ctx.fillStyle = "rgba(255,255,255,0.38)"` | `ctx.fillStyle = rgba(theme.ink, inkAlpha(0.38, themeMode))` |
| 276 | `cardBg.addColorStop(0, "rgba(255,255,255,0.065)")` | `cardBg.addColorStop(0, rgba(theme.ink, overlayAlpha(0.065, themeMode)))` |
| 277 | `cardBg.addColorStop(1, "rgba(255,255,255,0.03)")` | `cardBg.addColorStop(1, rgba(theme.ink, overlayAlpha(0.03, themeMode)))` |
| 283 | `ctx.strokeStyle = "rgba(255,255,255,0.1)"` | `ctx.strokeStyle = rgba(theme.ink, overlayAlpha(0.1, themeMode))` |
| 295 | `ctx.fillStyle = "white"` | `ctx.fillStyle = theme.ink` |
| 302 | `ctx.fillStyle = "rgba(255,255,255,0.42)"` | `ctx.fillStyle = rgba(theme.ink, inkAlpha(0.42, themeMode))` |
| 326 | `ctx.fillStyle = "rgba(255,255,255,0.5)"` | `ctx.fillStyle = rgba(theme.ink, inkAlpha(0.5, themeMode))` |
| 330 | `ctx.fillStyle = "white"` | `ctx.fillStyle = theme.ink` |
| 338 | `ctx.fillStyle = "white"` | `ctx.fillStyle = theme.ink` |
| 344 | `ctx.fillStyle = "rgba(255,255,255,0.55)"` | `ctx.fillStyle = rgba(theme.ink, inkAlpha(0.55, themeMode))` |
| 367 | `cardBg.addColorStop(0, "rgba(255,255,255,0.10)")` | `cardBg.addColorStop(0, rgba(theme.ink, overlayAlpha(0.1, themeMode)))` |
| 368 | `cardBg.addColorStop(1, "rgba(255,255,255,0.04)")` | `cardBg.addColorStop(1, rgba(theme.ink, overlayAlpha(0.04, themeMode)))` |
| 373 | `ctx.strokeStyle = "rgba(255,255,255,0.14)"` | `ctx.strokeStyle = rgba(theme.ink, overlayAlpha(0.14, themeMode))` |
| 385 | `ctx.fillStyle = "white"` | `ctx.fillStyle = theme.ink` |
| 392 | `ctx.fillStyle = "rgba(255,255,255,0.5)"` | `ctx.fillStyle = rgba(theme.ink, inkAlpha(0.5, themeMode))` |
| 416 | `ctx.fillStyle = "white"` | `ctx.fillStyle = theme.ink` |
| 423 | `ctx.fillStyle = "rgba(255,255,255,0.2)"` | `ctx.fillStyle = rgba(theme.ink, inkAlpha(0.2, themeMode))` |

Note line 367's literal is written `0.10`, but `overlayAlpha` is keyed on the number `0.1`; `0.10 === 0.1` in JavaScript, so `overlayAlpha(0.1, ...)` is correct and `overlayAlpha(0.10, ...)` would also work. Use `0.1`.

The amber "top resort" gradient at lines 310-311 and 316, and the accent glow at 401-406, are **not** touched: the first is a theme-invariant decorative amber wash that reads correctly on both a dark and a light card, and the second already goes through `rgba(theme.accentDeep, ...)`.

- [ ] **Step 8: Retrofit the modal shell (JSX, not canvas)**

The shell around the preview is ordinary JSX and takes Rules 1-3 directly.

- Line 478's backdrop `background: "rgba(0,0,0,0.72)"` stays — exception E4.
- Line 479 becomes:

```jsx
      <div style={{ width: "100%", maxWidth: 440, background: "var(--color-modal-bg)", borderRadius: 24, padding: "20px", border: "1px solid var(--overlay-10)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
```

- Line 486 (`Session Card` / `Season Card` heading) — `color: "white"` becomes `color: "var(--color-text-1)"`.
- Line 487 (close X) — `background: "rgba(255,255,255,0.08)"` becomes `"var(--overlay-08)"`, `color: "rgba(255,255,255,0.5)"` becomes `"var(--ink-50)"`.
- Line 491 (preview well) — `background: "rgba(255,255,255,0.04)"` becomes `"var(--overlay-04)"`.
- Line 493 (`Rendering…`) — `color: "rgba(255,255,255,0.3)"` becomes `"var(--ink-30)"`.
- Line 497 (`Failed to render card.`) — `color: "#f87171"` becomes `"var(--color-danger)"`.
- Line 507-508 (Share button) becomes:

```jsx
              background: (rendering || !imgUrl) ? "var(--overlay-08)" : "var(--gradient-cta)",
              color: (rendering || !imgUrl) ? "var(--ink-45)" : "var(--color-on-accent)", fontWeight: 800, fontSize: 14,
```

The old `linear-gradient(135deg,#2563eb,#0891b2)` was a hardcoded Blizzard accent, and white on its `#0891b2` stop scores **3.68:1** — below AA in dark mode today. `var(--gradient-cta)` is per-theme and, in light mode, every stop clears 4.83:1 with white (Appendix A.5).

- Line 515 (Close button) becomes:

```jsx
            style={{ padding: "13px 18px", borderRadius: 14, border: "1px solid var(--overlay-10)", background: "var(--overlay-05)", color: "var(--ink-50)", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
```

- [ ] **Step 9: Verify Rule 1 is complete for this file**

Run: `grep -c "rgba(255, *255, *255" src/components/ShareStatCard.jsx`
Expected: **0**.

- [ ] **Step 10: Verify Rule 3 is complete for this file**

Run: `grep -n "rgba(8,14,28\|rgba(2,6,23" src/components/ShareStatCard.jsx`
Expected: exactly **3** lines — 181, 182, 183, the photo overlay (exception E3). The `rgba(8,14,28,0.98)` panel must be gone.

- [ ] **Step 11: Verify Rule 2 is complete for this file**

Run: `grep -cE "(\"white\"|'white'|\"#fff\"|'#fff'|\"#ffffff\"|'#ffffff')" src/components/ShareStatCard.jsx`
Expected: **1** — line 115's avatar initials, the documented `--color-on-accent` case from Step 4.

- [ ] **Step 12: Verify build, lint and tests**

Run: `npm run build`
Expected: build succeeds.

Run: `npx eslint src/components/ShareStatCard.jsx`
Expected: no new problems beyond the baseline for this file.

Run: `npm test`
Expected: `tests 304`, `pass 304`, `fail 0` — unchanged; this file has no unit coverage.

- [ ] **Step 13: Commit**

```bash
git add src/components/ShareStatCard.jsx
git commit -m "refactor: make the share card canvas mode-aware via the shareCardTokens mirror"
```

- [ ] **Step 14: Note for the click-test list**

Add: *"Profile > Create share card, in light mode, in all 5 themes: card background is light, name and stat numbers are dark, mountains and snowflakes are visible, the Share button gradient matches the theme. Then a session card from a resort with a hero photo — that one keeps its dark photo overlay and white text in BOTH modes, by design."*

---

## Tasks 9-21: the retrofit — how every one of them works

Tasks 9 through 21 are the same task thirteen times over different files. Each one:

1. Applies **Rules 1, 2 and 3** (see "The substitution rules") to every file in its list. Nothing else changes: no JSX restructuring, no prop changes, no logic changes, no formatting churn. If your diff for a retrofit task shows anything other than a colour string becoming a `var(...)`, you have gone too far.
2. Runs three verification greps per file. They are referred to below as **G1**, **G2** and **G3**:

```
G1   grep -c "rgba(255, *255, *255" <file>
G2   grep -cE "(\"white\"|'white'|\"#fff\"|'#fff'|\"#ffffff\"|'#ffffff')" <file>
G3   grep -cE "rgba\((2|3|4|5|6|8|10|12|15|16|20|30|71), ?[0-9]{1,2}, ?[0-9]{1,3}, ?[0-9.]+\)" <file>
```

Each task states the **expected number** for every file. Unless a number is given, all three expect **0**. Any non-zero expectation is an exception-list entry and the task names the exact lines it covers.

3. Runs `npm run build` (expected: succeeds) and `npx eslint <the task's files>` (expected: no new problems beyond the 85-problem baseline).
4. Commits, one commit per task.
5. Adds its screens to the running click-test list that Task 22 collects.

**These tasks are order-independent of each other** but all of them depend on Tasks 2, 3 and 4 having landed the tokens. They can be dispatched in parallel to separate subagents if that is how the session is run; they touch disjoint file sets, with one exception noted in Task 19.

**A reminder that catches people out:** `0.4` is `--ink-40` and `0.04` is `--overlay-04`. They differ by one character and by a factor of ten. When a file has both on adjacent lines, slow down.

---

## Task 9: retrofit — app shell and notifications

**Files:**
- Modify: `src/components/NotificationBell.jsx` (13 / 6 / 4)
- Modify: `src/App.jsx` (17 / 15 / 7)

**Interfaces:**
- Consumes: every token from Tasks 2, 3 and 4.
- Produces: nothing.

- [ ] **Step 1: Retrofit `src/components/NotificationBell.jsx`**

Apply Rules 1-3. File-specific notes:

- Lines 267 and 287 are unread-count badge rings (`border: "1.5px solid rgba(8,17,30,1)"` and `border: "2px solid rgba(2,6,23,1)"`) — both become `var(--color-badge-border)` per Rule 3.
- Lines 307 and 326 are the dropdown panel's own background (`rgba(10,14,30,0.98)`) — both become `var(--color-modal-bg)` per Rule 3.

- [ ] **Step 2: Verify `NotificationBell.jsx`**

Run G1, G2 and G3 on `src/components/NotificationBell.jsx`.
Expected: **0**, **0**, **0**.

- [ ] **Step 3: Retrofit `src/App.jsx`**

Apply Rules 1-3. File-specific notes:

- Lines 340, 349 and 419 each carry both a Rule 2 and a Rule 3 substitution on one line — see the worked example under Rule 3, which is line 340 verbatim.
- Line 293's `const border = ...` builds a border string in a variable rather than inline; the `rgba(255,255,255,0.22)` inside it is Rule 1 non-text, so `var(--overlay-22)`.
- Line 298's `background: "linear-gradient(135deg,rgba(2,132,199,0.8),rgba(56,189,248,0.7))"` is a hardcoded Blizzard accent, not a dark literal — **change it to `var(--gradient-primary)`**, and its `color: "white"` to `var(--color-on-accent)`. Without this the default avatar is Blizzard-blue in every theme and in both modes.
- Lines 1052 and 1162 are full-screen backdrops at alpha 0.72 → `var(--scrim-soft)`.
- Line 1111 is a panel at alpha 0.88 → per Rule 3 that is a panel background, not a backdrop: `var(--color-modal-bg)`. Check the surrounding element; if it carries `position: "fixed", inset: 0` it is a backdrop and takes `var(--scrim)` instead.
- Line 1204's `linear-gradient(170deg,rgba(4,8,15,0.98) 0%,rgba(4,8,15,1) 100%)` is a panel background → `var(--color-modal-bg)`.
- Line 1387's `rgba(255,0,0,0.12)` / `rgba(255,0,0,0.25)` are pure-red literals, not on any rule's list — replace them with `var(--color-danger-bg)` and `1px solid var(--color-danger)` so the dev error banner is legible in light mode.

- [ ] **Step 4: Verify `App.jsx`**

Run G1, G2 and G3 on `src/App.jsx`.
Expected: **0**, **0**, **0**.

- [ ] **Step 5: Build and lint**

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint src/App.jsx src/components/NotificationBell.jsx`
Expected: no new problems beyond baseline.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/components/NotificationBell.jsx
git commit -m "refactor: tokenise app shell and notification colours for light mode"
```

- [ ] **Step 7: Click-test note**

Add: *"Light mode: top nav, mobile top bar, bottom nav, the unread-count badges on the bell and on the bottom-nav tabs, the notification dropdown, and the default (no-photo) avatar."*

---

## Task 10: retrofit — auth and landing

**Files:**
- Modify: `src/components/AuthPanel.jsx` (8 / 3 / 0)
- Modify: `src/components/AuthForm.jsx` (9 / 0 / 1)
- Modify: `src/components/LandingPage.jsx` (16 / 16 / 2)

**Interfaces:**
- Consumes: every token from Tasks 2, 3 and 4.
- Produces: nothing.

These three are the first screens a signed-out visitor sees, and a signed-out visitor has **no `data-theme` and no `data-mode`** on `<html>` (Verified #2), so they always render Blizzard-dark. They are still retrofitted, because a signed-in light-mode user who signs out lands here before the attributes are cleared.

- [ ] **Step 1: Retrofit `src/components/AuthPanel.jsx`**

Apply Rules 1-3.

- [ ] **Step 2: Verify `AuthPanel.jsx`** — run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 3: Retrofit `src/components/AuthForm.jsx`**

Apply Rules 1-3. File-specific note: line 213's `background: "rgba(20,24,34,0.96)"` is the panel's own background → `var(--color-modal-bg)` per Rule 3.

- [ ] **Step 4: Verify `AuthForm.jsx`** — run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 5: Retrofit `src/components/LandingPage.jsx`**

Apply Rules 1-3. File-specific notes:

- Line 122's `background: "rgba(8,12,28,0.98)"` is a card panel → `var(--color-modal-bg)`.
- Line 260's `background: "radial-gradient(ellipse 70% 40% at 50% 100%, rgba(37,99,235,0.1) 0%, transparent 70%), rgba(4,8,26,1)"` is a page-level background: the solid stop becomes `var(--color-bg)` and the radial's `rgba(37,99,235,0.1)` becomes `var(--color-accent-dim)`, giving `radial-gradient(ellipse 70% 40% at 50% 100%, var(--color-accent-dim) 0%, transparent 70%), var(--color-bg)`.
- Line 440's `color: "white"` is the page-wide default text colour on `var(--color-bg)` → `var(--color-text-1)`, not `--color-on-accent`. Get this one right; it cascades to the whole landing page.
- The amber-bordered card at line 122 keeps `rgba(251,191,36,0.25)` — an amber accent literal, outside all three rules, and readable in both modes.

- [ ] **Step 6: Verify `LandingPage.jsx`** — run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 7: Build and lint**

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint src/components/AuthPanel.jsx src/components/AuthForm.jsx src/components/LandingPage.jsx`
Expected: no new problems beyond baseline.

- [ ] **Step 8: Commit**

```bash
git add src/components/AuthPanel.jsx src/components/AuthForm.jsx src/components/LandingPage.jsx
git commit -m "refactor: tokenise auth and landing colours for light mode"
```

- [ ] **Step 9: Click-test note**

Add: *"Sign out while in light mode, then check the landing page, the sign-in panel and the sign-up form. They render dark because a signed-out visitor has no data-mode — confirm nothing looks half-light."*

---

## Task 11: retrofit — Today tab

**Files:**
- Modify: `src/components/TodayScreen.jsx` (36 / 6 / 6)
- Modify: `src/components/ResortListRow.jsx` (8 / 3 / 0)
- Modify: `src/components/MountainPage.jsx` (3 / 0 / 0)
- Modify: `src/components/PowderMap.jsx` (2 / 0 / 0)
- Modify: `src/components/TodaysCrew.jsx` (13 / 1 / 0)
- Modify: `src/components/NudgeBanner.jsx` (2 / 2 / 0)
- Modify: `src/components/EventsWidget.jsx` (5 / 2 / 0)

**Interfaces:**
- Consumes: every token from Tasks 2, 3 and 4.
- Produces: nothing.

- [ ] **Step 1: Retrofit `src/components/TodayScreen.jsx`**

Apply Rules 1-3. **This file has six exception-E3 lines — do not touch them:**

- Line 131 — the resort hero's `linear-gradient(to top, rgba(4,8,15,0.82), rgba(2,6,23,0.2)), url(...)` photo overlay.
- Lines 137, 140, 142, 143 — the risk/status chips that sit **on** that photo (`rgba(30,10,10,0.75)`, `rgba(10,30,10,0.75)`, and two `rgba(4,8,15,0.65)`). Their white text is correct in both modes because the surface under them is a darkened photograph.
- Line 257 — `rgba(10,30,10,0.5)`, the confirmed-state chip, same photo header.

Everything else in the file takes the rules normally, including the `rgba(255,255,255,x)` borders on lines 142-143 — those are Rule 1 and **do** get tokenised even though the background beside them is an exception; a `--overlay-12` hairline reads correctly over a dark photo in both modes.

- [ ] **Step 2: Verify `TodayScreen.jsx`**

Run G1 and G2. Expected: **0** and **0**.
Run G3. Expected: **6** — lines 131, 137, 140, 142, 143 and 257, exactly the E3 set above. Run `grep -nE "rgba\((2|3|4|5|6|8|10|12|15|16|20|30|71), ?[0-9]{1,2}, ?[0-9]{1,3}, ?[0-9.]+\)" src/components/TodayScreen.jsx` and confirm the six line numbers match. If a different line survives, you missed a substitution.

- [ ] **Step 3: Retrofit and verify `src/components/ResortListRow.jsx`**

Apply Rules 1-3. Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 4: Retrofit and verify `src/components/MountainPage.jsx`**

Apply Rules 1-3. Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 5: Retrofit and verify `src/components/PowderMap.jsx`**

Apply Rules 1-3. File-specific note: this file builds Leaflet `divIcon` markers from HTML strings, so some colour literals live inside template strings rather than style objects. `var(--token)` works there exactly the same — the string is parsed as CSS by the browser. Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 6: Retrofit and verify `src/components/TodaysCrew.jsx`**

Apply Rules 1-3. File-specific note: lines 251 and 270 are `rgba(255,255,255,0.12)` inside ternaries whose other branch is an accent — read which property they land in before choosing `--overlay-12`. Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 7: Retrofit and verify `src/components/NudgeBanner.jsx`**

Apply Rules 1-3. Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 8: Retrofit and verify `src/components/EventsWidget.jsx`**

Apply Rules 1-3. File-specific note: line 69's Create button is `background: "var(--gradient-primary)", color: "white"` → `var(--color-on-accent)`. Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 9: Build and lint**

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint src/components/TodayScreen.jsx src/components/ResortListRow.jsx src/components/MountainPage.jsx src/components/PowderMap.jsx src/components/TodaysCrew.jsx src/components/NudgeBanner.jsx src/components/EventsWidget.jsx`
Expected: no new problems beyond baseline.

- [ ] **Step 10: Commit**

```bash
git add src/components/TodayScreen.jsx src/components/ResortListRow.jsx src/components/MountainPage.jsx src/components/PowderMap.jsx src/components/TodaysCrew.jsx src/components/NudgeBanner.jsx src/components/EventsWidget.jsx
git commit -m "refactor: tokenise Today tab colours for light mode"
```

- [ ] **Step 11: Click-test note**

Add: *"Light mode, Today tab: card view and list view, a resort's expanded row, the map view and a marker popup, the Today's Crew strip, an active nudge banner, the events widget. The resort hero photo keeps its dark gradient and white chips in light mode — that is correct."*

---

## Task 12: retrofit — shared `ui/` primitives

Small files, high blast radius: `Card`, `Badge`, `Avatar` and `Button` render inside almost every screen. Doing them as one task means one review of the pieces everything else is built from.

**Files:**
- Modify: `src/components/ui/Card.jsx` (2 / 0 / 0)
- Modify: `src/components/ui/AccentCard.jsx` (2 / 0 / 0)
- Modify: `src/components/ui/Badge.jsx` (1 / 0 / 0)
- Modify: `src/components/ui/StatStrip.jsx` (2 / 1 / 0)
- Modify: `src/components/ui/ScoreRing.jsx` (1 / 0 / 0)
- Modify: `src/components/ui/EventCard.jsx` (2 / 2 / 0)
- Modify: `src/components/ui/Avatar.jsx` (0 / 1 / 0)
- Modify: `src/components/ui/Button.jsx` (0 / 1 / 0)
- Modify: `src/components/ui/ResortPicker.jsx` (4 / 2 / 0)
- Modify: `src/components/ui/MediaMessageInput.jsx` (10 / 2 / 0)
- Modify: `src/components/ui/GifPicker.jsx` (6 / 2 / 0)
- Modify: `src/components/ui/HeroPhotoHeader.jsx` (1 / 1 / 1)
- Modify: `src/components/ui/HeroBannerStrip.jsx` (0 / 0 / 1)

**Interfaces:**
- Consumes: every token from Tasks 2, 3 and 4.
- Produces: nothing. No prop signatures change.

- [ ] **Step 1: Retrofit the eleven files with no exceptions**

Apply Rules 1-3 to `ui/Card.jsx`, `ui/AccentCard.jsx`, `ui/Badge.jsx`, `ui/StatStrip.jsx`, `ui/ScoreRing.jsx`, `ui/EventCard.jsx`, `ui/Avatar.jsx`, `ui/Button.jsx`, `ui/ResortPicker.jsx`, `ui/MediaMessageInput.jsx` and `ui/GifPicker.jsx`.

File-specific notes:

- `ui/Badge.jsx` already consumes `--rating-*` and `--rating-*-border` for its tier and risk labels. Those tokens now have light values (Task 3 Step 2); do **not** change how Badge references them. Its one `rgba(255,255,255,x)` is a plain Rule 1 substitution.
- `ui/Button.jsx`'s single `"white"` is the label on a filled accent button → `var(--color-on-accent)`.
- `ui/Avatar.jsx`'s single `"white"` is the initials on the generated accent circle → `var(--color-on-accent)`.

- [ ] **Step 2: Verify the eleven**

Run G1, G2 and G3 on each of those eleven files.
Expected: **0**, **0**, **0** for all eleven.

- [ ] **Step 3: Retrofit the two hero components**

`ui/HeroPhotoHeader.jsx:10` and `ui/HeroBannerStrip.jsx:10` each build a `linear-gradient(...), url(photo)` background. **Those gradients are exception E3 and stay dark in both modes.** Everything else in both files takes the rules — including `HeroPhotoHeader`'s `"white"` title, which sits on the darkened photo and is therefore a `--color-on-accent`-style always-white case; use `var(--color-on-accent)` for it and say so in a one-line comment.

- [ ] **Step 4: Verify the two hero components**

Run G1 and G2 on `src/components/ui/HeroPhotoHeader.jsx`. Expected: **0** and **0**.
Run G3 on `src/components/ui/HeroPhotoHeader.jsx`. Expected: **1** (line 10).
Run G1 and G2 on `src/components/ui/HeroBannerStrip.jsx`. Expected: **0** and **0**.
Run G3 on `src/components/ui/HeroBannerStrip.jsx`. Expected: **1** (line 10).

- [ ] **Step 5: Build and lint**

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint src/components/ui`
Expected: no new problems beyond baseline.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui
git commit -m "refactor: tokenise shared ui primitives for light mode"
```

- [ ] **Step 7: Click-test note**

Add: *"Light mode: any card, a tier badge and a risk badge (all six rating colours), a stat strip, a score ring, an avatar with no photo, a primary button, the resort picker, the GIF picker, and a photo message composer. Hero photo headers keep their dark gradient and white title — correct."*

---

## Task 13: retrofit — `TripDetailModal.jsx`

The single largest file in the retrofit: **135** white-alpha occurrences, **26** literal whites and **8** dark literals in one component. It gets its own task and its own review gate.

**Files:**
- Modify: `src/components/TripDetailModal.jsx`

**Interfaces:**
- Consumes: every token from Tasks 2, 3 and 4.
- Produces: nothing.

- [ ] **Step 1: Protect the `THEME` table first, before touching anything else**

`TripDetailModal.jsx:57-63` is a lookup table of seven trip-card cosmetic themes. Each row's `overlay:` string is a dark gradient painted **on top of a resort photograph**, and each row's `accent:` is a literal hex that feeds alpha-suffix template strings elsewhere in the file. **Neither is touched by this task.** Read those seven lines first so you recognise them when a search-and-replace tries to eat them.

Concretely, all seven `rgba(2,6,23,0.9x)` stops and the `rgba(200,225,255,0.2)`, `rgba(29,78,216,0.25)`, `rgba(109,40,217,0.22)`, `rgba(5,150,105,0.14)`, `rgba(234,88,12,0.2)`, `rgba(239,68,68,0.12)`, `rgba(251,191,36,0.22)`, `rgba(56,189,248,0.14)`, `rgba(71,85,105,0.38)` and `rgba(30,41,59,0.28)` stops on those seven lines stay exactly as they are.

- [ ] **Step 2: Apply Rules 1-3 to the rest of the file**

Work top to bottom. Other file-specific notes:

- Line 793's `chipBtn(active)` helper builds a whole style object in one expression with four Rule 1 substitutions and one Rule 2 — `background` 0.14/0.06 → `--overlay-14`/`--overlay-06`, `border` 0.25/0.1 → `--overlay-25`/`--overlay-10`, `color` `"white"`/0.55 → `var(--color-text-1)`/`var(--ink-55)`.
- Line 801's `background: "rgba(2,6,23,0.88)"` is a panel, not a photo overlay and not a backdrop → `var(--color-modal-bg)`.
- Line 1287's `background: "var(--gradient-cta)", ... color: "white"` → `var(--color-on-accent)`.
- Line 1379's `color: r.myVote === v ? "white" : "rgba(255,255,255,0.6)"` — the `"white"` branch is the selected vote chip. Check its `background` on the surrounding lines: if it is an accent fill use `var(--color-on-accent)`, otherwise `var(--color-text-1)`. The other branch is `var(--ink-60)` either way.

- [ ] **Step 3: Verify**

Run G1 on `src/components/TripDetailModal.jsx`. Expected: **0**.
Run G2 on `src/components/TripDetailModal.jsx`. Expected: **0**.
Run G3 on `src/components/TripDetailModal.jsx`. Expected: **7** — lines 57 through 63, the `THEME` table and nothing else. Run `grep -nE "rgba\((2|3|4|5|6|8|10|12|15|16|20|30|71), ?[0-9]{1,2}, ?[0-9]{1,3}, ?[0-9.]+\)" src/components/TripDetailModal.jsx` and confirm every surviving line number is between 57 and 63.

- [ ] **Step 4: Build and lint**

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint src/components/TripDetailModal.jsx`
Expected: no new problems beyond baseline.

- [ ] **Step 5: Commit**

```bash
git add src/components/TripDetailModal.jsx
git commit -m "refactor: tokenise TripDetailModal colours for light mode"
```

- [ ] **Step 6: Click-test note**

Add: *"Light mode, open a trip: header, the seven cosmetic trip themes from the theme picker (all seven keep their dark photo overlay and white title — correct), the going/maybe/out chips, the date-vote rows, the car-seat rows, the packing list, the chat tab, and the edit sheet. This is the densest screen in the app; give it the longest look."*

---

## Task 14: retrofit — trip creation and trip cards

**Files:**
- Modify: `src/components/CreateTripModal.jsx` (39 / 9 / 3)
- Modify: `src/components/TripCard.jsx` (26 / 4 / 4)
- Modify: `src/components/TripChatView.jsx` (7 / 2 / 0)
- Modify: `src/components/FriendsGoingBadge.jsx` (4 / 2 / 1)

**Interfaces:**
- Consumes: every token from Tasks 2, 3 and 4.
- Produces: nothing.

- [ ] **Step 1: Retrofit `src/components/CreateTripModal.jsx`**

Apply Rules 1-3. File-specific notes:

- Line 153's `background: "rgba(2,6,23,0.82)"` is the full-screen backdrop → `var(--scrim)`.
- Lines 269 and 314 are exception E3: `linear-gradient(to bottom, rgba(2,6,23,0.25) ..., rgba(2,6,23,0.84) ...), url(resort.photo)` and the horizontal variant. **Leave both.**
- Line 216's `background: step >= s ? accent : "rgba(255,255,255,0.18)"` → `var(--overlay-18)`.
- Lines 267, 365 and 507 build borders with template literals mixing a local `accent`/`resort.accent` variable and a white literal; only the white literal changes.
- Lines 584 and 661 have `color: ... ? "var(--color-bg)" : "rgba(255,255,255,0.35)"` — the disabled branch is Rule 1 text → `var(--ink-35)`.

- [ ] **Step 2: Verify `CreateTripModal.jsx`**

Run G1 and G2. Expected: **0** and **0**.
Run G3. Expected: **2** — lines 269 and 314 only.

- [ ] **Step 3: Retrofit `src/components/TripCard.jsx`**

Apply Rules 1-3. File-specific notes:

- Lines 45, 59 and 96 are `border: "2px solid rgba(8,17,31,0.85)"` avatar rings → `var(--color-badge-border)` per Rule 3.
- Line 238 is exception E3: the card's `linear-gradient(to bottom, rgba(2,6,23,0.12) 0%, rgba(2,6,23,0.88) 100%), url(photo)` hero. **Leave it**, and leave the white text sitting on it — that text takes `var(--color-on-accent)` with a one-line comment, not `var(--color-text-1)`.

- [ ] **Step 4: Verify `TripCard.jsx`**

Run G1 and G2. Expected: **0** and **0**.
Run G3. Expected: **1** — line 238 only.

- [ ] **Step 5: Retrofit and verify `src/components/TripChatView.jsx`**

Apply Rules 1-3. File-specific note: line 75 is the two-target ternary from Rule 2's worked example (`isMe ? gradient-cta : rgba(255,255,255,0.09)` with one flat `color: "white"`). Split the colour into `isMe ? "var(--color-on-accent)" : "var(--color-text-1)"`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 6: Retrofit and verify `src/components/FriendsGoingBadge.jsx`**

Apply Rules 1-3. File-specific note: the `solid` variant's button background is `var(--gradient-primary)` (line 27), so **everything inside it is on an accent fill**. Line 41's `background: "rgba(4,8,15,0.35)"` is a darkening disc **on that accent**, not a page surface — leave it, and set its `color: "white"` to `var(--color-on-accent)`. Line 56's `color: isSolid ? "white" : "rgba(255,255,255,0.75)"` becomes `isSolid ? "var(--color-on-accent)" : "var(--ink-75)"`.

Run G1 and G2. Expected: **0** and **0**.
Run G3. Expected: **1** — line 41 only.

- [ ] **Step 7: Build and lint**

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint src/components/CreateTripModal.jsx src/components/TripCard.jsx src/components/TripChatView.jsx src/components/FriendsGoingBadge.jsx`
Expected: no new problems beyond baseline.

- [ ] **Step 8: Commit**

```bash
git add src/components/CreateTripModal.jsx src/components/TripCard.jsx src/components/TripChatView.jsx src/components/FriendsGoingBadge.jsx
git commit -m "refactor: tokenise trip creation and trip card colours for light mode"
```

- [ ] **Step 9: Click-test note**

Add: *"Light mode: create a trip end to end (all four steps, including the resort photo picker and the theme picker), then look at a trip card in the Plans list, its overlapping avatar stack, the 'Who's going' badge in both its solid and outline variants, and the trip chat with one of your own messages next to one of someone else's."*

---

## Task 15: retrofit — Plans tab and calendars

**Files:**
- Modify: `src/components/SkiPlansPage.jsx` (5 / 7 / 0)
- Modify: `src/components/SkiPlansTab.jsx` (8 / 1 / 0)
- Modify: `src/components/PlanCalendar.jsx` (9 / 4 / 0)
- Modify: `src/components/PlanEditorModal.jsx` (0 / 1 / 0)
- Modify: `src/components/DateMatchmaker.jsx` (28 / 2 / 0)
- Modify: `src/components/FriendsCalendar.jsx` (1 / 4 / 0)
- Modify: `src/components/SeasonCalendar.jsx` (3 / 0 / 0)
- Modify: `src/components/calendar/DayPlanCard.jsx` (0 / 1 / 0)

**Interfaces:**
- Consumes: every token from Tasks 2, 3 and 4.
- Produces: nothing.

- [ ] **Step 1: Retrofit and verify `src/components/SkiPlansPage.jsx`**

Apply Rules 1-3. File-specific notes: lines 174, 225 and 232 are all `background: "var(--gradient-cta)" ... color: "white"` → `var(--color-on-accent)`. Line 200's `color: subTab === key ? "white" : "var(--color-text-3)"` — check the active tab's background; if it is `var(--color-accent)` use `var(--color-on-accent)`, otherwise `var(--color-text-1)`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 2: Retrofit and verify `src/components/SkiPlansTab.jsx`**

Apply Rules 1-3. Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 3: Retrofit and verify `src/components/PlanCalendar.jsx`**

Apply Rules 1-3. File-specific note: line 123 is a three-way `color: isToday ? "white" : isWeekend ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)"`. The `isToday` cell has an accent background (check the `background` a few lines above) so it takes `var(--color-on-accent)`; the other two are `var(--ink-90)` and `var(--ink-60)`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 4: Retrofit and verify `src/components/PlanEditorModal.jsx`**

Apply Rules 1-3. Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 5: Retrofit and verify `src/components/DateMatchmaker.jsx`**

Apply Rules 1-3. File-specific note: lines 150 and 224 are `background: "var(--color-accent-strong)", color: "#fff"` → `var(--color-on-accent)`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 6: Retrofit and verify `src/components/FriendsCalendar.jsx`**

Apply Rules 1-3. File-specific note: lines 442, 501 and 614 are all `background: "var(--gradient-cta)" ... color: "white"` → `var(--color-on-accent)`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 7: Retrofit and verify `src/components/SeasonCalendar.jsx`**

Apply Rules 1-3. File-specific note: this component's day cells already consume `--season-grid-tier-0` through `--season-grid-tier-4`, which gained light values in Task 3 Step 2. Do not change how it references them.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 8: Retrofit and verify `src/components/calendar/DayPlanCard.jsx`**

Apply Rules 1-3. Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 9: Build and lint**

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint src/components/SkiPlansPage.jsx src/components/SkiPlansTab.jsx src/components/PlanCalendar.jsx src/components/PlanEditorModal.jsx src/components/DateMatchmaker.jsx src/components/FriendsCalendar.jsx src/components/SeasonCalendar.jsx src/components/calendar/DayPlanCard.jsx`
Expected: no new problems beyond baseline.

- [ ] **Step 10: Commit**

```bash
git add src/components/SkiPlansPage.jsx src/components/SkiPlansTab.jsx src/components/PlanCalendar.jsx src/components/PlanEditorModal.jsx src/components/DateMatchmaker.jsx src/components/FriendsCalendar.jsx src/components/SeasonCalendar.jsx src/components/calendar/DayPlanCard.jsx
git commit -m "refactor: tokenise Plans tab and calendar colours for light mode"
```

- [ ] **Step 11: Click-test note**

Add: *"Light mode, Plans tab: the plan list, both sub-tabs, the month calendar with today highlighted and a weekend column, a day with a plan on it, the plan editor sheet, the date matchmaker with a picked date, the friends calendar, and the Profile season grid (all five heat tiers should still be distinguishable and ordered)."*

---

## Task 16: retrofit — `CrewGroupChat.jsx`

The second-largest file in the retrofit (**58** white-alpha, **19** literal whites, **7** dark literals) and the one with the most mixed backdrop/panel pairs. Its own task.

**Files:**
- Modify: `src/components/CrewGroupChat.jsx`

**Interfaces:**
- Consumes: every token from Tasks 2, 3 and 4.
- Produces: nothing.

- [ ] **Step 1: Classify the seven dark literals before substituting**

They are not all the same kind. Working from the top:

| line | before | Rule 3 class | after |
|---|---|---|---|
| 84  | `background: "rgba(2,6,23,0.82)"` | full-screen backdrop | `var(--scrim)` |
| 94  | `background: "rgba(10,14,30,0.98)"` | panel | `var(--color-modal-bg)` |
| 472 | `background: "rgba(10,14,30,0.6)"` | a header strip inside the panel, not a page surface | `var(--overlay-06)` |
| 507 | `background: "rgba(8,12,26,0.98)"` | panel | `var(--color-modal-bg)` |
| 801 | `background: "rgba(4,8,20,0.85)"` | full-screen backdrop | `var(--scrim)` |
| 955 | `border: "2px solid rgba(10,14,26,1)"` | avatar ring | `var(--color-badge-border)` |
| 960 | `border: "2px solid rgba(10,14,26,1)"` | avatar ring | `var(--color-badge-border)` |

Line 472 is the odd one: at alpha 0.6 it is a translucent tint over the panel behind it, so `--color-modal-bg` (opaque) would flatten the design. `--overlay-06` reproduces the same "slightly lighter than the panel" effect in dark and inverts correctly in light. Check the surrounding element before you commit to it — the worked example under Rule 3 shows lines 84 and 94, not this one.

- [ ] **Step 2: Apply Rules 1-3 to the whole file**

Other file-specific notes:

- Line 341's `background: saving ? "rgba(37,99,235,0.5)" : "var(--gradient-cta)"` — the saving branch is a hardcoded Blizzard blue at 50%; replace it with `var(--color-accent-dim)` so the disabled state follows the theme in both modes. Its `color: "white"` is on an accent fill either way → `var(--color-on-accent)`.
- Line 516's `background: "var(--color-accent-deep)", color: "white"` → `var(--color-on-accent)`.
- Line 867's `background: "var(--gradient-cta)", color: "white"` → `var(--color-on-accent)`.
- Line 960's `color: "rgba(255,255,255,0.6)"` on the "+N" overflow disc is Rule 1 text → `var(--ink-60)`.

- [ ] **Step 3: Verify**

Run G1 on `src/components/CrewGroupChat.jsx`. Expected: **0**.
Run G2 on `src/components/CrewGroupChat.jsx`. Expected: **0**.
Run G3 on `src/components/CrewGroupChat.jsx`. Expected: **0**.

- [ ] **Step 4: Build and lint**

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint src/components/CrewGroupChat.jsx`
Expected: no new problems beyond baseline.

- [ ] **Step 5: Commit**

```bash
git add src/components/CrewGroupChat.jsx
git commit -m "refactor: tokenise CrewGroupChat colours for light mode"
```

- [ ] **Step 6: Click-test note**

Add: *"Light mode, Crew tab: the crew list, an open crew chat (own message bubble next to someone else's), the member avatar stack with a +N overflow disc, the invite sheet, the create-crew sheet mid-save (the button's disabled state), and a pending invite row."*

---

## Task 17: retrofit — Crew boards

**Files:**
- Modify: `src/components/LeaderboardPage.jsx` (33 / 16 / 0)
- Modify: `src/components/SkiBuddyBoard.jsx` (23 / 7 / 0)
- Modify: `src/components/PostSkiBuddyForm.jsx` (9 / 4 / 1)
- Modify: `src/components/MountainBoard.jsx` (15 / 8 / 0)
- Modify: `src/components/ActivityFeed.jsx` (8 / 2 / 0)
- Modify: `src/components/ModerationQueue.jsx` (1 / 0 / 0)

**Interfaces:**
- Consumes: every token from Tasks 2, 3 and 4.
- Produces: nothing.

- [ ] **Step 1: Retrofit and verify `src/components/LeaderboardPage.jsx`**

Apply Rules 1-3. File-specific notes:

- Line 180's `background: "white"` is the sliding knob of a toggle whose track is coloured → `var(--color-on-accent)` (Rule 2's third bullet).
- Lines 404-407 are the worked example under Rule 1 — copy it exactly.
- Lines 245, 265, 465 are `color: <condition> ? "white" : "rgba(255,255,255,0.x)"` on **glass** backgrounds, not accent fills → `var(--color-text-1)` and the matching `--ink-*`.
- Lines 192, 389 and 488 are `background: "var(--gradient-cta)", color: "white"` → `var(--color-on-accent)`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 2: Retrofit and verify `src/components/SkiBuddyBoard.jsx`**

Apply Rules 1-3. File-specific note: line 371's `background: "var(--gradient-primary)", color: "white"` → `var(--color-on-accent)`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 3: Retrofit and verify `src/components/PostSkiBuddyForm.jsx`**

Apply Rules 1-3. File-specific notes:

- Lines 21-23 are a shared chip-style helper: `border` white-0.1 → `var(--overlay-10)`, `background` the inactive branch white-0.04 → `var(--overlay-04)`, `color` the inactive branch white-0.6 → `var(--ink-60)`. The active branches already use `var(--color-accent)` and a Blizzard-blue literal `rgba(56,189,248,0.2)` — replace that literal with `var(--color-accent-dim)` so the active chip follows the theme.
- Line 81's `background: "rgba(4,8,15,0.85)"` on a `position: "fixed", inset: 0` element is a backdrop → `var(--scrim)`.
- Line 178's `background: busy ? "rgba(255,255,255,0.1)" : "var(--gradient-cta)", color: "white"` — the busy branch is `var(--overlay-10)`, and because the colour is flat across both branches make it `color: busy ? "var(--ink-45)" : "var(--color-on-accent)"`, otherwise the busy state is white text on a pale chip in light mode.
- Line 103's `border: "1px solid rgba(248,113,113,0.25)"` is a danger-red literal beside `var(--color-danger-bg)` — replace it with `1px solid var(--color-danger)` so the error card's border follows the mode.

Run G1, G2. Expected: **0** and **0**.
Run G3. Expected: **0**.

- [ ] **Step 4: Retrofit and verify `src/components/MountainBoard.jsx`**

Apply Rules 1-3. File-specific notes:

- Line 242's `background: categoryFilter === key ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.04)"` and line 269's `rgba(56,189,248,0.3)` are hardcoded Blizzard accents — replace them with `var(--color-accent-glow)` so the selected filter follows the theme; the inactive branches are `var(--overlay-04)` and `var(--overlay-05)`.
- Line 293's `background: "var(--gradient-primary)", color: "white"` → `var(--color-on-accent)`.
- Line 30's `safety: "var(--color-danger)"` already uses a token that now has a light value; leave it.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 5: Retrofit and verify `src/components/ActivityFeed.jsx`**

Apply Rules 1-3. File-specific notes: line 381's `background: "var(--color-danger)", color: "white"` is a filled danger button → `var(--color-on-accent)` (white on the light `--color-danger` `#B91C1C` is 6.47:1). Line 403's `background: "var(--gradient-primary)", color: "white"` → `var(--color-on-accent)`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 6: Retrofit and verify `src/components/ModerationQueue.jsx`**

Apply Rules 1-3. Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 7: Build and lint**

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint src/components/LeaderboardPage.jsx src/components/SkiBuddyBoard.jsx src/components/PostSkiBuddyForm.jsx src/components/MountainBoard.jsx src/components/ActivityFeed.jsx src/components/ModerationQueue.jsx`
Expected: no new problems beyond baseline.

- [ ] **Step 8: Commit**

```bash
git add src/components/LeaderboardPage.jsx src/components/SkiBuddyBoard.jsx src/components/PostSkiBuddyForm.jsx src/components/MountainBoard.jsx src/components/ActivityFeed.jsx src/components/ModerationQueue.jsx
git commit -m "refactor: tokenise Crew board colours for light mode"
```

- [ ] **Step 9: Click-test note**

Add: *"Light mode, Crew tab: the leaderboard (both board modes, every category chip, the powder-day toggle knob, your own highlighted row, the log-a-day sheet), the ski-buddy board with a post and a response, posting a new buddy request including its error state, the mountain board with each category filter selected, the activity feed with a comment thread and the report dialog, and (as an admin) the moderation queue."*

---

## Task 18: retrofit — Crew people and messaging

**Files:**
- Modify: `src/components/FriendsPage.jsx` (12 / 2 / 0)
- Modify: `src/components/FriendTagPicker.jsx` (3 / 0 / 0)
- Modify: `src/components/UserProfileModal.jsx` (10 / 4 / 2)
- Modify: `src/components/MessagingCenter.jsx` (4 / 1 / 2)
- Modify: `src/components/DirectMessageView.jsx` (6 / 2 / 0)
- Modify: `src/components/SkiPingModal.jsx` (23 / 1 / 0)
- Modify: `src/components/NudgeDetailsModal.jsx` (5 / 1 / 1)

**Interfaces:**
- Consumes: every token from Tasks 2, 3 and 4.
- Produces: nothing.

- [ ] **Step 1: Retrofit and verify `src/components/FriendsPage.jsx`**

Apply Rules 1-3. Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 2: Retrofit and verify `src/components/FriendTagPicker.jsx`**

Apply Rules 1-3. Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 3: Retrofit and verify `src/components/UserProfileModal.jsx`**

Apply Rules 1-3. File-specific notes:

- Line 59's `background: "rgba(10,17,30,0.98)"` is the modal panel → `var(--color-modal-bg)`.
- Line 92's `background: "linear-gradient(135deg,rgba(30,58,95,0.75),rgba(8,17,30,0.95))"` is the header banner behind the avatar — not a photo, a decorative gradient → replace the whole value with `var(--gradient-bg)`, which is per-theme and per-mode.
- Line 179's `background: "var(--gradient-cta)", color: "white"` → `var(--color-on-accent)`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 4: Retrofit and verify `src/components/MessagingCenter.jsx`**

Apply Rules 1-3. File-specific notes:

- Line 141's `background: "rgba(4,8,20,0.85)"` — check whether the element carries `position: "fixed", inset: 0`. On mobile this component renders full-screen, so it is a **panel**, not a backdrop: use `var(--color-modal-bg)`.
- Line 176's `color: active ? "var(--color-bg)" : "rgba(255,255,255,0.6)"` — the active branch already inverts against `var(--color-accent)` and needs no change; the inactive branch is `var(--ink-60)`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 5: Retrofit and verify `src/components/DirectMessageView.jsx`**

Apply Rules 1-3. File-specific note: line 99 is Rule 2's primary worked example — copy the AFTER line verbatim.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 6: Retrofit and verify `src/components/SkiPingModal.jsx`**

Apply Rules 1-3. File-specific note: line 186's `color: selected.size > 0 ? "#fff" : "rgba(255,255,255,0.35)"` — the enabled branch sits on an accent-filled send button → `var(--color-on-accent)`; the disabled branch is `var(--ink-35)`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 7: Retrofit and verify `src/components/NudgeDetailsModal.jsx`**

Apply Rules 1-3. File-specific note: line 109's `background: "rgba(4,8,15,0.85)"` on a `position: "fixed", inset: 0` element is a backdrop → `var(--scrim)`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 8: Build and lint**

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint src/components/FriendsPage.jsx src/components/FriendTagPicker.jsx src/components/UserProfileModal.jsx src/components/MessagingCenter.jsx src/components/DirectMessageView.jsx src/components/SkiPingModal.jsx src/components/NudgeDetailsModal.jsx`
Expected: no new problems beyond baseline.

- [ ] **Step 9: Commit**

```bash
git add src/components/FriendsPage.jsx src/components/FriendTagPicker.jsx src/components/UserProfileModal.jsx src/components/MessagingCenter.jsx src/components/DirectMessageView.jsx src/components/SkiPingModal.jsx src/components/NudgeDetailsModal.jsx
git commit -m "refactor: tokenise Crew people and messaging colours for light mode"
```

- [ ] **Step 10: Click-test note**

Add: *"Light mode: the Friends list with a pending request, the friend-tag picker, a friend's mini profile modal (its header banner especially), the messaging centre on both mobile and desktop widths, a DM thread with your own bubble beside theirs, the ski-ping composer with nobody selected and with two people selected, and a nudge details sheet."*

---

## Task 19: retrofit — Profile screens

**Depends on Task 6 having landed**, because Task 6 rewrites the Appearance card with raw colour literals that this task then tokenises. This is the one ordering dependency between retrofit tasks; do not run Task 19 in parallel with Task 6.

**Files:**
- Modify: `src/components/ProfilePage.jsx` (43 / 14 / 0, plus the literals Task 6 added)
- Modify: `src/components/ProfileStats.jsx` (10 / 2 / 0)
- Modify: `src/components/profile/ProfileSettingsList.jsx` (7 / 6 / 0)
- Modify: `src/components/profile/ProfileStatStrip.jsx` (6 / 1 / 0)
- Modify: `src/components/profile/SettingsSheet.jsx` (3 / 1 / 0)

**Interfaces:**
- Consumes: every token from Tasks 2, 3 and 4; the Appearance card markup from Task 6.
- Produces: nothing.

- [ ] **Step 1: Retrofit `src/components/ProfilePage.jsx`**

Apply Rules 1-3. File-specific notes:

- **`SKILL_OPTIONS` at lines 26-32 is exception E2 and is NOT touched.** That includes line 29's `color: "rgba(255,255,255,0.9)"` for the "Black" skill level, which is a data value feeding alpha-suffix template strings, not a style. It is the one surviving white-alpha literal in this file.
- Lines 799-803 are Rule 1's first worked example — copy the AFTER block exactly.
- Line 440's loading state `color: "rgba(255,255,255,0.35)"` → `var(--ink-35)`.
- Line 469's `sectionLabelStyle` `color: "rgba(255,255,255,0.4)"` → `var(--ink-40)`. One substitution, every section heading on the page.
- Line 673's `color: profileTab === key ? "white" : "rgba(255,255,255,0.5)"` sits on `rgba(255,255,255,0.12)` glass, **not** an accent → `var(--color-text-1)` and `var(--ink-50)`.
- Line 765's `background: "var(--gradient-cta)", color: "white"` → `var(--color-on-accent)`.
- The Appearance-card markup Task 6 wrote: `rgba(255,255,255,0.03)` → `var(--overlay-03)`, `rgba(255,255,255,0.08)` → `var(--overlay-08)` (twice, once for the card border and once for the hairline divider), `rgba(255,255,255,0.06)` → `var(--overlay-06)` (the mode toggle's track), `color: "white"` → `var(--color-text-1)` (twice, for the "Theme" and "Appearance" labels), and `color: active ? "var(--color-bg)" : "rgba(255,255,255,0.5)"` → the inactive branch becomes `var(--ink-50)`. Leave `active ? "var(--color-bg)"` alone: it already inverts against `var(--color-accent)` in both modes.

- [ ] **Step 2: Verify `ProfilePage.jsx`**

Run G1 on `src/components/ProfilePage.jsx`. Expected: **1** — and it must be line 29, inside `SKILL_OPTIONS`. Run `grep -n "rgba(255, *255, *255" src/components/ProfilePage.jsx` and confirm the single hit is that line.
Run G2. Expected: **0**.
Run G3. Expected: **0**.

- [ ] **Step 3: Retrofit and verify `src/components/ProfileStats.jsx`**

Apply Rules 1-3. File-specific notes: line 27's inactive toggle `background: "rgba(255,255,255,0.06)"` → `var(--overlay-06)`; line 125's `borderTop: "1px solid rgba(255,255,255,0.05)"` → `var(--overlay-05)`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 4: Retrofit and verify `src/components/profile/ProfileSettingsList.jsx`**

Apply Rules 1-3. Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 5: Retrofit and verify `src/components/profile/ProfileStatStrip.jsx`**

Apply Rules 1-3. Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 6: Retrofit and verify `src/components/profile/SettingsSheet.jsx`**

Apply Rules 1-3. Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 7: Build and lint**

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint src/components/ProfilePage.jsx src/components/ProfileStats.jsx src/components/profile`
Expected: no new problems beyond baseline.

- [ ] **Step 8: Commit**

```bash
git add src/components/ProfilePage.jsx src/components/ProfileStats.jsx src/components/profile
git commit -m "refactor: tokenise Profile screen colours for light mode"
```

- [ ] **Step 9: Click-test note**

Add: *"Light mode, Profile: hero, both stat strips, the season/all-time toggle, the season grid, the Appearance card (both rows, and the skill-level picker in Edit Profile — its five colour chips are deliberately untokenised and must still look right), the Season Passes pills, the Vehicle card, all five settings rows and their sheets, and the history list. Then view a friend's profile in light mode and confirm the Appearance card is absent."*

---

## Task 20: retrofit — onboarding and integrations

**Files:**
- Modify: `src/components/ProfileSetup.jsx` (27 / 10 / 1)
- Modify: `src/components/OnboardingFlow.jsx` (31 / 11 / 1)
- Modify: `src/components/StravaConnect.jsx` (7 / 3 / 0)
- Modify: `src/components/StravaSyncReview.jsx` (7 / 3 / 0)
- Modify: `src/components/VerificationUpgradeModal.jsx` (15 / 6 / 1)

**Interfaces:**
- Consumes: every token from Tasks 2, 3 and 4.
- Produces: nothing.

**Reminder from the Global Constraints:** `ProfileSetup.jsx` and `OnboardingFlow.jsx` are colour-retrofitted here and **are not** migrated to `buildProfileUpdate()`. Do not touch their profile write paths.

- [ ] **Step 1: Retrofit and verify `src/components/ProfileSetup.jsx`**

Apply Rules 1-3. File-specific notes:

- **`SKILL_OPTIONS` at line 17 is exception E2** — the hex values in it feed alpha-suffix template strings at lines 311 and 314 (`` `${color}55` ``, `` `${color}18` ``). Leave the array alone. It contains no `rgba(255,255,255,x)` literal, so this file's G1 still expects 0; only the hexes are protected.
- Lines 293, 311, 331 mix a template-literal accent with white literals; only the white literals change.
- Line 367's `color: vehicleSeats === 0 ? "rgba(255,255,255,0.25)" : "white"` is on a glass row → `var(--ink-25)` and `var(--color-text-1)`.
- Lines 249 and 390 are `background: "var(--gradient-cta)", color: "white"` → `var(--color-on-accent)`. Line 390's disabled branch `background: loading ? "rgba(255,255,255,0.1)"` is `var(--overlay-10)`, so split the colour: `color: loading ? "var(--ink-45)" : "var(--color-on-accent)"`.
- Line 383's `background: ... ? "rgba(34,197,94,0.08)" : "rgba(244,63,94,0.08)"` are status tints → `var(--color-success-bg)` and `var(--color-danger-bg)`, both of which now have light values.
- Its one dark literal is a `rgba(...)` inside the same success/danger area — classify it with Rule 3 and, if it is neither backdrop nor panel nor ring, leave it and record it in Step 2's expected count.

Run G1 and G2. Expected: **0** and **0**.
Run G3. Expected: **0**.

- [ ] **Step 2: Retrofit and verify `src/components/OnboardingFlow.jsx`**

Apply Rules 1-3. File-specific notes:

- Line 24's `const overlay = { position: "fixed", inset: 0, background: "rgba(4,8,15,0.94)" ... }` is a full-screen backdrop at alpha 0.94 → `var(--scrim-strong)`. Its existing comment `/* --color-bg at 0.94 opacity */` becomes wrong — replace it with `/* --scrim-strong */`.
- Line 110's `background: active ? "rgba(96,165,250,0.14)" : "rgba(255,255,255,0.04)"` — the active branch is a hardcoded Blizzard blue → `var(--color-accent-dim)`; the inactive is `var(--overlay-04)`.
- Line 159's error card `background: "rgba(244,63,94,0.1)"` → `var(--color-danger-bg)`.
- Line 162's save button: `background: saving ? "rgba(255,255,255,0.08)" : "var(--gradient-primary)"` → `var(--overlay-08)`, and `color: saving ? "rgba(255,255,255,0.4)" : "white"` → `saving ? "var(--ink-40)" : "var(--color-on-accent)"`.
- Line 307's step dots `background: i <= ... ? "var(--color-accent-soft)" : "rgba(255,255,255,0.15)"` → `var(--overlay-15)`.
- Lines 56 and 262 are `background: "var(--gradient-primary)", color: "white"` → `var(--color-on-accent)`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 3: Retrofit and verify `src/components/StravaConnect.jsx`**

Apply Rules 1-3. File-specific note: Strava's brand orange (`#FC4C02` or similar) is a brand colour, not a theme colour — if you find one, leave it. It matches none of the three rules.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 4: Retrofit and verify `src/components/StravaSyncReview.jsx`**

Apply Rules 1-3. File-specific note: line 128's `background: "var(--gradient-cta)", color: "white"` → `var(--color-on-accent)`. Line 121's error `color: "var(--color-danger)"` already uses a token with a light value; leave it.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 5: Retrofit and verify `src/components/VerificationUpgradeModal.jsx`**

Apply Rules 1-3. File-specific notes:

- Line 103's `background: "rgba(4,8,15,0.85)"` on a fixed full-screen element is a backdrop → `var(--scrim)`.
- Lines 216 and 244 are `background: busy ? "rgba(255,255,255,0.1)" : "var(--gradient-cta)"` → `var(--overlay-10)`, with the same colour split as elsewhere: `color: busy ? "var(--ink-45)" : "var(--color-on-accent)"`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 6: Build and lint**

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint src/components/ProfileSetup.jsx src/components/OnboardingFlow.jsx src/components/StravaConnect.jsx src/components/StravaSyncReview.jsx src/components/VerificationUpgradeModal.jsx`
Expected: no new problems beyond baseline.

- [ ] **Step 7: Commit**

```bash
git add src/components/ProfileSetup.jsx src/components/OnboardingFlow.jsx src/components/StravaConnect.jsx src/components/StravaSyncReview.jsx src/components/VerificationUpgradeModal.jsx
git commit -m "refactor: tokenise onboarding and integration colours for light mode"
```

- [ ] **Step 8: Click-test note**

Add: *"Light mode: run the onboarding flow start to finish (every step, the step dots, the skill picker, the pass pills, an error state, the saving state), the profile setup screen including the seat stepper at zero, the Strava connect card, a Strava sync review, and the verification upgrade modal mid-save. Note that onboarding normally runs before a profile exists, so it will be dark for a genuinely new user — force it by setting `pd_theme_mode` to `light` first."*

---

## Task 21: retrofit — Track and session

**Files:**
- Modify: `src/components/TrackScreen.jsx` (3 / 2 / 1)
- Modify: `src/components/ActiveSessionBar.jsx` (18 / 7 / 2)
- Modify: `src/components/SkiCheckInForm.jsx` (18 / 6 / 0)
- Modify: `src/components/SessionRecapModal.jsx` (21 / 11 / 1)
- Modify: `src/components/SessionEditForm.jsx` (5 / 2 / 0)
- Modify: `src/components/SessionStatsForm.jsx` (3 / 2 / 0)
- Modify: `src/components/SkiDayDetailsForm.jsx` (7 / 4 / 0)

**Interfaces:**
- Consumes: every token from Tasks 2, 3 and 4.
- Produces: nothing.

- [ ] **Step 1: Retrofit and verify `src/components/TrackScreen.jsx`**

Apply Rules 1-3. File-specific note: line 29's `color: "var(--color-success)"` already uses a token that gained a light value in Task 3; leave it.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 2: Retrofit and verify `src/components/ActiveSessionBar.jsx`**

Apply Rules 1-3. File-specific notes:

- Lines 176 and 356 are `background: "rgba(4,8,15,0.96)"` and `"rgba(4,8,15,0.92)"` on a fixed bar → both become `var(--color-nav-bg)` per Rule 3.
- Line 301's `background: "white"` is the sliding knob on a coloured track → `var(--color-on-accent)`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 3: Retrofit and verify `src/components/SkiCheckInForm.jsx`**

Apply Rules 1-3. File-specific note: line 292's `rgba(255,255,255,0.12)` sits in a ternary whose other branch is an accent — read which property it lands in before choosing `--overlay-12`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 4: Retrofit and verify `src/components/SessionRecapModal.jsx`**

Apply Rules 1-3. File-specific notes:

- Line 187's `background: "rgba(4,8,15,0.85)"` on a fixed full-screen element is a backdrop → `var(--scrim)`.
- Lines 309 and 434's `color: "var(--color-danger)"` already use a token with a light value; leave them.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 5: Retrofit and verify `src/components/SessionEditForm.jsx`**

Apply Rules 1-3. Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 6: Retrofit and verify `src/components/SessionStatsForm.jsx`**

Apply Rules 1-3. File-specific note: line 53's `background: "var(--gradient-cta)", color: "white"` → `var(--color-on-accent)`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 7: Retrofit and verify `src/components/SkiDayDetailsForm.jsx`**

Apply Rules 1-3. File-specific notes:

- Line 256's `color: full ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.75)"` → `var(--ink-30)` and `var(--ink-75)`.
- Lines 219 and 241's `background: "var(--color-danger)"` are filled remove buttons; any `"white"` glyph on them becomes `var(--color-on-accent)`.
- Line 309's `background: "var(--gradient-cta)", color: "white"` → `var(--color-on-accent)`.

Run G1, G2, G3. Expected: **0**, **0**, **0**.

- [ ] **Step 8: Build and lint**

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint src/components/TrackScreen.jsx src/components/ActiveSessionBar.jsx src/components/SkiCheckInForm.jsx src/components/SessionRecapModal.jsx src/components/SessionEditForm.jsx src/components/SessionStatsForm.jsx src/components/SkiDayDetailsForm.jsx`
Expected: no new problems beyond baseline.

- [ ] **Step 9: Commit**

```bash
git add src/components/TrackScreen.jsx src/components/ActiveSessionBar.jsx src/components/SkiCheckInForm.jsx src/components/SessionRecapModal.jsx src/components/SessionEditForm.jsx src/components/SessionStatsForm.jsx src/components/SkiDayDetailsForm.jsx
git commit -m "refactor: tokenise Track and session colours for light mode"
```

- [ ] **Step 10: Click-test note**

Add: *"Light mode: start a session from the Track screen, check the active session bar (both its collapsed and expanded states, and its toggle knob), the check-in form, end the session and go through the recap modal including photo upload and its error state, then edit a logged session and add day details with a photo and a friend tag."*

---

## Task 22: whole-app verification gate and the click-test list

The last task. It proves the retrofit is complete, that dark mode did not regress, and it hands Kyle a single ordered list of things to click.

**Files:**
- Modify: none, unless a check below fails.

**Interfaces:**
- Consumes: everything from Tasks 1-21.
- Produces: the click-test list.

- [ ] **Step 1: Prove Rule 1 is complete app-wide**

Run: `grep -rn "rgba(255, *255, *255" src`

Expected: exactly **2** lines, and they must be:
- `src/components/ProfilePage.jsx:29` — `SKILL_OPTIONS`' "Black" entry, exception E2.
- `src/lib/shareCardTokens.test.js:38` — the `rgba()` helper's assertion, exception E1.

Any third line is an unfinished retrofit. Fix it in whichever task owns that file and re-run.

- [ ] **Step 2: Prove Rule 2 is complete app-wide**

Run: `grep -rnE "(\"white\"|'white'|\"#fff\"|'#fff'|\"#ffffff\"|'#ffffff')" src`

Expected: exactly **3** lines:
- `src/components/ShareStatCard.jsx:115` — the canvas avatar initials on the accent gradient (Task 8 Step 4).
- `src/lib/shareCardTokens.js` — the `ink: "#ffffff"` field on the five dark theme objects. **That is 5 lines, not 1**, so the real expected total is **7**: 1 canvas literal, 5 `ink` fields, 1 test assertion (`shareCardTokens.test.js:38`).

Restate: expected **7** lines total. Read each one and confirm it is on that list before moving on.

- [ ] **Step 3: Prove Rule 3 is complete app-wide**

Run: `grep -rnE "rgba\((2|3|4|5|6|8|10|12|15|16|20|30|71), ?[0-9]{1,2}, ?[0-9]{1,3}, ?[0-9.]+\)" src`

Expected: exactly **26** lines, every one of them on the E3 photo-overlay list or a token definition:
- `src/index.css` — 10 lines: `--color-nav-bg` and `--color-badge-border` in `:root` and in each of the 4 dark theme blocks (8), plus the 3 `--scrim*` definitions... which is 11. Count what you actually get and confirm every hit is a **token definition**, not a rule body.
- `src/components/TripDetailModal.jsx:57-63` — 7 lines, the `THEME` table.
- `src/components/TodayScreen.jsx` — 6 lines: 131, 137, 140, 142, 143, 257.
- `src/components/TripCard.jsx:238` — 1 line.
- `src/components/CreateTripModal.jsx:269` and `:314` — 2 lines.
- `src/components/ui/HeroPhotoHeader.jsx:10` and `src/components/ui/HeroBannerStrip.jsx:10` — 2 lines.
- `src/components/ShareStatCard.jsx:181-183` — 3 lines.
- `src/components/FriendsGoingBadge.jsx:41` — 1 line.

The exact total will shift by a line or two depending on how `index.css`'s token definitions land. **The rule is not the number: it is that every surviving hit must be traceable to the E3 list or to a token definition.** Read them all.

- [ ] **Step 4: Prove no `prefers-color-scheme` crept in**

Run: `grep -rn "prefers-color-scheme" src index.html`
Expected: **0 matches**.

- [ ] **Step 5: Prove the token vocabulary is consistent**

Run: `grep -rho -- "--ink-[0-9]*" src | sort -u`
Expected: only names from Rule 1's `--ink-*` list. A `--ink-4` or `--ink-045` means a typo that silently resolves to nothing and renders the element's inherited colour.

Run: `grep -rho -- "--overlay-[0-9]*" src | sort -u`
Expected: only names from Rule 1's `--overlay-*` list.

Cross-check both against `src/index.css`: every name used in `src/components` or `src/App.jsx` must also appear as a declaration in `index.css`. A quick way: for each name the two commands print, run `grep -c -- "<name>:" src/index.css` and expect **2** (one dark declaration, one light).

- [ ] **Step 6: Prove the test suite and lint are at or better than baseline**

Run: `npm test`
Expected: `tests 304`, `pass 304`, `fail 0`.

Run: `npx eslint .`
Expected: **85 problems (78 errors, 7 warnings)** or fewer. Not more.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Prove dark mode is byte-stable where it should be**

Run: `git diff b52cc49 --stat -- src/index.css`

Read the diff and confirm the only *edits* to pre-existing lines are the ones Task 4 made (the six nav declarations, the ten `--color-surface`/`-hover` values, `--season-grid-tier-0`, `.snowflake`, the two `a` rules, the `button` reset, the two scrollbar rules, `.resort-card:hover`, `.sheet-handle`, `.notif-item:hover`, the two `.texture-*` rules, and `:root`'s `color`/`background-color`). Everything else must be an insertion.

- [ ] **Step 8: Commit the verification pass if anything was fixed**

```bash
git add -A
git commit -m "fix: close the last colour-literal gaps found by the whole-app verification sweep"
```

If nothing needed fixing, skip this step — there is nothing to commit.

---

- [ ] **Step 9: Assemble the click-test list for Kyle**

Every retrofit task added a line to this list. Collect them into one ordered document and hand it over. It should read roughly as below — replace any line whose task deviated.

**Before you start:** run `migrations/048_theme_mode.sql` in the Supabase SQL editor and then `NOTIFY pgrst, 'reload schema';`. Then sign in, go to **Profile > Appearance**, and flip to **Light**.

**A. Dark mode first — this branch changed dark mode in four small, deliberate ways.**

1. In each of Alpine Dawn, Storm Chaser, Aurora Peak and Base Lodge: the top nav, mobile top bar and bottom nav should now match that theme's own background instead of Blizzard's blue-black, and links should match the theme's accent. This is a fix for a bug that shipped with the theme system.
2. Body text that used to be pure white is now each theme's near-white tint. It should read as *more* consistent, not less. If you hate it, say so — it is a one-line rollback.
3. Modal backdrops are all one of three dim levels now instead of seven slightly different ones.
4. Modal and sheet panels are fully opaque and take their theme's hue.

**B. Light mode, screen by screen.**

5. **Shell:** top nav, mobile top bar, bottom nav, the unread badges on the bell and on the bottom-nav tabs, the notification dropdown, the default no-photo avatar.
6. **Today:** card view, list view, an expanded resort row, map view and a marker popup, the Today's Crew strip, a nudge banner, the events widget. *The resort hero photo keeps its dark gradient and white chips — correct.*
7. **Shared primitives:** any card, a tier badge and a risk badge (check all six rating colours), a stat strip, a score ring, an initials avatar, a primary button, the resort picker, the GIF picker, the photo message composer.
8. **Plans:** the plan list, both sub-tabs, the month calendar with today and a weekend visible, a day with a plan, the plan editor, the date matchmaker, the friends calendar, the Profile season grid (all five heat tiers must still be ordered and distinguishable).
9. **Trips:** create a trip end to end including the resort photo picker and the theme picker; then a trip card in the list, its avatar stack, the "Who's going" badge in both variants, and trip chat with your bubble beside someone else's.
10. **Trip detail:** header, all seven cosmetic trip themes, going/maybe/out chips, date-vote rows, car seats, packing list, chat tab, edit sheet. *The densest screen in the app — spend the longest here.*
11. **Crew chat:** crew list, an open chat, the member avatar stack with a +N disc, the invite sheet, create-crew mid-save, a pending invite.
12. **Crew boards:** leaderboard in both modes with every category chip, the powder-day toggle knob, your highlighted row, the log-a-day sheet; the ski-buddy board with a post and a response; posting a buddy request including its error state; the mountain board with each filter selected; the activity feed with a comment thread and the report dialog.
13. **Crew people:** friends list with a pending request, the tag picker, a friend's mini profile modal (its header banner especially), the messaging centre at mobile and desktop widths, a DM thread, the ski-ping composer with nobody and with two people selected, a nudge sheet.
14. **Profile:** hero, both stat strips, the season/all-time toggle, the season grid, the Appearance card (both rows), Edit Profile's skill picker (its five colour chips are deliberately untokenised — confirm they still look right), Season Passes pills, Vehicle card, all five settings rows and their sheets, the history list. Then a friend's profile — the Appearance card must be absent.
15. **Share card:** Profile > Create share card, in all 5 themes. Light background, dark text, visible mountains and snowflakes, a themed Share button. Then a session card from a resort with a hero photo — that one stays dark with white text in both modes, by design.
16. **Onboarding and integrations:** force light mode first (`localStorage.setItem("pd_theme_mode","light")`), then run onboarding start to finish, the profile setup screen with the seat stepper at zero, the Strava connect card, a sync review, the verification upgrade modal mid-save.
17. **Track and session:** start a session, the active session bar collapsed and expanded plus its toggle knob, the check-in form, end the session and go through the recap including a photo upload and its error state, edit a logged session, add day details with a photo and a friend tag.
18. **Auth:** sign out while in light mode. The landing page, sign-in panel and sign-up form render **dark**, because a signed-out visitor has no `data-mode`. Confirm nothing looks half-light.

**C. The two things most likely to be wrong.**

19. **Anything you can barely read.** The `--ink-20` to `--ink-40` steps are deliberately below the 4.5:1 line in both modes, matching how dark mode already looks. If a specific caption is worse in light than in dark, that is a bug — tell us the screen.
20. **Anything that stayed dark.** A black panel, a black chip or dark ring on a light page is a missed Rule 3 substitution. Screenshot it; the fix is one line.

- [ ] **Step 10: Commit the click-test list**

Save it wherever the project keeps handoff notes and commit:

```bash
git add -A
git commit -m "docs: light/dark mode click-test list"
```

---

## Self-Review

**1. Spec coverage.** Every section of `docs/superpowers/specs/2026-09-10-light-dark-mode-design.md` maps to a task:

| Spec item | Task |
|---|---|
| Decision 1 — all 5 cosmetic themes get a light variant (10 palettes) | 3 (Steps 1, 3, 4, 5, 6) |
| Decision 2 — manual toggle only, no `prefers-color-scheme` | 5, 6; enforced by Global Constraints and Task 22 Step 4 |
| Decision 3 — default mode is dark for everyone | 1 (Step 6), 5 (Steps 1, 2); enforced by Global Constraints |
| Data model — `profiles.theme_mode`, `'dark'` \| `'light'`, default `'dark'` | 1 (Step 7) |
| Write path through `buildProfileUpdate()` / `PROFILE_WRITE_FIELDS` | 1 (Steps 1-4), audited in 1 (Step 8) |
| `ProfileSetup.jsx` / `OnboardingFlow.jsx` deferral stays deferred | Global Constraints; colour-only work in 20 |
| CSS architecture — orthogonal `[data-mode="light"]` on `<html>` | 2 (Step 2), 3; Deviation 1 covers the Blizzard selector |
| Each light block redefines the full visually-relevant token set | 3 (Steps 1, 3, 4, 5, 6) — 32 tokens per palette |
| Theme-invariant tokens keep their meaning across modes | Deviation 2 and 3 (Step 2) — invariant across themes, variant across modes |
| `color-scheme` becomes mode-conditional | 2 (Step 2) |
| ProfilePage toggle beside the theme swatches, same optimistic pattern | 6 |
| `shareCardTokens.js` gains 5 light objects, consumed via `profile.theme_mode` | 7, 8 |
| Contrast audit repeated against all 5 light palettes | Appendix A (A.1-A.6), applied in 3 and 7 |
| Scope — `index.css`, `ProfilePage`, `shareCardTokens`, one migration, and every file hardcoding white | 2, 3, 4 / 6 / 7 / 1 / 8-21 |
| Testing — `theme_mode` unit-tested; CSS and canvas verified by grep, build and click-through | 1 (Steps 1-4), 7 (Steps 1, 7); Global Constraints; 22 |

**Gaps found and closed while writing this plan:** the spec's Blizzard-light selector would not have matched a signed-out `<html>` (Deviation 1); the spec's "theme-invariant tokens stay invariant across modes" would have shipped 2.2:1 danger text at 64 call sites (Deviation 2); the spec did not count the ~62 hardcoded *dark* literals that keep every modal black in light mode (Deviation 3); the briefing's file inventory was short by 15 files (Verified #5); a naive same-alpha mirror of the muted-text ramp would have shipped `--ink-45` at 2.9:1 instead of 4.47:1 (Appendix A.2); `--color-accent-soft` is used as body text 46 times and could not be a pale tint (Appendix A.4 note 3); `.top-nav` / `.mobile-top-bar` / `.bottom-nav` turned out to be a live dark-mode bug rather than just a light-mode blocker (Verified #4, Task 4 Step 6); and `renderCard` already owns the identifier `mode`, which would have been silently shadowed (Verified #12, Task 8).

**2. Placeholder scan.** `grep -n "TBD\|TODO\|implement later\|fill in details\|Similar to Task\|appropriate error handling"` over this file returns nothing. Every hex, every alpha, every token name and every code block is the literal thing to type. The two deliberately-wrong token names in Task 22 Step 5 (`--ink-4`, `--ink-045`) are examples of typos to look for, labelled as such.

**3. Type and naming consistency.** Cross-checked across all 22 tasks:

- The `--overlay-*` set used anywhere in this plan is exactly the 21 names declared in Task 2 Steps 1 and 2 and listed in Rule 1. The `--ink-*` set is exactly the 29 names declared in Task 2 Steps 1 and 3 and listed in Rule 1. No task references a name outside those lists.
- `--color-on-accent` (58 references), `--scrim-soft` / `--scrim` / `--scrim-strong`, `--color-button-reset-bg`, `--color-snowflake`, `--shadow-card-hover`, `--color-scrollbar-thumb`, `--color-scrollbar-thumb-hover` are each spelled one way everywhere, and each is declared in Task 4 Step 1 before any task consumes it.
- `getShareCardTheme(themeKey, mode = "dark")`, `inkAlpha(darkAlpha, mode = "dark")` and `overlayAlpha(darkAlpha, mode = "dark")` are defined in Task 7 Step 6, imported in Task 7 Step 1's test edit and Task 8 Step 1, and called in Task 8 Steps 3, 5 and 7 with exactly those argument orders.
- The theme object's new field is `ink` in Task 7 Steps 3 and 4 and in every Task 8 call site. It is never `inkColor` or `textInk`.
- `theme_mode` (snake case, matching the column) is the profile field everywhere; `themeMode` (camel case) is the local variable in `ShareStatCard.jsx`; `modeKey` is the parameter of `handleSelectMode`. Three names, three scopes, never crossed.
- `pd_theme_mode` is the localStorage key in Task 5 Steps 1 and 2 and Task 6 Step 2, and in the click-test list. It is never `pd_mode`.
- `data-mode` is the attribute in `index.html`, `App.jsx`, `ProfilePage.jsx` and all five CSS selectors. `"light"` is the only value ever set; dark is the attribute's absence, stated in Task 5 Step 2, Task 6 Step 2 and Task 2 Step 2's comment.
- The five light background hexes (`#F2F7FC`, `#FDF8F0`, `#F0F6F6`, `#F8F5FE`, `#FDF6EF`) appear in Task 3 (CSS), Task 5 (the `theme-color` meta, Blizzard only), Task 7 (the JS mirror, lowercased) and Appendix A. Task 7 Step 8 is the cross-check that keeps the CSS and the JS from drifting.
- The three verification greps are named G1, G2 and G3 once, before Task 9, and referenced by those names in every retrofit task.

**4. Sequencing.** Task 1 is independent. Tasks 2, 3 and 4 are strictly ordered (4 consumes 3 consumes 2). Task 5 depends on 1. Task 6 depends on 1 and 5. Task 7 depends on 3 (it copies its hexes). Task 8 depends on 7. Tasks 9-21 all depend on 4 and are otherwise independent of each other, **except** Task 19, which must land after Task 6. Task 22 depends on everything. Every task ends with a working app and a commit.

---

## Open judgment calls for Kyle

Eight decisions that are defensible but could reasonably go the other way. None of them blocks starting; all of them are cheap to change while the branch is open.

1. **Alpine Dawn light is warm cream (`#FDF8F0`), which inverts its dark theme's logic.** Alpine Dawn dark is deliberately a *cool* navy background under a *warm* amber accent — "pre-dawn sky". Its light twin does the opposite: warm paper under the same amber. The alternative (cool paper, warm accent, a literal inversion) reads as generic and loses the theme's identity. **Confidence: medium.** This is the one palette decision that is aesthetic rather than arithmetic.

2. **`--color-accent: #B45309` for Alpine Dawn light scores 4.75:1** — the tightest of the five accents, and Base Lodge's `--color-accent-2` / `--color-accent-teal` (`#B45309` again) score 4.69:1 on Base Lodge's slightly brighter paper. All pass, but with less headroom than the others (Blizzard 5.51, Storm Chaser 5.01, Aurora Peak 6.48). If Kyle wants margin, `#92400E` takes Alpine Dawn to 6.71 at the cost of looking browner than amber. **Confidence: medium.**

3. **`--rating-gold: #854D0E` reads brown rather than gold.** The more literally golden `#A16207` scores 4.51 on Storm Chaser's background — technically passing, practically on the line. Since the rating scale's whole job is to be an ordered, distinguishable heat scale, I took the safe contrast. If the badge row looks muddy, `#A16207` is the swap. **Confidence: medium.**

4. **`--color-accent-soft` equals `--color-accent` in all five light palettes.** Forced by that token being used as body text at 46 call sites: the light-mode "soft" step has to be the lightest shade that still clears 4.5:1, which is the accent. The soft/strong/deep ladder still ascends. It does mean light mode has one fewer distinct accent step than dark mode. **Confidence: high that it is correct, medium that Kyle will like it.**

5. **Literal `white` becomes `var(--color-text-1)`, which shifts ~230 dark-mode text sites from `#ffffff` to each theme's near-white tint.** Deviation 4 item 1. Rollback is one line (`--color-text-1: #ffffff` in `:root`), not 230. Flagged first on the click-test list because it is the change most likely to get an immediate reaction. **Confidence: high.**

6. **Scrims normalise from seven ad-hoc alphas to three named steps.** Up to a 0.06 alpha shift on some backdrops in dark mode. The alternative is seven scrim tokens, which is more faithful and more clutter. **Confidence: high.**

7. **The `--ink-20` through `--ink-40` steps stay below 4.5:1 in both modes.** They are below it in dark mode today, at roughly 300 call sites, and raising them is a real design change to the whole app rather than a mode toggle. Doing it inside this branch would make every retrofit diff unreviewable. **Recommend: a separate, small follow-up that raises the floor in both modes at once.** **Confidence: high that deferring is right.**

8. **File grouping: `src/components/ui/` is one task (Task 12) rather than distributed into the feature tasks that consume those primitives.** They are 13 small files with a huge blast radius, and reviewing `Card`, `Badge`, `Avatar` and `Button` together is worth one extra task boundary. The other grouping that could go either way is `SeasonCalendar.jsx`, which lives in Task 15 (calendars) even though it renders on the Profile page — it was grouped by what it *is* rather than where it *appears*. **Confidence: medium on both.**

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-10-light-dark-mode.md`. Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration. Tasks 9-18, 20 and 21 can be dispatched in parallel; Task 19 must wait for Task 6.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batching with checkpoints for review.

Which approach?
