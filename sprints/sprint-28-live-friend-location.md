# Sprint 28 — Live Friend Location Sharing

**Goal:** ROADMAP TASK 9.2 — opt-in, real-time friend location pins on the map during an active ski session, plus a "N friends on mountain now" count on Home.
**Estimated effort:** 1.5 days
**Depends on:** `sprints/sprint-3-gps-tracker-hook.md` AND `sprints/sprint-4-active-session-ui.md` **both fully executed and merged first.** ROADMAP itself states this task depends on GPS tracking (9.1) being complete — this plan additionally requires sprint-4's Active Session UI specifically, since the "Share my location" toggle lives in the Session Sheet that sprint-4 builds, which doesn't exist in this codebase yet. **Do not start this sprint until both are merged** — the sender-side integration code below is written against sprint-4's documented design and will need adaptation to whatever sprint-4 actually shipped by the time you do this work.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**Supabase Realtime is already used extensively in this codebase — but only via `postgres_changes` subscriptions** (6 components: `MessagingCenter.jsx`, `HomeDashboard.jsx`, `DirectMessageView.jsx`, `NotificationBell.jsx`, `CrewGroupChat.jsx`, `TripChatView.jsx`), all listening for DB row changes. **This sprint introduces Realtime Broadcast** (ephemeral pub/sub, not tied to a DB row) for the first time in this codebase — the right primitive for "push my GPS position every 30 seconds" since there's no need or desire to persist a location history row per update. Existing example of the channel-subscribe/cleanup pattern to match structurally (`NotificationBell.jsx`):
```js
const channel = supabase.channel("notifications-count").on("postgres_changes", {...}, handler).subscribe()
return () => { supabase.removeChannel(channel) }
```
Same subscribe/cleanup shape, different `.on(...)` event type (`"broadcast"` instead of `"postgres_changes"`).

**`src/components/PowderMap.jsx`** (284 lines) — `export default function PowderMap({ resorts, skierCounts = {}, skierDetails = {} })`, renders resort `CircleMarker`s inside a single `MapContainer` (Leaflet). This sprint adds a second marker layer for live friend pins.

**Privacy model (from ROADMAP, non-negotiable):** location is only ever visible to accepted friends, never public. Broadcasting stops immediately when the session ends or the toggle is switched off — don't rely solely on a staleness timeout for this; send an explicit "stopped" event.

---

## Tasks

