# Crew Tab — Feed Sub-Tab Slice C2 Implementation Plan (Next-Login Nudge)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After login, if the user's single most recent ski day (within 7 days) has no title, no photos and no tags, show a dismissible banner on the Today tab that opens a small modal wrapping the already-shipped `SkiDayDetailsForm` — and make that save also backfill the missing `activity_feed` row for days logged by the "Arrived" check-in trigger, which never get one.

**Architecture:** Three new files and one three-line edit to an existing render tree. `src/lib/skiDayNudge.js` is a new pure, unit-tested module holding the two decision rules (the 7-day recency window and the "all three empty" test) plus the localStorage key builder. `src/lib/socialApi.js` gains one additive read function, `getRecentIncompleteSession()`, which uses those rules. `NudgeBanner.jsx` self-fetches once per `currentUser.id` and renders nothing unless there is a candidate that has not been dismissed; `NudgeDetailsModal.jsx` is a thin shell around the existing `SkiDayDetailsForm` that calls the existing `saveSkiDayDetails()` and then the existing `logActivityOnce()`. **No migration, no new table, no new RLS policy, no new npm dependency, and `App.jsx` is not touched at all.**

**Tech Stack:** React 19 (inline `style={{}}` objects, no CSS framework), Supabase (Postgres + RLS, read-only from this slice), `node --test` for pure-logic unit tests (`npm test` runs `node --test src/lib/*.test.js`).

---

## ⚠️ Spec Corrections — read all five before Task 1

Every claim in the design spec's "Current State (verified against source)" section was re-derived against the real files in this repo on 2026-09-03, not taken from the spec's paraphrase. Feed-A's plan-writing pass found wrong `ski_sessions` column names; Feed-B's found a wrong table on the report path; Feed-C1's found six errors including a migration that would not have compiled. This is that pass for Feed-C2. **Three of the five below change code you would otherwise write wrong.**

### Correction 1 — the 7-day cutoff must be built from LOCAL date parts, never `toISOString()`

The spec says the query is "filtered to `session_date >= (today - 7 days)`" but never says how that date is computed. The two obvious JS spellings are both wrong here:

```js
new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)   // WRONG (twice over)
```

- **`toISOString()` is UTC.** `src/lib/calendarDates.js`'s own file header says it outright: *"Date keys are ALWAYS built from local date parts, never toISOString(). Using toISOString() shifts every cell one day east of Greenwich for anyone in a negative-offset timezone (i.e. all of Colorado)."* `App.jsx:675-677` repeats the same warning on the write side of this exact column: *"A UTC key would log an evening session as tomorrow — night skiing starts after the UTC rollover in Mountain Time."* Concretely, at 19:00 MST the UTC date is already tomorrow, so a UTC-derived cutoff is one day too new and silently drops a session skied exactly seven days ago — the boundary case the window exists to catch.
- **`- 7 * 864e5` is not DST-safe.** Across the 2026-03-08 spring-forward, subtracting 7×24h of milliseconds from local noon lands at 11:00 on the target day, which is fine, but subtracting it from a time before 01:00 lands on the *previous* calendar day. Date-part arithmetic (`new Date(y, m, d - 7)`) has no such failure mode — the `Date` constructor normalises day overflow across months, years and leap days without ever touching a clock offset.

**The fix, in Task 1:** `nudgeCutoffDateKey()` builds the cutoff with `new Date(y, m, d - NUDGE_RECENCY_DAYS)` and formats it through the existing `localDateKey()` from `src/lib/calendarDates.js`. Task 1's tests pin the month-boundary, year-boundary, leap-year and DST cases so a later "simplification" back to `toISOString()` fails the suite.

**Also pinned down, because the spec's "within the last 7 days" is ambiguous:** the window is `session_date >= today − 7 days`, **inclusive at the far edge** (a day skied exactly 7 days ago IS nudged; 8 days ago is not) and **with no upper bound**. The missing upper bound is deliberate, not an oversight: the DB query is a single `.gte(...)` and the JS helper must agree with it exactly, so adding a `<= today` clause to only one of them is how the two drift apart. A future-dated `session_date` is rare (`socialApi.js:1794-1795` guards one writer with `if (skiDate > today) return`) and harmless if nudged.

### Correction 2 — drop the `activity_feed`-row-exists flag entirely; call `logActivityOnce` unconditionally

The spec's §Design step 4 says `getRecentIncompleteSession()` should return the session *"plus a flag for whether it already has an `activity_feed` row (a cheap existence check: `activity_feed.select("id").eq("subject_id", id).limit(1)`) — this flag decides whether the eventual save needs to backfill."*

`logActivityOnce` **already does exactly that check, itself, better.** Its real implementation (`src/lib/socialApi.js:3875-3899`, read in full while writing this plan):

```js
export async function logActivityOnce(type, { subjectId = null, subjectType = null, metadata = null } = {}) {
  try {
    if (!subjectId) return logActivity(type, { subjectId, subjectType, metadata })
    const user = await getCurrentUser()
    const { data: existing } = await supabase
      .from("activity_feed")
      .select("id")
      .eq("actor_id", user.id)
      .eq("type", type)
      .eq("subject_id", subjectId)
      .limit(1)
      .maybeSingle()
    if (existing) return
    await logActivity(type, { subjectId, subjectType, metadata })
  } catch (e) {
    console.warn("logActivityOnce failed", e) // non-blocking, same as logActivity
  }
}
```

So the spec's flag is three separate losses:

1. **It runs at the wrong time.** The flag's query fires at *load* time for every nudge candidate, on every Today-tab mount, whether or not the user ever opens the modal. `logActivityOnce`'s runs only on an actual save.
2. **It is LOOSER than the check that actually decides, in the dangerous direction.** The spec's filter is `subject_id` only. `logActivityOnce`'s is `actor_id AND type AND subject_id`. Any row the spec's check sees that `logActivityOnce`'s would not sets the flag to `true` and **skips a backfill that was still needed** — i.e. it silently re-opens the exact invisible-session gap this whole slice exists to close. (Under `activity_feed`'s SELECT policy the caller can also see *friends'* rows, so a looser `subject_id`-only match is not hypothetically safe by construction either.)
3. **It costs plumbing for zero behaviour.** The flag has to be returned by the query function, held in `NudgeBanner`'s state, and passed as a prop into `NudgeDetailsModal`, all to decide something `logActivityOnce` decides on its own.

**The fix, in Tasks 2 and 3:** `getRecentIncompleteSession()` returns the session row and nothing else. `NudgeDetailsModal` calls `logActivityOnce("ski_session", {...})` **unconditionally** after a successful `saveSkiDayDetails()`. For a day that already has a feed row this is one cheap select and an early return; for a check-in-only day it inserts the missing row. Identical outcomes, one fewer query, one fewer prop, and the dedupe rule lives in exactly one place.

**The RLS question the flag raised still has to be answered**, because `logActivityOnce` performs that read itself — it is verified in Task 2 Step 6, and the answer is that it is safe: `activity_feed`'s only SELECT policy (`migrations/013_activity_feed.sql:22-31`) leads with `actor_id = auth.uid()`, so a user can always see their own rows.

### Correction 3 — hook the nudge to a `currentUser`-keyed effect inside the banner, NOT to `loadHeaderUser()`

The spec's Current State says *"Hook point: `App.jsx`'s `loadHeaderUser()` (`:832-859`)… the existing onboarding-flow gate (`:849-851`, `showOnboarding` state) is the established precedent."* **Both line citations are exactly right** — `loadHeaderUser` really is `App.jsx:832-859`, and the onboarding gate really is `:849-851`, rendering `<OnboardingFlow>` at `:1280-1282`. But it is still the wrong place to put this, for a reason only visible one screen further down the file.

`loadHeaderUser` is registered as the `supabase.auth.onAuthStateChange` handler (`App.jsx:970-991`) and **re-runs on every auth event** — `INITIAL_SESSION`, `SIGNED_IN`, `USER_UPDATED`, and `TOKEN_REFRESHED`, which Supabase fires roughly hourly for as long as the tab stays open — plus explicitly from `handleAuthSuccess` (`:872`), `handleOnboardingComplete` (`:892`) and `handlePasswordResetSuccess` (`:897`). The onboarding gate can live there because it is a synchronous `localStorage.getItem` with no cost. A nudge probe is up to **three network round-trips** (session select + photos + tags) and would re-fire on every token refresh, forever.

The genuinely established pattern for "after `currentUser` resolves, go fetch something" is the block of effects immediately below, `App.jsx:993-1020` — `friendTripsByResort`, `myTodayPlan` and `friendIds` are each a `useEffect(..., [currentUser])` with a `cancelled` guard. And on this exact surface, `AddToHomeScreenNudge` (`TodayScreen.jsx:333-361`) already does the component-local version: it takes `currentUser` as a prop and runs its own effect.

**The fix, in Task 4:** `NudgeBanner` owns its own effect, keyed on `currentUser?.id` (not the `currentUser` object, whose identity changes on every `loadHeaderUser()` call). `TodayScreen` already receives `currentUser` as a prop (`TodayScreen.jsx:507`) and already passes it to `AddToHomeScreenNudge` at `:542`. **`App.jsx` is not modified by this slice at all.**

### Correction 4 — `initialTitle` must be `""`, never omitted, or the title field silently disappears

The spec says the modal seeds `initialTitle=""`, and that is **correct** — but it is load-bearing in a way that fails silently, so it is called out here. `SkiDayDetailsForm.jsx:67` is:

