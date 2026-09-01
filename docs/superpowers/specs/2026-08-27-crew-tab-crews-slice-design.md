# Design — Crew Tab: Crews Sub-Tab Mockup Fidelity Pass (Slice 1 of 5)

**Date:** 2026-08-27
**Status:** Approved for planning
**Origin:** ROADMAP.md TASK 22.0 — continuing the mockup-fidelity pass after the Today tab
(List + Map, both shipped). This time the source is `mockups/PowDays.app mockup design/
PowDays Reorg Mockup.dc.html`, an interactive prototype whose `crewTab` state covers all five
Crew sub-tabs (Friends/Crews/Feed/Board/Leaderboard) — richer ground truth than the single
static screenshot at `Screen Shots/PowDays Reorg Mockup-Crew Page.png` (which only captures the
Friends sub-tab).

A gap audit against `MessagingCenter.jsx` (846 lines), `FriendsPage.jsx` (977 lines),
`CrewGroupChat.jsx`, `ActivityFeed.jsx`, `SkiBuddyBoard.jsx`, and `LeaderboardPage.jsx` found
this is not a single restyle — it's a reorganization of five already-built views that currently
live nested inside two different files, none of them behind the mockup's actual 5-way tab bar.
Kyle chose to decompose into five slices, smallest real lift first: **Crews → Board →
Leaderboard → Feed → Friends**. This spec covers Crews only, plus the shared tab-bar shell all
four later slices depend on.

## 1. The problem

**Today's structure doesn't match the mockup's at all.** `MessagingCenter.jsx` has its own
3-way toggle (Chats / Friends / Activity) — "Chats" is a merged, unread-sorted list of crew
conversations and DMs. Nested one level inside the "Friends" panel, `FriendsPage.jsx` has a
*second*, different 4-way toggle (Leaderboard / Crews / Friends / Community). The mockup's
5-way Friends/Crews/Feed/Board/Leaderboard chip row exists at neither level today.

**Specifically for Crews:** the closest existing thing is `CrewGroupChat.jsx`'s default
export — a card per crew (emoji badge, name, description, invite-only/open status, tap to open
`CrewChatView`), reached only via `FriendsPage`'s "🤙 Crews" section. The mockup's Crews card is
similar in spirit but different in content: a color-coded icon instead of an emoji badge,
stacked member avatars, an explicit member count, and a "Next out: {resort} · {day}" line —
none of which the current card renders, and the last one has no existing query behind it at
all.