S28-T1 (shared hook, receiver side) has no dependency beyond the sprint-level prerequisite. S28-T2 (sender side, wired into sprint-4's Session Sheet) depends on sprint-4 existing. S28-T3 (`PowderMap.jsx` pin layer) depends on S28-T1. S28-T4 (Home "N friends on mountain now" count) depends on S28-T1.

---

### S28-T1 — `useLiveFriendLocations` hook (receiver side)

**File to create:** `src/lib/useLiveFriendLocations.js`

```js
import { useState, useEffect, useRef } from "react"
import { supabase } from "./supabase"

const STALE_MS = 90 * 1000

export function useLiveFriendLocations(friendIds) {
  const [locations, setLocations] = useState({}) // { [userId]: { lat, lng, name, avatar_url, updatedAt } }

  useEffect(() => {
    const channels = (friendIds || []).map((friendId) =>
      supabase
        .channel(`mountain:live:${friendId}`)
        .on("broadcast", { event: "position" }, ({ payload }) => {
          setLocations((prev) => ({ ...prev, [friendId]: { ...payload, updatedAt: Date.now() } }))
        })
        .on("broadcast", { event: "stopped" }, () => {
          setLocations((prev) => {
            const next = { ...prev }
            delete next[friendId]
            return next
          })
        })
        .subscribe()
    )
    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch))
    }
  }, [JSON.stringify(friendIds)])

  // Safety net: drop a friend's pin if their session died without sending "stopped"
  // (app crash, connection loss) — don't let a stale pin linger indefinitely.
  useEffect(() => {
    const interval = setInterval(() => {
      setLocations((prev) => {
        const now = Date.now()
        const next = {}
        for (const [id, loc] of Object.entries(prev)) {
          if (now - loc.updatedAt < STALE_MS) next[id] = loc
        }
        return next
      })
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  return locations
}
```
Subscribing to a friend's channel when they aren't currently broadcasting is harmless and cheap (no events ever arrive on that channel) — this hook subscribes to **every** accepted friend's channel unconditionally rather than first checking who's "active," keeping the design simple and avoiding a separate active-session-tracking table.

**Acceptance criteria:**
- Returns an object keyed by friend user ID, only containing friends who have broadcast a `"position"` event within the last 90 seconds.
- A `"stopped"` broadcast immediately removes that friend's entry, not waiting for the staleness timeout.
- Cleans up all channel subscriptions when `friendIds` changes or the consuming component unmounts.

---

### S28-T2 — Sender side: "Share my location" toggle in the Session Sheet

**File to modify:** whatever component sprint-4 built for the active-session "Session Sheet" (per sprint-4's plan, this is inside `ActiveSessionBar.jsx` or a related component it renders — locate the actual file/component once sprint-4 has landed, the exact name may differ from this sketch).

```js
import { useState, useEffect, useRef } from "react"
import { supabase } from "../lib/supabase"

// inside the session sheet component, alongside its other session controls:
const [sharingLocation, setSharingLocation] = useState(false)
const channelRef = useRef(null)
const watchIdRef = useRef(null)
const intervalRef = useRef(null)

useEffect(() => {
  function stopSharing() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
    if (channelRef.current) {
      channelRef.current.send({ type: "broadcast", event: "stopped", payload: {} })
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }

  if (!sharingLocation) {
    stopSharing()
    return
  }

  const channel = supabase.channel(`mountain:live:${currentUser.id}`)
  channel.subscribe()
  channelRef.current = channel

  function broadcastPosition(position) {
    channel.send({
      type: "broadcast",
      event: "position",
      payload: {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        name: currentUser.full_name || currentUser.username,
        avatar_url: currentUser.avatar_url,
      },
    })
  }

  navigator.geolocation.getCurrentPosition(broadcastPosition, () => {}, { enableHighAccuracy: false })
  intervalRef.current = setInterval(() => {
    navigator.geolocation.getCurrentPosition(broadcastPosition, () => {}, { enableHighAccuracy: false })
  }, 30000)

  return stopSharing
}, [sharingLocation])
```
This uses `getCurrentPosition` on a 30-second interval (matching ROADMAP's "broadcast position every 30s") rather than `watchPosition`'s continuous stream, to match the exact cadence specified and avoid over-broadcasting. Add a toggle UI element (checkbox or switch, matching whatever control style sprint-4 used for its other Session Sheet toggles) bound to `sharingLocation`.

**Gate on permission** — before enabling, request geolocation permission the same way sprint-3's `useGpsTracker.js` does (reuse that existing permission-prompt pattern rather than writing a second one), and show "GPS tracking requires location permission" if denied, matching ROADMAP TASK 9.1's existing UX for the same underlying browser permission.

**Acceptance criteria:**
- Toggling on starts broadcasting the user's position every 30 seconds on their own `mountain:live:{userId}` channel.
- Toggling off, or the session ending (verify this hook's cleanup fires when the parent Session Sheet/session unmounts — wire the session's own end-of-day logic to also flip `sharingLocation` to `false` if it isn't already, so ending a session always stops broadcasting even if the user forgot to toggle it off first), sends a `"stopped"` event and tears down the channel.
- No location is ever written to a database table — this is purely ephemeral broadcast, matching the privacy model (nothing to leak from a table an RLS policy might get wrong).

---

### S28-T3 — Friend pins on `PowderMap.jsx`

**File to modify:** `src/components/PowderMap.jsx`

**Step 1 — Get the current user's friend ID list** and pass it (or the hook's output) into `PowderMap` as a new prop from `App.jsx` (wherever `PowderMap` is currently rendered/imported):
```jsx
// App.jsx, wherever <PowderMap resorts={...} .../> is rendered:
<PowderMap resorts={rows} skierCounts={skierCounts} skierDetails={skierDetails} friendIds={acceptedFriendIds} />
```
`acceptedFriendIds` should come from wherever `App.jsx` already has friend data available, or be fetched fresh via `getAcceptedFriends()` if not already present at this level.

**Step 2 — Use the hook inside `PowderMap`:**
```jsx
import { useLiveFriendLocations } from "../lib/useLiveFriendLocations"

export default function PowderMap({ resorts, skierCounts = {}, skierDetails = {}, friendIds = [] }) {
  const liveLocations = useLiveFriendLocations(friendIds)
  // ...existing state/logic
```

**Step 3 — Render a pin per live friend**, alongside the existing resort `CircleMarker` loop (matching that same `key`/`center`/`pathOptions`/`Popup` shape, per the existing convention):
```jsx
{Object.entries(liveLocations).map(([friendId, loc]) => (
  <CircleMarker
    key={`friend-${friendId}`}
    center={[loc.lat, loc.lng]}
    radius={10}
    pathOptions={{ color: "#fbbf24", fillColor: "#fbbf24", fillOpacity: 0.9, weight: 2 }}
  >
    <Popup>{loc.name || "Friend"} — on the mountain now</Popup>
  </CircleMarker>
))}
```
A labeled avatar-initial marker (per ROADMAP: "avatar initial + name") is a nicer visual than a plain circle — if you want to go further than the minimum, use Leaflet's `Marker` with a custom `divIcon` rendering the friend's initial in a colored circle instead of `CircleMarker`; either satisfies the acceptance criteria below, the avatar-initial version is just a polish upgrade.

**Acceptance criteria:**
- Friends actively sharing their location appear as distinct pins on the map, visually different from resort markers.
- Pins disappear within ~90 seconds of a friend stopping their session/toggle (via the hook's staleness cleanup, or immediately via the `"stopped"` event).
- A user with zero friends actively sharing sees no friend pins, no error.

---

### S28-T4 — "N friends on mountain now" on Home

**File to modify:** `src/components/HomeDashboard.jsx` (specifically, sprint-10's `WhosSkiingTodayCard`, if that sprint has landed — otherwise add this count wherever Home's crew-activity card lives)

```jsx
import { useLiveFriendLocations } from "../lib/useLiveFriendLocations"

// inside WhosSkiingTodayCard (or equivalent), given it already has access to friend IDs or can fetch them:
const liveLocations = useLiveFriendLocations(friendIds)
const liveCount = Object.keys(liveLocations).length

// render, e.g. near the top of the card:
{liveCount > 0 && (
  <div style={{ fontSize: 12, color: "var(--color-accent)", fontWeight: 700 }}>
    📍 {liveCount} friend{liveCount === 1 ? "" : "s"} on the mountain right now
  </div>
)}
```

**Acceptance criteria:**
- Shows the live count only when > 0.
- Count updates in near-real-time as friends start/stop sharing (driven by the same hook's state, no polling needed).

**Verify in browser (requires 2 test accounts, friends with each other):**
```bash
npm run dev
```
On device/session A (logged in as user A, friends with B): start a session (once sprint-4 exists) and toggle "Share my location" on. On device/session B: open the Map tab, confirm A's pin appears; open Home, confirm the "N friends on mountain now" count shows 1. Toggle off on A (or end the session), confirm both disappear on B within the expected timeframe.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add src/lib/useLiveFriendLocations.js src/components/PowderMap.jsx src/components/HomeDashboard.jsx src/App.jsx
git commit -m "feat: add opt-in live friend location sharing on the map"
```

(Include whatever sprint-4 component file S28-T2 actually modified in this commit too.)

---

## Sprint Acceptance Criteria

- [ ] `useLiveFriendLocations(friendIds)` hook exists, using Realtime Broadcast (not `postgres_changes`), with correct cleanup and staleness handling
- [ ] Sender-side toggle broadcasts position every 30s while enabled, sends an explicit "stopped" event on disable/session-end
- [ ] No location data is ever persisted to a database table
- [ ] `PowderMap.jsx` renders live friend pins, visually distinct from resort markers
- [ ] Home shows a live "N friends on mountain now" count
- [ ] `npm run build` succeeds
- [ ] Verified end-to-end with 2 friended test accounts

## Out of Scope for This Sprint

- Any persistence of location history (explicitly ephemeral/broadcast-only, by design, for privacy).
- Showing friend pins to non-friends under any circumstance.
- A "find me at the base" feature for users who haven't started a session yet (Slopes has this; PowderDays' scope here is limited to active-session sharing only, per ROADMAP TASK 9.2's literal text).
</content>
