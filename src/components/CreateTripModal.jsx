import { useState } from "react"
import { createTrip } from "../lib/socialApi"

const RESORTS = [
  { key: "vail",          name: "Vail",           pass: "Epic", photo: "/resorts/vail.jpg",           accent: "#60a5fa" },
  { key: "beavercreek",   name: "Beaver Creek",   pass: "Epic", photo: "/resorts/beaver-creek.jpg",   accent: "#fbbf24" },
  { key: "breckenridge",  name: "Breckenridge",   pass: "Epic", photo: "/resorts/breckenridge.jpg",   accent: "#34d399" },
  { key: "keystone",      name: "Keystone",        pass: "Epic", photo: "/resorts/keystone.jpg",       accent: "#818cf8" },
  { key: "crestedbutte",  name: "Crested Butte",  pass: "Epic", photo: "/resorts/crested-butte.jpg",  accent: "#c084fc" },
  { key: "telluride",     name: "Telluride",       pass: "Epic", photo: "/resorts/telluride.jpg",      accent: "#fb7185" },
  { key: "winterpark",    name: "Winter Park",     pass: "Ikon", photo: "/resorts/winter-park.jpg",    accent: "#fb923c" },
  { key: "coppermountain",name: "Copper Mountain", pass: "Ikon", photo: "/resorts/copper-mountain.jpg",accent: "#f97316" },
  { key: "arapahoebasin", name: "Arapahoe Basin",  pass: "Ikon", photo: "/resorts/arapahoe-basin.jpg", accent: "#94a3b8" },
  { key: "steamboat",     name: "Steamboat",       pass: "Ikon", photo: "/resorts/steamboat.jpg",      accent: "#d97706" },
  { key: "eldora",        name: "Eldora",          pass: "Ikon", photo: "/resorts/eldora.jpg",         accent: "#2dd4bf" },
  { key: "aspensnowmass", name: "Aspen Snowmass",  pass: "Ikon", photo: "/resorts/aspen-snowmass.jpg", accent: "#e2e8f0" },
]

const inputStyle = {
  background: "rgba(255,255,255,0.07)",
  border: "1.5px solid rgba(255,255,255,0.11)",
  borderRadius: 14,
  padding: "12px 14px",
  color: "white",
  fontSize: 14,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
}

const labelStyle = {
  fontSize: 11,
  fontWeight: 800,
  color: "rgba(255,255,255,0.5)",
  textTransform: "uppercase",
  letterSpacing: 0.8,
  marginBottom: 7,
  display: "block",
}

