# PowderDays — Build Roadmap

Tracks all active and upcoming build tasks. Work top to bottom within each section.
Check off tasks as we complete them.

See `UX_CLEANUP.md` for the original UX polish tasks (Tasks 1–12).
See `PRD.md` for full feature requirements and data architecture.
See `sprints/` for execution-ready, task-by-task implementation plans (one file per task, self-contained agent briefs) — see **"Sprint Plan Coverage"** near the bottom of this file for the full map and recommended execution order.

> **👉 Looking for what to work on next? Jump to "OPEN — the queue" and the sprint-sequence
> table below it.** Sections 0-18 above are historical record; nearly all of it is shipped.
> Groomed 2026-08-25 — every open item now carries a size estimate. **Re-prioritized
> 2026-08-27: TASK 22.0 (mockup fidelity pass) is now the active top item — see it first in
> the OPEN queue. Its Today-List-View slice shipped 2026-08-27 (live, commit `5062d98`); its
> Today-Map-View slice also shipped 2026-08-27 (live, commit `f2758bd`, Kyle click-tested it
> himself). Plans/Crew/Profile pages are next.**
>
> **State as of that grooming:** migrations `001-041` applied; `npm test` = **126 passing**
> _(134 as of 2026-08-27 after the Map-view slice — this number moves; always re-check rather
> than cite it)_ (`node --test src/lib/*.test.js`); `npx eslint .` baseline = **88 problems (80
> errors, 8 warnings) in a fresh checkout — not zero, don't "fix" it incidentally. The main
> working-copy checkout has separately shown a higher, unrelated count (95) confined to
> `server/*.js`, a pre-existing node_modules-drift quirk in that one checkout, not a code
> regression — re-verify in a clean checkout/worktree if the number looks off.** Live at
> powdays.app; Vercel serves
> the frontend from GitHub `main`, API and cron on Render (**`railway.json` is stale**).
> Pushing to `main` ships to production with **no staging step**.

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
- [x] Typography scale: heading sizes, body, label, caption (`--font-size-display/h1/h2/h3/body` etc. in `src/index.css`)
- [x] Spacing scale: 4px base unit (`--space-1` … in `src/index.css`)
- [x] Replace remaining hardcoded hex values in `HomeDashboard.jsx`, `LeaderboardPage.jsx`, `ProfilePage.jsx` with token references — completed 2026-08-08. Audit found 70 hex literals (not the ~12–24/file originally estimated); 20 new CSS custom properties added to `src/index.css` (accent-shade, status, surface/modal, and banner-specific tokens) to preserve exact existing colors rather than coercing them. Two deliberate exceptions left as raw hex: `ProfilePage.jsx`'s `SKILL_OPTIONS` colors (consumed via `` `${color}18` `` hex-alpha-suffix string concatenation — a CSS var would silently break to an invalid value) and 3 of 5 values in the decorative, name-hash-indexed avatar-fallback palette (single-use, not worth a dedicated token). Verified via `grep`-based hex audit and manual diff review per file — **not** yet verified with `npm run lint` or in-browser (this session's sandbox has no `node`/`npm` on PATH); run `npm run lint` and a visual pass locally before considering this fully closed.

**Files:** `src/index.css`, `src/components/SnowfallBackground.jsx`, `src/App.jsx`

---

### TASK 0.3 — Shared UI component library

**Plan:** `sprints/sprint-8-ui-component-library.md`

- [x] `src/components/ui/Card.jsx` — base card with glass/solid variant
- [x] `src/components/ui/Badge.jsx` — tier badge (Elite/Very Good/Good/Okay/Poor/Closed)
- [x] `src/components/ui/Button.jsx` — primary, secondary, ghost, danger variants
- [x] `src/components/ui/ScoreRing.jsx` — circular powder score display
- [x] `src/components/ui/SnowStat.jsx` — labeled stat with icon (used on resort cards)
- [x] Mountain silhouette / snow texture CSS utility classes for card backgrounds (`.texture-mountain-silhouette` in `src/index.css`)

**Files:** `src/components/ui/` directory

---

### TASK 0.4 — Landing page & onboarding redesign

**Plan:** `sprints/sprint-9-landing-onboarding-redesign.md`

- [x] Apply chosen theme to `LandingPage.jsx`
- [x] Hero: full-bleed mountain gradient, app name, tagline ("Chase more powder days")
- [x] Feature highlights: Conditions · Crew Planning · Session Tracking
- [x] Match `OnboardingFlow.jsx` visual style to chosen theme

**Files:** `LandingPage.jsx`, `OnboardingFlow.jsx`

---

## SECTION 1 — UX Cleanup Completion

Remaining tasks from `UX_CLEANUP.md`. These ship first to establish a clean foundation before new features land.

### TASK 1.1 — Simplify Home to 3-card feed `[UX Task 4]`

**Plan:** `sprints/sprint-10-home-3-card-feed.md`

- [x] Remove messaging panel from `HomeDashboard.jsx` (right column on desktop)
- [x] Remove leaderboard ticker from `HomeDashboard.jsx`
- [x] Drop `getDMConversations`, `getMyTripConversations`, `markDMsRead`, `getLeaderboard` imports (unused after removal) — `getMyCrews` intentionally kept, still used by Card 3's crew list
- [x] **Card 1 — Today's Best Mountain:** top-scoring resort with powder score, snow totals, drive risk, "View All Resorts →" link to Snow tab
- [x] **Card 2 — Your Next Trip / pending invite:** pending invite shown first with Accept/Decline inline; otherwise next upcoming trip with RSVP count; empty state → "Plan a ski day" CTA opens `CreateTripModal`
- [x] **Card 3 — Who's Skiing Today:** compact crew list from `TodaysCrew` data; empty state → "Be the first to check in today →" CTA

**Files:** `HomeDashboard.jsx`

---

### TASK 1.2 — Move Today check-in to Home; remove from Plans `[UX Task 5]`

**Plan:** `sprints/sprint-11-move-checkin-to-home.md`

- [x] In `HomeDashboard.jsx`, add "Check In Today" CTA above Card 1 (visible only if user hasn't checked in today — check `daily_plans` for today's date)
- [x] Import and render `SkiCheckInForm` in a collapsed/expandable card on Home
- [x] In `SkiPlansPage.jsx`, remove "Today" sub-tab: `["trips", "today", "calendar"]` → `["trips", "calendar"]`
- [x] Remove the `activeSubTab === "today"` render block from `SkiPlansPage.jsx`
- [x] Remove `SkiCheckInForm` and `TodaysCrew` imports from `SkiPlansPage.jsx` if no longer used
- [x] Confirm `SkiPlansPage` defaults `activeSubTab` to `"trips"`

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

**Note:** Tasks 2.1 and 2.4 are covered by the Strava/GPS-tracking sprint series (`sprints/sprint-3-gps-tracker-hook.md` and `sprints/sprint-4-active-session-ui.md`), which also builds `migrations/010_ski_runs.sql`. All of sprints 1–6 are now merged.

### TASK 2.1 — Extend `ski_sessions` schema + create `ski_runs` table

- [x] Create `migrations/010_ski_runs.sql`
- [x] Add columns to `ski_sessions`: `runs_logged INT DEFAULT 0`, `lifts_ridden INT DEFAULT 0`, `top_speed_mph DECIMAL(5,1)`, `avg_speed_mph DECIMAL(5,1)`, `time_on_mountain_min INT`, `time_on_lifts_min INT`, `longest_run_ft INT`, `calories_burned INT`, `session_started_at TIMESTAMPTZ`, `session_ended_at TIMESTAMPTZ`
- [x] Create `ski_runs` table: `id`, `session_id` (FK → ski_sessions, CASCADE), `run_type` (run | lift | hike), `run_number`, `started_at`, `ended_at`, `vertical_ft`, `distance_mi`, `speed_max_mph`, `speed_avg_mph`, `lift_name`, `gps_track JSONB`
- [x] Add RLS policies: authenticated users can read own runs; owner can write
- [x] Run migration against Supabase

**Files:** `migrations/010_ski_runs.sql`

---

### TASK 2.2 — Update `get_leaderboard` RPC to include new stats

**Plan:** `sprints/sprint-12-leaderboard-rpc-v2.md` (depends on sprint-3 executed)

- [x] Create `migrations/011_leaderboard_rpc_v2.sql` — update the RPC to aggregate new columns:
  - `top_speed_mph` → MAX across sessions
  - `longest_run_ft` → MAX
  - `total_runs` → SUM of `runs_logged`
  - `total_lifts` → SUM of `lifts_ridden`
  - `time_on_mountain_min` → SUM
- [x] Update `src/lib/leaderboardApi.js` — add new fields to the mapped return object

**Files:** `migrations/011_leaderboard_rpc_v2.sql`, `src/lib/leaderboardApi.js`

---

### TASK 2.3 — Enhanced "Log a Day" UI

Upgrades existing check-in so users can capture rich session stats after the fact.

**Plan:** `sprints/sprint-13-enhanced-log-a-day.md` (depends on sprint-3 executed) — **correction:** the file below was wrong. `SkiCheckInForm.jsx` writes to `daily_plans` (the forward-looking "I'm skiing today" planner) — a different data model entirely. The actual retroactive day-logging UI that calls `logSkiDay()` is `LogDayModal`, defined inside `LeaderboardPage.jsx`. The plan targets the correct file.

- [x] After basic check-in submission, show an optional "Add your stats" step inline
- [x] Fields: Runs skied (number), Vertical feet, Miles, Top speed (mph), Powder day toggle, Notes
- [x] "I'll add stats later" skip link — saves the basic check-in immediately
- [x] On Profile's session history, show ✏️ edit icon on sessions with no stats yet
- [x] Update `updateSessionStats()` helper for the edit-later flow (new — `logSkiDay()` itself is unchanged)

**Files:** `LeaderboardPage.jsx` (`LogDayModal`), new `SessionStatsForm.jsx`, `src/lib/leaderboardApi.js`, `ProfilePage.jsx`

---

### TASK 2.4 — Active Session Mode ("I'm Skiing Now")

Live in-day tracking flow — the most differentiated new UI pattern.

- [x] "Start My Day" button on Home (replaces/expands check-in CTA when conditions suggest user is at a resort)
- [x] Creates session record with `session_started_at = NOW()`
- [x] Build `ActiveSessionBar.jsx` — persistent floating bar while session is active: `⛷️ Active · 2h 14m · 8 runs`
- [x] Tapping bar opens **Session Sheet**: run counter (+ / −), lift counter, vertical estimate input, quick notes
- [x] "End My Day" → triggers `SessionRecapModal.jsx`
- [x] `SessionRecapModal.jsx`: shows stats summary card + "Share" CTA (hooks into Task 5.1) + "Log to history" confirmation
- [x] Wire session bar into `App.jsx` so it persists across tab switches

**Files:** `HomeDashboard.jsx`, new `ActiveSessionBar.jsx`, new `SessionRecapModal.jsx`, `src/lib/leaderboardApi.js`, `App.jsx`

---

## SECTION 3 — Season Analytics & History

### TASK 3.1 — Season Passport upgrade on Profile

**Plan:** `sprints/sprint-14-season-passport-upgrade.md` (depends on sprint-3 executed)

- [x] Add new stat tiles to `SeasonStatsCard` in `ProfilePage.jsx`: Total Runs, Top Speed, Time on Mountain
- [x] Season-over-season delta row: "↑ 4 more days than last season" (compare current vs. prior `startYear`)
- [x] "All-time" toggle: switches stats display between current season and lifetime totals
- [x] Add `getAllTimeStats(userId)` function to `leaderboardApi.js`

**Files:** `ProfilePage.jsx`, `src/lib/leaderboardApi.js`

---

### TASK 3.2 — Session history + calendar heatmap

**Plan:** `sprints/sprint-15-session-history-calendar.md` (depends on sprint-13)

- [x] Build `SeasonCalendar.jsx` — GitHub-style grid of the ski season (Oct–Apr), each day colored by: no session (dark), session (blue), powder day (teal)
- [x] Clicking a day expands an inline detail card: resort emoji, date, vertical, runs, top speed, powder badge
- [x] Toggle between Calendar view and List view on Profile's session history section
- [x] List view: per-session row with all stats; ✏️ edit icon calls back to Task 2.3 stats form

**Files:** `ProfilePage.jsx`, new `SeasonCalendar.jsx`

---

## SECTION 4 — Leaderboard Expansion

### TASK 4.1 — Expand to 8-stat leaderboard

Currently tracks: days, resorts, powder days, vertical, miles.
Add: top speed, longest run, most lifts, time on mountain.

**Plan:** `sprints/sprint-16-8-stat-leaderboard.md` (depends on sprint-12) — lands on 8 tabs (drops "resorts" as a separate tab in favor of the 4 new stats; see the plan for reasoning)

- [x] Add stat tab switcher to `LeaderboardPage.jsx`: `Days | Vertical | Speed | Distance | Time`
- [x] Each tab re-sorts the leaderboard rows by that stat with rank numbers
- [x] Surface new stats in each leaderboard row (secondary stat below the primary)
- [x] Confirm `get_leaderboard` RPC (Task 2.2) returns all new fields

**Files:** `LeaderboardPage.jsx`, `src/lib/leaderboardApi.js`

---

### TASK 4.2 — Emoji reactions on leaderboard entries

**Plan:** `sprints/sprint-17-leaderboard-reactions.md` (depends on sprint-16)

- [x] Create `migrations/012_leaderboard_reactions.sql`: `leaderboard_reactions` table (id, user_id, target_user_id, stat_type, emoji, season, UNIQUE(user_id, target_user_id, stat_type, season))
- [x] Add RLS: authenticated users can read all reactions; owner can write own
- [x] Reaction bar in each leaderboard row: 🎿 ❄️ 🔥 👑 — one-tap; own reaction highlighted; count shown
- [x] Add `addLeaderboardReaction()` and `getLeaderboardReactions()` to `leaderboardApi.js`

**Files:** `LeaderboardPage.jsx`, `migrations/012_leaderboard_reactions.sql`, `src/lib/leaderboardApi.js`

---

## SECTION 5 — Sharing & Viral Growth

### TASK 5.1 — Post-session share card

**Plan:** `sprints/sprint-18-session-share-card.md` — **correction:** `ShareStatCard.jsx` already renders via native Canvas 2D (not a styled `<div>`) and already exports via `canvas.toDataURL()`, not `html2canvas` (no such dependency exists or is needed). The plan extends the existing Canvas component with a new per-session mode rather than rewriting it.

- [x] Extend `ShareStatCard.jsx` with a per-session mode: resort hero photo, stat grid, PowderDays logo watermark (season mode, unchanged, already has all of this)
- [x] Stats shown: resort name, date, vertical feet, runs, top speed, powder day badge (❄️)
- [x] Export via existing Canvas `toDataURL()` → PNG download (no new dependency)
- [x] Native share sheet via `navigator.share()` if supported (iOS Safari); fallback to download
- [x] Trigger from: `SessionRecapModal.jsx` "Share" button, Profile session history row "Share" icon

**Files:** `ShareStatCard.jsx`, `SessionRecapModal.jsx`, `ProfilePage.jsx`

---

### TASK 5.2 — Season milestone notifications

**Plan:** `sprints/sprint-19-season-milestones.md` (depends on sprint-14)

- [x] Define milestone thresholds: 10 days, 25 days, first powder day, 50k vertical, 100k vertical, 100 runs, 5 resorts
- [x] On Profile load, compare previous stats to current — if a milestone is newly crossed, show a modal
- [x] Milestone modal: celebratory card with the achievement + "Share" CTA reusing `ShareStatCard.jsx`
- [x] Store `last_milestone_shown` in `localStorage` to avoid re-triggering on every load

**Files:** `ProfilePage.jsx`, `ShareStatCard.jsx`

---

### TASK 5.3 — Activity feed

**Plan:** `sprints/sprint-20-activity-feed.md` — **correction:** uses app-level inserts (matching the existing `notifications` table's established pattern), not DB triggers — this codebase has no DB-trigger precedent anywhere, and app-level `logActivity()` calls after each action is lower-risk and functionally equivalent.

- [x] Create `migrations/013_activity_feed.sql`: `activity_feed` table (id, actor_id FK profiles, type TEXT, subject_id UUID, subject_type TEXT, metadata JSONB, created_at) + `activity_feed_reactions` table
- [x] Add app-level `logActivity()` calls (not DB triggers): `logSkiDay()` success → entry; "going" RSVP → entry; trip creation → entry
- [x] Add RLS: authenticated users can read feed entries from accepted friends + self
- [x] Build `ActivityFeed.jsx` — chronological list of friend activity with avatars, relative timestamps, inline emoji react
- [x] Surface feed in Social tab (`MessagingCenter.jsx`), as a new sub-tab alongside Chats and Friends

**Files:** new `ActivityFeed.jsx`, `MessagingCenter.jsx`, `migrations/013_activity_feed.sql`, `src/lib/socialApi.js`

---

## SECTION 6 — Social Proof on Dashboard

### TASK 6.1 — "Friends going this weekend" badge on resort cards

**Plan:** `sprints/sprint-21-friends-going-badge.md`

- [x] In `App.jsx`, compute `friendTripsByResort` map: upcoming trip RSVPs (next 7 days) grouped by `resort_key` → list of friend profiles going
- [x] Pass map down to resort card render
- [x] On each resort card: show "N friends going this weekend" with stacked avatars if N > 0
- [x] Tapping badge → small popover listing friend names

**Files:** `App.jsx`, `src/lib/socialApi.js` (add `getFriendUpcomingTripsByResort()`)

---

### TASK 6.2 — Community activity signal on resort cards

**Plan:** `sprints/sprint-22-community-activity-signal.md`

- [x] Add Supabase RPC `get_resort_activity_counts(from_date)` → returns `{resort_name, session_count}` for last 7 days
- [x] Create `migrations/014_resort_activity_rpc.sql`
- [x] On each resort card: show "X users skied here this week" as a secondary badge (only if count > 0)

**Files:** `App.jsx`, `migrations/014_resort_activity_rpc.sql`

---

## SECTION 7 — Powder Alert System

### TASK 7.1 — Powder alert preference on Profile

**Plan:** `sprints/sprint-23-powder-alert-preference.md`

- [x] Create `migrations/015_powder_alerts.sql`: add `powder_alerts_enabled BOOLEAN DEFAULT false` and `alert_phone TEXT` to `profiles`
- [x] Add toggle to Profile settings: "📧 Weekly powder forecast every Wednesday"
- [x] Phone number field (optional, labeled "For future SMS alerts")
- [x] Wire to `upsertMyProfile()` in `socialApi.js`

**Files:** `ProfilePage.jsx`, `migrations/015_powder_alerts.sql`, `src/lib/socialApi.js`

---

### TASK 7.2 — Wednesday powder briefing cron job

**Plan:** `sprints/sprint-24-wednesday-briefing-cron.md` (depends on sprint-23) — includes a new `server/powderScore.js` porting the PRD's powder-score formula server-side (doesn't exist there today) and a refactor of `server/index.js`'s route handlers into callable functions.

- [x] Create `server/cron.js` — scheduled to run 7 AM MT every Wednesday (`0 14 * * 3` UTC)
- [x] Query Supabase for all profiles with `powder_alerts_enabled = true`
- [x] Fetch live powder scores for all open resorts via internal `/api/resort-conditions`
- [x] Compose briefing: top 3 resorts with tier + projected snowfall, single "Best Bet" resort with one-line reason, weekend outlook (Fri–Sun)
- [x] Send via Resend to each subscriber (batch, with per-email error handling)
- [x] Create `server/emailTemplates.js` — HTML email template with branding
- [x] Register cron in `server/index.js`
- [x] Add `F-REQ-ALERT-003` guard: skip send entirely if zero resorts are open

**Files:** `server/cron.js`, `server/emailTemplates.js`, `server/index.js`

---

### TASK 7.3 — Unsubscribe flow

**Plan:** `sprints/sprint-25-unsubscribe-flow.md` (depends on sprint-24)

- [x] Each briefing email includes a signed unsubscribe link: `/api/unsubscribe?token=<signed_jwt>`
- [x] Backend: `GET /api/unsubscribe` validates token, sets `powder_alerts_enabled = false` for that user
- [x] Returns minimal HTML page: "You've been unsubscribed. Click here to re-enable alerts."
- [x] Re-enable link hits `GET /api/resubscribe?token=<signed_jwt>` and sets flag back to `true`

**Files:** `server/index.js`

---

## SECTION 8 — Enhanced Conditions Data

### TASK 8.1 — 7-day snowfall forecast panel on resort cards

**Plan:** `sprints/sprint-26-7day-forecast-panel.md` — **correction:** numeric snowfall-inches data comes from `/api/nws/snow` (grid data), not `/api/nws/forecast` (text-only periods) — the plan bucket-sums the existing snow-grid data by day rather than parsing forecast text.

- [x] Confirm NWS 7-day forecast data is accessible (sourced from `/api/nws/snow` grid data, not `/api/nws/forecast` text — see correction above)
- [x] On each resort card, add expandable "This Week ▾" row
- [x] 7 mini day-bars: day label + snowfall amount (inches); bar height proportional to max expected
- [x] Highlight the highest-snowfall day: "Best day: Saturday ❄️ 6–10""
- [x] Collapsed by default; expand on tap

**Files:** `App.jsx`

