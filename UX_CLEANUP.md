# PowderDays — UX Cleanup Task List

Each task is self-contained. Work top to bottom. Check off tasks as we complete them.

---

## ~~TASK 1 — Delete dead file + consolidate shared utilities~~ ✅ COMPLETE

- Deleted `App2.jsx`
- Created `src/lib/resorts.js` — canonical `RESORT_NAMES`, `RESORT_EMOJI`, `RESORT_PHOTOS`, `RESORT_ACCENTS`, `resortName()`, `resortEmoji()`
- Created `src/lib/format.js` — shared `timeAgo`, `formatDate`, `formatDateFull`, `fmt`
- Removed duplicate definitions from 12 files: `HomeDashboard`, `SkiPlansPage`, `MessagingCenter`, `TripChatView`, `DirectMessageView`, `TripCard`, `TripDetailModal`, `FriendsPage`, `ProfilePage`, `NotificationBell`, `DateMatchmaker`, `SkiPingModal`, `ShareStatCard`

---

## ~~TASK 2 — Extract a shared `Avatar` component~~ ✅ COMPLETE

- Created `src/components/ui/Avatar.jsx` — standard `{ profile, size }` interface with deterministic color initials fallback
- Removed local `Avatar` definitions from 11 components: `HomeDashboard`, `SkiPlansPage`, `MessagingCenter`, `CrewGroupChat`, `TripChatView`, `DirectMessageView`, `TripDetailModal`, `FriendsPage`, `ProfilePage`, `LeaderboardPage`, `DateMatchmaker`, `SkiPingModal`

---

## ~~TASK 3 — Rename tabs for clarity~~ ✅ COMPLETE

- `BOTTOM_TABS` in `App.jsx`: "Conditions" → **"Snow"**, "Friends" → **"Social"**
- Page header: "Colorado Powder Dashboard" → **"Colorado Snow Conditions"**
- Snow sub-tab label: "🏔️ Conditions" → **"🏔️ Snow"**
- All routing keys (`"dashboard"`, `"friends"`) unchanged — zero routing breakage

---

## TASK 4 — Simplify the Home Dashboard to a 3-card feed

**Why:** `HomeDashboard.jsx` currently renders: mountain conditions widget, upcoming plans strip, leaderboard ticker, AND a full messaging panel on desktop. This is information overload. Home should answer one question: "What should I do today?" — not preview every other tab.

**Steps:**

1. **Remove the messaging panel from Home entirely.** On desktop, `HomeDashboard.jsx` renders a full 2-column layout with a messaging inbox on the right. Remove that entire right column / messaging panel. The messaging panel belongs only in the Social tab.

2. **Remove the leaderboard ticker from Home.** The scrolling friends leaderboard strip adds animation and noise to a screen that already has too much. Remove it from HomeDashboard. The leaderboard remains accessible from the Social tab (see Task 7).

3. **Restructure Home to exactly 3 cards in a vertical feed:**

   **Card 1 — Today's Best Mountain**
   - Show the single top-scoring resort with large powder score, snow totals, drive risk
   - One "View All Resorts →" link that switches to the Snow tab (`onTabChange("dashboard")`)
   - Reuse data already passed via `resorts` prop

   **Card 2 — Your Next Trip (or pending invite)**
   - If the user has a pending invite: show it prominently with "Accept / Decline" inline
   - Otherwise: show their next upcoming trip with date, resort, RSVP count
   - If no trips: show "Plan a ski day with your crew →" button that opens CreateTripModal
   - One "See all trips →" link that switches to the Plans tab

   **Card 3 — Who's Skiing Today**
   - Pull the TodaysCrew data (already available) and show a compact list of friends skiing today
   - If no one: show "Be the first to check in today →" CTA
   - This replaces both the leaderboard ticker and the messaging preview as the social signal

4. Remove the `getMyCrews`, `getDMConversations`, `getMyTripConversations`, `markDMsRead`, `getLeaderboard` imports from HomeDashboard if they are no longer needed after removing the messaging panel.

**Files touched:** `HomeDashboard.jsx`

---

## TASK 5 — Move "Today" check-in to Home; remove it as a Plans sub-tab

**Why:** The daily check-in ("I'm going to Vail at 8am") is the most time-sensitive action in the app and is buried 2 taps deep under Plans > Today. It should be on the first screen a user sees, not hidden.

**Steps:**

1. **In `HomeDashboard.jsx`**, add a "Check In Today" CTA above Card 1 (or between Card 1 and Card 2):
   - Show it only if the user hasn't checked in today (check `daily_plans` for today's date for the current user)
   - Render a compact inline check-in form or a button that expands it inline
   - You can import `SkiCheckInForm` and render it in a collapsed/expandable card
   - After submitting, the Card 3 "Who's Skiing Today" should reflect their check-in

