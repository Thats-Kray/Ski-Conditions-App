# Sprint 3 — GPS Tracker Hook

**Goal:** Database schema for ski runs + two pure libraries (`geoMath.js` and `useGpsTracker.js`) that record a GPS ski session in the browser. No UI yet — that's Sprint 4.  
**Estimated effort:** 2–3 days  
**Depends on:** Nothing from the Strava sprints. Sprint 4 (Active Session UI) depends on this sprint being complete.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**Stack:**
- Frontend: React 19 + Vite, deployed on Vercel. Files are in `src/`.
- Database: Supabase (Postgres). Migrations live in `migrations/` at the project root. Existing migrations are numbered `001`–`009`. ROADMAP reserves `010`–`015` for session-tracking features. **This sprint creates `010`.**
- Client Supabase: `src/lib/supabase.js` exports `supabase` (the Supabase JS client). Use this, do not create a new client.
- Existing relevant API: `src/lib/leaderboardApi.js` — has `logSkiDay()`, `getMySessions()`, `getCurrentSeason()`. You will add a new export to this file in S3-T4.

**GPS API being used:**
- `navigator.geolocation.watchPosition()` — browser Web API, requires user permission
- Returns `GeolocationPosition` objects with `coords.latitude`, `coords.longitude`, `coords.altitude` (meters, may be null), `coords.speed` (m/s, may be null), `coords.accuracy` (meters), and `timestamp` (ms epoch)
- **iOS Safari limitation:** `coords.speed` is often null or 0; always compute speed from distance/time delta as fallback
- **Altitude accuracy:** GPS altitude has ±10–30m error. We accumulate descent across run segments to calculate vertical, rather than using a single start-to-end difference

---

## Tasks

S3-T1 must go first (pure math with no dependencies). S3-T2 and S3-T3 build on each other in the same file. S3-T4 adds the flush function and a new `leaderboardApi.js` export.

---

### S3-T0 — Migration: `ski_runs` table

**File to create:** `migrations/010_ski_runs.sql`

This table stores individual run and lift segments within a session. Each row represents one detected segment (run downhill, lift ride up, or pause).

```sql
-- First extend ski_sessions with new tracking columns
ALTER TABLE ski_sessions
  ADD COLUMN IF NOT EXISTS runs_logged          INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifts_ridden         INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS top_speed_mph        DECIMAL(5,1),
  ADD COLUMN IF NOT EXISTS avg_speed_mph        DECIMAL(5,1),
  ADD COLUMN IF NOT EXISTS time_on_mountain_min INT,
  ADD COLUMN IF NOT EXISTS time_on_lifts_min    INT,
  ADD COLUMN IF NOT EXISTS longest_run_ft       INT,
  ADD COLUMN IF NOT EXISTS calories_burned      INT,
  ADD COLUMN IF NOT EXISTS session_started_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS session_ended_at     TIMESTAMPTZ;

-- Individual run/lift segments table
CREATE TABLE IF NOT EXISTS ski_runs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID        NOT NULL REFERENCES ski_sessions(id) ON DELETE CASCADE,
  run_type       TEXT        NOT NULL CHECK (run_type IN ('run', 'lift', 'rest')),
  run_number     INT,
  started_at     TIMESTAMPTZ NOT NULL,
  ended_at       TIMESTAMPTZ,
  vertical_ft    INT,
  distance_mi    DECIMAL(6,2),
  speed_max_mph  DECIMAL(5,1),
  speed_avg_mph  DECIMAL(5,1),
  lift_name      TEXT,
  gps_track      JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fetching all runs within a session
CREATE INDEX IF NOT EXISTS ski_runs_session_id_idx ON ski_runs(session_id);

-- RLS
ALTER TABLE ski_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own ski runs"
  ON ski_runs FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM ski_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own ski runs"
  ON ski_runs FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM ski_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own ski runs"
  ON ski_runs FOR UPDATE
  USING (
    session_id IN (
      SELECT id FROM ski_sessions WHERE user_id = auth.uid()
    )
  );
```

