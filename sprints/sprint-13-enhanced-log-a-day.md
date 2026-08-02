# Sprint 13 — Enhanced "Log a Day" UI

**Goal:** ROADMAP TASK 2.3 — after a user logs a ski day, offer an optional inline "Add your stats" step (runs, vertical, miles, top speed), and let them add stats later from Profile's session history via an edit icon.
**Estimated effort:** 1 day
**Depends on:** `sprints/sprint-3-gps-tracker-hook.md` executed and its migration run — this sprint writes to `ski_sessions.runs_logged`, which only exists after `migrations/010_ski_runs.sql` runs.

**Correction to ROADMAP.md before you start:** ROADMAP TASK 2.3 lists `SkiCheckInForm.jsx` as the file to modify. That's wrong — `SkiCheckInForm.jsx` writes to the `daily_plans` table (the forward-looking "I'm skiing today" planner, via `upsertDailyPlan()`), which is a completely different data model from ski-day *logging*. The actual retroactive day-logging UI that calls `logSkiDay()` (which writes to `ski_sessions`) is `LogDayModal`, defined inside `src/components/LeaderboardPage.jsx`. This sprint modifies `LeaderboardPage.jsx`, not `SkiCheckInForm.jsx`.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**`LogDayModal`** — `src/components/LeaderboardPage.jsx`, lines 25–127 (read in full before editing; line numbers will shift after your edits, re-locate by content). Current fields: resort (autocomplete), date, powder-day toggle, notes. Calls `logSkiDay()` (from `src/lib/leaderboardApi.js`) on submit, currently at line 46 within the modal's submit handler.

**Exact current `logSkiDay` signature** (`src/lib/leaderboardApi.js` L24-39) — **you are not changing this function's signature or behavior**:
```js
export async function logSkiDay({ resortName, sessionDate, isPowderDay = false, notes = null, tripId = null }) {
  // upserts into ski_sessions on conflict (user_id, session_date, resort_name), returns the row
}
```

**`ski_sessions` columns relevant to this sprint** (`supabase/migrations/20260515_ski_sessions.sql` plus sprint-3's `migrations/010_ski_runs.sql`): `vertical_feet int`, `miles_skied numeric(8,2)`, `top_speed_mph numeric(5,1)` (all three pre-existing, currently unused by any UI), plus `runs_logged int` (added by sprint-3). RLS already allows an authenticated user to `UPDATE` their own `ski_sessions` rows (confirmed in the RLS-fix migration) — no new RLS policy is needed for this sprint.

**`updateSessionStats` does not exist yet** in `src/lib/leaderboardApi.js` (confirmed via full-file read) — ROADMAP explicitly calls for adding it.

---

## Tasks

S13-T1 (shared stats form component) has no dependency. S13-T2 (`updateSessionStats` helper) has no dependency. S13-T3 (wire the optional stats step into `LogDayModal`) depends on both. S13-T4 (edit icon on Profile session history) depends on S13-T1 and S13-T2 and can be built in parallel with S13-T3.

---

### S13-T1 — `SessionStatsForm.jsx` (shared between the inline post-submit step and the later edit flow)

**File to create:** `src/components/SessionStatsForm.jsx`

```jsx
import { useState } from "react"

export default function SessionStatsForm({ initial, onSave, onSkip, saving }) {
  const [runs, setRuns] = useState(initial?.runs_logged ?? "")
  const [vertical, setVertical] = useState(initial?.vertical_feet ?? "")
  const [miles, setMiles] = useState(initial?.miles_skied ?? "")
  const [topSpeed, setTopSpeed] = useState(initial?.top_speed_mph ?? "")

  function handleSave() {
    onSave({
      runs_logged: runs === "" ? null : Number(runs),
      vertical_feet: vertical === "" ? null : Number(vertical),
      miles_skied: miles === "" ? null : Number(miles),
      top_speed_mph: topSpeed === "" ? null : Number(topSpeed),
    })
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--color-text-2)" }}>
        Runs skied
        <input type="number" min="0" value={runs} onChange={(e) => setRuns(e.target.value)} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--color-text-2)" }}>
        Vertical feet
        <input type="number" min="0" value={vertical} onChange={(e) => setVertical(e.target.value)} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--color-text-2)" }}>
        Miles
        <input type="number" min="0" step="0.1" value={miles} onChange={(e) => setMiles(e.target.value)} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--color-text-2)" }}>
        Top speed (mph)
        <input type="number" min="0" step="0.1" value={topSpeed} onChange={(e) => setTopSpeed(e.target.value)} />
      </label>
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Stats"}
        </button>
        {onSkip && (
          <button onClick={onSkip} style={{ background: "none", border: "none", color: "var(--color-text-3)", cursor: "pointer" }}>
            I'll add stats later
          </button>
        )}
      </div>
    </div>
  )
}
```

Match the surrounding app's existing `<input>`/`<label>` visual styling (border, background, radius) by reading a nearby form in `LeaderboardPage.jsx` (e.g. `LogDayModal`'s existing resort/notes fields) and copying that input style, rather than leaving these bare/unstyled — the code above omits input styling for brevity, add it to match.

