# Crowdsourced Conditions Reports — Design Spec

**Date:** 2026-10-01
**Author:** Claude (brainstorming session with Kyle)
**Status:** Draft, pending Kyle's review
**Part of:** Not tracked under a ROADMAP task number yet — related to, but distinct from, the
still-unscoped TASK 22.3 (weather/conditions API quality pass). TASK 22.3 is about fixing
scraper/API accuracy for the *computed* Powder Score; this feature adds a separate,
human-sourced signal alongside it. Kyle confirmed this stays separate from the Powder Score
formula for now, with an explicit intent to fold it in later once there's a real data set.

## Context

Kyle's ask: when he and friends meet up in Denver after skiing different resorts, the questions
that always come up are "How was the snow?", "Was it icy?", "Was it crowded?" There's currently
no way to capture or surface that information anywhere in the app — a user's own ski day only
records title/photos/friend-tags (migration 046) and private notes, and the only other
"conditions" field in the app, `trip_recaps.conditions`, is a single-select tag scoped to one
trip and visible only to that trip's own RSVP'd crew (migration 009) — it can't express "icy"
and "crowded" as two independent facts, and nobody outside the trip ever sees it.

This feature adds a lightweight, optional conditions report to the existing ski-day-logging flow,
visible resort-wide to any signed-in user, so "how was it today" becomes something the app can
answer from real reports instead of only from scraped resort data.

## Design Decisions (confirmed with Kyle)

1. **Visibility: resort-wide, to every signed-in user** — not friends-only, not private. The
   point is to help anyone deciding where to ski, the same audience the Powder Score itself
   serves.
2. **Powder Score tie-in: none, for now.** Reports display as their own separate "Recent Reports"
   section, visually and functionally distinct from the computed score. Kyle wants this revisited
   later once there's a real volume of reports to aggregate from — explicitly a future step, not
   in scope here.
3. **Entry point: tied to logging a ski day**, not a standalone "report conditions" button open to
   anyone. A report is only collectible from someone who has an actual `ski_sessions` row for that
   resort and date — harder to spam than an unauthenticated-of-visit quick-report button would be.
