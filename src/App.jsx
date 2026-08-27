import { useEffect, useMemo, useState } from "react"
import SnowfallBackground from "./components/SnowfallBackground"
import { useMobile } from "./lib/useMobile"
import { localDateKey } from "./lib/calendarDates"
import { formatDate } from "./lib/format"
import AuthForm from "./components/AuthForm"
import OnboardingFlow from "./components/OnboardingFlow"
import MessagingCenter from "./components/MessagingCenter"
import ProfilePage from "./components/ProfilePage"
import { ProfileNavContext } from "./lib/profileNav"
import SkiPlansPage from "./components/SkiPlansPage"
import TripDetailModal from "./components/TripDetailModal"
import NotificationBell, { useNotificationCount } from "./components/NotificationBell"
import LandingPage from "./components/LandingPage"
import ActiveSessionBar from "./components/ActiveSessionBar"
import SessionRecapModal from "./components/SessionRecapModal"
import MountainPage from "./components/MountainPage"
import TodayScreen from "./components/TodayScreen"
import TrackScreen from "./components/TrackScreen"
import {
  getAcceptedFriends,
  getCurrentUser,
  getFriendUpcomingTripsByResort,
  getMyDailyPlan,
  getMyProfile,
  getResortActivityCounts,
  getResortSkierCounts,
  getResortSkierDetails,
  getResortVibeData,
  getTripDetail,
  logActivityOnce,
  logOut,
  syncVerificationFromAuth,
  upsertDailyPlan,
} from "./lib/socialApi"
import { flushSessionToSupabase, logSkiDay } from "./lib/leaderboardApi"
import { buildPlanUpsert } from "./lib/planUpsert"
import { useGpsTracker } from "./lib/useGpsTracker"
import HeroBannerStrip from "./components/ui/HeroBannerStrip"
import { SnowIcon, PlansIcon, TrackIcon, SocialIcon, ProfileIcon } from "./components/ui/NavIcons"

// Keyed by the five tab keys shipped in Task 7 (today/plans/track/crew/me).
// HomeIcon is no longer imported — the `home` tab was retired in Task 6.
const NAV_ICONS = {
  today: SnowIcon,
  plans: PlansIcon,
  track: TrackIcon,
  crew: SocialIcon,
  me: ProfileIcon,
}

import { supabase, authHeaders } from "./lib/supabase"
import { normalizeResortKey } from "./lib/resorts"

const RESORTS = [
  // Epic
  {
    name: "Vail",
    pass: "Epic",
    lat: 39.6403,
    lon: -106.3742,
    resortKey: "vail",
    photoPath: "/resorts/vail.jpg",
    directionsQuery: "Vail Parking Structure, Vail CO",
    isOpen: false,
  },
  {
    name: "Beaver Creek",
    pass: "Epic",
    lat: 39.6042,
    lon: -106.5165,
    resortKey: "beavercreek",
    photoPath: "/resorts/beaver-creek.jpg",
    directionsQuery: "Beaver Creek Elk Lot, Avon CO",
    isOpen: false,
  },
  {
    name: "Breckenridge",
    pass: "Epic",
    lat: 39.4817,
    lon: -106.0384,
    resortKey: "breckenridge",
    photoPath: "/resorts/breckenridge.jpg",
    directionsQuery: "Breckenridge Gondola Lot, Breckenridge CO",
    isOpen: false,
  },
  {
    name: "Keystone",
    pass: "Epic",
    lat: 39.6084,
    lon: -105.9437,
    resortKey: "keystone",
    photoPath: "/resorts/keystone.jpg",
    directionsQuery: "River Run Parking Lot, Keystone CO",
    isOpen: false,
  },
  {
    name: "Crested Butte",
    pass: "Epic",
    lat: 38.8996,
    lon: -106.9653,
    resortKey: "crestedbutte",
    photoPath: "/resorts/crested-butte.jpg",
    directionsQuery: "Crested Butte Mountain Resort Parking, Mt Crested Butte CO",
    isOpen: false,
  },
  {
    name: "Telluride",
    pass: "Epic",
    lat: 37.9363,
    lon: -107.8466,
    resortKey: "telluride",
    photoPath: "/resorts/telluride.jpg",
    directionsQuery: "Telluride Mountain Village Parking Garage, Mountain Village CO",
    isOpen: false,
  },

  // Ikon
  {
    name: "Winter Park",
    pass: "Ikon",
    lat: 39.8863,
    lon: -105.7626,
    resortKey: "winterpark",
    photoPath: "/resorts/winter-park.jpg",
    directionsQuery: "Winter Park Resort Parking Garage, Winter Park CO",
    isOpen: false,
  },
  {
    name: "Copper Mountain",
    pass: "Ikon",
    lat: 39.5022,
    lon: -106.1512,
    resortKey: "coppermountain",
    photoPath: "/resorts/copper-mountain.jpg",
    directionsQuery: "Copper Mountain Alpine Lot, Frisco CO",
    isOpen: false,
  },
  {
    name: "Arapahoe Basin",
    pass: "Ikon",
    lat: 39.6423,
    lon: -105.8717,
    resortKey: "arapahoebasin",
    photoPath: "/resorts/arapahoe-basin.jpg",
    directionsQuery: "Arapahoe Basin Ski Area Parking Lot, Dillon CO",
    isOpen: false,
  },
  {
    name: "Steamboat",
    pass: "Ikon",
    lat: 40.4572,
    lon: -106.8047,
    resortKey: "steamboat",
    photoPath: "/resorts/steamboat.jpg",
    directionsQuery: "Steamboat Gondola Square Parking, Steamboat Springs CO",
    isOpen: false,
  },
  {
    name: "Eldora",
    pass: "Ikon",
    lat: 39.9372,
    lon: -105.5842,
    resortKey: "eldora",
    photoPath: "/resorts/eldora.jpg",
    directionsQuery: "Eldora Mountain Resort Parking, Nederland CO",
    isOpen: false,
  },
  {
    name: "Aspen Snowmass",
    pass: "Ikon",
    lat: 39.2097,
    lon: -106.9499,
    resortKey: "aspensnowmass",
    photoPath: "/resorts/aspen-snowmass.jpg",
    directionsQuery: "Snowmass Base Village Parking, Snowmass Village CO",
    isOpen: false,
  },
]

const KRAMES_BUTTE_KEY = "kramesbutte"
const KRAMES_BUTTE_RESORT = { resortKey: KRAMES_BUTTE_KEY, name: "Krames Butte", emoji: "🧪", isOpen: null, powderScore: null }

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function safePercent(open, total) {
  if (open == null || total == null || total === 0) return null
  return open / total
}


