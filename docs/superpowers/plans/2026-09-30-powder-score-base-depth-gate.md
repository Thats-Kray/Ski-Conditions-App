# Powder Score Base-Depth Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 0" base depth gates the Powder Score to 0 with a new "Not Skiable" tier, and a thin-but-nonzero base (<12") caps the score at 20 — in both the client and server formulas — without punishing resorts where base-depth data is simply missing.

**Architecture:** Add a gate as the final step of each formula's existing score computation (client `computeRawPowderScore` in `src/lib/powderScore.js`, server `computePowderScore` in `server/powderScore.js`), plus the matching tier override at each formula's tier-assignment point (`normalizePowderScores` client-side, inline in `computePowderScore` server-side). Fix one real pre-existing bug the gate depends on: `server/index.js` currently collapses a genuinely-missing base depth to `0` before the server formula ever sees it, which would make "missing" indistinguishable from "confirmed zero" under the new gate.

**Tech Stack:** Plain JS (ESM), `node --test` / `node:assert/strict` for both client (`src/lib`) and new server tests. No new dependencies.

## Global Constraints

- `baseDepth === 0` is an exact equality check — a real, known reading of zero, never an epsilon/threshold comparison.
- The `0 < baseDepth < 12` band is a **hard ceiling** (`min(score, 20)`), not a smooth ramp — a 1" base and an 11" base score identically.
- `baseDepth == null` (missing data) is **exempt from the gate entirely** — it must score exactly as it does today. Never conflate "we don't know" with "we know it's zero."
- The gate only produces the new `"Not Skiable"` tier for the exact-zero case. The `<12"` cap case stays in the existing `"Poor"` tier (20 is always below the 35 Okay threshold) — no new tier logic needed there.
- `"Not Skiable"` reuses the existing `var(--rating-slate)` / `var(--rating-slate-border)` tokens already used for `"Closed"` — no new CSS custom properties.
- Client and server must implement the identical gate logic — this is a hand-mirrored pair, per the existing header comments in both `powderScore.js` files.
- Out of scope, do not touch: `TripDetailModal.jsx`'s independent tier-labeling logic, and the pre-existing `"Unknown"` tier styling gap in `Badge.jsx`.

---

### Task 1: Client base-depth gate

**Files:**
- Modify: `src/lib/powderScore.js:94-102` (end of `computeRawPowderScore`), `:115-126` (`normalizePowderScores`)
- Test: `src/lib/powderScore.test.js` (append new tests)

**Interfaces:**
- Consumes: nothing new — `computeRawPowderScore`'s existing parameter object already includes `baseDepth`; `normalizePowderScores`'s existing row objects already carry `baseDepth` (confirmed via `src/App.jsx`, unchanged by this plan).
- Produces: `computeRawPowderScore(...)` now returns `0` whenever `baseDepth === 0`, and caps its return at `20` whenever `0 < baseDepth < 12`. `normalizePowderScores(rows)` now returns `powderTier: "Not Skiable"` for any row where `r.baseDepth === 0`. Task 2 (server) and Task 3 (Badge colors) both depend on the exact string `"Not Skiable"` established here.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/powderScore.test.js`, after the existing `"── Base depth: 100 inches for full credit, not 70 ──"` section (after the test `"a 100-inch base maxes the base component and deeper adds nothing"`, before the `"── PRD 7.1 calibration examples"` section):

```js
// ── Base-depth gate: 0" is not skiable ──────────────────────────────────────
//
// Base depth used to be a pure positive bonus (max 5 of 100 points) with no
// floor effect. A 0" base means there's no snow on the ground to ski on,
// regardless of how good the forecast/temp/terrain look — so it now gates
// the whole score instead of just nudging it. A thin-but-nonzero base is
// still mostly-not-skiable, so it gets a low hard ceiling rather than a 0.
// Missing data (baseDepth null/undefined) is explicitly exempt — the app
// not knowing the base depth must never be scored the same as a confirmed
// zero. Same "known bad" vs "unknown" distinction TASK 22.2 already applied
// to terrain.

test("a zero base depth forces the score to 0, regardless of otherwise-elite inputs", () => {
  // Without the gate this would score 100 (see "a perfect snow/temp/base
  // day..." above, same shape of inputs) — 0" base means not skiable, full
  // stop, overriding everything else in the formula.
  assert.equal(
    computeRawPowderScore({
      tempF: 25, windMph: 0, forecastText: "Clear",
      snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
      baseDepth: 0,
      runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
    }),
    0
  )
})

