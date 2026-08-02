# Sprint 5 — GPX Export + Strava Upload

**Goal:** Export a completed session as a GPX file (browser download), and optionally upload it to Strava as an activity for users who have connected their Strava account.  
**Estimated effort:** 1–2 days  
**Depends on:**
- Sprint 1 fully merged (Strava OAuth working, `getValidStravaToken` exported from `server/routes/strava.js`)
- Sprint 3 fully merged (`ski_runs` table exists with `gps_track JSONB` column)
- Sprint 4 fully merged (`SessionRecapModal.jsx` exists with `onPostToStrava` prop already wired in `App.jsx`)

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**Stack:**
- Frontend: React 19 + Vite, deployed on Vercel
- Backend API: Express (ES modules) at `server/index.js`, deployed on Railway. `@supabase/supabase-js` is installed in the server's `server/package.json`.
- Database: Supabase. `ski_runs` table has a `gps_track JSONB` column: `[{ lat, lng, alt, t }, ...]` — downsampled track points.

**Key existing files:**
- `server/routes/strava.js` — exports default Router + named `getValidStravaToken(userId)`. You add a new route here.
- `src/components/SessionRecapModal.jsx` — has `stravaConnected` prop and `onPostToStrava` prop already. You will wire up the actual upload call and update the button state in this file.
- `src/lib/leaderboardApi.js` — has `getCurrentUser()`. You will add `getRunsForSession(sessionId)` here.

**GPX format reference:**
GPX is XML. Strava's upload endpoint accepts GPX 1.1. The minimum valid track file:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="PowderDays"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1
    http://www.topografix.com/GPX/1/1/gpx.xsd">
  <trk>
    <name>Breckenridge - Jan 15, 2026</name>
    <trkseg>
      <trkpt lat="39.480" lon="-106.038">
        <ele>3658</ele>
        <time>2026-01-15T08:32:14Z</time>
      </trkpt>
      ...
    </trkseg>
  </trk>
</gpx>
```

Notes on the GPX structure:
- `<ele>` is in meters (not feet) — store as-is from the GPS track (`alt` field is already meters)
- `<time>` must be ISO 8601 UTC: `new Date(point.t).toISOString()`
- All run and lift segments are written as one continuous `<trkseg>` — Strava handles the rest
- If a point has no `alt`, omit the `<ele>` tag entirely for that point

---

## Tasks

S5-T1 (pure function, no deps) and S5-T2 (server route) can be built in parallel. S5-T3 wires them both into the UI and must go last.

---

### S5-T1 — `src/lib/gpxExport.js` — Client-side GPX generation + download

**File to create:** `src/lib/gpxExport.js`

Pure functions. No React, no Supabase, no side effects except `gpxDownload()` which triggers a browser download.

```js
/**
 * Convert an array of ski_runs rows (with gps_track JSONB) into a GPX XML string.
 *
 * @param {Array} runs        - ski_runs rows, each with gps_track: [{lat,lng,alt,t}]
 * @param {string} trackName  - e.g. "Breckenridge - Jan 15, 2026"
 * @returns {string}          - GPX XML string
 */
