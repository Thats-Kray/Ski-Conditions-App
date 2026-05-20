import { useState, useEffect, useCallback } from "react"
import {
  getCurrentUser,
  getMyProfile,
  getAcceptedFriends,
  getAllVisibleTrips,
  upsertMyProfile,
} from "../lib/socialApi"
import { getMySessions, getCurrentSeason } from "../lib/leaderboardApi"
import ShareStatCard from "./ShareStatCard"
import { resortName, resortEmoji } from "../lib/resorts"
import { fmt } from "../lib/format"
import Avatar from "./ui/Avatar"

const SKILL_OPTIONS = [
  { key: "green",        label: "Green",        color: "#22c55e" },
  { key: "blue",         label: "Blue",         color: "#60a5fa" },
  { key: "black",        label: "Black",        color: "rgba(255,255,255,0.9)" },
  { key: "double_black", label: "Double Black", color: "#f43f5e" },
  { key: "experts_only", label: "Experts Only", color: "#c084fc" },
]

const PASS_OPTIONS = ["Epic", "Ikon", "Indy", "Mountain Collective", "None"]
const SPORT_EMOJI = { ski: "⛷️", snowboard: "🏂", both: "🤙" }

function initials(name) {
  return (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

function computeStats(sessions) {
  const days       = sessions.length
  const vertical   = sessions.reduce((s, r) => s + (r.vertical_feet  || 0), 0)
  const miles      = sessions.reduce((s, r) => s + (r.miles_skied    || 0), 0)
  const powderDays = sessions.filter(r => r.is_powder_day).length
  const resortSet  = new Set(sessions.map(r => r.resort_name).filter(Boolean))
  const resorts    = resortSet.size

  const counts = {}
  for (const s of sessions) {
    if (s.resort_name) counts[s.resort_name] = (counts[s.resort_name] || 0) + 1
  }
  const topResort = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null

  return { days, vertical, miles: parseFloat(miles.toFixed(1)), powderDays, resorts, topResort }
}

// ── Season Stats Card ─────────────────────────────────────────────────────────

function SeasonStatsCard({ stats, season }) {
  const statItems = [
    { label: "Days on Mountain", value: stats.days,                  emoji: "⛷️" },
    { label: "Vertical Feet",    value: fmt(stats.vertical) + " ft", emoji: "📏" },
    { label: "Resorts",          value: stats.resorts,               emoji: "🏔️" },
    { label: "Powder Days",      value: stats.powderDays,            emoji: "❄️" },
  ]

  return (
    <div style={{
      background: "linear-gradient(135deg,rgba(15,118,110,0.35),rgba(37,99,235,0.28))",
      border: "1px solid rgba(96,165,250,0.2)",
      borderRadius: 20,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "14px 18px 10px" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 0.9 }}>
          {season.label} Season
        </div>
      </div>

      {/* 2×2 stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, padding: "0 1px 1px" }}>
        {statItems.map(item => (
          <div key={item.label} style={{
            background: "rgba(4,8,20,0.45)",
            padding: "18px 18px 16px",
          }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: "white", lineHeight: 1, letterSpacing: -2 }}>
              {item.value}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", marginTop: 5, textTransform: "uppercase", letterSpacing: 0.6 }}>
              {item.emoji} {item.label}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom: top resort + miles */}
      {(stats.topResort || stats.miles > 0) && (
        <div style={{ display: "flex", gap: 8, padding: "12px 14px" }}>
          {stats.topResort && (
            <div style={{ flex: 1, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15 }}>🏆</span>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.5 }}>Top Resort</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "white", marginTop: 1 }}>{resortName(stats.topResort)}</div>
              </div>
            </div>
          )}
          {stats.miles > 0 && (
            <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15 }}>🛷</span>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.5 }}>Miles Skied</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "white", marginTop: 1 }}>{stats.miles} mi</div>
              </div>
            </div>
          )}
        </div>
      )}

      {stats.days === 0 && (
        <div style={{ textAlign: "center", padding: "20px", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
          No days logged yet — get out there! ⛷️
        </div>
      )}
    </div>
  )
}

// ── Recent Sessions Feed ──────────────────────────────────────────────────────