4. **Snow quality vocabulary: a deliberate 4-value set — Powder / Groomed / Icy / Slushy.**
   Correction from an earlier draft of this spec: the live `TripDetailModal.jsx` recap chips
   (`recapConditions`, line ~1902) actually offer 6 values — `powder, groomed, icy, slushy,
   packed, variable` — not 4; there is no DB CHECK on `trip_recaps.conditions` constraining it,
   so the UI's chip list is the only real definition. Kyle's call once shown the correct list:
   trim to 4 for *this* feature rather than matching all 6. This deliberately leaves two
   overlapping-but-different snow-quality vocabularies in the app (`trip_recaps`'s 6 untouched,
   this feature's 4) — not a bug, a conscious trade for a simpler chip row here.
5. **Crowd level: 4 tiers** — Empty / Light / Moderate / Packed. A new axis; nothing in the app
   captures this today.
6. **Optional short comment** — free text, capped short (not a journal entry), for color the chips
   can't capture ("icy only on the back side").

## Data Model

Three new nullable columns directly on `ski_sessions`, added by a new migration:

```sql
ALTER TABLE ski_sessions
  ADD COLUMN snow_quality TEXT,
  ADD COLUMN crowd_level TEXT,
  ADD COLUMN conditions_comment TEXT;

ALTER TABLE ski_sessions
  ADD CONSTRAINT ski_sessions_snow_quality_check
    CHECK (snow_quality IS NULL OR snow_quality IN ('powder','groomed','icy','slushy')),
  ADD CONSTRAINT ski_sessions_crowd_level_check
    CHECK (crowd_level IS NULL OR crowd_level IN ('empty','light','moderate','packed')),
  ADD CONSTRAINT ski_sessions_conditions_comment_length
    CHECK (conditions_comment IS NULL OR char_length(conditions_comment) <= 140);
```

### Why plain columns on `ski_sessions`, not a new table

`ski_sessions` already carries a SELECT policy readable by any authenticated user —
`"authenticated users can view all sessions" USING (auth.uid() IS NOT NULL)` — confirmed live,
and deliberately left open rather than tightened (Leaderboard, Feed, trip-backfill, and the
arrival trigger all depend on it reading broadly). `title` already lives as a plain column on
this same table for exactly this reason: migration 046 reasoned that a scalar the user types once
is safe as a column, while *sets* (photos, tags) need join tables because other independent
writers (the arrival trigger, `logSkiDay`'s upsert, GPS session start/end, Strava sync) could
silently clobber them. `snow_quality`/`crowd_level`/`conditions_comment` are the same shape as
`title` — optional scalars, written once, through the exact same three entry points `title`
already goes through (`LogDayModal`, `SessionRecapModal`, `SessionEditForm`) — so they carry the
same already-proven-safe risk profile. A dedicated table would mean re-deriving RLS, a new
`SECURITY DEFINER` helper (mirroring `owns_ski_session()`), and a join — overhead with no benefit,
since the visibility this feature wants (resort-wide, any authenticated user) is *already* what
`ski_sessions` grants today.

### No new RLS needed

Because the three columns live on `ski_sessions` itself, the existing SELECT policy already makes
them resort-wide visible the moment they're written — no new policy, no new helper function.
Writes continue to go through the existing session-owner-only UPDATE path the way `title` updates
do today (via `saveSkiDayDetails`'s orchestration in `socialApi.js`).

## Submission Flow

Extend `SkiDayDetailsForm.jsx` — the shared form already used by all three entry points — with
two new optional sections, placed after Photos and before "Who did you ski with":

- **Snow quality** — single-select chip row: Powder / Groomed / Icy / Slushy. Same visual pattern
  as `TripDetailModal`'s existing recap chips (`recapConditions` state, lines ~1903-1907) — border/
  background/color keyed on selected vs. not, using the resort's accent color.
- **Crowd level** — single-select chip row: Empty / Light / Moderate / Packed. New chip set, same
  visual treatment as snow quality's row.
- **Comment** — optional short text input below both rows, placeholder like `"Icy on the back
  side, fine up top…"`, capped at the same 140-char limit as the DB constraint, with a
  character-remaining counter matching `title`'s existing `X/Y` pattern.

All three stay fully optional, matching the form's existing "Skip" affordance — nothing is forced.
`SkiDayDetailsForm`'s `onSave` diff gains `snowQuality` / `crowdLevel` / `comment` keys alongside
the existing `title` / `addedPhotoFiles` / `removedPhotoIds` / `tagUserIds`, following the same
"only emit a key if the section exists/was touched" discipline the component already documents
for `title` and `tagUserIds` (so an edit that only changes a photo can't accidentally null out an
existing report, and vice versa).

`saveSkiDayDetails()` (socialApi.js) gains the corresponding write — extending
`updateSessionTitle`'s single-row update (or a sibling function alongside it) to also set
`snow_quality` / `crowd_level` / `conditions_comment` in the same query, keyed by `session_id`,
matching its existing one-query-per-concern shape.

## Display — "Recent Reports" widget on the resort page

New entry in `src/lib/mountainPageWidgets.js`, alongside the existing Board and Events widgets,
receiving `{resortKey, currentUserEmail}` like every other widget. Query shape follows
`getBoardPosts()`'s established pattern exactly:

```js
supabase
  .from("ski_sessions")
  .select("id, user_id, session_date, snow_quality, crowd_level, conditions_comment")
  .eq("resort_name", resortKey)   // column is named resort_name but holds the canonical resort_key
  .or("snow_quality.not.is.null,crowd_level.not.is.null,conditions_comment.not.is.null")
  .gte("session_date", <14 days ago>)
  .order("session_date", { ascending: false })
  .limit(20)
```

followed by a second batched query to `profiles` for each reporter's name/avatar, merged
client-side via a `Map` — the same no-FK-embed pattern every other feed in this app already uses
(`profiles_embed_always_fails` — there is no FK from `ski_sessions.user_id` straight to
`profiles`).

Each row renders: avatar + name, `timeAgo(session_date)` (reusing `src/lib/format.js`'s existing
helper), the snow/crowd values as read-only chips (same colors as the input chips), and the
comment text if present. A session with all three fields null simply never matches the query and
never appears — no empty placeholder rows.

**Why a 14-day window:** ski conditions go stale fast; a report from three weeks ago is actively
misleading, not just less useful. 14 days balances that against not leaving an empty-looking
section on lower-traffic resorts. The cutoff is a widget-query constant, not a stored flag on the
row — a report doesn't need to "expire" in the database, it just stops being queried into view.

## Edge Cases

- **Editing a past session's conditions later** (via `SessionEditForm`) updates the report in
  place — there is no separate "report" entity with its own lifecycle independent of the session
  it describes. If a user changes their snow-quality selection a week later, the widget reflects
  the new value immediately (subject to the 14-day window still including that session).
- **No moderation/reporting UI in this first pass** — consistent with the app's existing stance on
  Board posts and Feed comments (both shipped without moderation tooling). Logged as a backlog
  item, not a blocker.
- **A resort with zero recent reports** shows a plain empty-state line (e.g. "No conditions
  reports in the last two weeks."), matching `MountainBoard.jsx`'s own empty state ("No posts yet
  at Vail. Be the first.") — not a blank widget. Correction from an earlier draft of this spec,
  which claimed Board/Events render nothing when empty; `MountainBoard.jsx:307-310` actually does
  show a message, and this widget follows that same precedent.

## Non-Goals (explicitly out of scope)

- Any change to the Powder Score formula (`src/lib/powderScore.js`, `server/powderScore.js`) or
  how it's computed — reports are display-only in this pass, per Kyle's explicit "start separate,
  revisit later" decision.
- A standalone "report conditions" entry point independent of logging a ski day.
- Star ratings or any numeric score on the report itself — the three questions Kyle described are
  qualitative, and `trip_recaps` already owns the app's one numeric 1-5 rating concept for trips
  specifically; this feature doesn't duplicate it.
- Moderation, flagging, or abuse-handling UI for reports.
- Any retroactive backfill of conditions for existing `ski_sessions` rows — the columns are
  nullable with no default, exactly like `title` was when it shipped; existing rows simply have no
  report until their owner adds one via `SessionEditForm`.

## Testing

- Extend `src/lib/skiDayDetails.js`'s existing pure-function test file with the same style of
  coverage `clampTitle`/`validatePhotoSelection` already have: a value-validation/clamp helper for
  the new chip values and the comment length cap (reject anything outside the enumerated
  `snow_quality`/`crowd_level` values; clamp the comment to 140 codepoints the same way `title` is
  clamped to its own cap).
- The widget's query logic and all `.jsx` changes (`SkiDayDetailsForm`, the new widget component,
  `TripDetailModal`-style chip rendering) will have no automated coverage — consistent with every
  other widget and form in this app (`npm test` only globs `src/lib`). Verified by code review plus
  Kyle's own click-test once live: submit a report via each of the three entry points, confirm it
  appears on that resort's page, confirm it disappears from the widget once `session_date` falls
  outside the 14-day window (can be checked by hand-editing a test row's date rather than waiting
  two weeks).