export function runsToGpx(runs, trackName) {
  // Flatten all segments into a single ordered point stream, sorted by timestamp
  const allPoints = runs
    .flatMap((run) => run.gps_track ?? [])
    .sort((a, b) => a.t - b.t)

  if (!allPoints.length) {
    throw new Error("No GPS track data available for this session.")
  }

  const trkpts = allPoints
    .map((pt) => {
      const ele = pt.alt != null ? `\n        <ele>${pt.alt.toFixed(1)}</ele>` : ""
      const time = `\n        <time>${new Date(pt.t).toISOString()}</time>`
      return `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lng.toFixed(6)}">${ele}${time}\n      </trkpt>`
    })
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="PowderDays"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <trk>
    <name>${escapeXml(trackName)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`
}

/**
 * Trigger a browser download of a GPX string as a .gpx file.
 */
export function gpxDownload(gpxString, filename) {
  const blob = new Blob([gpxString], { type: "application/gpx+xml" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&apos;")
}
```

**Also add to `src/lib/leaderboardApi.js`** — a function to fetch runs for a session (needed by the server upload route and the client download):

```js
export async function getRunsForSession(sessionId) {
  const { data, error } = await supabase
    .from("ski_runs")
    .select("*")
    .eq("session_id", sessionId)
    .order("started_at", { ascending: true })

  if (error) throw error
  return data ?? []
}
```

**Acceptance criteria:**
- `runsToGpx(runs, name)` returns a valid GPX XML string
- If all runs have empty `gps_track`, throws `"No GPS track data available"`
- Points are sorted by timestamp across all runs (handles out-of-order segment inserts)
- Points without `alt` omit the `<ele>` tag
- `gpxDownload(gpxString, "session.gpx")` triggers a file download
- `getRunsForSession` is added to `leaderboardApi.js` and queries `ski_runs` by `session_id`
- `escapeXml` handles `&`, `<`, `>`, `"`, `'` — prevents invalid XML from resort names

---

### S5-T2 — `POST /api/strava/upload` — Server-side Strava activity upload

**File to modify:** `server/routes/strava.js` (add a new route)

This route fetches the GPS tracks from Supabase, builds a GPX, uploads to Strava, and polls until the upload is processed.

**Strava upload API flow:**
1. `POST https://www.strava.com/api/v3/uploads` — multipart form, returns `{ id, status, error }`
2. Poll `GET https://www.strava.com/api/v3/uploads/{id}` until `status === "Your activity is ready."` or an error appears
3. On success: response includes `activity_id` — save this to `ski_sessions.strava_activity_id`

**Implementation:**

```js
// Add at top of strava.js, alongside the existing getSupabase() helper:
function buildGpxFromRuns(runs, trackName) {
  const allPoints = runs
    .flatMap((run) => run.gps_track ?? [])
    .sort((a, b) => a.t - b.t)

  if (!allPoints.length) return null

  const trkpts = allPoints
    .map((pt) => {
      const ele  = pt.alt != null ? `\n        <ele>${Number(pt.alt).toFixed(1)}</ele>` : ""
      const time = `\n        <time>${new Date(pt.t).toISOString()}</time>`
      return `      <trkpt lat="${Number(pt.lat).toFixed(6)}" lon="${Number(pt.lng).toFixed(6)}">${ele}${time}\n      </trkpt>`
    })
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="PowderDays" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${trackName.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</name>
  <trkseg>\n${trkpts}\n  </trkseg></trk>
</gpx>`
}

router.post("/api/strava/upload", async (req, res) => {
  const { userId, sessionId, activityName, activityDate } = req.body

  if (!userId || !sessionId) {
    return res.status(400).json({ error: "userId and sessionId are required" })
  }

  // Check for idempotency — already uploaded?
  const supabase = getSupabase()
  const { data: session } = await supabase
    .from("ski_sessions")
    .select("strava_activity_id")
    .eq("id", sessionId)
    .single()

  if (session?.strava_activity_id) {
    return res.json({
      already_uploaded: true,
      strava_activity_id: session.strava_activity_id,
      strava_url: `https://www.strava.com/activities/${session.strava_activity_id}`,
    })
  }

  try {
    // Fetch GPS tracks from Supabase
    const { data: runs, error: runsError } = await supabase
      .from("ski_runs")
      .select("gps_track, run_type, started_at")
      .eq("session_id", sessionId)
      .order("started_at", { ascending: true })

    if (runsError) return res.status(500).json({ error: runsError.message })

    const gpxString = buildGpxFromRuns(runs, activityName || `Ski Day - ${activityDate || ""}`)

    if (!gpxString) {
      return res.status(422).json({ error: "No GPS track data available for this session." })
    }

    // Get a valid Strava access token (auto-refreshes if expired)
    const accessToken = await getValidStravaToken(userId)

    // Upload GPX to Strava as multipart form
    const formData = new FormData()
    formData.append("data_type", "gpx")
    formData.append("activity_type", "AlpineSki")
    formData.append("name", activityName || `Ski Day - ${activityDate || ""}`)
    formData.append("file", new Blob([gpxString], { type: "application/gpx+xml" }), "session.gpx")

    const uploadRes = await fetch("https://www.strava.com/api/v3/uploads", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    })

    if (!uploadRes.ok) {
      const body = await uploadRes.text()
      return res.status(502).json({ error: `Strava upload failed: ${uploadRes.status} ${body}` })
    }

    const upload = await uploadRes.json()

    if (upload.error) {
      return res.status(422).json({ error: `Strava rejected upload: ${upload.error}` })
    }

    // Poll until Strava processes the activity (usually 5–30 seconds)
    let stravaActivityId = null
    let attempts = 0
    const maxAttempts = 12 // 12 × 5s = 60s max wait

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5_000))
      attempts++

      const pollRes = await fetch(`https://www.strava.com/api/v3/uploads/${upload.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      const poll = await pollRes.json()

      if (poll.error) {
        return res.status(422).json({ error: `Strava processing error: ${poll.error}` })
      }

      if (poll.activity_id) {
        stravaActivityId = poll.activity_id
        break
      }
    }

    if (!stravaActivityId) {
      return res.status(504).json({ error: "Strava processing timed out. Check Strava app in a few minutes." })
    }

    // Save strava_activity_id back to ski_sessions
    await supabase
      .from("ski_sessions")
      .update({ strava_activity_id: stravaActivityId })
      .eq("id", sessionId)

    res.json({
      strava_activity_id: stravaActivityId,
      strava_url: `https://www.strava.com/activities/${stravaActivityId}`,
    })
  } catch (err) {
    console.error("Strava upload error:", err)
    res.status(500).json({ error: err.message })
  }
})
```

**Note on `FormData` in Node.js:** Node 18+ has a built-in `FormData`. The server uses `node-fetch` and targets Railway (Node 18+). Use the native `FormData` — do not import a polyfill.

**Acceptance criteria:**
- `POST /api/strava/upload` with `{ userId, sessionId }` returns `{ strava_activity_id, strava_url }`
- If session has no GPS data, returns 422 with a clear error message
- If session already has `strava_activity_id`, returns `{ already_uploaded: true, strava_url }` without re-uploading
- Polls for up to 60 seconds before returning a 504 timeout (which the UI handles gracefully)
- Saves `strava_activity_id` to `ski_sessions` on success

---

### S5-T3 — Wire upload + download into `SessionRecapModal.jsx`

**File to modify:** `src/components/SessionRecapModal.jsx`

Read the file before editing. Add two features:

**Feature A — "Download GPX" button:**

Add a "Download GPX" button next to the "Share" button. This is always visible if the session has runs with GPS data.

Import at the top:
```js
import { runsToGpx, gpxDownload } from "../lib/gpxExport"
```

Inside the component, check if any run has GPS data:
```js
const hasGpsData = runs.some(r => r.gps_track?.length > 0)
```

Button handler:
```js
function handleDownloadGpx() {
  const name = `${session.resort_name} - ${session.session_date}`
  try {
    const gpx = runsToGpx(runs, name)
    gpxDownload(gpx, `powderdays-${session.session_date}.gpx`)
  } catch (err) {
    alert(err.message)
  }
}
```

Show the button only when `hasGpsData`:
```jsx
{hasGpsData && (
  <button onClick={handleDownloadGpx} style={/* secondary button style */}>
    ⬇ GPX
  </button>
)}
```

**Feature B — "Post to Strava" button — upgrade from no-op to real upload:**

The button already renders when `stravaConnected === true` and calls `onPostToStrava()`. You need to:

1. Update the prop interface to pass the session data needed for the upload. Change `onPostToStrava` to:
```
onPostToStrava: (sessionId: string, resortName: string, sessionDate: string) => Promise<{strava_url}>
```

2. Add local upload state to the modal:
```js
const [uploadState, setUploadState] = useState("idle") // idle | loading | success | error
const [stravaUrl, setStravaUrl] = useState(null)
const [uploadError, setUploadError] = useState(null)
```

3. Button handler:
```js
async function handlePostToStrava() {
  setUploadState("loading")
  setUploadError(null)
  try {
    const result = await onPostToStrava(session.id, session.resort_name, session.session_date)
    setStravaUrl(result.strava_url)
    setUploadState("success")
  } catch (err) {
    setUploadError(err.message)
    setUploadState("error")
  }
}
```

4. Button states:
- `idle`: "Post to Strava" — Strava orange `#FC4C02` background
- `loading`: "Uploading…" — disabled, spinner or pulse animation
- `success`: "View on Strava →" — links to `stravaUrl` in new tab, green background
- `error`: "Retry" — shows `uploadError` text below the button in small red text

