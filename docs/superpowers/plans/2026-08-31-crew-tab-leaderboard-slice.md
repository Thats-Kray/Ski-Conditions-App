# Crew Tab — Leaderboard Sub-Tab Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Crew tab's Leaderboard sub-tab (`LeaderboardPage.jsx`) to match the mockup — its 7-metric tab row (`Vertical/Days/Powder Days/Resorts/Miles/Runs/Longest Day`, replacing today's 8 different categories) and a compact single-line stat display per row — while every existing feature (the Friends/Global toggle, the Log-a-Ski-Day flow, the season-snapshot stat strip, the my-logged-days list, medals, the "YOU" badge, the `topResort` line, and reactions) keeps working exactly as it does today.

**Architecture:** The entire change lives in one file, `src/components/LeaderboardPage.jsx` (479 lines) — no new file, no schema change, no new query. `resorts` and `totalRuns` are already returned by every `leaderboardApi.js` entry, so adding them as sortable categories is a pure config-array edit. The visual change is confined to `LeaderboardRow`'s stat-value block.

**Tech Stack:** React (inline styles, no CSS framework), Supabase (Postgres), `node --test` for pure-logic unit tests (this file has none today and gains none — it's a presentation/config component, consistent with `SkiBuddyBoard.jsx` before the Board slice).

## Global Constraints

- No new npm dependencies.
- Inline `style={{}}` objects; colors via `var(--color-*)` tokens for anything semantic/stateful. This slice introduces no new hardcoded color.
- Re-verify the `npm test`/`npx eslint .` baseline in the fresh worktree before starting — do not trust the last-recorded numbers (145 tests / 89 lint problems as of the Board slice, 2026-08-31), they drift between sessions and `main`'s own lint count runs persistently higher than a fresh worktree's true baseline.
- No subagent in this environment has browser or Supabase-auth tooling. Every task is verified via `npm test`/`npx eslint .`/`npm run build`/diff review only — say so plainly in each task's report, don't imply a browser check happened.
- Follow existing patterns exactly where one already exists (see each task's "Consumes").
- Ask before pushing to `main` — it auto-deploys to `powdays.app` live, no staging step. This plan's execution stays on a worktree branch; pushing/merging to `main` happens only after Kyle signs off.

---

## File Structure

| File | Change |
|---|---|
| `src/components/LeaderboardPage.jsx` | *modify* — `CATEGORIES` array (reorder to match mockup, add `resorts`/`runs`, drop `topSpeed`/`totalLifts`/`timeOnMountain`, relabel `longestRun`), delete the now-dead `formatMinutes()` helper and its call site, restyle `LeaderboardRow`'s stat block to one inline line |

---

### Task 1: `CATEGORIES` array — match the mockup's 7 metrics

**Files:**
- Modify: `src/components/LeaderboardPage.jsx:10-19` (the `CATEGORIES` array), `:21-26` (`formatMinutes`), `:167-171` (`displayValue` computation inside `LeaderboardRow`)

**Interfaces:**
- Consumes: `entry.resorts` and `entry.totalRuns`, both already present on every object `leaderboardApi.js`'s `getLeaderboard()`/`getPublicLeaderboard()` return (confirmed at `leaderboardApi.js:222-230` and `:283-291` — no change needed there).
- Produces: `CATEGORIES` — an array of exactly 7 `{ key, label, stat, unit }` objects, in this order: `vertical, days, powderDays, resorts, miles, runs, longestRun`. `displayValue` (inside `LeaderboardRow`) simplifies to `value == null ? "—" : value` — Task 2 reads this exact value, so its shape must not change again there.

- [ ] **Step 1: Replace the `CATEGORIES` array**

Find (currently `src/components/LeaderboardPage.jsx:10-19`):

```js
const CATEGORIES = [
  { key: "days",           label: "🎿 Days",          stat: (e) => e.days,           unit: "days"  },
  { key: "powderDays",     label: "❄️ Powder Days",   stat: (e) => e.powderDays,     unit: "days"  },
  { key: "vertical",       label: "↕️ Vertical",      stat: (e) => e.verticalFt,     unit: "ft"    },
  { key: "miles",          label: "🛣️ Miles",         stat: (e) => e.milesSki,       unit: "mi"    },
  { key: "topSpeed",       label: "⚡ Top Speed",     stat: (e) => e.topSpeed,       unit: "mph"   },
  { key: "longestRun",     label: "📏 Longest Run",   stat: (e) => e.longestRun,     unit: "ft"    },
  { key: "totalLifts",     label: "🚡 Most Lifts",    stat: (e) => e.totalLifts,     unit: "lifts" },
  { key: "timeOnMountain", label: "⏱️ Time",          stat: (e) => e.timeOnMountain, unit: ""      },
]

// Formats a minute count as "Xh Ym". Returns null (not a display string) for
// null/undefined input so callers can distinguish "no data" from "0 minutes".
function formatMinutes(mins) {
  if (mins == null) return null
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}
```

Replace with:

```js
// Order and set match the mockup's 7-chip Leaderboard row exactly (TASK 22.0
// Leaderboard-slice redesign). Top Speed/Most Lifts/Time on Mountain are
// deliberately not sortable categories here anymore — their data still flows
// through leaderboardApi.js and SessionStatsForm.jsx, they're just not tabs
// on this page. "Longest Day" is the mockup's label for the same longestRun
// stat (longest single run, in feet) — not a new day-level metric.
const CATEGORIES = [
  { key: "vertical",   label: "↕️ Vertical",    stat: (e) => e.verticalFt, unit: "ft"      },
  { key: "days",       label: "🎿 Days",        stat: (e) => e.days,       unit: "days"    },
  { key: "powderDays", label: "❄️ Powder Days", stat: (e) => e.powderDays, unit: "days"    },
  { key: "resorts",    label: "⛰️ Resorts",     stat: (e) => e.resorts,    unit: "resorts" },
  { key: "miles",      label: "🛣️ Miles",       stat: (e) => e.milesSki,   unit: "mi"      },
  { key: "runs",       label: "🎿 Runs",        stat: (e) => e.totalRuns,  unit: "runs"    },
  { key: "longestRun", label: "📏 Longest Day", stat: (e) => e.longestRun, unit: "ft"      },
]
```

Note: `formatMinutes()` is deleted entirely in this step (not moved) — it has exactly one caller in this file, removed in Step 2.

- [ ] **Step 2: Simplify `displayValue`**

Find (currently `src/components/LeaderboardPage.jsx:167-171`, inside `LeaderboardRow`):

```js
  const displayValue = value == null
    ? "—"
    : cat.key === "timeOnMountain"
      ? formatMinutes(value)
      : value
```

Replace with:

```js
  const displayValue = value == null ? "—" : value
```

- [ ] **Step 3: Verify no dangling references**

Run: `grep -n "formatMinutes\|topSpeed\|totalLifts\|timeOnMountain" src/components/LeaderboardPage.jsx`
Expected: zero matches. (These identifiers exist elsewhere in the codebase — `SessionRecapModal.jsx`, `ProfileStats.jsx`, `profileStats.js`, `leaderboardApi.js`'s own return objects — none of that is touched by this task; this grep only confirms `LeaderboardPage.jsx` itself is clean.)

- [ ] **Step 4: Build and lint**

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint .`
Expected: at or below the fresh-worktree baseline.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: unchanged from the fresh-worktree baseline (this task adds no new `src/lib` logic — `CATEGORIES` and `formatMinutes` are both component-local, untested before and after, consistent with this file having no unit tests today).

- [ ] **Step 6: Commit**

```bash
git add src/components/LeaderboardPage.jsx
git commit -m "refactor: match Leaderboard's metric tabs to the mockup's 7 categories"
```

---

### Task 2: Compact single-line stat display

**Files:**
- Modify: `src/components/LeaderboardPage.jsx` (the "Stat" block inside `LeaderboardRow`, currently lines 208-216 — locate by the `{/* Stat */}` comment, since Task 1's edits above it may have shifted these line numbers slightly)

**Interfaces:**
- Consumes: `displayValue` and `cat.unit` exactly as Task 1 leaves them (`displayValue` is `"—"` or the raw stat value; `cat.unit` is always a non-empty string for all 7 categories after Task 1's array change).
- Produces: nothing consumed by a later task — this is the last content task before final review.

- [ ] **Step 1: Replace the stat block**

Find (currently `src/components/LeaderboardPage.jsx:208-216`):

```jsx
        {/* Stat */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: isTop ? "var(--color-accent-soft)" : "white", lineHeight: 1 }}>
            {displayValue}
          </div>
          {value != null && cat.unit && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{cat.unit}</div>
          )}
        </div>
```

Replace with:

```jsx
        {/* Stat */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: isTop ? "var(--color-accent-soft)" : "white", whiteSpace: "nowrap" }}>
            {value == null ? "—" : cat.unit ? `${displayValue} ${cat.unit}` : displayValue}
          </div>
        </div>
