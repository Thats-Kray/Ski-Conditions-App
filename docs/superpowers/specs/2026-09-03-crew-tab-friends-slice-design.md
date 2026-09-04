# Crew Tab — Friends Sub-Tab Slice — Design Spec

**Date:** 2026-09-03
**Author:** Claude (brainstorming session with Kyle)
**Status:** Draft, pending Kyle's review
**Part of:** TASK 22.0 (mockup fidelity pass) — last of the 5-way Crew tab split
(Crews → Board → Leaderboard → Feed → **Friends**, this slice)

## Context

TASK 22.0 is redesigning the app page-by-page to match new high-fidelity mockups at
`mockups/PowDays.app mockup design/`. The Crew tab's 5 sub-tabs (Friends/Crews/Feed/Board/
Leaderboard) have been worked through in order; Crews, Board, Leaderboard, and all four Feed
slices are shipped and live. This is the last slice in that sequence.

The mockup's Friends screen (`Screen Shots/PowDays Reorg Mockup-Crew Page.png`, confirmed
against the richer interactive prototype `PowDays Reorg Mockup.dc.html`) is a lean 3-block
screen: a search bar, a "Requests" section, and a "Friends" list. The live `FriendsPage.jsx`
implements a much larger surface — 7 sections carrying functionality that accumulated before
the app's IA restructure (TASK 21.1) split the app into Today/Plans/Track/Crew/Me tabs and gave
several of those sections a second, better home elsewhere.

## Current-state findings

**`FriendsPage.jsx` has dead internal routing.** It was built to be a self-contained page with
its own 4-way tab bar (Leaderboard/Crews/Friends/Community — `activeSection` state) and props
(`hideCrew`, `hideTabBar`, `initialSection`) to let callers reconfigure it. Today it has exactly
one caller, `MessagingCenter.jsx:197`, which always passes `hideTabBar` and
`initialSection="friends"`. `MessagingCenter.jsx` grew its own real 5-way Crew tab bar
(Crews/Friends/Feed/Board/Leaderboard) during the Crews slice. That makes `FriendsPage.jsx`'s
own tab bar and three of its four section branches (`leaderboard`, `crews`, `community`)
unreachable — dead code, not a design decision anyone made on purpose.

**Several sections already have a better home post-IA-restructure**, confirmed by tracing each
one's data/actions to where else it's reachable:

| Section in `FriendsPage.jsx` | Redundant with |
|---|---|
| "Ping Crew" quick-action button | `SkiPlansPage.jsx`'s `PingCta` — same `SkiPingComposer`, same trigger copy ("👋 Ping a friend to ski"), already live on the Plans tab. |
| `WeekendPlanner` ("Friends' Ski Plans" 2-week strip) | `FriendsCalendar.jsx`, already mounted on the Plans tab — a full calendar (week/month views, filters, per-day plan cards) that is a strict superset of this strip. |
| "My Ski Plans" (your own upcoming/past plans list) | The Plans tab's own calendar already shows your plans. |
| Legacy crew-invite section (§7: received/sent `crew_invites` inbox, `CrewInviteCard`) | Already named "(legacy)" in the code; collapsed by default. The modern equivalent is the Crews tab (ongoing groups) + trip invites/RSVPs. |
| Per-friend inline "Invite" composer (resort/date/time/seats/message form, `createCrewInvite`) | Shares the exact same `crew_invites` flow as the legacy inbox above — cutting the inbox but keeping this composer would let you send an invite with no way to ever see its status. The mockup's friend row also has no Invite affordance, only a message icon. |
| Trip-join-request approve/decline block (top of tab, people asking to join a trip you host) | Fully manageable from the trip's own detail view (Interested list → host approves/declines), which is the primary path documented for this flow (migration 041). Mockup doesn't show it here. |

**Not redundant — must stay:** the "Activity" section (received/sent ski pings and date polls).
Traced `createSkiPing`/`createDatePoll` in `socialApi.js` — neither calls the app's shared
`notify()` helper, so **no notification is ever created for a ping or poll**. This section is
the *only* place in the app a recipient can discover or respond to one. Cutting it would break
a real, otherwise-invisible flow. The "Pick a Date" *compose* trigger (`DateMatchmakerComposer`)
is also not reachable anywhere else, so it needs a new home even though the mockup doesn't show
it — it's being tucked into an overflow menu near the search bar rather than kept as a top-level
quick-action button.

**`FriendAvatar` vs. `Avatar.jsx` (flagged in ROADMAP from the Crews-slice gap audit):**
`FriendAvatar` is a second, disagreeing per-person avatar implementation (always-solid-blue)
living in `FriendsPage.jsx`, vs. the correct hash-based multi-color `Avatar.jsx` already used
elsewhere in the same file. `FriendAvatar`'s only caller is `WeekendPlanner`, which this slice
deletes — so the fix is deletion, not reconciliation.

## Decisions (confirmed with Kyle)

1. **Cut**: Ping Crew quick-action, Weekend Planner strip, My Ski Plans list, legacy
   crew-invite inbox, per-friend inline invite composer, trip-join-request block.
2. **Online/presence status**: backlogged entirely. No presence tracking exists anywhere in
   this app today (confirmed by grep — this would be a new subsystem, not a restyle, same
   reasoning that split Feed into A/B/C1/C2). The friend row ships with no online-dot/status
   text. A future task can revisit real presence if wanted.
3. **Date Matchmaker compose trigger**: moves into a small "···" overflow menu near the search
   bar, rather than a top-level quick-action button.