function RecentSessionsFeed({ sessions }) {
  if (!sessions.length) {
    return (
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "18px 16px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
        No sessions logged yet — check in from the Home tab
      </div>
    )
  }
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px 10px", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8 }}>
        Recent Sessions
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {sessions.slice(0, 5).map((s, i) => {
          const date = new Date(s.session_date + "T12:00:00")
          const dateLabel = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
          const emoji = resortEmoji(s.resort_key || s.resort_name)
          return (
            <div key={s.id || i} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "11px 16px",
              borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {resortName(s.resort_name || s.resort_key)}
                  {s.is_powder_day && <span style={{ marginLeft: 6, fontSize: 12 }}>❄️</span>}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{dateLabel}</div>
              </div>
              {s.vertical_feet > 0 && (
                <div style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", flexShrink: 0 }}>+{fmt(s.vertical_feet)} ft</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Edit Profile Modal ────────────────────────────────────────────────────────

function EditProfileModal({ profile, onSaved, onClose }) {
  const [displayName, setDisplayName]   = useState(profile?.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "")
  const [skillLevel, setSkillLevel]     = useState(profile?.skill_level || "")
  const [sportType, setSportType]       = useState(profile?.sport_type || "ski")
  const [skiPasses, setSkiPasses]       = useState(profile?.ski_passes || [])
  const [vehicleLabel, setVehicleLabel] = useState(profile?.vehicle_label || "")
  const [vehicleSeats, setVehicleSeats] = useState(profile?.vehicle_seats || "")
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState("")

  function togglePass(p) {
    setSkiPasses(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function handleSave() {
    setSaving(true); setError("")
    try {
      const nameParts = displayName.trim().split(" ")
      await upsertMyProfile({
        first_name: nameParts[0] || "",
        last_name: nameParts.slice(1).join(" ") || "",
        avatar_url: profile?.avatar_url || null,
        skill_level: skillLevel || null,
        sport_type: sportType || "ski",
        ski_passes: skiPasses,
        vehicle_label: vehicleLabel.trim() || null,
        vehicle_seats: vehicleSeats ? parseInt(vehicleSeats) : null,
      })
      onSaved()
    } catch (e) {
      setError(e.message || "Could not save profile.")
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle = {
    width: "100%", padding: "11px 13px", borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)",
    color: "white", fontSize: 15, outline: "none", boxSizing: "border-box",
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: "100%", maxWidth: 480,
        background: "linear-gradient(160deg,#0f172a,#0a0f1e)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "22px 22px 0 0",
        padding: "24px 20px max(32px, env(safe-area-inset-bottom))",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)", margin: "0 auto 22px" }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: "white" }}>Edit Profile</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* Display name */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>Display Name</div>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" style={fieldStyle} />
        </div>

        {/* Sport type */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>Sport</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[{ key: "ski", label: "⛷️ Ski" }, { key: "snowboard", label: "🏂 Snowboard" }, { key: "both", label: "🤙 Both" }].map(({ key, label }) => (
              <button key={key} onClick={() => setSportType(key)} style={{
                flex: 1, padding: "9px 8px", borderRadius: 10,
                border: `1.5px solid ${sportType === key ? "#3b82f6" : "rgba(255,255,255,0.12)"}`,
                background: sportType === key ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.05)",
                color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Skill level */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>Skill Level</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SKILL_OPTIONS.map(opt => (
              <button key={opt.key} onClick={() => setSkillLevel(opt.key)} style={{
                padding: "7px 14px", borderRadius: 10,
                border: `1.5px solid ${skillLevel === opt.key ? opt.color : "rgba(255,255,255,0.1)"}`,
                background: skillLevel === opt.key ? `${opt.color}18` : "rgba(255,255,255,0.04)",
                color: skillLevel === opt.key ? opt.color : "rgba(255,255,255,0.6)",
                fontWeight: skillLevel === opt.key ? 800 : 500, fontSize: 12, cursor: "pointer",
              }}>{opt.label}</button>
            ))}
          </div>
        </div>

        {/* Ski passes */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>Ski Passes</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PASS_OPTIONS.map(p => {
              const active = skiPasses.includes(p)
              return (
                <button key={p} onClick={() => togglePass(p)} style={{
                  padding: "7px 14px", borderRadius: 10,
                  border: `1.5px solid ${active ? "#22c55e" : "rgba(255,255,255,0.1)"}`,
                  background: active ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
                  color: active ? "#22c55e" : "rgba(255,255,255,0.6)",
                  fontWeight: active ? 800 : 500, fontSize: 12, cursor: "pointer",
                }}>{p}</button>
              )
            })}
          </div>
        </div>

        {/* Vehicle */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>Vehicle (optional)</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <input value={vehicleLabel} onChange={e => setVehicleLabel(e.target.value)} placeholder='e.g. "Blue Subaru"' style={fieldStyle} />
            <input value={vehicleSeats} onChange={e => setVehicleSeats(e.target.value)} placeholder="Seats" type="number" min="1" max="8" style={fieldStyle} />
          </div>
        </div>

        {error && <div style={{ fontSize: 13, color: "#f87171", marginBottom: 12 }}>{error}</div>}

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: "100%", padding: "14px", borderRadius: 14, border: "none",
            background: saving ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg,#2563eb,#0891b2)",
            color: "white", fontWeight: 900, fontSize: 15, cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ProfilePage({ onLogOut, onTabChange }) {
  const [profile, setProfile]         = useState(null)
  const [friends, setFriends]         = useState([])
  const [tripCount, setTripCount]     = useState(0)
  const [loading, setLoading]         = useState(true)
  const [showEdit, setShowEdit]       = useState(false)
  const [seasonStats, setSeasonStats] = useState(null)
  const [recentSessions, setRecentSessions] = useState([])
  const [showShare, setShowShare]     = useState(false)

  const season = getCurrentSeason()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [user, prof, friendData, tripData, sessions] = await Promise.all([
        getCurrentUser(),
        getMyProfile(),
        getAcceptedFriends().catch(() => []),
        getAllVisibleTrips().catch(() => []),
        getMySessions(getCurrentSeason().startYear).catch(() => []),
      ])
      setProfile(prof)
      setFriends(Array.isArray(friendData) ? friendData : [])
      // getAllVisibleTrips returns { mine, rsvpd, friends, invited } — count unique trips user attends
      const { mine = [], rsvpd = [] } = tripData || {}
      const seen = new Set()
      let count = 0
      for (const t of [...mine, ...rsvpd]) {
        if (!seen.has(t.id)) { seen.add(t.id); count++ }
      }
      setTripCount(count)
      if (Array.isArray(sessions)) {
        setSeasonStats(computeStats(sessions))
        setRecentSessions(sessions)
      }
    } catch {
      // parent handles auth
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

  const fullName   = profile?.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Unnamed Skier"
  const skillObj   = SKILL_OPTIONS.find((s) => s.key === profile?.skill_level)
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
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(37,99,235,0.12)", pointerEvents: "none" }} />

        <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 8, zIndex: 1 }}>
          <button
            onClick={() => setShowEdit(true)}
            title="Edit Profile"
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15, backdropFilter: "blur(6px)" }}
          >
            ✏️
          </button>
          <button
            onClick={onLogOut}
            title="Sign Out"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.22)", borderRadius: 10, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15, backdropFilter: "blur(6px)" }}
          >
            🚪
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, position: "relative" }}>
          <Avatar profile={{ avatar_url: profile?.avatar_url, full_name: fullName }} size={78} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "white", lineHeight: 1.1 }}>{fullName}</div>
              <span style={{ fontSize: 20 }}>{sportEmoji}</span>
            </div>
            {profile?.username && (
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 3 }}>@{profile.username}</div>
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
            <div style={{ fontSize: 20, fontWeight: 900, color: seasonStats?.days > 0 ? "#60a5fa" : "white", lineHeight: 1 }}>{seasonStats?.days ?? "—"}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.7, marginTop: 3 }}>Days</div>
          </div>
        </div>
      </div>

      {/* ── Season Stats ── */}
      {seasonStats && (
        <SeasonStatsCard stats={seasonStats} season={season} />
      )}

      {/* ── Share Your Season CTA ── */}
      {seasonStats && seasonStats.days > 0 && (
        <button
          onClick={() => setShowShare(true)}
          style={{
            width: "100%", padding: "15px 20px", borderRadius: 16, border: "none",
            background: "linear-gradient(135deg,rgba(37,99,235,0.85),rgba(8,145,178,0.8))",
            color: "white", fontWeight: 900, fontSize: 15, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            boxShadow: "0 6px 24px rgba(37,99,235,0.3)",
          }}
        >
          📤 Share Your Season →
        </button>
      )}

      {/* ── Recent Sessions feed ── */}
      <RecentSessionsFeed sessions={recentSessions} />

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
                  <Avatar profile={f} size={46} />
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 600, maxWidth: 52, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {name.split(" ")[0]}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showEdit && (
        <EditProfileModal
          profile={profile}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); load() }}
        />
      )}

      {showShare && seasonStats && (
        <ShareStatCard
          profile={{ ...profile, full_name: fullName }}
          stats={seasonStats}
          season={season}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  )
}