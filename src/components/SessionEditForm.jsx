import { useState } from "react"
import ResortPicker from "./ui/ResortPicker"

const inputStyle = {
  width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10, padding: "10px 12px", color: "white", fontSize: 14, boxSizing: "border-box",
  outline: "none",
}

const lockedInputStyle = {
  ...inputStyle, background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.35)", cursor: "not-allowed",
}

const labelStyle = {
  display: "block", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)",
  marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5,
}

// Same definition as ProfilePage.jsx's own hasStats() — duplicated rather
// than imported/exported across files for a 3-line check, matching this
// codebase's existing precedent (formatMinutes has 3 independent copies).
function hasStats(session) {
  return session.runs_logged != null || session.vertical_feet != null || session.miles_skied != null || session.top_speed_mph != null
}

export default function SessionEditForm({ session, onSave, saving }) {
  const [notes, setNotes]   = useState(session?.notes ?? "")
  const [resort, setResort] = useState(session?.resort_name ?? "")

  const statsLocked = hasStats(session)

  // Only ever used when statsLocked is false (first-time entry for a
  // manually-logged day with no GPS/Strava source for this data).
  const [runs, setRuns]         = useState(session?.runs_logged ?? "")
  const [vertical, setVertical] = useState(session?.vertical_feet ?? "")
  const [miles, setMiles]       = useState(session?.miles_skied ?? "")
  const [topSpeed, setTopSpeed] = useState(session?.top_speed_mph ?? "")

  function handleSave() {
    const fields = {
      notes: notes.trim() || null,
      resort_name: resort || session?.resort_name,
    }
    if (!statsLocked) {
      fields.runs_logged   = runs === "" ? null : Number(runs)
      fields.vertical_feet = vertical === "" ? null : Number(vertical)
      fields.miles_skied   = miles === "" ? null : Number(miles)
      fields.top_speed_mph = topSpeed === "" ? null : Number(topSpeed)
    }
    onSave(fields)
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <label style={labelStyle}>
        Activity Name
        <input
          style={{ ...inputStyle, marginTop: 6 }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Powder day at Vail"
        />
      </label>

      <label style={labelStyle}>
        Mountain
        <div style={{ marginTop: 6 }}>
          <ResortPicker value={resort} onChange={setResort} />
        </div>
      </label>

      {statsLocked && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 12px" }}>
          Stats are locked once set (from GPS tracking, Strava, or a prior entry) — only the name and mountain can be changed.
        </div>
      )}

      <label style={labelStyle}>
        Runs skied
        <input
          type="number" min="0" disabled={statsLocked}
          style={{ ...(statsLocked ? lockedInputStyle : inputStyle), marginTop: 6 }}
          value={statsLocked ? (session?.runs_logged ?? "") : runs}
          onChange={(e) => setRuns(e.target.value)}
        />
      </label>
      <label style={labelStyle}>
        Vertical feet
        <input
          type="number" min="0" disabled={statsLocked}
          style={{ ...(statsLocked ? lockedInputStyle : inputStyle), marginTop: 6 }}
          value={statsLocked ? (session?.vertical_feet ?? "") : vertical}
          onChange={(e) => setVertical(e.target.value)}
        />
      </label>
      <label style={labelStyle}>
        Miles
        <input
          type="number" min="0" step="0.1" disabled={statsLocked}
          style={{ ...(statsLocked ? lockedInputStyle : inputStyle), marginTop: 6 }}
          value={statsLocked ? (session?.miles_skied ?? "") : miles}
          onChange={(e) => setMiles(e.target.value)}
        />
      </label>
      <label style={labelStyle}>
        Top speed (mph)
        <input
          type="number" min="0" step="0.1" disabled={statsLocked}
          style={{ ...(statsLocked ? lockedInputStyle : inputStyle), marginTop: 6 }}
          value={statsLocked ? (session?.top_speed_mph ?? "") : topSpeed}
          onChange={(e) => setTopSpeed(e.target.value)}
        />
      </label>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        style={{
          background: "linear-gradient(135deg,#2563eb,#0891b2)", color: "white", border: "none",
          borderRadius: 12, padding: "12px 20px", fontSize: 14, fontWeight: 900,
          cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  )
}