**Also blocking every slice, not just this one:** the mockup's 5 tabs have no dedicated inbox
tab. Today's merged DM+crew-chat list is the *only* place unread messages are visible — there is
no notification-bell coverage for new messages (confirmed by grep: no DB trigger inserts into
`notifications` on a new `crew_messages` or `direct_messages` row; the `target_type='messages'`
case in `NotificationBell.jsx` is a specific trip-related notice, not a general one). Dropping
the old Chats panel without replacing this loses the only signal that says "you have an unread
message."

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Build the real 5-way tab bar now, with all 5 tabs wired**, but redesign only Crews' content this slice. Friends/Feed/Board/Leaderboard route to their current, unpolished components as-is. | Kyle's choice. The alternative (grow the bar tab-by-tab across 5 merges) means users see a half-built nav for weeks; wiring all 5 now gives the real navigation experience immediately, and each later slice is a pure content swap on an already-shipped shell. |
| 2 | **Default active tab this slice is Crews, not Friends** (even though the mockup's own default is Friends). | Same precedent as Today shipping List-view-first as its default. Whichever tab is actually redesigned is what a user should land on; flip the default to Friends once that slice ships. |
| 3 | **The old merged Chats panel (crew convos + DMs, unread-sorted) is removed outright** — no relocated "recent chats" list anywhere. Crew chat opens from a card in the Crews tab; DMs open from a Friend row's message icon (unchanged). | Kyle's choice, made after confirming the mockup genuinely has no inbox screen — matching it exactly rather than inventing a secondary view not in the design. |
| 4 | **Unread awareness moves to a small dot badge on the tab chip itself** (Crews chip = unread crew message somewhere; Friends chip = unread DM), computed the same client-side way as today, not via the (currently nonexistent) notification-bell coverage. | Kyle's choice, made *after* discovering the bell doesn't cover new messages — chosen specifically to avoid a silent regression from Decision 3, without pulling "add message notifications" (a bigger, separate piece of work) into this slice. |
| 5 | **Crew icon defaults to a flat color dot via the existing `crewColor(stableIndex)` from `crewColors.js`**, not a new palette — but a crew can optionally upload a photo that overrides it, same fallback pattern `Avatar.jsx` already uses (photo if set, else color+initial). | Kyle's explicit call: match the mockup's flat-color look by default, but don't force-drop the ability to give a crew a real identity. Reuses the *exact* function already coloring crews on the Plans calendar (one consistent color per crew everywhere), not a second palette. |
| 6 | **Member avatars in the stacked row use `Avatar.jsx` directly**, not `FriendsPage.jsx`'s separate `FriendAvatar` component. | The gap audit found `FriendAvatar` is a second, disagreeing avatar-color implementation (always solid blue, vs. `Avatar.jsx`'s per-name hash color) — exactly the kind of duplicate Kyle flagged watching for. Fixing `FriendAvatar` itself is out of scope here (it belongs to the Friends slice, where it's actually used); this slice's new render just doesn't inherit the duplicate by building on the correct component from the start. |
| 7 | **"Next out" ships this slice**, via a new query — not deferred. | Kyle's choice: useful enough to build now rather than leave the card visually incomplete relative to the mockup. |
| 8 | Pending crew invites and the "+ New Crew" action **stay**, restyled to the new card language. | Both already exist in `CrewGroupChat.jsx` and are real functionality; the mockup screenshot only omits them because its sample data has none to show, not because they're being cut. |

## 3. The design

### 3.1 Shared: the new top-level tab bar (`MessagingCenter.jsx`)

Replaces the current "Chats / Friends / Activity" toggle and its filter-chip row entirely.
Sits directly below the "Crew" page title as a horizontally-scrolling pill-chip row —
explains why the screenshot showed "Leaderboa…" cut off; it's meant to scroll, not shrink to
fit:

```
Crew
[ Crews ] [ Friends ] [ Feed ] [ Board ] [ Leaderboard ] →
```

- Active chip: filled accent background, dark text (matches the mockup's `chip(active)` style
  and the same visual language Today's `List | Map` segmented pill and `SkiBuddyBoard`'s filter
  chips already use — no new chip idiom invented).
- Inactive chip: translucent background, light text, same as existing chip patterns elsewhere.
- A small unread dot renders on the Crews chip (unread crew message somewhere) and the Friends
  chip (unread DM) per Decision 4 — same corner-dot treatment `ConversationRow`'s unread
  indicator already uses today, just relocated onto the chip instead of a per-conversation row.
- State: one `crewSubTab` value in `MessagingCenter`, replacing `panel`. Default `"crews"` this
  slice (Decision 2).
- Routing this slice: `crews` → new content (§3.2); `friends` → renders `FriendsPage`'s
  existing "friends" section content unmodified (still reachable, just relocated up a level —
  `FriendsPage`'s *own* internal 4-way toggle is bypassed by rendering only that one section,
  not the whole component with its tab bar); `feed` → `ActivityFeed` unmodified; `board` →
  `SkiBuddyBoard` unmodified; `leaderboard` → `LeaderboardPage` unmodified.
- DM access: unchanged — a Friend row's message-bubble button still calls the existing
  `handleMessageFriend` → `openDM` → `DirectMessageView` path. Crew chat access: unchanged
  target (`CrewChatView`), new entry point (§3.2).

### 3.2 Crews tab content (new)

```
┌──────────────────────────────────────────┐
│ ●  Powder Hounds              [+New Crew] │
│    8 members            (KY)(MR)(JT)(LW)…│
│    Next out: Copper · Sat      [Open chat]│
└──────────────────────────────────────────┘
```

- One card per crew from `getMyCrews()` (extended, see §3.4), tap anywhere on the card →
  `CrewChatView` (unchanged component, unchanged props).
- **Icon** (leftmost): 12×12-ish rounded square/dot in `crewColor(stableIndex)` — same function,
  same stable-index contract (`getMyCrews()` order) already governing crew color on the Plans
  calendar (`crewColors.js`). If `crew.photo_url` is set, render that as a small rounded image
  instead, same fallback branch `Avatar.jsx` already uses for people.
- **Name + member count**: `crew.name`, `{count} members` — `count` newly available from the
  extended query (§3.4).
- **Member avatars**: stacked circles in `joined_at` ascending order (the `crew_members` table's
  own natural order — no extra sort needed), rendered with real `Avatar.jsx` (Decision 6) at a
  small size (~26px), capped at 4 visible + a "+N" overflow bubble, same overflow convention
  `WeekendPlanner`'s friend-avatar stack in `FriendsPage.jsx` already uses.
- **"Next out"**: `Next out: {resort} · {day}` when there is one (§3.4); the line is simply
  omitted when there's no upcoming shared day — no "nothing planned" filler text, matching how
  the mockup only shows the line when there's something to show.
- **Unread dot**: small dot on the card (in addition to the tab-chip-level aggregate dot from
  §3.1) using the same unread computation `ConversationRow` already does today
  (`getLastRead`/`markRead` vs. each crew's latest `crew_messages` row) — kept per-card since
  it's already computed and more useful than the aggregate alone.
- **Pending crew invites** (Decision 8): unchanged `InviteRow`-equivalent content from
  `CrewGroupChat.jsx`, restyled to the new card language, rendered above the crew list when any
  exist.
- **"+ New Crew"**: kept, opens the existing `CreateCrewModal` (from `CrewGroupChat.jsx`),
  extended per §3.3.
- **Empty state**: unchanged copy/behavior from `CrewGroupChat.jsx` ("No crews yet" +
  "Create Your First Crew").

### 3.3 Crew photo upload

- New optional `photo_url` column on `crews` (migration, §3.5).
- `CreateCrewModal` and the existing `EditCrewModal` (both in `CrewGroupChat.jsx`) get a photo
  picker alongside the existing emoji picker — emoji stays as a fallback/decoration option but
  the card render (§3.2) prioritizes `photo_url` when set, then falls back to the color dot, not
  the emoji (Decision 5 — emoji is no longer the primary card icon).
- Upload flow mirrors `uploadProfilePhoto` in `socialApi.js` exactly: new
  `uploadCrewPhoto(crewId, file)`, uploads to a new `crew-photos` storage bucket at
  `{crewId}/photo-{timestamp}.{ext}`, `upsert:true`, returns the public URL, caller writes it
  onto the crew row via a small `updateCrewPhoto(crewId, url)` (or folded into the existing
  crew-update call, implementer's call).

### 3.4 New data: member list, count, and "Next out"

`getMyCrews()` today returns only crew metadata + the caller's own role — no member list. Two
additions:

- Extend the query (or add a sibling `getCrewMembers(crewIds)`) to also fetch each crew's member
  profiles (`id`, `full_name`, `username`, `avatar_url`) via `crew_members` joined to `profiles`,
  for the avatar stack and count.
- New "next out" query: for each crew, find the earliest **future** date where **two or more of
  that crew's members** have a `daily_plans` row at the **same resort**. Best-effort — a crew
  with no such overlap simply gets no "Next out" line (§3.2). This is read-only against existing
  `daily_plans`/`crew_members` tables; no schema change needed for this part.

### 3.5 Migration

New file, e.g. `migrations/0XX_crew_photos.sql`:

```sql
ALTER TABLE public.crews ADD COLUMN IF NOT EXISTS photo_url TEXT;
```

Plus a new `crew-photos` Storage bucket (created the same way `profile-photos`/`trip-media`/
`chat-media` already exist — those aren't tracked in a migration file either, so this follows
existing repo convention, not a gap) with RLS: any crew member can read; only a crew admin
(mirroring the existing `crews` "crew admin can update crew" policy pattern) can write/replace
the photo.

## 4. Architecture

| File | Responsibility |
|---|---|
| `src/components/MessagingCenter.jsx` | *modify* — replace the Chats/Friends/Activity toggle with the new 5-way `crewSubTab` bar (§3.1); remove the old merged Chats panel and its `ConversationRow`/DM-list rendering; route each tab to its content |
| `src/components/CrewGroupChat.jsx` | *modify* — new crew card layout (§3.2); photo picker added to `CreateCrewModal`/`EditCrewModal` (§3.3); this becomes the Crews tab's content, rendered inline rather than requiring its own header/toggle |
| `src/lib/crewColors.js` | *unmodified* — `crewColor()` reused as-is (Decision 5) |
| `src/components/ui/Avatar.jsx` | *unmodified* — reused as-is for the member-avatar stack (Decision 6) |
| `src/lib/socialApi.js` | *modify* — extend `getMyCrews()` (or add `getCrewMembers`) for member list/count (§3.4); add `getCrewsNextOut` (or fold into the same call) (§3.4); add `uploadCrewPhoto`/`updateCrewPhoto` (§3.3) |
| `migrations/0XX_crew_photos.sql` | *new* — `crews.photo_url` column + `crew-photos` bucket/RLS (§3.5) |
| `src/components/FriendsPage.jsx` | *modify (minimal, additive)* — add two optional props, `hideTabBar` and `initialSection`, both defaulting to current behavior when omitted (no other caller exists today, confirmed by grep, so this is risk-free). `MessagingCenter` renders it with `hideTabBar initialSection="friends"` so only the friends-section content shows, without a redundant nested tab bar duplicating the new top-level one. No change to any section's own content/logic. |
| `src/components/ActivityFeed.jsx`, `SkiBuddyBoard.jsx`, `LeaderboardPage.jsx` | *unmodified* — routed to as-is (§3.1) |

## 5. Constraints inherited from the repo

- No new npm dependencies.
- Inline `style={{}}` objects, colors via `var(--color-*)` tokens for anything semantic/stateful;
  the crew color dot is a deliberate exception (per-crew fixed hex from `crewColors.js`, already
  the established, tested pattern for crew identity — not a new violation, see that file's own
  header comment on why crew colors are fixed hex, not theme tokens).
- `upsertDailyPlan`/plan-writer discipline doesn't apply here — this slice does no plan writes,
  only reads `daily_plans` for the "Next out" query.
- `npm test` = **134 passing** as of 2026-08-27 (re-verify in the fresh worktree at build time,
  not from this number — it drifts between sessions).
- `npx eslint .` = **95 problems (86 errors, 9 warnings)** on `main` as of 2026-08-27 — but per
  standing note, `main`'s lint count runs persistently higher than a fresh worktree's true
  baseline (server/*.js, node_modules drift, not a real regression). **Get the real baseline from
  a fresh worktree**, not this number, and don't let this change raise it.
- Storage bucket creation/RLS: this repo's existing buckets (`profile-photos`, `trip-media`,
  `chat-media`) aren't defined in tracked migration files — following that same convention for
  `crew-photos` is consistent with the repo, not a gap to fix here.

## 6. Out of scope

- **Friends, Feed, Board, Leaderboard tab redesigns** — routed to their current components
  as-is this slice; each gets its own slice next (Board → Leaderboard → Feed → Friends, per
  Kyle's confirmed order).
- **New-message notifications** (the bell doesn't cover crew_messages/direct_messages today,
  confirmed by grep) — real gap, deliberately not pulled into this slice; Decision 4's tab-chip
  dot is the scoped mitigation, not a fix for the underlying gap.
- **`FriendsPage.jsx`'s `FriendAvatar` vs. `Avatar.jsx` duplicate** — belongs to the Friends
  slice, where `FriendAvatar` is actually used.
- **Any change to `CrewChatView`, crew messaging itself, or crew invite accept/decline logic** —
  reused unmodified.

## 7. Verification

No new pure/unit-testable logic beyond the "Next out" query and the extended `getMyCrews()`
shape, so this is primarily a browser-verification pass (mobile 375px and desktop), plus the
usual `npm test`/`npx eslint`/`npm run build` — same standing limitation as every prior slice:
no subagent in this environment has browser or Supabase-auth tooling, so every task is verified
via tests/lint/build/diff review only. Kyle does the real click-through after it ships.

1. Crew tab shows the new 5-chip horizontally-scrolling bar; default landing tab is Crews.
2. Tapping each of the other 4 chips shows that tab's existing (unpolished) content, unchanged
   from before this slice — confirms nothing broke in the process of relocating them.
3. Each crew card shows: icon (color dot, or photo if one was uploaded), name, real member
   count, a stacked-avatar row of real members (not placeholders), and — where applicable —
   a correct "Next out" line matching an actual upcoming shared day in test data.
4. A crew with no upcoming shared day among members shows no "Next out" line, not a placeholder.
5. Tapping a crew card opens the same `CrewChatView` as before this change (unchanged behavior).
6. Pending crew invites still render and Accept/Decline still work, restyled but functionally
   identical.
7. "+ New Crew" still creates a crew via the existing flow; the new photo picker successfully
   uploads and the card reflects it immediately without a full reload.
8. Removing a crew's photo reverts its card to the color-dot fallback.
9. Posting a new message in a crew chat (from another test account/session) causes the Crews
   tab chip to show its unread dot, and that crew's own card to show its unread dot; opening the
   chat clears both.
10. A new unread DM causes the Friends chip's unread dot to appear; opening that DM clears it.
11. `npx eslint .` does not exceed the fresh-worktree baseline; `npm test` still passes at the
    fresh-worktree count.