function computeRawPowderScore({
  tempF,
  windMph,
  forecastText,
  snowPrev24in,
  snowPrev48in,
  snow24in,
  snow48in,
  baseDepth,
  liftsOpen,
  liftsTotal,
  runsOpen,
  runsTotal,
  drivePenalty,
}) {
  // ── Fresh snow (0–40 pts) ────────────────────────────────────────
  const freshSnow =
    clamp((snowPrev24in ?? 0) * 5, 0, 32) +   // last 24 h is king
    clamp((snowPrev48in ?? 0) * 1.5, 0, 8)     // 2-day accumulation bonus

  // ── Incoming snow (0–20 pts) ─────────────────────────────────────
  const incomingSnow =
    clamp((snow24in ?? 0) * 3.5, 0, 15) +      // next 24 h forecast
    clamp((snow48in ?? 0) * 1.0, 0, 5)          // 48 h forecast

  // ── Temperature (0–20 pts) — absolute bands ──────────────────────
  // 20-30°F = sweet spot | 30-40°F = warm bluebird | 40°F+ = slushy
  // 10-20°F = chilly | 0-10°F = frigid | sub-zero = freezing
  const t = tempF ?? 25
  const tempScore =
    t >= 20 && t <= 30 ? 20 :   // sweet spot: perfect powder temp
    t > 30 && t <= 35  ? 17 :   // warm, still great
    t > 35 && t <= 40  ? 11 :   // warm bluebird, snow softening
    t > 40 && t <= 48  ?  4 :   // slushy spring conditions
    t > 48             ?  0 :   // full spring slush
    t >= 12 && t < 20  ? 15 :   // chilly, dry powder
    t >=  0 && t < 12  ?  8 :   // frigid, icy
                          2     // sub-zero, brutal cold

  // ── Terrain (0–15 pts) ───────────────────────────────────────────
  const runsPct  = safePercent(runsOpen,  runsTotal)
  const liftsPct = safePercent(liftsOpen, liftsTotal)
  const terrainScore = clamp(
    (runsPct  != null ? runsPct  * 10 : 5) +   // runs open %
    (liftsPct != null ? liftsPct *  5 : 2.5),  // lifts open %
    0, 15
  )

  // ── Base depth (0–5 pts) ─────────────────────────────────────────
  const baseScore = clamp((baseDepth ?? 0) / 14, 0, 5)  // 70" base = 5 pts

  // ── Snow-in-forecast text hint (+2 pts) ─────────────────────────
  const snowHint = /snow|powder|flurr|wintry/i.test(forecastText || "") ? 2 : 0

  // ── Wind penalty (up to –15 pts) ────────────────────────────────
  const windPenalty = clamp((windMph ?? 0) * 0.75, 0, 15)

  // ── Drive penalty (up to –10 pts) ───────────────────────────────
  const driveAdj = clamp(drivePenalty ?? 0, 0, 10)

  const raw =
    freshSnow + incomingSnow + tempScore + terrainScore +
    baseScore + snowHint - windPenalty - driveAdj

  return Math.round(clamp(raw, 0, 100) * 10) / 10
}

// Assigns absolute tier labels — no relative normalization.
// Closed resorts show no score so they can't mislead users.
function normalizePowderScores(rows) {
  return rows.map((r) => {
    if (r.isOpen === false) {
      return { ...r, powderScore: null, powderTier: "Closed" }
    }
    if (typeof r.rawPowderScore !== "number") {
      return { ...r, powderScore: null, powderTier: "Unknown" }
    }
    const powderScore = Math.round(r.rawPowderScore)
    let powderTier = "Poor"
    if      (powderScore >= 80) powderTier = "Elite"
    else if (powderScore >= 65) powderTier = "Very Good"
    else if (powderScore >= 50) powderTier = "Good"
    else if (powderScore >= 35) powderTier = "Okay"
    return { ...r, powderScore, powderTier }
  })
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8787"

async function fetchJson(url, errorMessage) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(errorMessage)
  const data = await r.json()
  if (data?.error) throw new Error(data.error)
  return data
}

async function fetchNwsNowish(lat, lon) {
  const point = await fetchJson(
    `${API_BASE}/api/nws/point?lat=${lat}&lon=${lon}`,
    `Point lookup failed for ${lat}, ${lon}`
  )

  const hourlyUrl = point?.properties?.forecastHourly
  const forecastUrl = point?.properties?.forecast

  if (!hourlyUrl || !forecastUrl) {
    throw new Error("Missing NWS forecast URLs for this point.")
  }

  const [hourly, daily] = await Promise.all([
    fetchJson(
      `${API_BASE}/api/nws/forecast?url=${encodeURIComponent(hourlyUrl)}`,
      "Hourly forecast fetch failed."
    ),
    fetchJson(
      `${API_BASE}/api/nws/forecast?url=${encodeURIComponent(forecastUrl)}`,
      "Daily forecast fetch failed."
    ),
  ])

  const h0 = hourly?.properties?.periods?.[0]
  const d0 = daily?.properties?.periods?.[0]

  return {
    tempF: h0?.temperature,
    wind: h0?.windSpeed,
    windMph: parseInt((h0?.windSpeed || "0").match(/\d+/)?.[0] || "0", 10),
    shortForecast: d0?.shortForecast || h0?.shortForecast || "",
    detailedForecast: d0?.detailedForecast || "",
    updated: hourly?.properties?.updated || null,
  }
}

async function fetchNwsSnow(lat, lon) {
  return fetchJson(
    `${API_BASE}/api/nws/snow?lat=${lat}&lon=${lon}`,
    `Snow forecast fetch failed for ${lat}, ${lon}`
  )
}

async function fetchResortSnow(resortKey) {
  return fetchJson(
    `${API_BASE}/api/resort-snow?resort=${encodeURIComponent(resortKey)}`,
    `Resort snow fetch failed for ${resortKey}`
  )
}

async function fetchDriveRisk(resortKey) {
  return fetchJson(
    `${API_BASE}/api/drive-risk?resort=${encodeURIComponent(resortKey)}`,
    `Drive risk fetch failed for ${resortKey}`
  )
}

async function fetchResortConditions(resortKey) {
  return fetchJson(
    `${API_BASE}/api/resort-conditions?resort=${encodeURIComponent(resortKey)}`,
    `Resort conditions fetch failed for ${resortKey}`
  )
}