```

This combines the number and its unit into one inline string (e.g. "18 days", "96 mi"), matching the mockup's single right-aligned value — replacing the old two-line "big number / small unit label underneath" block. Nothing else in `LeaderboardRow` changes: rank/medal, `Avatar`, name, the "YOU" badge, the `topResort` subtitle, and the reactions row below are all untouched by this task.

- [ ] **Step 2: Build and lint**

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint .`
Expected: at or below the fresh-worktree baseline.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: unchanged from Task 1 (pure JSX/presentation change, no new `src/lib` logic).

- [ ] **Step 4: Diff self-check**

Run: `git diff src/components/LeaderboardPage.jsx`
Confirm: the diff touches only the `CATEGORIES` array, the `formatMinutes` deletion, the `displayValue` computation, and the stat block's JSX — nothing in `LeaderboardPage` (the header, Friends/Global toggle, `LogDayModal`, the season-snapshot strip, the my-logged-days list, or any data-fetching/sorting/reaction logic) shows a diff hunk.

- [ ] **Step 5: Commit**

```bash
git add src/components/LeaderboardPage.jsx
git commit -m "feat: restyle Leaderboard rows to a compact single-line stat display"
```

---

### Task 3: Whole-branch final review + fix wave

Dispatch a review of the full branch diff (both tasks combined) on the most capable available model, per the project's established pattern — this step has caught real cross-task bugs in every prior TASK 22.0 slice (a stale-state save bug and two offseason-data bugs in the Today List slice; a z-index/hitbox/tier-mismatch trio in the Today Map slice; 4 bugs including a tab-switch-killed realtime subscription in the Crews slice; 2 new mobile-layout regressions from the restyle itself in the Board slice — including one a per-task reviewer had wrongly adjudicated as "pre-existing").

