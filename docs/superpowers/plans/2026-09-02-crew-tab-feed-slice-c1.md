# Crew Tab — Feed Sub-Tab Slice C1 Implementation Plan (Title, Photos & Friend-Tagging)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user give a logged ski day a title, attach up to 6 photos, and tag the friends they skied with — from all three places a day gets created or edited (`LogDayModal`, `SessionRecapModal`, `SessionEditForm`) — and render all three on the Feed's `ski_session` cards.

**Architecture:** One migration (`046`) adds `ski_sessions.title`, two join tables (`ski_session_photos`, `ski_session_tags`) with RLS routed through two new `SECURITY DEFINER STABLE` helpers (`owns_ski_session()`, `can_see_ski_session()`), and the `ski-day-media` storage bucket created in-migration. `src/lib/skiDayDetails.js` is a new pure, unit-tested module (grouping + photo validation + name formatting) — the only non-DOM logic in this slice, and the repo's `node --test` harness covers `src/lib` only. `src/lib/socialApi.js` gains an additive photo/tag/title data layer plus one orchestrator, `saveSkiDayDetails()`, that all three consuming components call so the diff→API translation exists exactly once. Two new presentational components (`FriendTagPicker`, `SkiDayDetailsForm`) are shared by those three consumers. `getActivityFeed()` gains two more batched second-queries (photos, tags) following the read-time-not-snapshot pattern it already uses for session stats. `ActivityFeed.jsx` renders a title line, a thumbnail strip and a "with …" line. No lightbox, no captions, no notifications, no next-login nudge (Feed-C2).

**Tech Stack:** React 19 (inline styles, no CSS framework), Supabase (Postgres + RLS + Storage), `node --test` for pure-logic unit tests (`npm test` runs `node --test src/lib/*.test.js`).

---

## ⚠️ Spec Corrections — read all six before Task 1

Every one of these was re-derived against the **live production database** (`hkzaohqrycwfgmcogwdo`) and the real source files on 2026-09-02, not from the spec's paraphrase. Feed-A's plan-writing pass found wrong `ski_sessions` column names; Feed-B's found a wrong table on the report path. This is that pass for Feed-C1.

### Correction 1 — `are_friends()` takes ONE argument. The spec's `are_friends(owner, tagged_user_id)` would fail at `CREATE POLICY` time.

The spec's §Schema comment says the tag INSERT policy should be `WITH CHECK are_friends(owner, tagged_user_id)`. That function does not exist. Live proof, run while writing this plan:

```
SELECT public.are_friends('3fc059fa-…'::uuid, 'db7fe685-…'::uuid);
ERROR:  42883: function public.are_friends(uuid, uuid) does not exist
```

The real signature, from `pg_get_functiondef` on production (identical to `migrations/032_daily_plans_visibility_fix.sql:61-70`):

```sql
CREATE OR REPLACE FUNCTION public.are_friends(p_other uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM friend_requests
    WHERE status = 'accepted'
      AND ((requester_id = auth.uid() AND recipient_id = p_other)
        OR (recipient_id = auth.uid() AND requester_id = p_other))
  );
$function$
```

It is **always relative to `auth.uid()`**. `are_friends(X)` means "the caller and X are friends".

**Consequence if uncorrected:** `CREATE POLICY … WITH CHECK (… are_friends(a, b) …)` aborts the whole migration with `42883`. Nothing ships.

**The fix, in Task 1:** the tag INSERT policy pins the tagger to `auth.uid()` (`tagged_by = auth.uid()`) **and** pins the session to one the caller owns (`public.owns_ski_session(session_id)`), which together make `public.are_friends(tagged_user_id)` mean exactly "the session owner and the tagged user are friends" — the rule the spec wanted, expressed with the function that actually exists. All three conjuncts are required and none is redundant; see Task 1's inline comment for why dropping any one re-opens a hole.

### Correction 2 — no new policy may read `ski_sessions` inline. Two `SECURITY DEFINER STABLE` helpers, mirroring `can_see_activity()`.

The spec's schema block writes its policy intent as prose ("SELECT: owner or their friends"), leaving the shape open. The repo's recorded lesson (the migration-041 near-miss that `20260515_crew_rls_fix.sql` and `022` exist to undo) forbids reading an RLS-protected relation inline inside another policy. Migration 045 established the correct shape, and it is live and verified:

```sql
CREATE OR REPLACE FUNCTION public.can_see_activity(p_activity_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM activity_feed af WHERE af.id = p_activity_id
   AND (af.actor_id = auth.uid() OR public.are_friends(af.actor_id))); $function$
```

**The fix, in Task 1:** two helpers with that exact shape — `public.owns_ski_session(p_session_id)` and `public.can_see_ski_session(p_session_id)` — and every policy on both new tables goes through one of them. `ski_sessions` is never named in a policy body.

### Correction 3 — `profiles:user_id(...)` embeds do NOT work. Use the current post-Feed-B second-query pattern.

The spec says the new API functions "mirror `uploadTripMedia`/`getTripMedia`/`deleteTripMedia`'s shape" and "the reaction/comment functions' shape". That is right about the *storage* shape but a trap on the *profile* shape: Feed-B's fix wave (commit `06404c9`, "profiles-embed 400s") replaced every `profiles:user_id(...)` embed with a second query, because **no FK exists from these tables to `profiles`** (only to `auth.users`). The current `getActivityComments` (`src/lib/socialApi.js:4005-4023`) and `addActivityComment` (`:4040-4059`) both do:

```js
const userIds = [...new Set(comments.map((c) => c.user_id))]
const { data: profiles } = await supabase.from("profiles")
  .select("id, full_name, username, avatar_url").in("id", userIds)
const pm = new Map((profiles || []).map((p) => [p.id, p]))
return comments.map((c) => ({ ...c, profiles: pm.get(c.user_id) || null }))
```

`getTripMedia` (`:3401-3427`) uses the same idea with a `profileMap`. **Any new function in Task 3 or Task 6 that writes `profiles:tagged_user_id(...)` will 400 at runtime and show as "no tagged friends" forever.** Resolve profiles with a second query, every time.

### Correction 4 — `SessionEditForm` already has a field labeled "Activity Name" bound to `notes`. Do not ship two title fields.

`src/components/SessionEditForm.jsx:70-78` renders `<label>Activity Name</label>` over an input bound to `notes` (placeholder `"e.g. Powder day at Vail"`), and `handleSave` writes `notes: notes.trim() || null`. Meanwhile `LogDayModal` labels the same column **"Notes (optional)"** with placeholder `"Best run, who you went with..."` (`LeaderboardPage.jsx:143-145`). So `notes` is already doing double duty as a de-facto title in one of the two editors, and neither is surfaced in the Feed.

**Resolution (applied in Task 9, and this is a deliberate product decision, not a refactor):** the new `title` column becomes the single title field. In `SessionEditForm`, the existing "Activity Name" input is **relabelled to "Notes"** and stays bound to `notes` (so no existing user data is orphaned or migrated), and a new **"Title"** input bound to `title` is added directly above it. `title` is what the Feed renders; `notes` remains private free text that nothing displays. There is deliberately **no backfill of `notes` into `title`** — `notes` has 112 rows of mixed-intent free text on production and a blind copy would publish private text to the Feed. Task 9's review step checks that both fields are present, distinctly labelled, and independently saved.

### Correction 5 — `updateSessionTitle` must live in `socialApi.js`, not `leaderboardApi.js`.

The spec's API section header says "new functions in `src/lib/socialApi.js`", then its last bullet says `updateSessionTitle()` goes "alongside the existing `updateSessionStats()` in `leaderboardApi.js`". Those contradict, and the second one creates a cycle: `src/lib/leaderboardApi.js:4` already does `import { getCurrentUser, getAcceptedFriends } from "./socialApi"`, so `socialApi.js`'s new `saveSkiDayDetails()` orchestrator importing `updateSessionTitle` back out of `leaderboardApi.js` would make the two modules mutually dependent.

**The fix:** all new functions, `updateSessionTitle` included, land in `src/lib/socialApi.js`. `leaderboardApi.js` is **not modified by this slice at all**. `SessionEditForm` keeps saving through the existing `updateSessionStats(id, fields)` path it already uses and simply includes `title` in `fields` (a plain `.update()` — `leaderboardApi.js:67-76` — so an added key needs no code change there).

### Correction 6 — the `LogDayModal` details step must be reachable from BOTH exits of the stats step.

`LeaderboardPage.jsx` today wires `<SessionStatsForm saving onSave={handleSaveStats} onSkip={onClose} />` (`:110-114`), and `handleSaveStats` itself calls `onClose()` on success (`:80`). **Both exits close the modal.** Appending a `"details"` step without rewiring both would make the new step unreachable — the feature would ship dead, and no test in this repo would catch it.

**The fix, in Task 7:** `onSkip` becomes `() => setStep("details")` and `handleSaveStats`'s `onClose()` becomes `setStep("details")`. `onClose()` moves to the details step's own save/skip handlers. Task 7 Step 6 greps for exactly this.

### Verified as written — do not "correct" these

- **`046` is genuinely the next free number.** `migrations/045_activity_feed_comments.sql` is the last numbered file; `044_crew_photos.sql` before it.
- **`ski_sessions` has no `title` column.** Confirmed from `information_schema.columns` on production — 22 columns, none named `title`. Its owner column is **`user_id`** (not `owner_id`, not `actor_id`).
- **Neither `ski_session_photos` nor `ski_session_tags` exists.** `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'ski_session%'` returns exactly one row: `ski_sessions`.
- **The `ski-day-media` bucket does not exist.** `SELECT id FROM storage.buckets` returns exactly `profile-photos`, `trip-media`, `chat-media`, `crew-photos`.
- **`crew-photos`' in-migration bucket pattern is exactly as the spec describes** (`migrations/044_crew_photos.sql`: `INSERT INTO storage.buckets (id, name, public) VALUES (…, true) ON CONFLICT (id) DO NOTHING;` + an authenticated-insert policy + a public-read policy), and **`chat-media`'s self-delete policy** (`supabase/migrations/20260519_chat_media.sql`) is `USING (bucket_id = 'chat-media' AND (storage.foldername(name))[1] = auth.uid()::text)` — **folder index `[1]`, user id first**. `trip-media`'s path is `${tripId}/${user.id}/…` (`socialApi.js:3386`), which is why its user id would be `[2]`; this slice follows `chat-media`, not `trip-media`.
- **`groupCommentsByActivity`'s pattern** (`src/lib/activityComments.js`) is: bucket into a fresh `{}`, `continue` on a falsy key, sort each bucket with `stamp()` returning `Date.parse(...)` when `Number.isFinite` and **`Infinity`** otherwise so unparseable dates sort **last**, never mutate the caller's array. Task 2's two grouping functions reproduce this exactly.
- **`TripDetailModal.jsx:1219-1238`** really is a `friends.map()` over `getAcceptedFriends()` output rendering `<label><input type="checkbox" …/><Avatar profile={f} size={28}/><span>{f.full_name || f.username}</span></label>` with a `Set`-based toggle. Task 4's extraction is a faithful lift.
- **Production has live fixtures for RLS impersonation:** 6 users, 4 accepted friendships, 112 ski_sessions, 11 activity rows. Session `ccc2c050-1dd4-4f49-8830-54ce149542a2` is owned by `3fc059fa-2034-402e-881d-e92329e70c1b`, whose friends include `db7fe685-68e2-4420-a6c5-d254b0e4fa26`; `6a08b793-f03a-4e1c-bd9f-17eed05169d6` is a real non-friend. Task 1 re-derives these rather than trusting them.

### One live security observation, deliberately OUT of scope

`ski_sessions` carries a SELECT policy named **`"authenticated users can view all sessions"` with `qual = (auth.uid() IS NOT NULL)`** — i.e. every logged-in user can already read every ski session row on production. That is the same `USING (true)`-class hole migration 045 fixed on `activity_feed_reactions`, one table over. **This slice does not fix it.** Closing it would change what the leaderboard, `getMySessions`, the trip backfill and the arrival trigger can read, which is a separate slice with its own blast radius. It is recorded here so the reviewer does not mistake it for something this branch introduced, and so it can be raised with Kyle as a follow-up. The new tables are *stricter* than the table they hang off — that is intentional and is not a bug.

---

## Global Constraints

- **No new npm dependencies.**
- **Max 6 photos per session** (`MAX_PHOTOS_PER_SESSION = 6`), counting photos already attached. Enforced in `validatePhotoSelection()` and re-checked in the picker UI.
- **Max 5 MB per photo** (`MAX_PHOTO_BYTES = 5 * 1024 * 1024`). Enforced per-file in `validatePhotoSelection()`; oversized files are rejected individually, not by rejecting the whole selection.
- **Title max 60 characters** (`TITLE_MAX_LENGTH = 60`). Enforced client-side by `clampTitle()` **and** by a `CHECK` constraint on `ski_sessions.title`, so a raw client call cannot exceed it either.
- **Tagging is one-way, friends-only, with no confirmation step.** A tag is a label, not a membership grant. There is no accept/decline, no pending state, and **no notification row** — tagging is silent. The friends-only rule is enforced in RLS (`are_friends(tagged_user_id)`), not only in the UI.
- **Thumbnails only — no lightbox, no full-screen viewer, no photo click handler** anywhere in this slice. A photo thumbnail in the Feed is a non-interactive `<img>`.
- **No photo captions.** `ski_session_photos` has no caption column and no caption input exists.
- **No next-login nudge.** That is Feed-C2, a separate slice that depends on this one.
- **Inline `style={{}}` objects**; colors via `var(--color-*)` tokens for anything semantic/stateful. This slice introduces no new hardcoded color.
- **Migration number `046`** — verified free as of 2026-09-02.
- **RLS discipline:** never read an RLS-protected relation inline inside another policy — always go through a `SECURITY DEFINER STABLE` helper. **And test the success case, not just denials:** this repo shipped a policy once (migration 041) that refused every legitimate user while passing every denial test. Task 1 Step 6 is a mandatory live, impersonated *success*-case test; it is not optional and it is not satisfied by "the SQL looks right."
- **Re-verify the `npm test` / `npx eslint .` baseline in the fresh worktree before starting — do not trust this cited number.** Observed on `main`, 2026-09-02: **165 tests passing / 96 lint problems (88 errors, 8 warnings)**. Record what you actually observe in the worktree and compare against that.
- **No subagent in this environment has browser or Supabase-auth tooling.** Tasks 2-10 are verified via `npm test` / `npx eslint .` / `npm run build` / diff review **only** — say so plainly in each task report, do not imply a browser check happened. **Task 1 is the deliberate exception:** it has real database tooling (`mcp__claude_ai_Supabase__apply_migration` and `mcp__claude_ai_Supabase__execute_sql`, both proven working in this environment) and must use it for both application and verification.
- **No realtime subscription anywhere in this slice.** Details refresh by refetch/local splice only.
- **Ask before pushing to `main`** — it auto-deploys to `powdays.app` live, with no staging step. This plan's execution stays on a worktree branch; merging happens only after Kyle signs off.

---

## File Structure

| File | Change |
|---|---|
| `migrations/046_ski_day_details.sql` | *new* — `ski_sessions.title` + length CHECK; `owns_ski_session()` and `can_see_ski_session()` helpers; `ski_session_photos` and `ski_session_tags` tables + indexes + RLS enable + 7 policies; the `ski-day-media` bucket + 3 storage policies |
| `src/lib/skiDayDetails.js` | *new* — pure `groupPhotosBySession`, `groupTagsBySession`, `validatePhotoSelection`, `formatTaggedNames`, `clampTitle` + the three constants |
| `src/lib/skiDayDetails.test.js` | *new* — 24 `node --test` cases |
| `src/lib/socialApi.js` | *modify (additive)* — `updateSessionTitle`, `getSessionPhotos`, `addSessionPhoto`, `deleteSessionPhoto`, `getSessionTags`, `addSessionTag`, `removeSessionTag`, `reconcileSessionTags`, `saveSkiDayDetails`, inserted after `deleteActivityComment` (ends line 4070); plus `getActivityFeed` (`:3900-3953`) extended with two batched second-queries |
| `src/components/FriendTagPicker.jsx` | *new* — controlled `Set`-of-ids friend checkbox list, extracted from `TripDetailModal`'s inline pattern |
| `src/components/SkiDayDetailsForm.jsx` | *new* — title input + photo picker + `FriendTagPicker`, emits a diff, makes no API calls |
| `src/components/LeaderboardPage.jsx` | *modify* — `LogDayModal` gains a third `"details"` step; both exits of the stats step route into it |
| `src/components/SessionRecapModal.jsx` | *modify* — a persistent `SkiDayDetailsForm` section above the action row |
| `src/components/SessionEditForm.jsx` | *modify* — new Title field, "Activity Name" relabelled to "Notes", details diff passed as `onSave`'s second argument |
| `src/components/ProfileStats.jsx` | *modify* — `RecentSessionsFeed`'s `onSave` handler accepts and forwards the details diff |
| `src/components/ActivityFeed.jsx` | *modify* — title line, photo thumbnail strip, tagged-friends line on `ski_session` cards |
| `src/lib/leaderboardApi.js` | *unmodified* — see Correction 5. `updateSessionStats`'s plain `.update()` already carries a new `title` key with no change |
| `src/components/SessionStatsForm.jsx` | *unmodified* — only its `onSkip` **call site** in `LeaderboardPage.jsx` changes |
| `src/components/TripDetailModal.jsx` | *unmodified* — its invite panel is the visual source for `FriendTagPicker` but is not refactored to use it; it carries trip-specific concerns (already-invited/already-RSVPd disabling, an email tab, a send button) that the extraction deliberately drops |
| `migrations/044`, `045`, `supabase/migrations/20260519_chat_media.sql` | *unmodified* — read as precedent only |

**Note on mount sites:** `ActivityFeed.jsx` is mounted in **two** places — the Crew tab's Feed sub-tab (`MessagingCenter.jsx`) and the Today tab's Friends section (`TodayScreen.jsx`). Neither passes props. Everything in Task 10 lands on both surfaces automatically; do not scope anything to one call site, and do not add a required prop.

---

### Task 1: Migration 046 — `title`, the two join tables, two RLS helpers, and the `ski-day-media` bucket

**Files:**
- Create: `migrations/046_ski_day_details.sql`

**Interfaces:**
- Consumes: `public.are_friends(p_other UUID) RETURNS BOOLEAN` (exists, one argument — Correction 1); `public.ski_sessions(id, user_id)`; `auth.users(id)`; `storage.buckets`, `storage.objects`.
- Produces (Tasks 3, 6, 7, 8, 9 and 10 all depend on these existing):
  - `public.ski_sessions.title TEXT NULL`, with `CHECK (title IS NULL OR char_length(title) <= 60)`.
  - `public.owns_ski_session(p_session_id UUID) RETURNS BOOLEAN`, `SECURITY DEFINER STABLE`, executable by `authenticated`.
  - `public.can_see_ski_session(p_session_id UUID) RETURNS BOOLEAN`, `SECURITY DEFINER STABLE`, executable by `authenticated`.
  - Table `public.ski_session_photos (id UUID PK, session_id UUID NOT NULL, user_id UUID NOT NULL, storage_path TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL)`, RLS **enabled**, policies `ski_session_photos_select` / `_insert` / `_delete`.
  - Table `public.ski_session_tags (id UUID PK, session_id UUID NOT NULL, tagged_user_id UUID NOT NULL, tagged_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL, UNIQUE (session_id, tagged_user_id))`, RLS **enabled**, policies `ski_session_tags_select` / `_insert` / `_delete`.
  - Storage bucket `ski-day-media`, public read, authenticated insert, self-delete on `(storage.foldername(name))[1] = auth.uid()::text`.

- [ ] **Step 1: Write the migration file**

Create `migrations/046_ski_day_details.sql` with exactly this content:

