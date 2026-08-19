import { useEffect, useState } from "react"
import { getCurrentUser, getMyDailyPlan, upsertDailyPlan } from "../lib/socialApi"
import { buildPlanUpsert } from "../lib/planUpsert"
import { resortName, OPEN_RESORT_KEY, OPEN_RESORT_LABEL, OPEN_RESORT_EMOJI } from "../lib/resorts"

function formatPlanTime(isoString) {
  if (!isoString) return "No ETA"
  const d = new Date(isoString)
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

export default function SkiCheckInForm({ resorts, onSaved }) {
  const [user, setUser] = useState(null)
  const [resortKey, setResortKey] = useState("")
  const [eta, setEta] = useState("")
  const [note, setNote] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [hasPlan, setHasPlan] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    async function load() {
      setInitialLoading(true)
      setMessage("")

      try {
        const currentUser = await getCurrentUser()
        setUser(currentUser)

        if (!currentUser) {
          setHasPlan(false)
          setIsEditing(false)
          return
        }

        const existingPlan = await getMyDailyPlan(today)

        if (existingPlan) {
          setResortKey(existingPlan.resort_key || "")
          if (existingPlan.eta) {
            const etaDate = new Date(existingPlan.eta)
            const hh = String(etaDate.getHours()).padStart(2, "0")
            const mm = String(etaDate.getMinutes()).padStart(2, "0")
            setEta(`${hh}:${mm}`)
          }
          setNote(existingPlan.note || "")
          setHasPlan(true)
          setIsEditing(false)
        } else {
          setHasPlan(false)
          setIsEditing(true)
        }
      } catch (err) {
        setMessage(err.message || "Could not load your plan.")
      } finally {
        setInitialLoading(false)
      }
    }

    load()
  }, [today])

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage("")
    setLoading(true)

    try {
      if (!user) {
        throw new Error("Please sign in first.")
      }

      // Read the existing row and merge through buildPlanUpsert rather than
      // writing a hardcoded status/visibility: upsertDailyPlan writes the whole
      // row, so a naive payload here would silently blank any ETA already set
      // and un-private a plan the user marked Private in the plan editor.
      const existing = await getMyDailyPlan(today)
      await upsertDailyPlan(buildPlanUpsert(existing, {
        skiDate: today,
        resortKey,
        eta: eta || undefined, // only override when the user actually set one
        note: note || null,
      }))

      setHasPlan(true)
      setIsEditing(false)
      setMessage("Your ski plan for today has been saved.")
      onSaved?.()
    } catch (err) {
      setMessage(err.message || "Something went wrong.")
    } finally {
      setLoading(false)
    }
  }

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
      <div style={{ fontWeight: 900, fontSize: 16 }}>I’m Skiing Today</div>

      {!user && !initialLoading ? (
        <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>
          Sign in to tell your crew where you’re skiing today.
        </div>
      ) : initialLoading ? (
        <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>
          Loading today’s plan...
        </div>
      ) : hasPlan && !isEditing ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "grid",
              gap: 8,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: 12,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              {resortName(resortKey) || "No resort selected"}
            </div>

            <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>
              ETA: {eta ? formatPlanTime(new Date(`${today}T${eta}:00`).toISOString()) : "No ETA"}
            </div>

            <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>
              Note: {note || "No note added"}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsEditing(true)
              setMessage("")
            }}
            style={{
              background: "var(--gradient-cta)",
              color: "white",
              border: "none",
              padding: "10px 12px",
              borderRadius: 12,
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Edit Today’s Plan
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
          <select
            value={resortKey}
            onChange={(e) => setResortKey(e.target.value)}
            required
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "white",
              padding: "10px 12px",
              borderRadius: 12,
              outline: "none",
            }}
          >
            <option value="">Select a resort</option>
            {resorts.map((r) => (
              <option key={r.resortKey} value={r.resortKey}>
                {r.name}
              </option>
            ))}
            {/* Added here, not to RESORT_NAMES — see resorts.js for why. */}
            <option value={OPEN_RESORT_KEY}>{OPEN_RESORT_EMOJI} {OPEN_RESORT_LABEL}</option>
          </select>

          <input
            type="time"
            value={eta}
            onChange={(e) => setEta(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "white",
              padding: "10px 12px",
              borderRadius: 12,
              outline: "none",
            }}
          />

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for the crew"
            rows={3}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "white",
              padding: "10px 12px",
              borderRadius: 12,
              outline: "none",
              resize: "vertical",
            }}
          />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading
                  ? "rgba(255,255,255,0.12)"
                  : "var(--gradient-cta)",
                color: "white",
                border: "none",
                padding: "10px 12px",
                borderRadius: 12,
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: 800,
              }}
            >
              {loading ? "Saving..." : hasPlan ? "Save Changes" : "Save Today’s Plan"}
            </button>

            {hasPlan && (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false)
                  setMessage("")
                }}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.12)",
                  padding: "10px 12px",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {message && (
        <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 13 }}>
          {message}
        </div>
      )}
    </div>
  )
}