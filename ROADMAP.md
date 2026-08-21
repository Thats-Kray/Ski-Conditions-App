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

### TASK 18.1 — Retire `daily_plans.group_id` and the `'groups'` visibility value
- [ ] `group_id` FKs to `groups`, which has 0 rows and no code path.
- [ ] `visibility='groups'` is now unreachable — such a plan is visible to nobody
      but its owner. Migration 032 left both in place as the non-destructive
      choice; removing them needs its own migration.

### TASK 18.2 — ~~`getCrewMembers()` returns pending members~~
**DONE — Sprint 35.** `getCrewMembers` now takes `{ includePending = false }`; it filters to `status = 'active'` by default so the friends calendar cannot color or count a pending invitee into a crew, while `CrewGroupChat` passes `includePending: true` and renders pending rows with an "Invited" pill. The Sprint 34 note that RLS already hid these rows was **wrong** — migration 035's policy returns every row of a crew you are active in, pending included, which is why an unconditional filter regressed the invite flow.

- [ ] The crew chips on the shared calendar include members whose `crew_members.status`
      is `'pending'`, because `getCrewMembers` neither selects nor filters `status`.
      Harmless today (RLS still won't return a non-friend pending member's plans,
      and `shares_crew_with()` correctly requires `active` on both sides), but the
      chip's member set and the RLS grant disagree. Filter at the query.

### TASK 18.6 — Project-wide `anon` grants (hardening, open)
- [ ] `anon` holds table-level UPDATE on **47** tables in `public` — the stock Supabase
      `GRANT ALL` default, not something Sprints 33/34 introduced. Migration 036 revoked
      it only on `friend_requests` and `crew_members`, the two tables whose column
      scoping 033/034 established, so that invariant now holds for both client roles.
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

- [ ] The crew chips on the shared calendar build their member sets from
      `getCrewMembers`, which neither selects nor filters `crew_members.status`, so
      a pending invitee is attributed to a crew they never joined. Cosmetic while
      TASK 18.3 is open (RLS still won't return a non-friend pending member's
      plans), but the chip's member set and `shares_crew_with()` disagree.

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

*Last verified against actual code/migrations/git history 2026-08-06 (not just checkbox state — see [[project_2026_08_roadmap_completion]], [[project_2026_08_04_mountain_page_session]], and [[project_2026_08_06_premium_ui_uplift_session]] memory).*

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
| 18 — Friend Profiles & Ski Plan Calendar (Sprint 34) | 6 | 2 (18.3 SECURITY fix as migration 034, 18.5 crew-invite visibility as migration 035; 18.1/18.2/18.4/18.6 remain deliberate follow-ups) |
| **Total** | **50** | **44** |

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

# Sprint 37 — queued

### TASK 19.1 — Per-crew ski plan visibility (OPEN, scoped as Sprint 37)
- [ ] Kyle's ask: when setting visibility, choose **all friends** or **multi-select specific
      crews** — "people might want to hide where they're going from some people or groups."
- [ ] Needs a migration and new RLS policies, which is why it was split out of Sprint 36.
- [ ] **The trap is already documented.** Migration 032's own comments note the policy keys
      off `visibility <> 'private'`, so **any** non-private value is readable by all friends
      and active crewmates. A naive `visibility='crews'` row would leak to everyone — the
      exact thing the feature exists to prevent.
- [ ] Retiring `daily_plans.group_id` and the dead `'groups'` visibility value (TASK 18.1)
      belongs with this migration.

### TASK 19.2 — Sweep the remaining UTC date keys (OPEN)
- [ ] **18 sites** still derive a `YYYY-MM-DD` key from `new Date().toISOString().slice(0, 10)`,
      which returns the **UTC** date and rolls over to tomorrow after ~5pm Mountain.
- [ ] Locations: `src/lib/socialApi.js` (11), `src/App.jsx` (3), `src/lib/leaderboardApi.js` (1),
      `src/components/CreateTripModal.jsx` (1), `src/components/PostSkiBuddyForm.jsx` (1),
      plus one doc comment that is not a call site.
- [ ] `leaderboardApi.js:75` is the most consequential — it caps "days on mountain" at today, so
      every evening it counts tomorrow as skied. Sprint 34 fixed this exact bug in one place and
      the rest were never swept.