**`gps_track` JSONB structure** — stored as a downsampled array of points (not every raw GPS sample). The flush function in S3-T4 will downsample to every 10th point:
```json
[
  { "lat": 39.640, "lng": -106.374, "alt": 3658, "t": 1705312800000 },
  ...
]
```

**Acceptance criteria:**
- Migration runs cleanly against Supabase
- `ski_sessions` has all 9 new columns
- `ski_runs` table exists with all columns and RLS policies
- Re-running is safe (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)

**Out of scope:** Do not run the migration yourself. Do not modify RLS on `ski_sessions`.

---

### S3-T1 — `src/lib/geoMath.js` — Pure geographic utilities

**File to create:** `src/lib/geoMath.js`

Pure functions only — no React, no Supabase, no side effects. These will also be used by Sprint 5's GPX export.

```js
const R_EARTH_MILES = 3958.8
const FEET_PER_METER = 3.28084

/**
 * Haversine distance between two lat/lng points, in miles.
 */
export function haversineDistanceMiles(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R_EARTH_MILES * 2 * Math.asin(Math.sqrt(a))
}

/**
 * Speed in mph derived from distance and elapsed time.
 * Returns null if elapsed is zero or negative.
 */
export function speedMph(distanceMiles, elapsedMs) {
  if (!elapsedMs || elapsedMs <= 0) return null
  return (distanceMiles / (elapsedMs / 3_600_000))
}

/**
 * Convert m/s (from Geolocation API) to mph.
 */
export function mpsToMph(mps) {
  if (mps == null) return null
  return mps * 2.23694
}

/**
 * Convert meters to feet.
 */
export function metersToFeet(meters) {
  if (meters == null) return null
  return meters * FEET_PER_METER
}

/**
 * Classify a GPS sample as 'run', 'lift', or 'rest' based on speed and
 * altitude delta from the previous sample.
 *
 * Rules (speed in mph, altDeltaFt = current_alt_ft - prev_alt_ft):
 *   run:  speed >= 10 AND altDeltaFt <= 10   (going fast, not climbing)
 *   lift: speed <= 8  AND altDeltaFt >= 5    (slow, gaining altitude)
 *   rest: everything else
 *
 * @param {number} speedMph - current speed in mph (may be derived or from API)
 * @param {number|null} altDeltaFt - altitude change ft since last sample (null if no altitude)
 * @returns {'run'|'lift'|'rest'}
 */
export function classifySegment(speedMph, altDeltaFt) {
  if (speedMph >= 10 && (altDeltaFt == null || altDeltaFt <= 10)) return "run"
  if (speedMph <= 8  && (altDeltaFt != null && altDeltaFt >= 5))  return "lift"
  return "rest"
}

/**
 * Downsample an array, keeping every Nth element plus always the last.
 * Used to reduce GPS track storage without losing the route shape.
 */
export function downsample(arr, n) {
  if (!arr.length) return []
  const result = arr.filter((_, i) => i % n === 0)
  if (result[result.length - 1] !== arr[arr.length - 1]) {
    result.push(arr[arr.length - 1])
  }
  return result
}

/**
 * Calculate total descended vertical feet across an array of altitude
 * readings (in meters). Only sums negative deltas (descents).
 * Used for vertical feet on runs.
 */
export function totalDescentFt(altitudesMeters) {
  let descent = 0
  for (let i = 1; i < altitudesMeters.length; i++) {
    const delta = altitudesMeters[i] - altitudesMeters[i - 1]
    if (delta < 0) descent += Math.abs(delta)
  }
  return Math.round(descent * FEET_PER_METER)
}
```

**Acceptance criteria:**
- File exports all 7 functions
- `haversineDistanceMiles(39.640, -106.374, 39.641, -106.374)` returns approximately `0.069` miles
- `classifySegment(45, -200)` returns `"run"`
- `classifySegment(3, 50)` returns `"lift"`
- `classifySegment(6, 0)` returns `"rest"`
- `downsample([1,2,3,4,5,6,7,8,9,10], 3)` returns `[1,4,7,10]`

**Out of scope:** No React, no Supabase, no imports from other project files.

