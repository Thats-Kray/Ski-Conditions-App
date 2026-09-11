import { useState, useEffect, useCallback, useRef } from "react"
import {
  getCurrentUser,
  getMyProfile,
  getProfileById,
  upsertMyProfile,
  uploadProfilePhoto,
} from "../lib/socialApi"
import { getMySessions, getCurrentSeason, getAllTimeStats, getLeaderboard } from "../lib/leaderboardApi"
import { computeStats, seasonDeltaLabel, statsFromLeaderboardRow } from "../lib/profileStats"
import { buildProfileUpdate } from "../lib/profileForm"
import { StatsViewToggle, RecentSessionsFeed } from "./ProfileStats"
import { ProfileStatStrip, ProfileExtraFacts } from "./profile/ProfileStatStrip"
import ShareStatCard from "./ShareStatCard"
import ProfileSettingsList from "./profile/ProfileSettingsList"
import SeasonCalendar from "./SeasonCalendar"
import SkiPlansTab from "./SkiPlansTab"
import Card from "./ui/Card"
import Button from "./ui/Button"
import { skillLabel } from "../lib/friendSubtitle"

// SKILL_OPTIONS feeds `${opt.color}18` hex-alpha-suffix template literals in the
// Edit Profile skill-level picker below, which requires literal hex — a
// var(--token) reference would produce invalid CSS. Same documented Task 0.2
// exception as ProfileSetup.jsx's SKILL_OPTIONS — do not tokenize.
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