4. **Incoming-request subtitle**: shows a **mutual friend count** ("3 mutual friends"), matching
   the mockup's exact copy style rather than the cheaper favorite-mountain option. This requires
   a new query (see Data changes below) since `friend_requests` is RLS-scoped to rows involving
   the caller — you cannot read a *requester's* full friends list from the client to intersect
   it locally.
5. **Friends-list subtitle**: adopts the mockup's `favorite_mountain · skill_level` format
   (e.g. "Winter Park · Expert") as the primary subtitle. The existing `daysTogether`/
   `topResort` info (shared ski days, most-skied-together resort) is kept as a secondary inline
   badge rather than dropped outright — real information this view uniquely surfaces at a
   glance, not shown anywhere else. **This is a deliberate deviation from the mockup's literal
   visual — flag during spec review if you'd rather match it exactly and drop those badges.**

## What ships

**`FriendsPage.jsx`** is cut down to just its friends content:
- Delete the internal tab bar, `activeSection` state, `hideCrew`/`hideTabBar`/`initialSection`
  props, and the `leaderboard`/`crews`/`community` branches plus their now-unused imports
  (`LeaderboardPage`, `CrewGroupChat`, `SkiBuddyBoard`).
- Delete `WeekendPlanner`, `FriendAvatar`, `CrewInviteCard`, the legacy-invites section, the
  per-friend inline invite composer (`showInviteId`/`inviteForm`/`handleSendCrewInvite`), the
  "My Ski Plans" section, the Ping Crew quick-action, and the top-of-tab trip-join-request block
  (`tripRequests`/`handleTripRequest` and its loader).
- Delete the now-unused loaders (`sentInvites`, `receivedInvites`, `skiPlans`, `friendsWeekend`,
  `tripRequests`) from `pageLoaders()`.

**New layout, in mockup order:**
1. Search bar (icon + placeholder, mockup style) with a small "···" overflow button beside it
   that opens the existing `DateMatchmakerComposer`.
2. **Requests** section — mockup's compact icon-button style (✓ gradient accept / ✕ ghost
   decline, both 32×32), subtitle = mutual friend count. Kept: the existing accept/decline
   handlers, unchanged.
3. **Friends** list — restyled rows using `Avatar.jsx` (not `FriendAvatar`), subtitle
   `favorite_mountain · skill_level` + the existing `daysTogether`/`topResort` badge, message
   icon button (restyled to match the mockup's SVG chat-bubble, same `onMessageFriend` wiring),
   no online-status column.
4. Pending-outgoing-requests view — kept, restyled as a lighter secondary affordance (not the
   current two-tab pill row taking equal visual weight against "Friends").
5. **Activity** (received/sent pings + date polls) — kept, restyled to fit the new visual
   rhythm, still conditionally rendered only when there's something to show.

**Data/query changes:**
- New Postgres function, migration `047`: `get_mutual_friend_count(other_user_id uuid) RETURNS
  int`, `SECURITY DEFINER STABLE`, following the same safety pattern as `are_friends()` and the
  Feed-C1 helpers (never an inline privileged read across another user's `friend_requests`
  rows — RLS on that table restricts reads to rows involving the caller, so the intersection
  must be computed server-side). Counts friend ids common to `auth.uid()` and `other_user_id`.
- New `socialApi.js` function wrapping the RPC, called once per incoming request row (request
  volumes are always small — same N-small-calls pattern the rest of this file already uses
  rather than a bulk RPC).
- `getAcceptedFriends()` (or its profile-select) needs `favorite_mountain` and `skill_level`
  added to its selected columns if not already present — verify during planning.

**Backlogged, not this slice:** real online/presence tracking.

## Testing

Existing `node --test` coverage over `src/lib` is unaffected except for the new
`getMutualFriendCount`-wrapping function, which gets a unit test with a mocked Supabase client
(matching the existing test patterns in `socialApi.test.js`-equivalent files). No new pure
helper logic is introduced beyond that wrapper — this slice is primarily a component restyle
plus one new RPC, not new business logic.

## Verification plan

Same recurring gap as every other TASK 22.0 slice: no subagent in this environment has
browser/Supabase-auth tooling, so the build will be verified via `npm test`/`npx eslint`/
`npm run build`/diff review, plus a migration `047` verification in a rolled-back transaction
against live data (matching the discipline used for migrations 037-046) before applying it to
production. **Kyle's own click-through is the only way to confirm**: the requests accept/
decline flow, the mutual-friend-count subtitle reads sensibly for real data, the friends list
subtitle/badges layout at real mobile widths, the message button still opens DMs correctly, and
the overflow menu's Date Matchmaker composer still works end-to-end. Flag explicitly: this slice
touches a real privacy-adjacent surface (a new RPC that reads friendship data across two users
to compute an intersection) — the migration will be verified with a real success-case test
(two real friend pairs sharing N mutual friends) against production data before merge, not just
denial tests, per the "assert the success case" lesson from migration 041.

## Open items for spec review

1. Confirm the two deviations above are acceptable: (a) keeping `daysTogether`/`topResort` as a
   secondary badge instead of dropping them for a pure mockup-literal subtitle, and (b) treating
   "cut the legacy crew-invite section" as also covering the per-friend inline invite composer
   and the trip-join-request block, not just the collapsed inbox.
2. Confirm the mutual-friend-count RPC approach (new migration, small scope) is acceptable
   rather than reconsidering the cheaper favorite-mountain subtitle option.
