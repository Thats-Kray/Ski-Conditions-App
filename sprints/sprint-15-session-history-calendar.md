# Sprint 15 — Session History + Calendar Heatmap

**Goal:** ROADMAP TASK 3.2 — build a GitHub-style season calendar heatmap on Profile, with click-to-expand day detail, plus a Calendar/List toggle on the session history section.
**Estimated effort:** 1.5 days
**Depends on:** Sprint 13 (Enhanced Log-a-Day UI) merged — the List view's edit icon reuses `SessionStatsForm` + `updateSessionStats` built there. Sprint 3 (GPS Tracker Hook) executed, for `runs_logged`/stat columns shown in the day-detail card.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**`src/components/ProfilePage.jsx`** — `RecentSessionsFeed` (lines 124-165) is the existing session-list component: takes a `sessions` prop, shows up to 5 most recent rows (resort emoji, name, date, powder badge, `+{vertical_feet} ft`). This sprint extends the session-history area with a Calendar/List toggle; List view becomes the "full" view (not capped at 5) with the edit-stats icon from sprint-13.

**Session row shape** (from `ski_sessions`, via `getMySessions(startYear)`): `id, resort_name, session_date, is_powder_day, notes, vertical_feet, miles_skied, top_speed_mph, runs_logged, time_on_mountain_min`. Note `resort_name` actually stores a **resort key** (e.g. `"vail"`, not a display name) — the existing `RecentSessionsFeed` already passes this value straight into `resortEmoji()`/`resortName()` from `src/lib/resorts.js`, confirming that convention; do the same here.