---

### TASK 8.2 — Vibe Score

**Plan:** `sprints/sprint-27-vibe-score.md` — scoped community-wide (all users), not friends-only, to stay distinct from Task 6.1's friends-only badge; see the plan for reasoning.

- [x] Add `getResortVibeData()` to `socialApi.js`: queries check-ins (last 7 days) + upcoming RSVPs per resort
- [x] Compute vibe formula client-side: `(check-ins × 2) + (upcoming RSVPs × 3) + (powder_score × 0.2)`, normalized 0–100
- [x] Tier labels: 🔥 High (70+) / 👍 Active (40–69) / 😶 Quiet (<40)
- [x] Show as secondary badge on resort card alongside Powder Score
- [x] Tooltip on hover/tap: "Based on friend activity and recent check-ins"

**Files:** `App.jsx`, `src/lib/socialApi.js`

---

## SECTION 9 — Live & Real-time Features

### TASK 9.1 — GPS run tracking (browser Geolocation API)

**Plan:** covered by `sprints/sprint-3-gps-tracker-hook.md`, `sprints/sprint-4-active-session-ui.md`, and `sprints/sprint-5-gpx-strava-upload.md` (existing series — all merged).

*Depends on Task 2.4 (Active Session Mode) being complete.*

- [x] Create `src/lib/useGpsTracker.js` hook: wraps `navigator.geolocation.watchPosition()`, accumulates position samples
- [x] Auto-detect lift vs. run: upward altitude delta + speed ≤ 15 mph = lift; downward + speed ≥ 10 mph = run; else = rest
- [x] Each detected segment → creates a `ski_runs` row with GPS track JSONB
- [x] Cache GPS points in `sessionStorage` during session (offline resilience); flush to Supabase on end
- [x] Display GPS track as polyline on PowderMap after session ends
- [x] Gate the feature: show "GPS tracking requires location permission" prompt on session start

**Files:** new `src/lib/useGpsTracker.js`, `ActiveSessionBar.jsx`, `PowderMap.jsx`

---

### TASK 9.2 — Live friend location sharing (opt-in)

**Plan:** `sprints/sprint-28-live-friend-location.md` (hard dependency on sprints 3 AND 4 both being executed first — not just planned)

*Depends on Task 9.1 (GPS tracking) being complete.*

- [x] During active session: "Share my location with friends" toggle in Session Sheet
- [x] When enabled: broadcast position every 30s via Supabase Realtime channel `mountain:live:{userId}`
- [x] PowderMap subscribes to live channels for all accepted friends with active sessions
- [x] Render friend location as labeled pin on map: avatar initial + name
- [x] Privacy: location only visible to accepted friends; stops broadcasting when session ends or toggle off
- [x] Show "N friends on mountain now" count in Who's Skiing Today card on Home

**Files:** `PowderMap.jsx`, `HomeDashboard.jsx`, `ActiveSessionBar.jsx`, new `src/lib/useLiveFriendLocations.js` — **note:** shipped as a shared hook (`useLiveFriendLocations.js`) consumed directly by `PowderMap.jsx`/`HomeDashboard.jsx` rather than the standalone `LiveCrewMap.jsx` component this plan originally proposed.

---

## SECTION 10 — User Theme Switching

### TASK 10.1 — User theme switching (MVP) — ✅ COMPLETE 2026-08-08

**Plan:** ad-hoc, planned via `EnterPlanMode` same session (no `docs/superpowers/` spec/plan for this one).

Research before implementation found the original scope note ("just CSS variable extraction") undersold it: ~580 raw hex literals exist across 47 files outside the 3 files Track B tokenized, and `Badge.jsx`'s `TIER_COLORS`/`RISK_COLORS` had the same hex-alpha-suffix hazard Track B found in `SKILL_OPTIONS`. Scoped as an explicit MVP rather than full app-wide tokenization — see "Outstanding" below.

- [x] `migrations/024_theme_preference.sql` — adds `theme TEXT NOT NULL DEFAULT 'blizzard'` to `profiles` with a `CHECK` constraint on the 5 theme keys — applied to live Supabase 2026-08-08
- [x] 4 new `[data-theme="..."]` blocks in `src/index.css` (Alpine Dawn, Storm Chaser, Aurora Peak, Base Lodge) redefining every color/gradient/shadow token the existing Blizzard `:root` block defines, derived from `mockups/theme-{1,3,4,5}-*.html` using the same alpha/derivation relationships Blizzard itself uses. Status colors and a few semantic-adjacent gradients stay theme-invariant by design.
- [x] Fixed `ui/Badge.jsx`'s `TIER_COLORS`/`RISK_COLORS` hex-alpha-suffix hazard (`` `${color}33` `` broke under a CSS var) — 6 new theme-invariant `--rating-*`/`--rating-*-border` token pairs replace the string-concat pattern; `ui/ScoreRing.jsx`'s ring gradient and tier-color fallback also tokenized while touching the file
- [x] `src/lib/socialApi.js`'s `upsertMyProfile()` now carries `theme` through; audited all 4 call sites — 2 already spread `...profile` (safe), 2 are onboarding-only (blizzard default is correct), and `ProfilePage.jsx`'s `EditProfileModal.handleSave()` (which hand-lists fields) got `theme` added explicitly to avoid silently resetting a user's theme to Blizzard on an unrelated profile edit — caught during implementation, not part of the original plan
- [x] Theme picker: 5-swatch section in `ProfilePage.jsx` (instant local apply + `localStorage` + DB persist on tap, per spec)
- [x] `index.html` flash-of-wrong-theme mitigation (inline script reads `localStorage` before first paint) + `App.jsx` reconciliation effect (DB is source of truth, overwrites on every profile load/auth change)

**Outstanding:**
1. **This is an MVP, not full app-wide theming.** Only what was already on CSS tokens repaints correctly: Home, Leaderboard, Profile, and the `ui/` primitives touched here. Everything else — `App.jsx`'s own resort-card rendering (`tierColor()`/`riskColor()`/`vibeTier()`/`scoreGradient()`), trip modals, messaging/crew chat, landing/onboarding, PowderMap, Mountain Page/Board, `SkiPlansPage.jsx`'s `DOT_COLORS`, `DirectMessageView.jsx`'s `SKILL_COLORS`, and the decorative avatar-fallback palettes — stays Blizzard-blue regardless of the picked theme. A full app-wide tokenization pass is a separate, much larger future effort (roughly on the order of the Premium UI Uplift sprint), not scheduled.
2. No `npm`/`node` available in the session's sandbox — changes verified via `grep`-based hex audits, manual diff review, and brace/paren balance checks only. `npm run lint` and a visual pass across all 5 themes (tap each swatch on Profile, confirm Home/Leaderboard/Profile/nav/badges repaint) haven't been run/confirmed yet — do that before treating this as fully verified end-to-end.

**Files:** `migrations/024_theme_preference.sql`, `src/index.css`, `src/components/ui/Badge.jsx`, `src/components/ui/ScoreRing.jsx`, `src/lib/socialApi.js`, `src/components/ProfilePage.jsx`, `index.html`, `src/App.jsx`

---

## SECTION 11 — Mountain Board

### TASK 11.1 — Location-gated public feed per resort

**Plan:** `sprints/sprint-29-mountain-board.md` — no dependencies, can start immediately.

A public, per-resort message board: any logged-in user can *read* posts for any resort, but can only *post* if their device's current GPS position is within that resort's geofence. Supports free-text posts with a category tag (Safety / Lost & Found / Social / General).

- [x] Create `migrations/020_mountain_board.sql`: `mountain_board_posts`, `mountain_board_reports`, `resort_coordinates` tables — applied to live Supabase project 2026-08-03
- [x] Add `public.haversine_miles` Postgres function (server-side distance check — never trust a client-computed distance)
- [x] Add `create_board_post` and `report_board_post` `SECURITY DEFINER` RPCs — all writes go through these, no direct table `INSERT` policy on either table; both explicitly `REVOKE ... FROM PUBLIC` before granting to `authenticated`
- [x] Build board UI: category tags (Safety / Lost & Found / Social / General), post composer gated on GPS proximity, read view open to all logged-in users — verified working end-to-end 2026-08-04 (see Section 12 below for two production bugs found and fixed along the way)

**Files:** `migrations/020_mountain_board.sql`, new board UI component(s), `src/lib/socialApi.js` (or new `mountainBoardApi.js`)

---

## SECTION 12 — Mountain Page Architecture & Krames Butte Dev Resort

**Not in ROADMAP.md when started** — grew out of a brainstorming session about giving the app owner a permanent, private testing ground for new per-resort features, using the Mountain Board (Section 11) as the first thing to test against it.

**Spec:** `docs/superpowers/specs/2026-08-03-krames-butte-dev-resort-design.md`
**Plan:** `docs/superpowers/plans/2026-08-03-mountain-page-krames-butte.md` (executed via `superpowers:subagent-driven-development`)

A private, owner-only fake resort ("Krames Butte") that bypasses the Mountain Board's GPS geofence for testing, plus a reusable per-resort "Mountain Page" (Facebook-Page-style cover header + tab bar, driven by a one-array widget registry) that future per-resort features get built and iterated against before being promoted to every real resort via a one-line config change.

- [x] `migrations/021_krames_butte_dev_resort.sql` — Krames Butte resort row, owner-only geofence bypass in `create_board_post`, RLS restricting `kramesbutte` rows to the owner
- [x] `MountainBoard.jsx` — owner-gated "🧪 Krames Butte (Dev)" chip in the standalone Board tab, plus a `resortKey` locking prop so it can be embedded as a per-resort widget
- [x] `src/lib/mountainPageWidgets.js` + `MountainPage.jsx` — widget registry and the page shell (cover header, tab bar, feed-first default tab); Mountain Board wired in as the first widget
- [x] `App.jsx` — Mountain Page navigation state, "🏔️ Mountain Page →" entry point on every resort card, owner-only Krames Butte banner on the Snow tab
- [x] **Critical bug found by final review, fixed same session:** migration 021's RLS policies referenced `auth.users` directly, which the `authenticated` role can't read — broke Mountain Board reads for *every* resort in production, not just Krames Butte. Fixed via `migrations/022_fix_kramesbutte_rls_auth_users.sql` (moved the check into a `SECURITY DEFINER` helper function), verified with a role-switched query against the live database rather than trusting "migration applied successfully."
- [x] **Second bug found via live user testing, fixed same session:** `getBoardPosts()` used a PostgREST embedded select (`profiles:author_id(...)`) through a foreign key that never existed (`author_id` only references `auth.users`, never `profiles`) — every board read 400'd since Sprint 29 first shipped, silently swallowed into "no posts yet" until the RLS fix's error-surfacing change made it visible. Fixed in `src/lib/socialApi.js` by resolving posts and profiles as two separate queries, matching this file's own established pattern elsewhere.
- [x] Verified working end-to-end by the app owner 2026-08-04

**Files:** `migrations/021_krames_butte_dev_resort.sql`, `migrations/022_fix_kramesbutte_rls_auth_users.sql`, `src/components/MountainBoard.jsx`, `src/components/MountainPage.jsx`, `src/lib/mountainPageWidgets.js`, `src/lib/socialApi.js`, `src/App.jsx`

---

## SECTION 13 — Premium UI Uplift

**Not in ROADMAP.md when started** — grew out of a design review of Stitch-generated mockups (`mockups/Stitch_Premium_Redesigns/`), scoped and executed as its own sprint outside the numbered `sprints/` files, same pattern as Section 12.

**Spec:** `docs/superpowers/specs/2026-08-06-premium-ui-uplift-design.md`
**Plan:** `docs/superpowers/plans/2026-08-06-premium-ui-uplift.md` (14 tasks, executed via `superpowers:subagent-driven-development` in an isolated worktree)

Visual redesign toward the mockups' premium look across Mountain Page, Crew/Plans, Home, Social Feed, and Profile — six new shared `ui/` primitives (`HeroPhotoHeader`, `StatStrip`, `AccentCard`, `EventCard`, `AvatarStatusRail`, `accentColors.js`) built once and reused across screens, plus a new Mountain Page Events feature.

- [x] Mountain Page: hero/scrim treatment, "Mountain Stats" strip, restyled Bulletin board with per-category accent colors, new Events widget (`migrations/023_mountain_events.sql`, Krames-Butte-only rollout — migration applied live 2026-08-08, verified by creating a real event for Krames Butte)
- [x] Crew/Plans (mobile): "Active Crew" avatar-status rail (resurrected `TodaysCrew.jsx`'s data logic, which had been orphaned since sprints 10/11), restyled trip strip, full-width primary CTA on mobile
- [x] Home dashboard: "Today's Best Mountain" card enlarged/restyled; "Ready to ski?" hero rebuilt around a real photo + floating glass-panel CTA (follow-on refinement after initial ship — see below)
- [x] Social Feed: existing text-based activity feed restyled with accent cards (explicitly *not* rebuilt as a photo/route-map feed — that would need new storage/upload infrastructure, out of scope)
- [x] Profile: season-stat tiles and session-history row spacing restyled
- [x] Snow tab resort cards: badge/metric-tile visual polish only, zero functional regression (highest-risk task in the plan — verified via diff-only footprint against every existing feature: collapsible details, travel alerts, forecast panel, action buttons)
- [x] Final whole-branch review caught and fixed 6 real issues before merge, cheapest possible timing since the migration wasn't live yet: `mountain_events` had no DELETE policy (nobody could ever remove a posted event), `link_url` had no scheme validation (stored redirect vector), a 3-color positional cycler was reused as a 4-category semantic color map on the Mountain Board (safety/general collided on the same color), `getMountainEvents` had no upcoming-date filter, plus two minor spacing/null-guard fixes
- [x] **Follow-up round (same day, post-merge):** live comparison against the Home Page mockup once real browser automation became available (see below) — rebuilt the hero as a photo background with a floating semi-transparent glass CTA panel, gave `ScoreRing` a gradient stroke + optional inside-ring label/tier text, replaced all bottom/top nav emoji with outline SVG icons (`src/components/ui/NavIcons.jsx`)
- [x] **Process incidents, both recovered with no work lost:** two different implementer subagents (Tasks 4 and 8) had their commits land on `main` instead of the worktree — traced to each subagent's shell tool resetting to a default working directory between separate Bash calls, so an earlier `cd` didn't persist to a later `git commit`. Recovered via `git cherry-pick` onto the worktree branch each time; all later dispatches were given explicit "anchor every git command with `-C <path>` or a single chained `cd && cmd`" instructions, which fully resolved it. During the second recovery, `git reset --hard` was run on `main` without first inspecting uncommitted changes `git status` had just shown — content was almost certainly redundant (confirmed via diff against what was already safely on the worktree branch) but this could not be proven with certainty since the discarded working-tree diff is unrecoverable. See `[[project_2026_08_06_premium_ui_uplift_session]]` for the full account.
- [x] **New capability unlocked mid-sprint:** real browser automation now works in this sandbox (Playwright + `channel: 'chrome'`, driving the system's installed Chrome instead of downloading an unsupported bundled Chromium) — used to log in with a dedicated test account and visually verify the redesign end-to-end, not just at the code/diff level. See `[[project_browser_automation]]`.

**Files:** `docs/superpowers/plans/2026-08-06-premium-ui-uplift.md`, `migrations/023_mountain_events.sql`, `src/components/ui/{HeroPhotoHeader,StatStrip,AccentCard,EventCard,AvatarStatusRail,accentColors,NavIcons}.jsx`, `src/components/{MountainPage,MountainBoard,EventsWidget,SkiPlansPage,HomeDashboard,ActivityFeed,ProfilePage}.jsx`, `src/App.jsx`, `src/lib/socialApi.js`

**Outstanding:** none — `migrations/023_mountain_events.sql` was applied to the live Supabase project by the app owner on 2026-08-08 and verified end-to-end (Events tab loads, event creation works for Krames Butte).

---

## SECTION 14 — Trust Tier & Verification Infrastructure

**Not in ROADMAP.md when started** — Sprint 30, tracked in `sprints/sprint-30-verification-infrastructure.md`. Shared verification/moderation plumbing that Sprint 31 (Ski Buddy Board) gates writes on. No new user-facing board ships in this sprint — pure infrastructure, zero UX change for existing Tier 0 users.

**Plan:** `docs/superpowers/plans/2026-08-13-sprint-30-verification-infrastructure.md` (8 tasks, executed via `superpowers:subagent-driven-development` in an isolated worktree, including a final whole-branch review that caught and fixed a real bug before merge)

- [x] `migrations/026_verification_infrastructure.sql` — `user_verification`, `content_reports`, `moderation_flags` tables; `is_verified()`, `mark_oauth_linked()`, `mark_phone_verified()`, `report_content()` `SECURITY DEFINER` RPCs matching Sprint 29's `search_path`/`revoke`/`grant` convention; `profiles.username` profanity `CHECK` constraint — applied live 2026-08-13
- [x] `migrations/027_report_content_dedupe.sql` — `UNIQUE (reporter_id, target_type, target_id)` on `content_reports` + `ON CONFLICT` dedupe in `report_content()`, found by final review (one account could file unlimited duplicate reports) — applied live 2026-08-13
- [x] OAuth identity linking (Google/Facebook via `supabase.auth.linkIdentity`) and phone verification (`updateUser`/`verifyOtp(type:"phone_change")`, not the existing sign-in OTP pair) — new functions in `src/lib/socialApi.js`
- [x] `VerificationUpgradeModal.jsx` — combined OAuth + phone upgrade flow
- [x] `server/moderation.js` — OpenAI Moderation API integration, ready for Sprint 31 to wire in (see Outstanding below)
- [x] Client-side username profanity check (`leo-profanity`) at signup, backed by the DB-level `CHECK` as defense-in-depth
- [x] Owner-only "Test Verification Gate" stub in the Krames Butte dev area (`MountainBoard.jsx`) — exercises the full gate end-to-end without a real board existing yet
- [x] **Critical bug found by final review, fixed same session:** `supabase.auth.linkIdentity()`'s redirect returns fire `SIGNED_IN`/`INITIAL_SESSION`, never `USER_UPDATED` as the original plan assumed — verified against the installed `@supabase/auth-js` source, not just docs. The tier-sync chain silently didn't complete on OAuth-link return. Fixed by listening for all three events and making the test-gate button self-reconciling (`syncVerificationFromAuth()` instead of a stale `getMyVerificationTier()` read).
- [x] Other final-review fixes: `linkOAuthIdentity` now preserves the user's return URL (was resetting to app root); `syncVerificationFromAuth()` now self-heals the phone leg too (previously only OAuth), and the upgrade modal got a back-button + busy-state guard on its backdrop.
- [x] Supabase Dashboard → Authentication → "Allow manual linking" flipped on by Kyle (2026-08-13)

### TASK 14.1 — Configure Google/Facebook OAuth app credentials

Not code — external console setup in Google Cloud Console and Meta for Developers, needed before `linkOAuthIdentity()` can actually complete an OAuth link (it'll fail with "Unsupported provider" until each provider has a real Client ID/Secret entered in Supabase Dashboard → Authentication → Sign In / Providers). Worth its own guided session since each provider involves creating an app, setting a redirect URI, and (for Google) a consent screen.

- [ ] Create a Google Cloud Console OAuth app, get Client ID/Secret, add to Supabase → Authentication → Sign In / Providers → Google
- [ ] Create a Meta for Developers (Facebook) app, get App ID/Secret, add to Supabase → Authentication → Sign In / Providers → Facebook
- [ ] End-to-end test: owner-only "🔒 Test Verification Gate" button (Krames Butte dev area) should flip to `✅ Tier 1` after linking one provider + verifying phone

**Files:** none (Supabase Dashboard + Google Cloud Console + Meta for Developers configuration only)

**Outstanding:**
1. `/api/moderate-content` (the Express route wiring `server/moderation.js` into a live endpoint) was deliberately **not** wired up — zero callers exist until Sprint 31's board ships, and shipping an unattributed, unvalidated write endpoint into `moderation_flags` with no present-day use was assessed as unnecessary attack surface. Sprint 31 should wire the route with request attribution and input validation when a real caller exists.
2. A handful of Minor findings from the final review were deferred, not fixed: `leo-profanity`'s French/Russian dictionaries ship to every visitor (~40-50KB unused for an English-only check); `VerificationUpgradeModal.jsx` hardcodes `white`/`rgba(...)` literals instead of the theme tokens the Premium UI Uplift sprint (Section 13) established; missing indexes on `content_reports`/`moderation_flags`; a couple of FK `ON DELETE` actions worth a deliberate choice. None block Sprint 31.

**Files:** `migrations/026_verification_infrastructure.sql`, `migrations/027_report_content_dedupe.sql`, `src/lib/socialApi.js`, `src/lib/profanity.js`, `src/components/VerificationUpgradeModal.jsx`, `src/components/AuthForm.jsx`, `src/components/MountainBoard.jsx`, `src/App.jsx`, `server/moderation.js`, `server/index.js`

---

## SECTION 15 — Ski Buddy Board

**Plan:** `docs/superpowers/plans/2026-08-13-sprint-31-ski-buddy-board.md` (6 tasks, executed via `superpowers:subagent-driven-development` in an isolated worktree, including a final whole-branch review). Public matchmaking/carpool board gated on Sprint 30's `is_verified()` Tier 1 check: a verified user posts "skiing X resort on Y date, looking for Z riding style, offering/needing a carpool seat," other verified users respond, the post owner accepts/declines, an accepted response marks the post "Filled." Posts get a best-effort OpenAI moderation check on creation via the route Sprint 30 stubbed and this sprint wired up; a flagged post is held from public view (visible only to its own owner, marked "under review").

- [x] `migrations/028_ski_buddy_board.sql` — `ski_buddy_posts`/`ski_buddy_responses` tables, RLS (no `INSERT`/`DELETE` policy on either — all writes go through `SECURITY DEFINER` RPCs), `create_ski_buddy_post()`/`respond_to_ski_buddy_post()` RPCs, `valid_riding_styles()` CHECK function, `moderation_flags.submitted_by` column (closes the Sprint 30 attribution gap) — applied live 2026-08-13
- [x] `POST /api/moderate-content` (`server/index.js`) — re-wired from Sprint 30's stub now that a real caller exists; bearer-auth middleware matching `strava.js`'s pattern, attributes flags to the authenticated caller via `submitted_by`
- [x] `src/lib/skiBuddyOptions.js` + 7 new `src/lib/socialApi.js` functions (`createSkiBuddyPost`, `getSkiBuddyPosts`, `getMySkiBuddyPosts`, `respondToSkiBuddyPost`, `getSkiBuddyResponses`, `respondToSkiBuddyResponse`, `updateSkiBuddyPostStatus`)
- [x] `src/components/SkiBuddyBoard.jsx` — filterable public list + inline expand-in-place response threads
- [x] `src/components/PostSkiBuddyForm.jsx` — modal creation form
- [x] Wired into `App.jsx`'s Snow tab as a new "🎿 Buddy" sub-tab
- [x] **Two bugs found and fixed during per-task review, both latent in the plan's own verbatim code, not implementer deviations:** Task 1 — RLS `UPDATE` policies granted full-row write instead of just `status` (an owner could self-clear their own moderation hold, or rewrite another user's response message); fixed with column-scoped `REVOKE`/`GRANT UPDATE (status)`. Task 1 — `valid_riding_styles()` used `array_length(...) > 0`, which is `NULL` (not `false`) for an empty array, and Postgres CHECK constraints pass on `NULL` — silently allowing a post with zero riding styles; fixed with `COALESCE(array_length(...), 0) > 0`, live-verified.
- [x] **Task 4 fix round:** the filter-driven post list had no fetch-cancellation guard (fast filter-chip clicking could show stale results); the tier-gate modal dropped the user's original action after successful verification, forcing a second click. Both fixed to match established codebase idioms (`MountainBoard.jsx`'s cancellation pattern, `VerificationUpgradeModal.jsx`'s `onVerified` timing).
- [x] **Final whole-branch review (opus) found 4 Important issues, all fixed same session:** `respond_to_ski_buddy_post` didn't check `is_held_for_review` (a user holding a held post's UUID could still respond to it — inert when a prior task's reviewer deferred it, activated once this sprint's moderation-hold write landed), no timeout on the moderation fetch combined with an always-enabled modal close button (could produce duplicate posts against a hung moderation service), and a responder got zero feedback after submitting (dead code, silent no-op resubmission). Re-reviewed clean, including an independent live-DB read-back confirming the SQL fix actually deployed.

**Outstanding:**
1. ~~**`is_held_for_review` has no release mechanism anywhere in the codebase**~~ — **RESOLVED by TASK 15.1 (Sprint 32, 2026-08-13).** `release_held_post()` + `get_held_posts()` RPCs and an owner-only `ModerationQueue` panel now exist. See Section 16.
2. `OPENAI_API_KEY` is not yet set in Railway/`server/.env` — the moderation route degrades safely (post creation still succeeds, moderation just silently no-ops) but doesn't actually check anything against OpenAI yet. **TASK 15.1 has now landed, so it is safe to set this** — a false-positive flag is recoverable via the moderation queue. Still unset as of 2026-08-13; setting it is a deliberate manual step.
3. A handful of Minor findings from the final review were deferred, not fixed: dead `getMySkiBuddyPosts()` export (no caller yet — candidate for a future "my listings" view); `reportContent` uses `"post"` as its `target_type` here vs. `moderation_flags`' `"ski_buddy_post"` (harmless today, only caller in the codebase, but ambiguous if another board starts reporting under `"post"` too); accept/decline is two non-atomic writes (a deliberate cross-table-RLS-over-third-RPC tradeoff, not a bug); other pending responses on a post don't auto-decline once one is accepted; a freshly created post shows "Someone" as its author until the next reload; failed report submissions fail silently; a duplicated local `formatDate()` in `SkiBuddyBoard.jsx` instead of importing `lib/format.js`'s equivalent. None block this sprint.

### TASK 15.1 — Admin release mechanism for moderation-held posts — ✅ COMPLETE 2026-08-13 (Sprint 32)

`is_held_for_review` could only be set to `true` (by the moderation route) and never back to `false` — nothing in the codebase could un-hide a post once OpenAI's moderation API flagged it, even as a false positive. Blocked `OPENAI_API_KEY` from going live.

- [x] `release_held_post(p_post_id uuid)` `SECURITY DEFINER` RPC — admin-tier check via `is_admin()`, sets `is_held_for_review = false`. Idempotent; raises `NOT_ADMIN` / `POST_NOT_FOUND`.
- [x] `get_held_posts()` `SECURITY DEFINER` RPC — **not in the original plan, added during Sprint 32.** RLS hides held posts from everyone except their own author, so an admin release button would have had nothing to list. The release RPC alone would have been unusable.
- [x] `profiles.is_admin BOOLEAN NOT NULL DEFAULT false` — chosen over hardcoding the owner email in SQL so admin can be granted to a second person later without a migration.
- [x] `ModerationQueue.jsx` rendered in the owner-only Krames Butte dev area — lists held posts, Release button, optimistic removal with rollback + visible error state on failure.
- [ ] **Still open:** a held post's author gets no notification when it's released (or rejected). Deferred deliberately — revisit when notifications are reworked.

**Files:** `migrations/029_admin_moderation_release.sql`, `src/lib/socialApi.js`, `src/components/ModerationQueue.jsx`, `src/components/MountainBoard.jsx`

---

## SECTION 16 — Debt Clearing (Sprint 32)

**Plan:** `sprints/sprint-32-debt-clearing.md` — first sprint run on the Opus-plans/Sonnet-implements model from `Claude Code - Opus Planning Mode.md` rather than all-Opus subagents. One Haiku scout, one Opus plan, four Sonnet implementers (three in parallel), one Sonnet whole-branch review. Reusable agent definitions were added at `.claude/agents/{scout,implementer,reviewer,debugger}.md` during this sprint but **were removed afterward** — `.claude/` is gitignored, so they were never version-controlled, and Kyle briefly reverted to the superpowers flow before settling back on this model for Sprint 33.

- [x] **TASK 15.1** — see Section 15 above.
- [x] **Ski Buddy Board moved to Social, renamed "🎿 Community"** — removed from the Snow tab's sub-nav (Snow is now exactly 🏔️ Snow / 🗺️ Map / 📋 Board) and added as a 4th section in `FriendsPage.jsx` alongside Leaderboard / Crews / Friends. Label text only — `SkiBuddyBoard`, `ski_buddy_posts`, `skiBuddyOptions.js` and all RPC names are unchanged. Note: the rest of Kyle's nav-reorg note (Friends and Leaderboard living on the Social page) was **already implemented** — scouting found it in place before any work started.
- [x] **Defect 1 — notification popup clipped** (`defects/defects-1`). Two overlapping causes, both fixed; see the defects file for the full write-up.
- [x] **Defect 2 — milestone popups repeat** (`defects/defects-1`). Root cause was *when* localStorage was written, not that it was missing; see the defects file.
- [x] **Review fixes:** the admin render gate was `OWNER_EMAIL && isAdmin` (an AND), which would have prevented any future second admin from seeing the queue despite `profiles.is_admin` being the intended authority — changed to gate on `isAdmin` alone. `NotificationBell`'s fixed-position anchor was refreshed on `resize` only, going stale on scroll — added a capture-phase `scroll` listener.

**Verified during Sprint 32's review (both were flagged as suspected bugs and both came back clean — recording so they aren't re-investigated):**
- `getMyProfile()` uses `.select("*")`, so `profiles.is_admin` rides along with no extra round trip.
- `anon` and `service_role` hold pre-existing full-column `UPDATE` grants on `ski_buddy_posts` (migration 028 narrowed only `authenticated`). **Confirmed inert:** the sole UPDATE policy is scoped `TO authenticated`, so `anon` matches zero rows; `service_role` bypassing RLS is standard Supabase behavior and its key is never client-side. A `REVOKE UPDATE ON ski_buddy_posts FROM anon` is worthwhile hygiene but not urgent.

