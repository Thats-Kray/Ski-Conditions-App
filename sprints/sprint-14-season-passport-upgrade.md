# Sprint 14 — Season Passport Upgrade

**Goal:** ROADMAP TASK 3.1 — add Total Runs / Top Speed / Time on Mountain tiles to Profile's `SeasonStatsCard`, a season-over-season delta row, and an All-time vs. Season toggle.
**Estimated effort:** 1 day
**Depends on:** `sprints/sprint-3-gps-tracker-hook.md` executed and its migration run — the new tiles read `runs_logged` and `time_on_mountain_min`, which only exist after `migrations/010_ski_runs.sql` runs. Sprint 8 (UI component library) merged, for `SnowStat`.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**`src/components/ProfilePage.jsx` (664 lines) — read in full before editing.**

**`computeStats(sessions)`** — local, non-exported helper, lines 31-46:
```js
// Roughly (read the exact current code before editing):
function computeStats(sessions) {
  return {
    days: sessions.length,
    vertical: sum(sessions, "vertical_feet"),
    miles: round1(sum(sessions, "miles_skied")),
    powderDays: sessions.filter(s => s.is_powder_day).length,
    resorts: new Set(sessions.map(s => s.resort_name)).size,
    topResort: mode(sessions.map(s => s.resort_name)),
  }
}
```
You are extending this function's return shape with 3 new fields — do not create a second, parallel stats-computation function.

**`SeasonStatsCard`** — lines 50-120, props `{ stats, season }`, currently renders a 2×2 grid: Days on Mountain, Vertical Feet, Resorts, Powder Days, plus a conditional bottom row for Top Resort + Miles Skied.

**`getCurrentSeason()`** (`src/lib/leaderboardApi.js` L6-13) — no args, returns `{ startYear, label }` (e.g. `{ startYear: 2025, label: "2025–26" }`), Oct–Apr season boundary.

**`getMySessions(startYear)`** (`src/lib/leaderboardApi.js` L51-145) — fetches the current user's `ski_sessions` rows for the given season (`Oct 1 startYear` to `May 31 startYear+1`), plus synthesizes entries from trip RSVPs/hosted trips in that range. This already works for "last season" too — just call it with `startYear - 1`.

**`getAllTimeStats` does not exist yet** in `leaderboardApi.js` (confirmed via full-file read) — this sprint adds it.