```sql
-- Migration 046: ski day details — title, photos, friend tags
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS
--
-- Feed slice C1 (ROADMAP.md TASK 22.0) lets a user title a ski day, attach photos to
-- it, and tag the friends they skied with — from all three places a day is created or
-- edited today (LogDayModal, SessionRecapModal, SessionEditForm) — and renders all
-- three on the Feed's ski_session cards.
--
-- WHY JOIN TABLES AND NOT ARRAY COLUMNS
--
-- Migration 037's own rationale for plan_parties (vs. a column on daily_plans) applies
-- unchanged. ski_sessions already has five independent writers — the arrival trigger,
-- logSkiDay()'s upsert, GPS session start, GPS session end (flushSessionToSupabase),
-- and the Strava sync — and logSkiDay() in particular does an UPSERT on
-- (user_id, session_date, resort_name). An array column on ski_sessions would be
-- silently nulled by any writer that does not know about it. A join table sidesteps
-- that whole class of bug. `title` is a scalar the user types once, so it is a plain
-- column; photos and tags are sets that other writers must not be able to clobber.
--
-- THE VISIBILITY RULE. Everything hanging off a ski day is visible to exactly whoever
-- can see the day: the owner, or a friend of the owner. Tagged people additionally see
-- their own tag rows, so a tag is never invisible to its subject.
--
-- WHY TWO SECURITY DEFINER HELPERS
--
-- No policy here reads ski_sessions inline. That is the mistake migration 041 nearly
-- shipped and that 20260515_crew_rls_fix.sql and 022 exist to undo. Both helpers are
-- SECURITY DEFINER so the read happens outside the policy evaluator, and STABLE so
-- they inline and do not re-execute per candidate row (032:52-57). This is
-- can_see_activity()'s exact shape from migration 045, one table over.
--
-- WHY are_friends() TAKES ONE ARGUMENT
--
-- are_friends(p_other) is ALWAYS relative to auth.uid() (032:61-70). There is no
-- two-argument form; calling one aborts the migration with 42883. So the tag INSERT
-- policy below expresses "the OWNER and the tagged user are friends" by first pinning
-- the caller to both roles:
--
--   tagged_by = auth.uid()                  the caller is the tagger
--   owns_ski_session(session_id)            the caller owns this specific session
--   are_friends(tagged_user_id)             the caller and the tagged user are friends
--
-- All three are load-bearing. Drop the first and A could write a row claiming B did
-- the tagging. Drop the second and anyone could tag people onto someone else's day.
-- Drop the third and a stranger could be tagged onto your day. Only with all three
-- does are_friends(tagged_user_id) mean what the design intended.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--
-- ski_sessions carries a live SELECT policy, "authenticated users can view all
-- sessions", with qual (auth.uid() IS NOT NULL) — every logged-in user can already
-- read every session row. That is the same USING (true) class migration 045 closed on
-- activity_feed_reactions, but closing it here would change what the leaderboard,
-- getMySessions, the trip backfill and the arrival trigger can read. It is a separate
-- slice. The two new tables are deliberately STRICTER than the table they hang off.
--
-- Also not here, by design: no notifications row on tag (tagging is silent), no photo
-- caption column, no lightbox-supporting metadata (width/height/thumbnail path).
--
-- ROLLBACK, if anything breaks:
--   DROP TABLE IF EXISTS public.ski_session_tags;
--   DROP TABLE IF EXISTS public.ski_session_photos;
--   DROP FUNCTION IF EXISTS public.can_see_ski_session(UUID);
--   DROP FUNCTION IF EXISTS public.owns_ski_session(UUID);
--   ALTER TABLE public.ski_sessions DROP CONSTRAINT IF EXISTS ski_sessions_title_length;
--   ALTER TABLE public.ski_sessions DROP COLUMN IF EXISTS title;
--   DROP POLICY IF EXISTS "Authenticated users can upload ski day media" ON storage.objects;
--   DROP POLICY IF EXISTS "Ski day media is publicly readable" ON storage.objects;
--   DROP POLICY IF EXISTS "Users can delete their own ski day media" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'ski-day-media';

BEGIN;

-- ── The title column ────────────────────────────────────────────────────────
-- Nullable with no default: every one of the 112 existing rows keeps reading NULL,
-- and the Feed's title line is simply absent for them. The CHECK mirrors the 60-char
-- client cap so a raw supabase-js call cannot exceed it either. notes is left alone
-- and is NOT backfilled into title — it holds mixed-intent private free text that a
-- blind copy would publish to the Feed.

ALTER TABLE public.ski_sessions ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE public.ski_sessions DROP CONSTRAINT IF EXISTS ski_sessions_title_length;
ALTER TABLE public.ski_sessions ADD CONSTRAINT ski_sessions_title_length
  CHECK (title IS NULL OR char_length(title) <= 60);

-- ── The two visibility helpers ──────────────────────────────────────────────
-- Same shape as can_see_activity() (045), which is itself modelled on
-- can_see_trip_content() (042:56-69).

CREATE OR REPLACE FUNCTION public.owns_ski_session(p_session_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM ski_sessions s
     WHERE s.id = p_session_id
       AND s.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.owns_ski_session(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_ski_session(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_see_ski_session(p_session_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM ski_sessions s
     WHERE s.id = p_session_id
       AND (s.user_id = auth.uid() OR public.are_friends(s.user_id))
  );
$$;

REVOKE ALL ON FUNCTION public.can_see_ski_session(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_see_ski_session(UUID) TO authenticated;

-- ── Photos ──────────────────────────────────────────────────────────────────
-- storage_path, not a URL: public URLs are resolved at read time with
-- getPublicUrl(), the same way trip_media does it (socialApi.js:3420), so the bucket
-- can be renamed or fronted by a CDN without rewriting 
-- rows. user_id is redundant with the session's owner today (only the owner can
-- insert) but is kept because it is what the storage self-delete policy's folder
-- convention is keyed on, and it makes an orphaned row traceable.

CREATE TABLE IF NOT EXISTS public.ski_session_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID REFERENCES public.ski_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  storage_path TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ski_session_photos_session
  ON public.ski_session_photos (session_id);

-- NOT optional, and NOT inherited: this is a brand-new table, and Supabase grants
-- `authenticated` full DML on new public-schema tables by default. A table with
-- policies but RLS disabled ignores those policies entirely. Migration 045 shipped
-- this line for the same reason after it was nearly omitted.
ALTER TABLE public.ski_session_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ski_session_photos_select ON public.ski_session_photos;
CREATE POLICY ski_session_photos_select ON public.ski_session_photos
  FOR SELECT TO authenticated USING (public.can_see_ski_session(session_id));

-- Both conjuncts matter: the first stops A writing a row attributed to B, the second
-- stops anyone attaching photos to a day they do not own.
DROP POLICY IF EXISTS ski_session_photos_insert ON public.ski_session_photos;
CREATE POLICY ski_session_photos_insert ON public.ski_session_photos
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.owns_ski_session(session_id));

DROP POLICY IF EXISTS ski_session_photos_delete ON public.ski_session_photos;
CREATE POLICY ski_session_photos_delete ON public.ski_session_photos
  FOR DELETE TO authenticated USING (public.owns_ski_session(session_id));

-- ── Tags ────────────────────────────────────────────────────────────────────
-- UNIQUE (session_id, tagged_user_id) makes re-tagging the same person idempotent
-- rather than an error the UI has to dedupe. tagged_by is kept even though it always
-- equals the session owner under the INSERT policy below: it is the audit trail if
-- that policy ever widens, and it costs one uuid per row.

CREATE TABLE IF NOT EXISTS public.ski_session_tags (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID REFERENCES public.ski_sessions(id) ON DELETE CASCADE NOT NULL,
  tagged_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tagged_by      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, tagged_user_id)
);

CREATE INDEX IF NOT EXISTS ski_session_tags_session
  ON public.ski_session_tags (session_id);

-- Feed-C2 will query "sessions I am tagged in" for the next-login nudge; this index
-- is the one that query needs, and it costs nothing to create now.
CREATE INDEX IF NOT EXISTS ski_session_tags_tagged_user
  ON public.ski_session_tags (tagged_user_id);

ALTER TABLE public.ski_session_tags ENABLE ROW LEVEL SECURITY;

-- The tagged person sees their own tag even if they are not (or are no longer) a
-- friend of the owner — a tag must never be invisible to its subject, or the
-- self-untag below would be unreachable.
DROP POLICY IF EXISTS ski_session_tags_select ON public.ski_session_tags;
CREATE POLICY ski_session_tags_select ON public.ski_session_tags
  FOR SELECT TO authenticated
  USING (public.can_see_ski_session(session_id) OR tagged_user_id = auth.uid());

-- Three conjuncts, all load-bearing. See "WHY are_friends() TAKES ONE ARGUMENT" above.
DROP POLICY IF EXISTS ski_session_tags_insert ON public.ski_session_tags;
CREATE POLICY ski_session_tags_insert ON public.ski_session_tags
  FOR INSERT TO authenticated
  WITH CHECK (
    tagged_by = auth.uid()
    AND public.owns_ski_session(session_id)
    AND public.are_friends(tagged_user_id)
  );

-- Owner removes a tag, or the tagged person removes themselves. One-way tagging with
-- no confirmation step is only acceptable because self-untag exists.
DROP POLICY IF EXISTS ski_session_tags_delete ON public.ski_session_tags;
CREATE POLICY ski_session_tags_delete ON public.ski_session_tags
  FOR DELETE TO authenticated
  USING (public.owns_ski_session(session_id) OR tagged_user_id = auth.uid());

-- ── Storage ─────────────────────────────────────────────────────────────────
-- Bucket created IN this migration, matching 044_crew_photos.sql and
-- 20260519_chat_media.sql. trip-media's bucket was a manual step outside its
-- migration, which is why a fresh environment cannot reproduce it; that gap is not
-- repeated here.
--
-- Path convention is `${user_id}/${session_id}/${timestamp}.${ext}` — USER ID FIRST,
-- so the self-delete policy's folder index is [1], matching chat-media exactly.
-- (trip-media uses `${trip_id}/${user_id}/…`, so its user id would be [2]. Do not
-- copy that one.)

INSERT INTO storage.buckets (id, name, public)
VALUES ('ski-day-media', 'ski-day-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload ski day media" ON storage.objects;
CREATE POLICY "Authenticated users can upload ski day media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'ski-day-media');

DROP POLICY IF EXISTS "Ski day media is publicly readable" ON storage.objects;
CREATE POLICY "Ski day media is publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'ski-day-media');

DROP POLICY IF EXISTS "Users can delete their own ski day media" ON storage.objects;
CREATE POLICY "Users can delete their own ski day media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'ski-day-media' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;
```

- [ ] **Step 2: Apply it via the Supabase MCP tool**

Call `mcp__claude_ai_Supabase__apply_migration` with `project_id` = `hkzaohqrycwfgmcogwdo` (the "Colorado Ski Dashboard + Ski With Friends" project), `name` = `046_ski_day_details`, and the SQL above **verbatim** (including comments — every prior migration's rationale is preserved in the database's migration history).

If it errors, do not retry blindly: read the error, fix the SQL file, and re-apply. Report the exact error text if you need to deviate from the SQL above. A `42883: function public.are_friends(uuid, uuid) does not exist` here means Correction 1 was not applied.

- [ ] **Step 3: Reload the PostgREST schema cache**

Run via `mcp__claude_ai_Supabase__execute_sql`:

```sql
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 4: Verify the structure with read-only queries**

Run each of these via `mcp__claude_ai_Supabase__execute_sql` and **paste the actual output into the task report** — "looks right" is not a verification.

Query A — the title column and its CHECK:
```sql
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='ski_sessions' AND column_name='title';

SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conrelid='public.ski_sessions'::regclass AND conname='ski_sessions_title_length';
```
Expected: one column row — `title`, `text`, `YES`, default `NULL`. One constraint row whose def contains `char_length(title) <= 60`.

Query B — both tables' columns:
```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN ('ski_session_photos','ski_session_tags')
 ORDER BY table_name, ordinal_position;
```
Expected: `ski_session_photos` → `id` (uuid, NO, `gen_random_uuid()`), `session_id` (uuid, NO), `user_id` (uuid, NO), `storage_path` (text, NO), `created_at` (timestamp with time zone, NO, `now()`). `ski_session_tags` → `id`, `session_id`, `tagged_user_id`, `tagged_by`, `created_at`, all NOT NULL.

Query C — RLS is actually ON, on both:
```sql
SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class
 WHERE oid IN ('public.ski_session_photos'::regclass, 'public.ski_session_tags'::regclass);
```
Expected: `relrowsecurity = true` for **both**. **If either is false, stop — that table's policies are inert and it is world-writable.**

Query D — indexes and constraints:
```sql
SELECT tablename, indexname, indexdef FROM pg_indexes
 WHERE schemaname='public' AND tablename IN ('ski_session_photos','ski_session_tags')
 ORDER BY tablename, indexname;

SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conrelid IN ('public.ski_session_photos'::regclass, 'public.ski_session_tags'::regclass)
 ORDER BY tbl, conname;
```
Expected indexes: `ski_session_photos_session` on `(session_id)`, `ski_session_tags_session` on `(session_id)`, `ski_session_tags_tagged_user` on `(tagged_user_id)`, plus each pkey and the tags UNIQUE index.
Expected constraints: FKs `session_id → public.ski_sessions(id) ON DELETE CASCADE` on both; `user_id → auth.users(id)` on photos; `tagged_user_id → auth.users(id)` and `tagged_by → auth.users(id)` on tags; and `UNIQUE (session_id, tagged_user_id)` on tags.

Query E — all six table policies:
```sql
SELECT tablename, policyname, cmd, qual, with_check
  FROM pg_policies
 WHERE tablename IN ('ski_session_photos','ski_session_tags')
 ORDER BY tablename, policyname;
```
Expected, exactly six rows:
- `ski_session_photos_select` — SELECT, qual `can_see_ski_session(session_id)`
- `ski_session_photos_insert` — INSERT, with_check `(user_id = auth.uid()) AND owns_ski_session(session_id)`
- `ski_session_photos_delete` — DELETE, qual `owns_ski_session(session_id)`
- `ski_session_tags_select` — SELECT, qual `can_see_ski_session(session_id) OR (tagged_user_id = auth.uid())`
- `ski_session_tags_insert` — INSERT, with_check containing **all three** of `tagged_by = auth.uid()`, `owns_ski_session(session_id)`, `are_friends(tagged_user_id)`
- `ski_session_tags_delete` — DELETE, qual `owns_ski_session(session_id) OR (tagged_user_id = auth.uid())`

**No policy body may contain the string `ski_sessions`** — if one does, the helper was inlined and Correction 2 was not applied.

Query F — the helpers' properties:
```sql
SELECT p.proname, p.prosecdef AS security_definer, p.provolatile AS volatility,
       pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('owns_ski_session','can_see_ski_session');
```
Expected: two rows, both `security_definer = true` and `volatility = 's'` (STABLE, not `'v'`). If either comes back `'v'`, it will re-execute per candidate row — fix and re-apply.

Query G — the bucket and its three storage policies:
```sql
SELECT id, name, public FROM storage.buckets WHERE id = 'ski-day-media';

SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname='storage' AND tablename='objects' AND policyname ILIKE '%ski day media%'
 ORDER BY policyname;
```
Expected: one bucket row with `public = true`. Three policy rows; the DELETE one's qual must contain **`(storage.foldername(name))[1]`** — index `1`, not `2`.

- [ ] **Step 5: Pick real fixtures for the live test**

```sql
SELECT s.id AS session_id, s.user_id AS owner_id,
       CASE WHEN fr.requester_id = s.user_id THEN fr.recipient_id ELSE fr.requester_id END AS friend_id
  FROM ski_sessions s
  JOIN friend_requests fr ON fr.status='accepted'
   AND (fr.requester_id = s.user_id OR fr.recipient_id = s.user_id)
 ORDER BY s.created_at DESC LIMIT 1;
```
Then, substituting the `owner_id` you just got:
```sql
SELECT u.id AS stranger_id FROM auth.users u
 WHERE u.id <> '<OWNER_ID>'
   AND NOT EXISTS (
     SELECT 1 FROM friend_requests fr WHERE fr.status='accepted'
       AND ((fr.requester_id = u.id AND fr.recipient_id = '<OWNER_ID>')
         OR (fr.recipient_id = u.id AND fr.requester_id = '<OWNER_ID>')))
 LIMIT 1;
```
Production had 6 users / 4 accepted friendships / 112 sessions when this plan was written, so both return rows. Record the three UUIDs (`OWNER_ID`, `FRIEND_ID`, `STRANGER_ID`) and the `SESSION_ID` in the task report.

- [ ] **Step 6: Verify the RLS behaviour live — the SUCCESS cases first, then the denials**

This step is **mandatory and is the point of the whole task.** This repo has already shipped a migration whose first version refused every legitimate action while passing every "strangers are blocked" test; that only surfaced because a success-case test was added. Denial-only verification does not satisfy this step.

`mcp__claude_ai_Supabase__execute_sql` can impersonate a user — proven working in this environment:

```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<UUID>","role":"authenticated"}';
SELECT auth.uid();
ROLLBACK;
```

**6a — SUCCESS: the owner can set a title, add a photo, and tag a friend.** Substitute the UUIDs and run as one block:

```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<OWNER_ID>","role":"authenticated"}';

SELECT public.owns_ski_session('<SESSION_ID>')     AS owns_should_be_true;
SELECT public.can_see_ski_session('<SESSION_ID>')  AS can_see_should_be_true;
SELECT public.are_friends('<FRIEND_ID>')           AS friends_should_be_true;

UPDATE public.ski_sessions SET title = 'rls probe 046 title' WHERE id = '<SESSION_ID>';
SELECT title AS title_should_be_probe FROM public.ski_sessions WHERE id = '<SESSION_ID>';

INSERT INTO public.ski_session_photos (session_id, user_id, storage_path)
VALUES ('<SESSION_ID>', '<OWNER_ID>', '<OWNER_ID>/<SESSION_ID>/rlsprobe046.jpg');

SELECT count(*) AS photo_readable_should_be_1
  FROM public.ski_session_photos WHERE session_id = '<SESSION_ID>';

INSERT INTO public.ski_session_tags (session_id, tagged_user_id, tagged_by)
VALUES ('<SESSION_ID>', '<FRIEND_ID>', '<OWNER_ID>');

SELECT count(*) AS tag_readable_should_be_1
  FROM public.ski_session_tags WHERE session_id = '<SESSION_ID>';

ROLLBACK;
```

Expected: all three helper booleans `true`, `title_should_be_probe = 'rls probe 046 title'`, both INSERTs **succeed**, both counts `= 1`.

**6b — SUCCESS: the friend can see the photo, the tag, and the title.** Because 6a rolls back, this block re-creates the rows as the owner, then re-impersonates as the friend inside the same transaction:

```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<OWNER_ID>","role":"authenticated"}';
INSERT INTO public.ski_session_photos (session_id, user_id, storage_path)
VALUES ('<SESSION_ID>', '<OWNER_ID>', '<OWNER_ID>/<SESSION_ID>/rlsprobe046.jpg');
INSERT INTO public.ski_session_tags (session_id, tagged_user_id, tagged_by)
VALUES ('<SESSION_ID>', '<FRIEND_ID>', '<OWNER_ID>');

SET LOCAL request.jwt.claims = '{"sub":"<FRIEND_ID>","role":"authenticated"}';
SELECT public.can_see_ski_session('<SESSION_ID>') AS friend_can_see_should_be_true;
SELECT count(*) AS friend_sees_photo_should_be_1
  FROM public.ski_session_photos WHERE session_id = '<SESSION_ID>';
SELECT count(*) AS friend_sees_tag_should_be_1
  FROM public.ski_session_tags WHERE session_id = '<SESSION_ID>';

-- self-untag: the tagged person removes their own tag
DELETE FROM public.ski_session_tags
 WHERE session_id = '<SESSION_ID>' AND tagged_user_id = '<FRIEND_ID>';
SELECT count(*) AS after_self_untag_should_be_0
  FROM public.ski_session_tags WHERE session_id = '<SESSION_ID>';

ROLLBACK;
```

Expected: `true`, `1`, `1`, then `0`. **`after_self_untag_should_be_0 = 0` is the proof self-untag works** — one-way tagging with no confirmation step is only acceptable because of it.

**6c — SUCCESS: the owner can delete their own photo.**

```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<OWNER_ID>","role":"authenticated"}';
INSERT INTO public.ski_session_photos (session_id, user_id, storage_path)
VALUES ('<SESSION_ID>', '<OWNER_ID>', '<OWNER_ID>/<SESSION_ID>/rlsprobe046b.jpg');
DELETE FROM public.ski_session_photos
 WHERE session_id = '<SESSION_ID>' AND storage_path LIKE '%rlsprobe046b.jpg';
SELECT count(*) AS owner_delete_should_be_0
  FROM public.ski_session_photos WHERE storage_path LIKE '%rlsprobe046b.jpg';
ROLLBACK;
```
Expected: `0`.

**Any failure in 6a-6c means the policies are too strict and the feature is broken for real users, even though every denial test below would still pass.** That is the exact failure mode this step exists to catch.

**6d — the denial cases.** Run each as its **own** call, because a policy violation aborts the surrounding block.

Denial 1 — a stranger cannot see photos or tags:
```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<STRANGER_ID>","role":"authenticated"}';
SELECT public.can_see_ski_session('<SESSION_ID>') AS should_be_false;
SELECT count(*) AS photos_visible_should_be_0
  FROM public.ski_session_photos WHERE session_id = '<SESSION_ID>';
SELECT count(*) AS tags_visible_should_be_0
  FROM public.ski_session_tags WHERE session_id = '<SESSION_ID>';
ROLLBACK;
```
Expected: `false`, `0`, `0`.

Denial 2 — a non-friend cannot be tagged, even by the session's owner:
```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<OWNER_ID>","role":"authenticated"}';
INSERT INTO public.ski_session_tags (session_id, tagged_user_id, tagged_by)
VALUES ('<SESSION_ID>', '<STRANGER_ID>', '<OWNER_ID>');
ROLLBACK;
```
Expected: **ERROR** — `new row violates row-level security policy for table "ski_session_tags"`. An error here is a PASS. This is the `are_friends(tagged_user_id)` conjunct doing its job.

Denial 3 — a friend cannot attach a photo to someone else's day:
```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<FRIEND_ID>","role":"authenticated"}';
INSERT INTO public.ski_session_photos (session_id, user_id, storage_path)
VALUES ('<SESSION_ID>', '<FRIEND_ID>', '<FRIEND_ID>/x/nope.jpg');
ROLLBACK;
```
Expected: **ERROR** — the `owns_ski_session(session_id)` conjunct. An error here is a PASS.

Denial 4 — a friend cannot tag people onto someone else's day:
```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<FRIEND_ID>","role":"authenticated"}';
INSERT INTO public.ski_session_tags (session_id, tagged_user_id, tagged_by)
VALUES ('<SESSION_ID>', '<FRIEND_ID>', '<FRIEND_ID>');
ROLLBACK;
```
Expected: **ERROR**. An error here is a PASS.

Denial 5 — the 60-char CHECK is real:
```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<OWNER_ID>","role":"authenticated"}';
UPDATE public.ski_sessions SET title = repeat('x', 61) WHERE id = '<SESSION_ID>';
ROLLBACK;
```
Expected: **ERROR** — `new row for relation "ski_sessions" violates check constraint "ski_sessions_title_length"`. An error here is a PASS.

- [ ] **Step 7: Confirm the probes left nothing behind**

The blocks above are wrapped in `ROLLBACK`, but confirm rather than assume:

```sql
SELECT count(*) AS leftover_probe_photos FROM public.ski_session_photos;
SELECT count(*) AS leftover_probe_tags   FROM public.ski_session_tags;
SELECT count(*) AS leftover_probe_titles FROM public.ski_sessions WHERE title IS NOT NULL;
```
Expected: `0`, `0`, `0`. If any is non-zero, delete the probe rows (`DELETE FROM public.ski_session_photos WHERE storage_path LIKE '%rlsprobe046%';`, `DELETE FROM public.ski_session_tags WHERE session_id = '<SESSION_ID>';`, `UPDATE public.ski_sessions SET title = NULL WHERE title LIKE 'rls probe 046%';`) and re-verify before moving on.

- [ ] **Step 8: Commit**

```bash
git add migrations/046_ski_day_details.sql
git commit -m "feat: ski day title, photos and friend tags — tables, RLS helpers, ski-day-media bucket"
```

- [ ] **Step 9: Report**

Record in the task report: the full output of every query in Steps 4-7; the three fixture UUIDs; an explicit statement that the **success cases** 6a, 6b and 6c passed with the INSERTs actually succeeding, the friend actually reading both rows back, and the self-untag actually deleting; the five denial results; and confirmation that Correction 1 (one-argument `are_friends`) and Correction 2 (no inline `ski_sessions` read in any policy) were both applied, with the live evidence for each.

---

### Task 0 (setup): Record the fresh-worktree test/lint baseline

Do this **before** Task 1 if it has not already happened, and record the numbers verbatim in the task report — Task 11 compares against them, and a number carried over from `main` is not a valid baseline (see the Global Constraints note about drift).

- [ ] **Step 1: Create the worktree**

Use `superpowers:using-git-worktrees`. Branch name: `worktree-crew-tab-feed-slice-c1`. Every subsequent task runs inside that worktree, never in the main checkout.

- [ ] **Step 2: Install and measure**

```bash
npm install
npm test 2>&1 | tail -20
npx eslint . 2>&1 | tail -5
npm run build 2>&1 | tail -5
```

Record: the exact `# pass` / `# fail` counts from `npm test`, the exact "N problems (E errors, W warnings)" line from `npx eslint .`, and whether `npm run build` succeeds. Observed on `main` on 2026-09-02 for comparison only: **165 tests passing / 96 lint problems (88 errors, 8 warnings)**. If your worktree numbers differ, **your numbers are the baseline** — do not "fix" pre-existing lint errors in this slice.

---

