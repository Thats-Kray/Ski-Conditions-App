# Powder Score Algorithm Tuning — Design Spec

**Date:** 2026-09-09
**Author:** Claude (brainstorming session with Kyle)
**Status:** Draft, pending Kyle's review
**Part of:** TASK 22.2 (ROADMAP.md Sprint 44) — tuning the existing scoring formula, not
building a new one.

## Context

Kyle's kickoff complaint: during the Feb/March 2026 near-record-low-snow winter, a cold, icy
day with no fresh snow at a resort scored in the 80s (Elite tier) — should have been 50 or
below. He asked for accurate scoring built from the inputs the formula already uses (new
snowfall, base depth, temp, wind, next-24h snowfall, lifts/runs open) and confirmed the
existing absolute-not-relative philosophy is correct and should stay.

**Investigation findings, not assumptions:**

- The client formula (`computeRawPowderScore` in `src/App.jsx:194`) has changed since
  Feb/March 2026 (confirmed via `git log -p`) — the exact "80s" figure may reflect an older
  weighting no longer in the repo, or the separate server-side email-digest formula. The
  underlying complaint is valid regardless: **PRD.md §7.1's own calibration example** says a
  "warm bluebird, no snow" day should land ~25–35 (Poor) — the target behavior Kyle wants is
  already the documented intent.
- **The live client code violates its own spec.** PRD.md F-REQ-002 requires "missing data for
  any individual component must default to 0 contribution." The client's terrain-score fallback
  (`src/App.jsx:236-240`) instead assumes ~50% open when `runsTotal`/`liftsTotal` are null —
  an optimistic default that inflates scores whenever the scraper can't parse a resort's page.
- **The server formula has the mirror-image bug.** `server/index.js:890-893` passes
  `conditions.runsOpen ?? 0` / `conditions.runsTotal ?? 0` into `computePowderScore()`, and
  `server/powderScore.js:43`'s `runsTotal > 0 ? ... : 0` fallback means missing terrain data
  contributes a hard 0 — which Kyle flagged directly: a resort with excellent snow/temp/base but
  no terrain data available would be structurally capped at 85/100, never able to show the
  Elite score it deserves.
- **Root cause of the missing data:** Ikon-pass resorts (7 of them) + Telluride are scraped from
  each resort's own HTML page (`server/index.js:557-702`, 3 layered fallback-parsing strategies
  already present — page JSON-LD, page-data JSON, regex pair-match — evidence this already
  breaks periodically). Epic/Vail resorts use a real JSON API and don't have this problem.
  Genuinely hardening the scrape (new sources, retries, monitoring) is real, open-ended scope —
  already tracked separately as TASK 22.3 (Sprint 45, sized M). This spec adds one bounded
  mitigation (last-known-good fallback, below) and leaves the rest to that task.
- **The formula is untested.** It lives inline in a 1500+-line `App.jsx` with no unit coverage.
  This app's test convention (`npm test` = `node --test src/lib/*.test.js`) only covers
  `src/lib` — extracting the formula there is what makes it testable at all.

## Scope boundary

This is a **formula + resilience tuning pass**, not a rebuild:

- No new scoring inputs. No relative/normalized scoring (absolute philosophy is confirmed
  correct, stays as-is).
- No hard ceiling override for zero-snow days (considered and declined — risks unfairly
  tanking a legitimately good sunny/groomer day with no new snow; tightened base-depth math and
  the missing-data fix should separate icy/thin days from good days without a blunt rule).
- The "exclude and rescale" treatment applies **only** to the terrain component. Fresh snow,
  incoming snow, temperature, and base depth keep their current "missing → 0/neutral" defaults
  — those are weather facts (no evidence of snow ⇒ reasonable to assume none), unlike terrain
  open/closed status, which is an operational fact the app simply failed to fetch.