- [ ] `localDateKey()` from `src/lib/calendarDates.js` is the fix. Deliberately **not** bundled
      into the 2026-08-21 repairs: a 20-site sweep through the data layer carries regression risk
      that does not belong attached to a hotfix.

### TASK 19.3 — Display the ETA on the calendar (OPEN)
- [ ] Sprint 36 solved the **input** and not the **output**: a user can set an arrival time, and
      nothing on any calendar card shows it. `groupByDayAndMountain` builds attendees as
      `{ userId, profile }` with no `eta`.
- [ ] "6 at Copper Saturday, Kyle at 9:00" is the payload the whole feature exists to deliver.
      Arguably the highest user-visible value left in the backlog.

### TASK 19.4 — Crew colors collapse in three of five themes (OPEN, needs Kyle's call)
- [ ] The six crew slots all derive from the active theme's accent tokens, so they reskin for
      free — but in Sunset they resolve to six oranges, and Purple/Teal collapse similarly.
- [ ] Crew color is the entire basis of the "whose plans am I looking at" read, so it works in
      two themes and mushes in three.
- [ ] Fixing it means reserving 2-3 colors that stay distinct across every theme, which breaks
      the pure-theme-token rule `crewColors.js` is built on. **Kyle's decision, still open.**

### TASK 19.5 — Escape-to-close and focus trap on the modals (OPEN)
- [ ] Neither `PlanEditorModal` nor `CalendarFilterSheet` closes on Escape, and neither traps
      focus. Fine on a phone; awkward on desktop, where a keyboard user can open the plan editor
      and not close it without a mouse.

### TASK 19.6 — `respondToCrewInvite` writes an illegal visibility (OPEN)
- [ ] `socialApi.js:1191` upserts `visibility: "public"`, but the live CHECK constraint allows
      only `friends | groups | private`. Accepting a crew invite that carries a ski date
      therefore always throws `23514` — **after** the invite row has already been flipped to
      accepted, so the user is left in an inconsistent state.
- [ ] It also upserts with no `onConflict`, so even a legal visibility would collide with the
      `(user_id, ski_date)` unique constraint.
- [ ] Pre-existing and entirely unrelated to Sprints 35/36. Found during the Sprint 36 review.

### TASK 19.7 — `FriendsPage` per-block load resilience (OPEN, planned but never executed)
- [ ] `FriendsPage.loadPageData()` still awaits ten calls in a single `Promise.all`, so one
      rejection blanks the entire Social tab — exactly what happened on 2026-08-18.
- [ ] Fully specified as Task 1 of
      `docs/superpowers/plans/2026-08-18-sprint-35-social-tab-and-calendar.md` and **never
      implemented**. The loader-registry pattern it describes now exists in `FriendsCalendar`
      and can be copied.
- [ ] Do **not** "fix" this with a blanket `.catch(() => [])` — that trades a loud failure for a
      silent one, and the loud failure is what made the 2026-08-18 bug findable.


Instructions: When asked "what can we work on next?" refer to this list for potential items to add to the next sprint development.

Last updated 8/13/2026 at 3:49PM

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

-**Social tab UI cleanup.** The Social tab layout is messy — it now stacks a 4-way
sub-tab bar (Leaderboard / Crews / Friends / Community) inside MessagingCenter's own
Chats/People/Activity shell, so there are two competing levels of navigation before any
content. Sprint 34 added a fifth surface (full friend profiles) reachable from it. Needs
a real information-architecture pass, not just spacing tweaks.
  - **Include the load-resilience fix here.** `FriendsPage.loadPageData()` awaits ten
    calls in a single `Promise.all`, so one rejection blanks the entire tab — this is
    exactly what happened on 2026-08-18, when a stale-bundle `profiles` 403 made the
    whole friends list vanish behind a raw Postgres error toast. Deliberately deferred
    out of Sprint 34: the naive fix (`.catch(() => [])` on everything) trades a loud
    failure for a silent one, and the loud failure is what made that bug findable in
    minutes. The right version degrades **per section** and still shows the user that
    something failed — which is a layout decision, so it belongs with the IA pass
    rather than ahead of it.

-**"Where are my friends skiing" calendar — the flagship view.** Sprint 34 shipped the
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
Ski Tracking User Interface. Page for viewing live tracking data.
-include a home-screen widget that shows live stats on the users as an iphone lock screen widget
-challenge friends to most vert, most runs, most distance, most lifts
