# Sprint 9 — Landing Page & Onboarding Redesign

**Goal:** ROADMAP TASK 0.4 — bring `LandingPage.jsx` and `OnboardingFlow.jsx` onto the Blizzard design system (they currently use a completely different, uncoordinated color palette), update the hero/feature copy, and delete a confirmed piece of dead code along the way.
**Estimated effort:** 1–1.5 days
**Depends on:** Sprint 7 (design tokens) merged. Sprint 8 (UI component library) merged — `Card` and `Button` should be used for new/replaced elements in these two files rather than more one-off inline styles.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**The problem this sprint fixes:** `src/components/LandingPage.jsx` (556 lines) and `src/components/OnboardingFlow.jsx` (334 lines) were both built before (or never migrated to) the app's Blizzard theme tokens in `src/index.css`. A full-file read of both confirms **zero** usages of `var(--color-*)` in either file. Instead they hardcode a *different* navy/blue-teal palette:
- Background: `rgba(2,6,23,1)` (repeated 7+ times across both files) — this is visually close to but numerically distinct from the app's actual `--color-bg` token (`#04080f`).
- `OnboardingFlow.jsx`'s modal card background: solid `#0b1424` — distinct from `--color-bg-elevated` (`#060d1a`).
- Primary CTA gradient: `linear-gradient(135deg,#2563eb,#0891b2)` (blue→teal), repeated 7+ times in `LandingPage.jsx` and 2 times in `OnboardingFlow.jsx` — distinct from the app's actual `--color-accent` (`#38bdf8`, ice blue) used everywhere else (dashboard, trips, profile).
- `OnboardingFlow.jsx`'s final "Let's Ride" button breaks pattern entirely, using a green gradient `linear-gradient(135deg,#22c55e,#14b8a6)`.
- Text opacity scales use raw `rgba(255,255,255,0.4–0.9)` rather than the `--color-text-1`/`--color-text-2`/`--color-text-3` tokens.

**Known dead code:** `LandingPage.jsx` defines a `Nav` component that is never rendered — the actual nav bar is a second, separately inlined block at lines ~490–545. Delete the unused `Nav` definition in this sprint (S9-T3).

**Read both files in full before starting** — this plan gives you the exact recurring literal values to replace and where the structural sections are, but you need the full file content to make each specific edit; don't guess at surrounding JSX.

**`src/index.css` tokens available (from sprint 7):** `--color-bg`, `--color-bg-elevated`, `--color-surface`, `--color-border`, `--color-accent`, `--color-accent-dim`, `--color-text-1`, `--color-text-2`, `--color-text-3`, `--gradient-primary`, `--radius-card`, `--radius-button`, `--font-size-h1`, `--font-size-h2`, `--space-*`. Read the current exact value of `--gradient-primary` in `src/index.css` before starting S9-T1 — use `var(--gradient-primary)` as a CSS variable reference in all replacements below, do not hardcode a copied hex value, so the button/gradient recolors automatically if the token ever changes.

**`src/components/ui/Card.jsx` and `Button.jsx` (from sprint 8)** — use these for any card-shell or button element you're touching anyway in this sprint, instead of leaving a new one-off inline style. You are not required to refactor every element in these files to use them (that's a much bigger job), only the ones you're already editing for the color migration.

---

## Tasks

S9-T1 (LandingPage color migration) and S9-T2 (LandingPage copy) should be done together since they touch the same file — do S9-T1 first, then S9-T2 in the same pass. S9-T3 (delete dead Nav) can happen any time after S9-T1. S9-T4 (OnboardingFlow color migration) is independent of S9-T1–T3 and can be done in parallel by a different session, but do it after in a single-agent execution to avoid merge conflicts.

---

### S9-T1 — Migrate `LandingPage.jsx` to Blizzard tokens

**File to modify:** `src/components/LandingPage.jsx`

Replace every occurrence of these exact literal values with the corresponding token, preserving the surrounding style object structure (just swap the value):

