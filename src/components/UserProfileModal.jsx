import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { getProfileById } from "../lib/socialApi"

const SKILL_OPTIONS = [
  { key: "green",        label: "Green",        color: "#22c55e" },
  { key: "blue",         label: "Blue",         color: "#60a5fa" },
  { key: "black",        label: "Black",        color: "rgba(255,255,255,0.9)" },
  { key: "double_black", label: "Double Black", color: "#f43f5e" },
  { key: "experts_only", label: "Experts Only", color: "#c084fc" },
]

const SPORT_EMOJI = { ski: "⛷️", snowboard: "🏂", both: "🤙" }

function initials(name) {
  return (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

export default function UserProfileModal({ userId, onClose }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return
    setProfile(null)
    setLoading(true)
    getProfileById(userId)
      .then(setProfile)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [userId])

  if (!userId) return null

  const fullName = profile?.full_name || "Skier"
  const skillObj = SKILL_OPTIONS.find((s) => s.key === profile?.skill_level)
  const sportEmoji = SPORT_EMOJI[profile?.sport_type] || "⛷️"

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        padding: "0",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520,
          background: "rgba(10,17,30,0.98)",
          border: "1px solid rgba(96,165,250,0.18)",
          borderRadius: "22px 22px 0 0",
          padding: "20px 20px calc(20px + env(safe-area-inset-bottom))",
          display: "grid", gap: 14,
          maxHeight: "85vh", overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Skier Profile
          </div>
          <button
            onClick={onClose}
            style={{ background: "rgba(255,255,255,0.07)", border: "none", color: "rgba(255,255,255,0.55)", fontSize: 18, cursor: "pointer", padding: "6px 10px", borderRadius: 10, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
            Loading…
          </div>
        ) : !profile ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
            Profile not found.
          </div>
        ) : (
          <>
            {/* Hero card */}
            <div style={{
              background: "linear-gradient(135deg,rgba(30,58,95,0.75),rgba(8,17,30,0.95))",
              border: "1px solid rgba(96,165,250,0.18)",
              borderRadius: 18, padding: "18px 16px",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: "rgba(37,99,235,0.1)", pointerEvents: "none" }} />

              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, position: "relative" }}>
                {/* Avatar */}
                <div style={{
                  width: 66, height: 66, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg,rgba(37,99,235,0.6),rgba(8,145,178,0.6))",
                  border: "1.5px solid rgba(96,165,250,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: 24, color: "white", overflow: "hidden",
                }}>
                  {profile.avatar_url
                    ? <img src={profile.avatar_url} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : initials(fullName)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "white", lineHeight: 1.1 }}>{fullName}</div>
                    <span style={{ fontSize: 18 }}>{sportEmoji}</span>
                  </div>

                  {profile.username && (
                    <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 3 }}>
                      @{profile.username}
                    </div>
                  )}

                  {profile.favorite_mountain && (
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
            </div>

            {/* Season passes */}
            {profile.ski_passes?.length > 0 && (
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                  Season Passes
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {profile.ski_passes.map((p) => (
                    <div key={p} style={{ background: "linear-gradient(135deg,#22c55e,#14b8a6)", color: "#052e2b", borderRadius: 999, padding: "6px 13px", fontWeight: 800, fontSize: 13 }}>
                      {p}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Vehicle */}
            {profile.vehicle_label && (
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 22 }}>🚗</div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8 }}>Vehicle</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "white", marginTop: 2 }}>{profile.vehicle_label}</div>
                  {profile.vehicle_seats > 0 && (
                    <div style={{ fontSize: 12, color: "#60a5fa", marginTop: 2, fontWeight: 700 }}>
                      {profile.vehicle_seats} open seat{profile.vehicle_seats !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