export default function CreateTripModal({ onClose, onCreated }) {
  const [step, setStep] = useState(1)
  const [resortKey, setResortKey] = useState("")
  const [skiDate, setSkiDate] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [meetingSpot, setMeetingSpot] = useState("")
  const [departureTime, setDepartureTime] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const selectedResort = RESORTS.find((r) => r.key === resortKey)
  const accent = selectedResort?.accent || "#60a5fa"
  const minDate = new Date().toISOString().slice(0, 10)

  function selectResort(key) {
    setResortKey(key)
    setStep(2)
  }

  async function handleCreate() {
    if (!resortKey || !skiDate) {
      setError("Select a resort and pick a date.")
      return
    }
    setLoading(true)
    setError("")
    try {
      const trip = await createTrip({
        resort_key: resortKey,
        ski_date: skiDate,
        title: title.trim() || null,
        description: description.trim() || null,
        meeting_spot: meetingSpot.trim() || null,
        departure_time: departureTime.trim() || null,
      })
      onCreated?.(trip)
      onClose()
    } catch (err) {
      setError(err.message || "Failed to create trip.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,6,23,0.82)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        zIndex: 300,
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: step === 1 ? 700 : 560,
          background: "#0b1424",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 28,
          overflow: "hidden",
          boxShadow: "0 40px 100px rgba(0,0,0,0.75)",
          transition: "max-width 0.3s ease",
        }}
      >
        {/* Modal header */}
        <div
          style={{
            padding: "22px 26px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "white", letterSpacing: -0.3 }}>
              {step === 1 ? "Pick a mountain" : "Trip details"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
              {step === 1
                ? "Where are you skiing?"
                : selectedResort
                ? `📍 ${selectedResort.name} · ${selectedResort.pass} Pass`
                : ""}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Step dots */}
            <div style={{ display: "flex", gap: 6 }}>
              {[1, 2].map((s) => (
                <div
                  key={s}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: step >= s ? accent : "rgba(255,255,255,0.18)",
                    transition: "background 0.25s ease",
                    boxShadow: step === s ? `0 0 8px ${accent}99` : "none",
                  }}
                />
              ))}
            </div>

            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "50%",
                width: 34,
                height: 34,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.55)",
                cursor: "pointer",
                fontSize: 20,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* ── Step 1: Resort picker ── */}
        {step === 1 && (
          <div
            style={{
              padding: "18px 22px 24px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
              gap: 10,
              maxHeight: "66vh",
              overflowY: "auto",
            }}
          >
            {RESORTS.map((resort) => (
              <button
                key={resort.key}
                onClick={() => selectResort(resort.key)}
                style={{
                  position: "relative",
                  height: 106,
                  borderRadius: 18,
                  border: `2px solid ${resortKey === resort.key ? resort.accent : "rgba(255,255,255,0.08)"}`,
                  background: resort.photo
                    ? `linear-gradient(to bottom, rgba(2,6,23,0.25) 0%, rgba(2,6,23,0.84) 100%), url(${resort.photo}) center/cover`
                    : "rgba(255,255,255,0.05)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  justifyContent: "flex-end",
                  padding: "0 11px 11px",
                  transition: "border-color 0.15s ease, transform 0.12s ease",
                  overflow: "hidden",
                  textAlign: "left",
                }}
                className="resort-pick-btn"
              >
                <div style={{ fontSize: 13, fontWeight: 900, color: "white", lineHeight: 1.2 }}>
                  {resort.name}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: resort.accent,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    marginTop: 3,
                  }}
                >
                  {resort.pass}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Step 2: Details form ── */}
        {step === 2 && (
          <div style={{ padding: "22px 26px 28px", display: "grid", gap: 18 }}>

            {/* Selected resort banner */}
            {selectedResort && (
              <div
                style={{
                  height: 76,
                  borderRadius: 16,
                  background: selectedResort.photo
                    ? `linear-gradient(to right, rgba(2,6,23,0.72) 0%, rgba(2,6,23,0.35) 100%), url(${selectedResort.photo}) center/cover`
                    : "rgba(255,255,255,0.05)",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 18px",
                  gap: 12,
                  overflow: "hidden",
                }}
              >
                <span style={{ fontSize: 26 }}>🏔️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: 900, color: "white" }}>
                    {selectedResort.name}
                  </div>
                  <div
                    style={{ fontSize: 11, color: selectedResort.accent, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}
                  >
                    {selectedResort.pass} Pass
                  </div>
                </div>
                <button
                  onClick={() => setStep(1)}
                  style={{
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: 999,
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "white",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  Change
                </button>
              </div>
            )}

            {/* Ski date — required */}
            <div>
              <label style={labelStyle}>
                Ski Date <span style={{ color: "rgba(255,255,255,0.28)", fontWeight: 600 }}>required</span>
              </label>
              <input
                type="date"
                value={skiDate}
                min={minDate}
                onChange={(e) => setSkiDate(e.target.value)}
                style={{
                  ...inputStyle,
                  border: `1.5px solid ${skiDate ? accent + "88" : "rgba(255,255,255,0.11)"}`,
                  colorScheme: "dark",
                }}
              />
            </div>

            {/* Trip name */}
            <div>
              <label style={labelStyle}>
                Trip Name{" "}
                <span style={{ color: "rgba(255,255,255,0.28)", fontWeight: 600 }}>optional</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={selectedResort ? `${selectedResort.name} Powder Day` : "Name your trip"}
                maxLength={80}
                style={inputStyle}
              />
            </div>

            {/* Departure + Meet at (side by side) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Departure</label>
                <input
                  type="text"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  placeholder="7:00 AM"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Meet At</label>
                <input
                  type="text"
                  value={meetingSpot}
                  onChange={(e) => setMeetingSpot(e.target.value)}
                  placeholder="Base lodge"
                  maxLength={80}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={labelStyle}>
                Notes{" "}
                <span style={{ color: "rgba(255,255,255,0.28)", fontWeight: 600 }}>optional</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Fresh pow, no excuses. Last chair or riot. 🤙"
                maxLength={400}
                rows={3}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  lineHeight: 1.55,
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  background: "rgba(244,63,94,0.12)",
                  border: "1px solid rgba(244,63,94,0.28)",
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: "#fda4af",
                }}
              >
                {error}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 2 }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 14,
                  padding: "12px 20px",
                  color: "rgba(255,255,255,0.65)",
                  fontWeight: 800,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                ← Back
              </button>

              <button
                onClick={handleCreate}
                disabled={loading || !skiDate}
                style={{
                  background:
                    !loading && skiDate
                      ? `linear-gradient(135deg, ${accent}ee, ${accent}99)`
                      : "rgba(255,255,255,0.07)",
                  border: "none",
                  borderRadius: 14,
                  padding: "12px 28px",
                  color: !loading && skiDate ? "#020617" : "rgba(255,255,255,0.35)",
                  fontWeight: 900,
                  cursor: !loading && skiDate ? "pointer" : "default",
                  fontSize: 14,
                  transition: "all 0.2s ease",
                  boxShadow: !loading && skiDate ? `0 8px 24px ${accent}55` : "none",
                }}
              >
                {loading ? "Dropping the trip…" : "Drop the Trip 🎿"}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .resort-pick-btn:hover {
          transform: scale(1.03);
          border-color: rgba(255,255,255,0.25) !important;
        }
      `}</style>
    </div>
  )
}
