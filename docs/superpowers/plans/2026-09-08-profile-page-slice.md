# Profile Page — Mockup Fidelity Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `ProfilePage.jsx` to match the mockup's `isMe` screen — one hero, one 5-stat strip, one extra-facts strip, one vertical-feet-graded Season grid, one share button, a list-only History, a restyled Appearance card and a 5-row owner-only Settings list — while cutting the widgets that duplicate the Plans and Crew nav tabs and keeping every unique piece of data the old page carried.

**Architecture:** Three pure modules in `src/lib` carry all the new logic and all the new automated coverage: `seasonGrid.js` (season day keys plus vertical-feet tier), `profileForm.js` (whole-row profile write payload) and two additions to `profileStats.js` (`seasonDeltaLabel`, `statsFromLeaderboardRow`). Three new dumb components under `src/components/profile/` (`ProfileStatStrip.jsx`, `SettingsSheet.jsx`, `ProfileSettingsList.jsx`) hold the new UI. `SeasonCalendar.jsx` is restyled in place and then re-parented from History's deleted Calendar toggle up into the stat stack. `ProfilePage.jsx` shrinks: three widgets and one sub-tab come out of the own-profile branch, one settings list goes in. No migration, no RLS change, no new query, no new dependency.

**Tech Stack:** React 19 (function components, hooks, inline `style={{}}` objects), Supabase JS v2, `node --test` over `src/lib` only, Vite 7, ESLint 9.

## Global Constraints

- **Source of truth:** `docs/superpowers/specs/2026-09-08-profile-page-slice-design.md`. Every Design Decision in it has a task below; every Non-goal is untouched.
- **No database work.** Nothing under `migrations/`, `supabase/` or `server/`. No RLS change, no new RPC, no new query of any kind. This slice is client-only. In particular: **no new fetch of a friend's individual sessions** (spec Non-goal), and **no account-wide privacy schema** (spec Non-goal — the Privacy row is a "Coming soon" sheet and nothing else).
- **`ShareStatCard.jsx`, `StravaConnect.jsx`, `StravaSyncReview.jsx`, `SessionEditForm.jsx`, `SkiPlansTab.jsx` and `PlanCalendar.jsx` do not change.** All are reused as-is from new entry points.
- **Milestone logic does not change.** `MILESTONES`, `getShownMilestones`, `markMilestonesShown`, `MilestoneModal`, the queue and the bulk-persist-at-queue-time behaviour are byte-identical at the end of this branch.
- **`upsertMyProfile()` writes a WHOLE row.** `socialApi.js:443-476` builds its payload from an explicit field list with `|| null` / `?? false` fallbacks, so **any field missing from the object you hand it is written as null/false.** Every write path on this page must go through `buildProfileUpdate()` (Task 4). This is not a style preference — it is the live bug Task 4 fixes and the drift the new Notifications sheet would otherwise re-introduce.
- **Colors come from CSS custom properties** (`var(--color-*)`, `var(--gradient-cta)`, `var(--rating-*)`), never raw hex. The one documented exception on this page is `SKILL_OPTIONS`, whose hex feeds alpha-suffix template literals (`ProfilePage.jsx:27-30`) — **do not tokenize it.** The mockup's literal hexes map to existing tokens: `#38bdf8` to `--color-accent`, the `#0284c7`-to-`#38bdf8` gradient to `--gradient-cta`, `#9bc6ff` to `--rating-sky`, `#8ef6d1` to `--rating-mint`, and the `rgba(125,211,252,0.5)` label text to `--color-accent-soft` at reduced opacity.
- **Tap targets:** this repo puts `minHeight: 44` on interactive controls. Where the mockup specifies something smaller, follow the repo, except for the Season grid cells (Deviation 3).
- **Test harness:** `npm test` is `node --test src/lib/*.test.js`. There is **no DOM/component test runner and none is being added.** New pure logic goes in `src/lib` with `node --test` coverage; component work is verified by `npm run build`, `npx eslint` and Kyle's click-through, exactly as every prior TASK 22.0 slice was.
- **Baselines measured in this worktree, 2026-09-08, at `96fed2e`:** `npm test` gives **235 tests, 235 pass, 0 fail**. `npx eslint .` gives **87 problems (80 errors, 7 warnings)**; do not "fix" that baseline incidentally. Scoped to the files this slice touches — `npx eslint src/components/ProfilePage.jsx src/components/ProfileStats.jsx src/components/SeasonCalendar.jsx src/components/StravaConnect.jsx src/lib/profileStats.js` — there are **exactly 2 problems, both in `ProfilePage.jsx`**: `50:10 'initials' is defined but never used` and `471:63 Empty block statement`. Both sit in code this slice edits, so **the target for those paths after this branch is 0 problems**, and the repo total must not rise above 87.
- **`support@powdays.app` is a placeholder.** The spec asked Kyle to correct it before planning; no real address exists anywhere in the repo (`grep -rn "support@" src server README.md` returns zero hits). It is defined **once**, as `SUPPORT_EMAIL` in `ProfileSettingsList.jsx`, and appears in the click-through list as an explicit ask.

---

## Verified against the live codebase (2026-09-08, worktree `profile-page-slice` at `96fed2e`)

Every claim below was checked on disk before this plan was written. Where a check contradicted the brief, this plan follows the check and says so.

| # | Claim | Verified result |
|---|---|---|
| 1 | `SeasonStatsCard`, `HistoryViewToggle`, `StatsViewToggle` and `RecentSessionsFeed` have exactly one consumer | **CONFIRMED.** A `grep -rn` across `src/` returns only their definitions in `ProfileStats.jsx` and their use in `ProfilePage.jsx`. Deleting `SeasonStatsCard` and `HistoryViewToggle` breaks nothing else. |
| 2 | `SeasonCalendar.jsx` has exactly one importer | **CONFIRMED** — `ProfilePage.jsx:21` only. Restyling it cannot regress another screen. |
| 3 | `ui/SnowStat.jsx` becomes dead when `SeasonStatsCard` is deleted | **TRUE TODAY** — its only three uses are `SeasonStatsCard`'s tiles. **This plan does NOT delete it:** Task 7's `ProfileExtraFacts` renders the same four facts with the same component, so the shipped tile styling is reused instead of re-typed. If you find yourself writing new stat-tile divs in Task 7, stop and use `SnowStat`. |
| 4 | `upsertMyProfile` is a whole-row write and `EditProfileModal` passes a partial object | **CONFIRMED, AND IT IS A LIVE BUG.** `ProfilePage.jsx:111-123` passes an object literal with **no `username` and no `favorite_mountain`**, and `socialApi.js:454/457` writes `profile.username || null` and `profile.favorite_mountain || null`. **Saving Edit Profile today silently clears the user's handle and favourite mountain.** The other three write paths on the page (`handlePhotoFileChange`, `handleRemovePhoto`, `handleSelectTheme`) spread `...profile` and are fine. Task 4 fixes the odd one out and makes the correct shape impossible to get wrong. |
| 5 | Moving powder alerts out of Edit Profile is safe without #4 | **NO — it is exactly the drift bug this slice is at risk of.** Without Task 4, an Edit Profile save after Task 5 would omit `powder_alerts_enabled`/`alert_phone`, which `socialApi.js:462-463` writes as `false`/`null` — **silently switching off the alert the user just enabled in the new Notifications sheet.** Task 4 must land before Task 5. |
| 6 | `getLeaderboard()` rows already carry everything both strips need | **CONFIRMED.** `ProfilePage.jsx:361-371` already maps `days/verticalFt/milesSki/powderDays/resorts/topResort/totalRuns/topSpeed/timeOnMountain` into `computeStats`' key names. The friend view therefore needs **no new query** for either strip. Task 1 moves that hand-written mapping into a tested pure function so the two shapes cannot drift apart. |
| 6b | `computeStats` returns exactly those nine keys | **CONFIRMED** — `profileStats.js:27`. Task 1 adds a test asserting the two key sets are identical, which is the only automated guard the friend path can have. |
| 7 | The friend view fetches session rows | **NO.** `ProfilePage.jsx:332-377` returns early for `!isOwnProfile` with `setRecentSessions([])`. A friend's Season grid would need a new query — out of scope per the spec, and Task 8 gates the grid on `isOwnProfile` for exactly that reason. |
| 8 | `StravaSyncReview` renders above a settings sheet | **NO, AND THIS WOULD HAVE SHIPPED BROKEN.** `StravaSyncReview.jsx:54` is `zIndex: 400`; `EditProfileModal` is `600`. A settings sheet copied at 600 would cover Strava's own sync-review modal, which `StravaConnect` opens from inside it. **`SettingsSheet` therefore uses `zIndex: 350`** — above every nav and header layer in `App.jsx` (max `210`) and below Strava's `400`. Do not "fix" it to 600. |
| 9 | `App.jsx` renders `ProfilePage` twice | **CONFIRMED:** `:1409-1414` (friend view — `userId`/`onBack`/`onTabChange`/`resorts`, **no `onLogOut`**) and `:1542` (own view — `onLogOut`/`onTabChange`/`resorts`). Own profile is gated behind `currentUser`; the friend branch is **not** — a signed-out visitor with a `viewingProfileId` reaches it, `getLeaderboard()` throws "Not authenticated.", and the existing `statsError` card renders. Task 10 keeps that path intact and adds nothing owner-only to it. |
| 10 | `onTabChange` has a use after this slice's cuts | **NO.** Its only three uses on this page are the Trips count, the Friends count and the crew strip's "See All" — all cut. Task 6 removes the prop from the signature **and from both `App.jsx` call sites**, otherwise `no-unused-vars` fails the file. |
| 11 | `Avatar` has a use after the crew strip is cut | **NO** — `ProfilePage.jsx:851` is its only use. Task 6 removes the import. `Card` and `Button` survive (MilestoneModal). |
| 12 | `--rating-sky` and `--rating-mint` already equal the mockup's grid colours | **CONFIRMED.** `index.css:96/98` are `#9bc6ff` and `#8ef6d1` — the exact values in the mockup's `CELL` array (mockup line 705) and already theme-invariant. Task 3's tier tokens build on them instead of inventing a palette. |
| 13 | `useDismissableLayer` exists and is a named export | **CONFIRMED** — `src/lib/useDismissableLayer.js:37`. `useDismissableLayer({ onClose, enabled })` returns a ref for the **panel**, not the backdrop. |
| 14 | `calendarDates.js` is import-free and safe under `node --test` | **CONFIRMED** — no imports; `dateKeyOf(year, monthIndex, day)` and `localDateKey(d)` are exported. Task 2 reuses `dateKeyOf` rather than re-implementing the local-date rule a third time. |
| 15 | Mockup markup for the `isMe` screen | **Read directly** from `PowDays Reorg Mockup.dc.html:440-486` and its script block at `:703-716`. The stat strip really is 5 flex cells, `gap:1` over a `rgba(255,255,255,0.06)` backing, `borderRadius:16`; the grid is `repeat(18,1fr)`, `gap:4`, `aspectRatio:1`, `borderRadius:3`; the settings list is 5 rows of `padding:15px 16px` with a chevron and a 1px divider between rows; "Create share card" is a full-width gradient button at `borderRadius:14`, `padding:13`. |

### Deviation 1 — the Season grid stays pinned to the current season in All-Time mode

The spec explicitly left this open ("a wider/paginated grid **or** a documented decision to leave the grid pinned"). **Decision: pinned.** All-Time is a stats lens, not a date range the grid can express — `getAllTimeStats()` returns every session the user has ever logged with no season boundary, so an "all-time grid" would be an unbounded, unpaginated number of cells that grows every year. The grid therefore always renders `recentSessions` (this season), and its caption **always names the season** (`{season.label} · colored by vertical feet`, Task 8) so toggling to All-Time cannot read as "the grid changed and lost my days". The share button below it keeps its existing `seasonStats` payload for the same reason.

### Deviation 2 — the friend view keeps a two-segment Stats / Ski Plans selector

The spec says the Ski Plans sub-tab is cut from the own profile and **kept for friend view**, but does not say how a friend view exposes it once the shared selector is gone. Rendering `SkiPlansTab` unconditionally under a friend's stats would mount a month calendar and fire `getVisiblePlansInRange` on every friend-profile open. **Decision: keep the existing selector, rendered only when `!isOwnProfile`** — identical component, identical default (`"stats"`), identical lazy behaviour to today. The own profile never sees it.

### Deviation 3 — Season grid cells are about 14px, below the 44px tap floor

243 season days at the mockup's 18 columns is about 14px per cell on a 390px artboard. That is under the repo's 44px floor and is a knowing exception: a heat-map cell **is** its data, and enlarging it to 44px would make the grid roughly 1200px tall. The grid shipped today uses 11px cells, so this is an improvement rather than a regression; the cells are real `<button>`s with `aria-label` and `title`, and every day is also reachable from the History list below. Flagged for Kyle at click-through.

### Deviation 4 — the hero's skill label comes from `friendSubtitle.SKILL_LABELS`

The hero's new mountain-and-skill line uses `skillLabel()` from `src/lib/friendSubtitle.js` — already the shared source for Crew rows and DMs, and already test-locked to the exact five keys `ProfilePage` can write — rather than `SKILL_OPTIONS`' own labels. **One visible consequence:** `black` renders as "Black Diamond" here, where the Edit Profile picker chip still says "Black". `SKILL_OPTIONS` stays as-is because its hex values feed the picker's alpha-suffix tinting. Flagged for Kyle.

### Deviation 5 — `App.jsx` is touched

Not mentioned in the spec, but unavoidable: `onTabChange` becomes unused on this page (Verified #10) and an unused destructured prop is an ESLint error. Task 6 removes it from `ProfilePage`'s signature and from the two `App.jsx` call sites. That is the whole `App.jsx` change — two lines.

---

## File Structure

**Create**
- `src/lib/seasonGrid.js` — `SEASON_GRID_COLUMNS`, `VERTICAL_TIER_BREAKS`, `seasonDayKeys(startYear)`, `sessionTier(session)`. Pure; the grid's only logic.
- `src/lib/seasonGrid.test.js` — its `node --test` suite.
- `src/lib/profileForm.js` — `PROFILE_WRITE_FIELDS`, `buildProfileUpdate(profile, changes)`. Pure; the single source of truth for every `upsertMyProfile` payload this page sends.
- `src/lib/profileForm.test.js` — its `node --test` suite.
- `src/lib/profileStats.test.js` — coverage for `computeStats`, `formatMinutes` and Task 1's two new helpers (the spec's testing requirement).
- `src/components/profile/ProfileStatStrip.jsx` — `ProfileStatStrip` (the 5-stat header strip) and `ProfileExtraFacts` (the 4-fact strip plus the season delta line). Dumb; props only.
- `src/components/profile/SettingsSheet.jsx` — the bottom-sheet chrome shared by all five settings rows.
- `src/components/profile/ProfileSettingsList.jsx` — the 5-row list and its five sheet bodies (Account, Notifications, Privacy, Connected apps, Help).