const MODE_OPTIONS = [
  { key: "dark",  label: "Dark",  icon: "🌙" },
  { key: "light", label: "Light", icon: "☀️" },
]

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
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState("")

  function togglePass(p) {
    setSkiPasses(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function handleSave() {
    setSaving(true); setError("")
    try {
      const nameParts = displayName.trim().split(" ")
      // buildProfileUpdate, never a bare object literal: upsertMyProfile writes
      // a WHOLE row, so anything omitted here is written as null. See
      // src/lib/profileForm.js.
      await upsertMyProfile(buildProfileUpdate(profile, {
        first_name: nameParts[0] || "",
        last_name: nameParts.slice(1).join(" ") || "",
        full_name: displayName.trim() || null,
        skill_level: skillLevel || null,
        sport_type: sportType || "ski",
        ski_passes: skiPasses,
        vehicle_label: vehicleLabel.trim() || null,
        vehicle_seats: vehicleSeats ? parseInt(vehicleSeats) : null,
      }))
      onSaved()
    } catch (e) {
      setError(e.message || "Could not save profile.")
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle = {
    width: "100%", padding: "11px 13px", borderRadius: 12,
    border: "1px solid var(--overlay-12)", background: "var(--overlay-07)",
    color: "var(--color-text-1)", fontSize: 15, outline: "none", boxSizing: "border-box",
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: "100%", maxWidth: 480,
        background: "linear-gradient(160deg, var(--color-modal-bg), var(--color-bg-deep))",
        border: "1px solid var(--overlay-10)",
        borderRadius: "22px 22px 0 0",
        maxHeight: "92dvh",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Fixed handle + header */}
        <div style={{ flexShrink: 0, padding: "16px 20px 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--overlay-20)", margin: "0 auto 18px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: "var(--color-text-1)" }}>Edit Profile</div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--ink-40)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Scrollable form fields */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "16px 20px 8px" }}>

          {/* Display name */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink-45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>Display Name</div>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" style={fieldStyle} />
          </div>

          {/* Sport type */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink-45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>Sport</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[{ key: "ski", label: "⛷️ Ski" }, { key: "snowboard", label: "🏂 Snowboard" }, { key: "both", label: "🤙 Both" }].map(({ key, label }) => (
                <button key={key} onClick={() => setSportType(key)} style={{
                  flex: 1, padding: "9px 8px", borderRadius: 10,
                  border: `1.5px solid ${sportType === key ? "var(--color-accent-strong)" : "var(--overlay-12)"}`,
                  background: sportType === key ? "rgba(59,130,246,0.18)" : "var(--overlay-05)",
                  color: "var(--color-text-1)", fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}>{label}</button>
              ))}
            </div>
          </div>

          {/* Skill level */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink-45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>Skill Level</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SKILL_OPTIONS.map(opt => (
                <button key={opt.key} onClick={() => setSkillLevel(opt.key)} style={{
                  padding: "7px 14px", borderRadius: 10,
                  border: `1.5px solid ${skillLevel === opt.key ? opt.color : "var(--overlay-10)"}`,
                  background: skillLevel === opt.key ? `${opt.color}18` : "var(--overlay-04)",
                  color: skillLevel === opt.key ? opt.color : "var(--ink-60)",
                  fontWeight: skillLevel === opt.key ? 800 : 500, fontSize: 12, cursor: "pointer",
                }}>{opt.label}</button>
              ))}
            </div>
          </div>

          {/* Ski passes */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink-45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>Ski Passes</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {PASS_OPTIONS.map(p => {
                const active = skiPasses.includes(p)
                return (
                  <button key={p} onClick={() => togglePass(p)} style={{
                    padding: "7px 14px", borderRadius: 10,
                    border: `1.5px solid ${active ? "var(--color-success-strong)" : "var(--overlay-10)"}`,
                    background: active ? "rgba(34,197,94,0.15)" : "var(--overlay-04)",
                    color: active ? "var(--color-success-strong)" : "var(--ink-60)",
                    fontWeight: active ? 800 : 500, fontSize: 12, cursor: "pointer",
                  }}>{p}</button>
                )
              })}
            </div>
          </div>

          {/* Vehicle */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink-45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7 }}>Vehicle (optional)</div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
              <input value={vehicleLabel} onChange={e => setVehicleLabel(e.target.value)} placeholder='e.g. "Blue Subaru"' style={fieldStyle} />
              <input value={vehicleSeats} onChange={e => setVehicleSeats(e.target.value)} placeholder="Seats" type="number" min="1" max="8" style={fieldStyle} />
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <div style={{ flexShrink: 0, padding: "12px 20px max(24px, env(safe-area-inset-bottom))", borderTop: "1px solid var(--overlay-07)" }}>
          {error && <div style={{ fontSize: 13, color: "var(--color-danger)", marginBottom: 12 }}>{error}</div>}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: "100%", padding: "14px", borderRadius: 14, border: "none",
              background: saving ? "var(--overlay-10)" : "var(--gradient-cta)",
              color: saving ? "var(--color-text-1)" : "var(--color-on-accent)", fontWeight: 900, fontSize: 15, cursor: saving ? "default" : "pointer",
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
export default function ProfilePage({ onLogOut, userId = null, onBack, resorts = [] }) {
  const isOwnProfile = !userId

  const [profile, setProfile]         = useState(null)
  const [loading, setLoading]         = useState(true)
  const [showEdit, setShowEdit]       = useState(false)
  const [seasonStats, setSeasonStats] = useState(null)
  const [priorStats, setPriorStats]   = useState(null)
  const [recentSessions, setRecentSessions] = useState([])
  const [showShare, setShowShare]     = useState(false)
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [viewMode, setViewMode]       = useState("season")
  const [allTimeStats, setAllTimeStats] = useState(null)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [currentUserEmail, setCurrentUserEmail] = useState(null)
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
          // Key names must match computeStats(): both shapes feed the same strip
          // components. statsFromLeaderboardRow is the single tested place that
          // renaming happens — do not inline it back.
          setSeasonStats(statsFromLeaderboardRow(row))
        }
        setRecentSessions([])
        setPriorStats(null)
        setAllTimeStats(null)
        return
      }

      // getAcceptedFriends/getAllVisibleTrips used to be fetched here purely to
      // print a Friends count and a Trips count in the hero. Both counts were
      // navigation shortcuts into tabs that are one tap away in the bottom nav,
      // and both were cut in TASK 22.0's Profile slice — so are their requests.
      const [user, prof, sessions, priorSessions] = await Promise.all([
        getCurrentUser(),
        getMyProfile(),
        getMySessions(startYear).catch(() => []),
        getMySessions(startYear - 1).catch(() => []),
      ])
      setProfile(prof)
      setCurrentUserId(user?.id || null)
      setCurrentUserEmail(user?.email || null)
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
      await upsertMyProfile(buildProfileUpdate(profile, { avatar_url: url }))
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
      await upsertMyProfile(buildProfileUpdate(profile, { avatar_url: null }))
      await load()
    } catch (err) {
      alert(err.message || "Could not remove photo.")
    } finally {
      setPhotoUploading(false)
    }
  }

  async function handleSelectTheme(themeName) {
    document.documentElement.setAttribute("data-theme", themeName)
    try {
      localStorage.setItem("pd_theme", themeName)
    } catch {
      // private browsing / storage disabled — the theme still applies for this
      // session and is persisted server-side just below.
    }
    try {
      await upsertMyProfile(buildProfileUpdate(profile, { theme: themeName }))
      await load()
    } catch (err) {
      document.documentElement.setAttribute("data-theme", profile?.theme || "blizzard")
      alert(err.message || "Could not save theme.")
    }
  }

  // Same optimistic shape as handleSelectTheme above: paint first, persist
  // second, roll the attribute back if the write fails. The DOM attribute is
  // REMOVED rather than set to "dark", because index.css has no
  // [data-mode="dark"] block — absence of the attribute is dark mode.
  async function handleSelectMode(modeKey) {
    if (modeKey === "light") document.documentElement.setAttribute("data-mode", "light")
    else document.documentElement.removeAttribute("data-mode")
    const metaTheme = document.querySelector('meta[name="theme-color"]')
    if (metaTheme) metaTheme.setAttribute("content", modeKey === "light" ? "#F2F7FC" : "#020617")
    try {
      localStorage.setItem("pd_theme_mode", modeKey)
    } catch {
      // private browsing / storage disabled — the mode still applies for this
      // session and is persisted server-side just below.
    }
    try {
      await upsertMyProfile(buildProfileUpdate(profile, { theme_mode: modeKey }))
      await load()
    } catch (err) {
      const previous = profile?.theme_mode === "light" ? "light" : "dark"
      if (previous === "light") document.documentElement.setAttribute("data-mode", "light")
      else document.documentElement.removeAttribute("data-mode")
      if (metaTheme) metaTheme.setAttribute("content", previous === "light" ? "#F2F7FC" : "#020617")
      // Roll the cached key back too. Without this the DOM says "dark" but
      // localStorage still says "light", and index.html's pre-mount script reads
      // localStorage — so a reload before the next successful profile load would
      // flash (and stick on) the mode the user never managed to save.
      try {
        localStorage.setItem("pd_theme_mode", previous)
      } catch {
        // private browsing / storage disabled — nothing was cached to roll back.
      }
      alert(err.message || "Could not save appearance mode.")
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--ink-35)", fontSize: 14 }}>
        Loading profile…
      </div>
    )
  }

  const fullName   = profile?.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Unnamed Skier"
  // The mockup's single subtitle line: "🏔 Winter Park · Advanced". skillLabel()
  // is the app's shared key-to-label map (Crew rows and DMs already use it), so
  // one skill level can never be spelled two ways in two screens. Renders nothing
  // when the user has set neither field, which is the common case on live data.
  const heroSubtitle = [
    typeof profile?.favorite_mountain === "string" ? profile.favorite_mountain.trim() : "",
    skillLabel(profile?.skill_level),
  ].filter(Boolean).join(" · ")
  const sportEmoji = SPORT_EMOJI[profile?.sport_type] || "⛷️"

  // One toggle governs both strips. All-Time is own-profile-only: the friend view
  // has a single aggregate season row and no way to ask for more.
  const allTimeSelected = isOwnProfile && viewMode === "allTime"
  const activeStats = allTimeSelected ? allTimeStats : seasonStats
  const deltaLabel = isOwnProfile && viewMode === "season"
    ? seasonDeltaLabel(seasonStats, priorStats)
    : null

  // One label style for every section heading below the stat stack, so Appearance,
  // Season Passes, Vehicle and Settings read as one list rather than four cards
  // that each invented their own heading.
  const sectionLabelStyle = {
    fontSize: 11, fontWeight: 800, color: "var(--ink-40)",
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10,
  }
  const activeThemeKey = profile?.theme || "blizzard"
  const activeThemeLabel = THEME_OPTIONS.find((t) => t.key === activeThemeKey)?.label || "Blizzard"
  const activeMode = profile?.theme_mode === "light" ? "light" : "dark"

  /* Render matrix — what each of this component's two modes shows.
     Both modes come out of ONE component, and the friend mode is the one nobody
     clicks during review, so keep this table honest when you change the JSX.

       section              own profile   friend profile   why
       ------------------   -----------   --------------   -------------------------
       Back button          no            yes              onBack only exists there
       Hero                 yes           yes              same block
       Stats / Ski Plans    no            yes              friend view is the only
         selector                                          per-friend plan filter
       Stat strip           yes           yes              friend data comes from
       Extra facts          yes           yes              statsFromLeaderboardRow
       Season/All-Time      yes           no               needs getAllTimeStats,
         toggle                                            which is self-scoped
       Delta line           yes           no               needs last season's rows
       Season grid          yes           NO               needs per-day sessions,
                                                           never fetched for friends
       Create share card    yes           no               owner's card, owner's data
       History list         yes           no               getMySessions is self-scoped
       Appearance           yes           no               writes the viewer's profile
       Season Passes        yes           yes              display only (unchanged)
       Vehicle              yes           yes              display only (unchanged)
       Settings list        yes           NO               every row acts on the
                                                           signed-in user
       Edit / photo / share yes           no               owner-only modals
         / milestone modals

     Not-a-friend and stats-error cards stay friend-only and unchanged; a
     signed-out visitor who lands here through a profile link hits the
     stats-error card, because getLeaderboard() throws "Not authenticated." */

  return (
    <div style={{ display: "grid", gap: 14 }}>

      {/* Back to where the viewer came from — friend view only */}
      {!isOwnProfile && (
        <button
          onClick={onBack}
          style={{ background: "var(--overlay-07)", border: "1px solid var(--overlay-10)", borderRadius: 10, padding: "8px 14px", color: "var(--color-text-1)", cursor: "pointer", fontWeight: 700, fontSize: 13, minHeight: 44, justifySelf: "start" }}
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

      {/* ── Hero ── borderless, with the mockup's radial glow behind the avatar.
          --color-accent-dim is the token equivalent of the mockup's
          rgba(56,189,248,0.14), so the glow follows the picked theme. */}
      <div style={{
        background: "radial-gradient(ellipse 80% 60% at 50% 0%, var(--color-accent-dim), transparent 65%)",
        borderRadius: 22,
        padding: "18px 16px 20px",
        position: "relative",
      }}>

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
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-40)", fontSize: 22 }}>⏳</div>
                  ) : profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: [
                      "var(--color-accent-deep)", "var(--color-accent-teal)",
                      /* decorative-only, independent of the token palette */
                      "#7c3aed", "#16a34a", "#ea580c",
                    ][fullName.length % 5], fontSize: 32, fontWeight: 900, color: "var(--color-on-accent)" }}>
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
                  background: "var(--color-surface-popover)", border: "1px solid var(--overlay-12)", borderRadius: 14,
                  overflow: "hidden", zIndex: 50, minWidth: 180, boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                }}
              >
                <button
                  onClick={() => { setPhotoMenuOpen(false); fileInputRef.current?.click() }}
                  style={{ width: "100%", padding: "13px 18px", background: "none", border: "none", color: "var(--color-text-1)", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}
                >
                  📤 Upload Photo
                </button>
                {profile?.avatar_url && (
                  <>
                    <div style={{ height: 1, background: "var(--overlay-07)" }} />
                    <button
                      onClick={handleRemovePhoto}
                      style={{ width: "100%", padding: "13px 18px", background: "none", border: "none", color: "var(--color-danger)", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}
                    >
                      🗑️ Remove Photo
                    </button>
                  </>
                )}
                <div style={{ height: 1, background: "var(--overlay-07)" }} />
                <button
                  onClick={() => setPhotoMenuOpen(false)}
                  style={{ width: "100%", padding: "11px 18px", background: "none", border: "none", color: "var(--ink-40)", fontSize: 13, cursor: "pointer", textAlign: "left" }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Name + sport + username */}
          <div style={{ fontSize: 22, fontWeight: 900, color: "var(--color-text-1)", lineHeight: 1.15, textAlign: "center" }}>
            {fullName} <span style={{ fontSize: 18 }}>{sportEmoji}</span>
          </div>
          {profile?.username && (
            <div style={{ color: "var(--ink-40)", fontSize: 13, marginTop: 3 }}>@{profile.username}</div>
          )}
          {heroSubtitle && (
            <div style={{ color: "var(--color-accent-soft)", fontSize: 12, fontWeight: 700, marginTop: 5 }}>
              🏔 {heroSubtitle}
            </div>
          )}

          {/* Edit profile — a pill inside the centred column, matching the mockup.
              The repo's 44px tap floor wins over the mockup's ~30px height. */}
          {isOwnProfile && (
            <button
              onClick={() => setShowEdit(true)}
              style={{
                marginTop: 12, minHeight: 44, padding: "0 20px", borderRadius: 999,
                background: "var(--overlay-05)", border: "1px solid var(--overlay-12)",
                color: "var(--color-text-1)", fontSize: 12, fontWeight: 800, cursor: "pointer",
              }}
            >
              Edit profile
            </button>
          )}
        </div>

      </div>

      {/* ── Stats / Ski Plans sub-tabs — FRIEND VIEW ONLY ──
          The own profile lost this selector in TASK 22.0's Profile slice: its Ski
          Plans tab was a duplicate of the Plans nav tab's own day agenda. A
          friend's profile is the only place in the app that shows one specific
          person's upcoming plans, so it keeps the selector — and keeps it lazy,
          so opening a friend's profile doesn't fetch a month of plans nobody
          asked to see. */}
      {!isOwnProfile && (
        <div style={{
          display: "flex", gap: 4, background: "var(--overlay-04)",
          border: "1px solid var(--overlay-08)", borderRadius: 14,
          padding: 4, width: "fit-content",
        }}>
          {[{ key: "stats", label: "📊 Stats" }, { key: "plans", label: "📅 Ski Plans" }].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setProfileTab(key)}
              style={{
                padding: "8px 16px", borderRadius: 10,
                background: profileTab === key ? "var(--overlay-12)" : "transparent",
                border: profileTab === key ? "1px solid var(--overlay-14)" : "1px solid transparent",
                color: profileTab === key ? "var(--color-text-1)" : "var(--ink-50)",
                fontWeight: profileTab === key ? 800 : 600,
                fontSize: 13, cursor: "pointer", minHeight: 44,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {(isOwnProfile || profileTab === "stats") && (
        <>
          {/* Not an accepted friend — stats are gated server-side too, this is
              just the honest explanation instead of an empty card. */}
          {statsError && (
            <div style={{ background: "var(--overlay-03)", border: "1px solid var(--overlay-08)", borderRadius: 16, padding: "24px 20px", textAlign: "center", color: "var(--color-danger)", fontSize: 13 }}>
              Couldn&apos;t load season stats right now. Try again in a bit.
            </div>
          )}

          {notFriends && (
            <div style={{ background: "var(--overlay-03)", border: "1px solid var(--overlay-08)", borderRadius: 16, padding: "28px 20px", textAlign: "center", display: "grid", gap: 8, justifyItems: "center" }}>
              <div style={{ fontSize: 30 }}>🔒</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--color-text-1)" }}>Season stats are friends-only</div>
              <div style={{ fontSize: 13, color: "var(--ink-45)", maxWidth: 280 }}>
                Add {profile?.first_name || profile?.username || "them"} as a friend to see their days, vertical, and top resort.
              </div>
            </div>
          )}

          {/* ── Stat stack ── header strip, then the facts the strip doesn't carry.
              Replaces SeasonStatsCard, whose 2x2 grid showed the same four numbers
              the strip does. The Season/All-Time toggle governs both strips (and,
              from Task 8, the grid's caption). */}
          {seasonStats && !notFriends && !statsError && (
            <>
              {isOwnProfile && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <StatsViewToggle viewMode={viewMode} onChange={handleViewModeChange} />
                </div>
              )}

              {allTimeSelected && allTimeStats == null ? (
                <div style={{ textAlign: "center", padding: 24, color: "var(--ink-35)", fontSize: 13 }}>
                  Loading all-time stats…
                </div>
              ) : (
                <>
                  <ProfileStatStrip stats={activeStats} />
                  {activeStats.days === 0 ? (
                    <div style={{ textAlign: "center", padding: 20, color: "var(--ink-30)", fontSize: 13 }}>
                      No days logged yet — get out there! ⛷️
                    </div>
                  ) : (
                    <ProfileExtraFacts stats={activeStats} deltaLabel={deltaLabel} />
                  )}
                </>
              )}
            </>
          )}

          {/* ── Season grid ── own profile only.
              A friend's profile never fetches session rows (the friend branch of
              load() sets recentSessions to []), and fetching them would mean a new
              query plus an RLS check — explicitly out of scope for this slice.

              The grid is always THIS season, even when the toggle says All-Time:
              getAllTimeStats() has no season boundary, so an all-time grid would
              grow without limit every year. The caption names the season so the
              toggle can never read as "the grid lost my days". */}
          {isOwnProfile && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: "var(--color-text-1)" }}>Season grid</div>
                <div style={{ fontSize: 11, color: "var(--color-accent-soft)", opacity: 0.7 }}>
                  {season.label} · colored by vertical feet
                </div>
              </div>
              <SeasonCalendar sessions={recentSessions} startYear={season.startYear} />
            </div>
          )}

          {/* The one Share entry point. Same component and same payload as the
              hero's old "Share Season" button, which Task 9 removes; it keeps
              that button's `seasonStats?.days > 0` gate. */}
          {isOwnProfile && seasonStats?.days > 0 && (
            <button
              onClick={() => setShowShare(true)}
              style={{
                width: "100%", minHeight: 44, padding: 13, borderRadius: 14, border: "none",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                background: "var(--gradient-cta)", color: "var(--color-on-accent)",
                fontSize: 13, fontWeight: 800, cursor: "pointer",
              }}
            >
              📤 Create share card
            </button>
          )}

        </>
      )}

      {!isOwnProfile && profileTab === "plans" && (
        <SkiPlansTab userId={userId} editable={false} resorts={resorts} />
      )}

      {isOwnProfile && (
        <div>
          <div style={sectionLabelStyle}>Appearance</div>
          <div style={{
            background: "var(--overlay-03)", border: "1px solid var(--overlay-08)",
            borderRadius: 16, padding: "4px 14px",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              padding: "10px 0",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--color-text-1)" }}>Theme</div>
                <div style={{ fontSize: 11, color: "var(--color-accent-soft)", opacity: 0.7, marginTop: 2 }}>
                  {activeThemeLabel}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {THEME_OPTIONS.map((t) => {
                  const active = activeThemeKey === t.key
                  return (
                    <button
                      key={t.key}
                      onClick={() => handleSelectTheme(t.key)}
                      title={t.label}
                      aria-label={t.label}
                      aria-pressed={active}
                      style={{
                        width: 40, height: 44, padding: 0, background: "none", border: "none",
                        cursor: "pointer", display: "grid", placeItems: "center",
                      }}
                    >
                      <span style={{
                        width: 22, height: 22, borderRadius: "50%", display: "block",
                        background: t.swatch,
                        border: active ? "2px solid var(--color-text-1)" : "2px solid transparent",
                      }} />
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ height: 1, background: "var(--overlay-08)" }} />

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              padding: "10px 0",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--color-text-1)" }}>Appearance</div>
                <div style={{ fontSize: 11, color: "var(--color-accent-soft)", opacity: 0.7, marginTop: 2 }}>
                  {activeMode === "light" ? "Light" : "Dark"}
                </div>
              </div>
              <div style={{
                display: "flex", gap: 2, flexShrink: 0, padding: 2, borderRadius: 999,
                background: "var(--overlay-06)",
              }}>
                {MODE_OPTIONS.map((m) => {
                  const active = activeMode === m.key
                  return (
                    <button
                      key={m.key}
                      onClick={() => handleSelectMode(m.key)}
                      title={m.label}
                      aria-label={`${m.label} mode`}
                      aria-pressed={active}
                      style={{
                        minHeight: 36, padding: "0 14px", borderRadius: 999, border: "none",
                        cursor: "pointer", fontSize: 12, fontWeight: 800,
                        background: active ? "var(--color-accent)" : "transparent",
                        color: active ? "var(--color-bg)" : "var(--ink-50)",
                        display: "flex", alignItems: "center", gap: 5,
                      }}
                    >
                      <span aria-hidden="true">{m.icon}</span>{m.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Season Passes ── not in the mockup, but real user-entered data with
          nowhere else in the app to live, so it is restyled rather than cut.
          Renders on a friend's profile too, exactly as it did before this slice —
          only editing is owner-only, and editing lives in Edit Profile. */}
      {profile?.ski_passes?.length > 0 && (
        <div>
          <div style={sectionLabelStyle}>Season Passes</div>
          <div style={{
            background: "var(--overlay-03)", border: "1px solid var(--overlay-08)",
            borderRadius: 16, padding: 14, display: "flex", flexWrap: "wrap", gap: 8,
          }}>
            {profile.ski_passes.map((p) => (
              <div key={p} style={{
                background: "var(--gradient-pass-pill)", color: "var(--color-pass-pill-text)",
                borderRadius: 999, padding: "7px 14px", fontWeight: 800, fontSize: 13,
              }}>
                {p}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Vehicle ── same reasoning as Season Passes. */}
      {profile?.vehicle_label && (
        <div>
          <div style={sectionLabelStyle}>{isOwnProfile ? "My Vehicle" : "Vehicle"}</div>
          <div style={{
            background: "var(--overlay-03)", border: "1px solid var(--overlay-08)",
            borderRadius: 16, padding: 14, display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{ fontSize: 24 }}>🚗</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-1)" }}>{profile.vehicle_label}</div>
              {profile.vehicle_seats > 0 && (
                <div style={{ fontSize: 12, color: "var(--color-accent-soft)", marginTop: 2, fontWeight: 700 }}>
                  {profile.vehicle_seats} open seat{profile.vehicle_seats !== 1 ? "s" : ""} for passengers
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Settings ── owner-only ── Every row here acts on the signed-in
          user — Sign Out, the profile write behind Notifications, Strava's
          OAuth connect/disconnect — so this must never render on someone
          else's profile. */}
      {isOwnProfile && (
        <div>
          <ProfileSettingsList
            profile={profile}
            email={currentUserEmail}
            onLogOut={onLogOut}
            onProfileSaved={load}
          />
        </div>
      )}

      {/* ── Session History ── own profile only: getMySessions is self-scoped,
          so a friend view has no session rows to render.
          List only. The Calendar option was removed in TASK 22.0's Profile
          slice because the Season grid above now covers it — two near-identical
          day grids on one screen was the duplication this slice exists to end.
          Per-session edit (photos/tags/stats) and per-session share are
          unchanged: neither exists anywhere else in the app.
          Relocated below Settings (was above Appearance) per Kyle's request,
          2026-09-11 — now the last section on the page, so it carries the
          mobile bottom-nav clearance that Settings previously had. */}
      {isOwnProfile && (
        <div className="mobile-bottom-clearance">
          <RecentSessionsFeed
            sessions={recentSessions}
            limit={Infinity}
            onRefresh={load}
            profile={profile}
            fullName={fullName}
          />
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