```js
const showTitle = initialTitle !== undefined
```

Omit the prop and the entire title section is not rendered, and `handleSave` emits `title: undefined` (`:161`), which `saveSkiDayDetails` skips (`socialApi.js:4386`, `if (title !== undefined)`). The nudge's own banner copy promises "Add a title" first, and the form would not have one. There is no error, no warning, and no test in this repo that would catch it.

**Verified as written, do not change:** `saveSkiDayDetails(sessionId, diff)` takes `diff = { title, addedPhotoFiles, removedPhotoIds, tagUserIds }` and returns `{ photos, tags }` (`socialApi.js:4381-4418`). `SkiDayDetailsForm`'s props are exactly `{ initialTitle, initialPhotos, initialTags, saving = false, onSave, onSkip }` (`:59-66`); `onSkip` is optional and renders a "Skip" button when supplied; `initialPhotos`/`initialTags` default safely to `[]` internally (`:70`, `:75`).

### Correction 5 — `.order("session_date", …)` alone is not deterministic; add a `created_at` tiebreak

The spec's query is `.eq("user_id", user.id).order("session_date", { ascending: false }).limit(1)`. A user can genuinely have **two rows with the same `session_date`**: the unique constraint is `(user_id, session_date, resort_name)` (`supabase/migrations/20260515_ski_sessions.sql:21`), so two resorts in one day are two rows — and `migrations/039_arrival_counts_as_ski_day.sql:30` documents that `'vail'` and `'Vail'` are *also* two different rows, with `App.jsx:948-951`'s comment confirming both spellings exist in production data ("display names for real logged sessions but raw resort keys for trip-derived rows"). `.limit(1)` over a tie picks arbitrarily and can flip between page loads, which means the *dismissal* also flips: the user dismisses row A, reloads, and gets nudged for row B on the same day.

**The fix, in Task 2:** add `.order("created_at", { ascending: false })` as a secondary sort, so the most recently written of a same-day pair wins, stably.

### Verified as written — do NOT "correct" these

- **`OffseasonBanner` is `TodayScreen.jsx:403-478`**, exactly as cited, and its dismiss shape is exactly as described: `useState(() => { try { return localStorage.getItem("pd_offseason_banner_26") === "1" } catch { return false } })` seeding, and `try { localStorage.setItem("pd_offseason_banner_26", "1") } catch {}` + `setDismissed(true)` in the ✕ handler. Both reads and both writes are inside `try/catch` — Safari private mode throws on `localStorage`, and an uncaught throw here would blank the whole Today tab.
- **It mounts at `TodayScreen.jsx:543`**, second in a two-banner block directly under `return (<>`, after `<AddToHomeScreenNudge currentUser={currentUser} sessionActive={sessionActive} />` at `:542` and above the `List | Map` segmented pill. `NudgeBanner` goes on line 544, third in that block.
- **`ski_sessions` has `session_date DATE NOT NULL`, `title TEXT`, and `unique (user_id, session_date, resort_name)`.** Base table: `supabase/migrations/20260515_ski_sessions.sql:5-22`. `title` was added by `migrations/046_ski_day_details.sql:83-87` with `CHECK (title IS NULL OR char_length(title) <= 60)`. `session_date` is the ski day; `created_at` is when the row was written. The spec is right that this feature sorts and windows by `session_date`.
- **`getSessionPhotos(sessionIds)` is `socialApi.js:4152-4165` and `getSessionTags(sessionIds)` is `:4246-4264`** — both exactly as the spec cites, both genuinely array-taking (`if (!sessionIds?.length) return []` then `.in("session_id", sessionIds)`), both returning a **flat array** of rows (not a map, not grouped). `getSessionPhotos` rows are `{ id, session_id, user_id, storage_path, created_at, url }`; `getSessionTags` rows are `{ id, session_id, tagged_user_id, tagged_by, created_at, profiles }`. Callers with one session pass `[sessionId]` and read `.length`.
- **`logActivityOnce(type, { subjectId, subjectType, metadata })` is `socialApi.js:3875`**, exactly as cited, and is genuinely safe to call from a new site: it dedupes on `(actor_id, type, subject_id)`, and its entire body is wrapped in `try { … } catch (e) { console.warn(…) }` so it **never throws** — a feed-logging failure cannot break the user's real action. Its two existing call sites are `App.jsx:702-710` (GPS session end) and `LeaderboardPage.jsx` (manual log), and both pass `metadata: { resort_name, is_powder_day }`. This slice's call copies that metadata shape exactly.
- **Migration 039's `log_session_on_arrival()` is `migrations/039_arrival_counts_as_ski_day.sql:85-104` and genuinely only ever writes `ski_sessions`.** Its whole body is one guard (`IF NEW.resort_key IS NULL OR NEW.resort_key = 'open' THEN RETURN NEW`) and one `INSERT INTO ski_sessions (user_id, resort_name, session_date, is_powder_day) VALUES (…) ON CONFLICT (user_id, session_date, resort_name) DO NOTHING`. The string `activity_feed` does not appear anywhere in that file. The spec's stated reason for C2's backfill is correct.
- **`activity_feed`'s SELECT policy lets a user always see their own rows.** `migrations/013_activity_feed.sql:22-31`, `"Friends and self view activity"`, `USING (actor_id = auth.uid() OR EXISTS (… friend_requests …))`. Migration 045 replaced the SELECT policy on `activity_feed_reactions`, **not** on `activity_feed` itself — 013's is still the only one. Task 2 Step 6 re-greps this rather than trusting the sentence.
- **`saveSkiDayDetails` + `SkiDayDetailsForm` have a real, working precedent to copy**: `SessionRecapModal.jsx:59-124` and `:179-209`. Its `handleSaveDetails(diff)` — `setSaving/setError/await saveSkiDayDetails/catch → setError(err.message)/finally → setSaving(false)` — is the shape Task 3 reproduces, and its overlay/card styling is the shell Task 3 copies.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **7-day recency window.** `NUDGE_RECENCY_DAYS = 7`. A session qualifies when `session_date >= today − 7 days`, **inclusive** (exactly 7 days ago qualifies; 8 does not), with **no upper bound**. The cutoff is built from **local date parts** via `localDateKey()`, never `toISOString()` and never millisecond subtraction (Correction 1). The same constant governs both the JS helper and the Supabase `.gte(...)`; there is exactly one definition of it.
- **"Incomplete" means title AND photos AND tags are ALL empty.** Not "any one missing". A blank/whitespace-only title counts as empty (matching `clampTitle`'s trim and `updateSessionTitle`'s `clamped || null`). A user who set any one of the three has touched the feature and is never nudged.
- **Dismissal is per-session, in `localStorage`, key `pd_nudge_dismissed_<sessionId>`.** Value `"1"`, mirroring `pd_offseason_banner_26`. Dismissing one session must never suppress a future session's nudge. **Every `localStorage` read and every write is wrapped in `try/catch`** — Safari private mode throws, and an uncaught throw on the Today tab blanks the page.
- **Saving counts as dismissing.** A successful save writes the same dismissal key, so the banner does not reappear for that session.
- **No `notifications` table row, ever.** The dismissible banner is the entire mechanism. This slice writes to exactly two tables, both through existing functions: `ski_sessions`/`ski_session_photos`/`ski_session_tags` via `saveSkiDayDetails`, and `activity_feed` via `logActivityOnce`. No new writer is introduced.
- **Single most recent session only.** No "you have 3 incomplete days" batch view, no list, no second banner. Exactly one candidate or none.
- **No migration, no schema change, no new or altered RLS policy.** If a task seems to need one, stop and report — it means the plan is wrong, not that a migration should be improvised.
- **No new npm dependencies.**
- **No change to the arrival trigger** (`migrations/039`), to `SkiDayDetailsForm`, to `saveSkiDayDetails`, to `logActivityOnce`, or to `App.jsx`. The backfill happens only from the new modal's save path.
- **No realtime subscription.** No lightbox, no photo click handler (`SkiDayDetailsForm` already enforces this).
- **Inline `style={{}}` objects**; semantic/stateful colours via `var(--color-*)` / `var(--gradient-*)` tokens. This slice introduces no new hardcoded colour token.
- **Never call `setState` synchronously in a `useEffect` body.** `react-hooks/set-state-in-effect` is an **error** in this repo's ESLint config and there are already 10 of them in the baseline — do not add an eleventh. Setting state inside an async `.then()` callback is fine (`SessionRecapModal.jsx:98-100` does it and is clean). Seeding from `localStorage` goes in a `useState(() => …)` lazy initialiser, exactly as `OffseasonBanner` does.
- **Re-verify the baseline in the fresh worktree before starting — do not trust these numbers.** Observed on `main` at commit `aa08c22`, 2026-09-03: **191 tests passing / 96 lint problems (88 errors, 8 warnings)**. Record what you actually observe and compare against it. Do not "fix" pre-existing lint errors incidentally.
- **No subagent in this environment has browser or Supabase-auth tooling.** Every task is verified via `npm test` / `npx eslint .` / `npm run build` / diff review only — say so plainly in each task report; do not imply a browser or live-database check happened. The two things that genuinely need a human are listed in Task 6 Step 5.
- **Ask before pushing to `main`** — it auto-deploys to `powdays.app` live with no staging step. This plan's execution stays on its worktree branch; merging happens only after Kyle signs off.

---

## File Structure

