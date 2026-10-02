# Crowdsourced Conditions Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user optionally answer "how was the snow / was it icy / was it crowded" when
logging a ski day, and surface those answers resort-wide as a "Recent Reports" widget on that
resort's own page.

**Architecture:** Three new nullable columns (`snow_quality`, `crowd_level`,
`conditions_comment`) go directly on `ski_sessions`, piggybacking on that table's existing
"any authenticated user can read any row" SELECT policy — no new table, no new RLS. The shared
`SkiDayDetailsForm.jsx` (already used by all three ski-day-logging entry points) gains two chip
rows and a comment input; a new `MountainPage` widget reads the columns back, windowed to the
last 14 days.

**Tech Stack:** React (no new deps), Supabase/Postgres (migration + existing `supabase-js`
client), `node --test` for pure-function unit tests (this repo's only automated test harness —
`.jsx` files have no coverage, consistent with every existing component in this codebase).

## Global Constraints

- `snow_quality` is restricted to exactly `powder`, `groomed`, `icy`, `slushy` (a deliberate
  4-value trim — NOT the 6 values `TripDetailModal.jsx`'s own, separate trip-recap feature uses).
- `crowd_level` is restricted to exactly `empty`, `light`, `moderate`, `packed`.
- `conditions_comment` is capped at 140 codepoints (`char_length`, not UTF-16 code units).
- All three columns are nullable with no default — every existing `ski_sessions` row keeps
  reading `NULL` for them, same as `title` did when it shipped.
- No new RLS policy anywhere in this plan. Visibility is inherited from `ski_sessions`' existing
  `"authenticated users can view all sessions"` policy (`auth.uid() IS NOT NULL`).
- The "Recent Reports" widget windows to the last **14 days** (`session_date`), newest first,
  capped at 20 rows.
- No change to `src/lib/powderScore.js` or `server/powderScore.js` — explicitly out of scope.
- No change to `TripDetailModal.jsx`'s own, separate `trip_recaps.conditions` feature.
- `npm test` runs `node --test src/lib/*.test.js server/*.test.js` only. Every `.jsx` file in
  this plan has no automated test coverage — that's this repo's established convention, not a
  gap introduced here. Each `.jsx` task's "test" step is a code-reasoning verification, not an
  automated one.

---

### Task 1: Migration — add conditions columns to `ski_sessions`

**Files:**
- Create: `migrations/049_conditions_reports.sql`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: three new nullable columns on `ski_sessions` —
  `snow_quality TEXT` (CHECK: NULL or one of `'powder','groomed','icy','slushy'`),
  `crowd_level TEXT` (CHECK: NULL or one of `'empty','light','moderate','packed'`),
  `conditions_comment TEXT` (CHECK: NULL or `char_length(...) <= 140`).
  Every later task that reads or writes these columns depends on this migration having been
  applied to the live Supabase project (id `hkzaohqrycwfgmcogwdo`).

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 049: crowdsourced conditions reports — snow quality, crowd level, comment
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THESE ARE PLAIN COLUMNS, NOT A NEW TABLE
--
-- ski_sessions already carries a live SELECT policy readable by ANY authenticated user —
-- "authenticated users can view all sessions" USING (auth.uid() IS NOT NULL) — deliberately
-- left open rather than tightened (migration 046's header comment documents this: Leaderboard,
-- Feed, trip-backfill, and the arrival trigger all depend on it reading broadly). `title`
-- already lives as a plain column on this same table for exactly this reason: a scalar the
-- user types once, at the same three entry points (LogDayModal, SessionRecapModal,
-- SessionEditForm) these three columns go through. A new table would mean re-deriving RLS and a
-- SECURITY DEFINER helper for visibility this table already grants today.
--
-- ROLLBACK, if anything breaks:
--   ALTER TABLE public.ski_sessions DROP CONSTRAINT IF EXISTS ski_sessions_snow_quality_check;
--   ALTER TABLE public.ski_sessions DROP CONSTRAINT IF EXISTS ski_sessions_crowd_level_check;
--   ALTER TABLE public.ski_sessions DROP CONSTRAINT IF EXISTS ski_sessions_conditions_comment_length;
--   ALTER TABLE public.ski_sessions DROP COLUMN IF EXISTS snow_quality;
--   ALTER TABLE public.ski_sessions DROP COLUMN IF EXISTS crowd_level;
--   ALTER TABLE public.ski_sessions DROP COLUMN IF EXISTS conditions_comment;

BEGIN;

ALTER TABLE public.ski_sessions
  ADD COLUMN IF NOT EXISTS snow_quality TEXT,
  ADD COLUMN IF NOT EXISTS crowd_level TEXT,
  ADD COLUMN IF NOT EXISTS conditions_comment TEXT;

ALTER TABLE public.ski_sessions
  ADD CONSTRAINT ski_sessions_snow_quality_check
    CHECK (snow_quality IS NULL OR snow_quality IN ('powder','groomed','icy','slushy'));

ALTER TABLE public.ski_sessions
  ADD CONSTRAINT ski_sessions_crowd_level_check
    CHECK (crowd_level IS NULL OR crowd_level IN ('empty','light','moderate','packed'));

ALTER TABLE public.ski_sessions
  ADD CONSTRAINT ski_sessions_conditions_comment_length
    CHECK (conditions_comment IS NULL OR char_length(conditions_comment) <= 140);

COMMIT;
```

- [ ] **Step 2: Verify the columns do not already exist (read-only, before applying)**

Run this against the live project via the Supabase MCP `execute_sql` tool (or the SQL Editor):

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'ski_sessions'
  AND column_name IN ('snow_quality', 'crowd_level', 'conditions_comment');
```

Expected: 0 rows. If any rows come back, STOP and investigate before proceeding — someone else
may have already applied a version of this migration.

- [ ] **Step 3: Apply the migration**

Apply `migrations/049_conditions_reports.sql` to the live Supabase project (Supabase MCP
`apply_migration` tool, or paste into the SQL Editor), then run `NOTIFY pgrst, 'reload schema';`
so PostgREST picks up the new columns immediately rather than waiting for its next cache cycle.

- [ ] **Step 4: Verify the columns and constraints, in a rolled-back transaction**

Re-run the Step 2 query — expect all 3 columns back this time. Then, in a transaction that gets
rolled back (never committed, so it touches nothing real), confirm the CHECK constraints actually
reject bad values:

```sql
BEGIN;
-- Pick any one real ski_sessions id for this check — the UPDATE is rolled back below either way.
UPDATE ski_sessions SET snow_quality = 'bogus' WHERE id = (SELECT id FROM ski_sessions LIMIT 1);
ROLLBACK;
```

Expected: the `UPDATE` fails with a `check constraint "ski_sessions_snow_quality_check"` violation
(23514). If it succeeds instead, the constraint is missing or wrong — stop and fix it before
moving to Task 2.

- [ ] **Step 5: Commit**

```bash
git add migrations/049_conditions_reports.sql
git commit -m "feat: add conditions-report columns to ski_sessions (migration 049)"
```

---

### Task 2: Pure helpers — snow/crowd vocabulary and comment clamp

**Files:**
- Modify: `src/lib/skiDayDetails.js`
- Test: `src/lib/skiDayDetails.test.js`

**Interfaces:**
- Consumes: nothing (pure, dependency-free module — matches this file's existing "imports
  NOTHING on purpose" header).
- Produces: `SNOW_QUALITY_OPTIONS: string[]`, `CROWD_LEVEL_OPTIONS: string[]`,
  `CONDITIONS_COMMENT_MAX_LENGTH: number`, `normalizeSnowQuality(value): string|null`,
  `normalizeCrowdLevel(value): string|null`, `clampConditionsComment(value): string`.
  Task 4 (the writer) and Task 5 (the form UI) both import all six of these by name.

- [ ] **Step 1: Write the failing tests**

Add to the end of `src/lib/skiDayDetails.test.js` (after the existing `clampTitle` tests), and
add the six new names to the existing `import { ... } from "./skiDayDetails.js"` block at the
top of the file:

```js
test("exports the conditions-report vocabulary and comment cap", () => {
  assert.deepEqual(SNOW_QUALITY_OPTIONS, ["powder", "groomed", "icy", "slushy"])
  assert.deepEqual(CROWD_LEVEL_OPTIONS, ["empty", "light", "moderate", "packed"])
  assert.equal(CONDITIONS_COMMENT_MAX_LENGTH, 140)
})

/* ── normalizeSnowQuality ───────────────────────────────────────────────────── */

test("normalizeSnowQuality accepts an allowed value", () => {
  assert.equal(normalizeSnowQuality("icy"), "icy")
})

test("normalizeSnowQuality rejects a value outside the vocabulary", () => {
  // Guards against a stray value reaching the DB and tripping the CHECK constraint with a
  // raw 400 instead of a clean null — same defense-in-depth reasoning as clampTitle.
  assert.equal(normalizeSnowQuality("bluebird"), null)
})

test("normalizeSnowQuality rejects undefined, null, and empty string", () => {
  assert.equal(normalizeSnowQuality(undefined), null)
  assert.equal(normalizeSnowQuality(null), null)
  assert.equal(normalizeSnowQuality(""), null)
})

/* ── normalizeCrowdLevel ────────────────────────────────────────────────────── */

test("normalizeCrowdLevel accepts an allowed value", () => {
  assert.equal(normalizeCrowdLevel("packed"), "packed")
})

test("normalizeCrowdLevel rejects a value outside the vocabulary", () => {
  assert.equal(normalizeCrowdLevel("insane"), null)
})

/* ── clampConditionsComment ─────────────────────────────────────────────────── */

test("clampConditionsComment trims surrounding whitespace", () => {
  assert.equal(clampConditionsComment("  icy on the back side  "), "icy on the back side")
})

test("clampConditionsComment caps at 140 codepoints, not UTF-16 code units", () => {
  // Mirrors clampTitle's own emoji test: Array.from() counts codepoints, so a
  // 141-emoji string must clamp to 140 emoji, not to 70 (half, if code units were
  // mistakenly counted) or 141 (uncapped).
  const emojiComment = "❄️".repeat(141)
  const clamped = clampConditionsComment(emojiComment)
  assert.equal(Array.from(clamped).length, 140)
})

test("clampConditionsComment trims a trailing space left by truncation", () => {
  const longWithTrailingSpace = "a".repeat(139) + " " + "b".repeat(10)
  const clamped = clampConditionsComment(longWithTrailingSpace)
  assert.equal(clamped, "a".repeat(139))
})

test("clampConditionsComment returns '' for non-strings", () => {
  assert.equal(clampConditionsComment(undefined), "")
  assert.equal(clampConditionsComment(null), "")
  assert.equal(clampConditionsComment(42), "")
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `SNOW_QUALITY_OPTIONS is not defined` (or equivalent import error), since none
of the six names exist yet in `skiDayDetails.js`.

- [ ] **Step 3: Implement the helpers**

Add to the end of `src/lib/skiDayDetails.js` (after the existing `clampTitle` function, which
ends the file today):

```js
/** Allowed snow_quality chip values, in display order. */
export const SNOW_QUALITY_OPTIONS = ["powder", "groomed", "icy", "slushy"]

/** Allowed crowd_level chip values, in display order. */
export const CROWD_LEVEL_OPTIONS = ["empty", "light", "moderate", "packed"]

/**
 * Max conditions-report comment length, in CODEPOINTS — the same unit as the
 * ski_sessions_conditions_comment_length CHECK constraint's char_length().
 */
export const CONDITIONS_COMMENT_MAX_LENGTH = 140

/**
 * `value` if it is one of SNOW_QUALITY_OPTIONS, otherwise null.
 *
 * Applied both in the form (so a stray value can never be typed, only picked from the chip
 * row) and in updateSessionConditions() (socialApi.js), mirroring clampTitle's defense-in-
 * depth reasoning: a caller that skips the form cannot trip the
 * ski_sessions_snow_quality_check CHECK and get a 400 instead of a clean null.
 */
export function normalizeSnowQuality(value) {
  return SNOW_QUALITY_OPTIONS.includes(value) ? value : null
}

/** `value` if it is one of CROWD_LEVEL_OPTIONS, otherwise null. Same reasoning as above. */
export function normalizeCrowdLevel(value) {
  return CROWD_LEVEL_OPTIONS.includes(value) ? value : null
}

/**
 * Trim a typed conditions comment and cap it at CONDITIONS_COMMENT_MAX_LENGTH codepoints.
 *
 * Array.from(), not String.prototype.slice — same reasoning as clampTitle: the DB CHECK is
 * char_length(conditions_comment) <= 140, which counts codepoints, and slice() counts UTF-16
 * code units, which would both under-allow an emoji-heavy comment and risk storing a lone
 * surrogate.
 *
 * Non-strings return "" rather than being coerced, matching clampTitle.
 */
export function clampConditionsComment(value) {
  if (typeof value !== "string") return ""

  const trimmed = value.trim()
  const chars = Array.from(trimmed)
  if (chars.length <= CONDITIONS_COMMENT_MAX_LENGTH) return trimmed

  return chars.slice(0, CONDITIONS_COMMENT_MAX_LENGTH).join("").trimEnd()
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all tests including the pre-existing ones in this file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/skiDayDetails.js src/lib/skiDayDetails.test.js
git commit -m "feat: add snow/crowd vocabulary and comment clamp to skiDayDetails.js"
```

---

### Task 3: Pure helper — conditions-report display window cutoff

**Files:**
- Create: `src/lib/conditionsReportWindow.js`
- Create: `src/lib/conditionsReportWindow.test.js`

**Interfaces:**
- Consumes: `localDateKey` from `src/lib/calendarDates.js` (existing, unmodified).
- Produces: `CONDITIONS_REPORT_WINDOW_DAYS: number`,
  `conditionsReportCutoffDateKey(now?: Date): string` ("YYYY-MM-DD"). Task 6 (the widget's data
  fetch) imports both by name.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/conditionsReportWindow.test.js`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { CONDITIONS_REPORT_WINDOW_DAYS, conditionsReportCutoffDateKey } from "./conditionsReportWindow.js"

// Every Date below is constructed from LOCAL parts (new Date(y, mIndex, d, …)), so every
// expected key holds in every timezone the test runner might be in — same convention as
// skiDayNudge.test.js's cutoff tests, which this mirrors.

test("CONDITIONS_REPORT_WINDOW_DAYS is 14", () => {
  assert.equal(CONDITIONS_REPORT_WINDOW_DAYS, 14)
})

test("conditionsReportCutoffDateKey returns the local date exactly 14 days back", () => {
  assert.equal(conditionsReportCutoffDateKey(new Date(2026, 2, 10, 12, 0)), "2026-02-24")
})

test("conditionsReportCutoffDateKey crosses a month boundary", () => {
  // 2026-03-05 minus 14 days walks back through Mar 1 into February, which has 28 days in
  // 2026 (not a leap year). Off-by-one here silently widens or narrows the whole window.
  assert.equal(conditionsReportCutoffDateKey(new Date(2026, 2, 5)), "2026-02-19")
})

test("conditionsReportCutoffDateKey crosses a year boundary", () => {
  assert.equal(conditionsReportCutoffDateKey(new Date(2026, 0, 3)), "2025-12-20")
})

test("conditionsReportCutoffDateKey handles a leap February", () => {
  // 2028 is a leap year, so Feb has 29 days and 2028-03-05 minus 14 is Feb 20, not Feb 19 as
  // it would be in a common year.
  assert.equal(conditionsReportCutoffDateKey(new Date(2028, 2, 5)), "2028-02-20")
})

test("conditionsReportCutoffDateKey is DST-safe across America/Denver's spring forward", () => {
  // Denver springs forward at 02:00 on 2026-03-08. Computing this cutoff as
  // `Date.now() - 14 * 864e5` from 2026-03-10T00:30 local would land one day off because the
  // interval spans a 23-hour day. Date-part arithmetic (getFullYear/getMonth/getDate, never a
  // raw millisecond subtraction) never touches a clock offset, so it stays correct.
  assert.equal(conditionsReportCutoffDateKey(new Date(2026, 2, 10, 0, 30)), "2026-02-24")
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './conditionsReportWindow.js'`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/conditionsReportWindow.js`:

```js
/**
 * Pure date-window logic for the crowdsourced conditions-reports widget: how far back a ski
 * day's snow/crowd report still counts as "recent" on a resort's page.
 *
 * Lives in its own file rather than skiDayDetails.js, because that module's header states it
 * imports NOTHING on purpose and this needs localDateKey(). Mirrors skiDayNudge.js's
 * nudgeCutoffDateKey() exactly — same DST-safe local-date-part arithmetic, same reason: a UTC
 * or millisecond-subtraction cutoff drifts by a day around timezone/DST boundaries.
 */

import { localDateKey } from "./calendarDates.js"

/**
 * How far back the "Recent Reports" widget looks. Long enough that a lower-traffic resort's
 * widget doesn't look empty for days at a time; short enough that a three-week-old report —
 * actively misleading about today's conditions — never shows up as current.
 */
export const CONDITIONS_REPORT_WINDOW_DAYS = 14

/**
 * The oldest session_date still inside the window, as a "YYYY-MM-DD" key.
 *
 * Built from local date parts (new Date(y, mIndex, d - N)), not millisecond subtraction — see
 * nudgeCutoffDateKey's header comment in skiDayNudge.js for the DST/UTC reasoning this mirrors
 * exactly. The Date constructor normalizes day overflow across months, years, and leap days on
 * its own, so no month-length arithmetic is needed here.
 */
export function conditionsReportCutoffDateKey(now = new Date()) {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - CONDITIONS_REPORT_WINDOW_DAYS)
  return localDateKey(cutoff)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/conditionsReportWindow.js src/lib/conditionsReportWindow.test.js
git commit -m "feat: add conditions-report 14-day window cutoff helper"
```

---

### Task 4: Writer — `updateSessionConditions()` and extend `saveSkiDayDetails()`

**Files:**
- Modify: `src/lib/socialApi.js:6` (import line), `src/lib/socialApi.js:4167-4177`
  (insert new function after `updateSessionTitle`), `src/lib/socialApi.js:4420-4457`
  (`saveSkiDayDetails`)

**Interfaces:**
- Consumes: `normalizeSnowQuality`, `normalizeCrowdLevel`, `clampConditionsComment` from
  `src/lib/skiDayDetails.js` (Task 2). Requires Task 1's migration to be applied — this task
  writes to columns that must already exist.
- Produces: `updateSessionConditions(sessionId, { snowQuality, crowdLevel, comment }):
  Promise<{ snowQuality: string|null, crowdLevel: string|null, comment: string|null }>`.
  `saveSkiDayDetails(sessionId, diff)`'s accepted `diff` shape grows to include
  `snowQuality?: string|null`, `crowdLevel?: string|null`, `comment?: string|null` — all three
  optional, same "absent key means don't touch this" convention `title` already uses. Task 5
  (the form) is the only caller that emits these new diff keys.

- [ ] **Step 1: Update the import line**

In `src/lib/socialApi.js`, change line 6 from:

```js
import { clampTitle, groupPhotosBySession, groupTagsBySession } from "./skiDayDetails";
```

to:

```js
import {
  clampTitle,
  groupPhotosBySession,
  groupTagsBySession,
  normalizeSnowQuality,
  normalizeCrowdLevel,
  clampConditionsComment,
} from "./skiDayDetails";
```

- [ ] **Step 2: Add `updateSessionConditions()` right after `updateSessionTitle()`**

Insert immediately after the closing `}` of `updateSessionTitle` (currently ending at line 4177,
right before the `getSessionPhotos` doc comment):

```js

/**
 * Set (or clear) a ski day's snow quality, crowd level, and optional comment — the
 * crowdsourced conditions report (2026-10-01 design spec).
 *
 * Same shape as updateSessionTitle just above: one UPDATE, all three values normalized/
 * clamped server-bound exactly as the form does in its own onChange, so a caller that skips
 * the form cannot trip one of the three new CHECK constraints and get a 400 instead of a
 * clean null/clamp. .select(...).single() for the same reason updateSessionTitle uses it —
 * ski_sessions' UPDATE policy is owner-only, and without the select a refused update returns
 * success while saving nothing.
 */
export async function updateSessionConditions(sessionId, { snowQuality, crowdLevel, comment } = {}) {
  const { data, error } = await supabase
    .from("ski_sessions")
    .update({
      snow_quality: normalizeSnowQuality(snowQuality),
      crowd_level: normalizeCrowdLevel(crowdLevel),
      conditions_comment: clampConditionsComment(comment) || null,
    })
    .eq("id", sessionId)
    .select("id, snow_quality, crowd_level, conditions_comment")
    .single()
  if (error) throw error
  return {
    snowQuality: data?.snow_quality ?? null,
    crowdLevel: data?.crowd_level ?? null,
    comment: data?.conditions_comment ?? null,
  }
}
```

- [ ] **Step 3: Extend `saveSkiDayDetails()`**

Change this (currently at roughly line 4420-4428):

```js
export async function saveSkiDayDetails(sessionId, diff) {
  if (!sessionId) throw new Error("saveSkiDayDetails needs a session id.")

  const { title, addedPhotoFiles, removedPhotoIds, tagUserIds } = diff || {}

  if (title !== undefined) {
    await updateSessionTitle(sessionId, title)
  }
```

to:

```js
export async function saveSkiDayDetails(sessionId, diff) {
  if (!sessionId) throw new Error("saveSkiDayDetails needs a session id.")

  const { title, snowQuality, crowdLevel, comment, addedPhotoFiles, removedPhotoIds, tagUserIds } = diff || {}

  if (title !== undefined) {
    await updateSessionTitle(sessionId, title)
  }

  // Same absent-key convention as `title` just above: SkiDayDetailsForm only emits these
  // three keys when its conditions section is shown at all (initialSnowQuality !== undefined),
  // so a future consumer that hides the section cannot accidentally null out an existing
  // report just by omitting it.
  if (snowQuality !== undefined || crowdLevel !== undefined || comment !== undefined) {
    await updateSessionConditions(sessionId, { snowQuality, crowdLevel, comment })
  }
```

Leave everything below this (the photos/tags handling and the final return) unchanged.

Also update the doc comment directly above `saveSkiDayDetails` — it currently reads:

```
 * `diff` is what SkiDayDetailsForm's onSave emits:
 *   { title, addedPhotoFiles, removedPhotoIds, tagUserIds }
```

Change to:

```
 * `diff` is what SkiDayDetailsForm's onSave emits:
 *   { title, snowQuality, crowdLevel, comment, addedPhotoFiles, removedPhotoIds, tagUserIds }
```

- [ ] **Step 4: Verify — run the existing test suite**

Run: `npm test`
Expected: PASS (unchanged — `socialApi.js` has no dedicated test file; this step just confirms
the import/edit didn't break anything the suite does cover, e.g. `skiDayDetails.test.js`).

Then verify by reading the diff: confirm `updateSessionConditions` is called with the three
diff keys exactly, and that `title`'s existing branch is untouched above it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/socialApi.js
git commit -m "feat: add updateSessionConditions() and wire it into saveSkiDayDetails()"
```

---

### Task 5: Shared UI — add conditions questions to `SkiDayDetailsForm` and wire all 3 entry points

**Files:**
- Modify: `src/components/SkiDayDetailsForm.jsx`
- Modify: `src/components/LeaderboardPage.jsx` (the `LogDayModal` function, lines ~30-146)
- Modify: `src/components/SessionRecapModal.jsx`
- Modify: `src/components/SessionEditForm.jsx`

**Interfaces:**
- Consumes: `SNOW_QUALITY_OPTIONS`, `CROWD_LEVEL_OPTIONS`, `CONDITIONS_COMMENT_MAX_LENGTH`,
  `clampConditionsComment` from `src/lib/skiDayDetails.js` (Task 2). Requires Task 4's
  `saveSkiDayDetails()` diff shape to already accept the new keys, or they're silently dropped.
- Produces: `SkiDayDetailsForm` gains three new optional props —
  `initialSnowQuality?: string|null`, `initialCrowdLevel?: string|null`,
  `initialComment?: string`. Passing `initialSnowQuality` (even `null`) shows the conditions
  section and makes `onSave`'s diff include `snowQuality`/`crowdLevel`/`comment`; omitting it
  hides the section and those three diff keys stay `undefined` — same convention `initialTitle`
  already establishes for `showTitle`.

- [ ] **Step 1: Add the new props, state, and chip helper to `SkiDayDetailsForm.jsx`**

Add to the top-of-file import (currently `import { validatePhotoSelection, clampTitle,
MAX_PHOTOS_PER_SESSION, MAX_PHOTO_BYTES, TITLE_MAX_LENGTH } from "../lib/skiDayDetails"`):

```js
import {
  validatePhotoSelection,
  clampTitle,
  MAX_PHOTOS_PER_SESSION,
  MAX_PHOTO_BYTES,
  TITLE_MAX_LENGTH,
  SNOW_QUALITY_OPTIONS,
  CROWD_LEVEL_OPTIONS,
  CONDITIONS_COMMENT_MAX_LENGTH,
  clampConditionsComment,
} from "../lib/skiDayDetails"
```

Add a chip-style helper near the top of the file, alongside the existing `labelStyle`/
`inputStyle` constants:

```js
const chipStyle = (active) => ({
  padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
  border: active ? "1.5px solid var(--color-accent)" : "1.5px solid var(--overlay-12)",
  background: active ? "var(--color-accent-glow)" : "var(--overlay-05)",
  color: active ? "var(--color-accent)" : "var(--ink-65)",
})
```

In the component's prop list, add the three new props:

```js
export default function SkiDayDetailsForm({
  initialTitle,
  initialSnowQuality,
  initialCrowdLevel,
  initialComment,
  initialPhotos,
  initialTags,
  saving = false,
  onSave,
  onSkip,
}) {
  const showTitle = initialTitle !== undefined
  const showConditions = initialSnowQuality !== undefined
```

Add new state right below the existing `title` state:

```js
  const [snowQuality, setSnowQuality] = useState(() => initialSnowQuality ?? null)
  const [crowdLevel, setCrowdLevel] = useState(() => initialCrowdLevel ?? null)
  const [comment, setComment] = useState(() => clampConditionsComment(initialComment ?? ""))
```

- [ ] **Step 2: Emit the new diff keys from `handleSave`**

Change:

```js
  function handleSave() {
    onSave({
      title: showTitle ? clampTitle(title) : undefined,
      addedPhotoFiles: pending.map((p) => p.file),
      removedPhotoIds: [...removedIds],
      tagUserIds: tagsTouched ? [...tagIds] : undefined,
    })
  }
```

to:

```js
  function handleSave() {
    onSave({
      title: showTitle ? clampTitle(title) : undefined,
      snowQuality: showConditions ? snowQuality : undefined,
      crowdLevel: showConditions ? crowdLevel : undefined,
      comment: showConditions ? clampConditionsComment(comment) : undefined,
      addedPhotoFiles: pending.map((p) => p.file),
      removedPhotoIds: [...removedIds],
      tagUserIds: tagsTouched ? [...tagIds] : undefined,
    })
  }
```

- [ ] **Step 3: Render the two chip rows and the comment input**

Insert this block right after the Photos section's closing `</div>` (the one containing the
`{notice && ...}` line) and right before the existing `<div><div style={labelStyle}>Who did you
ski with?</div>...` block:

```jsx
      {showConditions && (
        <>
          <div>
            <div style={labelStyle}>
              Snow quality <span style={{ opacity: 0.5 }}>(optional)</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {SNOW_QUALITY_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setSnowQuality(snowQuality === opt ? null : opt)}
                  style={chipStyle(snowQuality === opt)}
                >
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={labelStyle}>
              Crowd level <span style={{ opacity: 0.5 }}>(optional)</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {CROWD_LEVEL_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setCrowdLevel(crowdLevel === opt ? null : opt)}
                  style={chipStyle(crowdLevel === opt)}
                >
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={labelStyle}>
              Comment <span style={{ opacity: 0.5 }}>(optional)</span>
            </div>
            <input
              style={inputStyle}
              value={comment}
              placeholder="Icy on the back side, fine up top…"
              onChange={(e) =>
                setComment(Array.from(e.target.value).slice(0, CONDITIONS_COMMENT_MAX_LENGTH).join(""))
              }
            />
            <div style={{ fontSize: 11, color: "var(--ink-35)", marginTop: 4, textAlign: "right" }}>
              {Array.from(comment).length}/{CONDITIONS_COMMENT_MAX_LENGTH}
            </div>
          </div>
        </>
      )}
```

- [ ] **Step 4: Wire `LogDayModal` (inside `src/components/LeaderboardPage.jsx`)**

Change the `"details"` step's `<SkiDayDetailsForm>` call (currently):

```jsx
            <SkiDayDetailsForm
              initialTitle=""
              initialPhotos={[]}
              initialTags={[]}
              saving={detailsSaving}
              onSave={handleSaveDetails}
              onSkip={onClose}
            />
```

to:

```jsx
            <SkiDayDetailsForm
              initialTitle=""
              initialSnowQuality={null}
              initialCrowdLevel={null}
              initialComment=""
              initialPhotos={[]}
              initialTags={[]}
              saving={detailsSaving}
              onSave={handleSaveDetails}
              onSkip={onClose}
            />
```

- [ ] **Step 5: Wire `SessionRecapModal.jsx`**

This modal stays open after a successful save and re-seeds the form from a `detailsKey` bump, so
— exactly like `savedTitle` already exists to avoid reverting to a stale `session.title` on that
remount — add a sibling `savedConditions` state.

Add this state declaration right below the existing `savedTitle` declaration:

```js
  // Mirrors savedTitle immediately above: after a successful conditions save, the form
  // remounts (via the same detailsKey bump) and must show what was just saved, not the
  // stale `session.snow_quality`/`crowd_level`/`conditions_comment` props.
  const [savedConditions, setSavedConditions] = useState(null)
```

In `handleSaveDetails`, right after the existing `if (diff.title !== undefined) setSavedTitle(diff.title)`
line, add:

```js
      if (diff.snowQuality !== undefined || diff.crowdLevel !== undefined || diff.comment !== undefined) {
        setSavedConditions({ snowQuality: diff.snowQuality, crowdLevel: diff.crowdLevel, comment: diff.comment })
      }
```

Change the `<SkiDayDetailsForm>` call (currently):

```jsx
            <SkiDayDetailsForm
              key={detailsKey}
              initialTitle={savedTitle ?? session.title ?? ""}
              initialPhotos={details.photos}
              initialTags={details.tags}
              saving={detailsSaving}
              onSave={handleSaveDetails}
            />
```

to:

```jsx
            <SkiDayDetailsForm
              key={detailsKey}
              initialTitle={savedTitle ?? session.title ?? ""}
              initialSnowQuality={savedConditions?.snowQuality ?? session.snow_quality ?? null}
              initialCrowdLevel={savedConditions?.crowdLevel ?? session.crowd_level ?? null}
              initialComment={savedConditions?.comment ?? session.conditions_comment ?? ""}
              initialPhotos={details.photos}
              initialTags={details.tags}
              saving={detailsSaving}
              onSave={handleSaveDetails}
            />
```

- [ ] **Step 6: Wire `SessionEditForm.jsx`**

This modal closes on a successful save (confirmed via its mount site, `ProfileStats.jsx:192-213`
— `onRefresh?.()` runs and then the modal closes), so unlike `SessionRecapModal` there is no
remount-while-open case and no shadow "saved" state is needed — the `session` prop is read
directly, the same way `details.photos`/`details.tags` already are.

Change (currently):

```jsx
        <SkiDayDetailsForm
          initialPhotos={details.photos}
          initialTags={details.tags}
          saving={saving}
          onSave={(diff) => handleSave(diff)}
        />
```

to:

```jsx
        <SkiDayDetailsForm
          initialSnowQuality={session?.snow_quality ?? null}
          initialCrowdLevel={session?.crowd_level ?? null}
          initialComment={session?.conditions_comment ?? ""}
          initialPhotos={details.photos}
          initialTags={details.tags}
          saving={saving}
          onSave={(diff) => handleSave(diff)}
        />
```

Note: `initialTitle` stays deliberately omitted here, unchanged — `SessionEditForm` keeps its own
separate Title input (Correction 4, documented in the file's existing comments), and this step
does not touch that.

- [ ] **Step 7: Verify**

This is a pure-UI change with no automated coverage (consistent with every other `.jsx` file in
this codebase — `npm test` only globs `src/lib`). Verify by:
1. Running `npm test` — expect PASS, unchanged (confirms nothing in `src/lib` broke).
2. Reading the diff in each of the four files and confirming: `showConditions` is only ever
   `true` when `initialSnowQuality !== undefined` is actually passed; all three new props are
   passed at all three call sites; `SessionEditForm`'s own title input is untouched.
3. A manual click-test once deployed: log a day via each of the three entry points, pick a snow
   quality and crowd level, type a comment, save, and confirm the value sticks after reopening
   that session's edit form. This manual step is explicitly deferred to whenever the branch is
   deployed — it isn't a blocker for merging this plan's tasks, matching how every other `.jsx`
   change in this codebase's history has shipped (test/lint/build-verified, then click-tested
   later).

- [ ] **Step 8: Commit**

```bash
git add src/components/SkiDayDetailsForm.jsx src/components/LeaderboardPage.jsx src/components/SessionRecapModal.jsx src/components/SessionEditForm.jsx
git commit -m "feat: add snow/crowd/comment questions to the ski-day-logging flow"
```

---

### Task 6: Reader — "Recent Reports" widget on the resort page

**Files:**
- Modify: `src/lib/socialApi.js` (new `getConditionsReports()` function, new import)
- Create: `src/components/ConditionsReportsWidget.jsx`
- Modify: `src/lib/mountainPageWidgets.js`

**Interfaces:**
- Consumes: `conditionsReportCutoffDateKey` from `src/lib/conditionsReportWindow.js` (Task 3).
  Requires Task 1's migration (reads the three new columns) — the columns must exist for this
  query to succeed, though a missing/empty result would just mean no rows match, not a crash,
  since `select()` on a nonexistent column is the only failure mode and these columns will exist
  by the time this ships.
- Produces: `getConditionsReports(resortKey, limit = 20): Promise<Array<{id, user_id,
  session_date, snow_quality, crowd_level, conditions_comment, profiles}>>`. A new widget entry
  `{ key: "reports", label: "📝 Recent Reports", rolloutResorts: "all", Component:
  ConditionsReportsWidget }` in `MOUNTAIN_PAGE_WIDGETS` — `MountainPage.jsx` picks this up
  automatically with no changes to that file (it already renders every registered widget's
  `.Component` with `{resortKey, currentUserEmail}`).

- [ ] **Step 1: Add the import and `getConditionsReports()` to `socialApi.js`**

Add to the imports near the top of the file, alongside the existing
`import { nudgeCutoffDateKey, isSessionUntouched } from "./skiDayNudge";` line:

```js
import { conditionsReportCutoffDateKey } from "./conditionsReportWindow";
```

Insert this function right after `getRecentIncompleteSession()` (which currently ends at line
4519, immediately before the `// ─── Mountain Board (sprint-29) ───` section header):

```js

/**
 * Up to `limit` recent conditions reports for one resort — the crowdsourced "how was it"
 * signal shown on the resort's own page (2026-10-01 design spec). Resort-wide, not friends-
 * only: ski_sessions' own SELECT policy already lets any authenticated user read any row
 * (migration 046's header comment documents this, deliberately left open), so these three
 * columns inherit that same visibility — no new RLS exists for them.
 *
 * A session with all three fields null never matches the .or(...) filter below, so a day
 * logged with no report simply never appears here.
 *
 * Same no-FK-embed pattern as getBoardPosts just below: there is no FK from
 * ski_sessions.user_id straight to profiles, so a `profiles:user_id(...)` embed would 400.
 * Resolve with a second batched query instead.
 */
export async function getConditionsReports(resortKey, limit = 20) {
  const { data, error } = await supabase
    .from("ski_sessions")
    .select("id, user_id, session_date, snow_quality, crowd_level, conditions_comment")
    .eq("resort_name", resortKey)
    .or("snow_quality.not.is.null,crowd_level.not.is.null,conditions_comment.not.is.null")
    .gte("session_date", conditionsReportCutoffDateKey())
    .order("session_date", { ascending: false })
    .limit(limit)
  if (error) throw error
  const reports = data || []
  if (!reports.length) return reports

  const userIds = [...new Set(reports.map((r) => r.user_id))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", userIds)

  const pm = new Map((profiles || []).map((p) => [p.id, p]))
  return reports.map((r) => ({ ...r, profiles: pm.get(r.user_id) || null }))
}
```

- [ ] **Step 2: Create the widget component**

Create `src/components/ConditionsReportsWidget.jsx`:

```jsx
import { useEffect, useState } from "react"
import { getConditionsReports } from "../lib/socialApi"
import { timeAgo } from "../lib/format"
import { RESORT_NAMES } from "../lib/resorts"
import AccentCard from "./ui/AccentCard"

const SNOW_QUALITY_LABEL = {
  powder: "❄️ Powder",
  groomed: "🪨 Groomed",
  icy: "🧊 Icy",
  slushy: "💦 Slushy",
}

const CROWD_LEVEL_LABEL = {
  empty: "🫥 Empty",
  light: "🙂 Light",
  moderate: "😐 Moderate",
  packed: "😬 Packed",
}

const chipLabelStyle = {
  fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
  border: "1px solid var(--overlay-12)", background: "var(--overlay-05)", color: "var(--ink-70)",
}

// MountainPage renders every widget's Component with exactly { resortKey,
// currentUserEmail } (mountainPageWidgets.js's own contract) — currentUserEmail is
// unused here, matching EventsWidget's existing precedent of ignoring props it
// doesn't need rather than requiring every widget use every prop.
export default function ConditionsReportsWidget({ resortKey }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    getConditionsReports(resortKey)
      .then((rows) => { if (!cancelled) setReports(rows) })
      .catch((err) => { if (!cancelled) { setReports([]); setLoadError(err) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [resortKey])

  if (loading) {
    return <div style={{ padding: 20, fontSize: 13, color: "var(--ink-40)" }}>Loading…</div>
  }
  if (loadError) {
    return (
      <div style={{ padding: 20, fontSize: 13, color: "var(--color-danger)" }}>
        Couldn't load recent reports. Try again in a bit.
      </div>
    )
  }
  if (!reports.length) {
    return (
      <div style={{ padding: 20, fontSize: 13, color: "var(--ink-40)" }}>
        No conditions reports at {RESORT_NAMES[resortKey] || resortKey} in the last two weeks. Log
        a ski day here to add one.
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {reports.map((r) => {
        const reporter = r.profiles?.full_name || r.profiles?.username || "Someone"
        const snow = r.snow_quality ? SNOW_QUALITY_LABEL[r.snow_quality] : null
        const crowd = r.crowd_level ? CROWD_LEVEL_LABEL[r.crowd_level] : null
        return (
          <AccentCard key={r.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--color-text-1)" }}>{reporter}</span>
              {/* "T12:00:00" anchors the bare DATE string to local noon before parsing — the
                  same reasoning src/lib/format.js's formatDate()/formatDateFull() already
                  document: parsing "YYYY-MM-DD" bare is UTC midnight, which can read as the
                  PREVIOUS calendar day once shifted to Mountain Time. */}
              <span style={{ fontSize: 11, color: "var(--ink-40)" }}>{timeAgo(`${r.session_date}T12:00:00`)}</span>
            </div>
            {(snow || crowd) && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: r.conditions_comment ? 6 : 0 }}>
                {snow && <span style={chipLabelStyle}>{snow}</span>}
                {crowd && <span style={chipLabelStyle}>{crowd}</span>}
              </div>
            )}
            {r.conditions_comment && (
              <div style={{ fontSize: 13, color: "var(--color-text-1)" }}>{r.conditions_comment}</div>
            )}
          </AccentCard>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Register the widget**

Change `src/lib/mountainPageWidgets.js` from:

```js
import MountainBoard from "../components/MountainBoard"
import EventsWidget from "../components/EventsWidget"

export const MOUNTAIN_PAGE_WIDGETS = [
  { key: "board", label: "📋 Board", rolloutResorts: "all", Component: MountainBoard },
  { key: "events", label: "📅 Events", rolloutResorts: ["kramesbutte"], Component: EventsWidget },
]
```

to:

```js
import MountainBoard from "../components/MountainBoard"
import EventsWidget from "../components/EventsWidget"
import ConditionsReportsWidget from "../components/ConditionsReportsWidget"

export const MOUNTAIN_PAGE_WIDGETS = [
  { key: "board", label: "📋 Board", rolloutResorts: "all", Component: MountainBoard },
  { key: "reports", label: "📝 Recent Reports", rolloutResorts: "all", Component: ConditionsReportsWidget },
  { key: "events", label: "📅 Events", rolloutResorts: ["kramesbutte"], Component: EventsWidget },
]
```

- [ ] **Step 4: Verify**

1. Run `npm test` — expect PASS, unchanged.
2. Run `npm run build` — expect it to complete clean, confirming `ConditionsReportsWidget.jsx`
   has no syntax errors and every import it uses (`AccentCard`, `timeAgo`, `RESORT_NAMES`,
   `getConditionsReports`) resolves.
3. Read the diff and confirm: the widget key `"reports"` doesn't collide with `"board"` or
   `"events"`; `rolloutResorts: "all"` means it shows up immediately on every resort, not gated
   behind the Krames Butte dev-rollout mechanism.
4. Manual click-test once deployed: open any resort's Mountain Page, tap the new "📝 Recent
   Reports" tab, confirm it loads (empty state is fine pre-launch, before anyone has submitted a
   report yet). Deferred to deployment, same as Task 5's manual step.

- [ ] **Step 5: Commit**

```bash
git add src/lib/socialApi.js src/components/ConditionsReportsWidget.jsx src/lib/mountainPageWidgets.js
git commit -m "feat: add Recent Reports widget to the resort page"
```

---

## Self-Review Notes

**Spec coverage:** Visibility (resort-wide, Task 1's inherited RLS) ✓. No Powder Score tie-in
(no task touches `powderScore.js`, confirmed in Global Constraints) ✓. Entry point tied to
logging a ski day (Task 5 wires all 3 entry points, no standalone button) ✓. Snow quality 4-value
vocabulary (Task 2) ✓. Crowd level 4 tiers (Task 2) ✓. Optional comment (Task 2, Task 5) ✓. 14-day
window (Task 3, Task 6) ✓. Resort-page display, no-FK-embed pattern (Task 6) ✓. Empty-state
message matching `MountainBoard`'s precedent (Task 6, Step 2) ✓.

**Placeholder scan:** No TBD/TODO. Every step has literal code, not a description of code.

**Type consistency:** `diff.snowQuality`/`crowdLevel`/`comment` (camelCase, matching `title`'s
own camelCase-in-JS-vs-snake_case-in-DB convention) are used identically in Task 4's
`saveSkiDayDetails`/`updateSessionConditions` and Task 5's `SkiDayDetailsForm.handleSave` —
confirmed matching across both tasks. `SNOW_QUALITY_OPTIONS`/`CROWD_LEVEL_OPTIONS` (Task 2) are
consumed by identical name in Task 4 (`normalizeSnowQuality`/`normalizeCrowdLevel`, which read
from these arrays internally) and Task 5 (rendered directly as chip options) — no renaming
drift. `conditionsReportCutoffDateKey` (Task 3) is consumed by identical name in Task 6.
