import { useEffect, useState } from "react"
import {
  getCurrentUser,
  getMyProfile,
  upsertMyProfile,
  uploadProfilePhoto,
} from "../lib/socialApi"

const PASS_OPTIONS = ["Epic", "Ikon", "Mountain Collective", "Indy", "Loveland", "A-Basin"]

const SPORT_OPTIONS = [
  { key: "ski",       label: "Skier",        emoji: "⛷️" },
  { key: "snowboard", label: "Snowboarder",   emoji: "🏂" },
  { key: "both",      label: "Both",          emoji: "🤙" },
]

const SKILL_OPTIONS = [
  { key: "green",        label: "Green",         color: "#22c55e", desc: "Cruiser" },
  { key: "blue",         label: "Blue",           color: "#60a5fa", desc: "Solid intermediate" },
  { key: "black",        label: "Black",          color: "rgba(255,255,255,0.85)", desc: "Advanced" },
  { key: "double_black", label: "Double Black",   color: "#f43f5e", desc: "Expert" },
  { key: "experts_only", label: "Experts Only",   color: "#c084fc", desc: "No boundaries" },
]

const MOUNTAIN_OPTIONS = [
  "Vail", "Beaver Creek", "Breckenridge", "Keystone", "Crested Butte",
  "Telluride", "Winter Park", "Copper Mountain", "Arapahoe Basin",
  "Steamboat", "Eldora", "Aspen Snowmass",
]

function initialsFromName(name) {
  return (name || "S").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

const inputStyle = {
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "white",
  padding: "11px 14px",
  borderRadius: 12,
  outline: "none",
  fontSize: 16,
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
}

const labelStyle = {
  fontSize: 11,
  fontWeight: 800,
  color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase",
  letterSpacing: 0.8,
  marginBottom: 8,
  display: "block",
}

const sectionStyle = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 16,
  padding: "16px",
  display: "grid",
  gap: 12,
}

// ── Read-only stat chip ──────────────────────────────────────────────────────
function StatChip({ emoji, label, value, color }) {
  if (!value) return null
  return (
    <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.38)", textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: color || "white", marginTop: 2 }}>{value}</div>
      </div>
    </div>
  )
}

