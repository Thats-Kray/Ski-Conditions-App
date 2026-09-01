# Design — Crew Tab: Feed Sub-Tab, Slice A of 3 (Restyle + Richer Stats + Reactions Restyle)

**Date:** 2026-09-01
**Status:** Approved for planning
**Origin:** ROADMAP.md TASK 22.0, continuing the Crew tab's mockup-fidelity pass after Crews,
Board, and Leaderboard (all shipped and live). Source of truth is `mockups/PowDays.app mockup
design/PowDays Reorg Mockup.dc.html`'s `crewFeed`/`feed` render branch — no dedicated static
screenshot exists for Feed, same situation every non-Friends sub-tab has been in.

## 1. The problem, and why this isn't one slice

Unlike Crews/Board/Leaderboard — all pure restyles of already-complete functionality — the
Feed mockup implies several genuinely new features stacked on top of a restyle:

- **Numeric kudos + a comment button.** Today's `ActivityFeed.jsx` has 4-emoji reactions
  (`activity_feed_reactions`, single active reaction per person per activity — picking a new
  emoji replaces your prior pick, it does not add a second; verified against
  `addActivityReaction()`'s upsert-on-`(activity_id,user_id)` behavior, correcting an earlier
  characterization during brainstorming that called this "multi-react"). No comments table or UI
  exists anywhere in the app.
- **Real stat lines** ("18 runs · 24,300 ft · 🌨 powder day"). Today's `activity_feed.metadata`
  only stores `resort_name`/`is_powder_day` at log time — not run count or vertical footage.
- **Group-level cards** (a whole crew shown as one entry, not one row per person) —
  `activity_feed.actor_id` is always a single user; there is no group-activity concept in the
  data model at all.
- **Photo attachments on a completed day** — Kyle asked directly whether this exists. It does
  not, anywhere: no column, table, or storage bucket ties a photo to a `ski_sessions` row.

Kyle's call: build all of it, but not as one plan — decompose into ordered sub-slices, same lens
that split the original Crew-tab redesign into 5 slices before any code was written:

**Feed-A (this spec) → Feed-B (comments) → Feed-C (photo attachments).** Group-level cards are
explicitly **backlogged for a future sprint**, not part of this 3-slice sequence.

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Feed-A ships first: restyle + richer stat lines + a visual-only reactions restyle.** Comments (Feed-B) and photo attachments (Feed-C) are separate future specs/plans; group-level cards are backlog, not sequenced yet. | Kyle's choice — smallest-lift-first ordering, mirroring Crews→Board→Leaderboard. Each of comments/photos is real schema+UI work deserving its own gap-audit/spec/plan/review cycle rather than being folded into a restyle. |
| 2 | **Reactions keep their exact current behavior** (4 emoji options, one active reaction per person, switching replaces) — **restyled visually only**, no behavior change, no migration. | Kyle's choice, same "restyle, don't cut" precedent as Board/Leaderboard. The mockup's single-kudos-count visual was considered and explicitly declined — it would be a real interaction change (multi-choice → single like-button), not a restyle. |
| 3 | **The Feed does NOT gain a "plans" activity type.** It stays activity-only (things that already happened: a logged session, a trip RSVP/creation). | Kyle's choice. TASK 22.5 (shipped 2026-08-31, separate slice) already put live "who's out today" plan status on the Today tab via `TodaysCrew.jsx`. Adding plans to Feed too would show the same information in two places with no clear differentiation — declined specifically to avoid that duplication. |
| 4 | **The richer stat line is computed via a render-time join to `ski_sessions`, not a schema change.** `ski_sessions` already has per-session `total_runs`/`vertical_ft`/`is_powder_day` (written via the existing "add your stats" flow, `updateSessionStats()`) — `getActivityFeed()` gains a second batched query resolving each `ski_session`-type entry's `subject_id` against `ski_sessions`, same pattern `getSkiBuddyPosts()`/`getBoardPosts()` already use to resolve `profiles` as a second query. | No schema change needed for data that already exists. Storing a stat snapshot in `activity_feed.metadata` at log time would also work but would go stale if a session's stats are edited later (`updateSessionStats` supports exactly that) — the join always reflects the current, correct numbers. |
| 5 | **No mini-map decoration.** The mockup shows an optional squiggly route-path graphic on session cards; it's pure decoration with no functional weight. | Not requested, not decided in brainstorming — a YAGNI call. Can be added later if wanted; nothing in this design blocks it. |
| 6 | **`trip_rsvp`/`trip_created` entries keep their current sentence-style copy unchanged.** The stat-line format only applies to `ski_session` entries. | The mockup's 2-item sample never shows a trip-type entry, so there's no mockup format to match for those types — same "don't invent, don't cut" reasoning as every prior slice's untouched-functionality carve-outs. |

