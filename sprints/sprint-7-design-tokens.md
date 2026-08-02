# Sprint 7 — Design Tokens: Typography & Spacing Scale

**Goal:** Complete ROADMAP TASK 0.2 by adding a typography scale and a 4px-base spacing scale to the existing Blizzard CSS custom-property system in `src/index.css`. Establish the token convention other sprints should follow going forward.
**Estimated effort:** 0.5 day
**Depends on:** Nothing.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**Stack:** React 19 + Vite. Styling is 100% inline `style={{}}` objects in JSX — no CSS modules, no Tailwind, no styled-components. The one global stylesheet is `src/index.css`, which defines CSS custom properties on `:root` plus a handful of bare element rules (`h1`, `h2`, `body`) and utility classes (`.snowflake`, `.header-title`).

**What already exists in `src/index.css` (do not modify these, only add alongside them):**
- A "Blizzard Theme Tokens" block under `:root` with: color tokens (`--color-bg`, `--color-bg-elevated`, `--color-surface`, `--color-surface-hover`, `--color-border`, `--color-border-subtle`, `--color-accent`, `--color-accent-dim`, `--color-accent-glow`, `--color-accent-2`, `--color-text-1`, `--color-text-2`, `--color-text-3`, `--color-text-muted`, `--color-nav-bg`, `--color-badge-border`), gradient tokens (`--gradient-primary`, `--gradient-elite`, `--gradient-bg`), shadow tokens (`--shadow-card`, `--shadow-accent`, `--shadow-button`), radius tokens (`--radius-card: 18px`, `--radius-button: 12px`, `--radius-pill: 999px`), and transition tokens (`--transition-fast: 0.12s`, `--transition-base: 0.2s`).
- Bare `h1 { font-size: clamp(22px, 5vw, 40px) }` and `h2 { font-size: clamp(18px, 4vw, 28px) }` rules — these hardcode the clamp values directly instead of referencing a token. You will replace these two rules to reference new tokens instead (do not change the visual sizing, just source it from a variable).
- Base `font-family`, `line-height: 1.5`, `font-weight: 400` set directly on `:root`.

**Known scope boundary (read this before starting):** A survey of `src/App.jsx` and every file in `src/components/` found **~558 raw hardcoded hex color occurrences across 27 files** (e.g. `App.jsx` has 58, `HomeDashboard.jsx` has 55, `TripDetailModal.jsx` has 50). Many of these are semantic per-domain values (per-resort accent colors, skill-level colors, tier colors) rather than pure design-system leaks. Migrating all of them to tokens is explicitly **out of scope for this sprint** — see "Out of Scope" below. This sprint only adds the missing token *definitions*; token *adoption* happens incrementally as each component is touched by later sprints (sprint-8 onward should reference these tokens for any new UI they add).

---

## Tasks

S7-T1 and S7-T2 can be done in either order but both must land before S7-T3 (which consumes both).

---

### S7-T1 — Add typography scale tokens

**File to modify:** `src/index.css`

Add a new token block immediately after the existing transition tokens (end of the current Blizzard token block, before the closing `}` of `:root`):

```css
  /* Typography scale */
  --font-size-display: clamp(28px, 6vw, 44px);  /* hero numbers, big stat tiles */
  --font-size-h1: clamp(22px, 5vw, 40px);        /* page titles */
  --font-size-h2: clamp(18px, 4vw, 28px);        /* section headers */
  --font-size-h3: 18px;                          /* card titles */
  --font-size-body: 15px;                        /* default body text */
  --font-size-label: 13px;                       /* form labels, secondary text */
  --font-size-caption: 11px;                     /* timestamps, fine print */

  --font-weight-regular: 400;
  --font-weight-medium: 600;
  --font-weight-bold: 800;
  --font-weight-black: 900;

  --line-height-tight: 1.2;
  --line-height-base: 1.5;
```

**Acceptance criteria:**
- All 13 new custom properties exist under `:root` in `src/index.css`.
- No existing token was renamed, removed, or had its value changed.

---

### S7-T2 — Add spacing scale tokens

**File to modify:** `src/index.css`

Add immediately after the typography block from S7-T1:

```css
  /* Spacing scale — 4px base unit */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
```

**Acceptance criteria:**
- All 9 new custom properties exist under `:root` in `src/index.css`, each a multiple of 4px.

---

### S7-T3 — Migrate the two existing bare heading rules to use the new tokens

**File to modify:** `src/index.css`

Find the existing rules:
```css
h1 { font-size: clamp(22px, 5vw, 40px); }
h2 { font-size: clamp(18px, 4vw, 28px); }
```

Replace with:
```css
h1 { font-size: var(--font-size-h1); font-weight: var(--font-weight-bold); }
h2 { font-size: var(--font-size-h2); font-weight: var(--font-weight-bold); }
```

This is a zero-visual-diff change (the clamp values are identical to what S7-T1 defined) plus an explicit `font-weight` that was previously left to the browser default — check the rendered weight of any existing `<h1>`/`<h2>` in the app before this change (e.g. open the app and inspect an `<h2>` in devtools) and set `--font-weight-bold` only if the computed weight was already bold-ish; if the existing default weight for `<h1>`/`<h2>` in the app today is visually regular (400), omit the `font-weight` line entirely so this step stays a pure token-source change with no visual diff.

**Step 1 — Make the edit**, following the acceptance rule above.

**Step 2 — Verify no visual regression:**
```bash
npm run dev
```
Open the app in a browser, find any page with an `<h1>` or `<h2>` (e.g. the LandingPage hero, or any modal title), and confirm the size/weight looks identical to before the change (compare against `git stash` if unsure).

**Step 3 — Build check:**
```bash
npm run build
```
Expected: build succeeds with no CSS parse errors.

**Step 4 — Commit:**
```bash
git add src/index.css
git commit -m "feat: add typography and spacing design tokens"
```

---

## Sprint Acceptance Criteria

- [ ] `src/index.css` defines `--font-size-display`, `--font-size-h1`, `--font-size-h2`, `--font-size-h3`, `--font-size-body`, `--font-size-label`, `--font-size-caption`
- [ ] `src/index.css` defines `--font-weight-regular`, `--font-weight-medium`, `--font-weight-bold`, `--font-weight-black`
- [ ] `src/index.css` defines `--line-height-tight`, `--line-height-base`
- [ ] `src/index.css` defines `--space-1` through `--space-12` (9 tokens, 4px base unit)
- [ ] The global `h1`/`h2` rules reference the new font-size tokens instead of hardcoded `clamp()` literals
- [ ] `npm run build` succeeds
- [ ] No existing token, class, or component was modified beyond the `h1`/`h2` rule

## Out of Scope for This Sprint

- **Replacing any of the ~558 hardcoded hex values across `App.jsx` and `src/components/*.jsx` with color tokens.** This is a large, cross-cutting change better done incrementally — each future sprint that touches a file should prefer existing `--color-*` tokens for any *new* styles it adds, but retrofitting *existing* styles is not part of this sprint. If a future sprint wants to tackle this as a dedicated effort, it should be scoped file-by-file or in a small batch, not as a single pass.
- Applying the new typography/spacing tokens to any existing component's inline styles (that happens organically as sprint-8 builds the shared `Card`/`Badge`/`Button` components on top of these tokens).
- Any change to `--color-*`, `--gradient-*`, `--shadow-*`, or `--radius-*` tokens — those already exist and are untouched by this sprint.
</content>