- [ ] **Step 1: Review the full diff**

Review `git diff main...HEAD` (the whole branch, not per-task diffs) against `docs/superpowers/specs/2026-08-31-crew-tab-leaderboard-slice-design.md` in full. Specifically check for:
- **Category correctness:** all 7 mockup metrics present, in the mockup's order; `resorts`/`runs` sort descending like every other category (highest first — verify against the existing sort logic in `LeaderboardPage`'s `entries` `useMemo`, which this plan doesn't touch but which depends on `cat.stat(entry)` returning a comparable number for every category, including the two new ones).
- **No dropped functionality:** Friends/Global toggle, Log Day modal (both steps), season-snapshot stat strip, my-logged-days list with delete, medals, "YOU" badge, `topResort` line, and reactions all still present and working exactly as before — this slice is a restyle plus a category-set change, not a feature cut.
- **No leftover dead code:** `formatMinutes`, and any reference to `topSpeed`/`totalLifts`/`timeOnMountain` as a *category*, are fully gone from `LeaderboardPage.jsx` (per Task 1 Step 3's grep) — but confirm those fields aren't referenced anywhere else in this specific file that the two tasks' diffs might have missed.
- **Row layout at real widths:** the new single-line stat string (e.g. "7 resorts", "142 runs") shouldn't be so long it crowds the name column at mobile widths — this app has just shipped two real mobile-layout regressions from restyles in the immediately preceding slice (Board), so give this specific risk real attention rather than assuming a single-line string is automatically safe. If a value+unit combination looks like it could overflow or crowd the flex row at ~375px (do the same rough arithmetic the Board review did: available width minus rank/avatar/gaps/padding), flag it.
- **This slice introduces no realtime subscription and no new query** — confirm both are still true against the final file.
- **Test/lint baseline:** `npm test` and `npx eslint .` are at or better than the fresh-worktree baseline recorded before Task 1 started.

- [ ] **Step 2: Fix any findings**

Apply fixes for anything the review surfaces, in a single consolidated fix-wave commit (not one commit per finding), same pattern as every prior slice's fix wave. Re-run `npm test`/`npx eslint .`/`npm run build` after fixing.

- [ ] **Step 3: Commit the fix wave (only if there were findings)**

```bash
git add -A
git commit -m "fix: final-review fix wave — Leaderboard sub-tab slice"
```

- [ ] **Step 4: Report final state**

Record in the task report: final `npm test` pass count, final `npx eslint .` problem count, and an explicit statement that no subagent in this build had browser/Supabase-auth tooling — verification was tests/lint/build/diff-review only, and Kyle needs to do the real authenticated click-through before this is considered fully verified (same standing gap as every prior slice).

---

## Self-Review Notes (for the plan author, already applied above)

- **Spec coverage:** §3.1 (`CATEGORIES` changes, `formatMinutes` deletion) → Task 1. §3.2 (row layout, single-line stat) → Task 2. §3.3 (everything else stays unmodified) → verified by Task 2 Step 4's diff self-check and Task 3's "no dropped functionality" review item. §5's "no new query/schema change" → confirmed in Task 1's Interfaces note (data already present in `leaderboardApi.js`, unmodified). §6's "no reintroducing dropped categories elsewhere" and "no new longest-day stat" → both are non-actions, verified by Task 3's review having nothing to find if the tasks are done correctly.
- **Type consistency checked:** Task 1's `displayValue` simplification (`value == null ? "—" : value`) is the exact expression Task 2 Step 1 consumes both directly (`value == null ? "—" : ...`) and via the `displayValue` variable (`${displayValue} ${cat.unit}`) — same variable, same shape, no renaming between tasks. `cat.unit` values introduced in Task 1 (`"resorts"`, `"runs"`) are plain non-empty strings, matching the type every other category's `unit` field already has, so Task 2's `cat.unit ? ... : ...` branch behaves identically for all 7 categories.
- **No placeholders:** every step has complete, real code — nothing deferred.
