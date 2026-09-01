# Today tab: Friends section (design)

**Date:** 2026-08-31
**Status:** Approved

## Problem

The Today tab (the app's default landing tab) currently shows resort conditions only (List/Map toggle). Kyle wants friends' activity — what's on the friends feed, plus live status when a friend plans a mountain, starts driving, or arrives at a resort — surfaced on Today once the user scrolls down, so this information doesn't require a tab switch.

## Existing building blocks

Two components already provide this content, just mounted elsewhere:

- **`TodaysCrew`** (`src/components/TodaysCrew.jsx`) — currently mounted on the **Track** tab (`TrackScreen.jsx:166`). Shows live status per friend for *today only*: Planning / Driving / On mountain / Done, sourced from `getTodaysVisiblePlans`. Includes the signed-in user's own "Driving" and "Arrived" action buttons, which write through `markDriving`/`markArrival`. Handles its own loading/empty/signed-out states.
- **`ActivityFeed`** (`src/components/ActivityFeed.jsx`) — currently mounted as the **Crew tab's "Feed" sub-tab** (`MessagingCenter.jsx:199`). Shows auto-generated activity — `ski_session`, `trip_rsvp`, `trip_created` — with emoji reactions, sourced from `getActivityFeed(30)`. Handles its own loading/empty states; has no built-in section heading (relies on the Crew tab's own "Feed" tab label for context).

Both are self-contained: each owns its data fetch (`useEffect` on mount), its own loading/empty/error UI, and takes no props from a parent screen today.

## Design

Compose both components, unchanged, into a new "Friends" section at the bottom of `TodayScreen.jsx`. This is pure reuse — no new data-fetching logic, no changes to `TodaysCrew.jsx` or `ActivityFeed.jsx`, no new lib functions, no schema/API changes.

**Placement:** The section renders once, after both of `TodayScreen`'s existing `conditionsSubTab === "map"` and `conditionsSubTab === "conditions"` branches — i.e. outside those conditionals — so it appears below whichever sub-view (List or Map) is currently active, reachable by scrolling.

**Contents, top to bottom:**

1. A "Friends" section label, styled to match the existing "X More Resorts" header at `TodayScreen.jsx:690` (`fontSize 11, fontWeight 800, uppercase, letterSpacing 0.8, color rgba(255,255,255,0.5)`).
2. `<TodaysCrew />`, unchanged — live status + the signed-in user's own Driving/Arrived actions.
3. A "Recent Activity" label, same styling as above — new, since `ActivityFeed` has no heading of its own outside the Crew tab's tab-label context.
4. `<ActivityFeed />`, unchanged — the activity feed with reactions.

## What's explicitly out of scope

- Crew tab's "Feed" sub-tab and Track tab's `TodaysCrew` placement are **not removed or changed** — this is additive. Both components will now be mounted in two places at once (e.g. `TodaysCrew` on both Track and Today); each mount fetches independently, so there's no shared-state risk, same as any other tab today.
- No merging of the two data streams into one unified feed — they remain two visually distinct, separately-fetched sections stacked in one place.
- No changes to anonymous/browse-mode behavior. The Crew tab (where `ActivityFeed` already lives) has no auth gate today, so surfacing it on Today does not introduce a new anonymous-user code path. `TodaysCrew` already shows "Sign in to see who's skiing today" for signed-out users.

## Testing / verification

No `src/lib` changes, so no new `node --test` coverage is expected — this is pure JSX composition in `TodayScreen.jsx` (two imports + a section of JSX). Verification is a browser click-through: scroll the Today tab (both List and Map sub-views) as a signed-in user with friends who have live plans/recent activity, and confirm the section renders below the fold in both sub-views, matches the existing Track/Crew-tab rendering of the same components, and the Driving/Arrived buttons still write correctly.