test("a thin base under 12 inches caps the score at 20, even with otherwise-elite inputs", () => {
  assert.equal(
    computeRawPowderScore({
      tempF: 25, windMph: 0, forecastText: "Clear",
      snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
      baseDepth: 6,
      runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
    }),
    20
  )
  // Still resolves to the existing "Poor" tier — 20 is below the 35 "Okay"
  // threshold, so no new tier is needed for this band, only for exact 0.
  assert.equal(powderTierForScore(20), "Poor")
})

test("the thin-base cap boundary is exclusive at 12 inches", () => {
  const justUnder = computeRawPowderScore({
    tempF: 25, windMph: 0, forecastText: "Clear",
    snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
    baseDepth: 11.9,
    runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
  })
  const at12 = computeRawPowderScore({
    tempF: 25, windMph: 0, forecastText: "Clear",
    snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
    baseDepth: 12,
    runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
  })
  assert.equal(justUnder, 20, "11.9\" base should still be capped at 20")
  assert.ok(at12 > 20, "12\" base should NOT be capped — got " + at12)
})

test("a missing base depth does not trigger the gate", () => {
  // baseDepth: null means "we don't know", not "we know it's zero" — must
  // score normally. fresh 40 | incoming 20 | temp 25F->20 | base null->0 |
  // terrain 100%/100% -> 15 | no hint, no wind, no drive = 95 exactly.
  assert.equal(
    computeRawPowderScore({
      tempF: 25, windMph: 0, forecastText: "Clear",
      snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
      baseDepth: null,
      runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
    }),
    95
  )
})

test("normalizePowderScores marks a zero-base row Not Skiable", () => {
  const [row] = normalizePowderScores([
    { name: "a", isOpen: true, rawPowderScore: 92, baseDepth: 0 },
  ])
  assert.equal(row.powderScore, 92)
  assert.equal(row.powderTier, "Not Skiable")
})