- Data-connection robustness is scoped to one bounded addition (in-memory last-known-good
  fallback, ~24h window). Persistent (Supabase-backed) caching, new data sources, retry logic,
  and scraper monitoring are explicitly deferred to TASK 22.3.

## Design Decisions

### 1. Formula: exclude terrain from the calculation when data is unavailable, don't zero it

Current terrain component (client `src/App.jsx:233-240`, server `server/powderScore.js:43`):
`runsOpen/runsTotal × 10` + `liftsOpen/liftsTotal × 5`, max 15 of the 100-point scale.

New behavior, in both the client and server formulas:

- **Both pairs available** (`runsTotal > 0` and `liftsTotal > 0`): score terrain normally,
  unchanged, 0–15.
- **Only one pair available**: use that signal alone, scaled to the full 15 points (e.g.
  lifts-only → `liftsPct × 15`; runs-only → `runsPct × 15`).
- **Neither pair available**: drop terrain from the formula entirely. Rescale the remaining
  weighted components — fresh snow (max 40), incoming snow (max 20), temperature (max 20), base
  depth (max 5) — from their combined max of 85 up to fill 0–100:
  `rescaledPositive = (freshSnow + incomingSnow + tempScore + baseScore) × (100 / 85)`.
  Snow-hint (flat +2 bonus) and the wind/drive penalties are applied after rescaling, unchanged
  — they're minor modifiers, not part of the weighted "how good are conditions" core, and
  they're already missing-data-safe (`?? 0`, i.e. "assume no penalty" — the correct conservative
  default for a penalty, not a "quality" signal).

This means a resort with excellent snow/temp/base but no parseable terrain data can still reach
a legitimate 100, and a resort with no snow, no terrain data, and mediocre temp/base cannot
backdoor its way to a high score just because the terrain component silently dropped out (there
was nothing to inflate — the same information deficit that removed terrain also means nothing
else is propping the score up).

### 2. Base depth: raise the bar for full credit

Current: `baseDepth / 14, capped at 5` — any 70" base maxes out the component. That's a low bar
in a below-average year; 70" might be a resort's best base of an entire bad season.

New: `baseDepth / 20, capped at 5` — requires 100" for full credit. Applied identically in both
the client and server formulas.

### 3. Extract the formula to `src/lib/powderScore.js`

- Move `computeRawPowderScore` and the tier-assignment logic (`normalizePowderScores`, or the
  relevant piece of it) out of `src/App.jsx` into a new `src/lib/powderScore.js`, as a pure,
  importable module. `src/App.jsx` imports and calls it — no behavior change beyond what's
  described above.
- This is what makes the formula testable at all under this app's existing `node --test`
  convention (`npm test`), which only runs `src/lib/*.test.js`.

### 4. Port the same weight changes to `server/powderScore.js`

- `server/powderScore.js` is a separately-deployed package (Render) with its own `package.json`
  — it cannot import from `src/lib` without a build/publish step that's out of scope here. This
  is a **mirrored edit**, not a code-sharing refactor: apply the same terrain
  exclude-and-rescale logic and the same base-depth divisor change directly in
  `server/powderScore.js`, keeping its existing structure (`TEMP_BANDS`, `temperatureScore()`,
  `tierForScore()` helpers untouched).
- Kyle's call: apply to both, since the server formula feeds the "Best Bet" cron email digest
  and should match what the app shows, rather than deliberately drift further as documented in
  the file's current header comment.

### 5. Update `PRD.md §7.1`

`server/powderScore.js`'s header comment says it's "reproduced exactly from PRD.md §7.1" — if
the weights change without updating the PRD, a future session trusting the PRD as ground truth
will reintroduce today's bugs. Update:

- The base-depth formula line (`baseDepth / 14` → `baseDepth / 20`).
- Add the terrain exclude-and-rescale behavior to the formula description (currently the PRD
  shows only the "both pairs available" case).