**Modify**
- `src/lib/profileStats.js` — add `seasonDeltaLabel` and `statsFromLeaderboardRow`. `computeStats`/`formatMinutes` unchanged.
- `src/index.css` — add the five `--season-grid-tier-*` tokens.
- `src/components/SeasonCalendar.jsx` — fixed 18-column grid, vertical-feet tier colouring, Less-to-More legend, card chrome, `formatDateFull` in the detail panel.
- `src/components/ProfileStats.jsx` — delete `SeasonStatsCard` and `HistoryViewToggle` plus their now-unused imports. `StatsViewToggle` and `RecentSessionsFeed` unchanged.
- `src/components/ProfilePage.jsx` — the restructure (Tasks 1 and 4-10).
- `src/App.jsx` — drop `onTabChange` from the two `ProfilePage` call sites (Deviation 5).
- `ROADMAP.md` — bookkeeping (Task 11).

**Explicitly NOT touched:** `ShareStatCard.jsx`, `StravaConnect.jsx`, `StravaSyncReview.jsx`, `SessionEditForm.jsx`, `SkiPlansTab.jsx`, `PlanCalendar.jsx`, `SkiDayDetailsForm.jsx`, `ui/SnowStat.jsx`, `ui/Avatar.jsx`, `src/lib/socialApi.js`, `src/lib/leaderboardApi.js`, `src/lib/friendSubtitle.js`, and anything under `migrations/`, `supabase/` or `server/`.

## Task order and why it is this order

1-2 are pure-logic tasks with no UI effect. 3 restyles the grid **in its current home**, so it is verifiable before it moves. 4 fixes the whole-row write bug **before** 5 relies on it. 5 adds the Settings list (including Sign Out) **before** 9 deletes the hero's sign-out icon, so no commit exists in which a user cannot sign out. 7 adds the "Create share card" button **before** 9 deletes "Share Season", so no commit exists in which the share card is unreachable. 6 (the cuts) precedes 7-9 so the later JSX edits are made against the smaller file. 10 is the friend-view and kept-cards sweep, 11 verifies and does bookkeeping.

---

## Task 1: Stat helpers — `seasonDeltaLabel`, `statsFromLeaderboardRow`, and the missing `profileStats` tests

Implements the spec's Testing section (`computeStats` gets `node --test` coverage) and pre-builds the two pure helpers Task 7 needs. Also removes the friend-view drift risk: the hand-written leaderboard-to-stats mapping inside `ProfilePage.load()` becomes a tested function whose key set is asserted equal to `computeStats`'.

**Files:**
- Modify: `src/lib/profileStats.js` (append after `formatMinutes`; the file currently ends at line 33)
- Create: `src/lib/profileStats.test.js`
- Modify: `src/components/ProfilePage.jsx:12` (import) and `:360-371` (the friend-view mapping)

**Interfaces:**
- Consumes: `computeStats(sessions)` returning `{ days, vertical, miles, powderDays, resorts, topResort, totalRuns, topSpeed, timeOnMountain }` — already exported from `profileStats.js`.
- Produces, used by Tasks 7 and 10:
  - `seasonDeltaLabel(stats, priorStats) => string|null` — null when either argument is falsy.
  - `statsFromLeaderboardRow(row) => object` with exactly `computeStats`' nine keys.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/profileStats.test.js`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  computeStats,
  formatMinutes,
  seasonDeltaLabel,
  statsFromLeaderboardRow,
} from "./profileStats.js"

// ── computeStats ────────────────────────────────────────────────────────────
// Untested until now (2026-09-08) even though it feeds every number on the
// Profile page, the share card, and the milestone checks.

test("computeStats over no sessions is all zeros, not NaN", () => {
  assert.deepEqual(computeStats([]), {
    days: 0, vertical: 0, miles: 0, powderDays: 0, resorts: 0,
    topResort: null, totalRuns: 0, topSpeed: null, timeOnMountain: 0,
  })
})

test("computeStats sums vertical, miles, runs and minutes", () => {
  const s = computeStats([
    { vertical_feet: 12000, miles_skied: 14.25, runs_logged: 9, time_on_mountain_min: 300, resort_name: "winter-park" },
    { vertical_feet: 8000,  miles_skied: 10.05, runs_logged: 6, time_on_mountain_min: 240, resort_name: "copper" },
  ])
  assert.equal(s.days, 2)
  assert.equal(s.vertical, 20000)
  assert.equal(s.miles, 24.3)          // one decimal, not 24.299999999999997
  assert.equal(s.totalRuns, 15)
  assert.equal(s.timeOnMountain, 540)
  assert.equal(s.resorts, 2)
})

test("computeStats treats missing numeric fields as zero", () => {
  const s = computeStats([{ resort_name: "eldora" }, { resort_name: "eldora" }])
  assert.equal(s.vertical, 0)
  assert.equal(s.miles, 0)
  assert.equal(s.totalRuns, 0)
  assert.equal(s.timeOnMountain, 0)
  assert.equal(s.resorts, 1)
})

test("computeStats counts powder days and picks the most-visited resort", () => {
  const s = computeStats([
    { resort_name: "winter-park", is_powder_day: true },
    { resort_name: "winter-park" },
    { resort_name: "copper", is_powder_day: true },
  ])
  assert.equal(s.powderDays, 2)
  assert.equal(s.topResort, "winter-park")
})

test("computeStats topSpeed is the max, and null when nobody recorded one", () => {
  assert.equal(computeStats([{ top_speed_mph: 41 }, { top_speed_mph: 52 }, {}]).topSpeed, 52)
  assert.equal(computeStats([{}, {}]).topSpeed, null)
})

// ── formatMinutes ───────────────────────────────────────────────────────────

test("formatMinutes renders hours and minutes, and an em dash for nothing", () => {
  assert.equal(formatMinutes(0), "—")
  assert.equal(formatMinutes(null), "—")
  assert.equal(formatMinutes(undefined), "—")
  assert.equal(formatMinutes(59), "0h 59m")
  assert.equal(formatMinutes(540), "9h 0m")
  assert.equal(formatMinutes(545), "9h 5m")
})

// ── seasonDeltaLabel ────────────────────────────────────────────────────────

test("seasonDeltaLabel needs both seasons", () => {
  assert.equal(seasonDeltaLabel(null, { days: 3 }), null)
  assert.equal(seasonDeltaLabel({ days: 3 }, null), null)
  assert.equal(seasonDeltaLabel({ days: 3 }, undefined), null)
})

test("seasonDeltaLabel reads up, down and level, and singularises one day", () => {
  assert.equal(seasonDeltaLabel({ days: 8 }, { days: 5 }), "↑ 3 more days than last season")
  assert.equal(seasonDeltaLabel({ days: 6 }, { days: 5 }), "↑ 1 more day than last season")
  assert.equal(seasonDeltaLabel({ days: 4 }, { days: 5 }), "↓ 1 fewer day than last season")
  assert.equal(seasonDeltaLabel({ days: 2 }, { days: 5 }), "↓ 3 fewer days than last season")
  assert.equal(seasonDeltaLabel({ days: 5 }, { days: 5 }), "Same days on mountain as last season")
})

// ── statsFromLeaderboardRow ─────────────────────────────────────────────────
// The friend-profile view has no session rows to run computeStats over — it gets
// one aggregate row from getLeaderboard(). Both shapes feed the SAME two strip
// components, so if their key sets ever drift the friend view silently renders
// blanks. That is what the first test here exists to catch.

test("statsFromLeaderboardRow produces exactly computeStats' key set", () => {
  assert.deepEqual(
    Object.keys(statsFromLeaderboardRow({})).sort(),
    Object.keys(computeStats([])).sort(),
  )
})

test("statsFromLeaderboardRow renames the leaderboard's columns", () => {
  const row = {
    id: "u1", name: "Sam", days: 12, verticalFt: 96000, milesSki: 71.5,
    powderDays: 3, resorts: 4, topResort: "winter-park",
    totalRuns: 118, topSpeed: 47, timeOnMountain: 1980,
  }
  assert.deepEqual(statsFromLeaderboardRow(row), {
    days: 12, vertical: 96000, miles: 71.5, powderDays: 3, resorts: 4,
    topResort: "winter-park", totalRuns: 118, topSpeed: 47, timeOnMountain: 1980,
  })
})