**`ski_sessions` columns needed for the 3 new tiles:** `runs_logged` (sprint-3), `top_speed_mph` (pre-existing), `time_on_mountain_min` (sprint-3). Older sessions logged before sprint-3/sprint-13 landed will have `null` for these — your aggregation must treat `null` as `0` for sums and skip `null` for max/top-speed (don't let one `null` collapse a `MAX` to `null` when other sessions have real data — this is a client-side JS reduction, not the SQL `MAX()` from sprint-12, so use `Math.max` over only the non-null values, defaulting to `null` if there are none).

---

## Tasks

S14-T1 (extend `computeStats`) has no dependency. S14-T2 (`getAllTimeStats`) has no dependency. S14-T3 (season-over-season delta) depends on S14-T1. S14-T4 (All-time toggle) depends on S14-T1 and S14-T2. Do S14-T1 and S14-T2 first, then T3/T4 can proceed in either order.

---

### S14-T1 — Extend `computeStats` with Total Runs, Top Speed, Time on Mountain

**File to modify:** `src/components/ProfilePage.jsx`

Add to the object `computeStats` returns:
```js
totalRuns: sessions.reduce((acc, s) => acc + (s.runs_logged || 0), 0),
topSpeed: sessions.reduce((max, s) => (s.top_speed_mph != null && (max == null || s.top_speed_mph > max) ? s.top_speed_mph : max), null),
timeOnMountain: sessions.reduce((acc, s) => acc + (s.time_on_mountain_min || 0), 0),
```

Add 3 tiles to `SeasonStatsCard`'s grid using `SnowStat` (from `./ui/SnowStat`, sprint-8) rather than a fourth hand-rolled tile markup — the existing 2×2 grid predates `SnowStat` and isn't being retrofit this sprint, but these 3 new tiles are new UI, so build them with the shared component:
```jsx
import SnowStat from "./ui/SnowStat"

<SnowStat icon="🎿" label="Total Runs" value={stats.totalRuns} />
<SnowStat icon="⚡" label="Top Speed" value={stats.topSpeed ?? "—"} unit={stats.topSpeed != null ? "mph" : undefined} />
<SnowStat icon="⏱️" label="Time on Mountain" value={formatMinutes(stats.timeOnMountain)} />
```
Write a small local `formatMinutes(mins)` helper: `` `${Math.floor(mins/60)}h ${mins%60}m` `` (or `"—"` if 0/null), placed alongside `computeStats` in this file.

**Acceptance criteria:**
- `computeStats([])` returns `totalRuns: 0`, `topSpeed: null`, `timeOnMountain: 0` — no crash on an empty season.
- A session with `runs_logged: null` (pre-migration data) contributes `0` to `totalRuns`, not `NaN`.
- `SeasonStatsCard` renders the 3 new tiles alongside the existing 4.

---

### S14-T2 — `getAllTimeStats(userId)`

**File to modify:** `src/lib/leaderboardApi.js`

```js
export async function getAllTimeStats(userId) {
  const { data, error } = await supabase
    .from("ski_sessions")
    .select("*")
    .eq("user_id", userId)
  if (error) throw error
  return data || []
}
```

This intentionally returns the **raw session rows**, not a pre-aggregated stats object — `ProfilePage.jsx` already has `computeStats(sessions)` (extended in S14-T1) and should reuse it for both season and all-time views rather than duplicating aggregation logic in two places. Note this function does **not** merge in trip-RSVP-derived synthetic sessions the way `getMySessions` does for a single season — an all-time view is simple/fast raw-table aggregation by design; if a user's "all-time" days count looks slightly lower than manually summing each season's `getMySessions` result, that's an accepted, documented trade-off (see Out of Scope), not a bug.

**Acceptance criteria:**
- `getAllTimeStats(userId)` returns every `ski_sessions` row for that user across all seasons, unfiltered by date.
- Calling `computeStats(await getAllTimeStats(user.id))` in `ProfilePage.jsx` produces a valid stats object with the same shape as the season view.

---

### S14-T3 — Season-over-season delta row

**File to modify:** `src/components/ProfilePage.jsx`

In the component that loads season stats (where `getMySessions(getCurrentSeason().startYear)` is currently called, ~line 348), add a parallel fetch for last season:
```js
const { startYear } = getCurrentSeason()
const [currentSessions, priorSessions] = await Promise.all([
  getMySessions(startYear),
  getMySessions(startYear - 1),
])
const currentStats = computeStats(currentSessions)
const priorStats = computeStats(priorSessions)
```
Store `priorStats` in a new state variable. In `SeasonStatsCard`, add a delta row below the stat tiles:
```jsx
{priorStats && (
  <div style={{ fontSize: 13, color: "var(--color-text-2)", marginTop: 8 }}>
    {stats.days === priorStats.days
      ? "Same days on mountain as last season"
      : stats.days > priorStats.days
        ? `↑ ${stats.days - priorStats.days} more day${stats.days - priorStats.days === 1 ? "" : "s"} than last season`
        : `↓ ${priorStats.days - stats.days} fewer day${priorStats.days - stats.days === 1 ? "" : "s"} than last season`}
  </div>
)}
```
Pass `priorStats` down as a new prop to `SeasonStatsCard` (`<SeasonStatsCard stats={currentStats} priorStats={priorStats} season={season} />`).

**Acceptance criteria:**
- A user with more days this season than last sees "↑ N more days than last season".
- A user with fewer sees "↓ N fewer days".
- A user with a tie sees "Same days on mountain as last season".
- A brand-new user with 0 days last season and 0 this season doesn't show a nonsensical delta — the tie case ("Same days…") already covers `0 === 0` correctly, no special-case needed.

---

### S14-T4 — All-time vs. Season toggle

**File to modify:** `src/components/ProfilePage.jsx`

Add a `viewMode` state (`"season" | "allTime"`, default `"season"`) and an `allTimeStats` state (lazily loaded — `null` until first switched to). Add a small toggle control above `SeasonStatsCard` (two buttons or a segmented control, matching the visual style of any existing toggle elsewhere in this file, e.g. the Calendar/List toggle from sprint-15 if that lands first, or `EditProfileModal`'s segmented Sport control as a style reference):

```jsx
function StatsViewToggle({ viewMode, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {["season", "allTime"].map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          style={{
            padding: "6px 14px", borderRadius: "var(--radius-pill)", border: "none", cursor: "pointer",
            background: viewMode === mode ? "var(--color-accent)" : "rgba(255,255,255,0.06)",
            color: viewMode === mode ? "var(--color-bg)" : "var(--color-text-2)",
            fontWeight: 700, fontSize: 13,
          }}
        >
          {mode === "season" ? "This Season" : "All-Time"}
        </button>
      ))}
    </div>
  )
}
```

Wire it so switching to `"allTime"` triggers (if not already loaded) `getAllTimeStats(currentUser.id).then((sessions) => setAllTimeStats(computeStats(sessions)))`, and `SeasonStatsCard` renders `viewMode === "allTime" ? allTimeStats : currentStats` as its `stats` prop. Hide the season-over-season delta row (S14-T3) while in all-time mode (the delta is season-specific and doesn't make sense against lifetime totals) — pass `priorStats={viewMode === "season" ? priorStats : null}`.

**Acceptance criteria:**
- Toggling to "All-Time" fetches and displays lifetime totals; toggling back to "This Season" shows the current-season numbers without re-fetching (cached in state).
- The season-over-season delta row is hidden while in All-Time mode.
- Loading state (e.g. a brief "Loading…" or the tiles just not updating until data arrives) doesn't crash or flash `NaN`/`undefined` — guard the render on `allTimeStats != null` before showing all-time numbers.

**Verify in browser (do this once, after all 4 tasks are in):**
```bash
npm run dev
```
Open Profile. Confirm: 7 stat tiles total (4 original + 3 new), a season-over-season delta line, and a working All-Time/This Season toggle.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add src/components/ProfilePage.jsx src/lib/leaderboardApi.js
git commit -m "feat: season passport upgrade — new stat tiles, season delta, all-time toggle"
```

---

## Sprint Acceptance Criteria

- [ ] `SeasonStatsCard` shows Total Runs, Top Speed, Time on Mountain tiles in addition to the existing 4
- [ ] A season-over-season delta row renders correctly for more/fewer/same days
- [ ] `getAllTimeStats(userId)` exists in `leaderboardApi.js` and returns all of a user's `ski_sessions` rows
- [ ] An All-Time / This Season toggle switches the displayed stats, hiding the delta row in All-Time mode
- [ ] `npm run build` succeeds
- [ ] Verified in browser

## Out of Scope for This Sprint

- Merging trip-RSVP-derived synthetic sessions into the all-time view the way `getMySessions` does per-season — all-time is raw `ski_sessions` aggregation only, a documented simplification.
- Any change to `RecentSessionsFeed` (sprint-15 handles session history display changes).
- Season-over-season deltas for any stat besides `days` — only the days comparison is built this sprint; extending the pattern to vertical/runs/etc. is a natural follow-up, not required here.
</content>
