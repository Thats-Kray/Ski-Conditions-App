# Sprint 2 — Strava Activity Sync + Profile UI

**Goal:** Import a user's past Strava ski/snowboard activities into PowderDays sessions, handle new activities via webhook, and surface the connected state in the Profile UI.  
**Estimated effort:** 2–3 days  
**Depends on:** Sprint 1 fully merged. `migrations/016_strava_tokens.sql` has been run against Supabase. `server/routes/strava.js` exists with `getValidStravaToken` exported. `server/index.js` mounts the Strava router.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**Stack:**
- Frontend: React 19 + Vite, deployed on Vercel. Uses `@supabase/supabase-js` client at `src/lib/supabase.js`.
- Backend API: Express (ES modules) at `server/index.js`, deployed on Railway. `@supabase/supabase-js` was added in Sprint 1.
- Database: Supabase (Postgres). Migrations at project root `migrations/`, numbered `001`–`016`. This sprint adds `017`.

**What Sprint 1 built (assume it exists):**
- `migrations/016_strava_tokens.sql` — added `strava_athlete_id`, `strava_access_token`, `strava_refresh_token`, `strava_token_expires_at` to `profiles` table
- `server/routes/strava.js` — Express Router mounted at root, exports `getValidStravaToken(userId)` helper
- OAuth flow working: `GET /api/strava/auth` + `GET /api/strava/callback`

**Key existing files you will read and modify:**
- `src/components/ProfilePage.jsx` — Profile UI. You will add a "Connected Apps" section. Read this file before editing. Do not restructure the whole component — surgically add the section.
- `src/lib/socialApi.js` — has `getCurrentUser()` and `getAcceptedFriends()`. Use `getCurrentUser()` to get the current Supabase user.
- `src/lib/supabase.js` — exports the Supabase client as `supabase`.
- `server/routes/strava.js` — you will add new routes to this file.

**Environment variables (already configured in Railway from Sprint 1):**
- `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_URL`

New env var needed for webhook verification:
- `STRAVA_WEBHOOK_VERIFY_TOKEN` — a secret string you choose, registered with Strava when setting up the webhook subscription. Store in Railway + local `.env`.

---

## Tasks

**Parallelizable:** S2-T1 (migration), S2-T2 (sync service), S2-T4 (StravaConnect component) can all start simultaneously.  
**Sequential dependencies:**
- S2-T3 (webhook handler) depends on S2-T2 (needs the sync function)
- S2-T5 (wire into ProfilePage) depends on S2-T4 (needs the component)

---

### S2-T1 — Migration: `strava_activity_id` on `ski_sessions`

**File to create:** `migrations/017_strava_session_link.sql`

```sql
ALTER TABLE ski_sessions
  ADD COLUMN IF NOT EXISTS strava_activity_id BIGINT UNIQUE;

COMMENT ON COLUMN ski_sessions.strava_activity_id IS
  'Strava activity ID. Set when a session is synced from or uploaded to Strava. UNIQUE prevents duplicate imports.';
```

The `UNIQUE` constraint is the deduplication guard — if we try to upsert the same Strava activity twice, Postgres rejects the second insert cleanly.

**Acceptance criteria:**
- `migrations/017_strava_session_link.sql` exists
- Running it adds `strava_activity_id BIGINT UNIQUE` to `ski_sessions`
- Re-running is safe (uses `IF NOT EXISTS`)

**Out of scope:** Do not modify any other tables or existing columns.

---

### S2-T2 — Strava Sync Service

**File to create:** `server/services/stravaSync.js`

This service fetches a user's ski/snowboard activities from the Strava API and upserts them into `ski_sessions`. It is called by two consumers: the manual "Sync Now" endpoint (Sprint 2, S2-T3) and the webhook handler (Sprint 2, S2-T3).

**Field mapping — Strava activity → `ski_sessions` row:**

| Strava field | `ski_sessions` column | Notes |
|---|---|---|
| `start_date` (ISO string) | `session_date` | Date only: `start_date.slice(0, 10)` |
| `name` | `notes` | The activity title the user gave it in Strava |
| `id` | `strava_activity_id` | Bigint |
| `total_elevation_gain` | `vertical_ft` | Strava gives meters; convert: `Math.round(m * 3.28084)` |
| `distance` | `miles_skied` | Strava gives meters; convert: `Math.round((m / 1609.34) * 10) / 10` |
| `moving_time` | `time_on_mountain_min` | Strava gives seconds; convert: `Math.round(s / 60)` |
| `max_speed` | `top_speed_mph` | Strava gives m/s; convert: `Math.round(mps * 2.23694 * 10) / 10` |
| `average_speed` | `avg_speed_mph` | Same m/s → mph conversion |
| `sport_type` | — | Used for filtering only — not stored |

