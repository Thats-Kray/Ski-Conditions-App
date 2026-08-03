# Strava Sync Review & Locked Session Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user review and choose which Strava activities get imported (with a required mountain assignment) before anything is written to their log, and change session editing so only the activity name and mountain can ever be changed once a session has real stats — stats become read-only after they're first set.

**Architecture:** Split the current one-shot "sync everything from Strava" into a preview step (read-only, server fetches + filters, no writes) and a commit step (writes only the activities the user explicitly selected, re-fetching each one's stats from Strava by ID rather than trusting the client). A new shared `ResortPicker` component (extracted from the existing "Log a Day" resort search field) is reused by both the sync-review list and the session-edit form, so there's one canonical resort-name input across the app. The existing session-edit UI (`SessionStatsForm`, used only for a session's *first* stat entry) is joined by a new `SessionEditForm` that always allows editing name + mountain, and only allows editing the numeric stat fields when the session doesn't have stats yet — once stats exist (from GPS tracking, Strava, or a prior manual entry), those fields render disabled.

**Tech Stack:** React 19 (frontend, `src/`), Express (backend, `server/`), Supabase (`ski_sessions` table), Strava API v3.

## Global Constraints

- No test runner is installed in this repo (no vitest/jest in `package.json`). Verify every task with `npm run build` (frontend changes) and/or `node --check <file>` (backend changes), plus careful manual tracing of the logic — this matches how every other feature in this codebase has been verified.
- Match existing code style exactly: function components, inline `style={{...}}` objects (no CSS modules, no styled-components), default exports, no PropTypes/TypeScript.
- Never trust client-supplied numeric stats when writing to `ski_sessions`. The one place this plan writes new stats from an external source (`commitSyncedActivities`) re-fetches each activity from Strava's API by ID server-side — the client only ever contributes `stravaActivityId`, `resortName`, and `notes`.
- Every backend route in `server/routes/strava.js` already uses the `requireAuth` middleware pattern (verifies a Supabase bearer token, sets `req.userId`) — new routes must follow the same pattern. Never read a user id from `req.body`.
- Error messages shown to the user must surface the real cause (matching the fix already applied to `StravaConnect.jsx`'s other error paths this session) — no generic "something went wrong" where a specific reason is available.

---

### Task 1: Extract a shared `ResortPicker` component

**Files:**
- Create: `src/components/ui/ResortPicker.jsx`
- Modify: `src/components/LeaderboardPage.jsx:1-15` (imports + module-level `RESORT_NAMES`), `src/components/LeaderboardPage.jsx:46-47` (state), `src/components/LeaderboardPage.jsx:55-57` (filtered computation), `src/components/LeaderboardPage.jsx:130-153` (render block)

**Interfaces:**
- Produces: `ResortPicker` default export, props `{ value: string, onChange: (name: string) => void, placeholder?: string }`. `value` is the confirmed resort name (empty string if nothing confirmed yet); `onChange` is called with the picked name when the user selects a suggestion, and with `""` whenever the user is typing (not yet confirmed) — mirrors the exact state machine `LogDayModal` already uses (`resort` cleared while `search` is being typed, only set on selection).

This is a pure extraction — the existing resort search field in `LogDayModal` (inside `LeaderboardPage.jsx`) becomes the first consumer, with no behavior change. Tasks 2 and 4 both depend on this component, so it must land first.

- [ ] **Step 1: Create the component**

Create `src/components/ui/ResortPicker.jsx`:

```jsx
import { useState } from "react"

const RESORT_NAMES = [
  "Vail", "Beaver Creek", "Breckenridge", "Keystone", "Park City",
  "Heavenly", "Northstar", "Kirkwood", "Stowe", "Whistler Blackcomb",
  "Telluride", "Arapahoe Basin", "Winter Park", "Steamboat", "Copper Mountain",
  "Crested Butte", "Eldora", "Aspen Snowmass", "Snowbird", "Alta",
  "Park City Mountain", "Mammoth Mountain", "Big Sky", "Jackson Hole",
  "Taos", "Sun Valley", "Squaw Valley", "Lake Tahoe", "Palisades Tahoe",
  "Loveland", "Monarch", "Wolf Creek", "Sunlight", "Powderhorn",
]

const inputStyle = {
  width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10, padding: "10px 12px", color: "white", fontSize: 14, boxSizing: "border-box",
  outline: "none",
}

export default function ResortPicker({ value, onChange, placeholder = "Search resort..." }) {
  const [search, setSearch] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)

  const filtered = search.length > 0
    ? RESORT_NAMES.filter((r) => r.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : []

  return (
    <div style={{ position: "relative" }}>
      <input
        style={inputStyle}
        placeholder={placeholder}
        value={value || search}
        onChange={(e) => { setSearch(e.target.value); onChange(""); setShowDropdown(true) }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
      />
      {showDropdown && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1e293b", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, zIndex: 10, overflow: "hidden", marginTop: 4 }}>
          {filtered.map((r) => (
            <div
              key={r}
              onMouseDown={() => { onChange(r); setSearch(r); setShowDropdown(false) }}
              style={{ padding: "10px 12px", cursor: "pointer", fontSize: 14, color: "white", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              {r}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Refactor `LogDayModal` to use it**

In `src/components/LeaderboardPage.jsx`:

1. Add `import ResortPicker from "./ui/ResortPicker"` near the top with the other imports.
2. Delete the module-level `const RESORT_NAMES = [...]` array (currently lines 7-15) — it now lives in `ResortPicker.jsx`.
3. Inside `LogDayModal`, delete these two lines (currently lines 46-47):
   ```js
   const [search, setSearch]       = useState("")
   const [showDropdown, setShowDropdown] = useState(false)
   ```
4. Delete the `filtered` computation (currently lines 55-57):
   ```js
   const filtered = search.length > 0
     ? RESORT_NAMES.filter((r) => r.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
     : []
   ```
5. Replace the entire resort field block (currently lines 131-153):
   ```jsx
   {/* Resort */}
   <div style={{ position: "relative" }}>
     <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Resort</label>
     <input
       style={inputStyle}
       placeholder="Search resort..."
       value={resort || search}
       onChange={(e) => { setSearch(e.target.value); setResort("") ; setShowDropdown(true) }}
       onFocus={() => setShowDropdown(true)}
       onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
     />
     {showDropdown && filtered.length > 0 && (
       <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1e293b", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, zIndex: 10, overflow: "hidden", marginTop: 4 }}>
         {filtered.map((r) => (
           <div key={r} onMouseDown={() => { setResort(r); setSearch(r); setShowDropdown(false) }}
             style={{ padding: "10px 12px", cursor: "pointer", fontSize: 14, color: "white", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
             onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
             onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
           >{r}</div>
         ))}
       </div>
     )}
   </div>
   ```
   with:
   ```jsx
   {/* Resort */}
   <div>
     <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Resort</label>
     <ResortPicker value={resort} onChange={setResort} />
   </div>
   ```
   `resort`/`setResort` (declared at line 40, `const [resort, setResort] = useState("")`) stay exactly as they are — only the input markup changes.

- [ ] **Step 3: Verify**

Run `npm run build` from the repo root — must succeed with no new errors or warnings beyond the pre-existing unrelated `MessagingCenter.jsx` duplicate-key warning. Then grep to confirm the old inline resort-picker code is fully gone and nothing else in the file still references the deleted state:

```bash
grep -n "showDropdown\|RESORT_NAMES" src/components/LeaderboardPage.jsx
```
Expected: no matches (both were fully removed from this file).

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/ResortPicker.jsx src/components/LeaderboardPage.jsx
git commit -m "refactor: extract shared ResortPicker from LogDayModal's inline resort search"
```

---

### Task 2: Lock stats on edit — `SessionEditForm` + `ProfilePage` wiring

**Files:**
- Create: `src/components/SessionEditForm.jsx`
- Modify: `src/components/ProfilePage.jsx:13` (import), `src/components/ProfilePage.jsx:261` (edit-eligibility gate), `src/components/ProfilePage.jsx:279-285` (edit button), `src/components/ProfilePage.jsx:297-329` (edit modal + form usage)

**Interfaces:**
- Consumes: `ResortPicker` from Task 1 (`import ResortPicker from "./ui/ResortPicker"`).
- Produces: `SessionEditForm` default export, props `{ session: object, onSave: (fields: object) => void, saving: boolean }`. Calls `onSave` with `{ notes, resort_name, ...(runs_logged, vertical_feet, miles_skied, top_speed_mph if not yet locked) }`.

Currently, `ProfilePage.jsx`'s session list only shows an edit (✏️) icon for sessions that have **no** stats yet, and it opens `SessionStatsForm` (numeric-only, no name/resort). This task adds a `SessionEditForm` that's shown for **every** real session (not gated on stats), always lets you edit name + mountain, and only lets you edit the stat fields the first time (before any stat source — GPS, Strava, or manual — has set them).

- [ ] **Step 1: Create `SessionEditForm.jsx`**

Create `src/components/SessionEditForm.jsx`:

```jsx
import { useState } from "react"
import ResortPicker from "./ui/ResortPicker"

const inputStyle = {
  width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10, padding: "10px 12px", color: "white", fontSize: 14, boxSizing: "border-box",
  outline: "none",
}

const lockedInputStyle = {
  ...inputStyle, background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.35)", cursor: "not-allowed",
}

const labelStyle = {
  display: "block", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)",
  marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5,
}

// Same definition as ProfilePage.jsx's own hasStats() — duplicated rather
// than imported/exported across files for a 3-line check, matching this
// codebase's existing precedent (formatMinutes has 3 independent copies).
function hasStats(session) {
  return session.runs_logged != null || session.vertical_feet != null || session.miles_skied != null || session.top_speed_mph != null
}

export default function SessionEditForm({ session, onSave, saving }) {
  const [notes, setNotes]   = useState(session?.notes ?? "")
  const [resort, setResort] = useState(session?.resort_name ?? "")

  const statsLocked = hasStats(session)

  // Only ever used when statsLocked is false (first-time entry for a
  // manually-logged day with no GPS/Strava source for this data).
  const [runs, setRuns]         = useState(session?.runs_logged ?? "")
  const [vertical, setVertical] = useState(session?.vertical_feet ?? "")
  const [miles, setMiles]       = useState(session?.miles_skied ?? "")
  const [topSpeed, setTopSpeed] = useState(session?.top_speed_mph ?? "")

  function handleSave() {
    const fields = {
      notes: notes.trim() || null,
      resort_name: resort || session?.resort_name,
    }
    if (!statsLocked) {
      fields.runs_logged   = runs === "" ? null : Number(runs)
      fields.vertical_feet = vertical === "" ? null : Number(vertical)
      fields.miles_skied   = miles === "" ? null : Number(miles)
      fields.top_speed_mph = topSpeed === "" ? null : Number(topSpeed)
    }
    onSave(fields)
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <label style={labelStyle}>
        Activity Name
        <input
          style={{ ...inputStyle, marginTop: 6 }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Powder day at Vail"
        />
      </label>

      <label style={labelStyle}>
        Mountain
        <div style={{ marginTop: 6 }}>
          <ResortPicker value={resort} onChange={setResort} />
        </div>
      </label>

      {statsLocked && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 12px" }}>
          Stats are locked once set (from GPS tracking, Strava, or a prior entry) — only the name and mountain can be changed.
        </div>
      )}

      <label style={labelStyle}>
        Runs skied
        <input
          type="number" min="0" disabled={statsLocked}
          style={{ ...(statsLocked ? lockedInputStyle : inputStyle), marginTop: 6 }}
          value={statsLocked ? (session?.runs_logged ?? "") : runs}
          onChange={(e) => setRuns(e.target.value)}
        />
      </label>
      <label style={labelStyle}>
        Vertical feet
        <input
          type="number" min="0" disabled={statsLocked}
          style={{ ...(statsLocked ? lockedInputStyle : inputStyle), marginTop: 6 }}
          value={statsLocked ? (session?.vertical_feet ?? "") : vertical}
          onChange={(e) => setVertical(e.target.value)}
        />
      </label>
      <label style={labelStyle}>
        Miles
        <input
          type="number" min="0" step="0.1" disabled={statsLocked}
          style={{ ...(statsLocked ? lockedInputStyle : inputStyle), marginTop: 6 }}
          value={statsLocked ? (session?.miles_skied ?? "") : miles}
          onChange={(e) => setMiles(e.target.value)}
        />
      </label>
      <label style={labelStyle}>
        Top speed (mph)
        <input
          type="number" min="0" step="0.1" disabled={statsLocked}
          style={{ ...(statsLocked ? lockedInputStyle : inputStyle), marginTop: 6 }}
          value={statsLocked ? (session?.top_speed_mph ?? "") : topSpeed}
          onChange={(e) => setTopSpeed(e.target.value)}
        />
      </label>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        style={{
          background: "linear-gradient(135deg,#2563eb,#0891b2)", color: "white", border: "none",
          borderRadius: 12, padding: "12px 20px", fontSize: 14, fontWeight: 900,
          cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  )
}
```

Note the disabled `<input>`s still render the real value (from `session`, not from the unused local state) when locked — this makes intent unambiguous in the DOM regardless of what the locked-out local state happens to hold.

- [ ] **Step 2: Wire it into `ProfilePage.jsx`**

In `src/components/ProfilePage.jsx`:

1. Line 13, replace:
   ```js
   import SessionStatsForm from "./SessionStatsForm"
   ```
   with:
   ```js
   import SessionEditForm from "./SessionEditForm"
   ```
   (Confirm `SessionStatsForm` has no other usage in this file first: `grep -n "SessionStatsForm" src/components/ProfilePage.jsx` should, before this change, show exactly the import line and the one JSX usage being replaced in this task — if it shows more, do not remove the import, add the new one alongside it instead.)

2. Line 261, replace:
   ```js
   const canEditStats = typeof s.id === "string" && !s.id.startsWith("trip-") && !hasStats(s)
   ```
   with:
   ```js
   const canEdit = typeof s.id === "string" && !s.id.startsWith("trip-")
   ```
   (dropping the `!hasStats(s)` condition — every real session is now editable, not just stat-less ones).

3. Lines 279-285, replace:
   ```jsx
   {canEditStats && (
     <button
       onClick={() => setEditingSessionId(s.id)}
       title="Add stats"
       style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, width: 28, height: 28, flexShrink: 0, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}
     >✏️</button>
   )}
   ```
   with:
   ```jsx
   {canEdit && (
     <button
       onClick={() => setEditingSessionId(s.id)}
       title="Edit session"
       style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, width: 28, height: 28, flexShrink: 0, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}
     >✏️</button>
   )}
   ```

4. Lines 306-326 (the modal header and form usage inside the `editingSession &&` block), replace:
   ```jsx
   <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
     <div style={{ fontSize: 18, fontWeight: 900, color: "white" }}>📊 Add Your Stats</div>
     <button
       onClick={() => setEditingSessionId(null)}
       style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.6)", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}
     >✕</button>
   </div>
   <SessionStatsForm
     initial={editingSession}
     saving={savingStatsFor === editingSession.id}
     onSave={async (stats) => {
       setSavingStatsFor(editingSession.id)
       try {
         await updateSessionStats(editingSession.id, stats)
         await onRefresh?.()
       } finally {
         setSavingStatsFor(null)
         setEditingSessionId(null)
       }
     }}
   />
   ```
   with:
   ```jsx
   <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
     <div style={{ fontSize: 18, fontWeight: 900, color: "white" }}>✏️ Edit Session</div>
     <button
       onClick={() => setEditingSessionId(null)}
       style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.6)", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}
     >✕</button>
   </div>
   <SessionEditForm
     session={editingSession}
     saving={savingStatsFor === editingSession.id}
     onSave={async (fields) => {
       setSavingStatsFor(editingSession.id)
       try {
         await updateSessionStats(editingSession.id, fields)
         await onRefresh?.()
       } finally {
         setSavingStatsFor(null)
         setEditingSessionId(null)
       }
     }}
   />
   ```
   (`updateSessionStats(sessionId, fields)` in `src/lib/leaderboardApi.js:58-67` is a generic `.update(fields)` already — no backend/API change needed here, it happily accepts `notes`/`resort_name` alongside or instead of the numeric fields.)

- [ ] **Step 3: Verify**

```bash
npm run build
grep -n "SessionStatsForm" src/components/ProfilePage.jsx
```
`npm run build` must succeed. The grep should return nothing (import fully replaced) — if `SessionStatsForm` is still referenced elsewhere in this specific file, stop and reconcile before proceeding (see the caveat in Step 2.1).

Trace through both cases by hand against the code (no test runner, no live Supabase session available to click through):
- A session where `hasStats()` is false (e.g. `{ runs_logged: null, vertical_feet: null, miles_skied: null, top_speed_mph: null }`): confirm `statsLocked` evaluates `false`, all four numeric `<input>`s render with `disabled={false}` and read from the live `runs`/`vertical`/`miles`/`topSpeed` state (editable).
- A session where `hasStats()` is true (e.g. `{ vertical_feet: 4200, runs_logged: null, ... }`): confirm `statsLocked` evaluates `true`, all four numeric inputs render `disabled={true}` reading directly from `session.*` (not the unused local state), and `handleSave`'s `fields` object omits the four stat keys entirely.

- [ ] **Step 4: Commit**

```bash
git add src/components/SessionEditForm.jsx src/components/ProfilePage.jsx
git commit -m "feat: lock session stats after first entry; only name/mountain stay editable"
```

---

### Task 3: Backend — Strava sync preview & commit

**Files:**
- Modify: `server/services/stravaSync.js` (replace `syncUserActivities`, keep everything else)
- Modify: `server/routes/strava.js:4` (import), `server/routes/strava.js:228-238` (replace the `/api/strava/sync` route with two new routes)

**Interfaces:**
- Produces: `previewSyncableActivities(userId)` → `Promise<{ activities: Array<{stravaActivityId, name, date, verticalFeet, milesSkied, topSpeedMph, movingTimeSecs}>, skippedNonSki: number }>`. `commitSyncedActivities(userId, selections)` → `Promise<{ synced: number, failed: Array<{stravaActivityId, message}> }>` where `selections` is `Array<{stravaActivityId: number, resortName: string, notes?: string}>`.
- Consumes: `getValidStravaToken` from `../routes/strava.js` (already imported in `stravaSync.js`, unchanged), `getSupabase()` (already defined locally in `stravaSync.js`, unchanged).

This is the highest-risk task — it's the one place a client payload could otherwise inject fake stats. `commitSyncedActivities` must re-fetch every selected activity's real data from Strava's API by ID; it must never use stat values sent from the frontend.

- [ ] **Step 1: Replace `syncUserActivities` with `previewSyncableActivities` and `commitSyncedActivities`**

In `server/services/stravaSync.js`, the file currently has this structure (helpers at the top, then `activityToSession`, then `syncUserActivities`, then `syncSingleActivity`). Leave everything from the top of the file through `activityToSession` (lines 1-53) exactly as it is. Replace `syncUserActivities` (currently lines 55-107) with:

```js
// Returns the ski/snowboard activities from this season that AREN'T already
// in ski_sessions, for the user to review before anything is written. Reads
// only — no writes happen here.
function getCurrentSeasonStart() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // 1-12
  // Mirrors src/lib/leaderboardApi.js's getCurrentSeason(): Oct–Apr counts
  // as the season starting that October; Jan–Apr counts as the season that
  // started the previous October.
  const startYear = month >= 10 ? year : year - 1
  return new Date(`${startYear}-10-01T00:00:00Z`)
}

export async function previewSyncableActivities(userId) {
  const accessToken = await getValidStravaToken(userId)
  const supabase = getSupabase()

  const { data: existing, error: existingErr } = await supabase
    .from("ski_sessions")
    .select("strava_activity_id")
    .eq("user_id", userId)
    .not("strava_activity_id", "is", null)

  if (existingErr) throw new Error(existingErr.message)
  const alreadyImported = new Set((existing || []).map((r) => r.strava_activity_id))

  const seasonStart = getCurrentSeasonStart()
  const afterEpoch = Math.floor(seasonStart.getTime() / 1000)

  let page = 1
  const candidates = []
  let skippedNonSki = 0

  while (true) {
    const url = `https://www.strava.com/api/v3/athlete/activities?per_page=100&page=${page}&after=${afterEpoch}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      throw new Error(`Strava API error ${res.status} on page ${page}`)
    }

    const activities = await res.json()
    if (!activities.length) break

    for (const activity of activities) {
      if (!SKI_SPORT_TYPES.has(activity.sport_type)) {
        skippedNonSki++
        continue
      }
      if (alreadyImported.has(activity.id)) continue

      candidates.push({
        stravaActivityId: activity.id,
        name:             activity.name || "Strava Activity",
        date:             activity.start_date.slice(0, 10),
        verticalFeet:     metersToFeet(activity.total_elevation_gain),
        milesSkied:       metersToMiles(activity.distance),
        topSpeedMph:      mpsToMph(activity.max_speed),
        movingTimeSecs:   activity.moving_time ?? null,
      })
    }

    page++
  }

  return { activities: candidates, skippedNonSki }
}

// Writes only the activities the caller explicitly selected. Re-fetches each
// one's full data from Strava by ID rather than trusting any stat values in
// `selections` — the client only ever contributes stravaActivityId,
// resortName, and (optionally) notes. This is what keeps a sync-time payload
// from being able to inject fabricated vertical/speed/etc. numbers.
export async function commitSyncedActivities(userId, selections) {
  const accessToken = await getValidStravaToken(userId)
  const supabase = getSupabase()

  let synced = 0
  const failed = []

  for (const sel of selections) {
    try {
      const res = await fetch(`https://www.strava.com/api/v3/activities/${sel.stravaActivityId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!res.ok) throw new Error(`Strava activity fetch failed: ${res.status}`)

      const activity = await res.json()

      if (!SKI_SPORT_TYPES.has(activity.sport_type)) {
        throw new Error(`Not a ski activity: ${activity.sport_type}`)
      }

      const row = activityToSession(activity, userId)
      row.resort_name = sel.resortName
      if (sel.notes) row.notes = sel.notes

      const { error } = await supabase
        .from("ski_sessions")
        .upsert(row, { onConflict: "strava_activity_id", ignoreDuplicates: false })

      if (error) throw new Error(error.message)
      synced++
    } catch (err) {
      failed.push({ stravaActivityId: sel.stravaActivityId, message: err.message })
    }
  }

  return { synced, failed }
}
```

Leave `syncSingleActivity` (used by the webhook handler for real-time new-activity events — a different, unrelated flow this plan doesn't touch) exactly as it is.

- [ ] **Step 2: Replace the sync route**

In `server/routes/strava.js`:

1. Line 4, replace:
   ```js
   import { syncUserActivities, syncSingleActivity } from "../services/stravaSync.js"
   ```
   with:
   ```js
   import { previewSyncableActivities, commitSyncedActivities, syncSingleActivity } from "../services/stravaSync.js"
   ```

2. Replace the existing sync route (currently lines 228-238):
   ```js
   router.post("/api/strava/sync", requireAuth, async (req, res) => {
     const userId = req.userId

     try {
       const result = await syncUserActivities(userId)
       res.json(result)
     } catch (err) {
       console.error("Strava sync error:", err.message)
       res.status(500).json({ error: err.message })
     }
   })
   ```
   with:
   ```js
   router.post("/api/strava/sync-preview", requireAuth, async (req, res) => {
     const userId = req.userId

     try {
       const result = await previewSyncableActivities(userId)
       res.json(result)
     } catch (err) {
       console.error("Strava sync-preview error:", err.message)
       res.status(500).json({ error: err.message })
     }
   })

   router.post("/api/strava/sync-commit", requireAuth, async (req, res) => {
     const userId = req.userId
     const activities = Array.isArray(req.body?.activities) ? req.body.activities : []

     if (!activities.length) {
       return res.status(400).json({ error: "No activities provided" })
     }

     const invalid = activities.find((a) => !a.stravaActivityId || !a.resortName)
     if (invalid) {
       return res.status(400).json({ error: "Each activity needs a stravaActivityId and resortName" })
     }

     try {
       const result = await commitSyncedActivities(userId, activities)
       res.json(result)
     } catch (err) {
       console.error("Strava sync-commit error:", err.message)
       res.status(500).json({ error: err.message })
     }
   })
   ```

- [ ] **Step 3: Verify**

```bash
cd server && node --check services/stravaSync.js && node --check routes/strava.js && echo OK
```
Expected: `OK`.

Then a real boot test — from the `server/` directory:
```bash
(PORT=8910 JWT_SECRET=test node index.js > /tmp/strava_sync_boot.log 2>&1 &)
sleep 2
cat /tmp/strava_sync_boot.log
curl -s -X POST http://localhost:8910/api/strava/sync-preview -H "Content-Type: application/json" -d '{}' -w "\nSTATUS:%{http_code}\n"
curl -s -X POST http://localhost:8910/api/strava/sync-commit -H "Content-Type: application/json" -d '{}' -w "\nSTATUS:%{http_code}\n"
curl -s http://localhost:8910/api/strava/sync -w "\nSTATUS:%{http_code}\n"
pkill -f "node index.js"
```
Expected: the boot log shows the usual `[cron] Weekly briefing scheduled...` and `Server running at...` lines with no errors. Both new routes return `401 {"error":"Missing Authorization bearer token"}` (no auth header sent). The old `/api/strava/sync` returns `404` (route no longer exists — confirms the replacement, not an addition alongside the old one).

- [ ] **Step 4: Commit**

```bash
git add server/services/stravaSync.js server/routes/strava.js
git commit -m "feat: split Strava sync into a review-before-import preview + commit"
```

---

### Task 4: Frontend — sync review UI

**Files:**
- Create: `src/components/StravaSyncReview.jsx`
- Modify: `src/components/StravaConnect.jsx` (add state, replace `handleSync`, add render block for the review modal, update the result-summary display)

**Interfaces:**
- Consumes: `ResortPicker` from Task 1. Calls `POST /api/strava/sync-commit` from Task 3 (`{ activities: [{stravaActivityId, resortName, notes}] }`).
- Produces: `StravaSyncReview` default export, props `{ activities: array, skippedNonSki: number, onClose: () => void, onImported: (result: {synced, failed}) => void }`.

- [ ] **Step 1: Create `StravaSyncReview.jsx`**

Create `src/components/StravaSyncReview.jsx`:

```jsx
import { useState } from "react"
import ResortPicker from "./ui/ResortPicker"
import { authHeaders } from "../lib/supabase"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8787"

export default function StravaSyncReview({ activities, skippedNonSki, onClose, onImported }) {
  const [selections, setSelections] = useState(() =>
    Object.fromEntries(
      activities.map((a) => [a.stravaActivityId, { included: true, resortName: "", notes: a.name }])
    )
  )
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState("")

  function updateSelection(id, patch) {
    setSelections((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const includedCount = Object.values(selections).filter((s) => s.included).length
  const missingResort = activities.some(
    (a) => selections[a.stravaActivityId]?.included && !selections[a.stravaActivityId]?.resortName
  )

  async function handleImport() {
    setError("")
    setImporting(true)
    try {
      const payload = activities
        .filter((a) => selections[a.stravaActivityId]?.included)
        .map((a) => ({
          stravaActivityId: a.stravaActivityId,
          resortName:       selections[a.stravaActivityId].resortName,
          notes:            selections[a.stravaActivityId].notes,
        }))

      const res = await fetch(`${API_BASE}/api/strava/sync-commit`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ activities: payload }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result?.error || `Import failed (${res.status})`)
      onImported(result)
    } catch (err) {
      setError(err.message || "Could not import activities.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "20px 20px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: 520, maxHeight: "85dvh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "white" }}>Review Strava Activities</div>
          <button
            onClick={onClose}
            style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.6)", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}
          >
            ✕
          </button>
        </div>

        {activities.length === 0 ? (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", padding: "20px 0" }}>
            No new ski activities found from Strava this season
            {skippedNonSki > 0 ? ` (${skippedNonSki} non-ski activities skipped).` : "."}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12, flexShrink: 0 }}>
              Found {activities.length} ski activit{activities.length === 1 ? "y" : "ies"} not yet in your log. Pick a mountain for each one you want to import.
            </div>
            <div style={{ overflowY: "auto", display: "grid", gap: 12, paddingRight: 2 }}>
              {activities.map((a) => {
                const sel = selections[a.stravaActivityId]
                return (
                  <div key={a.stravaActivityId} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 12 }}>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={sel.included}
                        onChange={(e) => updateSelection(a.stravaActivityId, { included: e.target.checked })}
                        style={{ marginTop: 3 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input
                          value={sel.notes}
                          onChange={(e) => updateSelection(a.stravaActivityId, { notes: e.target.value })}
                          style={{ width: "100%", background: "transparent", border: "none", color: "white", fontSize: 14, fontWeight: 700, padding: 0, marginBottom: 2 }}
                        />
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                          {a.date}
                          {a.verticalFeet != null && ` · ${a.verticalFeet} ft`}
                          {a.milesSkied != null && ` · ${a.milesSkied} mi`}
                          {a.topSpeedMph != null && ` · ${a.topSpeedMph} mph`}
                        </div>
                      </div>
                    </label>
                    {sel.included && (
                      <div style={{ marginTop: 10, marginLeft: 26 }}>
                        <ResortPicker
                          value={sel.resortName}
                          onChange={(name) => updateSelection(a.stravaActivityId, { resortName: name })}
                          placeholder="Pick a mountain..."
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {error && <div style={{ fontSize: 13, color: "#f87171", marginTop: 12, flexShrink: 0 }}>{error}</div>}

            <button
              onClick={handleImport}
              disabled={importing || includedCount === 0 || missingResort}
              style={{
                marginTop: 16, width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                background: "linear-gradient(135deg,#2563eb,#0891b2)", color: "white", fontWeight: 900, fontSize: 14,
                cursor: importing || includedCount === 0 || missingResort ? "not-allowed" : "pointer",
                opacity: importing || includedCount === 0 || missingResort ? 0.6 : 1,
                flexShrink: 0,
              }}
            >
              {importing ? "Importing…" : `Import ${includedCount} Selected`}
            </button>
            {missingResort && includedCount > 0 && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 8, textAlign: "center", flexShrink: 0 }}>
                Pick a mountain for every selected activity to continue.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `StravaConnect.jsx`**

In `src/components/StravaConnect.jsx`:

1. Add the import near the top:
   ```js
   import StravaSyncReview from "./StravaSyncReview"
   ```

2. Add two new pieces of state alongside the existing `syncing`/`syncResult` state (near line 18-19):
   ```js
   const [showReview, setShowReview] = useState(false)
   const [previewData, setPreviewData] = useState(null)
   const [previewError, setPreviewError] = useState("")
   ```

3. Replace the entire `handleSync` function (currently lines 87-104):
   ```js
   async function handleSync() {
     setSyncing(true)
     setSyncResult(null)
     try {
       // The server derives the user from the bearer token — no userId in body.
       const res = await fetch(`${API_BASE}/api/strava/sync`, {
         method: "POST",
         headers: await authHeaders(),
         body: JSON.stringify({}),
       })
       const result = await res.json()
       setSyncResult(result)
     } catch (err) {
       setSyncResult({ error: err.message })
     } finally {
       setSyncing(false)
     }
   }
   ```
   with:
   ```js
   async function handleSync() {
     setSyncing(true)
     setSyncResult(null)
     setPreviewError("")
     try {
       const res = await fetch(`${API_BASE}/api/strava/sync-preview`, {
         method: "POST",
         headers: await authHeaders(),
         body: JSON.stringify({}),
       })
       const result = await res.json()
       if (!res.ok) throw new Error(result?.error || `Could not load activities (${res.status})`)
       setPreviewData(result)
       setShowReview(true)
     } catch (err) {
       setPreviewError(err.message || "Could not check Strava for new activities.")
     } finally {
       setSyncing(false)
     }
   }

   function handleImported(result) {
     setShowReview(false)
     setPreviewData(null)
     setSyncResult(result)
   }
   ```

4. Update the sync-result display block (currently lines 204-214):
   ```jsx
   {syncResult && (
     <div style={{
       marginTop: 12, fontSize: 12, fontWeight: 700,
       color: syncResult.error ? "#f87171" : "rgba(255,255,255,0.6)",
     }}>
       {syncResult.error
         ? `Sync failed: ${syncResult.error}`
         : `Synced ${syncResult.synced} session${syncResult.synced === 1 ? "" : "s"}, ${syncResult.skipped} skipped${syncResult.errors?.length ? ` (${syncResult.errors.length} error${syncResult.errors.length === 1 ? "" : "s"})` : ""}`
       }
     </div>
   )}
   ```
   with:
   ```jsx
   {previewError && (
     <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: "#f87171" }}>
       {previewError}
     </div>
   )}

   {syncResult && (
     <div style={{
       marginTop: 12, fontSize: 12, fontWeight: 700,
       color: syncResult.error ? "#f87171" : "rgba(255,255,255,0.6)",
     }}>
       {syncResult.error
         ? `Import failed: ${syncResult.error}`
         : `Imported ${syncResult.synced} session${syncResult.synced === 1 ? "" : "s"}${syncResult.failed?.length ? ` (${syncResult.failed.length} failed)` : ""}`
       }
     </div>
   )}
   ```

5. Add the review modal, rendered as a sibling near the end of the component's returned JSX (after the closing `</div>` of the main card, so it isn't nested inside a container with its own `onClick={e => e.stopPropagation()}` boundary that could interfere with its own overlay-click-to-close — same reasoning already applied to `ShareStatCard` inside `SessionRecapModal` earlier this session):
   ```jsx
   {showReview && previewData && (
     <StravaSyncReview
       activities={previewData.activities}
       skippedNonSki={previewData.skippedNonSki}
       onClose={() => { setShowReview(false); setPreviewData(null) }}
       onImported={handleImported}
     />
   )}
   ```
   Concretely: the component currently `return`s a single top-level `<div>...</div>` (lines 132-224). Wrap that return in a fragment and add the modal as a sibling:
   ```jsx
   return (
     <>
       <div style={{ background: "rgba(255,255,255,0.03)", ... }}>
         {/* ...existing content unchanged... */}
       </div>
       {showReview && previewData && (
         <StravaSyncReview
           activities={previewData.activities}
           skippedNonSki={previewData.skippedNonSki}
           onClose={() => { setShowReview(false); setPreviewData(null) }}
           onImported={handleImported}
         />
       )}
     </>
   )
   ```

- [ ] **Step 3: Verify**

```bash
npm run build
```
Must succeed with no new errors.

Trace the flow by hand: `handleSync` → `showReview=true` with real `previewData` → `StravaSyncReview` renders with all activities pre-checked and empty `resortName`s → `Import Selected` button starts disabled (`missingResort` is true whenever any included activity lacks a resort) → picking a resort for every included activity enables the button → `handleImport` posts to `/api/strava/sync-commit` → on success, `onImported(result)` closes the review modal and populates `syncResult`, which Step 2.4's updated display block renders.

Confirm the old `/api/strava/sync` fetch call is fully gone from this file:
```bash
grep -n '"/api/strava/sync"' src/components/StravaConnect.jsx
```
Expected: no matches (only `/api/strava/sync-preview` and the commit call inside `StravaSyncReview.jsx` should reference sync endpoints now).

- [ ] **Step 4: Commit**

```bash
git add src/components/StravaSyncReview.jsx src/components/StravaConnect.jsx
git commit -m "feat: review Strava activities and assign a mountain before import"
```

---

## Post-implementation notes for whoever reviews/merges this

- **This changes the `POST /api/strava/sync` API surface** — it's removed and replaced with `/api/strava/sync-preview` + `/api/strava/sync-commit`. Nothing else in this codebase calls the old endpoint (confirmed via grep before writing this plan), so this is safe, but flag it if any external tooling or documentation references the old route name.
- **Deploy order matters**: this plan's backend and frontend changes must ship together. If the frontend deploys first, "Sync Now" will hit `/api/strava/sync-preview` on a backend that doesn't have it yet (404, surfaced via the now-standard real-error-text pattern rather than a crash). If the backend deploys first, the old frontend still calls `/api/strava/sync`, which will now 404. Given this session's Render backend needs a manual "Deploy latest commit" click (confirmed earlier — it does not appear to auto-deploy reliably), remember to trigger that after pushing.
- **Season-window choice**: the preview only looks at the current ski season (Oct 1 onward, matching `getCurrentSeason()`'s existing logic elsewhere in the app). A user with unsynced ski activities from a *previous* season won't see them in this preview. That's the tradeoff you chose during design (bounding a first-time sync's list size) — worth remembering if someone reports "my old activities aren't showing up."
- **`hasStats()` now has two independent copies** (`ProfilePage.jsx`'s existing one, `SessionEditForm.jsx`'s new one) — same logic, deliberately duplicated rather than shared across files for a 3-line check, consistent with this codebase's existing `formatMinutes()` precedent. Not a bug if you notice it during review.