### Task 2: `src/lib/skiDayDetails.js` — the pure grouping, validation and formatting module

**Files:**
- Create: `src/lib/skiDayDetails.js`
- Create: `src/lib/skiDayDetails.test.js`

**Interfaces:**
- Consumes: nothing. This module imports **nothing** — no `supabase`, no React, no other `src/lib` module. That is what makes it testable under `node --test`, which has no DOM and no bundler resolution for `.jsx`.
- Produces (every later task depends on these exact names):
  - `MAX_PHOTOS_PER_SESSION = 6`, `MAX_PHOTO_BYTES = 5 * 1024 * 1024`, `TITLE_MAX_LENGTH = 60`
  - `groupPhotosBySession(rows) → Record<session_id, PhotoRow[]>` — oldest-first per bucket
  - `groupTagsBySession(rows) → Record<session_id, TagRow[]>` — oldest-first per bucket
  - `validatePhotoSelection(files, existingCount) → { accepted: File[], rejected: Array<{ name, reason }> }`
  - `formatTaggedNames(tags, maxNames = 2) → string`
  - `clampTitle(value) → string`

Row shapes, fixed here and used verbatim by Tasks 3, 6, 9 and 10:

```
PhotoRow = { id, session_id, user_id, storage_path, created_at, url }
TagRow   = { id, session_id, tagged_user_id, tagged_by, created_at, profiles }
```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/skiDayDetails.test.js`. 24 cases. `node --test` + `node:assert/strict`, matching `activityComments.test.js`'s style exactly (module-level factory helpers, one `test()` per behaviour, no describe blocks).

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  groupPhotosBySession,
  groupTagsBySession,
  validatePhotoSelection,
  formatTaggedNames,
  clampTitle,
  MAX_PHOTOS_PER_SESSION,
  MAX_PHOTO_BYTES,
  TITLE_MAX_LENGTH,
} from "./skiDayDetails.js"

const photo = (id, session_id, created_at) => ({
  id,
  session_id,
  user_id: "u1",
  storage_path: `u1/${session_id}/${id}.jpg`,
  created_at,
})

const tag = (id, session_id, tagged_user_id, created_at, profiles = null) => ({
  id,
  session_id,
  tagged_user_id,
  tagged_by: "owner",
  created_at,
  profiles,
})

// A stand-in for a browser File. validatePhotoSelection only ever reads .name, .size
// and .type, deliberately, so it is unit-testable with no DOM and no upload harness.
const file = (name, size, type = "image/jpeg") => ({ name, size, type })

/* ── constants ─────────────────────────────────────────────────────────────── */

test("exports the three caps the whole slice is written against", () => {
  // These are asserted rather than assumed because the migration's CHECK constraint
  // (60) and the storage/UI limits (6, 5MB) are duplicated in SQL and in three
  // components. If someone edits one of these numbers, this is the test that says so.
  assert.equal(MAX_PHOTOS_PER_SESSION, 6)
  assert.equal(MAX_PHOTO_BYTES, 5 * 1024 * 1024)
  assert.equal(TITLE_MAX_LENGTH, 60)
})

/* ── groupPhotosBySession ──────────────────────────────────────────────────── */

test("groupPhotosBySession buckets rows by session_id", () => {
  const rows = [photo("p1", "s1", "2026-09-01T10:00:00Z"), photo("p2", "s2", "2026-09-01T11:00:00Z")]
  const grouped = groupPhotosBySession(rows)
  assert.deepEqual(Object.keys(grouped).sort(), ["s1", "s2"])
  assert.deepEqual(grouped.s1.map((r) => r.id), ["p1"])
  assert.deepEqual(grouped.s2.map((r) => r.id), ["p2"])
})

test("groupPhotosBySession sorts each bucket oldest-first", () => {
  // The thumbnail strip reads left-to-right in upload order, which is the opposite of
  // the feed's own newest-first ordering. Getting it backwards is silently wrong.
  const rows = [
    photo("late", "s1", "2026-09-01T12:00:00Z"),
    photo("early", "s1", "2026-09-01T08:00:00Z"),
    photo("mid", "s1", "2026-09-01T10:00:00Z"),
  ]
  assert.deepEqual(groupPhotosBySession(rows).s1.map((r) => r.id), ["early", "mid", "late"])
})

test("groupPhotosBySession returns {} for empty, null and undefined input", () => {
  assert.deepEqual(groupPhotosBySession([]), {})
  assert.deepEqual(groupPhotosBySession(null), {})
  assert.deepEqual(groupPhotosBySession(undefined), {})
})

test("groupPhotosBySession drops rows with no session_id", () => {
  const rows = [photo("p1", "s1", "2026-09-01T10:00:00Z"), photo("p2", null, "2026-09-01T11:00:00Z")]
  const grouped = groupPhotosBySession(rows)
  assert.deepEqual(Object.keys(grouped), ["s1"])
  assert.equal(grouped.s1.length, 1)
})

test("groupPhotosBySession never mutates or reorders the caller's array", () => {
  const rows = [
    photo("late", "s1", "2026-09-01T12:00:00Z"),
    photo("early", "s1", "2026-09-01T08:00:00Z"),
  ]
  groupPhotosBySession(rows)
  assert.deepEqual(rows.map((r) => r.id), ["late", "early"])
})

/* ── groupTagsBySession ────────────────────────────────────────────────────── */

test("groupTagsBySession buckets rows by session_id and keeps profiles attached", () => {
  const rows = [
    tag("t1", "s1", "friendA", "2026-09-01T10:00:00Z", { id: "friendA", full_name: "Jane Doe" }),
    tag("t2", "s2", "friendB", "2026-09-01T11:00:00Z", { id: "friendB", full_name: "Mike" }),
  ]
  const grouped = groupTagsBySession(rows)
  assert.deepEqual(Object.keys(grouped).sort(), ["s1", "s2"])
  assert.equal(grouped.s1[0].profiles.full_name, "Jane Doe")
})

test("groupTagsBySession sorts a row with no created_at last, not first", () => {
  // Mirrors groupCommentsByActivity's Infinity rule exactly: a locally-spliced row that
  // has not round-tripped yet has no created_at, and it belongs at the END of the list.
  // Treating an unparseable timestamp as 0 would jump it to the front.
  const rows = [
    tag("pending", "s1", "friendB", undefined),
    tag("existing", "s1", "friendA", "2026-09-01T08:00:00Z"),
  ]
  assert.deepEqual(groupTagsBySession(rows).s1.map((r) => r.id), ["existing", "pending"])
})

test("groupTagsBySession returns {} for empty, null and undefined input", () => {
  assert.deepEqual(groupTagsBySession([]), {})
  assert.deepEqual(groupTagsBySession(null), {})
  assert.deepEqual(groupTagsBySession(undefined), {})
})

test("groupTagsBySession keeps buckets independent", () => {
  const rows = [tag("t1", "s1", "a", "2026-09-01T10:00:00Z"), tag("t2", "s2", "b", "2026-09-01T11:00:00Z")]
  const grouped = groupTagsBySession(rows)
  grouped.s1.push(tag("t3", "s1", "c", "2026-09-01T12:00:00Z"))
  assert.equal(grouped.s2.length, 1)
})

/* ── validatePhotoSelection ────────────────────────────────────────────────── */

test("validatePhotoSelection accepts a normal in-budget selection", () => {
  const files = [file("a.jpg", 1000), file("b.png", 2000, "image/png")]
  const { accepted, rejected } = validatePhotoSelection(files, 0)
  assert.deepEqual(accepted.map((f) => f.name), ["a.jpg", "b.png"])
  assert.deepEqual(rejected, [])
})

test("validatePhotoSelection rejects an oversized file individually, keeping the rest", () => {
  // Global Constraint: oversized files are rejected one at a time, NOT by refusing the
  // whole selection. Picking 3 photos where one is a 12MB burst shot must still upload
  // the other two.
  const files = [file("ok.jpg", 1000), file("huge.jpg", MAX_PHOTO_BYTES + 1), file("ok2.jpg", 1000)]
  const { accepted, rejected } = validatePhotoSelection(files, 0)
  assert.deepEqual(accepted.map((f) => f.name), ["ok.jpg", "ok2.jpg"])
  assert.deepEqual(rejected, [{ name: "huge.jpg", reason: "too-large" }])
})

test("validatePhotoSelection accepts a file exactly at the size cap", () => {
  // Boundary: the cap is a maximum, not an exclusive bound. An off-by-one here rejects
  // a legitimate file with no explanation the user can act on.
  const { accepted, rejected } = validatePhotoSelection([file("edge.jpg", MAX_PHOTO_BYTES)], 0)
  assert.equal(accepted.length, 1)
  assert.deepEqual(rejected, [])
})

test("validatePhotoSelection rejects non-images by MIME type", () => {
  const files = [file("clip.mov", 1000, "video/quicktime"), file("notes.pdf", 500, "application/pdf")]
  const { accepted, rejected } = validatePhotoSelection(files, 0)
  assert.deepEqual(accepted, [])
  assert.deepEqual(rejected, [
    { name: "clip.mov", reason: "not-an-image" },
    { name: "notes.pdf", reason: "not-an-image" },
  ])
})

test("validatePhotoSelection stops at the remaining slot count, counting already-attached photos", () => {
  // existingCount = 4 leaves 2 free slots out of MAX_PHOTOS_PER_SESSION = 6.
  const files = [file("1.jpg", 10), file("2.jpg", 10), file("3.jpg", 10)]
  const { accepted, rejected } = validatePhotoSelection(files, 4)
  assert.deepEqual(accepted.map((f) => f.name), ["1.jpg", "2.jpg"])
  assert.deepEqual(rejected, [{ name: "3.jpg", reason: "limit-reached" }])
})

test("validatePhotoSelection accepts nothing when the session is already full", () => {
  const { accepted, rejected } = validatePhotoSelection([file("1.jpg", 10)], MAX_PHOTOS_PER_SESSION)
  assert.deepEqual(accepted, [])
  assert.deepEqual(rejected, [{ name: "1.jpg", reason: "limit-reached" }])
})

test("validatePhotoSelection does not let a rejected file consume a slot", () => {
  // The oversized file must NOT count against the 6-photo budget — otherwise picking a
  // huge file silently costs the user a slot they never filled. existingCount = 5 leaves
  // exactly 1 slot; the huge file is rejected for size and "good.jpg" still takes it.
  const files = [file("huge.jpg", MAX_PHOTO_BYTES * 2), file("good.jpg", 10)]
  const { accepted, rejected } = validatePhotoSelection(files, 5)
  assert.deepEqual(accepted.map((f) => f.name), ["good.jpg"])
  assert.deepEqual(rejected, [{ name: "huge.jpg", reason: "too-large" }])
})

test("validatePhotoSelection tolerates null/undefined input and a junk existingCount", () => {
  assert.deepEqual(validatePhotoSelection(null, 0), { accepted: [], rejected: [] })
  assert.deepEqual(validatePhotoSelection(undefined, 0), { accepted: [], rejected: [] })
  // A junk count must not silently become "unlimited": NaN/negative/undefined all clamp
  // to 0, so at worst the user is allowed a full 6 and RLS/UI re-check catches the rest.
  assert.equal(validatePhotoSelection([file("a.jpg", 10)], NaN).accepted.length, 1)
  assert.equal(validatePhotoSelection([file("a.jpg", 10)], -3).accepted.length, 1)
  assert.equal(validatePhotoSelection([file("a.jpg", 10)], undefined).accepted.length, 1)
})

/* ── formatTaggedNames ─────────────────────────────────────────────────────── */

test("formatTaggedNames renders one, two and three names in natural English", () => {
  const one = [tag("t1", "s1", "a", "2026-09-01T10:00:00Z", { full_name: "Jane Doe" })]
  const two = [...one, tag("t2", "s1", "b", "2026-09-01T11:00:00Z", { full_name: "Mike" })]
  const three = [...two, tag("t3", "s1", "c", "2026-09-01T12:00:00Z", { full_name: "Sam" })]
  assert.equal(formatTaggedNames(one), "Jane Doe")
  assert.equal(formatTaggedNames(two), "Jane Doe and Mike")
  assert.equal(formatTaggedNames(three), "Jane Doe, Mike and 1 other")
})

test("formatTaggedNames pluralises the overflow count", () => {
  const rows = ["a", "b", "c", "d"].map((id, i) =>
    tag(`t${i}`, "s1", id, `2026-09-0${i + 1}T10:00:00Z`, { full_name: id.toUpperCase() })
  )
  assert.equal(formatTaggedNames(rows), "A, B and 2 others")
})

test("formatTaggedNames falls back username → 'Someone' when a profile is missing", () => {
  // A tag whose profile lookup failed must still be COUNTED, not dropped — otherwise a
  // transient profiles query failure makes the "with …" line quietly understate reality.
  const rows = [
    tag("t1", "s1", "a", "2026-09-01T10:00:00Z", { username: "powhound" }),
    tag("t2", "s1", "b", "2026-09-01T11:00:00Z", null),
  ]
  assert.equal(formatTaggedNames(rows), "powhound and Someone")
})

test("formatTaggedNames returns an empty string for empty, null and undefined input", () => {
  // "" is the signal ActivityFeed.jsx uses to omit the whole "with …" line, so it must
  // never be "undefined" or "with ".
  assert.equal(formatTaggedNames([]), "")
  assert.equal(formatTaggedNames(null), "")
  assert.equal(formatTaggedNames(undefined), "")
})

test("formatTaggedNames honours a custom maxNames", () => {
  const rows = ["a", "b", "c"].map((id, i) =>
    tag(`t${i}`, "s1", id, `2026-09-0${i + 1}T10:00:00Z`, { full_name: id.toUpperCase() })
  )
  assert.equal(formatTaggedNames(rows, 3), "A, B and C")
  assert.equal(formatTaggedNames(rows, 1), "A and 2 others")
})

/* ── clampTitle ────────────────────────────────────────────────────────────── */

test("clampTitle trims and passes through a normal title", () => {
  assert.equal(clampTitle("  Powder day at Vail  "), "Powder day at Vail")
  assert.equal(clampTitle(""), "")
  assert.equal(clampTitle("   "), "")
})

test("clampTitle truncates at TITLE_MAX_LENGTH and never leaves a trailing space", () => {
  const long = "x".repeat(TITLE_MAX_LENGTH + 20)
  assert.equal(clampTitle(long).length, TITLE_MAX_LENGTH)
  // 59 x's then a space then more: the cut lands on the space, which must be trimmed off
  // rather than saved as a title ending in whitespace.
  const spacey = `${"x".repeat(TITLE_MAX_LENGTH - 1)} tail`
  assert.equal(clampTitle(spacey), "x".repeat(TITLE_MAX_LENGTH - 1))
})

test("clampTitle counts codepoints, not UTF-16 units, and never splits a surrogate pair", () => {
  // ski_sessions_title_length uses Postgres char_length(), which counts CODEPOINTS.
  // A naive s.slice(0, 60) counts UTF-16 code units, so 61 emoji would be cut to 30
  // characters (over-strict) AND a cut landing mid-pair would store a lone surrogate.
  const emoji = "🎿".repeat(TITLE_MAX_LENGTH + 5)
  const clamped = clampTitle(emoji)
  assert.equal([...clamped].length, TITLE_MAX_LENGTH)
  assert.equal(clamped, "🎿".repeat(TITLE_MAX_LENGTH))
  // Non-strings are coerced to "", never to "null"/"undefined"/"42".
  assert.equal(clampTitle(null), "")
  assert.equal(clampTitle(undefined), "")
  assert.equal(clampTitle(42), "")
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test 2>&1 | tail -25
```

Expect a module-resolution failure — `Cannot find module '.../src/lib/skiDayDetails.js'`. That is the correct first failure: it proves the test file is being picked up by `node --test src/lib/*.test.js` and that nothing is stubbed. **If the tests pass here, the file already exists and something is wrong — stop and investigate.**

- [ ] **Step 3: Implement the module**

Create `src/lib/skiDayDetails.js` with exactly this content:

```js
/**
 * Pure, dependency-free logic for ski day details (Feed slice C1): grouping photo and
 * tag rows by session, validating a photo selection before any upload happens, and
 * formatting the Feed's "with …" line and the title.
 *
 * This module imports NOTHING on purpose. `npm test` runs `node --test src/lib/*.test.js`
 * with no DOM, no bundler and no Supabase client, so anything reachable from here must be
 * plain JS. Every consumer of these functions (socialApi.js, SkiDayDetailsForm.jsx,
 * ActivityFeed.jsx) does its own I/O and passes plain data in.
 */

/** Max photos attached to one ski day, counting photos already stored. */
export const MAX_PHOTOS_PER_SESSION = 6

/** Max bytes for a single photo. Inclusive — a file exactly this size is allowed. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

/**
 * Max title length, in CODEPOINTS — deliberately the same unit as the
 * ski_sessions_title_length CHECK constraint's char_length(), not UTF-16 code units.
 */
export const TITLE_MAX_LENGTH = 60

/**
 * Bucket rows into { [key]: [row, ...] }, oldest-first, without touching the input.
 *
 * Shared by both grouping functions below because the rule is identical and duplicating
 * it is how the two drift apart. The behaviour reproduces groupCommentsByActivity
 * (src/lib/activityComments.js) exactly:
 *
 *   - a fresh plain object, never the caller's array
 *   - a falsy key is skipped, not collected under "undefined" — such a bucket could
 *     never match a card and would only confuse whoever reads the object next
 *   - each bucket is sorted with a stamp() that returns Date.parse(...) when finite and
 *     Infinity otherwise, so an unparseable or missing created_at sorts LAST. That is
 *     the shape of a row spliced in locally before it has round-tripped, and it belongs
 *     at the end of the strip, not the front.
 */
function groupByKey(rows, keyField) {
  const grouped = {}

  for (const row of rows || []) {
    const key = row?.[keyField]
    if (!key) continue
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(row)
  }

  const stamp = (row) => {
    const ms = Date.parse(row?.created_at)
    return Number.isFinite(ms) ? ms : Infinity
  }

  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => stamp(a) - stamp(b))
  }

  return grouped
}

/**
 * @param {Array<{id: string, session_id: string, user_id: string, storage_path: string, created_at: string, url?: string}> | null | undefined} rows
 * @returns {Record<string, Array<object>>} never null; {} when there is nothing to group
 */
export function groupPhotosBySession(rows) {
  return groupByKey(rows, "session_id")
}

/**
 * @param {Array<{id: string, session_id: string, tagged_user_id: string, tagged_by: string, created_at: string, profiles?: object|null}> | null | undefined} rows
 * @returns {Record<string, Array<object>>} never null; {} when there is nothing to group
 */
export function groupTagsBySession(rows) {
  return groupByKey(rows, "session_id")
}

/**
 * Split a picked file list into what may be uploaded and what may not, given how many
 * photos the session already has.
 *
 * Three rules, applied per file in this order:
 *   1. not an image (MIME type does not start with "image/") → "not-an-image"
 *   2. larger than MAX_PHOTO_BYTES → "too-large"
 *   3. no free slot left → "limit-reached"
 *
 * The order matters. A rejected file must NOT consume one of the remaining slots — if it
 * did, picking a 12MB burst shot would silently cost the user a photo slot they never
 * filled. And rejection is per file, never all-or-nothing: picking three photos where one
 * is oversized still uploads the other two (Global Constraints).
 *
 * Only .name, .size and .type are read, so a plain object stands in for a File in tests —
 * there is no DOM here and no upload harness.
 *
 * A junk existingCount (NaN, negative, undefined) clamps to 0 rather than becoming
 * "unlimited". Worst case the user is offered a full 6; the picker re-checks against its
 * own live count and the RLS/DB layer is the real boundary either way.
 *
 * @param {ArrayLike<{name?: string, size?: number, type?: string}> | null | undefined} files
 * @param {number} [existingCount=0] photos already attached to this session
 * @returns {{accepted: Array<object>, rejected: Array<{name: string, reason: "not-an-image"|"too-large"|"limit-reached"}>}}
 */
export function validatePhotoSelection(files, existingCount = 0) {
  const accepted = []
  const rejected = []

  const already = Number.isFinite(Number(existingCount)) && Number(existingCount) > 0
    ? Math.floor(Number(existingCount))
    : 0
  let remaining = Math.max(0, MAX_PHOTOS_PER_SESSION - already)

  for (const file of files || []) {
    const name = file?.name || "photo"

    if (!String(file?.type || "").startsWith("image/")) {
      rejected.push({ name, reason: "not-an-image" })
      continue
    }
    if (Number(file?.size) > MAX_PHOTO_BYTES) {
      rejected.push({ name, reason: "too-large" })
      continue
    }
    if (remaining <= 0) {
      rejected.push({ name, reason: "limit-reached" })
      continue
    }

    accepted.push(file)
    remaining -= 1
  }

  return { accepted, rejected }
}

/**
 * Render a tag list as the Feed's "with …" text: "Jane", "Jane and Mike",
 * "Jane, Mike and 1 other", "Jane, Mike and 2 others".
 *
 * Returns "" for an empty/null list — that empty string is the signal ActivityFeed.jsx
 * uses to omit the whole line, so it must never be "undefined" or a bare "with ".
 *
 * A tag whose profile lookup failed still COUNTS, rendered as "Someone". Dropping it
 * would make a transient profiles-query failure quietly understate who was there, which
 * is worse than an honest placeholder.
 *
 * @param {Array<{tagged_user_id: string, profiles?: {full_name?: string, username?: string}|null}> | null | undefined} tags
 * @param {number} [maxNames=2] names shown before collapsing the rest into "and N others"
 * @returns {string}
 */
export function formatTaggedNames(tags, maxNames = 2) {
  const names = []
  for (const row of tags || []) {
    names.push(row?.profiles?.full_name || row?.profiles?.username || "Someone")
  }

  if (names.length === 0) return ""
  if (names.length === 1) return names[0]

  const cap = Number.isFinite(maxNames) && maxNames >= 1 ? Math.floor(maxNames) : 2

  if (names.length <= cap) {
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
  }

  const extra = names.length - cap
  return `${names.slice(0, cap).join(", ")} and ${extra} other${extra === 1 ? "" : "s"}`
}

/**
 * Trim a typed title and cap it at TITLE_MAX_LENGTH codepoints.
 *
 * Array.from(), not String.prototype.slice: the DB CHECK is char_length(title) <= 60,
 * and char_length counts codepoints. slice() counts UTF-16 code units, which would cut a
 * 61-emoji title down to 30 characters (needlessly strict) and — worse — could cut
 * between a surrogate pair and store a lone surrogate.
 *
 * trimEnd() after the cut so a truncation landing on a space does not store a title that
 * ends in whitespace.
 *
 * Non-strings return "" rather than being coerced — "null"/"undefined"/"42" are not
 * titles. The caller (saveSkiDayDetails) turns "" into SQL NULL.
 *
 * @param {unknown} value
 * @returns {string} "" when there is no usable title
 */