test("statsFromLeaderboardRow defaults missing counts to 0 and missing facts to null", () => {
  const s = statsFromLeaderboardRow({ days: 2 })
  assert.equal(s.days, 2)
  assert.equal(s.vertical, 0)
  assert.equal(s.miles, 0)
  assert.equal(s.powderDays, 0)
  assert.equal(s.resorts, 0)
  assert.equal(s.totalRuns, 0)
  assert.equal(s.timeOnMountain, 0)
  assert.equal(s.topResort, null)
  assert.equal(s.topSpeed, null)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/profileStats.test.js`
Expected: FAIL — `SyntaxError: The requested module './profileStats.js' does not provide an export named 'seasonDeltaLabel'`.

- [ ] **Step 3: Add the two helpers**

Append to `src/lib/profileStats.js`:

```js

/**
 * The season-over-season sentence that used to be inline in SeasonStatsCard.
 * Returns null when there is nothing to compare, so the caller can skip the row.
 *
 * @param {{days: number}|null|undefined} stats       this season
 * @param {{days: number}|null|undefined} priorStats  last season
 * @returns {string|null}
 */
export function seasonDeltaLabel(stats, priorStats) {
  if (!stats || !priorStats) return null
  const diff = stats.days - priorStats.days
  if (diff === 0) return "Same days on mountain as last season"
  const n = Math.abs(diff)
  const unit = n === 1 ? "day" : "days"
  return diff > 0
    ? `↑ ${n} more ${unit} than last season`
    : `↓ ${n} fewer ${unit} than last season`
}

/**
 * A friend's profile has no session rows to aggregate — getLeaderboard() already
 * returns one row per accepted friend carrying the same nine facts under
 * different column names. This is the ONLY place that renaming happens.
 *
 * It must keep returning exactly computeStats()' key set: both shapes are handed
 * to the same ProfileStatStrip / ProfileExtraFacts pair, so a key present in one
 * and not the other renders as a silent blank on the friend view only — the
 * render path least likely to be clicked during review. profileStats.test.js
 * asserts the two key sets are equal.
 *
 * @param {object|null|undefined} row a getLeaderboard() row
 */
export function statsFromLeaderboardRow(row) {
  return {
    days:           row?.days           ?? 0,
    vertical:       row?.verticalFt     ?? 0,
    miles:          row?.milesSki       ?? 0,
    powderDays:     row?.powderDays     ?? 0,
    resorts:        row?.resorts        ?? 0,
    topResort:      row?.topResort      ?? null,
    totalRuns:      row?.totalRuns      ?? 0,
    topSpeed:       row?.topSpeed       ?? null,
    timeOnMountain: row?.timeOnMountain ?? 0,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/profileStats.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 5: Use `statsFromLeaderboardRow` in the friend-view branch**

In `src/components/ProfilePage.jsx`, widen the import on line 12 to:

```jsx
import { computeStats, statsFromLeaderboardRow } from "../lib/profileStats"
```

Then replace the mapping at `ProfilePage.jsx:359-372` — the `} else {` branch of the friend-view load — with:

```jsx
        } else {
          setStatsError(false)
          setNotFriends(false)
          // Key names must match computeStats(): both shapes feed the same strip
          // components. statsFromLeaderboardRow is the single tested place that
          // renaming happens — do not inline it back.
          setSeasonStats(statsFromLeaderboardRow(row))
        }
```

- [ ] **Step 6: Verify no hand-written mapping survives**

Run: `grep -n "verticalFt\|milesSki" src/components/ProfilePage.jsx`
Expected: **no output.**

- [ ] **Step 7: Run the full suite and lint the touched files**

Run: `npm test`
Expected: **247 pass, 0 fail** (235 baseline plus 12).

Run: `npx eslint src/lib/profileStats.js src/lib/profileStats.test.js src/components/ProfilePage.jsx`
Expected: the same **2 pre-existing `ProfilePage.jsx` problems** (`initials` unused; empty block) and nothing new.

- [ ] **Step 8: Commit**

```bash
git add src/lib/profileStats.js src/lib/profileStats.test.js src/components/ProfilePage.jsx
git commit -m "feat: tested season-delta and leaderboard-row stat helpers"
```

---

## Task 2: Season-grid geometry and vertical-feet tiers (`src/lib/seasonGrid.js`)

Implements the logic half of spec decision **Stat/grid stack #4**: which days the grid draws, and how hard a day is coloured. Pure and fully tested; Task 3 consumes it.

**Files:**
- Create: `src/lib/seasonGrid.js`
- Create: `src/lib/seasonGrid.test.js`

**Interfaces:**
- Consumes: `dateKeyOf(year, monthIndex, day)` from `src/lib/calendarDates.js` (import-free module, safe under `node --test`).
- Produces, used by Task 3:
  - `SEASON_GRID_COLUMNS: number` (18)
  - `VERTICAL_TIER_BREAKS: number[]` (`[10000, 25000]`)
  - `seasonDayKeys(startYear: number) => string[]` — every local date key from Oct 1 of `startYear` through May 31 of `startYear + 1`, chronological and inclusive.
  - `sessionTier(session: object|null|undefined) => 0|1|2|3|4`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/seasonGrid.test.js`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  SEASON_GRID_COLUMNS,
  VERTICAL_TIER_BREAKS,
  seasonDayKeys,
  sessionTier,
} from "./seasonGrid.js"

// ── seasonDayKeys ───────────────────────────────────────────────────────────

test("seasonDayKeys spans Oct 1 through May 31 inclusive", () => {
  const keys = seasonDayKeys(2025)
  assert.equal(keys[0], "2025-10-01")
  assert.equal(keys[keys.length - 1], "2026-05-31")
  assert.equal(keys.length, 243)          // 31+30+31+31+28+31+30+31
})

test("seasonDayKeys picks up the extra day in a leap season", () => {
  const keys = seasonDayKeys(2027)        // February 2028 has 29 days
  assert.equal(keys.length, 244)
  assert.ok(keys.includes("2028-02-29"))
})

test("seasonDayKeys is chronological, unique and zero-padded", () => {
  const keys = seasonDayKeys(2025)
  assert.equal(new Set(keys).size, keys.length)
  assert.deepEqual([...keys].sort(), keys)
  for (const k of keys) assert.match(k, /^\d{4}-\d{2}-\d{2}$/)
})

test("seasonDayKeys crosses the new year without skipping a day", () => {
  const keys = seasonDayKeys(2025)
  const i = keys.indexOf("2025-12-31")
  assert.ok(i > 0)
  assert.equal(keys[i + 1], "2026-01-01")
})

// ── sessionTier ─────────────────────────────────────────────────────────────
// 0 no session · 1 light day · 2 solid day · 3 big day · 4 powder day.

test("sessionTier is 0 for a day with no session", () => {
  assert.equal(sessionTier(undefined), 0)
  assert.equal(sessionTier(null), 0)
})

test("sessionTier grades a non-powder day by vertical feet", () => {
  assert.equal(VERTICAL_TIER_BREAKS[0], 10000)
  assert.equal(VERTICAL_TIER_BREAKS[1], 25000)
  assert.equal(sessionTier({ vertical_feet: 0 }),     1)
  assert.equal(sessionTier({ vertical_feet: 9999 }),  1)
  assert.equal(sessionTier({ vertical_feet: 10000 }), 2)
  assert.equal(sessionTier({ vertical_feet: 24999 }), 2)
  assert.equal(sessionTier({ vertical_feet: 25000 }), 3)
  assert.equal(sessionTier({ vertical_feet: 90000 }), 3)
})

test("sessionTier treats an unrecorded vertical as the lightest logged day, never as no-session", () => {
  assert.equal(sessionTier({}), 1)
  assert.equal(sessionTier({ vertical_feet: null }), 1)
  assert.equal(sessionTier({ vertical_feet: "not a number" }), 1)
})

test("sessionTier accepts the numeric string a Postgres numeric can arrive as", () => {
  assert.equal(sessionTier({ vertical_feet: "30000" }), 3)
})

test("a powder day is always the top tier, whatever its vertical", () => {
  assert.equal(sessionTier({ is_powder_day: true }), 4)
  assert.equal(sessionTier({ is_powder_day: true, vertical_feet: 0 }), 4)
  assert.equal(sessionTier({ is_powder_day: true, vertical_feet: 90000 }), 4)
})

test("the grid is 18 columns wide, matching the mockup", () => {
  assert.equal(SEASON_GRID_COLUMNS, 18)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/seasonGrid.test.js`
Expected: FAIL — `Cannot find module` ending in `seasonGrid.js`.

- [ ] **Step 3: Write the module**

Create `src/lib/seasonGrid.js`:

```js
/**
 * Geometry and colour-tier logic for the Profile page's Season grid
 * (TASK 22.0, Profile slice).
 *
 * Lives in lib/ rather than beside SeasonCalendar.jsx so it is covered by
 * `npm test` — the repo's only runner is `node --test src/lib/*.test.js`, with
 * no DOM. Same split as calendarDates.js and profileStats.js.
 *
 * Date keys are ALWAYS built from local date parts via dateKeyOf(), never
 * toISOString(): ski_sessions.session_date is a plain date string, and a UTC
 * key shifts every cell one day for anyone in a negative-offset timezone
 * (i.e. all of Colorado), silently mismatching the whole grid.
 */

import { dateKeyOf } from "./calendarDates"

/** The mockup's fixed-column grid (PowDays Reorg Mockup.dc.html:462). */
export const SEASON_GRID_COLUMNS = 18

/**
 * Vertical-feet boundaries between the three non-powder tiers, in feet. A
 * Colorado day runs roughly 10-25k vertical, so: under 10k reads as a half day
 * or a lift-line day, 10-25k as a normal day, 25k and up as a big day.
 */
export const VERTICAL_TIER_BREAKS = [10000, 25000]

/**
 * Colour intensity for one grid cell.
 *
 *   0  no session logged that day
 *   1  logged, under 10k vertical (or vertical not recorded)
 *   2  logged, 10k-25k vertical
 *   3  logged, 25k+ vertical
 *   4  powder day — always top tier regardless of vertical, because a powder
 *      day is the thing the grid exists to show and short powder days are
 *      common (first chair, then the mountain closes on wind hold by noon).
 *
 * @param {{is_powder_day?: boolean, vertical_feet?: number|string|null}|null|undefined} session
 * @returns {0|1|2|3|4}
 */
export function sessionTier(session) {
  if (!session) return 0
  if (session.is_powder_day) return 4
  const vert = Number(session.vertical_feet)
  const feet = Number.isFinite(vert) ? vert : 0
  if (feet >= VERTICAL_TIER_BREAKS[1]) return 3
  if (feet >= VERTICAL_TIER_BREAKS[0]) return 2
  return 1
}

/**
 * Every local date key in one ski season, Oct 1 through May 31 — the same
 * window seasonDateRange() uses in leaderboardApi.js, so the grid can never
 * show a day the season's own session query would have excluded.
 *
 * 243 keys, 244 in a leap season. Bounded by construction: no input makes this
 * grow, which is why the grid is safe to render as one page of cells with no
 * virtualisation, and why the All-Time toggle deliberately does not widen it
 * (Deviation 1).
 *
 * @param {number} startYear the season's opening calendar year
 * @returns {string[]}
 */
export function seasonDayKeys(startYear) {
  const keys = []
  const end = new Date(startYear + 1, 4, 31)   // May 31
  const cur = new Date(startYear, 9, 1)        // Oct 1
  while (cur <= end) {
    keys.push(dateKeyOf(cur.getFullYear(), cur.getMonth(), cur.getDate()))
    cur.setDate(cur.getDate() + 1)
  }
  return keys
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/seasonGrid.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: **257 pass, 0 fail** (247 after Task 1 plus 10).

- [ ] **Step 6: Commit**

```bash
git add src/lib/seasonGrid.js src/lib/seasonGrid.test.js
git commit -m "feat: season-grid day keys and vertical-feet colour tiers"
```

---

## Task 3: Restyle `SeasonCalendar` into the mockup's fixed-column, vertical-feet-graded grid

Implements the visual half of spec decision **Stat/grid stack #4**. The component stays exactly where it is for now (under History's Calendar toggle), so this task is independently clickable before Task 8 moves it. Tap-to-see-session behaviour is unchanged.

**Files:**
- Modify: `src/index.css` (insert after `--color-dev-badge-strong:` at line 118, before the `--radius-card` block)
- Modify: `src/components/SeasonCalendar.jsx` (whole-file replacement, 94 lines today)

**Interfaces:**
- Consumes: `SEASON_GRID_COLUMNS`, `seasonDayKeys(startYear)`, `sessionTier(session)` from Task 2; `resortName`/`resortEmoji` from `src/lib/resorts`; `formatDateFull` from `src/lib/format`.
- Produces: unchanged public shape — `<SeasonCalendar sessions={Array} startYear={number} />`. Task 8 relies on that exact prop pair.

- [ ] **Step 1: Add the five tier tokens**

In `src/index.css`, immediately after the `--color-dev-badge-strong: #65a30d;` line and before the blank line preceding `--radius-card`, insert:

```css

  /* Track E — Profile Season-grid intensity scale (TASK 22.0, Profile slice).
     Theme-invariant for the same reason as the Track C rating tokens above: the
     grid reads as an ordered heat scale, so its steps must stay ordered and
     distinguishable no matter which cosmetic theme is picked. Tiers 3 and 4 are
     the mockup's own two colours, which the rating scale already carries. */
  --season-grid-tier-0: rgba(255, 255, 255, 0.06);
  --season-grid-tier-1: rgba(155, 198, 255, 0.28);
  --season-grid-tier-2: rgba(155, 198, 255, 0.55);
  --season-grid-tier-3: var(--rating-sky);
  --season-grid-tier-4: var(--rating-mint);
```

- [ ] **Step 2: Replace `src/components/SeasonCalendar.jsx` entirely**

```jsx
import { useMemo, useState } from "react"
import { resortName, resortEmoji } from "../lib/resorts"
import { formatDateFull } from "../lib/format"
import { SEASON_GRID_COLUMNS, seasonDayKeys, sessionTier } from "../lib/seasonGrid"

/**
 * The Profile page's Season grid: one cell per day of the Oct-May season,
 * coloured by how big that day was, with powder days pinned to the top tier.
 *
 * Restyled in TASK 22.0's Profile slice from a horizontal-scroll-by-week strip
 * (GitHub-contributions layout) to the mockup's fixed 18-column grid. Columns no
 * longer mean weekdays — cells are simply chronological, 18 to a row — which is
 * what the mockup shows and what makes the whole season fit on screen without
 * horizontal scrolling.
 *
 * Cells are deliberately ~14px, under the repo's 44px tap floor (Deviation 3 in
 * the plan): a heat-map cell IS its data, and every day is also reachable from
 * the History list below the grid.
 */

// Index = the tier sessionTier() returns. Defined in index.css beside the
// --rating-* scale; see the Track E comment there for why they are theme-invariant.
const TIER_COLORS = [
  "var(--season-grid-tier-0)",
  "var(--season-grid-tier-1)",
  "var(--season-grid-tier-2)",
  "var(--season-grid-tier-3)",
  "var(--season-grid-tier-4)",
]

export default function SeasonCalendar({ sessions, startYear }) {
  const [selectedDate, setSelectedDate] = useState(null)

  // 243 keys per season, recomputed only when the season changes.
  const dayKeys = useMemo(() => seasonDayKeys(startYear), [startYear])

  const byDate = useMemo(
    () => new Map((sessions || []).map((s) => [s.session_date, s])),
    [sessions],
  )

  const selectedSession = selectedDate ? byDate.get(selectedDate) : undefined

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
      padding: 14,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${SEASON_GRID_COLUMNS}, 1fr)`, gap: 4 }}>
        {dayKeys.map((key) => {
          const session = byDate.get(key)
          const selected = selectedDate === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedDate(selected ? null : key)}
              title={key}
              aria-label={session ? `${key} — session logged` : `${key} — no session`}
              aria-pressed={selected}
              style={{
                width: "100%", aspectRatio: "1", padding: 0,
                border: "none", borderRadius: 3,
                background: TIER_COLORS[sessionTier(session)],
                cursor: "pointer",
                boxShadow: selected ? "0 0 0 2px var(--color-accent)" : "none",
              }}
            />
          )
        })}
      </div>

      {/* Less-to-More legend, matching the mockup */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6,
        marginTop: 12, fontSize: 10, color: "var(--color-accent-soft)", opacity: 0.7,
      }}>
        Less
        {TIER_COLORS.map((color, i) => (
          <span key={i} style={{ width: 11, height: 11, borderRadius: 3, background: color }} />
        ))}
        More
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: "var(--color-text-3)", textAlign: "right" }}>
        Brightest tier = powder day
      </div>

      {selectedDate && (
        <div style={{
          marginTop: 12, padding: 14, borderRadius: "var(--radius-card)",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
        }}>
          {selectedSession ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 15, color: "var(--color-text-1)" }}>
                {resortEmoji(selectedSession.resort_key || selectedSession.resort_name)}{" "}
                {resortName(selectedSession.resort_name || selectedSession.resort_key)} — {formatDateFull(selectedDate)}
                {selectedSession.is_powder_day && <span style={{ marginLeft: 8 }}>❄️ Powder Day</span>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 8, fontSize: 13, color: "var(--color-text-2)" }}>
                <span>Vertical: {selectedSession.vertical_feet ?? "—"} ft</span>
                <span>Runs: {selectedSession.runs_logged ?? "—"}</span>
                <span>Top speed: {selectedSession.top_speed_mph != null ? `${selectedSession.top_speed_mph} mph` : "—"}</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--color-text-3)" }}>
              No session logged on {formatDateFull(selectedDate)}.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Confirm the old week-building code is gone**

Run: `grep -n "buildWeeks\|overflowX\|dateKey(" src/components/SeasonCalendar.jsx`
Expected: **no output.** (The local `dateKey`/`buildWeeks` helpers are replaced by `seasonDayKeys`; the horizontal scroller is gone.)

- [ ] **Step 4: Lint and build**

Run: `npx eslint src/components/SeasonCalendar.jsx src/index.css`
Expected: `0 problems`.

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Manual check (no DOM test runner exists — this is the verification)**

`npm run dev`, sign in, go to Profile, and switch History's toggle to **Calendar**. Expect: a single card holding a 18-wide block of squares covering Oct-May with no horizontal scrollbar, days you skied tinted blue with bigger days darker, powder days mint, a "Less … More" legend at the bottom right, and tapping a day opening the same session summary as before (tapping it again closes it).

- [ ] **Step 6: Commit**

```bash
git add src/index.css src/components/SeasonCalendar.jsx
git commit -m "feat: fixed-column season grid graded by vertical feet"
```

---

## Task 4: One tested payload builder for every profile write (`src/lib/profileForm.js`)

Fixes the live whole-row bug in Verified #4 and makes Task 5's Notifications sheet incapable of re-introducing it. **Do not skip or reorder this task** — Task 5 depends on it (Verified #5).

**Files:**
- Create: `src/lib/profileForm.js`
- Create: `src/lib/profileForm.test.js`
- Modify: `src/components/ProfilePage.jsx` — the import block, `EditProfileModal.handleSave` (`:107-130`), `handlePhotoFileChange` (`:446`), `handleRemovePhoto` (`:460`), `handleSelectTheme` (`:471-473`)

