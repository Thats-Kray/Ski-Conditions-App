import { useState, useEffect } from "react"
import { getAcceptedFriends } from "../lib/socialApi"
import Avatar from "./ui/Avatar"

/**
 * A controlled, Set-backed checkbox list of the current user's accepted friends, used to
 * tag who you skied with. Extracted from TripDetailModal's inline invite panel
 * (TripDetailModal.jsx:1219-1238) with the trip-specific concerns dropped: no
 * already-invited/already-RSVPd disabling, no email tab, no send button.
 *
 * Fully controlled. `selectedIds` is a Set owned by the parent and NEVER mutated here —
 * every toggle constructs a fresh Set and passes it up. Mutating the prop in place would
 * leave the parent's useState holding the same reference, so the re-render would never
 * happen and the checkboxes would look dead.
 *
 * Only friends can be tagged, and that is enforced in RLS
 * (ski_session_tags_insert's are_friends(tagged_user_id)), not by this list. This list
 * only exists so a legitimate user does not have to guess who is taggable.
 *
 * @param {{selectedIds: Set<string>, onChange: (next: Set<string>) => void}} props
 */
export default function FriendTagPicker({ selectedIds, onChange }) {
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    getAcceptedFriends()
      .then((rows) => {
        if (!cancelled) setFriends(rows || [])
      })
      .catch((e) => {
        // Warned, not silently swallowed. A failed friends fetch is otherwise
        // indistinguishable from "you have no friends yet", which is the exact
        // silent-failure shape Feed-B's comment fetch had to guard against.
        console.warn("FriendTagPicker: getAcceptedFriends failed", e)
        if (!cancelled) setError("Couldn't load your friends list.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function toggle(id) {
    const next = new Set(selectedIds || [])
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    onChange(next)
  }

  if (loading) {
    return <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Loading friends…</div>
  }
  if (error) {
    return <div style={{ fontSize: 13, color: "var(--color-danger)" }}>{error}</div>
  }
  if (friends.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
        No friends yet — add friends to tag them on a ski day.
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gap: 8, maxHeight: 180, overflowY: "auto" }}>
      {friends.map((f) => {
        const selected = (selectedIds || new Set()).has(f.id)
        return (
          <label
            key={f.id}
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => toggle(f.id)}
              style={{ accentColor: "var(--color-accent)", width: 16, height: 16, flexShrink: 0 }}
            />
            <Avatar profile={f} size={28} />
            {/* flex:1 + minWidth:0 + ellipsis, which the TripDetailModal original lacks.
                At 375px, inside a modal with 24px padding each side, a long display name
                without these pushes the row wider than its container and the checkbox
                slides off the left edge. Two mobile-layout regressions shipped out of the
                Board slice's restyle for exactly this class of omission. */}
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 13,
                color: "rgba(255,255,255,0.82)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {f.full_name || f.username}
            </span>
          </label>
        )
      })}
    </div>
  )
}
