import { useState, useEffect } from "react"
import { supabase } from "./supabase"

const STALE_MS = 90 * 1000

/**
 * Subscribes to every accepted friend's live-location broadcast channel and
 * returns their most recent position, keyed by friend user ID.
 *
 * Uses Supabase Realtime Broadcast (ephemeral pub/sub) rather than
 * `postgres_changes` — nothing is persisted to a DB table, matching the
 * privacy model: location is only ever visible to accepted friends, and
 * there's no row an RLS policy could ever leak.
 *
 * Subscribing to a friend's channel when they aren't currently broadcasting
 * is harmless and cheap (no events ever arrive on that channel) — this hook
 * subscribes to every friend ID passed in unconditionally rather than first
 * checking who's "active," keeping the design simple.
 */
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
