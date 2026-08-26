import { useState, useEffect, useCallback, useRef } from "react"
import {
  getCurrentUser,
  getMyProfile,
  getProfileById,
  getAcceptedFriends,
  getAllVisibleTrips,
  upsertMyProfile,
  uploadProfilePhoto,
} from "../lib/socialApi"
import { getMySessions, getCurrentSeason, getAllTimeStats, getLeaderboard } from "../lib/leaderboardApi"
import { computeStats } from "../lib/profileStats"
import {
  SeasonStatsCard,
  StatsViewToggle,
  HistoryViewToggle,
  RecentSessionsFeed,
} from "./ProfileStats"
import ShareStatCard from "./ShareStatCard"
import StravaConnect from "./StravaConnect"
import SeasonCalendar from "./SeasonCalendar"
import SkiPlansTab from "./SkiPlansTab"
import Avatar from "./ui/Avatar"
import Card from "./ui/Card"
import Button from "./ui/Button"

// SKILL_OPTIONS feeds `${opt.color}18`/`${skillObj.color}44` hex-alpha-suffix template
// literals below (skill-badge tinting), which requires literal hex — a var(--token)
// reference would produce invalid CSS. Same documented Task 0.2 exception as
// ProfileSetup.jsx's SKILL_OPTIONS — do not tokenize.
const SKILL_OPTIONS = [
  { key: "green",        label: "Green",        color: "#22c55e" },
  { key: "blue",         label: "Blue",         color: "#60a5fa" },
  { key: "black",        label: "Black",        color: "rgba(255,255,255,0.9)" },
  { key: "double_black", label: "Double Black", color: "#f43f5e" },
  { key: "experts_only", label: "Experts Only", color: "#c084fc" },
]

const PASS_OPTIONS = ["Epic", "Ikon", "Indy", "Mountain Collective", "None"]
const SPORT_EMOJI = { ski: "⛷️", snowboard: "🏂", both: "🤙" }

const THEME_OPTIONS = [
  { key: "blizzard", label: "Blizzard", swatch: "#38bdf8" },
  { key: "alpine-dawn", label: "Alpine Dawn", swatch: "#F59E0B" },
  { key: "storm-chaser", label: "Storm Chaser", swatch: "#14B8A6" },
  { key: "aurora-peak", label: "Aurora Peak", swatch: "#A855F7" },
  { key: "base-lodge", label: "Base Lodge", swatch: "#F97316" },
]