| Current literal | Replace with |
|---|---|
| `rgba(2,6,23,1)` (background) | `var(--color-bg)` |
| `rgba(2,6,23,0.94)` or similar near-black overlay values, if found | `var(--color-bg)` at matching opacity, or `var(--color-bg-elevated)` for solid card backgrounds — use judgment based on whether it's a full-page background vs. an elevated card/overlay |
| `linear-gradient(135deg,#2563eb,#0891b2)` (every occurrence — 7+ in this file, including the `FEATURES` array accents, `navCta` style constant, hero CTA, `ClosingCTA` button) | `var(--gradient-primary)` |
| `rgba(255,255,255,0.9)` / `0.7` / `0.4` (text opacity scale) | `var(--color-text-1)` for the highest-opacity/primary text, `var(--color-text-2)` for secondary, `var(--color-text-3)` for the lowest-opacity/tertiary text — map by visual role, not by exact opacity number, since the token colors aren't pure white-with-opacity |

Do this as a careful pass through the whole file — `grep -n "2563eb\|0891b2\|rgba(2,6,23\|rgba(255,255,255,0\." src/components/LandingPage.jsx` first to get every line number, then edit each one, reading enough surrounding context per hit to pick the right token per the table above.

**Acceptance criteria:**
- `grep -c "2563eb\|0891b2" src/components/LandingPage.jsx` returns `0`.
- `grep -c "rgba(2,6,23" src/components/LandingPage.jsx` returns `0`.
- The page still renders with a dark background and a light-blue accent (visually similar to before, just now sourced from the same tokens as the rest of the app) — verify in browser per S9-T2's verification step (do both together).

---

### S9-T2 — Update hero and feature copy

**File to modify:** `src/components/LandingPage.jsx`

**Step 1 — Hero section.** Find the `Hero` component/section. Ensure it contains:
- The app name ("PowderDays")
- Tagline: **"Chase more powder days"** (exact copy from ROADMAP TASK 0.4) — update the existing tagline text to this if it currently says something else; read the current text first.
- A full-bleed mountain gradient background — if the hero doesn't currently have one, add a background using `var(--gradient-bg)` (the existing gradient token meant for large background surfaces) rather than inventing a new gradient.

**Step 2 — Feature highlights.** Find the `Features` section (uses a `FEATURES` array, each item with its own `accent` color — per S9-T1 those accents are now `var(--gradient-primary)` or should be varied using `var(--color-accent)`/`var(--color-accent-2)` for visual distinction between cards, your call based on how many feature cards exist). Ensure exactly these three pillars are represented (ROADMAP TASK 0.4 — "Feature highlights: Conditions · Crew Planning · Session Tracking"):
- **Conditions** — real-time powder scores across Colorado resorts
- **Crew Planning** — coordinate ski days with friends, RSVPs, trip chat
- **Session Tracking** — log your ski days, build a season passport

Read the current `FEATURES` array content first — if it already has 3+ items covering similar ground, retitle/reword the existing entries to match these three pillars rather than adding a 4th; if it has fewer or unrelated content, replace it with these three.

**Step 3 — Verify in browser:**
```bash
npm run dev
```
Open the landing page (log out if currently logged in, or open in an incognito window, so you land on `LandingPage.jsx` rather than the authenticated dashboard). Confirm: dark background matches the rest of the app's tone, buttons use the ice-blue accent, hero shows "Chase more powder days", and the features section shows Conditions / Crew Planning / Session Tracking.

**Step 4 — Build check:**
```bash
npm run build
```

**Step 5 — Commit:**
```bash
git add src/components/LandingPage.jsx
git commit -m "feat: migrate landing page to Blizzard theme tokens, update hero/feature copy"
```

---

### S9-T3 — Delete dead `Nav` component from `LandingPage.jsx`

**File to modify:** `src/components/LandingPage.jsx`

Find the `Nav` component definition (confirmed unused — the app's actual landing-page nav bar is a second, separately inlined block later in the same file, ~lines 490–545 pre-S9-T1). Before deleting, `grep -n "<Nav" src/components/LandingPage.jsx` to double-confirm it has zero render call sites in the current file (it may have shifted line numbers after S9-T1/T2 edits — re-check, don't rely on the pre-edit line numbers from this doc).

Delete the `Nav` function definition entirely.

**Acceptance criteria:**
- `grep -n "function Nav\|<Nav" src/components/LandingPage.jsx` returns zero matches for both patterns.
- `npm run build` still succeeds (confirms nothing else referenced it).

**Commit:**
```bash
git add src/components/LandingPage.jsx
git commit -m "chore: remove dead Nav component from LandingPage"
```

---

### S9-T4 — Migrate `OnboardingFlow.jsx` to Blizzard tokens

