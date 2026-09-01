# Crew Tab — Feed Sub-Tab Slice A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Crew tab's Feed sub-tab (`ActivityFeed.jsx`) to match the mockup — a card with an avatar/name/"resort · time-ago" header, a richer stat line for logged ski sessions ("18 runs · 24,300 ft · 🌨 powder day"), and a restyled reactions row under a divider — while every existing piece of information and every existing behavior (the 4-emoji single-reaction-per-person row, trip entry copy, the per-type accent colors, the loading/empty states) keeps working exactly as it does today.

**Architecture:** Three files, no new file, no schema change, no migration. `src/lib/format.js` gains one pure exported function, `formatSessionStat()`, unit-tested in the existing `format.test.js`. `src/lib/socialApi.js`'s `getActivityFeed()` gains a second batched query resolving each `ski_session` entry's `subject_id` against `ski_sessions` — the same resolve-as-a-second-query pattern `getSkiBuddyPosts()`/`getBoardPosts()` already use for `profiles` — attaching one new optional field, `sessionStats`, to `ski_session`-type items only. `ActivityFeed.jsx` consumes both in its per-item render. Comments, photo attachments, and group-level cards are explicitly out of scope (Feed-B / Feed-C / backlog).

**Tech Stack:** React 19 (inline styles, no CSS framework), Supabase (Postgres), `node --test` for pure-logic unit tests (`npm test` runs `node --test src/lib/*.test.js`).

## ⚠️ Spec correction the implementer must apply (read before Task 1)

The design spec's §3.3 sample query selects `total_runs, vertical_ft, is_powder_day` from `ski_sessions`. **Two of those three column names do not exist on that table.** The real schema is:

| Spec says | Actual `ski_sessions` column | Evidence |
|---|---|---|
| `total_runs` | **`runs_logged`** (`INT DEFAULT 0`) | `migrations/010_ski_runs.sql:6` |
| `vertical_ft` | **`vertical_feet`** (`int`, nullable) | `supabase/migrations/20260515_ski_sessions.sql:16` |
| `is_powder_day` | `is_powder_day` (`boolean not null default false`) — correct as written | `supabase/migrations/20260515_ski_sessions.sql:11` |

`total_runs` and `vertical_ft` are real names *elsewhere*: `total_runs` is the `get_leaderboard` RPC's aggregate output alias (`migrations/011_leaderboard_rpc_v2.sql:18`, consumed at `leaderboardApi.js:229`) and `vertical_ft` is `ski_runs`' per-segment column (`migrations/010_ski_runs.sql:25`). Neither is a `ski_sessions` column. The app's own "add your stats" flow writes `runs_logged`/`vertical_feet` (`SessionStatsForm.jsx:22-24`, `SessionEditForm.jsx:60-62`).

**This changes nothing about the spec's Decision 4** (render-time join to `ski_sessions`, no schema change, no stat snapshot in `activity_feed.metadata`) — only the literal identifiers. Use the corrected names everywhere. Selecting the spec's names would return a PostgREST error, and because the spec's sample code discards the second query's `error`, the failure would be **silent**: `sessionStats` would be `null` on every item and every card would fall back to its old sentence copy forever, with nothing in the console. Task 1 Step 5 adds a `console.warn` specifically so that class of failure is visible.

## Global Constraints