**Interfaces:**
- Produces, used by Task 5 and by `EditProfileModal`:
  - `PROFILE_WRITE_FIELDS: string[]` — the 14 columns `upsertMyProfile` writes.
  - `buildProfileUpdate(profile: object|null, changes?: object) => object` — always returns exactly those 14 keys.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/profileForm.test.js`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { PROFILE_WRITE_FIELDS, buildProfileUpdate } from "./profileForm.js"

// A profile row as getMyProfile() returns it (PROFILE_SELECT_COLUMNS in socialApi.js),
// including the two columns that are selectable but NOT writable.
const LOADED = {
  id: "u1",
  first_name: "Kyle", last_name: "Ray", full_name: "Kyle Ray",
  username: "kray", avatar_url: "https://example.test/a.png",
  skill_level: "black", sport_type: "ski", ski_passes: ["Ikon"],
  favorite_mountain: "Winter Park",
  vehicle_label: "Blue Subaru", vehicle_seats: 3,
  powder_alerts_enabled: true, alert_phone: "555-0100",
  theme: "storm-chaser",
  is_admin: false, strava_athlete_id: 12345,
}

test("buildProfileUpdate returns exactly the writable field set", () => {
  assert.deepEqual(Object.keys(buildProfileUpdate(LOADED)).sort(), [...PROFILE_WRITE_FIELDS].sort())
  assert.equal(PROFILE_WRITE_FIELDS.includes("id"), false)
  assert.equal(PROFILE_WRITE_FIELDS.includes("is_admin"), false)
  assert.equal(PROFILE_WRITE_FIELDS.includes("strava_athlete_id"), false)
})

test("buildProfileUpdate carries every untouched field through", () => {
  // The live bug this exists to prevent: Edit Profile used to send an object
  // with no username and no favorite_mountain, and upsertMyProfile writes any
  // missing column as null — silently clearing both.
  const out = buildProfileUpdate(LOADED, { skill_level: "double_black" })
  assert.equal(out.username, "kray")
  assert.equal(out.favorite_mountain, "Winter Park")
  assert.equal(out.vehicle_label, "Blue Subaru")
  assert.equal(out.theme, "storm-chaser")
  assert.equal(out.skill_level, "double_black")
})

test("buildProfileUpdate preserves the powder-alert fields when another screen saves", () => {
  // Edit Profile no longer renders these; the Notifications sheet owns them.
  const out = buildProfileUpdate(LOADED, { vehicle_seats: 4 })
  assert.equal(out.powder_alerts_enabled, true)
  assert.equal(out.alert_phone, "555-0100")
})

test("buildProfileUpdate preserves everything else when the Notifications sheet saves", () => {
  const out = buildProfileUpdate(LOADED, { powder_alerts_enabled: false, alert_phone: null })
  assert.equal(out.powder_alerts_enabled, false)
  assert.equal(out.alert_phone, null)
  assert.equal(out.username, "kray")
  assert.equal(out.ski_passes.length, 1)
})

test("a name change recomputes full_name instead of keeping the stale one", () => {
  const out = buildProfileUpdate(LOADED, { first_name: "Kyle", last_name: "Rayburn" })
  assert.equal(out.full_name, "Kyle Rayburn")
})

test("an explicit full_name wins over the derived one", () => {
  const out = buildProfileUpdate(LOADED, { first_name: "K", last_name: "R", full_name: "DJ Pow" })
  assert.equal(out.full_name, "DJ Pow")
})

test("a single-word name leaves last_name null and full_name that word", () => {
  const out = buildProfileUpdate(LOADED, { first_name: "Cher", last_name: "" })
  assert.equal(out.last_name, null)
  assert.equal(out.full_name, "Cher")
})

test("buildProfileUpdate keeps false as false and turns undefined into null", () => {
  const out = buildProfileUpdate({ powder_alerts_enabled: false })
  assert.equal(out.powder_alerts_enabled, false)   // not null
  assert.equal(out.username, null)
  assert.equal(out.theme, null)                    // upsertMyProfile defaults this to "blizzard"
})

test("buildProfileUpdate tolerates a null profile", () => {
  const out = buildProfileUpdate(null, { theme: "aurora-peak" })
  assert.equal(out.theme, "aurora-peak")
  assert.deepEqual(Object.keys(out).sort(), [...PROFILE_WRITE_FIELDS].sort())
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/profileForm.test.js`
Expected: FAIL — `Cannot find module` ending in `profileForm.js`.

- [ ] **Step 3: Write the module**

Create `src/lib/profileForm.js`:

```js
/**
 * The one place a profiles write payload is assembled (TASK 22.0, Profile slice).
 *
 * upsertMyProfile() in socialApi.js builds its payload from an explicit column
 * list with `|| null` / `?? false` fallbacks, so it writes a WHOLE ROW: any
 * column missing from the object handed to it is written as null or false.
 *
 * Before this module, three of the four write paths on the Profile page spread
 * `...profile` and one — Edit Profile's Save — did not. That one sent no
 * `username` and no `favorite_mountain`, so saving Edit Profile silently
 * cleared the user's handle and favourite mountain. Splitting the powder-alert
 * fields into their own Notifications screen would have made a second, worse
 * version of the same bug (Save on Edit Profile turning the alert back off).
 *
 * So: never hand upsertMyProfile a bare object literal. Always
 * buildProfileUpdate(loadedProfile, { justTheFieldsThisScreenOwns }).
 */

/**
 * Exactly the columns upsertMyProfile writes (socialApi.js:446-466), minus the
 * ones it derives itself (`id`, `updated_at`). `is_admin` and `strava_athlete_id`
 * are readable via PROFILE_SELECT_COLUMNS but are NOT writable here — that is
 * why this whitelists rather than spreading the loaded row wholesale.
 */
export const PROFILE_WRITE_FIELDS = [
  "first_name",
  "last_name",
  "full_name",
  "username",
  "avatar_url",
  "ski_passes",
  "favorite_mountain",
  "sport_type",
  "skill_level",
  "vehicle_label",
  "vehicle_seats",
  "powder_alerts_enabled",
  "alert_phone",
  "theme",
]

/**
 * Merge the fields one screen owns onto the profile row that screen loaded, and
 * return the full writable row.
 *
 * @param {object|null|undefined} profile the row from getMyProfile()
 * @param {object} [changes] only the fields this screen edits
 * @returns {object} every key in PROFILE_WRITE_FIELDS, never undefined values
 */
export function buildProfileUpdate(profile, changes = {}) {
  const merged = { ...(profile || {}), ...changes }

  const payload = {}
  for (const field of PROFILE_WRITE_FIELDS) {
    payload[field] = merged[field] ?? null
  }

  // full_name is stored, not derived, so a rename that only sets first/last
  // would otherwise write the OLD full_name back and the change would appear
  // to have been ignored everywhere full_name is displayed.
  const renamed = changes.first_name !== undefined || changes.last_name !== undefined
  if (renamed && changes.full_name === undefined) {
    payload.full_name = [payload.first_name, payload.last_name].filter(Boolean).join(" ") || null
  }

  // "" is not a value any of these columns should hold; upsertMyProfile would
  // coerce it to null anyway, so normalise here where it is testable.
  for (const field of PROFILE_WRITE_FIELDS) {
    if (payload[field] === "") payload[field] = null
  }

  return payload
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/profileForm.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 5: Route all four `ProfilePage` write paths through it**

Add to the import block at the top of `src/components/ProfilePage.jsx`, after the `profileStats` import:

```jsx
import { buildProfileUpdate } from "../lib/profileForm"
```

Replace `EditProfileModal`'s `handleSave` body (`ProfilePage.jsx:107-130`) with:

```jsx
  async function handleSave() {
    setSaving(true); setError("")
    try {
      const nameParts = displayName.trim().split(" ")
      // buildProfileUpdate, never a bare object literal: upsertMyProfile writes
      // a WHOLE row, so anything omitted here is written as null. See
      // src/lib/profileForm.js.
      await upsertMyProfile(buildProfileUpdate(profile, {
        first_name: nameParts[0] || "",
        last_name: nameParts.slice(1).join(" ") || "",
        full_name: displayName.trim() || null,
        skill_level: skillLevel || null,
        sport_type: sportType || "ski",
        ski_passes: skiPasses,
        vehicle_label: vehicleLabel.trim() || null,
        vehicle_seats: vehicleSeats ? parseInt(vehicleSeats) : null,
        powder_alerts_enabled: powderAlertsEnabled,
        alert_phone: alertPhone.trim() || null,
      }))
      onSaved()
    } catch (e) {
      setError(e.message || "Could not save profile.")
    } finally {
      setSaving(false)
    }
  }
```

In `handlePhotoFileChange`, replace `await upsertMyProfile({ ...profile, avatar_url: url })` with:

```jsx
      await upsertMyProfile(buildProfileUpdate(profile, { avatar_url: url }))
```

In `handleRemovePhoto`, replace `await upsertMyProfile({ ...profile, avatar_url: null })` with:

```jsx
      await upsertMyProfile(buildProfileUpdate(profile, { avatar_url: null }))
```

In `handleSelectTheme`, replace `await upsertMyProfile({ ...profile, theme: themeName })` with:

```jsx
      await upsertMyProfile(buildProfileUpdate(profile, { theme: themeName }))
```

- [ ] **Step 6: Fix the empty-block lint error in the same function**

Still in `handleSelectTheme`, the `localStorage` line is one of `ProfilePage.jsx`'s two lint problems. Replace:

```jsx
    try { localStorage.setItem("pd_theme", themeName) } catch {}
```

with:

```jsx
    try {
      localStorage.setItem("pd_theme", themeName)
    } catch {
      // private browsing / storage disabled — the theme still applies for this
      // session and is persisted server-side just below.
    }