**Activity types to sync:** `AlpineSki`, `BackcountrySki`, `Snowboard`, `NordicSki`, `Snowshoe`

**Resort name:** Strava doesn't provide the resort name. Set `resort_name` to `"Strava Import"` for all synced activities. Users can edit it later. This is a known limitation — document it in a comment.

**Implementation:**

```js
import { createClient } from "@supabase/supabase-js"
import { getValidStravaToken } from "../routes/strava.js"

const SKI_SPORT_TYPES = new Set([
  "AlpineSki", "BackcountrySki", "Snowboard", "NordicSki", "Snowshoe"
])

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

function metersToFeet(m) {
  return m != null ? Math.round(m * 3.28084) : null
}

function metersToMiles(m) {
  return m != null ? Math.round((m / 1609.34) * 10) / 10 : null
}

function mpsToMph(mps) {
  return mps != null ? Math.round(mps * 2.23694 * 10) / 10 : null
}

function activityToSession(activity, userId) {
  return {
    user_id:             userId,
    // Strava doesn't provide resort name — user can update later
    resort_name:         "Strava Import",
    session_date:        activity.start_date.slice(0, 10),
    notes:               activity.name || null,
    strava_activity_id:  activity.id,
    vertical_ft:         metersToFeet(activity.total_elevation_gain),
    miles_skied:         metersToMiles(activity.distance),
    time_on_mountain_min: activity.moving_time ? Math.round(activity.moving_time / 60) : null,
    top_speed_mph:       mpsToMph(activity.max_speed),
    avg_speed_mph:       mpsToMph(activity.average_speed),
    is_powder_day:       false,
  }
}

/**
 * Syncs all ski/snowboard activities for a user from Strava.
 * Returns { synced, skipped, errors } counts.
 */
export async function syncUserActivities(userId) {
  const accessToken = await getValidStravaToken(userId)
  const supabase = getSupabase()

  let page = 1
  let synced = 0
  let skipped = 0
  const errors = []

  while (true) {
    const url = `https://www.strava.com/api/v3/athlete/activities?per_page=100&page=${page}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      throw new Error(`Strava API error ${res.status} on page ${page}`)
    }

    const activities = await res.json()

    // Empty page = we've fetched everything
    if (!activities.length) break

    const skiActivities = activities.filter(a => SKI_SPORT_TYPES.has(a.sport_type))
    skipped += activities.length - skiActivities.length

    for (const activity of skiActivities) {
      const row = activityToSession(activity, userId)

      const { error } = await supabase
        .from("ski_sessions")
        .upsert(row, {
          onConflict: "strava_activity_id",
          ignoreDuplicates: false,  // update existing rows on re-sync
        })

      if (error) {
        errors.push({ activityId: activity.id, message: error.message })
      } else {
        synced++
      }
    }

    page++
  }

  return { synced, skipped, errors }
}

/**
 * Syncs a single Strava activity by ID.
 * Used by the webhook handler for new activity events.
 */