**In `App.jsx`**, update the `onPostToStrava` prop passed to `SessionRecapModal` to do the actual fetch:

```jsx
{recapData && (
  <SessionRecapModal
    session={recapData.session}
    runs={recapData.runs}
    onClose={() => setRecapData(null)}
    stravaConnected={!!currentProfile?.strava_athlete_id}   // ← check real connection status
    onPostToStrava={async (sessionId, resortName, sessionDate) => {
      const res = await fetch(`${API_BASE}/api/strava/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId:       currentUser.id,
          sessionId,
          activityName: `${resortName} - ${sessionDate}`,
          activityDate: sessionDate,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Upload failed")
      }
      return res.json()
    }}
  />
)}
```

**Note on `currentProfile?.strava_athlete_id`:** `currentProfile` is already in `App.jsx` state (loaded by `getMyProfile()` in `loadHeaderUser()`). Since Sprint 1 added `strava_athlete_id` to `profiles`, it will be included in the profile fetch. If `currentProfile` doesn't have it yet, check whether `getMyProfile` selects `*` (it likely does, so no change needed).

**Acceptance criteria:**
- "Download GPX" button appears when session has GPS data; triggers file download
- "Post to Strava" shows only when `stravaConnected === true`
- Upload shows loading state while polling; success state with link to Strava activity
- Error state shows message + retry button
- Re-uploading an already-uploaded session returns existing Strava URL without a duplicate upload
- `onPostToStrava` in `App.jsx` passes correct `userId` (from `currentUser.id`)
- `stravaConnected` in `App.jsx` reads from `currentProfile.strava_athlete_id`

---

## Sprint-Level Acceptance Criteria

- [ ] `src/lib/gpxExport.js` exports `runsToGpx` and `gpxDownload`
- [ ] `leaderboardApi.js` exports `getRunsForSession`
- [ ] `POST /api/strava/upload` uploads GPX and returns `strava_activity_id`
- [ ] Upload is idempotent — re-upload returns existing activity link
- [ ] "Download GPX" button in recap modal triggers file download
- [ ] "Post to Strava" shows loading → success/error states
- [ ] Success state shows a clickable "View on Strava →" link
- [ ] `stravaConnected` is derived from real profile data in `App.jsx`

## Out of Scope for This Sprint

- Manual GPX import (user providing their own file)
- Editing the activity in Strava after upload (title, type, etc.)
- Strava activity sync in the reverse direction (covered by Sprint 2)
- `ski_sessions.strava_activity_id` badge on the Profile session history list
- Any changes to `ProfilePage.jsx`
- Any changes to `PowderMap.jsx`
