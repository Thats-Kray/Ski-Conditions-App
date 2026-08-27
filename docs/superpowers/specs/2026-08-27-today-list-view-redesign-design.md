# Design — Today Tab: List View Mockup Fidelity Pass

**Date:** 2026-08-27
**Status:** Approved for planning
**Origin:** ROADMAP.md TASK 22.0 — new high-fidelity mockups exist
(`mockups/PowDays.app mockup design/Screen Shots/`) that the live app does not match. Kyle is
reviewing page by page; this spec covers the first slice: the Today tab's **List** sub-view
only. The **Map** sub-view (same mockup set) and the header changes it shares with List are
scoped together here since the segmented `List | Map` control and the brand/date header row
can't be built once and skipped the other time — but the map's own visual redesign (glowing
bubbles, bottom sheet) is explicitly **out of scope**, see §6.

## 1. The problem

`TodayScreen.jsx` and the header block in `App.jsx` predate the new mockups and look
nothing like them:

1. **Header** is a `❄️ Morning Decision Engine` eyebrow + `Colorado Snow Conditions` heading +
   a description paragraph + a `Refresh` button. The mockup shows a persistent `❄️ PowderDays`
   brand row with a notification bell, then `Today` / `{date} · {condition}` with a `List | Map`
   segmented pill. The two sub-tab buttons today (`🏔️ Snow` / `🗺️ Map`) aren't a segmented
   control and don't say "List."
2. **Hero card** is a large 👑 "Best Powder Right Now" gradient block plus two separate
   Best-Epic/Best-Ikon cards below it. The mockup shows one compact "Best Bet Today" card with
   a big score number, one stat line, and two action buttons.
3. **Resort list** renders every resort as a tall, always-expanded `ResortCard` — hero photo,
   badges, a 3-metric grid, forecast text, travel alerts, two expand toggles, two CTA buttons —
   all visible at once, for every resort. The mockup shows a compact one-line row per resort
   (rank, score pill, name, tier·pass, snow/base numbers), with detail presumably reached by
   interaction, not shown by default.
4. **No "who's skiing here" / "ski here today" affordance** exists on an individual resort
   beyond the existing friends-going badge — there's no direct path from "I'm looking at Winter
   Park" to "I'm skiing at Winter Park today."

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Collapsed rows are compact; tapping expands in place (accordion), not a modal or navigation.** | Kyle's choice. Matches the accordion pattern `ResortCard` already uses for "Show Details"/"This Week" — no new interaction idiom introduced. |
| 2 | **The expanded card reuses today's `ResortCard` content almost verbatim**, not a rebuild. | Kyle: "similar to what we have in place in the live app today." Lowest risk, fastest path to matching the screenshot's list state, which is the part he explicitly called "exactly what we're going for." |
| 3 | **"Who's skiing here" is friends-only**, reusing `friendTripsByResort`. | Kyle's choice. Reads as a social signal, not a usage stat — matches the mockup's headcount-bubble framing. `skierCounts` (all users) stays where it already is, in the metric grid. |
| 4 | **"Ski here today" opens `PlanEditorModal` pre-filled, rather than a silent one-tap write.** | Kyle's choice. Reuses the one modal already used everywhere else a plan is created/edited, rather than adding a second write path — avoids the exact "writer census" class of bug this codebase has hit five times before (see ROADMAP's recurring-lesson notes). |
| 5 | **The hero is rebuilt as a single compact `BestBetCard`,** replacing the crown card and both `LeaderCard` boxes. | Kyle: match the screenshot exactly. Explicit tradeoff accepted: the standalone "Best Epic Resort"/"Best Ikon Resort" callouts are dropped — that information still exists (each row shows its pass) but isn't called out as its own card. |
| 6 | **The filter bar (All/Epic/Ikon, search, sort) stays**, restyled as a slim row, even though the screenshot doesn't show it. | Real functionality; the mockup likely just didn't capture that scroll state. Removing search/sort would be a functional regression, not a visual fix. |
| 7 | **`PlanEditorModal` is used unmodified** — no new "locked resort" mode is added to it. | The modal already supports everything needed: `defaultResortKey` pre-fills the dropdown (still changeable, which is consistent — the modal's whole design lets a user switch mountains, e.g. `DayPlanCard`'s "Switch from Vail"), and omitting `onDateChange` already renders the date read-only. Today's date is fixed by passing `dateKey={localDateKey()}` and no `onDateChange`. Building a new lock mechanism would duplicate behavior the modal already has. |

