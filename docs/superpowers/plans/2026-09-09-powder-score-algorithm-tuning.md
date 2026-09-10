# Powder Score Algorithm Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the Powder Score from inflating on cold, snowless days with missing lift/run data — by excluding terrain from the formula (instead of guessing 50% open, client-side, or hard-zeroing it, server-side) and rescaling the remaining components, raising the base-depth bar from 70" to 100", extracting the client formula into a unit-tested `src/lib/powderScore.js`, mirroring the same two changes by hand into `server/powderScore.js`, adding a 24-hour in-memory per-field last-known-good cache for scraped terrain data, and updating `PRD.md` §7.1 so the documented spec matches the shipped code.

**Architecture:** The scoring math moves out of `src/App.jsx` into a new pure module `src/lib/powderScore.js`, which is the only place the client formula lives and the only new file with automated coverage (`src/lib/powderScore.test.js`, run by the repo's existing `node --test src/lib/*.test.js`). `server/powderScore.js` is a separately-deployed npm package (Render) that cannot import from `src/lib`, so it receives the identical two logic changes as a **hand-mirrored edit** — no shared module, no monorepo restructure (explicit spec non-goal). `server/index.js` gains a module-local `Map` that remembers the last successfully-scraped `liftsOpen`/`liftsTotal`/`runsOpen`/`runsTotal` **per field** for 24 hours, applied inside `getResortConditions()` so both the HTTP route and the cron's `getAllResortConditions()` benefit from one code path. `PRD.md` §7.1 is updated last, with calibration numbers taken from the tests that were actually run, not from memory.

**Tech Stack:** React 19 (client, Vite 7), plain ES modules in `src/lib`, Node's built-in `node:test` + `node:assert/strict` (no external test framework anywhere in this repo), Express 4 + cheerio on the server, ESLint 9.

## Global Constraints

- **Source of truth:** `docs/superpowers/specs/2026-09-09-powder-score-algorithm-tuning-design.md`. Every Design Decision in it has a task below; every Non-goal is untouched. If that file is not in this worktree, read it from the main checkout at `/Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App/docs/superpowers/specs/2026-09-09-powder-score-algorithm-tuning-design.md`.
- **Exactly two formula changes ship in this branch.** (1) Terrain exclude-and-rescale, (2) `baseDepth / 14` becomes `baseDepth / 20`. **Nothing else about the math changes** — not the temperature bands, not the fresh-snow weights or caps, not incoming snow, not the `+2` snow hint, not the wind penalty, not the drive penalty, not the tier thresholds, not the closed-resort `null` handling, not the absolute (non-relative) scoring philosophy. These are named non-goals in the spec. If an extraction makes you *want* to "clean up" one of them, don't.
- **`server/powderScore.js` is a mirrored edit, never an import.** `server/package.json` is a separate package (`ski-dashboard-backend`) deployed to Render. It must not import from `src/lib`, and no shared/duplicated build step may be introduced. Spec non-goal: "Syncing `server/powderScore.js` via a shared module/monorepo restructure."
- **The last-known-good cache is in-memory only.** No Supabase table, no migration, no disk persistence, no retry logic, no new data source, no scraper alerting. All of that is TASK 22.3 (Sprint 45). The spec states the reset-on-deploy behaviour as a deliberate, accepted limitation — do not "fix" it.
- **No new automated test suite for the cache.** The spec says correctness there is verified by code review plus a manual check. Task 4 provides that manual check as an exact command with exact expected output. Do not add a `server/*.test.js` — `npm test` only globs `src/lib/*.test.js` and there is no server test harness in this repo.
- **Test style is fixed by the repo.** Every file in `src/lib/*.test.js` starts with `import { test } from "node:test"` and `import assert from "node:assert/strict"`, then flat top-level `test("...", () => { ... })` calls grouped by `// -- section --` comments. No `describe`, no `it`, no vitest, no jest. Match it exactly.
- **Import extensions:** test files and other `src/lib` modules import each other **with** the `.js` extension (`from "./seasonGrid.js"`), because `node --test` runs them raw. `src/App.jsx` imports lib modules **without** the extension (`from "./lib/resorts"`), because Vite resolves them. Follow both conventions where they apply.
- **Baselines measured in this worktree on 2026-09-09 at commit `64f7935`:**
  - `npm test` gives **265 tests, 265 pass, 0 fail**.
  - `npx eslint .` gives **85 problems (78 errors, 7 warnings)**. Do not incidentally "fix" that baseline; do not let it rise.
  - `npx eslint src/App.jsx` gives **exactly 1 problem**: `846:84 error Empty block statement no-empty`. That is pre-existing, is not in any code this branch touches, and stays. (Its line number will shift up by ~75 lines after Task 2 deletes the inline formula — that is expected.)
- **Commit after every task**, with the exact messages given. Never push, never open a PR — this branch is integrated separately.

---

## Verified against the live codebase (2026-09-09, worktree `powder-score-algorithm-tuning` at `64f7935`)

Every claim below was checked on disk before this plan was written. Where a check contradicted the brief, this plan follows the check and says so.

| # | Claim | Verified result |
|---|---|---|
| 1 | `computeRawPowderScore` and `normalizePowderScores` have exactly one consumer each | **CONFIRMED.** A repo-wide grep across `src/` returns only `src/App.jsx` — definitions at `:194` / `:263`, calls at `:754` / `:801`. Nothing else in `src/` or `src/components/` references them. Moving them to `src/lib` cannot break another screen. |
| 2 | `clamp()` and `safePercent()` in `App.jsx` are used *only* by the formula | **CONFIRMED.** Grepping `clamp(` and `safePercent(` in `src/App.jsx` returns lines 184-258 only — every call site is inside `computeRawPowderScore`. Both helpers therefore **move** to `src/lib/powderScore.js` and are **deleted** from `App.jsx`. Leaving them behind is an eslint `no-unused-vars` **error** (the rule is `error` with only `varsIgnorePattern: '^[A-Z_]'`, which lowercase `clamp` does not match). |
| 3 | Downstream components read `powderScore`/`powderTier` off the row object | **CONFIRMED** — `src/components/ResortListRow.jsx`, `PowderMap.jsx`, `TodayScreen.jsx`, `MountainPage.jsx` all read those two fields. The row shape produced by `normalizePowderScores` (`{ ...r, powderScore, powderTier }`) must be **byte-identical** after extraction. |
| 4 | The client's current terrain fallback assumes ~50% open | **CONFIRMED and it is the bug.** `src/App.jsx:236-240`: `(runsPct != null ? runsPct * 10 : 5) + (liftsPct != null ? liftsPct * 5 : 2.5)`. A resort with no parseable terrain data is silently handed **7.5 free points**. |
| 5 | The server's current terrain fallback hard-zeroes | **CONFIRMED, mirror-image bug.** `server/powderScore.js:43` uses `runsTotal > 0 ? ... : 0`, and `server/index.js:890-893` feeds it `conditions.runsOpen ?? 0` and three siblings. A resort with perfect snow but no terrain data is structurally capped at **85/100**. Task 3 fixes **both halves** — the formula *and* those four `?? 0` call-site coercions, which would otherwise defeat the new "is this pair available?" check by turning every missing value into a real `0`. |
| 6 | `computePowderScore` has how many call sites in `server/index.js`? | **ONE, not two.** Grepping the name returns `:8` (the import) and `:882` (inside `getAllResortConditions`). The `/api/resort-conditions` route (`:730-743`) returns raw conditions and does **not** score. The brief's "two call sites" is wrong; there is one. |
| 7 | `getResortConditions()` is the single aggregation point | **CONFIRMED** — `server/index.js:704`. Called by the route at `:738` and by `getAllResortConditions()` at `:874`. One insertion point covers both, exactly as the spec says. |
| 8 | `server/index.js` is safe to import as a module (needed for the manual cache check) | **CONFIRMED by running it.** Importing it from the repo root prints its seven exports and **exits cleanly with no env vars set** — `app.listen()` and the cron registration are gated behind `process.argv[1] === fileURLToPath(import.meta.url)` at the end of the file, and `getSupabase()` is lazy. This is why Task 4 can verify the cache with a one-liner instead of booting a server. |
| 9 | Client and server temperature handling already differ | **TRUE, PRE-EXISTING, AND OUT OF SCOPE.** The client defaults a missing `tempF` to `25` (20 pts) and uses inclusive bands (`t >= 20 && t <= 30`); the server returns `0` for a null `tempF` and uses exclusive `<` bands, so exactly `30F` scores 20 on the client and 17 on the server. **Do not fix this.** The spec's non-goals forbid touching the temp bands, and no task below changes `temperatureScore()` or the client's band ladder. |
| 10 | The server terrain term is unclamped today | **CONFIRMED** — `server/powderScore.js:43` has no `Math.min(..., 15)`; the client wraps its terrain in `clamp(..., 0, 15)`. Task 3 **keeps the server unclamped** (in both the both-pairs and single-pair branches) so the only server deltas are the two the spec authorises. This differs from the client only for impossible inputs (`open > total`), and is called out here so a reviewer does not read it as an oversight. |
| 11 | PRD 7.1's stated calibration ranges match the current code | **NO.** The PRD says the "solid mid-winter day" lands "~60-70" and "late-season slush" "~15-20"; the examples carry no base depth, wind, or 48h figures, so nothing is reproducible. Concrete fixtures scored against the **current** code give 58.1 and 12.1. Task 5 therefore rewrites those bullets with the exact inputs used by the tests and the exact scores those inputs now produce — that is what "recompute the calibration examples" (spec section 5) means in practice. |
| 12 | Does the base-depth change move any calibration example into a different tier? | **NO — computed, not assumed.** With the fixtures in Task 1: epic `97.3` to `96.3` (Elite to Elite), mid-winter `58.1` to `57.0` (Good to Good), warm bluebird `22.9` to `22.0` (Poor to Poor), late-season slush `12.1` to `11.5` (Poor to Poor). No tier boundary is crossed. The *numbers* still change, so the PRD bullets still need editing (Task 5). |
| 13 | `85 * (100 / 85)` in IEEE-754 double math | **Verified exactly `100`** (checked in node). A perfect snow/temp/base day with no terrain data lands on exactly `100`, not `100.00000000000001`, and the final clamp covers it regardless. |
| 14 | Test-file conventions | **Read directly** from `src/lib/seasonGrid.test.js:1-8` and `src/lib/skiDayNudge.test.js:1-9`: `import { test } from "node:test"`, `import assert from "node:assert/strict"`, a named-import block from the module under test, flat `test()` calls, section-rule comments. No `describe`/`it` anywhere in the repo. |
| 15 | Where the App.jsx import belongs | `src/App.jsx:53` is `import { normalizeResortKey } from "./lib/resorts"`, the last import in the file. The new powder-score import goes immediately after it, extension-less, matching every other lib import in that file. |

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/powderScore.js` | **Create** (Task 1) | The whole client formula: `clamp`, `safePercent`, `computeRawPowderScore`, `powderTierForScore`, `normalizePowderScores`. Pure, no React, no imports. |
| `src/lib/powderScore.test.js` | **Create** (Task 1) | The only automated coverage this branch adds. Calibration fixtures, terrain branches, base-depth bar, tier boundaries, penalty caps. |
| `src/App.jsx` | Modify (Task 2) | Deletes the inline formula (lines 184-279) and imports it instead. No other change. |
| `server/powderScore.js` | Modify (Task 3) | Hand-mirrored copy of the same two logic changes, in that file's own structure. `TEMP_BANDS`, `temperatureScore()`, `tierForScore()` untouched. |
| `server/index.js` | Modify (Tasks 3 and 4) | Task 3 stops coercing missing terrain to `0` at the `computePowderScore()` call site. Task 4 adds the last-known-good `Map` and applies it inside `getResortConditions()`. |
| `PRD.md` | Modify (Task 5) | Section 7.1 formula block, new "Missing terrain data" subsection, F-REQ-002 rewording, recomputed calibration bullets. |

---

## Task 1: Extract the formula to `src/lib/powderScore.js` with the two tuning changes

**Files:**
- Create: `src/lib/powderScore.js`
- Create: `src/lib/powderScore.test.js`

**Interfaces:**
- Consumes: nothing. This module has zero imports.
- Produces (Task 2 and Task 5 depend on these exact names):
  - `clamp(n: number, min: number, max: number) => number`
  - `safePercent(open: number|null|undefined, total: number|null|undefined) => number|null`
  - `computeRawPowderScore(input: { tempF?, windMph?, forecastText?, snowPrev24in?, snowPrev48in?, snow24in?, snow48in?, baseDepth?, liftsOpen?, liftsTotal?, runsOpen?, runsTotal?, drivePenalty? }) => number` — a 0-100 number rounded to one decimal place. Every field is optional and may be `null`/`undefined`.
  - `powderTierForScore(score: number) => "Elite"|"Very Good"|"Good"|"Okay"|"Poor"`
  - `normalizePowderScores(rows: Array<object>) => Array<object>` — returns `{ ...row, powderScore: number|null, powderTier: string }`. `isOpen === false` gives `{ powderScore: null, powderTier: "Closed" }`; a non-number `rawPowderScore` gives `{ powderScore: null, powderTier: "Unknown" }`.

- [ ] **Step 1: Write the failing tests for the two behaviour changes**

Create `src/lib/powderScore.test.js` with exactly this content:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  clamp,
  safePercent,
  computeRawPowderScore,
  powderTierForScore,
  normalizePowderScores,
} from "./powderScore.js"

// ── Terrain: exclude and rescale ────────────────────────────────────────────
//
// Terrain is worth 15 of the 100 points. It is the one component the app can
// fail to *fetch* rather than observe — 7 Ikon resorts plus Telluride are
// HTML-scraped and those pages break. Scoring an unknown as 0 caps a resort at
// 85/100; assuming half-open hands it 7.5 free points. So: use whichever pair
// we have (scaled to the full 15), and if we have neither, drop terrain and
// rescale the other four weighted components (max 85) up to fill 0-100.
//
// Every expected number below is hand-computed in the comment above it.

test("terrain scores 0-15 from both pairs when both are available", () => {
  // temp 25F -> 20 | runs 50% -> 5 | lifts 50% -> 2.5 | nothing else
  assert.equal(
    computeRawPowderScore({ tempF: 25, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10 }),
    27.5
  )
  // temp 25F -> 20 | runs 100% -> 10 | lifts 100% -> 5
  assert.equal(
    computeRawPowderScore({ tempF: 25, runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10 }),
    35
  )
})

test("lifts-only terrain is scaled to the full 15 points", () => {
  // temp 25F -> 20 | lifts 80% x 15 -> 12 (NOT 80% x 5 -> 4) | runs unknown
  assert.equal(
    computeRawPowderScore({ tempF: 25, liftsOpen: 8, liftsTotal: 10, runsOpen: null, runsTotal: null }),
    32
  )
})

test("runs-only terrain is scaled to the full 15 points", () => {
  // temp 25F -> 20 | runs 50% x 15 -> 7.5 (NOT 50% x 10 -> 5) | lifts unknown
  assert.equal(
    computeRawPowderScore({ tempF: 25, runsOpen: 50, runsTotal: 100, liftsOpen: null, liftsTotal: null }),
    27.5
  )
})

test("missing terrain drops out and the other four components rescale by 100/85", () => {
  // fresh 4in x 5 -> 20 | temp 26F -> 20 | base 40in / 20 -> 2 | terrain absent
  // (20 + 0 + 20 + 2) x (100 / 85) = 42 x 1.176470... = 49.411764... -> 49.4
  assert.equal(
    computeRawPowderScore({
      tempF: 26, snowPrev24in: 4, baseDepth: 40,
      runsOpen: null, runsTotal: null, liftsOpen: null, liftsTotal: null,
    }),
    49.4
  )
})

test("a perfect snow/temp/base day with no terrain data can still reach 100", () => {
  // fresh 32 + 8 = 40 | incoming 15 + 5 = 20 | temp 20 | base 100in / 20 -> 5
  // 85 x (100 / 85) = 100 exactly. The old formula capped this case at 92.5.
  assert.equal(
    computeRawPowderScore({
      tempF: 25, windMph: 0, forecastText: "Clear",
      snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
      baseDepth: 100,
      runsOpen: null, runsTotal: null, liftsOpen: null, liftsTotal: null,
    }),
    100
  )
})

test("missing terrain data cannot inflate a cold, snowless day (Kyle's case)", () => {
  // The complaint this whole task exists for: cold, zero fresh snow, zero
  // incoming, no lift/run data. temp 22F -> 20 | base 70in / 20 -> 3.5 |
  // (20 + 3.5) x (100 / 85) = 27.647... | wind 3mph x 0.75 = 2.25 penalty
  // -> 25.397... -> 25.4. Under the old formula it was 30.3, and 7.5 of that
  // was the phantom "half the mountain is probably open" terrain credit.
  const score = computeRawPowderScore({
    tempF: 22, windMph: 3, forecastText: "Sunny",
    snowPrev24in: 0, snowPrev48in: 0, snow24in: 0, snow48in: 0,
    baseDepth: 70,
    runsOpen: null, runsTotal: null, liftsOpen: null, liftsTotal: null,
  })
  assert.equal(score, 25.4)
  assert.ok(score <= 50, "expected <= 50, got " + score)
})

test("a zero total counts as missing terrain, not as 0% open", () => {
  // runsTotal 0 / liftsTotal 0 means "we parsed nothing", not "nothing is open".
  // temp 25F -> 20, rescaled: 20 x (100 / 85) = 23.529... -> 23.5
  assert.equal(
    computeRawPowderScore({ tempF: 25, runsOpen: 0, runsTotal: 0, liftsOpen: 0, liftsTotal: 0 }),
    23.5
  )
})

test("an open count without its total counts as a missing pair", () => {
  // runs has no total -> unusable, so this is the lifts-only path:
  // temp 25F -> 20 | lifts 80% x 15 -> 12
  assert.equal(
    computeRawPowderScore({ tempF: 25, runsOpen: 50, runsTotal: null, liftsOpen: 8, liftsTotal: 10 }),
    32
  )
})

// ── Base depth: 100 inches for full credit, not 70 ──────────────────────────

test("a 70-inch base no longer maxes the base component", () => {
  // temp 25F -> 20 | terrain 50%/50% -> 7.5 | base 70 / 20 = 3.5 -> 31
  assert.equal(
    computeRawPowderScore({
      tempF: 25, baseDepth: 70, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10,
    }),
    31
  )
})

test("a 100-inch base maxes the base component and deeper adds nothing", () => {
  // temp 25F -> 20 | terrain 7.5 | base min(100 / 20, 5) = 5 -> 32.5
  const at100 = computeRawPowderScore({
    tempF: 25, baseDepth: 100, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10,
  })
  const at180 = computeRawPowderScore({
    tempF: 25, baseDepth: 180, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10,
  })
  assert.equal(at100, 32.5)
  assert.equal(at180, 32.5)
})
```

- [ ] **Step 2: Run the tests and confirm they fail for the right reason**

Run: `npm test`

Expected: the run aborts on `src/lib/powderScore.test.js` with `Cannot find module .../src/lib/powderScore.js` (`ERR_MODULE_NOT_FOUND`). If you see any other error, stop and re-read Step 1 — the test file itself is wrong.

- [ ] **Step 3: Create the module**

Create `src/lib/powderScore.js` with exactly this content. It is `src/App.jsx:184-279` moved verbatim, with **only** the terrain block and the base-depth divisor changed:

```js
// Powder Score — the absolute 0-100 formula documented in PRD.md 7.1.
//
// Extracted from src/App.jsx so it can be unit-tested under this repo's
// `npm test` convention (node --test src/lib/*.test.js, which only globs
// src/lib). Pure: no React, no imports, no I/O.
//
// server/powderScore.js is a HAND-MIRRORED copy of this logic for the Render
// backend, which is a separate npm package and cannot import from src/lib.
// Any change here must be mirrored there, and in PRD.md 7.1.

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

// null means "we don't have this data", which is different from 0% open.
export function safePercent(open, total) {
  if (open == null || total == null || total === 0) return null
  return open / total
}

// Weighted components excluding terrain: fresh 40 + incoming 20 + temp 20 +
// base 5. Terrain is the other 15. When terrain is unavailable we rescale by
// 100 / POSITIVE_MAX_WITHOUT_TERRAIN so the remaining signal fills 0-100.
export const POSITIVE_MAX_WITHOUT_TERRAIN = 85

export function computeRawPowderScore({
  tempF,
  windMph,
  forecastText,
  snowPrev24in,
  snowPrev48in,
  snow24in,
  snow48in,
  baseDepth,
  liftsOpen,
  liftsTotal,
  runsOpen,
  runsTotal,
  drivePenalty,
}) {
  // ── Fresh snow (0–40 pts) ────────────────────────────────────────
  const freshSnow =
    clamp((snowPrev24in ?? 0) * 5, 0, 32) +   // last 24 h is king
    clamp((snowPrev48in ?? 0) * 1.5, 0, 8)     // 2-day accumulation bonus

  // ── Incoming snow (0–20 pts) ─────────────────────────────────────
  const incomingSnow =
    clamp((snow24in ?? 0) * 3.5, 0, 15) +      // next 24 h forecast
    clamp((snow48in ?? 0) * 1.0, 0, 5)          // 48 h forecast

  // ── Temperature (0–20 pts) — absolute bands ──────────────────────
  // 20-30°F = sweet spot | 30-40°F = warm bluebird | 40°F+ = slushy
  // 10-20°F = chilly | 0-10°F = frigid | sub-zero = freezing
  const t = tempF ?? 25
  const tempScore =
    t >= 20 && t <= 30 ? 20 :   // sweet spot: perfect powder temp
    t > 30 && t <= 35  ? 17 :   // warm, still great
    t > 35 && t <= 40  ? 11 :   // warm bluebird, snow softening
    t > 40 && t <= 48  ?  4 :   // slushy spring conditions
    t > 48             ?  0 :   // full spring slush
    t >= 12 && t < 20  ? 15 :   // chilly, dry powder
    t >=  0 && t < 12  ?  8 :   // frigid, icy
                          2     // sub-zero, brutal cold

  // ── Terrain (0–15 pts), excluded when we have no data ────────────
  // Both pairs: runs 10 + lifts 5. One pair: that pair alone, scaled to the
  // full 15. Neither: terrain leaves the formula and the rest is rescaled
  // below — never scored as 0 (which would cap the resort at 85) and never
  // assumed half-open (which used to hand it 7.5 free points).
  const runsPct  = safePercent(runsOpen,  runsTotal)
  const liftsPct = safePercent(liftsOpen, liftsTotal)
  const hasTerrainData = runsPct != null || liftsPct != null
  const terrainScore =
    runsPct != null && liftsPct != null ? clamp(runsPct * 10 + liftsPct * 5, 0, 15) :
    runsPct  != null                    ? clamp(runsPct  * 15, 0, 15) :
    liftsPct != null                    ? clamp(liftsPct * 15, 0, 15) :
                                          0

  // ── Base depth (0–5 pts) ─────────────────────────────────────────
  const baseScore = clamp((baseDepth ?? 0) / 20, 0, 5)  // 100" base = 5 pts

  // ── Snow-in-forecast text hint (+2 pts) ─────────────────────────
  const snowHint = /snow|powder|flurr|wintry/i.test(forecastText || "") ? 2 : 0

  // ── Wind penalty (up to –15 pts) ────────────────────────────────
  const windPenalty = clamp((windMph ?? 0) * 0.75, 0, 15)

  // ── Drive penalty (up to –10 pts) ───────────────────────────────
  const driveAdj = clamp(drivePenalty ?? 0, 0, 10)

  // The weighted "how good are conditions" core. The hint and the two
  // penalties are minor modifiers applied AFTER any rescale — they are not
  // part of the 100-point weighting.
  const positive = freshSnow + incomingSnow + tempScore + baseScore
  const weighted = hasTerrainData
    ? positive + terrainScore
    : positive * (100 / POSITIVE_MAX_WITHOUT_TERRAIN)

  const raw = weighted + snowHint - windPenalty - driveAdj

  return Math.round(clamp(raw, 0, 100) * 10) / 10
}

// Absolute tiers — no relative normalization, no percentile curve.
export function powderTierForScore(score) {
  if (score >= 80) return "Elite"
  if (score >= 65) return "Very Good"
  if (score >= 50) return "Good"
  if (score >= 35) return "Okay"
  return "Poor"
}

// Assigns absolute tier labels — no relative normalization.
// Closed resorts show no score so they can't mislead users.
export function normalizePowderScores(rows) {
  return rows.map((r) => {
    if (r.isOpen === false) {
      return { ...r, powderScore: null, powderTier: "Closed" }
    }
    if (typeof r.rawPowderScore !== "number") {
      return { ...r, powderScore: null, powderTier: "Unknown" }
    }
    const powderScore = Math.round(r.rawPowderScore)
    return { ...r, powderScore, powderTier: powderTierForScore(powderScore) }
  })
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`

Expected: `tests 275`, `pass 275`, `fail 0` (265 baseline + 10 new). If a terrain test fails, check the `hasTerrainData` branch order; if a base test fails, check you wrote `/ 20` and not `/ 14`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/powderScore.js src/lib/powderScore.test.js
git commit -m "feat: extract Powder Score to src/lib with terrain exclude-and-rescale + 100in base bar"
```

- [ ] **Step 6: Add the calibration, tier and regression tests**

Append this to the **end** of `src/lib/powderScore.test.js`:

```js
// ── PRD 7.1 calibration examples, as permanent regression fixtures ──────────
//
// These four scenarios are the PRD's own statement of intent for the formula.
// PRD.md 7.1 lists them without concrete inputs, so the exact inputs live
// HERE and PRD.md quotes these numbers back. If you change a weight and one of
// these moves, that is the signal to update the PRD in the same commit.

const EPIC_POWDER_DAY = {
  tempF: 26, windMph: 5, forecastText: "Snow showers",
  snowPrev24in: 12, snowPrev48in: 18, snow24in: 6, snow48in: 4,
  baseDepth: 80,
  runsOpen: 70, runsTotal: 70, liftsOpen: 20, liftsTotal: 20,
  drivePenalty: 0,
}

const SOLID_MIDWINTER_DAY = {
  tempF: 28, windMph: 6, forecastText: "Partly cloudy",
  snowPrev24in: 3, snowPrev48in: 5, snow24in: 1, snow48in: 1,
  baseDepth: 50,
  runsOpen: 80, runsTotal: 100, liftsOpen: 8, liftsTotal: 10,
  drivePenalty: 0,
}

const WARM_BLUEBIRD_NO_SNOW = {
  tempF: 38, windMph: 8, forecastText: "Sunny",
  snowPrev24in: 0, snowPrev48in: 0, snow24in: 0, snow48in: 0,
  baseDepth: 40,
  runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
  drivePenalty: 0,
}

const LATE_SEASON_SLUSH = {
  tempF: 45, windMph: 4, forecastText: "Sunny and warm",
  snowPrev24in: 0, snowPrev48in: 0, snow24in: 0, snow48in: 0,
  baseDepth: 30,
  runsOpen: 60, runsTotal: 100, liftsOpen: 6, liftsTotal: 10,
  drivePenalty: 0,
}

test("calibration: an epic powder day is Elite", () => {
  // fresh min(60,32) + min(27,8) = 40 | incoming min(21,15) + 4 = 19 | temp 20
  // terrain 10 + 5 = 15 | base 80 / 20 = 4 | hint +2 | wind 5 x 0.75 = -3.75
  // = 96.25 -> 96.3   (was 97.3 when base was /14)
  assert.equal(computeRawPowderScore(EPIC_POWDER_DAY), 96.3)
  assert.equal(powderTierForScore(Math.round(96.3)), "Elite")
})

test("calibration: a solid mid-winter day is Good", () => {
  // fresh 15 + 7.5 = 22.5 | incoming 3.5 + 1 = 4.5 | temp 20
  // terrain 8 + 4 = 12 | base 50 / 20 = 2.5 | no hint | wind -4.5
  // = 57   (was 58.1 when base was /14)
  assert.equal(computeRawPowderScore(SOLID_MIDWINTER_DAY), 57)
  assert.equal(powderTierForScore(Math.round(57)), "Good")
})

test("calibration: a warm bluebird day with no snow is Poor", () => {
  // fresh 0 | incoming 0 | temp 38F -> 11 | terrain 15 | base 40 / 20 = 2
  // no hint | wind 8 x 0.75 = -6  => 22   (was 22.9 when base was /14)
  assert.equal(computeRawPowderScore(WARM_BLUEBIRD_NO_SNOW), 22)
  assert.equal(powderTierForScore(Math.round(22)), "Poor")
})

test("calibration: late-season slush is Poor", () => {
  // temp 45F -> 4 | terrain 6 + 3 = 9 | base 30 / 20 = 1.5 | wind -3
  // = 11.5   (was 12.1 when base was /14)
  assert.equal(computeRawPowderScore(LATE_SEASON_SLUSH), 11.5)
  assert.equal(powderTierForScore(Math.round(11.5)), "Poor")
})

// ── Unchanged behaviour this extraction must not regress ────────────────────

test("an empty input object scores without throwing or returning NaN", () => {
  // Everything missing: temp defaults to 25F -> 20, terrain absent,
  // 20 x (100 / 85) = 23.529... -> 23.5
  assert.equal(computeRawPowderScore({}), 23.5)
})

test("the wind penalty caps at 15", () => {
  // temp 20 | terrain 7.5 | wind 40 x 0.75 = 30, capped to 15 -> 12.5
  assert.equal(
    computeRawPowderScore({
      tempF: 25, windMph: 40, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10,
    }),
    12.5
  )
})

test("the drive penalty caps at 10", () => {
  // temp 20 | terrain 7.5 | drive 20 capped to 10 -> 17.5
  assert.equal(
    computeRawPowderScore({
      tempF: 25, drivePenalty: 20, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10,
    }),
    17.5
  )
})

test("wintry forecast text adds a flat 2 points", () => {
  // temp 20 | terrain 7.5 | hint +2 -> 29.5
  assert.equal(
    computeRawPowderScore({
      tempF: 25, forecastText: "Wintry mix", runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10,
    }),
    29.5
  )
})

test("fresh snow caps at 40 points", () => {
  // 20in x 5 = 100 capped 32, 20in x 1.5 = 30 capped 8 -> 40 | temp 20 | terrain 7.5
  assert.equal(
    computeRawPowderScore({
      tempF: 25, snowPrev24in: 20, snowPrev48in: 20,
      runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10,
    }),
    67.5
  )
})

test("incoming snow caps at 20 points", () => {
  // 20in x 3.5 = 70 capped 15, 20in x 1 = 20 capped 5 -> 20 | temp 20 | terrain 7.5
  assert.equal(
    computeRawPowderScore({
      tempF: 25, snow24in: 20, snow48in: 20,
      runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10,
    }),
    47.5
  )
})

test("the score never goes below 0", () => {
  // temp 60F -> 0 | terrain 0% open -> 0 | wind -15  => -15, clamped to 0
  assert.equal(
    computeRawPowderScore({
      tempF: 60, windMph: 40, runsOpen: 0, runsTotal: 100, liftsOpen: 0, liftsTotal: 10,
    }),
    0
  )
})

test("safePercent returns null for missing values and zero totals", () => {
  assert.equal(safePercent(null, 100), null)
  assert.equal(safePercent(50, null), null)
  assert.equal(safePercent(undefined, undefined), null)
  assert.equal(safePercent(0, 0), null)
  assert.equal(safePercent(0, 100), 0)
  assert.equal(safePercent(50, 100), 0.5)
})

test("clamp bounds both ends", () => {
  assert.equal(clamp(-5, 0, 15), 0)
  assert.equal(clamp(20, 0, 15), 15)
  assert.equal(clamp(7.5, 0, 15), 7.5)
})

// ── Tier thresholds (absolute, unchanged) ───────────────────────────────────

test("powderTierForScore maps every absolute threshold boundary", () => {
  assert.equal(powderTierForScore(0), "Poor")
  assert.equal(powderTierForScore(34), "Poor")
  assert.equal(powderTierForScore(35), "Okay")
  assert.equal(powderTierForScore(49), "Okay")
  assert.equal(powderTierForScore(50), "Good")
  assert.equal(powderTierForScore(64), "Good")
  assert.equal(powderTierForScore(65), "Very Good")
  assert.equal(powderTierForScore(79), "Very Good")
  assert.equal(powderTierForScore(80), "Elite")
  assert.equal(powderTierForScore(100), "Elite")
})

test("normalizePowderScores rounds the raw score before tiering", () => {
  const rows = normalizePowderScores([
    { name: "a", rawPowderScore: 34.4 },
    { name: "b", rawPowderScore: 34.5 },
    { name: "c", rawPowderScore: 79.4 },
    { name: "d", rawPowderScore: 79.5 },
  ])
  assert.deepEqual(rows.map((r) => [r.powderScore, r.powderTier]), [
    [34, "Poor"],
    [35, "Okay"],
    [79, "Very Good"],
    [80, "Elite"],
  ])
})

test("normalizePowderScores blanks the score for a closed resort", () => {
  const [row] = normalizePowderScores([{ name: "a", isOpen: false, rawPowderScore: 92 }])
  assert.equal(row.powderScore, null)
  assert.equal(row.powderTier, "Closed")
})

test("normalizePowderScores marks a row with no raw score Unknown", () => {
  const [row] = normalizePowderScores([{ name: "a", isOpen: true, rawPowderScore: null }])
  assert.equal(row.powderScore, null)
  assert.equal(row.powderTier, "Unknown")
})

test("normalizePowderScores preserves every other field on the row", () => {
  const [row] = normalizePowderScores([
    { name: "Vail", resortKey: "vail", pass: "Epic", isOpen: true, rawPowderScore: 71.4 },
  ])
  assert.equal(row.name, "Vail")
  assert.equal(row.resortKey, "vail")
  assert.equal(row.pass, "Epic")
  assert.equal(row.isOpen, true)
  assert.equal(row.rawPowderScore, 71.4)
  assert.equal(row.powderScore, 71)
  assert.equal(row.powderTier, "Very Good")
})
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npm test`

Expected: `tests 293`, `pass 293`, `fail 0` (265 baseline + 28 new).

If a **calibration** test fails, do **not** edit the expected number to match the code — recompute the breakdown in the comment by hand first, and only change the expectation if the comment's arithmetic disagrees with the assertion. If an **unchanged-behaviour** test fails (penalties, caps, tiers, empty input), the extraction changed something it must not have: fix `src/lib/powderScore.js` against `git show HEAD~1:src/App.jsx` lines 184-279, not the test.

- [ ] **Step 8: Lint the two new files**

Run: `npx eslint src/lib/powderScore.js src/lib/powderScore.test.js`

Expected: no output (0 problems).

- [ ] **Step 9: Commit**

```bash
git add src/lib/powderScore.test.js
git commit -m "test: PRD calibration fixtures, tier boundaries and penalty-cap regressions for Powder Score"
```

---

## Task 2: Wire `src/App.jsx` to the extracted module

**Files:**
- Modify: `src/App.jsx:184-279` (delete), `src/App.jsx:53` (add an import below it)

**Interfaces:**
- Consumes, from `src/lib/powderScore.js` (Task 1):
  - `computeRawPowderScore(input) => number` — same parameter object `App.jsx` already builds at `:754-768`.
  - `normalizePowderScores(rows) => rows` — same array-in/array-out contract used at `:801-806`.
- Produces: no new interface. The `live` state shape and every row field (`powderScore`, `powderTier`, `rawPowderScore`) are unchanged, so `ResortListRow.jsx`, `PowderMap.jsx`, `TodayScreen.jsx` and `MountainPage.jsx` keep working untouched.

- [ ] **Step 1: Confirm the call sites before changing anything**

Run: `grep -n "computeRawPowderScore\|normalizePowderScores\|clamp(\|safePercent(" src/App.jsx`

Expected: definitions at 184, 188, 194, 263 and calls at 754, 801, plus the `clamp`/`safePercent` uses at 211-258 (all inside `computeRawPowderScore`). If `clamp(` or `safePercent(` appears at a line **outside** 184-259, stop — a helper is shared with other code and must stay in `App.jsx` as well as being copied into the lib module. (It did not at `64f7935`.)

- [ ] **Step 2: Add the import**

In `src/App.jsx`, immediately after line 53 (`import { normalizeResortKey } from "./lib/resorts"`), add:

```js
import { computeRawPowderScore, normalizePowderScores } from "./lib/powderScore"
```

Note: **no `.js` extension** — that matches every other lib import in this file (Vite resolves it). The test file uses the extension because `node --test` does not.

- [ ] **Step 3: Delete the inline formula**

Delete lines 184 through 279 of `src/App.jsx` — the whole run from `function clamp(n, min, max) {` through the closing brace of `normalizePowderScores`, **including** `safePercent`, `computeRawPowderScore`, the "Assigns absolute tier labels" comment block above `normalizePowderScores`, and the blank lines between them. After the deletion, the `KRAMES_BUTTE_RESORT` block at line 182 is followed directly by:

```js
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8787"
```

Do **not** touch the call sites at (old) `:754` and `:801` — they call the imported functions with identical arguments.

- [ ] **Step 4: Confirm nothing dangling is left**

Run: `grep -n "function clamp\|function safePercent\|function computeRawPowderScore\|function normalizePowderScores" src/App.jsx`

Expected: **no output.**

Run: `grep -n "computeRawPowderScore\|normalizePowderScores" src/App.jsx`

Expected: exactly three lines — the new import, the `const rawPowderScore = computeRawPowderScore({` call, and the `const normalizedRows = normalizePowderScores(` call.

- [ ] **Step 5: Lint and build**

Run: `npx eslint src/App.jsx`

Expected: **exactly 1 problem** — `error Empty block statement no-empty`, at roughly line 771 (it was 846:84 before the deletion; the line number drops by about 75). Any "clamp is defined but never used" or "safePercent is defined but never used" means Step 3 was partial. Any "computeRawPowderScore is not defined" means Step 2 was skipped.

Run: `npm run build`

Expected: a successful `vite build`, exit code 0.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`

Expected: `tests 293`, `pass 293`, `fail 0` — unchanged from Task 1 (this task adds no tests; it proves the module the tests cover is now the one the app runs).

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "refactor: App.jsx imports the Powder Score formula from src/lib instead of defining it"
```

---

## Task 3: Mirror both changes into `server/powderScore.js`

**Files:**
- Modify: `server/powderScore.js` (header comment, `computePowderScore` signature defaults, terrain block, base divisor)
- Modify: `server/index.js:890-893` (stop coercing missing terrain counts to `0`)

**Interfaces:**
- Consumes: nothing from Tasks 1-2. `server/` is a separate npm package (`ski-dashboard-backend`) and **must not** import from `src/lib`. This is a hand-mirrored edit.
- Produces (unchanged public shape, used by `server/index.js:882` and thence by `server/cron.js`'s weekly briefing):
  - `computePowderScore(input: { isOpen?, snowPrev24in?, snowPrev48in?, snow24in?, snow48in?, tempF?, windMph?, runsOpen?, runsTotal?, liftsOpen?, liftsTotal?, baseDepth?, forecastText?, driveRisk? }) => { powderScore: number|null, powderTier: string }`
  - **Changed defaults:** `runsOpen`, `runsTotal`, `liftsOpen`, `liftsTotal` now default to `null` instead of `0`, so "absent" is distinguishable from "zero open".
  - `powderScore` is **not** rounded (unchanged — the server returns the raw clamped float; only the client rounds to one decimal).

- [ ] **Step 1: Rewrite `server/powderScore.js`**

Replace the whole file with exactly this. `TEMP_BANDS`, `temperatureScore()` and `tierForScore()` are byte-identical to what is there today — do not retype them from memory, and do not "improve" them:

```js
// Server-side Powder Score algorithm — mirrors PRD.md 7.1 and the client
// implementation in src/lib/powderScore.js.
//
// This is a HAND-MIRRORED copy, not an import: server/ is a separate npm
// package deployed to Render and cannot resolve src/lib. The two files must be
// changed together, and PRD.md 7.1 updated with them. The one deliberate
// difference from the client is temperature handling: here a null tempF scores
// 0 and the bands are exclusive, which predates this file and is out of scope.

const TEMP_BANDS = [
  { max: 0, points: 2 },
  { max: 12, points: 8 },
  { max: 20, points: 15 },
  { max: 30, points: 20 },
  { max: 35, points: 17 },
  { max: 40, points: 11 },
  { max: 48, points: 4 },
]

function temperatureScore(tempF) {
  if (tempF == null) return 0
  for (const band of TEMP_BANDS) {
    if (tempF < band.max) return band.points
  }
  return 0 // >= 48
}

function tierForScore(score) {
  if (score >= 80) return "Elite"
  if (score >= 65) return "Very Good"
  if (score >= 50) return "Good"
  if (score >= 35) return "Okay"
  return "Poor"
}

// null means "we don't have this data", which is different from 0% open.
function terrainPercent(open, total) {
  if (open == null || total == null || total <= 0) return null
  return open / total
}

// Weighted components excluding terrain: fresh 40 + incoming 20 + temp 20 +
// base 5. Terrain is the other 15.
const POSITIVE_MAX_WITHOUT_TERRAIN = 85

export function computePowderScore({
  isOpen = true,
  snowPrev24in = 0, snowPrev48in = 0, snow24in = 0, snow48in = 0,
  tempF, windMph = 0,
  runsOpen = null, runsTotal = null, liftsOpen = null, liftsTotal = null,
  baseDepth = 0, forecastText = "", driveRisk = "Low",
}) {
  if (!isOpen) return { powderScore: null, powderTier: "Closed" }

  const freshSnow = Math.min(snowPrev24in * 5.0, 32) + Math.min(snowPrev48in * 1.5, 8)
  const incomingSnow = Math.min(snow24in * 3.5, 15) + Math.min(snow48in * 1.0, 5)
  const tempScore = temperatureScore(tempF)

  // Terrain: both pairs -> runs 10 + lifts 5. One pair -> that pair alone
  // scaled to the full 15. Neither -> terrain leaves the formula and the
  // remaining components are rescaled below, so a resort with great snow but
  // an unparseable mountain report is no longer capped at 85/100.
  const runsPct = terrainPercent(runsOpen, runsTotal)
  const liftsPct = terrainPercent(liftsOpen, liftsTotal)
  const hasTerrainData = runsPct != null || liftsPct != null
  const terrainScore =
    runsPct != null && liftsPct != null ? runsPct * 10 + liftsPct * 5 :
    runsPct != null                     ? runsPct * 15 :
    liftsPct != null                    ? liftsPct * 15 :
                                          0

  const baseScore = Math.min(baseDepth / 20, 5)
  const snowHint = /snow|powder|flurr|wintry/i.test(forecastText || "") ? 2 : 0
  const windPenalty = Math.min(windMph * 0.75, 15)
  const drivePenalty = driveRisk === "Moderate" ? 5 : driveRisk === "High" || driveRisk === "Severe" ? 10 : 0

  // Hint and penalties are applied AFTER any rescale — they are modifiers, not
  // part of the 100-point weighting.
  const positive = freshSnow + incomingSnow + tempScore + baseScore
  const weighted = hasTerrainData
    ? positive + terrainScore
    : positive * (100 / POSITIVE_MAX_WITHOUT_TERRAIN)

  const raw = weighted + snowHint - windPenalty - drivePenalty
  const powderScore = Math.max(0, Math.min(100, raw))

  return { powderScore, powderTier: tierForScore(powderScore) }
}
```

- [ ] **Step 2: Stop the caller from coercing missing terrain to zero**

In `server/index.js`, inside `getAllResortConditions()`, the `computePowderScore({ ... })` argument object currently reads:

```js
            runsOpen: conditions.runsOpen ?? 0,
            runsTotal: conditions.runsTotal ?? 0,
            liftsOpen: conditions.liftsOpen ?? 0,
            liftsTotal: conditions.liftsTotal ?? 0,
```

Change those four lines to:

```js
            runsOpen: conditions.runsOpen ?? null,
            runsTotal: conditions.runsTotal ?? null,
            liftsOpen: conditions.liftsOpen ?? null,
            liftsTotal: conditions.liftsTotal ?? null,
```

Leave every other line of that object alone — in particular `baseDepth: conditions.baseDepth ?? 0` stays, because base depth keeps its "missing means 0 contribution" rule (spec: only terrain is excluded-and-rescaled).

Without this change, `?? 0` turns every missing count into a real zero: `terrainPercent(0, 0)` would still return `null` for the both-missing case, but a half-parsed scrape (`runsTotal` present, `runsOpen` missing) would score a genuine `0%` open. That is the exact asymmetry this task exists to remove.

- [ ] **Step 3: Verify the new server formula against hand-computed values**

Run this from the **repo root** (it imports the module directly; nothing is written and no server starts):

```bash
node -e '
import("./server/powderScore.js").then(({ computePowderScore }) => {
  const base = { isOpen: true, snowPrev24in: 0, snowPrev48in: 0, snow24in: 0, snow48in: 0, windMph: 0, baseDepth: 0, forecastText: "", driveRisk: "Low" }
  const p = (label, out) => console.log(label.padEnd(26), JSON.stringify(out))
  p("both pairs 50/50", computePowderScore({ ...base, tempF: 25, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10 }))
  p("lifts only 80%", computePowderScore({ ...base, tempF: 25, liftsOpen: 8, liftsTotal: 10 }))
  p("runs only 50%", computePowderScore({ ...base, tempF: 25, runsOpen: 50, runsTotal: 100 }))
  p("no terrain (Kyle case)", computePowderScore({ ...base, tempF: 22, windMph: 3, baseDepth: 70, forecastText: "Sunny" }))
  p("perfect, no terrain", computePowderScore({ ...base, tempF: 25, snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6, baseDepth: 100, forecastText: "Clear" }))
  p("base 70in", computePowderScore({ ...base, tempF: 25, baseDepth: 70, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10 }))
  p("base 100in", computePowderScore({ ...base, tempF: 25, baseDepth: 100, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10 }))
  p("closed resort", computePowderScore({ ...base, isOpen: false, tempF: 25 }))
})
'
```

Expected output, exactly:

```
both pairs 50/50           {"powderScore":27.5,"powderTier":"Poor"}
lifts only 80%             {"powderScore":32,"powderTier":"Poor"}
runs only 50%              {"powderScore":27.5,"powderTier":"Poor"}
no terrain (Kyle case)     {"powderScore":25.397058823529413,"powderTier":"Poor"}
perfect, no terrain        {"powderScore":100,"powderTier":"Elite"}
base 70in                  {"powderScore":31,"powderTier":"Poor"}
base 100in                 {"powderScore":32.5,"powderTier":"Poor"}
closed resort              {"powderScore":null,"powderTier":"Closed"}
```

These are the same scenarios as the client tests in Task 1, and the numbers agree with the client's to the client's one-decimal rounding — which is the whole point of mirroring. If the Kyle case prints `30.25`, the base divisor is still `/14`; if `perfect, no terrain` prints `92.5` or `85`, the `hasTerrainData` branch is wrong.

- [ ] **Step 4: Confirm the server still imports cleanly**

Run: `node -e 'import("./server/index.js").then(m => { console.log("ok:", Object.keys(m).join(",")); process.exit(0) })'`

Expected: `ok: getAllResortConditions,getDriveRisk,getNwsForecast,getNwsNowish,getNwsPoint,getNwsSnow,getResortConditions` and a clean exit.

- [ ] **Step 5: Confirm the client suite is untouched**

Run: `npm test`

Expected: `tests 293`, `pass 293`, `fail 0`. (Server files are not covered by `npm test`; this is a guard that nothing in `src/` was edited by accident.)

- [ ] **Step 6: Commit**

```bash
git add server/powderScore.js server/index.js
git commit -m "feat(server): mirror terrain exclude-and-rescale + 100in base bar into the digest formula"
```

---

## Task 4: Last-known-good terrain cache in `server/index.js`

**Files:**
- Modify: `server/index.js` — insert a new block immediately **after** `fetchHtmlConditions()` (ends at `:702`) and immediately **before** `export async function getResortConditions(` (`:704`), then edit that function's return object.

**Interfaces:**
- Consumes: nothing from Tasks 1-3.
- Produces:
  - `terrainWithLastKnownGood(resortKey: string, conditions: object|null, now?: number) => { liftsOpen: number|null, liftsTotal: number|null, runsOpen: number|null, runsTotal: number|null }` — **exported** solely so the manual verification in Step 3 can drive it deterministically with an injected `now`. It is not imported by any other module, and no automated test suite is added for it (spec: verified by code review plus a manual check).
  - `getResortConditions(resortParam)`'s response shape is unchanged — same keys, same types. Only the *provenance* of the four terrain values changes.

- [ ] **Step 1: Add the cache and its helper**

Insert this into `server/index.js`, between the end of `fetchHtmlConditions()` and the `export async function getResortConditions(` line:

```js
// ── Last-known-good terrain data (in-memory, per field, 24h) ─────────────────
//
// The 7 Ikon resorts plus Telluride are HTML-scraped (parseConditionsHtml
// above), and those pages break periodically — a scrape can return lifts but
// not runs, or nothing at all. Missing terrain data no longer poisons the
// Powder Score (powderScore.js drops the component and rescales), but a count
// from a few hours ago is still better information than no count.
//
// PER FIELD, NOT ALL-OR-NOTHING: each of the four values is cached with its own
// timestamp. A fresh value always wins and refreshes that field's timestamp; a
// missing value falls back to that field's own cached value only if it is under
// 24h old. A fresh value is never overwritten by a stale one, and a scrape that
// parses lifts but not runs keeps the fresh lifts and backfills only runs.
// Anything still null after this falls through to the formula's
// exclude-and-rescale as the final fallback.
//
// ACCEPTED LIMITATION, stated so it is not mistaken for an oversight: this is
// in-memory only and resets on every Render restart/deploy. Persistent
// (Supabase-backed) caching, new data sources, retries and scraper monitoring
// are TASK 22.3 (Sprint 45), deliberately not this task.
const TERRAIN_FIELDS = ["liftsOpen", "liftsTotal", "runsOpen", "runsTotal"]
const TERRAIN_CACHE_TTL = 24 * 60 * 60 * 1000
const terrainCache = new Map() // resortKey -> { [field]: { value, capturedAt } }

export function terrainWithLastKnownGood(resortKey, conditions, now = Date.now()) {
  const entry = terrainCache.get(resortKey) || {}
  const resolved = {}

  for (const field of TERRAIN_FIELDS) {
    const fresh = conditions?.[field] ?? null

    if (fresh != null) {
      entry[field] = { value: fresh, capturedAt: now }
      resolved[field] = fresh
      continue
    }

    const cachedField = entry[field]
    resolved[field] =
      cachedField && now - cachedField.capturedAt < TERRAIN_CACHE_TTL
        ? cachedField.value
        : null
  }

  terrainCache.set(resortKey, entry)
  return resolved
}
```

- [ ] **Step 2: Apply it inside `getResortConditions()`**

In `server/index.js`, `getResortConditions()` currently ends with this return:

```js
  return {
    resort: resortKey,
    fetchedAt: new Date().toISOString(),
    isOpen:      conditions?.isOpen      ?? null,
    liftsOpen:   conditions?.liftsOpen   ?? null,
    liftsTotal:  conditions?.liftsTotal  ?? null,
    runsOpen:    conditions?.runsOpen    ?? null,
    runsTotal:   conditions?.runsTotal   ?? null,
    baseDepth:   conditions?.baseDepth   ?? null,
    summitDepth: conditions?.summitDepth ?? null,
    snowLast24in: conditions?.snowLast24in ?? null,
    source:      conditions?.source      ?? null,
  }
}
```

Replace it with:

```js
  const terrain = terrainWithLastKnownGood(resortKey, conditions)

  return {
    resort: resortKey,
    fetchedAt: new Date().toISOString(),
    isOpen:      conditions?.isOpen      ?? null,
    liftsOpen:   terrain.liftsOpen,
    liftsTotal:  terrain.liftsTotal,
    runsOpen:    terrain.runsOpen,
    runsTotal:   terrain.runsTotal,
    baseDepth:   conditions?.baseDepth   ?? null,
    summitDepth: conditions?.summitDepth ?? null,
    snowLast24in: conditions?.snowLast24in ?? null,
    source:      conditions?.source      ?? null,
  }
}
```

Only the four terrain lines change. `isOpen`, `baseDepth`, `summitDepth`, `snowLast24in` and `source` are **not** cached — the spec scopes the fallback to lift and run counts only.

Note the placement: this is inside `getResortConditions()`, the single aggregation point called both by the `/api/resort-conditions` route (`:738`) and by `getAllResortConditions()` (`:874`), so the cron digest and the app get the same values from one code path.

- [ ] **Step 3: Verify the per-field behaviour manually**

Run this from the **repo root**. It injects `now`, so it proves all four branches in under a second without waiting 24 hours or hitting a resort website:

```bash
node -e '
import("./server/index.js").then(({ terrainWithLastKnownGood }) => {
  const H = 3600 * 1000
  const t0 = 1000000000
  const p = (label, out) => console.log(label.padEnd(34), JSON.stringify(out))
  p("1 full scrape", terrainWithLastKnownGood("steamboat", { liftsOpen: 8, liftsTotal: 10, runsOpen: 50, runsTotal: 100 }, t0))
  p("2 lifts fresh, runs failed +1h", terrainWithLastKnownGood("steamboat", { liftsOpen: 9, liftsTotal: 10, runsOpen: null, runsTotal: null }, t0 + 1 * H))
  p("3 whole scrape failed +2h", terrainWithLastKnownGood("steamboat", null, t0 + 2 * H))
  p("4 runs stale, lifts ok +24.5h", terrainWithLastKnownGood("steamboat", null, t0 + 24.5 * H))
  p("5 everything stale +30h", terrainWithLastKnownGood("steamboat", null, t0 + 30 * H))
  p("6 resort never scraped", terrainWithLastKnownGood("eldora", null, t0))
  process.exit(0)
})
'
```

Expected output, exactly:

```
1 full scrape                      {"liftsOpen":8,"liftsTotal":10,"runsOpen":50,"runsTotal":100}
2 lifts fresh, runs failed +1h     {"liftsOpen":9,"liftsTotal":10,"runsOpen":50,"runsTotal":100}
3 whole scrape failed +2h          {"liftsOpen":9,"liftsTotal":10,"runsOpen":50,"runsTotal":100}
4 runs stale, lifts ok +24.5h      {"liftsOpen":9,"liftsTotal":10,"runsOpen":null,"runsTotal":null}
5 everything stale +30h            {"liftsOpen":null,"liftsTotal":null,"runsOpen":null,"runsTotal":null}
6 resort never scraped             {"liftsOpen":null,"liftsTotal":null,"runsOpen":null,"runsTotal":null}
```

Read lines 2 and 4 carefully — they are the whole point of "per field". Line 2 proves the fresh `liftsOpen: 9` was **not** replaced by the cached `8`, while `runsOpen` was backfilled from cache. Line 4 proves the runs pair (captured at `t0`, now 24.5h old) expired independently of the lifts pair (captured at `t0 + 1h`, still 23.5h old). If line 2 shows `liftsOpen: 8`, the code is overwriting fresh data with stale; if line 4 shows all nulls or all values, the timestamps are being shared instead of stored per field.

- [ ] **Step 4: Confirm the client suite and lint are unaffected**

Run: `npm test`

Expected: `tests 293`, `pass 293`, `fail 0`.

Run: `npx eslint server/index.js`

Expected: the same problem count as before this task (this file is part of the repo-wide 85-problem baseline; the new block must not add to it — in particular there must be no "terrainWithLastKnownGood is defined but never used", since it is both exported and called).

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat(server): 24h in-memory per-field last-known-good cache for scraped lift/run counts"
```

---

## Task 5: Update `PRD.md` section 7.1 to match the shipped formula

**Files:**
- Modify: `PRD.md:170-185` (formula block), a new subsection after it, `PRD.md:211-216` (calibration examples), `PRD.md:220` (F-REQ-002)

**Interfaces:**
- Consumes: the verified numbers produced by Task 1 Step 7 and Task 3 Step 3. Do not write a number into the PRD that you have not seen a test or the node one-liner print.
- Produces: no code interface. This is the document `server/powderScore.js`'s header comment points at, so a future session reading the PRD as ground truth must not be able to reintroduce the `/14` divisor or the "missing terrain equals 0" rule.

- [ ] **Step 1: Update the formula block**

In `PRD.md`, replace the header line `**Formula (v2 — absolute 0–100 scale):**` with:

```markdown
**Formula (v3 — absolute 0–100 scale):**

*Implemented in `src/lib/powderScore.js` (client) and hand-mirrored in `server/powderScore.js` (Render backend — a separate npm package that cannot import from `src/lib`). Both files and this section must be changed together. v3 (2026-09-09, TASK 22.2): base depth is now `/20`, and terrain is excluded-and-rescaled rather than defaulted when its data is missing.*
```

Inside the fenced formula block, replace the `terrainScore` line with these two lines:

```
terrainScore  = (runsOpen/runsTotal × 10) + (liftsOpen/liftsTotal × 5)        → max 15 pts
                see "Missing terrain data" below when either pair is absent
```

and replace the `baseScore` line with:

```
baseScore     = baseDepth / 20, max 5   (100" base earns full credit)          → max  5 pts
```

Leave `freshSnow`, `incomingSnow`, `tempScore`, `snowHint`, `windPenalty`, `drivePenalty`, the `rawScore` sum and the `powderScore = clamp(rawScore, 0, 100)` line exactly as they are.

- [ ] **Step 2: Add the "Missing terrain data" subsection**

Immediately **after** the closing fence of the formula block and **before** the `**Temperature bands (calibrated to real skiing feel):**` line, insert:

```markdown
**Missing terrain data (exclude and rescale):**

Terrain is the one component the app can fail to *fetch* rather than observe — the 7 Ikon resorts plus Telluride are HTML-scraped and those pages break periodically. Scoring an unknown as 0 would structurally cap an otherwise elite resort at 85/100; assuming it is half-open would hand a thin, icy day 7.5 free points. So:

- **Both pairs present** (`runsOpen`/`runsTotal` and `liftsOpen`/`liftsTotal`, each with a non-zero total): score terrain normally, 0–15, as above.
- **Only one pair present:** use that pair alone, scaled to the full 15 points — lifts-only is `liftsPct × 15`, runs-only is `runsPct × 15`.
- **Neither pair present:** drop terrain from the formula and rescale the remaining four weighted components (fresh 40 + incoming 20 + temp 20 + base 5 = 85) to fill 0–100:
  `rescaledPositive = (freshSnow + incomingSnow + tempScore + baseScore) × (100 / 85)`.
  `snowHint`, `windPenalty` and `drivePenalty` are applied **after** this rescale, unchanged — they are modifiers, not part of the 100-point weighting.

A count is treated as present only when both halves of the pair are non-null and the total is greater than 0; a zero total means "we parsed nothing", not "nothing is open". The server additionally keeps a 24-hour in-memory last-known-good value per field (`server/index.js`), so this path is reached only when a resort has had no successful parse of that field for a full day.
```

- [ ] **Step 3: Replace the calibration examples with the tested fixtures**

Replace the whole `**Calibration examples:**` list (the five bullets from "Epic powder day" through "Closed resort") with:

```markdown
**Calibration examples** — the exact inputs and expected scores below are locked in as regression fixtures in `src/lib/powderScore.test.js`; change one and the other must change with it:

- **Epic powder day** — 12" last 24h / 18" last 48h, 6" + 4" incoming, 26°F, 5 mph, 80" base, 100% terrain, "Snow showers" → **96.3, Elite**
- **Solid mid-winter day** — 3" last 24h / 5" last 48h, 1" + 1" incoming, 28°F, 6 mph, 50" base, 80% terrain, no snow in the forecast text → **57.0, Good**
- **Warm bluebird, no snow** — 38°F, 8 mph, 40" base, 100% terrain, "Sunny" → **22.0, Poor**
- **Late-season end-of-day slush** — 45°F, 4 mph, 30" base, 60% terrain, "Sunny and warm" → **11.5, Poor**
- **Cold, snowless, no terrain data** — 22°F, 3 mph, 70" base, lift and run counts unavailable → **25.4, Poor** (under the pre-v3 formula this scored 30.3, because the missing terrain was scored as though half the mountain was open)
- **Closed resort** — no score displayed

The v3 base-depth change moved every example down slightly and crossed no tier boundary: epic 97.3 → 96.3, mid-winter 58.1 → 57.0, warm bluebird 22.9 → 22.0, late-season slush 12.1 → 11.5.
```

- [ ] **Step 4: Correct F-REQ-002**

Replace this line:

```markdown
- F-REQ-002: Missing data for any individual component must default to 0 contribution (not break the score)
```

with these two:

```markdown
- F-REQ-002: Missing data for an individual component must never break the score. Fresh snow, incoming snow, temperature and base depth default to 0/neutral contribution when absent — they are weather facts, and no evidence of snow reasonably means no snow.
- F-REQ-002a: **Terrain is the exception.** Missing lift/run counts are an operational fact the app failed to fetch, not an observation, and must be *excluded and rescaled* (see "Missing terrain data" above) — never scored as 0 contribution, and never assumed to be partially open.
```

Leave F-REQ-001, F-REQ-003, F-REQ-004, F-REQ-004a and everything from `#### Resort Cards` onward untouched.

- [ ] **Step 5: Check the PRD against the code one last time**

Run: `grep -n "baseDepth / 14\|v2 — absolute" PRD.md`

Expected: **no output.**

Run: `grep -rn "/ 14" src/ server/ --include=*.js --include=*.jsx`

Expected: no hit in `src/lib/powderScore.js`, `src/App.jsx` or `server/powderScore.js` — no `/14` base divisor survives anywhere in the codebase.

- [ ] **Step 6: Commit**

```bash
git add PRD.md
git commit -m "docs: PRD 7.1 formula v3 — /20 base depth, terrain exclude-and-rescale, recomputed calibration"
```

---

## Task 6: Whole-branch verification

**Files:** none modified unless a check fails.

**Interfaces:** none. This task exists so a fresh reviewer can see one place where every claim of completeness is backed by a command and its output.

- [ ] **Step 1: Full test suite**

Run: `npm test 2>&1 | tail -8`

Expected: `tests 293`, `suites 0`, `pass 293`, `fail 0`, `cancelled 0`, `skipped 0`, `todo 0`. The baseline before this branch was 265/265.

- [ ] **Step 2: Lint, repo-wide and scoped**

Run: `npx eslint . 2>&1 | tail -3`

Expected: `85 problems (78 errors, 7 warnings)` — the recorded baseline. It must not be higher. If a number below 85 appears, confirm you did not delete unrelated code.

Run: `npx eslint src/lib/powderScore.js src/lib/powderScore.test.js src/App.jsx server/powderScore.js server/index.js`

Expected: one `Empty block statement no-empty` in `src/App.jsx` (pre-existing, around line 771 after the Task 2 deletion), plus whatever `server/index.js` already contributed to the 85-problem baseline. No unused-variable errors, no undefined-variable errors, nothing new in `server/powderScore.js` or either new lib file.

- [ ] **Step 3: Production build**

Run: `npm run build`

Expected: a successful `vite build`, exit code 0, no "could not resolve ./lib/powderScore" warning.

- [ ] **Step 4: Server module health**

Run: `node -e 'import("./server/index.js").then(m => { console.log("ok:", Object.keys(m).sort().join(",")); process.exit(0) })'`

Expected: `ok: getAllResortConditions,getDriveRisk,getNwsForecast,getNwsNowish,getNwsPoint,getNwsSnow,getResortConditions,terrainWithLastKnownGood`

- [ ] **Step 5: Client/server agreement spot check**

Run:

```bash
node -e '
Promise.all([import("./src/lib/powderScore.js"), import("./server/powderScore.js")]).then(([c, s]) => {
  const cases = [
    ["both pairs 50/50", { tempF: 25, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10 }],
    ["lifts only 80pct", { tempF: 25, liftsOpen: 8, liftsTotal: 10 }],
    ["no terrain, cold", { tempF: 22, windMph: 3, baseDepth: 70 }],
    ["base 70in", { tempF: 25, baseDepth: 70, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10 }],
    ["base 100in", { tempF: 25, baseDepth: 100, runsOpen: 50, runsTotal: 100, liftsOpen: 5, liftsTotal: 10 }],
  ]
  for (const [label, input] of cases) {
    const client = c.computeRawPowderScore(input)
    const server = Math.round(s.computePowderScore({ isOpen: true, ...input }).powderScore * 10) / 10
    console.log(label.padEnd(20), "client", String(client).padStart(6), "server", String(server).padStart(6), client === server ? "MATCH" : "*** DRIFT ***")
  }
})
'
```

Expected: all five rows print `MATCH`, with the values `27.5`, `32`, `25.4`, `31`, `32.5`. Any `DRIFT` means the hand-mirror in Task 3 diverged from Task 1. This is a one-off check, not a committed test: `npm test` only globs `src/lib/*.test.js`, and importing the server module from a client test would couple the two packages, which the spec forbids.

- [ ] **Step 6: Re-read the spec's Non-goals against the diff**

Run: `git diff 64f7935 --stat`

Expected: only these files — `PRD.md`, `server/index.js`, `server/powderScore.js`, `src/App.jsx`, `src/lib/powderScore.js`, `src/lib/powderScore.test.js`, plus this plan document. If `migrations/`, `supabase/`, `package.json`, or any component file appears, something out of scope was changed — revert it.

Run: `git diff 64f7935 -- server/powderScore.js`

Expected: **no changed line inside** `TEMP_BANDS`, `temperatureScore()` or `tierForScore()` — those three are required to stay untouched. The only diffs in that file are the header comment, the new `terrainPercent`/`POSITIVE_MAX_WITHOUT_TERRAIN`, the four `null` defaults, the terrain block, the base divisor, and the `positive`/`weighted`/`raw` lines.

Then confirm by inspection that none of the following changed anywhere in the diff: wind penalty math, drive penalty math, incoming-snow weights, the `+2` snow hint, the tier thresholds, the temperature bands — and that no Supabase or persistent storage, retry logic, new data source, or scraper monitoring was added.

- [ ] **Step 7: Hand the manual check to Kyle**

Report these for the click-through, in this wording:

- `npm test` gives 293 pass / 0 fail (was 265 / 0).
- A cold, snowless, no-terrain-data day now scores **25.4 (Poor)** instead of **30.3** — the mechanism behind the "80s on an icy day" complaint (a phantom 7.5-point half-open terrain credit plus a base depth that maxed at 70") is gone from both the app and the email digest.
- A resort with elite snow but an unparseable mountain report can now reach **100** instead of being capped at **92.5** (client) / **85** (server).
- Base depth needs **100"** for full credit, not 70".
- The server remembers each lift/run count for **24 hours** and backfills per field — **in memory only**, so it resets on every Render deploy. That is deliberate; persistent caching is TASK 22.3.
- Worth eyeballing on the live Today screen once deployed: no resort should show a score above roughly 30 on a dry, cold day whose lifts/runs fields show dashes.

- [ ] **Step 8: Commit anything the verification fixed**

If Steps 1-6 required no changes, there is nothing to commit and this task ends here. If a check forced a fix:

```bash
git add -A
git commit -m "fix: whole-branch verification findings for Powder Score tuning"
```

---

## Self-Review (performed while writing this plan)

**1. Spec coverage — every section of `2026-09-09-powder-score-algorithm-tuning-design.md` mapped to a task:**

| Spec section | Task |
|---|---|
| 1. Terrain exclude-and-rescale, both pairs available | Task 1 Step 3 (client), Task 3 Step 1 (server); tested by Task 1 Step 1, test 1 |
| 1. Only one pair available, scaled to 15 | Task 1 Step 3, Task 3 Step 1; tested by Task 1 Step 1, tests 2, 3 and 8 |
| 1. Neither pair available, `x (100/85)` | Task 1 Step 3, Task 3 Step 1; tested by Task 1 Step 1, tests 4, 5 and 7 |
| 1. Hint and penalties applied after the rescale | Task 1 Step 3 (`raw = weighted + snowHint - windPenalty - driveAdj`), Task 3 Step 1; tested by Task 1 Step 6 (wind/drive/hint tests) |
| 2. Base depth `/14` becomes `/20` | Task 1 Step 3, Task 3 Step 1; tested by Task 1 Step 1, tests 9 and 10; documented by Task 5 Step 1 |
| 3. Extract to `src/lib/powderScore.js`, App.jsx imports it | Tasks 1 and 2 |
| 4. Mirror to `server/powderScore.js`, keep its helpers, no code sharing | Task 3 (Global Constraints forbid the import; Task 6 Step 6 asserts the helpers are untouched) |
| 5. PRD base-depth line, terrain description, F-REQ-002, recomputed calibration | Task 5 Steps 1-4; the recomputation itself is done and recorded in Verified-facts row 12 |
| 6. Per-field last-known-good `Map`, 24h, inside `getResortConditions()`, in-memory only | Task 4 |
| Testing 1 — the four PRD calibration examples as fixtures | Task 1 Step 6 |
| Testing 2 — Kyle's case scores at most 50 | Task 1 Step 1, test 6 (asserts both the exact 25.4 and `<= 50`) |
| Testing 3 — three terrain branches with hand-computed values, including reaching 100 | Task 1 Step 1, tests 1-5 |
| Testing 4 — 70" no longer maxes the base, 100" does | Task 1 Step 1, tests 9 and 10 |
| Testing 5 — tier boundaries 34/35, 49/50, 64/65, 79/80 | Task 1 Step 6, the `powderTierForScore` and `normalizePowderScores` tests |
| Testing — no new suite for the cache | Honoured: Task 4 ships a manual command with exact expected output and adds no test file (see Global Constraints) |
| Scope boundary and Non-goals | Global Constraints, enforced by Task 6 Step 6 |

No gaps found.

**2. Placeholder scan:** no "TBD", no "similar to Task N", no "handle edge cases", no prose-only code step. Every code change in every task is given as literal text to write, including both new files and all four PRD edits. Task 3 repeats `TEMP_BANDS`, `temperatureScore()` and `tierForScore()` in full rather than saying "keep the existing helpers", because the implementer replaces the whole file and a fresh reader may open Task 3 first.

**3. Type and signature consistency across tasks:**

- `computeRawPowderScore` — same 13-key input object in Task 1 (definition), Task 1's tests, Task 2's surviving call site and Task 6 Step 5; returns a number in all of them.
- `normalizePowderScores` — array in, array out, `{ ...row, powderScore, powderTier }`, identical in Task 1 and Task 2, and matching what `ResortListRow.jsx`/`PowderMap.jsx`/`TodayScreen.jsx`/`MountainPage.jsx` already read.
- `powderTierForScore` — introduced in Task 1, used by `normalizePowderScores` and by Task 1's calibration tests; no other task references it.
- `computePowderScore` (server) — Task 3 changes only the four terrain defaults from `0` to `null`; the single caller (`server/index.js:882`, edited in Task 3 Step 2) passes `?? null` for exactly those four keys and keeps `?? 0` for `baseDepth`. No other caller exists (Verified-facts row 6).
- `terrainWithLastKnownGood(resortKey, conditions, now)` — one name and one signature, used identically in Task 4 Steps 1, 2 and 3 and asserted in Task 6 Step 4.
- `POSITIVE_MAX_WITHOUT_TERRAIN = 85` — same constant name in both implementations; exported from the client module (it is part of a tested lib surface) and module-local on the server (nothing there imports it), which is why the server version has no `export`.
- Test counts are consistent throughout: 265 baseline, 275 after Task 1 Step 4 (10 new tests), 293 after Task 1 Step 7 (18 more), and 293 in Tasks 2, 3, 4 and 6.
