import { useEffect, useState } from "react"
import {
  getCurrentUser,
  getTodaysVisiblePlans,
  markArrival,
  markDriving,
} from "../lib/socialApi"
import { resortName } from "../lib/resorts"
import { localDateKey } from "../lib/calendarDates"
import UserProfileModal from "./UserProfileModal"

function formatPlanTime(isoString) {
  if (!isoString) return "No ETA"
  const d = new Date(isoString)
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

function statusColor(status) {
  // "arrived"/"done"/unknown intentionally avoid the numerically-exact --rating-mint/
  // --rating-coral tokens (those are domain-locked to ski-conditions tier/risk ratings,
  // not crew-arrival status) in favor of the semantically-correct generic status tokens —
  // matching the same driving/warning + arrived/success pairing already used by this same
  // file's Driving/Arrived action buttons below.
  if (status === "arrived") return "var(--color-success)"
  if (status === "driving") return "var(--color-warning)"
  if (status === "planning") return "var(--color-banner-highlight)"
  // "done": no existing token (exact or near) matches this pale-violet shade — same
  // unresolved value as AvatarStatusRail.jsx's identical "done" case (Task 1, rule 9).
  if (status === "done") return "#c4b5fd" // TODO(theming): no catalog token matches this pale-violet shade
  return "var(--color-danger)"
}

function statusLabel(status) {
  if (status === "arrived") return "On mountain"
  if (status === "driving") return "On the way"
  if (status === "planning") return "Planning"
  if (status === "done") return "Done"
  if (status === "cancelled") return "Cancelled"
  return status || "Unknown"
}

function displayNameForPlan(plan, currentUser) {
  if (currentUser && plan?.user_id === currentUser.id) {
    return "You"
  }

  return (
    plan?.profile?.full_name ||
    plan?.profile?.username ||
    "Skier"
  )
}

function initialsFromName(name) {
  return (name || "S")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function Avatar({ plan, currentUser }) {
  const displayName = displayNameForPlan(plan, currentUser)
  const avatarUrl = plan?.profile?.avatar_url

  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        overflow: "hidden",
        background: "#dbeafe", // TODO(theming): no catalog token matches this pale-blue avatar-fallback shade
        display: "grid",
        placeItems: "center",
        fontSize: 11,
        fontWeight: 900,
        color: "var(--color-modal-bg)",
        flexShrink: 0,
      }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initialsFromName(displayName)
      )}
    </div>
  )
}

