# PowderDays — Build Roadmap

Tracks all active and upcoming build tasks. Work top to bottom within each section.
Check off tasks as we complete them.

See `UX_CLEANUP.md` for the original UX polish tasks (Tasks 1–12).
See `PRD.md` for full feature requirements and data architecture.
See `sprints/` for execution-ready, task-by-task implementation plans (one file per task, self-contained agent briefs) — see **"Sprint Plan Coverage"** near the bottom of this file for the full map and recommended execution order.

---

## SECTION 0 — Application Theme & Design System

Establish a cohesive visual identity before new features land. All new UI in Sections 1–9 should be built against the chosen design system.

### ~~TASK 0.1 — Choose application theme~~ ✅ COMPLETE

**Selected: Theme 2 — Blizzard**
Near-black background (`#04080f`), ice blue accent (`#38bdf8`), glass cards with ice-tinted borders, falling snowflake particles. Crystalline, fresh-powder energy that aligns directly with the brand.

**Future release note:** Theme switching (user preference) is queued as **TASK 10.1** in Section 10. Architecture decision: CSS custom properties on `:root` will make this a one-class swap when the time comes.

All 5 mockups remain in `mockups/` for reference.

---

### TASK 0.2 — Build CSS design token system

**Plan:** `sprints/sprint-7-design-tokens.md` (remaining items below — typography/spacing scale)

- [x] Create `src/index.css` global CSS custom properties — full Blizzard token set: `--color-bg`, `--color-accent`, `--color-surface`, `--gradient-primary`, shadows, radii, transitions
- [x] Add `@keyframes snowfall` + `.snowflake` CSS class
- [x] Created `src/components/SnowfallBackground.jsx` — 16 deterministic particles, fixed-position, pointer-events none
- [x] Updated `App.jsx` — all accent, background, gradient, and nav colors migrated to Blizzard palette; `SnowfallBackground` wired into app root
- [ ] Typography scale: heading sizes, body, label, caption
- [ ] Spacing scale: 4px base unit
- [ ] Replace remaining hardcoded hex values in other components (`HomeDashboard`, `LeaderboardPage`, `ProfilePage`, etc.) with token references — ongoing as each feature area is touched

**Files:** `src/index.css`, `src/components/SnowfallBackground.jsx`, `src/App.jsx`

---

### TASK 0.3 — Shared UI component library

**Plan:** `sprints/sprint-8-ui-component-library.md`

- [ ] `src/components/ui/Card.jsx` — base card with glass/solid variant
- [ ] `src/components/ui/Badge.jsx` — tier badge (Elite/Very Good/Good/Okay/Poor/Closed)
- [ ] `src/components/ui/Button.jsx` — primary, secondary, ghost, danger variants
- [ ] `src/components/ui/ScoreRing.jsx` — circular powder score display
- [ ] `src/components/ui/SnowStat.jsx` — labeled stat with icon (used on resort cards)
- [ ] Mountain silhouette / snow texture CSS utility classes for card backgrounds

**Files:** `src/components/ui/` directory

---

### TASK 0.4 — Landing page & onboarding redesign

**Plan:** `sprints/sprint-9-landing-onboarding-redesign.md`

- [ ] Apply chosen theme to `LandingPage.jsx`
- [ ] Hero: full-bleed mountain gradient, app name, tagline ("Chase more powder days")
- [ ] Feature highlights: Conditions · Crew Planning · Session Tracking
- [ ] Match `OnboardingFlow.jsx` visual style to chosen theme

**Files:** `LandingPage.jsx`, `OnboardingFlow.jsx`

---

## SECTION 1 — UX Cleanup Completion

Remaining tasks from `UX_CLEANUP.md`. These ship first to establish a clean foundation before new features land.

### TASK 1.1 — Simplify Home to 3-card feed `[UX Task 4]`

**Plan:** `sprints/sprint-10-home-3-card-feed.md`

- [ ] Remove messaging panel from `HomeDashboard.jsx` (right column on desktop)
- [ ] Remove leaderboard ticker from `HomeDashboard.jsx`
- [ ] Drop `getMyCrews`, `getDMConversations`, `getMyTripConversations`, `markDMsRead`, `getLeaderboard` imports if unused after removal
- [ ] **Card 1 — Today's Best Mountain:** top-scoring resort with powder score, snow totals, drive risk, "View All Resorts →" link to Snow tab
- [ ] **Card 2 — Your Next Trip / pending invite:** pending invite shown first with Accept/Decline inline; otherwise next upcoming trip with RSVP count; empty state → "Plan a ski day" CTA opens `CreateTripModal`
- [ ] **Card 3 — Who's Skiing Today:** compact crew list from `TodaysCrew` data; empty state → "Be the first to check in today →" CTA