2. **In `SkiPlansPage.jsx`**, remove the "Today" sub-tab:
   - The 3 sub-tab array `["trips", "today", "calendar"]` should become `["trips", "calendar"]`
   - Remove the sub-tab button for "Today"
   - Remove the conditional render block for `activeSubTab === "today"` (which renders `SkiCheckInForm` + `TodaysCrew`)
   - Remove imports of `SkiCheckInForm` and `TodaysCrew` from `SkiPlansPage.jsx` if unused

3. Default `SkiPlansPage` `activeSubTab` to `"trips"` (it likely already is, just confirm).

**Files touched:** `HomeDashboard.jsx`, `SkiPlansPage.jsx`

---

## ~~TASK 6 — Simplify trip categorization in Plans~~ ✅ COMPLETE

- Removed `TripSection` component and the 4-section render (Pending Invites / Your Trips / You're Going / Friends' Trips)
- Added `deletedIds` Set state + `flatTrips` array — all trips merged, deduped by ID, sorted by `ski_date` ascending
- Pending invite banner ("✉️ You have N trip invite(s) — Respond below ↓") with blue accent left border shown above the flat grid when invites exist
- Empty state updated to "No ski trips yet" with "Plan a Trip 🎿" button

**Files touched:** `SkiPlansPage.jsx`

---

## ~~TASK 7 — Add "Find Friends" surface to the Social tab~~ ✅ COMPLETE

- Renamed the existing "People" toggle label to **"Friends"** (key stays `"people"`; routing unchanged)
- Added `getIncomingFriendRequests` import from `socialApi`; fetched alongside inbox data in `loadInbox` (non-blocking, catches errors)
- Added `pendingFriendCount` state; Friends toggle shows a red numeric badge when count > 0
- Existing `FriendsPage` inline render on both mobile and desktop already satisfied; no structural changes needed

**Files touched:** `MessagingCenter.jsx`

---

## TASK 8 — Expose Ski Ping as a first-class CTA ✅

**Why:** Ski Ping ("Want to ski next Wednesday?") is the app's most differentiated feature for driving spontaneous plans with friends. It currently lives only inside `SkiPingModal.jsx` with no visible entry point. Most users will never find it.

**Steps:**

1. **In `MessagingCenter.jsx`**, in the "Friends" section (from Task 7), add a prominent **"Ping Friends to Ski"** button near the top of the friends list.
   - On click, open `SkiPingModal` (already exists at `src/components/SkiPingModal.jsx`)
   - Import and render `SkiPingModal` with the standard `currentUser` prop

2. **In `HomeDashboard.jsx`**, if the user is logged in and has at least 1 friend, add a subtle "Ping a friend to ski →" text link below Card 3 ("Who's Skiing Today").
   - On click, open `SkiPingModal`

3. Ensure `SkiPingModal` renders correctly in both contexts (it should already, just needs to be wired up).

**Files touched:** `MessagingCenter.jsx`, `HomeDashboard.jsx`, `SkiPingModal.jsx` (verify props)

**Completed:** Added `SkiPingComposer` import + `showPingComposer` state + "👋 Ping Friends to Ski" button at top of people panel in MessagingCenter. Added `PingCta` component in HomeDashboard (lazy-loads friends on click) below the LeaderboardTicker in both mobile and desktop layouts.

---

## TASK 9 — Add loading states to async actions ✅

**Why:** Clicking "Going" on an RSVP, sending a message, creating a trip — none of these show loading feedback. On a slow connection the button appears broken. This is a trust issue.

**Steps:**

1. **RSVP buttons in `TripDetailModal.jsx`:** ✅ Already implemented — `rsvpLoading` state with `disabled={rsvpLoading}`, `"Sending…"` text, `finally` block restore.

2. **Create Trip submit button in `CreateTripModal.jsx`:** ✅ Already implemented — `loading` state with `"Dropping the trip…"` text.

3. **Check-in submit in `SkiCheckInForm.jsx`:** ✅ Already implemented — `loading` state with `"Saving..."` text.

4. **Friend request send in `FriendsPage.jsx`:** ✅ Already implemented — `workingId` (null | id) acts as per-user loading state; `finally { setWorkingId(null) }` ensures buttons always restore on error.

**Files touched:** `TripDetailModal.jsx`, `CreateTripModal.jsx`, `SkiCheckInForm.jsx`, `FriendsPage.jsx`

---

## TASK 10 — Make season stats the Profile hero + promote Share CTA ✅

**Why:** Season stats (days on mountain, vertical feet, powder days, resorts) are the most compelling social currency in the app. They're currently rendered as small numbers in a compact card below the profile header. They deserve visual prominence. "Share Stats" is buried in a corner.

**Steps:**

1. **Stats redesigned** — `SeasonStatsCard` now uses a teal→blue gradient background with 2×2 grid; each stat number is 48px/900 weight with 11px uppercase label. No share button inside the card.

