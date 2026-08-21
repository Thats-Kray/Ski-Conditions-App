import { useEffect, useState } from "react"
import { getCurrentUser, getMyDailyPlan, upsertDailyPlan } from "../lib/socialApi"
import { buildPlanUpsert } from "../lib/planUpsert"
import { resortName, OPEN_RESORT_KEY, OPEN_RESORT_LABEL, OPEN_RESORT_EMOJI } from "../lib/resorts"
import { localDateKey } from "../lib/calendarDates"
import { formatEtaShort } from "../lib/format"

export default function SkiCheckInForm({ resorts, onSaved }) {
  const [user, setUser] = useState(null)
  const [resortKey, setResortKey] = useState("")
  const [eta, setEta] = useState("")
  const [note, setNote] = useState("")
  const [status, setStatus] = useState("planned")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [hasPlan, setHasPlan] = useState(false)
  // Opens straight into the editable form rather than a read-only summary. This
  // component is only ever mounted by tapping "Check In Today", and the point of
  // that tap is to set your status and ETA — making the user press "Edit Today's
  // Plan" first put the actual controls one tap further away than the button that
  // opened them. The summary is still reachable via Cancel.
  const [isEditing, setIsEditing] = useState(true)

  // Local date key, not UTC — this is the ski_date the check-in below gets written
  // to, and after ~5pm Mountain a UTC key would write the plan to tomorrow.
  const today = localDateKey()

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
          setStatus(existingPlan.status || "planned")
          setHasPlan(true)
          // Edit mode, not the read-only summary. Tapping "Check In Today" is the
          // user asking to set their status and ETA, so land them on the controls
          // that do it. The summary stays reachable via Cancel.
          setIsEditing(true)
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
        status,
        // A real UTC instant, not a date key — arrived_at is a timestamptz. For the
        // non-arrived cases this is explicitly undefined (carry forward / let
        // buildPlanUpsert's status-arrived invariant null it out) rather than
        // omitting the key — self-documenting instead of relying on a distant rule.
        arrivedAt: status === "arrived" ? new Date().toISOString() : undefined,
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
              ETA: {(eta && formatEtaShort(new Date(`${today}T${eta}:00`).toISOString())) || "No ETA"}
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

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: 1,
              color: "var(--color-text-3)", textTransform: "uppercase",
            }}>
              Where are you?
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { key: "planned", label: "Not left yet" },
                { key: "driving", label: "🚗 Driving" },
                { key: "arrived", label: "⛷️ Arrived" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatus(key)}
                  disabled={loading}
                  aria-pressed={status === key}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 999, fontSize: 12, fontWeight: 700,
                    border: status === key
                      ? "1px solid var(--color-accent)"
                      : "1px solid var(--color-border)",
                    background: status === key ? "var(--color-accent-dim)" : "transparent",
                    color: status === key ? "var(--color-text-1)" : "var(--color-text-3)",
                    cursor: loading ? "default" : "pointer", minHeight: 44,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {status !== "arrived" && (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: 1,
                color: "var(--color-text-3)", textTransform: "uppercase",
              }}>
                {status === "driving" ? "When will you get there?" : "When are you planning to arrive?"}
              </div>

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

              {status === "planned" && eta && (
                <div style={{ fontSize: 11, color: "var(--color-text-3)" }}>
                  Still arriving around {eta}? Update it if that has changed.
                </div>
              )}
            </div>
          )}

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