**Files:** `HomeDashboard.jsx`

---

### TASK 1.2 — Move Today check-in to Home; remove from Plans `[UX Task 5]`

**Plan:** `sprints/sprint-11-move-checkin-to-home.md`

- [ ] In `HomeDashboard.jsx`, add "Check In Today" CTA above Card 1 (visible only if user hasn't checked in today — check `daily_plans` for today's date)
- [ ] Import and render `SkiCheckInForm` in a collapsed/expandable card on Home
- [ ] In `SkiPlansPage.jsx`, remove "Today" sub-tab: `["trips", "today", "calendar"]` → `["trips", "calendar"]`
- [ ] Remove the `activeSubTab === "today"` render block from `SkiPlansPage.jsx`
- [ ] Remove `SkiCheckInForm` and `TodaysCrew` imports from `SkiPlansPage.jsx` if no longer used
- [ ] Confirm `SkiPlansPage` defaults `activeSubTab` to `"trips"`

**Files:** `HomeDashboard.jsx`, `SkiPlansPage.jsx`

---

### ~~TASK 1.3 — Complete incomplete features~~ ✅ COMPLETE `[UX Task 11]`

Verified against current code (checkboxes below were stale — all 4 items are already implemented):
- [x] **11a — Trip Themes:** `TripCard.jsx` already renders `themeAccent` as a colored left border (`borderLeft: themeAccent ? \`4px solid ${themeAccent}\` : undefined`)
- [x] **11b — Carpool / Rides:** `TripDetailModal.jsx` already has carpool state (`addCarpool`, `removeCarpool`, `updateRideStatus`, `handleSetRideStatus`) and a rides section
- [x] **11c — Date Matchmaker entry point:** `MessagingCenter.jsx` already imports `DateMatchmakerComposer` and renders a "📅 Find a Date with Your Crew" button in the Chats panel
- [x] **11d — TripsPage.jsx audit:** already deleted (see commit `1d403f9`, "Remove unused TripsPage component") — confirmed zero references anywhere in `src/`

**No sprint needed for this task.**

---

## SECTION 2 — Session Tracking Foundation

Builds the core data layer and UI for tracking a ski day. Everything in Sections 3–5 depends on this.

**Note:** Tasks 2.1 and 2.4 are covered by the existing Strava/GPS-tracking sprint series (`sprints/sprint-3-gps-tracker-hook.md` and `sprints/sprint-4-active-session-ui.md`), which also builds `migrations/010_ski_runs.sql`. Those sprints are written but **not yet executed** as of this update — `sprints/sprint-1-strava-oauth.md` is the only one of the 6 already merged. Tasks 2.2 and 2.3 below (new this update) both depend on sprint-3 having landed first.

### TASK 2.1 — Extend `ski_sessions` schema + create `ski_runs` table

- [ ] Create `migrations/010_ski_runs.sql`
- [ ] Add columns to `ski_sessions`: `runs_logged INT DEFAULT 0`, `lifts_ridden INT DEFAULT 0`, `top_speed_mph DECIMAL(5,1)`, `avg_speed_mph DECIMAL(5,1)`, `time_on_mountain_min INT`, `time_on_lifts_min INT`, `longest_run_ft INT`, `calories_burned INT`, `session_started_at TIMESTAMPTZ`, `session_ended_at TIMESTAMPTZ`
- [ ] Create `ski_runs` table: `id`, `session_id` (FK → ski_sessions, CASCADE), `run_type` (run | lift | hike), `run_number`, `started_at`, `ended_at`, `vertical_ft`, `distance_mi`, `speed_max_mph`, `speed_avg_mph`, `lift_name`, `gps_track JSONB`
- [ ] Add RLS policies: authenticated users can read own runs; owner can write
- [ ] Run migration against Supabase

**Files:** `migrations/010_ski_runs.sql`

---

### TASK 2.2 — Update `get_leaderboard` RPC to include new stats

**Plan:** `sprints/sprint-12-leaderboard-rpc-v2.md` (depends on sprint-3 executed)