**Outstanding:**
1. `npm run lint` reports 92 problems (83 errors, 9 warnings) — **identical on `main` before this sprint**, verified by diffing lint output branch-vs-main. Entirely pre-existing baseline debt. Sprint 32 introduced zero new findings but also fixed none. Worth its own cleanup pass.
2. Author notification on moderation release — see TASK 15.1.

**Files:** `migrations/029_admin_moderation_release.sql`, `src/lib/socialApi.js`, `src/components/ModerationQueue.jsx`, `src/components/MountainBoard.jsx`, `src/App.jsx`, `src/components/FriendsPage.jsx`, `src/components/ProfilePage.jsx`, `src/components/NotificationBell.jsx`

---

## SECTION 17 — Close the `profiles` Strava Token Exposure (Sprint 33)

**Plan:** `sprints/sprint-33-profile-token-exposure.md`. `profiles` has two RLS SELECT policies, both `USING (true)` for `authenticated`, plus column-level SELECT grants on `strava_access_token`, `strava_refresh_token`, `strava_token_expires_at` — a Strava OAuth bearer credential. This was not merely permitted but actively happening: `getMyProfile()`, `getAcceptedFriends()`, `getReceivedCrewInvites()`, and `getSentCrewInvites()` all did `select("*")` on `profiles`, so opening the friends list shipped friends' Strava tokens into the browser.

- [x] `src/lib/socialApi.js` — replaced all four `select("*")` calls against `profiles` with explicit column lists. `getMyProfile()` (own row): `id, first_name, last_name, full_name, username, avatar_url, skill_level, sport_type, ski_passes, favorite_mountain, vehicle_label, vehicle_seats, powder_alerts_enabled, alert_phone, theme, is_admin, strava_athlete_id` — `strava_athlete_id` was added beyond the plan's starting list after grepping consumers: `App.jsx` reads `currentProfile?.strava_athlete_id` to gate the Strava-connected UI, so omitting it would have silently broken that check with no error. `getAcceptedFriends()`, `getReceivedCrewInvites()`, `getSentCrewInvites()` (other users' rows): `id, first_name, last_name, full_name, username, avatar_url` only.
- [x] **Flagged, not fixed:** `src/lib/leaderboardApi.js`'s `getLeaderboard()` reads `friend.skill_level` off `getAcceptedFriends()`'s result to backfill leaderboard rows for friends with no sessions this season. `skill_level` is outside the display-fields-only list above and is another user's profile field, so per the sprint's instruction it was not silently added — that value now comes back `undefined` there. Currently harmless: `LeaderboardPage.jsx` never renders `skill_level` from that path, so this is a dead field today, not a visible regression. Flagging as a design question: if a future consumer needs a friend's skill level, decide deliberately whether to widen `getAcceptedFriends()`'s column list app-wide or fetch it narrowly for that one caller (`getProfileById()` already includes `skill_level` for a single other user, so precedent exists either way).
- [x] **`migrations/030_profile_token_exposure.sql` — APPLIED 2026-08-14, but its `REVOKE` was a SILENT NO-OP.** The migration's column-level `REVOKE SELECT (strava_access_token, ...) ON profiles FROM authenticated, anon` returned success and did nothing. `authenticated` and `anon` hold **table-level** `SELECT` on `profiles`, and in Postgres a column-level `REVOKE` cannot subtract from a table-level grant — the table grant keeps conferring SELECT on every column, including any column added later. The SQL was valid, so it "succeeded." This was caught only because the grants were re-queried after applying instead of trusting the success response; both the pre-apply review and the plan had validated the migration's *contents* and missed that the mechanism could not work. **Note for future migrations: `information_schema.column_privileges` expands a table-level grant into per-column rows, so it will happily show a column as "granted" when no column-level grant exists. Use `has_table_privilege` / `has_column_privilege` to tell them apart.** The migration's policy-consolidation half *did* work (see below).
- [x] `migrations/031_profile_token_column_grants.sql` — the actual fix. `REVOKE SELECT ON public.profiles FROM authenticated, anon` (table level), then `GRANT SELECT (<22 explicit columns>)` — every current column except the three Strava token columns. Both statements in one migration so `profiles` is never unreadable between them. `strava_athlete_id` deliberately retained (not a secret; `StravaConnect.jsx` uses it for connected state). Applied and verified live 2026-08-14 via `has_column_privilege`: `authenticated` table-level SELECT is now `false`, all three token columns `false` for both `authenticated` and `anon`, while `full_name`/`is_admin`/`alert_phone`/`strava_athlete_id` remain `true`. Server-side access unaffected — `server/` uses `SUPABASE_SERVICE_ROLE_KEY`, which bypasses grants. Rollback if needed: `GRANT SELECT ON public.profiles TO authenticated, anon;`
- [x] Duplicate RLS policies consolidated (this half of migration 030 worked): dropped `"profiles are readable by authenticated users"` and `"users can update own profile"`, keeping `"Users can view all profiles"` (SELECT `USING (true)`) and `"Users can update their own profile"` (UPDATE `USING (auth.uid() = id)`). `profiles` now carries exactly one SELECT, one UPDATE, and one INSERT policy.
- [x] **Critical review finding, fixed:** `signUpWithProfile()` and `upsertMyProfile()` both wrote to `profiles` via `.upsert(...).select().single()` — a bare `.select()` (no column list). PostgREST turns a bare post-write `.select()` into `RETURNING *`, and Postgres requires SELECT privilege on every column named in a `RETURNING` clause, checked against the same write statement — so once migration 030 revokes SELECT on the three Strava token columns from `authenticated`, both statements would fail with a permission error and roll back their write. That's not a display bug like the `select("*")` findings above; it would have permanently broken signup and every profile edit app-wide, regardless of deploy ordering, since the error fires on the write itself. Fixed by extracting the column list from `getMyProfile()` into a shared `PROFILE_SELECT_COLUMNS` constant at the top of `socialApi.js` and using it in all three of `getMyProfile()`, `signUpWithProfile()`, and `upsertMyProfile()` — one definition instead of three copies, so this can't silently drift back to `select("*")` or a bare `.select()` in one call site while staying fixed in another. Traced both functions' callers (`AuthForm.jsx`, `ProfileSetup.jsx`, `OnboardingFlow.jsx`, `ProfilePage.jsx`) — none read a field off the returned profile object (they either ignore the return value or re-fetch separately via `load()`), so no consumer needed a token column. Checked the rest of `src/` for other bare `.select()` on a `profiles` insert/update/upsert/delete chain: none found — these two were the only `profiles` write chains outside this file's own audited set.
- [x] `migrations/030_profile_token_exposure.sql` — **written, not applied.** `REVOKE SELECT` on the three Strava token columns from `authenticated`/`anon`, plus consolidation of the duplicate SELECT and duplicate UPDATE RLS policies on `profiles` down to one each (semantics unchanged, cleanup only). Must not be applied until the explicit-column-list frontend above is live on powdays.app and Kyle has approved — applying it first breaks `select("*")` for every still-unmigrated caller. `server/` is unaffected: it authenticates with `SUPABASE_SERVICE_ROLE_KEY`, which bypasses column grants.
- [x] `railway.json` deleted — stale. The API runs on Render, not Railway.