export function clampTitle(value) {
  if (typeof value !== "string") return ""

  const trimmed = value.trim()
  const chars = Array.from(trimmed)
  if (chars.length <= TITLE_MAX_LENGTH) return trimmed

  return chars.slice(0, TITLE_MAX_LENGTH).join("").trimEnd()
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test 2>&1 | tail -25
```

Expect **all 24 new cases passing**, and the total pass count to be exactly the Task 0 baseline **+ 24**. If a case fails, fix the implementation, not the test — the tests encode the Global Constraints and the row shapes Tasks 3/6/9/10 are written against.

- [ ] **Step 5: Lint and build**

```bash
npx eslint src/lib/skiDayDetails.js src/lib/skiDayDetails.test.js
npm run build 2>&1 | tail -5
```

Expect zero problems from the targeted lint (both files are new, so they own every problem they produce) and a clean build. Note `no-restricted-syntax` is off for `*.test.js` but the test file uses no `toISOString()` anyway.

- [ ] **Step 6: Commit**

```bash
git add src/lib/skiDayDetails.js src/lib/skiDayDetails.test.js
git commit -m "feat: pure ski-day-details helpers — grouping, photo validation, name and title formatting"
```

- [ ] **Step 7: Report**

Record: the `npm test` count before and after (baseline → baseline + 24), the targeted lint result, the build result, and an explicit statement that this task was verified by `npm test` / `npx eslint .` / `npm run build` only — **no browser check happened** (no subagent in this environment has browser tooling).

---

### Task 3: `socialApi.js` — the title/photo/tag data layer plus the `saveSkiDayDetails` orchestrator

**Files:**
- Modify: `src/lib/socialApi.js` (additive only — one new import line, one new block of nine functions)

**Interfaces:**
- Consumes: `supabase` (the module's existing client, imported at `:1` as `import { supabase } from "./supabase"`); `getCurrentUser()` (`:26`); `clampTitle` from Task 2; the tables/bucket/policies from Task 1.
- Produces (Tasks 5, 7, 8, 9 call these; Task 6 calls the two getters):
  - `updateSessionTitle(sessionId, title) → string|null`
  - `getSessionPhotos(sessionIds) → PhotoRow[]` (**batched — takes an array**)
  - `addSessionPhoto(sessionId, file) → PhotoRow`
  - `deleteSessionPhoto(photoId, storagePath) → void`
  - `getSessionTags(sessionIds) → TagRow[]` (**batched — takes an array**)
  - `addSessionTag(sessionId, friendUserId) → TagRow|null`
  - `removeSessionTag(tagId) → void`
  - `reconcileSessionTags(sessionId, wantedUserIds) → { added, removed }`
  - `saveSkiDayDetails(sessionId, diff) → { photos, tags }`

**Note on the getters' signature.** The design spec writes them as `getSessionPhotos(sessionId)` / `getSessionTags(sessionId)` — singular. They are **batched (array-taking)** here, matching `getActivityReactions(activityIds)` and `getActivityComments(activityIds)`, because Task 6 needs 30 sessions' photos in one query and a singular version would mean 30 round trips per feed page. Single-session callers pass `[sessionId]`. This is not a deviation from the spec's intent — it is the same "one batched second query" shape the spec's own Feed-Rendering section asks for.

- [ ] **Step 1: Confirm the insertion point is still where this plan says it is**

```bash
grep -n "deleteActivityComment\|Mountain Board (sprint-29)" src/lib/socialApi.js
```

Expected (verified 2026-09-02): `4067:export async function deleteActivityComment(commentId) {`, whose body closes at **line 4070**, and `4072:// ─── Mountain Board (sprint-29) ───…`. The new block goes **between** them — after line 4070, before the Mountain Board banner. If the line numbers have moved (another task landed first), find the same two anchors by name and insert between them; do not insert by line number.

Also confirm the names are free before writing them:

```bash
grep -n "updateSessionTitle\|getSessionPhotos\|addSessionPhoto\|deleteSessionPhoto\|getSessionTags\|addSessionTag\|removeSessionTag\|reconcileSessionTags\|saveSkiDayDetails" src/lib/ src/components/ -r
```

Expected: **zero matches.** A pre-existing `getSessionTags` anywhere would make the new export a duplicate and the bundle would silently pick one.

- [ ] **Step 2: Add the `clampTitle` import**

At the top of `src/lib/socialApi.js`, immediately after the existing `import { buildPlanUpsert } from "./planUpsert"` (line 5), add:

```js
import { clampTitle } from "./skiDayDetails";
```

`skiDayDetails.js` imports nothing at all, so this introduces no cycle — unlike importing `updateSessionTitle` out of `leaderboardApi.js`, which would (Correction 5: `leaderboardApi.js:4` already imports from `socialApi.js`).

- [ ] **Step 3: Insert the nine functions**

Paste this block between the end of `deleteActivityComment` and the `// ─── Mountain Board (sprint-29)` banner. Note the style match with the surrounding block: no semicolons, `const { data, error } = await supabase…` then `if (error) throw error`, JSDoc block comments on anything whose shape is not obvious.

```js
// ─── Ski day details: title, photos, friend tags (Feed slice C1, migration 046) ──

/**
 * Set (or clear) a ski day's title.
 *
 * Lives here and not in leaderboardApi.js on purpose: leaderboardApi.js:4 already imports
 * from this module, so putting it there and calling it from saveSkiDayDetails() below
 * would make the two modules mutually dependent.
 *
 * clampTitle() is applied server-bound as well as in the input's onChange, so a caller
 * that skips the form (or a future caller that does not exist yet) cannot trip the
 * ski_sessions_title_length CHECK and get a 400 instead of a clamp. "" becomes SQL NULL —
 * an empty-string title would render as a blank line in the Feed.
 *
 * .select("id, title").single() rather than a bare update: ski_sessions' UPDATE policy is
 * owner-only, and a refusal matches zero rows. Without the select that returns success
 * and silently saves nothing; with it, .single() raises and the caller can show the error.
 * Only two columns are named because a bare .select() makes PostgREST issue RETURNING *,
 * and this file's PROFILE_SELECT_COLUMNS comment explains why that pattern is avoided.
 */
export async function updateSessionTitle(sessionId, title) {
  const clamped = clampTitle(title)
  const { data, error } = await supabase
    .from("ski_sessions")
    .update({ title: clamped || null })
    .eq("id", sessionId)
    .select("id, title")
    .single()
  if (error) throw error
  return data?.title ?? null
}

/**
 * Every photo on a batch of sessions, in one query, with its public URL resolved at read
 * time — the batched shape of getActivityReactions/getActivityComments, not a per-card
 * lazy fetch. Single-session callers pass [sessionId].
 *
 * No visibility filtering belongs here: ski_session_photos_select routes through
 * can_see_ski_session(), so Postgres has already restricted this to days the caller can
 * see (migration 046).
 *
 * getPublicUrl() is synchronous and read-time, exactly as getTripMedia does it, so the
 * bucket can be renamed or fronted by a CDN without rewriting stored rows.
 */
export async function getSessionPhotos(sessionIds) {
  if (!sessionIds?.length) return []
  const { data, error } = await supabase
    .from("ski_session_photos")
    .select("id, session_id, user_id, storage_path, created_at")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: true })
  if (error) throw error

  return (data || []).map((p) => {
    const { data: urlData } = supabase.storage.from("ski-day-media").getPublicUrl(p.storage_path)
    return { ...p, url: urlData?.publicUrl || null }
  })
}

/**
 * Upload one photo and insert the row that points at it.
 *
 * Path is `${user.id}/${sessionId}/${timestamp}-${suffix}.${ext}` — USER ID FIRST, so the
 * bucket's self-delete policy's (storage.foldername(name))[1] = auth.uid()::text matches
 * (chat-media's shape, not trip-media's).
 *
 * The random suffix is a deliberate addition to the path convention migration 046
 * documents, and it is fully compatible with it: the migration constrains only the FIRST
 * folder segment, never the filename. uploadTripMedia uses a bare Date.now(), which is
 * safe there because a trip photo is picked one at a time — here a user picks up to six
 * at once, and two uploads landing in the same millisecond would collide under
 * `upsert: false` and fail the second one with a confusing storage error.
 *
 * On a failed DB insert the just-uploaded object is removed. uploadTripMedia does not do
 * this, and that is a gap rather than a precedent: ski_session_photos_insert can genuinely
 * refuse (it requires owns_ski_session(session_id)), and an orphaned object is invisible
 * to every UI in the app, so nothing would ever clean it up.
 */
export async function addSessionPhoto(sessionId, file) {
  const user = await getCurrentUser()
  const ext = (file?.name?.split(".").pop() || "jpg").toLowerCase()
  const suffix = Math.random().toString(36).slice(2, 8)
  const path = `${user.id}/${sessionId}/${Date.now()}-${suffix}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from("ski-day-media")
    .upload(path, file, { upsert: false })
  if (uploadError) throw uploadError

  const { data, error: dbError } = await supabase
    .from("ski_session_photos")
    .insert({ session_id: sessionId, user_id: user.id, storage_path: path })
    .select("id, session_id, user_id, storage_path, created_at")
    .single()

  if (dbError) {
    try {
      await supabase.storage.from("ski-day-media").remove([path])
    } catch {
      // Best effort. The insert error is the one worth surfacing — a leftover object is a
      // storage-cost problem, a swallowed insert failure is a data-loss problem.
    }
    throw dbError
  }

  const { data: urlData } = supabase.storage.from("ski-day-media").getPublicUrl(path)
  return { ...data, url: urlData?.publicUrl || null }
}

/**
 * Remove a photo: the stored object first, then the row that points at it — the same order
 * deleteTripMedia uses.
 *
 * That order is the safer failure mode of the two. If storage fails, the row survives and
 * still names the path, so the delete is retryable. If the row delete failed after storage
 * succeeded, the row would point at a missing object and render as a broken thumbnail —
 * bad, but recoverable by the user pressing remove again.
 *
 * Ownership is enforced by ski_session_photos_delete (owns_ski_session), which makes
 * someone else's photo match zero rows rather than error, so there is deliberately no
 * second ownership check here.
 */
export async function deleteSessionPhoto(photoId, storagePath) {
  const { error: storErr } = await supabase.storage.from("ski-day-media").remove([storagePath])
  if (storErr) throw storErr
  const { error } = await supabase.from("ski_session_photos").delete().eq("id", photoId)
  if (error) throw error
}

/**
 * Every tag on a batch of sessions, in one query, with the tagged person's profile
 * resolved. Single-session callers pass [sessionId].
 *
 * The profile resolve is a SECOND QUERY, not a `profiles:tagged_user_id(...)` embed. No FK
 * exists from ski_session_tags to profiles (only to auth.users), so an embed 400s at
 * runtime and the tagged-friends line would read as "nobody was tagged" forever — the
 * exact failure Feed-B's fix wave (commit 06404c9) had to undo across this file.
 */
export async function getSessionTags(sessionIds) {
  if (!sessionIds?.length) return []
  const { data, error } = await supabase
    .from("ski_session_tags")
    .select("id, session_id, tagged_user_id, tagged_by, created_at")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: true })
  if (error) throw error
  const tags = data || []
  if (!tags.length) return tags

  const userIds = [...new Set(tags.map((t) => t.tagged_user_id))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", userIds)
  const pm = new Map((profiles || []).map((p) => [p.id, p]))
  return tags.map((t) => ({ ...t, profiles: pm.get(t.tagged_user_id) || null }))
}

/**
 * Tag one friend onto one session. Returns the new row with its profile resolved, or null
 * if that person was already tagged.
 *
 * `ignoreDuplicates: true` matters and is not cosmetic. It makes PostgREST emit
 * ON CONFLICT DO NOTHING. A plain upsert would emit ON CONFLICT DO UPDATE, and
 * migration 046 creates **no UPDATE policy** on ski_session_tags — so the update branch
 * would be refused by RLS and a harmless re-tag (two devices saving the same set) would
 * surface as a permission error. DO NOTHING needs no UPDATE policy, and it is exactly the
 * idempotency the UNIQUE (session_id, tagged_user_id) constraint exists to provide.
 *
 * .maybeSingle(), not .single(): with DO NOTHING a duplicate returns zero rows, which
 * .single() would raise on.
 *
 * There is deliberately no client-side friendship check. ski_session_tags_insert requires
 * tagged_by = auth.uid() AND owns_ski_session(session_id) AND are_friends(tagged_user_id),
 * so tagging a stranger is refused by Postgres — the real boundary — not by a JS guard an
 * attacker never runs. And no notification row is written: tagging is silent by design.
 */
export async function addSessionTag(sessionId, friendUserId) {
  const user = await getCurrentUser()
  const { data, error } = await supabase
    .from("ski_session_tags")
    .upsert(
      { session_id: sessionId, tagged_user_id: friendUserId, tagged_by: user.id },
      { onConflict: "session_id,tagged_user_id", ignoreDuplicates: true }
    )
    .select("id, session_id, tagged_user_id, tagged_by, created_at")
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .eq("id", friendUserId)
    .maybeSingle()

  return { ...data, profiles: profile || null }
}

/**
 * Remove one tag by id. Used both by the owner (untag someone) and by the tagged person
 * (self-untag) — ski_session_tags_delete permits both and makes anything else match zero
 * rows, so no ownership branch is needed here.
 */
export async function removeSessionTag(tagId) {
  const { error } = await supabase.from("ski_session_tags").delete().eq("id", tagId)
  if (error) throw error
}

/**
 * Make the session's tag set equal `wantedUserIds`, adding and removing the difference.
 *
 * The UI is a checkbox list — it naturally produces a full wanted set, not a delta — but
 * writing that set blindly would either duplicate rows or need an UPDATE policy that does
 * not exist. So the diff is computed here, once, against the CURRENT rows read fresh at
 * save time (not against whatever the form was seeded with, which may be minutes stale if
 * the day was edited on another device meanwhile).
 *
 * Sequential awaits, not Promise.all: N is at most the caller's friend count, and a
 * partial failure inside Promise.all leaves an unpredictable half-applied set while
 * reporting only one of the errors. Adds run before removes so an interrupted reconcile
 * errs toward keeping people tagged rather than silently dropping them.
 *
 * @param {string} sessionId
 * @param {Array<string>|Set<string>|null|undefined} wantedUserIds the FULL wanted set
 * @returns {Promise<{added: number, removed: number}>}
 */
export async function reconcileSessionTags(sessionId, wantedUserIds) {
  const wanted = new Set([...(wantedUserIds || [])].filter(Boolean))
  const current = await getSessionTags([sessionId])
  const currentIds = new Set(current.map((t) => t.tagged_user_id))

  const toAdd = [...wanted].filter((id) => !currentIds.has(id))
  const toRemove = current.filter((t) => !wanted.has(t.tagged_user_id))

  for (const id of toAdd) {
    await addSessionTag(sessionId, id)
  }
  for (const t of toRemove) {
    await removeSessionTag(t.id)
  }

  return { added: toAdd.length, removed: toRemove.length }
}

/**
 * The single orchestrator all three UI consumers (LogDayModal, SessionRecapModal,
 * SessionEditForm) call, so the diff→API translation exists exactly once.
 *
 * `diff` is what SkiDayDetailsForm's onSave emits:
 *   { title, addedPhotoFiles, removedPhotoIds, tagUserIds }
 *
 * Two properties of that shape are load-bearing:
 *
 *   - `tagUserIds` is the FULL WANTED SET, never a delta. reconcileSessionTags does the
 *     diffing.
 *   - **An ABSENT key means "do not touch this".** `tagUserIds: undefined` leaves tags
 *     exactly as they are; `tagUserIds: []` clears them. That distinction is the whole
 *     mechanism behind Task 9's tag-wipe guard — a user who opens the edit modal, changes
 *     only the resort, and saves must not have every existing tag deleted. Same for
 *     `title: undefined` vs `title: ""`.
 *
 * Removals run before additions so a user who deletes two photos and adds two in one save
 * is never transiently over MAX_PHOTOS_PER_SESSION and refused by the picker's own count.
 *
 * Storage paths are re-read from the DB rather than trusted from the caller: a client-
 * supplied path would let a caller name any object in the bucket, and RLS on
 * storage.objects is keyed on the path's first folder — not on the ski_session_photos row.
 * Reading the row first means only paths that genuinely belong to this session are removed.
 *
 * Returns the session's photos and tags AFTER the save so the caller can reseed its form
 * (or splice the Feed) without a second refetch. No realtime anywhere in this slice.
 */
export async function saveSkiDayDetails(sessionId, diff) {
  if (!sessionId) throw new Error("saveSkiDayDetails needs a session id.")

  const { title, addedPhotoFiles, removedPhotoIds, tagUserIds } = diff || {}

  if (title !== undefined) {
    await updateSessionTitle(sessionId, title)
  }

  if (removedPhotoIds?.length) {
    const existing = await getSessionPhotos([sessionId])
    const byId = new Map(existing.map((p) => [p.id, p]))
    for (const photoId of removedPhotoIds) {
      const row = byId.get(photoId)
      // Already gone (a double-tap on remove, or another device deleted it). Skipping is
      // correct — calling storage remove on a missing object is not an error worth
      // failing the whole save over.
      if (!row) continue
      await deleteSessionPhoto(row.id, row.storage_path)
    }
  }

  if (addedPhotoFiles?.length) {
    for (const file of addedPhotoFiles) {
      await addSessionPhoto(sessionId, file)
    }
  }

  if (tagUserIds !== undefined) {
    await reconcileSessionTags(sessionId, tagUserIds)
  }

  const [photos, tags] = await Promise.all([
    getSessionPhotos([sessionId]),
    getSessionTags([sessionId]),
  ])
  return { photos, tags }
}
```

- [ ] **Step 4: Verify nothing else in the file changed, and that Correction 3 was honoured**

```bash
git diff --stat src/lib/socialApi.js
grep -n "profiles:" src/lib/socialApi.js
grep -c "^export async function" src/lib/socialApi.js
```

Expected: the diff touches `src/lib/socialApi.js` only, with **insertions only** apart from the one added import line — no deletions, no modified lines inside any existing function. `grep -n "profiles:"` must show **no new hit** inside the block you just added (the pattern `profiles: pm.get(...)` on an object literal is fine and is what the existing code does; a PostgREST embed would look like `.select("…, profiles:tagged_user_id(…)")` inside a `.select()` string — there must be none). The export count goes up by exactly 9.

- [ ] **Step 5: Verify the two getters really are batched and the constants are not re-declared**

```bash
grep -n "in(\"session_id\", sessionIds)" src/lib/socialApi.js
grep -n "MAX_PHOTOS_PER_SESSION\|MAX_PHOTO_BYTES\|TITLE_MAX_LENGTH" src/lib/socialApi.js
```

Expected: two hits for the first (both getters). **Zero** hits for the second — the caps belong to `skiDayDetails.js` and are enforced in the picker and in the DB CHECK; re-declaring them here would create a second source of truth.

- [ ] **Step 6: Run the full suite, build and lint**

```bash
npm test 2>&1 | tail -10
npx eslint . 2>&1 | tail -5
npm run build 2>&1 | tail -5
```

Expected: `npm test` unchanged from the end of Task 2 (this task adds no tests — nothing here is pure; every function does I/O and the repo has no Supabase mocking harness). Lint at or better than the Task 0 baseline. Build clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/socialApi.js
git commit -m "feat: ski day title/photo/tag data layer and saveSkiDayDetails orchestrator"
```

- [ ] **Step 8: Report**

Record: the `git diff --stat` line, the export-count delta (+9), the `profiles:` grep result proving no embed was introduced, the test/lint/build numbers, and an explicit statement that this task was verified by tests/lint/build/diff review **only** — no browser and no live Supabase call happened. Also flag the two deliberate refinements over the precedents this task copies, so Task 11's reviewer does not read them as drift: the random filename suffix in `addSessionPhoto`'s path (uploadTripMedia has a same-millisecond collision hazard that matters here because six files are picked at once) and the orphan-object cleanup on a failed insert (uploadTripMedia has none).

---

### Task 4: `FriendTagPicker.jsx` — the controlled friends checkbox list

**Files:**
- Create: `src/components/FriendTagPicker.jsx`

**Interfaces:**
- Consumes: `getAcceptedFriends()` from `src/lib/socialApi.js` (`:1549`), which returns profile rows shaped `{ id, first_name, last_name, full_name, username, avatar_url }`; `Avatar` from `./ui/Avatar` (props `{ profile, size }`).
- Produces: default export `FriendTagPicker`, props **`{ selectedIds, onChange }`**.
  - `selectedIds` is a `Set<string>` of `profiles.id` values. **It is never mutated in here** — every toggle builds a new `Set` and hands it to `onChange`. Mutating the prop would leave React's `useState` holding the same reference and the re-render would not happen, which is the classic way a checkbox list ships looking broken.
  - `onChange(nextSet)` receives the new `Set`. Fully controlled: this component holds no selection state of its own.
- Does **not** consume `sessionId` and does **not** write anything. It fetches the friends list and nothing else.

This is a faithful lift of `TripDetailModal.jsx:1219-1238`'s inline pattern with the trip-specific concerns deliberately dropped (the already-invited / already-RSVP'd disabling, the email tab, the send button, the `invites`/`rsvps` props). `TripDetailModal.jsx` is **not** refactored to use this component — see the File Structure table.

- [ ] **Step 1: Re-read the source pattern before lifting it**

```bash
sed -n '1216,1240p' src/components/TripDetailModal.jsx
```

Confirm what you are lifting: a `friends.map()` rendering `<label>` → `<input type="checkbox">` → `<Avatar profile={f} size={28} />` → `<span>{f.full_name || f.username}</span>`, with a `Set`-based toggle and `style={{ accentColor: …, width: 16, height: 16 }}` on the input. If that shape has changed, lift what is actually there.

- [ ] **Step 2: Write the component**

Create `src/components/FriendTagPicker.jsx` with exactly this content:

```jsx
import { useState, useEffect } from "react"
import { getAcceptedFriends } from "../lib/socialApi"
import Avatar from "./ui/Avatar"

/**
 * A controlled, Set-backed checkbox list of the current user's accepted friends, used to
 * tag who you skied with. Extracted from TripDetailModal's inline invite panel
 * (TripDetailModal.jsx:1219-1238) with the trip-specific concerns dropped: no
 * already-invited/already-RSVPd disabling, no email tab, no send button.
 *
 * Fully controlled. `selectedIds` is a Set owned by the parent and NEVER mutated here —
 * every toggle constructs a fresh Set and passes it up. Mutating the prop in place would
 * leave the parent's useState holding the same reference, so the re-render would never
 * happen and the checkboxes would look dead.
 *
 * Only friends can be tagged, and that is enforced in RLS
 * (ski_session_tags_insert's are_friends(tagged_user_id)), not by this list. This list
 * only exists so a legitimate user does not have to guess who is taggable.
 *
 * @param {{selectedIds: Set<string>, onChange: (next: Set<string>) => void}} props
 */
export default function FriendTagPicker({ selectedIds, onChange }) {
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    getAcceptedFriends()
      .then((rows) => {
        if (!cancelled) setFriends(rows || [])
      })
      .catch((e) => {
        // Warned, not silently swallowed. A failed friends fetch is otherwise
        // indistinguishable from "you have no friends yet", which is the exact
        // silent-failure shape Feed-B's comment fetch had to guard against.
        console.warn("FriendTagPicker: getAcceptedFriends failed", e)
        if (!cancelled) setError("Couldn't load your friends list.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function toggle(id) {
    const next = new Set(selectedIds || [])
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    onChange(next)
  }

  if (loading) {
    return <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Loading friends…</div>
  }
  if (error) {
    return <div style={{ fontSize: 13, color: "var(--color-danger)" }}>{error}</div>
  }
  if (friends.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
        No friends yet — add friends to tag them on a ski day.
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gap: 8, maxHeight: 180, overflowY: "auto" }}>
      {friends.map((f) => {
        const selected = (selectedIds || new Set()).has(f.id)
        return (
          <label
            key={f.id}
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => toggle(f.id)}
              style={{ accentColor: "var(--color-accent)", width: 16, height: 16, flexShrink: 0 }}
            />
            <Avatar profile={f} size={28} />
            {/* flex:1 + minWidth:0 + ellipsis, which the TripDetailModal original lacks.
                At 375px, inside a modal with 24px padding each side, a long display name
                without these pushes the row wider than its container and the checkbox
                slides off the left edge. Two mobile-layout regressions shipped out of the
                Board slice's restyle for exactly this class of omission. */}
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 13,
                color: "rgba(255,255,255,0.82)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {f.full_name || f.username}
            </span>
          </label>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Verify the contract — no mutation, no internal selection state**

```bash
grep -n "selectedIds.add\|selectedIds.delete\|selectedIds.clear" src/components/FriendTagPicker.jsx
grep -n "useState" src/components/FriendTagPicker.jsx
```

Expected: **zero** hits for the first — any direct mutation of the prop is the bug this contract exists to prevent. Exactly **three** `useState` hits (`friends`, `loading`, `error`) and nothing holding a selection.

- [ ] **Step 4: Verify the hook rules hold**

Read the file top to bottom and confirm all three `useState` calls and the single `useEffect` come **before** every early return (`loading`, `error`, `friends.length === 0`). A hook after a conditional return changes hook order between renders and React throws. The `useEffect` has `[]` deps and no value from render scope inside it, so `react-hooks/exhaustive-deps` has nothing to complain about — confirm the targeted lint below is clean rather than assuming.

- [ ] **Step 5: Lint and build**

```bash
npx eslint src/components/FriendTagPicker.jsx
npm run build 2>&1 | tail -5
```

Expected: zero problems (the file is new, so it owns every problem it produces) and a clean build. `react-refresh/only-export-components` is satisfied — the file has exactly one default-exported component and no other export.

Note: `npm test` is unchanged and that is expected — `node --test src/lib/*.test.js` does not cover `src/components`, and this repo has no DOM test harness.

- [ ] **Step 6: Commit**

```bash
git add src/components/FriendTagPicker.jsx
git commit -m "feat: FriendTagPicker — controlled Set-backed friends checkbox list"
```

- [ ] **Step 7: Report**

Record: the two greps' output (zero mutation hits, three `useState`), the targeted lint result, the build result, an explicit note that the ellipsis/`minWidth: 0` treatment on the name span is a **deliberate improvement** over the `TripDetailModal` original (so Task 11's reviewer does not read it as an unfaithful lift), and an explicit statement that verification was lint/build/read-through **only** — no browser check happened.

---

### Task 5: `SkiDayDetailsForm.jsx` — the shared title / photo / tag sub-form

**Files:**
- Create: `src/components/SkiDayDetailsForm.jsx`

**Interfaces:**
- Consumes: `FriendTagPicker` (Task 4); `validatePhotoSelection`, `clampTitle`, `MAX_PHOTOS_PER_SESSION`, `MAX_PHOTO_BYTES`, `TITLE_MAX_LENGTH` from `src/lib/skiDayDetails.js` (Task 2).
- Produces: default export `SkiDayDetailsForm`, props **`{ initialTitle, initialPhotos, initialTags, saving, onSave, onSkip }`**.
- **Makes no API calls.** Not one. `onSave` receives a diff object and the *consuming* component calls `saveSkiDayDetails`. `FriendTagPicker`'s own friends fetch is the only network activity anywhere under this component, and that belongs to `FriendTagPicker`.

The diff `onSave` receives:

```js
{
  title: string | undefined,       // undefined ⇒ "do not touch the title"
  addedPhotoFiles: File[],         // files to upload, in pick order
  removedPhotoIds: string[],       // ski_session_photos.id values to delete
  tagUserIds: string[] | undefined // FULL wanted set; undefined ⇒ "do not touch tags"
}
```

**Three contract rules that every consumer depends on — read these before writing the component:**

1. **`initialTitle` being `undefined` hides the title section entirely, and makes `onSave` emit `title: undefined`.** This is how `SessionEditForm` avoids shipping two title fields: Correction 4 puts the "Title" input in `SessionEditForm` itself (saved through `updateSessionStats`'s `fields.title`, per Correction 5), so it mounts this form **without** `initialTitle` and gets photos and tags only. `LogDayModal` and `SessionRecapModal` pass `initialTitle=""` (or the stored title) and get the title input. `""` and `null` both mean "show it, empty"; only a genuinely absent prop hides it. This mirrors `saveSkiDayDetails`'s own absent-key-means-don't-touch convention rather than inventing a second one.
2. **`tagUserIds` is emitted only if the user actually touched the tag picker.** Otherwise it is `undefined`, and `saveSkiDayDetails` leaves tags alone. This is half of Task 9's tag-wipe guard; the other half is rule 3.
3. **All state is seeded from props on mount only.** A consumer must not mount this form until `initialPhotos`/`initialTags` have actually loaded — mounting it against `[]` while a fetch is in flight, then letting the user touch the picker, would produce a wanted set missing every unloaded tag. Consumers that load asynchronously (Task 9) render a placeholder until the data is in hand, and remount with a fresh `key` after a successful save to reseed and to trigger the object-URL cleanup below.

- [ ] **Step 1: Write the component**

Create `src/components/SkiDayDetailsForm.jsx` with exactly this content:

```jsx
import { useState, useRef, useEffect } from "react"
import FriendTagPicker from "./FriendTagPicker"
import {
  validatePhotoSelection,
  clampTitle,
  MAX_PHOTOS_PER_SESSION,
  MAX_PHOTO_BYTES,
  TITLE_MAX_LENGTH,
} from "../lib/skiDayDetails"

const labelStyle = {
  display: "block", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)",
  marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5,
}

const inputStyle = {
  width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10, padding: "10px 12px", color: "white", fontSize: 14, boxSizing: "border-box",
  outline: "none",
}

const REJECT_COPY = {
  "not-an-image": "isn't an image",
  "too-large": `is over ${Math.round(MAX_PHOTO_BYTES / (1024 * 1024))}MB`,
  "limit-reached": `didn't fit — ${MAX_PHOTOS_PER_SESSION} photos max`,
}

/**
 * The shared "add details to this ski day" sub-form: an optional title, up to
 * MAX_PHOTOS_PER_SESSION photos, and a friends-only tag picker. Used by LogDayModal's
 * third step, SessionRecapModal's details section, and SessionEditForm.
 *
 * This component makes NO API calls. onSave receives a diff —
 * { title, addedPhotoFiles, removedPhotoIds, tagUserIds } — and the consumer hands that to
 * saveSkiDayDetails(). Keeping the translation in one place (socialApi.js) is why all
 * three consumers stay this small.
 *
 * Contract notes, all three load-bearing:
 *
 *  - initialTitle === undefined hides the title section and emits title: undefined. That
 *    is how SessionEditForm avoids two title fields — it owns its own Title input and
 *    saves it through updateSessionStats (Corrections 4 and 5).
 *  - tagUserIds is emitted only when the picker was actually touched. An untouched picker
 *    emits undefined, so saving an edit that only changed the resort cannot wipe existing
 *    tags.
 *  - Every piece of state is seeded from props ON MOUNT ONLY. Consumers that load
 *    initialPhotos/initialTags asynchronously must not mount this until the data is in
 *    hand, and should remount with a fresh key after a successful save.
 *
 * @param {{
 *   initialTitle?: string|null,
 *   initialPhotos?: Array<{id: string, url: string|null}>,
 *   initialTags?: Array<{tagged_user_id: string}>,
 *   saving?: boolean,
 *   onSave: (diff: object) => void,
 *   onSkip?: () => void,
 * }} props
 */
