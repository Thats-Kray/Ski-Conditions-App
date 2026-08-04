import { useCallback, useState } from "react"

const POSITION_OPTIONS = { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }

/**
 * One-shot geolocation capture for "confirm I'm here right now" moments
 * (e.g. posting to the Mountain Board). Distinct from useGpsTracker, which
 * is a continuous watchPosition-based session tracker — do not conflate
 * the two.
 */
export function useCurrentPosition() {
  const [status, setStatus] = useState("idle") // idle | requesting | success | error
  const [position, setPosition] = useState(null) // { lat, lng, accuracy }
  const [error, setError] = useState(null)

  const requestPosition = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const err = new Error("Geolocation is not supported on this device")
        setStatus("error"); setError(err); reject(err)
        return
      }
      setStatus("requesting")
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }
          setPosition(coords); setStatus("success"); setError(null)
          resolve(coords)
        },
        (err) => {
          setStatus("error"); setError(err)
          reject(err)
        },
        POSITION_OPTIONS
      )
    })
  }, [])

  return { status, position, error, requestPosition }
}
