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
  if (status === "driving") return "#fde047"
  if (status === "planning") return "#9bc6ff"
  if (status === "done") return "#c4b5fd"
  return "#ff9d9d"
}

function statusLabel(status) {
  if (status === "arrived") return "On Mountain"
  if (status === "driving") return "Driving"
  if (status === "planning") return "Planning"
  if (status === "done") return "Done"
  return status || "Unknown"
}

function prettifyResortKey(key) {
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

function displayNameForPlan(plan, user) {
  if (user && plan.user_id === user.id) return "You"

  return (
    plan?.profiles?.full_name ||
    plan?.profiles?.username ||
    "Skier"
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
      {/* Header */}

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

      {/* Content */}

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
                gap: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 800 }}>
                  {displayNameForPlan(plan, user)}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    color: statusColor(plan.status),
                    textTransform: "uppercase",
                  }}
                >
                  {statusLabel(plan.status)}
                </div>
              </div>

              <div style={{ fontSize: 14 }}>
                {prettifyResortKey(plan.resort_key)}
              </div>

              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
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