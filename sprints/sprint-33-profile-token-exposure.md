# Sprint 33 — Close the `profiles` Strava token exposure

**Planned:** 2026-08-14 (Opus, plan mode). Execution: Opus plans → Haiku scouts → Sonnet implements → Sonnet reviews.
**`main` is production** (auto-deploys to Vercel). Nothing pushes to `main` without Kyle's explicit okay.

## The problem

`profiles` has two RLS SELECT policies, both `USING (true)` for `authenticated`, plus column-level SELECT
grants on `strava_access_token`, `strava_refresh_token`, `strava_token_expires_at`. Any signed-in user can
read every other user's Strava OAuth credentials.

This is not merely permitted — it is **actively happening**. `getAcceptedFriends()`, `getReceivedCrewInvites()`
and `getSentCrewInvites()` each do `select("*")` on other users' rows, so opening the friends list ships
friends' Strava tokens into the browser today. A Strava access token is a bearer credential.

## Scouted facts (verified 2026-08-14 — do not re-derive)

- **No frontend code reads any token column.** Zero hits across `src/`.
- Connection status uses `strava_athlete_id` (`StravaConnect.jsx:33`), not a token. Not a secret; leave readable.
- Server uses `SUPABASE_SERVICE_ROLE_KEY` (`server/index.js:13`, `server/cron.js:9`), which bypasses column
  grants — revoking from `authenticated`/`anon` **cannot** break Strava sync, disconnect, refresh, or cron.
- Exactly four `select("*")` calls on `profiles` exist, all in `src/lib/socialApi.js`: `getMyProfile()` (~410),
  `getReceivedCrewInvites()` (~988), `getSentCrewInvites()` (~1021), `getAcceptedFriends()` (~1286).

## Non-goals

- Not moving columns to a `profiles_private` table. Kyle chose the narrower fix; the full split is deferred.
- Not fully closing `alert_phone`. The explicit-column change stops it being broadcast to other users'
  browsers, but a determined signed-in user could still query it (policy stays `USING (true)`, column grant
  stays). Record this as a known residual, do not half-fix it.
- No change to `strava_athlete_id` visibility.
- Not touching `server/`. Nothing there needs to change.

## ⚠️ Deployment ordering — the biggest risk in this sprint

`REVOKE SELECT` on a column makes PostgREST `select("*")` **throw**, not silently omit. The instant migration
030 is applied, any un-updated `select("*")` breaks for every live user.

**Therefore: DO NOT APPLY MIGRATION 030 during implementation.** Write the file only. It gets applied by Opus
after Kyle approves, after the frontend is pushed, and after the new build is confirmed live on powdays.app.
An implementer that applies this migration has broken production.

---

## TASK 1 — Replace the four `select("*")` calls

**File:** `src/lib/socialApi.js`

`getMyProfile()` — must return every field its consumers read. Missing one fails *silently* (undefined, no
error), which is worse than throwing. Grep every consumer of `getMyProfile()` and verify the list covers
them before finalizing. Starting list from scouting, to be verified not trusted:

`id, first_name, last_name, full_name, username, avatar_url, skill_level, sport_type, ski_passes,
favorite_mountain, vehicle_label, vehicle_seats, powder_alerts_enabled, alert_phone, theme, is_admin`

Known consumers to check: `App.jsx` (theme), `ProfilePage.jsx`, `ProfileSetup`, `CreateTripModal`
(`vehicle_label`/`vehicle_seats`), and `getMyAdminStatus()` (`is_admin` — added yesterday, easy to miss).

`getAcceptedFriends()`, `getReceivedCrewInvites()`, `getSentCrewInvites()` — these read *other users'* rows.
Restrict to display fields only: `id, first_name, last_name, full_name, username, avatar_url`. Grep each
function's consumers and confirm nothing reads a field outside that list. If something does, report it
rather than widening the list silently — a field that other users genuinely need is a design question.

**Acceptance:** no `select("*")` against `profiles` remains anywhere in `src/`. `npm run build` passes.

## TASK 2 — `migrations/030_profile_token_exposure.sql` (WRITE ONLY, DO NOT APPLY)

- `REVOKE SELECT (strava_access_token, strava_refresh_token, strava_token_expires_at) ON public.profiles FROM authenticated, anon;`
- Drop the duplicate RLS policies. `profiles` currently has two functionally identical SELECT policies
  (`Users can view all profiles`, `profiles are readable by authenticated users`, both `USING (true)`) and two
  identical UPDATE policies (`Users can update their own profile`, `users can update own profile`, both
  `USING (auth.uid() = id)`). Keep exactly one of each; drop the redundant one. Do not change their semantics —
  policy consolidation only, no tightening in this migration.
- Header comment must state the ordering constraint: this migration requires the explicit-column-list frontend
  build to be live first.
- Do **not** run `apply_migration`. Do not connect to Supabase at all.

## TASK 3 — Docs (explicitly owned — do not let this fall between tasks)

- `ROADMAP.md`: add Section 17 covering this sprint, including the `alert_phone` residual and the deferred
  `profiles_private` split as named follow-ups.
- Note in Section 17 that `railway.json` was deleted (stale — the API runs on Render, not Railway).

## Definition of done

- No `select("*")` on `profiles` in `src/`
- `migrations/030_*.sql` written, **not applied**
- `npm run build` passes; `npm run lint` introduces no new findings (92 pre-existing on main)
- ROADMAP Section 17 written
- Branch pushed nowhere. Stop and hand to Kyle for review.
