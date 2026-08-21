// src/components/ui/AvatarStatusRail.jsx
import { useEffect, useState } from "react"
import { getCurrentUser, getTodaysVisiblePlans } from "../../lib/socialApi"
import UserProfileModal from "../UserProfileModal"
import { localDateKey } from "../../lib/calendarDates"

function statusColor(status) {
  if (status === "arrived") return "var(--color-success)"
  if (status === "driving") return "var(--color-warning)"
  if (status === "planning") return "var(--color-accent-soft)"
  /* TODO(theming): unclear semantic, ask before tokenizing — no existing token matches
     these "done"/unknown-status shades exactly, and Task 1 must stay pixel-lossless. */
  if (status === "done") return "#c4b5fd"
  return "#94a3b8"
}

function statusLabel(status) {
  if (status === "arrived") return "On Mountain"
  if (status === "driving") return "En Route"
  if (status === "planning") return "Planning"
  if (status === "done") return "Done"
  return status || "Unknown"
}

function initialsFromName(name) {
  return (name || "S").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

export default function AvatarStatusRail() {
  const [user, setUser] = useState(null)
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewingUserId, setViewingUserId] = useState(null)
  // Local date key, not UTC — this rail needs to agree with TodaysCrew on what
  // "today" means, or the avatar row and the crew list disagree after ~5pm Mountain.
  const today = localDateKey()

  useEffect(() => {
    let cancelled = false
    Promise.all([getCurrentUser(), getTodaysVisiblePlans(today)])
      .then(([currentUser, visiblePlans]) => {
        if (cancelled) return
        setUser(currentUser)
        setPlans(visiblePlans)
      })
      .catch(() => { if (!cancelled) setPlans([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return null
  if (!plans.length) {
    return (
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
        Nobody's posted a plan for today yet.
      </div>
    )
  }

  return (
    <>
      <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 4 }}>
        {plans.map((plan) => {
          const name = plan.user_id === user?.id ? "You" : (plan.profile?.full_name || plan.profile?.username || "Skier")
          const avatarUrl = plan.profile?.avatar_url
          const color = statusColor(plan.status)
          return (
            <button
              key={plan.id}
              onClick={() => plan.user_id !== user?.id && setViewingUserId(plan.user_id)}
              style={{
                flexShrink: 0, display: "grid", justifyItems: "center", gap: 4, width: 68,
                background: "none", border: "none", cursor: plan.user_id !== user?.id ? "pointer" : "default", padding: 0,
              }}
            >
              <div style={{ position: "relative" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", overflow: "hidden", background: "var(--color-surface-popover)", display: "grid", placeItems: "center", fontSize: 16, fontWeight: 900, color: "white", border: `2px solid ${color}` }}>
                  {avatarUrl ? <img src={avatarUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initialsFromName(name)}
                </div>
                <div style={{ position: "absolute", bottom: 2, right: 2, width: 12, height: 12, borderRadius: "50%", background: color, border: "2px solid var(--color-bg)" }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "white", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{name}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color, textAlign: "center" }}>{statusLabel(plan.status)}</div>
            </button>
          )
        })}
      </div>
      {viewingUserId && <UserProfileModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />}
    </>
  )
}
