# Crew Tab Feed Slice C1: Title, Photos & Friend-Tagging — Design

**Status:** Approved by Kyle 2026-09-02, pending spec write-up review.
**Part of:** TASK 22.0, Feed sub-tab, slice 4 of 5 (Crews → Board → Leaderboard → Feed → Friends).
Feed itself is decomposed into Feed-A (restyle, shipped) → Feed-B (comments, shipped and live) →
**Feed-C1 (this doc)** → Feed-C2 (next-login nudge, separate future slice, depends on C1).

## Problem

Today, logging a ski day (however it happens) captures only resort/date/stats. Kyle wants users
to be able to give a day a title, attach photos, and tag which friends they skied with — both
at the moment they finish logging, and later when editing a previously logged day. Feed-C2 (a
separate, later slice) will add a next-login nudge for anyone who skipped this; C1 only builds
the capability itself.

## Current State (verified against source, 2026-09-02)

`ski_sessions` (migrations `20260515_ski_sessions.sql`, `010_ski_runs.sql`,
`017_strava_session_link.sql`) has no title field — `notes` is free text and isn't surfaced in
the Feed. `activity_feed` (`013_activity_feed.sql`) has no FK to `ski_sessions`; `getActivityFeed()`
(`src/lib/socialApi.js:~3926`) resolves richer stats via a **second read-time query** joined on
`subject_id`, deliberately not a snapshot, "so a user can edit a day's numbers afterwards" — new
fields should follow this same pattern.

Three places a "day" gets created or edited today, all confirmed in source:

1. **`LogDayModal`** (`src/components/LeaderboardPage.jsx:29`) — manual retroactive logging.
   Two-step: `step === "basic"` submits via `logSkiDay()` + `logActivityOnce("ski_session", ...)`
   (`:46-73`), then advances to `step === "stats"`, rendering `SessionStatsForm` with
   `{ saving, onSave, onSkip }` props (`:104-115`) — optional, skippable.
2. **GPS end-of-session** — `App.jsx handleSessionEnd()` (`:684-716`) calls
   `flushSessionToSupabase()` then `logActivityOnce(...)`, then `setRecapData(result)` (`:693`),
   which renders `SessionRecapModal` (`src/components/SessionRecapModal.jsx`,
   `{ session, runs, profile, onClose, stravaConnected, onPostToStrava }`) — the stats/share/
   Strava-upload screen shown right after a GPS-tracked day ends.
3. **`SessionEditForm`** (`src/components/SessionEditForm.jsx`, 148 lines) — edits a previously
   logged day (`{ session, onSave, saving, error, onError }`), reached from `ProfileStats.jsx`.

Photo/storage precedent exists twice already, both reusable patterns: `crew-photos` and
`chat-media` buckets are created **in-migration** (`INSERT INTO storage.buckets ...`), with a
self-delete RLS policy keyed on the uploader's user id being the first path segment
(`(storage.foldername(name))[1] = auth.uid()::text`). `trip-media`'s bucket, by contrast, was a
manual step outside its migration — a gap this slice will not repeat.

Friend-tagging has no dedicated component today; `TripDetailModal.jsx`'s invite panel has the
closest precedent (a `Set`-backed checkbox list built from `getAcceptedFriends()`), inlined
rather than extracted.

## Schema (new migration `046_ski_day_details.sql`)

```sql
ALTER TABLE ski_sessions ADD COLUMN title TEXT;

CREATE TABLE ski_session_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ski_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE ski_session_photos ENABLE ROW LEVEL SECURITY;
-- SELECT: owner or their friends (are_friends(), same rule the Feed already uses)
-- INSERT: only the session owner, only onto a session they own
-- DELETE: only the session owner

CREATE TABLE ski_session_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ski_sessions(id) ON DELETE CASCADE,
  tagged_user_id UUID NOT NULL REFERENCES auth.users(id),
  tagged_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, tagged_user_id)
);
ALTER TABLE ski_session_tags ENABLE ROW LEVEL SECURITY;
-- SELECT: owner, the tagged person, or the owner's friends
-- INSERT: only the session owner, and only WITH CHECK are_friends(owner, tagged_user_id) —
--         enforced in RLS, not just the UI, so tagging a stranger is impossible even via
--         a raw client call
-- DELETE: the session owner (remove a tag) OR the tagged person (self-untag)
```

Storage bucket `ski-day-media`, created in-migration (public read, authenticated insert), path
convention `${user_id}/${session_id}/${timestamp}.${ext}` — user id first, matching the existing
self-delete policy shape from `chat-media`.