2. **Share CTA promoted** — Full-width "📤 Share Your Season →" button (gradient background, shadow) appears immediately below the stats card (only shown if `days > 0`).

3. **Recent Sessions feed** — New `RecentSessionsFeed` component below the share button: shows last 5 sessions as `[emoji] [resort] · [date]` rows with ❄️ for powder days and vertical feet stat. Empty state: "No sessions logged yet — check in from the Home tab".

4. **Edit Profile → inline modal** — `EditProfileModal` sheet replaces the `ProfileSetup` wizard; shows Display Name, Sport (segmented), Skill Level (radio pills), Ski Passes (toggle chips), Vehicle (label + seats inputs). Saves via `upsertMyProfile`. `ProfileSetup` import removed.

**Files touched:** `ProfilePage.jsx`

---

## TASK 11 — Cut or complete incomplete features

**Why:** Half-built features confuse users ("is this broken?") and add dead weight to the codebase. Each item below is either cut or gets a minimal completion pass.

**Items:**

### 11a — Trip Themes (cut the UI, keep the DB field)
- In `CreateTripModal.jsx`, the theme selector exists (emoji/color themes for the trip card). The theme value is saved but never rendered on `TripCard.jsx` or `TripDetailModal.jsx`.
- **Fix:** Either render the theme color as a left border accent on `TripCard.jsx` (2-line change), or remove the theme selector from `CreateTripModal.jsx` entirely. Pick one.
- Recommendation: **Render it** — a colored left border on the trip card is easy and makes trips feel personalized.

### 11b — Carpool visibility (surface it)
- Carpool data is collected in trip creation (step 3) but not shown on `TripDetailModal.jsx` in a meaningful way.
- **Fix:** In `TripDetailModal.jsx`, add a "Rides" section that shows available carpool spots: driver name, seats, and a "Request a Ride" or "Offer a Ride" CTA. Pull from the `carpools` data already loaded with the trip.

### 11c — Date Matchmaker (move entry point)
- `DateMatchmaker.jsx` is a great feature with no discoverable entry point.
- **Fix:** In the Social tab (MessagingCenter), in the Chats section, add a "📅 Find a Date with Your Crew" button that opens `DateMatchmaker`. This belongs near the crew chat context.

### 11d — `TripsPage.jsx` audit
- `TripsPage.jsx` exists as a separate component alongside `SkiPlansPage.jsx`. Determine if it's used anywhere or if it's dead code.
- If unused: delete it.

**Files touched:** `CreateTripModal.jsx` or `TripCard.jsx` (11a), `TripDetailModal.jsx` (11b), `MessagingCenter.jsx` (11c), `TripsPage.jsx` (11d — delete if dead)

---

## TASK 12 — Consolidate notification bell into tab badge

**Why:** The notification bell floating in the nav creates two notification surfaces: the bell dropdown AND unread indicators on the Friends/Social tab. This is redundant and visually clutters the navigation.

**Steps:**

1. **Remove `NotificationBell` as a separate nav element** from both `BottomNav` and `TopNav` in `App.jsx`. The bell is currently rendered as a 6th item in the bottom nav (after the 5 tabs) via the `<NotificationBell variant="tab" dropUp />` call at lines 676–682.

2. **Replace with an unread badge on the Social tab icon.** Pass the unread notification count to `BottomNav` and `TopNav` as a prop. Render a small red dot or number badge on the "Social" tab icon when there are unread notifications.

3. **Move the notification list** (the dropdown content from `NotificationBell.jsx`) into the Social tab — either as a panel accessible from the Friends section, or as a top-level notification icon inside the MessagingCenter header.

4. Update `NotificationBell.jsx` to export a `useNotificationCount()` hook that can be used by the nav to get the unread count without rendering the full bell UI.

**Files touched:** `App.jsx`, `NotificationBell.jsx`, `MessagingCenter.jsx`

---

## Order Summary

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 1 | Delete App2.jsx + consolidate resort/format utilities | Low | Hygiene |
| 2 | Extract shared Avatar component | Low-Med | Consistency |
| 3 | Rename tabs (Conditions→Snow, Friends→Social) | Low | Clarity |
| 4 | Simplify Home to 3-card feed | Med | Focus |
| 5 | Move Today check-in to Home, remove Plans sub-tab | Med | Discoverability |
| 6 | Simplify trip categorization in Plans | Low-Med | Polish |
| 7 | Add Find Friends surface to Social tab | Med | Activation |
| 8 | Expose Ski Ping as first-class CTA ✅ | Low | Engagement |
| 9 | Add loading states to async actions ✅ | Med | Trust |
| 10 | Season stats as Profile hero + Share CTA ✅ | Med | Retention |
| 11 | Cut/complete incomplete features | Low-High (varies) | Polish |
| 12 | Consolidate notification bell into tab badge | Med | Nav clarity |