# Crew Tab Feed Slice C2: Next-Login Nudge — Design

**Status:** Approved by Kyle 2026-09-03, pending spec write-up review.
**Part of:** TASK 22.0, Feed sub-tab, final slice (5 of 5 in the Crew tab decomposition:
Crews → Board → Leaderboard → Feed → Friends). Feed itself: Feed-A (restyle, shipped) →
Feed-B (comments, shipped) → Feed-C1 (title/photos/tagging, shipped) → **Feed-C2 (this doc)**.
Friends sub-tab is next after this ships.

## Problem

Feed-C1 let users add a title, photos, and tag friends on a ski day — but only if they do it
right when they log the day. If they skip it, there's currently no way back to it except
manually opening Profile → Session History → editing that specific day. Kyle's original ask:
"If they don't do it immediately when they end their session or leave the mountain, next time
they login to the app, it should prompt users to add a title, tag friends, or add photos to
their most recent activity."

There's a second, real gap this closes: a ski day logged purely by tapping "Arrived" on a plan
(migration 039's `log_session_on_arrival()` trigger) creates a bare `ski_sessions` row with **no
`activity_feed` row at all** — it's invisible to the Feed entirely, forever, unless something
else creates that row later. This is probably the single most common way people end a ski day
today (a plan they already made, not a separate "Log a Ski Day" action), so the nudge closing
this gap is likely more valuable than the title/photo/tag prompt itself.

## Decisions already made (earlier brainstorm, before the Feed-C1/C2 split)

- **Dismissible banner/card, not a blocking modal** — same pattern as the existing
  `OffseasonBanner`. Low friction; the user can ignore it.
- **Includes check-in-only days** — completing the prompt for one of these also creates the
  missing `activity_feed` row, closing the invisibility gap above.

## New decisions (this doc)

- **"Incomplete" means title, photos, AND tags are ALL empty.** Not "any one missing." A user
  who added a title but skipped photos touched the feature and made a choice; nagging them again
  would be annoying. This nudge is for a session nobody has touched at all.
- **7-day recency window.** Only the single most recent `ski_sessions` row, and only if its
  `session_date` is within the last 7 days. Long enough to catch someone who didn't open the app
  for a few days after skiing; short enough that a nudge doesn't resurface a session from a month
  ago the user has clearly moved on from.
- **Dismissal is per-session, in `localStorage`.** Key pattern `pd_nudge_dismissed_<sessionId>`
  (mirrors `OffseasonBanner`'s `pd_offseason_banner_26` shape). Dismissing today's prompt must
  not suppress a future day's — each session gets its own dismiss state.

## Current State (verified against source, 2026-09-03)

- **Hook point:** `App.jsx`'s `loadHeaderUser()` (`:832-859`) is where `currentUser`/
  `currentProfile` resolve after login; the existing onboarding-flow gate (`:849-851`,
  `showOnboarding` state) is the established precedent for "check something after login, then
  conditionally show UI."
- **`OffseasonBanner`** (`TodayScreen.jsx:403-478`): dismiss state seeded via
  `useState(() => localStorage.getItem(key) === "1")`, written via
  `localStorage.setItem(key, "1")` on dismiss. This nudge reuses that exact shape.
- **`ski_sessions`** columns (post-migration-046): `id, user_id, resort_name, session_date,
  trip_id, is_powder_day, notes, title, strava_activity_id, vertical_feet, miles_skied,
  top_speed_mph, moving_time_secs, created_at`. `session_date` (DATE) is the ski day itself —
  what this feature sorts and windows by — not `created_at` (when the row was written).
- **`getSessionPhotos(sessionIds)` / `getSessionTags(sessionIds)`** (`socialApi.js:4152`,
  `:4246`) are already batched (array-taking) from Feed-C1; called here with a single-element
  array for one candidate session.
- **The arrival trigger** (`migrations/039_arrival_counts_as_ski_day.sql:85-104`,
  `log_session_on_arrival()`) confirmed to only ever `INSERT INTO ski_sessions` — never touches
  `activity_feed`. This is the gap the nudge closes.
- **`logActivityOnce(type, { subjectId, subjectType, metadata })`** (`socialApi.js:3875`) is the
  existing dedupe-safe activity-feed writer, already used by both `App.jsx:702` and
  `LeaderboardPage.jsx:63` for the two paths that DO create an `activity_feed` row today. The
  nudge's backfill call uses this same function, so there's no new writer to reason about.

## Design

**New query function**, `getRecentIncompleteSession()` in `src/lib/socialApi.js`:
1. Select the current user's single most recent `ski_sessions` row
   (`.eq("user_id", user.id).order("session_date", { ascending: false }).limit(1)`), filtered to
   `session_date >= (today - 7 days)`.
2. If none found, or its `title` is already set, return `null` — no photo/tag lookup needed,
   title alone rules it out.
3. Otherwise, fetch `getSessionPhotos([id])` and `getSessionTags([id])`. If either is non-empty,
   return `null` — the session was touched.
4. Otherwise return the session row, plus a flag for whether it already has an `activity_feed`
   row (a cheap existence check: `activity_feed.select("id").eq("subject_id", id).limit(1)`) —
   this flag decides whether the eventual save needs to backfill.

This keeps the common case (most people's most recent session already has a title, or there's
no recent session at all) to a single cheap query — the two batched photo/tag lookups and the
activity_feed existence check only run for the rare candidate that clears step 2.

**New component**, `NudgeBanner.jsx` on the Today tab (mounted alongside `OffseasonBanner`,
same visual tier): fetches via `getRecentIncompleteSession()` once after `currentUser` resolves,
renders nothing if `null` or if `localStorage` already has `pd_nudge_dismissed_<id>` set.
Otherwise: "Forgot to finish {resort name}, {date}? Add a title, photos, or tag who you skied
with." (both interpolated from the session row, not literal placeholders) with a dismiss (✕)
and a primary "Add Details" tap target.

**New modal**, `NudgeDetailsModal.jsx`: a thin wrapper around the existing `SkiDayDetailsForm`
(from Feed-C1), seeded empty (`initialTitle=""`, `initialPhotos=[]`, `initialTags=[]` — correct
by construction, since this only ever opens for a session already confirmed to have none of the
three). On save: call `saveSkiDayDetails(sessionId, diff)` (existing, unchanged), then — only if
the candidate lacked an `activity_feed` row — call `logActivityOnce("ski_session", { subjectId:
sessionId, subjectType: "ski_sessions", metadata: { resort_name, is_powder_day } })` to backfill
it. Close the modal and mark the session dismissed either way (saving counts as resolving it).

## Explicitly Out of Scope

- No persistent notification-center entry (`notifications` table) — the dismissible banner is
  the whole mechanism, per the decision already made.
- No nudge for anything other than the single most recent session — no "you have 3 incomplete
  days" batch view.
- No change to the arrival trigger itself, or to any other `activity_feed` writer — the backfill
  happens only from this modal's save path, same pattern the two existing writers already use.

## Testing

New pure logic (the 7-day window check, the "all three empty" check) as testable functions in
`src/lib/skiDayDetails.js` or a new small module, following this session's established pattern —
real unit tests under `node --test`. The query function itself is I/O and untestable without a
mocking harness (same constraint as every other `socialApi.js` function this session).