---

### S3-T2 — `src/lib/useGpsTracker.js` — GPS watch hook + position accumulation

**File to create:** `src/lib/useGpsTracker.js`

This is a React hook that wraps `navigator.geolocation.watchPosition()` and accumulates raw GPS positions. Segment detection is in S3-T3 (added to the same file).

**Complete implementation:**

```js
import { useCallback, useEffect, useRef, useState } from "react"
import {
  classifySegment,
  haversineDistanceMiles,
  metersToFeet,
  mpsToMph,
  speedMph,
} from "./geoMath"

const SESSION_STORAGE_KEY = "pd_gps_session"
const FLUSH_INTERVAL_MS   = 30_000  // persist to sessionStorage every 30s
const WATCH_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 3_000,
}

/**
 * @typedef {Object} GpsPoint
 * @property {number} lat
 * @property {number} lng
 * @property {number|null} alt   - meters, may be null
 * @property {number|null} speed - m/s from API, may be null
 * @property {number} accuracy   - meters
 * @property {number} t          - ms epoch timestamp
 */

/**
 * @typedef {Object} Segment
 * @property {'run'|'lift'|'rest'} type
 * @property {number} startedAt   - ms epoch
 * @property {number|null} endedAt
 * @property {GpsPoint[]} points
 */

export function useGpsTracker() {
  const [status, setStatus] = useState("idle") // idle | requesting | tracking | paused | error
  const [permissionError, setPermissionError] = useState(null)
  const [currentSegmentType, setCurrentSegmentType] = useState(null)
  const [segments, setSegments] = useState([])
  const [runCount, setRunCount] = useState(0)
  const [liftCount, setLiftCount] = useState(0)
  const [currentSpeedMph, setCurrentSpeedMph] = useState(null)
  const [gpsAccuracy, setGpsAccuracy] = useState(null) // meters — used for status dot

  const watchIdRef      = useRef(null)
  const currentSegRef   = useRef(null) // mutable current segment (avoids stale closure)
  const allSegmentsRef  = useRef([])
  const lastPointRef    = useRef(null)
  const flushTimerRef   = useRef(null)
  const pausedRef       = useRef(false)

  // ── Restore from sessionStorage on mount ────────────────────────────────────
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY)
      if (saved) {
        const { segments: savedSegs, runCount: rc, liftCount: lc } = JSON.parse(saved)
        allSegmentsRef.current = savedSegs || []
        setSegments(savedSegs || [])
        setRunCount(rc || 0)
        setLiftCount(lc || 0)
      }
    } catch {}
  }, [])

  // ── Persist to sessionStorage ────────────────────────────────────────────────
  const persistToStorage = useCallback(() => {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        segments:  allSegmentsRef.current,
        runCount,
        liftCount,
      }))
    } catch {}
  }, [runCount, liftCount])

  // ── Process an incoming GPS position ────────────────────────────────────────
  const handlePosition = useCallback((pos) => {
    const { latitude: lat, longitude: lng, altitude, speed: rawSpeed, accuracy } = pos.coords
    const t = pos.timestamp

    setGpsAccuracy(accuracy)

    // Ignore very low-accuracy fixes (lost signal, tunnel, etc.)
    if (accuracy > 50) return

    if (pausedRef.current) return

    // Compute speed — prefer API value, fall back to haversine distance/time
    let derivedSpeed = rawSpeed != null ? mpsToMph(rawSpeed) : null
    if ((derivedSpeed == null || derivedSpeed === 0) && lastPointRef.current) {
      const distMi = haversineDistanceMiles(
        lastPointRef.current.lat, lastPointRef.current.lng, lat, lng
      )
      const elapsedMs = t - lastPointRef.current.t
      derivedSpeed = speedMph(distMi, elapsedMs) ?? 0
    }
    derivedSpeed = derivedSpeed ?? 0

    setCurrentSpeedMph(Math.round(derivedSpeed * 10) / 10)

    // Altitude delta for classification
    const altFt = altitude != null ? metersToFeet(altitude) : null
    const prevAltFt = lastPointRef.current?.alt != null ? metersToFeet(lastPointRef.current.alt) : null
    const altDeltaFt = altFt != null && prevAltFt != null ? altFt - prevAltFt : null

    const segType = classifySegment(derivedSpeed, altDeltaFt)

    /** @type {GpsPoint} */
    const point = { lat, lng, alt: altitude, speed: rawSpeed, accuracy, t }
    lastPointRef.current = point

    // ── Segment transition ───────────────────────────────────────────────────
    if (!currentSegRef.current || currentSegRef.current.type !== segType) {
      // Close the current segment
      if (currentSegRef.current) {
        const closed = { ...currentSegRef.current, endedAt: t }
        allSegmentsRef.current = [...allSegmentsRef.current, closed]
        setSegments([...allSegmentsRef.current])
      }

      // Open a new segment
      const newSeg = { type: segType, startedAt: t, endedAt: null, points: [point] }
      currentSegRef.current = newSeg

      setCurrentSegmentType(segType)
      if (segType === "run")  setRunCount((n) => n + 1)
      if (segType === "lift") setLiftCount((n) => n + 1)
    } else {
      // Continue current segment
      currentSegRef.current = {
        ...currentSegRef.current,
        points: [...currentSegRef.current.points, point],
      }
    }
  }, [])

  // ── Start tracking ───────────────────────────────────────────────────────────
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setPermissionError("Geolocation is not supported by this browser.")
      setStatus("error")
      return
    }

    setStatus("requesting")
    setPermissionError(null)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus("tracking")
        handlePosition(pos)
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermissionError("Location permission denied. Enable location access in your browser settings.")
        } else {
          setPermissionError(`GPS error: ${err.message}`)
        }
        setStatus("error")
      },
      WATCH_OPTIONS
    )

    // Periodic flush to sessionStorage
    flushTimerRef.current = setInterval(persistToStorage, FLUSH_INTERVAL_MS)
  }, [handlePosition, persistToStorage])

  // ── Pause / Resume ───────────────────────────────────────────────────────────
  const pauseTracking = useCallback(() => {
    pausedRef.current = true
    setStatus("paused")
  }, [])

  const resumeTracking = useCallback(() => {
    pausedRef.current = false
    setStatus("tracking")
  }, [])

  // ── Stop and return compiled session data ────────────────────────────────────
  const stopTracking = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    clearInterval(flushTimerRef.current)

    // Close the last open segment
    const finalSegments = [...allSegmentsRef.current]
    if (currentSegRef.current) {
      finalSegments.push({ ...currentSegRef.current, endedAt: Date.now() })
    }

    setStatus("idle")
    setSegments([])
    setRunCount(0)
    setLiftCount(0)
    currentSegRef.current = null
    allSegmentsRef.current = []
    lastPointRef.current = null
    sessionStorage.removeItem(SESSION_STORAGE_KEY)

    return finalSegments
  }, [])

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current)
      clearInterval(flushTimerRef.current)
    }
  }, [])

  return {
    // State
    status,          // 'idle' | 'requesting' | 'tracking' | 'paused' | 'error'
    permissionError,
    currentSegmentType,
    segments,        // closed segments only
    runCount,
    liftCount,
    currentSpeedMph,
    gpsAccuracy,     // meters — UI uses this for the signal indicator
    // Actions
    startTracking,
    pauseTracking,
    resumeTracking,
    stopTracking,    // returns finalSegments[]
  }
}
```

