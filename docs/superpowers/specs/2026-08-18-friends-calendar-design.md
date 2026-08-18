# Design — The Friends Calendar (Sprint 35)

**Date:** 2026-08-18
**Status:** Approved for planning
**Source material:** `mockups/Calendar Month View.png`, `mockups/Calendar Weekly View.png`
**Supersedes:** sections 2 and 3 of `docs/superpowers/plans/2026-08-18-sprint-35-social-tab-and-calendar.md`,
which were carried-over context marked NEEDS BRAINSTORMING. Task 1 of that plan
(FriendsPage load resilience) is unchanged and is a prerequisite here.

---

## 1. The problem

Kyle's friends make ski plans by comparing notes: *"three of us are going to Copper
Saturday, only one person is going to Vail, so we go to Copper."* Today the app can
technically answer that — Sprint 34 shipped per-person plan calendars and crew scope
chips — but the answer is assembled one profile at a time. There is no view that
answers **"where is everyone going this weekend"** in a single glance.

This feature is a decision tool, not a record-keeping tool. Every design choice below
resolves toward the question *which mountain wins*.

## 2. What the mockups say, and where they don't translate

The mockups are annotated Google Calendar screenshots. Three things in them do not
survive contact with this app, and the design departs from them deliberately:

1. **Google Calendar is a two-pane desktop app; Powdays is mobile-first** (bottom nav,
   `useMobile`). The always-visible left sidebar of calendar checkboxes — annotated
   "My Crews" — has nowhere to live on a phone. Replaced by a chip row plus a sheet
   (§4.5).
2. **The week mockup's hour grid carries no information.** The annotated blocks sit at
   ~9:30 (Vail), ~9:00 (Aspen) and ~10:30 (Breckenridge) — arbitrary positions.
   `daily_plans` stores a date, a `resort_key` and an *optional* `eta`; most rows have
   no ETA at all. An hour axis would spend ~90% of the viewport on empty rows to render
   three blocks. Replaced by day columns with no time axis (§4.2).
3. **The two mockups disagree on grouping.** The week mockup groups by mountain
   ("Vail → Rafe, Suzanne"). The month mockup's note says "names and mountain will pop
   up", which is per-person. **Mountain-as-headline wins everywhere** — it is the
   grouping that answers the question, and Kyle confirmed it.

What the mockups get exactly right, and what the design keeps: the mountain is the
headline, the skiers' names stack underneath it, and a toggleable list of crews and
friends controls what appears.

