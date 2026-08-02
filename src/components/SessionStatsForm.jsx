import { useState } from "react"

const inputStyle = {
  width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10, padding: "10px 12px", color: "white", fontSize: 14, boxSizing: "border-box",
  outline: "none",
}

const labelStyle = {
  display: "block", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)",
  marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5,
}

export default function SessionStatsForm({ initial, onSave, onSkip, saving }) {
  const [runs, setRuns]         = useState(initial?.runs_logged ?? "")
  const [vertical, setVertical] = useState(initial?.vertical_feet ?? "")
  const [miles, setMiles]       = useState(initial?.miles_skied ?? "")
  const [topSpeed, setTopSpeed] = useState(initial?.top_speed_mph ?? "")

  function handleSave() {
    onSave({
      runs_logged: runs === "" ? null : Number(runs),
      vertical_feet: vertical === "" ? null : Number(vertical),
      miles_skied: miles === "" ? null : Number(miles),
      top_speed_mph: topSpeed === "" ? null : Number(topSpeed),
    })
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <label style={labelStyle}>
        Runs skied
        <input type="number" min="0" style={{ ...inputStyle, marginTop: 6 }} value={runs} onChange={(e) => setRuns(e.target.value)} />
      </label>
      <label style={labelStyle}>
        Vertical feet
        <input type="number" min="0" style={{ ...inputStyle, marginTop: 6 }} value={vertical} onChange={(e) => setVertical(e.target.value)} />
      </label>
      <label style={labelStyle}>
        Miles
        <input type="number" min="0" step="0.1" style={{ ...inputStyle, marginTop: 6 }} value={miles} onChange={(e) => setMiles(e.target.value)} />
      </label>
      <label style={labelStyle}>
        Top speed (mph)
        <input type="number" min="0" step="0.1" style={{ ...inputStyle, marginTop: 6 }} value={topSpeed} onChange={(e) => setTopSpeed(e.target.value)} />
      </label>
      <div style={{ display: "flex", gap: 10, marginTop: 4, alignItems: "center" }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            background: "linear-gradient(135deg,#2563eb,#0891b2)", color: "white", border: "none",
            borderRadius: 12, padding: "12px 20px", fontSize: 14, fontWeight: 900,
            cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, flex: onSkip ? "none" : 1,
          }}
        >
          {saving ? "Saving…" : "Save Stats"}
        </button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
          >
            I'll add stats later
          </button>
        )}
      </div>
    </div>
  )
}