**Acceptance criteria:**
- Hook exports all state values and 4 action functions
- `startTracking()` calls `watchPosition` with `enableHighAccuracy: true`
- Positions with `accuracy > 50m` are silently skipped
- `stopTracking()` clears the watch, clears sessionStorage, and returns the full segments array
- `pauseTracking()` stops processing positions without clearing the watch
- Existing segments are restored from `sessionStorage` on mount (crash resilience)

---

### S3-T3 — Segment statistics helpers (add to `useGpsTracker.js`)

**File to modify:** `src/lib/useGpsTracker.js` (add two named exports below the hook)

These transform raw segments into the row shapes expected by the `ski_runs` table (defined in S3-T0).

```js
import { downsample, totalDescentFt, haversineDistanceMiles } from "./geoMath"

/**
 * Compute per-segment statistics from raw GPS points.
 * Returns a `ski_runs`-shaped object (minus session_id).
 */
export function computeSegmentStats(segment, runNumber) {
  const { type, startedAt, endedAt, points } = segment

  if (!points.length) return null

  const durationMs  = (endedAt ?? Date.now()) - startedAt
  const durationMin = Math.round(durationMs / 60_000)

  // Distance
  let totalDistMi = 0
  for (let i = 1; i < points.length; i++) {
    totalDistMi += haversineDistanceMiles(
      points[i - 1].lat, points[i - 1].lng,
      points[i].lat, points[i].lng
    )
  }

  // Speed — from API values where available, else computed from distance
  const speeds = points
    .map((p, i) => {
      if (p.speed != null && p.speed > 0) return p.speed * 2.23694 // m/s → mph
      if (i === 0) return null
      const d = haversineDistanceMiles(
        points[i - 1].lat, points[i - 1].lng, p.lat, p.lng
      )
      const dt = p.t - points[i - 1].t
      return dt > 0 ? (d / (dt / 3_600_000)) : null
    })
    .filter((s) => s != null && s > 0)

  const maxSpeed = speeds.length ? Math.max(...speeds) : null
  const avgSpeed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null

  // Vertical — use accumulated descent for runs, accumulated ascent for lifts
  const altitudes = points.map((p) => p.alt).filter((a) => a != null)
  const verticalFt = altitudes.length >= 2
    ? (type === "run" ? totalDescentFt(altitudes) : Math.max(0, Math.round((altitudes[altitudes.length - 1] - altitudes[0]) * 3.28084)))
    : null

  // Downsampled GPS track for storage (every 10th point)
  const gpsTrack = downsample(
    points.map((p) => ({ lat: p.lat, lng: p.lng, alt: p.alt, t: p.t })),
    10
  )

  return {
    run_type:      type,
    run_number:    type === "run" ? runNumber : null,
    started_at:    new Date(startedAt).toISOString(),
    ended_at:      endedAt ? new Date(endedAt).toISOString() : null,
    vertical_ft:   verticalFt,
    distance_mi:   totalDistMi > 0 ? Math.round(totalDistMi * 100) / 100 : null,
    speed_max_mph: maxSpeed != null ? Math.round(maxSpeed * 10) / 10 : null,
    speed_avg_mph: avgSpeed != null ? Math.round(avgSpeed * 10) / 10 : null,
    gps_track:     gpsTrack,
  }
}

/**
 * Compute session-level summary stats from an array of segments.
 * Returns the columns that go on `ski_sessions`.
 */
export function computeSessionSummary(segments) {
  const runs  = segments.filter((s) => s.run_type === "run")
  const lifts = segments.filter((s) => s.run_type === "lift")

  const allSpeeds = segments
    .map((s) => s.speed_max_mph)
    .filter((s) => s != null)

  const allVerticals = runs
    .map((s) => s.vertical_ft)
    .filter((v) => v != null)

  const totalRunMin = runs.reduce((acc, s) => {
    if (!s.started_at || !s.ended_at) return acc
    return acc + Math.round((new Date(s.ended_at) - new Date(s.started_at)) / 60_000)
  }, 0)

  const totalLiftMin = lifts.reduce((acc, s) => {
    if (!s.started_at || !s.ended_at) return acc
    return acc + Math.round((new Date(s.ended_at) - new Date(s.started_at)) / 60_000)
  }, 0)

  return {
    runs_logged:          runs.length,
    lifts_ridden:         lifts.length,
    top_speed_mph:        allSpeeds.length ? Math.max(...allSpeeds) : null,
    longest_run_ft:       allVerticals.length ? Math.max(...allVerticals) : null,
    time_on_mountain_min: totalRunMin + totalLiftMin,
    time_on_lifts_min:    totalLiftMin,
  }
}
```

