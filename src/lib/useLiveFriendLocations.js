import { useState, useEffect } from "react"
import { supabase } from "./supabase"

const STALE_MS = 90 * 1000

/**
 * Subscribes to every accepted friend's live-location broadcast channel and
 * returns their most recent position, keyed by friend user ID.
 *
 * Uses Supabase Realtime Broadcast (ephemeral pub/sub) rather than
 * `postgres_changes` — nothing is persisted to a DB table, so there's no row
 * that could ever be leaked by a location-history query.
 *
 * Broadcast channels are open by default in Supabase, so passing friendIds
 * here is NOT what enforces "friends only" — that's enforced server-side by
 * Realtime Authorization: this channel is opened with `private: true`, and
 * migrations/018_live_location_realtime_authz.sql adds RLS policies on
 * `realtime.messages` that only let a user read `mountain:live:{ownerId}`
 * broadcasts if they ARE `ownerId` or an accepted friend of `ownerId` (per
 * `friend_requests`). Without both pieces, any client holding the anon key
 * could read any user's live position by guessing/looking up their ID.
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
        .channel(`mountain:live:${friendId}`, { config: { private: true } })
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
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR") {
            console.warn(`Live location channel error for friend ${friendId}:`, err)
          }
        })
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