**File to modify:** `src/components/OnboardingFlow.jsx`

Same migration approach as S9-T1, applied to this file's specific literals:

| Current literal | Replace with |
|---|---|
| `rgba(2,6,23,0.94)` (the `overlay` background, full-screen backdrop) | `rgba(4,8,15,0.94)` — i.e. the same opacity, but sourced from `--color-bg`'s actual RGB (`#04080f` = `rgb(4,8,15)`). Since CSS custom properties can't have opacity appended via `var()` directly in this codebase's style-object convention, write the literal `rgba(4,8,15,0.94)` here with a comment `/* --color-bg at 0.94 opacity */` if the surrounding code is inline-style (not a `<style>` block) — check how other overlay opacities are handled elsewhere in the app (e.g. modal overlays in `TripDetailModal.jsx` or `CreateTripModal.jsx`) and match that convention exactly. |
| `#0b1424` (the `card` background) | `var(--color-bg-elevated)` |
| `linear-gradient(135deg,#2563eb,#0891b2)` (2 occurrences — `WelcomeStep` CTA line ~52, `ProfileStep` save button line ~158) | `var(--gradient-primary)` |
| `linear-gradient(135deg,#22c55e,#14b8a6)` (the `DoneStep` "Let's Ride" button, ~line 291) — **do not change this one.** It's an intentional celebratory green, distinct from the primary CTA gradient, marking the final "you're done" action. Leave it as-is; only migrate the surrounding text/background colors in `DoneStep` (`color: "#052e16"` etc. can stay paired with the green gradient since it's a deliberately distinct accent moment, not a stray inconsistency). |
| Skill-level option colors (`#22c55e`, `#60a5fa`, `rgba(255,255,255,0.9)`, `#f43f5e`, `#c084fc` in `SKILL_OPTIONS`) | **Leave unchanged.** These are semantic skill-level colors (green/blue/black/double-black/experts-only, matching ski-run difficulty rating colors), not design-system leaks — recoloring them would break the established ski-run-color convention users expect (green circle, blue square, black diamond, etc.), which is out of scope for a theme-token migration. |

**Acceptance criteria:**
- `grep -c "2563eb\|0891b2" src/components/OnboardingFlow.jsx` returns `0`.
- `grep -c "0b1424" src/components/OnboardingFlow.jsx` returns `0`.
- The `DoneStep` green gradient and the `SKILL_OPTIONS` difficulty colors are unchanged (verify via `git diff` shows no lines touched in those two spots).

**Verify in browser:**
```bash
npm run dev
```
Trigger the onboarding flow (new signup, or check `App.jsx` for how it's conditionally shown — likely gated on `!profile` — and temporarily force it if needed to preview, then revert any temporary force-flag before committing). Confirm the overlay/card backgrounds now match the app's dark tone, and the Welcome/Profile step CTAs use the ice-blue accent while the final "Let's Ride" button stays green.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add src/components/OnboardingFlow.jsx
git commit -m "feat: migrate onboarding flow to Blizzard theme tokens"
```

---

## Sprint Acceptance Criteria

- [ ] `LandingPage.jsx` has zero occurrences of `#2563eb`, `#0891b2`, or `rgba(2,6,23,*)` — all replaced with Blizzard tokens
- [ ] `LandingPage.jsx` hero shows "Chase more powder days" tagline
- [ ] `LandingPage.jsx` features section covers Conditions / Crew Planning / Session Tracking
- [ ] Dead `Nav` component removed from `LandingPage.jsx`
- [ ] `OnboardingFlow.jsx` has zero occurrences of `#2563eb`, `#0891b2`, or `#0b1424` — all replaced with Blizzard tokens, EXCEPT the intentional `DoneStep` green gradient and `SKILL_OPTIONS` difficulty colors, which are unchanged
- [ ] `npm run build` succeeds
- [ ] Both pages visually verified in the browser

## Out of Scope for This Sprint

- Restructuring the section order or layout of either file — this is a color/token + copy migration, not a layout redesign.
- Migrating `SKILL_OPTIONS`, `PASS_OPTIONS`, or `SPORT_OPTIONS` colors — those are semantic, not theme-related.
- Any change to `FriendsStep` logic (friend search/request sending) in `OnboardingFlow.jsx`.
- Using `Card`/`Button` from `src/components/ui/` for every element in these files — only where you're already touching a color value for the migration.
</content>