export default function TodaysCrew() {
  const [user, setUser] = useState(null)
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [arriving, setArriving] = useState(false)
  const [driving, setDriving] = useState(false)
  const [viewingUserId, setViewingUserId] = useState(null)

  // Local date parts, never toISOString() — after ~5pm Mountain Time UTC has already
  // rolled over and this component would show tomorrow's crew all evening. Same
  // constraint documented at the top of lib/calendarDates.js.
  const today = localDateKey()

  // plans is sorted with the signed-in user first (loadPlans), but find by id rather
  // than taking [0] — the sort only guarantees position when the user has a plan at all.
  const myPlan = plans.find((p) => p.user_id === user?.id) || null

  // isCancelled defaults to a no-op so the Refresh button and the post-mutation
  // reload (handleMarkDriving/handleMarkArrived) behave exactly as before; only the
  // mount effect below passes a real one, matching the `cancelled` pattern already
  // used by AvatarStatusRail.jsx and CheckInTodayCta in HomeDashboard.jsx.
  async function loadPlans(isCancelled = () => false) {
    setLoading(true)
    setMessage("")

    try {
      const currentUser = await getCurrentUser()
      if (isCancelled()) return
      setUser(currentUser)

      const visiblePlans = await getTodaysVisiblePlans(today)
      if (isCancelled()) return

      const sorted = [...visiblePlans].sort((a, b) => {
        if (a.user_id === currentUser.id) return -1
        if (b.user_id === currentUser.id) return 1
        return 0
      })

      setPlans(sorted)
    } catch (err) {
      if (isCancelled()) return
      // getCurrentUser() throws rather than resolving null when there's no session
      // (see AvatarStatusRail.jsx for the same pattern) — this component is mounted
      // on Home, which browse-mode visitors reach while logged out, so a bare
      // "Not authenticated." must not surface as a user-facing message. Log it for
      // diagnosis and fall back to the signed-out empty state; only genuine load
      // failures for a signed-in user should ever reach `message`.
      if (err.message === "Not authenticated.") {
        console.error(err)
        setUser(null)
        setPlans([])
      } else {
        setMessage(err.message || "Could not load today's crew.")
      }
    } finally {
      if (!isCancelled()) setLoading(false)
    }
  }

  async function handleMarkDriving() {
    setDriving(true)
    setMessage("")

    try {
      if (!myPlan) { setMessage("Set today's plan first."); return }
      await markDriving(myPlan.id)
      await loadPlans()
      setMessage("Drive safe.")
    } catch (err) {
      setMessage(err.message || "Could not mark driving.")
    } finally {
      setDriving(false)
    }
  }

  async function handleMarkArrived() {
    setArriving(true)
    setMessage("")

    try {
      if (!myPlan) { setMessage("Set today's plan first."); return }
      await markArrival(myPlan.id)
      await loadPlans()
      setMessage("Marked as arrived.")
    } catch (err) {
      setMessage(err.message || "Could not mark arrival.")
    } finally {
      setArriving(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    loadPlans(() => cancelled)
    return () => { cancelled = true }
  }, [])

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 18,
        padding: 16,
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16 }}>
          Today’s Crew
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={loadPlans}
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.12)",
              padding: "8px 10px",
              borderRadius: 10,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            Refresh
          </button>

          {user && (
            <>
              <button
                onClick={handleMarkDriving}
                disabled={driving}
                style={{
                  background: driving
                    ? "rgba(255,255,255,0.12)"
                    : "linear-gradient(135deg,var(--color-warning),var(--color-warning))",
                  color: "var(--color-bg)",
                  border: "none",
                  padding: "8px 10px",
                  borderRadius: 10,
                  cursor: driving ? "not-allowed" : "pointer",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {driving ? "Updating..." : "Driving"}
              </button>

              <button
                onClick={handleMarkArrived}
                disabled={arriving}
                style={{
                  background: arriving
                    ? "rgba(255,255,255,0.12)"
                    : "linear-gradient(135deg,var(--color-success),var(--color-success-strong))",
                  color: "var(--color-pass-pill-text)",
                  border: "none",
                  padding: "8px 10px",
                  borderRadius: 10,
                  cursor: arriving ? "not-allowed" : "pointer",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {arriving ? "Marking..." : "Arrived"}
              </button>
            </>
          )}
        </div>
      </div>

      {!user ? (
        <div style={{ color: "rgba(255,255,255,0.7)" }}>
          Sign in to see who’s skiing today.
        </div>
      ) : loading ? (
        <div style={{ color: "rgba(255,255,255,0.7)" }}>
          Loading today's crew...
        </div>
      ) : plans.length === 0 ? (
        <div style={{ color: "rgba(255,255,255,0.7)" }}>
          Nobody has posted a plan yet.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {plans.map((plan) => (
            <div
              key={plan.id}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 14,
                padding: 12,
                display: "grid",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "36px 1fr auto",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div
                  onClick={() => plan.user_id !== user?.id && setViewingUserId(plan.user_id)}
                  style={{ cursor: plan.user_id !== user?.id ? "pointer" : "default" }}
                >
                  <Avatar plan={plan} currentUser={user} />
                </div>

                <div
                  onClick={() => plan.user_id !== user?.id && setViewingUserId(plan.user_id)}
                  style={{ cursor: plan.user_id !== user?.id ? "pointer" : "default" }}
                >
                  <div style={{ fontWeight: 800 }}>
                    {displayNameForPlan(plan, user)}
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>
                    {resortName(plan.resort_key) || "Unknown resort"}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    color: statusColor(plan.status),
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  {statusLabel(plan.status)}
                </div>
              </div>

              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.62)" }}>
                ETA: {formatPlanTime(plan.eta)}
                {plan.arrived_at
                  ? ` · Arrived ${formatPlanTime(plan.arrived_at)}`
                  : ""}
              </div>

              {plan.note && (
                <div style={{ fontSize: 13 }}>
                  "{plan.note}"
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {message && (
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          {message}
        </div>
      )}
      {viewingUserId && (
        <UserProfileModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />
      )}
    </div>
  )
}