**Acceptance criteria:**
- `computeSegmentStats(segment, 1)` returns an object with all `ski_runs` column fields except `session_id` and `id`
- `computeSessionSummary(processedSegments)` returns the 6 session-level summary fields
- Both functions are named exports from `useGpsTracker.js`
- Neither function has side effects (pure)

---

### S3-T4 — `flushSessionToSupabase` — Batch insert + session update

**File to modify:** `src/lib/leaderboardApi.js` (add a new export at the bottom)

This function is called by Sprint 4's `SessionRecapModal` after the user ends their session. It takes the raw segments from `stopTracking()`, processes them, and writes to Supabase.

```js
import { computeSegmentStats, computeSessionSummary } from "./useGpsTracker"

/**
 * Writes a completed GPS session to Supabase.
 * 1. Upserts/creates the ski_sessions row
 * 2. Batch-inserts all run/lift segments into ski_runs
 * 3. Updates ski_sessions summary columns
 *
 * @param {Object} params
 * @param {string} params.sessionId  - existing ski_sessions UUID (from "Start My Day")
 * @param {Array}  params.rawSegments - segments returned by stopTracking()
 * @param {string} params.startedAt  - ISO timestamp when session started
 * @param {string} params.endedAt    - ISO timestamp when session ended
 * @returns {Promise<{session, runs}>}
 */
export async function flushSessionToSupabase({ sessionId, rawSegments, startedAt, endedAt }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in")

  // Compute per-segment stats
  let runNumber = 0
  const processedSegments = rawSegments
    .map((seg) => {
      if (seg.type === "run") runNumber++
      return computeSegmentStats(seg, runNumber)
    })
    .filter(Boolean)

  // Compute session summary
  const summary = computeSessionSummary(processedSegments)

  // Insert all ski_runs rows
  const runRows = processedSegments.map((seg) => ({
    ...seg,
    session_id: sessionId,
  }))

  const { data: runs, error: runsError } = await supabase
    .from("ski_runs")
    .insert(runRows)
    .select()

  if (runsError) throw new Error(`ski_runs insert failed: ${runsError.message}`)

  // Update ski_sessions with summary stats + timestamps
  const { data: session, error: sessionError } = await supabase
    .from("ski_sessions")
    .update({
      ...summary,
      session_started_at: startedAt,
      session_ended_at:   endedAt,
    })
    .eq("id", sessionId)
    .select()
    .single()

  if (sessionError) throw new Error(`ski_sessions update failed: ${sessionError.message}`)

  return { session, runs }
}
```

