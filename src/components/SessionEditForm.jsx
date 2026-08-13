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

// `runs_logged` is deliberately NOT part of this check: it has a DEFAULT 0 in
// the schema, so every inserted row (both logSkiDay() and the Strava import)
// has a non-null value for it and this predicate would be true for every
// session that exists — making the first-time-entry branch below dead code.
// vertical_feet / miles_skied / top_speed_mph are genuinely nullable with no
// default, so they're the honest signal for "stats have been set".
function hasStats(session) {
  return session.vertical_feet != null || session.miles_skied != null || session.top_speed_mph != null
}

export default function SessionEditForm({ session, onSave, saving, error, onError }) {
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
    // ResortPicker only reports a name to its parent once a suggestion is
    // actually clicked — typing clears `value` back to "". So an empty
    // `resort` here means the field was typed into and never confirmed, and
    // silently falling back to session.resort_name would throw away what looks
    // to the user like a finished edit.
    if (!resort) {
      onError?.("Pick a mountain from the list to save your change.")
      return
    }

    onError?.("")

    const fields = {
      notes: notes.trim() || null,
      resort_name: resort,
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

      {/* Deliberately NOT wrapped in a <label> (unlike the fields around it,
          and matching LogDayModal/StravaSyncReview): a click on a suggestion
          would bubble to the enclosing label, which re-forwards activation to
          the picker's input and reopens the dropdown the user just closed. */}
      <div>
        <div style={labelStyle}>Mountain</div>
        <ResortPicker value={resort} onChange={setResort} />
      </div>

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

      {error && <div style={{ fontSize: 13, color: "var(--color-danger)" }}>{error}</div>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        style={{
          background: "var(--gradient-cta)", color: "white", border: "none",
          borderRadius: 12, padding: "12px 20px", fontSize: 14, fontWeight: 900,
          cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  )
}
