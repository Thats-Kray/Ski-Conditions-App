import { useCallback, useEffect, useRef, useState } from "react"
import {
  classifySegment,
  downsample,
  haversineDistanceMiles,
  metersToFeet,
  mpsToMph,
  speedMph,
  totalDescentFt,
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

// ── Segment statistics helpers ────────────────────────────────────────────────
// Transform raw segments (from stopTracking()) into the row shapes expected
// by the `ski_runs` table (see migrations/010_ski_runs.sql).

/**
 * Compute per-segment statistics from raw GPS points.
 * Returns a `ski_runs`-shaped object (minus session_id).
 */
export function computeSegmentStats(segment, runNumber) {
  const { type, startedAt, endedAt, points } = segment

  if (!points.length) return null

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