## 3. The design

### 3.1 Card layout (`ActivityFeed.jsx`)

Restyles the existing `AccentCard` per-item render into the mockup's rhythm, keeping every
current piece of information:

```
┌──────────────────────────────────────────┐
│ (MR)  Maya Rivera                         │
│       Winter Park · 2h ago                │
│                                            │
│  18 runs · 24,300 ft · 🌨 powder day      │
│                                            │
│  [🎿] [❄️2] [🔥] [👑]                     │
└──────────────────────────────────────────┘
```

- **Header:** `Avatar` (unchanged), name, then a subtitle line combining resort (when known —
  `metadata.resort_name` for `ski_session`, absent for trip types) and `timeAgo(created_at)` —
  replacing the current single "{name} skied {resort}..." sentence line + a separate time-ago
  line below it.
- **Body:** for `ski_session` entries, the new stat line (§3.2) replaces the sentence-style
  `describe()` copy. For `trip_rsvp`/`trip_created`, the existing `describe()` sentence stays
  exactly as today (Decision 6) — these types render the same as they do now, just inside the
  restyled card shell.
- **Reactions row:** same 4 emoji buttons, same click handler, same data — restyled to sit
  under the stat line instead of under the sentence line (Decision 2).

### 3.2 Stat line (`ski_session` entries only)

New pure function, `formatSessionStat(session)` in `src/lib/format.js` (alongside the file's
existing formatters):

- Input: a `ski_sessions` row shape (`{ total_runs, vertical_ft, is_powder_day }`, all
  nullable/optional — a session with no manual stats logged has `total_runs`/`vertical_ft` as
  `null`).
- Output: a string joining whichever pieces are present with `" · "` — e.g.
  `"18 runs · 24,300 ft · 🌨 powder day"`, or just `"🌨 powder day"` if no runs/vertical were
  logged, or just the resort name (already shown in the header per §3.1) if nothing else is
  available. Numbers use `.toLocaleString("en-US")` (thousands separators), same fix already
  applied in the Leaderboard slice for the same reason.
- Tested in `src/lib/format.test.js` (already exists, 89 lines) — new cases: full stats present,
  partial (runs only, no powder flag), nothing but powder flag, completely empty (all null,
  returns empty string so the caller can omit the line entirely).

### 3.3 Data layer (`getActivityFeed()` in `socialApi.js`)

Extends the existing function with a second batched query, mirroring the established
resolve-as-a-second-query pattern:

```js
export async function getActivityFeed(limit = 30) {
  const { data, error } = await supabase
    .from("activity_feed")
    .select("*, profiles:actor_id(id, full_name, username, avatar_url)")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  const items = data || []
  if (!items.length) return items

  const sessionIds = items
    .filter((i) => i.type === "ski_session" && i.subject_id)
    .map((i) => i.subject_id)
  if (!sessionIds.length) return items

  const { data: sessions } = await supabase
    .from("ski_sessions")
    .select("id, total_runs, vertical_ft, is_powder_day")
    .in("id", sessionIds)

  const sm = new Map((sessions || []).map((s) => [s.id, s]))
  return items.map((i) => (i.type === "ski_session" ? { ...i, sessionStats: sm.get(i.subject_id) || null } : i))
}
```

`ActivityFeed.jsx` reads `item.sessionStats` and calls `formatSessionStat(item.sessionStats)`
when present; falls back to the existing `describe()` sentence copy when `sessionStats` is
`null` (a `ski_session` activity whose session was later deleted, or predates stat-tracking) —
no broken/blank card for that edge case.

