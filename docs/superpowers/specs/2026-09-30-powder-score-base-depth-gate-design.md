# Powder Score Base-Depth Gate — Design Spec

**Date:** 2026-09-30
**Author:** Claude (brainstorming session with Kyle)
**Status:** Draft, pending Kyle's review
**Part of:** Further Powder Score tuning, following TASK 22.2 (base-depth divisor, terrain
exclude-and-rescale). Not tracked under a ROADMAP task number yet — small enough to fold in
without a new sprint slot; note in ROADMAP as a completed follow-on to TASK 22.2 once shipped.

## Context

Kyle's ask: a mountain with 0" base depth is not skiable, full stop, and the current formula
doesn't reflect that. Today `baseDepth` only contributes a small positive bonus (`baseDepth / 20,
max 5` — 5 of 100 points) — it is not a gate on anything else. A resort reporting 0" base can
still score high purely from fresh/incoming snow, temperature, and terrain, which is wrong: no
snow on the ground means nobody is skiing there regardless of what's falling from the sky or how
cold it is.

Base depth should be the first thing the formula effectively rules out on, not a minor positive
modifier buried in the weighted sum.

## Design Decisions

### 1. The gate itself

Applied as the **last** step on the final score, after all existing weighting and penalties —
functionally equivalent to "check base depth first," without restructuring the rest of the
formula:

- **`baseDepth === 0`** (a real, known reading of zero — not missing data): score is forced to
  exactly **0**, tier is **"Not Skiable"** (a new tier, distinct from "Poor").
- **`0 < baseDepth < 12`**: score is hard-capped at **`min(score, 20)`**. This is a ceiling, not
  a ramp — a 1" base and an 11" base are both capped at the same 20, not scaled proportionally.
  20 is always below the Poor/Okay boundary (35), so this case stays in the existing "Poor" tier
  — no new tier applies here, only literal 0" gets "Not Skiable".
- **`baseDepth == null`** (genuinely missing — the app has no reading, not a reported zero): **no
  gate at all.** Scores normally, same treatment terrain already gets when its data is
  unavailable (per TASK 22.2). Missing data must never be punished as though it were bad data —
  conflating "we don't know" with "we know it's zero" is the exact bug class TASK 22.2 fixed for
  terrain, and the server side has a live instance of it today (see §3).
- **`baseDepth >= 12`**: unaffected, formula behaves exactly as it does now.

Nothing about the weighted components themselves changes — `baseScore = baseDepth / 20, max 5`
stays as-is for the cases that aren't gated. The gate is a ceiling applied after the weighted sum,
not a change to how base depth earns points within it.

### 2. Client implementation (`src/lib/powderScore.js`)

`computeRawPowderScore` already receives `baseDepth` as a parameter. Add the gate immediately
before the final rounding/return — no signature change, no caller changes needed for this
function.

`normalizePowderScores` already receives `baseDepth` on each row (confirmed by tracing
`src/App.jsx`: `baseDepth` is computed once per resort and threaded into both the score
computation and the row object). Add a third branch, following the existing pattern of its two
current overrides (`isOpen === false` → `"Closed"`, non-numeric score → `"Unknown"`):

```
if (r.baseDepth === 0) return { ...r, powderScore, powderTier: "Not Skiable" }
```

placed after those two checks and before the normal `powderTierForScore(powderScore)` call.
`powderTierForScore` itself is not changed — the override lives in `normalizePowderScores`,
matching how `"Closed"`/`"Unknown"` already work, and avoids threading `baseDepth` through a
function that's otherwise pure score-in/tier-out.

### 3. Server implementation (`server/powderScore.js`) — plus one real pre-existing bug

`computePowderScore` returns `{ powderScore, powderTier }` together in one call (no separate
normalize step server-side, unlike the client). Add the same gate there, adjusting both fields
together, following the existing inline pattern the `!isOpen` → `"Closed"` short-circuit already
uses.

**Bug found while tracing this, fixed as part of the same change:** the server's only call site,
`server/index.js:944`, currently does `conditions.baseDepth ?? 0` — collapsing genuinely missing
base-depth data to 0 *before* `computePowderScore` ever sees it. Under the new gate that would
silently mark every resort with unreported base depth as "Not Skiable," which is exactly the
wrong outcome the null-passthrough case above exists to prevent. The client already gets this
right (`cond.baseDepth ?? resortSnow.baseDepth ?? null`) — the server never did. Fix:

- `server/index.js:944`: `conditions.baseDepth ?? 0` → `conditions.baseDepth ?? null`.
- `server/powderScore.js`: default param `baseDepth = 0` → `baseDepth = null`.
- Inside `computePowderScore`, the existing `baseScore` line changes from `baseDepth / 20` (which
  would now throw/NaN on `null`) to `(baseDepth ?? 0) / 20` — mirroring the client's
  `clamp((baseDepth ?? 0) / 20, 0, 5)` exactly. This keeps the *component* contribution
  unchanged for the missing-data case (still 0 points toward baseScore, same as today) while
  letting the *gate* see the real `null` and correctly skip.

This is a small, scoped fix bundled with this change because it's the same root cause the gate
itself depends on — the gate is meaningless if the call site has already erased the distinction
between "missing" and "zero."

### 4. New tier: "Not Skiable"

Kyle's call: a distinct tier rather than folding into "Poor," so the UI can eventually say
something more specific than "bad conditions" when the real story is "there's no snow at all."

- `Badge.jsx`: add `"Not Skiable": "var(--rating-slate)"` to `TIER_COLORS` and
  `"Not Skiable": "var(--rating-slate-border)"` to `TIER_BORDER_COLORS` — reusing the existing
  gray/slate token already used for `"Closed"` (Kyle's call: no new CSS custom properties, the
  label text is what distinguishes "Not Skiable" from "Closed," not the color).
- No other component needs a code change: `ResortListRow`, `PowderMap`, `TodayScreen`,
  `MountainPage`, and `ScoreRing` all read tier color through `TIER_COLORS`/`TIER_BORDER_COLORS`
  already, so the new key is picked up automatically once added.
- `tierForScore` (server) and `powderTierForScore` (client) are **not** changed to know about
  `"Not Skiable"` — the tier is assigned only at the two integration points that already have
  `baseDepth` in scope (`normalizePowderScores` client-side, inline in `computePowderScore`
  server-side), for the same reason as §2: keeps the pure score→tier functions pure.

### 5. Explicitly out of scope

- **`TripDetailModal.jsx`** has its own separate, independent tier-labeling logic — snow-inches
  thresholds, not `powderTierForScore`/`computePowderScore`, with its own hardcoded colors and
  its own label set (`"Low"` instead of `"Poor"`, notably). It was already drifted from the real
  formula before this change and doesn't reference base depth. Left untouched — noted here as a
  known, pre-existing inconsistency for a future cleanup, not pulled into this fix.
- The `"Unknown"` tier's existing styling gap (no `TIER_COLORS.Unknown` entry, silently falls
  back to `undefined`/unstyled in `Badge.jsx` specifically) is a separate, pre-existing bug
  unrelated to base depth. Not fixed here.
- No ramp/smooth interpolation for the `0 < baseDepth < 12` band — deliberately a hard ceiling,
  per Kyle's choice.

## Testing

Extend `src/lib/powderScore.test.js`:

1. `baseDepth: 0` forces `powderScore: 0` and tier `"Not Skiable"`, even with otherwise-elite
   inputs (heavy fresh snow, perfect temp, full terrain).
2. `baseDepth: 6` (mid-band) caps the score at 20 even with otherwise-elite inputs; confirm tier
   still resolves to `"Poor"` via the normal tier function (20 < 35).
3. Boundary: `baseDepth: 11.9` capped at 20; `baseDepth: 12` uncapped, scores normally.
4. `baseDepth: null` (missing) does not gate — scores identically to the same inputs with the
   gate logic removed, proving missing data isn't punished.
5. Existing calibration fixtures (PRD §7.1) are unaffected — none of the 5 locked-in examples use
   a base depth under 12", so none should change value. Re-verify after implementation rather
   than asserting it blind.

`server/powderScore.js` has no existing test file (confirmed — no `server/*.test.js` in the
repo). This spec doesn't mandate creating a new test harness for the server package; the
implementation plan should decide whether to add a minimal one (e.g. a plain `node --test` file
colocated in `server/`, since `computePowderScore` is already a pure function with no I/O) or rely
on manual/code-review verification consistent with how this file has been handled before (TASK
22.2's mirrored edits were verified by hand-diffing against the client, not automated tests). Given
this change is a direct behavioral divergence risk (client and server must produce the same gate
outcome for the same inputs), a lightweight port of tests #1–4 above to a new
`server/powderScore.test.js` is recommended, not required.

## PRD.md §7.1 updates required

- Formula block: note the gate beneath the existing `baseScore` line.
- New tier thresholds table row: `Not Skiable` / gray (0" base, distinct from `Poor`).
- F-REQ-002 currently states base depth "default[s] to 0/neutral contribution when absent" —
  this remains true for the *component* contribution and needs a companion bullet (new
  F-REQ-002b) describing the gate: known-zero base forces the whole score to 0 with a distinct
  tier; a thin-but-nonzero base (<12") caps the score at 20; missing base depth is exempt from
  both, same as F-REQ-002a already carves out for terrain.
- Add at least one new calibration example: e.g. "Zero base, everything else elite" → 0.0, Not
  Skiable. Bump the version marker to v4 alongside the file-header comments in both
  `powderScore.js` files (matching the existing `v3 (2026-09-09, TASK 22.2)` convention).

## Non-goals (explicitly out of scope)

- Any change to the weighted component formula itself (fresh snow, incoming snow, temperature,
  terrain) beyond the gate described above.
- Smooth/ramped scoring for thin bases — hard ceiling only, per Kyle's choice.
- Fixing `TripDetailModal.jsx`'s independent tier logic or the `"Unknown"` tier's styling gap —
  both noted, neither fixed here.
- Any UI/visual redesign of the tier badges beyond adding the one new color-map key.