- [ ] Create `migrations/011_leaderboard_rpc_v2.sql` — update the RPC to aggregate new columns:
  - `top_speed_mph` → MAX across sessions
  - `longest_run_ft` → MAX
  - `total_runs` → SUM of `runs_logged`
  - `total_lifts` → SUM of `lifts_ridden`
  - `time_on_mountain_min` → SUM
- [ ] Update `src/lib/leaderboardApi.js` — add new fields to the mapped return object

**Files:** `migrations/011_leaderboard_rpc_v2.sql`, `src/lib/leaderboardApi.js`

---

### TASK 2.3 — Enhanced "Log a Day" UI

Upgrades existing check-in so users can capture rich session stats after the fact.

**Plan:** `sprints/sprint-13-enhanced-log-a-day.md` (depends on sprint-3 executed) — **correction:** the file below was wrong. `SkiCheckInForm.jsx` writes to `daily_plans` (the forward-looking "I'm skiing today" planner) — a different data model entirely. The actual retroactive day-logging UI that calls `logSkiDay()` is `LogDayModal`, defined inside `LeaderboardPage.jsx`. The plan targets the correct file.

- [ ] After basic check-in submission, show an optional "Add your stats" step inline
- [ ] Fields: Runs skied (number), Vertical feet, Miles, Top speed (mph), Powder day toggle, Notes
- [ ] "I'll add stats later" skip link — saves the basic check-in immediately
- [ ] On Profile's session history, show ✏️ edit icon on sessions with no stats yet
- [ ] Update `updateSessionStats()` helper for the edit-later flow (new — `logSkiDay()` itself is unchanged)

**Files:** `LeaderboardPage.jsx` (`LogDayModal`), new `SessionStatsForm.jsx`, `src/lib/leaderboardApi.js`, `ProfilePage.jsx`

---

### TASK 2.4 — Active Session Mode ("I'm Skiing Now")

Live in-day tracking flow — the most differentiated new UI pattern.

- [ ] "Start My Day" button on Home (replaces/expands check-in CTA when conditions suggest user is at a resort)
- [ ] Creates session record with `session_started_at = NOW()`
- [ ] Build `ActiveSessionBar.jsx` — persistent floating bar while session is active: `⛷️ Active · 2h 14m · 8 runs`
- [ ] Tapping bar opens **Session Sheet**: run counter (+ / −), lift counter, vertical estimate input, quick notes
- [ ] "End My Day" → triggers `SessionRecapModal.jsx`
- [ ] `SessionRecapModal.jsx`: shows stats summary card + "Share" CTA (hooks into Task 5.1) + "Log to history" confirmation
- [ ] Wire session bar into `App.jsx` so it persists across tab switches

**Files:** `HomeDashboard.jsx`, new `ActiveSessionBar.jsx`, new `SessionRecapModal.jsx`, `src/lib/leaderboardApi.js`, `App.jsx`

---

## SECTION 3 — Season Analytics & History

### TASK 3.1 — Season Passport upgrade on Profile

**Plan:** `sprints/sprint-14-season-passport-upgrade.md` (depends on sprint-3 executed)

- [ ] Add new stat tiles to `SeasonStatsCard` in `ProfilePage.jsx`: Total Runs, Top Speed, Time on Mountain
- [ ] Season-over-season delta row: "↑ 4 more days than last season" (compare current vs. prior `startYear`)
- [ ] "All-time" toggle: switches stats display between current season and lifetime totals
- [ ] Add `getAllTimeStats(userId)` function to `leaderboardApi.js`

**Files:** `ProfilePage.jsx`, `src/lib/leaderboardApi.js`

---

### TASK 3.2 — Session history + calendar heatmap

**Plan:** `sprints/sprint-15-session-history-calendar.md` (depends on sprint-13)

- [ ] Build `SeasonCalendar.jsx` — GitHub-style grid of the ski season (Oct–Apr), each day colored by: no session (dark), session (blue), powder day (teal)
- [ ] Clicking a day expands an inline detail card: resort emoji, date, vertical, runs, top speed, powder badge
- [ ] Toggle between Calendar view and List view on Profile's session history section
- [ ] List view: per-session row with all stats; ✏️ edit icon calls back to Task 2.3 stats form

**Files:** `ProfilePage.jsx`, new `SeasonCalendar.jsx`

---

