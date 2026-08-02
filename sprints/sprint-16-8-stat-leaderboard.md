# Sprint 16 — 8-Stat Leaderboard Expansion

**Goal:** ROADMAP TASK 4.1 — expand `LeaderboardPage.jsx`'s stat-tab switcher from 5 tabs (2 of them locked/fake) to 8 real, sortable stats, and unlock the currently-fake-locked Vertical/Miles tabs now that real data flows through them.
**Estimated effort:** 1 day
**Depends on:** Sprint 12 (Leaderboard RPC v2) merged and its migration run — this sprint's new tabs read `topSpeed`, `longestRun`, `totalLifts`, `timeOnMountain`, all added to the RPC response in sprint-12.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**`src/components/LeaderboardPage.jsx` (354 lines) — read in full before editing.**

**Current `CATEGORIES` array** (lines 15-21) — this IS the existing stat-tab switcher, already present, just smaller and 2 tabs are fake-locked:
```js
const CATEGORIES = [
  { key: "days",       label: "🎿 Days",         /* ... */ },
  { key: "resorts",    label: "🏔️ Resorts",      /* ... */ },
  { key: "powderDays", label: "❄️ Powder Days",  /* ... */ },
  { key: "vertical",   label: "↕️ Vertical",     locked: true, /* ... */ },
  { key: "miles",      label: "🛣️ Miles",        locked: true, /* ... */ },
]
```
`vertical` and `miles` are marked `locked: true` and show a "Strava integration coming soon" notice (lines 318-325) — **even though the underlying data has been real and available since before this sprint** (the lock is a pure UI flag, not a real data gap; `verticalFt`/`milesSki` have been returned by `get_leaderboard` all along). This sprint removes those locks now that sprint-12/sprint-13 make the broader stat set (including the 4 brand-new ones) genuinely real and populated.