**Season range convention:** this sprint's calendar grid covers **Oct 1 of `startYear` through May 31 of `startYear + 1`** — matching `getMySessions()`'s actual fetch range (ROADMAP's task description says "Oct–Apr" loosely; use the wider Oct–May range so the calendar never silently hides a real May session that the data layer already fetched).

**`SessionStatsForm` + `updateSessionStats`** (from sprint-13) — reuse both for the List view's ✏️ edit icon; do not build a second stats-editing UI.

---

## Tasks

S15-T1 (`SeasonCalendar.jsx`) has no dependency. S15-T2 (extend `RecentSessionsFeed` into a full List view with edit icons) depends on sprint-13 only. S15-T3 (wire the Calendar/List toggle) depends on both.

---

### S15-T1 — `SeasonCalendar.jsx`

**File to create:** `src/components/SeasonCalendar.jsx`

```jsx
import { useState } from "react"
import { resortName, resortEmoji } from "../lib/resorts"

function dateKey(d) {
  return d.toISOString().slice(0, 10)
}

function buildWeeks(start, end) {
  const weeks = []
  let cur = new Date(start)
  cur.setDate(cur.getDate() - cur.getDay()) // back up to the preceding Sunday
  while (cur <= end) {
    const week = []
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

export default function SeasonCalendar({ sessions, startYear }) {
  const [selectedDate, setSelectedDate] = useState(null)

  const seasonStart = new Date(startYear, 9, 1)   // Oct 1
  const seasonEnd = new Date(startYear + 1, 4, 31) // May 31
  const weeks = buildWeeks(seasonStart, seasonEnd)

  const byDate = new Map(sessions.map((s) => [s.session_date, s]))
  const selectedSession = selectedDate ? byDate.get(selectedDate) : undefined

  return (
    <div>
      <div style={{ display: "flex", gap: 3, overflowX: "auto", padding: "4px 2px" }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {week.map((day, di) => {
              const key = dateKey(day)
              const inSeason = day >= seasonStart && day <= seasonEnd
              const session = byDate.get(key)
              const bg = !inSeason
                ? "transparent"
                : session?.is_powder_day
                  ? "#2dd4bf"
                  : session
                    ? "var(--color-accent)"
                    : "rgba(255,255,255,0.06)"
              return (
                <div
                  key={di}
                  onClick={() => inSeason && setSelectedDate(key)}
                  title={inSeason ? key : undefined}
                  style={{
                    width: 11, height: 11, borderRadius: 2,
                    background: bg,
                    cursor: inSeason ? "pointer" : "default",
                    boxShadow: selectedDate === key ? "0 0 0 2px var(--color-accent)" : "none",
                  }}
                />
              )
            })}
          </div>
        ))}
      </div>

      {selectedDate && (
        <div style={{ marginTop: 12, padding: 14, borderRadius: "var(--radius-card)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {selectedSession ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 15 }}>
                {resortEmoji(selectedSession.resort_name)} {resortName(selectedSession.resort_name)} — {selectedDate}
                {selectedSession.is_powder_day && <span style={{ marginLeft: 8 }}>❄️ Powder Day</span>}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 13, color: "var(--color-text-2)" }}>
                <span>Vertical: {selectedSession.vertical_feet ?? "—"} ft</span>
                <span>Runs: {selectedSession.runs_logged ?? "—"}</span>
                <span>Top speed: {selectedSession.top_speed_mph != null ? `${selectedSession.top_speed_mph} mph` : "—"}</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--color-text-3)" }}>No session logged on {selectedDate}.</div>
          )}
        </div>
      )}
    </div>
  )
}
```

**Acceptance criteria:**
- Days outside the Oct 1 – May 31 season range render as invisible spacer cells (`transparent`, not clickable) so the grid stays visually aligned to whole weeks without misleading colored cells for out-of-season days.
- A day with a powder-day session renders teal (`#2dd4bf`); a day with a non-powder session renders `var(--color-accent)` (ice blue); a day with no session renders a dim `rgba(255,255,255,0.06)`.
- Clicking an in-season day with a session shows the detail card (resort, date, vertical, runs, top speed, powder badge). Clicking an in-season day with no session shows "No session logged on {date}." Clicking a transparent out-of-season cell does nothing (no `onClick` fires).
- No crash if `sessions` is an empty array.

---

### S15-T2 — Extend `RecentSessionsFeed` into a full List view with edit icons

**File to modify:** `src/components/ProfilePage.jsx`

**Note:** the ✏️ edit-stats icon on stat-less rows was already added to `RecentSessionsFeed` by sprint-13 (S13-T4) — this task does **not** re-add it. This task only adds a `limit` prop so the same component can show the full history (not just 5 rows) in List view.

**Step 1 — Add a `limit` prop** to `RecentSessionsFeed` (default `5`, matching current behavior — pass `limit={undefined}` or `limit={Infinity}` for the new full List view to show everything):
```js
function RecentSessionsFeed({ sessions, limit = 5, onSessionUpdated }) {
  const shown = limit ? sessions.slice(0, limit) : sessions
  // ...
}
```
Read the current render body before editing — sprint-13 already added the ✏️ edit icon and its `onSave`/`updateSessionStats` wiring to this component; you're only changing the slice bound here, not touching the edit-icon logic. If `onSessionUpdated` isn't already a prop this component accepts (check what sprint-13 actually named its refresh callback), wire it through consistently with whatever sprint-13 used.

**Acceptance criteria:**
- `<RecentSessionsFeed sessions={sessions} limit={5} />` behaves identically to today (unchanged default).
- `<RecentSessionsFeed sessions={sessions} limit={undefined} />` shows every session, not just 5.
- The existing ✏️ edit icon (from sprint-13) continues to work unchanged — sessions with no stats show it, sessions with any stats don't.

---

### S15-T3 — Wire the Calendar/List toggle

**File to modify:** `src/components/ProfilePage.jsx`

**Step 1 — Import `SeasonCalendar`:**
```js
import SeasonCalendar from "./SeasonCalendar"
```

**Step 2 — Add a `historyView` state** (`"list" | "calendar"`, default `"list"`) near wherever the session-loading state already lives in this component.

**Step 3 — Add the toggle control** above the session history section, matching the same visual pattern as sprint-14's `StatsViewToggle` (segmented pill buttons) if sprint-14 has already landed — otherwise use the same style independently, they should look identical since both are "view mode" toggles in the same page:
```jsx
{["list", "calendar"].map((mode) => (
  <button key={mode} onClick={() => setHistoryView(mode)} /* same segmented style as StatsViewToggle */>
    {mode === "list" ? "List" : "Calendar"}
  </button>
))}
```

**Step 4 — Render conditionally:**
```jsx
{historyView === "list" ? (
  <RecentSessionsFeed sessions={sessions} limit={undefined} onSessionUpdated={reloadSessions} />
) : (
  <SeasonCalendar sessions={sessions} startYear={season.startYear} />
)}
```
`reloadSessions` should be whatever function this component already uses to re-fetch `sessions` after a mutation (check the existing `load()` function referenced elsewhere in this file) — pass that, don't invent a new fetch path.

**Verify in browser:**
```bash
npm run dev
```
Open Profile. Toggle between List and Calendar. In List, confirm all sessions show (not just 5) and the edit icon works on stat-less sessions. In Calendar, confirm the grid renders, colors match session data, and clicking a day shows the detail card.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add src/components/SeasonCalendar.jsx src/components/ProfilePage.jsx
git commit -m "feat: add season calendar heatmap and full session list view to Profile"
```

---

## Sprint Acceptance Criteria

- [ ] `SeasonCalendar.jsx` renders a GitHub-style weekly grid for the Oct–May season, colored by session presence/powder-day status
- [ ] Clicking a day shows an inline detail card (or a "no session" message)
- [ ] Profile's session history section has a working Calendar/List toggle
- [ ] List view shows all sessions (not capped at 5) with a working ✏️ edit-stats icon on stat-less sessions
- [ ] `npm run build` succeeds
- [ ] Verified in browser

## Out of Scope for This Sprint

- Multi-season calendar navigation (this sprint shows only the current season's grid — a season-picker for viewing past seasons' calendars is a future enhancement).
- Any change to `SeasonStatsCard` or the stat tiles from sprint-14.
</content>