## SECTION 4 — Leaderboard Expansion

### TASK 4.1 — Expand to 8-stat leaderboard

Currently tracks: days, resorts, powder days, vertical, miles.
Add: top speed, longest run, most lifts, time on mountain.

**Plan:** `sprints/sprint-16-8-stat-leaderboard.md` (depends on sprint-12) — lands on 8 tabs (drops "resorts" as a separate tab in favor of the 4 new stats; see the plan for reasoning)

- [ ] Add stat tab switcher to `LeaderboardPage.jsx`: `Days | Vertical | Speed | Distance | Time`
- [ ] Each tab re-sorts the leaderboard rows by that stat with rank numbers
- [ ] Surface new stats in each leaderboard row (secondary stat below the primary)
- [ ] Confirm `get_leaderboard` RPC (Task 2.2) returns all new fields

**Files:** `LeaderboardPage.jsx`, `src/lib/leaderboardApi.js`

---

### TASK 4.2 — Emoji reactions on leaderboard entries

**Plan:** `sprints/sprint-17-leaderboard-reactions.md` (depends on sprint-16)

- [ ] Create `migrations/012_leaderboard_reactions.sql`: `leaderboard_reactions` table (id, user_id, target_user_id, stat_type, emoji, season, UNIQUE(user_id, target_user_id, stat_type, season))
- [ ] Add RLS: authenticated users can read all reactions; owner can write own
- [ ] Reaction bar in each leaderboard row: 🎿 ❄️ 🔥 👑 — one-tap; own reaction highlighted; count shown
- [ ] Add `addLeaderboardReaction()` and `getLeaderboardReactions()` to `leaderboardApi.js`

**Files:** `LeaderboardPage.jsx`, `migrations/012_leaderboard_reactions.sql`, `src/lib/leaderboardApi.js`

---

## SECTION 5 — Sharing & Viral Growth

### TASK 5.1 — Post-session share card

**Plan:** `sprints/sprint-18-session-share-card.md` — **correction:** `ShareStatCard.jsx` already renders via native Canvas 2D (not a styled `<div>`) and already exports via `canvas.toDataURL()`, not `html2canvas` (no such dependency exists or is needed). The plan extends the existing Canvas component with a new per-session mode rather than rewriting it.

- [ ] Extend `ShareStatCard.jsx` with a per-session mode: resort hero photo, stat grid, PowderDays logo watermark (season mode, unchanged, already has all of this)
- [ ] Stats shown: resort name, date, vertical feet, runs, top speed, powder day badge (❄️)
- [ ] Export via existing Canvas `toDataURL()` → PNG download (no new dependency)
- [ ] Native share sheet via `navigator.share()` if supported (iOS Safari); fallback to download
- [ ] Trigger from: `SessionRecapModal.jsx` "Share" button, Profile session history row "Share" icon

**Files:** `ShareStatCard.jsx`, `SessionRecapModal.jsx`, `ProfilePage.jsx`

---

### TASK 5.2 — Season milestone notifications

**Plan:** `sprints/sprint-19-season-milestones.md` (depends on sprint-14)

- [ ] Define milestone thresholds: 10 days, 25 days, first powder day, 50k vertical, 100k vertical, 100 runs, 5 resorts
- [ ] On Profile load, compare previous stats to current — if a milestone is newly crossed, show a modal
- [ ] Milestone modal: celebratory card with the achievement + "Share" CTA reusing `ShareStatCard.jsx`
- [ ] Store `last_milestone_shown` in `localStorage` to avoid re-triggering on every load

**Files:** `ProfilePage.jsx`, `ShareStatCard.jsx`

---

### TASK 5.3 — Activity feed

