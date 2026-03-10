import { useEffect, useState } from "react"
import { getCurrentUser, getMyDailyPlan, upsertDailyPlan } from "../lib/socialApi"

export default function SkiCheckInForm({ resorts }) {
  const [user, setUser] = useState(null)
  const [resortKey, setResortKey] = useState("")
  const [eta, setEta] = useState("")
  const [note, setNote] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    async function load() {
      const currentUser = await getCurrentUser()
      setUser(currentUser)

      if (!currentUser) return

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
      }
    }

    load()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage("")
    setLoading(true)

    try {
      if (!user) {
        throw new Error("Please sign in first.")
      }

      const etaIso = eta
        ? new Date(`${today}T${eta}:00`).toISOString()
        : null

      await upsertDailyPlan({
        skiDate: today,
        resortKey,
        eta: etaIso,
        note,
        status: "planning",
        visibility: "friends",
      })

      setMessage("Your ski plan for today has been saved.")
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

      {!user ? (
        <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>
          Sign in to tell your crew where you’re skiing today.
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

          <input
            type="text"
            placeholder="Optional note (ex: leaving Denver at 6:15)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "white",
              padding: "10px 12px",
              borderRadius: 12,
              outline: "none",
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading
                ? "rgba(255,255,255,0.12)"
                : "linear-gradient(135deg, #22c55e, #14b8a6)",
              color: "#052e2b",
              border: "none",
              padding: "10px 12px",
              borderRadius: 12,
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 900,
            }}
          >
            {loading ? "Saving..." : "Save Today’s Plan"}
          </button>
        </form>
      )}

      {message && (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>
          {message}
        </div>
      )}
    </div>
  )
}