**`LeaderboardRow`** (lines 129-178) renders: rank/medal, avatar, name, `isMe` "YOU" badge, `topResort` subtitle, and one stat value (via `cat.stat(entry)`) switched by the active category. Sorting (`entries` sorted client-side by the active category's `stat`, lines 200-201) happens on every `load()`.

**Deviation from ROADMAP's literal wording, explained:** ROADMAP TASK 4.1 lists the new tab set loosely as "Days | Vertical | Speed | Distance | Time" and separately says "Currently tracks: days, resorts, powder days, vertical, miles. Add: top speed, longest run, most lifts, time on mountain" — read literally that's 9 stats, not 8, despite the section being titled "8-stat leaderboard." This plan drops **`resorts`** as a leaderboard *tab* (it stays visible as each row's existing `topResort` subtitle context, just not a separate sortable ranking) to land on exactly 8 real competitive stats, matching the 8-stat leaderboard pattern from the competitor research in `Ski Tracking PRD.md` (days skied, total vertical, longest run, top speed, total distance, most lifts ridden, total time on mountain, + PowderDays' own signature "powder days" stat). Final 8 tabs: **Days, Powder Days, Vertical, Miles, Top Speed, Longest Run, Most Lifts, Time on Mountain.**

**Fields available on each leaderboard entry** (from sprint-12's RPC v2, already mapped by `leaderboardApi.js`): `days, resorts, powderDays, verticalFt, milesSki, topResort, topSpeed, longestRun, totalRuns, totalLifts, timeOnMountain`.

---

## Tasks

Single task — this is a focused, self-contained change to one file's config array plus its render/sort code.

---

### S16-T1 — Rebuild `CATEGORIES` with 8 real stats, remove the fake locks

**File to modify:** `src/components/LeaderboardPage.jsx`

Replace the `CATEGORIES` array with (read the current object shape first — each entry likely has more fields than shown in the research summary, e.g. a `unit` or `stat` accessor function; preserve whatever fields the existing entries have, just apply this same pattern to all 8):

```js
const CATEGORIES = [
  { key: "days",           label: "🎿 Days",          stat: (e) => e.days,           unit: "" },
  { key: "powderDays",     label: "❄️ Powder Days",   stat: (e) => e.powderDays,     unit: "" },
  { key: "vertical",       label: "↕️ Vertical",      stat: (e) => e.verticalFt,     unit: " ft" },
  { key: "miles",          label: "🛣️ Miles",         stat: (e) => e.milesSki,       unit: " mi" },
  { key: "topSpeed",       label: "⚡ Top Speed",     stat: (e) => e.topSpeed,       unit: " mph" },
  { key: "longestRun",     label: "📏 Longest Run",   stat: (e) => e.longestRun,     unit: " ft" },
  { key: "totalLifts",     label: "🚡 Most Lifts",    stat: (e) => e.totalLifts,     unit: "" },
  { key: "timeOnMountain", label: "⏱️ Time",          stat: (e) => e.timeOnMountain, unit: " min" },
]
```
Note: **no `locked` field on any entry** — every tab is now real. Match `stat` to whatever accessor pattern the existing code actually uses (a function, or a plain field-name string looked up elsewhere) — read the current `LeaderboardRow`'s `cat.stat(entry)` call to confirm the exact calling convention before finalizing this array; the sketch above assumes `stat` is a function, adjust if the real convention differs.

**Handle `null` values in sorting.** `topSpeed` and `longestRun` can be `null` for a user with sessions but no recorded speed/run-length data (per sprint-12's RPC, `MAX()` over an all-null column returns `null`, and the sprint-13 stats form allows leaving fields blank). Update the sort comparator (lines ~200-201) so `null`/`undefined` values sort to the bottom regardless of ascending/descending direction — a user with no data for a stat shouldn't rank above someone with `0` of that stat displayed as if it were a real, better-than-nothing value:
```js
const sorted = [...entries].sort((a, b) => {
  const av = cat.stat(a), bv = cat.stat(b)
  if (av == null && bv == null) return 0
  if (av == null) return 1
  if (bv == null) return -1
  return bv - av // descending — highest first
})
```

**Remove the locked-tab notice.** Delete the "Strava integration coming soon" block (lines 318-325) and whatever conditional rendering in `LeaderboardRow`/the tab switcher checked `cat.locked` — none of that logic path is reachable anymore since no entry sets `locked: true`, but delete the dead code rather than leaving it unreachable.

**Update the stat value display** so it appends `cat.unit` and renders `"—"` for `null`:
```jsx
{cat.stat(entry) != null ? `${cat.stat(entry)}${cat.unit}` : "—"}
```
For `timeOnMountain` specifically, format minutes as `Xh Ym` instead of a raw minute count (reuse or replicate the `formatMinutes` helper from sprint-14 if it was factored somewhere shared, otherwise write a small local one here — don't duplicate logic if sprint-14 already exported it from a shared location).

**Update the "My season snapshot" strip** (lines 262-276, currently hardcodes Days/Resorts/Powder Days/Rank) — leave it as-is; it's a fixed personal summary independent of the tab switcher, not in scope for this sprint (ROADMAP doesn't ask for it to expand, only the tab-switchable ranked list).

**Acceptance criteria:**
- `CATEGORIES` has exactly 8 entries: days, powderDays, vertical, miles, topSpeed, longestRun, totalLifts, timeOnMountain.
- No entry has `locked: true`; the "Strava integration coming soon" notice and its dead conditional are removed.
- Switching tabs re-sorts the row list by that stat, descending, with rank numbers updating.
- Rows with `null` for the active stat sort to the bottom, displaying `"—"`.
- Each row shows its secondary/current-tab stat with the correct unit suffix.

**Verify in browser:**
```bash
npm run dev
```
Open the Social tab's leaderboard. Click through all 8 tabs, confirm sorting changes and ranks update correctly, confirm Vertical/Miles no longer show the locked notice, confirm a friend with no logged top speed sorts last on the Top Speed tab without showing `0 mph`.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add src/components/LeaderboardPage.jsx
git commit -m "feat: expand leaderboard to 8 real stat tabs, remove fake Strava lock"
```

---

## Sprint Acceptance Criteria

- [ ] `CATEGORIES` has 8 unlocked entries covering Days, Powder Days, Vertical, Miles, Top Speed, Longest Run, Most Lifts, Time on Mountain
- [ ] Sorting works correctly for every tab, with `null` values sorted last
- [ ] Locked-tab UI and dead code removed
- [ ] `npm run build` succeeds
- [ ] Verified in browser across all 8 tabs

## Out of Scope for This Sprint

- Changing the "My season snapshot" strip's fixed 4 stats.
- Adding a `resorts` tab back in (deliberately dropped — see the deviation note above; it remains visible as row subtitle context only).
- Sprint-17 (emoji reactions) — this sprint only touches sorting/tabs, not per-row interactions.
</content>