**Plan:** `sprints/sprint-20-activity-feed.md` — **correction:** uses app-level inserts (matching the existing `notifications` table's established pattern), not DB triggers — this codebase has no DB-trigger precedent anywhere, and app-level `logActivity()` calls after each action is lower-risk and functionally equivalent.

- [ ] Create `migrations/013_activity_feed.sql`: `activity_feed` table (id, actor_id FK profiles, type TEXT, subject_id UUID, subject_type TEXT, metadata JSONB, created_at) + `activity_feed_reactions` table
- [ ] Add app-level `logActivity()` calls (not DB triggers): `logSkiDay()` success → entry; "going" RSVP → entry; trip creation → entry
- [ ] Add RLS: authenticated users can read feed entries from accepted friends + self
- [ ] Build `ActivityFeed.jsx` — chronological list of friend activity with avatars, relative timestamps, inline emoji react
- [ ] Surface feed in Social tab (`MessagingCenter.jsx`), as a new sub-tab alongside Chats and Friends

**Files:** new `ActivityFeed.jsx`, `MessagingCenter.jsx`, `migrations/013_activity_feed.sql`, `src/lib/socialApi.js`

---

## SECTION 6 — Social Proof on Dashboard

### TASK 6.1 — "Friends going this weekend" badge on resort cards

**Plan:** `sprints/sprint-21-friends-going-badge.md`

- [ ] In `App.jsx`, compute `friendTripsByResort` map: upcoming trip RSVPs (next 7 days) grouped by `resort_key` → list of friend profiles going
- [ ] Pass map down to resort card render
- [ ] On each resort card: show "N friends going this weekend" with stacked avatars if N > 0
- [ ] Tapping badge → small popover listing friend names

**Files:** `App.jsx`, `src/lib/socialApi.js` (add `getFriendUpcomingTripsByResort()`)

---

### TASK 6.2 — Community activity signal on resort cards

**Plan:** `sprints/sprint-22-community-activity-signal.md`

- [ ] Add Supabase RPC `get_resort_activity_counts(from_date)` → returns `{resort_name, session_count}` for last 7 days
- [ ] Create `migrations/014_resort_activity_rpc.sql`
- [ ] On each resort card: show "X users skied here this week" as a secondary badge (only if count > 0)

**Files:** `App.jsx`, `migrations/014_resort_activity_rpc.sql`

---

## SECTION 7 — Powder Alert System

### TASK 7.1 — Powder alert preference on Profile

**Plan:** `sprints/sprint-23-powder-alert-preference.md`

- [ ] Create `migrations/015_powder_alerts.sql`: add `powder_alerts_enabled BOOLEAN DEFAULT false` and `alert_phone TEXT` to `profiles`
- [ ] Add toggle to Profile settings: "📧 Weekly powder forecast every Wednesday"
- [ ] Phone number field (optional, labeled "For future SMS alerts")
- [ ] Wire to `upsertMyProfile()` in `socialApi.js`

**Files:** `ProfilePage.jsx`, `migrations/015_powder_alerts.sql`, `src/lib/socialApi.js`

---

### TASK 7.2 — Wednesday powder briefing cron job

**Plan:** `sprints/sprint-24-wednesday-briefing-cron.md` (depends on sprint-23) — includes a new `server/powderScore.js` porting the PRD's powder-score formula server-side (doesn't exist there today) and a refactor of `server/index.js`'s route handlers into callable functions.

- [ ] Create `server/cron.js` — scheduled to run 7 AM MT every Wednesday (`0 14 * * 3` UTC)
- [ ] Query Supabase for all profiles with `powder_alerts_enabled = true`
- [ ] Fetch live powder scores for all open resorts via internal `/api/resort-conditions`
- [ ] Compose briefing: top 3 resorts with tier + projected snowfall, single "Best Bet" resort with one-line reason, weekend outlook (Fri–Sun)
- [ ] Send via Resend to each subscriber (batch, with per-email error handling)
- [ ] Create `server/emailTemplates.js` — HTML email template with branding
- [ ] Register cron in `server/index.js`
- [ ] Add `F-REQ-ALERT-003` guard: skip send entirely if zero resorts are open

**Files:** `server/cron.js`, `server/emailTemplates.js`, `server/index.js`

---

### TASK 7.3 — Unsubscribe flow

**Plan:** `sprints/sprint-25-unsubscribe-flow.md` (depends on sprint-24)

- [ ] Each briefing email includes a signed unsubscribe link: `/api/unsubscribe?token=<signed_jwt>`
- [ ] Backend: `GET /api/unsubscribe` validates token, sets `powder_alerts_enabled = false` for that user
- [ ] Returns minimal HTML page: "You've been unsubscribed. Click here to re-enable alerts."
- [ ] Re-enable link hits `GET /api/resubscribe?token=<signed_jwt>` and sets flag back to `true`

**Files:** `server/index.js`

---

## SECTION 8 — Enhanced Conditions Data

### TASK 8.1 — 7-day snowfall forecast panel on resort cards