**Why join tables, not array columns:** migration 037's own rationale for `plan_parties` (vs. a
column on `daily_plans`) applies directly here. `ski_sessions` already has 5 independent writers
(the arrival trigger, `logSkiDay()`, GPS start, GPS end, Strava sync) — an array column risks
being silently nulled by any upsert that doesn't know about it. A join table sidesteps that
class of bug entirely.

## New Components

**`SkiDayDetailsForm`** (`src/components/SkiDayDetailsForm.jsx`, new) — the shared sub-form:
title text input (max 60 chars, enforced client-side), a photo picker (max 6 images, max 5MB
per file, thumbnail previews with a remove button before upload), and a `FriendTagPicker`.
Props: `{ sessionId, initialTitle, initialPhotos, initialTags, saving, onSave, onSkip }` —
`onSave` receives a diff, `{ title, addedPhotoFiles, removedPhotoIds, tagUserIds }`; the form
itself makes no API calls — the consuming component (`LogDayModal`/`SessionRecapModal`/
`SessionEditForm`) translates that diff into calls to the functions listed below. `onSkip` is
optional (omitted from `SessionEditForm`'s usage, which always has a persistent Save instead of
a skippable step).

**`FriendTagPicker`** (`src/components/FriendTagPicker.jsx`, new) — extracted from
`TripDetailModal`'s inline checkbox pattern: `getAcceptedFriends()` → checkbox list → controlled
`Set` of selected friend ids. Props: `{ selectedIds, onChange }`. No dedicated accept/decline
step (Kyle's call: one-way tag, friends-only, no confirmation needed — tagging is a label, not a
membership grant).

## Integration Points

1. **`LogDayModal`** gains a third step, `"details"`, after `"stats"` — same optional,
   skippable shape as the existing stats step (`onSave` persists via the new save functions
   below; `onSkip` calls `onClose()` exactly like `SessionStatsForm`'s skip does today).
2. **`SessionRecapModal`** gains a `SkiDayDetailsForm` section (persistent Save, not a modal
   step — this modal has no step machine today, so the section lives alongside the existing
   stats/share/Strava UI).
3. **`SessionEditForm`** gains the same three fields, saved through the same functions,
   seeded from the session's existing title/photos/tags.

## API (new functions in `src/lib/socialApi.js`, following existing patterns exactly)

- `getSessionPhotos(sessionId)` / `addSessionPhoto(sessionId, file)` / `deleteSessionPhoto(photoId, storagePath)` —
  mirrors `uploadTripMedia`/`getTripMedia`/`deleteTripMedia`'s shape (upload to storage, insert
  DB row, resolve public URL at read time).
- `getSessionTags(sessionId)` / `addSessionTag(sessionId, friendUserId)` / `removeSessionTag(tagId)` —
  mirrors the reaction/comment functions' shape.
- `updateSessionTitle(sessionId, title)` — simple update, alongside the existing
  `updateSessionStats()` in `leaderboardApi.js`.

## Feed Rendering

`ActivityFeed.jsx`'s `ski_session` card (`:165-207`) gains: a title line (if set, above the
existing stat line), a photo thumbnail strip (thumbnails only — no lightbox, kept minimal for
this slice), and a "with [avatars] Jane, Mike" tagged-friends line. `getActivityFeed()` gains two
more batched second-queries (photos, tags by session id), following the exact pattern
reactions/comments already use — session-stats resolution stays read-time, not a metadata
snapshot, consistent with the existing design comment at `socialApi.js:~3923-3925`.

## New pure-logic tests (`src/lib`)

- `groupPhotosBySession(rows)` / `groupTagsBySession(rows)` in a new `src/lib/skiDayDetails.js` —
  same shape as `groupCommentsByActivity` (buckets by session id, never mutates input).
- Photo-count/size validation as a pure function (`validatePhotoSelection(files, existingCount)`),
  testable without a real file-upload harness.

## Explicitly Out of Scope for C1

- Full-screen photo viewer/lightbox (thumbnails only)
- Photo captions
- Tag notifications (tagging is silent — no `notifications` row; can be added later if Kyle
  wants it, following the existing `target_type` pattern from migration 043)
- Group-level Feed cards (already backlogged from the original Feed decomposition)
- The next-login nudge and the check-in-only activity_feed gap-fill — that's Feed-C2, a
  separate slice that depends on this one existing first.

## Testing

Existing `node --test` suite covers `src/lib` only (no DOM harness in this repo) — the same
constraint every prior slice this session operated under. New pure functions
(`groupPhotosBySession`, `groupTagsBySession`, `validatePhotoSelection`) get real unit tests;
the RLS policies get live-verified via session impersonation against production, per this
session's established discipline (assert the **success** case, not just denials) — a friend
actually seeing a tagged photo/tag, a non-friend actually blocked from being tagged.