| File | Change |
|---|---|
| `src/lib/skiDayNudge.js` | *new* — pure `NUDGE_RECENCY_DAYS`, `nudgeCutoffDateKey`, `isWithinNudgeWindow`, `isSessionUntouched`, `nudgeDismissKey`. Imports only `localDateKey` from `./calendarDates` (itself import-free). |
| `src/lib/skiDayNudge.test.js` | *new* — 16 `node --test` cases |
| `src/lib/socialApi.js` | *modify (additive)* — one new import line at the top, and `getRecentIncompleteSession()` inserted after `saveSkiDayDetails` (which ends at line 4418) and before the `// ─── Mountain Board` divider (line 4420) |
| `src/components/NudgeDetailsModal.jsx` | *new* — overlay shell + `SkiDayDetailsForm` + save handler that calls `saveSkiDayDetails` then `logActivityOnce` |
| `src/components/NudgeBanner.jsx` | *new* — self-fetching dismissible banner, owns the modal's open state |
| `src/components/TodayScreen.jsx` | *modify* — one import line, one `<NudgeBanner currentUser={currentUser} />` on line 544 |
| `src/components/SkiDayDetailsForm.jsx` | *unmodified* — consumed exactly as shipped in Feed-C1 |
| `src/lib/skiDayDetails.js` | *unmodified* — its file header states it imports NOTHING on purpose; the nudge helpers need `localDateKey`, so they get their own module rather than breaking that invariant |
| `src/App.jsx` | *unmodified* — see Correction 3 |
| `migrations/` | *unmodified* — no migration in this slice |

**Why `NudgeBanner` and not a second consumer of `SessionRecapModal`:** `SessionRecapModal` is the GPS end-of-session recap; it carries runs, stats, GPX export, Strava upload and a share card, and it loads photos and tags before mounting the form. The nudge needs none of that and is opened from a banner, not from a completed GPS flow. `NudgeDetailsModal` is ~90 lines and shares the only thing that matters — `SkiDayDetailsForm` and `saveSkiDayDetails`.

---

### Task 0 (setup): Isolated worktree + recorded baseline

**Files:** none created or modified.

**Interfaces:**
- Consumes: nothing.
- Produces: a branch `worktree-crew-tab-feed-slice-c2` and two recorded numbers every later task compares against.

- [ ] **Step 1: Create the worktree**

Use the `superpowers:using-git-worktrees` skill to create an isolated worktree off `main` on branch `worktree-crew-tab-feed-slice-c2`. Every subsequent task runs inside that worktree. Nothing in this plan runs in the main checkout.

- [ ] **Step 2: Install and record the test baseline**

```bash
npm install
npm test 2>&1 | tail -8
```

Expected shape (numbers may differ — record what you actually see):

```
ℹ tests 191
ℹ pass 191
ℹ fail 0
```

- [ ] **Step 3: Record the lint baseline**

```bash
npx eslint . 2>&1 | tail -1
```

Expected: `✖ 96 problems (88 errors, 8 warnings)`

These are **pre-existing** and are not this slice's job. Do not fix them. The only rule that matters here is that the counts must not go **up**.

- [ ] **Step 4: Record the build baseline**

```bash
npm run build 2>&1 | tail -5
```

Expected: a successful Vite build with no errors.

- [ ] **Step 5: Report**

Report the three observed numbers (tests passing, lint problems/errors/warnings, build ok/not-ok) and the worktree path. State plainly that no browser or database check was performed.

---

### Task 1: `src/lib/skiDayNudge.js` — the two decision rules, as pure tested functions

**Files:**
- Create: `src/lib/skiDayNudge.js`
- Create: `src/lib/skiDayNudge.test.js`

**Interfaces:**
- Consumes: `localDateKey(d)` from `src/lib/calendarDates.js` (exists, `:19-21`, returns `"YYYY-MM-DD"` built from **local** date parts).
- Produces (Tasks 2 and 4 both import from here):
  - `NUDGE_RECENCY_DAYS: number` — `7`.
  - `nudgeCutoffDateKey(now?: Date): string` — the oldest `session_date` still inside the window, as a `"YYYY-MM-DD"` key.
  - `isWithinNudgeWindow(sessionDateKey: unknown, now?: Date): boolean`.
  - `isSessionUntouched(input?: { title?: string|null, photos?: Array|null, tags?: Array|null }): boolean`.
  - `nudgeDismissKey(sessionId: unknown): string|null` — `"pd_nudge_dismissed_<id>"`, or `null` for a falsy id.

- [ ] **Step 1: Write the failing test file**

Create `src/lib/skiDayNudge.test.js` with exactly this content:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  NUDGE_RECENCY_DAYS,
  nudgeCutoffDateKey,
  isWithinNudgeWindow,
  isSessionUntouched,
  nudgeDismissKey,
} from "./skiDayNudge.js"

// ── nudgeCutoffDateKey ──────────────────────────────────────────────────────
//
// Every Date below is constructed from LOCAL parts (new Date(y, mIndex, d, …)),
// so every expected key holds in every timezone the test runner might be in.

test("NUDGE_RECENCY_DAYS is 7", () => {
  assert.equal(NUDGE_RECENCY_DAYS, 7)
})

test("nudgeCutoffDateKey returns the local date exactly 7 days back", () => {
  assert.equal(nudgeCutoffDateKey(new Date(2026, 2, 10, 12, 0)), "2026-03-03")
})

test("nudgeCutoffDateKey crosses a month boundary", () => {
  // 2026-03-05 minus 7 days walks back through Mar 1 into February, which has 28
  // days in 2026. Off-by-one here silently changes who gets nudged.
  assert.equal(nudgeCutoffDateKey(new Date(2026, 2, 5)), "2026-02-26")
})

test("nudgeCutoffDateKey crosses a year boundary", () => {
  assert.equal(nudgeCutoffDateKey(new Date(2026, 0, 3)), "2025-12-27")
})

test("nudgeCutoffDateKey handles a leap February", () => {
  // 2028 is a leap year, so Feb has 29 days and 2028-03-05 minus 7 is Feb 27,
  // not Feb 26 as it would be in a common year.
  assert.equal(nudgeCutoffDateKey(new Date(2028, 2, 5)), "2028-02-27")
})

test("nudgeCutoffDateKey is DST-safe across America/Denver's spring forward", () => {
  // Denver springs forward at 02:00 on 2026-03-08. Computing this cutoff as
  // `Date.now() - 7 * 864e5` from 2026-03-10T00:30 local lands on 2026-03-02,
  // one day early, because the interval spans a 23-hour day. Date-part
  // arithmetic never touches a clock offset, so it stays on 2026-03-03.
  assert.equal(nudgeCutoffDateKey(new Date(2026, 2, 10, 0, 30)), "2026-03-03")
})

// ── isWithinNudgeWindow ─────────────────────────────────────────────────────

const NOW = new Date(2026, 2, 10, 9, 0) // cutoff is 2026-03-03

test("isWithinNudgeWindow includes a session skied exactly 7 days ago", () => {
  // The inclusive far edge is the whole point of the window: someone who skied a
  // week ago and has not opened the app since is precisely who this nudges.
  assert.equal(isWithinNudgeWindow("2026-03-03", NOW), true)
})

test("isWithinNudgeWindow excludes a session skied 8 days ago", () => {
  assert.equal(isWithinNudgeWindow("2026-03-02", NOW), false)
})

test("isWithinNudgeWindow includes today, and does not cap the future", () => {
  assert.equal(isWithinNudgeWindow("2026-03-10", NOW), true)
  // Deliberate: the DB query is a single .gte(), and a JS upper bound the query
  // does not have is how the two drift apart.
  assert.equal(isWithinNudgeWindow("2026-03-11", NOW), true)
})

test("isWithinNudgeWindow rejects a non-date string instead of comparing it", () => {
  // Without the format guard this is TRUE: "not-a-date" > "2026-03-03" is a
  // perfectly ordinary lexicographic comparison, and a garbage session_date
  // would nudge forever.
  assert.equal(isWithinNudgeWindow("not-a-date", NOW), false)
})

test("isWithinNudgeWindow rejects an unpadded date key", () => {
  // "2026-3-3" is the same day as "2026-03-03" but sorts AFTER "2026-12-31",
  // so accepting it would break the comparison for every other input too.
  assert.equal(isWithinNudgeWindow("2026-3-3", NOW), false)
})

test("isWithinNudgeWindow rejects null, undefined, empty string and non-strings", () => {
  assert.equal(isWithinNudgeWindow(null, NOW), false)
  assert.equal(isWithinNudgeWindow(undefined, NOW), false)
  assert.equal(isWithinNudgeWindow("", NOW), false)
  assert.equal(isWithinNudgeWindow(20260303, NOW), false)
})

// ── isSessionUntouched ──────────────────────────────────────────────────────

test("isSessionUntouched is true only when title, photos and tags are ALL empty", () => {
  assert.equal(isSessionUntouched({ title: null, photos: [], tags: [] }), true)
  assert.equal(isSessionUntouched({ title: null, photos: null, tags: null }), true)
  assert.equal(isSessionUntouched({}), true)
  assert.equal(isSessionUntouched(), true)
})

test("isSessionUntouched is false when any one of the three is present", () => {
  // "All three empty", not "any one missing" — a user who titled the day made a
  // choice, and nudging them again is nagging.
  assert.equal(isSessionUntouched({ title: "Powder day", photos: [], tags: [] }), false)
  assert.equal(isSessionUntouched({ title: null, photos: [{ id: "p1" }], tags: [] }), false)
  assert.equal(isSessionUntouched({ title: null, photos: [], tags: [{ tagged_user_id: "u1" }] }), false)
})