**Plan:** `sprints/sprint-26-7day-forecast-panel.md` — **correction:** numeric snowfall-inches data comes from `/api/nws/snow` (grid data), not `/api/nws/forecast` (text-only periods) — the plan bucket-sums the existing snow-grid data by day rather than parsing forecast text.

- [ ] Confirm NWS 7-day forecast data is accessible from current `/api/nws/forecast` endpoint
- [ ] On each resort card, add expandable "This Week ▾" row
- [ ] 7 mini day-bars: day label + snowfall amount (inches); bar height proportional to max expected
- [ ] Highlight the highest-snowfall day: "Best day: Saturday ❄️ 6–10""
- [ ] Collapsed by default; expand on tap

**Files:** `App.jsx`

---

### TASK 8.2 — Vibe Score

**Plan:** `sprints/sprint-27-vibe-score.md` — scoped community-wide (all users), not friends-only, to stay distinct from Task 6.1's friends-only badge; see the plan for reasoning.

- [ ] Add `getResortVibeData()` to `socialApi.js`: queries check-ins (last 7 days) + upcoming RSVPs per resort
- [ ] Compute vibe formula client-side: `(check-ins × 2) + (upcoming RSVPs × 3) + (powder_score × 0.2)`, normalized 0–100
- [ ] Tier labels: 🔥 High (70+) / 👍 Active (40–69) / 😶 Quiet (<40)
- [ ] Show as secondary badge on resort card alongside Powder Score
- [ ] Tooltip on hover/tap: "Based on friend activity and recent check-ins"

**Files:** `App.jsx`, `src/lib/socialApi.js`

---

## SECTION 9 — Live & Real-time Features

### TASK 9.1 — GPS run tracking (browser Geolocation API)

**Plan:** covered by `sprints/sprint-3-gps-tracker-hook.md`, `sprints/sprint-4-active-session-ui.md`, and `sprints/sprint-5-gpx-strava-upload.md` (existing series, not yet executed).

*Depends on Task 2.4 (Active Session Mode) being complete.*

- [ ] Create `src/lib/useGpsTracker.js` hook: wraps `navigator.geolocation.watchPosition()`, accumulates position samples
- [ ] Auto-detect lift vs. run: upward altitude delta + speed ≤ 15 mph = lift; downward + speed ≥ 10 mph = run; else = rest
- [ ] Each detected segment → creates a `ski_runs` row with GPS track JSONB
- [ ] Cache GPS points in `sessionStorage` during session (offline resilience); flush to Supabase on end
- [ ] Display GPS track as polyline on PowderMap after session ends
- [ ] Gate the feature: show "GPS tracking requires location permission" prompt on session start

**Files:** new `src/lib/useGpsTracker.js`, `ActiveSessionBar.jsx`, `PowderMap.jsx`

---

### TASK 9.2 — Live friend location sharing (opt-in)

**Plan:** `sprints/sprint-28-live-friend-location.md` (hard dependency on sprints 3 AND 4 both being executed first — not just planned)

*Depends on Task 9.1 (GPS tracking) being complete.*

- [ ] During active session: "Share my location with friends" toggle in Session Sheet
- [ ] When enabled: broadcast position every 30s via Supabase Realtime channel `mountain:live:{userId}`
- [ ] PowderMap subscribes to live channels for all accepted friends with active sessions
- [ ] Render friend location as labeled pin on map: avatar initial + name
- [ ] Privacy: location only visible to accepted friends; stops broadcasting when session ends or toggle off
- [ ] Show "N friends on mountain now" count in Who's Skiing Today card on Home

**Files:** `PowderMap.jsx`, new `LiveCrewMap.jsx`, `HomeDashboard.jsx`, `src/lib/useGpsTracker.js`

---

## SECTION 10 — Future Release Features

### TASK 10.1 — User theme switching

*Deferred to a future release. Architecture is already in place via CSS custom properties.*

- [ ] Add `theme` column to `profiles` table (`blizzard` | `alpine-dawn` | `storm-chaser` | `aurora-peak` | `base-lodge`, default `blizzard`)
- [ ] Define per-theme CSS variable sets in `src/themes/` directory
- [ ] On app load: read `profile.theme` → apply `document.documentElement.setAttribute('data-theme', theme)`
- [ ] Add theme picker UI in Profile settings (5 swatches, tapping one previews + saves)
- [ ] All 5 themes already designed in `mockups/` — just need CSS variable extraction