export default function ProfileSetup({ onSaved }) {
  const [user, setUser]                       = useState(null)
  const [firstName, setFirstName]             = useState("")
  const [lastName, setLastName]               = useState("")
  const [username, setUsername]               = useState("")
  const [avatarUrl, setAvatarUrl]             = useState("")
  const [favoriteMountain, setFavoriteMountain] = useState("")
  const [skiPasses, setSkiPasses]             = useState([])
  const [sportType, setSportType]             = useState("")
  const [skillLevel, setSkillLevel]           = useState("")
  const [vehicleLabel, setVehicleLabel]       = useState("")
  const [vehicleSeats, setVehicleSeats]       = useState(0)
  const [loading, setLoading]                 = useState(false)
  const [uploading, setUploading]             = useState(false)
  const [initialLoading, setInitialLoading]   = useState(true)
  const [message, setMessage]                 = useState("")
  const [hasProfile, setHasProfile]           = useState(false)
  const [isEditing, setIsEditing]             = useState(false)

  async function loadProfile() {
    setInitialLoading(true)
    setMessage("")
    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
      if (!currentUser) { setHasProfile(false); setIsEditing(false); return }

      const profile = await getMyProfile()
      if (profile) {
        setFirstName(profile.first_name || "")
        setLastName(profile.last_name || "")
        setUsername(profile.username || "")
        setAvatarUrl(profile.avatar_url || "")
        setFavoriteMountain(profile.favorite_mountain || "")
        setSkiPasses(profile.ski_passes || [])
        setSportType(profile.sport_type || "")
        setSkillLevel(profile.skill_level || "")
        setVehicleLabel(profile.vehicle_label || "")
        setVehicleSeats(profile.vehicle_seats || 0)
        setHasProfile(true)
        setIsEditing(false)
      } else {
        setHasProfile(false)
        setIsEditing(true)
      }
    } catch (err) {
      setMessage(err.message || "Could not load profile.")
    } finally {
      setInitialLoading(false)
    }
  }

  useEffect(() => { loadProfile() }, [])

  function togglePass(passName) {
    setSkiPasses((prev) => prev.includes(passName) ? prev.filter((p) => p !== passName) : [...prev, passName])
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setMessage("")
    try {
      const publicUrl = await uploadProfilePhoto(file)
      setAvatarUrl(publicUrl)
      setMessage("Photo uploaded.")
    } catch (err) {
      setMessage(err.message || "Could not upload photo.")
    } finally {
      setUploading(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setLoading(true)
    setMessage("")
    try {
      await upsertMyProfile({
        first_name: firstName,
        last_name: lastName,
        username,
        avatar_url: avatarUrl,
        ski_passes: skiPasses,
        favorite_mountain: favoriteMountain,
        sport_type: sportType || null,
        skill_level: skillLevel || null,
        vehicle_label: vehicleLabel.trim() || null,
        vehicle_seats: vehicleSeats > 0 ? vehicleSeats : null,
      })
      setHasProfile(true)
      setIsEditing(false)
      setMessage("Profile saved.")
      if (onSaved) onSaved()
    } catch (err) {
      setMessage(err.message || "Could not save profile.")
    } finally {
      setLoading(false)
    }
  }

  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || "Unnamed Skier"
  const skillObj = SKILL_OPTIONS.find((s) => s.key === skillLevel)
  const sportObj = SPORT_OPTIONS.find((s) => s.key === sportType)

  if (!user && !initialLoading) {
    return (
      <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 20, color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
        Sign in to create your profile.
      </div>
    )
  }

  if (initialLoading) {
    return (
      <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 20, color: "rgba(255,255,255,0.45)", fontSize: 14 }}>
        Loading profile…
      </div>
    )
  }

  // ── Read-only view ──────────────────────────────────────────────────────────
  if (hasProfile && !isEditing) {
    return (
      <div style={{ display: "grid", gap: 14 }}>

        {/* Header card */}
        <div style={{ background: "linear-gradient(135deg,rgba(30,58,95,0.7),rgba(11,20,36,0.9))", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 20, padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 80, height: 80, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.08)", border: "2px solid rgba(96,165,250,0.35)", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 26, color: "white", flexShrink: 0 }}>
              {avatarUrl ? <img src={avatarUrl} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initialsFromName(fullName)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: "white" }}>{fullName}</div>
                {sportObj && <span style={{ fontSize: 18 }}>{sportObj.emoji}</span>}
              </div>
              {username && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 2 }}>@{username}</div>}
              {favoriteMountain && <div style={{ color: "#60a5fa", fontSize: 12, fontWeight: 700, marginTop: 4 }}>📍 {favoriteMountain}</div>}
            </div>
          </div>
        </div>

        {/* Ski identity stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <StatChip emoji={sportObj?.emoji || "⛷️"} label="Sport" value={sportObj?.label} />
          <StatChip emoji="🎯" label="Skill Level" value={skillObj ? `${skillObj.label} · ${skillObj.desc}` : null} color={skillObj?.color} />
          {vehicleLabel && <StatChip emoji="🚗" label="Vehicle" value={`${vehicleLabel}${vehicleSeats > 0 ? ` · ${vehicleSeats} seats` : ""}`} />}
          {favoriteMountain && <StatChip emoji="🏔️" label="Home Mountain" value={favoriteMountain} color="#60a5fa" />}
        </div>

        {/* Passes */}
        {skiPasses.length > 0 && (
          <div style={{ ...sectionStyle }}>
            <div style={{ ...labelStyle, marginBottom: 4 }}>Season Passes</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {skiPasses.map((p) => (
                <div key={p} style={{ background: "linear-gradient(135deg,#22c55e,#14b8a6)", color: "#052e2b", borderRadius: 999, padding: "7px 14px", fontWeight: 800, fontSize: 13 }}>{p}</div>
              ))}
            </div>
          </div>
        )}

        {message && <div style={{ fontSize: 13, color: "#22c55e" }}>{message}</div>}

        <button
          onClick={() => { setIsEditing(true); setMessage("") }}
          style={{ background: "linear-gradient(135deg,#2563eb,#0891b2)", color: "white", border: "none", padding: "12px", borderRadius: 14, cursor: "pointer", fontWeight: 800, fontSize: 14, boxShadow: "0 6px 24px rgba(37,99,235,0.35)" }}
        >
          Edit Profile
        </button>
      </div>
    )
  }

  // ── Edit form ───────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSave} style={{ display: "grid", gap: 16 }}>

      {/* Avatar */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ position: "relative" }}>
          <div style={{ width: 88, height: 88, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.08)", border: "2px solid rgba(255,255,255,0.15)", display: "grid", placeItems: "center", fontWeight: 900, fontSize: 28, color: "white" }}>
            {avatarUrl ? <img src={avatarUrl} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initialsFromName(fullName)}
          </div>
          <label style={{ position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderRadius: 999, background: "#2563eb", border: "2px solid #0b1424", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14 }}>
            📷
            <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />
          </label>
        </div>
      </div>
      {uploading && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", textAlign: "center" }}>Uploading…</div>}

      {/* Name + username */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Identity</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          <input type="text" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} required />
          <input type="text" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} required />
        </div>
        <input type="text" placeholder="Username (e.g. kraypowder)" value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} required />
      </div>

      {/* Sport type */}
      <div style={sectionStyle}>
        <div style={labelStyle}>I ride on…</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {SPORT_OPTIONS.map(({ key, label, emoji }) => {
            const active = sportType === key
            return (
              <button key={key} type="button" onClick={() => setSportType(active ? "" : key)}
                style={{ padding: "14px 8px", borderRadius: 14, border: active ? "1.5px solid #60a5fa" : "1.5px solid rgba(255,255,255,0.1)", background: active ? "rgba(96,165,250,0.14)" : "rgba(255,255,255,0.04)", color: active ? "#60a5fa" : "rgba(255,255,255,0.65)", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "grid", gap: 5, justifyItems: "center", transition: "all 0.15s" }}
              >
                <span style={{ fontSize: 24 }}>{emoji}</span>
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Skill level */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Skill level</div>
        <div style={{ display: "grid", gap: 7 }}>
          {SKILL_OPTIONS.map(({ key, label, color, desc }) => {
            const active = skillLevel === key
            return (
              <button key={key} type="button" onClick={() => setSkillLevel(active ? "" : key)}
                style={{ padding: "11px 14px", borderRadius: 12, border: active ? `1.5px solid ${color}55` : "1.5px solid rgba(255,255,255,0.08)", background: active ? `${color}18` : "rgba(255,255,255,0.03)", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "all 0.15s" }}
              >
                <div style={{ width: 14, height: 14, borderRadius: 4, background: color, boxShadow: active ? `0 0 10px ${color}88` : "none", flexShrink: 0 }} />
                <span style={{ fontWeight: 800, fontSize: 13, color: active ? color : "rgba(255,255,255,0.7)" }}>{label}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginLeft: "auto" }}>{desc}</span>
                {active && <span style={{ fontSize: 14, color }}>✓</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Season passes */}
      <div style={sectionStyle}>
        <div style={labelStyle}>Season Passes</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PASS_OPTIONS.map((passName) => {
            const active = skiPasses.includes(passName)
            return (
              <button key={passName} type="button" onClick={() => togglePass(passName)}
                style={{ background: active ? "linear-gradient(135deg,#22c55e,#14b8a6)" : "rgba(255,255,255,0.06)", color: active ? "#052e2b" : "rgba(255,255,255,0.75)", border: active ? "none" : "1px solid rgba(255,255,255,0.12)", padding: "8px 14px", borderRadius: 999, fontWeight: 800, fontSize: 13, cursor: "pointer", transition: "all 0.15s" }}
              >
                {passName}
              </button>
            )
          })}
        </div>
      </div>

      {/* Favorite mountain */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Home Mountain</label>
        <select value={favoriteMountain} onChange={(e) => setFavoriteMountain(e.target.value)}
          style={{ ...inputStyle, colorScheme: "dark" }}
        >
          <option value="">Select a mountain</option>
          {MOUNTAIN_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Vehicle */}
      <div style={sectionStyle}>
        <div style={labelStyle}>My Vehicle <span style={{ color: "rgba(255,255,255,0.28)", fontWeight: 600, textTransform: "none" }}>optional — helps with carpooling</span></div>
        <input
          type="text"
          placeholder="e.g. Blue Subaru Outback, White RAV4"
          value={vehicleLabel}
          onChange={(e) => setVehicleLabel(e.target.value)}
          maxLength={60}
          style={inputStyle}
        />
        <div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 10, fontWeight: 700 }}>Open seats available for passengers</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button type="button" onClick={() => setVehicleSeats((s) => Math.max(0, s - 1))}
              style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", color: "white", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
            <span style={{ fontSize: 20, fontWeight: 900, color: vehicleSeats === 0 ? "rgba(255,255,255,0.25)" : "white", minWidth: 28, textAlign: "center" }}>{vehicleSeats === 0 ? "—" : vehicleSeats}</span>
            <button type="button" onClick={() => setVehicleSeats((s) => Math.min(8, s + 1))}
              style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", color: "white", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{vehicleSeats > 0 ? "seats" : "not offering rides"}</span>
          </div>
          {vehicleSeats > 0 && (
            <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
              {Array.from({ length: vehicleSeats }).map((_, i) => (
                <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: "#60a5fa", boxShadow: "0 0 6px rgba(96,165,250,0.5)" }} />
              ))}
            </div>
          )}
        </div>
      </div>

      {message && (
        <div style={{ fontSize: 13, color: message.includes("saved") || message.includes("uploaded") ? "#22c55e" : "#f43f5e", padding: "10px 14px", background: message.includes("saved") || message.includes("uploaded") ? "rgba(34,197,94,0.08)" : "rgba(244,63,94,0.08)", borderRadius: 10 }}>
          {message}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="submit" disabled={loading}
          style={{ flex: 1, background: loading ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg,#2563eb,#0891b2)", color: "white", border: "none", padding: "13px", borderRadius: 14, cursor: loading ? "not-allowed" : "pointer", fontWeight: 900, fontSize: 14, boxShadow: loading ? "none" : "0 6px 24px rgba(37,99,235,0.35)" }}
        >
          {loading ? "Saving…" : hasProfile ? "Save Changes" : "Create Profile"}
        </button>
        {hasProfile && (
          <button type="button" onClick={() => { setIsEditing(false); setMessage("") }}
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.1)", padding: "13px 20px", borderRadius: 14, cursor: "pointer", fontWeight: 800 }}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