## 3. The design

### 3.1 Header (`App.jsx`, Today-tab branch only)

Replace the `❄️ Morning Decision Engine` eyebrow + `Colorado Snow Conditions` heading +
description paragraph with:

```
❄️ PowderDays                                    🔔³
────────────────────────────────────────────────────
Today                                    [List | Map]
Jan 18 · ☁️ Powder day
```

- Top row (brand + bell) is the same content `TopNav` already renders on desktop; this adds it
  to the Today screen itself so mobile — where `TopNav` is `display:none` — also gets it. Reuses
  the existing `NotificationBell` component, not a new one.
- `Today` / `{date} · {condition}` replaces the old heading + description. Date formats via the
  existing date-formatting helper already used elsewhere (`formatDate`-style, not
  `toISOString()`, matching repo convention). "Condition" is a short derived label (e.g. "Powder
  day" when today's best resort has fresh snow, otherwise a plain date with no condition
  clause) — exact derivation rule is an implementation-plan-level detail, not a design decision;
  it degrades to just the date with no dash-condition when there's nothing notable.
- The `Refresh` button's behavior is preserved but no longer inline with a heading — it moves
  into the same row as the segmented control, consistent with how it's scoped today (only shown
  on the conditions/list sub-tab).
- Segmented `List | Map` pill replaces the two standalone `🏔️ Snow` / `🗺️ Map` buttons.
  Same underlying `conditionsSubTab` state in `TodayScreen.jsx`, styling only. Label changes
  from "Snow" to "List" to match the mockup's wording.

### 3.2 `BestBetCard` (new component, replaces the crown card + both `LeaderCard`s)

```
┌──────────────────────────────────────┐
│ BEST BET TODAY                       │
│ Winter Park                       91 │
│ [Ikon] [Elite]           POWDER SCORE│
│ 11" overnight · 14mph · Drive risk Low│
│ [ 6  Who's going ]   [ Directions ]   │
└──────────────────────────────────────┘
```

- Data: `topResort` (already computed and passed into `TodayScreen`) — no new data fetching.
- Pills reuse `Badge`/`TIER_COLORS`, same as `ResortCard`'s hero.
- Score number reuses the styling already established by `ScoreRing`'s numeral, sized up.
- `Who's going` button **is** `FriendsGoingBadge`, restyled as a solid pill with the headcount
  inline (`friendsGoing={friendTripsByResort[topResort.resortKey] || []}`) — same component,
  same click-to-reveal-names popover, no new logic.
- `Directions` reuses the existing `mapsUrl(topResort.directionsQuery)` helper, same as today.
- Second/third place (`secondResort`/`thirdResort`) and the Epic/Ikon leaders
  (`topEpic`/`topIkon`) are **no longer rendered** — see Decision 5. `topEpic`/`topIkon` become
  unused props into `TodayScreen`; whether to stop computing them in `App.jsx` or leave them
  computed-but-unused is an implementation-plan call (lint's no-unused-vars baseline should
  decide it, not this spec).

### 3.3 Filter bar

Unchanged functionally (`passFilter`, `query`, `sortBy` — same state, same handlers). Visually
restyled as a slimmer single row, moved to sit directly above `11 MORE RESORTS` rather than
above the hero, so the hero reads first per the mockup.

### 3.4 `ResortListRow` (new component, collapsed state)

```
 2   84   Arapahoe Basin              8"   61"
     Elite · Ikon                 24H SNOW  BASE
```