test("isSessionUntouched treats a whitespace-only title as empty", () => {
  // updateSessionTitle stores clampTitle(title) || null, so "   " round-trips to
  // SQL NULL. Treating it as a real title here would make a session that looks
  // blank in the Feed permanently un-nudgeable.
  assert.equal(isSessionUntouched({ title: "   ", photos: [], tags: [] }), true)
  assert.equal(isSessionUntouched({ title: "", photos: [], tags: [] }), true)
})

// ── nudgeDismissKey ─────────────────────────────────────────────────────────

test("nudgeDismissKey is per-session and refuses a falsy id", () => {
  assert.equal(nudgeDismissKey("abc-123"), "pd_nudge_dismissed_abc-123")
  assert.notEqual(nudgeDismissKey("abc-123"), nudgeDismissKey("def-456"))
  // Never build "pd_nudge_dismissed_null" — one bad id would otherwise dismiss
  // every future session that also arrives with a bad id.
  assert.equal(nudgeDismissKey(null), null)
  assert.equal(nudgeDismissKey(undefined), null)
  assert.equal(nudgeDismissKey(""), null)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '.../src/lib/skiDayNudge.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/skiDayNudge.js` with exactly this content:

```js
/**
 * Pure decision logic for the Feed slice C2 next-login nudge: is this ski day recent
 * enough to nudge about, and has anybody touched it yet?
 *
 * These live here rather than in skiDayDetails.js because that module's header states it
 * imports NOTHING on purpose, and these need localDateKey(). calendarDates.js is itself
 * import-free and already unit-tested, so `npm test` (node --test, no DOM, no bundler, no
 * Supabase client) still runs this module unmodified.
 *
 * Everything here is a pure function of its arguments — `now` is injected rather than read
 * from the clock so the window boundaries are actually testable.
 */

import { localDateKey } from "./calendarDates"

/**
 * How far back the nudge looks. Long enough to catch someone who did not open the app for
 * a few days after skiing; short enough that it never resurfaces a day from a month ago
 * that the user has clearly moved on from.
 *
 * This is the ONLY definition. socialApi.js's .gte(...) filter derives its cutoff from
 * nudgeCutoffDateKey() rather than repeating the number, so the query and the helper
 * cannot disagree.
 */
export const NUDGE_RECENCY_DAYS = 7

/** A session_date as PostgREST returns a DATE column: zero-padded, always 10 chars. */
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The oldest session_date still inside the window, as a "YYYY-MM-DD" key.
 *
 * Built with new Date(y, mIndex, d - N) and formatted with localDateKey() — deliberately
 * NOT `Date.now() - N * 864e5` and deliberately NOT toISOString():
 *
 *   - toISOString() is UTC. calendarDates.js's own header and App.jsx's session_date write
 *     path both warn about it: after the UTC rollover an evening in Colorado already reads
 *     as tomorrow, so a UTC cutoff is a day too new and drops the exact boundary session
 *     the window exists to catch.
 *   - Millisecond subtraction is not DST-safe. Seven days is 167 or 169 hours across a
 *     transition, not 168, so the result can land on the wrong calendar day.
 *
 * The Date constructor normalises day overflow across months, years and leap days on its
 * own, so no month-length arithmetic is needed here.
 */
export function nudgeCutoffDateKey(now = new Date()) {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - NUDGE_RECENCY_DAYS)
  return localDateKey(cutoff)
}

/**
 * Is this session_date inside the nudge window?
 *
 * The format guard is load-bearing, not defensive padding: date keys are compared as
 * STRINGS, and "not-a-date" >= "2026-03-03" is true. A row with a malformed session_date
 * would otherwise be treated as recent forever. Unpadded keys ("2026-3-3") are rejected
 * for the same reason — they sort after every padded key in December.
 *
 * There is no upper bound. The Supabase query is a single .gte(), and a JS-only ceiling
 * is how the two implementations of "recent" quietly stop agreeing.
 */
export function isWithinNudgeWindow(sessionDateKey, now = new Date()) {
  if (typeof sessionDateKey !== "string" || !DATE_KEY_RE.test(sessionDateKey)) return false
  return sessionDateKey >= nudgeCutoffDateKey(now)
}

/**
 * Has nobody touched this ski day at all?
 *
 * "Incomplete" is ALL THREE empty, never "any one missing". A user who typed a title but
 * skipped photos used the feature and made a choice; nudging them again is nagging. This
 * is for a day nobody has looked at since it was logged.
 *
 * A whitespace-only title counts as empty because that is what the storage layer does:
 * updateSessionTitle writes clampTitle(title) || null, and clampTitle trims.
 *
 * Callers pass the shapes their sources actually return — `photos` from getSessionPhotos()
 * and `tags` from getSessionTags(), both flat arrays — and only .length is read, so no
 * field of either row shape is depended on here.
 */
export function isSessionUntouched({ title, photos, tags } = {}) {
  if (typeof title === "string" && title.trim() !== "") return false
  if (photos?.length) return false
  if (tags?.length) return false
  return true
}

/**
 * The per-session localStorage dismissal key, mirroring OffseasonBanner's
 * "pd_offseason_banner_26" shape.
 *
 * Per-session and not global: dismissing today's prompt must not suppress next week's.
 * Returns null for a falsy id so a caller can never write "pd_nudge_dismissed_undefined",
 * which one bad row would turn into a permanent dismissal of every other bad row.
 */
export function nudgeDismissKey(sessionId) {
  return sessionId ? `pd_nudge_dismissed_${sessionId}` : null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test 2>&1 | tail -8
```

Expected: 16 more tests than the Task 0 baseline, `fail 0`. Against the recorded baseline of 191 that is **207 passing**.

- [ ] **Step 5: Lint**

```bash
npx eslint src/lib/skiDayNudge.js src/lib/skiDayNudge.test.js
```

Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add src/lib/skiDayNudge.js src/lib/skiDayNudge.test.js
git commit -m "feat: pure nudge-window and untouched-session helpers for Feed slice C2"
```

- [ ] **Step 7: Report**

Report the new test total and confirm lint is clean on the two new files. State plainly that verification was `npm test` + `npx eslint` only — no browser, no database.

---

### Task 2: `getRecentIncompleteSession()` — the one new query, plus the RLS read-check

**Files:**
- Modify: `src/lib/socialApi.js` (add to the import block at `:1-6`; insert the new function after `saveSkiDayDetails`, which ends at line **4418**, and before the `// ─── Mountain Board (sprint-29) ───` divider at line **4420**)

**Interfaces:**
- Consumes: `getCurrentUser()` (`socialApi.js:27-37` — **throws** `new Error("Not authenticated.")` when there is no user); `supabase` (`:1`); `getSessionPhotos(sessionIds)` (`:4152`); `getSessionTags(sessionIds)` (`:4246`); `nudgeCutoffDateKey()` and `isSessionUntouched()` from Task 1.
- Produces (Task 4 imports this):
  - `getRecentIncompleteSession(): Promise<SessionRow|null>` where
    `SessionRow = { id, user_id, resort_name, session_date, is_powder_day, title }`.
    Returns `null` when there is no recent session, or the most recent one has been touched.
    **Throws** on an auth failure or a Supabase error — the caller catches.

- [ ] **Step 1: Extend the import block**

`src/lib/socialApi.js` line 6 is currently:

```js
import { clampTitle, groupPhotosBySession, groupTagsBySession } from "./skiDayDetails";
```

Add one line directly beneath it:

```js
import { nudgeCutoffDateKey, isSessionUntouched } from "./skiDayNudge";
```

(This file terminates its import statements with semicolons — match that; the rest of the file mostly does not, and neither does the new function below. Follow whatever is adjacent.)

- [ ] **Step 2: Insert the new function**

Insert this immediately after `saveSkiDayDetails`'s closing brace (line 4418) and before the blank line preceding `// ─── Mountain Board (sprint-29) ───`:

```js
/**
 * The single most recent ski day nobody has touched — the Feed slice C2 nudge's candidate,
 * or null. Read-only; writes nothing.
 *
 * Ordered and windowed by session_date (the day that was skied), NOT created_at (when the
 * row was written). A day logged retroactively on Sunday for a Thursday trip is a Thursday
 * ski day, and the banner's copy names that date back to the user.
 *
 * The secondary .order("created_at") is not decoration. ski_sessions is UNIQUE on
 * (user_id, session_date, resort_name), so one user can hold several rows for the same
 * day — two resorts, or the same resort under both spellings ('vail' from the arrival
 * trigger and trip backfill, 'Vail' from a manual log; migration 039 documents that these
 * are genuinely distinct rows). Without a tiebreak, .limit(1) picks arbitrarily and can
 * flip between page loads, so the user would dismiss one row and be re-nudged for its
 * twin.
 *
 * Cost: ONE query in the common case. Almost every user's most recent day either does not
 * exist, is outside the window, or already has a title — and title alone rules a session
 * out, so the two batched photo/tag lookups only run for a genuine candidate. They are
 * called with a single-element array because getSessionPhotos/getSessionTags are batched
 * (array-taking) by design from Feed-C1.
 *
 * .eq("user_id", user.id) is mandatory and is not made redundant by RLS: ski_sessions
 * carries a permissive SELECT policy for authenticated users, so an unfiltered query would
 * return other people's days.
 *
 * Throws rather than returning null on failure, so the caller can decide. NudgeBanner
 * catches and simply renders nothing — a nudge is the most skippable thing in the app and
 * must never surface an error to the user.
 */
export async function getRecentIncompleteSession() {
  const user = await getCurrentUser()

  const { data, error } = await supabase
    .from("ski_sessions")
    .select("id, user_id, resort_name, session_date, is_powder_day, title")
    .eq("user_id", user.id)
    .gte("session_date", nudgeCutoffDateKey())
    .order("session_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    // .limit(1) BEFORE .maybeSingle(), the pattern logActivityOnce documents at :3880-3883:
    // a bare .maybeSingle() errors when more than one row matches, and same-day duplicates
    // genuinely exist.
    .maybeSingle()
  if (error) throw error

  const session = data || null
  if (!session) return null

  // Title alone rules the session out, so this short-circuits before any further I/O.
  if (!isSessionUntouched({ title: session.title })) return null

  const [photos, tags] = await Promise.all([
    getSessionPhotos([session.id]),
    getSessionTags([session.id]),
  ])
  if (!isSessionUntouched({ title: session.title, photos, tags })) return null

  return session
}
```

`is_powder_day` is selected because the backfill's `metadata` needs it — Task 3 passes `{ resort_name, is_powder_day }`, the same shape `App.jsx:702-710` already uses.

- [ ] **Step 3: Verify the function is reachable and syntactically valid**

```bash
npm run build 2>&1 | tail -5
```

Expected: a successful Vite build (the module graph resolves `./skiDayNudge` and the new export parses).

- [ ] **Step 4: Confirm no duplicate window constant leaked into this file**

```bash
grep -n "7 \* 86400\|864e5\|toISOString().slice\|NUDGE_RECENCY_DAYS = " src/lib/socialApi.js
```

Expected: **no output**. The window's definition lives in `skiDayNudge.js` only; this file derives its cutoff by calling `nudgeCutoffDateKey()`.

- [ ] **Step 5: Confirm the query is user-scoped and ordered on both keys**

```bash
grep -n -A 8 "export async function getRecentIncompleteSession" src/lib/socialApi.js | grep -E 'eq\("user_id"|gte\("session_date"|order\('
```

Expected: four lines — the `user_id` equality, the `session_date` `.gte`, and both `.order(...)` calls.

- [ ] **Step 6: Verify the `activity_feed` read this slice depends on is not blocked by RLS**

This slice never queries `activity_feed` directly — Correction 2 removed that — but `logActivityOnce`, which Task 3 calls, **does** read it (`socialApi.js:3884-3891`, filtered on `actor_id = user.id`). If that read were refused, the dedupe would see nothing, and every save would insert a duplicate feed row. Confirm by reading, not by assuming:

```bash
grep -rn "ON activity_feed\b\|ON public.activity_feed\b" migrations/*.sql supabase/migrations/*.sql
```

Expected: exactly two policies on the `activity_feed` table itself, both from `migrations/013_activity_feed.sql` — `"Friends and self view activity"` (SELECT) and `"Authenticated users insert own activity"` (INSERT). Everything matching `activity_feed_comments` or `activity_feed_reactions` is a **different table** and is irrelevant here; migration 045 replaced the SELECT policy on `activity_feed_reactions`, not on `activity_feed`.

Then read the SELECT policy itself:

```bash
sed -n '19,38p' migrations/013_activity_feed.sql
```

Expected — the first disjunct is the one that matters:

```sql
CREATE POLICY "Friends and self view activity" ON activity_feed FOR SELECT TO authenticated
  USING (
    actor_id = auth.uid()
    OR EXISTS ( … friend_requests … )
  );
```

`actor_id = auth.uid()` means a user can **always** see their own activity rows, and `logActivityOnce` filters on exactly `actor_id = user.id`. The read cannot be blocked. Record this conclusion in the task report.

**Flag for the human click-through (Task 6 Step 5):** this is a **code-reading** verification — no subagent in this environment has live database tooling, and no migration file can prove what policies are actually installed on production. It should be spot-checked live: after saving from the nudge on a day that was logged purely by tapping "Arrived", that day must appear on **Crew → Feed**. If the save succeeds but the day never shows up, this is the first thing to check.

- [ ] **Step 7: Full test and lint pass**

```bash
npm test 2>&1 | tail -6
npx eslint . 2>&1 | tail -1
```

Expected: still 207 passing / 0 failing, and the lint count unchanged from the Task 0 baseline (96 problems). `socialApi.js` has no unit tests — it is I/O and there is no mocking harness in this repo, the same constraint every other function in this file lives under. The pure logic it depends on is fully covered by Task 1.

- [ ] **Step 8: Commit**

```bash
git add src/lib/socialApi.js
git commit -m "feat: getRecentIncompleteSession() — the Feed C2 nudge candidate query"
```

- [ ] **Step 9: Report**

Report the build result, the two grep results, the RLS conclusion from Step 6 (quoting the policy's first disjunct), and the unchanged test/lint counts. State plainly that the RLS finding is from reading migration files, not from querying a live database, and that it is queued for the human spot-check.

---

### Task 3: `NudgeDetailsModal.jsx` — the shell around `SkiDayDetailsForm`, plus the `activity_feed` backfill

**Files:**
- Create: `src/components/NudgeDetailsModal.jsx`

**Interfaces:**
- Consumes: `SkiDayDetailsForm` (`src/components/SkiDayDetailsForm.jsx`, default export, props `{ initialTitle, initialPhotos, initialTags, saving, onSave, onSkip }`); `saveSkiDayDetails(sessionId, diff)` and `logActivityOnce(type, opts)` from `../lib/socialApi`; `resortName(key)` from `../lib/resorts` (`:142-147`, falls back to the raw key for anything unrecognised); `formatDate(dateStr)` from `../lib/format` (`:13-17`, renders `"2026-03-01"` as `"Sun, Mar 1"` and returns `""` for a falsy input).
- Produces (Task 4 renders this):
  - default export `NudgeDetailsModal`, props `{ session: SessionRow, onClose: () => void, onSaved: (sessionId: string) => void }`.
  - `onSaved` is called **only** after both the details save and the backfill attempt have completed, with the session's id.

- [ ] **Step 1: Write the component**

Create `src/components/NudgeDetailsModal.jsx` with exactly this content:

```jsx
import { useState } from "react"
import SkiDayDetailsForm from "./SkiDayDetailsForm"
import { saveSkiDayDetails, logActivityOnce } from "../lib/socialApi"
import { resortName } from "../lib/resorts"
import { formatDate } from "../lib/format"

/**
 * The next-login nudge's modal (Feed slice C2): a thin shell around the SkiDayDetailsForm
 * that Feed-C1 already ships, opened from NudgeBanner for one specific ski day.
 *
 * It is NOT a second SessionRecapModal. That modal is the end of the GPS flow and carries
 * runs, stats, GPX export, Strava upload and a share card; this one carries a form. The
 * only things the two share are SkiDayDetailsForm and saveSkiDayDetails, which is exactly
 * the point of extracting them in C1.
 *
 * WHY THE FORM IS SEEDED EMPTY
 *
 * NudgeBanner only ever opens this for a session getRecentIncompleteSession() has already
 * proved has no title, no photos and no tags, so ""/[]/[] is correct by construction and
 * no pre-fetch is needed. The one gap that leaves is a session edited on ANOTHER device
 * between the banner's fetch and this save; if the user then touches the tag picker,
 * reconcileSessionTags would diff against an empty seed and drop those tags. That is
 * accepted rather than fixed: it needs a second device editing the same day inside the
 * same page view, and pre-fetching here would cost two queries on every open to close it.
 *
 * WHY initialTitle IS "" AND NOT OMITTED
 *
 * SkiDayDetailsForm.jsx:67 is `const showTitle = initialTitle !== undefined`. Omitting the
 * prop hides the entire title section and emits title: undefined, which saveSkiDayDetails
 * then skips — the banner would promise "add a title" and offer no title field, with no
 * error anywhere. The empty string is load-bearing.
 *
 * WHY logActivityOnce IS CALLED UNCONDITIONALLY
 *
 * Migration 039's log_session_on_arrival() trigger inserts a bare ski_sessions row and
 * never touches activity_feed, so a day logged by tapping "Arrived" on a plan is invisible
 * to the Feed forever. Completing the nudge is where that row gets backfilled. There is no
 * "does it already have one?" check here on purpose: logActivityOnce does that check
 * itself, on the tighter (actor_id, type, subject_id) key that actually decides, and
 * returns early when a row exists. A looser pre-check would only create the risk of
 * skipping a backfill that was still needed.
 *
 * It also cannot throw — its whole body is wrapped in try/catch (socialApi.js:3896-3898) —
 * so it is awaited outside the details save's own error handling only in the sense that a
 * feed-logging failure must never make a successful details save look failed.
 */
export default function NudgeDetailsModal({ session, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Both hooks are above this guard. A hook below it would change the hook count between
  // the session-null and session-present renders and React would throw — the same
  // discipline SessionRecapModal.jsx:59 documents.
  if (!session) return null

  async function handleSave(diff) {
    setSaving(true)
    setError("")
    try {
      await saveSkiDayDetails(session.id, diff)

      // Backfill for the check-in-only path. Deliberately AFTER the details save: if the
      // save failed there is nothing worth publishing to the Feed yet.
      await logActivityOnce("ski_session", {
        subjectId:   session.id,
        subjectType: "ski_sessions",
        metadata:    {
          resort_name:   session.resort_name,
          is_powder_day: session.is_powder_day,
        },
      })

      onSaved(session.id)
    } catch (err) {
      // Stay open with the reason showing. Closing would silently discard picked files.
      setError(err.message || "Could not save. Try again.")
    } finally {
      // onSaved() above unmounts this component. Setting state on an unmounted component
      // is a no-op in React 18+ (the old warning was removed), so this is safe and keeps
      // the button re-enabled on the error path.
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "rgba(4,8,15,0.85)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px 16px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 500,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--color-bg-deep)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 24,
          boxShadow: "0 40px 120px rgba(0,0,0,0.85)",
          padding: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>🎿 Finish your ski day</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
              {resortName(session.resort_name)} · {formatDate(session.session_date)}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "50%",
              width: 32,
              height: 32,
              flexShrink: 0,
              color: "rgba(255,255,255,0.6)",
              fontSize: 16,
              lineHeight: 1,
              cursor: "pointer",
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div
            style={{
              background: "var(--color-danger-bg)",
              border: "1px solid rgba(248,113,113,0.3)",
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 13,
              color: "var(--color-danger)",
              margin: "12px 0 0",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <SkiDayDetailsForm
            initialTitle=""
            initialPhotos={[]}
            initialTags={[]}
            saving={saving}
            onSave={handleSave}
            onSkip={onClose}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Confirm the props actually match the shipped form**

```bash
grep -n -A 8 "export default function SkiDayDetailsForm" src/components/SkiDayDetailsForm.jsx
grep -n "const showTitle" src/components/SkiDayDetailsForm.jsx
```

Expected: the destructured props are `{ initialTitle, initialPhotos, initialTags, saving = false, onSave, onSkip }`, and `const showTitle = initialTitle !== undefined`. If either has drifted, **stop and report** — do not adapt this modal to a different shape without saying so.

- [ ] **Step 3: Confirm `initialTitle=""` is present and is not `undefined`**

```bash
grep -n 'initialTitle' src/components/NudgeDetailsModal.jsx
```

Expected: exactly one line, `initialTitle=""`. An empty result or `initialTitle={undefined}` is the silent failure Correction 4 describes.

- [ ] **Step 4: Confirm the two colour tokens used here exist**

```bash
grep -n -- "--color-bg-deep:\|--color-danger:\|--color-danger-bg:" src/index.css | head
```

Expected: all three are defined (`--color-bg-deep` at `:74`, `--color-danger` at `:65`, `--color-danger-bg` at `:112`, plus per-theme overrides further down). No new token is introduced by this slice.

- [ ] **Step 5: Lint and build**

```bash
npx eslint src/components/NudgeDetailsModal.jsx
npm run build 2>&1 | tail -5
```

Expected: eslint produces no output, and the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/NudgeDetailsModal.jsx
git commit -m "feat: NudgeDetailsModal — details form + activity_feed backfill for Feed C2"
```

- [ ] **Step 7: Report**

Report the two grep results verbatim, the lint/build result, and confirm the backfill call passes `metadata: { resort_name, is_powder_day }` matching `App.jsx:702-710`. State plainly that the modal has not been opened in a browser — nobody in this environment can.

---

### Task 4: `NudgeBanner.jsx` — the self-fetching, per-session-dismissible banner

**Files:**
- Create: `src/components/NudgeBanner.jsx`

**Interfaces:**
- Consumes: `getRecentIncompleteSession()` from Task 2; `nudgeDismissKey(sessionId)` from Task 1; `NudgeDetailsModal` from Task 3 (props `{ session, onClose, onSaved }`); `resortName(key)` from `../lib/resorts`; `formatDate(dateStr)` from `../lib/format`.
- Produces (Task 5 mounts this):
  - default export `NudgeBanner`, single prop `{ currentUser }` — the same object `TodayScreen` already receives at `:507` and already passes to `AddToHomeScreenNudge` at `:542`. Renders `null` for a logged-out user, for a user with no candidate, and for a candidate already dismissed.

- [ ] **Step 1: Write the component**

Create `src/components/NudgeBanner.jsx` with exactly this content:

```jsx
import { useEffect, useState } from "react"
import NudgeDetailsModal from "./NudgeDetailsModal"
import { getRecentIncompleteSession } from "../lib/socialApi"
import { nudgeDismissKey } from "../lib/skiDayNudge"
import { resortName } from "../lib/resorts"
import { formatDate } from "../lib/format"

/**
 * The next-login nudge (Feed slice C2). If the user's most recent ski day is within 7 days
 * and nobody has given it a title, a photo or a tag, offer to finish it — once, dismissibly,
 * for that one day.
 *
 * WHY THIS FETCHES ITSELF INSTEAD OF App.jsx DOING IT
 *
 * loadHeaderUser() looks like the natural hook point (it is where currentUser resolves, and
 * it is where the onboarding gate lives) but it is registered as the
 * supabase.auth.onAuthStateChange handler (App.jsx:970-991), so it re-runs on
 * INITIAL_SESSION, SIGNED_IN, USER_UPDATED and TOKEN_REFRESHED — the last of which fires
 * about hourly for as long as the tab is open. The onboarding gate can live there because
 * it is one synchronous localStorage read. This is up to three network round-trips.
 *
 * The pattern actually used in this codebase for "after currentUser resolves, fetch
 * something" is the block of useEffect(..., [currentUser]) hooks at App.jsx:993-1020, and
 * on this very screen AddToHomeScreenNudge (TodayScreen.jsx:333-361) already does the
 * component-local version. This is that, keyed on currentUser?.id rather than the object,
 * because loadHeaderUser() hands down a fresh object identity on every auth event.
 *
 * WHY THE CANDIDATE CARRIES THE USER ID
 *
 * The obvious alternative — `if (!currentUser) { setCandidate(null); return }` at the top
 * of the effect, which is what App.jsx:994 does — is a synchronous setState in an effect
 * body, and react-hooks/set-state-in-effect is an ERROR in this repo's eslint config (ten
 * pre-existing violations; do not add an eleventh). Stamping the fetch with the user it was
 * for, and checking that stamp at render time, handles log-out and account-switch without
 * any clearing write at all.
 *
 * DISMISSAL IS PER SESSION, NOT GLOBAL: the key is pd_nudge_dismissed_<sessionId>,
 * mirroring OffseasonBanner's pd_offseason_banner_26 shape. Dismissing today's prompt must
 * not suppress next week's. Every localStorage touch is wrapped in try/catch — Safari
 * private mode throws, and an uncaught throw here would blank the whole Today tab.
 *
 * A successful save counts as resolving the nudge, so it writes the same key.
 */
export default function NudgeBanner({ currentUser }) {
  // { userId, session } — the session, stamped with who it was fetched for.
  const [candidate, setCandidate] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    const userId = currentUser?.id
    if (!userId) return

    let cancelled = false

    getRecentIncompleteSession()
      .then((found) => {
        if (cancelled || !found) return

        let dismissed = false
        try {
          dismissed = localStorage.getItem(nudgeDismissKey(found.id)) === "1"
        } catch {
          // localStorage unavailable (Safari private mode) — treat as not dismissed. The
          // cost of being wrong is one extra banner, not a crash.
        }
        if (dismissed) return

        // setState inside an async callback, never synchronously in the effect body.
        setCandidate({ userId, session: found })
      })
      .catch((err) => {
        // A nudge is the most skippable thing in the app. Never surface this.
        console.warn("NudgeBanner: could not check for an incomplete ski day", err)
      })

    return () => {
      cancelled = true
    }
  }, [currentUser?.id])

  // Stale-stamp guard: a candidate fetched for a user who has since logged out or been
  // swapped is not rendered, and no clearing setState was needed to achieve that.
  const session = candidate && candidate.userId === currentUser?.id ? candidate.session : null

  /** Dismiss and save both resolve the nudge for this session, permanently and locally. */
  function resolve(sessionId) {
    const key = nudgeDismissKey(sessionId)
    if (key) {
      try { localStorage.setItem(key, "1") } catch {}
    }
    setModalOpen(false)
    setCandidate(null)
  }

  if (!session) return null

  return (
    <>
      <div
        style={{
          position: "relative",
          background: "rgba(56,189,248,0.08)",
          border: "1px solid rgba(56,189,248,0.2)",
          borderRadius: 14,
          padding: "12px 40px 12px 14px",
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>🎿</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "white", marginBottom: 2 }}>
            Forgot to finish {resortName(session.resort_name)}, {formatDate(session.session_date)}?
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
            Add a title, photos, or tag who you skied with.
          </div>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          style={{
            background: "var(--gradient-cta)",
            border: "none",
            borderRadius: 999,
            padding: "9px 18px",
            color: "white",
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          Add Details
        </button>

        <button
          onClick={() => resolve(session.id)}
          aria-label="Dismiss"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.35)",
            fontSize: 18,
            lineHeight: 1,
            padding: 4,
            borderRadius: 6,
          }}
        >
          ×
        </button>
      </div>

      {modalOpen && (
        <NudgeDetailsModal
          session={session}
          onClose={() => setModalOpen(false)}
          onSaved={resolve}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify no synchronous `setState` in the effect body**

```bash
npx eslint src/components/NudgeBanner.jsx
```

Expected: **no output**. Any `react-hooks/set-state-in-effect` error means a `setCandidate`/`setModalOpen` call escaped into the effect body — move it back inside the `.then(...)` callback rather than disabling the rule.

- [ ] **Step 3: Verify every `localStorage` touch is guarded**

```bash
grep -n "localStorage" src/components/NudgeBanner.jsx
```

Expected: exactly two lines — one `getItem` inside a `try` in the `.then` callback, one `setItem` inside a `try` in `resolve()`. Neither may be bare.

- [ ] **Step 4: Verify the dismissal key is per-session and built in one place**

```bash
grep -n "pd_nudge_dismissed" src/components/NudgeBanner.jsx src/lib/skiDayNudge.js
```

Expected: exactly one hit, in `src/lib/skiDayNudge.js`'s `nudgeDismissKey`. A literal in the component means the key can drift between the read and the write, which would make the banner un-dismissable.

- [ ] **Step 5: Verify the effect is keyed on the id, not the object**

```bash
grep -n "}, \[currentUser" src/components/NudgeBanner.jsx
```

Expected: `}, [currentUser?.id])`. Depending on `[currentUser]` re-runs the whole probe on every token refresh, which is the exact cost Correction 3 exists to avoid.

- [ ] **Step 6: Build**

```bash
npm run build 2>&1 | tail -5
```

Expected: success.

- [ ] **Step 7: Commit**

```bash
git add src/components/NudgeBanner.jsx
git commit -m "feat: NudgeBanner — dismissible next-login nudge for an untouched ski day"
```

- [ ] **Step 8: Report**

Report all five grep/lint results and the build result. Note explicitly that the banner is not yet mounted anywhere — that is Task 5 — so nothing has changed in the running app yet. State plainly that no browser check was performed.

---

### Task 5: Mount `NudgeBanner` on the Today tab

**Files:**
- Modify: `src/components/TodayScreen.jsx` (one import near `:1-13`; one element at `:544`)

**Interfaces:**
- Consumes: `NudgeBanner` from Task 4 (prop `{ currentUser }`); `currentUser`, already a declared prop of `TodayScreen` at `:507` and already threaded down from `App.jsx`.
- Produces: nothing new. This is the wiring task.

- [ ] **Step 1: Add the import**

`src/components/TodayScreen.jsx` lines 2-9 are a block of sibling-component imports ending with `import ActivityFeed from "./ActivityFeed"` on line 9. Add one line directly after it:

```jsx
import NudgeBanner from "./NudgeBanner"
```

- [ ] **Step 2: Mount it in the banner block**

The render currently opens (`:539-544`):

```jsx
  return (
    <>
      {/* Tab-agnostic banners, moved in from HomeDashboard.jsx (Task 6) */}
      <AddToHomeScreenNudge currentUser={currentUser} sessionActive={sessionActive} />
      <OffseasonBanner />
```

Add `NudgeBanner` as the third member of that block, directly below `<OffseasonBanner />` and above the blank line preceding the `List | Map` segmented pill:

```jsx
  return (
    <>
      {/* Tab-agnostic banners, moved in from HomeDashboard.jsx (Task 6) */}
      <AddToHomeScreenNudge currentUser={currentUser} sessionActive={sessionActive} />
      <OffseasonBanner />
      {/* Feed slice C2: offer to finish a recent, untouched ski day. Renders null for a
          logged-out user, for no candidate, and for one already dismissed. */}
      <NudgeBanner currentUser={currentUser} />
```

This is the same visual tier the spec asks for: above the `List | Map` control, alongside the other two banners, on both the list and map sub-tabs (the block sits outside the `conditionsSubTab` conditionals). It needs no other prop — `NudgeBanner` fetches its own data.

- [ ] **Step 3: Verify the mount and the prop**

```bash
grep -n "NudgeBanner" src/components/TodayScreen.jsx
```

Expected: exactly two lines — the import, and `<NudgeBanner currentUser={currentUser} />`.

- [ ] **Step 4: Verify the banner block's order**

```bash
sed -n '539,548p' src/components/TodayScreen.jsx
```

Expected: `AddToHomeScreenNudge`, then `OffseasonBanner`, then the comment and `NudgeBanner`, then the blank line before the segmented pill. If `NudgeBanner` landed inside a `conditionsSubTab === "conditions"` block instead, it would vanish on the Map sub-tab — **stop and fix**.

- [ ] **Step 5: Confirm `App.jsx` is untouched**

```bash
git diff --stat main -- src/App.jsx
```

Expected: **no output**. Correction 3 puts the whole feature in the banner; any diff here means the plan was not followed.

- [ ] **Step 6: Full test, lint and build**

```bash
npm test 2>&1 | tail -6
npx eslint . 2>&1 | tail -1
npm run build 2>&1 | tail -5
```

Expected: 207 passing / 0 failing; the lint count **unchanged** from the Task 0 baseline (96 problems, 88 errors, 8 warnings); a successful build.

- [ ] **Step 7: Commit**

```bash
git add src/components/TodayScreen.jsx
git commit -m "feat: mount NudgeBanner on the Today tab beside the other banners"
```

- [ ] **Step 8: Report**

Report the grep, the `sed` excerpt, the empty `App.jsx` diff, and the three counts against the Task 0 baseline. State plainly that the banner has not been seen rendering — no browser tooling exists here — and that its first real confirmation is Task 6 Step 5.

---

### Task 6: Whole-branch final review + fix wave

**Files:**
- Review: the entire branch diff. Modify only what the review finds.

**Interfaces:**
- Consumes: everything Tasks 1-5 produced.
- Produces: a merge-ready branch, or a written list of what is blocking merge.

**Dispatch this task on the most capable available model**, per `superpowers:subagent-driven-development`'s own rule for a final review. Every prior task saw only its own section; this is the first pass that sees the whole slice at once, and on the last three slices it is where the real bugs were found.

- [ ] **Step 1: Read the whole diff against the five Spec Corrections and the Global Constraints**

```bash
git diff main --stat
git diff main
```

Expected `--stat` shape: 6 files, 5 of them new (`src/lib/skiDayNudge.js`, `src/lib/skiDayNudge.test.js`, `src/components/NudgeDetailsModal.jsx`, `src/components/NudgeBanner.jsx`, and this plan document if it is on the branch), plus one small modification each to `src/lib/socialApi.js` and `src/components/TodayScreen.jsx`. **Anything else in the list is scope creep — name it.**

Check each of these by reading the diff, not by trusting a task report:

1. **Correction 1** — no `toISOString()`, no `864e5`, no `7 * 24 * 60 * 60 * 1000` anywhere in the diff. The cutoff comes from `nudgeCutoffDateKey()` only.
2. **Correction 2** — the diff contains **no** direct `.from("activity_feed")` query. The only `activity_feed` contact is one `logActivityOnce(...)` call, and it is unconditional.
3. **Correction 3** — `src/App.jsx` does not appear in the diff at all.
4. **Correction 4** — `initialTitle=""` appears exactly once, and is not `undefined`.
5. **Correction 5** — the candidate query has both `.order("session_date", …)` and `.order("created_at", …)`.
6. **Global Constraints** — no migration file; no `notifications` write; no new npm dependency in `package.json`; no second/batch nudge; no realtime subscription; no new hardcoded colour (every semantic colour is a `var(--…)` token or an existing `rgba(255,255,255,…)`/`rgba(56,189,248,…)` literal matching the neighbouring banners).

- [ ] **Step 2: Re-verify the numbers yourself**

```bash
npm test 2>&1 | tail -6
npx eslint . 2>&1 | tail -1
npm run build 2>&1 | tail -5
```

Expected: **207 passing / 0 failing** (Task 0's baseline + Task 1's 16); lint **unchanged** from the Task 0 baseline; a clean build. A lint count that went **up** is a blocker; one that went **down** means a pre-existing error was "helpfully" fixed — say so, since that is out of scope and belongs in its own commit.

- [ ] **Step 3: Hand-trace the four paths that no test covers**

Write the trace out; do not assert it.

1. **Logged out.** `currentUser` is `null` → the effect returns before any fetch → `candidate` stays `null` → `session` is `null` → `NudgeBanner` renders `null`. **No query is issued for an anonymous visitor.** Confirm by reading, since the Today tab is the landing surface for logged-out browsing.
2. **Logged in, most recent day already titled.** `getRecentIncompleteSession` returns after ONE query — `isSessionUntouched({ title })` is false, so `getSessionPhotos`/`getSessionTags` never run. This is the common case and it must stay one query.
3. **Check-in-only day, save succeeds.** `saveSkiDayDetails` writes the title/photos/tags → `logActivityOnce` finds no `(actor_id, "ski_session", subject_id)` row → inserts one → `onSaved(id)` → `resolve(id)` writes `pd_nudge_dismissed_<id>` and clears both the modal and the candidate. The day now appears on Crew → Feed for the first time.
4. **Save fails.** `saveSkiDayDetails` throws → the `catch` sets `error` → the modal stays open with the message → `logActivityOnce` is never reached (so no orphan feed row for a day with no details) → `onSaved` is never called (so the banner is not dismissed) → `finally` re-enables the button. Reopening the Today tab still offers the nudge.

- [ ] **Step 4: Check the three known, accepted limitations are still only these three**

State each in the report as accepted, not as a finding:

- **Cross-device tag wipe.** The modal seeds `initialTags={[]}` from a check made at banner-fetch time. If the same day is tagged on another device in between *and* the user then touches the tag picker, `reconcileSessionTags` diffs against the empty seed and removes those tags. Accepted: it needs two devices inside one page view, and pre-fetching would cost two queries on every open. Documented in `NudgeDetailsModal.jsx`'s header.
- **Dismissal is device-local.** `localStorage`, so dismissing on a phone does not dismiss on a laptop. Accepted — the alternative is the `notifications` table row the design explicitly rules out.
- **The RLS conclusion is from reading migrations, not from querying production.** Queued as a live spot-check in Step 5.

- [ ] **Step 5: Hand the human click-through list to Kyle**

Nobody in this environment has browser or Supabase-auth tooling, so this is the first real confirmation the feature works. Give Kyle exactly this list:

1. **The banner appears.** With a ski day logged in the last 7 days that has no title, no photos and no tags, open the Today tab. The banner reads "Forgot to finish {resort}, {date}?" with the real resort name and the real date — **not** a raw resort key like `beavercreek` and not a blank date.
2. **Dismiss sticks, per session.** Tap ✕. Reload. The banner is gone. It must not come back for that day.
3. **Dismiss is not global.** Log a second, different untouched ski day. The banner comes back for the new one, even though the first is dismissed.
4. **The modal saves.** Tap "Add Details", type a title, add a photo, tag a friend, Save. The modal closes and the banner disappears. Open Profile → Session History (or Crew → Feed) and confirm all three landed.
5. **The backfill works — this is the highest-value check in the list.** Find or create a day logged *purely* by tapping **Arrived** on a plan (never manually logged, never GPS-tracked). Confirm it is **not** on Crew → Feed. Complete the nudge for it. It must now **appear** on Crew → Feed. If the save succeeds but the day never shows up, the `activity_feed` insert or its RLS is the cause — report it rather than retrying.
6. **No double post.** Complete the nudge for a day that already appears on the Feed (e.g. one you GPS-tracked). The Feed must still show **one** card for it, not two.
7. **Already-touched days are never nudged.** A day with only a title — no photos, no tags — must produce no banner at all.
8. **Logged out.** In a private window, load the Today tab logged out. No banner, no console errors.

- [ ] **Step 6: Fix what the review found, in its own commits**

Each fix is its own commit with a message naming what was wrong. Do not squash fixes into the feature commits — the review trail is how the next slice learns what this one got wrong.

- [ ] **Step 7: Re-run Step 2 after the fix wave**

```bash
npm test 2>&1 | tail -6
npx eslint . 2>&1 | tail -1
npm run build 2>&1 | tail -5
```

Expected: unchanged from Step 2.

- [ ] **Step 8: Report**

Report: the `--stat`, the six Correction/Constraint checks with a verdict each, the three re-verified numbers, the four hand-traces, the three accepted limitations, the click-through list handed to Kyle, and every fix commit. **Do not claim the feature works** — claim that it builds, lints, passes 207 tests, and reads correctly, and that item 5 of the click-through list is the outstanding proof.

**Do not push to `main` before Kyle's click-through passes.** `main` auto-deploys to `powdays.app` live with **no staging step**. This branch stays on `worktree-crew-tab-feed-slice-c2` until Kyle signs off, and the merge decision goes through `superpowers:finishing-a-development-branch`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-03-crew-tab-feed-slice-c2.md`. Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration. This plan is written for it: every task carries its own Files/Interfaces header, its own verification steps and its own commit, so a subagent needs no context beyond its task section plus the five Spec Corrections and the Global Constraints.
- **REQUIRED SUB-SKILL:** `superpowers:subagent-driven-development`
- Fresh subagent per task + two-stage review. **Task 6 must be dispatched on the most capable available model**, per that skill's own rule for a final review.

**2. Inline Execution** — execute tasks in this session with batched checkpoints.
- **REQUIRED SUB-SKILL:** `superpowers:executing-plans`

**Which approach?**

**Where the work happens.** All of it runs in the git worktree created in Task 0 via `superpowers:using-git-worktrees`, on branch **`worktree-crew-tab-feed-slice-c2`**. Nothing runs in the main checkout, and nothing merges to `main` until Kyle's Task 6 Step 5 click-through passes.

**Task order and dependencies.** A short chain with one parallel branch:

```
Task 0 (worktree + baseline)
   ↓
Task 1 (skiDayNudge.js + 16 tests) ──┬─→ Task 2 (getRecentIncompleteSession) ──┐
                                     │                                          ├─→ Task 4 (NudgeBanner) → Task 5 (mount) → Task 6 (final review)
                                     └─→ Task 3 (NudgeDetailsModal) ────────────┘
```

- **Tasks 2 and 3 can run in parallel** once Task 1 has landed. Task 2 touches only `src/lib/socialApi.js`; Task 3 creates only `src/components/NudgeDetailsModal.jsx`. Task 3 depends on Feed-C1's already-shipped `SkiDayDetailsForm`/`saveSkiDayDetails`/`logActivityOnce`, not on Task 2.
- **Task 4 depends on both** — it imports `getRecentIncompleteSession` (Task 2), `nudgeDismissKey` (Task 1) and `NudgeDetailsModal` (Task 3).
- **Task 5 depends on Task 4**, and **Task 6 depends on everything** and must be last.

**Current state, for whoever picks this up:** nothing is built yet. Start at Task 0. `main` is at commit `aa08c22` ("docs: add Feed slice C2 (next-login nudge) design spec"); Feed-A, Feed-B and Feed-C1 are all shipped and live, so every function this slice consumes already exists on `main` — verify that with the greps in Tasks 2 Step 5 and 3 Step 2 rather than assuming it.

---

## Self-Review Notes (for the plan author, already applied above)

- **Spec coverage.** §Design's new query function → Task 2 (with Corrections 1, 2 and 5 applied). §Design's `NudgeBanner` → Task 4; its mount site → Task 5. §Design's `NudgeDetailsModal` → Task 3 (with Corrections 2 and 4 applied). §New decisions' three rules (all-three-empty, 7-day window, per-session localStorage key) → Global Constraints + Task 1's helpers and their 16 tests. §Explicitly Out of Scope's three items → Global Constraints + Task 6 Step 1's scope-creep check. §Testing's "new pure logic as testable functions… real unit tests under `node --test`" → Task 1; its "the query function itself is I/O and untestable without a mocking harness" → stated in Task 2 Step 7 rather than papered over.
- **Five spec corrections, each re-derived from the real files on 2026-09-03**, and each carried through three places: stated at the top, applied in a named task's code, and re-checked as a numbered review item in Task 6 Step 1. Corrections 1, 2 and 5 change code; 3 changes where the code lives; 4 pins something the spec got right but that fails silently if a later reader "simplifies" it.
- **Correction 2 is a deliberate deviation from the approved spec, not an oversight.** The spec designs an `activity_feed` existence flag; this plan removes it because `logActivityOnce` already performs the same check on a strictly tighter key, at a better time, and never throws. The rationale (including the concrete failure mode of the looser `subject_id`-only filter) is written out in full so Task 6 can judge the decision rather than inherit it. If a reviewer disagrees, restoring the flag is a contained change to Tasks 2, 3 and 4 — but the tighter `(actor_id, type, subject_id)` filter must come with it.
- **Every one of the spec's eight source citations was checked, and all eight were accurate** (`loadHeaderUser` at `App.jsx:832-859`; the onboarding gate at `:849-851`; `OffseasonBanner` at `TodayScreen.jsx:403-478`; `ski_sessions`' columns and its `(user_id, session_date, resort_name)` unique constraint; `getSessionPhotos` at `socialApi.js:4152` and `getSessionTags` at `:4246`, both genuinely batched; `logActivityOnce` at `:3875`; `log_session_on_arrival()` at `migrations/039:85-104` touching only `ski_sessions`). They are listed under "Verified as written" so no task wastes a step re-deriving them, and Correction 3 makes clear that an accurate citation can still be the wrong place to hang code.
- **The lint config drove two design decisions, and both are stated as such** so they are not read as arbitrary: `react-hooks/set-state-in-effect` is an error in this repo (ten pre-existing violations, including `App.jsx:994`'s `if (!currentUser) { setX({}); return }` shape), which is why `NudgeBanner` stamps its candidate with a user id and guards at render time instead of clearing state in the effect body; and the effect is keyed on `currentUser?.id` (the `SessionRecapModal.jsx:104` precedent, which is lint-clean) rather than the object.
- **Task right-sizing.** Six tasks plus setup, against Feed-C1's eleven — this slice has no migration, no RLS work, no storage bucket, no shared presentational component and only one consumer, so padding it to match C1's shape would have split reviewable units for no reason. The split points are real: a reviewer can reject the window arithmetic (Task 1) while approving the query (Task 2), or reject the banner's copy and dismissal (Task 4) while approving the modal (Task 3).
- **Type consistency checked end to end.** `SessionRow = { id, user_id, resort_name, session_date, is_powder_day, title }` is spelled identically in Task 2's `.select()` string, Task 3's `session.*` reads, and Task 4's `session.*` reads. `nudgeDismissKey` is the only producer of the dismissal key and is called from exactly two places in one file. `isSessionUntouched`'s `{ title, photos, tags }` shape matches what `getSessionPhotos`/`getSessionTags` actually return (flat arrays — only `.length` is read, so no row field is depended on). `onSaved(sessionId)` is emitted by Task 3 and consumed by Task 4's `resolve(sessionId)` under the same name and arity.
- **No placeholders.** Every code step contains the complete file or the complete insertion, every verification step contains a real command with its expected output, and every task ends with a report step that requires stating plainly that no browser or database check happened — because none can in this environment. The two things that genuinely need a human are isolated into Task 6 Step 5, with the check-in-only backfill (item 5) named as the highest-value one.