function initials(name) {
  return (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

// ── Season Milestones ─────────────────────────────────────────────────────────

const MILESTONES = [
  { id: "days_10",      check: (s) => s.days >= 10,      label: "10 Days on the Mountain", icon: "🎿" },
  { id: "days_25",      check: (s) => s.days >= 25,      label: "25 Days on the Mountain", icon: "🏔️" },
  { id: "first_powder", check: (s) => s.powderDays >= 1, label: "First Powder Day",         icon: "❄️" },
  { id: "vertical_50k", check: (s) => s.vertical >= 50000,  label: "50,000 ft Vertical",    icon: "⬇️" },
  { id: "vertical_100k",check: (s) => s.vertical >= 100000, label: "100,000 ft Vertical",   icon: "🚀" },
  { id: "runs_100",     check: (s) => s.totalRuns >= 100, label: "100 Runs",                icon: "💯" },
  { id: "resorts_5",    check: (s) => s.resorts >= 5,     label: "5 Resorts Visited",        icon: "🗺️" },
]

function getShownMilestones(startYear) {
  try {
    const raw = localStorage.getItem(`pd_milestones_shown_${startYear}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

// Marks an entire batch of milestone ids as shown in a single read-modify-write,
// rather than one localStorage read+write per id — avoids leaving ids unmarked if
// the user dismisses some of the queue and navigates away before finishing the rest.
function markMilestonesShown(startYear, ids) {
  if (!ids || !ids.length) return
  try {
    const shown = getShownMilestones(startYear)
    const merged = Array.from(new Set([...shown, ...ids]))
    localStorage.setItem(`pd_milestones_shown_${startYear}`, JSON.stringify(merged))
  } catch {
    // private browsing / storage disabled — fail silently, matching existing convention
  }
}

// ── Edit Profile Modal ────────────────────────────────────────────────────────

function EditProfileModal({ profile, onSaved, onClose }) {
  const [displayName, setDisplayName]   = useState(profile?.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "")
  const [skillLevel, setSkillLevel]     = useState(profile?.skill_level || "")
  const [sportType, setSportType]       = useState(profile?.sport_type || "ski")
  const [skiPasses, setSkiPasses]       = useState(profile?.ski_passes || [])
  const [vehicleLabel, setVehicleLabel] = useState(profile?.vehicle_label || "")
  const [vehicleSeats, setVehicleSeats] = useState(profile?.vehicle_seats || "")
  const [powderAlertsEnabled, setPowderAlertsEnabled] = useState(profile?.powder_alerts_enabled ?? false)
  const [alertPhone, setAlertPhone]     = useState(profile?.alert_phone ?? "")
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
        powder_alerts_enabled: powderAlertsEnabled,
        alert_phone: alertPhone.trim() || null,
        theme: profile?.theme || "blizzard",
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
        background: "linear-gradient(160deg, var(--color-modal-bg), var(--color-bg-deep))",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "22px 22px 0 0",
        maxHeight: "92dvh",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Fixed handle + header */}
        <div style={{ flexShrink: 0, padding: "16px 20px 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)", margin: "0 auto 18px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: "white" }}>Edit Profile</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Scrollable form fields */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "16px 20px 8px" }}>

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
                  border: `1.5px solid ${sportType === key ? "var(--color-accent-strong)" : "rgba(255,255,255,0.12)"}`,
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
                    border: `1.5px solid ${active ? "var(--color-success-strong)" : "rgba(255,255,255,0.1)"}`,
                    background: active ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
                    color: active ? "var(--color-success-strong)" : "rgba(255,255,255,0.6)",
                    fontWeight: active ? 800 : 500, fontSize: 12, cursor: "pointer",
                  }}>{p}</button>
                )
              })}
            </div>
          </div>

          {/* Vehicle */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>Vehicle (optional)</div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
              <input value={vehicleLabel} onChange={e => setVehicleLabel(e.target.value)} placeholder='e.g. "Blue Subaru"' style={fieldStyle} />
              <input value={vehicleSeats} onChange={e => setVehicleSeats(e.target.value)} placeholder="Seats" type="number" min="1" max="8" style={fieldStyle} />
            </div>
          </div>

          {/* Powder alerts */}
          <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>Powder Alerts</div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "white", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={powderAlertsEnabled}
                onChange={e => setPowderAlertsEnabled(e.target.checked)}
              />
              📧 Weekly powder forecast every Wednesday
            </label>
            {powderAlertsEnabled && (
              <input
                type="tel"
                placeholder="Phone number (for future SMS alerts)"
                value={alertPhone}
                onChange={e => setAlertPhone(e.target.value)}
                style={fieldStyle}
              />
            )}
          </div>
        </div>

        {/* Sticky footer */}
        <div style={{ flexShrink: 0, padding: "12px 20px max(24px, env(safe-area-inset-bottom))", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          {error && <div style={{ fontSize: 13, color: "var(--color-danger)", marginBottom: 12 }}>{error}</div>}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: "100%", padding: "14px", borderRadius: 14, border: "none",
              background: saving ? "rgba(255,255,255,0.1)" : "var(--gradient-cta)",
              color: "white", fontWeight: 900, fontSize: 15, cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  )
}

function MilestoneModal({ milestone, onShare, onClose }) {
  if (!milestone) return null
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 700 }}>
      <Card style={{ textAlign: "center", padding: 32, maxWidth: 340 }}>
        <div style={{ fontSize: 48 }}>{milestone.icon}</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginTop: 12 }}>{milestone.label}</div>
        <div style={{ fontSize: 14, color: "var(--color-text-2)", marginTop: 6 }}>Milestone unlocked! 🎉</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
          <Button onClick={onShare}>Share</Button>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </Card>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

/**
 * Own profile when `userId` is omitted; a read-only view of someone else's
 * profile when it is supplied (Sprint 34).
 *
 * NOTE the naming: `userId` is the profile BEING VIEWED, while `currentUserId`
 * state is the signed-in viewer. That state used to be called `userId` — it was
 * renamed when the prop arrived, because a shadowed name here would silently
 * break the all-time stats fetch rather than error.
 */
export default function ProfilePage({ onLogOut, onTabChange, userId = null, onBack, resorts = [] }) {
  const isOwnProfile = !userId

  const [profile, setProfile]         = useState(null)
  const [friends, setFriends]         = useState([])
  const [tripCount, setTripCount]     = useState(0)
  const [loading, setLoading]         = useState(true)
  const [showEdit, setShowEdit]       = useState(false)
  const [seasonStats, setSeasonStats] = useState(null)
  const [priorStats, setPriorStats]   = useState(null)
  const [recentSessions, setRecentSessions] = useState([])
  const [showShare, setShowShare]     = useState(false)
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [viewMode, setViewMode]       = useState("season")
  const [historyView, setHistoryView] = useState("list")
  const [allTimeStats, setAllTimeStats] = useState(null)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [milestoneQueue, setMilestoneQueue] = useState([])
  const [shareFromMilestone, setShareFromMilestone] = useState(false)
  const [profileTab, setProfileTab]   = useState("stats")   // "stats" | "plans"
  const [notFriends, setNotFriends]   = useState(false)
  const [statsError, setStatsError]   = useState(false)
  const fileInputRef = useRef(null)

  const season = getCurrentSeason()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { startYear } = getCurrentSeason()

      if (!isOwnProfile) {
        // Friend view. getLeaderboard() already returns the signed-in user plus
        // every accepted friend with 16 season stats each, so a friend's stats
        // need no new query — and absence from that list IS the not-a-friend
        // signal.
        // getLeaderboard failing is NOT the same as "not a friend" — an empty
        // board is exactly the signal used to detect a non-friend, so a blip
        // would show the friends-only lock card to an actual friend. Track the
        // failure separately and say so.
        let boardFailed = false
        const [prof, board] = await Promise.all([
          getProfileById(userId),
          getLeaderboard(startYear).catch(() => { boardFailed = true; return [] }),
        ])
        setProfile(prof)

        const row = (board || []).find((r) => r.id === userId)
        if (boardFailed) {
          setStatsError(true)
          setNotFriends(false)
          setSeasonStats(null)
        } else if (!row) {
          setStatsError(false)
          setNotFriends(true)
          setSeasonStats(null)
        } else {
          setStatsError(false)
          setNotFriends(false)
          // Key names must match computeStats() — SeasonStatsCard reads both.
          setSeasonStats({
            days:           row.days,
            vertical:       row.verticalFt,
            miles:          row.milesSki,
            powderDays:     row.powderDays,
            resorts:        row.resorts,
            topResort:      row.topResort,
            totalRuns:      row.totalRuns,
            topSpeed:       row.topSpeed,
            timeOnMountain: row.timeOnMountain,
          })
        }
        setRecentSessions([])
        setPriorStats(null)
        setAllTimeStats(null)
        return
      }

      const [user, prof, friendData, tripData, sessions, priorSessions] = await Promise.all([
        getCurrentUser(),
        getMyProfile(),
        getAcceptedFriends().catch(() => []),
        getAllVisibleTrips().catch(() => []),
        getMySessions(startYear).catch(() => []),
        getMySessions(startYear - 1).catch(() => []),
      ])
      setProfile(prof)
      setCurrentUserId(user?.id || null)
      setFriends(Array.isArray(friendData) ? friendData : [])
      const { mine = [], rsvpd = [] } = tripData || {}
      const seen = new Set()
      let count = 0
      for (const t of [...mine, ...rsvpd]) {
        if (!seen.has(t.id)) { seen.add(t.id); count++ }
      }
      setTripCount(count)
      if (Array.isArray(sessions)) {
        const currentStats = computeStats(sessions)
        setSeasonStats(currentStats)
        setRecentSessions(sessions)

        const shownIds = getShownMilestones(startYear)
        const newlyCrossed = MILESTONES.filter((m) => m.check(currentStats) && !shownIds.includes(m.id))
        if (newlyCrossed.length) {
          setMilestoneQueue(newlyCrossed)
          // Persist the whole batch now, at queue time — not as each is individually
          // dismissed — so a user who closes some and navigates away doesn't leave the
          // rest unmarked and see them reappear next visit.
          markMilestonesShown(startYear, newlyCrossed.map((m) => m.id))
        }
      }
      if (Array.isArray(priorSessions)) {
        setPriorStats(computeStats(priorSessions))
      }
    } catch {
      // parent handles auth
    } finally {
      setLoading(false)
    }
  }, [isOwnProfile, userId])

  function handleViewModeChange(mode) {
    setViewMode(mode)
    if (mode === "allTime" && allTimeStats == null && currentUserId) {
      getAllTimeStats(currentUserId)
        .then((sessions) => setAllTimeStats(computeStats(sessions)))
        .catch(() => {})
    }
  }

  useEffect(() => { load() }, [load])

  function dismissMilestone() {
    // Persistence already happened in bulk when the queue was built (see load()) —
    // this only advances the on-screen queue.
    setMilestoneQueue((q) => q.slice(1))
  }

  async function handlePhotoFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoMenuOpen(false)
    setPhotoUploading(true)
    try {
      const url = await uploadProfilePhoto(file)
      await upsertMyProfile({ ...profile, avatar_url: url })
      await load()
    } catch (err) {
      alert(err.message || "Photo upload failed.")
    } finally {
      setPhotoUploading(false)
      e.target.value = ""
    }
  }

  async function handleRemovePhoto() {
    setPhotoMenuOpen(false)
    setPhotoUploading(true)
    try {
      await upsertMyProfile({ ...profile, avatar_url: null })
      await load()
    } catch (err) {
      alert(err.message || "Could not remove photo.")
    } finally {
      setPhotoUploading(false)
    }
  }

  async function handleSelectTheme(themeName) {
    document.documentElement.setAttribute("data-theme", themeName)
    try { localStorage.setItem("pd_theme", themeName) } catch {}
    try {
      await upsertMyProfile({ ...profile, theme: themeName })
      await load()
    } catch (err) {
      document.documentElement.setAttribute("data-theme", profile?.theme || "blizzard")
      alert(err.message || "Could not save theme.")
    }
  }

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

      {/* Back to where the viewer came from — friend view only */}
      {!isOwnProfile && (
        <button
          onClick={onBack}
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 14px", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 13, minHeight: 44, justifySelf: "start" }}
        >
          ‹ Back
        </button>
      )}

      {/* Hidden file input for photo upload */}
      {isOwnProfile && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handlePhotoFileChange}
        />
      )}

      {/* ── Hero ── */}
      <div style={{
        background: "linear-gradient(160deg,rgba(15,23,42,0.98),rgba(10,17,34,0.98))",
        border: "1px solid rgba(96,165,250,0.15)",
        borderRadius: 22,
        padding: "24px 20px 20px",
        position: "relative",
      }}>

        {/* Sign out — top right */}
        {isOwnProfile && (
          <button
            onClick={onLogOut}
            title="Sign Out"
            style={{ position: "absolute", top: 14, right: 14, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15 }}
          >🚪</button>
        )}

        {/* Centered photo + name block */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>

          {/* Avatar with camera overlay */}
          <div style={{ position: "relative", marginBottom: 14 }}>
            <div
              onClick={() => isOwnProfile && !photoUploading && setPhotoMenuOpen(v => !v)}
              style={{ cursor: isOwnProfile && !photoUploading ? "pointer" : "default", position: "relative" }}
            >
              {/* Glowing ring border like Strava */}
              <div style={{
                width: 96, height: 96, borderRadius: "50%",
                background: "linear-gradient(135deg, var(--color-accent-strong), var(--color-accent-teal))",
                padding: 3, flexShrink: 0,
              }}>
                <div style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", background: "var(--color-bg-deep)" }}>
                  {photoUploading ? (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", fontSize: 22 }}>⏳</div>
                  ) : profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: [
                      "var(--color-accent-deep)", "var(--color-accent-teal)",
                      /* decorative-only, independent of the token palette */
                      "#7c3aed", "#16a34a", "#ea580c",
                    ][fullName.length % 5], fontSize: 32, fontWeight: 900, color: "white" }}>
                      {fullName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>

              {/* Camera badge */}
              {isOwnProfile && !photoUploading && (
                <div style={{
                  position: "absolute", bottom: 2, right: 2,
                  width: 26, height: 26, borderRadius: "50%",
                  background: "var(--color-accent-deep)", border: "2px solid var(--color-bg-deep)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13,
                }}>📷</div>
              )}
            </div>

            {/* Photo action sheet */}
            {photoMenuOpen && (
              <div
                style={{
                  position: "absolute", top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
                  background: "var(--color-surface-popover)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14,
                  overflow: "hidden", zIndex: 50, minWidth: 180, boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                }}
              >
                <button
                  onClick={() => { setPhotoMenuOpen(false); fileInputRef.current?.click() }}
                  style={{ width: "100%", padding: "13px 18px", background: "none", border: "none", color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}
                >
                  📤 Upload Photo
                </button>
                {profile?.avatar_url && (
                  <>
                    <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />
                    <button
                      onClick={handleRemovePhoto}
                      style={{ width: "100%", padding: "13px 18px", background: "none", border: "none", color: "var(--color-danger)", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}
                    >
                      🗑️ Remove Photo
                    </button>
                  </>
                )}
                <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />
                <button
                  onClick={() => setPhotoMenuOpen(false)}
                  style={{ width: "100%", padding: "11px 18px", background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer", textAlign: "left" }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Name + sport + username */}
          <div style={{ fontSize: 22, fontWeight: 900, color: "white", lineHeight: 1.15, textAlign: "center" }}>
            {fullName} <span style={{ fontSize: 18 }}>{sportEmoji}</span>
          </div>
          {profile?.username && (
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 3 }}>@{profile.username}</div>
          )}
          {profile?.favorite_mountain && (
            <div style={{ color: "var(--color-accent-soft)", fontSize: 12, fontWeight: 700, marginTop: 5 }}>📍 {profile.favorite_mountain}</div>
          )}
          {skillObj && (
            <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, background: `${skillObj.color}18`, border: `1px solid ${skillObj.color}44`, borderRadius: 999, padding: "3px 12px" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: skillObj.color }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: skillObj.color }}>{skillObj.label}</span>
            </div>
          )}
        </div>

        {/* Stats row — like Instagram/Strava.
            Trips and Friends counts come from getAllVisibleTrips/getAcceptedFriends,
            both of which are scoped to the signed-in user — on someone else's
            profile they would render a misleading "0", so only Days is shown. */}
        <div style={{ display: "flex", marginTop: 20, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16 }}>
          {isOwnProfile && (
            <>
              <button
                onClick={() => onTabChange?.("plans")}
                style={{ flex: 1, background: "none", border: "none", cursor: "pointer", textAlign: "center", padding: "4px 0" }}
              >
                <div style={{ fontSize: 22, fontWeight: 900, color: "white", lineHeight: 1 }}>{tripCount}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.7, marginTop: 4 }}>Trips</div>
              </button>
              <div style={{ width: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />
              <button
                onClick={() => onTabChange?.("crew")}
                style={{ flex: 1, background: "none", border: "none", cursor: "pointer", textAlign: "center", padding: "4px 0" }}
              >
                <div style={{ fontSize: 22, fontWeight: 900, color: "white", lineHeight: 1 }}>{friends.length}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.7, marginTop: 4 }}>Friends</div>
              </button>
              <div style={{ width: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />
            </>
          )}
          <div style={{ flex: 1, textAlign: "center", padding: "4px 0" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: seasonStats?.days > 0 ? "var(--color-accent-soft)" : "white", lineHeight: 1 }}>{seasonStats?.days ?? "—"}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.7, marginTop: 4 }}>Days</div>
          </div>
        </div>

        {/* Edit Profile + Share buttons — like Instagram */}
        {isOwnProfile && (
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button
              onClick={() => setShowEdit(true)}
              style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "white", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
            >
              Edit Profile
            </button>
            {seasonStats?.days > 0 && (
              <button
                onClick={() => setShowShare(true)}
                style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "none", background: "var(--gradient-cta)", color: "white", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
              >
                Share Season
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Stats / Ski Plans sub-tabs ── */}
      <div style={{
        display: "flex", gap: 4, background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14,
        padding: 4, width: "fit-content",
      }}>
        {[{ key: "stats", label: "📊 Stats" }, { key: "plans", label: "📅 Ski Plans" }].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setProfileTab(key)}
            style={{
              padding: "8px 16px", borderRadius: 10,
              background: profileTab === key ? "rgba(255,255,255,0.12)" : "transparent",
              border: profileTab === key ? "1px solid rgba(255,255,255,0.14)" : "1px solid transparent",
              color: profileTab === key ? "white" : "rgba(255,255,255,0.5)",
              fontWeight: profileTab === key ? 800 : 600,
              fontSize: 13, cursor: "pointer", minHeight: 44,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {profileTab === "stats" && (
        <>
          {/* Not an accepted friend — stats are gated server-side too, this is
              just the honest explanation instead of an empty card. */}
          {statsError && (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "24px 20px", textAlign: "center", color: "var(--color-danger)", fontSize: 13 }}>
              Couldn&apos;t load season stats right now. Try again in a bit.
            </div>
          )}

          {notFriends && (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "28px 20px", textAlign: "center", display: "grid", gap: 8, justifyItems: "center" }}>
              <div style={{ fontSize: 30 }}>🔒</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>Season stats are friends-only</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", maxWidth: 280 }}>
                Add {profile?.first_name || profile?.username || "them"} as a friend to see their days, vertical, and top resort.
              </div>
            </div>
          )}

          {/* ── Season Stats ── */}
          {seasonStats && !notFriends && !statsError && (
            <>
              {isOwnProfile && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <StatsViewToggle viewMode={viewMode} onChange={handleViewModeChange} />
                </div>
              )}
              {isOwnProfile && viewMode === "allTime" && allTimeStats == null ? (
                <div style={{ textAlign: "center", padding: "24px", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
                  Loading all-time stats…
                </div>
              ) : (
                <SeasonStatsCard
                  stats={isOwnProfile && viewMode === "allTime" ? allTimeStats : seasonStats}
                  priorStats={isOwnProfile && viewMode === "season" ? priorStats : null}
                  season={season}
                  viewMode={isOwnProfile ? viewMode : "season"}
                />
              )}
            </>
          )}

          {/* ── Session History (List / Calendar) ── */}
          {/* Own profile only: getMySessions is self-scoped, so a friend view has
              no session rows to render. */}
          {isOwnProfile && (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <HistoryViewToggle viewMode={historyView} onChange={setHistoryView} />
              </div>
              {historyView === "list" ? (
                <RecentSessionsFeed sessions={recentSessions} limit={Infinity} onRefresh={load} profile={profile} fullName={fullName} />
              ) : (
                <SeasonCalendar sessions={recentSessions} startYear={season.startYear} />
              )}
            </>
          )}
        </>
      )}

      {profileTab === "plans" && (
        <SkiPlansTab userId={userId} editable={isOwnProfile} resorts={resorts} />
      )}

      {/* ── Theme ── */}
      {isOwnProfile && (
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Theme</div>
        <div style={{ display: "flex", gap: 12 }}>
          {THEME_OPTIONS.map((t) => {
            const active = (profile?.theme || "blizzard") === t.key
            return (
              <button
                key={t.key}
                onClick={() => handleSelectTheme(t.key)}
                style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 0 }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: t.swatch,
                  border: active ? "2px solid var(--color-accent)" : "2px solid transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {active && <span style={{ fontSize: 16, color: "white", textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>✓</span>}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: active ? "white" : "rgba(255,255,255,0.5)" }}>{t.label}</div>
              </button>
            )
          })}
        </div>
      </div>
      )}

      {/* ── Season Passes ── */}
      {profile?.ski_passes?.length > 0 && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Season Passes</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {profile.ski_passes.map((p) => (
              <div key={p} style={{ background: "var(--gradient-pass-pill)", color: "var(--color-pass-pill-text)", borderRadius: 999, padding: "7px 14px", fontWeight: 800, fontSize: 13 }}>
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
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8 }}>{isOwnProfile ? "My Vehicle" : "Vehicle"}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "white", marginTop: 2 }}>{profile.vehicle_label}</div>
            {profile.vehicle_seats > 0 && (
              <div style={{ fontSize: 12, color: "var(--color-accent-soft)", marginTop: 2, fontWeight: 700 }}>
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
              onClick={() => onTabChange?.("crew")}
              style={{ background: "none", border: "none", color: "var(--color-accent-soft)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}
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

      {/* ── Connected Apps ── */}
      {/* Last section on the page — extra bottom clearance (mobile only)
          so it isn't covered by the fixed mobile bottom nav bar.
          Owner-only: StravaConnect issues OAuth connect/disconnect calls for the
          signed-in user, so it must never render on someone else's profile. */}
      {isOwnProfile && (
        <div className="mobile-bottom-clearance">
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
            Connected Apps
          </div>
          <StravaConnect userId={profile?.id} />
        </div>
      )}

      {/* ── Modals ── all owner-only ── */}
      {isOwnProfile && showEdit && (
        <EditProfileModal
          profile={profile}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); load() }}
        />
      )}

      {isOwnProfile && showShare && seasonStats && (
        <ShareStatCard
          profile={{ ...profile, full_name: fullName }}
          stats={seasonStats}
          season={season}
          onClose={() => {
            setShowShare(false)
            // If this share card was opened from the milestone modal's "Share" button,
            // advance the queue only now — deferring past the ShareStatCard's own
            // lifetime keeps the next milestone modal from stacking on top of it.
            if (shareFromMilestone) {
              setShareFromMilestone(false)
              dismissMilestone()
            }
          }}
        />
      )}

      {isOwnProfile && milestoneQueue[0] && !showShare && (
        <MilestoneModal
          milestone={milestoneQueue[0]}
          onShare={() => { setShareFromMilestone(true); setShowShare(true) }}
          onClose={dismissMilestone}
        />
      )}
    </div>
  )
}