- Rank: index + 2 (rank 1 is the hero card above; "11 MORE RESORTS" starts at rank 2, matching
  the mockup's own numbering).
- Score pill: number + border/text colored via the existing `tierColor(r.powderTier)`.
- Subtitle: `{tier} · {pass}`, reusing data already on each row (`r.powderTier`, `r.pass`).
- Right side: `r.snowPrev24in` and `r.baseDepth`, stacked, same fields `ResortCard`'s metric
  grid already reads.
- Tapping the row toggles that resort's expanded state (see 3.5). One resort expanded at a
  time or many at once is an open question left to the implementation plan — either is
  consistent with an accordion pattern; default to independent (many can be open) unless it
  reads cluttered in testing, since that's the lower-risk default and matches how
  "Show Details"/"This Week" already behave per-card today.

### 3.5 Expanded state

Reuses `ResortCard`'s existing body content **unchanged**, with two additions inserted after
the existing `FriendsGoingBadge` line (which becomes the "who's skiing here" section — no new
component, see Decision 3) and before the "Mountain Page →" button:

```
[existing ResortCard body: metric grid, community-activity line,
 friends-going badge ("who's skiing here"), forecast box, travel alerts,
 Show Details / This Week toggles]

[ Ski here today ]          ← NEW
[ 🏔️ Mountain Page → ]      ← existing, unchanged
[ 📍 Directions ]           ← existing, unchanged
```

**"Ski here today" button:**
- If the user has no plan today, or a plan at a *different* resort: label reads `Ski here
  today` (or `Switch to here` when a plan exists elsewhere — same honest-labeling principle
  `DayPlanCard` already established for the friends calendar, see the 2026-08-18 plan-editor
  spec §3.4).
- If the user's plan today is already this resort: label reads `✓ You're skiing here` and taps
  open the modal in edit mode (to adjust ETA/visibility) rather than create mode.
- Tapping opens `PlanEditorModal` with `dateKey={localDateKey()}`, no `onDateChange` (date
  fixed to today), `defaultResortKey={r.resortKey}`, `plan={myTodayPlan}` (see §3.6), `resorts`
  = the same resort list already available in `TodayScreen`. On save, reuses the existing
  `buildPlanUpsert(myTodayPlan, {...}) → upsertDailyPlan(...)` path — the exact call
  `SkiPlansTab.jsx` already makes, not a new write path (Decision 4).

### 3.6 New data dependency: the user's own plan for today

Nothing today loads "does the current user already have a plan today, and where." This is
needed to label the button correctly (§3.5) and to pass `plan=` into `PlanEditorModal` so
`buildPlanUpsert` merges rather than blindly overwrites (status/`arrived_at` carried forward —
the exact invariant the 2026-08-18 spec's Decision table calls out as a recurring source of
bugs when skipped).

- `App.jsx` fetches `getMyDailyPlan(localDateKey())` (already exists in `socialApi.js`,
  unmodified) alongside its other Today-tab data loads, stores it as `myTodayPlan`, and passes
  it into `TodayScreen`.
- Re-fetched after a successful save from the new modal, same refresh pattern already used
  elsewhere in `App.jsx` after a plan write.

## 4. Architecture

| File | Responsibility |
|---|---|
| `src/App.jsx` | *modify* — Today-tab header block (§3.1); add `myTodayPlan` state + fetch/refresh (§3.6); pass new props into `TodayScreen` |
| `src/components/TodayScreen.jsx` | *modify* — segmented sub-tab pill styling; swap hero render for `BestBetCard`; swap resort-list render for `ResortListRow` + expanded `ResortCard` body; wire "Ski here today" → `PlanEditorModal` |
| `src/components/BestBetCard.jsx` | *new* — §3.2 |
| `src/components/ResortListRow.jsx` | *new* — §3.4 |
| `src/components/PlanEditorModal.jsx` | *unmodified* — reused as-is (Decision 7) |
| `src/lib/socialApi.js` | *unmodified* — `getMyDailyPlan` already exists |
| `src/lib/planUpsert.js` | *unmodified* — `buildPlanUpsert` already exists |

No migration. No new dependencies. No change to any RLS policy or write path.

## 5. Constraints inherited from the repo

- No new npm dependencies.
- Inline `style={{}}` objects only, colors via `var(--color-*)`/`var(--rating-*)` tokens —
  never a hex value concatenated with an alpha suffix (the exact hazard `Badge.jsx`'s
  `TIER_COLORS` hit under theming).
- Date keys via `localDateKey()`, never `toISOString()`.
- `npm test` = 130 passing (`node --test` over `src/lib` only — no component harness exists
  yet, TASK 1.1-T). This change is presentation-layer plus one new data fetch; nothing here is
  independently unit-testable beyond what `buildPlanUpsert`/`getMyDailyPlan` already cover, so
  verification is manual/browser (see §7).
- `npx eslint .` baseline is 87 problems (79 errors, 8 warnings) as of 2026-08-27 — diff against
  it, don't fix it incidentally, don't let this change raise it (watch for the unused
  `topEpic`/`topIkon` props from Decision 5).
- `upsertDailyPlan` writes the whole row; any path that saves a plan must carry `status`,
  `arrived_at` and `note` forward via `buildPlanUpsert`, never a hand-built partial object —
  this is why Decision 4 goes through `PlanEditorModal`'s existing save path rather than a new
  one.

## 6. Out of scope

- **The Map sub-view's visual redesign** (glowing gradient score bubbles, friend-avatar pins,
  bottom "TOP OF THE LIST" sheet) — separate follow-up slice of TASK 22.0, not this spec. Only
  the segmented `List | Map` control and shared header (§3.1) are built now, since both
  sub-views need them.
- **Plans / Crew / Profile page mockup fidelity** — later slices of TASK 22.0.
- **TASK 22.1-22.4** (friends-calendar flagship placement, Powder Score tuning, weather API
  quality, map friends-location test-and-fix) — sequenced after TASK 22.0 per Kyle's
  2026-08-27 re-prioritization, not touched here.
- **Krames Butte dev button, `AddToHomeScreenNudge`, `OffseasonBanner`** — unchanged.
- **Any RLS/migration work** — this touches only existing, already-permitted reads/writes.

## 7. Verification

No new pure logic beyond what `getMyDailyPlan`/`buildPlanUpsert` already cover, so this is a
browser-verification pass, both mobile (375px) and desktop widths:

1. Today tab, List sub-view: header shows `❄️ PowderDays` + bell (badge count matches actual
   unread notifications) on row one, `Today` / date+condition on row two, `List | Map` as one
   segmented pill.
2. `BestBetCard` renders the actual top resort with a live score, and no crown card or
   Best-Epic/Best-Ikon boxes remain.
3. `Who's going` on the hero opens the same friend-list popover `FriendsGoingBadge` already
   shows elsewhere; count matches `friendTripsByResort` for that resort.
4. Resort list below the hero renders as compact rows; tapping one expands it in place to the
   full `ResortCard` content, tapping again collapses it.
5. Expanded card's "who's skiing here" section matches the friends-going data already shown
   today (i.e., unchanged data, just repositioned).
6. With no plan today: "Ski here today" reads that label, opens `PlanEditorModal` pre-filled
   with this resort and today's date (date not editable), saving creates a plan and the button
   updates to `✓ You're skiing here` without a full page reload.
7. With a plan at a *different* resort today: the button on a different resort's card reads
   `Switch to here`; saving moves the plan and the original resort's card reverts to `Ski here
   today`.
8. With a plan at *this* resort already: button reads `✓ You're skiing here`; tapping opens the
   modal in edit mode with the existing ETA/visibility pre-filled, not a blank form.
9. Filter bar (pass filter, search, sort) still functions identically to today, just restyled.
10. `npx eslint .` does not exceed the 87-problem baseline; `npm test` still shows 130 passing.