function AuthGate({ icon, title, desc, onSignIn, onSignUp }) {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: 360, padding: "40px 20px" }}>
      <div style={{ textAlign: "center", maxWidth: 320, display: "grid", gap: 16, justifyItems: "center" }}>
        <div style={{ fontSize: 48 }}>{icon}</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "white", letterSpacing: -0.4 }}>{title}</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.48)", lineHeight: 1.6 }}>{desc}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={onSignUp} style={{ background: "var(--gradient-primary)", color: "white", border: "none", borderRadius: 12, padding: "12px 22px", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>
            Create Free Account
          </button>
          <button onClick={onSignIn} style={{ background: "rgba(255,255,255,0.07)", color: "white", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Sign In
          </button>
        </div>
      </div>
    </div>
  )
}

const BOTTOM_TABS = [
  { key: "today", label: "Today" },
  { key: "plans", label: "Plans" },
  { key: "track", label: "Track" },
  { key: "crew",  label: "Crew" },
  { key: "me",    label: "Me" },
]

const TOP_TABS = BOTTOM_TABS

function ProfileAvatar({ profile, size, isActive }) {
  const name = profile?.full_name || profile?.username || "U"
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
  const border = `2px solid ${isActive ? "var(--color-accent)" : "rgba(255,255,255,0.22)"}`
  const shadow = isActive ? "0 0 8px rgba(56,189,248,0.4)" : "none"
  return profile?.avatar_url ? (
    <img src={profile.avatar_url} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border, boxShadow: shadow, flexShrink: 0 }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg,rgba(2,132,199,0.8),rgba(56,189,248,0.7))", border, boxShadow: shadow, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: size * 0.38, color: "white" }}>
      {initials}
    </div>
  )
}

