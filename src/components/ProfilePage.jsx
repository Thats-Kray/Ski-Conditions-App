import { useState, useEffect, useCallback } from "react"
import {
  getCurrentUser,
  getMyProfile,
  getAcceptedFriends,
  getAllVisibleTrips,
} from "../lib/socialApi"
import ProfileSetup from "./ProfileSetup"

const SKILL_OPTIONS = [
  { key: "green",        label: "Green",       color: "#22c55e" },
  { key: "blue",         label: "Blue",        color: "#60a5fa" },
  { key: "black",        label: "Black",       color: "rgba(255,255,255,0.9)" },
  { key: "double_black", label: "Double Black",color: "#f43f5e" },
  { key: "experts_only", label: "Experts Only",color: "#c084fc" },
]

const SPORT_EMOJI = { ski: "⛷️", snowboard: "🏂", both: "🤙" }

function initials(name) {
  return (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

function Avatar({ url, name, size = 44 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg,rgba(37,99,235,0.6),rgba(8,145,178,0.6))",
      border: "1.5px solid rgba(96,165,250,0.3)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 900, fontSize: size * 0.36, color: "white", overflow: "hidden",
    }}>
      {url
        ? <img src={url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : initials(name)}
    </div>
  )
}

export default function ProfilePage({ onLogOut, onTabChange }) {
  const [profile, setProfile]   = useState(null)
  const [friends, setFriends]   = useState([])
  const [tripCount, setTripCount] = useState(0)
  const [userId, setUserId]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [isEditing, setIsEditing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [user, prof, friendData, tripData] = await Promise.all([
        getCurrentUser(),
        getMyProfile(),
        getAcceptedFriends().catch(() => []),
        getAllVisibleTrips().catch(() => []),
      ])
      setUserId(user?.id)
      setProfile(prof)
      setFriends(Array.isArray(friendData) ? friendData : [])
      setTripCount(Array.isArray(tripData) ? tripData.length : 0)
    } catch {
      // not logged in — parent already handles
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 14 }}>
        Loading profile…
      </div>
    )
  }

  if (isEditing) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <button
          onClick={() => setIsEditing(false)}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", textAlign: "left", fontSize: 13, display: "flex", alignItems: "center", gap: 6, padding: 0, width: "fit-content" }}
        >
          ← Back to Profile
        </button>
        <ProfileSetup
          onSaved={() => { setIsEditing(false); load() }}
        />
      </div>
    )
  }

  const fullName  = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Unnamed Skier"
  const skillObj  = SKILL_OPTIONS.find((s) => s.key === profile?.skill_level)
  const sportEmoji = SPORT_EMOJI[profile?.sport_type] || "⛷️"

  return (
    <div style={{ display: "grid", gap: 14 }}>

      {/* ── Hero ── */}
      <div style={{
        background: "linear-gradient(135deg,rgba(30,58,95,0.75),rgba(8,17,30,0.95))",
        border: "1px solid rgba(96,165,250,0.18)",
        borderRadius: 22,
        padding: "22px 20px 18px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* subtle background glow */}
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(37,99,235,0.12)", pointerEvents: "none" }} />

        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, position: "relative" }}>
          <Avatar url={profile?.avatar_url} name={fullName} size={78} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "white", lineHeight: 1.1 }}>{fullName}</div>
              <span style={{ fontSize: 20 }}>{sportEmoji}</span>
            </div>

            {profile?.username && (
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 3 }}>
                @{profile.username}
              </div>
            )}

            {profile?.favorite_mountain && (
              <div style={{ color: "#60a5fa", fontSize: 12, fontWeight: 700, marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                📍 {profile.favorite_mountain}
              </div>
            )}

            {skillObj && (
              <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, background: `${skillObj.color}18`, border: `1px solid ${skillObj.color}44`, borderRadius: 999, padding: "3px 10px" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: skillObj.color }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: skillObj.color }}>{skillObj.label}</span>
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <button
            onClick={() => onTabChange?.("plans")}
            style={{ flex: 1, minWidth: 80, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 12px", cursor: "pointer", textAlign: "center" }}
          >
            <div style={{ fontSize: 20, fontWeight: 900, color: "white", lineHeight: 1 }}>{tripCount}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.7, marginTop: 3 }}>Trips</div>
          </button>

          <button
            onClick={() => onTabChange?.("friends")}
            style={{ flex: 1, minWidth: 80, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 12px", cursor: "pointer", textAlign: "center" }}
          >
            <div style={{ fontSize: 20, fontWeight: 900, color: "white", lineHeight: 1 }}>{friends.length}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.7, marginTop: 3 }}>Friends</div>
          </button>

          <div style={{ flex: 1, minWidth: 80, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "white", lineHeight: 1 }}>
              {new Date().getFullYear()}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.7, marginTop: 3 }}>Season</div>
          </div>
        </div>
      </div>

      {/* ── Season Passes ── */}
      {profile?.ski_passes?.length > 0 && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Season Passes</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {profile.ski_passes.map((p) => (
              <div key={p} style={{ background: "linear-gradient(135deg,#22c55e,#14b8a6)", color: "#052e2b", borderRadius: 999, padding: "7px 14px", fontWeight: 800, fontSize: 13 }}>
                {p}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Vehicle ── */}
      {profile?.vehicle_label && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 24 }}>🚗</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8 }}>My Vehicle</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "white", marginTop: 2 }}>{profile.vehicle_label}</div>
            {profile.vehicle_seats > 0 && (
              <div style={{ fontSize: 12, color: "#60a5fa", marginTop: 2, fontWeight: 700 }}>
                {profile.vehicle_seats} open seat{profile.vehicle_seats !== 1 ? "s" : ""} for passengers
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Friends strip ── */}
      {friends.length > 0 && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8 }}>Your Crew</div>
            <button
              onClick={() => onTabChange?.("friends")}
              style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}
            >
              See All →
            </button>
          </div>
          <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
            {friends.slice(0, 12).map((f) => {
              const name = f.full_name || f.username || "?"
              return (
                <div key={f.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <Avatar url={f.avatar_url} name={name} size={46} />
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 600, maxWidth: 52, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {name.split(" ")[0]}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Account actions ── */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 16px", display: "grid", gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>Account</div>

        <button
          onClick={() => setIsEditing(true)}
          style={{ width: "100%", background: "linear-gradient(135deg,#2563eb,#0891b2)", color: "white", border: "none", borderRadius: 12, padding: "12px 16px", fontWeight: 800, fontSize: 14, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 4px 18px rgba(37,99,235,0.3)" }}
        >
          <span style={{ fontSize: 18 }}>✏️</span> Edit Profile
        </button>

        <button
          onClick={onLogOut}
          style={{ width: "100%", background: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: "12px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}
        >
          <span style={{ fontSize: 18 }}>🚪</span> Sign Out
        </button>
      </div>

    </div>
  )
}