## 3. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **The Plans tab becomes the calendar.** | Plans already owns "where is everyone going" — it fetches visible plans and already has crew scope chips. No sixth bottom-nav slot; no "Plans vs Calendar" ambiguity. |
| 2 | **Mountain is the headline, skiers stack under it.** | "6 people at Copper Saturday" is the answer users want. Per-person rows make them do the grouping themselves. |
| 3 | **Week view: 7 columns on desktop, stacked day rows on mobile.** | A 7-column phone layout gives each day ~50px — mountain names truncate and skier names don't fit at all. `useMobile` already exists for this. |
| 4 | **Month cell: text chips on desktop, dots + headcount on mobile.** | Desktop cells (~140px) fit `Copper 3`. Phone cells (~45px) fit a dot row and a number. Tapping any day opens the full mountain cards below the grid. |
| 5 | **Filter: persistent chip row + a Filter sheet for individuals.** | Chips cover the everyday case in one tap (Me / All Friends / each crew). The sheet is the mockup's sidebar, rendered as a bottom sheet on mobile and a popover on desktop, and it scales past ~5 friends where a chip row would become a wall. |
| 6 | **Color encodes crew.** | Kyle's call, matching the mockup's per-calendar colors: toggling a crew becomes visually obvious and the chips share a legend with the entries. Trade-off accepted: color no longer distinguishes mountains (see #7). |
| 7 | **The color rides the person, not the mountain card.** | A mountain can hold skiers from two crews, so a card cannot take one color without an arbitrary tie-break. Avatar rings are unambiguous. Mountain cards use neutral theme surface. |
| 8 | **"I'm in" writes your own plan from the card.** | Closes the loop: see three friends at Copper, tap once, you are on the list. Read-only would cost four taps and a tab change to act on what you just read. |
| 9 | **Default view is Week, anchored on the current week.** | Week is the decision tool; month is the planning tool. |
| 10 | **Trips fold into the mountain cards as a badge.** | Discovered while mapping files: the Plans tab's existing calendar renders trips as well as plans, so a plans-only replacement would be a regression. A trip already carries `resort_key` + `ski_date` — the same shape as a plan — so it groups into the same card rather than sitting beside it. |

## 4. The design

### 4.1 Shell

The Plans tab **already has** `🎿 Trips | 📅 Calendar` sub-tabs (`SkiPlansPage.jsx`
`SUB_TABS`, ~line 300), defaulting to Trips. Two changes, not a restructure:

1. The default sub-tab flips to **Calendar**.
2. The Calendar sub-tab's body — today the inline `CalendarView` function at
   `SkiPlansPage.jsx:97-165` — is replaced by `FriendsCalendar`.

Header controls inside the Calendar sub-tab:

```
+--------------------------------------------------+
|  [Today]  <  Aug 2026  >           [Week][Month] |
|  [Me] [All Friends] [Powder Hounds] [= Filter]   |
+--------------------------------------------------+
```

Everything else on the Plans tab — the create-trip CTA, the active crew rail, the
trips list on the Trips sub-tab — is untouched.

### 4.2 Week view

**Desktop** — seven day columns, each holding a stack of mountain cards, weekend
columns subtly emphasized (the emphasis `PlanCalendar` already applies).

```
 SUN 16   MON 17   TUE 18   WED 19   THU 20   FRI 21   SAT 22
                   +------+                   +-------+ +--------+
                   | Vail |                   | Aspen | | Breck  |
                   | Rafe |                   | Kyle  | | Nate   |
                   | Suz. |                   | Gaby  | | Dannie |
                   +------+                   | Kramer| +--------+
                                              +-------+
```

**Mobile** — full-width day rows. Days with plans render in full; empty days collapse
to a single thin "— no plans —" line, so the weekend is not pushed below the fold by
four empty weekdays.

### 4.3 Month view

Rendered by the existing `PlanCalendar` with a `renderCellContent` prop (§5.1) — not a
second grid.

**Desktop** — stacked text chips per cell, closest to the mockup:

```
+-----------------+
| 21              |
| [# Aspen     3] |
| [# Vail      1] |
+-----------------+
```

**Mobile** — one dot per **crew** present that day (matching the chip legend, per
decision #6) plus the day's total headcount:

```
+------+
|  21  |
|  oo  |   <- two crews out that day
|  4   |   <- four people total
+------+
```

Tapping any day renders that day's mountain cards (§4.4) in the panel below the grid —
this is the mockup's "names and mountain will pop up". Cells with more than two chips
truncate to a `+N more` line, as Google's does.

### 4.4 The mountain card

The atom of the whole feature. Identical in week view, in the month view's day panel,
and in the mobile day rows.

```
+---------------------------------------+
| Copper Mountain               6 going |
| [ TRIP ] Powder Day                   |
| (o)(o)(o)(o)(o)(o)                    |
| Nate, Rafe, Gaby, +3                  |
|                             [ I'm in ]|
+---------------------------------------+
```

- Neutral theme surface — never a crew color (decision #7).
- **Trips fold in** (decision #10). A trip at the same resort on the same day merges
  into that mountain's card, shown as a `TRIP` badge with its title; its going/invited
  RSVPs count toward the headcount. Tapping the badge opens the existing
  `TripDetailModal`, exactly as the current calendar's trip entries do. A mountain with
  no trip simply has no badge.
- Names truncate to the first three plus `+N`, avatars to six.
- Each avatar carries a **ring** in its owner's crew color.
- Tapping a name or avatar opens the existing `UserProfileModal`. Sprint 34's
  `lib/profileNav.js` context already makes this available without prop-drilling.
- `[ I'm in ]` is hidden on the card if you are already on it, and hidden on past dates.
- Within a day, cards sort by headcount descending: **the mountain that won goes on
  top.** This is the single most important sort in the feature.

### 4.5 Filter

**Chip row** — always visible, scrolls horizontally, never wraps: `Me`, `All Friends`,
then one chip per crew tinted its crew color, then `Filter`.

**Filter sheet** — bottom sheet on mobile, popover on desktop. The mockup's sidebar:

```
+---------------------------------+
| SHOW ON CALENDAR            [x] |
| [x] Me                          |
| ------------- CREWS ----------- |
| [x] Powder Hounds           (5) |
| [ ] Saturday Crew           (3) |
| ----------- FRIENDS ----------- |
| [x] Rafe                        |
| [x] Suzanne                     |
| [ ] Nate                        |
+---------------------------------+
```

Filter state is a `Set` of `"me" | "friends" | "crew:<id>" | "friend:<id>"` — the shape
`SkiPlansPage` already uses, extended with `friend:<id>`.

**This replaces `SkiPlansPage`'s existing scope chips.** Two filter systems on one tab
would be worse than either one. Mechanically: the old chip row and its local `scopes`
state (`SkiPlansPage.jsx`, ~line 188) are deleted; the new state lives in
`FriendsCalendar` and is passed down; the trips list below keeps calling the existing
`inScope()` helper, fed from the new state. One control drives the whole tab. Roughly
30 lines net removed from `SkiPlansPage`.

### 4.6 Color

Six crew slots map to CSS custom properties that already exist and are already
redefined per `[data-theme]` in `src/index.css`:

```
--color-accent, --color-accent-2, --color-accent-soft,
--color-accent-strong, --color-accent-teal, --color-accent-deep
```

Crews take slots by their index in `getMyCrews()` order, wrapping past six. **No JS
color math and no `getComputedStyle`** — the values are emitted as `var(--color-…)`
strings into inline styles, so all five themes reskin the calendar for free, including
any theme added later.

Resolution rules, in order:

1. The signed-in user → `--color-accent`.
2. A person in exactly one selected crew → that crew's slot.
3. A person in two or more selected crews → the first in filter-chip order. Their day-panel
   entry lists every crew badge, so the other memberships are not lost, only the ring.
4. A person visible via `All Friends` but in no selected crew → neutral `--color-text-3`.

A legend renders only the crews currently in view.

### 4.7 States

| State | Treatment |
|---|---|
| No accepted friends | "Add friends to see where they're skiing" + link to the Social tab. |
| Friends, but nothing planned in range | "Nobody's planned a day this week" + `[+ Plan a day]`. Someone has to go first or the feature never starts. |
| A block failed to load | Inline notice with Retry, per Task 1's pattern. Raw error to `console.error`, never a toast. |
| Past dates | Rendered normally, `[ I'm in ]` suppressed. |

## 5. Architecture

### 5.1 New and changed files

| File | Responsibility | Depends on |
|---|---|---|
| `lib/calendarGrouping.js` *(new, pure)* | `plans[]` + `trips[]` → `Map<dateKey, MountainGroup[]>`, each group sorted by headcount desc, trips merged into the matching resort group | nothing |
| `lib/crewColors.js` *(new, pure)* | crew id → theme token; person → ring color, per §4.6 rules | nothing |
| `lib/calendarDates.js` *(extend)* | add `weekBounds(d)` beside the existing `monthBounds(d)` | nothing |
| `components/calendar/DayPlanCard.jsx` *(new)* | one mountain: name, headcount, avatar rings, "I'm in" | `crewColors`, `profileNav` |
| `components/calendar/WeekView.jsx` *(new)* | responsive 7-column / stacked-row week | `DayPlanCard`, `useMobile` |
| `components/calendar/CalendarFilterSheet.jsx` *(new)* | the checkbox list of §4.5 | `crewColors` |
| `components/FriendsCalendar.jsx` *(new)* | orchestrator: view mode, anchor date, filter state, fetching | all of the above |
| `components/PlanCalendar.jsx` *(extend)* | **one new optional prop**, `renderCellContent` | — |
| `components/SkiPlansPage.jsx` *(modify)* | mount `FriendsCalendar`; delete local scope chips | `FriendsCalendar` |
| `lib/socialApi.js` *(modify)* | `getCrewMembers` status filter; field-preserving join helper | — |

`PlanCalendar` is **extended, not forked.** It already takes `entriesByDate`,
`dotColorFor`, `renderDayDetail` and a caller-rendered selected-day panel; the only
thing it cannot do is render content inside a cell. Adding an optional
`renderCellContent` prop covers the month view's desktop chips while Profile → Ski
Plans keeps passing nothing and keeps its existing dots. Forking it would leave two
month grids to keep in sync — the exact class of bug that made Sprint 34 mostly repair
work.

### 5.2 Data

**Zero new SQL for reads.** `getVisiblePlansInRange(start, end)` already returns
`daily_plans` joined to the profile columns this view needs, and Sprint 34's migration
032 RLS already scopes rows to friends and active crewmates. The filter is a display
lens over rows the server already authorized — it must never be the only thing
protecting visibility.

Fetches per view change (month nav, week nav, view toggle):

- plans for the visible range — `getVisiblePlansInRange(weekBounds | monthBounds)`
- `getAcceptedFriends()` — required to gate the `All Friends` chip. Sprint 34 review
  finding #2: without it, any non-self row matched, leaking non-friend crewmates.
- `getMyCrews()` + `getCrewMembers(id)` per crew — for chips, colors and membership.
- `getAllVisibleTrips()` — for the trip badges (decision #10). Already called by
  `SkiPlansPage`; the result is lifted and passed down rather than fetched twice.

Crew membership is cached across date navigation; only the plan range refetches.

**One targeted fix, in scope.** `getCrewMembers()` neither selects nor filters
`crew_members.status`, so it returns **pending** invitees (ROADMAP TASK 18.2). Harmless
under Sprint 34 (RLS still refuses their rows), but with crew colors it becomes visible:
an invitee who never accepted would be colored into your crew and counted in the chip's
member count. Add `.eq("status", "active")` and select the column.

### 5.3 The "I'm in" write path

`upsertDailyPlan` writes the **whole row** with `onConflict: "user_id,ski_date"`, so
every field omitted from the payload is written as `null`. Joining a mountain must
therefore merge with your existing plan for that date, or it silently wipes your `eta`,
`note`, `status` and `arrived_at` — the identical trap `SkiPlansTab.jsx` documents at
line ~111.

Sequence: read your current plan for that date (from the already-loaded range rows, or
`getMyDailyPlan(date)`), spread it, override `resort_key`, write. `daily_plans` is
unique on `(user_id, ski_date)`, so "joining" is exactly "set my mountain for that day"
— no new table, no RSVP concept, no second write path.

Optimistic update on the card, rolled back on failure, matching `SkiPlansTab`'s existing
`previous = plans` pattern.

### 5.4 Load resilience

`FriendsCalendar` uses the loader-registry / `Promise.allSettled` pattern specified in
Sprint 35 Task 1, not `Promise.all`. A failed crew fetch must not blank the calendar,
and a failed block must still be **visibly** failed — the 2026-08-18 stale-bundle 403
was diagnosable in minutes precisely because it failed loudly. **This is why Task 1
lands first in the sprint.**

## 6. Constraints inherited from the repo

- No new npm dependencies.
- Inline `style={{}}` objects only — no CSS modules, no Tailwind.
- Colors via `var(--color-*)` tokens, except where a value feeds a hex-alpha template
  literal (`` `${c}22` ``), which must stay a literal hex.
- `profiles` queries use explicit column lists. Never `select("*")` on `profiles` —
  migration 031 revoked table-level SELECT. See `PROFILE_SELECT_COLUMNS` in
  `lib/socialApi.js`.
- Date keys are always built from local date parts, never `toISOString()`. Sprint 34
  review finding #3 was exactly this bug: after ~5pm MT, UTC advances to tomorrow.
  `weekBounds()` must follow `monthBounds()`'s local-parts construction.
- `npm run lint` baseline is 91 problems as of `2fe6613`. Diff against that, don't
  compare to zero.

## 7. Explicitly out of scope

Cut to keep the sprint shippable; none of these are rejected ideas, only deferred:

- Drag-to-reschedule a plan.
- Recurring plans ("every Saturday").
- A persistent desktop sidebar (the popover covers it).
- "Make it a trip" from a mountain card — a second write path and a decision on every
  card.
- **Push notification when a friend joins your mountain.** The most tempting item here
  and the most likely to need its own sprint; it touches the notification pipeline,
  not the calendar.

## 8. Verification

This repo has no test framework, so the pure lib functions are exercised through the UI
and the feature is verified in a real browser against the live database — the standard
this project has used since Sprint 33.

1. Two accounts, one crew containing one of them, plus a friend outside that crew.
2. Two different mountains planned on the same day → both cards render, sorted by
   headcount, the busier mountain on top.
2b. A trip at a resort where someone also has a plan → **one** card with a TRIP badge,
   not two cards. Tapping the badge opens `TripDetailModal`.
3. Week ↔ month toggle preserves the anchor date; `Today` returns to the current week.
4. Month navigation works (Sprint 34 review finding #1: a `loading` early-return that
   unmounts the calendar resets its internal `viewDate` — use the `hasLoaded` gate).
5. Each filter chip and each sheet checkbox changes what renders; unchecking everything
   yields the empty state, not a crash.
6. A person in two selected crews gets exactly one ring, and reordering the chips
   changes which.
7. **"I'm in" on a date where you already have a plan with an ETA preserves the ETA.**
   The single highest-risk assertion in this list.
8. Switching profile theme reskins every crew color, checked in at least two themes.
9. Force a block failure (temporarily throw in one loader) → that block shows a Retry
   notice, the rest of the calendar still renders, and the raw error is in the console.
10. Verify at mobile width and desktop width; the page body never scrolls horizontally.

## 9. Suggested task order

Sequencing matters in two places: Task 1 before everything (failure behavior must be
predictable first), and the pure libs before the components that consume them.

1. Sprint 35 Task 1 — `FriendsPage` load resilience *(already specified, carried over)*
2. `lib/calendarDates.js` `weekBounds()` + `lib/calendarGrouping.js` + `lib/crewColors.js`
3. `getCrewMembers()` status filter (ROADMAP 18.2)
4. `DayPlanCard.jsx`
5. `WeekView.jsx`
6. `PlanCalendar.jsx` `renderCellContent` prop + month view wiring
7. `CalendarFilterSheet.jsx` + chip row
8. `FriendsCalendar.jsx` orchestrator
9. Mount in `SkiPlansPage`: replace the inline `CalendarView`, flip the default
   sub-tab to Calendar, delete the old scope chips, rewire `inScope()`
10. "I'm in" write path with field-preserving merge