function BottomNav({ activeTab, onTabChange, currentProfile, notifCount }) {
  return (
    <nav className="bottom-nav">
      {BOTTOM_TABS.map(({ key, label }) => {
        const isActive = activeTab === key
        const isProfile = key === "me"
        const isSocial = key === "crew"
        const Icon = NAV_ICONS[key]
        return (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 2px",
              color: isActive ? "var(--color-accent)" : "rgba(255,255,255,0.42)",
              transition: "color 0.15s ease",
              minWidth: 0,
              position: "relative",
            }}
          >
            {isProfile && currentProfile ? (
              // The badge rides the avatar too, not just the Social icon. On a phone the
              // profile is the thing people look at for "is anything waiting for me", and a
              // count that only appears on one tab is easy to walk past.
              <span style={{ position: "relative", lineHeight: 1, display: "flex" }}>
                <ProfileAvatar profile={currentProfile} size={26} isActive={isActive} />
                {notifCount > 0 && (
                  <span style={{ position: "absolute", top: -3, right: -5, minWidth: 16, height: 16, borderRadius: 999, background: "var(--gradient-danger)", color: "white", fontSize: 9, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: "1.5px solid rgba(4,8,15,1)", lineHeight: 1 }}>
                    {notifCount > 9 ? "9+" : notifCount}
                  </span>
                )}
              </span>
            ) : (
              <span style={{ position: "relative", lineHeight: 1, display: "flex", filter: isActive ? "drop-shadow(0 0 6px rgba(96,165,250,0.6))" : "none", transition: "filter 0.15s ease" }}>
                <Icon size={22} />
                {isSocial && notifCount > 0 && (
                  <span style={{ position: "absolute", top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 999, background: "var(--gradient-danger)", color: "white", fontSize: 9, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: "1.5px solid rgba(4,8,15,1)", lineHeight: 1 }}>
                    {notifCount > 9 ? "9+" : notifCount}
                  </span>
                )}
              </span>
            )}
            <span style={{
              fontSize: 10,
              fontWeight: isActive ? 800 : 500,
              letterSpacing: 0.2,
              lineHeight: 1,
            }}>
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

// A short, honest condition label for the Today header. Only claims "Powder day" when
// there's real fresh snow behind it — an empty/undefined topResort or a dry day just
// shows the date with no dash-clause, rather than guessing.
function todayConditionLabel(topResort) {
  if (!topResort) return ""
  if ((topResort.snowPrev24in ?? 0) >= 6) return "❄️ Powder day"
  if ((topResort.snowPrev24in ?? 0) > 0) return "🌨️ Fresh snow"
  return ""
}

function TopNav({ activeTab, onTabChange, currentProfile, notifCount, currentUser, onOpenTrip, onOpenPlan }) {
  return (
    <nav className="top-nav">
      <div className="top-nav-inner">
        {/* Branding */}
        <img
          src="/powdays-logo-banner.png"
          alt="PowDays"
          style={{ height: 28, width: "auto", flexShrink: 0, display: "block" }}
        />

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4 }}>
          {TOP_TABS.map(({ key, label }) => {
            const isActive = activeTab === key
            const isProfile = key === "me"
            const isSocial = key === "crew"
            const Icon = NAV_ICONS[key]
            return (
              <button
                key={key}
                onClick={() => onTabChange(key)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 10, border: "none",
                  background: isActive ? "rgba(56,189,248,0.15)" : "transparent",
                  color: isActive ? "var(--color-accent)" : "rgba(255,255,255,0.55)",
                  fontWeight: isActive ? 800 : 500,
                  fontSize: 13, cursor: "pointer",
                  transition: "all 0.15s",
                  position: "relative",
                }}
              >
                {isProfile && currentProfile ? (
                  <ProfileAvatar profile={currentProfile} size={20} isActive={isActive} />
                ) : (
                  <span style={{ position: "relative", display: "flex", lineHeight: 1 }}>
                    <Icon size={16} />
                    {isSocial && notifCount > 0 && (
                      <span style={{ position: "absolute", top: -4, right: -6, minWidth: 14, height: 14, borderRadius: 999, background: "var(--gradient-danger)", color: "white", fontSize: 8, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 2px", border: "1.5px solid rgba(4,8,15,1)", lineHeight: 1 }}>
                        {notifCount > 9 ? "9+" : notifCount}
                      </span>
                    )}
                  </span>
                )}
                {label}
                {isActive && (
                  <div style={{
                    position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)",
                    width: 4, height: 4, borderRadius: "50%",
                    background: "var(--color-accent)", boxShadow: "0 0 6px var(--color-accent)",
                  }} />
                )}
              </button>
            )
          })}

          {/* The bell, in the nav itself. It used to live only inside the Social tab, which
              meant you had to already be where the notifications point you in order to find
              out you had any. Sits next to the tabs so the unread count is visible from every
              screen. */}
          {currentUser && (
            <div style={{ display: "flex", alignItems: "center", marginLeft: 4 }}>
              <NotificationBell
                currentUser={currentUser}
                onOpenTrip={onOpenTrip}
                onOpenPlan={onOpenPlan}
                onTabChange={onTabChange}
                variant="icon"
              />
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}

// Mobile-only equivalent of TopNav's branding — BottomNav already owns tab
// switching on mobile, so this is just the logo, not a full nav bar.
function MobileTopBar() {
  return (
    <div className="mobile-top-bar">
      <img
        src="/powdays-logo-mobile.png"
        alt="PowDays"
        style={{ height: 36, width: "auto", display: "block" }}
      />
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active
          ? "var(--gradient-primary)"
          : "rgba(255,255,255,0.06)",
        color: "white",
        border: "1px solid rgba(255,255,255,0.12)",
        padding: "10px 14px",
        borderRadius: 14,
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  )
}


export default function App() {
  const isMobile = useMobile()
  const [activeTab, setActiveTab] = useState("today")
  // Read-only mirror of TodayScreen's own conditionsSubTab state (reported up via
  // onSubTabChange). TodayScreen owns the real state; App.jsx only needs to know its
  // current value so the header's Refresh button + description can stay inline with
  // the title, exactly where they rendered before Task 2 moved the sub-tab switcher
  // into TodayScreen.
  const [todaySubTab, setTodaySubTab] = useState("conditions")
  const [mountainPageResortKey, setMountainPageResortKey] = useState(null)
  // Full-page read-only view of another user's profile (Sprint 34). Same
  // takeover pattern as mountainPageResortKey; cleared in handleTabChange.
  const [viewingProfileId, setViewingProfileId] = useState(null)
  const [passFilter, setPassFilter] = useState("All")
  const [query, setQuery] = useState("")
  const [sortBy, setSortBy] = useState("Powder Score")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [live, setLive] = useState({})
  const [skierCounts, setSkierCounts] = useState({})
  const [skierDetails, setSkierDetails] = useState({})
  const [resortActivityCounts, setResortActivityCounts] = useState({}) // { [resortKey]: count }
  const [friendTripsByResort, setFriendTripsByResort] = useState({})
  const [myTodayPlan, setMyTodayPlan] = useState(null)
  const [savingTodayPlan, setSavingTodayPlan] = useState(false)
  const [todayPlanError, setTodayPlanError] = useState(null)
  const [friendIds, setFriendIds] = useState([]) // accepted friends' user IDs — live map pins (S28)
  const [vibeData, setVibeData] = useState({ checkinCounts: {}, rsvpCounts: {} })
  const [currentUser, setCurrentUser] = useState(null)
  const [currentProfile, setCurrentProfile] = useState(null)
  const notifCount = useNotificationCount(currentUser)
  const [authModalMode, setAuthModalMode] = useState(null)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)
  const [deepLinkTrip, setDeepLinkTrip] = useState(null)
  // Set when a notification points at a specific ski day, so the Plans calendar opens
  // there instead of on the current week.
  const [planFocusDate, setPlanFocusDate] = useState(null)

  /**
   * Notification → the thing that caused it.
   *
   * Trips reuse the deep-link modal that already existed for ?trip= links, so a notification
   * and a shared URL land in exactly the same place.
   */
  async function handleOpenTripById(tripId) {
    if (!tripId) return
    try {
      setDeepLinkTrip(await getTripDetail(tripId))
    } catch (e) {
      // Most likely cause after migrations 040/042: you can no longer see that trip. Say so
      // rather than opening an empty modal.
      console.error("[App] couldn't open trip from notification:", e)
      setActiveTab("plans")
    }
  }

  /** A plan-party notification carries a date key, not a trip — open the Plans calendar. */
  function handleOpenPlanDate(dateKey) {
    setActiveTab("plans")
    if (dateKey) setPlanFocusDate(dateKey)
  }
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [pendingInviteId, setPendingInviteId] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [browseModeOverride, setBrowseModeOverride] = useState(false)

  const [activeSession, setActiveSession] = useState(null)
  // activeSession shape: { id: string, resortName: string, startedAt: number } | null

  const [recapData, setRecapData] = useState(null)
  // recapData shape: { session, runs } | null — returned by flushSessionToSupabase

  const tracker = useGpsTracker()

  async function handleSessionStart(resortName) {
    // Writes ski_sessions.session_date. A UTC key would log an evening session as
    // tomorrow — night skiing starts after the UTC rollover in Mountain Time.
    const today = localDateKey()
    // Create the ski_sessions row before starting GPS (we need the ID)
    const session = await logSkiDay({ resortName, sessionDate: today })
    tracker.startTracking()
    setActiveSession({ id: session.id, resortName, startedAt: Date.now() })
  }

  async function handleSessionEnd(finalSegments) {
    if (!activeSession) return
    try {
      const result = await flushSessionToSupabase({
        sessionId:    activeSession.id,
        rawSegments:  finalSegments,
        startedAt:    new Date(activeSession.startedAt).toISOString(),
        endedAt:      new Date().toISOString(),
      })
      setRecapData(result)

      // The GPS flow's genuine completion point — the counterpart to
      // LogDayModal's post for retroactively logged days. Only runs on a
      // successful flush (a throw above skips it), and only once per session:
      // this handler is entered once per "end session" tap and bails early if
      // there's no activeSession, and logActivityOnce dedupes by subject_id as
      // a backstop.
      if (result?.session?.id) {
        await logActivityOnce("ski_session", {
          subjectId:   result.session.id,
          subjectType: "ski_sessions",
          metadata:    {
            resort_name:   result.session.resort_name,
            is_powder_day: result.session.is_powder_day,
          },
        })
      }
    } catch (err) {
      console.error("Session flush failed:", err)
      // Still clear the active session even on error
    }
    setActiveSession(null)
  }

  async function refresh() {
    setLoading(true)
    setError("")

    try {
      const entries = await Promise.all(
        RESORTS.map(async (r) => {
          const [wxRes, nwsSnowRes, resortSnowRes, driveRes, conditionsRes] = await Promise.allSettled([
            fetchNwsNowish(r.lat, r.lon),
            fetchNwsSnow(r.lat, r.lon),
            fetchResortSnow(r.resortKey),
            fetchDriveRisk(r.resortKey),
            fetchResortConditions(r.resortKey),
          ])

          const wx         = wxRes.status         === "fulfilled" ? wxRes.value         : {}
          const nwsSnow    = nwsSnowRes.status    === "fulfilled" ? nwsSnowRes.value    : {}
          const resortSnow = resortSnowRes.status === "fulfilled" ? resortSnowRes.value : {}
          const driveRisk  = driveRes.status      === "fulfilled"
            ? driveRes.value
            : { risk: "Unknown", penalty: 0, alertCount: 0, alerts: [] }
          const cond = conditionsRes.status === "fulfilled" ? conditionsRes.value : {}

          // Resort-reported depth/lifts/runs take priority over satellite estimates
          const baseDepth   = cond.baseDepth    ?? resortSnow.baseDepth   ?? null
          const summitDepth = cond.summitDepth  ?? resortSnow.summitDepth ?? null
          const liftsOpen   = cond.liftsOpen    ?? resortSnow.liftsOpen   ?? null
          const liftsTotal  = cond.liftsTotal   ?? resortSnow.liftsTotal  ?? null
          const runsOpen    = cond.runsOpen     ?? resortSnow.runsOpen    ?? null
          const runsTotal   = cond.runsTotal    ?? resortSnow.runsTotal   ?? null
          // Resort-measured 24/48h snowfall is more accurate than modeled when available
          const snowPrev24in = cond.snowLast24in ?? resortSnow.snowPrev24in ?? null
          const snowPrev48in = cond.snowLast48in ?? resortSnow.snowPrev48in ?? null
          // Live isOpen from conditions API overrides the hardcoded value
          const isOpen = cond.isOpen != null ? cond.isOpen : r.isOpen

          const rawPowderScore = computeRawPowderScore({
            tempF: wx.tempF,
            windMph: wx.windMph,
            forecastText: wx.shortForecast,
            snowPrev24in,
            snowPrev48in,
            snow24in: nwsSnow.snow24in,
            snow48in: nwsSnow.snow48in,
            baseDepth,
            liftsOpen,
            liftsTotal,
            runsOpen,
            runsTotal,
            drivePenalty: driveRisk.penalty,
          })

          return [
            r.name,
            {
              ...wx,
              ...r,
              isOpen,
              snowPrev24in,
              snowPrev48in,
              snow24in: nwsSnow.snow24in,
              snow48in: nwsSnow.snow48in,
              dailySnow: nwsSnow.dailySnow ?? [],
              baseDepth,
              summitDepth,
              liftsOpen,
              liftsTotal,
              runsOpen,
              runsTotal,
              conditionsSource: cond.source ?? null,
              observedUpdated: cond.fetchedAt ?? resortSnow.updatedLabel ?? resortSnow.fetchedAt,
              forecastUpdated: nwsSnow.updated || wx.updated,
              rawPowderScore,
              driveRisk: driveRisk.risk,
              drivePenalty: driveRisk.penalty,
              driveAlertCount: driveRisk.alertCount,
              driveAlerts: driveRisk.alerts,
            },
          ]
        })
      )

      const merged = Object.fromEntries(entries)
      const normalizedRows = normalizePowderScores(
        RESORTS.map((r) => ({
          ...r,
          ...(merged[r.name] || {}),
        }))
      )

      setLive(Object.fromEntries(normalizedRows.map((r) => [r.name, r])))
    } catch (e) {
      setError(e?.message || "Failed to fetch live data.")
    } finally {
      setLoading(false)
    }
  }

  async function loadSkierIntel() {
    try {
      const today = localDateKey()

      const [counts, details] = await Promise.all([
        getResortSkierCounts(today),
        getResortSkierDetails(today),
      ])

      setSkierCounts(counts || {})
      setSkierDetails(details || {})
    } catch (err) {
      console.warn("Skier intel refresh failed:", err)
    }
  }

  async function loadHeaderUser() {
    try {
      const user = await getCurrentUser()
      setCurrentUser(user)

      if (!user) {
        setCurrentProfile(null)
        return
      }

      const profile = await getMyProfile().catch(() => null)
      setCurrentProfile(profile || null)

      document.documentElement.setAttribute("data-theme", profile?.theme || "blizzard")
      try { localStorage.setItem("pd_theme", profile?.theme || "blizzard") } catch {}

      // Show onboarding for new users who haven't completed it and have no profile
      if (!profile && !localStorage.getItem("skicrew_onboarded") && !localStorage.getItem("powderdays_onboarded")) {
        setShowOnboarding(true)
      }
    } catch (err) {
      console.warn("Header profile load failed:", err)
      setCurrentUser(null)
      setCurrentProfile(null)
    } finally {
      setAuthReady(true)
    }
  }

  function openAuthModal(mode) {
    setAuthModalMode(mode)

  }

  function closeAuthModal() {
    setAuthModalMode(null)
  }

  async function handleAuthSuccess() {
    setBrowseModeOverride(false)
    await loadHeaderUser()
    setAuthModalMode(null)

    // If user arrived via an invite link, open that trip automatically
    const storedId = sessionStorage.getItem("pending_invite_trip")
    if (storedId) {
      sessionStorage.removeItem("pending_invite_trip")
      setPendingInviteId(null)
      try {
        const trip = await getTripDetail(storedId)
        setDeepLinkTrip(trip)
        setActiveTab("plans")
      } catch {
        // trip may not exist or user isn't invited — silently ignore
      }
    }
  }

  function handleOnboardingComplete() {
    setShowOnboarding(false)
    loadHeaderUser()
    setActiveTab("plans")
  }

  async function handlePasswordResetSuccess() {
    await loadHeaderUser()
    setIsRecoveryMode(false)
    setAuthModalMode(null)
  }

  async function handleLogOut() {
    try {
      await logOut()
  
      setCurrentUser(null)
      setCurrentProfile(null)
      setActiveTab("today")
    } catch (err) {
      console.error("Logout failed:", err)
      alert(err.message || "Failed to log out.")
    }
  }

  function requireLogin(mode = "login") {
    openAuthModal(mode)
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 10 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    loadSkierIntel()

    const t = setInterval(loadSkierIntel, 15 * 1000)

    function handleFocus() {
      loadSkierIntel()
    }

    window.addEventListener("focus", handleFocus)

    return () => {
      clearInterval(t)
      window.removeEventListener("focus", handleFocus)
    }
  }, [])

  // Community activity signal — aggregate ski_sessions across all users, not friends-scoped
  useEffect(() => {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    getResortActivityCounts(localDateKey(weekAgo))
      .then((rows) => {
        // ski_sessions.resort_name holds display names ("Beaver Creek") for
        // real logged sessions but raw resort keys ("beavercreek") for
        // trip-derived rows, so both shapes are folded onto the resortKey the
        // read side uses. Counts accumulate: the two forms are one resort.
        const map = {}
        for (const row of rows) {
          const key = normalizeResortKey(row.resort_name)
          if (!key) continue
          map[key] = (map[key] || 0) + Number(row.session_count || 0)
        }
        setResortActivityCounts(map)
      })
      .catch(() => setResortActivityCounts({}))
  }, [])

  // Vibe Score signal — community-wide check-ins + upcoming RSVPs, not friend-scoped
  useEffect(() => {
    getResortVibeData()
      .then(setVibeData)
      .catch(() => setVibeData({ checkinCounts: {}, rsvpCounts: {} }))
  }, [])

  useEffect(() => {
  loadHeaderUser()

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event) => {
    loadHeaderUser()

    if (event === "PASSWORD_RECOVERY") {
      setIsRecoveryMode(true)
      setAuthModalMode("reset")
    }

    if (event === "USER_UPDATED" || event === "SIGNED_IN" || event === "INITIAL_SESSION") {
      syncVerificationFromAuth().catch((err) =>
        console.error("Verification sync failed:", err?.message)
      )
    }
  })

  return () => subscription.unsubscribe()
}, [])

  useEffect(() => {
    if (!currentUser) { setFriendTripsByResort({}); return }
    let cancelled = false
    getFriendUpcomingTripsByResort()
      .then((map) => { if (!cancelled) setFriendTripsByResort(map) })
      .catch(() => { if (!cancelled) setFriendTripsByResort({}) })
    return () => { cancelled = true }
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) { setMyTodayPlan(null); return }
    let cancelled = false
    getMyDailyPlan(localDateKey())
      .then((plan) => { if (!cancelled) setMyTodayPlan(plan) })
      .catch(() => { if (!cancelled) setMyTodayPlan(null) })
    return () => { cancelled = true }
  }, [currentUser])

  // Accepted friends' IDs — feeds useLiveFriendLocations for the map's live
  // pins (S28-T3) and Home's "N friends on mountain now" count (S28-T4).
  useEffect(() => {
    if (!currentUser) { setFriendIds([]); return }
    let cancelled = false
    getAcceptedFriends()
      .then((friends) => { if (!cancelled) setFriendIds((friends || []).map((f) => f.id)) })
      .catch(() => { if (!cancelled) setFriendIds([]) })
    return () => { cancelled = true }
  }, [currentUser])

  // Deep-link: ?trip=<id> → capture invite ID; resolve after auth check completes
  useEffect(() => {
    const tripId =
      new URLSearchParams(window.location.search).get("trip") ||
      sessionStorage.getItem("pending_invite_trip")
    if (!tripId) return
    window.history.replaceState({}, "", window.location.pathname)
    setPendingInviteId(tripId)
    sessionStorage.setItem("pending_invite_trip", tripId)
  }, [])

  // Deep-link: Strava OAuth redirects back to `/?strava_connected=true` or
  // `?strava_error=...` (this app has no client-side router, so the backend
  // redirects to root). Jump straight to Me — where StravaConnect renders —
  // so the params are visible and StravaConnect's own effect can read/clear
  // them and show the toast. This effect only switches tabs, it doesn't touch
  // the query string itself.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("strava_connected") || params.get("strava_error")) {
      setActiveTab("me")
    }
  }, [])

  // Once we know the auth state, handle the pending invite
  useEffect(() => {
    if (!authReady || !pendingInviteId) return
    if (!currentUser) return // invite overlay will prompt login
    // Logged in — fetch and open the trip
    getTripDetail(pendingInviteId)
      .then((trip) => {
        setDeepLinkTrip(trip)
        setActiveTab("plans")
        setPendingInviteId(null)
        sessionStorage.removeItem("pending_invite_trip")
      })
      .catch(() => {
        setPendingInviteId(null)
        sessionStorage.removeItem("pending_invite_trip")
      })
  }, [authReady, currentUser, pendingInviteId])

  const visibleResorts = useMemo(() => {
    return RESORTS.filter((r) => {
      const passOk = passFilter === "All" || r.pass === passFilter
      const qOk = r.name.toLowerCase().includes(query.toLowerCase())
      return passOk && qOk
    }).map((r) => ({
      ...r,
      ...(live[r.name] || {}),
    }))
  }, [live, passFilter, query])

  const rows = useMemo(() => {
    const merged = [...visibleResorts]

    if (sortBy === "Powder Score") {
      merged.sort((a, b) => (b.powderScore ?? -1) - (a.powderScore ?? -1))
    } else if (sortBy === "Name") {
      merged.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy === "Temp") {
      merged.sort((a, b) => (a.tempF ?? 999) - (b.tempF ?? 999))
    } else if (sortBy === "Snow 24h") {
      merged.sort((a, b) => (b.snowPrev24in ?? -1) - (a.snowPrev24in ?? -1))
    } else if (sortBy === "Travel Risk") {
      const rank = { Low: 0, Moderate: 1, High: 2, Severe: 3, Unknown: 4 }
      merged.sort((a, b) => (rank[a.driveRisk] ?? 99) - (rank[b.driveRisk] ?? 99))
    }

    return merged
  }, [visibleResorts, sortBy])

  const mountainPageResort = mountainPageResortKey === KRAMES_BUTTE_KEY
    ? KRAMES_BUTTE_RESORT
    : rows.find((r) => r.resortKey === mountainPageResortKey) || null

  const handleTabChange = (tab) => {
    setMountainPageResortKey(null)
    // Clear the friend-profile takeover too, or bottom-nav navigation would
    // leave a stale profile mounted over the tab the user just picked.
    setViewingProfileId(null)
    setActiveTab(tab)
  }

  async function handleSaveTodayPlan({ resortKey, eta, visibility }) {
    setSavingTodayPlan(true); setTodayPlanError(null)
    try {
      const existing = await getMyDailyPlan(localDateKey())
      const saved = await upsertDailyPlan(buildPlanUpsert(existing, {
        skiDate: localDateKey(),
        resortKey,
        visibility,
        eta, // already snapped by PlanEditorModal
      }))
      setMyTodayPlan(saved)
      return true
    } catch (err) {
      setTodayPlanError(err?.message || "Couldn't save that plan. Try again.")
      return false
    } finally {
      setSavingTodayPlan(false)
    }
  }

  const rankedResorts = useMemo(
    () =>
      [...rows]
        .filter((r) => r.powderScore != null && r.isOpen !== false)
        .sort((a, b) => b.powderScore - a.powderScore),
    [rows]
  )

  const topResort = rankedResorts[0]

  // Show landing page for unauthenticated users (unless they chose to browse)
  const showLandingPage = authReady && !currentUser && !browseModeOverride && !isRecoveryMode

  if (showLandingPage) {
    return (
      <>
        <style>{`body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif; margin: 0; }`}</style>
        {/* Auth modals render on top of landing page */}
        {authModalMode && (
          <div
            onClick={closeAuthModal}
            style={{
              position: "fixed", inset: 0, background: "rgba(4,8,15,0.72)",
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "flex-start", overflowY: "auto",
              padding: "20px 16px max(20px, env(safe-area-inset-bottom)) 16px",
              zIndex: 200,
            }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560 }}>
              <AuthForm
                mode={authModalMode}
                onSuccess={() => { handleAuthSuccess(); setBrowseModeOverride(false) }}
                onPasswordResetSuccess={handlePasswordResetSuccess}
                onCancel={closeAuthModal}
              />
            </div>
          </div>
        )}
        <LandingPage
          onSignIn={() => openAuthModal("login")}
          onSignUp={() => openAuthModal("signup")}
          onBrowse={() => setBrowseModeOverride(true)}
        />
      </>
    )
  }

  return (
    // Provider is deliberately not indented over the tree below — wrapping it
    // this way keeps the Sprint 34 diff to two lines instead of re-indenting
    // ~500 lines of JSX.
    <ProfileNavContext.Provider value={setViewingProfileId}>
    <div
      style={{
        minHeight: "100vh",
        background: "var(--gradient-bg)",
        color: "white",
      }}
    >
      <SnowfallBackground />
      <style>{`
        body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif; }
        @keyframes floaty {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-4px) scale(1.03); }
        }
        .bottom-nav button { position: relative; }
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track { will-change: transform; }
        .conv-row:hover { background: rgba(255,255,255,0.04) !important; }
      `}</style>

{isRecoveryMode ? (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(4,8,15,0.88)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      overflowY: "auto",
      padding: "20px 16px max(20px, env(safe-area-inset-bottom)) 16px",
      zIndex: 210,
    }}
  >
    <div
      style={{
        width: "100%",
        maxWidth: 620,
        display: "grid",
        gap: 16,
        justifyItems: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20,
          padding: 18,
          color: "white",
          boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: "1.05rem", marginBottom: 8 }}>
          Finish resetting your password
        </div>
        <div style={{ color: "rgba(255,255,255,0.74)", lineHeight: 1.5, fontSize: 14 }}>
          You’re temporarily signed in through a recovery link. Set your new password below to unlock the app.
        </div>
      </div>

      <AuthForm
        mode="reset"
        onPasswordResetSuccess={handlePasswordResetSuccess}
      />
    </div>
  </div>
) : authModalMode ? (
  <div
    onClick={closeAuthModal}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(4,8,15,0.72)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      overflowY: "auto",
      padding: "20px 16px max(20px, env(safe-area-inset-bottom)) 16px",
      zIndex: 200,
    }}
  >
    <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560 }}>
      <AuthForm
        mode={authModalMode}
        onSuccess={handleAuthSuccess}
        onPasswordResetSuccess={handlePasswordResetSuccess}
        onCancel={closeAuthModal}
      />
    </div>
  </div>
) : null}

      {/* Onboarding flow for new users */}
      {showOnboarding && (
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      )}

      {/* Deep-link trip modal (opened via ?trip= URL param or notification click) */}
      {deepLinkTrip && (
        <TripDetailModal
          trip={deepLinkTrip}
          currentUser={currentUser}
          onClose={() => setDeepLinkTrip(null)}
          onUpdate={() => {}}
        />
      )}

      {/* Invite landing — shown when an unauthenticated user opens a ?trip= link */}
      {pendingInviteId && !currentUser && authReady && !authModalMode && !isRecoveryMode && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 190,
          background: "linear-gradient(170deg,rgba(4,8,15,0.98) 0%,rgba(4,8,15,1) 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 20px max(24px,env(safe-area-inset-bottom)) 20px",
        }}>
          <div style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
            <div style={{ fontSize: 64, marginBottom: 18 }}>🎿</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "white", lineHeight: 1.15, marginBottom: 12 }}>
              You're invited to a ski trip!
            </div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,0.58)", marginBottom: 36, lineHeight: 1.6 }}>
              Sign in or create a free account to view the details, RSVP, and join the crew.
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <button
                onClick={() => openAuthModal("login")}
                style={{ padding: "14px 20px", borderRadius: 14, background: "var(--gradient-primary)", border: "none", color: "white", fontWeight: 800, fontSize: 16, cursor: "pointer", boxShadow: "0 4px 20px rgba(56,189,248,0.3)" }}
              >
                Sign In
              </button>
              <button
                onClick={() => openAuthModal("signup")}
                style={{ padding: "14px 20px", borderRadius: 14, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "white", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
              >
                Create Free Account
              </button>
              <button
                onClick={() => { setPendingInviteId(null); sessionStorage.removeItem("pending_invite_trip") }}
                style={{ marginTop: 6, background: "none", border: "none", color: "rgba(255,255,255,0.32)", fontSize: 13, cursor: "pointer", fontWeight: 600 }}
              >
                Browse without an account
              </button>
            </div>

            <div style={{ marginTop: 40, fontSize: 12, color: "rgba(255,255,255,0.2)", fontWeight: 600, letterSpacing: 0.4 }}>
              ❄️ PowDays — Plan your ski season with your crew
            </div>
          </div>
        </div>
      )}

      {activeSession && (
        <ActiveSessionBar
          activeSession={activeSession}
          tracker={tracker}
          onSessionEnd={handleSessionEnd}
          currentProfile={currentProfile}
        />
      )}

      {recapData && (
        <SessionRecapModal
          session={recapData.session}
          runs={recapData.runs}
          profile={currentProfile}
          onClose={() => setRecapData(null)}
          stravaConnected={!!currentProfile?.strava_athlete_id}
          onPostToStrava={async (sessionId, resortName, sessionDate) => {
            // userId comes from the verified bearer token server-side; sending
            // it in the body would just be an ignored (and spoofable) hint.
            const res = await fetch(`${API_BASE}/api/strava/upload`, {
              method: "POST",
              headers: await authHeaders(),
              body: JSON.stringify({
                sessionId,
                activityName: `${resortName} - ${sessionDate}`,
                activityDate: sessionDate,
              }),
            })
            if (!res.ok) {
              const err = await res.json()
              throw new Error(err.error || "Upload failed")
            }
            return res.json()
          }}
        />
      )}

      <TopNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        currentProfile={currentProfile}
        notifCount={notifCount}
        currentUser={currentUser}
        onOpenTrip={handleOpenTripById}
        onOpenPlan={handleOpenPlanDate}
      />
      <MobileTopBar />
      <BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        currentProfile={currentProfile}
        notifCount={notifCount}
      />

      <div className="mobile-scroll-pad" style={{
        maxWidth: 1320,
        margin: "0 auto",
        paddingTop: isMobile ? "calc(44px + var(--safe-top) + 16px)" : 30,
        paddingLeft: isMobile ? 14 : 20,
        paddingRight: isMobile ? 14 : 20,
        paddingBottom: isMobile ? undefined : 48,
      }}>
        {viewingProfileId ? (
          /* Takes precedence over MountainPage so a profile opened from inside
             a mountain page (e.g. its board) actually renders. */
          <ProfilePage
            userId={viewingProfileId}
            onBack={() => setViewingProfileId(null)}
            onTabChange={handleTabChange}
            resorts={RESORTS}
          />
        ) : mountainPageResortKey ? (
          <MountainPage
            resortKey={mountainPageResortKey}
            resort={mountainPageResort}
            currentUserEmail={currentUser?.email}
            onBack={() => setMountainPageResortKey(null)}
          />
        ) : (
          <>
        {/* Suppressed on Track, which inherited HomeDashboard's own full-bleed
            "Ready to ski?" hero (same /hero-mountain.jpg) — the old `home` tab
            hid this strip for exactly that reason. */}
        {activeTab !== "track" && (
          <HeroBannerStrip photoPath="/hero-mountain.jpg" />
        )}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: activeTab === "today" ? 20 : 16 }}>
          {/* Left: branding */}
          <div>
            {activeTab === "today" ? (
              <div>
                <h1 style={{ margin: 0, fontSize: isMobile ? 24 : 30, fontWeight: 900, letterSpacing: -0.5 }}>
                  Today
                </h1>
                <div style={{ marginTop: 4, fontSize: 14, color: "rgba(255,255,255,0.55)" }}>
                  {formatDate(localDateKey())}
                  {todayConditionLabel(topResort) ? ` · ${todayConditionLabel(topResort)}` : ""}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 18, fontWeight: 900, color: "white", letterSpacing: -0.3 }}>❄️ PowDays</div>
            )}
          </div>

          {/* Right: actions */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Mobile has no bell today — TopNav (which has one) is desktop-only, and the
                always-on MobileTopBar is deliberately logo-only (TASK 21.2). Scope the bell
                to the Today tab specifically so mobile doesn't end up with two bells once
                TopNav is visible again on desktop. */}
            {activeTab === "today" && isMobile && currentUser && (
              <NotificationBell
                currentUser={currentUser}
                onOpenTrip={handleOpenTripById}
                onOpenPlan={handleOpenPlanDate}
                onTabChange={handleTabChange}
                variant="icon"
              />
            )}
            {/* conditionsSubTab itself lives inside TodayScreen now (Task 2) — App.jsx
                only gets a read-only mirror of it (todaySubTab, via onSubTabChange)
                so this button can stay inline with the title, exactly where it was. */}
            {activeTab === "today" && todaySubTab === "conditions" && (
              <button
                onClick={refresh}
                disabled={loading}
                style={{
                  background: loading ? "rgba(255,255,255,0.12)" : "var(--gradient-primary)",
                  color: "white", border: "none", padding: isMobile ? "10px 12px" : "10px 16px",
                  borderRadius: 12, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer",
                  fontSize: 13, boxShadow: "0 6px 20px rgba(56,189,248,0.22)",
                }}
              >
                {loading ? "…" : isMobile ? "⟳" : "Refresh"}
              </button>
            )}
          </div>
        </header>

        {error && (
          <div style={{ background: "rgba(255,0,0,0.12)", border: "1px solid rgba(255,0,0,0.25)", padding: 12, borderRadius: 14, color: "var(--color-danger)", marginBottom: 16 }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {activeTab === "today" && (
          <TodayScreen
            rows={rows}
            passFilter={passFilter}
            setPassFilter={setPassFilter}
            query={query}
            setQuery={setQuery}
            sortBy={sortBy}
            setSortBy={setSortBy}
            skierCounts={skierCounts}
            skierDetails={skierDetails}
            friendIds={friendIds}
            resortActivityCounts={resortActivityCounts}
            friendTripsByResort={friendTripsByResort}
            myTodayPlan={myTodayPlan}
            savingTodayPlan={savingTodayPlan}
            todayPlanError={todayPlanError}
            onSaveTodayPlan={handleSaveTodayPlan}
            onClearTodayPlanError={() => setTodayPlanError(null)}
            vibeData={vibeData}
            loading={loading}
            refresh={refresh}
            currentUser={currentUser}
            topResort={topResort}
            setMountainPageResortKey={setMountainPageResortKey}
            onSubTabChange={setTodaySubTab}
            sessionActive={!!activeSession}
          />
        )}

        {activeTab === "track" && (
          <TrackScreen
            resorts={rows}
            currentUser={currentUser}
            sessionActive={!!activeSession}
            onStartSession={handleSessionStart}
          />
        )}

        {activeTab === "crew" && (
          <div style={{ marginTop: 8 }}>
            {currentUser ? (
              <MessagingCenter />
            ) : (
              <AuthGate onSignIn={() => openAuthModal("login")} onSignUp={() => openAuthModal("signup")}
                icon="💬" title="Your Crew is waiting" desc="Sign in to chat with your crew, add friends, and coordinate the season." />
            )}
          </div>
        )}

        {activeTab === "me" && (
          <div style={{ marginTop: 8 }}>
            {currentUser ? (
              <ProfilePage onLogOut={handleLogOut} onTabChange={setActiveTab} resorts={RESORTS} />
            ) : (
              <div
                style={{
                  display: "grid",
                  placeItems: "center",
                  minHeight: 320,
                }}
              >
                <AuthForm
                  mode="login"
                  onSuccess={handleAuthSuccess}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === "plans" && (
          currentUser ? (
            <SkiPlansPage
              onRequireLogin={requireLogin}
              resorts={RESORTS}
              focusDate={planFocusDate}
              onFocusHandled={() => setPlanFocusDate(null)}
            />
          ) : (
            <AuthGate onSignIn={() => openAuthModal("login")} onSignUp={() => openAuthModal("signup")}
              icon="🎿" title="Plan trips with your crew" desc="Sign in to create trips, invite friends, share rides, and track your whole season." />
          )
        )}
          </>
        )}
      </div>
    </div>
    </ProfileNavContext.Provider>
  )
}