- No new npm dependencies, no schema/migration for this slice.
- Inline `style={{}}` objects; colors via `var(--color-*)` tokens for anything semantic/stateful — this slice introduces no new hardcoded color. (The existing per-type `typeAccent` literals `#fb923c`/`#a78bfa` in `ActivityFeed.jsx:70` are pre-existing, already-documented exceptions and are carried over verbatim, not re-decided here.)
- Re-verify the `npm test`/`npx eslint .` baseline in the fresh worktree before starting — **do not trust this cited number**: last recorded was 145 tests / 89 lint problems (Leaderboard slice, 2026-08-31). Counts drift between sessions and `main`'s own lint count runs persistently higher than a fresh worktree's true baseline. Record the numbers you actually observe and compare against those.
- No subagent in this environment has browser or Supabase-auth tooling. Every task is verified via `npm test`/`npx eslint .`/`npm run build`/diff review only — say so plainly in each task's report, don't imply a browser check happened.
- `ActivityFeed.jsx` is mounted in **TWO** places: the Crew tab's Feed sub-tab (`src/components/MessagingCenter.jsx:199`) and the Today tab's Friends section (`src/components/TodayScreen.jsx:760`, added by TASK 22.5). This restyle affects both surfaces automatically — it is the same unmodified component in both places, and neither call site passes props. Do not scope anything to one call site.
- Follow existing patterns exactly where one already exists (see each task's "Consumes" — these are real, already-in-the-codebase functions, not to be reimplemented).
- Ask before pushing to `main` — it auto-deploys to `powdays.app` live, no staging step. This plan's execution stays on a worktree branch; pushing/merging to `main` happens only after Kyle signs off.

---

## File Structure

| File | Change |
|---|---|
| `src/lib/format.js` | *modify* — new `formatSessionStat()` export, appended alongside the file's existing formatters |
| `src/lib/format.test.js` | *modify* — 12 new `formatSessionStat()` cases; the `./format.js` import line gains one name |
| `src/lib/socialApi.js` | *modify (additive)* — `getActivityFeed()` (lines 3900-3908) gains the batched `ski_sessions` lookup; return shape gains one optional field (`sessionStats`) on `ski_session`-type items, nothing else changes |
| `src/components/ActivityFeed.jsx` | *modify* — card layout restyle; reads `item.sessionStats`, calls `formatSessionStat()`; reactions row restyled (visual only) |
| `src/components/MessagingCenter.jsx`, `src/components/TodayScreen.jsx` | *unmodified* — both mount `<ActivityFeed />` with no props and inherit the restyle |
| `migrations/`, `supabase/migrations/` | *unmodified* — `runs_logged`/`vertical_feet`/`is_powder_day` already exist; no schema change |

---

### Task 1: `formatSessionStat()` + the `getActivityFeed()` session-stats join

Both halves of the data path live in one task on purpose: `formatSessionStat()`'s expected input shape and the `SELECT` that produces it must use the same column names, and that consistency is the single highest-risk point in this slice (see the Spec correction section above). One reviewer sees both.

**Files:**
- Modify: `src/lib/format.js` (append after `snapToQuarterHour`, currently ends at line 92)
- Modify: `src/lib/format.test.js` (import line 3; append tests after line 89)
- Modify: `src/lib/socialApi.js:3900-3908` (`getActivityFeed`)

**Interfaces:**
- Consumes: `supabase` (already imported at the top of `socialApi.js`). Nothing from another task.
- Produces:
  - `formatSessionStat(session) => string` where `session` is a `ski_sessions` row shape `{ runs_logged?: number|string|null, vertical_feet?: number|string|null, is_powder_day?: boolean }`, or `null`/`undefined`. Returns `""` when there is nothing to show — never `null`, so Task 2 can use a plain `||` fallback.
  - `getActivityFeed(limit = 30) => Promise<Array>` — unchanged shape except that items with `type === "ski_session"` gain `sessionStats: { id, runs_logged, vertical_feet, is_powder_day } | null`. Items of any other type are returned byte-identical to today (no `sessionStats` key at all). Task 2 reads `item.sessionStats` and `item.metadata.resort_name`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/format.test.js`, change line 3 from:

```js
import { etaToTimeInput, snapToQuarterHour, formatEtaShort } from "./format.js"
```

to:

```js
import { etaToTimeInput, snapToQuarterHour, formatEtaShort, formatSessionStat } from "./format.js"
```

Then append at the end of the file (after the current last test, line 89):

```js
// ── formatSessionStat ────────────────────────────────────────────────────────
// Column names are ski_sessions' real ones: runs_logged and vertical_feet.
// (total_runs / vertical_ft are the get_leaderboard RPC's aggregate alias and
// ski_runs' per-segment column — neither exists on ski_sessions.)
// Number formatting is pinned to "en-US" in the implementation, so these exact
// strings are deterministic on any full-ICU Node build (the default).

test("formatSessionStat renders runs, vertical and the powder flag in the mockup's order", () => {
  assert.equal(
    formatSessionStat({ runs_logged: 18, vertical_feet: 24300, is_powder_day: true }),
    "18 runs · 24,300 ft · 🌨 powder day"
  )
})

test("formatSessionStat thousands-separates a six-figure vertical", () => {
  assert.equal(formatSessionStat({ vertical_feet: 124300 }), "124,300 ft")
})

test("formatSessionStat renders runs and vertical without a powder flag", () => {
  assert.equal(
    formatSessionStat({ runs_logged: 12, vertical_feet: 18500, is_powder_day: false }),
    "12 runs · 18,500 ft"
  )
})

test("formatSessionStat renders runs alone when no vertical was entered", () => {
  assert.equal(formatSessionStat({ runs_logged: 9, vertical_feet: null, is_powder_day: false }), "9 runs")
})

test("formatSessionStat renders vertical alone when no runs were entered", () => {
  assert.equal(formatSessionStat({ runs_logged: null, vertical_feet: 8200, is_powder_day: false }), "8,200 ft")
})

test("formatSessionStat renders the powder flag alone when nothing else was entered", () => {
  assert.equal(formatSessionStat({ runs_logged: null, vertical_feet: null, is_powder_day: true }), "🌨 powder day")
})

test("formatSessionStat omits a zero run count rather than rendering \"0 runs\"", () => {
  // runs_logged is `INT DEFAULT 0` (migration 010), so a session whose owner
  // never opened the stats form reads 0, not null. Zero is "not logged here".
  assert.equal(formatSessionStat({ runs_logged: 0, vertical_feet: null, is_powder_day: true }), "🌨 powder day")
  assert.equal(formatSessionStat({ runs_logged: 0, vertical_feet: 0, is_powder_day: false }), "")
})

test("formatSessionStat uses the singular for exactly one run", () => {
  assert.equal(formatSessionStat({ runs_logged: 1 }), "1 run")
})

test("formatSessionStat returns an empty string for a session with no stats at all", () => {
  assert.equal(formatSessionStat({ runs_logged: null, vertical_feet: null, is_powder_day: false }), "")
  assert.equal(formatSessionStat({}), "")
})

test("formatSessionStat returns an empty string for a missing session", () => {
  // The caller passes item.sessionStats straight through; that is null for a
  // ski_session activity whose session row was later deleted.
  assert.equal(formatSessionStat(null), "")
  assert.equal(formatSessionStat(undefined), "")
})

test("formatSessionStat formats numerics that arrive as strings", () => {
  // PostgREST hands back numeric/int8 columns as strings in some shapes; the
  // formatter coerces rather than emitting "NaN ft".
  assert.equal(formatSessionStat({ runs_logged: "18", vertical_feet: "24300" }), "18 runs · 24,300 ft")
})

test("formatSessionStat rounds a fractional vertical to whole feet", () => {
  assert.equal(formatSessionStat({ vertical_feet: 24300.6 }), "24,301 ft")
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx --node-options= node --test src/lib/format.test.js`
Expected: FAIL — `formatSessionStat is not a function` (it isn't exported from `format.js` yet).

- [ ] **Step 3: Implement `formatSessionStat`**

Append to the end of `src/lib/format.js` (after `snapToQuarterHour`, which currently ends at line 92):

```js
/**
 * A ski_sessions row's stats as one display line: "18 runs · 24,300 ft · 🌨 powder day".
 *
 * Uses ski_sessions' real column names — `runs_logged` and `vertical_feet`, exactly what
 * SessionStatsForm and SessionEditForm write. (`total_runs` is the get_leaderboard RPC's
 * aggregate alias and `vertical_ft` is ski_runs' per-segment column; neither is a column
 * on ski_sessions, and selecting either would error.)
 *
 * `runs_logged` is `INT DEFAULT 0` (migration 010), so a session whose owner never opened
 * the stats form reads 0, not null — 0 is treated as "not logged" and omitted, otherwise
 * every untouched session would advertise "0 runs".
 *
 * Returns "" rather than null when there is nothing to show, so callers can fall back with
 * a plain `||` and omit the line entirely instead of rendering an empty element.
 */
export function formatSessionStat(session) {
  if (!session) return ""

  const parts = []

  const runs = Number(session.runs_logged)
  if (Number.isFinite(runs) && runs > 0) {
    parts.push(`${Math.round(runs).toLocaleString("en-US")} ${Math.round(runs) === 1 ? "run" : "runs"}`)
  }

  const vertical = Number(session.vertical_feet)
  if (Number.isFinite(vertical) && vertical > 0) {
    parts.push(`${Math.round(vertical).toLocaleString("en-US")} ft`)
  }

  if (session.is_powder_day) parts.push("🌨 powder day")

  return parts.join(" · ")
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx --node-options= node --test src/lib/format.test.js`
Expected: all PASS, including the 12 new cases.

- [ ] **Step 5: Extend `getActivityFeed` with the session-stats join**

In `src/lib/socialApi.js`, find (currently lines 3900-3908):

```js
export async function getActivityFeed(limit = 30) {
  const { data, error } = await supabase
    .from("activity_feed")
    .select("*, profiles:actor_id(id, full_name, username, avatar_url)")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}
```

Replace with:

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

  // Session stats are resolved as a second batched query rather than embedded,
  // the same resolve-as-a-second-query pattern getSkiBuddyPosts/getBoardPosts
  // already use for profiles. Read-time, not a snapshot in activity_feed.metadata:
  // updateSessionStats lets a user edit a day's numbers afterwards, and a snapshot
  // would go stale the moment they did.
  const sessionIds = items
    .filter((i) => i.type === "ski_session" && i.subject_id)
    .map((i) => i.subject_id)
  if (!sessionIds.length) return items

  // These are ski_sessions' real column names. `runs_logged` comes from migration
  // 010; `vertical_feet`/`is_powder_day` from the base table. `total_runs`/`vertical_ft`
  // exist only as the get_leaderboard RPC's aggregate alias and as ski_runs' per-segment
  // column — selecting either name here would fail the request.
  const { data: sessions, error: sessionErr } = await supabase
    .from("ski_sessions")
    .select("id, runs_logged, vertical_feet, is_powder_day")
    .in("id", sessionIds)

  // Non-fatal by design: a failed stat lookup degrades ski_session cards to their
  // existing sentence copy instead of blanking the whole feed. Warned rather than
  // discarded, because a silently-empty result is indistinguishable from "nobody has
  // logged stats yet" — which is exactly how a wrong column name would hide.
  if (sessionErr) {
    console.warn("getActivityFeed session stats lookup failed", sessionErr)
    return items
  }

  const byId = new Map((sessions || []).map((s) => [s.id, s]))
  return items.map((i) =>
    i.type === "ski_session" ? { ...i, sessionStats: byId.get(i.subject_id) || null } : i
  )
}
```

Note what is deliberately *not* changed: `logActivity`, `logActivityOnce` (line 3874), `getActivityReactions` (line 3910) and `addActivityReaction` (line 3920) are all untouched by this slice. `activity_feed.metadata` keeps storing only `resort_name`/`is_powder_day` at log time (`App.jsx:692`, `LeaderboardPage.jsx:59`) — no new metadata is written.

- [ ] **Step 6: Verify the column names against the schema, not against the spec**

Run: `grep -rn "total_runs\|vertical_ft\b" src/lib/socialApi.js`
Expected: **zero matches**. Any hit means a spec-literal column name survived into the query.

Run: `grep -rn "runs_logged\|vertical_feet" supabase/migrations/20260515_ski_sessions.sql migrations/010_ski_runs.sql`
Expected: `vertical_feet    int` in the first file, `runs_logged          INT     DEFAULT 0` in the second — confirming both selected columns exist.

Run: `grep -rn "getActivityFeed" src/`
Expected: exactly two matches — the definition in `src/lib/socialApi.js` and the single call site in `src/components/ActivityFeed.jsx` (its import and its `getActivityFeed(30)` call). No other consumer's return shape is affected.

- [ ] **Step 7: Run the full suite, build, and lint**

Run: `npm test`
Expected: fresh-worktree baseline + 12 (this task's new `format.test.js` cases). No pre-existing test changes status.

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint .`
Expected: at or below the fresh-worktree baseline recorded before this task started.

- [ ] **Step 8: Commit**

```bash
git add src/lib/format.js src/lib/format.test.js src/lib/socialApi.js
git commit -m "feat: add formatSessionStat and join session stats into the activity feed"
```

---

### Task 2: `ActivityFeed.jsx` card restyle

**Files:**
- Modify: `src/components/ActivityFeed.jsx` — the import on line 5, and the render block on lines 62-104 (the `<div>` wrapper plus the whole `items.map(...)` body). Everything above line 61 (`TYPE_COPY`, `EMOJIS`, all four `useState`s, the `useEffect` fetch, `handleReact`, the loading and empty returns) is untouched.

**Interfaces:**
- Consumes: `formatSessionStat(session) => string` from Task 1 (`src/lib/format.js`) — returns `""` for a null/empty session, never `null`. `item.sessionStats` from Task 1's `getActivityFeed()` — present only on `ski_session` items, `null` when the session row is gone. Plus already-existing pieces this task does not change: `Avatar` (`src/components/ui/Avatar.jsx`, props `profile` + `size`; it already handles a null `profile` by falling back to `"?"`), `AccentCard` (`src/components/ui/AccentCard.jsx`, props `accentColor` + `children`), `timeAgo` and `resortName`.
- Produces: nothing consumed by a later task — this is the last content task before final review.

- [ ] **Step 1: Add `formatSessionStat` to the format import**

In `src/components/ActivityFeed.jsx`, change line 5 from:

```js
import { timeAgo } from "../lib/format"
```

to:

```js
import { timeAgo, formatSessionStat } from "../lib/format"
```

Leave lines 1-4 and 6 (the `useState`/`useEffect`, `socialApi`, `Avatar`, `AccentCard`, `resorts` imports) exactly as they are.

- [ ] **Step 2: Replace the render block**

Find the entire return block, currently lines 61-105 — from `return (` on line 61 through the closing `)` on line 105. Replace it with:

```jsx
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
      {items.map((item) => {
        const actorName = item.profiles?.full_name || item.profiles?.username || "Someone"
        const describe = TYPE_COPY[item.type]
        const itemReactions = reactions[item.id] || []
        // trip_created/default accents have no exact :root token match — left literal as
        // per-type decorative differentiators (rule 5), same precedent as MountainBoard.jsx's
        // CATEGORY_COLORS social/general entries (Task 7).
        const typeAccent = item.type === "ski_session" ? "var(--color-accent)" : item.type === "trip_created" ? "#fb923c" : "#a78bfa"

        // Header subtitle: resort then time-ago, replacing the standalone time-ago line
        // that used to sit under the sentence. Resort is ski_session-only — trip_created
        // already names its resort inside its own sentence copy, and trip_rsvp has none.
        const resortLabel = item.type === "ski_session" && item.metadata?.resort_name
          ? resortName(item.metadata.resort_name)
          : ""
        const subtitle = [resortLabel, timeAgo(item.created_at)].filter(Boolean).join(" · ")

        // Body: the joined stat line for ski_session entries, the existing sentence copy
        // for everything else. formatSessionStat returns "" both when sessionStats is null
        // (session deleted, or logged before stats were tracked) and when the row holds
        // nothing worth showing, so a single `||` covers both fallbacks and no card is
        // ever left blank.
        const sentence = describe ? describe(actorName, item.metadata) : `${actorName} did something`
        const statLine = item.type === "ski_session" ? formatSessionStat(item.sessionStats) : ""
        const bodyLine = statLine || sentence

        return (
          <AccentCard key={item.id} accentColor={typeAccent}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar profile={item.profiles} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--color-text-1)" }}>{actorName}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {subtitle}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-1)", lineHeight: 1.4, marginTop: 10 }}>
              {bodyLine}
            </div>

            <div style={{ display: "flex", gap: 6, marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {EMOJIS.map((emoji) => {
                const count = itemReactions.filter((r) => r.emoji === emoji).length
                const mine = itemReactions.some((r) => r.user_id === currentUserId && r.emoji === emoji)
                return (
                  <button
                    key={emoji}
                    onClick={() => handleReact(item.id, emoji)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
                      borderRadius: "var(--radius-pill)", border: "none", cursor: "pointer", fontSize: 13,
                      background: mine ? "var(--color-accent)" : "rgba(255,255,255,0.06)",
                      color: mine ? "var(--color-bg)" : "var(--color-text-2)",
                    }}
                  >
                    {emoji}
                    {count > 0 && <span style={{ fontSize: 11, fontWeight: 700 }}>{count}</span>}
                  </button>
                )
              })}
            </div>
          </AccentCard>
        )
      })}
    </div>
  )
```

What changed vs. what stayed, on purpose:

- **New:** the header row (`Avatar` + bold actor name + a "resort · 2h ago" subtitle), matching the mockup's card rhythm. The card's outer list gap goes 8 → 12, matching the mockup's `gap:12px`.
- **New:** the `bodyLine` — a stat line for `ski_session` entries with stats, the old sentence otherwise.
- **Moved, not removed:** the time-ago, which used to be its own line under the sentence and now shares the header subtitle. The actor name, which used to be embedded in the sentence and is now its own header line (for `ski_session` cards showing a stat line, the sentence no longer renders, so the name would otherwise be lost).
- **Restyled only, behavior identical:** the reactions row. Same `EMOJIS` array, same `handleReact(item.id, emoji)` handler, same `count`/`mine` derivation, same colors (`var(--color-accent)` / `var(--color-bg)` when active, `rgba(255,255,255,0.06)` / `var(--color-text-2)` otherwise), same `count > 0` badge. Only the padding, font sizes, gap, and the new divider above it changed. No reaction data, query, or upsert behavior is touched anywhere in this slice.
- **Unchanged:** `TYPE_COPY` (so `trip_rsvp`/`trip_created` copy is byte-identical, per Decision 6), `EMOJIS`, `typeAccent`, `AccentCard`'s accent bar, the loading and empty-state returns, and the entire data-fetch/`handleReact` half of the component above line 61.
- **Not added:** the mockup's mini-map decoration (Decision 5), the kudos-count/Comment buttons (Feed-B), photo attachments (Feed-C), and group cards (backlog). None of them appear in this JSX.

- [ ] **Step 3: Verify both mount sites and the removed pieces**

Run: `grep -rn "ActivityFeed" src/`
Expected: the component itself, plus `MessagingCenter.jsx:8` + `:199` and `TodayScreen.jsx:10` + `:760`. Both mount `<ActivityFeed />` with no props — confirm this task added no required prop, since either call site would break silently otherwise.

Run: `grep -n "TYPE_COPY\|EMOJIS\|handleReact\|resortName\|timeAgo" src/components/ActivityFeed.jsx`
Expected: every one of these still has both its definition/import and at least one use — no import left dangling and no helper accidentally orphaned by the rewrite.

- [ ] **Step 4: Build and lint**

Run: `npm run build`
Expected: succeeds with no errors and no unused-import warnings.

Run: `npx eslint .`
Expected: at or below the fresh-worktree baseline recorded before Task 1 started.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: unchanged from Task 1's count (this task is pure JSX/presentation, adding no new `src/lib` logic — consistent with this component having no unit tests today, same as `SkiBuddyBoard.jsx`/`LeaderboardPage.jsx` before their slices).

- [ ] **Step 6: Diff self-check**

Run: `git diff src/components/ActivityFeed.jsx`
Confirm all of the following in the diff:
- `handleReact` is still wired to every emoji button with the same two arguments (`item.id`, `emoji`) — the reactions restyle is visual only.
- No diff hunk touches lines 1-4, 8-13 (`TYPE_COPY`/`EMOJIS`), 16-19 (state), 21-40 (`useEffect`), 42-56 (`handleReact`), or 58-59 (loading/empty returns).
- `TYPE_COPY`'s three entries are character-for-character unchanged.
- `item.sessionStats` is read only under an `item.type === "ski_session"` guard, so a trip item can never take the stat-line path.

- [ ] **Step 7: Commit**

```bash
git add src/components/ActivityFeed.jsx
git commit -m "feat: restyle activity feed cards with header, stat line and reactions row"
```

---

### Task 3: Whole-branch final review + fix wave

Dispatch a review of the full branch diff (both implementation tasks combined) on the most capable available model, per the project's established pattern — this step has caught real cross-task bugs in every prior TASK 22.0 slice (a stale-state save bug and two offseason-data bugs in the Today List slice; a z-index/hitbox/tier-mismatch trio in the Today Map slice; 4 bugs including a tab-switch-killed realtime subscription in the Crews slice; 2 mobile-layout regressions in the Board slice, one of which a per-task reviewer had wrongly adjudicated as "pre-existing"; number-formatting and default-tab bugs in the Leaderboard slice).

- [ ] **Step 1: Review the full diff**

Review `git diff main...HEAD` (the whole branch, not per-task diffs) against `docs/superpowers/specs/2026-09-01-crew-tab-feed-slice-a-design.md` in full, **plus this plan's "Spec correction" section** — the spec's §3.3 code block is known-wrong on two column names, so a reviewer comparing the diff to the spec verbatim would "find" a false positive there. Specifically check for:

- **Column names, the top risk in this slice:** the `ski_sessions` select uses `runs_logged`/`vertical_feet`/`is_powder_day`, and `formatSessionStat` reads those same three property names. Re-derive them from the schema files (`supabase/migrations/20260515_ski_sessions.sql`, `migrations/010_ski_runs.sql`), not from the spec. A mismatch here produces a feature that looks fine in every test and never renders a single stat line in production.
- **Silent-failure surface:** the second query's `error` is checked and warned, not discarded; a failed or empty stat lookup still returns the full feed rather than throwing or blanking it.
- **Fallback correctness:** a `ski_session` item with `sessionStats: null`, with an all-null stats row, and with `runs_logged: 0` and `is_powder_day: false` all fall back to the existing sentence copy rather than rendering an empty body line. Trace each of the three cases through `bodyLine`.
- **No dropped information:** compare the pre-slice card to the post-slice card field by field. Actor name, resort, time-ago, powder indication, and the 4-emoji reaction row with counts are all still on screen for a `ski_session` entry; `trip_rsvp`/`trip_created` entries show exactly the copy they showed before (Decision 6) inside the new card shell.
- **Reactions are visual-only:** no change to `activity_feed_reactions` schema, RLS, `getActivityReactions`, `addActivityReaction`, the optimistic-update logic in `handleReact`, or the one-active-reaction-per-person behavior (Decision 2). Confirm from the diff that `socialApi.js`'s only changed function is `getActivityFeed`.
- **Nothing out of scope crept in:** no comment UI, no photo attachment, no group-level card, no "plans" activity type, no mini-map decoration, no `activity_feed.metadata` write change, no migration file added or edited.
- **Row layout at real widths:** the subtitle ("Winter Park · 2h ago") is clipped with `textOverflow: "ellipsis"`, but the stat line ("18 runs · 24,300 ft · 🌨 powder day") is not. Do the same rough arithmetic prior slices' reviews did — at ~375px viewport, minus the card's padding (12 each side), `AccentCard`'s 3px accent border, and any parent padding — and check whether a long stat line wraps acceptably or crowds. Two mobile-layout regressions shipped from the Board restyle, so give this real attention rather than assuming a 13px string is safe.
- **Both mount sites:** `MessagingCenter.jsx:199` (Crew tab's Feed sub-tab) and `TodayScreen.jsx:760` (Today tab's Friends section, from TASK 22.5) both still render correctly. Neither passes props, so confirm the component still requires none, and sanity-check that the taller card (header + body + divider + reactions) doesn't break `TodayScreen`'s section layout, which sits inside a scrolling page rather than a dedicated tab pane.
- **This slice introduces no realtime subscription and no schema change** — confirm both are still true against the final diff.
- **Test/lint baseline:** `npm test` and `npx eslint .` are at or better than the fresh-worktree baseline recorded before Task 1 started, with `npm test` up by exactly the 12 new `format.test.js` cases.

- [ ] **Step 2: Fix any findings**

Apply fixes for anything the review surfaces, in a single consolidated fix-wave commit (not one commit per finding), same pattern as every prior slice's fix wave. Re-run `npm test`/`npx eslint .`/`npm run build` after fixing.

- [ ] **Step 3: Commit the fix wave (only if there were findings)**

```bash
git add -A
git commit -m "fix: final-review fix wave — Feed sub-tab slice A"
```

- [ ] **Step 4: Report final state**

Record in the task report: final `npm test` pass count, final `npx eslint .` problem count, the spec-vs-schema column-name correction (so it can be folded back into the spec or noted in ROADMAP.md), and an explicit statement that no subagent in this build had browser/Supabase-auth tooling — verification was tests/lint/build/diff-review only, and Kyle needs to do the real authenticated click-through (stat lines showing real numbers for sessions with logged stats, reactions still working end to end, both mount sites looking right on mobile) before this is considered fully verified, same standing gap as every prior slice.

---

## Self-Review Notes (for the plan author, already applied above)

- **Spec coverage:** §3.1 (card layout: header, subtitle, body, reactions row placement) → Task 2 Step 2. §3.2 (`formatSessionStat` in `format.js`, `" · "` join, `toLocaleString("en-US")`, the four named test cases — full / partial / powder-only / empty-string) → Task 1 Steps 1-4, which cover all four plus eight more. §3.3 (`getActivityFeed`'s batched join, `sessionStats` field, null fallback) → Task 1 Steps 5-6 and Task 2's `bodyLine`. §4's architecture table → this plan's File Structure, same five rows plus the two unmodified mount sites. §5's constraints → Global Constraints, verbatim. §6's out-of-scope list → Task 2 Step 2's "Not added" note and Task 3's "nothing out of scope crept in" review item. §7's 6 verification steps → §7.1 in Task 1 Step 4, §7.2-7.4 in both tasks' build/lint/test steps, §7.5 in Task 3 Step 1, §7.6 in Task 3 Step 4.
- **One deliberate deviation, documented:** the spec's §3.3 column names `total_runs`/`vertical_ft` do not exist on `ski_sessions`; the plan uses `runs_logged`/`vertical_feet` instead. Decision 4's substance (render-time join, no schema change, no metadata snapshot) is preserved exactly. Flagged in a dedicated section at the top, in Task 1's inline comments, in Task 1 Step 6's grep, and as Task 3's first review item.
- **One small addition beyond the spec's letter:** `formatSessionStat` treats `runs_logged: 0` as "not logged" and singularizes "1 run". Both fall out of the schema (`INT DEFAULT 0` means untouched sessions read 0, and "1 runs" would ship on any real one-run day); neither changes the spec's output format for the cases it does specify.
- **Type consistency checked:** Task 1 defines `formatSessionStat(session) => string` returning `""` (never `null`) for absent/empty input; Task 2 relies on exactly that with `statLine || sentence`. Task 1's select list (`id, runs_logged, vertical_feet, is_powder_day`) matches the three property names `formatSessionStat` reads plus the `id` its `Map` keys on. `sessionStats` is spelled identically in Task 1's `items.map` and Task 2's `item.sessionStats`. `item.metadata?.resort_name` in Task 2 matches what `logActivityOnce("ski_session", ...)` actually writes at `App.jsx:692-698` and `LeaderboardPage.jsx:59-63`.
- **No placeholders:** every step has complete, real code — no "add appropriate styling", no deferred detail, no cross-task "same as above".
