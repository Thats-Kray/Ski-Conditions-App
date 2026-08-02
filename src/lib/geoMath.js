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