test("normalizePowderScores does not gate a row with missing base depth", () => {
  const [row] = normalizePowderScores([
    { name: "a", isOpen: true, rawPowderScore: 71.4 },
  ])
  assert.equal(row.powderScore, 71)
  assert.equal(row.powderTier, "Very Good")
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: the 6 new tests FAIL (the first three because `computeRawPowderScore` doesn't gate yet; the "missing base depth" test currently passes already — that's fine, it documents pre-existing correct behavior — but re-run after Step 3 regardless; the two `normalizePowderScores` tests FAIL because `"Not Skiable"` isn't produced yet).

- [ ] **Step 3: Implement the gate**

In `src/lib/powderScore.js`, replace the end of `computeRawPowderScore` (currently lines 99-102):

```js
  const raw = weighted + snowHint - windPenalty - driveAdj

  return Math.round(clamp(raw, 0, 100) * 10) / 10
}
```

with:

```js
  const raw = weighted + snowHint - windPenalty - driveAdj
  let score = clamp(raw, 0, 100)

  // ── Base-depth gate ────────────────────────────────────────────────
  // A known-zero base means the mountain isn't skiable — overrides
  // everything above. A thin-but-nonzero base (<12") caps the score at 20
  // rather than letting great snow/temp/terrain paper over no real
  // coverage. Missing data (baseDepth == null) is exempt: "we don't know"
  // must never be scored the same as "we know it's zero".
  if (baseDepth === 0) {
    score = 0
  } else if (baseDepth != null && baseDepth < 12) {
    score = Math.min(score, 20)
  }

  return Math.round(score * 10) / 10
}
```

Then replace `normalizePowderScores` (currently lines 115-126):

```js
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

with:

```js
export function normalizePowderScores(rows) {
  return rows.map((r) => {
    if (r.isOpen === false) {
      return { ...r, powderScore: null, powderTier: "Closed" }
    }
    if (typeof r.rawPowderScore !== "number") {
      return { ...r, powderScore: null, powderTier: "Unknown" }
    }
    const powderScore = Math.round(r.rawPowderScore)
    if (r.baseDepth === 0) {
      return { ...r, powderScore, powderTier: "Not Skiable" }
    }
    return { ...r, powderScore, powderTier: powderTierForScore(powderScore) }
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — every test in `src/lib/powderScore.test.js`, including all 6 new ones. Confirm the total pass count against the prior baseline (check the last line of output, e.g. "# pass N") and note it for Task 4's PRD update.

- [ ] **Step 5: Commit**

```bash
git add src/lib/powderScore.js src/lib/powderScore.test.js
git commit -m "$(cat <<'EOF'
feat(powder-score): gate score on base depth (client)

A 0" base means the mountain isn't skiable, so it now forces the
score to 0 with a new "Not Skiable" tier instead of just losing a
few points. A thin-but-nonzero base (<12") caps the score at 20.
Missing base-depth data is exempt from the gate entirely.
EOF
)"
```

---

### Task 2: Server base-depth gate + missing-data bug fix

**Files:**
- Modify: `server/powderScore.js:46-88` (`computePowderScore`)
- Modify: `server/index.js:944` (the one call site)
- Test: Create `server/powderScore.test.js`

**Interfaces:**
- Consumes: the tier string `"Not Skiable"` established in Task 1 (must match exactly, case-sensitive — the client and server are a hand-mirrored pair and must agree on every tier label).
- Produces: `computePowderScore(...)` now returns `{ powderScore: 0, powderTier: "Not Skiable" }` whenever `baseDepth === 0`, and caps `powderScore` at `20` whenever `0 < baseDepth < 12`. Nothing later in this plan depends on server internals beyond this behavior.

- [ ] **Step 1: Write the failing tests**

Create `server/powderScore.test.js`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { computePowderScore } from "./powderScore.js"

// ── Base-depth gate: 0" is not skiable ──────────────────────────────────────
//
// Mirrors src/lib/powderScore.js's equivalent tests exactly — see that
// file's comments for the full reasoning. The server has no existing test
// harness (no server/*.test.js prior to this file); this is a direct
// `node --test` file, runnable standalone since computePowderScore is a
// pure function with no I/O: `node --test server/powderScore.test.js`.

test("a zero base depth forces the score to 0 and tier to Not Skiable, regardless of otherwise-elite inputs", () => {
  const { powderScore, powderTier } = computePowderScore({
    tempF: 25, windMph: 0, forecastText: "Clear",
    snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
    baseDepth: 0,
    runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
  })
  assert.equal(powderScore, 0)
  assert.equal(powderTier, "Not Skiable")
})

test("a thin base under 12 inches caps the score at 20", () => {
  const { powderScore, powderTier } = computePowderScore({
    tempF: 25, windMph: 0, forecastText: "Clear",
    snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
    baseDepth: 6,
    runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
  })
  assert.equal(powderScore, 20)
  assert.equal(powderTier, "Poor")
})

test("the thin-base cap boundary is exclusive at 12 inches", () => {
  const justUnder = computePowderScore({
    tempF: 25, windMph: 0, forecastText: "Clear",
    snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
    baseDepth: 11.9,
    runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
  })
  const at12 = computePowderScore({
    tempF: 25, windMph: 0, forecastText: "Clear",
    snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
    baseDepth: 12,
    runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
  })
  assert.equal(justUnder.powderScore, 20, "11.9\" base should still be capped at 20")
  assert.ok(at12.powderScore > 20, "12\" base should NOT be capped — got " + at12.powderScore)
})

test("a missing base depth does not trigger the gate", () => {
  // fresh 40 | incoming 20 | temp 25F->20 | base null->0 | terrain 15
  // no hint, no wind, no drive = 95 exactly -> Elite (>= 80).
  const { powderScore, powderTier } = computePowderScore({
    tempF: 25, windMph: 0, forecastText: "Clear",
    snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
    baseDepth: null,
    runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
  })
  assert.equal(powderScore, 95)
  assert.equal(powderTier, "Elite")
})

test("an omitted base depth (default param) does not trigger the gate", () => {
  // Same as the null case above, but relying on computePowderScore's own
  // default parameter rather than passing baseDepth explicitly — guards
  // against a future regression where the default reverts to 0.
  const { powderScore } = computePowderScore({
    tempF: 25, windMph: 0, forecastText: "Clear",
    snowPrev24in: 12, snowPrev48in: 10, snow24in: 6, snow48in: 6,
    runsOpen: 100, runsTotal: 100, liftsOpen: 10, liftsTotal: 10,
  })
  assert.equal(powderScore, 95)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test server/powderScore.test.js`
Expected: the first four tests FAIL (no gate exists yet). The last two tests (`"a missing base depth..."` / `"an omitted base depth..."`) currently FAIL too, but for a different reason than expected — `computePowderScore`'s current default param is `baseDepth = 0`, not `null`, so a missing/omitted `baseDepth` today gets `baseScore = Math.min(0/20, 5) = 0` (same numeric result) but this is the bug Step 3 fixes at the source. Confirm the failure and move on.

- [ ] **Step 3: Implement the gate and fix the missing-data bug**

In `server/powderScore.js`, change the function signature (currently line 51):

```js
  baseDepth = 0, forecastText = "", driveRisk = "Low",
```

to:

```js
  baseDepth = null, forecastText = "", driveRisk = "Low",
```

Change the `baseScore` line (currently line 72):

```js
  const baseScore = Math.min(baseDepth / 20, 5)
```

to:

```js
  const baseScore = Math.min((baseDepth ?? 0) / 20, 5)
```

Replace the end of the function (currently lines 84-87):

```js
  const raw = weighted + snowHint - windPenalty - drivePenalty
  const powderScore = Math.max(0, Math.min(100, raw))

  return { powderScore, powderTier: tierForScore(powderScore) }
}
```

with:

```js
  const raw = weighted + snowHint - windPenalty - drivePenalty
  let powderScore = Math.max(0, Math.min(100, raw))
  let powderTier = tierForScore(powderScore)

  // ── Base-depth gate ────────────────────────────────────────────────
  // Mirrors src/lib/powderScore.js exactly — see that file's comment for
  // the full reasoning. A known-zero base overrides everything above;
  // missing data (baseDepth == null) is exempt and scores normally.
  if (baseDepth === 0) {
    powderScore = 0
    powderTier = "Not Skiable"
  } else if (baseDepth != null && baseDepth < 12) {
    powderScore = Math.min(powderScore, 20)
    powderTier = tierForScore(powderScore)
  }

  return { powderScore, powderTier }
}
```

Then, in `server/index.js`, fix the one call site (currently line 944):

```js
            baseDepth: conditions.baseDepth ?? 0,
```

to:

```js
            baseDepth: conditions.baseDepth ?? null,
```

This is the bug: without this fix, a resort whose base depth genuinely failed to scrape would arrive at `computePowderScore` as `0`, indistinguishable from a confirmed-empty mountain, and get wrongly gated to `"Not Skiable"`. `server/index.js:959` (`baseDepth: conditions.baseDepth`, no `?? 0`) is a separate field on the returned row used for display only — already correct, not part of this fix, do not touch it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test server/powderScore.test.js`
Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add server/powderScore.js server/powderScore.test.js server/index.js
git commit -m "$(cat <<'EOF'
feat(powder-score): gate score on base depth (server)

Mirrors the client gate: a 0" base forces the score to 0 with a new
"Not Skiable" tier, a thin base (<12") caps at 20.

Also fixes a real bug this depended on: server/index.js collapsed a
genuinely-missing base depth to 0 before computePowderScore ever saw
it, which would have made "missing" indistinguishable from "confirmed
zero" under the new gate. The client already handled this correctly
(?? null); the server never did.
EOF
)"
```

---

### Task 3: "Not Skiable" badge color

**Files:**
- Modify: `src/components/ui/Badge.jsx:1-17`

**Interfaces:**
- Consumes: the exact tier string `"Not Skiable"` from Task 1/2.
- Produces: `TIER_COLORS["Not Skiable"]` and `TIER_BORDER_COLORS["Not Skiable"]`, consumed automatically by every existing reader of these maps (`ResortListRow`, `PowderMap`, `TodayScreen`, `MountainPage`, `ScoreRing`) — no changes needed in those files.

- [ ] **Step 1: Add the new tier to both color maps**

In `src/components/ui/Badge.jsx`, replace:

```js
export const TIER_COLORS = {
  "Elite": "var(--rating-mint)",
  "Very Good": "var(--rating-sky)",
  "Good": "var(--rating-gold)",
  "Okay": "var(--rating-peach)",
  "Poor": "var(--rating-coral)",
  "Closed": "var(--rating-slate)",
}

export const TIER_BORDER_COLORS = {
  "Elite": "var(--rating-mint-border)",
  "Very Good": "var(--rating-sky-border)",
  "Good": "var(--rating-gold-border)",
  "Okay": "var(--rating-peach-border)",
  "Poor": "var(--rating-coral-border)",
  "Closed": "var(--rating-slate-border)",
}
```

with:

```js
export const TIER_COLORS = {
  "Elite": "var(--rating-mint)",
  "Very Good": "var(--rating-sky)",
  "Good": "var(--rating-gold)",
  "Okay": "var(--rating-peach)",
  "Poor": "var(--rating-coral)",
  "Closed": "var(--rating-slate)",
  "Not Skiable": "var(--rating-slate)",
}

export const TIER_BORDER_COLORS = {
  "Elite": "var(--rating-mint-border)",
  "Very Good": "var(--rating-sky-border)",
  "Good": "var(--rating-gold-border)",
  "Okay": "var(--rating-peach-border)",
  "Poor": "var(--rating-coral-border)",
  "Closed": "var(--rating-slate-border)",
  "Not Skiable": "var(--rating-slate-border)",
}
```

Reuses the existing slate token (same as `"Closed"`) — no new CSS custom properties, per Kyle's call during brainstorming.

- [ ] **Step 2: Verify with lint and build (no automated test exists for this file)**

Run: `npm run lint`
Expected: no new errors/warnings introduced by this change (compare the problem count to the pre-existing baseline — see project memory for the current baseline if the count looks surprising; verify in this same checkout, not a stale number).

Run: `npm run build`
Expected: builds clean, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Badge.jsx
git commit -m "$(cat <<'EOF'
feat(powder-score): add Not Skiable badge color

Reuses the existing slate token already used for Closed — same
neutral "nothing to report" look, distinguished by label text only.
EOF
)"
```

---

### Task 4: PRD.md §7.1 documentation update

**Files:**
- Modify: `PRD.md:162-244` (§7.1 Dashboard & Conditions — Powder Score Algorithm)

**Interfaces:**
- Consumes: the final pass count from Task 1's `npm test` run (Step 4), to state accurately in the version-history comment if desired — optional, the existing header comment convention (see `v3 (2026-09-09, TASK 22.2)`) doesn't cite test counts, only behavior.
- Produces: nothing consumed by later tasks — this is the last task in the plan.

- [ ] **Step 1: Update the header comment marking this as v4**

In `PRD.md`, replace (currently line 172):

```
*Implemented in `src/lib/powderScore.js` (client) and hand-mirrored in `server/powderScore.js` (Render backend — a separate npm package that cannot import from `src/lib`). Both files and this section must be changed together. v3 (2026-09-09, TASK 22.2): base depth is now `/20`, and terrain is excluded-and-rescaled rather than defaulted when its data is missing.*
```

with:

```
*Implemented in `src/lib/powderScore.js` (client) and hand-mirrored in `server/powderScore.js` (Render backend — a separate npm package that cannot import from `src/lib`). Both files and this section must be changed together. v3 (2026-09-09, TASK 22.2): base depth is now `/20`, and terrain is excluded-and-rescaled rather than defaulted when its data is missing. v4 (2026-09-30): a 0" base now gates the score to 0 with a new "Not Skiable" tier, and a thin base (<12") caps the score at 20 — missing base-depth data remains exempt from this gate, same as it always has been for the underlying component contribution.*
```

- [ ] **Step 2: Add the gate to the formula block**

Replace (currently lines 174-189):

````
```
freshSnow     = (snowPrev24in × 5.0, max 32) + (snowPrev48in × 1.5, max 8)   → max 40 pts
incomingSnow  = (snow24in × 3.5, max 15) + (snow48in × 1.0, max 5)           → max 20 pts
tempScore     = absolute band (see below)                                      → max 20 pts
terrainScore  = (runsOpen/runsTotal × 10) + (liftsOpen/liftsTotal × 5)        → max 15 pts
                see "Missing terrain data" below when either pair is absent
baseScore     = baseDepth / 20, max 5   (100" base earns full credit)          → max  5 pts
snowHint      = +2 if "snow/powder/flurry/wintry" in forecast text            → max  2 pts
windPenalty   = windMph × 0.75, max 15                                         → up to –15 pts
drivePenalty  = 0 (Low) | 5 (Moderate) | 10 (High) | 10 (Severe, capped)     → up to –10 pts

rawScore = freshSnow + incomingSnow + tempScore + terrainScore +
           baseScore + snowHint − windPenalty − drivePenalty

powderScore = clamp(rawScore, 0, 100)  ← no normalization
```
````

with:

````
```
freshSnow     = (snowPrev24in × 5.0, max 32) + (snowPrev48in × 1.5, max 8)   → max 40 pts
incomingSnow  = (snow24in × 3.5, max 15) + (snow48in × 1.0, max 5)           → max 20 pts
tempScore     = absolute band (see below)                                      → max 20 pts
terrainScore  = (runsOpen/runsTotal × 10) + (liftsOpen/liftsTotal × 5)        → max 15 pts
                see "Missing terrain data" below when either pair is absent
baseScore     = baseDepth / 20, max 5   (100" base earns full credit)          → max  5 pts
snowHint      = +2 if "snow/powder/flurry/wintry" in forecast text            → max  2 pts
windPenalty   = windMph × 0.75, max 15                                         → up to –15 pts
drivePenalty  = 0 (Low) | 5 (Moderate) | 10 (High) | 10 (Severe, capped)     → up to –10 pts

rawScore = freshSnow + incomingSnow + tempScore + terrainScore +
           baseScore + snowHint − windPenalty − drivePenalty

powderScore = clamp(rawScore, 0, 100)  ← no normalization

Base-depth gate, applied last, after the clamp above:
  baseDepth === 0        → powderScore = 0, tier = "Not Skiable" (overrides everything above)
  0 < baseDepth < 12      → powderScore = min(powderScore, 20)   (stays in the "Poor" tier)
  baseDepth == null       → no gate — scores exactly as computed above
```
````

- [ ] **Step 3: Add the new tier to the tier thresholds table**

Replace (currently lines 216-225):

```
**Tier thresholds (absolute):**

| Score | Tier | Color |
|---|---|---|
| 80–100 | Elite | Teal |
| 65–79 | Very Good | Blue |
| 50–64 | Good | Yellow |
| 35–49 | Okay | Orange |
| 0–34 | Poor | Red |
| — | Closed | Gray |
```

with:

```
**Tier thresholds (absolute):**

| Score | Tier | Color |
|---|---|---|
| 80–100 | Elite | Teal |
| 65–79 | Very Good | Blue |
| 50–64 | Good | Yellow |
| 35–49 | Okay | Orange |
| 0–34 | Poor | Red |
| 0 (0" base) | Not Skiable | Gray — same as Closed |
| — | Closed | Gray |
```

- [ ] **Step 4: Add a new calibration example**

In the calibration examples list (currently lines 227-236), after the "Closed resort" bullet, add:

```
- **Zero base, everything else elite** — 12" last 24h, 10" last 48h, 6"+6" incoming, 25°F, 0 mph, **0" base**, 100% terrain, "Clear" → **0.0, Not Skiable** (would otherwise score 95+ — this is the whole point of the gate)
```

- [ ] **Step 5: Add F-REQ-002b**

After F-REQ-002a (currently line 241), insert:

```
- F-REQ-002b: **Base depth has a floor, not just a bonus.** A confirmed `0"` base forces the whole score to 0 and assigns a distinct "Not Skiable" tier, regardless of any other component. A confirmed base under 12" caps the score at 20 (stays "Poor"). Missing base-depth data (not a confirmed reading) is exempt from both — it keeps its existing 0/neutral component contribution per F-REQ-002, with no gate applied, same distinction F-REQ-002a already draws for terrain.
```

- [ ] **Step 6: Verify the doc is internally consistent**

Re-read the full §7.1 section (`PRD.md:162-249` after edits) and confirm: the formula block, tier table, calibration example, and F-REQ-002b all describe the same three cases (0" / <12" / null) with the same numbers (0, 20, no gate). No leftover references to the old behavior.

- [ ] **Step 7: Commit**

```bash
git add PRD.md
git commit -m "$(cat <<'EOF'
docs: update PRD 7.1 for the base-depth gate (v4)

Documents the new gate (0" -> 0/Not Skiable, <12" -> capped at 20,
missing data exempt), adds the Not Skiable tier to the thresholds
table, and adds a calibration example.
EOF
)"
```

---

## Self-Review Notes (for the plan author, not a task)

- **Spec coverage:** §1 gate → Tasks 1+2. §2 client → Task 1. §3 server + bug fix → Task 2. §4 tier/Badge → Task 3. §5 out-of-scope items → explicitly listed in Global Constraints, untouched by any task. Testing → Tasks 1+2. PRD updates → Task 4. All covered.
- **Type/string consistency:** `"Not Skiable"` spelled identically (capital N, capital S, one space) in Task 1's client code, Task 2's server code and tests, Task 3's Badge maps, and Task 4's PRD text — verified matching across all four tasks.
- **No placeholders:** every step has literal code/diffs, no "add appropriate handling" language.
