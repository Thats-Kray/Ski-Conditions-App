# Sprint 4 — Active Session UI

**Goal:** The full in-day tracking UI — "Start My Day" on Home, a persistent floating session bar, an expandable session sheet, and the end-of-session recap modal.  
**Estimated effort:** 2–3 days  
**Depends on:** Sprint 3 fully merged. The following must exist:
- `migrations/010_ski_runs.sql` applied to Supabase (adds new `ski_sessions` columns + `ski_runs` table)
- `src/lib/geoMath.js` with all 7 exports
- `src/lib/useGpsTracker.js` with `useGpsTracker`, `computeSegmentStats`, `computeSessionSummary`
- `src/lib/leaderboardApi.js` with `flushSessionToSupabase`

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**Stack:**
- Frontend: React 19 + Vite, deployed on Vercel
- Database: Supabase (Postgres) — client at `src/lib/supabase.js`
- Backend API: Railway (`VITE_API_URL` env var, defaults to `http://localhost:8787`)

**Key files you will read before editing:**

- `src/App.jsx` — the root component. Has `currentUser` state (Supabase user object), `activeTab` state, `BottomNav`, `TopNav`, and renders tab content. **You will wire `ActiveSessionBar` and session state into this file.** Read it fully before editing.
- `src/components/HomeDashboard.jsx` — the Home tab. Has `useMobile`, renders crew/trip/resort summary cards. **You will add the "Start My Day" CTA here.** Read it fully before editing — it receives `resorts`, `currentUser`, `onTabChange` as props from `App.jsx`.

**Design system (Blizzard theme):**
- Background: `#04080f`
- Accent: `#38bdf8` (ice blue)
- Surface: `rgba(255,255,255,0.04–0.08)` with `rgba(255,255,255,0.08–0.14)` borders
- Radius: cards use `20–24px`, buttons `12–14px`, pills `999px`
- Font: system-ui, weights 700/800/900
- All inline styles — no separate CSS files. Match the existing `style={{...}}` pattern throughout.

**How `logSkiDay()` works** (in `leaderboardApi.js`):
```js
logSkiDay({ resortName, sessionDate, isPowderDay, notes, tripId })
// returns the created ski_sessions row including its UUID `id`
```
You will call this to create the session record when the user starts their day. The returned `id` is what you pass to `flushSessionToSupabase` at the end.

---

## Tasks

S4-T1 and S4-T2 can be developed together (same file). S4-T3 is independent. S4-T4 must go last — it wires everything into `App.jsx` and `HomeDashboard.jsx`.

---

### S4-T1 — `ActiveSessionBar.jsx` — Floating persistent bar

**File to create:** `src/components/ActiveSessionBar.jsx`

A fixed-position floating bar at the bottom of the screen (above the bottom nav). Visible only when a session is active. Tapping it opens the Session Sheet (S4-T2, built in the same component).

**Props:**
```
activeSession: {
  id: string,           // ski_sessions UUID
  resortName: string,
  startedAt: number,    // ms epoch
}
tracker: {              // return value of useGpsTracker()
  status, permissionError, currentSegmentType,
  runCount, liftCount, currentSpeedMph, gpsAccuracy,
  pauseTracking, resumeTracking, stopTracking
}
onSessionEnd: (finalSegments: Array) => void   // called after stopTracking()
```

**Elapsed time:** Compute with `Date.now() - activeSession.startedAt`, update every second using `setInterval`.

**GPS status dot:**
- Green: `gpsAccuracy < 20m`
- Orange: `gpsAccuracy 20–50m`
- Red/pulsing: `status === 'error'` or `gpsAccuracy > 50m`
- Gray: `status === 'requesting'`

**Floating bar layout (always visible while session is active):**
```
┌─────────────────────────────────────────────────────────┐
│  ● Active   2h 14m   ⛷ 8 runs   [current speed: 34 mph] ▲ │
└─────────────────────────────────────────────────────────┘
```
- Fixed position: `bottom: calc(64px + env(safe-area-inset-bottom))` — sits above the BottomNav
- Background: `rgba(4,8,15,0.92)` with `backdrop-filter: blur(16px)`, `border-top: 1px solid rgba(56,189,248,0.25)`
- Tapping the bar (not the End button) opens the Sheet (see S4-T2)

