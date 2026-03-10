import { useEffect, useState } from "react"
import {
  getCurrentUser,
  getTodaysVisiblePlans,
  markArrival,
  markDriving,
} from "../lib/socialApi"

function formatPlanTime(isoString) {
  if (!isoString) return "No ETA"
  const d = new Date(isoString)
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

function statusColor(status) {
  if (status === "arrived") return "#8ef6d1"
  if (status === "driving") return "#fde68a"
  if (status === "planning") return "#93c5fd"
  if (status === "done") return "#c4b5fd"
  return "#ff9d9d"
}

function statusLabel(status) {
  if (status === "arrived") return "On mountain"
  if (status === "driving") return "On the way"
  if (status === "planning") return "Planning"
  if (status === "done") return "Done"
  if (status === "cancelled") return "Cancelled"
  return status || "Unknown"
}

function prettifyResortKey(key) {
  if (!key) return "Unknown resort"

  const map = {
    vail: "Vail",
    beavercreek: "Beaver Creek",
    breckenridge: "Breckenridge",
    keystone: "Keystone",
    crestedbutte: "Crested Butte",
    telluride: "Telluride",
    winterpark: "Winter Park",
    coppermountain: "Copper Mountain",
    arapahoebasin: "Arapahoe Basin",
    steamboat: "Steamboat",
    eldora: "Eldora",
    aspensnowmass: "Aspen Snowmass",
  }

  return map[key] || key
}

function displayNameForPlan(plan, currentUser) {
  if (currentUser && plan?.user_id === currentUser.id) {
    return "You"
  }

  return (
    plan?.profiles?.full_name ||
    plan?.profiles?.username ||
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
  const avatarUrl = plan?.profiles?.avatar_url

  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        overflow: "hidden",
        background: "#dbeafe",
        display: "grid",
        placeItems: "center",
        fontSize: 11,
        fontWeight: 900,
        color: "#0f172a",
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

  const today = new Date().toISOString().slice(0, 10)

  async function loadPlans() {
    setLoading(true)
    setMessage("")

    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)

      if (!currentUser) {
        setPlans([])
        return
      }

      const visiblePlans = await getTodaysVisiblePlans(today)

      const sorted = [...visiblePlans].sort((a, b) => {
        if (a.user_id === currentUser.id) return -1
        if (b.user_id === currentUser.id) return 1
        return 0
      })

      setPlans(sorted)
    } catch (err) {
      setMessage(err.message || "Could not load today's crew.")
    } finally {
      setLoading(false)
    }
  }

  async function handleMarkDriving() {
    setDriving(true)
    setMessage("")

    try {
      await markDriving(today)
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
      await markArrival(today)
      await loadPlans()
      setMessage("Marked as arrived.")
    } catch (err) {
      setMessage(err.message || "Could not mark arrival.")
    } finally {
      setArriving(false)
    }
  }

  useEffect(() => {
    loadPlans()
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
                    : "linear-gradient(135deg,#fde047,#facc15)",
                  color: "#1f2937",
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
                    : "linear-gradient(135deg,#34d399,#22c55e)",
                  color: "#052e2b",
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
                <Avatar plan={plan} currentUser={user} />

                <div>
                  <div style={{ fontWeight: 800 }}>
                    {displayNameForPlan(plan, user)}
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>
                    {prettifyResortKey(plan.resort_key)}
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
    </div>
  )
}