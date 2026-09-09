# Profile Page — Mockup Fidelity Slice — Design Spec

**Date:** 2026-09-08
**Author:** Claude (brainstorming session with Kyle)
**Status:** Draft, pending Kyle's review
**Part of:** TASK 22.0 (mockup fidelity pass) — Today done, Crew tab done (all 5 sub-tabs),
Plans page done. This is the last remaining page.

## Context

TASK 22.0 is redesigning the app page-by-page to match new high-fidelity mockups at
`mockups/PowDays.app mockup design/`. Today, the whole Crew tab, and Plans are shipped and
live. This slice covers `src/components/ProfilePage.jsx`, gap-audited against `Screen Shots/
PowDays Reorg Mockup-Profile Page.png` and the richer interactive prototype `PowDays Reorg
Mockup.dc.html` (the `isMe` block, lines ~440-486 and its supporting script, lines ~703-716).

## Current-state findings

**This is the biggest gap of any TASK 22.0 slice — the mockup isn't a restyle target here, it
implies real cuts and real de-duplication, not just visual polish.** The live `ProfilePage.jsx`
(912 lines) carries a lot of functionality the mockup's Profile screen simply doesn't depict:
a Ski Plans sub-tab, Trips/Friends counts in the header, a Season/All-Time stats toggle feeding
a rich `SeasonStatsCard`, a List/Calendar history toggle, Season Passes and Vehicle cards, a
"Your Crew" friends strip, and a Connected Apps (Strava) card — against a mockup that shows only
a hero, one 5-stat strip, a season-grid heatmap, a theme picker, and a bare settings list.

**One genuine "restyle, not rebuild" find, matching the Plans slice's pattern of the data model
already being closer than expected:** the mockup's "Season grid" heatmap is not new functionality
— it's `SeasonCalendar.jsx`, which already renders a day-by-day grid of the season colored by
`is_powder_day`/session-present, with tap-to-see-session-detail. It's just currently nested under
History's "Calendar" toggle further down the page, in a horizontal-scroll-by-week layout instead
of the mockup's fixed-column grid, and with only 2 colors instead of a graduated "Less→More"
legend.

**One genuine "mockup implies a feature with no backing at all," matching the Plans slice's
declined open-party feature:** the mockup's Settings list includes a "Privacy & visibility" row.
Grepping the schema and codebase found **zero** account-wide privacy/visibility concept anywhere
— the only visibility field that exists is per-plan (`daily_plans.visibility = 'friends'|
'private'`, set per ski day in the Plan editor, established in migration 037). Building an
account-wide version would mean designing a new privacy model from scratch (what's private, at
what granularity — the whole profile? just stats? search visibility?) before any code could be
written. **Kyle's call: defer it — the row still appears in the Settings list matching the
mockup, but shows "Coming soon" on tap. Backlog a real design pass for this separately; don't
build it as part of a fidelity restyle.**

## Design Decisions

### Hero
1. Avatar + photo-upload flow (camera badge, upload/remove menu) — **unchanged**.
2. Name + sport emoji — **unchanged**.
3. Favorite mountain + skill level combine into one line, matching the mockup exactly:
   `🏔 {favorite_mountain} · {Skill Label}` — replaces the current two separate elements (a
   colored mountain line, then a separate pill-badge skill chip below it).
4. Username (`@handle`), when present, stays as-is below the name — not shown in the mockup, but
   real data with no other place it's visible; same "keep, restyle only" reasoning as Season
   Passes/Vehicle below.
5. "Edit profile" becomes a small pill button (matching the mockup), not the current full-width
   button.
6. **Sign-out icon removed from the hero's top-right corner** — relocates into the new Account
   settings sheet (see Settings list below).
7. **"Share Season" button removed from the hero** — the mockup shows one Share entry point
   ("Create share card"), which lives below the Season grid instead (see below). Its existing
   `seasonStats?.days > 0` gate moves with it.

### Stat/grid stack (replaces the header's Trips/Friends/Days row AND `SeasonStatsCard`)

Both the old header row and `SeasonStatsCard`'s 2×2 grid show the same 4 numbers
(Days/Vertical/Resorts/Powder Days) — showing both plus the mockup's new 5-stat strip would be
triply redundant. Consolidated into one stack, top to bottom:

1. **Header stat strip**: Days / Vert ft / Miles / Resorts / Powder — replaces both the old
   Trips/Friends/Days header row (Trips and Friends counts are cut; they were navigation
   shortcuts into Plans/Crew, both one tap away in the bottom nav already) and `SeasonStatsCard`'s
   redundant 2×2 grid.
2. **Extra-facts strip**: Total Runs / Top Speed / Time on Mountain / Top Resort, plus the
   season-over-season delta line (e.g. "↑ 3 more days than last season") — the non-duplicate
   facts `SeasonStatsCard` used to carry, preserved so none of that real data is lost, just
   de-duplicated and restyled into a compact strip instead of a big card.
3. **Season/All-Time toggle** (existing `StatsViewToggle`, unchanged logic) — now controls the
   header strip, the extra-facts strip, and the Season grid together as one unit. *Flagging for
   the plan*: the Season grid currently renders one season's worth of days; an All-Time view
   needs either a wider/paginated grid or a documented decision to leave the grid pinned to the
   current season regardless of toggle state — implementation detail to resolve while planning,
   not a brainstorming blocker.