## 4. Architecture

| File | Responsibility |
|---|---|
| `src/components/ActivityFeed.jsx` | *modify* — card layout restyle (§3.1); reads `item.sessionStats`, calls `formatSessionStat()` |
| `src/lib/format.js` | *modify* — new `formatSessionStat()` export (§3.2) |
| `src/lib/format.test.js` | *modify* — new test cases for `formatSessionStat()` |
| `src/lib/socialApi.js` | *modify (additive)* — `getActivityFeed()` gains the session-stats batched query (§3.3); return shape gains one optional field (`sessionStats`) on `ski_session`-type items, nothing else changes |
| `src/lib/leaderboardApi.js` | *unmodified* — `ski_sessions`' `total_runs`/`vertical_ft`/`is_powder_day` columns already exist and are already read elsewhere; no schema change |

## 5. Constraints inherited from the repo

- No new npm dependencies, no schema/migration for this slice.
- Inline `style={{}}` objects; colors via `var(--color-*)` tokens for anything semantic/stateful
  — this slice introduces no new hardcoded color (the existing per-type `typeAccent` literals in
  `ActivityFeed.jsx` are pre-existing, already-documented exceptions, not touched here).
- Re-verify the test/lint baseline in a fresh worktree at build time — last recorded (Leaderboard
  slice, 2026-08-31): 145 tests / 89 lint problems in a fresh worktree, both due for
  re-verification here.
- No subagent in this environment has browser or Supabase-auth tooling — every task, and the
  final whole-branch review, are verified via `npm test`/`npx eslint .`/`npm run build`/diff
  review only. Kyle does the real click-through after it ships, same as every prior slice.
- `ActivityFeed.jsx` is mounted in TWO places since TASK 22.5: the Crew tab's Feed sub-tab
  (`MessagingCenter.jsx`) and the Today tab's Friends section (`TodayScreen.jsx`). This restyle
  is not scoped to one call site — both surfaces get it, since it's the same unmodified
  component in both places.
- Ask before pushing to `main` — it auto-deploys to `powdays.app` live, no staging step.

## 6. Out of scope

- **Feed-B (comments)** and **Feed-C (photo attachments)** — separate future specs/plans, per
  Decision 1. Not designed here beyond having been identified as the next two pieces.
- **Group-level activity cards** — explicitly backlogged for a future sprint (Decision 1), not
  sequenced as Feed-D or otherwise scheduled yet.
- **A "plans" activity type** — declined (Decision 3); Feed stays activity-only.
- **Friends sub-tab redesign** — Feed-A doesn't touch it; Friends is still the last of the
  original 5 Crew sub-tab slices, sequenced after all of Feed-A/B/C.
- **Any change to `activity_feed_reactions`' schema, RLS, or the single-reaction-per-person
  behavior** — reused unmodified (Decision 2).
- **The mockup's mini-map decoration** — declined (Decision 5), can be revisited later.

## 7. Verification

No browser/Supabase-auth tooling is available to any subagent in this environment (standing
limitation, every prior slice). Verification is:

1. `formatSessionStat()` unit tests pass (`format.test.js`) — full/partial/empty stat
   combinations all produce the expected string, including the empty-string case.
2. `npm test` still passes at (or above) the fresh-worktree baseline captured at build time.
3. `npx eslint .` does not exceed the fresh-worktree baseline captured at build time.
4. `npm run build` succeeds.
5. Diff review confirms: `ski_session` entries show the new stat line when session stats exist
   and fall back to the existing sentence copy when `sessionStats` is `null`; `trip_rsvp`/
   `trip_created` entries are visually unchanged in content (only the surrounding card shell
   changed); the reactions row still reads/writes the exact same data via the exact same handler
   as before; both mount sites (`MessagingCenter.jsx`'s Feed sub-tab, `TodayScreen.jsx`'s Friends
   section) render the restyled component correctly.
6. Kyle does the real authenticated click-through after it ships (stat lines show real numbers
   for sessions with logged stats, reactions still work end to end, both mount sites look right
   on mobile) — same gate every prior slice has used.
