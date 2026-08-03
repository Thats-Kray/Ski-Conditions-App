import { useState } from "react"
import ResortPicker from "./ui/ResortPicker"
import { authHeaders } from "../lib/supabase"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8787"

export default function StravaSyncReview({ activities, skippedNonSki, onClose, onImported }) {
  const [selections, setSelections] = useState(() =>
    Object.fromEntries(
      activities.map((a) => [a.stravaActivityId, { included: true, resortName: "", notes: a.name }])
    )
  )
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState("")

  function updateSelection(id, patch) {
    setSelections((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const includedCount = Object.values(selections).filter((s) => s.included).length
  const missingResort = activities.some(
    (a) => selections[a.stravaActivityId]?.included && !selections[a.stravaActivityId]?.resortName
  )

  async function handleImport() {
    setError("")
    setImporting(true)
    try {
      const payload = activities
        .filter((a) => selections[a.stravaActivityId]?.included)
        .map((a) => ({
          stravaActivityId: a.stravaActivityId,
          resortName:       selections[a.stravaActivityId].resortName,
          notes:            selections[a.stravaActivityId].notes,
        }))

      const res = await fetch(`${API_BASE}/api/strava/sync-commit`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ activities: payload }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result?.error || `Import failed (${res.status})`)
      onImported(result)
    } catch (err) {
      setError(err.message || "Could not import activities.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "20px 20px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: 520, maxHeight: "85dvh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "white" }}>Review Strava Activities</div>
          <button
            onClick={onClose}
            style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.6)", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}
          >
            ✕
          </button>
        </div>

        {activities.length === 0 ? (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", padding: "20px 0" }}>
            No new ski activities found from Strava this season
            {skippedNonSki > 0 ? ` (${skippedNonSki} non-ski activities skipped).` : "."}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12, flexShrink: 0 }}>
              Found {activities.length} ski activit{activities.length === 1 ? "y" : "ies"} not yet in your log. Pick a mountain for each one you want to import.
            </div>
            <div style={{ overflowY: "auto", display: "grid", gap: 12, paddingRight: 2 }}>
              {activities.map((a) => {
                const sel = selections[a.stravaActivityId]
                return (
                  <div key={a.stravaActivityId} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 12 }}>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={sel.included}
                        onChange={(e) => updateSelection(a.stravaActivityId, { included: e.target.checked })}
                        style={{ marginTop: 3 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input
                          value={sel.notes}
                          onChange={(e) => updateSelection(a.stravaActivityId, { notes: e.target.value })}
                          style={{ width: "100%", background: "transparent", border: "none", color: "white", fontSize: 14, fontWeight: 700, padding: 0, marginBottom: 2 }}
                        />
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                          {a.date}
                          {a.verticalFeet != null && ` · ${a.verticalFeet} ft`}
                          {a.milesSkied != null && ` · ${a.milesSkied} mi`}
                          {a.topSpeedMph != null && ` · ${a.topSpeedMph} mph`}
                        </div>
                      </div>
                    </label>
                    {sel.included && (
                      <div style={{ marginTop: 10, marginLeft: 26 }}>
                        <ResortPicker
                          value={sel.resortName}
                          onChange={(name) => updateSelection(a.stravaActivityId, { resortName: name })}
                          placeholder="Pick a mountain..."
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {error && <div style={{ fontSize: 13, color: "#f87171", marginTop: 12, flexShrink: 0 }}>{error}</div>}

            <button
              onClick={handleImport}
              disabled={importing || includedCount === 0 || missingResort}
              style={{
                marginTop: 16, width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                background: "linear-gradient(135deg,#2563eb,#0891b2)", color: "white", fontWeight: 900, fontSize: 14,
                cursor: importing || includedCount === 0 || missingResort ? "not-allowed" : "pointer",
                opacity: importing || includedCount === 0 || missingResort ? 0.6 : 1,
                flexShrink: 0,
              }}
            >
              {importing ? "Importing…" : `Import ${includedCount} Selected`}
            </button>
            {missingResort && includedCount > 0 && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 8, textAlign: "center", flexShrink: 0 }}>
                Pick a mountain for every selected activity to continue.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