**Files:** `ProfilePage.jsx`, `src/themes/`, `migrations/` (add `theme` column), `src/App.jsx`

---

## Progress Summary

Every remaining task (except Section 10, deferred) now has a corresponding execution-ready plan in `sprints/`. See **"Sprint Plan Coverage"** below for the full map, execution order, and how to run them.

| Section | Tasks | Done |
|---------|-------|------|
| 0 — Theme & Design System | 4 | 1 |
| 1 — UX Cleanup | 3 | 1 |
| 2 — Session Tracking | 4 | 0 |
| 3 — Season Analytics | 2 | 0 |
| 4 — Leaderboard | 2 | 0 |
| 5 — Sharing & Growth | 3 | 0 |
| 6 — Social Proof | 2 | 0 |
| 7 — Powder Alerts | 3 | 0 |
| 8 — Enhanced Conditions | 2 | 0 |
| 9 — Live Features | 2 | 0 |
| 10 — Future / Theme Switching | 1 | 0 |
| **Total** | **28** | **2** |

---

## Sprint Plan Coverage

Detailed, execution-ready plans for every remaining task live in `sprints/` (one file per plan, self-contained agent briefs — see each file's header for exact file targets, code, and acceptance criteria). Execute with **`superpowers:subagent-driven-development`** (fresh subagent per task, two-stage review) or **`superpowers:executing-plans`** (inline, batch execution with checkpoints).

**Already-existing sprint series (Strava/GPS — sprints 1–6, written previously):** covers Tasks 2.1, 2.4, 9.1 (`sprint-3`, `sprint-4`, `sprint-5`) plus new-to-ROADMAP Strava integration (`sprint-1`, `sprint-2`) and a PWA shell (`sprint-6`). **Only `sprint-1` has been executed so far** — `sprint-2` through `sprint-6` are written but not yet run. Several new sprints below have a hard dependency on `sprint-3` (and in one case `sprint-4`) landing first — check each sprint's "Depends on" line before starting it.

**Recommended execution order for the new sprints (7–28), respecting dependencies:**

| Order | Sprint | Task | Depends on |
|---|---|---|---|
| 1 | `sprint-7-design-tokens.md` | 0.2 | — |
| 2 | `sprint-8-ui-component-library.md` | 0.3 | sprint-7 |
| 3 | `sprint-9-landing-onboarding-redesign.md` | 0.4 | sprint-7, sprint-8 |
| 4 | `sprint-10-home-3-card-feed.md` | 1.1 | sprint-8 |
| 5 | `sprint-11-move-checkin-to-home.md` | 1.2 | sprint-10 |
| 6 | `sprint-12-leaderboard-rpc-v2.md` | 2.2 | sprint-3 (existing series) |
| 7 | `sprint-13-enhanced-log-a-day.md` | 2.3 | sprint-3 |
| 8 | `sprint-14-season-passport-upgrade.md` | 3.1 | sprint-3, sprint-8 |
| 9 | `sprint-15-session-history-calendar.md` | 3.2 | sprint-13 |
| 10 | `sprint-16-8-stat-leaderboard.md` | 4.1 | sprint-12 |
| 11 | `sprint-17-leaderboard-reactions.md` | 4.2 | sprint-16 |
| 12 | `sprint-18-session-share-card.md` | 5.1 | sprint-15 |
| 13 | `sprint-19-season-milestones.md` | 5.2 | sprint-14, sprint-8 |
| 14 | `sprint-20-activity-feed.md` | 5.3 | — |
| 15 | `sprint-21-friends-going-badge.md` | 6.1 | — |
| 16 | `sprint-22-community-activity-signal.md` | 6.2 | — |
| 17 | `sprint-23-powder-alert-preference.md` | 7.1 | — |
| 18 | `sprint-24-wednesday-briefing-cron.md` | 7.2 | sprint-23 |
| 19 | `sprint-25-unsubscribe-flow.md` | 7.3 | sprint-24 |
| 20 | `sprint-26-7day-forecast-panel.md` | 8.1 | — |
| 21 | `sprint-27-vibe-score.md` | 8.2 | sprint-8 |
| 22 | `sprint-28-live-friend-location.md` | 9.2 | sprint-3 **and** sprint-4 (existing series) |

Task 1.3 required no sprint (already fully implemented — see the task's own notes above). Section 10 (theme switching) is explicitly deferred per its own heading and has no sprint.