export async function syncSingleActivity(userId, stravaActivityId) {
  const accessToken = await getValidStravaToken(userId)
  const supabase = getSupabase()

  const res = await fetch(`https://www.strava.com/api/v3/activities/${stravaActivityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) throw new Error(`Strava activity fetch failed: ${res.status}`)

  const activity = await res.json()

  if (!SKI_SPORT_TYPES.has(activity.sport_type)) {
    return { skipped: true, reason: `Not a ski activity: ${activity.sport_type}` }
  }

  const row = activityToSession(activity, userId)
  const { error } = await supabase
    .from("ski_sessions")
    .upsert(row, { onConflict: "strava_activity_id", ignoreDuplicates: false })

  if (error) throw new Error(error.message)
  return { synced: true }
}
```

**Acceptance criteria:**
- `server/services/stravaSync.js` exports `syncUserActivities(userId)` and `syncSingleActivity(userId, stravaActivityId)`
- `syncUserActivities` paginates through all pages (100 per page) until an empty page
- Only ski/snowboard types are upserted; other activity types are skipped
- Uses `strava_activity_id` as the upsert conflict key — running twice doesn't duplicate rows
- Unit conversions are correct: meters → feet, meters → miles, m/s → mph
- Returns `{ synced, skipped, errors }` with per-activity error detail

---

### S2-T3 — Sync Endpoint + Webhook Handler

**File to modify:** `server/routes/strava.js`

Add three routes to the existing Strava router.

**Route 1 — `POST /api/strava/sync` — Manual full sync:**

```js
import { syncUserActivities } from "../services/stravaSync.js"

router.post("/api/strava/sync", async (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: "userId is required" })

  try {
    const result = await syncUserActivities(userId)
    res.json(result)
  } catch (err) {
    console.error("Strava sync error:", err.message)
    res.status(500).json({ error: err.message })
  }
})
```

**Route 2 — `GET /api/strava/webhook` — Webhook subscription verification:**

Strava sends a GET request with `hub.challenge` to verify the endpoint when you register the webhook. Must respond with `{ "hub.challenge": <value> }`.

```js
router.get("/api/strava/webhook", (req, res) => {
  const mode      = req.query["hub.mode"]
  const token     = req.query["hub.verify_token"]
  const challenge = req.query["hub.challenge"]

  if (mode === "subscribe" && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    res.json({ "hub.challenge": challenge })
  } else {
    res.status(403).json({ error: "Forbidden" })
  }
})
```

**Route 3 — `POST /api/strava/webhook` — Incoming activity events:**

Strava POSTs here when a user creates, updates, or deletes an activity. We only act on `event_type: "activity"` + `aspect_type: "create"` for ski types.

The webhook payload includes `owner_id` (Strava athlete ID) but not the PowderDays user ID. We must look up the PowderDays user by `strava_athlete_id`.

```js
import { syncSingleActivity } from "../services/stravaSync.js"

router.post("/api/strava/webhook", async (req, res) => {
  // Strava expects a 200 immediately — process async
  res.sendStatus(200)

  const { object_type, aspect_type, object_id, owner_id } = req.body

  // Only handle new activities
  if (object_type !== "activity" || aspect_type !== "create") return

  try {
    const supabase = getSupabase()

    // Look up the PowderDays user by their Strava athlete ID
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("strava_athlete_id", owner_id)
      .single()

    if (!profile) return // User not connected or deauthorized

    await syncSingleActivity(profile.id, object_id)
  } catch (err) {
    console.error("Webhook sync error:", err.message)
    // Don't re-throw — Strava already got its 200
  }
})
```

**Note on webhook response timing:** Strava requires a 200 response within 2 seconds. Send `res.sendStatus(200)` immediately and process the sync asynchronously after. This is already handled in the implementation above.

**Acceptance criteria:**
- `POST /api/strava/sync` with `{ userId }` triggers a full sync, returns `{ synced, skipped, errors }`
- `GET /api/strava/webhook` returns `{ "hub.challenge": value }` when verify token matches; 403 otherwise
- `POST /api/strava/webhook` responds 200 immediately, then syncs the single activity in background
- Webhook handler looks up PowderDays user by `strava_athlete_id` — does not fail if user not found

---

### S2-T4 — `StravaConnect.jsx` Component

**File to create:** `src/components/StravaConnect.jsx`

This component handles the full connect/disconnect UI. It is a self-contained card — `ProfilePage` just renders it in one place.

**Props:** `userId` (string) — the current user's Supabase UUID.

**State it manages:**
- `isConnected` — bool, derived from whether `profile.strava_athlete_id` is set
- `athleteId` — the Strava athlete ID if connected (used for display only)
- `syncing` — bool, true while sync is in progress
- `syncResult` — `{ synced, skipped, errors }` or null, shown as a toast/inline message after sync
- `loading` — initial fetch loading state

**Data fetching:** On mount, fetch the current user's `strava_athlete_id` from Supabase:

```js
const { data } = await supabase
  .from("profiles")
  .select("strava_athlete_id")
  .eq("id", userId)
  .single()
setIsConnected(!!data?.strava_athlete_id)
setAthleteId(data?.strava_athlete_id ?? null)
```

Also on mount, check for `?strava_connected=true` or `?strava_error=...` in `window.location.search`. If present, show appropriate toast and clean the URL with `window.history.replaceState`.

**Connect handler:**
```js
function handleConnect() {
  window.location.href = `${import.meta.env.VITE_API_URL}/api/strava/auth?userId=${userId}`
}
```

**Sync handler:**
```js
async function handleSync() {
  setSyncing(true)
  setSyncResult(null)
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/strava/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
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

**Disconnect handler:**
```js
async function handleDisconnect() {
  if (!confirm("Disconnect Strava? Your imported sessions will remain.")) return
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/strava/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  })
  if (res.ok) {
    setIsConnected(false)
    setAthleteId(null)
  }
}
```

**UI — Disconnected state:**
```
┌──────────────────────────────────────────┐
│  [Strava logo SVG]  Strava               │
│  Import your ski activities automatically│
│                                          │
│  [Connect Strava →]                      │
└──────────────────────────────────────────┘
```

**UI — Connected state:**
```
┌──────────────────────────────────────────┐
│  [Strava logo SVG]  Strava  ✓ Connected  │
│                                          │
│  [Sync Now]  [Disconnect]                │
│                                          │
│  (after sync) "Synced 12 sessions"       │
└──────────────────────────────────────────┘
```

**Strava brand colors:** Use `#FC4C02` (Strava orange) for the connect button. Other buttons use the app's existing CSS variables (`--color-accent`, `--color-surface`).

