import { useState } from "react"
import { createTrip, addCarpool } from "../lib/socialApi"

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

const THEMES = [
  { key: "default",  label: "Mountain Blue",  emoji: "🏔️", bg: "linear-gradient(135deg,#1e3a5f,#0b1424)",  accent: "#60a5fa" },
  { key: "blizzard", label: "Blizzard",        emoji: "❄️", bg: "linear-gradient(135deg,#dbeafe,#93c5fd)",  accent: "#bfdbfe" },
  { key: "powder",   label: "Deep Powder",     emoji: "🌨️", bg: "linear-gradient(135deg,#1d4ed8,#1e3a5f)",  accent: "#3b82f6" },
  { key: "aurora",   label: "Aurora",          emoji: "🌌", bg: "linear-gradient(135deg,#4c1d95,#065f46)",  accent: "#8b5cf6" },
  { key: "sunset",   label: "Alpine Sunset",   emoji: "🌅", bg: "linear-gradient(135deg,#92400e,#7f1d1d)",  accent: "#fb923c" },
  { key: "sunny",    label: "Bluebird Day",    emoji: "☀️", bg: "linear-gradient(135deg,#92400e,#0369a1)",  accent: "#fbbf24" },
  { key: "windy",    label: "Storm Warning",   emoji: "💨", bg: "linear-gradient(135deg,#334155,#1e293b)",  accent: "#94a3b8" },
]

const inputStyle = {
  background: "rgba(255,255,255,0.07)",
  border: "1.5px solid rgba(255,255,255,0.11)",
  borderRadius: 14,
  padding: "12px 14px",
  color: "white",
  fontSize: 16,
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
  const [spotifyUrl, setSpotifyUrl] = useState("")
  const [theme, setTheme] = useState("default")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Step 3 — rides
  const [createdTrip, setCreatedTrip] = useState(null)
  const [cars, setCars] = useState([])           // [{ label, seats }]
  const [carLabel, setCarLabel] = useState("")
  const [carSeats, setCarSeats] = useState(3)
  const [carSaving, setCarSaving] = useState(false)

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
        spotify_playlist_url: spotifyUrl.trim() || null,
        theme,
      })
      setCreatedTrip(trip)
      setStep(3)
    } catch (err) {
      setError(err.message || "Failed to create trip.")
    } finally {
      setLoading(false)
    }
  }

  async function handleAddCar() {
    if (!createdTrip || carSeats < 1) return
    setCarSaving(true)
    try {
      await addCarpool(createdTrip.id, { driverName: "Me", seatsTotal: carSeats, carLabel: carLabel.trim() || null })
      setCars((prev) => [...prev, { label: carLabel.trim() || null, seats: carSeats }])
      setCarLabel("")
      setCarSeats(3)
    } catch (e) { console.warn(e) }
    finally { setCarSaving(false) }
  }

  function handleFinish() {
    onCreated?.(createdTrip)
    onClose()
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
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "20px 16px max(20px, env(safe-area-inset-bottom)) 16px",
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
              {step === 1 ? "Pick a mountain" : step === 2 ? "Trip details" : "Rides 🚗"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
              {step === 1
                ? "Where are you skiing?"
                : step === 2
                ? selectedResort ? `📍 ${selectedResort.name} · ${selectedResort.pass} Pass` : ""
                : "Add cars & open seats for your crew"}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Step dots */}
            <div style={{ display: "flex", gap: 6 }}>
              {[1, 2, 3].map((s) => (
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

            {/* Spotify Playlist */}
            <div>
              <label style={labelStyle}>
                Spotify Playlist{" "}
                <span style={{ color: "rgba(255,255,255,0.28)", fontWeight: 600 }}>optional</span>
              </label>
              <input
                type="url"
                value={spotifyUrl}
                onChange={(e) => setSpotifyUrl(e.target.value)}
                placeholder="https://open.spotify.com/playlist/..."
                style={inputStyle}
              />
            </div>

            {/* Theme picker */}
            <div>
              <label style={labelStyle}>
                Invite Theme{" "}
                <span style={{ color: "rgba(255,255,255,0.28)", fontWeight: 600 }}>optional</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
                {THEMES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTheme(t.key)}
                    style={{
                      background: t.bg,
                      border: `2px solid ${theme === t.key ? t.accent : "rgba(255,255,255,0.1)"}`,
                      borderRadius: 14,
                      padding: "12px 6px 10px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      transition: "border-color 0.15s ease, transform 0.12s ease",
                      boxShadow: theme === t.key ? `0 0 14px ${t.accent}66` : "none",
                      transform: theme === t.key ? "scale(1.06)" : "scale(1)",
                    }}
                  >
                    <span style={{ fontSize: 20, lineHeight: 1 }}>{t.emoji}</span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        color: theme === t.key ? t.accent : "rgba(255,255,255,0.55)",
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                        lineHeight: 1.2,
                        textAlign: "center",
                      }}
                    >
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>
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

        {/* ── Step 3: Rides ── */}
        {step === 3 && (
          <div style={{ padding: "22px 26px 28px", display: "grid", gap: 18 }}>

            {/* Trip created confirmation */}
            <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>✅</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#22c55e" }}>Trip created!</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Now set up your ride situation (optional)</div>
              </div>
            </div>

            {/* Cars added so far */}
            {cars.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                {cars.map((car, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18 }}>🚗</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{car.label || "My Car"}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{car.seats} open seat{car.seats !== 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: accent, background: `${accent}18`, borderRadius: 999, padding: "3px 10px" }}>Added</div>
                  </div>
                ))}
              </div>
            )}

            {/* Add a car form */}
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: "16px" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
                {cars.length === 0 ? "Are you driving? Add your car:" : "Add another car:"}
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <input
                  type="text"
                  value={carLabel}
                  onChange={(e) => setCarLabel(e.target.value)}
                  placeholder="Car nickname (e.g. Blue Subaru)"
                  maxLength={60}
                  style={inputStyle}
                />
                <div>
                  <label style={{ ...labelStyle, marginBottom: 10 }}>Open seats in your car</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <button type="button" onClick={() => setCarSeats((s) => Math.max(1, s - 1))} style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "white", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                    <span style={{ fontSize: 22, fontWeight: 900, color: "white", minWidth: 30, textAlign: "center" }}>{carSeats}</span>
                    <button type="button" onClick={() => setCarSeats((s) => Math.min(8, s + 1))} style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "white", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>seats available</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddCar}
                  disabled={carSaving}
                  style={{ background: carSaving ? "rgba(255,255,255,0.07)" : `linear-gradient(135deg,${accent}ee,${accent}99)`, border: "none", borderRadius: 12, padding: "11px", color: carSaving ? "rgba(255,255,255,0.35)" : "#020617", fontWeight: 900, cursor: carSaving ? "wait" : "pointer", fontSize: 13, boxShadow: carSaving ? "none" : `0 6px 20px ${accent}44` }}
                >
                  {carSaving ? "Adding…" : "Add Car 🚗"}
                </button>
              </div>
            </div>

            {/* Done */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={handleFinish}
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "12px 20px", color: "rgba(255,255,255,0.65)", fontWeight: 800, cursor: "pointer", fontSize: 14 }}
              >
                {cars.length === 0 ? "Skip Rides" : "Done"}
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
