import { useState } from "react"
import { createSkiBuddyPost } from "../lib/socialApi"
import { RIDING_STYLES, PASS_TYPES, CARPOOL_STATUSES } from "../lib/skiBuddyOptions"
import { RESORT_NAMES, RESORT_EMOJI } from "../lib/resorts"
import { localDateKey } from "../lib/calendarDates"

const fieldLabelStyle = {
  fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7,
}

const fieldStyle = {
  width: "100%", padding: "11px 13px", borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)",
  color: "white", fontSize: 15, outline: "none", boxSizing: "border-box", colorScheme: "dark",
}

function chipStyle(active) {
  return {
    padding: "7px 14px", borderRadius: 10, cursor: "pointer",
    border: `1.5px solid ${active ? "var(--color-accent)" : "rgba(255,255,255,0.1)"}`,
    background: active ? "rgba(56,189,248,0.2)" : "rgba(255,255,255,0.04)",
    color: active ? "var(--color-accent)" : "rgba(255,255,255,0.6)",
    fontWeight: active ? 800 : 500, fontSize: 12,
  }
}

export default function PostSkiBuddyForm({ onClose, onCreated }) {
  // Computed per render, not at module scope. This was a module-level const, which
  // froze it at first import — so the floor went stale for anyone who left the app
  // open across midnight, on top of the UTC rollover localDateKey() fixes.
  const todayISO = localDateKey()

  const [passType, setPassType] = useState("")
  const [resortKey, setResortKey] = useState("")
  const [skiDate, setSkiDate] = useState("")
  const [ridingStyle, setRidingStyle] = useState([])
  const [groupSizeWanted, setGroupSizeWanted] = useState("")
  const [carpoolStatus, setCarpoolStatus] = useState("none")
  const [carpoolSeats, setCarpoolSeats] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  function toggleStyle(key) {
    setRidingStyle((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!passType || !resortKey || !skiDate || ridingStyle.length === 0) {
      setError("Pass type, resort, date, and at least one riding style are required.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const newPost = await createSkiBuddyPost({
        passType, resortKey, skiDate, ridingStyle,
        groupSizeWanted: groupSizeWanted ? parseInt(groupSizeWanted, 10) : null,
        carpoolStatus,
        carpoolSeats: carpoolStatus === "offering" && carpoolSeats ? parseInt(carpoolSeats, 10) : null,
        description: description.trim() || null,
      })
      onCreated?.(newPost)
    } catch (err) {
      if (err?.message?.includes("NOT_VERIFIED")) {
        setError("You need to verify your account before posting.")
      } else if (err?.message?.includes("SKI_DATE_IN_PAST")) {
        setError("Pick a date that hasn't passed yet.")
      } else {
        setError("Couldn't create your post. Try again in a bit.")
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div onClick={busy ? undefined : onClose} style={{
      position: "fixed", inset: 0, zIndex: 600, background: "rgba(4,8,15,0.85)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 16px", overflowY: "auto",
    }}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto",
          background: "var(--color-bg-deep)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 24, boxShadow: "0 40px 120px rgba(0,0,0,0.85)", padding: 22, display: "grid", gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>Post a Ski Buddy Listing</div>
          <button type="button" onClick={busy ? undefined : onClose} disabled={busy} style={{
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "50%",
            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontSize: 18, cursor: busy ? "default" : "pointer", flexShrink: 0,
          }}>×</button>
        </div>

        {error && (
          <div style={{ fontSize: 13, color: "var(--color-danger)", background: "var(--color-danger-bg)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 12, padding: "10px 13px" }}>
            {error}
          </div>
        )}

        <div>
          <div style={fieldLabelStyle}>Pass Type</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PASS_TYPES.map((p) => (
              <button key={p.key} type="button" onClick={() => setPassType(p.key)} style={chipStyle(passType === p.key)}>{p.label}</button>
            ))}
          </div>
        </div>

        <div>
          <div style={fieldLabelStyle}>Resort</div>
          <select value={resortKey} onChange={(e) => setResortKey(e.target.value)} style={fieldStyle}>
            <option value="">Select a resort…</option>
            {Object.keys(RESORT_NAMES).map((key) => (
              <option key={key} value={key}>{RESORT_EMOJI[key]} {RESORT_NAMES[key]}</option>
            ))}
          </select>
        </div>

        <div>
          <div style={fieldLabelStyle}>Date</div>
          <input type="date" min={todayISO} value={skiDate} onChange={(e) => setSkiDate(e.target.value)} style={fieldStyle} />
        </div>

        <div>
          <div style={fieldLabelStyle}>Riding Style (pick at least one)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {RIDING_STYLES.map((s) => (
              <button key={s.key} type="button" onClick={() => toggleStyle(s.key)} style={chipStyle(ridingStyle.includes(s.key))}>
                {s.emoji} {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={fieldLabelStyle}>Group Size Wanted (optional)</div>
          <input type="number" min="1" max="20" value={groupSizeWanted} onChange={(e) => setGroupSizeWanted(e.target.value)} placeholder="e.g. 3" style={fieldStyle} />
        </div>

        <div>
          <div style={fieldLabelStyle}>Carpool</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CARPOOL_STATUSES.map((c) => (
              <button key={c.key} type="button" onClick={() => setCarpoolStatus(c.key)} style={chipStyle(carpoolStatus === c.key)}>{c.label}</button>
            ))}
          </div>
        </div>

        {carpoolStatus === "offering" && (
          <div>
            <div style={fieldLabelStyle}>Seats Available</div>
            <input type="number" min="1" max="8" value={carpoolSeats} onChange={(e) => setCarpoolSeats(e.target.value)} style={fieldStyle} />
          </div>
        )}

        <div>
          <div style={fieldLabelStyle}>Description (optional)</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            placeholder="Anything else people should know?"
            rows={3}
            style={{ ...fieldStyle, resize: "none" }}
          />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right", marginTop: 4 }}>{description.length}/500</div>
        </div>

        <button type="submit" disabled={busy} style={{
          padding: "14px", borderRadius: 14, border: "none",
          background: busy ? "rgba(255,255,255,0.1)" : "var(--gradient-cta)", color: "white",
          fontWeight: 900, fontSize: 15, cursor: busy ? "default" : "pointer",
        }}>
          {busy ? "Posting…" : "Post Listing"}
        </button>
      </form>
    </div>
  )
}