**Known residual, recorded not fixed (see the sprint's Non-goals):** `alert_phone` is not fully closed by this sprint. The explicit-column change stops it being broadcast to other users' browsers by the app's own code, but the RLS policy stays `USING (true)` and the column grant stays, so a determined signed-in user could still query it directly. Also deferred: splitting sensitive columns into a `profiles_private` table — Kyle chose the narrower column-grant fix for this sprint.

**Outstanding:**
1. Apply `migrations/030_profile_token_exposure.sql` to the live Supabase project — **only after** this sprint's frontend build is confirmed live and Kyle has explicitly approved. Deliberately not done as part of this sprint's implementation.
2. The `alert_phone` and `profiles_private`-split residuals above — no sprint scheduled yet.

**Files:** `src/lib/socialApi.js`, `migrations/030_profile_token_exposure.sql`, `railway.json` (deleted)

---

## SECTION 18 — Friend-Visible Profiles & Ski Plan Calendar (Sprint 34)

From Kyle's Notes: make profiles viewable by friends with their season stats, and
add a "days I plan to ski" calendar so friends can coordinate where to ski.

**The foundation was broken before any feature work started.** `daily_plans`'
friend-read RLS policy tested membership in `public.friendships` — a table with
**0 rows**. The app has always written friendships to `friend_requests` (4
accepted). The policy could never match, so no user could read any other user's
plan. Same bug class as `supabase/migrations/20260515_ski_sessions_rls_fix.sql`,
which fixed `ski_sessions` and missed `daily_plans`. Two shipped features were
silently degraded by it:

- `TodaysCrew.jsx` never showed a friend — its client-side friend filter ran over
  rows RLS had already stripped.
- `getFriendsLeaderboard` reported `daysOnMountain: 0` / `daysTogether: 0` /
  `topResort: null` for every friend.

A second dead policy read `group_members`; `groups`/`group_members` both have 0
rows and no code path (the app uses `crews`/`crew_members`). Also fixed:
`daily_plans.status` defaulted to `'planning'`, a value its own CHECK constraint
(`planned|driving|arrived`) rejects — every INSERT omitting `status` failed.

### TASK 18.1 — ~~Retire `daily_plans.group_id` and the `'groups'` visibility value~~ — ✅ COMPLETE (migration 037)
**DONE — Sprint 38.** `migrations/037_plan_parties.sql:271-275` drops the `group_id` column
and rewrites the `daily_plans` visibility CHECK to `('friends','private')`. Both `group_id`
and `'groups'` are gone. Closed 2026-08-25 during backlog grooming; the work shipped with
plan parties and the checkbox was never ticked.

### TASK 18.2 — ~~`getCrewMembers()` returns pending members~~
**DONE — Sprint 35.** `getCrewMembers` now takes `{ includePending = false }`; it filters to `status = 'active'` by default so the friends calendar cannot color or count a pending invitee into a crew, while `CrewGroupChat` passes `includePending: true` and renders pending rows with an "Invited" pill. The Sprint 34 note that RLS already hid these rows was **wrong** — migration 035's policy returns every row of a crew you are active in, pending included, which is why an unconditional filter regressed the invite flow.

_(Original open bullet removed 2026-08-25 during grooming — the filter described here is
what Sprint 35 shipped. The checkbox was left live under a DONE heading for three sprints.)_

### TASK 18.6 — Project-wide `anon` grants (hardening, open)
- [ ] **Re-measured against the live DB 2026-08-25 — this is bigger than first recorded.**
      The original entry said "UPDATE on 47 tables." In fact `anon` holds **INSERT, DELETE,
      TRUNCATE, REFERENCES and TRIGGER on 47 tables**, SELECT on 46, and UPDATE on 45. It is
      the stock Supabase `GRANT ALL` default, not something Sprints 33/34 introduced.
      Migration 036 revoked only on `friend_requests` and `crew_members`, the two tables
      whose column scoping 033/034 established.
- [ ] Not currently exploitable anywhere it was checked: every RLS policy on those
      tables is `TO authenticated`, so an `anon` request matches zero rows. The risk is
      latent — a future policy written `TO public` would silently re-open write access.
- [ ] A project-wide revoke is its own pass with real regression risk for the
      logged-out/landing experience (which legitimately reads as `anon`). Needs an audit
      of what `anon` actually requires, table by table, not a blanket statement.

**Whole-branch review caught 8 issues, all fixed the same session** — none were
visible to any single task's reviewer:
1. Month navigation on Profile → Ski Plans was dead: the `loading` early-return
   unmounted `PlanCalendar`, which remounted with its `viewDate` re-initialised
   to the current month. Fixed with a `hasLoaded` gate so only the first load
   blocks the tab.
2. The "👥 All Friends" scope chip returned true for *any* non-self row, so
   non-friend crewmates appeared under a friends-only lens. Now gated on
   `getAcceptedFriends()`.
3. `getFriendsLeaderboard`'s new today-cap used `toISOString()` (UTC), which
   after ~5-6pm MT advances to tomorrow and counts tomorrow's planned day as a
   day skied — the exact inflation the cap was added to prevent. Now uses
   `localDateKey()`.
4. `are_friends()`/`shares_crew_with()` were VOLATILE, so they could not be
   inlined and re-ran per candidate row inside the RLS qual, undercutting the new
   `daily_plans_date_range` index. Both are now `STABLE`.
5. The UI labelled plans "Visible to friends" while RLS also grants active
   crewmates. Relabelled "Friends & Crews" rather than narrowing the grant.
6. `SkiPlansPage`'s calendar kept the previous month's day-detail panel open
   after navigating.
7. A null `getCurrentUser()` left the Ski Plans tab in a permanent
   "Loading plans…".
8. Migration 032's KNOWN GAP wrongly claimed `visibility='groups'` rows are
   owner-only; the policy keys off `visibility <> 'private'`, so they are
   readable by all friends and crewmates. Comment corrected.

### TASK 18.3 — Close the crew_members self-join hole (SECURITY) — ✅ COMPLETE (migration 034)
- [x] `"crew members can insert members"` was `WITH CHECK ((user_id = auth.uid()) OR (my_crew_role(crew_id) IS NOT NULL))`.
      The first branch checked only that you were inserting *yourself* — nothing about
      the crew — so any signed-in user could insert themselves into **any crew_id**.
      Worse than first reported: `crew_members.status` DEFAULTs to `'active'`, so the
      row was live immediately rather than pending, granting `shares_crew_with()` and
      therefore read access to every member's `daily_plans`.
- [x] Second path: `"members can update own row"` pinned only `user_id`, so a member
      of one crew could rewrite `crew_id` to any other crew, or set `role='admin'`.
      `WITH CHECK` cannot see the pre-update row, so it could not detect either.
- [x] `public.create_crew(...)` SECURITY DEFINER RPC now performs the crews +
      creator-membership writes atomically. This is what allowed the permissive
      INSERT branch to be removed: `createCrew` previously relied on it to seed its
      own admin row, since `my_crew_role()` is NULL before any member exists.
- [x] `REVOKE UPDATE` + `GRANT UPDATE (status)` on `crew_members`. `acceptCrewInvite`
      is the only writer and only sets `status`, so the accept-invite flow is intact
      while `crew_id` and `role` become unwritable from the client.
- [x] **Behaviour change, deliberate:** `createCrew(memberIds)` used to insert invited
      members with the `'active'` default — force-joining them with no invitation.
      They are now `'pending'`, matching `inviteToCrewGroup` and the existing
      pending-invites UI.

### TASK 18.5 — Crew invites were never visible to the invitee — ✅ COMPLETE (migration 035)
- [x] Found while verifying migration 034. `"crew members can view members"` was
      `USING (my_crew_role(crew_id) IS NOT NULL)`, and `my_crew_role()` only matches
      `status='active'` — so a **pending** invitee could not SELECT their own
      `crew_members` row.
- [x] Two pre-existing consequences, both confirmed against the live database:
      `getPendingCrewInvites()` filters on `status='pending'`, exactly the rows the
      policy hid, so it always returned `[]` and the pending-invite UI never had
      anything to show; and `acceptCrewInvite()` issues `UPDATE ... WHERE`, which
      must first find its row through the SELECT policy, so it matched nothing and
      **silently no-opped**.
- [x] The app never hit this because nobody ever actually accepted an invite — the
      only way anyone joined a crew was being inserted directly as `'active'` via
      `createCrew(memberIds)` relying on the column DEFAULT, i.e. force-joining.
- [x] This is why 034 and 035 belong together: 034 correctly switched invited
      members to `'pending'`, which without 035 would have made them invisible and
      unable to accept — turning a latent bug into a visible regression.
- [x] Fix: you may always SELECT your own membership row, whatever its status.
      Widens nothing else — you could already read every member of any crew you are
      active in.

### TASK 18.4 — ~~`getCrewMembers()` returns pending members~~ (duplicate of 18.2)
**DONE — Sprint 35.** `getCrewMembers` now takes `{ includePending = false }`; it filters to `status = 'active'` by default so the friends calendar cannot color or count a pending invitee into a crew, while `CrewGroupChat` passes `includePending: true` and renders pending rows with an "Invited" pill. The Sprint 34 note that RLS already hid these rows was **wrong** — migration 035's policy returns every row of a crew you are active in, pending included, which is why an unconditional filter regressed the invite flow.

_(Original open bullet removed 2026-08-25 during grooming. This task is a duplicate of
18.2 and shipped with it in Sprint 35.)_

**A second whole-branch review pass found 6 more, all fixed except 18.3/18.4:**
1. **Security, fixed in migration 033:** `friend_requests_insert_own` constrained
   only the requester, not `status` — so anyone could INSERT a row already marked
   `'accepted'` and become your "friend" without approval. Reproduced live: one
   INSERT flipped `are_friends()` false→true and exposed the victim's
   `daily_plans`; the test row was deleted immediately. A second path let the
   *recipient* rewrite `requester_id` to a victim and accept, since `WITH CHECK`
   cannot see the pre-update row — closed by column-scoping the UPDATE grant to
   `(status, updated_at)`.
2. A failed month fetch in `SkiPlansTab` unmounted `PlanCalendar` along with the
   month nav, and `loadError` only clears in the effect keyed on `[userId, month]`
   — bricking the tab permanently. The error now renders inline.
3. Scope chips filtered check-ins but not trips, so picking a single crew still
   showed everyone's trips. Trips now honour the same scope.
4. `getLeaderboard` failing rendered as "not friends", showing the friends-only
   lock card to an actual friend on any RPC blip. Now a distinct error state.
5. `getProfileById` rejection produced a blank "Unnamed Skier" profile with no
   error — covered by the same distinct error state.
6. Pending crew members in the chip sets — logged as TASK 18.4 above.

**Verification notes:** RLS was proven by impersonating three real accounts in
Postgres (`set local role authenticated` + `request.jwt.claims`), not by reading
policy text — migration 030 is the precedent for SQL that reports success and
does nothing. A user friended to two others saw all 7 plans; a user friended to
one saw exactly 5 with zero leakage; a plan flipped to `private` disappeared for
a friend. The `status='active'` guard on `shares_crew_with()` was confirmed to
block a real pending crew invitee (`without_guard: true`, `with_active_guard: false`).

**Files:** `migrations/032_daily_plans_visibility_fix.sql`,
`migrations/033_friend_request_consent.sql`, `migrations/034_crew_membership_consent.sql`,
`migrations/035_crew_pending_invite_visibility.sql`, `migrations/036_anon_update_revoke.sql`,
`src/lib/socialApi.js`,
`src/lib/profileNav.js`, `src/lib/calendarDates.js`, `src/lib/profileStats.js`,
`src/components/PlanCalendar.jsx`, `src/components/ProfileStats.jsx`,
`src/components/SkiPlansTab.jsx`, `src/components/ProfilePage.jsx`,
`src/components/SkiPlansPage.jsx`, `src/components/UserProfileModal.jsx`, `src/App.jsx`

---

## Progress Summary

*Last verified against actual code/migrations/git history **2026-08-25** (not just checkbox
state). That verification is what closed 18.1, 18.2, 18.4 and 19.7 — all four were done, and
all four still carried live `- [ ]` boxes. **Checkbox state in this file has proven unreliable
three sprints running; verify against the migration or the source file before trusting it.***

All sprints 1–33 are merged to `main`, pushed, and live on powdays.app — including Mountain Board (Section 11), the Mountain Page/Krames Butte architecture (Section 12), the Premium UI Uplift redesign (Section 13), the Section 10 theme-switching MVP, Trust Tier & Verification Infrastructure (Section 14), the Ski Buddy Board (Section 15), Debt Clearing (Section 16), and the Strava token exposure fix (Section 17). Migrations 023–031 are all applied to the live Supabase project.

Sprints 32 and 33 were verified on the live app by Kyle on 2026-08-17. Both sprint branches have been deleted (fully merged, nothing unique on them).

**Note on migration 030:** it was applied, but its column-level `REVOKE` was a silent no-op — see Section 17. `migrations/031_profile_token_column_grants.sql` is the migration that actually closed the exposure, verified live via `has_column_privilege`.

| Section | Tasks | Done |
|---------|-------|------|
| 0 — Theme & Design System | 4 | 4 |
| 1 — UX Cleanup | 3 | 3 |
| 2 — Session Tracking | 4 | 4 |
| 3 — Season Analytics | 2 | 2 |
| 4 — Leaderboard | 2 | 2 |
| 5 — Sharing & Growth | 3 | 3 |
| 6 — Social Proof | 2 | 2 |
| 7 — Powder Alerts | 3 | 3 |
| 8 — Enhanced Conditions | 2 | 2 |
| 9 — Live Features | 2 | 2 |
| 10 — User Theme Switching | 1 | 1 (MVP — full app-wide theming out of scope, see task notes) |
| 11 — Mountain Board | 1 | 1 |
| 12 — Mountain Page & Krames Butte | 1 | 1 |
| 13 — Premium UI Uplift | 1 | 1 |
| 14 — Trust Tier & Verification Infrastructure | 2 | 1 (Task 14.1, OAuth app credential setup, still open — see task notes) |
| 15 — Ski Buddy Board | 2 | 2 (Task 15.1 completed in Sprint 32 — see Section 16) |
| 16 — Debt Clearing (Sprint 32) | 4 | 4 |
| 17 — Profile Token Exposure (Sprint 33) | 4 | 4 (migration 030 was a no-op; migration 031 closed it — see task notes) |
| 18 — Friend Profiles & Ski Plan Calendar (Sprint 34) | 6 | 5 (18.1 closed by migration 037; 18.2/18.4 shipped Sprint 35; 18.3 migration 034; 18.5 migration 035. **Only 18.6 `anon` grants remains open.**) |
| 19 — Sprint 37 correctness & ETA | 7 | 6 (**19.1 per-crew visibility still open** — re-scoped, now migration **044**) |
| 20 — Sprints 38-40: parties, arrivals, trip authorization | 3 | 3 (migrations 037-041) |
| **Total** | **60** | **53** |

*Counts corrected 2026-08-25. The previous total (50/44) predated Sprints 35-40 and carried
four items as open that had already shipped.*

Task 0.2's hex-token cleanup is complete (2026-08-08) — Section 0 is fully done. `migrations/023_mountain_events.sql` (Section 13) and `migrations/024_theme_preference.sql` (Section 10) are both applied to the live Supabase project (2026-08-08). Section 10's theme-switching MVP is implemented and its migration is live, but `npm run lint` and a visual pass across all 5 themes haven't been run yet, and full app-wide theming beyond the MVP scope remains unscheduled follow-up work — see Section 10's task notes.

---

## Sprint Plan Coverage

Detailed, execution-ready plans live in `sprints/` (one file per plan, self-contained agent briefs — see each file's header for exact file targets, code, and acceptance criteria). Execute with **`superpowers:subagent-driven-development`** (fresh subagent per task, two-stage review) or **`superpowers:executing-plans`** (inline, batch execution with checkpoints).

**Sprints 1–29 are all executed, merged, and verified live** (confirmed against migrations 010–022, on-disk components, and commit history as of 2026-08-04). The Mountain Page/Krames Butte architecture (Section 12) and the Premium UI Uplift redesign (Section 13) each shipped as their own spec + plan under `docs/superpowers/` rather than a numbered `sprints/` file — Section 13 is the first of these executed via a real isolated git worktree (`superpowers:using-git-worktrees` + `superpowers:subagent-driven-development` together), not just a fresh subagent per task in the main checkout.

Task 1.3 required no sprint (already fully implemented — see the task's own notes above). Section 10 (theme switching) is explicitly deferred per its own heading and has no sprint — **it is the only remaining unstarted work in this file**, alongside the still-ongoing hex-token cleanup noted in Task 0.2 and the pending live migration apply noted in Section 13.


# Kyle's Notes for future roadmap items

## Sprint 36 — The Ski Plan Editor (DONE)

Came out of Kyle's live testing of Sprint 35 on powdays.app. Four problems, all at the
moment a plan is recorded, all fixed:

- **Joining a friend's mountain silently moved an existing plan.** `daily_plans` is
  `UNIQUE (user_id, ski_date)`, so one plan per day is enforced by the schema and joining
  genuinely relocates you — the behavior was right, the button was not. It now reads
  **"Switch from Vail"** instead of "I'm in" when a tap would move you.
- **Nothing ever asked for an ETA.** The plan editor now offers one, optional, with four
  presets (First chair 08:30 / 9:00 / 10:00 / Afternoon 13:00) and a time field.
- **The editor rendered below the calendar and went unnoticed.** It is now a modal over the
  calendar — bottom sheet on mobile, centered dialog on desktop.
- **No way to say "skiing, no preference."** Added **"Open — no preference"**, a real
  `resort_key` sentinel (the column is `NOT NULL`). Its card is pinned below every real
  mountain regardless of headcount and reads "N free" — the top card answers "where should
  we go", and available people are not a where.

**ETAs snap to 15-minute increments** via `snapToQuarterHour()` applied on save.
`<input type="time" step="900">` alone is not enough: iOS Safari's time wheel ignores
`step`, so a phone could otherwise store 8:07.

**Do not add `open` to `RESORT_NAMES`.** `Object.keys(RESORT_NAMES)` builds the mountain
dropdowns in `MountainBoard`, `PostSkiBuddyForm` and `SkiBuddyBoard`; the sentinel there
would offer "Open — no preference" as a mountain you can post a buddy request for. It is
special-cased inside `resortName`/`resortEmoji` instead, and `src/lib/resorts.test.js`
carries a test asserting it stays out of both maps.

Also retired `TodaysCrew`'s local `prettifyResortKey`, a hardcoded duplicate of
`RESORT_NAMES` that predated the sprint.

Spec: `docs/superpowers/specs/2026-08-18-plan-editor-design.md`.
Plan: `docs/superpowers/plans/2026-08-18-sprint-36-plan-editor.md`.

## Sprint 36 post-merge repairs — Today's Crew (DONE, 2026-08-21)

Kyle tested Sprint 36 live and reported two symptoms. Investigation found **four** root causes,
three of them older than the sprint:

- **`TodaysCrew` was mounted by nothing since 2026-08-01.** Commit `013c4af` said
  "(moved to Home)" and only deleted 22 lines from `SkiPlansPage` — it never added anything to
  Home. Three weeks orphaned, taking `markArrival`/`markDriving` with it, since nothing else
  calls them.
- **Its status buttons passed a date where the API wants a plan uuid** (`.eq("id", planId)`),
  so every click would have thrown Postgres `22P02`. Unobservable while unmounted.
- **It derived "today" from `toISOString()`**, so after ~5pm Mountain it would show tomorrow's
  crew all evening.
- **Home's check-in button hid whenever a plan existed**, which removed the only entry point to
  the check-in form exactly when Sprint 36 gave it something worth editing. Now hides only once
  `status === 'arrived'`.

Mounting it then exposed a fifth: anonymous browse-mode visitors saw a raw `"Not authenticated."`
on the public Home page, because `getCurrentUser()` throws rather than resolving null. Detected
structurally now, not by matching the error's text.

**Also shipped the same day:**

- **Check-in sets your status.** Three states — not left yet / driving / arrived. ETA hides for
  arrived; a `planned` check-in with an existing ETA prompts to confirm it.
  `buildPlanUpsert` gained an optional explicit `status`/`arrivedAt`.
- **`arrived_at` is now an invariant, not a field.** It is cleared whenever the resolved status
  is not `arrived`, enforced inside `buildPlanUpsert` so it holds for all four writers. This also
  fixed `markDriving`, which set the status and left a stale arrival stamp.
- **The "today loop" agrees on what today is.** `TodaysCrew`, `SkiCheckInForm`,
  `AvatarStatusRail` and both `HomeDashboard` date keys now use `localDateKey()`. Before this they
  disagreed after 5pm: checking in wrote tomorrow's row while Today's Crew read today.

**Two process notes worth keeping.** A fix dispatched without the scoped re-review shipped a
`TypeError` that stalled Today's Crew's Refresh button — `onClick={loadPlans}` passed React's
click event into a new cancel-predicate parameter. And a fix reported as working was inert: it
changed a `useState` default that the load effect immediately overrode. The grep that "proved"
nothing overrode it searched for `isEditing`, which is case-sensitive and cannot match
`setIsEditing`.

---

# Sprint 37 — SHIPPED 2026-08-21 (6 of 7; 19.1 deferred to Sprint 38)

Six of the seven queued items shipped. Tests 75 → 107, lint held at 88, build clean.
Each task is one commit, so any of them can be bisected or reverted independently.

### TASK 19.6 — `respondToCrewInvite` wrote an illegal visibility — DONE (`6794a04`)
- Was the **fifth** `daily_plans` writer and the only one still doing a raw `.upsert()`:
  `visibility:"public"` (rejected by the CHECK, 23514, every time), no `onConflict`, no
  merge. And it flipped the invite to accepted BEFORE the failing write, so the user was
  left with an accepted invite, no plan, and no pending invite to retry from.
- Now merges through `buildPlanUpsert()` and writes the plan FIRST. `buildPlanUpsert`
  validates `visibility` and **throws** on an unknown value — it deliberately does not
  fall back, because falling back on a Private plan would silently un-private the day.
- `buildEtaFromInvite` deleted; `buildPlanEta` already accepted the same format and more.
- The doc comment's "four writers" census is what let this hide. It now says five.

### TASK 19.2 — UTC date keys — DONE (`e43b2fc`)
- All 19 sites now use `localDateKey()`. Plus a 20th nobody had listed:
  `server/services/stravaSync.js` sliced Strava's UTC `start_date` with `start_date_local`
  sitting right beside it.
- `leaderboardApi` was worse than logged: the entries passing its "today" cap are
  **background-upserted into `ski_sessions`**, so every evening it persisted tomorrow's
  trip as a day already skied. Data corruption, not display.
- `PostSkiBuddyForm`'s floor was a module-level const, frozen at import — stale across
  midnight regardless of timezone. Moved into the component.
- **A `no-restricted-syntax` lint rule now bans the pattern.** Verified it flagged exactly
  19 before the sweep and 0 after. This is the part that stops a 21st site.
- Also added `.claude` to `globalIgnores`: `npm run lint` was reporting **1076** problems
  by linting worktrees' minified `dist/` bundles. It now reports the real 88.

### TASK 19.7 — `FriendsPage` load resilience — DONE (`ef35fa8`)
- Ten calls in one `Promise.all` meant one rejection blanked all ten sections.
- The registry pattern was extracted from `FriendsCalendar` (where it was inline and
  therefore untested) into **`src/lib/loaderRegistry.js`, 13 tests**. `FriendsCalendar`
  was refactored onto it, which is what proves the extraction is faithful.
- `FailureNotice` lifted to `src/components/ui/`. Toast → persistent per-block notices
  with per-block Retry.
- The `.catch(() => ...)` swallows on pings/datePolls are gone — same empty state, but
  the failure is now recorded instead of invisible.

### TASK 19.3 — ETA on the calendar — DONE (`64f876a`)
- Cards show the group's **earliest** ETA: "Copper — 6 going / from 8:45". First chair is
  the decision-relevant number. Hidden entirely when nobody set one.
- `earliestEta()` compares **instants**, not ISO strings — `eta` is a timestamptz and
  offset formats are not guaranteed consistent, so string ordering is a latent bug.
- Collapsed a triplicate: `formatPlanTime` existed three times verbatim and had already
  drifted on the empty case. `formatEtaShort()` in `src/lib/format.js` replaces all three.

### TASK 19.5 — Escape + focus trap — DONE (`bc472b8`)
- New `src/lib/useDismissableLayer.js`. There was no prior art anywhere in `src/` — zero
  occurrences of `keydown`/`Escape` in the whole codebase.
- `CalendarFilterSheet` also had neither `role="dialog"` nor `aria-modal`. Both added.
- **Not unit-testable** — `node --test` runs over `src/lib` with no DOM. Needs hands-on
  keyboard verification in a desktop browser.
- `UserProfileModal` still lacks it; left deliberately out of scope.

### TASK 19.4 — crew colors — DONE (`0c404b4`), Kyle chose the fixed palette
- Six fixed hues (~40° minimum separation) replacing the `var(--color-accent-*)` tokens
  that collapsed to six oranges in Base Lodge and six violets in Aurora Peak.
- Affordable only because all five themes are dark. **If a light theme is ever added,
  recheck these** — the tests encode the thresholds and will say so.
- `NEUTRAL_RING` moved too: it was the theme's own accent at 45% alpha, i.e. orange in
  Base Lodge, so an unaffiliated friend looked like a member of the orange crew.
- The constraints are now **asserted with real color math** (hue separation, WCAG
  contrast) in plain JS, no new deps. `CREW_COLOR_VARS` → `CREW_COLORS`.

---

# Sprints 38-40 — SHIPPED 2026-08-25/26 (migrations 037-043)

_Recorded 2026-08-25 during backlog grooming. All of this shipped in one day and none of it
was written down at the time — the rationale below was recovered from commit bodies before it
drifted out of reach. The previous heading here read "Sprint 38 — queued / TASK 19.1", which
was wrong: Sprint 38 shipped as plan parties, and **19.1 is still open** (re-scoped below)._

## Sprint 38 — Plan parties (migrations 037, 038)

**The model that now governs both plans and trips.** Kyle's correction:

- **Where you ski** — not ownable, and NEVER gated. The plan editor lets anyone pick any
  resort, so a gate is bypassable *and* would mean asking permission to record your own
  weekend. The button says **"I'm also going"**, not "I'm in" — the label was the lie.
- **Who you ski WITH** — ownable. Invite, or a request the owner approves.

One model, not two. It applies to plan parties AND to trips.

**Visibility rule:** sharing a party reveals that party's **DATE only**. The rest of a
non-friend's calendar stays hidden until they are friends. Hence `in_my_party(other, DATE)` —
**a party helper taking one argument is a bug**, because it matches the PERSON and would leak
the whole calendar after a single shared day.

- `037` — `plan_parties` + `plan_party_members`. Membership is a **join table, NOT
  `daily_plans.party_id`**: a column would sit in the blast radius of `upsertDailyPlan`, which
  writes the whole row and has already caused three bugs by nulling omitted fields. The
  `daily_plans` visibility CHECK became `('friends','private')`; `group_id` and `'groups'`
  retired (closes TASK 18.1). The SELECT policy is now a **WHITELIST**, so a new visibility
  value is invisible until explicitly added rather than silently over-shared.
- `038` — `accept_plan_party()`. One function for both directions, because in both the actor
  is `crew_invites.invitee_id`.

## Sprint 39 — Arrivals count as ski days (migration 039)

- A **trigger**, not app code: `daily_plans.status='arrived'` writes a `ski_sessions` row.
  Several paths set `arrived`, and a hand-maintained writer census is exactly what caused
  TASK 19.6.
- Normalised `ski_sessions.resort_name` to keys. It was stored as both `'vail'` and `'Vail'`,
  and the table is UNIQUE on it — so the same day logged two ways counted as two ski days.

## Sprint 40 — Trips: authorization and the join flow (migrations 040, 041)

**RLS on trips had been enforcing nothing.** `trip_rsvps ALL USING (user_id = auth.uid())`,
`ski_trips SELECT USING (true)`, `trip_invites SELECT USING (true)` — any stranger could RSVP
to any trip and read every trip and every invite in the app. Now invite-or-approval, with
`approve_trip_request()`. Four pre-existing uninvited RSVPs are grandfathered: INSERT is
restricted, but UPDATE/DELETE stay open so nobody is trapped in a trip.

- `041` — `trip_request_votes`. **Members advise, the host decides.** There is deliberately
  **no threshold at which yes-votes admit anyone**; admission runs only through
  `approve_trip_request()`. The requester never sees the votes — RLS keeps them out of the
  list until approved, so they cannot see who voted against them. No new "interested" record
  was needed: a `trip_invites` row with `kind='request'` already means exactly that.

## Two bugs Kyle found by live testing

- **Two plan cards for himself on one day.** He never had two plans — the calendar drew him
  from his plan AND from a stale trip RSVP. The dedupe was scoped **per mountain**, so it
  could not see one listing at each of two. Now keyed on `userId|day`.
- **Could join a trip uninvited** — which turned out to be the 040 hole above.

## ⚠️ THE RECURRING LESSON — now five incidents

Every one of these failures came from an **incomplete census of writers/paths**, never from
the code being changed:

1. `buildPlanUpsert`'s own comment said "four writers" and was wrong by one.
2. TASK 19.6 — `respondToCrewInvite` wrote an illegal visibility.
3. A missed `daily_plans` writer un-privated users' plans in production.
4. `3a100ed` — **two** writers to `trip_rsvps` (`rsvpToTrip` and `rsvpWithMessage`), and the
   RLS-refusal translation was added to one. The modal used the other and failed silently:
   "Sending…" then a quiet revert, with `console.warn(e)` and nothing else. This was the same
   census mistake **that had just been documented one commit earlier.**
5. Migration **041's first version broke the inline-`EXISTS` rule** and refused EVERY member
   vote — the policy read `trip_invites` inline, and that table is invisible to non-host
   members.

**The fix is never to patch each call site.** Move the invariant somewhere it cannot be
bypassed — a trigger, an RPC, a policy, or one shared function (`asTripApprovalError()` is
the current example). Assume any writer census in a comment is already stale.

## ⚠️ A POLICY TEST THAT ONLY CHECKS DENIALS IS NOT A TEST

Incident #5 above was caught **only** because the test asserted that a member vote
**SUCCEEDS**. Every denial assertion still passed while the feature was completely broken —
a policy that refuses everyone denies exactly as well as a correct one.

**Always assert the success case.** This applies directly to TASK 19.1 below: a `'crews'`
visibility branch that silently refuses everybody will pass any test suite built only from
"stranger cannot read" assertions.

**Also worth keeping:** the 88-problem lint baseline earned its keep in `0af28a9`. A new
`handleVote` collided with an existing `handleVote` in the same component — two declarations
in one scope means the later wins, so the new buttons would have silently called the poll
handler. Lint caught it as "already defined." One new error was a real bug, not noise.

---

# OPEN — the queue

## Migration 042 — a trip's chat and contents belong to the trip

Kyle, live testing: uninvited "Interested" users could read a trip's private chat. It was never
the Interested flow. **Seven** tables carried `SELECT USING (true)` — `trip_comments`,
`trip_updates`, `trip_polls`, `trip_poll_votes`, `trip_carpools`, `trip_carpool_riders`,
`trip_rsvps` — so every trip's chat was readable by every user in the app. `trip_carpools`
INSERT was `WITH CHECK (true)`: anyone could add a car to any trip.

`trip_media` and `trip_recaps` were **already** scoped correctly. The right pattern was in the
schema the whole time and had simply not been applied to the rest — which is why the fix was
found by enumerating every table with a `trip_id` rather than by fixing the one reported.

Rule: content is for host / going-or-maybe / invited. Explicitly **not** `kind='request'` —
being Interested is asking to join and must not come with the keys. `trip_rsvps` is
deliberately looser (host, friend-of-host, participant) so "6 going" still renders for friends.

## Migration 043 — notifications for invites and approvals

Widened `notifications.type` (it would have thrown `23514` on the first new notification — the
TASK 19.6 failure again) and added `target_type`/`target_id`, with **`target_id` as TEXT**
because plan notifications are keyed by a DATE, not a UUID. Existing trip rows backfilled.

The bell already had `onOpenTrip`/`onTabChange` and click-to-navigate logic — but was mounted
only inside the Social tab, and mounted **without** those props. Now in the top nav, with the
unread badge also on the mobile profile avatar. No notification per crew vote (Kyle's call).

A turned-down request says **"full"**, not "declined", and the host's optional note goes to the
requester's **message inbox** as a DM, not into the notification body — a note starts a
conversation and a notification is a dead end.

## Post-launch fixes from Kyle's live testing (2026-08-26)

All found by using the app, none by the test suite. Worth reading before the next sprint,
because the same shapes will recur.

**Two RSVP writers, one fix.** Migration 040's RLS refusal was translated in `rsvpToTrip` only.
`TripDetailModal` uses `rsvpWithMessage`, so joining through the modal showed "Sending…" and
then silently reverted. Both now share `asTripApprovalError()`. Fourth incident of patching
call sites instead of the shared path.

**A notification pointed somewhere empty.** A plan-party request routed correctly to the Plans
calendar — where no approve/reject UI existed; it was buried in the Social tab's collapsed
"Ski Invites" accordion. `getIncomingPartyRequests` had been written and rendered NOWHERE.
There is now a request strip on the calendar itself. Auditing the rest under the rule "every
notification lands somewhere you can act" turned up two more: approving a party request
notified nobody, and "the trip is full" opened the trip the user had just been excluded from
(whose chat they can no longer see, post-042) instead of the message inbox holding the note.

**One rejection had a note, the other didn't.** Turning down a TRIP request offered a note and
DM'd it; turning down a PLAN request sent a bare "No thanks" with nothing. Being turned down is
the same moment for the person on the other end regardless of which object they asked about.
Both paths now: "Full"/"Full group" → note field opens BEFORE the decision is sent (otherwise
it could never be written) → optional note goes to their message inbox as a DM.

**One deliberate asymmetry, kept:** declining an INVITATION sends nothing. That is you saying
no to someone else's offer, and you do not owe an explanation for it.

## What this sprint proved about testing here

- **Assert the success case, not just the denials.** Migration 041 refused EVERY member vote
  and would have shipped; the suite checked that strangers were blocked, which passed.
- **Enumerate, do not spot-fix.** The reported chat leak was seven tables, not one, and
  `trip_media`/`trip_recaps` were already correct — the pattern existed and had not been
  applied.
- **The lint baseline earns its keep.** Holding 88 caught a real `handleVote` name collision
  (the Interested buttons would have called the poll handler) and a setState-in-effect cascade.
- **Verify the deploy by grepping the served bundle**, not by hash. Vercel hashes differ from a
  local build, and a rapid second push can leave you verifying the intermediate bundle — which
  happened once here and read as success until re-checked.

### TASK 19.1 — Per-crew ski plan visibility (OPEN) — **Size: M** — migration **044**

**Re-scoped 2026-08-25. This is smaller than it used to be.** Migration 037 already
restructured the SELECT policy from a blacklist into a whitelist, which was the dangerous
part. `037:42-43` says so verbatim: *"this does NOT add the 'crews' visibility value or
visible_crew_ids (TASK 19.1). The policy is restructured as a whitelist so 19.1 is one extra
OR branch later."* The old blacklist-trap and `group_id` bullets here are resolved; the old
text said "Migration 037 must also…", but **037 through 043 are all taken — this is 044.**
That number has now moved twice. Check `migrations/` for the highest file before
writing it; do not trust this line.

- [ ] **Kyle's ask:** when setting visibility, choose **all friends** or **multi-select
      specific crews** — "people might want to hide where they're going from some people or
      groups."
- [ ] **Storage: a `visible_crew_ids uuid[]` column, NOT a join table.** A `daily_plan_crews`
      table forces a two-table write, breaking the invariant that every plan write goes
      through one whole-row `buildPlanUpsert()`, and would need a SECURITY DEFINER RPC to stay
      atomic. An array keeps the write single-row. Bounded set, no recursion risk, unit-testable.
- [ ] Add `'crews'` to the visibility CHECK. **The constraint is unnamed** (`daily_plans`
      predates `migrations/001`) — look it up with a `DO` block over `pg_constraint`.
- [ ] One extra OR branch on the whitelist policy, backed by **one** `STABLE SECURITY DEFINER
      SET search_path = public` helper. **Never an inline `EXISTS` against another
      RLS-protected relation** — that is why `20260515_crew_rls_fix.sql` and
      `022_fix_kramesbutte_rls_auth_users.sql` had to exist, and **migration 041 broke this
      exact rule again on its first attempt** (incident #5 above). This trap has now fired
      three times; treat it as the single most likely way 044 goes wrong.
- [ ] **Test the SUCCESS case, not just denials.** See the policy-test warning above — 041's
      breakage was invisible to every denial assertion.
- [ ] Revoke from `anon` as well as `authenticated` (migration 036's lesson).
- [ ] `src/lib/planUpsert.js`: one merge field + a reset rule shaped like the existing
      `arrived_at` invariant at `:85`. Extend `planUpsert.test.js`.
- [ ] Multi-select UI in `PlanEditorModal.jsx`.

**Risk: rewrites a production RLS policy and a CHECK constraint on live user data. Ship it
alone, not bundled.** Dry-run in a rolled-back transaction against live data first.

### TASK 1.1-T — Component test harness — **Size: M** — ⚠️ highest-leverage item open

`npm test` is `node --test src/lib/*.test.js`: **126 tests, 7 files, all in `src/lib`, no
DOM.** Zero components are under test — including the ~3,600-line Social tab and the
1,761-line `TripDetailModal.jsx`. Every UI change in Sprints 38-40 is unverified, and **both**
bugs above were found by Kyle clicking around, not by CI.

That is a tax on every future sprint, which is why it sorts first.

- [ ] Add Vitest + `@testing-library/react`. Vitest reuses the existing Vite config instead of
      standing up a parallel toolchain — `vite` and `@vitejs/plugin-react` are already dev deps.
- [ ] **This knowingly breaks the "no new deps" convention.** That convention earned its keep
      when the alternative was a second build system. Here the cost of *not* having component
      tests is now demonstrated, twice, in one day.
- [ ] Keep `node --test` for `src/lib` (126 green — don't churn them). Add `npm run test:ui`.
- [ ] First targets, chosen by risk: `calendar/DayPlanCard.jsx` (the `userId|day` dedupe that
      broke), `PlanEditorModal.jsx` (the write path into `buildPlanUpsert`), `TripDetailModal`'s
      RSVP handlers (the silent-failure path from incident #4).
- [ ] **Lint baseline is 88 problems (80 errors, 8 warnings).** Not zero. Don't let a new
      config raise it, and don't "fix" the baseline incidentally.

### TASK 19.5b — `UserProfileModal` Escape + focus trap — **Size: XS**

TASK 19.5 built `src/lib/useDismissableLayer.js` but **left `UserProfileModal` out of scope**,
and it's still out: verified 2026-08-25, the file has zero `keydown`/`Escape` handling. Only
`PlanEditorModal` and `CalendarFilterSheet` adopted the hook.

- [ ] **Reuse `useDismissableLayer` — do not write new dismissal logic.**
- [ ] 5 call sites (`TodaysCrew`, `CrewGroupChat`, `PowderMap`, `FriendsPage`,
      `ui/AvatarStatusRail`), all with an identical `userId`/`onClose` prop shape, so one hook
      swap covers all five. Natural first customer for the harness above.

### TASK 20.1 — Migration lineage decision — **Size: S**

Two competing lineages and nothing declares which is authoritative: `migrations/` (001-041,
sequential, no gaps) and `supabase/migrations/` (15 date-named `20260515_*` files). Decide,
note it in one line at the top of both directories. Cheap now; a real trap for whoever writes
044 without knowing.

### TASK 20.2 — Dead-table cleanup — **Size: XS**

`group_members` and `resort_bookmarks` have RLS enabled, **zero policies, and zero code
references** (verified against the live DB 2026-08-25). RLS-on-with-no-policy is deny-all, so
they are inert. Drop them, or record why they stay. Note `moderation_flags` also has zero
policies but is **correct** — `server/index.js:833` writes it with the service-role key,
which bypasses RLS.

### TASK 20.3 — `VITE_API_URL` fallback duplicated in 5 places — **Size: S**

`App.jsx:291`, `StravaConnect.jsx:7`, `StravaSyncReview.jsx:5`, `TripDetailModal.jsx:61`,
`socialApi.js:231` each carry their own `http://localhost:8787` fallback. Five sources of
truth for one config value. A config bug waiting to happen.

### TASK 20.4 — Resort coordinates hardcoded in 3 places — **Size: S**

`App.jsx`'s `RESORTS` constant, `server/index.js`, and the `resort_coordinates` table.
Recorded 2026-08-12, still true.

### TASK 20.5 — Mountain Board Tier 1 gating — **Size: S**, product decision first

A Tier 0 account can still post to Mountain Board inside a geofence. Open question from the
Ski Buddy memo that was never migrated into this document. Decide whether that's intended.

### TASK 21.1 — IA restructure Phase 1 — ✅ SHIPPED 2026-08-26

5-tab nav (**Today / Plans / Track / Crew / Me**) replacing the old Home/Snow/Plans/Social/
Profile split, live on `main` at commit `0114742`. Executed as a standalone SDD plan
(`~/.claude/plans/use-the-claude-design-mcp-abstract-dragonfly.md`, not previously tracked
here — folding it in now). Faithful re-slot only: existing UI moved verbatim into new tabs,
**no visual changes**. `HomeDashboard.jsx` deleted; its 9 widgets redistributed (Track got
Start-my-day/check-in/`TodaysCrew`; Plans got `NextTripCard`/`PingCta`; Today got the
offseason banner/install nudge; 3 confirmed-duplicate widgets retired). Trip chat now lives
only inside a trip's own detail view, not the DM inbox. Kyle click-tested it live and
confirmed it looks right; a final whole-branch review caught one cross-task bug
(`NextTripCard` and `SkiPlansPage`'s pre-existing `UpcomingStrip` showed the same invite and
didn't refresh each other) and it was fixed pre-merge.

**Deferred to Phase 2+ — not started, not sized:** the design-token/theme-contract system,
the 12-pattern component library from the design doc, the "plan party"→"group" rename, the
two-weight button grammar (filled "I'm also going" vs outlined+lock "Ask to join"), a
mandatory offseason-state redesign for Today, a 5-theme contrast audit, and 56px
glove-friendly tap targets on Track.

**Cleanup punch list — all confirmed Minor by the final review, bundle into one future
commit, none urgent:**
- [ ] Dead `loading`/`refresh` props still threaded into `TodayScreen.jsx` (their only
      consumer moved back to `App.jsx`)
- [ ] One-commit header-flash returning Today←Map — `App.jsx`'s `handleTabChange` doesn't
      reset `todaySubTab`
- [ ] `TripChatView.jsx` is fully orphaned (97 lines, zero importers) — queue the delete
- [ ] Two dead `NavIcons.jsx` exports (`HomeIcon`, and now `MountainIcon` too)
- [ ] Unused `getMyTripConversations` export in `socialApi.js`
- [ ] The retired `WhosSkiingTodayCard`'s "📍 N friends on the mountain" indicator has no
      replacement (friend pins still show on Today→Map via `useLiveFriendLocations` — a
      **prominence loss, not a feature loss**; get a yes/no from Kyle rather than an
      unprompted revert)
- [ ] `HeroBannerStrip`'s suppression comment in `App.jsx` overstates itself in 3 of 4 states
      (comment-only fix)
- [ ] `TrackScreen` has no auth gate (narrow — only reachable via explicit browse mode)
- [ ] `NextTripCard`'s own LOCAL invite/nextTrip state still doesn't refresh after creating a
      trip via its own inline modal (the page-level `UpcomingStrip` duplicate DOES now
      refresh — that was the pre-merge blocking fix; this is a narrower residual flavor)

**This session also surfaced two naming things, split into the task below and one standing
bug:** the app doc `Mockup POWDERDAYS-DESIGN-SYSTEM.md` (root, untracked) had the app name
wrong as "PowderDays" in 3 spots — fixed in the doc. **Separately, and not part of any
decision:** `index.html`'s Open Graph/Twitter meta tags point at `https://powderdays.app/` —
the **wrong domain**. Real one is `powdays.app`. Fix this regardless of the rename task's
scope; it's a bug, not a naming call.

### TASK 21.2 — ~~PowDays rename + logo assets~~ — ✅ COMPLETE 2026-08-27

**DONE.** Shipped across 15 commits from `worktree-powdays-rename-task-21.2`, starting
`11b699c` "rebrand: rename app to PowDays (config, icons, header logo)".

**Verified against source on 2026-08-27, not against the commit messages** — every bullet below
was re-checked in the file it names:

| Scope bullet | Evidence |
|---|---|
| Tab title + meta tags | `index.html:17` `<title>PowDays — …</title>`; `:15` `apple-mobile-web-app-title`; `:23` `og:title`; `:29` `twitter:title` |
| PWA manifest | `public/manifest.json` → `name` and `short_name` both `"PowDays"` |
| **`powderdays.app` → `powdays.app` domain bug** | **Zero occurrences** of `powderdays.app` remain in `index.html`, `public/`, or `src/`. `og:url` is `https://powdays.app/`. Also fixed a stale watermark domain in the share card (`6eb5907`). |
| Banner logo replaces the text wordmark | `App.jsx:468` renders `/powdays-logo-banner.png` in `TopNav`; `LandingPage` header swapped too (`da02c34`) |
| Icon set (the wired-in ones) | `11b699c` touched `favicon.ico`, `favicon-16/32/64.png`, `apple-touch-icon.png`, `icons/icon-192.png`, `icons/icon-512.png` — all six, plus the new `powdays-logo-banner.png` |
| In-app text mentions **deliberately deferred** | **13 remain** in `src/` — `OnboardingFlow` (2), `LandingPage` (4), `ShareStatCard` (2), `SessionRecapModal`, `LeaderboardPage`, `TodayScreen`, `socialApi.js:2762`, `gpxExport.js:27`. This was the decision, not an oversight. **Still open as a later pass.** |

**Shipped beyond the original scope** (all from the same worktree, none of it previously
tracked here):
- **Persistent mobile logo bar** — `App.jsx:546` renders `/powdays-logo-mobile.png`; the mobile
  top bar is logo-only, not a full nav bar (`a642304`, then bigger/transparent/centered in
  `a5b3bae`).
- **5-theme contrast audit** (`3f8b0e4`) — gradient buttons + the Aurora Peak popover.
- **Message composer's Send button was cut off on mobile** (`2f6d9a4`).
- **Canvas share-card theming** (`3c26357`, `6eb5907`) — new `src/lib/shareCardTokens.js`, a JS
  mirror of the CSS theme tokens, because a canvas-drawn card cannot read CSS variables. Ships
  with `shareCardTokens.test.js`; **this is what moved the suite from 126 to 130 tests.** Plan:
  `docs/superpowers/plans/2026-08-27-sharecard-theme-tokens.md`.

_Original scope, kept for the record:_

- [x] **Rename: config + assets only.** Fix the browser tab title, PWA manifest
      `name`/`short_name` (`public/manifest.json` — **not** the dead `public/site.webmanifest`;
      `index.html` links `/manifest.json`, so the older file's "Pow Days" name has never
      actually been live), `index.html` meta tags (`<title>`, `og:*`, `twitter:*`,
      `apple-mobile-web-app-title`), and fix the `powderdays.app` → `powdays.app` domain bug
      from TASK 21.1 in the same pass.
- [x] **Leave the ~18 in-app UI text mentions of "PowderDays" as-is for a later pass** — the
      nav header occurrence is superseded by the banner-logo swap below anyway. Remaining
      spots: `App.jsx` (2 more), `OnboardingFlow.jsx`, `SessionRecapModal.jsx`,
      `ShareStatCard.jsx` (canvas-drawn share-card text), `LeaderboardPage.jsx`,
      `TodayScreen.jsx`, `LandingPage.jsx` (4 spots), `gpxExport.js` (GPX creator tag), and a
      log-message prefix at `socialApi.js:2762`.
- [x] **Banner logo: replace the in-app header, not just social-preview images.** The app has
      **no image-based logo anywhere today** — every occurrence is styled text
      (`❄️ PowderDays`). Swap `mockups/PowDays_BannerLogo.jpeg` in for the text wordmark at
      minimum in `TopNav` — the persistent header shown on every screen while logged in
      (`App.jsx` ~line 468, gradient-text `<div>❄️ PowderDays</div>`). Two smaller one-off
      text occurrences also exist (`App.jsx` ~1281, logged-out landing footer line;
      `App.jsx` ~1385, Today-tab-inactive small header) — decide with Kyle whether those also
      become the image or stay text; a small inline logo image may not size well at those
      smaller contexts.
- [x] Update the icon set actually wired in: `public/favicon.ico`, `favicon-16/32/64.png`,
      `apple-touch-icon.png` (all public root), plus `public/icons/icon-192.png` /
      `icon-512.png` (the subfolder — this is what `manifest.json`'s `icons` array actually
      points at). `public/icon-192.png` / `icon-512.png` at the ROOT (no `icons/` prefix) are
      unused duplicates from an earlier 2026-08-07 branding pass — don't waste time on those
      unless repurposing them.

**Technical notes for whoever picks this up:**
- The new mockup JPEGs (`mockups/PowDays_AppIcon.jpeg`, `PowDays_BannerLogo.jpeg`) are
  marketing/preview-style graphics — backdrop, falling snowflakes, drop shadow baked in —
  not raw icon source files. Converting the app icon into a clean favicon set (16/32/64px,
  `apple-touch-icon.png` at 180×180, manifest `icon-192`/`icon-512`) will likely need a crop
  to just the rounded-square badge; a small favicon built from this much JPEG detail may
  read as muddy at 16px — flag that to Kyle rather than shipping something illegible.
- There's ALSO an already-existing, unused `pow-days-*` asset set in `public/` from
  2026-08-07 (`pow-days-app-icon-1024.png`, `pow-days-logo-wordmark-wide-1600x500.png`, etc.
  — see `public/README-pow-days-assets.txt`). Neither that set nor the new mockups are wired
  in yet. Worth a quick look before starting in case one is more usable than the other.
- `sips` (built into macOS) can resize/convert JPEG→PNG for the icon set without adding a
  dependency — no ImageMagick or new npm package needed.

Mostly config/meta-tag edits plus one component's header swap; the technical notes above are
the only real judgment calls. Small enough to be a good candidate to slot in ahead of or
alongside Sprint 42 — but that ordering call is Kyle's, not decided here.

---

### TASK 20.6 — Client-side routing + code splitting — **Size: M**

Every screen gets a real URL; Leaflet stops shipping to people who never open the map.

Navigation today is `const [activeTab, setActiveTab] = useState("today")` (`App.jsx:562`, 17
refs, **no router installed at all**). You cannot link anyone to a trip, the back button does
nothing, and a refresh dumps you on Today. `App.jsx:971-979` reads `?trip=` then calls
`history.replaceState` and **destroys the entire query string** — so the one shareable link in
the app (built at `TripDetailModal.jsx:973`) dismantles itself on arrival. The bundle is a
single **1,184 KB** chunk with nothing lazy-loaded.

- [ ] **Full task-by-task plan:** `docs/superpowers/plans/2026-08-27-routing-and-code-splitting.md`
- [ ] 9 tasks. **Tasks 1-5 = routing** and ship a complete improvement alone. **Task 6**
      (profile + mountain pages as real routes) is explicitly cuttable. **Tasks 7-8 = code
      splitting.**
- [ ] **Task 8 (lazy-load Leaflet) is the biggest measurable win and depends on nothing else in
      the plan** — it can be pulled forward and shipped on its own in under an hour.
      `PowderMap.jsx` is the only Leaflet importer, it is statically imported at
      `TodayScreen.jsx:2`, and it renders only behind the non-default 🗺️ Map sub-tab. Every
      visitor downloads a mapping library to look at snow totals.
- [ ] Adds `react-router-dom` — the **second** deliberate "no new deps" exception (first is the
      Vitest harness in TASK 1.1-T). Justified: hand-rolled history handling is precisely what
      produced the query-string bug above.
- [ ] ⚠️ **Needs a `vercel.json` rewrite or every deep link 404s on hard refresh.** There is no
      `vercel.json` in the repo today. This is the one failure mode that passes every local test
      and still breaks the feature in production — verify with
      `curl -o /dev/null -w "%{http_code}" https://powdays.app/plans`.
- [ ] `BrowserRouter`, **never** `HashRouter` — Supabase password recovery arrives in the URL
      hash (`AuthForm.jsx:91`).
- [ ] Routing logic goes in a pure `src/lib/routes.js` with 13 tests, so **the navigation layer
      gets real coverage under the existing `node --test` runner** with no new harness.
- [ ] **Do this BEFORE TASK 1.1-T.** Routing is far easier to test than state-driven tabs, so
      this makes the Vitest harness cheaper rather than redundant.
- [ ] **A true multi-page app (separate HTML entries, full reloads) was considered and
      rejected.** Every navigation would restart `navigator.geolocation.watchPosition`, lose the
      in-progress GPS segment and up to 30s of tracking data, re-authenticate against Supabase,
      and re-run the 12-resort polling fan-out. Note `useGpsTracker` *does* persist
      segments/runs/lifts to `sessionStorage` every 30s and restore on mount
      (`useGpsTracker.js:55-77`), so a reload does not lose a whole run — the objection is
      death-by-a-thousand-reloads, not total data loss. **Recorded so this stops being
      re-proposed.**

---

### TASK 22.0 — Mockup fidelity pass (page-by-page redesign) — **Size: TBD, IN PROGRESS (Today done; Crew tab in progress — Crews, Board, and Leaderboard slices shipped, Feed slices A/B/C1 shipped (C2 next), Friends slice after that; Plans/Profile not yet started)**

**Today List View slice: ✅ SHIPPED 2026-08-27, live on `main`** (commit `5062d98`, deploy
verified by grepping the live bundle for `"Best Bet Today"`/`"Ski here today"` —
`assets/index-alm6S4z4.js`). Built via subagent-driven-development (8 tasks + a final-review
fix wave, 12 commits total) from spec
`docs/superpowers/specs/2026-08-27-today-list-view-redesign-design.md` and plan
`docs/superpowers/plans/2026-08-27-today-list-view-redesign.md`. Shipped: the restyled
header (brand row context + `Today`/date+condition + segmented `List | Map` pill + a new
mobile-only notification bell), the compact `BestBetCard` hero (replacing the old crown card
and separate Best-Epic/Best-Ikon boxes — that per-pass callout is a deliberate, accepted
drop), the compact `ResortListRow` list with accordion expand-in-place into the existing
`ResortCard`, and a `Ski here today` action (on both the hero and every list row) wired into
the existing `daily_plans` write path via the existing `PlanEditorModal` — no new write path,
no schema change. Whole-branch review caught and fixed one real data-loss bug before merge
(`handleSaveTodayPlan` was merging against a stale client-side plan snapshot instead of a
fresh read — `daily_plans` has 5 other writers elsewhere in the app that don't share state
with this one) plus two live-now-in-the-actual-offseason bugs (the resort list assumed a
hero/top resort always exists, and always excluded it regardless of active sort). Kyle
explicitly expanded scope mid-build to add the `Ski here today` button to `BestBetCard` too
(originally only the list rows below it had one).
**Authenticated click-through: ✅ DONE, Kyle confirmed 2026-08-27 it looks good** (no specific
issues reported). Every task in this build was itself verified only via
`npm test`/`npx eslint`/`npm run build` + diff review — no subagent had working
browser/Supabase-auth tooling in its environment (same recurring limitation as prior sessions,
see memory) — so this real click-through was the first actual confirmation of the shipped UI.
**Today Map View slice: ✅ SHIPPED 2026-08-27, live on `main`** (merge commit `f2758bd`, deploy
verified by grepping the live bundle for `"TOP OF THE LIST"` — `assets/index-DlT2Ycwv.js` — and
Kyle click-tested it himself in the running app, calling the first pass "great"). Spec at
`docs/superpowers/specs/2026-08-27-today-map-view-redesign-design.md`, plan at
`docs/superpowers/plans/2026-08-27-today-map-view-redesign.md`, built in worktree
`today-map-view-redesign` (merged + deleted after shipping) via subagent-driven-development: 3
tasks + a 2-round final-review fix wave, 8 commits. Shipped: resort markers on `PowderMap.jsx`
switched from Leaflet `CircleMarker`s to custom `divIcon` bubbles — tier-colored radial-gradient
glow, score number inside, name label below, an orange friend-initials badge pinned to a bubble
when someone from the resort's `skierDetails` list is going there — plus a tap-toggle "Top of the
List" bottom sheet showing the top 3 resorts in the same order/sort the List sub-view already
uses. Both legend cards above the map were dropped (bubbles are now self-labeled). Live-GPS
friend pins and the resort detail `Popup` were left untouched by design.
**The whole-branch final review (opus) earned its cost again, catching two real bugs no per-task
diff could see:** (1) the bottom sheet shipped at `zIndex: 10`, which loses to Leaflet's own pane
z-indices (400-1000) and rendered the entire sheet invisible behind the map tiles; (2) Task 1's
extracted `scoreTier()` copied the *old* `scoreColor()`'s score bands (88/76/63/50), which turned
out to silently disagree with the tier system the rest of the app already uses —
`powderTier`/`TIER_COLORS` (bands 80/65/50/35, defined in `App.jsx`/`Badge.jsx`, consumed by
`ResortListRow`/`BestBetCard`/`MountainPage`) — so a resort could show a different tier color on
the map bubble than in the List view for the same score, and the new bottom sheet was about to put
that mismatch directly next to the list it mirrors. **Kyle's call: consolidate onto the existing
`powderTier`/`TIER_COLORS` system** rather than just patching the extracted function's numbers —
`src/lib/powderMapTiers.js` (Task 1's whole file) was deleted, `TIER_BORDER_COLORS` added to
`Badge.jsx` alongside the existing `TIER_COLORS`. A second fix round was needed for a third
finding (marker hitbox covering the full 110×92px icon box, not just the visible bubble, blocking
map pan/tap in dense clusters) — the first attempt used inline `pointer-events` styles on the
divIcon's *injected content*, which can't reach the actual interactive DOM node Leaflet itself
creates and sizes (`.leaflet-marker-icon.leaflet-interactive`); the working fix is a real CSS rule
in `index.css` with higher selector specificity, targeting that node via the `className` already
passed to `L.divIcon`.
**Verification note, same recurring gap as the List slice, now closed for this one:** no
subagent in this build had browser tooling, so every fix (including the two-round CSS/z-index
loop) was verified by diff-reading, CSS specificity math, and static checks only — but Kyle did
the real click-through himself after merge/push and confirmed it looks good.

**Kyle, 2026-08-27: this now sits ahead of everything else in the queue below**, including
TASK 22.1-22.4. New high-fidelity mockups exist at
`mockups/PowDays.app mockup design/Screen Shots/` (5 screens: Today Mountains, Today Map View,
Plans, Crew, Profile) plus a source canvas `PowDays Reorg Mockup.dc.html`. The live app does not
match them — it still looks like the pre-mockup build even though the mockups were "worked on
yesterday." Going page by page, starting with **Today**, comparing screenshot to shipped code
and producing a gap list before any implementation starts. Sizing lands once the full page-by-page
audit is done and Kyle has called out priorities per page.

**Today page gap audit (2026-08-27), Today Mountains + Today Map View screenshots vs.
`TodayScreen.jsx`/`App.jsx`/`PowderMap.jsx`:**
- Header is structurally different. Mockup: persistent `❄️ PowderDays` wordmark + notification
  bell in one row, then a second row of `Today` / `Jan 18 · ☁️ Powder day` with a `List | Map`
  segmented pill at right. Live app: on the Today tab, the brand wordmark is replaced entirely
  by a `❄️ Morning Decision Engine` eyebrow pill + `Colorado Snow Conditions` h1 + a long
  description paragraph + a `Refresh` button — no date, no "Powder day" condition line, no
  segmented List/Map control (today it's two separate buttons, `🏔️ Snow` / `🗺️ Map`, not a
  pill). The bell (`NotificationBell`) exists but only in desktop `TopNav` — mobile's persistent
  top bar is logo-only per TASK 21.2, so mobile Today has no bell at all today.
- Hero "best bet" card is a different pattern entirely. Mockup: compact card — `BEST BET TODAY`
  label, resort name, pass + tier pills inline, one big score number top-right, one stat line
  (overnight snow · summit wind · drive risk), two CTA pills (`Who's going` with a headcount
  bubble, `Directions`). Live app's `leader-crown` card is a large gradient block with a 👑
  emoji, "Best Powder Right Now: X — score" as one long heading, silver/bronze runner-ups as
  inline text, and two separate `LeaderCard` boxes below for Best Epic / Best Ikon — none of
  which appear in the mockup at all.
- Resort list rows are a full redesign, not a tweak. Mockup: one compact row per resort — rank
  number, colored score-tier pill, name, `tier · pass` subtitle, right-aligned `24H SNOW`/`BASE`
  stacked numbers. Live app's `ResortCard` is a tall expandable card per resort: hero background
  photo, Open/Closed + pass + drive-risk badges, a 3-metric grid (24h snow/base/skiers),
  community-activity line, friends-going badge, forecast text box, travel-alerts box, a
  "Show Details"/"This Week" expand toggle pair, and two full-width CTA buttons (Mountain Page,
  Directions) — all on every row. Filter bar (All/Epic/Ikon + search + sort dropdown) also has
  no equivalent shown in the mockup's list screen (mockup just says "sorted by Powder Score").
- Map view needs the biggest net-new work. Mockup: full-bleed dark map with glowing gradient
  score bubbles per resort (score number inside, resort name below) and small orange
  friend-initial badges pinned to the edge of a bubble when someone's going there, plus a
  draggable bottom sheet ("TOP OF THE LIST") showing the top 3 resorts as compact rows. Live
  `PowderMap.jsx` uses plain Leaflet `CircleMarker`s (flat colored circles, no glow/gradient) and
  `Popup`s for detail (tap-to-open, not always-visible name/score) — no bottom sheet exists at
  all today.

**Today is signed off — both slices (List, Map) shipped and live, Kyle click-tested each one.**

**Crew tab gap audit (2026-08-27-28), against `mockups/PowDays.app mockup design/PowDays Reorg
Mockup.dc.html`** (an interactive prototype covering all 5 Crew sub-tabs, richer than the single
static `Screen Shots/PowDays Reorg Mockup-Crew Page.png` screenshot, which only shows Friends):
the mockup's 5-way `Friends/Crews/Feed/Board/Leaderboard` chip bar existed nowhere in the app —
`MessagingCenter.jsx` had its own unrelated 3-way `Chats/Friends/Activity` toggle, and nested one
level inside its "Friends" panel, `FriendsPage.jsx` had a *second*, different 4-way toggle
(`Leaderboard/Crews/Friends/Community`). Decomposed into 5 slices, real-smallest-lift-first:
**Crews → Board → Leaderboard → Feed → Friends** (Kyle's confirmed order, revised once the full
mockup source revealed Crews/Board were smaller lifts than Leaderboard/Feed, which needed real
new data-model/taxonomy work). Also found: `FriendsPage.jsx`'s own `FriendAvatar` component is a
second, disagreeing per-person avatar-color implementation vs. the correct `Avatar.jsx` (hash-based
multi-color vs. always-solid-blue) — flagged for the Friends slice, where `FriendAvatar` is
actually used.

**Crews sub-tab slice: ✅ SHIPPED 2026-08-28, merged locally to `main`** (merge commit `17aa68f`,
not yet pushed — Kyle to confirm push separately). Spec at
`docs/superpowers/specs/2026-08-27-crew-tab-crews-slice-design.md`, plan at
`docs/superpowers/plans/2026-08-27-crew-tab-crews-slice.md`, built in worktree
`crew-tab-crews-slice` (merged + deleted after shipping) via subagent-driven-development: 6 tasks
+ a final-review fix wave, 12 commits. Shipped: the shared 5-way tab-bar shell (all 5 tabs wired
immediately — Friends/Feed/Board/Leaderboard route to their existing, unpolished components as-is
until their own slices land; Crews defaults active this slice, flips to Friends once that slice
ships, matching the mockup's own default); the Crews sub-tab itself fully redesigned — crew cards
show a flat color-dot icon via the *existing* `crewColor()` from `crewColors.js` (same function
already coloring crews on the Plans calendar) with an optional uploaded photo overriding it (Kyle's
explicit ask, new `crews.photo_url` column + `crew-photos` storage bucket, migration `044`), real
stacked member avatars via `Avatar.jsx`, member count, a new "Next out: {resort} · {day}" line (new
query against the existing `getVisiblePlansInRange`, no schema change), and per-card + aggregate
tab-chip unread-message dots. `MessagingCenter.jsx` shrank from 846 lines to ~150 as a
consequence — the old merged DM+crew-chat inbox is gone entirely (Kyle's call, matches the mockup
exactly: crew chat opens from a Crews-tab card, DMs open from a Friend row's message icon, no
browsable list), which made a duplicate local `CreateCrewModal` and duplicate Ping/Date-Matchmaker
trigger state dead code, deleted.
**Real gap found, deliberately NOT fixed this slice:** the notification bell does not actually
notify on new messages today (confirmed by grep — no DB trigger inserts into `notifications` on a
new `crew_messages`/`direct_messages` row); the unread-dot mitigation built this slice is the
scoped answer to "the old inbox was the only place this was visible," not a fix for that
underlying gap. Worth its own future task.
**The whole-branch final review (opus) earned its cost again — 4 real cross-task bugs no single
task's diff could see:** (1) the crew-chat panel's viewport-height budget assumed no chrome above
it (matching the DM view's pattern), but `MessagingCenter`'s title+tab-bar chrome still rendered
above it, overflowing the panel under the bottom nav; (2) editing a crew (including uploading a
photo) never refreshed the card list on return, so a new photo silently didn't appear until a
remount; (3) a `setCrews` updater called a parent setter internally (impure updater, React
warning); (4) the unread dot only worked while the Crews tab was actually mounted, since its
realtime subscription lived inside the tab-gated `CrewGroupChat` — defeating the point of a dot
that's supposed to work while you're *not* looking at that tab. Kyle chose the properly-correct
fix for (4): moved the aggregate-unread computation to the always-mounted `MessagingCenter`
(shared `src/lib/crewUnread.js`), not a display:none workaround. **The fix-wave implementer then
caught a second bug in the fix instructions themselves before shipping it**: the literal
early-return `MessagingCenter` fix for (1) would have changed its root React element type on the
exact render where a crew's `openCrew` had just set that crew's `selectedCrew` state internally —
a root-type change unmounts the whole subtree, discarding that pending state, so clicking a crew
would have silently flashed back to a fresh empty list instead of opening its chat. Reworked to
keep `CrewGroupChat` at a stable tree position and toggle chrome visibility instead — same visual
outcome, no remount. One reviewer finding on the migration (add `IF NOT EXISTS` to `CREATE POLICY`)
was dismissed and parked: not valid PostgreSQL syntax, and the plan correctly said to mirror the
existing `chat-media` bucket migration, which has the same lack of guard.
**Verification note, same recurring gap as every prior slice:** no subagent in this environment has
browser or Supabase-auth tooling — every task, the final review, and the fix wave were verified via
`npm test`/`npx eslint`/`npm run build`/diff review only. **Not yet click-tested by Kyle** — do
that first, especially the crew-chat panel sizing and the photo-upload-then-return-to-list flow
(both were bugs the final review caught from source reading alone, worth confirming in the
browser).
Final state: 139 tests passing (was 134), lint 89 problems (was 88 baseline in a fresh worktree —
net +1, from 2 new benign `react-hooks/set-state-in-effect` lint errors matching a pattern the
file already had unaddressed, offset by other reductions).

**Board sub-tab slice: ✅ SHIPPED 2026-08-31, merged locally to `main`** (fast-forward merge,
commit `e0dc990`, not yet pushed — same pending-push situation as the Crews slice). Spec at
`docs/superpowers/specs/2026-08-31-crew-tab-board-slice-design.md`, plan at
`docs/superpowers/plans/2026-08-31-crew-tab-board-slice.md`, built in worktree
`crew-tab-board-slice` (merged + deleted after shipping) via subagent-driven-development: 3
tasks + a final-review fix wave, 5 commits. Shipped: a new `passColor()`/`passBadgeStyle()`
helper in `skiBuddyOptions.js` (Ikon/Epic colors are the mockup's literal values; independent/
other are new choices clearing the same hue-separation/contrast bar, tested in
`skiBuddyOptions.test.js`); `SkiBuddyBoard.jsx`'s 4 separate filter dimensions
(passTypeFilter/resortFilter/carpoolFilter/ridingStyleFilter, 3 chip rows + a resort dropdown)
consolidated into the mockup's single 6-chip row (`All/Ikon/Epic/Indy/Local/Carpool`) — resort
and riding-style filtering dropped from the UI entirely (Kyle's call, matches the mockup exactly
— both remain visible per-post, just not filterable), "Indy"/"Local" are UI-only labels for
`PASS_TYPES`' `independent`/`other` keys (no data-model change), and "Carpool" is an independent
boolean toggle (`hasCarpool`, any `carpool_status !== "none"`) rather than folded into the
pass-type mutual-exclusion group; and a compact per-post card restyle (avatar + name + subtitle
line + color-coded pass badge header, matching the mockup's rhythm) that preserves every existing
piece of card content and every action (Respond, Report, response threads, verification-tier
gating, Filled status, carpool seat count) — a pure restyle, not a feature cut.
**The whole-branch final review (opus) earned its cost again — 2 real Important findings, both
in the exact 3 lines Task 3 added, both fixed in one round:** (1) the new subtitle line (resort +
date + time-ago) had no width constraint and, at real mobile widths, is wider than its ~210px
available column — it would have wrapped to a second line, undoing the entire point of the
compact single-line-header restyle; fixed with `overflow`/`textOverflow`/`whiteSpace` truncation
(the parent column already had the `flex:1, minWidth:0` ellipsis needs). (2) `timeAgo()` returns
an ABSOLUTE date (e.g. "Jan 12") once a post is 7+ days old, so a post created well before its ski
date could render two unlabeled dates back to back ("Sat, Jan 18 · Jan 12") with nothing
distinguishing "when you're skiing" from "when this was posted" — fixed by prefixing that segment
with "posted" so every `timeAgo()` return shape reads unambiguously. Both were genuinely new
regressions introduced by this slice's own restyle, not pre-existing — the first per-task review
had (incorrectly) logged the wrap issue as "pre-existing, not a regression"; the final review
caught and corrected that adjudication with the actual pre-restyle layout as evidence.
**Real gaps found, deliberately NOT fixed this slice (all logged as deferred minors, none
load-bearing):** the mockup's tag-pill row visual (bordered, `rgba(56,189,248,...)` accent-tinted
pills) was never actually applied — the pills kept their pre-existing neutral white-alpha styling,
just relocated; a null/missing `post.profiles` shows two different fallbacks side by side
("Someone" for the name, "?" for the avatar); the new `passColor()` export is tested but unused
in production (`passBadgeStyle()` duplicates its lookup instead of calling it); `SkiBuddyBoard`'s
new chip row's only CSS rule (`.pd-x`'s scrollbar-hiding) lives in a sibling `MessagingCenter.jsx`
`<style>` tag rather than `index.css` — harmless today since they're always co-mounted, but
`SkiBuddyBoard` has a second, currently-unreachable mount site at `FriendsPage.jsx:548` that the
**Friends slice will make reachable** — move that rule into `index.css` when that slice touches
`FriendsPage.jsx`; the 6 filter/toggle chips (here and in `MessagingCenter.jsx`'s own tab bar)
have no `aria-pressed`.
**Verification note, same recurring gap as every prior slice:** no subagent in this environment
has browser or Supabase-auth tooling — every task, the final review, and the fix wave were
verified via `npm test`/`npx eslint .`/`npm run build`/diff review only. **Not yet click-tested by
Kyle** — do that first, especially whether the subtitle-line fix actually reads cleanly at real
mobile widths and whether the independent Carpool toggle's interaction with the 5 pass chips
feels right (both were things source-level review flagged it could not fully settle without a
browser).
Final state: 145 tests passing (was 139), lint 89 problems in a fresh worktree (unchanged from
baseline — this slice added exactly as many lint-clean lines as it removed).

**Leaderboard sub-tab slice: ✅ SHIPPED 2026-08-31, merged locally to `main`** (merge commit
`5e3cab7`, not yet pushed — same pending-push situation as Crews/Board). Spec at
`docs/superpowers/specs/2026-08-31-crew-tab-leaderboard-slice-design.md`, plan at
`docs/superpowers/plans/2026-08-31-crew-tab-leaderboard-slice.md`, built in worktree
`crew-tab-leaderboard-slice` (merged + deleted after shipping) via subagent-driven-development: 2
tasks + a final-review fix wave, 4 commits. The smallest slice yet — the whole change lives in
one file, `LeaderboardPage.jsx`, no schema/query change. Shipped: `CATEGORIES` (the sortable
metric-tab array) changed from 8 categories to the mockup's exact 7, in the mockup's order
(`Vertical/Days/Powder Days/Resorts/Miles/Runs/Longest Day`) — `Resorts`/`Runs` added as new
sortable tabs (both were already fetched per entry, no new query), `Top Speed`/`Most
Lifts`/`Time on Mountain` dropped as tabs (their data still flows through `leaderboardApi.js` and
`SessionStatsForm.jsx`, just not surfaced as a leaderboard tab anymore), `Longest Run` relabeled
to `Longest Day` per the mockup's wording with its stat unchanged; and each row's stat display
restyled from a two-line "big number / small unit label" block to the mockup's single inline
string ("18 days", "96 mi"). Every other feature on the page — the Friends/Global toggle, the
2-step Log-a-Ski-Day modal, the season-snapshot stat strip, the my-logged-days list with delete,
medals, the "YOU" badge, `topResort`, and per-user emoji reactions — kept working unmodified,
same "restyle, don't cut" precedent as Board.
**Both per-task reviews came back completely clean, zero findings in either** — the smallest,
most mechanical slice yet. **The whole-branch final review (opus) still earned its cost**,
finding 2 real Important gaps neither task-scoped review could see because both were about
mockup fidelity as a *whole*, not either task's specific diff: (1) the mockup formats every stat
number with `.toLocaleString("en-US")` (e.g. "142,000 ft") but the implementation showed raw
numbers ("142000 ft") — a real gap in the spec itself (the spec never mentioned number
formatting), not an implementer error, fixed by formatting numeric values before display; (2) the
default selected tab was still `"days"` even though `CATEGORIES` now leads with `vertical` per
the mockup's own order, so the highlighted chip on load wasn't the leftmost one shown — **Kyle's
call: switch the default to `vertical`**, matching the mockup exactly. Also fixed in the same
wave (2 Minors): two stale code comments elsewhere in the file referencing "8 tabs" and "Top
Speed" (both now wrong after the category change, missed by both per-task reviews since neither
touched those lines), and now-dead defensive code in the stat-display expression left over from
mid-refactor. **Deferred, not fixed:** pre-existing `leaderboard_reactions` rows on the 3 removed
categories become permanently unreachable (no error, no data loss, not worth a migration for a
low-traffic app); an asymmetric `cat`-undefined guard between two functions (verified safe today,
not worth changing).
**Verification note, same recurring gap as every prior slice:** no subagent in this environment
has browser or Supabase-auth tooling — every task, the final review, and the fix wave were
verified via `npm test`/`npx eslint .`/`npm run build`/diff review only. **Not yet click-tested by
Kyle** — do that first, especially whether the new inline stat strings read cleanly at mobile
widths (the final review did the arithmetic and found overflow structurally impossible given the
existing flex layout, but arithmetic isn't a screenshot) and whether reacting on the new
`Resorts`/`Runs` tabs round-trips correctly.
**Note on merge history:** this branch forked from `main` before a concurrent session's TASK 22.5
(Today tab Friends section, out-of-band from this sequence) landed — the merge back was a real
3-way merge, not a fast-forward like Crews/Board, but touched no overlapping files (only
`ROADMAP.md` was edited by both, auto-merged cleanly) and tests/lint/build all verified clean on
the merged result.
Final state: 145 tests passing (unchanged), lint 89 problems in a fresh worktree (unchanged from
baseline).

**Feed sub-tab slice A of 3: ✅ SHIPPED 2026-09-01, merged locally to `main`** (fast-forward merge,
commit `261a69e`, not yet pushed — same pending-push situation as Crews/Board/Leaderboard). Spec
at `docs/superpowers/specs/2026-09-01-crew-tab-feed-slice-a-design.md`, plan at
`docs/superpowers/plans/2026-09-01-crew-tab-feed-slice-a.md`, built in worktree
`crew-tab-feed-slice-a` (merged + deleted after shipping) via subagent-driven-development: 2
tasks + a final-review fix wave, 4 commits.
**Feed's mockup implied real new subsystems (comments, photo attachments, group-level activity
cards) stacked on a restyle — too big for one slice.** Kyle's call: decompose into ordered
sub-slices, same lens as the original 5-way Crew-tab split — **Feed-A (restyle + richer stats +
reactions restyle, this slice) → Feed-B (comments) → Feed-C (photo attachments)**, with
group-level cards explicitly **backlogged for a future sprint**, not sequenced yet. Also decided
during brainstorming: the Feed does NOT gain a "plans" activity type (stays activity-only —
TASK 22.5's `TodaysCrew.jsx` already owns "who's out today" on the Today tab, so adding plans to
Feed too would duplicate it); reactions keep their exact current single-reaction-per-person
4-emoji behavior, restyled visually only (the mockup's single-kudos-count model was considered
and declined as a real behavior change, not a restyle).
**Shipped:** a card restyle (avatar + name + "resort · time-ago" header, replacing the old
sentence+separate-time-ago layout); a new `formatSessionStat()` helper (`src/lib/format.js`,
12 new unit tests) producing a richer stat line ("18 runs · 24,300 ft · 🌨 powder day") for
logged-session entries via a render-time join to `ski_sessions` in `getActivityFeed()` — no
schema change, since the columns already existed; `trip_rsvp`/`trip_created` entries keep their
sentence-style copy (trimmed of the now-redundant leading name, see final-review fix below).
**A real bug was caught and fixed BEFORE any code was written**, by the plan-writing agent
(dispatched on Opus per Kyle's "OpusPlan" request) reading the actual schema instead of trusting
the design spec: the spec's sample query used `total_runs`/`vertical_ft` as `ski_sessions`
column names — **neither exists on that table**. `total_runs` is actually the `get_leaderboard`
RPC's aggregate output alias; `vertical_ft` is a column on the *different* `ski_runs` table. The
real `ski_sessions` columns are `runs_logged`/`vertical_feet`. Had this shipped as originally
drafted, every stat-line lookup would have failed with a PostgREST error — silently, since the
spec's own sample code discarded the query's `error` — and every card would have fallen back to
sentence copy forever with nothing in the console. The plan was rewritten with the corrected
columns and an explicit `console.warn` on failure before implementation started; the spec doc
was also corrected post-hoc (commit `a8d0847`) so it doesn't mislead Feed-B/Feed-C later.
**The whole-branch final review (opus) re-verified the column-name fix independently against
the schema (not trusting the plan's own account) and found it correct, then caught one genuine
Important finding of its own:** the restyle's new header duplicated the actor's name against
`TYPE_COPY`'s existing fallback sentences (e.g. header "Maya Rivera" + body "Maya Rivera is
going on a trip") — a real gap where the plan/spec introduced a name header without reconciling
it against the frozen sentence copy. **Kyle's call: trim the name off the 3 `TYPE_COPY`
sentences** ("Is going on a trip", "Planned a trip to Vail", "Skied Winter Park on a powder day
❄️"), since the header already supplies it. Fixed in the same wave as a trivial header-truncation
gap (the new name line lacked the ellipsis/overflow styling its sibling subtitle line already
had). Both fixed and re-reviewed clean.
**Deferred, logged, not fixed:** the restyled card is ~60% taller than before and the feed list
is still uncapped at 30 items — worth a "show more" cap when Feed-B (comments) touches this same
card area, not now; reaction-button tap height (~24px) is under the 44px guideline but matches
the app's existing pill convention and actually improved from ~20px pre-slice, not a regression.
**Verification note, same recurring gap as every prior slice:** no subagent in this environment
has browser or Supabase-auth tooling — every task, the final review, and the fix wave were
verified via `npm test`/`npx eslint .`/`npm run build`/diff review/independent schema
re-derivation only. **Not yet click-tested by Kyle** — do that first, especially whether a
session with real logged stats actually shows a populated stat line (the one thing no amount of
source review can fully confirm without a live Supabase round-trip) and whether the taller card
looks right in both mount sites (Crew tab's Feed sub-tab, and the Today tab's Friends section
from TASK 22.5) on mobile.
Final state: 157 tests passing (was 145, +12 new), lint 89 problems in a fresh worktree
(unchanged from baseline).

**Feed-B (comments) slice: ✅ SHIPPED 2026-09-01, merged locally to `main`** (merge commit
`8f17846`, not yet pushed — same pending-push situation as Crews/Board/Leaderboard/Feed-A).
Spec at `docs/superpowers/specs/2026-09-01-crew-tab-feed-slice-b-design.md`, plan at
`docs/superpowers/plans/2026-09-01-crew-tab-feed-slice-b.md`, built in worktree
`crew-tab-feed-slice-b` (merged + deleted after shipping) via subagent-driven-development: 3
tasks + a final-review fix wave, 5 commits. **The plan itself was written by an Opus subagent
per Kyle's standing "OpusPlan" preference** (dispatch plan-writing to a Plan-type agent on
Opus, delegate implementation to Sonnet) — that agent caught 2 real bugs before any code was
written, by reading the live schema instead of trusting the design spec: (1) the spec said
reporting a comment needed no schema change because `moderation_flags.content_type` has no
CHECK constraint — true but irrelevant, since `reportContent()` actually routes through the
`report_content` RPC into a *different* table, `content_reports`, gated by both a CHECK
constraint and a redundant RPC guard, both rejecting anything outside 4 unrelated values;
would have thrown `INVALID_TARGET_TYPE` and failed silently on every report attempt. (2) the
spec's SQL for the new `activity_feed_comments` table never included
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` — without it, Supabase's default grants make a new
table world-readable/writable regardless of the policies defined on it. Both fixed in the
migration; the spec doc corrected post-hoc (commit matching prior slices' precedent).
**Shipped:** a new `activity_feed_comments` table + `can_see_activity(activity_id)` RLS helper
(migration 045, applied and live-verified against production via the Supabase MCP tool,
including a mandatory real friend-can-comment *success* test via session impersonation, not
just denial tests — closing the exact failure mode migration 041 shipped once before);
`getActivityComments`/`addActivityComment`/`deleteActivityComment` in `socialApi.js` plus a
pure `groupCommentsByActivity()` helper (8 unit tests); an inline expand-in-place comment
thread on `ActivityFeed.jsx` cards (matching `SkiBuddyBoard.jsx`'s `ResponseThread` pattern,
not `TripChatView`'s full-chat-screen pattern), a comment count next to the reaction buttons, a
composer, delete-your-own, and report-others'-via-the-existing-`reportContent()`-path. No
realtime subscription anywhere (deliberate). **Also fixed in the same migration, found while
designing this slice:** `activity_feed_reactions` had a real, live, pre-existing open
`USING (true)` SELECT policy — any authenticated user could read any reaction regardless of
friendship, the identical vulnerability class migration 042 fixed across 7 trip-content tables.
Closed via the same `can_see_activity()` helper.
**The whole-branch final review (opus) found something much bigger than a code-quality
nit.** It discovered, and Claude independently confirmed live via `curl` against the
production Supabase REST API with the project's anon key, that **the entire Feed sub-tab has
been silently broken in production since before this session** — `getActivityFeed()`'s
`profiles:actor_id(...)` PostgREST embed syntax returns HTTP 400 (`PGRST200`, no FK
relationship found) because `activity_feed.actor_id` only FKs to `auth.users`, never directly
to `public.profiles` — the exact situation a comment already sitting in this codebase's own
`getBoardPosts()` warns about ("always 400s"). Every `getActivityFeed()` call has been
throwing, caught by a `.catch(() => setItems([]))`, silently rendering "No recent activity from
your crew yet." regardless of real data (11 live activity rows confirmed). This slice's own two
new comment functions copied the identical broken embed pattern and would have shipped equally
inert. **Kyle's call: fix all three functions in the same wave**, not just this slice's own
code — `getActivityFeed`, `getActivityComments`, and `addActivityComment` all switched to the
established second-query profile-resolve pattern `getBoardPosts()` already uses elsewhere in
the same file. Also fixed in the same wave: a comment-author name missing `minWidth: 0` (same
ellipsis-doesn't-engage bug class Board/Leaderboard have hit before), a button-row `flexWrap`
safety net, and a `handleDeleteComment` stale-closure race on rapid double-deletes. Re-review
confirmed all fixes correct, and Claude independently re-verified via `curl` + `grep` that the
broken embed syntax is fully gone.
**Deferred, logged, not fixed:** `REVOKE ALL ... FROM PUBLIC` on the new helper function doesn't
actually restrict `anon` execution (Supabase's default privileges grant `anon` EXECUTE
explicitly at creation; revoking from `PUBLIC` only strips the implicit grant) — confirmed zero
live security impact (anon's `auth.uid()` is null, so the helper always returns false for anon;
`report_content` would fail on a NOT NULL FK), and the identical pattern already exists
unmodified on two prior migrations (032, 042) — not this slice's error, worth remembering if a
future helper's anon-non-executability ever actually matters. Three inert em-dash→hyphen
character substitutions in the migration's SQL comments (zero functional effect, not worth a
second production touch). A few smaller UX notes (no DB-level length constraint on comment
content, matching `trip_comments`' own lack of one; report submission gives no success
confirmation, matching `SkiBuddyBoard.jsx`'s identical existing gap).
**Verification note, same recurring gap as every prior slice, PLUS a genuine exception this
time:** no subagent in this environment has browser or Supabase-auth tooling for UI
verification — every UI-facing task was verified via `npm test`/`npx eslint .`/`npm run
build`/diff review only. **Task 1 (the migration) was the deliberate exception** — it used real
database tooling (Supabase MCP `apply_migration`/`execute_sql`) and ran a genuine live,
impersonated RLS test suite against production, success case first. **The final review's
Critical finding was also independently confirmed live**, via direct `curl` calls against the
production REST API — the first time in this slice sequence a review's claim was verified
against the actual live service rather than taken on the strength of source reading alone.
**Still not yet click-tested by Kyle** — do that first, especially confirming the Feed sub-tab
now actually shows activity (it may never have, in this app's history) and that posting/
reading/deleting/reporting a comment all work end to end.
Final state: 165 tests passing (was 157, +8 new), lint 89 problems in a fresh worktree
(unchanged from baseline).

**Feed sub-tab slice C1 (title, photos, friend-tagging): ✅ SHIPPED AND LIVE 2026-09-03** (merge
`737f967`, pushed and deploy-verified by grepping the live bundle — `assets/index-CTBimj5e.js` —
for `ski-day-media`, the `LogDayModal` details-step copy, and the fetch-failure guard copy).
Spec at `docs/superpowers/specs/2026-09-02-crew-tab-feed-slice-c1-design.md`, plan at
`docs/superpowers/plans/2026-09-02-crew-tab-feed-slice-c1.md`, built in worktree
`crew-tab-feed-slice-c1` via subagent-driven-development: 11 tasks (a migration task plus 10
implementation tasks) + a whole-branch final-review fix wave. Feed itself was split at
brainstorm time into **Feed-C1 (title + photos + friend-tagging on the log/edit flows, this
slice) → Feed-C2 (next-login nudge for incomplete recent activity, not started)** — C1 is
useful standalone, C2 depends on it.
Shipped: `ski_sessions.title` (new nullable column, 60-char CHECK), two new join tables
(`ski_session_photos`, `ski_session_tags`, both RLS-enabled, friends-only visibility routed
through two new `SECURITY DEFINER STABLE` helpers — `owns_ski_session()`/
`can_see_ski_session()` — never an inline `ski_sessions` read), a new `ski-day-media` storage
bucket (created in-migration, matching `crew-photos`'/`chat-media`'s pattern not `trip-media`'s
manual-bucket gap), two new shared components (`FriendTagPicker`, `SkiDayDetailsForm`), and
integration into all three places a day gets created or edited: `LogDayModal` (new 3rd step,
reachable from both exits of the existing stats step), `SessionRecapModal` (new persistent
details section, GPS end-of-session), and `SessionEditForm`/`ProfileStats` (new Title field,
"Activity Name" relabelled to "Notes", plus a **four-layer tag-wipe guard** so editing a day's
mountain can never silently delete its existing tags).
**The plan-writing pass (dispatched to an Opus agent per the established "OpusPlan" workflow)
caught six real spec bugs before any code was written**, all verified against live production
or real source rather than the spec's paraphrase: `are_friends()` takes ONE argument, not two
(the spec's version would have failed at `CREATE POLICY` time); RLS policies must route through
a helper, never read `ski_sessions` inline; the spec's `profiles:...` embed guidance was already
stale (Feed-B's fix wave had replaced that pattern); `SessionEditForm` already had a de-facto
title field under a misleading "Activity Name" label; `updateSessionTitle` was assigned to the
wrong module (would have created an import cycle); and `LogDayModal`'s new step was originally
unreachable from one of the stats step's two exits. **Migration 046 was applied to production
and live-verified with real friend-can-see/friend-can-self-untag SUCCESS tests via session
impersonation, not just denial tests** — same discipline as every prior migration this session.
**Three fix rounds during task-level review, plus one during the final whole-branch review:**
(1) a title that was just saved would visually revert after the post-save remount, because
`saveSkiDayDetails` doesn't return the title and the form reseeded from stale data — fixed with
a `savedTitle` state; (2) a failed photo/tag fetch during edit would silently seed the picker
empty, so touching it could wipe real tags — Kyle's call (asked live via `AskUserQuestion`): block
editing entirely until the fetch succeeds, don't seed empty; (3) the two-Save-buttons shape
(mountain/stats vs. photos/tags) risked silent data loss if the wrong one was pressed — Kyle's
call: relabel the top button "Save Mountain & Stats" for clarity; (4) **the whole-branch review
found the edit-session sheet had no `maxHeight`/scroll bound, and this slice's new fields pushed
its total height past the viewport on every current iPhone — the Title field this slice exists
to add was literally unreachable.** Fixed with the same `maxHeight: 90vh` + `overflowY: auto`
shape `SessionRecapModal` already used. Also independently re-verified live: `anon` holding
EXECUTE on the new RLS helpers (Supabase's default-privilege behavior, not exploitable, same
pattern on 2 pre-existing helpers) — recorded, not fixed.
Final state: 191 tests passing (was 165, +26 — the plan's own "+24" was a miscount in its
prose, the actual embedded test code had 26), lint 89 problems in a fresh worktree (unchanged
from baseline). **One recorded, deliberately out-of-scope finding, same as Feed-B's:**
`ski_sessions` still carries a live `"authenticated users can view all sessions"` SELECT
policy — the two new tables are strictly tighter than the table they hang off; closing that
hole is its own slice (affects the leaderboard, `getMySessions`, the trip backfill, the arrival
trigger).
**Immediately after shipping, Kyle found a real UX bug by actually using the Feed:** it was
flooded with trip-planning activity (`trip_created`/`trip_rsvp` — "planned a trip"/"is going on
a trip") crowding out actual logged ski days. **Fixed same-session, shipped and live 2026-09-03**
(commit `323359d`, deploy-verified by bundle-hash change to `assets/index-Ck0uok8U.js` — a
pure-logic filter has no unique renderable string to grep, so the content-hash change is the
strongest available signal): `getActivityFeed()` now filters `.eq("type", "ski_session")`.
Confirmed via a research pass that `trip_created`/`trip_rsvp` rows in `activity_feed` are
consumed nowhere else (no notifications, no other query), so this is a pure display-scope
narrowing with zero side effects — those rows are still written and still exist, just not
fetched by the Feed. Handled as a lightweight direct fix (isolated worktree, no schema change,
no new tests needed — same "no Supabase mocking harness" constraint as every I/O function in
this file — but still merged through the same test/lint/build verification and explicit
push-confirmation discipline as every other change this session), not the full brainstorm →
spec → plan → SDD ceremony, since it was a single well-scoped filter with one clear decision
point already confirmed by Kyle's own description of the problem.
**Not yet click-tested end-to-end by Kyle** — the whole-branch review's 8-step multi-account
checklist (log a day skipping stats to reach the details step; confirm a friend's Feed shows
title+photos+tag; confirm a non-friend's Feed shows nothing; edit-only-the-mountain and confirm
tags/photos survive; confirm self-untag works; GPS recap path) is the real verification for the
friends-see/non-friends-don't privacy property and the tag-wipe guard — no browser tooling
exists in this environment, so nothing here has been rendered and observed by an agent.

**Remaining activities under TASK 22.0, in the order Kyle set for Crew tab (Crews → Board →
Leaderboard → Feed → Friends), plus the two pages after it:**

1. **Feed-C2 — next-login nudge for incomplete recent activity.** Design groundwork already
   exists from the original Feed decomposition brainstorm (before the C1/C2 split): Kyle chose a
   **dismissible banner/card** (not a blocking modal), matching the existing `OffseasonBanner`
   pattern, and confirmed it should **also cover days logged via the simple "Arrived" check-in
   button** — which today creates a bare `ski_sessions` row via the migration-039 trigger with
   **no accompanying `activity_feed` row at all**, so those days are currently invisible to the
   Feed entirely. Completing the prompt for one of those days would need to create the missing
   `activity_feed` row as part of the fix — a real, if small, behavior change to that path, not
   just a new banner. Open decisions still needed: the exact "incomplete" definition (no title
   AND no photos AND no tags, vs. any one missing), a recency window so old sessions stop being
   nudged, and per-session dismissal persistence (`localStorage`, matching `OffseasonBanner`).
2. **Friends sub-tab of Crew** — the last of the original 5-way Crew-tab split. Not yet gap-audited
   against the mockup's Friends screen.
3. **Plans page** — not yet started, no gap audit yet.
4. **Profile page** — not yet started, no gap audit yet.

Group-level Feed activity cards (a whole crew skiing together as one card) remain backlogged,
not yet scheduled into this sequence.

---

### TASK 22.5 — Today tab Friends section (live crew status + activity feed) — ✅ SHIPPED 2026-08-31

Not part of TASK 22.0's mockup-fidelity gap-audit sequence — a separate, Kyle-requested feature:
the Today tab (the app's default landing screen) now shows a "Friends" section once the user
scrolls past the List/Map resort content, combining live plan status (who's planning/driving/
arrived today) with the recent activity feed, so this information no longer requires switching to
the Track or Crew tabs to see.

**Design, not a rebuild:** both pieces already existed and shipped elsewhere — `TodaysCrew.jsx`
(live status, on the Track tab) and `ActivityFeed.jsx` (Crew tab's Feed sub-tab). This task
composed both, completely unmodified, into a new section at the bottom of `TodayScreen.jsx`, with
matching section-header styling borrowed from the existing "X More Resorts" header. Neither
original mount site (Track tab, Crew tab's Feed sub-tab) was touched or removed — this is
additive only.

Spec at `docs/superpowers/specs/2026-08-31-today-friends-feed-design.md`, plan at
`docs/superpowers/plans/2026-08-31-today-friends-feed.md`. Built via subagent-driven-development
in worktree `today-friends-feed` (merged + deleted after shipping): one implementation task
(review clean, no findings) plus a final whole-branch review that caught two real integration bugs
invisible from the task's own diff — the class of thing this project's process notes keep
recording final review for:
1. **(Important)** `TodaysCrew` fetches on mount only, no refresh prop. Once mounted next to the
   Today tab's own "Ski here today" plan-save flow (same screen, no remount between them), saving
   a plan left the crew card showing stale data until its own internal Refresh button was
   clicked. Fixed with a `key` on `<TodaysCrew key={...myTodayPlan?.id...:...resort_key...} />`
   derived from the plan's id + resort_key, forcing a remount (and fresh fetch) whenever the
   user's own plan changes — no prop threading into `TodaysCrew.jsx` itself.
2. **(Minor)** The design spec's own reasoning was wrong: it claimed the Crew tab (where
   `ActivityFeed` normally lives) has no auth gate, when it actually does
   (`App.jsx` renders it only for `currentUser`). This session's change is genuinely the first
   place `ActivityFeed` becomes reachable by a signed-out/browse-mode visitor. Benign on data (RLS
   scopes `activity_feed`/`activity_feed_reactions` to `authenticated`, so anon gets zero rows —
   verified against `migrations/013_activity_feed.sql`) but produced an inconsistent UX:
   `TodaysCrew` shows its own "Sign in to see who's skiing today" prompt for signed-out users,
   while `ActivityFeed` had no such awareness and just showed an empty-feed message underneath it.
   Fixed by gating the "Recent Activity" heading + `<ActivityFeed />` on `currentUser`;
   `TodaysCrew` itself stays unconditional since it already handles its own signed-out state.

Both fixes verified in a scoped re-review (clean, no new breakage). Final state: 145 tests
passing (unchanged — no `src/lib` touched), lint 89 problems in a fresh worktree (unchanged from
baseline). Deploy verified live on `powdays.app` by grepping the served bundle
(`assets/index-DtNmaM41.js`) for `"Recent Activity"`.

**Not yet click-tested by Kyle** — same recurring verification gap as every other slice this
session series: no subagent in this environment has interactive browser/Supabase-auth tooling, so
this shipped on lint/test/build/diff-review verification only. Check next time in the app: Today
tab scrolled down under both List and Map sub-tabs, the Driving/Arrived buttons actually writing
from this new location, and signed-out/browse mode showing only `TodaysCrew`'s sign-in prompt
(no visible "Recent Activity" section).

---

### TASK 22.1 — Friends-calendar as the flagship view — **Size: M**

**Scheduled Sprint 43** (prioritized by Kyle, 2026-08-27 — after TASK 22.0's redesign work).
Mechanics already shipped (Sprint 34/35: per-person plan calendars, crew-filterable scope chips
on the Plans tab); what's unresolved is placement and presentation. Kyle's read: this is the
single biggest driver of return visits — the reason someone opens the app midweek is to see
where everyone's going this weekend. Open questions to settle before implementation (design
session, not straight to code):
- Where does it live — its own top-level tab, the Today tab's primary card, or stay inside
  Plans (today it's a buried sub-tab)?
- Weekend-first framing ("this weekend / next weekend") vs. the current month grid — the grid is
  the planning tool, a weekend view would be the *decision* tool.
- Group by mountain ("6 people at Copper Saturday") instead of by person, which is what today's
  calendar shows.
- Should it surface a nudge to join a friend's day or start one at that mountain?
- Empty state matters a lot here — with nobody planned yet, the page still needs to give a
  reason to come back.

### TASK 22.2 — Powder Score algorithm tuning — **Size: S-M**

**Scheduled Sprint 44.** Tuning the existing formula, not building a new one. Needs a working
definition of "better" from Kyle before it can be scoped precisely — bring 1-2 concrete cases
where the current score felt wrong to the kickoff.

### TASK 22.3 — Weather/conditions API quality pass — **Size: M**

**Scheduled Sprint 45.** Too vague as currently written to size tightly. Needs one specific
complaint (a resort/day where the data was wrong, stale, or missing) to become actionable —
surface that before the sprint starts rather than during it.

### TASK 22.4 — Map View + friends' locations per mountain — **Size: S**

**Scheduled Sprint 46.** `PowderMap.jsx` (337 lines) already exists — this is mostly a
test-and-fix pass on live friend-location pins (`useLiveFriendLocations.js`), not new build.
**Note:** TASK 22.0's Today-page audit above already found the map's *visual* styling (glowing
score bubbles, bottom sheet) needs real redesign work to match the new mockup — that work now
also lives under TASK 22.0, so this task should re-scope to functional correctness once 22.0's
map redesign lands, to avoid duplicating the same file twice in two sprints.

---

## Deliberately NOT doing: rename `crew_invites` / `trip_invites`

Logged as a task in the Sprint 38 plan doc and never tracked. Both are genuinely misnamed —
neither has a `crew_id`, and both are really per-day/per-trip membership records.

**Recommendation: don't.** ~74 occurrences across 12 files, but the table rename is the
*small* part: the JS API surface is 130+ identifiers concentrated in `socialApi.js`, already
the hottest file in the repo at 3,695 lines. `038:39` declares `v_inv crew_invites;` as a
**row type**, which breaks silently under a view shim. Zero user-visible benefit. Revisit only
if `socialApi.js` is being split anyway.

---

## Sprint sequence (re-set 2026-08-27 — Kyle: redesign fidelity first, then the four
prioritized open ideas, then the throughput → features → security/debt queue set 2026-08-25)

| Sprint | Contents | Size |
|---|---|---|
| **42** | **TASK 22.0 — Mockup fidelity pass**, page-by-page (Today done; Crew tab in progress — Crews slice shipped) | TBD |
| **43** | TASK 22.1 — Friends-calendar flagship placement (**design session first**) | M |
| **44** | TASK 22.2 — Powder Score algorithm tuning | S-M |
| **45** | TASK 22.3 — Weather/conditions API quality pass | M |
| **46** | TASK 22.4 — Map View + friends'-location test-and-fix | S |
| **47** | **TASK 20.6 routing + code splitting** (Tasks 1-5; 6 cuttable) | M |
| **47.5** | TASK 20.6 Tasks 7-8 — code splitting + lazy Leaflet | S |
| **48** | TASK 1.1-T component test harness + first 3 suites | M |
| **49** | TASK 19.1 per-crew visibility (migration 044, **alone**) | M |
| **50** | Social tab IA — **design session first**, then implementation | L |
| **51** | TASK 18.6 `anon` grants audit + revoke | M |
| **52** | Debt bundle: 20.2, 20.3, 20.4 + deferred minors | S |

**Sprint numbers moved 2026-08-27 — the old 42-47 (routing → debt bundle) are now 47-52.** The
old queue's own content and order are unchanged, only shifted down five slots. Check this table
before citing a sprint number from an earlier session.

Quick wins droppable into any sprint: TASK 19.5b (XS), TASK 20.1 (S), TASK 20.2 (XS), and
**TASK 20.6's Task 8 alone** (lazy Leaflet — biggest measured win in the backlog for the least
work, and it needs none of the routing).

**Why 20.6 moved ahead of the test harness (Kyle, 2026-08-27):** routing is far easier to test
than state-driven tabs, and `src/lib/routes.js` gives the navigation layer real coverage under
the runner that already exists. Doing it first makes Sprint 48 cheaper.

**TASK 21.2 (PowDays rename + logo assets) shipped 2026-08-27** — see its section above. It
also carried a 5-theme contrast audit, a persistent mobile logo bar, a mobile composer fix, and
canvas share-card theming (`src/lib/shareCardTokens.js`, +4 tests → suite is now **130**).

**Still open from 21.2:** the **13 remaining in-app "PowderDays" text mentions**, deliberately
deferred. Size **XS** — a find-and-replace across 9 files, but check each in context: two are
inside canvas-drawn share-card text (`ShareStatCard.jsx:214`, `:461`), one is a GPX `creator`
tag (`gpxExport.js:27`) and one a log prefix (`socialApi.js:2762`).

**Blocked on Kyle, not on code:** TASK 14.1 OAuth credentials (~45 min of console setup;
until then `linkOAuthIdentity()` fails with "Unsupported provider" and Tier 1 verification is
unreachable) and `OPENAI_API_KEY` (~5 min, one env var on **Render** — not Railway,
`railway.json` is stale; `server/moderation.js:8` no-ops safely without it).

---

# Improvements
-Community section (Social tab) — revisit how the pages are layered. Kyle, 2026-08-13 after
 Sprint 32 moved the board there: "Looks good for now, might need to adjust how the pages are
 layered." Nesting today is Social tab → FriendsPage → Community section → SkiBuddyBoard, which
 is three levels deep before a user sees a post.
-Improve the Powder Score algorithm
-Improve the mountain conditions and weather API
-Improve the Map View and test out Friends locations on each mountain
-~~Make Profile page visible to other users. Friends have access to view friends profiles and see their season stats.~~ **DONE — Sprint 34.** Open a friend's profile from the peek modal's "View Full Profile"; season stats reuse the existing `get_leaderboard` RPC and stay friends-only.
-~~Profile page should have a tab for "Days I plan to ski" that shows a calendar view. Users can mark which mountains they plan to go to on what days. The purpose of this page is to help people make plans with their friends. People can check their friends calendar to see where people are going this weekend, next weekend, etc. and then make their decision to go to a mountain based on where there friends are skiing.~~ **DONE — Sprint 34.** Profile → "📅 Ski Plans" tab (editable on your own profile, read-only on a friend's), plus crew-filterable scope chips on the Plans tab calendar for the "where is everyone going this weekend?" view.
-~~Reorganize certain pages in the app. (i.e. Friends and Leaderboard should live on the social page in its own tab, same with the friends list, and the Buddy page - which should be renamed Community instead of Buddy)~~ **DONE — Sprint 32.** Friends/Leaderboard/friends-list were already on the Social page; the Buddy board moved there and was renamed Community.

-~~**The "where are my friends skiing" calendar as a flagship view.**~~ **DONE — Sprint 35.**
The Plans tab now opens on a calendar that groups each day by **mountain** with the people
going ("Copper — 6 going"), filterable by crew or individual friend, with one-tap "I'm in"
to join. Week view is the decision tool (7 columns on desktop, stacked day rows on mobile);
month view is the planning tool. Trips fold into the matching mountain card as a badge.
Spec: `docs/superpowers/specs/2026-08-18-friends-calendar-design.md`.

-**Social tab UI cleanup — Size: L (design pass FIRST).** The real root is
`MessagingCenter.jsx` (939 lines), composing `FriendsPage` (973), `CrewGroupChat` (842),
`ActivityFeed`, `TripChatView`, `DirectMessageView`, `SkiPingModal`, `DateMatchmaker` —
**~3,600 lines.** "Three levels deep before a post" is an information-architecture problem,
and no amount of refactoring fixes a layout decision that hasn't been made. Split it: a
design session producing a target IA, *then* an implementation sprint against it. **Do not
start this as a code task, and sequence it after the test harness** — restructuring 3,600
untested lines is how you ship regressions you can't see. The original note follows.

The Social tab layout is messy — it now stacks a 4-way
sub-tab bar (Leaderboard / Crews / Friends / Community) inside MessagingCenter's own
Chats/People/Activity shell, so there are two competing levels of navigation before any
content. Sprint 34 added a fifth surface (full friend profiles) reachable from it. Needs
a real information-architecture pass, not just spacing tweaks.
  - ~~**Include the load-resilience fix here.**~~ **DONE — TASK 19.7, Sprint 37
    (`ef35fa8`).** Verified 2026-08-25: `FriendsPage.jsx:34-35` imports `FailureNotice` and
    `runLoaders`/`mergeFailed`/`selectLoaders` from `src/lib/loaderRegistry.js`, with
    per-block retry at `:465`. The ten-call `Promise.all` is gone, and it degrades **per
    section** while still showing the user that something failed — rather than the naive
    `.catch(() => [])` that would have traded a loud failure for a silent one. **The IA pass
    below is no longer blocked by this.**

-**"Where are my friends skiing" calendar — the flagship view.** **Scheduled: Sprint 43,
TASK 22.1** (2026-08-27) — open questions below carry forward unchanged into that task. Sprint 34 shipped the
mechanics (per-person plan calendars, crew-filterable scope chips on the Plans tab), but
the presentation is a first cut and the placement is unresolved. Kyle's read: this is the
single biggest driver of return visits — the reason someone opens the app midweek is to
see where everyone is going this weekend and decide from that. Worth doing properly
rather than incrementally. Open questions to settle in brainstorming:
  - Where does it live? Its own top-level tab, the Home tab's primary card, or stay
    inside Plans? Today it is a sub-tab of Plans, which buries it.
  - Weekend-first framing: "this weekend / next weekend" may matter more than a month
    grid. The month grid is the planning tool; the weekend view is the *decision* tool.
  - Grouping: by mountain ("6 people at Copper Saturday") reads better for deciding
    where to go than by person, which is what the calendar shows today.
  - Should it surface a nudge — join a friend's day, or start one at that mountain?
  - Empty state matters enormously here: with nobody planned, the page must still give
    a reason to come back.

# New Items

_Sized 2026-08-25. These are features, not debt — none is scheduled._

- **Challenge friends to most vert / most runs / most distance / most lifts — Size: M.**
  ⭐ **Best ROI in this list.** The data already exists in `ski_sessions` + `ski_runs`, and
  `leaderboardApi.js` (430 lines) is the pattern to extend. It is also the only idea here that
  is *genuinely social* — a reason to invite someone else onto the app rather than a nicer
  experience for the person already using it.
- **Ski Tracking UI — a page for viewing live tracking data — Size: M.**
  `useGpsTracker.js` (332) and `useLiveFriendLocations.js` (73) already exist; this is mostly
  a view over hooks that are already written.
- **iPhone lock-screen widget showing live stats — Size: XL. ⚠️ Not possible on this stack.**
  Lock-screen widgets require WidgetKit and a native iOS app shipped through the App Store.
  PowderDays is a PWA; there is no web API that can do this. Either scope it as a native
  companion app — a separate project, not a task — or cut it. Recording it here so it stops
  being re-proposed as if it were a sprint-sized item.

## Sizes for the older ideas above

**All three below scheduled 2026-08-27 as TASK 22.2-22.4, Sprints 44-46** — see those task
entries in the OPEN queue for the current, authoritative detail. Kept here as the size record.

| Item | Size | Note |
|---|---|---|
| Powder Score algorithm | **S-M** | Tuning, not building. Needs a definition of "better" before it can be estimated honestly. |
| Map View + friends locations per mountain | **S** | `PowderMap.jsx` (337) exists; largely a test-and-fix pass. |
| Weather / conditions API quality | **M** | Too vague as written. Needs one specific complaint to become actionable. |

---

# The honest critique (2026-08-25 grooming)

Two things worth saying out loud, because a groomed backlog can hide them.

**This backlog is roughly 70% debt, and debt does not move you toward side income.** The app
is live with roughly one real user. Working fifteen hardening items is motion that *feels*
like progress. The throughput-first ordering is right **because it makes the feature work
faster** — not because the debt is valuable in itself. If the test harness doesn't visibly
speed up the sprint after it, that's the signal to stop investing there.

**Nothing in this backlog answers "why would a second person use this?"** The closest is
friend challenges, which is why it's starred above. Per-crew visibility and the Social tab IA
both improve an experience nobody outside Kyle has yet. It may be worth spending a sprint on
getting five real skiers onto powdays.app instead. This document can't decide that — but it
shouldn't go unasked.