**Acceptance criteria:**
- All 4 fields are optional (empty string submits as `null`, not `0` or `NaN`).
- `initial` prop pre-fills fields when editing an existing session's stats (S13-T4's use case); omitting `initial` starts all fields blank (S13-T3's use case).
- `onSkip` is optional — when not provided, no skip link renders (S13-T4 doesn't need a skip option when explicitly editing).

---

### S13-T2 — `updateSessionStats` helper

**File to modify:** `src/lib/leaderboardApi.js`

Add near `logSkiDay`/`deleteSkiDay`:

```js
export async function updateSessionStats(sessionId, stats) {
  const { data, error } = await supabase
    .from("ski_sessions")
    .update(stats)
    .eq("id", sessionId)
    .select()
    .single()
  if (error) throw error
  return data
}
```

Check the top of the file for how `supabase` is imported (it's already used by every other function in this file — match the existing import, don't add a duplicate).

**Acceptance criteria:**
- `updateSessionStats(id, { runs_logged: 8, vertical_feet: 12000, miles_skied: 22.5, top_speed_mph: 41.2 })` updates exactly those 4 columns on the matching `ski_sessions` row and returns the updated row.
- Relies on existing RLS (no migration needed) — the query will simply return 0 rows / a permission error if called against another user's session, which is correct behavior.

---

### S13-T3 — Wire the optional "Add your stats" step into `LogDayModal`

**File to modify:** `src/components/LeaderboardPage.jsx`

**Step 1 — Import the new pieces:**
```js
import SessionStatsForm from "./SessionStatsForm"
import { logSkiDay, updateSessionStats /* , ...existing imports */ } from "../lib/leaderboardApi"
```

**Step 2 — Add a `step` state to `LogDayModal`** (`"basic" | "stats"`, default `"basic"`) and a `savedSession` state (the row returned by `logSkiDay`).

**Step 3 — On successful basic submit**, instead of immediately closing the modal (read the current submit handler to see exactly how it closes/calls back today), set `savedSession` to the returned row and set `step` to `"stats"` — keep the modal open.

**Step 4 — When `step === "stats"`**, render `SessionStatsForm` in place of the basic form:
```jsx
<SessionStatsForm
  saving={statsSaving}
  onSave={async (stats) => {
    setStatsSaving(true)
    try {
      await updateSessionStats(savedSession.id, stats)
      onClose() // or whatever the existing modal's close/refresh callback is called
    } catch (e) {
      // surface the error using whatever error-display convention this modal already uses
    } finally {
      setStatsSaving(false)
    }
  }}
  onSkip={() => onClose()}
/>
```
Match `onClose`/refresh-callback naming to whatever `LogDayModal` already does when finishing successfully today (read the existing code — do not invent a new prop name if one already exists for "close and refresh the leaderboard/session list").

**Acceptance criteria:**
- Submitting the basic form (resort, date, powder toggle, notes) creates/upserts the `ski_sessions` row via the unchanged `logSkiDay()`, then reveals the stats step in the same modal — it does not close.
- Filling in stats and clicking "Save Stats" calls `updateSessionStats` with the new session's `id` and closes the modal, refreshing whatever list the modal's existing close/refresh callback already refreshes.
- Clicking "I'll add stats later" closes the modal without calling `updateSessionStats` — the basic session data logged in Step 1 remains saved.

**Verify in browser:**
```bash
npm run dev
```
Open the leaderboard, log a new day, confirm the stats step appears after basic submit, test both "Save Stats" and "I'll add stats later" paths.

---

### S13-T4 — ✏️ edit icon on Profile's session history for sessions with no stats yet

**File to modify:** `src/components/ProfilePage.jsx`

**Step 1 — Define "has no stats yet."** A session has no stats if all 4 of `runs_logged`, `vertical_feet`, `miles_skied`, `top_speed_mph` are `null`/`undefined`. Add a small local helper near `RecentSessionsFeed` (lines 124-165):
```js
function hasStats(session) {
  return session.runs_logged != null || session.vertical_feet != null || session.miles_skied != null || session.top_speed_mph != null
}
```

**Step 2 — Add the edit icon.** In `RecentSessionsFeed`'s row render, next to each session missing stats (`!hasStats(session)`), add a small "✏️" button that opens a lightweight modal/inline panel rendering `SessionStatsForm` (imported from `./SessionStatsForm`) with `initial={session}` and no `onSkip` (editing is an explicit action, not a flow with a skip option):
```jsx
<SessionStatsForm
  initial={session}
  saving={savingStatsFor === session.id}
  onSave={async (stats) => {
    setSavingStatsFor(session.id)
    try {
      await updateSessionStats(session.id, stats)
      await load() // or whatever this component's existing session-reload function is called — read the file to find it
    } finally {
      setSavingStatsFor(null)
      setEditingSessionId(null)
    }
  }}
/>
```
Import `updateSessionStats` from `../lib/leaderboardApi` (add to `ProfilePage.jsx`'s existing import from that module if one exists, otherwise add a new import line).

**Acceptance criteria:**
- Sessions with any stats already recorded show no edit icon.
- Sessions with zero stats recorded show the ✏️ icon; tapping it opens `SessionStatsForm` pre-filled with `null`s (i.e. blank fields), and saving updates that session's row and refreshes the feed.

**Verify in browser:**
```bash
npm run dev
```
Open Profile, find a session with no stats (or log one via S13-T3's "skip stats" path to create one), confirm the ✏️ icon appears, edit it, confirm stats save and the icon disappears on next load.

**Build check (run once after both S13-T3 and S13-T4 are done):**
```bash
npm run build
```

**Commit:**
```bash
git add src/components/SessionStatsForm.jsx src/lib/leaderboardApi.js src/components/LeaderboardPage.jsx src/components/ProfilePage.jsx
git commit -m "feat: add optional post-log stats step and edit-stats-later flow"
```

---

## Sprint Acceptance Criteria

- [ ] `SessionStatsForm.jsx` exists and is used in both `LogDayModal` (post-submit) and `ProfilePage.jsx` (edit-later)
- [ ] `updateSessionStats(sessionId, stats)` exists in `leaderboardApi.js` and updates the 4 stat columns on the caller's own session
- [ ] `LogDayModal` shows an optional stats step after basic submit, with a working skip path
- [ ] Profile's session history shows a ✏️ edit icon only on sessions with zero recorded stats
- [ ] `npm run build` succeeds
- [ ] Verified in browser: full flow (log day → add stats or skip → edit later if skipped)

## Out of Scope for This Sprint

- Any change to `logSkiDay()`'s signature — it keeps handling only the basic fields (resort, date, powder toggle, notes, trip).
- GPS-based auto-population of these stats — that's sprint-3/sprint-4 territory (Strava/GPS tracking), this sprint is purely manual entry.
- Displaying the new stats anywhere in the leaderboard UI — that's sprint-16.
</content>
