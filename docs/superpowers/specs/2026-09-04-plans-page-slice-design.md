# Plans Page — Mockup Fidelity Slice — Design Spec

**Date:** 2026-09-04
**Author:** Claude (brainstorming session with Kyle)
**Status:** Draft, pending Kyle's review
**Part of:** TASK 22.0 (mockup fidelity pass) — Today done, Crew tab done (all 5 sub-tabs),
this is the first of the two remaining pages (Plans → Profile)

## Context

TASK 22.0 is redesigning the app page-by-page to match new high-fidelity mockups at
`mockups/PowDays.app mockup design/`. Today and the whole Crew tab (Crews/Board/Leaderboard/
Feed/Friends) are shipped and live. This slice covers the Plans page
(`src/components/SkiPlansPage.jsx`), gap-audited against `Screen Shots/PowDays Reorg
Mockup-Plans Page.png` and the richer interactive prototype `PowDays Reorg Mockup.dc.html`
(the `isPlans` block).

This slice also bears on a currently-unscheduled backlog item, **TASK 22.1 — "Friends-calendar
as the flagship view"** (ROADMAP, Sprint 43-ish, never actually started). TASK 22.1 posed five
open design questions before any code could be written, including "week/month grid vs.
weekend-first framing" and "group by mountain instead of by person." The mockup answers most of
them directly (see Design Decisions below), so this slice effectively resolves TASK 22.1's
placement/framing/grouping questions as a side effect — ROADMAP should note TASK 22.1 as
subsumed/closed once this ships, not left dangling as a separate future task.

## Current-state findings

**The underlying data model already matches the mockup far more closely than any prior slice
started with.** `groupByDayAndMountain()` (`src/lib/calendarGrouping.js`) already reshapes
`daily_plans`/`ski_trips` rows into day → mountain → party groups, with `parties`/`solo`
sub-arrays per mountain. `DayPlanCard.jsx` already implements "I'm also going" (join a
mountain), "Ask to join" (request to join a specific party), and "✓ You're in" — the same three
actions the mockup's group cards show. This is much closer to a **restyle** than the Feed
slice's new-subsystem work.

**`SkiPlansPage.jsx` carries four widgets above the calendar that don't appear in the mockup at
all**, each traced to a duplicate elsewhere:

| Widget in `SkiPlansPage.jsx` | Redundant with |
|---|---|
| `UpcomingStrip` (horizontal scroll of next 3 trip cards) | The Trips sub-tab, one tap away — same data, same page. |
| `NextTripCard` (hero: pending invite Accept/Decline, or next trip, or "plan a trip" CTA) | Same reasoning — every one of its three states duplicates something the Trips sub-tab already shows. |
| `AvatarStatusRail` ("Active Crew" — today's live plan status: planning/driving/arrived) | `TodaysCrew.jsx`, already showing the identical live-status data (same status vocabulary: planning/driving/arrived/done) on the Today tab since TASK 22.5. |
| `PingCta` ("👋 Ping a friend to ski →") | **Not redundant — the one exception.** Confirmed in the Friends slice: this is the *only* trigger for `SkiPingComposer` anywhere in the app (Friends cut its own duplicate "Ping Crew" button for this exact reason). Stays, restyled only. |

**The calendar itself has a week-grid ↔ month-grid toggle** (`FriendsCalendar.jsx`'s
`viewMode` state, `WeekView`/`PlanCalendar`) that the mockup replaces entirely with a single
scrolling list of day-cards (no navigator, no grid, no `‹`/`›`/Today buttons visible anywhere in
the mockup). `WeekView.jsx`'s mobile rendering already has a "collapse empty days to one thin
line, expand days with plans" pattern and a `showPast`/`past` disclosure — both of these survive
into the new agenda-list layout essentially unchanged; what's being removed is `viewMode`
switching, the desktop 7-column grid, and `PlanCalendar`'s month grid.

**Trips sub-tab and `TripCard.jsx` need no changes.** The mockup's trip cards are a compact
gradient-header treatment; the live `TripCard.jsx` is a richer photo-hero card with RSVP chips,
avatar stack, chat, and host controls that already covers everything the mockup's card shows
plus real functionality the mockup doesn't. Shrinking it would be a pure downgrade with no
functional gain — out of scope here (Kyle's call).

**The mockup's group cards show a state this app's data model doesn't have.** Sample groups are
tagged `"mine"` / `"open"` (direct-join, no approval) / `"gated"` (locked, "Ask to join"). The
real model, established deliberately in migrations 037/038 and documented in memory, has only
one state for a group you're not in: always ask-and-the-owner-approves. There is no
direct-join-without-approval party type in the schema or RLS. Building one would be a genuine
new feature (a privacy flag on parties/crews, an RLS change) — the same shape of scope
explosion that forced Feed to split into A/B/C1/C2. **Kyle's call: treat the mockup's "open"
state as illustrative sample data, not a functional requirement — every group card for a group
the viewer isn't in shows locked "Ask to join," matching the real, already-shipped model.** No
migration, no RLS change, in this slice.

The mockup's group-name row also occasionally shows a small lock icon next to the crew's name
(independent of the join-button state) — no backing "is this crew private" field is surfaced in
the client today. Not worth adding for a name-row icon with no functional consequence; skipped.

## Design Decisions

1. **Calendar layout: day-agenda list, week/month toggle removed entirely.** Confirmed with
   Kyle. `FriendsCalendar.jsx` loses `viewMode`, `WeekView`'s desktop 7-column grid, and
   `PlanCalendar`'s month grid. One vertical list of day-cards, same on every screen size —
   matches the mockup, which shows no alternate layout.
   - Default range: a rolling **21-day forward window** from today (no existing spec value to
     match — this is a new default, not a mockup-stated number — flagging for Kyle's review of
     the written spec). Days with no plans collapse to one thin line, exactly like `WeekView`'s
     existing mobile empty-day treatment. Days with plans render the full day-card.
     - Directly answers TASK 22.1's "month grid vs. weekend-first framing" question in favor of
       the near-term agenda list; TASK 22.1 should be marked resolved/subsumed by this slice
       once shipped, not left open as a separate task.
   - No `‹`/`›`/Today navigator (mockup shows none). A **"Show past days"** disclosure at the
     top of the list (reusing `WeekView`'s existing `showPast` pattern, restyled to the mockup's
     dashed-border pill) reveals the recent past on demand — this is a straight rename/reposition
     of existing behavior, not new logic.
2. **Cut `UpcomingStrip`, `NextTripCard`, `AvatarStatusRail`.** Confirmed with Kyle — all three
   duplicate content one tap away and don't appear in the mockup. `PingCta` stays, restyled to
   sit under the page header the way the mockup's tone suggests (small text link, not a hero
   card), since it has no mockup equivalent to visually match.
3. **`TripCard.jsx`: no changes.** Confirmed with Kyle — richer than the mockup's card, no
   functional gain from shrinking it.
4. **Group cards: no "open" join state.** Confirmed with Kyle. Every group the viewer isn't
   already in renders locked, "Ask to join" — using the existing `requestToJoinParty` flow
   unchanged. "I'm also going" (joining the *mountain*, not a specific party — the existing,
   deliberately-named action) stays exactly as it works today.
5. **Header "+" button is context-sensitive by sub-tab**, reusing existing modals/handlers —
   no new components:
   - On **Ski days**: opens the existing "Add ski day" flow (`FriendsCalendar`'s
     `handleAddSkiDay` + date-pickable `PlanEditorModal`), same as today's page-level
     "+ Add ski day" button — just relocated into the header per the mockup's circular "+".
   - On **Trips**: opens `CreateTripModal`, same as today's "+ New Trip" button.
   - This replaces the current single always-visible "+ New Trip" header button with one that
     means the right thing for whichever sub-tab is active.
6. **Each day-card also gets its own small "+"** (mockup: a 26×26 square icon button in the
   day-card's header row), opening the same `PlanEditorModal` pre-seeded with that day's date —
   the non-pickable-date path that already exists (`editorDate` set directly, `onDateChange`
   left `undefined`). This is a faster path to the same flow `handleAddSkiDay` reaches, not new
   logic.
7. **Sub-tab selector restyle.** "Ski days" / "Trips" as a full-width two-segment pill with a
   filled/gradient active state, replacing the current small `fit-content` pill row — matches
   the mockup and the segmented-control treatment already established elsewhere in the app
   (e.g. Leaderboard's category tabs).
8. **Group-card restructuring: one card per mountain heading + one card per PARTY beneath it**,
   not today's single card per mountain with parties nested inside. Per mountain: a heading row
   (`resortName` + "`N` going" pill, matching the mockup's `{{ m.going }} going` badge) followed
   by one bordered card per party (avatars scoped to that party, not the whole mountain — a
   visible change from today, where `DayPlanCard`'s avatar row shows every attendee at the
   mountain regardless of party). Each party card gets a **left accent bar** colored via the
   existing `ringColorFor(ownerId, colorCtx)` (no new color logic — reuses the crew-color system
   `crewColors.js` already provides) to match the mockup's colored-left-bar treatment.
   Solo attendees (no party) keep their existing "N not in a group" footnote treatment rather
   than becoming their own card — the mockup's sample data has no solo attendees to confirm
   against, and inventing a new "ungrouped" card shape isn't warranted by anything in the
   mockup.
9. **Empty states** (`nobodyToShow`/`nothingSelected`/`nobodyPlanned` in `FriendsCalendar.jsx`)
   keep their current three conditions and copy, restyled only to sit inside the new agenda-list
   container instead of a week/month grid.

## Non-goals

- No changes to `TripCard.jsx`, `CreateTripModal.jsx`, `TripDetailModal.jsx`, or the Trips
  sub-tab's list rendering beyond the shared header/sub-tab-selector restyle.
- No new "open party" / direct-join feature, no migration, no RLS change.
- No filter-chip (`FilterChipRow`/`CalendarFilterSheet`) redesign — the mockup doesn't show
  crew/friend filtering at all; existing filter chips stay as-is, unstyled changes only insofar
  as they sit above the new agenda list instead of the old grid.
- Not resolving TASK 22.1's other open questions (nudge-to-join-a-friend's-day beyond the
  existing "Ask to join," richer empty-state copy) beyond what's listed above — those remain
  backlog if Kyle wants to revisit them later.

## Testing

`groupByDayAndMountain`, `ringColorFor`, and the date-range helpers in `calendarDates.js` are
pure functions in `src/lib` and already have `node --test` coverage; any new pure logic (e.g. a
21-day range helper, if one is needed beyond `weekBounds`/`monthBounds`) gets the same
treatment. Component-level rendering changes (day-card restructuring, header "+" context
switch) are not covered by the test harness (no DOM runner) — same known gap as every prior
TASK 22.0 slice; flagged for Kyle's click-through same as the others.