```

- [ ] **Step 7: Verify no bare-object profile write survives**

Run: `grep -n "upsertMyProfile(" src/components/ProfilePage.jsx`
Expected: **exactly four hits, every one of them `upsertMyProfile(buildProfileUpdate(`.**

- [ ] **Step 8: Test, lint, build**

Run: `npm test`
Expected: **266 pass, 0 fail** (257 after Task 2 plus 9).

Run: `npx eslint src/lib/profileForm.js src/lib/profileForm.test.js src/components/ProfilePage.jsx`
Expected: **1 problem** — only `50:10 'initials' is defined but never used` remains (Task 9 removes it).

Run: `npm run build`
Expected: success.

- [ ] **Step 9: Manual check**

`npm run dev`, Profile, Edit Profile, change only the skill level, Save. Reopen the page: **the @handle and the favourite mountain must still be there** (before this task they were cleared). Toggle a theme and reload — the theme persists.

- [ ] **Step 10: Commit**

```bash
git add src/lib/profileForm.js src/lib/profileForm.test.js src/components/ProfilePage.jsx
git commit -m "fix: profile saves no longer clear username and favorite mountain"
```

---

## Task 5: The owner-only Settings list and its five sheets

Implements the spec's **New Settings list** section in full, plus the Edit Profile change it requires ("drops the Powder Alerts fields, which move into the new Notifications settings sheet"). The hero's sign-out icon **stays for now** and is removed in Task 9, so no commit exists in which a user cannot sign out.

**Files:**
- Create: `src/components/profile/SettingsSheet.jsx`
- Create: `src/components/profile/ProfileSettingsList.jsx`
- Modify: `src/components/ProfilePage.jsx` — imports, `EditProfileModal` (drop the powder-alert state, JSX and payload keys), `load()` (capture the signed-in email), and the Connected Apps block at `:862-874` (replaced by the settings list)

**Interfaces:**
- Consumes: `buildProfileUpdate(profile, changes)` (Task 4); `upsertMyProfile` from `src/lib/socialApi`; `useDismissableLayer({ onClose })` from `src/lib/useDismissableLayer`; the existing `StravaConnect` component, unchanged, with its one prop `userId`.
- Produces, used by Task 9 and Task 10:
  - `SettingsSheet({ title: string, onClose: () => void, children })` — default export of `SettingsSheet.jsx`.
  - `ProfileSettingsList({ profile: object, email: string|null, onLogOut: () => void, onProfileSaved: () => Promise<void>|void })` — default export of `ProfileSettingsList.jsx`. **Owner-only: never render it on a friend's profile.**

- [ ] **Step 1: Create the sheet chrome**

Create `src/components/profile/SettingsSheet.jsx`:

```jsx
import { useDismissableLayer } from "../../lib/useDismissableLayer"

/**
 * Bottom-sheet chrome shared by all five Profile settings rows. Geometry copied
 * from ProfilePage's EditProfileModal (drag handle, 22px top corners, 92dvh cap,
 * its own scroll container) so settings and editing feel like one system.
 *
 * zIndex is 350, NOT the 600 EditProfileModal uses. StravaSyncReview — which the
 * Connected apps sheet can open from inside itself — is fixed at zIndex 400
 * (StravaSyncReview.jsx:54), so a 600 sheet would cover Strava's own review
 * modal and strand the user. 350 sits above every nav and header layer in
 * App.jsx (max 210) and below Strava's 400.
 */
export default function SettingsSheet({ title, onClose, children }) {
  const panelRef = useDismissableLayer({ onClose })

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 350,
        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: "100%", maxWidth: 480,
          background: "linear-gradient(160deg, var(--color-modal-bg), var(--color-bg-deep))",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "22px 22px 0 0",
          maxHeight: "92dvh",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{ flexShrink: 0, padding: "16px 20px 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)", margin: "0 auto 18px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: "white" }}>{title}</div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.4)",
                fontSize: 22, lineHeight: 1, cursor: "pointer",
                minWidth: 44, minHeight: 44,
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div style={{
          flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch",
          padding: "12px 20px max(24px, env(safe-area-inset-bottom))",
        }}>
          {children}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the list and its five sheets**

Create `src/components/profile/ProfileSettingsList.jsx`:

```jsx
import { useState } from "react"
import { upsertMyProfile } from "../../lib/socialApi"
import { buildProfileUpdate } from "../../lib/profileForm"
import StravaConnect from "../StravaConnect"
import SettingsSheet from "./SettingsSheet"

/**
 * The mockup's five-row Settings list (PowDays Reorg Mockup.dc.html:480-484) and
 * the sheet each row opens. OWNER-ONLY — every row acts on the signed-in user,
 * so ProfilePage must not render this on a friend's profile.
 */

// PLACEHOLDER. The design spec flagged this for Kyle and it was still unanswered
// when the plan was written; nothing in the repo defines a real support address.
// This is the only place it is written down — change it here.
const SUPPORT_EMAIL = "support@powdays.app"

const ROWS = [
  { key: "account",       label: "Account" },
  { key: "notifications", label: "Notifications" },
  { key: "privacy",       label: "Privacy & visibility" },
  { key: "connected",     label: "Connected apps" },
  { key: "help",          label: "Help & feedback" },
]

const fieldStyle = {
  width: "100%", padding: "11px 13px", borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)",
  color: "white", fontSize: 15, outline: "none", boxSizing: "border-box",
}

const labelStyle = {
  fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7,
}

function AccountSheet({ email, onLogOut, onClose }) {
  return (
    <SettingsSheet title="Account" onClose={onClose}>
      <div style={labelStyle}>Signed in as</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "white", wordBreak: "break-all" }}>
        {email || "—"}
      </div>
      <button
        onClick={() => onLogOut?.()}
        style={{
          marginTop: 24, width: "100%", minHeight: 44, padding: 14, borderRadius: 14,
          border: "1px solid rgba(239,68,68,0.25)", background: "var(--color-danger-bg)",
          color: "var(--color-danger)", fontWeight: 900, fontSize: 15, cursor: "pointer",
        }}
      >
        🚪 Sign Out
      </button>
    </SettingsSheet>
  )
}

function NotificationsSheet({ profile, onSaved, onClose }) {
  const [enabled, setEnabled] = useState(profile?.powder_alerts_enabled ?? false)
  const [phone, setPhone]     = useState(profile?.alert_phone ?? "")
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState("")

  async function handleSave() {
    setSaving(true); setError("")
    try {
      // buildProfileUpdate, never a bare object: upsertMyProfile writes a WHOLE
      // row, so a partial payload here would null this user's username,
      // favourite mountain, vehicle and passes. See src/lib/profileForm.js.
      await upsertMyProfile(buildProfileUpdate(profile, {
        powder_alerts_enabled: enabled,
        alert_phone: phone.trim() || null,
      }))
      await onSaved()
    } catch (e) {
      setError(e.message || "Could not save notification settings.")
      setSaving(false)
    }
  }

  return (
    <SettingsSheet title="Notifications" onClose={onClose}>
      <div style={labelStyle}>Powder Alerts</div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "white", cursor: "pointer", minHeight: 44 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        📧 Weekly powder forecast every Wednesday
      </label>
      {enabled && (
        <input
          type="tel"
          placeholder="Phone number (for future SMS alerts)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ ...fieldStyle, marginTop: 12 }}
        />
      )}
      {error && <div style={{ fontSize: 13, color: "var(--color-danger)", marginTop: 12 }}>{error}</div>}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: 20, width: "100%", minHeight: 44, padding: 14, borderRadius: 14, border: "none",
          background: saving ? "rgba(255,255,255,0.1)" : "var(--gradient-cta)",
          color: "white", fontWeight: 900, fontSize: 15, cursor: saving ? "default" : "pointer",
        }}
      >
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </SettingsSheet>
  )
}
```

Continue the same file with the remaining three sheets and the list itself:

```jsx
function PrivacySheet({ onClose }) {
  // Deliberately inert. The design spec found ZERO account-wide privacy concept
  // in the schema — the only visibility field that exists is per-plan
  // (daily_plans.visibility, migration 037). Building an account-wide model is a
  // separate design pass, backlogged; this row exists to match the mockup.
  return (
    <SettingsSheet title="Privacy & visibility" onClose={onClose}>
      <div style={{ display: "grid", gap: 10, justifyItems: "center", textAlign: "center", padding: "12px 0 8px" }}>
        <div style={{ fontSize: 30 }}>🔒</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>Coming soon</div>
        <div style={{ fontSize: 13, color: "var(--color-text-2)", maxWidth: 300, lineHeight: 1.5 }}>
          Account-wide privacy controls aren&apos;t built yet. Today your season stats are
          visible to accepted friends only, and each ski day you add can be set to Friends
          or Private in the plan editor.
        </div>
      </div>
    </SettingsSheet>
  )
}

function ConnectedAppsSheet({ profile, onClose }) {
  return (
    <SettingsSheet title="Connected apps" onClose={onClose}>
      {/* StravaConnect is reused unchanged — it was an always-visible page card
          before this slice, and is now a tap-to-open destination. It opens its own
          StravaSyncReview modal at zIndex 400, which is why SettingsSheet is 350. */}
      <StravaConnect userId={profile?.id} />
    </SettingsSheet>
  )
}

function HelpSheet({ onClose }) {
  // Static placeholder content, flagged in the design spec. No support inbox or
  // FAQ page exists yet; these three answers are true of the app as shipped.
  const FAQ = [
    ["How do I log a ski day?", "Check in from the Today tab, or connect Strava under Connected apps and sync a ride."],
    ["Who can see my stats?", "Your season stats are visible to accepted friends only."],
    ["How do I add friends?", "Crew tab, then Friends — search by name or username and send a request."],
  ]
  return (
    <SettingsSheet title="Help & feedback" onClose={onClose}>
      <div style={{ display: "grid", gap: 16 }}>
        {FAQ.map(([q, a]) => (
          <div key={q}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>{q}</div>
            <div style={{ fontSize: 13, color: "var(--color-text-2)", marginTop: 4, lineHeight: 1.5 }}>{a}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={labelStyle}>Still stuck?</div>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          style={{ fontSize: 14, fontWeight: 700, color: "var(--color-accent-soft)", textDecoration: "none" }}
        >
          {SUPPORT_EMAIL}
        </a>
      </div>
    </SettingsSheet>
  )
}

export default function ProfileSettingsList({ profile, email, onLogOut, onProfileSaved }) {
  const [openRow, setOpenRow] = useState(null)
  const close = () => setOpenRow(null)

  return (
    <>
      <div style={{
        fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)",
        textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10,
      }}>
        Settings
      </div>

      <div style={{
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16, overflow: "hidden",
      }}>
        {ROWS.map((row, i) => (
          <button
            key={row.key}
            onClick={() => setOpenRow(row.key)}
            style={{
              width: "100%", minHeight: 44,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "15px 16px", background: "none", border: "none",
              borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
              color: "var(--color-text-1)", textAlign: "left", cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>{row.label}</span>
            <span aria-hidden="true" style={{ fontSize: 18, color: "var(--color-accent-soft)", opacity: 0.6 }}>›</span>
          </button>
        ))}
      </div>

      {openRow === "account" && (
        <AccountSheet email={email} onLogOut={onLogOut} onClose={close} />
      )}
      {openRow === "notifications" && (
        <NotificationsSheet
          profile={profile}
          onClose={close}
          onSaved={async () => { await onProfileSaved?.(); close() }}
        />
      )}
      {openRow === "privacy"   && <PrivacySheet onClose={close} />}
      {openRow === "connected" && <ConnectedAppsSheet profile={profile} onClose={close} />}
      {openRow === "help"      && <HelpSheet onClose={close} />}
    </>
  )
}
```

- [ ] **Step 3: Drop the powder-alert fields from `EditProfileModal`**

In `src/components/ProfilePage.jsx`, delete these two state lines from `EditProfileModal` (`:98-99`):

```jsx
  const [powderAlertsEnabled, setPowderAlertsEnabled] = useState(profile?.powder_alerts_enabled ?? false)
  const [alertPhone, setAlertPhone]     = useState(profile?.alert_phone ?? "")
```

Delete these two lines from the `buildProfileUpdate` changes object inside `handleSave`:

```jsx
        powder_alerts_enabled: powderAlertsEnabled,
        alert_phone: alertPhone.trim() || null,
```

And delete the whole `{/* Powder alerts */}` block (`:229-249`), from its opening `<div style={{ marginTop: 16, display: "grid", gap: 8 }}>` through its closing `</div>`.

**This is only safe because Task 4 landed first:** `buildProfileUpdate` carries `powder_alerts_enabled` and `alert_phone` through from the loaded profile, so an Edit Profile save no longer touches them. Without Task 4, saving Edit Profile would write `powder_alerts_enabled: false` and wipe the phone number — the exact drift the design brief warned about (Verified #5).

- [ ] **Step 4: Capture the signed-in email in `load()`**

Add the state declaration next to `currentUserId` (`ProfilePage.jsx:317`):

```jsx
  const [currentUserEmail, setCurrentUserEmail] = useState(null)
```

And set it from the `getCurrentUser()` result the own-profile branch **already** fetches — no new request. Immediately after `setCurrentUserId(user?.id || null)`:

```jsx
      setCurrentUserEmail(user?.email || null)
```

- [ ] **Step 5: Swap the Connected Apps card for the Settings list**

Replace the whole owner-only Connected Apps block at `ProfilePage.jsx:862-874` (the comment, the `mobile-bottom-clearance` wrapper, the "Connected Apps" label and `<StravaConnect userId={profile?.id} />`) with:

```jsx
      {/* ── Settings ── owner-only, last section on the page ──
          The extra bottom clearance (mobile only) keeps the last row clear of the
          fixed mobile bottom nav. Every row here acts on the signed-in user —
          Sign Out, the profile write behind Notifications, Strava's OAuth
          connect/disconnect — so this must never render on someone else's
          profile. */}
      {isOwnProfile && (
        <div className="mobile-bottom-clearance">
          <ProfileSettingsList
            profile={profile}
            email={currentUserEmail}
            onLogOut={onLogOut}
            onProfileSaved={load}
          />
        </div>
      )}
```

- [ ] **Step 6: Fix the imports**

In `src/components/ProfilePage.jsx`, delete the now-unused `StravaConnect` import (`:20`) and add:

```jsx
import ProfileSettingsList from "./profile/ProfileSettingsList"
```

- [ ] **Step 7: Verify the move is complete**

Run: `grep -rn "StravaConnect" src/components/ProfilePage.jsx`
Expected: **no output.**

Run: `grep -n "powderAlertsEnabled\|alertPhone" src/components/ProfilePage.jsx`
Expected: **no output** — the fields now live only in `ProfileSettingsList.jsx`.

Run: `grep -rn "powder_alerts_enabled" src/components src/lib`
Expected: exactly three hits — `ProfileSettingsList.jsx` (state seed and the save payload) and `lib/profileForm.js` (the field list). **Any hit in `ProfilePage.jsx` means Step 3 was not finished.**

- [ ] **Step 8: Lint and build**

Run: `npx eslint src/components/profile/ src/components/ProfilePage.jsx`
Expected: **1 problem** — `initials` unused (removed in Task 9). Nothing in `src/components/profile/`.

Run: `npm run build`
Expected: success.

Run: `npm test`
Expected: **266 pass, 0 fail** (unchanged — this task adds no pure logic).

- [ ] **Step 9: Manual check**

`npm run dev`, Profile. Expect a **Settings** list of five rows where the Connected Apps card used to be. Then:
1. **Account** shows your email and a Sign Out button that actually signs you out.
2. **Notifications** shows the powder-alert toggle; enabling it reveals the phone field; Save closes the sheet, and reopening it shows the saved values. Then open **Edit Profile**, change nothing, Save, and reopen Notifications — **the toggle must still be on and the phone still set** (this is the drift check).
3. **Privacy & visibility** shows "Coming soon" and nothing else.
4. **Connected apps** shows the Strava card. If you are connected, tapping Sync opens the sync-review modal **on top of** the sheet (this is why the sheet is zIndex 350).
5. **Help & feedback** shows three FAQ lines and the placeholder support address.
6. Escape (desktop) and backdrop tap (mobile) close each sheet, and Edit Profile no longer contains the Powder Alerts block.

- [ ] **Step 10: Commit**

```bash
git add src/components/profile/SettingsSheet.jsx src/components/profile/ProfileSettingsList.jsx src/components/ProfilePage.jsx
git commit -m "feat: owner-only settings list with account, notifications, privacy, apps, help"
```

---

## Task 6: Cut the three duplicate widgets and confine Ski Plans to the friend view

Implements the spec's **Cut entirely (own profile)** section — the Ski Plans sub-tab, the Trips/Friends header counts and the "Your Crew" strip — and the friend-view half of its **Friend-view profile** section (Ski Plans kept there and only there, per Deviation 2).

**Files:**
- Modify: `src/components/ProfilePage.jsx` — imports, the component signature, `load()`, the hero stats row, the sub-tab selector, the tab branches, the crew strip
- Modify: `src/App.jsx:1409-1414` and `:1542` (drop `onTabChange`, Deviation 5)

**Interfaces:**
- Consumes: `SkiPlansTab({ userId, editable, resorts })` — unchanged component, still imported.
- Produces: `ProfilePage({ onLogOut, userId = null, onBack, resorts = [] })` — **`onTabChange` is gone from the signature.** Later tasks and `App.jsx` must not pass it.

- [ ] **Step 1: Drop the two friend/trip fetches and their state**

In `src/components/ProfilePage.jsx`, narrow the `socialApi` import (`:3-10`) by deleting the `getAcceptedFriends` and `getAllVisibleTrips` lines, and delete the `Avatar` import (`:23`). Delete these two state lines (`:304-305`):

```jsx
  const [friends, setFriends]         = useState([])
  const [tripCount, setTripCount]     = useState(0)
```

Then replace the own-profile fetch block in `load()` (`:379-396`, from the `const [user, prof, friendData, tripData, sessions, priorSessions]` line through `setTripCount(count)`) with:

```jsx
      // getAcceptedFriends/getAllVisibleTrips used to be fetched here purely to
      // print a Friends count and a Trips count in the hero. Both counts were
      // navigation shortcuts into tabs that are one tap away in the bottom nav,
      // and both were cut in TASK 22.0's Profile slice — so are their requests.
      const [user, prof, sessions, priorSessions] = await Promise.all([
        getCurrentUser(),
        getMyProfile(),
        getMySessions(startYear).catch(() => []),
        getMySessions(startYear - 1).catch(() => []),
      ])
      setProfile(prof)
      setCurrentUserId(user?.id || null)
      setCurrentUserEmail(user?.email || null)
```

(The `setCurrentUserEmail` line arrived in Task 5 — keep exactly one copy of it.)

- [ ] **Step 2: Reduce the hero stats row to Days only**

Replace the hero's stats row (`:634-663` — the comment plus the flex `<div>` that follows it) with:

```jsx
        {/* Days — the one count that means the same thing on your own profile and
            on a friend's. Trips and Friends were cut in TASK 22.0's Profile
            slice: they came from getAllVisibleTrips/getAcceptedFriends, which are
            scoped to the signed-in user (so they rendered a misleading 0 on
            someone else's profile), and both were shortcuts into tabs already in
            the bottom nav. Task 7 replaces this row with the mockup's 5-stat
            strip below the hero. */}
        <div style={{ display: "flex", marginTop: 20, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16 }}>
          <div style={{ flex: 1, textAlign: "center", padding: "4px 0" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: seasonStats?.days > 0 ? "var(--color-accent-soft)" : "white", lineHeight: 1 }}>{seasonStats?.days ?? "—"}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.7, marginTop: 4 }}>Days</div>
          </div>
        </div>
```

- [ ] **Step 3: Make the sub-tab selector friend-view-only**

Replace the selector block (`:686-708` — the `Stats / Ski Plans sub-tabs` comment and the `<div>` after it) with:

```jsx
      {/* ── Stats / Ski Plans sub-tabs — FRIEND VIEW ONLY ──
          The own profile lost this selector in TASK 22.0's Profile slice: its Ski
          Plans tab was a duplicate of the Plans nav tab's own day agenda. A
          friend's profile is the only place in the app that shows one specific
          person's upcoming plans, so it keeps the selector — and keeps it lazy,
          so opening a friend's profile doesn't fetch a month of plans nobody
          asked to see. */}
      {!isOwnProfile && (
        <div style={{
          display: "flex", gap: 4, background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14,
          padding: 4, width: "fit-content",
        }}>
          {[{ key: "stats", label: "📊 Stats" }, { key: "plans", label: "📅 Ski Plans" }].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setProfileTab(key)}
              style={{
                padding: "8px 16px", borderRadius: 10,
                background: profileTab === key ? "rgba(255,255,255,0.12)" : "transparent",
                border: profileTab === key ? "1px solid rgba(255,255,255,0.14)" : "1px solid transparent",
                color: profileTab === key ? "white" : "rgba(255,255,255,0.5)",
                fontWeight: profileTab === key ? 800 : 600,
                fontSize: 13, cursor: "pointer", minHeight: 44,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Retarget the two tab branches**

Change the opening of the stats branch (`:710`) from `{profileTab === "stats" && (` to:

```jsx
      {(isOwnProfile || profileTab === "stats") && (
```

Change the plans branch (`:771-773`) to:

```jsx
      {!isOwnProfile && profileTab === "plans" && (
        <SkiPlansTab userId={userId} editable={false} resorts={resorts} />
      )}
```

`editable` is now the literal `false`: this branch only ever renders for someone else's profile, where `isOwnProfile` was already false.

- [ ] **Step 5: Delete the "Your Crew" strip**

Delete the whole `Friends strip` block (`:834-860`), from `{friends.length > 0 && (` through its closing `)}`.

- [ ] **Step 6: Drop the `onTabChange` prop**

Change the component signature (`:300`) to:

```jsx
export default function ProfilePage({ onLogOut, userId = null, onBack, resorts = [] }) {
```

In `src/App.jsx`, delete the `onTabChange={handleTabChange}` line from the friend-view `ProfilePage` at `:1412`, and drop `onTabChange={setActiveTab}` from the own-profile call at `:1542` so it reads:

```jsx
              <ProfilePage onLogOut={handleLogOut} resorts={RESORTS} />
```

- [ ] **Step 7: Verify the cuts**

Run: `grep -n "onTabChange" src/components/ProfilePage.jsx src/App.jsx`
Expected: hits in `App.jsx` only for the nav components that still use it (`BottomNav`, `TopNav`) — **zero hits in `ProfilePage.jsx` and zero on either `ProfilePage` call site.**

Run: `grep -n "getAcceptedFriends\|getAllVisibleTrips\|tripCount\|Avatar" src/components/ProfilePage.jsx`
Expected: **no output.**

- [ ] **Step 8: Lint and build**

Run: `npx eslint src/components/ProfilePage.jsx src/App.jsx`
Expected: `ProfilePage.jsx` down to **1 problem** (`initials` unused, removed in Task 9); `App.jsx` unchanged from its baseline.

Run: `npm run build`
Expected: success.

- [ ] **Step 9: Manual check**

`npm run dev`. **Own profile:** no Stats/Ski Plans selector, no Trips or Friends counts (Days only), no "Your Crew" avatar strip; everything else still renders, and the page now issues two fewer requests. **A friend's profile** (Crew, then Friends, then tap someone): the selector is still there, Stats is still the default, and Ski Plans still shows only that friend's upcoming days.

- [ ] **Step 10: Commit**

```bash
git add src/components/ProfilePage.jsx src/App.jsx
git commit -m "refactor: cut duplicate profile widgets, keep ski plans for friend view"
```

---

## Task 7: The stat stack — 5-stat strip, extra-facts strip, and the share button

Implements spec decisions **Stat/grid stack #1, #2, #3 and #5** and retires `SeasonStatsCard`. The "Create share card" button lands here, one task **before** Task 9 deletes "Share Season", so the share card is never unreachable.

**Files:**
- Create: `src/components/profile/ProfileStatStrip.jsx`
- Modify: `src/components/ProfileStats.jsx` — delete `SeasonStatsCard` and its two now-unused imports
- Modify: `src/components/ProfilePage.jsx` — imports, two derived constants, the season-stats block (`:730-751`)

**Interfaces:**
- Consumes: `computeStats`-shaped stats objects from either source (own profile) or `statsFromLeaderboardRow` (friend view, Task 1); `seasonDeltaLabel(stats, priorStats)` (Task 1); `SnowStat({ icon, label, value, unit })`; `fmt(n)` from `src/lib/format`; `resortName(key)` from `src/lib/resorts`; `formatMinutes(mins)` from `src/lib/profileStats`.
- Produces, used by Tasks 8 and 10:
  - `ProfileStatStrip({ stats })` — named export.
  - `ProfileExtraFacts({ stats, deltaLabel })` — named export; `deltaLabel` is `string|null`.

- [ ] **Step 1: Create the two strips**

Create `src/components/profile/ProfileStatStrip.jsx`:

```jsx
import { fmt } from "../../lib/format"
import { resortName } from "../../lib/resorts"
import { formatMinutes } from "../../lib/profileStats"
import SnowStat from "../ui/SnowStat"

/**
 * The Profile page's two stat strips (TASK 22.0, Profile slice).
 *
 * Both take a stats object in computeStats()' shape. The own profile builds that
 * from session rows; the friend view builds it from one getLeaderboard() row via
 * statsFromLeaderboardRow(). profileStats.test.js asserts those two shapes carry
 * the same keys, because a mismatch shows up as blanks on the friend view only.
 */

/**
 * The mockup's five-stat header strip (PowDays Reorg Mockup.dc.html:450-454).
 * Replaces BOTH the old hero Trips/Friends/Days row and SeasonStatsCard's 2x2
 * grid, which showed the same four numbers as each other.
 */
export function ProfileStatStrip({ stats }) {
  const items = [
    { label: "Days",    value: stats?.days ?? 0 },
    { label: "Vert ft", value: fmt(stats?.vertical ?? 0) },
    { label: "Miles",   value: Math.round(stats?.miles ?? 0) },
    { label: "Resorts", value: stats?.resorts ?? 0 },
    { label: "Powder",  value: stats?.powderDays ?? 0 },
  ]

  return (
    <div style={{
      display: "flex", gap: 1, overflow: "hidden",
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
    }}>
      {items.map((item) => (
        <div key={item.label} style={{
          flex: 1, textAlign: "center", padding: "12px 4px",
          background: "rgba(255,255,255,0.02)",
        }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: "white", lineHeight: 1.1 }}>
            {item.value}
          </div>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 0.4, marginTop: 2,
            textTransform: "uppercase", color: "var(--color-accent-soft)", opacity: 0.75,
          }}>
            {item.label}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The facts SeasonStatsCard carried that the header strip does NOT duplicate,
 * kept so none of that data is lost: total runs, top speed, time on mountain,
 * top resort, plus the season-over-season delta line.
 *
 * Two columns rather than the old card's three, because "Time on Mountain" wraps
 * badly at a third of a 390px screen. Tiles are ui/SnowStat, the same component
 * SeasonStatsCard used, so the styling is reused rather than re-typed.
 */
export function ProfileExtraFacts({ stats, deltaLabel = null }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: "14px 16px",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <SnowStat icon="🎿" label="Total Runs" value={stats?.totalRuns ?? 0} />
        <SnowStat
          icon="⚡"
          label="Top Speed"
          value={stats?.topSpeed ?? "—"}
          unit={stats?.topSpeed != null ? "mph" : undefined}
        />
        <SnowStat icon="⏱️" label="Time on Mountain" value={formatMinutes(stats?.timeOnMountain)} />
        <SnowStat icon="🏆" label="Top Resort" value={stats?.topResort ? resortName(stats.topResort) : "—"} />
      </div>

      {deltaLabel && (
        <div style={{
          marginTop: 12, paddingTop: 10,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          fontSize: 13, color: "var(--color-text-2)",
        }}>
          {deltaLabel}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Delete `SeasonStatsCard`**

In `src/components/ProfileStats.jsx`, delete the whole `SeasonStatsCard` function (`:22-112`) and the `// ── Season Stats Card ──` banner above it. Then delete its two now-unused imports — `import { formatMinutes } from "../lib/profileStats"` (`:4`) and `import SnowStat from "./ui/SnowStat"` (`:7`).

**Keep** the `resortName`/`resortEmoji` and `fmt` imports: `RecentSessionsFeed` still uses all three. **Do not delete `ui/SnowStat.jsx`** — Task 7 Step 1 just made `ProfileExtraFacts` its new consumer.

- [ ] **Step 3: Derive the active stats and the delta label in `ProfilePage`**

Add to the imports:

```jsx
import { ProfileStatStrip, ProfileExtraFacts } from "./profile/ProfileStatStrip"
```

and widen the `profileStats` import to:

```jsx
import { computeStats, seasonDeltaLabel, statsFromLeaderboardRow } from "../lib/profileStats"
```

Then, immediately below the `const sportEmoji = ...` line (just above the `return (`), add:

```jsx
  // One toggle governs both strips. All-Time is own-profile-only: the friend view
  // has a single aggregate season row and no way to ask for more.
  const allTimeSelected = isOwnProfile && viewMode === "allTime"
  const activeStats = allTimeSelected ? allTimeStats : seasonStats
  const deltaLabel = isOwnProfile && viewMode === "season"
    ? seasonDeltaLabel(seasonStats, priorStats)
    : null
```

- [ ] **Step 4: Replace the `SeasonStatsCard` block with the two strips**

Replace the whole `{/* ── Season Stats ── */}` block (`:730-751`) with:

```jsx
          {/* ── Stat stack ── header strip, then the facts the strip doesn't carry.
              Replaces SeasonStatsCard, whose 2x2 grid showed the same four numbers
              the strip does. The Season/All-Time toggle governs both strips (and,
              from Task 8, the grid's caption). */}
          {seasonStats && !notFriends && !statsError && (
            <>
              {isOwnProfile && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <StatsViewToggle viewMode={viewMode} onChange={handleViewModeChange} />
                </div>
              )}

              {allTimeSelected && allTimeStats == null ? (
                <div style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
                  Loading all-time stats…
                </div>
              ) : (
                <>
                  <ProfileStatStrip stats={activeStats} />
                  {activeStats.days === 0 ? (
                    <div style={{ textAlign: "center", padding: 20, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                      No days logged yet — get out there! ⛷️
                    </div>
                  ) : (
                    <ProfileExtraFacts stats={activeStats} deltaLabel={deltaLabel} />
                  )}
                </>
              )}
            </>
          )}
```

- [ ] **Step 5: Add the "Create share card" button**

Immediately after the block from Step 4, and still inside the same branch, add:

```jsx
          {/* The one Share entry point. Same component and same payload as the
              hero's old "Share Season" button, which Task 9 removes; it keeps
              that button's `seasonStats?.days > 0` gate. Task 8 inserts the
              Season grid directly above this. */}
          {isOwnProfile && seasonStats?.days > 0 && (
            <button
              onClick={() => setShowShare(true)}
              style={{
                width: "100%", minHeight: 44, padding: 13, borderRadius: 14, border: "none",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                background: "var(--gradient-cta)", color: "white",
                fontSize: 13, fontWeight: 800, cursor: "pointer",
              }}
            >
              📤 Create share card
            </button>
          )}
```

- [ ] **Step 6: Verify `SeasonStatsCard` is gone everywhere**

Run: `grep -rn "SeasonStatsCard" src/`
Expected: **no output.**

Run: `grep -rn "SnowStat" src/components/`
Expected: hits in `ui/SnowStat.jsx` and `profile/ProfileStatStrip.jsx` only.

- [ ] **Step 7: Lint, build, test**

Run: `npx eslint src/components/profile/ src/components/ProfileStats.jsx src/components/ProfilePage.jsx`
Expected: **1 problem** (`initials`, removed in Task 9).

Run: `npm run build`
Expected: success.

Run: `npm test`
Expected: **266 pass, 0 fail** (unchanged).

- [ ] **Step 8: Manual check**

`npm run dev`, Profile. Expect the big gradient season card to be replaced by a thin five-cell strip (Days / Vert ft / Miles / Resorts / Powder) above a two-by-two facts card (Total Runs / Top Speed / Time on Mountain / Top Resort) with the "more days than last season" line beneath it. Flip the toggle to **All-Time**: both strips change and the delta line disappears. A user with zero logged days sees "No days logged yet". Then open a **friend's** profile: both strips render there too, with no toggle and no delta line. Finally, tap "📤 Create share card" and confirm the share card renders exactly as the hero's "Share Season" button still does.

- [ ] **Step 9: Commit**

```bash
git add src/components/profile/ProfileStatStrip.jsx src/components/ProfileStats.jsx src/components/ProfilePage.jsx
git commit -m "feat: five-stat strip and extra-facts strip replace SeasonStatsCard"
```

---

## Task 8: Move the Season grid into the stack and reduce History to a list

Implements the placement half of spec decision **Stat/grid stack #4** ("this becomes the only calendar/grid view on the page") and the spec's **History section** decision (list only, per-session edit and share unchanged).

**Files:**
- Modify: `src/components/ProfilePage.jsx` — insert the grid section, delete `historyView` state, simplify the History block
- Modify: `src/components/ProfileStats.jsx` — delete `HistoryViewToggle`

**Interfaces:**
- Consumes: `SeasonCalendar({ sessions, startYear })` (Task 3, unchanged signature); `RecentSessionsFeed({ sessions, limit, onRefresh, profile, fullName })` (unchanged).
- Produces: nothing new. `HistoryViewToggle` ceases to exist — no importer may reference it after this task.

- [ ] **Step 1: Insert the Season grid above the share button**

In `src/components/ProfilePage.jsx`, between the stat-stack block and the "Create share card" button added in Task 7, insert:

```jsx
          {/* ── Season grid ── own profile only.
              A friend's profile never fetches session rows (the friend branch of
              load() sets recentSessions to []), and fetching them would mean a new
              query plus an RLS check — explicitly out of scope for this slice.

              The grid is always THIS season, even when the toggle says All-Time:
              getAllTimeStats() has no season boundary, so an all-time grid would
              grow without limit every year. The caption names the season so the
              toggle can never read as "the grid lost my days". */}
          {isOwnProfile && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: "white" }}>Season grid</div>
                <div style={{ fontSize: 11, color: "var(--color-accent-soft)", opacity: 0.7 }}>
                  {season.label} · colored by vertical feet
                </div>
              </div>
              <SeasonCalendar sessions={recentSessions} startYear={season.startYear} />
            </div>
          )}
```

- [ ] **Step 2: Reduce History to the list**

Replace the whole `{/* ── Session History (List / Calendar) ── */}` block — the comment, the `HistoryViewToggle` row and the `historyView === "list" ? … : …` ternary — with:

```jsx
          {/* ── Session History ── own profile only: getMySessions is self-scoped,
              so a friend view has no session rows to render.
              List only. The Calendar option was removed in TASK 22.0's Profile
              slice because the Season grid above now covers it — two near-identical
              day grids on one screen was the duplication this slice exists to end.
              Per-session edit (photos/tags/stats) and per-session share are
              unchanged: neither exists anywhere else in the app. */}
          {isOwnProfile && (
            <RecentSessionsFeed
              sessions={recentSessions}
              limit={Infinity}
              onRefresh={load}
              profile={profile}
              fullName={fullName}
            />
          )}
```

- [ ] **Step 3: Delete the `historyView` state**

Delete this line (`:315`):

```jsx
  const [historyView, setHistoryView] = useState("list")
```

- [ ] **Step 4: Delete `HistoryViewToggle`**

In `src/components/ProfileStats.jsx`, delete the whole `HistoryViewToggle` function (`:135-154` before Task 7's edit; it sits directly below `StatsViewToggle`). **Keep `StatsViewToggle`** — the stat stack still uses it. Then remove `HistoryViewToggle` from `ProfilePage.jsx`'s import of `./ProfileStats`, leaving:

```jsx
import { StatsViewToggle, RecentSessionsFeed } from "./ProfileStats"
```

- [ ] **Step 5: Verify**

Run: `grep -rn "HistoryViewToggle\|historyView" src/`
Expected: **no output.**

Run: `grep -n "SeasonCalendar" src/components/ProfilePage.jsx`
Expected: two hits — the import and exactly one render site.

- [ ] **Step 6: Lint, build, test**

Run: `npx eslint src/components/ProfilePage.jsx src/components/ProfileStats.jsx`
Expected: **1 problem** (`initials`, removed in Task 9).

Run: `npm run build`
Expected: success.

Run: `npm test`
Expected: **266 pass, 0 fail**.

- [ ] **Step 7: Manual check**

`npm run dev`, Profile. Expect, in order: hero, toggle, five-stat strip, facts card, **"Season grid" heading with the season label**, the grid card, "Create share card", then the session history list with **no List/Calendar toggle anywhere**. Tap a day in the grid and confirm the session summary opens under it. Editing a session from the History list and sharing one both still work. Flip to All-Time: the strips change, the grid and its caption stay on this season.

- [ ] **Step 8: Commit**

```bash
git add src/components/ProfilePage.jsx src/components/ProfileStats.jsx
git commit -m "feat: season grid is the page's only day grid, history is list-only"
```

---

## Task 9: Hero restructure

Implements the spec's **Hero** decisions 3, 5, 6 and 7: the mountain-and-skill line, the pill Edit profile button, the removed sign-out icon and the removed "Share Season" button. Decisions 1, 2 and 4 (avatar and photo flow, name and sport emoji, username line) are explicitly unchanged. Sign Out has lived in the Account sheet since Task 5 and the share card has had its own button since Task 7, so nothing becomes unreachable here.

**Files:**
- Modify: `src/components/ProfilePage.jsx` — imports, the dead `initials()` helper, the hero container, the sign-out button, the name block, the button row

**Interfaces:**
- Consumes: `skillLabel(key) => string|null` from `src/lib/friendSubtitle` (Deviation 4).
- Produces: nothing new.

- [ ] **Step 1: Delete the dead `initials()` helper**

Delete `ProfilePage.jsx:50-52` — the `function initials(name) { … }` block. It has had no caller since Sprint 34 and is one of the file's two baseline lint errors.

- [ ] **Step 2: Import the shared skill label and build the subtitle**

Add to the imports:

```jsx
import { skillLabel } from "../lib/friendSubtitle"
```

Replace the `const skillObj = …` line (just above `const sportEmoji = …`) with:

```jsx
  // The mockup's single subtitle line: "🏔 Winter Park · Advanced". skillLabel()
  // is the app's shared key-to-label map (Crew rows and DMs already use it), so
  // one skill level can never be spelled two ways in two screens. Renders nothing
  // when the user has set neither field, which is the common case on live data.
  const heroSubtitle = [
    typeof profile?.favorite_mountain === "string" ? profile.favorite_mountain.trim() : "",
    skillLabel(profile?.skill_level),
  ].filter(Boolean).join(" · ")
```

- [ ] **Step 3: Restyle the hero container**

Replace the hero's opening `<div>` (`:518-524`, the one whose style starts `background: "linear-gradient(160deg,rgba(15,23,42,0.98)…`) with:

```jsx
      {/* ── Hero ── borderless, with the mockup's radial glow behind the avatar.
          --color-accent-dim is the token equivalent of the mockup's
          rgba(56,189,248,0.14), so the glow follows the picked theme. */}
      <div style={{
        background: "radial-gradient(ellipse 80% 60% at 50% 0%, var(--color-accent-dim), transparent 65%)",
        borderRadius: 22,
        padding: "18px 16px 20px",
        position: "relative",
      }}>
```

- [ ] **Step 4: Delete the sign-out icon**

Delete the whole `{/* Sign out — top right */}` block (`:526-533`), from `{isOwnProfile && (` through its closing `)}`. Sign Out now lives only in Settings, then Account (Task 5). `onLogOut` is still a prop — it is passed down to `ProfileSettingsList`.

- [ ] **Step 5: Replace the name block's mountain and skill elements**

Replace the two blocks that currently render the mountain line and the skill pill (`:623-631`, the `{profile?.favorite_mountain && ( … )}` and `{skillObj && ( … )}` blocks) with:

```jsx
          {heroSubtitle && (
            <div style={{ color: "var(--color-accent-soft)", fontSize: 12, fontWeight: 700, marginTop: 5 }}>
              🏔 {heroSubtitle}
            </div>
          )}

          {/* Edit profile — a pill inside the centred column, matching the mockup.
              The repo's 44px tap floor wins over the mockup's ~30px height. */}
          {isOwnProfile && (
            <button
              onClick={() => setShowEdit(true)}
              style={{
                marginTop: 12, minHeight: 44, padding: "0 20px", borderRadius: 999,
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                color: "var(--color-text-1)", fontSize: 12, fontWeight: 800, cursor: "pointer",
              }}
            >
              Edit profile
            </button>
          )}
```

- [ ] **Step 6: Delete the old button row**

Delete the whole `{/* Edit Profile + Share buttons — like Instagram */}` block (`:665-683`), from `{isOwnProfile && (` through its closing `)}`. Both of its buttons are now accounted for: Edit profile moved into the name block in Step 5, and Share Season was replaced by "Create share card" in Task 7.

- [ ] **Step 7: Verify**

Run: `grep -n "Share Season\|skillObj\|initials(" src/components/ProfilePage.jsx`
Expected: **no output.**

Run: `grep -n "setShowShare(true)" src/components/ProfilePage.jsx`
Expected: **exactly one hit** — the "Create share card" button. (The milestone modal's `onShare` also calls `setShowShare`, on the same line as `setShareFromMilestone(true)`; that line must still be there, so if you see two hits, check the second is the milestone one and leave it alone.)

- [ ] **Step 8: Lint, build, test**

Run: `npx eslint src/components/ProfilePage.jsx`
Expected: **`0 problems`** — both baseline errors are now gone.

Run: `npm run build`
Expected: success.

Run: `npm test`
Expected: **266 pass, 0 fail**.

- [ ] **Step 9: Manual check**

`npm run dev`, Profile. The hero is now: avatar with its camera badge (tap it — upload and remove still work), name with the sport emoji, `@handle`, one `🏔 Mountain · Skill` line, and a small "Edit profile" pill. **No door icon in the top-right corner** and **no "Share Season" button.** Sign out from Settings, then Account, and confirm it works. A profile with neither a favourite mountain nor a skill level shows no subtitle line at all (no stray separator).

- [ ] **Step 10: Commit**

```bash
git add src/components/ProfilePage.jsx
git commit -m "feat: mockup hero — one subtitle line, pill edit button, no sign-out icon"
```

---

## Task 10: Restyle the kept cards, and lock down the friend-view render matrix

Implements the spec's **Kept, restyled only** section (Season Passes card, Vehicle card, theme picker) and audits its **Friend-view profile** section end to end. This is the task where the own-profile and friend-profile branches of the same component are checked against each other — the failure mode this page is most exposed to.

**Files:**
- Modify: `src/components/ProfilePage.jsx` — the theme block, the Season Passes block, the Vehicle block, and a render-matrix comment above the `return`

**Interfaces:**
- Consumes: `THEME_OPTIONS` and `handleSelectTheme(themeName)` — both already in the file, unchanged.
- Produces: nothing new.

- [ ] **Step 1: Add a shared section-label constant**

Directly above the component's `return (`, add:

```jsx
  // One label style for every section heading below the stat stack, so Appearance,
  // Season Passes, Vehicle and Settings read as one list rather than four cards
  // that each invented their own heading.
  const sectionLabelStyle = {
    fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10,
  }
  const activeThemeKey = profile?.theme || "blizzard"
  const activeThemeLabel = THEME_OPTIONS.find((t) => t.key === activeThemeKey)?.label || "Blizzard"
```

- [ ] **Step 2: Restyle the theme picker as the mockup's Appearance card**

Replace the whole Theme block with the card below. It matches the mockup: heading outside, a "Theme" label plus the current theme's name inside on the left, swatches on the right. Swatch buttons are 40 by 44 — the visible dot is the mockup's 22px, but the tappable box meets the repo's 44px height floor.

```jsx
      {isOwnProfile && (
        <div>
          <div style={sectionLabelStyle}>Appearance</div>
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, padding: "10px 14px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
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
        </div>
      )}
```

- [ ] **Step 3: Restyle Season Passes and Vehicle to the same pattern**

Replace the Season Passes and Vehicle blocks with:

```jsx
      {/* ── Season Passes ── not in the mockup, but real user-entered data with
          nowhere else in the app to live, so it is restyled rather than cut.
          Renders on a friend's profile too, exactly as it did before this slice —
          only editing is owner-only, and editing lives in Edit Profile. */}
      {profile?.ski_passes?.length > 0 && (
        <div>
          <div style={sectionLabelStyle}>Season Passes</div>
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, padding: 14, display: "flex", flexWrap: "wrap", gap: 8,
          }}>
            {profile.ski_passes.map((p) => (
              <div key={p} style={{
                background: "var(--gradient-pass-pill)", color: "var(--color-pass-pill-text)",
                borderRadius: 999, padding: "7px 14px", fontWeight: 800, fontSize: 13,
              }}>
                {p}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Vehicle ── same reasoning as Season Passes. */}
      {profile?.vehicle_label && (
        <div>
          <div style={sectionLabelStyle}>{isOwnProfile ? "My Vehicle" : "Vehicle"}</div>
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, padding: 14, display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ fontSize: 24 }}>🚗</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "white" }}>{profile.vehicle_label}</div>
              {profile.vehicle_seats > 0 && (
                <div style={{ fontSize: 12, color: "var(--color-accent-soft)", marginTop: 2, fontWeight: 700 }}>
                  {profile.vehicle_seats} open seat{profile.vehicle_seats !== 1 ? "s" : ""} for passengers
                </div>
              )}
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Write the render matrix into the file**

Immediately above the component's `return (`, after the constants from Step 1, add:

```jsx
  /* Render matrix — what each of this component's two modes shows.
     Both modes come out of ONE component, and the friend mode is the one nobody
     clicks during review, so keep this table honest when you change the JSX.

       section              own profile   friend profile   why
       ------------------   -----------   --------------   -------------------------
       Back button          no            yes              onBack only exists there
       Hero                 yes           yes              same block
       Stats / Ski Plans    no            yes              friend view is the only
         selector                                          per-friend plan filter
       Stat strip           yes           yes              friend data comes from
       Extra facts          yes           yes              statsFromLeaderboardRow
       Season/All-Time      yes           no               needs getAllTimeStats,
         toggle                                            which is self-scoped
       Delta line           yes           no               needs last season's rows
       Season grid          yes           NO               needs per-day sessions,
                                                           never fetched for friends
       Create share card    yes           no               owner's card, owner's data
       History list         yes           no               getMySessions is self-scoped
       Appearance           yes           no               writes the viewer's profile
       Season Passes        yes           yes              display only (unchanged)
       Vehicle              yes           yes              display only (unchanged)
       Settings list        yes           NO               every row acts on the
                                                           signed-in user
       Edit / photo / share yes           no               owner-only modals
         / milestone modals

     Not-a-friend and stats-error cards stay friend-only and unchanged; a
     signed-out visitor who lands here through a profile link hits the
     stats-error card, because getLeaderboard() throws "Not authenticated." */
```

- [ ] **Step 5: Verify every owner-only section is actually gated**

Run: `grep -c "isOwnProfile" src/components/ProfilePage.jsx`
Expected: a count of at least 12.

Run: `grep -n "ProfileSettingsList\|SeasonCalendar\|RecentSessionsFeed\|StatsViewToggle\|Create share card\|Appearance" src/components/ProfilePage.jsx`
Expected: every one of those render sites sits inside an `isOwnProfile` branch. Read the surrounding lines and confirm it — this grep is a prompt to look, not a proof.

- [ ] **Step 6: Lint, build, test**

Run: `npx eslint src/components/ProfilePage.jsx`
Expected: `0 problems`.

Run: `npm run build`
Expected: success.

Run: `npm test`
Expected: **266 pass, 0 fail**.

- [ ] **Step 7: Manual check — both modes, back to back**

`npm run dev`.

**Own profile:** hero, toggle, five-stat strip, facts card, Season grid, share button, history list, Appearance, Season Passes, Vehicle, Settings. Switch the theme from the Appearance card and confirm the swatch ring moves, the app recolours, and the name under "Theme" updates.

**A friend's profile** (Crew, then Friends, then tap someone): Back button, hero, the Stats/Ski Plans selector, both strips — **and no toggle, no delta line, no Season grid, no share button, no history list, no Appearance card and no Settings list.** Their Season Passes and Vehicle still show if they have them. Switch to Ski Plans and confirm it lists only that friend's days.

**Someone who is not an accepted friend** (find one via search): the friends-only lock card, unchanged.

- [ ] **Step 8: Commit**

```bash
git add src/components/ProfilePage.jsx
git commit -m "feat: appearance card, restyled passes/vehicle, documented render matrix"
```

---

## Task 11: Whole-branch verification and roadmap bookkeeping

Closes TASK 22.0's last remaining page.

**Files:**
- Modify: `ROADMAP.md` (line 1462's TASK 22.0 heading, the "Profile page" entry at line 2206, and the Sprint 42 row at line 2332)

**Interfaces:**
- Consumes: everything Tasks 1-10 produced. Produces: nothing.

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: **266 pass, 0 fail** — 235 on the branch point, plus 12 (Task 1), 10 (Task 2) and 9 (Task 4). A higher number means someone else's tests landed; re-baseline against the merge-base rather than "fixing" it.

- [ ] **Step 2: Lint the touched paths, then the repo**

Run: `npx eslint src/components/ProfilePage.jsx src/components/ProfileStats.jsx src/components/SeasonCalendar.jsx src/components/profile/ src/lib/profileStats.js src/lib/profileForm.js src/lib/seasonGrid.js src/index.css`
Expected: **`0 problems`** — down from the 2 measured at the branch point.

Run: `npx eslint .`
Expected: **87 problems or fewer.** If it is higher, the new count is this branch's fault; fix it here rather than at review.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: success, with no new unresolved-import warnings.

- [ ] **Step 4: Confirm the non-goals really were not touched**

Run: `git diff --stat main...HEAD`

Expected changed files, and nothing else:

```
ROADMAP.md
docs/superpowers/plans/2026-09-08-profile-page-slice.md
src/App.jsx
src/components/ProfilePage.jsx
src/components/ProfileStats.jsx
src/components/SeasonCalendar.jsx
src/components/profile/ProfileSettingsList.jsx   (new)
src/components/profile/ProfileStatStrip.jsx      (new)
src/components/profile/SettingsSheet.jsx         (new)
src/index.css
src/lib/profileForm.js                           (new)
src/lib/profileForm.test.js                      (new)
src/lib/profileStats.js
src/lib/profileStats.test.js                     (new)
src/lib/seasonGrid.js                            (new)
src/lib/seasonGrid.test.js                       (new)
```

**Anything under `migrations/`, `supabase/` or `server/`, or any of `ShareStatCard.jsx`, `StravaConnect.jsx`, `StravaSyncReview.jsx`, `SessionEditForm.jsx`, `SkiPlansTab.jsx`, `PlanCalendar.jsx`, `ui/SnowStat.jsx`, `lib/socialApi.js` or `lib/leaderboardApi.js` appearing in that list is a scope violation — revert it.**

- [ ] **Step 5: Re-read the whole page top to bottom**

This step has no command: read `src/components/ProfilePage.jsx` end to end, once, with fresh eyes. Confirm: exactly one `SeasonCalendar` render site, exactly one `StatsViewToggle`, exactly one `RecentSessionsFeed`, four `upsertMyProfile(buildProfileUpdate(` calls, no `SKILL_OPTIONS` reference outside `EditProfileModal`, and the milestone block untouched.

- [ ] **Step 6: Update the TASK 22.0 heading in `ROADMAP.md`**

Replace line 1462's parenthetical so it ends with `Plans page DONE and live; Profile page DONE` instead of `Profile not yet started`.

- [ ] **Step 7: Replace the "Profile page" entry (line 2206)**

```markdown
3. **Profile page: ✅ SHIPPED 2026-09-08** — the last page in the TASK 22.0 sequence. Spec at
   `docs/superpowers/specs/2026-09-08-profile-page-slice-design.md`, plan at
   `docs/superpowers/plans/2026-09-08-profile-page-slice.md`, built in worktree
   `profile-page-slice`: 11 tasks. **Cut as duplicates:** the Ski Plans sub-tab on your OWN
   profile (the Plans nav tab's own agenda; kept on a friend's profile, which is the only
   per-friend plan filter in the app), the Trips and Friends header counts (shortcuts into
   tabs already in the bottom nav), the "Your Crew" avatar strip (a preview of the Crew tab's
   Friends list), and History's Calendar toggle (the new Season grid above it covers it).
   **Consolidated:** the hero's stat row and `SeasonStatsCard` both showed the same four
   numbers, so both were replaced by the mockup's 5-stat strip plus an extra-facts strip that
   preserves the non-duplicate facts (total runs, top speed, time on mountain, top resort,
   season-over-season delta). **Restyled:** `SeasonCalendar` became the mockup's fixed
   18-column grid graded by that day's vertical feet, with powder days pinned to the top tier;
   the theme picker became the mockup's Appearance card. **New:** an owner-only 5-row Settings
   list — Account (email plus Sign Out, relocated from the hero's door icon), Notifications
   (the powder-alert toggle and phone, relocated out of Edit Profile), Privacy & visibility
   ("Coming soon" only — the schema has no account-wide privacy concept and designing one is a
   separate task), Connected apps (wrapping `StravaConnect` unchanged) and Help & feedback
   (static FAQ plus a **placeholder** support address, `support@powdays.app` — replace it).
   **Bug found and fixed on the way:** `upsertMyProfile` writes a whole row, and Edit Profile's
   Save passed an object with no `username` and no `favorite_mountain`, so **every profile save
   was silently clearing both.** All four profile writes now go through the tested
   `buildProfileUpdate()` in `src/lib/profileForm.js`, which is also what makes moving the
   powder-alert fields to their own screen safe.
   Final state: **266 tests** (was 235: +12 profileStats, +10 seasonGrid, +9 profileForm), lint
   clean on every touched path (repo-wide at or under the 88 baseline), build clean.
   **NOT yet click-tested by Kyle** — same recurring gap as most TASK 22.0 slices at ship time.
   See "What Kyle must click through" in the plan; the friend-profile view and the
   Notifications-then-Edit-Profile round trip are the two that matter most.
```

- [ ] **Step 8: Update the Sprint 42 row (line 2332)**

```markdown
| **42** | **TASK 22.0 — Mockup fidelity pass**, page-by-page (Today done; Crew tab done — all 5 sub-tabs shipped; Plans page done; Profile page done — sequence complete) | TBD |
```

- [ ] **Step 9: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: Profile page slice shipped, TASK 22.0 sequence complete"
```

---

## What Kyle must click through

No subagent in this environment has a browser, and `npm test` covers `src/lib` only. `npm test`, `npx eslint .` and `npm run build` are the ceiling of automated verification for Tasks 3 and 5-10. These need a human on a real device:

1. **The whole own-profile page, top to bottom** — hero, season/all-time toggle, five-stat strip, facts card, Season grid, "Create share card", history list, Appearance, Season Passes, Vehicle, Settings. Nothing duplicated, nothing missing.
2. **Sign out** — it now lives only in Settings, then Account. Confirm the row shows your real email and that signing out works. **This is the highest-severity single check in the slice.**
3. **The Notifications round trip** — turn Powder Alerts on with a phone number and save; then open Edit Profile, change nothing, save; then reopen Notifications. **The toggle must still be on and the phone still set.** Also confirm your @handle and favourite mountain survive an Edit Profile save (they did not, before this branch).
4. **Connected apps** — the Strava card behaves as it did as a page card, and if you sync, the sync-review modal opens **on top of** the settings sheet.
5. **Privacy & visibility** — says "Coming soon" and does nothing else. Confirm you are happy shipping the row in that state.
6. **Help & feedback** — three FAQ answers plus `support@powdays.app`. **That address is a placeholder: give me the real one, or say to drop the line.**
7. **The Season grid** — a full Oct-May block with no horizontal scrolling; bigger days visibly darker; powder days mint; the Less-to-More legend legible. Tap a day with a session and one without. **The cells are about 14px (Deviation 3) — say so if they are too fiddly to hit;** widening them is one number.
8. **The All-Time toggle** — both strips change, the delta line disappears, and the grid deliberately stays on this season with its caption naming the season (Deviation 1). Confirm that reads as intended rather than as a bug.
9. **The share card** — "Create share card" produces exactly what the old "Share Season" button did.
10. **History** — no List/Calendar toggle; editing a session (photos, tags, stats) and sharing a session both still work.
11. **A friend's profile** — Back button, hero, the Stats/Ski Plans selector, both stat strips, their passes and vehicle if set. **No Season grid, no Settings, no Appearance, no share button, no history.** Ski Plans still shows only that friend's days.
12. **A non-friend's profile** — still the friends-only lock card.
13. **Theme check** — switch through all five themes from the Appearance card and confirm the stat strip labels, the grid tiers and the settings chevrons stay legible in each. The grid's tiers are theme-invariant by design; the rest are tokens.
14. **The hero's skill label** — it reads "Black Diamond" where the Edit Profile chip says "Black" (Deviation 4). Confirm that is fine, or say which spelling wins.

---

## Self-Review

**1. Spec coverage.** Every Design Decision and Non-goal in `2026-09-08-profile-page-slice-design.md` maps to a task:

| Spec item | Task |
|---|---|
| Hero #1 avatar and photo-upload flow unchanged | untouched by every task; Task 9 Step 9 re-checks it by hand |
| Hero #2 name plus sport emoji unchanged | untouched (Task 9 edits only the blocks below it) |
| Hero #3 one mountain-dot-skill line replacing two elements | 9 (Steps 2, 5) |
| Hero #4 username line kept | untouched, verified in Task 9 Step 9 |
| Hero #5 Edit profile becomes a pill | 9 (Step 5) |
| Hero #6 sign-out icon relocated into Account | 5 (AccountSheet) then 9 (Step 4) |
| Hero #7 Share Season removed, its days-greater-than-zero gate moves with it | 7 (Step 5) then 9 (Step 6) |
| Stack #1 five-stat header strip replacing both old sources | 7 (Steps 1, 4) plus 6 (Step 2) for the old hero row |
| Stack #2 extra-facts strip plus season delta | 7 (Steps 1, 4), 1 (`seasonDeltaLabel`) |
| Stack #3 one toggle governs strips and grid | 7 (Steps 3, 4), 8 (Step 1) — grid pinned per Deviation 1 |
| Stack #4 fixed-column grid, vertical-feet tiers, powder top tier, legend | 2 (logic), 3 (component and tokens) |
| Stack #4 grid becomes the page's only day grid; History's Calendar toggle removed | 8 (Steps 1-4) |
| Stack #5 full-width "Create share card" | 7 (Step 5) |
| History list only, per-session edit and share unchanged | 8 (Step 2) |
| Cut own-profile Ski Plans sub-tab | 6 (Steps 3, 4) |
| Cut Trips/Friends header counts | 6 (Steps 1, 2) |
| Cut "Your Crew" strip | 6 (Step 5) |
| Kept: Season Passes and Vehicle cards, restyled | 10 (Step 3) |
| Kept: theme picker, restyled | 10 (Step 2) |
| Kept: Edit Profile minus the powder-alert fields | 5 (Step 3) |
| Kept: milestone modal unchanged | Global Constraints; verified in Task 11 Step 5 |
| Settings row 1 Account (email plus Sign Out) | 5 (AccountSheet) |
| Settings row 2 Notifications (relocated powder alerts) | 5 (NotificationsSheet), 4 (safe write) |
| Settings row 3 Privacy, "Coming soon" only, no schema | 5 (PrivacySheet) |
| Settings row 4 Connected apps wrapping StravaConnect | 5 (ConnectedAppsSheet) |
| Settings row 5 Help and feedback, placeholder copy | 5 (HelpSheet) |
| Friend view: both strips shown, from the existing leaderboard row | 1 (`statsFromLeaderboardRow`), 7, 10 (matrix) |
| Friend view: NO Season grid | 8 (Step 1 gate), 10 (matrix) |
| Friend view: Ski Plans kept, and only here | 6 (Steps 3, 4) — Deviation 2 |
| Friend view: no settings, no sign out, no theme, no owner editing | 5 (Step 5 gate), 10 (Step 2 gate and matrix) |
| Friend view: notFriends/statsError gating unchanged | untouched; Task 10 Step 7 re-checks by hand |
| Non-goal: no privacy schema, no friend-session query, no changes to the six reused components | Global Constraints; Task 11 Step 4 diff check |
| Testing: computeStats and new pure logic get node --test; component work is not covered | 1, 2, 4 (tests); 3 and 5-10 each state the gap and give a manual check instead |

**Gaps found and closed while reviewing:** the spec left the All-Time-versus-grid question open, so it is answered in writing as Deviation 1 rather than left to the implementer; the spec did not say how the friend view reaches Ski Plans once the shared selector is gone, hence Deviation 2; `SeasonStatsCard`'s "no days logged yet" empty state and its "Miles Skied" tile are both preserved (Task 7 Step 4 keeps the copy, and Miles moved into the header strip) so nothing the old card showed is lost; deleting `SeasonStatsCard` would have orphaned `ui/SnowStat.jsx`, so `ProfileExtraFacts` reuses it instead of the plan deleting a shipped component; the file's two pre-existing lint errors sit inside code this slice rewrites, so they are folded into Tasks 4 and 9 rather than left to trip the final lint gate; and the support email the spec asked Kyle to correct was still unanswered, so it is isolated in one constant and raised again in the click-through list.

**2. Placeholder scan.** No "TBD", no "implement later", no "add appropriate error handling", no "write tests for the above", no "similar to Task N". Every code step carries literal code, and every grep, npm and npx step states its expected output. The one string in the plan that is deliberately a placeholder — `support@powdays.app` — is labelled as such in the Global Constraints, in a code comment and in the click-through list, because the spec explicitly left it to Kyle.

**3. Type and signature consistency.** Cross-checked across tasks:

- `seasonDeltaLabel(stats, priorStats)` returning a string or null — defined and tested in Task 1, called once in Task 7 Step 3 as `seasonDeltaLabel(seasonStats, priorStats)`, and rendered through `ProfileExtraFacts`' `deltaLabel` prop, which Task 7 Step 1 declares with a null default. One spelling throughout.
- `statsFromLeaderboardRow(row)` — defined in Task 1, called once in Task 1 Step 5. Its nine output keys are exactly the keys `ProfileStatStrip` and `ProfileExtraFacts` read (`days`, `vertical`, `miles`, `powderDays`, `resorts`, `totalRuns`, `topSpeed`, `timeOnMountain`, `topResort`), and a test asserts they equal `computeStats`' keys.
- `buildProfileUpdate(profile, changes)` — defined in Task 4, called at exactly five sites: four in `ProfilePage.jsx` (Task 4 Step 5) and one in `NotificationsSheet` (Task 5 Step 2). Task 4 Step 7's grep proves no bare-object write survives.
- `sessionTier(session)`, `seasonDayKeys(startYear)`, `SEASON_GRID_COLUMNS` — defined in Task 2, consumed only by Task 3, where `TIER_COLORS[sessionTier(session)]` indexes an array whose five entries match the five tokens Task 3 Step 1 adds. Tier count, token count and legend swatch count are all five.
- `SeasonCalendar({ sessions, startYear })` — signature unchanged by Task 3, and Task 8 Step 1 passes exactly `sessions={recentSessions}` and `startYear={season.startYear}`, the same pair the pre-slice call site used.
- `SettingsSheet({ title, onClose, children })` — defined in Task 5 Step 1, used by all five sheet bodies in Step 2 with exactly those props.
- `ProfileSettingsList({ profile, email, onLogOut, onProfileSaved })` — declared in Task 5 Step 2, rendered in Task 5 Step 5 with `profile`, `email={currentUserEmail}`, `onLogOut` and `onProfileSaved={load}`. `currentUserEmail` is declared in Task 5 Step 4 and set in exactly one place, which Task 6 Step 1 preserves when it rewrites the same `Promise.all`.
- `ProfilePage({ onLogOut, userId, onBack, resorts })` — Task 6 Step 6 removes `onTabChange` from the signature and from both `App.jsx` call sites in the same commit, so no call site ever passes a prop the component does not declare.
- `profileTab` and `setProfileTab` survive Task 6 and are read only inside `!isOwnProfile` branches; `historyView` is deleted outright in Task 8 Step 3, and Task 8 Step 5's grep fails loudly if any reference remains.
- `sectionLabelStyle`, `activeThemeKey` and `activeThemeLabel` — declared in Task 10 Step 1, used in Steps 2 and 3 only.
- `allTimeSelected` and `activeStats` — declared in Task 7 Step 3 and used in Step 4 behind the loading guard, so `activeStats` is never dereferenced while `allTimeStats` is still null.

**4. Sequencing.** Tasks 1, 2 and 4 are pure and independently testable. Task 3 restyles the grid where it already renders, so it is verifiable before Task 8 moves it. Task 5 lands Sign Out before Task 9 deletes the door icon; Task 7 lands "Create share card" before Task 9 deletes "Share Season"; Task 4 lands the whole-row write fix before Task 5 splits the powder-alert fields onto a second screen. Every task ends with a working page and a commit.