export default function SkiDayDetailsForm({
  initialTitle,
  initialPhotos,
  initialTags,
  saving = false,
  onSave,
  onSkip,
}) {
  const showTitle = initialTitle !== undefined

  const [title, setTitle] = useState(() => clampTitle(initialTitle ?? ""))
  const [existingPhotos] = useState(() => initialPhotos || [])
  const [removedIds, setRemovedIds] = useState(() => new Set())
  // { key, file, previewUrl } — newly picked files that have not been uploaded yet.
  const [pending, setPending] = useState([])
  const [tagIds, setTagIds] = useState(
    () => new Set((initialTags || []).map((t) => t.tagged_user_id))
  )
  // Rule 2 of the contract. Flipped only by FriendTagPicker's onChange.
  const [tagsTouched, setTagsTouched] = useState(false)
  const [notice, setNotice] = useState("")

  // Every object URL this component has ever created, held in a REF and not in state.
  //
  // This is the detail that decides whether the previews work. The obvious version —
  // useEffect(() => () => pending.forEach(p => URL.revokeObjectURL(p.previewUrl)), [pending])
  // — re-runs its cleanup on every single change to `pending`, so adding a second photo
  // revokes the first one's URL and its live thumbnail goes blank. Deps of [] with a
  // stale closure over `pending` is the opposite bug: it captures the empty initial array
  // and revokes nothing at unmount, leaking every blob for the page's lifetime.
  //
  // A ref sidesteps both: the cleanup below runs exactly once, at unmount, and reads the
  // ref's CURRENT contents at that moment rather than a render-time snapshot.
  const objectUrlsRef = useRef(new Set())

  useEffect(() => {
    const urls = objectUrlsRef.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  const keptPhotos = existingPhotos.filter((p) => !removedIds.has(p.id))
  const photoCount = keptPhotos.length + pending.length
  const full = photoCount >= MAX_PHOTOS_PER_SESSION

  function handlePick(e) {
    const picked = Array.from(e.target.files || [])
    // Reset the input immediately, before any early return. Without this, picking the
    // same file again after removing it fires no change event (the value is unchanged)
    // and the photo simply cannot be re-added.
    e.target.value = ""
    if (!picked.length) return

    const { accepted, rejected } = validatePhotoSelection(picked, photoCount)

    const added = accepted.map((file) => {
      const previewUrl = URL.createObjectURL(file)
      objectUrlsRef.current.add(previewUrl)
      return {
        // Not file.name: picking two photos with the same name from different folders is
        // ordinary, and a duplicate React key silently drops one of the thumbnails.
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl,
      }
    })
    if (added.length) setPending((prev) => [...prev, ...added])

    setNotice(
      rejected.length
        ? rejected.map((r) => `"${r.name}" ${REJECT_COPY[r.reason] || "was skipped"}`).join(". ")
        : ""
    )
  }

  function removePending(key) {
    // Read from render scope and revoke BEFORE the setState, so the side effect stays out
    // of the updater (React 19 double-invokes updaters in development).
    const row = pending.find((p) => p.key === key)
    if (row) {
      URL.revokeObjectURL(row.previewUrl)
      objectUrlsRef.current.delete(row.previewUrl)
    }
    setPending((prev) => prev.filter((p) => p.key !== key))
    setNotice("")
  }

  function removeExisting(id) {
    // Marked, not deleted. Nothing is destroyed until the consumer calls
    // saveSkiDayDetails, so closing the modal without saving is a real cancel.
    setRemovedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    setNotice("")
  }

  function handleSave() {
    onSave({
      title: showTitle ? clampTitle(title) : undefined,
      addedPhotoFiles: pending.map((p) => p.file),
      removedPhotoIds: [...removedIds],
      tagUserIds: tagsTouched ? [...tagIds] : undefined,
    })
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {showTitle && (
        <div>
          <div style={labelStyle}>
            Title <span style={{ opacity: 0.5 }}>(optional)</span>
          </div>
          <input
            style={inputStyle}
            value={title}
            placeholder="Bluebird laps on the back bowls"
            /* Array.from + slice, not value.slice: TITLE_MAX_LENGTH is a CODEPOINT cap
               (char_length in the DB CHECK), and a code-unit slice would both halve an
               emoji-heavy title's allowance and risk storing a lone surrogate.
               clampTitle() is NOT used here — it trims, which would eat the space the
               moment the user types one mid-sentence. Trimming happens at save. */
            onChange={(e) =>
              setTitle(Array.from(e.target.value).slice(0, TITLE_MAX_LENGTH).join(""))
            }
          />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4, textAlign: "right" }}>
            {Array.from(title).length}/{TITLE_MAX_LENGTH}
          </div>
        </div>
      )}

      <div>
        <div style={labelStyle}>
          Photos <span style={{ opacity: 0.5 }}>({photoCount}/{MAX_PHOTOS_PER_SESSION})</span>
        </div>

        {photoCount > 0 && (
          /* flexWrap, not a fixed-column grid: at 375px a 6-wide row would shrink each
             thumbnail to ~45px. Wrapping keeps them at a legible 64px and grows the
             modal downward, which it already scrolls. */
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {keptPhotos.map((p) => (
              <div key={p.id} style={{ position: "relative", width: 64, height: 64 }}>
                {/* Non-interactive by design: no onClick, no lightbox anywhere in this
                    slice (Global Constraints). */}
                <img
                  src={p.url}
                  alt=""
                  style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, display: "block" }}
                />
                <button
                  type="button"
                  onClick={() => removeExisting(p.id)}
                  aria-label="Remove photo"
                  style={{
                    position: "absolute", top: -6, right: -6, width: 20, height: 20,
                    borderRadius: "50%", border: "none", background: "var(--color-danger)",
                    color: "white", fontSize: 11, lineHeight: 1, cursor: "pointer", padding: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}

            {pending.map((p) => (
              <div key={p.key} style={{ position: "relative", width: 64, height: 64 }}>
                <img
                  src={p.previewUrl}
                  alt=""
                  style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, display: "block", opacity: 0.85 }}
                />
                <button
                  type="button"
                  onClick={() => removePending(p.key)}
                  aria-label="Remove photo"
                  style={{
                    position: "absolute", top: -6, right: -6, width: 20, height: 20,
                    borderRadius: "50%", border: "none", background: "var(--color-danger)",
                    color: "white", fontSize: 11, lineHeight: 1, cursor: "pointer", padding: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <label
          style={{
            display: "inline-block", padding: "9px 14px", borderRadius: 10,
            border: "1px dashed rgba(255,255,255,0.2)", fontSize: 13, fontWeight: 700,
            color: full ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.75)",
            cursor: full ? "default" : "pointer",
          }}
        >
          {full ? `${MAX_PHOTOS_PER_SESSION} photos max` : "📷 Add Photos"}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={full}
            onChange={handlePick}
            style={{ display: "none" }}
          />
        </label>

        {notice && (
          <div style={{ fontSize: 12, color: "var(--color-warning)", marginTop: 6 }}>{notice}</div>
        )}
      </div>

      <div>
        <div style={labelStyle}>Who did you ski with?</div>
        <FriendTagPicker
          selectedIds={tagIds}
          onChange={(next) => {
            setTagsTouched(true)
            setTagIds(next)
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            disabled={saving}
            style={{
              flex: 1, padding: "12px", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)", background: "transparent",
              color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            Skip
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 2, padding: "12px", borderRadius: 12, border: "none",
            background: "var(--gradient-cta)", color: "white", fontSize: 14, fontWeight: 900,
            cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Saving…" : "Save Details"}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the object-URL lifecycle by reading it, then by grepping it**

```bash
grep -n "createObjectURL\|revokeObjectURL\|objectUrlsRef\|useEffect" src/components/SkiDayDetailsForm.jsx
```

Expected, and check each one:
- exactly **one** `createObjectURL`, inside `handlePick`'s `accepted.map`, immediately followed by `objectUrlsRef.current.add(previewUrl)`.
- exactly **two** `revokeObjectURL` — one in `removePending` (per-remove) and one in the unmount cleanup loop.
- exactly **one** `useEffect`, with deps `[]`, whose cleanup iterates `objectUrlsRef.current` captured into a local `const urls` at effect-setup time (the lint rule `react-hooks/exhaustive-deps` wants the ref read hoisted out of the cleanup; the ref object identity never changes, so this is safe and is the standard fix).
- **zero** occurrences of `pending` inside any `useEffect` dependency array. A `[pending]` dep here revokes live URLs on every add and the thumbnails go blank — that is the specific bug this structure exists to prevent.

- [ ] **Step 3: Verify the props contract**

```bash
grep -n "initialTitle !== undefined\|tagsTouched\|tagUserIds" src/components/SkiDayDetailsForm.jsx
grep -rn "supabase\|socialApi\|leaderboardApi" src/components/SkiDayDetailsForm.jsx
```

Expected: `showTitle` derived from `initialTitle !== undefined`; `tagsTouched` set only inside `FriendTagPicker`'s `onChange`; `tagUserIds` emitted as `tagsTouched ? [...tagIds] : undefined`. And the second grep must return **zero matches** — this component makes no API calls, and an import of either API module is the sign that the diff-emitting contract was broken.

- [ ] **Step 4: Check hook order and the caps' single source of truth**

Read the file top to bottom: all seven `useState` calls and the single `useEffect` come before any conditional. There is no early return in this component at all, which makes hook order trivially safe — confirm that stays true.

```bash
grep -n "= 6\|5 \* 1024\|= 60" src/components/SkiDayDetailsForm.jsx
```

Expected: **zero** hits. Every cap is imported from `skiDayDetails.js`; a literal here would be a second source of truth that silently disagrees with the DB CHECK.

- [ ] **Step 5: Lint and build**

```bash
npx eslint src/components/SkiDayDetailsForm.jsx
npm run build 2>&1 | tail -5
```

Expected: zero problems and a clean build. If `react-hooks/exhaustive-deps` warns about the ref read in the cleanup, apply the hoisted-`const urls` form shown above rather than adding a dep or disabling the rule.

- [ ] **Step 6: Commit**

```bash
git add src/components/SkiDayDetailsForm.jsx
git commit -m "feat: SkiDayDetailsForm — shared title/photo/tag sub-form emitting a diff"
```

- [ ] **Step 7: Report**

Record: the Step 2 grep output with your reading of each of its four checks; confirmation that the component imports neither `socialApi` nor `supabase`; the zero-literal-caps grep; lint and build results; and an explicit statement that verification was lint/build/read-through **only** — the object-URL behaviour in particular has **not** been observed in a browser by any subagent, and Task 11 plus Kyle's click-through are where that actually gets confirmed. Also flag the `initialTitle === undefined` hides-the-title-section rule as a **derived design decision** made while writing this plan (it is what reconciles the fixed props list with Correction 4's "do not ship two title fields"), so Task 11's reviewer evaluates it rather than treating it as spec.

---

### Task 6: `getActivityFeed()` — two more batched second-queries for photos and tags

**Files:**
- Modify: `src/lib/socialApi.js` (`getActivityFeed`, and one line of the import added in Task 3)

**Interfaces:**
- Consumes: `getSessionPhotos(sessionIds)` and `getSessionTags(sessionIds)` from Task 3; `groupPhotosBySession` and `groupTagsBySession` from Task 2.
- Produces, on every `type === "ski_session"` feed item — **these three field names are exactly what Task 10 reads, do not rename them**:
  - `sessionStats` — unchanged in purpose, but its select now also carries **`title`**, so the Feed's title line reads `item.sessionStats?.title`. There is deliberately **no** separate `sessionTitle` field: one source, one failure mode.
  - `sessionPhotos` — `PhotoRow[]`, oldest-first, `[]` when there are none.
  - `sessionTags` — `TagRow[]` with `profiles` resolved, oldest-first, `[]` when there are none.

- [ ] **Step 1: Re-read the function as it actually is**

```bash
grep -n "export async function getActivityFeed" src/lib/socialApi.js
sed -n '3900,3955p' src/lib/socialApi.js
```

Expected (verified 2026-09-02): the function starts at **3900** and ends at **3953**. It already does the shape this task extends — profiles by a second query, then session stats by a second batched query, with a `console.warn` on failure and a documented "read-time, not a snapshot" rationale. Confirm the two early returns are still there (`if (!items.length)` and `if (!sessionIds.length)`) and note the third one you are about to change: `if (sessionErr) { …; return withProfiles }`.

- [ ] **Step 2: Extend the Task 3 import line**

The import added in Task 3 becomes:

```js
import { clampTitle, groupPhotosBySession, groupTagsBySession } from "./skiDayDetails";
```

- [ ] **Step 3: Add `title` to the existing session-stats select**

Change the one line inside `getActivityFeed`:

```js
    .select("id, runs_logged, vertical_feet, is_powder_day")
```

to:

```js
    .select("id, runs_logged, vertical_feet, is_powder_day, title")
```

`formatSessionStat()` (`src/lib/format.js:109-127`) reads only `runs_logged`, `vertical_feet` and `is_powder_day`, so an extra key on the object it receives changes nothing about the stat line. `title` is read time, not a metadata snapshot, for the same reason the stats are: `updateSessionTitle` lets a user rename a day afterwards, and a snapshot in `activity_feed.metadata` would go stale the moment they did.

- [ ] **Step 4: Replace the stats-failure early return and add the two queries**

Replace this existing block —

```js
  if (sessionErr) {
    console.warn("getActivityFeed session stats lookup failed", sessionErr)
    return withProfiles
  }

  const statsById = new Map((sessions || []).map((s) => [s.id, s]))
  return withProfiles.map((i) =>
    i.type === "ski_session" ? { ...i, sessionStats: statsById.get(i.subject_id) || null } : i
  )
}
```

— with this:

```js
  // Non-fatal, and no longer an early return. A failed stat lookup used to abandon the
  // whole enrichment pass; now it degrades to an empty stats map so that photos and tags
  // — three independent queries against three independent tables — still land. A wrong
  // column name in one select should not blank two unrelated features.
  if (sessionErr) {
    console.warn("getActivityFeed session stats lookup failed", sessionErr)
  }
  const statsById = new Map((sessions || []).map((s) => [s.id, s]))

  // Two more batched second-queries, the same read-time-not-snapshot pattern as the stats
  // lookup above and the same shape getActivityReactions/getActivityComments use: one
  // query for the whole page, not one per card. getSessionPhotos and getSessionTags are
  // declared further down this file — `export async function` declarations are hoisted, so
  // calling them from here is fine despite reading backwards.
  //
  // Each is independently non-fatal. A refused or broken photo query must degrade a card
  // to "no photos", not blank the feed, and — because an empty result is otherwise
  // indistinguishable from "nobody attached photos yet" — it warns rather than swallowing.
  const [photoRows, tagRows] = await Promise.all([
    getSessionPhotos(sessionIds).catch((e) => {
      console.warn("getActivityFeed session photos lookup failed", e)
      return []
    }),
    getSessionTags(sessionIds).catch((e) => {
      console.warn("getActivityFeed session tags lookup failed", e)
      return []
    }),
  ])

  const photosBySession = groupPhotosBySession(photoRows)
  const tagsBySession = groupTagsBySession(tagRows)

  return withProfiles.map((i) => {
    if (i.type !== "ski_session") return i
    return {
      ...i,
      sessionStats: statsById.get(i.subject_id) || null,
      sessionPhotos: photosBySession[i.subject_id] || [],
      sessionTags: tagsBySession[i.subject_id] || [],
    }
  })
}
```

Note the two `|| []` fallbacks. `ActivityFeed.jsx` reads `.length` on both, and `undefined.length` would throw inside the render map and take the entire feed down with it — a card with no photos is the common case, not the edge case.

- [ ] **Step 5: Verify the query count and that RLS, not JS, is doing the filtering**

```bash
sed -n '3900,3985p' src/lib/socialApi.js
grep -c "await supabase" src/lib/socialApi.js
```

Read the function and confirm:
- Exactly **three** direct `supabase` reads inside `getActivityFeed` (activity_feed, profiles, ski_sessions) plus **two** delegated calls (`getSessionPhotos`, `getSessionTags`), and the two delegated ones run concurrently in one `Promise.all`. Not one query per card — a 30-item page must not produce 60 requests.
- **No visibility filtering in JS.** There is no `.filter()` on friendship, no `actor_id` check, no tag-ownership check anywhere in the new code. `ski_session_photos_select` and `ski_session_tags_select` route through `can_see_ski_session()`, so Postgres has already restricted both result sets. A JS filter here would be a second, divergent copy of the visibility rule.
- The three early returns still short-circuit correctly: empty feed → `items`; no `ski_session` items → `withProfiles`; and a stats failure now **continues** rather than returning.

- [ ] **Step 6: Confirm the field names match what Task 10 will read**

```bash
grep -n "sessionPhotos\|sessionTags\|sessionStats" src/lib/socialApi.js
```

Expected: `sessionStats`, `sessionPhotos`, `sessionTags` — spelled exactly that way, singular-`session` prefix, no `session_photos` snake_case variant. Task 10 reads these three names verbatim; a mismatch renders nothing and throws no error, which is the hardest kind of bug to notice here.

- [ ] **Step 7: Run the full suite, build and lint**

```bash
npm test 2>&1 | tail -10
npx eslint . 2>&1 | tail -5
npm run build 2>&1 | tail -5
```

Expected: tests unchanged (this task adds no pure logic — the two grouping helpers it uses were already tested in Task 2), lint at or better than baseline, build clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/socialApi.js
git commit -m "feat: getActivityFeed resolves session title, photos and tags as batched second-queries"
```

- [ ] **Step 9: Report**

Record: the full new body of `getActivityFeed` in the report; the query-count reasoning from Step 5 (3 direct + 2 delegated, concurrent); the field-name grep; test/lint/build numbers; and the **one behavioural change to existing code** — the stats-failure path no longer early-returns — stated plainly, with the reason, so Task 11's reviewer does not flag it as accidental. Verification was tests/lint/build/diff review **only**; no live query was run.

---

### Task 7: `LogDayModal` — a third `"details"` step, reachable from BOTH exits of the stats step

**Files:**
- Modify: `src/components/LeaderboardPage.jsx` (the `LogDayModal` function only — lines 29-158 as of 2026-09-02)

**Interfaces:**
- Consumes: `SkiDayDetailsForm` (Task 5); `saveSkiDayDetails` (Task 3); the existing `savedSession` state, which already holds the row returned by `logSkiDay()` and therefore its `id`.
- Produces: no new exports. `LogDayModal`'s own props (`{ onClose, onLogged }`) are unchanged, so its single call site at `:465` needs no edit. `SessionStatsForm.jsx` is **unmodified** — only its `onSkip` call site changes.

**Correction 6 is the whole point of this task.** Today `<SessionStatsForm saving onSave={handleSaveStats} onSkip={onClose} />` (`:110-114`) and `handleSaveStats`'s own `onClose()` (`:80`) are **both** exits that close the modal. Appending a `"details"` step without rewiring both leaves it unreachable — the feature ships dead and no test in this repo catches it.

- [ ] **Step 1: Re-read the real current code and confirm the four anchor lines**

```bash
sed -n '29,45p;74,86p;99,116p' src/components/LeaderboardPage.jsx
```

Confirm, and note the current line numbers in case they have shifted:
- `const [step, setStep] = useState("basic") // "basic" | "stats"` — the step declaration (was `:41`)
- `onClose()` inside `handleSaveStats`'s `try` (was `:80`)
- the header's two-way ternary `{step === "basic" ? "🎿 Log a Ski Day" : "📊 Add Your Stats"}` (was `:101-102`)
- `onSkip={onClose}` on `SessionStatsForm` (was `:113`)

- [ ] **Step 2: Extend the imports**

```js
import { logActivityOnce, saveSkiDayDetails } from "../lib/socialApi"
```

and, after the existing `import SessionStatsForm from "./SessionStatsForm"` (line 7):

```js
import SkiDayDetailsForm from "./SkiDayDetailsForm"
```

- [ ] **Step 3: Widen the step union and add the details step's own state**

Replace:

```js
  // Step 2 — optional post-submit "add your stats" step
  const [step, setStep]                 = useState("basic") // "basic" | "stats"
  const [savedSession, setSavedSession] = useState(null)
  const [statsSaving, setStatsSaving]   = useState(false)
  const [statsError, setStatsError]     = useState("")
```

with:

```js
  // Steps 2 and 3 — optional post-submit "add your stats" then "add details" steps.
  // Both are skippable; the day itself is already logged by the time either is reached.
  const [step, setStep]                     = useState("basic") // "basic" | "stats" | "details"
  const [savedSession, setSavedSession]     = useState(null)
  const [statsSaving, setStatsSaving]       = useState(false)
  const [statsError, setStatsError]         = useState("")
  const [detailsSaving, setDetailsSaving]   = useState(false)
  const [detailsError, setDetailsError]     = useState("")
```

These are added alongside the existing `useState` calls at the top of the function, well before any conditional — `LogDayModal` has no early return at all, so hook order is safe.

- [ ] **Step 4: Rewire BOTH exits of the stats step, and add the details save handler**

Replace `handleSaveStats`'s body's `onClose()` with `setStep("details")`:

```js
  async function handleSaveStats(stats) {
    setStatsSaving(true)
    setStatsError("")
    try {
      await updateSessionStats(savedSession.id, stats)
      // Correction 6: this used to be onClose(). Both exits of the stats step have to
      // route into "details" or the new step is unreachable — onSkip is rewired the same
      // way at the SessionStatsForm call site below. onClose() now lives only on the
      // details step's own save and skip.
      setStep("details")
    } catch (err) {
      setStatsError(err.message || "Could not save stats.")
    } finally {
      setStatsSaving(false)
    }
  }
```

Then add, immediately after it:

```js
  async function handleSaveDetails(diff) {
    setDetailsSaving(true)
    setDetailsError("")
    try {
      await saveSkiDayDetails(savedSession.id, diff)
      onClose()
    } catch (err) {
      // Keep the modal open with the reason showing. The day and its stats are already
      // saved at this point, so a failure here costs the user only the details — closing
      // would silently discard photos they picked and friends they checked.
      setDetailsError(err.message || "Could not save details.")
    } finally {
      setDetailsSaving(false)
    }
  }
```

`onLogged()` is deliberately **not** called again here. It is already called once from `handleSubmit` (`:65`), and neither `handleSaveStats` nor this handler re-fires it — the parent's `load` sets `loading` true and flashes "Loading…" over the whole page. Details are not displayed on `LeaderboardPage` at all, so there is nothing there to refresh. Matching the existing stats-step behaviour rather than introducing a new one.

- [ ] **Step 5: Make the header three-way**

Replace:

```jsx
            {step === "basic" ? "🎿 Log a Ski Day" : "📊 Add Your Stats"}
```

with:

```jsx
            {step === "basic" ? "🎿 Log a Ski Day" : step === "stats" ? "📊 Add Your Stats" : "📸 Add Details"}
```

- [ ] **Step 6: Add the details branch and rewire `onSkip`**

Replace the existing stats branch:

```jsx
        {step === "stats" ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: -10 }}>
              Nice — {resortName(savedSession?.resort_name) || "your day"} is logged. Want to add stats now?
            </div>
            {statsError && <div style={{ fontSize: 13, color: "var(--color-danger)", padding: "8px 12px", background: "rgba(248,113,113,0.1)", borderRadius: 8 }}>{statsError}</div>}
            <SessionStatsForm
              saving={statsSaving}
              onSave={handleSaveStats}
              onSkip={onClose}
            />
          </div>
        ) : (
```

with:

```jsx
        {step === "details" ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: -10 }}>
              Add a title, a few photos, and tag who you skied with.
            </div>
            {detailsError && <div style={{ fontSize: 13, color: "var(--color-danger)", padding: "8px 12px", background: "rgba(248,113,113,0.1)", borderRadius: 8 }}>{detailsError}</div>}
            {/* A day that was just created has no photos and no tags, so the empty
                initial arrays are correct rather than a placeholder — nothing async has
                to load before this can be mounted (Task 5's contract rule 3).
                initialTitle="" (not omitted) is what makes the title input appear. */}
            <SkiDayDetailsForm
              initialTitle=""
              initialPhotos={[]}
              initialTags={[]}
              saving={detailsSaving}
              onSave={handleSaveDetails}
              onSkip={onClose}
            />
          </div>
        ) : step === "stats" ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: -10 }}>
              Nice — {resortName(savedSession?.resort_name) || "your day"} is logged. Want to add stats now?
            </div>
            {statsError && <div style={{ fontSize: 13, color: "var(--color-danger)", padding: "8px 12px", background: "rgba(248,113,113,0.1)", borderRadius: 8 }}>{statsError}</div>}
            <SessionStatsForm
              saving={statsSaving}
              onSave={handleSaveStats}
              onSkip={() => setStep("details")}
            />
          </div>
        ) : (
```

The closing `)}` after the `<form>` is unchanged — this is still one nested ternary in the same position, now three-armed.

- [ ] **Step 7: Grep for exactly Correction 6's rewiring**

This is the step that proves the new step is reachable.

```bash
grep -n "onSkip=\|setStep(\"details\")\|onClose()" src/components/LeaderboardPage.jsx
```

Expected, and check each:
- `onSkip={() => setStep("details")}` on `SessionStatsForm` — **not** `onSkip={onClose}`. If `onClose` is still there, the skip path never reaches the details step.
- `setStep("details")` appears **twice**: once in `handleSaveStats`'s `try`, once in the `onSkip` arrow. Both exits, per Correction 6.
- `onSkip={onClose}` appears exactly **once**, on `SkiDayDetailsForm` — the last step is where skipping closes the modal.
- `onClose()` as a bare call appears exactly **once**, in `handleSaveDetails`. If it still appears inside `handleSaveStats`, Correction 6 was only half applied and the save path skips the details step entirely.

- [ ] **Step 8: Trace both paths by hand and write the trace into the report**

Do not skip this — it is cheap and it is the only reachability check available without a browser.

- Path A (save stats): submit basic → `handleSubmit` → `logSkiDay` → `logActivityOnce` → `onLogged()` → `setSavedSession` → `setStep("stats")` → user fills stats → `handleSaveStats` → `updateSessionStats` → **`setStep("details")`** → `SkiDayDetailsForm` renders → save → `saveSkiDayDetails` → `onClose()`.
- Path B (skip stats): … → `setStep("stats")` → user presses Skip → **`setStep("details")`** → same tail.
- Path C (skip details): … → details step → Skip → `onClose()`.
- Path D (stats save fails): `statsError` renders, `step` stays `"stats"`, the user can retry. Confirm `setStep("details")` is inside the `try` and after the `await`, so a failure cannot advance the step.
- Path E (details save fails): `detailsError` renders, `step` stays `"details"`, picked files and checked friends are still in `SkiDayDetailsForm`'s state because it is not remounted. Confirm nothing in the failure path calls `onClose()`.

- [ ] **Step 9: Confirm nothing outside `LogDayModal` changed**

```bash
git diff src/components/LeaderboardPage.jsx | grep "^[-+]" | grep -v "^[-+][-+]"
git diff --stat src/components/SessionStatsForm.jsx
```

Expected: every changed line falls inside `LogDayModal` (roughly lines 1-160) plus the two import lines. `LeaderboardRow`, `CATEGORIES`, `load`, the sort `useMemo` and the page body are untouched. `SessionStatsForm.jsx` shows **no diff at all** — File Structure lists it as unmodified.

- [ ] **Step 10: Lint and build**

```bash
npx eslint src/components/LeaderboardPage.jsx
npm run build 2>&1 | tail -5
npm test 2>&1 | tail -5
```

Expected: no **new** lint problems versus the Task 0 baseline for this file (it may already carry pre-existing ones — do not fix those here), a clean build, and tests unchanged.

- [ ] **Step 11: Commit**

```bash
git add src/components/LeaderboardPage.jsx
git commit -m "feat: LogDayModal details step — reachable from both exits of the stats step"
```

- [ ] **Step 12: Report**

Record: the Step 7 grep output with your reading of all four checks; the five hand-traced paths from Step 8 written out; confirmation that `SessionStatsForm.jsx` has a zero-line diff; lint/build/test numbers. State plainly that reachability was verified by **grep and hand-trace only** — no browser check happened, and Correction 6's failure mode (a dead step) is invisible to every automated check this repo has.

---

### Task 8: `SessionRecapModal` — a persistent details section above the action row

**Files:**
- Modify: `src/components/SessionRecapModal.jsx`

**Interfaces:**
- Consumes: `SkiDayDetailsForm` (Task 5); `saveSkiDayDetails`, `getSessionPhotos`, `getSessionTags` (Task 3).
- Produces: no new exports and **no new props**. `SessionRecapModal`'s props stay `{ session, runs, profile, onClose, stravaConnected, onPostToStrava }`, so its single mount site (`src/App.jsx:1354`) needs no edit.

There is **no step machine** in this file — confirmed by reading it: one flat render with six `useState` calls and a hard `if (!session) return null` at line 59. So the details UI is a **section with its own persistent Save**, placed between the Run Breakdown block and the `{/* Actions */}` row, and `onSkip` is deliberately **omitted** — the action row's existing "Done" button already is the skip.

**Hook-order hazard, read before writing:** `if (!session) return null` sits at **line 59**, after all six `useState` calls. Every new `useState` and the new `useEffect` must be declared **above** that line. A hook placed after it changes hook count between the `session`-null and `session`-present renders and React throws `Rendered more hooks than during the previous render`. The new `useEffect` therefore guards internally on `session?.id` rather than being conditionally called.

- [ ] **Step 1: Re-read the real file and confirm the anchors**

```bash
grep -n "useState\|if (!session) return null\|{/\* Actions \*/}\|{/\* Run breakdown \*/}" src/components/SessionRecapModal.jsx
```

Expected (2026-09-02): six `useState` at `:52-57`, `if (!session) return null` at `:59`, `{/* Run breakdown */}` at `:179`, `{/* Actions */}` at `:233`. Note the actual numbers if they have moved.

- [ ] **Step 2: Extend the imports**

```js
import { useState, useEffect } from "react"
```

and after `import ShareStatCard from "./ShareStatCard"` (line 4):

```js
import SkiDayDetailsForm from "./SkiDayDetailsForm"
import { saveSkiDayDetails, getSessionPhotos, getSessionTags } from "../lib/socialApi"
```

- [ ] **Step 3: Add the details state and the seeding effect — ABOVE the `if (!session)` guard**

Immediately after the existing `const [showShareCard, setShowShareCard] = useState(false)` (line 57) and **before** line 59's guard, insert:

```js
  // Details section state. All of it declared above the `if (!session) return null` guard
  // on line 59 — a hook below that guard would change the hook count between the
  // session-null and session-present renders and React would throw.
  const [details, setDetails] = useState(null) // { photos, tags } once loaded
  const [detailsSaving, setDetailsSaving] = useState(false)
  const [detailsError, setDetailsError] = useState("")
  const [detailsSaved, setDetailsSaved] = useState(false)
  // Bumped after a successful save so SkiDayDetailsForm remounts and reseeds from the
  // freshly-returned rows. That remount is also what revokes the object URLs of the
  // previews it just uploaded (Task 5's unmount cleanup) — a form left mounted would hold
  // every blob for as long as the modal stays open.
  const [detailsKey, setDetailsKey] = useState(0)

  // A GPS session is usually brand new here, but flushSessionToSupabase can land on an
  // EXISTING ski_sessions row when a user tracks twice in one day — so photos and tags are
  // fetched rather than assumed empty. Seeding SkiDayDetailsForm with [] against a session
  // that already has tags is exactly the wipe hazard Task 9's guard exists for: the user
  // touches the picker, the wanted set is missing the unloaded tags, and reconcile deletes
  // them. Loading first removes the hazard instead of relying on the guard.
  useEffect(() => {
    const sessionId = session?.id
    if (!sessionId) return
    let cancelled = false
    Promise.all([
      getSessionPhotos([sessionId]).catch((e) => {
        console.warn("SessionRecapModal: getSessionPhotos failed", e)
        return []
      }),
      getSessionTags([sessionId]).catch((e) => {
        console.warn("SessionRecapModal: getSessionTags failed", e)
        return []
      }),
    ]).then(([photos, tags]) => {
      if (!cancelled) setDetails({ photos, tags })
    })
    return () => {
      cancelled = true
    }
  }, [session?.id])

  async function handleSaveDetails(diff) {
    setDetailsSaving(true)
    setDetailsError("")
    try {
      const saved = await saveSkiDayDetails(session.id, diff)
      setDetails(saved)
      setDetailsKey((k) => k + 1)
      setDetailsSaved(true)
    } catch (err) {
      // The modal stays open with the reason showing. The session and its stats are
      // already persisted by the time this modal appears, so a failure here costs only
      // the details — and closing would discard picked files silently.
      setDetailsError(err.message || "Could not save details.")
    } finally {
      setDetailsSaving(false)
    }
  }
```

Note `[session?.id]` as the dep, not `[session]`: the parent passes `recapData.session`, and a re-render that produced a new object with the same id would otherwise refire the fetch.

`handleSaveDetails` is a plain function declaration inside the component, so it may live below the guard or above it — put it above with the rest of this block so the whole details concern reads as one unit.

- [ ] **Step 4: Render the section between Run Breakdown and Actions**

Insert this immediately before the `{/* Actions */}` comment at line 233:

```jsx
        {/* Ski day details — a persistent section with its own Save, not a modal step.
            This modal has no step machine, and adding one for three fields would rewire
            every existing action button. "Done" in the action row below is the skip. */}
        <div style={{ marginBottom: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "white", marginBottom: 10 }}>
            📸 Day Details
          </div>

          {detailsError && (
            <div style={{ fontSize: 12, color: "var(--color-danger)", marginBottom: 8 }}>{detailsError}</div>
          )}
          {detailsSaved && !detailsError && (
            <div style={{ fontSize: 12, color: "var(--color-success-strong)", marginBottom: 8 }}>Details saved ✓</div>
          )}

          {details ? (
            <SkiDayDetailsForm
              key={detailsKey}
              initialTitle={session.title || ""}
              initialPhotos={details.photos}
              initialTags={details.tags}
              saving={detailsSaving}
              onSave={handleSaveDetails}
            />
          ) : (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Loading details…</div>
          )}
        </div>
```

Three things to be deliberate about here:
- **`details ? … : placeholder`** is Task 5 contract rule 3 — the form is not mounted until `initialPhotos`/`initialTags` are real.
- **`key={detailsKey}`** forces the remount-and-reseed after a save.
- **`onSkip` is absent**, so `SkiDayDetailsForm` renders only its "Save Details" button and the modal's own "Done" stays the single close affordance.

- [ ] **Step 5: Verify hook order and that no prop was added**

```bash
grep -n "useState\|useEffect\|if (!session) return null" src/components/SessionRecapModal.jsx
grep -n "export default function SessionRecapModal" src/components/SessionRecapModal.jsx
git diff --stat src/App.jsx
```

Expected:
- **eleven** `useState` and **one** `useEffect`, every one of them at a line number **lower** than the `if (!session) return null` line. If any hook line number is higher, React will throw on the first render where `session` is null — which is the render that happens on every page load, since `recapData` starts null. **This is a crash, not a cosmetic issue.**
- the component signature is unchanged: `{ session, runs, profile, onClose, stravaConnected, onPostToStrava }`.
- `src/App.jsx` has **no diff**.

- [ ] **Step 6: Lint and build**

```bash
npx eslint src/components/SessionRecapModal.jsx
npm run build 2>&1 | tail -5
npm test 2>&1 | tail -5
```

Expected: no new lint problems (`react-hooks/exhaustive-deps` is satisfied by `[session?.id]`), clean build, tests unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/components/SessionRecapModal.jsx
git commit -m "feat: SessionRecapModal day-details section with persistent save"
```

- [ ] **Step 8: Report**

Record: the Step 5 grep output with the line numbers, stated explicitly as "all 11 useState and the 1 useEffect are above line N, the `if (!session) return null` guard"; confirmation `App.jsx` is untouched; lint/build/test numbers; and the reasoning for fetching photos/tags rather than assuming a brand-new session (the tracks-twice-in-one-day upsert path). Verification was lint/build/read-through **only** — no browser check happened.

---

### Task 9: `SessionEditForm` + `ProfileStats` — the Title field, the "Notes" relabel, and the tag-wipe guard

**Files:**
- Modify: `src/components/SessionEditForm.jsx`
- Modify: `src/components/ProfileStats.jsx` (`RecentSessionsFeed` only)

**Interfaces:**
- Consumes: `SkiDayDetailsForm` (Task 5); `clampTitle` (Task 2); `saveSkiDayDetails`, `getSessionPhotos`, `getSessionTags` (Task 3); the existing `updateSessionStats(id, fields)` from `leaderboardApi.js`, whose plain `.update(stats)` (`:67-76`) carries a new `title` key with **no change to that file** (Correction 5).
- Produces:
  - `SessionEditForm` gains **one new optional prop, `details`** (`{ photos, tags } | null`). Its `onSave` signature becomes **`onSave(fields, detailsDiff?)`** — `detailsDiff` absent means "stats/notes/title only". Its only call site is `ProfileStats.jsx:236`.
  - `RecentSessionsFeed`'s props are **unchanged** (`{ sessions, limit, onRefresh, profile, fullName }`), so its only mount site (`ProfilePage.jsx:762`) needs no edit.

**Correction 4 is authoritative here:** `SessionEditForm.jsx:70-78` renders `<label>Activity Name</label>` over an input bound to `notes`. That label is **relabelled to "Notes"** and stays bound to `notes`; a new **"Title"** input bound to the new `title` column is added directly above it. No backfill of `notes` into `title` — `notes` holds 112 rows of mixed-intent private free text and a blind copy would publish it to the Feed.

#### The tag-wipe guard, spelled out

The failure this prevents: a user opens the edit modal on a day that already has two friends tagged, changes only the mountain, presses Save — and every tag is deleted, because a save handler that always reconciles against an empty-or-default wanted set treats "the picker was never touched" as "the user wants nobody tagged." Silent, irreversible, and invisible to every check in this repo.

Four independent layers, each of which alone prevents it. All four are built here on purpose; the reviewer in Task 11 traces all four.

| # | Layer | Where | What it does |
|---|---|---|---|
| 1 | **Structural** — the plain Save button emits **no** `detailsDiff` | `SessionEditForm.handleSave()` | `onSave(fields, undefined)`. `ProfileStats` then calls `updateSessionStats` and **never calls `saveSkiDayDetails` at all**. The stats-only path cannot touch a tag because it does not reach the tag code. |
| 2 | **Interaction** — `tagUserIds` is emitted only if the picker was touched | `SkiDayDetailsForm` (Task 5, rule 2) | An untouched `FriendTagPicker` leaves `tagsTouched === false` and the diff carries `tagUserIds: undefined`. |
| 3 | **API** — an absent key means "do not touch" | `saveSkiDayDetails` (Task 3) | `if (tagUserIds !== undefined)`. `[]` clears; `undefined` is a no-op. |
| 4 | **Load gating** — the form is not mounted against stale seeds | `ProfileStats` renders a placeholder until the fetch resolves | Prevents the subtler variant: the picker IS touched, but `initialTags` had not loaded, so the wanted set is missing tags that exist and reconcile deletes them. |

- [ ] **Step 1: Re-read both real files and confirm the anchors**

```bash
sed -n '29,45p;55,80p;130,148p' src/components/SessionEditForm.jsx
sed -n '155,175p;236,260p' src/components/ProfileStats.jsx
```

Confirm: `SessionEditForm` has `const [notes, setNotes] = useState(session?.notes ?? "")` at `:30`; `handleSave` at `:42-66` with `fields` built at `:55-58`; the `Activity Name` label at `:71`; the Save button at `:134-145` wired **`onClick={handleSave}`**. And `RecentSessionsFeed` has four `useState` at `:158-161` followed by `if (!sessions.length) return (…)` at **`:163`**, with the `SessionEditForm` mount at `:236-257`.

#### Part A — `SessionEditForm.jsx`

- [ ] **Step 2: Extend the imports and add the title state**

```js
import { useState } from "react"
import ResortPicker from "./ui/ResortPicker"
import SkiDayDetailsForm from "./SkiDayDetailsForm"
import { clampTitle } from "../lib/skiDayDetails"
```

Change the signature and add one state line:

```js
export default function SessionEditForm({ session, details, onSave, saving, error, onError }) {
  const [title, setTitle] = useState(session?.title ?? "")
  const [notes, setNotes]   = useState(session?.notes ?? "")
  const [resort, setResort] = useState(session?.resort_name ?? "")
```

`session.title` is genuinely available: `getMySessions` selects `*` from `ski_sessions` (`leaderboardApi.js:98-100`), so the new column arrives with no query change anywhere.

- [ ] **Step 3: Take an optional `detailsDiff` in `handleSave` and include `title` in `fields`**

Replace `handleSave` with:

```js
  // detailsDiff is UNDEFINED when the plain Save button below is pressed, and only
  // populated when SkiDayDetailsForm's own "Save Details" button fires. That is layer 1
  // of the tag-wipe guard and it is structural, not a heuristic: on the stats-only path
  // ProfileStats never calls saveSkiDayDetails, so no reconcile can run and no existing
  // tag or photo can be removed by someone who only renamed a mountain.
  function handleSave(detailsDiff) {
    // ResortPicker only reports a name to its parent once a suggestion is
    // actually clicked — typing clears `value` back to "". So an empty
    // `resort` here means the field was typed into and never confirmed, and
    // silently falling back to session.resort_name would throw away what looks
    // to the user like a finished edit.
    if (!resort) {
      onError?.("Pick a mountain from the list to save your change.")
      return
    }

    onError?.("")

    const fields = {
      // Correction 4: `notes` keeps its column and loses its misleading "Activity Name"
      // label. `title` is the new, Feed-visible field. Both are saved here, independently,
      // through the same existing updateSessionStats(.update(fields)) call — Correction 5,
      // no change to leaderboardApi.js. clampTitle mirrors the ski_sessions_title_length
      // CHECK so a 61-char paste is trimmed rather than 400ing.
      title: clampTitle(title) || null,
      notes: notes.trim() || null,
      resort_name: resort,
    }
    if (!statsLocked) {
      fields.runs_logged   = runs === "" ? null : Number(runs)
      fields.vertical_feet = vertical === "" ? null : Number(vertical)
      fields.miles_skied   = miles === "" ? null : Number(miles)
      fields.top_speed_mph = topSpeed === "" ? null : Number(topSpeed)
    }
    onSave(fields, detailsDiff)
  }
```

- [ ] **Step 4: Add the Title field and relabel Notes**

Replace the existing first field block (`:70-78`) with:

```jsx
      <label style={labelStyle}>
        Title
        <input
          style={{ ...inputStyle, marginTop: 6 }}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Bluebird laps on the back bowls"
        />
      </label>

      {/* Correction 4: this input was labelled "Activity Name" and is bound to `notes`.
          The label is wrong, not the binding — `notes` is private free text that nothing
          in the app displays, and 112 production rows hold a mix of titles and genuine
          notes. It is relabelled rather than migrated: copying notes into the new,
          Feed-visible `title` column would publish private text. */}
      <label style={labelStyle}>
        Notes
        <input
          style={{ ...inputStyle, marginTop: 6 }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Best run, who you went with…"
        />
      </label>
```

The `title` input has no live length cap here on purpose — `clampTitle` in `handleSave` is the enforcement, and the DB CHECK is the backstop. (Only `SkiDayDetailsForm` shows a live counter, because that is where a user composes a title from scratch.)

- [ ] **Step 5: Fix the Save button's onClick, and add the details section**

**This is a trap worth stating loudly.** The button is currently `onClick={handleSave}`. Now that `handleSave` takes a parameter, that passes React's **click event** as `detailsDiff`, which is truthy — so `ProfileStats` would call `saveSkiDayDetails(id, <SyntheticEvent>)`, destructure `undefined` out of it, and reconcile tags against an empty wanted set. **That single character is the tag-wipe bug.** It must become an arrow:

```jsx
      <button
        type="button"
        onClick={() => handleSave()}
        disabled={saving}
```

Then insert the details section immediately **before** the `{error && …}` line at `:132`:

```jsx
      {/* Photos and friend tags. Its own "Save Details" button (SkiDayDetailsForm renders
          no Skip when onSkip is omitted) is the persistent save the design spec asks for
          here, and it is also guard layer 1: the plain Save above emits no details diff,
          so a stats-only edit provably cannot reach the tag or photo code.
          No title input appears inside it — initialTitle is deliberately NOT passed, which
          is what stops this modal shipping two title fields (Correction 4). */}
      {details ? (
        <SkiDayDetailsForm
          initialPhotos={details.photos}
          initialTags={details.tags}
          saving={saving}
          onSave={(diff) => handleSave(diff)}
        />
      ) : (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Loading photos and tags…</div>
      )}
```

#### Part B — `ProfileStats.jsx`

- [ ] **Step 6: Extend the imports**

```js
import { useState, useEffect } from "react"
import { updateSessionStats } from "../lib/leaderboardApi"
import { saveSkiDayDetails, getSessionPhotos, getSessionTags } from "../lib/socialApi"
```

- [ ] **Step 7: Add the details state and fetch — ABOVE the `if (!sessions.length)` early return**

`RecentSessionsFeed`'s early return sits at `:163`, after its four `useState` calls. Insert immediately after `const [shareSession, setShareSession] = useState(null)` (`:161`) and **before** that return:

```js
  // { photos, tags } for the session currently being edited, or null while loading.
  // Declared here, above the `if (!sessions.length)` early return on line 163 — a hook
  // below it would change the hook count between the empty and non-empty renders.
  const [sessionDetails, setSessionDetails] = useState(null)

  useEffect(() => {
    if (!editingSessionId) {
      // Cleared on close so reopening a DIFFERENT session can never show the previous
      // one's photos, and can never seed SkiDayDetailsForm with another day's tags.
      setSessionDetails(null)
      return
    }
    let cancelled = false
    Promise.all([
      getSessionPhotos([editingSessionId]).catch((e) => {
        console.warn("RecentSessionsFeed: getSessionPhotos failed", e)
        return []
      }),
      getSessionTags([editingSessionId]).catch((e) => {
        console.warn("RecentSessionsFeed: getSessionTags failed", e)
        return []
      }),
    ]).then(([photos, tags]) => {
      if (!cancelled) setSessionDetails({ photos, tags })
    })
    return () => {
      cancelled = true
    }
  }, [editingSessionId])
```

Note the `.catch(() => [])` on each. A failed fetch resolves to `[]`, which means `sessionDetails` becomes `{ photos: [], tags: [] }` and the form mounts against an empty seed — guard layer 4 is bypassed in that specific case, and layers 2 and 3 are what still hold. That is why layer 2 exists: even seeded empty, an untouched picker emits `undefined`. The `console.warn` is what makes the degraded state visible instead of silent.

- [ ] **Step 8: Pass `details` and handle the two-argument `onSave`**

Replace the `<SessionEditForm …>` block at `:236-257` with:

```jsx
            <SessionEditForm
              session={editingSession}
              details={sessionDetails}
              saving={savingStatsFor === editingSession.id}
              error={editError}
              onError={setEditError}
              onSave={async (fields, detailsDiff) => {
                setSavingStatsFor(editingSession.id)
                setEditError("")
                try {
                  await updateSessionStats(editingSession.id, fields)
                  // Guard layer 1: only reached when SkiDayDetailsForm's own Save fired.
                  // The plain Save button passes no second argument, so a stats-only edit
                  // never runs a reconcile and cannot delete an existing tag or photo.
                  if (detailsDiff) {
                    await saveSkiDayDetails(editingSession.id, detailsDiff)
                  }
                  await onRefresh?.()
                  // Only close on success — a failure here is a real, expected
                  // outcome (renaming onto a date+mountain the user already
                  // has), so keep the modal open with the reason showing.
                  setEditingSessionId(null)
                } catch (e) {
                  setEditError(e.message || "Could not save this session.")
                } finally {
                  setSavingStatsFor(null)
                }
              }}
            />
```

- [ ] **Step 9: Verify the guard, mechanically**

```bash
grep -n "onClick={handleSave}" src/components/SessionEditForm.jsx
grep -n "onClick={() => handleSave()}" src/components/SessionEditForm.jsx
grep -n "initialTitle" src/components/SessionEditForm.jsx
grep -n "if (detailsDiff)" src/components/ProfileStats.jsx
grep -n "Activity Name" src/components/SessionEditForm.jsx
```

Expected:
- **zero** hits for `onClick={handleSave}` and **one** for `onClick={() => handleSave()}`. A hit on the first is the tag-wipe bug, live.
- **zero** hits for `initialTitle` — passing it would render a second title field (Correction 4).
- **one** hit for `if (detailsDiff)`.
- **zero** hits for `Activity Name`.

- [ ] **Step 10: Hand-trace the guard and write the trace into the report**

Trace this exact scenario, which is what Task 11 re-checks: a session with **two existing tags**; user opens edit, changes only the mountain via `ResortPicker`, presses **Save**.

`handleSave()` called with no argument → `detailsDiff === undefined` → `onSave(fields, undefined)` → `updateSessionStats(id, fields)` runs → `if (detailsDiff)` is false → `saveSkiDayDetails` **is never called** → `reconcileSessionTags` **is never called** → **both tags survive.** Then trace the second scenario: user checks one more friend and presses **Save Details** → `tagsTouched === true` → `tagUserIds` = the three ids (two seeded from the loaded `initialTags` + one new) → `reconcileSessionTags` adds one, removes none.

And the third: user presses **Save Details** without ever touching the picker (they only removed a photo) → `tagUserIds: undefined` → `saveSkiDayDetails` skips the reconcile → both tags survive, and the photo is removed.

- [ ] **Step 11: Verify hook order and that no mount site changed**

```bash
grep -n "useState\|useEffect\|if (!sessions.length) return" src/components/ProfileStats.jsx
grep -n "RecentSessionsFeed" src/components/ProfilePage.jsx
git diff --stat src/components/ProfilePage.jsx src/lib/leaderboardApi.js
```

Expected: five `useState` and one `useEffect` in `RecentSessionsFeed`, all at line numbers **below** the `if (!sessions.length) return` line. `ProfilePage.jsx:762`'s `<RecentSessionsFeed …>` unchanged. **Zero diff** on both `ProfilePage.jsx` and `leaderboardApi.js` — the latter is listed as unmodified in the File Structure and Correction 5 is the reason.

- [ ] **Step 12: Lint and build**

```bash
npx eslint src/components/SessionEditForm.jsx src/components/ProfileStats.jsx
npm run build 2>&1 | tail -5
npm test 2>&1 | tail -5
```

Expected: no new lint problems, clean build, tests unchanged.

- [ ] **Step 13: Commit**

```bash
git add src/components/SessionEditForm.jsx src/components/ProfileStats.jsx
git commit -m "feat: session edit gains Title field, Notes relabel, photos and tags with a tag-wipe guard"
```

- [ ] **Step 14: Report**

Record: all five Step 9 greps with their output; the three hand-traces from Step 10 written out in full; the four-layer guard table with a statement of which layer holds in each trace; confirmation that `ProfilePage.jsx` and `leaderboardApi.js` both have zero diff; lint/build/test numbers. State that the guard was verified by **grep and hand-trace only** — no browser, no live database call — and that Task 11 Step 1 plus Kyle's click-through are where it is actually confirmed. Also flag the **two-Save-buttons** shape of this modal as a deliberate consequence of `SkiDayDetailsForm`'s fixed props contract (there is no prop that hides its button row), chosen because it makes guard layer 1 structural; Task 11 should judge whether the labelling reads clearly at mobile width.

---

### Task 10: `ActivityFeed.jsx` — the title line, the thumbnail strip, and the "with …" line

**Files:**
- Modify: `src/components/ActivityFeed.jsx`

**Interfaces:**
- Consumes: `item.sessionStats?.title`, `item.sessionPhotos`, `item.sessionTags` — the three fields Task 6 attaches, spelled exactly like that; `formatTaggedNames` from `src/lib/skiDayDetails.js` (Task 2); the existing `Avatar` import.
- Produces: **no new props.** `ActivityFeed` is mounted bare in **two** places — `MessagingCenter.jsx:199` (Crew tab → Feed sub-tab) and `TodayScreen.jsx:790` (Today tab → Friends section) — and neither passes anything. Adding a required prop would break both. Everything here lands on both surfaces automatically.

- [ ] **Step 1: Re-read the card render and confirm both mount sites**

```bash
sed -n '163,210p' src/components/ActivityFeed.jsx
grep -rn "<ActivityFeed" src/
```

Expected (2026-09-02): the `items.map` opens at `:165`; `bodyLine` is derived at `:191`; the `AccentCard` opens at `:194`; the body `<div>` is `:205-207`; the reactions row starts at `:209`. And exactly two mount sites, both `<ActivityFeed />` with no props.

- [ ] **Step 2: Add the one new import**

```js
import { formatTaggedNames } from "../lib/skiDayDetails"
```

alongside the existing `import { groupCommentsByActivity } from "../lib/activityComments"` (line 16).

- [ ] **Step 3: Derive the three new values inside the existing `items.map`**

Immediately after the existing `const bodyLine = statLine || sentence` line (`:191`), add:

```js
        // The three fields getActivityFeed attaches to ski_session items (Task 6). The
        // `|| []` fallbacks are not defensive noise: non-ski_session items never get these
        // keys at all, and .length on undefined throws INSIDE this render map, which would
        // blank the entire feed rather than one card.
        const sessionTitle = item.type === "ski_session" ? item.sessionStats?.title || "" : ""
        const sessionPhotos = item.sessionPhotos || []
        const sessionTags = item.sessionTags || []
        // Two names then "and N others". The avatar cap below is 3, deliberately higher:
        // three overlapped 18px avatars cost ~42px of width, whereas a third display name
        // can be twenty characters and would push the line into an ellipsis at 375px.
        const taggedNames = formatTaggedNames(sessionTags)
```

- [ ] **Step 4: Add the title line and re-space the body line**

Replace the existing body `<div>` (`:205-207`):

```jsx
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-1)", lineHeight: 1.4, marginTop: 10 }}>
              {bodyLine}
            </div>
```

with:

```jsx
            {sessionTitle && (
              /* The user's own words, so it outranks the generated stat line visually and
                 sits above it. wordBreak: break-word because a 60-char title with no
                 spaces (a URL, a hashtag run) would otherwise overflow the card at 375px
                 instead of wrapping. */
              <div style={{ fontSize: 14, fontWeight: 900, color: "var(--color-text-1)", lineHeight: 1.3, marginTop: 10, wordBreak: "break-word" }}>
                {sessionTitle}
              </div>
            )}

            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-1)", lineHeight: 1.4, marginTop: sessionTitle ? 4 : 10 }}>
              {bodyLine}
            </div>

            {taggedNames && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: "var(--color-text-3)", minWidth: 0 }}>
                <span style={{ flexShrink: 0 }}>with</span>
                <div style={{ display: "flex", flexShrink: 0 }}>
                  {sessionTags.slice(0, 3).map((t, i) => (
                    /* Overlapped by -6px, with a bg-coloured ring so the stack reads as
                       separate faces. flexShrink: 0 on the stack and on "with" means the
                       NAMES absorb the ellipsis, not the avatars. */
                    <div
                      key={t.id}
                      style={{ marginLeft: i === 0 ? 0 : -6, borderRadius: "50%", border: "1.5px solid var(--color-bg)", display: "flex" }}
                    >
                      <Avatar profile={t.profiles} size={18} />
                    </div>
                  ))}
                </div>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {taggedNames}
                </span>
              </div>
            )}

            {sessionPhotos.length > 0 && (
              /* flexWrap, NOT overflowX: auto. A horizontally-scrolling strip nested
                 inside TodayScreen's own scrolling page is a touch-gesture conflict, and
                 the Board slice already shipped two mobile-layout regressions this
                 session. Width arithmetic at a 375px viewport: 375 − 32 (parent padding)
                 − 3 (AccentCard's accent border) − 24 (AccentCard's 12px padding each
                 side) ≈ 316px usable. Four 72px thumbs plus three 6px gaps = 306px, so
                 four fit per row and six photos wrap to two rows. Nothing overflows and
                 nothing scrolls sideways. */
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {sessionPhotos.map((p) => (
                  /* Plain, non-interactive <img>. No onClick, no lightbox, no role, no
                     tabIndex — thumbnails only, per the Global Constraints. loading="lazy"
                     because a 30-card page can carry up to 180 images. alt="" because the
                     photo is decorative here: the card's title, stat line and "with" line
                     already carry the meaning, and there are no captions in this slice. */
                  <img
                    key={p.id}
                    src={p.url}
                    alt=""
                    loading="lazy"
                    style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, flexShrink: 0, display: "block" }}
                  />
                ))}
              </div>
            )}
```

- [ ] **Step 5: Verify no scope creep and no new prop**

```bash
grep -n "onClick" src/components/ActivityFeed.jsx
grep -n "lightbox\|Lightbox\|fullscreen\|caption" src/components/ActivityFeed.jsx
grep -n "subscribe\|channel" src/components/ActivityFeed.jsx
grep -n "export default function ActivityFeed" src/components/ActivityFeed.jsx
```

Expected:
- `onClick` hits only on the **pre-existing** handlers (reaction buttons, the 💬 toggle, delete, report, cancel, submit report, send). **No `onClick` on any `<img>`** — check each hit's context, not just the count.
- **zero** hits for lightbox/fullscreen/caption.
- **zero** hits for subscribe/channel — no realtime anywhere in this slice.
- the signature is still `export default function ActivityFeed()` — **no parameters.** Both mount sites pass nothing.

- [ ] **Step 6: Do the mobile-width reasoning explicitly and write it into the report**

Do not skip or hand-wave this. Two mobile-layout regressions shipped out of the Board slice's restyle in this same session, and one of them was wrongly adjudicated by a per-task reviewer as "pre-existing." At a 375px viewport, usable card width is ≈316px after parent padding, `AccentCard`'s 3px accent border and its 12px padding each side. Work through and record:

- **Title line:** a 60-character title at `fontSize: 14, fontWeight: 900` runs roughly 2 lines at 316px. Confirm `wordBreak: "break-word"` covers the no-spaces case (a pasted URL) so it wraps instead of overflowing.
- **"with …" line:** three overlapped 18px avatars = 18 + 12 + 12 = 42px, plus "with" ≈ 26px, plus two 6px gaps = ~80px, leaving ~236px for the names. Confirm `flexShrink: 0` on both "with" and the avatar stack, and `flex: 1 / minWidth: 0 / ellipsis` on the names span — so a very long name pair truncates the **text** and never squashes the avatars into ovals or pushes them off the card.
- **Photo strip:** 4 × 72 + 3 × 6 = 306 ≤ 316. Confirm four fit per row and that six photos produce two rows (~150px of extra card height) rather than a horizontal scroll.
- **Interaction with the existing reactions row:** four reaction chips with counts plus the 💬 button already `flexWrap` at `:209`. Confirm the new blocks sit **above** that row and its `borderTop`, so the divider still reads as separating the body from the actions.
- **`TodayScreen.jsx:790`'s section:** that mount sits inside a scrolling page, not a dedicated tab pane. A `ski_session` card can now grow by a title line + a two-row photo strip + a tag line — confirm nothing there constrains card height (no fixed-height wrapper, no `overflow: hidden` ancestor that would clip the strip). Read the surrounding JSX, don't assume.
- **`MessagingCenter.jsx:199`'s section:** the Feed sub-tab pane. Same check against its container.

- [ ] **Step 7: Lint and build**

```bash
npx eslint src/components/ActivityFeed.jsx
npm run build 2>&1 | tail -5
npm test 2>&1 | tail -5
```

Expected: no new lint problems, clean build, tests unchanged.

- [ ] **Step 8: Trace the degraded paths**

Write these into the report:
- **A session with no title, no photos, no tags** (all 112 existing production rows): `sessionTitle` `""`, both arrays `[]`, `taggedNames` `""` → all three new blocks are skipped and the card renders **byte-identically to today**, including the body line's `marginTop: 10`.
- **A non-`ski_session` item** (`trip_rsvp`, `trip_created`): `sessionTitle` is `""` by the `item.type` check, and the two `|| []` fallbacks keep `.length`/`.slice` from throwing on absent keys.
- **`getActivityFeed`'s photo query failed** (Task 6 warns and returns `[]`): the strip is absent, the console says why, and the rest of the card is intact.
- **A photo row whose storage object is gone** (a delete that failed halfway, per Task 3's documented order): `p.url` is a valid URL pointing at nothing, so the browser renders a broken-image box 72px wide. Note this as a known, accepted degradation of this slice — `alt=""` keeps it from announcing anything to a screen reader.
- **A tag whose profile lookup returned nothing:** `Avatar` falls back to its initial-circle on `profile?.full_name || profile?.username || "?"`, and `formatTaggedNames` renders "Someone" — the person is still counted, never dropped.

- [ ] **Step 9: Commit**

```bash
git add src/components/ActivityFeed.jsx
git commit -m "feat: Feed ski_session cards render title, photo thumbnails and tagged friends"
```

- [ ] **Step 10: Report**

Record: the Step 5 greps with the context of each `onClick` hit (proving none is on an `<img>`); the full Step 6 mobile-width arithmetic and the two mount-site container reads; the five Step 8 degraded-path traces; confirmation `ActivityFeed()` still takes no props and both mount sites are unchanged; lint/build/test numbers. State plainly that **no rendering was observed in a browser** — the width figures are arithmetic against the real style objects, not screenshots.

---

### Task 11: Whole-branch final review + fix wave

Dispatch a review of the full branch diff (Tasks 1-10 combined) **on the most capable available model** — that is the `superpowers:subagent-driven-development` skill's own rule for a final review, not a preference. This step has caught real cross-task bugs in every prior TASK 22.0 slice: a stale-state save bug and two offseason-data bugs in the Today List slice; a z-index/hitbox/tier-mismatch trio in the Today Map slice; 4 bugs including a tab-switch-killed realtime subscription in the Crews slice; **2 mobile-layout regressions in the Board slice, one of which a per-task reviewer had wrongly adjudicated as "pre-existing"**; number-formatting and default-tab bugs in the Leaderboard slice; and a profiles-embed 400 wave in Feed-B. Do not omit it and do not shrink it.

- [ ] **Step 1: Review the full diff**

Review `git diff main...HEAD` (the whole branch, not per-task diffs) against `docs/superpowers/specs/2026-09-02-crew-tab-feed-slice-c1-design.md` in full, **plus this plan's six Spec Corrections** — the spec is known-wrong in six places, so a reviewer comparing the diff to the spec verbatim will raise six false positives. Specifically: the spec's `are_friends(owner, tagged_user_id)` does not exist (Correction 1); its policy intent must go through helpers, not inline reads (2); its `profiles:` embeds 400 (3); it does not know `SessionEditForm` already has a de-facto title field (4); it puts `updateSessionTitle` in the wrong module (5); and it assumes the `LogDayModal` details step is reachable without rewiring (6). Also expect three plan-time derived decisions that are **not** in the spec and should be judged on their merits rather than flagged as drift: `getSessionPhotos`/`getSessionTags` are batched (array-taking) rather than singular; `initialTitle === undefined` hides `SkiDayDetailsForm`'s title section; and `SessionEditForm` ends up with two Save buttons.

Check every one of the following.

- **Security, first and hardest.** Both new tables have `ENABLE ROW LEVEL SECURITY` and `pg_class.relrowsecurity = true` **on the live database**, not just in the SQL file. `ski_session_photos_insert` requires **both** `user_id = auth.uid()` and `owns_ski_session(session_id)`. `ski_session_tags_insert` requires **all three** of `tagged_by = auth.uid()`, `owns_ski_session(session_id)` and `are_friends(tagged_user_id)` — re-derive from `pg_policies`, not from the file, and reason about what each conjunct alone would let through. Both helpers are `SECURITY DEFINER` **and** `STABLE` (`provolatile = 's'`, not `'v'`), have `SET search_path = public`, are `REVOKE`d from `PUBLIC` and `GRANT`ed only to `authenticated`. **No policy body contains the string `ski_sessions`** (Correction 2 / migration 041's near-miss).
- **The RLS SUCCESS cases were genuinely tested live — re-verify, do not take the report's word for it.** Task 1's report must contain real evidence: the owner's `INSERT` into `ski_session_photos` **succeeding**, the owner's `INSERT` into `ski_session_tags` **succeeding**, the friend reading **both** rows back with `count = 1`, the self-untag `DELETE` actually returning `after_self_untag_should_be_0 = 0`, and the owner's own photo `DELETE` returning `0`. Quoted query output, with the fixture UUIDs. **If the report shows only denials, or only says the SQL "looks correct", this review FAILS** — re-run Task 1 Steps 6a-6c yourself via `mcp__claude_ai_Supabase__execute_sql` and paste the output. This repo has already shipped a policy (migration 041) that refused every legitimate user while passing every denial test; that is the single most expensive failure mode available here.
- **The tag-wipe guard actually works.** Trace it, do not trust the table. Open edit on a session with an existing tag, change only the resort, press Save: `SessionEditForm.handleSave()` is invoked with **no argument** (confirm `onClick={() => handleSave()}`, an arrow — `onClick={handleSave}` passes the click event, which is truthy, and that single character re-opens the bug), so `detailsDiff` is `undefined`, `ProfileStats`'s `if (detailsDiff)` is false, `saveSkiDayDetails` is never called, `reconcileSessionTags` is never called, **the tag survives**. Then trace the two other paths in Task 9 Step 10. Then check layer 4: `sessionDetails` is cleared to `null` when `editingSessionId` goes falsy, so reopening a different session cannot seed the picker with the previous session's tags.
- **Object-URL lifecycle in `SkiDayDetailsForm`.** Exactly one `createObjectURL`, each result registered in `objectUrlsRef`. Exactly two `revokeObjectURL` — one per-remove, one in the unmount cleanup. The single `useEffect` has deps `[]` and reads the ref through a hoisted local. **No `useEffect` anywhere in that file has `pending` in its dependency array** — a `[pending]` dep revokes live URLs on every add and blanks the thumbnails the user just picked. Also confirm the reverse: the cleanup is not a stale closure over an empty initial array, which would leak every blob for the page's lifetime. And confirm the remount-on-`key` paths (Task 8's `detailsKey`) are what release the URLs of successfully-uploaded previews.
- **Hook order, in all three modified components.** `SessionRecapModal`: all 11 `useState` and the 1 `useEffect` are above `if (!session) return null`. `RecentSessionsFeed`: all 5 `useState` and the 1 `useEffect` are above `if (!sessions.length) return`. `FriendTagPicker`: all 3 `useState` and the 1 `useEffect` are above its three early returns. A hook below any of these throws `Rendered more hooks than during the previous render` on a render that happens on **every** page load.
- **No scope creep.** No lightbox, no full-screen viewer, **no `onClick` / `role` / `tabIndex` on any `<img>`** anywhere in the diff. No photo caption column, no caption input, no caption render. No `notifications` row written on tag and no `insertNotification` call in any new code — tagging is silent. No next-login nudge, no "sessions I am tagged in" query, no check-in gap-fill (all Feed-C2). No realtime: `grep -n "subscribe\|channel"` over every touched component must be empty. No group-level Feed card. No change to `activity_feed`'s own policies, to `ski_sessions`' existing policies, or to migrations 013/026/027/042/044/045. **`src/lib/leaderboardApi.js`, `src/components/SessionStatsForm.jsx`, `src/components/TripDetailModal.jsx`, `src/App.jsx` and `src/components/ProfilePage.jsx` must all have a zero-line diff.**
- **Mobile-width rendering of all three new card additions — give this real attention.** Two mobile-layout regressions shipped from the Board slice's restyle in this same session's history, and a per-task reviewer wrongly called one of them pre-existing. Redo the arithmetic yourself rather than reading Task 10's: at 375px, usable card width ≈ 316px after parent padding, the 3px accent border and 12px of `AccentCard` padding each side. (a) Does the photo strip's 4 × 72 + 3 × 6 = 306px genuinely fit, and do six photos wrap to two rows rather than overflow or scroll sideways? (b) In the "with …" line, do `flexShrink: 0` on "with" and on the avatar stack plus `flex: 1 / minWidth: 0 / ellipsis` on the names span mean the **text** truncates and the 18px avatars never squash into ovals? (c) Does a 60-character title with no spaces wrap via `wordBreak: "break-word"` instead of overflowing? (d) Does the existing reactions row's `flexWrap` still hold with four counts plus the 💬 badge, now that the body above it is taller? (e) In `SkiDayDetailsForm`, do the 64px thumbnails with their -6px offset ✕ buttons fit inside the 480px-max modal at 375px, and does the ✕ overhang get clipped by any ancestor `overflow: hidden`? (f) Does `SessionEditForm`'s two-button arrangement (its own Save plus `SkiDayDetailsForm`'s "Save Details") read unambiguously at that width, or does it look like a duplicated control?
- **Both `ActivityFeed` mount sites still render correctly.** `MessagingCenter.jsx:199` and `TodayScreen.jsx:790` both mount `<ActivityFeed />` bare. Confirm no required prop was added and read each surrounding container: `TodayScreen`'s Friends section sits inside a scrolling page rather than a dedicated tab pane, and a `ski_session` card can now grow by a title line, a two-row photo strip and a tag line. Check for any fixed height or `overflow: hidden` ancestor that would clip the strip on either surface.
- **Correction 3 was actually applied everywhere.** `grep -n 'profiles:' src/lib/socialApi.js` — every hit must be an object-literal key (`profiles: pm.get(...)`), never a substring inside a `.select("…")` string. A `profiles:tagged_user_id(...)` embed 400s at runtime and renders as "nobody was tagged" forever, silently.
- **Silent-failure surface.** Trace what a user sees if migration 046 were somehow absent or its policies refused everything: `getSessionPhotos`/`getSessionTags` reject → Task 6's two `.catch()` warn and return `[]` → cards render with no strip and no "with" line → the feed itself still works. `FriendTagPicker` warns and shows "Couldn't load your friends list." rather than an empty list that reads as "you have no friends." `SkiDayDetailsForm`'s save surfaces `detailsError` in all three consumers rather than closing. Confirm nothing in the diff swallows an error without a `console.warn` or a visible message.
- **Type and name consistency across tasks.** `sessionStats` / `sessionPhotos` / `sessionTags` are spelled identically in Task 6's attach and Task 10's read. `PhotoRow`/`TagRow` field names match between the migration's `CREATE TABLE`, Task 3's three `.select()` strings, Task 2's test fixtures, and Task 10's `p.id`/`p.url`/`t.id`/`t.profiles` reads. The diff shape `{ title, addedPhotoFiles, removedPhotoIds, tagUserIds }` is identical in `SkiDayDetailsForm`'s emit, `saveSkiDayDetails`'s destructure, and all three consumers. `MAX_PHOTOS_PER_SESSION`/`MAX_PHOTO_BYTES`/`TITLE_MAX_LENGTH` are declared **once**, in `skiDayDetails.js`, with no literal `6`/`5 * 1024`/`60` duplicating them in any component or in `socialApi.js`.
- **The title/notes decision landed as designed.** `SessionEditForm` has exactly **two** text fields above the mountain picker, labelled "Title" and "Notes", bound to `title` and `notes` respectively and saved independently in one `fields` object. `grep -n "Activity Name"` returns nothing. **No backfill** of `notes` into `title` exists anywhere in the diff or in migration 046. And `SkiDayDetailsForm` is mounted in `SessionEditForm` **without** `initialTitle`, so that modal has one title input, not two.
- **Test/lint baseline.** `npm test` and `npx eslint .` are at or better than the **fresh-worktree** baseline recorded in Task 0 — not the `main` figure cited in the Global Constraints — with `npm test` up by exactly the **24** new `skiDayDetails.test.js` cases. `npm run build` succeeds. Record the actual numbers.

- [ ] **Step 2: Fix any findings**

Apply fixes for everything the review surfaces, in a **single consolidated fix-wave commit** (not one per finding), same pattern as every prior slice. Re-run `npm test` / `npx eslint .` / `npm run build` after fixing. If a finding requires a migration change, apply it as a **new** statement set via `mcp__claude_ai_Supabase__apply_migration`, edit `migrations/046_ski_day_details.sql` to match, and then **re-run Task 1 Steps 4-7's verification queries in full — including the success cases 6a-6c**, not just the denials.

- [ ] **Step 3: Commit the fix wave (only if there were findings)**

```bash
git add -A
git commit -m "fix: final-review fix wave — Feed sub-tab slice C1"
```

- [ ] **Step 4: Report final state**

Record:
- Final `npm test` pass count and final `npx eslint .` problem count, against the **Task 0 fresh-worktree** baseline, with the +24 test delta called out.
- The live RLS evidence quoted from Task 1's report: the three **success** blocks (owner writes title/photo/tag; friend reads both back; friend self-untags to 0; owner deletes own photo) and the five denials. If you had to re-run any of it yourself, say so and paste the new output.
- All six Spec Corrections restated in one line each, so they can be folded back into the spec or noted in `ROADMAP.md`, plus the three plan-time derived decisions (batched getters, `initialTitle`-hides-title, two Save buttons) and your adjudication of each.
- Any new correction found during implementation, with its live evidence.
- An explicit statement that **no subagent in this build had browser or Supabase-auth tooling** — every UI task was verified by tests/lint/build/grep/hand-trace and arithmetic only, and no rendering was observed. Task 1 was the one exception and did use real database tooling.
- The mobile-width arithmetic for all six sub-checks in Step 1, written out.

- [ ] **Step 5: Hand off to Kyle with a live click-through checklist**

No source review substitutes for this. The security property this slice exists to establish — friends see a tagged photo, non-friends see nothing — is only actually proven by two real accounts in a real browser.

**Multi-account click-through, for Kyle:**

1. **Log a day with everything.** Crew → Leaderboard → Log a Ski Day. Submit resort + date. On the stats step, **press Skip** (this is Correction 6's skip path — the details step must appear, not the modal closing). Give the day a title, attach 2-3 photos including one over 5MB (it should be rejected individually, by name, with the other two still attaching), tag one friend, Save.
2. **Confirm your own Feed shows it.** Crew → Feed: the card shows the title above the stat line, the thumbnail strip, and "with [avatar] <friend>". Check the Today tab's Friends section too — same card, same rendering, no clipping.
3. **Confirm the friend's Feed shows it.** Log in as the tagged friend (or any accepted friend). Their Crew → Feed shows the same title, thumbnails and "with" line.
4. **Confirm a non-friend's Feed does NOT show it.** Log in as an account with no accepted friendship to the owner. The card must be absent entirely — and if any card is visible, it must carry **no** photos and **no** "with" line.
5. **Edit an existing day and remove a photo.** Profile → Session History → ✏️ on the day from step 1. Confirm two distinct fields, "Title" and "Notes", with your title in the first. Remove one photo, press **Save Details**. Reopen: the photo is gone, and **the tag is still there**.
6. **Edit only the mountain.** Reopen the same day, change nothing but the mountain, press the **plain Save** button (not "Save Details"). Reopen: **the tag must still be there and the photos must still be there.** This is the tag-wipe guard. If either is gone, stop and report it.
7. **Confirm the tagged friend can self-untag.** As the tagged friend, remove your own tag (the owner's Feed card should stop showing you). This is the only reason one-way tagging with no confirmation step is acceptable.
8. **GPS path.** End a GPS-tracked session and confirm the recap modal's "📸 Day Details" section appears above the action row, saves, and shows "Details saved ✓" without closing the modal.

**Do not push to `main` before this click-through passes.** `main` auto-deploys to `powdays.app` live, with **no staging step**. This branch stays on `worktree-crew-tab-feed-slice-c1` until Kyle signs off, and the merge decision goes through `superpowers:finishing-a-development-branch`.

One follow-up to raise with Kyle separately, deliberately **not** fixed by this slice (it is recorded in the Spec Corrections section above and is pre-existing, not introduced here): `ski_sessions` carries a SELECT policy `"authenticated users can view all sessions"` with `qual = (auth.uid() IS NOT NULL)`, so every logged-in user can already read every ski session row. The two new tables are strictly tighter than the table they hang off. Closing that hole changes what the leaderboard, `getMySessions`, the trip backfill and the arrival trigger can read, and needs its own slice.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-02-crew-tab-feed-slice-c1.md`. Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration. This plan is written for it: every task has its own Files/Interfaces header, its own verification steps, and its own commit, so a subagent needs no context beyond its task section plus the six Spec Corrections and the Global Constraints.
- **REQUIRED SUB-SKILL:** `superpowers:subagent-driven-development`
- Fresh subagent per task + two-stage review. **Task 11 must be dispatched on the most capable available model**, per that skill's own rule for a final review.

**2. Inline Execution** — execute tasks in this session with batched checkpoints.
- **REQUIRED SUB-SKILL:** `superpowers:executing-plans`

**Which approach?**

**Where the work happens.** All of it runs in the git worktree created for this plan, on branch **`worktree-crew-tab-feed-slice-c1`** (Task 0 Step 1, via `superpowers:using-git-worktrees`). Nothing runs in the main checkout, and nothing merges to `main` until Kyle's Task 11 Step 5 click-through passes — `main` auto-deploys to `powdays.app` live with no staging step. The merge decision goes through `superpowers:finishing-a-development-branch`.

**Task order and dependencies.** Mostly a chain, with two places where work can be parallelised:

```
Task 0 (baseline) → Task 1 (migration, DONE and applied to production)
                       ↓
                    Task 2 (skiDayDetails.js + tests)
                       ↓
                    Task 3 (socialApi CRUD)  ──┬─→ Task 6 (getActivityFeed)  ─→ Task 10 (ActivityFeed render)
                                               │
                    Task 4 (FriendTagPicker) ──┴─→ Task 5 (SkiDayDetailsForm) ─→ Tasks 7, 8, 9 (three consumers)
                                                                                        ↓
                                                                                    Task 11 (final review)
```

- **Task 4 can run in parallel with Task 3** — it depends only on `getAcceptedFriends`, which already exists.
- **Tasks 7, 8 and 9 are independent of each other** and can run in parallel once Tasks 3 and 5 have landed; they touch four disjoint files (`LeaderboardPage.jsx`; `SessionRecapModal.jsx`; `SessionEditForm.jsx` + `ProfileStats.jsx`).
- **Task 10 depends on Task 6**, because it reads the three field names Task 6 attaches.
- **Task 11 depends on everything** and must be last.

**Current state, for whoever picks this up:** Task 1 is complete — migration `046_ski_day_details.sql` has been applied to production (`hkzaohqrycwfgmcogwdo`), verified with live impersonated success and denial cases, and committed. Start at Task 0 if the worktree does not exist yet (record the baseline first), otherwise start at Task 2.

---

## Self-Review Notes (for the plan author, already applied above)

- **Spec coverage.** §Schema → Task 1 (with Corrections 1 and 2 applied). §Storage bucket → Task 1's storage block. §New Components / `SkiDayDetailsForm` → Task 5; `FriendTagPicker` → Task 4. §Integration Points 1/2/3 → Tasks 7/8/9, with Correction 6 applied to 1 and Correction 4 to 3. §API → Task 3, with Corrections 3 and 5 applied and the getters batched. §Feed Rendering → Task 6 (the two second-queries) + Task 10 (the three card additions). §New pure-logic tests → Task 2's 24 cases. §Explicitly Out of Scope (all five items) → Global Constraints and Task 11 Step 1's scope-creep check. §Testing's "assert the success case, not just denials" → Task 1 Steps 6a-6c and Task 11's blocking re-verification of them.
- **Six spec corrections, each re-derived against the live production database rather than the spec's paraphrase**, and each one carried through three places: stated at the top, applied in a specific task's code, and re-checked as a named review item in Task 11 Step 1.
- **Three plan-time derived decisions, flagged as such so Task 11 judges them rather than assuming they are spec:** (1) `getSessionPhotos`/`getSessionTags` take an **array**, not a single id, because Task 6 needs one query for 30 sessions; (2) `initialTitle === undefined` hides `SkiDayDetailsForm`'s title section, which is what reconciles the fixed props list with Correction 4's "do not ship two title fields"; (3) `SessionEditForm` therefore ends up with two Save buttons, which is what makes the tag-wipe guard's layer 1 structural rather than a heuristic.
- **Two deliberate improvements over the precedents being copied, both called out in their task's report step** so a reviewer does not read them as drift: `addSessionPhoto`'s random filename suffix (`uploadTripMedia`'s bare `Date.now()` can collide when six files are picked at once) and its orphan-object cleanup on a failed insert (`uploadTripMedia` has none, and `ski_session_photos_insert` can genuinely refuse). Plus `FriendTagPicker`'s `minWidth: 0` / ellipsis on the name span, which the `TripDetailModal` original lacks.
- **One behavioural change to existing code, stated plainly in Task 6 Step 9** so it is not mistaken for an accident: `getActivityFeed`'s stats-failure path no longer early-returns, so a broken stats select cannot blank the two unrelated photo/tag features.
- **Type consistency checked end to end.** `PhotoRow = { id, session_id, user_id, storage_path, created_at, url }` and `TagRow = { id, session_id, tagged_user_id, tagged_by, created_at, profiles }` are identical across migration 046's `CREATE TABLE`, Task 2's test fixtures, Task 3's three `.select()` strings, Task 6's grouping, and Task 10's reads. The diff shape `{ title, addedPhotoFiles, removedPhotoIds, tagUserIds }` is identical in Task 5's emit, Task 3's destructure, and Tasks 7/8/9's handlers. `sessionStats`/`sessionPhotos`/`sessionTags` are spelled the same in Task 6 and Task 10. The three caps live in exactly one file and every task greps to prove no literal duplicates them. Function names are spelled identically in their definition, their imports and their call sites in every task.
- **The tag-wipe guard is written out as four independent layers with a table and three hand-traces** (Task 9), not asserted. It was not in the design spec; it was derived from reading `ProfileStats.jsx`'s real save handler and noticing that `onClick={handleSave}` would pass a truthy click event into the new `detailsDiff` parameter.
- **The object-URL lifecycle is specified with both wrong versions named explicitly** (a `[pending]` dep that blanks live thumbnails; a `[]` dep with a stale closure that leaks every blob), because the correct version looks arbitrary without them.
- **Hook-order hazards are named per file** with the exact guard line each new hook must sit above: `SessionRecapModal.jsx:59`'s `if (!session) return null` and `ProfileStats.jsx:163`'s `if (!sessions.length) return`. Both are crashes on a render that happens on every page load, not cosmetic issues.
- **No placeholders.** Every step has complete, real code or a complete, real command with its expected output — no "add appropriate styling", no "handle errors", no "similar to Task N", no deferred detail. Every task ends with a report step that requires stating plainly that no browser check happened, because none can.