**The Strava logo** — use a simple inline SVG or the text "STRAVA" in the brand font. Do not fetch from an external URL. A simple orange circle with a white chevron is sufficient:
```jsx
const StravaIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#FC4C02">
    <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
  </svg>
)
```

**Env var used:** `VITE_API_URL` — the Railway server URL. This must already be set in the frontend `.env.local` and Vercel env. If it isn't, document that it needs to be set.

**Acceptance criteria:**
- Component renders without errors when `userId` prop is provided
- Disconnected state shows "Connect Strava" button that navigates to `/api/strava/auth?userId=...`
- Connected state shows "Sync Now" and "Disconnect" buttons
- `?strava_connected=true` in URL shows a success message on mount and cleans the URL
- `?strava_error=...` in URL shows an error message on mount and cleans the URL
- "Sync Now" shows a spinner while in progress; shows result count after ("Synced 12 sessions, 4 skipped")
- "Disconnect" prompts for confirmation before proceeding
- Strava orange (`#FC4C02`) is used on the connect button

---

### S2-T5 — Wire `StravaConnect` into `ProfilePage.jsx`

**File to modify:** `src/components/ProfilePage.jsx`

Read `ProfilePage.jsx` fully before editing. Find the settings/account section — it likely has sections for profile editing, notifications, etc. Add a "Connected Apps" section at the end of the settings area (before the logout/delete account section if one exists).

**What to add:**

1. Import the component:
```js
import StravaConnect from "./StravaConnect"
```

2. Get the current user ID. `ProfilePage` likely already has the user object in state or props — use whatever pattern the file already uses. If not, import `getCurrentUser` from `../lib/socialApi` and call it.

3. Add a section:
```jsx
<section className="settings-section">
  <h3 className="settings-section-title">Connected Apps</h3>
  <StravaConnect userId={user.id} />
</section>
```

Use whatever class names and heading patterns already exist in `ProfilePage.jsx` — match the existing visual style exactly. Do not introduce new CSS class names unless nothing suitable exists.

**Acceptance criteria:**
- `StravaConnect` renders inside `ProfilePage` without errors
- The section appears visually consistent with adjacent settings sections
- The component receives the correct `userId` from the page's existing user state
- No other section of `ProfilePage` is changed

---

## Acceptance Criteria (Sprint Level)

- [ ] `migrations/017_strava_session_link.sql` adds `strava_activity_id BIGINT UNIQUE` to `ski_sessions`
- [ ] `server/services/stravaSync.js` exports `syncUserActivities` and `syncSingleActivity`
- [ ] `POST /api/strava/sync` triggers full sync and returns counts
- [ ] `GET /api/strava/webhook` responds to Strava's verification challenge
- [ ] `POST /api/strava/webhook` responds 200 immediately; syncs single activity in background
- [ ] `src/components/StravaConnect.jsx` renders connected/disconnected states correctly
- [ ] `StravaConnect` is wired into `ProfilePage.jsx` under a "Connected Apps" section
- [ ] Connecting Strava redirects through OAuth and back to Profile with success toast
- [ ] "Sync Now" imports ski activities and shows count result
- [ ] "Disconnect" clears tokens and returns to disconnected UI state
- [ ] Re-syncing does not duplicate `ski_sessions` rows (idempotent via `strava_activity_id` conflict)

## Out of Scope for This Sprint

- No GPX export or upload to Strava (that's Sprint 5)
- No Strava badge/icon on session history rows (can be added later)
- Do not add the "Import from Strava" button to the session history list — just the Connected Apps card
- Do not modify `ski_runs` table, `leaderboardApi.js`, or any leaderboard components
- Do not modify existing routes in `server/index.js` other than confirming the Strava router is mounted
- Do not register the Strava webhook subscription itself — that is a one-time CLI command done manually after deploy:
  ```
  POST https://www.strava.com/api/v3/push_subscriptions
    client_id, client_secret, callback_url, verify_token
  ```
  Document this in a comment at the top of the webhook handler so the developer knows to run it after deploying.