- F-REQ-002's wording ("missing data... must default to 0 contribution") needs to be corrected
  to describe the new behavior for terrain specifically — 0 contribution is no longer correct;
  it's excluded-and-rescaled. Other components keep the 0-contribution rule.
- Recompute the 4 calibration examples if the base-depth change shifts any of their expected
  ranges enough to matter (check during implementation; likely no visible shift since none of
  the 4 examples exercise the missing-terrain-data path or a base depth between 70–100").

### 6. Last-known-good fallback for scraped terrain data (server-side)

- Add an in-memory cache in `server/index.js` — a `Map` keyed by resort key, storing the last
  successfully-scraped `{ liftsOpen, liftsTotal, runsOpen, runsTotal, capturedAt }`.
- Inside `getResortConditions()` (`server/index.js:704`, the single aggregation point used by
  both the `/api/resort-conditions` route and the cron's `getAllResortConditions()`), operate
  **per field, not as an all-or-nothing swap**: for each of `liftsOpen`/`liftsTotal`/
  `runsOpen`/`runsTotal` independently, if this scrape returned a value, use it and update that
  field's cache entry; if this scrape returned null and a cached value for that field exists and
  is under 24 hours old, use the cached value; otherwise leave it null. This means a scrape that
  freshly parses lifts but fails on runs keeps the fresh lifts data and only backfills runs — it
  never overwrites a fresh value with a stale one. Any field still null after this (no fresh
  value, no usable cache entry) falls through to the formula's exclude-and-rescale (§1) as the
  final fallback.
- **Accepted limitation, stated explicitly so it isn't mistaken for an oversight later:**
  in-memory only — resets on every Render restart/deploy. No Supabase persistence. This is the
  deliberate boundary between "bounded mitigation in this task" and the bigger,
  already-scheduled data-quality pass (TASK 22.3).

## Testing

New `src/lib/powderScore.test.js`, run under the existing `node --test` convention:

1. **PRD calibration examples**, encoded as permanent regression fixtures (values from
   PRD.md §7.1, recomputed if base-depth changes shift them per §5 above):
   - Epic powder day (12" fresh, incoming, 26°F, 100% terrain) → Elite (≥80)
   - Solid mid-winter day (3" fresh, 28°F, 80% terrain) → Good/Very Good (50–79)
   - Warm bluebird, no snow (38°F, 100% terrain) → Poor (0–34)
   - Late-season slush (45°F, partial terrain) → Poor (0–34)
2. **Kyle's case**: cold temp, zero fresh/incoming snow, missing runs/lifts data → score ≤ 50.
3. **Terrain exclude-and-rescale unit tests**: both pairs present (unchanged baseline), one pair
   present (scaled to 15), neither present (rescale of the other four components verified
   against hand-computed expected values), confirming a resort with excellent
   snow/temp/base and no terrain data can still reach 100.
4. **Base depth**: 70" no longer maxes the component; 100" does.
5. Existing tier-threshold behavior (Elite/Very Good/Good/Okay/Poor/Closed cutoffs) unchanged —
   regression-test the boundaries (34/35, 49/50, 64/65, 79/80) still map correctly.

No new tests planned for the last-known-good cache beyond what the implementer's plan judges
necessary — it's a small, stateful addition to a Node/Express file with no existing test
harness for that layer; correctness will be verified by code review and (if feasible) a manual
check against the live `/api/resort-conditions` endpoint during the fix-wave/verification step,
not a new automated suite.

## Non-goals (explicitly out of scope for this task)

- Persistent (Supabase-backed) last-known-good storage.
- New resort data sources, scraper retry logic, or scraper failure monitoring/alerting.
- Any change to wind penalty, drive penalty, incoming-snow weighting, or the snow-hint bonus —
  none of these were implicated by the investigation.
- Any change to the relative-vs-absolute scoring philosophy (already correct, per Kyle).
- Syncing `server/powderScore.js` via a shared module/monorepo restructure — the two packages
  stay independent; this task only mirrors the specific weight changes by hand.