**Acceptance criteria:**
- `flushSessionToSupabase` is a named export from `leaderboardApi.js`
- It inserts one row per segment into `ski_runs` with `session_id` set
- It updates the parent `ski_sessions` row with all 6 summary columns + timestamps
- If `rawSegments` is empty, it still updates the session timestamps (empty runs array inserted = 0 rows, no error)
- Throws with a descriptive message on DB error

---

## Sprint-Level Acceptance Criteria

- [ ] `migrations/010_ski_runs.sql` exists and applies cleanly
- [ ] `src/lib/geoMath.js` exports 7 pure functions
- [ ] `src/lib/useGpsTracker.js` exports `useGpsTracker` hook + `computeSegmentStats` + `computeSessionSummary`
- [ ] `src/lib/leaderboardApi.js` exports `flushSessionToSupabase`
- [ ] `startTracking()` triggers browser geolocation permission prompt
- [ ] GPS points with accuracy > 50m are dropped silently
- [ ] Segment transitions (run → lift → rest) are correctly detected
- [ ] `stopTracking()` returns full segments array and clears sessionStorage

## Out of Scope for This Sprint

- No UI — that's Sprint 4
- Do not create `ActiveSessionBar.jsx` or `SessionRecapModal.jsx`
- Do not modify `App.jsx` or `HomeDashboard.jsx`
- Do not create the `ski_sessions` "Start My Day" record — that's Sprint 4
- Do not create migrations `011`–`015`
- Segment detection accuracy does not need to be perfect — the algorithm will be tuned after real mountain testing. Ship a working implementation, not a final one.