**End session button:** Small "End Day" button on the right of the bar. Tapping calls `stopTracking()` (which returns `finalSegments`), then calls `onSessionEnd(finalSegments)`.

**Acceptance criteria:**
- Bar renders at fixed bottom position, above BottomNav
- Shows elapsed time, counting up every second
- Shows run count from `tracker.runCount`
- Shows live speed if `currentSpeedMph > 0`
- GPS status dot color reflects accuracy
- Tapping the bar (anywhere except End button) toggles the Session Sheet open/closed
- "End Day" calls `stopTracking()` and forwards segments to `onSessionEnd`

---

### S4-T2 — Session Sheet (add to `ActiveSessionBar.jsx`)

The Session Sheet slides up from the floating bar when tapped. Implemented as state within `ActiveSessionBar.jsx`.

**Sheet contents:**

```
┌──────────────────────────────────────────────┐
│  ⛷ Skiing at Breckenridge         [× Close]  │
│                                               │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐      │
│  │  Runs   │  │  Lifts  │  │ Vertical│      │
│  │   8     │  │   7     │  │ ~2,400ft│      │
│  └─────────┘  └─────────┘  └─────────┘      │
│                                               │
│  Current: run  ↓ 34 mph                      │
│  GPS: ● 12m accuracy                         │
│                                               │
│  [⏸ Pause GPS]         [🔴 End My Day]        │
└──────────────────────────────────────────────┘
```