4. **Season grid**: `SeasonCalendar.jsx` restyled into the mockup's fixed-column grid layout
   (not horizontal-scroll-by-week). Cell color intensity now graded by that day's `vertical_feet`
   (a light day = faint tint, a big day = strong blue), with any `is_powder_day` always rendering
   the distinct top-tier teal regardless of vertical — real, already-tracked data, no new schema.
   "Less→More" legend below the grid, matching the mockup. Tap-a-day-to-see-session-summary
   behavior is unchanged.
   - **This becomes the only calendar/grid view on the page.** History's "Calendar" toggle
     (`HistoryViewToggle`) is removed — History keeps only its List view (`RecentSessionsFeed`),
     since the Season grid above now covers what the Calendar toggle used to show. No more
     showing two near-duplicate day-grids on one screen.
5. Full-width **"📤 Create share card"** button — opens `ShareStatCard`, same component/data as
   today's "Share Season" button, just relocated here as the one Share entry point.

### History section
- List only (`RecentSessionsFeed`), no toggle. Per-session edit (photos/tags/stats) and
  per-session share are **unchanged** — this is real, working functionality with no duplicate
  anywhere else in the app (confirmed in brainstorming), so it's restyled to match spacing/tokens
  but not cut or gated behind a disclosure.

### Cut entirely (own profile)
- **Ski Plans sub-tab** (`profileTab` toggle, `SkiPlansTab` usage) — duplicate of the Plans nav
  tab's own day-agenda content, same "cut duplicate widgets" reasoning as `UpcomingStrip`/
  `NextTripCard`/`AvatarStatusRail` in the Plans slice and the Weekend Planner strip in the
  Friends slice.
- **Trips/Friends header counts** — see stat-strip consolidation above.
- **"Your Crew" friends strip** (avatar row + "See All → Crew tab") — pure preview/shortcut into
  the Crew tab's own Friends list, no unique data.

### Kept, restyled only
- Season Passes card, Vehicle card — not shown in the mockup, but real user-entered data with no
  other place in the app it's visible; restyled to match the new page's card language, not cut.
- Theme picker — already close to the mockup's look (label + swatches); minor spacing/sizing
  polish only.
- Edit Profile modal — unchanged **except** it drops the Powder Alerts fields (toggle + phone
  number), which move into the new Notifications settings sheet below — no duplicated fields
  across two places.
- Milestone modal — unchanged.

### New Settings list (owner-only, matches the mockup's 5-row list exactly)
1. **Account** → opens a small sheet showing the signed-in email address plus the Sign Out
   button (the same handler currently wired to the hero's top-right icon, just relocated).
2. **Notifications** → opens a sheet with the relocated Powder Alerts toggle (weekly forecast
   email) and phone number field — same `upsertMyProfile` fields (`powder_alerts_enabled`,
   `alert_phone`), same save path, just moved out of Edit Profile into its own screen.
3. **Privacy & visibility** → row renders in the list (matching the mockup), tapping it shows a
   "Coming soon" toast/sheet. **No new schema, no new logic this slice** — see Current-state
   findings above for why.
4. **Connected apps** → opens a sheet wrapping the existing `StravaConnect` component, unchanged
   internally — just moved from an always-visible page card into a tap-to-open destination.
5. **Help & feedback** → opens a static sheet with placeholder content (a couple of brief
   FAQ-style lines plus a placeholder support contact, e.g. `support@powdays.app`) — **Kyle: the
   support email above is a placeholder, correct it if there's a real one before this goes into
   the implementation plan.**

### Friend-view profile (`isOwnProfile = false`)
- Header stat strip + extra-facts strip **shown** — both buildable entirely from the aggregate
  leaderboard row already fetched for friend view (`getLeaderboard()` returns
  `days/verticalFt/milesSki/powderDays/resorts/topResort/totalRuns/topSpeed/timeOnMountain` per
  person already).
- **Season grid NOT shown for friend view.** It needs per-day session rows, which are never
  fetched for a friend's profile today (only the aggregate leaderboard row is) — fetching a
  friend's individual sessions would be new scope (a new query, confirming RLS allows it) rather
  than a restyle, so it's out of scope this slice.
- **Ski Plans sub-tab is kept, but ONLY for friend view** — it's the only place in the app that
  shows one specific friend's upcoming plans, filtered to just them (own-profile's copy of the
  same tab is the pure duplicate being cut, not this one).
- No Settings list, no Sign Out, no Theme picker, no Season Passes/Vehicle-editing (all
  owner-only, unchanged from today).
- Existing friends-only gating (`notFriends`/`statsError` states) — unchanged.

## Non-goals

- No new account-wide privacy/visibility feature or schema change (backlogged separately).
- No new query/RLS work to show a friend's Season grid.
- No changes to `ShareStatCard.jsx`, `StravaConnect.jsx`, `SessionEditForm.jsx`, or
  `SkiPlansTab.jsx` internals — all reused as-is, just relocated/re-triggered from new entry
  points.
- No changes to the milestone system's logic (`MILESTONES`, `getShownMilestones`,
  `markMilestonesShown`).

## Testing

`computeStats` (`src/lib/profileStats.js`) and any new pure logic (e.g. a vertical-feet-to-tier
helper for the Season grid's color grading) get `node --test` coverage, matching the existing
pattern. Component-level rendering changes (settings sheets, stat-stack consolidation, grid
restyle) are not covered by the test harness (no DOM runner) — same known gap as every prior
TASK 22.0 slice; flagged for Kyle's click-through same as the others, including both the
own-profile and a friend-profile view.