**Vertical estimate:** Not from GPS yet (that's the post-session flush). Show a rough running estimate: sum of all closed `run` segments' vertical from `computeSegmentStats`. Since the sheet is a live view, compute this from `tracker.segments` on each render:

```js
import { computeSegmentStats } from "../lib/useGpsTracker"

const estimatedVertical = tracker.segments
  .filter(s => s.type === "run")
  .reduce((acc, seg, idx) => {
    const stats = computeSegmentStats(seg, idx + 1)
    return acc + (stats?.vertical_ft ?? 0)
  }, 0)
```

**Pause GPS toggle:** Calls `tracker.pauseTracking()` / `tracker.resumeTracking()`. When paused, button label becomes "▶ Resume GPS" and the GPS dot goes gray.

**"End My Day" button:** Same as the bar's End button — stops tracking and fires `onSessionEnd`.

**Sheet animation:** Slide up from bottom. Use CSS transition on `max-height` from `0` to `360px`, or `transform: translateY`. Keep it simple — no external animation library.

**Acceptance criteria:**
- Sheet is hidden by default, shown when bar is tapped
- Stat tiles show run count, lift count, estimated vertical
- Current segment type and speed shown
- GPS accuracy shown in meters
- Pause/Resume toggle works (calls correct tracker method)
- "End My Day" closes sheet and ends session

---

### S4-T3 — `SessionRecapModal.jsx` — End-of-session summary

**File to create:** `src/components/SessionRecapModal.jsx`

Shown after the user ends their day. Receives the processed session data from Supabase (the result of `flushSessionToSupabase`).

**Props:**
```
session: {                // ski_sessions row from flushSessionToSupabase result
  resort_name, session_date, runs_logged, lifts_ridden,
  top_speed_mph, time_on_mountain_min, longest_run_ft, session_started_at, session_ended_at
}
runs: Array               // ski_runs rows from flushSessionToSupabase result
onClose: () => void
stravaConnected: boolean  // whether to show "Post to Strava" (wired in Sprint 5)
onPostToStrava: () => void // called when "Post to Strava" is tapped (wired in Sprint 5)
```

**Layout:**

```
┌─────────────────────────────────────────────────────┐
│  🎿 Day Complete                            [× Close]│
│                                                      │
│  Breckenridge · Jan 15                               │
│                                                      │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐               │
│  │ 8    │ │7 lft │ │38mph │ │4h 2m │               │
│  │ Runs │ │Lifts │ │ Top  │ │ Time │               │
│  └──────┘ └──────┘ └──────┘ └──────┘               │
│                                                      │
│  Run Breakdown (collapsible ▾)                       │
│  Run 1 · 1,240ft · 0.8mi · 38 mph                   │
│  Run 2 · 980ft  · 0.6mi · 31 mph                    │
│  ...                                                 │
│                                                      │
│  [📤 Share]    [Post to Strava]    [Done]            │
└─────────────────────────────────────────────────────┘
```

**Run breakdown:** List only `run` type rows. Each row: `Run N · {vertical_ft}ft · {distance_mi}mi · {speed_max_mph} mph`. Collapsed by default, toggle on tap.

**"Share" button:** Uses `navigator.share()` if available (mobile Safari), otherwise falls back to copying text. Share text:
```
Just skied Breckenridge! 8 runs, 38 mph top speed, 4h on mountain 🎿❄️ #PowderDays
```

**"Post to Strava" button:** Only shown if `stravaConnected === true`. Calls `onPostToStrava()`. The actual implementation is wired in Sprint 5 — for now it just calls the prop.

**"Done" button:** Calls `onClose()`.

**Modal overlay:** Full-screen backdrop `rgba(4,8,15,0.85)`, modal centered, max-width 500px, `overflow-y: auto`, `border-radius: 24px`. Same glass card style as existing modals in the app.

**Acceptance criteria:**
- Modal renders with all 4 stat tiles
- Run breakdown is collapsible
- "Share" calls `navigator.share()` on mobile, copies text fallback on desktop
- "Post to Strava" is hidden when `stravaConnected === false`
- "Done" calls `onClose()`
- Modal is scrollable on short screens

---

### S4-T4 — Wire session state into `App.jsx` + "Start My Day" on `HomeDashboard.jsx`

**Files to modify:** `src/App.jsx`, `src/components/HomeDashboard.jsx`

**Part A — `App.jsx` additions:**

Read `App.jsx` fully. Find the area where `HomeDashboard` is rendered (around line 1426). You will:

1. Add session state near the top of the `App()` component function, alongside the existing state declarations:
```js
const [activeSession, setActiveSession] = useState(null)
// activeSession shape: { id: string, resortName: string, startedAt: number } | null

const [recapData, setRecapData] = useState(null)
// recapData shape: { session, runs } | null — returned by flushSessionToSupabase
```

2. Add imports at the top of `App.jsx`:
```js
import ActiveSessionBar from "./components/ActiveSessionBar"
import SessionRecapModal from "./components/SessionRecapModal"
import { flushSessionToSupabase } from "./lib/leaderboardApi"
import { useGpsTracker } from "./lib/useGpsTracker"
```

3. Call the hook inside `App()`:
```js
const tracker = useGpsTracker()
```

4. Add `handleSessionStart` function:
```js
async function handleSessionStart(resortName) {
  const today = new Date().toISOString().slice(0, 10)
  // Create the ski_sessions row before starting GPS (we need the ID)
  const session = await logSkiDay({ resortName, sessionDate: today })
  tracker.startTracking()
  setActiveSession({ id: session.id, resortName, startedAt: Date.now() })
}
```
Note: `logSkiDay` is already imported in `App.jsx`'s context but lives in `leaderboardApi.js`. Check that import — add it if missing.

5. Add `handleSessionEnd` function:
```js
async function handleSessionEnd(finalSegments) {
  if (!activeSession) return
  try {
    const result = await flushSessionToSupabase({
      sessionId:    activeSession.id,
      rawSegments:  finalSegments,
      startedAt:    new Date(activeSession.startedAt).toISOString(),
      endedAt:      new Date().toISOString(),
    })
    setRecapData(result)
  } catch (err) {
    console.error("Session flush failed:", err)
    // Still clear the active session even on error
  }
  setActiveSession(null)
}
```

6. In the JSX return, add `ActiveSessionBar` and `SessionRecapModal` directly inside the outer wrapping `<div>` (the one with `minHeight: "100vh"` and background gradient), BEFORE `<TopNav>`. Place them at the root level so they layer above all tab content:
```jsx
{activeSession && (
  <ActiveSessionBar
    activeSession={activeSession}
    tracker={tracker}
    onSessionEnd={handleSessionEnd}
  />
)}

{recapData && (
  <SessionRecapModal
    session={recapData.session}
    runs={recapData.runs}
    onClose={() => setRecapData(null)}
    stravaConnected={false}  // wired in Sprint 5
    onPostToStrava={() => {}}
  />
)}
```

7. Pass `onStartSession` down to `HomeDashboard`:
```jsx
<HomeDashboard
  resorts={rows}
  currentUser={currentUser}
  onTabChange={setActiveTab}
  onStartSession={handleSessionStart}   {/* ← add this */}
  sessionActive={!!activeSession}       {/* ← add this */}
/>
```

**Part B — `HomeDashboard.jsx` additions:**

Read `HomeDashboard.jsx` fully. Find where the component's content begins and add a "Start My Day" section near the top of the Home content — **above the first card**.

Add the new prop to the component signature:
```js
export default function HomeDashboard({ resorts, currentUser, onTabChange, onStartSession, sessionActive }) {
```

Add the "Start My Day" CTA block — only shown when `currentUser` is logged in and `!sessionActive`:

```jsx
{currentUser && !sessionActive && (
  <div style={{
    background: "linear-gradient(135deg, rgba(56,189,248,0.12), rgba(2,132,199,0.08))",
    border: "1px solid rgba(56,189,248,0.25)",
    borderRadius: 20,
    padding: "16px 20px",
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  }}>
    <div>
      <div style={{ fontWeight: 900, fontSize: 15, color: "white" }}>Ready to ski?</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
        Track your runs, vertical, and speed
      </div>
    </div>
    <button
      onClick={() => {
        // Use top-ranked open resort as default, user can change later
        const topResort = resorts
          .filter(r => r.isOpen !== false && r.powderScore != null)
          .sort((a, b) => (b.powderScore ?? -1) - (a.powderScore ?? -1))[0]
        onStartSession(topResort?.name ?? "Unknown Resort")
      }}
      style={{
        background: "linear-gradient(135deg, #0284c7, #38bdf8)",
        border: "none",
        borderRadius: 14,
        padding: "12px 20px",
        color: "white",
        fontWeight: 900,
        fontSize: 14,
        cursor: "pointer",
        flexShrink: 0,
        boxShadow: "0 4px 16px rgba(56,189,248,0.3)",
      }}
    >
      Start My Day ⛷
    </button>
  </div>
)}
```

When `sessionActive === true`, show a subtle "Session in progress" indicator instead:
```jsx
{currentUser && sessionActive && (
  <div style={{
    background: "rgba(34,197,94,0.08)",
    border: "1px solid rgba(34,197,94,0.2)",
    borderRadius: 14,
    padding: "10px 16px",
    marginBottom: 16,
    fontSize: 13,
    color: "#4ade80",
    fontWeight: 700,
  }}>
    ● Session active — tracking your day
  </div>
)}
```

**Acceptance criteria:**
- `App.jsx` has `activeSession` and `recapData` state
- `useGpsTracker()` is called once at the `App` level
- `ActiveSessionBar` is rendered at the root level (not inside any tab), invisible when no active session
- `SessionRecapModal` appears after session end + successful flush
- `HomeDashboard` shows "Start My Day" CTA when logged in and no active session
- "Start My Day" creates a `ski_sessions` row, starts GPS, sets `activeSession` state
- Session bar persists across tab navigation (because it's in `App.jsx`, not inside a tab)
- `logSkiDay` import is verified in `App.jsx` (add it to the existing import from `leaderboardApi.js` if missing)

---

## Sprint-Level Acceptance Criteria

- [ ] `src/components/ActiveSessionBar.jsx` renders floating bar with elapsed time, runs, speed, GPS dot
- [ ] Tapping the bar opens Session Sheet with stat tiles + pause/end controls
- [ ] `src/components/SessionRecapModal.jsx` renders stat tiles, run breakdown, share + strava buttons
- [ ] `App.jsx` holds `activeSession` state and `useGpsTracker()` at root level
- [ ] Session bar persists across tab changes (Home → Snow → Plans etc.)
- [ ] "Start My Day" on Home creates session record, starts GPS tracking
- [ ] Session end flushes GPS data to Supabase and shows recap modal
- [ ] "Share" on recap modal uses `navigator.share()` or copies text fallback

## Out of Scope for This Sprint

- "Post to Strava" implementation (that's Sprint 5) — render the button but it's a no-op
- GPS map visualization / route replay on the map (that's a later ROADMAP task)
- Share card image generation (`html2canvas`) — text share only for now
- Resort picker during session start — always use the top-ranked open resort as default; user can update the session's resort name later from profile history
- Do not modify `PowderMap.jsx`
- Do not modify `ProfilePage.jsx`
