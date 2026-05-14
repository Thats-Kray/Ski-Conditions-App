import { useEffect, useState, useRef } from "react"
import { useMobile } from "../lib/useMobile"
import {
  getTripDetail,
  rsvpWithMessage,
  cancelTripRsvp,
  addTripComment,
  addTripUpdate,
  deleteTripUpdate,
  deleteTrip,
  updateTripMeta,
  inviteFriendsToTrip,
  inviteByEmailToTrip,
  removeTripInvite,
  createTripPoll,
  voteOnPoll,
  deleteTripPoll,
  getAcceptedFriends,
  addCarpool,
  removeCarpool,
  claimSeat,
  releaseSeat,
  updateRideStatus,
  submitTripRecap,
  getTripRecaps,
  uploadTripMedia,
  getTripMedia,
  deleteTripMedia,
} from "../lib/socialApi"

// ── Constants ──────────────────────────────────────────────────────────────

const RESORT_NAMES = {
  vail: "Vail", beavercreek: "Beaver Creek", breckenridge: "Breckenridge",
  keystone: "Keystone", crestedbutte: "Crested Butte", telluride: "Telluride",
  winterpark: "Winter Park", coppermountain: "Copper Mountain",
  arapahoebasin: "Arapahoe Basin", steamboat: "Steamboat", eldora: "Eldora",
  aspensnowmass: "Aspen Snowmass",
}

const RESORT_PHOTOS = {
  vail: "/resorts/vail.jpg", beavercreek: "/resorts/beaver-creek.jpg",
  breckenridge: "/resorts/breckenridge.jpg", keystone: "/resorts/keystone.jpg",
  crestedbutte: "/resorts/crested-butte.jpg", telluride: "/resorts/telluride.jpg",
  winterpark: "/resorts/winter-park.jpg", coppermountain: "/resorts/copper-mountain.jpg",
  arapahoebasin: "/resorts/arapahoe-basin.jpg", steamboat: "/resorts/steamboat.jpg",
  eldora: "/resorts/eldora.jpg", aspensnowmass: "/resorts/aspen-snowmass.jpg",
}

const RESORT_ACCENTS = {
  vail: "#60a5fa", beavercreek: "#fbbf24", breckenridge: "#34d399",
  keystone: "#818cf8", crestedbutte: "#c084fc", telluride: "#fb7185",
  winterpark: "#fb923c", coppermountain: "#f97316", arapahoebasin: "#94a3b8",
  steamboat: "#d97706", eldora: "#2dd4bf", aspensnowmass: "#e2e8f0",
}

const RESORT_COORDS = {
  vail: { lat: 39.6403, lon: -106.3742 },
  beavercreek: { lat: 39.6042, lon: -106.5165 },
  breckenridge: { lat: 39.4817, lon: -106.0384 },
  keystone: { lat: 39.6084, lon: -105.9437 },
  crestedbutte: { lat: 38.8996, lon: -106.9653 },
  telluride: { lat: 37.9363, lon: -107.8466 },
  winterpark: { lat: 39.8863, lon: -105.7626 },
  coppermountain: { lat: 39.5022, lon: -106.1512 },
  arapahoebasin: { lat: 39.6423, lon: -105.8717 },
  steamboat: { lat: 40.4572, lon: -106.8047 },
  eldora: { lat: 39.9372, lon: -105.5842 },
  aspensnowmass: { lat: 39.2097, lon: -106.9499 },
}

const THEMES = {
  default:  { label: "Mountain Blue", overlay: "linear-gradient(to bottom,rgba(2,6,23,0.08) 0%,rgba(2,6,23,0.92) 100%)",                                    snow: false, wind: false, accent: "#60a5fa" },
  blizzard: { label: "Blizzard",      overlay: "linear-gradient(to bottom,rgba(200,225,255,0.2) 0%,rgba(2,6,23,0.92) 100%)",                                snow: true,  wind: false, accent: "#bfdbfe" },
  powder:   { label: "Deep Powder",   overlay: "linear-gradient(to bottom,rgba(29,78,216,0.25) 0%,rgba(2,6,23,0.95) 100%)",                                 snow: true,  wind: false, accent: "#3b82f6" },
  aurora:   { label: "Aurora",        overlay: "linear-gradient(to bottom,rgba(109,40,217,0.22) 0%,rgba(5,150,105,0.14) 55%,rgba(2,6,23,0.92) 100%)",      snow: false, wind: false, accent: "#8b5cf6" },
  sunset:   { label: "Alpine Sunset", overlay: "linear-gradient(to bottom,rgba(234,88,12,0.2) 0%,rgba(239,68,68,0.12) 45%,rgba(2,6,23,0.92) 100%)",        snow: false, wind: false, accent: "#fb923c" },
  sunny:    { label: "Bluebird Day",  overlay: "linear-gradient(to bottom,rgba(251,191,36,0.22) 0%,rgba(56,189,248,0.14) 45%,rgba(2,6,23,0.92) 100%)",     snow: false, wind: false, accent: "#fbbf24" },
  windy:    { label: "Storm Warning", overlay: "linear-gradient(to bottom,rgba(71,85,105,0.38) 0%,rgba(30,41,59,0.28) 50%,rgba(2,6,23,0.95) 100%)",        snow: false, wind: true,  accent: "#94a3b8" },
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8787"

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDateFull(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString([], {
    weekday: "long", month: "long", day: "numeric",
  })
}

function daysUntil(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((new Date(dateStr + "T00:00:00") - today) / 86400000)
  if (diff < 0) return null
  if (diff === 0) return "Today! 🔥"
  if (diff === 1) return "Tomorrow"
  if (diff <= 6) return `In ${diff} days`
  return null
}

function googleCalendarUrl(trip, resortName) {
  const base = "https://calendar.google.com/calendar/render"
  const date = (trip.ski_date || "").replace(/-/g, "")
  const title = encodeURIComponent(trip.title || `${resortName} Powder Day`)
  const details = encodeURIComponent(
    [trip.description, trip.departure_time && `Departure: ${trip.departure_time}`, trip.meeting_spot && `Meet at: ${trip.meeting_spot}`]
      .filter(Boolean).join("\n")
  )
  const loc = encodeURIComponent(resortName + ", Colorado")
  return `${base}?action=TEMPLATE&text=${title}&dates=${date}/${date}&details=${details}&location=${loc}`
}

// ── Small components ─────────────────────────────────────────────────────────

function Avatar({ profile, size = 32 }) {
  const name = profile?.full_name || profile?.username || "?"
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "rgba(255,255,255,0.14)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.4), fontWeight: 800, color: "white", flexShrink: 0,
    }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function GifPreview({ url }) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  if (!url || errored) return null
  return (
    <div style={{ marginTop: 8, borderRadius: 12, overflow: "hidden", maxWidth: 200, display: loaded ? "block" : "none" }}>
      <img src={url} alt="GIF" onLoad={() => setLoaded(true)} onError={() => setErrored(true)} style={{ width: "100%", display: "block" }} />
    </div>
  )
}

function SnowEffect() {
  const flakes = [
    { l: "8%", d: "0s", dur: "5s" }, { l: "22%", d: "1.2s", dur: "4s" },
    { l: "36%", d: "0.4s", dur: "6s" }, { l: "51%", d: "2s", dur: "4.5s" },
    { l: "64%", d: "0.8s", dur: "5.5s" }, { l: "78%", d: "1.6s", dur: "4.2s" },
    { l: "90%", d: "0.2s", dur: "6.5s" }, { l: "14%", d: "3s", dur: "5s" },
    { l: "44%", d: "2.4s", dur: "4.8s" }, { l: "70%", d: "1s", dur: "5.2s" },
  ]
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 2 }}>
      <style>{`@keyframes snowfall{0%{transform:translateY(-20px) rotate(0deg);opacity:.9}100%{transform:translateY(220px) rotate(360deg);opacity:0}}`}</style>
      {flakes.map((f, i) => (
        <div key={i} style={{
          position: "absolute", top: 0, left: f.l, color: "rgba(255,255,255,0.85)",
          fontSize: i % 3 === 0 ? "14px" : i % 3 === 1 ? "10px" : "12px",
          animation: `snowfall ${f.dur} ${f.d} infinite linear`,
        }}>❄</div>
      ))}
    </div>
  )
}

function WindEffect() {
  const streaks = [
    { top: "10%", d: "0s",    dur: "1.8s", w: 80 },  { top: "24%", d: "0.5s",  dur: "2.3s", w: 110 },
    { top: "38%", d: "1.1s",  dur: "1.6s", w: 65 },  { top: "52%", d: "0.3s",  dur: "2.1s", w: 95 },
    { top: "66%", d: "1.4s",  dur: "1.9s", w: 75 },  { top: "80%", d: "0.8s",  dur: "2.4s", w: 120 },
    { top: "17%", d: "1.7s",  dur: "2.0s", w: 55 },  { top: "73%", d: "0.2s",  dur: "1.7s", w: 90 },
  ]
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 2 }}>
      <style>{`@keyframes windstreak{0%{transform:translateX(-140px);opacity:0}15%{opacity:.55}80%{opacity:.35}100%{transform:translateX(700px);opacity:0}}`}</style>
      {streaks.map((s, i) => (
        <div key={i} style={{
          position: "absolute", top: s.top, left: 0,
          width: s.w, height: 1.5,
          background: "linear-gradient(to right,transparent,rgba(255,255,255,0.5),transparent)",
          animation: `windstreak ${s.dur} ${s.d} infinite linear`,
          borderRadius: 2,
        }} />
      ))}
    </div>
  )
}

function autoThemeFromWeather(wx) {
  if (!wx) return null
  const fc = (wx.shortForecast || "").toLowerCase()
  const snow24 = wx.snowPrev24in ?? wx.snow24in ?? 0
  const windMph = parseInt(wx.windSpeed) || 0
  const tempF = wx.tempF ?? 50
  if (fc.includes("blizzard") || snow24 >= 12) return "blizzard"
  if (fc.includes("snow") || fc.includes("flurr") || snow24 >= 1) return "powder"
  if (windMph > 30 && !fc.includes("snow")) return "windy"
  if (tempF >= 40 && (fc.includes("sunny") || fc.includes("clear") || fc.includes("fair"))) return "sunny"
  return null
}

function WeatherSnapshot({ data }) {
  if (!data) return null

  const snowNew = data.snowPrev24in ?? data.snow24in
  const base = data.baseDepth
  const temp = data.tempF
  const forecast = data.shortForecast || ""
  const lifts = data.liftsOpen != null ? `${data.liftsOpen}/${data.liftsTotal} lifts` : null
  const runs = data.runsOpen != null ? `${data.runsOpen}/${data.runsTotal} runs` : null

  // Lightweight powder score estimate (not normalized)
  let powderLabel = null
  let powderColor = "#60a5fa"
  if (snowNew != null) {
    if (snowNew >= 12) { powderLabel = "Elite"; powderColor = "#8ef6d1" }
    else if (snowNew >= 6) { powderLabel = "Very Good"; powderColor = "#9bc6ff" }
    else if (snowNew >= 3) { powderLabel = "Good"; powderColor = "#ffe39a" }
    else if (snowNew >= 1) { powderLabel = "Okay"; powderColor = "#ffc996" }
    else { powderLabel = "Low"; powderColor = "#ff9d9d" }
  }

  const items = [
    temp != null && { icon: "🌡️", label: `${temp}°F` },
    forecast && { icon: "🌤️", label: forecast },
    snowNew != null && { icon: "❄️", label: `${snowNew}"` + (snowNew === data.snowPrev24in ? " fresh" : " forecast") },
    base != null && { icon: "🏔️", label: `${base}" base` },
    lifts && { icon: "🚠", label: lifts },
    runs && { icon: "🎿", label: runs },
  ].filter(Boolean)

  if (!items.length) return null

  return (
    <div style={{
      margin: "14px 0 0",
      background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.18)",
      borderRadius: 14, padding: "12px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.7 }}>
          Current Conditions
        </span>
        {powderLabel && (
          <span style={{ fontSize: 11, fontWeight: 800, color: powderColor, background: `${powderColor}18`, border: `1px solid ${powderColor}44`, borderRadius: 999, padding: "2px 9px" }}>
            {powderLabel} powder
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
        {items.map((item, i) => (
          <span key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", display: "flex", alignItems: "center", gap: 4 }}>
            {item.icon} {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function PollCard({ poll, currentUserId, accent, onVote, onDelete }) {
  const [voting, setVoting] = useState(false)
  const maxVotes = Math.max(...poll.options.map((o) => o.vote_count), 1)

  async function handleVote(optionId) {
    if (voting || poll.my_vote_option_id) return
    setVoting(true)
    try { await onVote(poll.id, optionId) } finally { setVoting(false) }
  }

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "white", lineHeight: 1.4 }}>{poll.question}</div>
        {currentUserId === poll.creator_id && (
          <button onClick={() => onDelete(poll.id)} style={{ background: "none", border: "none", color: "rgba(255,80,80,0.45)", cursor: "pointer", fontSize: 11, flexShrink: 0, padding: 0 }}>
            Remove
          </button>
        )}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {poll.options.map((opt) => {
          const isMyVote = poll.my_vote_option_id === opt.id
          const pct = poll.total_votes > 0 ? Math.round((opt.vote_count / poll.total_votes) * 100) : 0
          const canVote = !poll.my_vote_option_id && !voting

          return (
            <button
              key={opt.id}
              onClick={() => handleVote(opt.id)}
              disabled={!canVote}
              style={{
                position: "relative", overflow: "hidden",
                background: isMyVote ? `${accent}22` : "rgba(255,255,255,0.04)",
                border: `1px solid ${isMyVote ? accent + "66" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 10, padding: "9px 12px",
                cursor: canVote ? "pointer" : "default",
                textAlign: "left", transition: "all 0.15s ease",
              }}
            >
              {poll.my_vote_option_id && (
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0,
                  width: `${pct}%`, background: isMyVote ? `${accent}28` : "rgba(255,255,255,0.05)",
                  transition: "width 0.4s ease",
                }} />
              )}
              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 13, color: isMyVote ? accent : "rgba(255,255,255,0.78)", fontWeight: isMyVote ? 700 : 400 }}>
                  {isMyVote && "✓ "}{opt.text}
                </span>
                {poll.my_vote_option_id && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", flexShrink: 0 }}>{pct}%</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
      {poll.total_votes > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
          {poll.total_votes} vote{poll.total_votes !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  )
}

function GuestRow({ rsvp, accent }) {
  const name = rsvp.profile?.full_name || rsvp.profile?.username || "Someone"
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <Avatar profile={rsvp.profile} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "white" }}>{name}</span>
          {rsvp.plus_ones > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: accent, background: `${accent}22`, border: `1px solid ${accent}44`, borderRadius: 999, padding: "2px 8px" }}>
              +{rsvp.plus_ones} guest{rsvp.plus_ones > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {rsvp.rsvp_message && (
          <div style={{ marginTop: 5, fontSize: 13, color: "rgba(255,255,255,0.78)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "0 12px 12px 12px", padding: "7px 11px", display: "inline-block", maxWidth: "100%", lineHeight: 1.45 }}>
            {rsvp.rsvp_message}
          </div>
        )}
        {rsvp.rsvp_gif_url && <GifPreview url={rsvp.rsvp_gif_url} />}
      </div>
    </div>
  )
}

// ── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8 }}>
        {children}
      </span>
      {action}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "20px 0 0" }} />
}

// ── Main component ───────────────────────────────────────────────────────────

export default function TripDetailModal({ trip: initialTrip, currentUser, onClose, onUpdate }) {
  const isMobile = useMobile()
  const [trip, setTrip] = useState(null)
  const [loading, setLoading] = useState(true)
  const [myRsvp, setMyRsvp] = useState(null)

  // RSVP flow
  const [pendingStatus, setPendingStatus] = useState(null)
  const [rsvpMessage, setRsvpMessage] = useState("")
  const [rsvpGifUrl, setRsvpGifUrl] = useState("")
  const [rsvpPlusOnes, setRsvpPlusOnes] = useState(0)
  const [rsvpRideStatus, setRsvpRideStatus] = useState(null)
  const [rsvpLoading, setRsvpLoading] = useState(false)

  // Chat
  const [commentInput, setCommentInput] = useState("")
  const [commentLoading, setCommentLoading] = useState(false)
  const chatEndRef = useRef(null)

  // Host updates
  const [showUpdateForm, setShowUpdateForm] = useState(false)
  const [updateInput, setUpdateInput] = useState("")
  const [updateLoading, setUpdateLoading] = useState(false)

  // Spotify
  const [editingSpotify, setEditingSpotify] = useState(false)
  const [spotifyInput, setSpotifyInput] = useState("")

  // Polls
  const [showPollForm, setShowPollForm] = useState(false)
  const [pollQuestion, setPollQuestion] = useState("")
  const [pollOptions, setPollOptions] = useState(["", ""])
  const [pollLoading, setPollLoading] = useState(false)

  // Invites
  const [showInvitePanel, setShowInvitePanel] = useState(false)
  const [inviteTab, setInviteTab] = useState("friends")
  const [friends, setFriends] = useState([])
  const [selectedFriendIds, setSelectedFriendIds] = useState(new Set())
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteEmailName, setInviteEmailName] = useState("")
  const [inviteLoading, setInviteLoading] = useState(false)

  const [deleting, setDeleting] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  // Carpools
  const [showAddCarForm, setShowAddCarForm] = useState(false)
  const [newCarLabel, setNewCarLabel] = useState("")
  const [newCarSeats, setNewCarSeats] = useState(3)
  const [newCarNote, setNewCarNote] = useState("")
  const [carpoolActionLoading, setCarpoolActionLoading] = useState(false)

  // Weather (for auto-theme)
  const [wxData, setWxData] = useState(null)

  // Inline edit
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editMeetingSpot, setEditMeetingSpot] = useState("")
  const [editDepartureTime, setEditDepartureTime] = useState("")
  const [editTheme, setEditTheme] = useState("default")
  const [editSpotify, setEditSpotify] = useState("")
  const [editSaving, setEditSaving] = useState(false)

  const [recaps, setRecaps] = useState([])
  const [myRecap, setMyRecap] = useState(null)
  const [media, setMedia] = useState([])
  const [showRecapForm, setShowRecapForm] = useState(false)
  const [recapRating, setRecapRating] = useState(0)
  const [recapConditions, setRecapConditions] = useState("")
  const [recapHighlight, setRecapHighlight] = useState("")
  const [recapNotes, setRecapNotes] = useState("")
  const [recapSaving, setRecapSaving] = useState(false)
  const [mediaUploading, setMediaUploading] = useState(false)
  const [mediaCaption, setMediaCaption] = useState("")
  const mediaFileRef = useRef(null)

  const resortKey = initialTrip.resort_key
  const accent = RESORT_ACCENTS[resortKey] || "#60a5fa"
  const photo = RESORT_PHOTOS[resortKey]
  const resortName = RESORT_NAMES[resortKey] || resortKey
  const countdown = daysUntil(initialTrip.ski_date)
  const isPast = !countdown && new Date(initialTrip.ski_date + "T00:00:00") < new Date()
  const isHost = currentUser?.id === initialTrip.host_id
  const storedThemeKey = trip?.theme || initialTrip.theme || "default"
  const effectiveThemeKey = storedThemeKey !== "default" ? storedThemeKey : (autoThemeFromWeather(wxData) || "default")
  const theme = THEMES[effectiveThemeKey] || THEMES.default

  useEffect(() => { fetchDetail() }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [trip?.comments?.length])
  useEffect(() => {
    if (!isPast) return
    getTripRecaps(initialTrip.id).then(({ recaps: r, myRecap: m }) => { setRecaps(r); setMyRecap(m) }).catch(() => {})
    getTripMedia(initialTrip.id).then(setMedia).catch(() => {})
  }, [isPast, initialTrip.id])

  useEffect(() => {
    let cancelled = false
    async function fetchWeather() {
      const coords = RESORT_COORDS[resortKey]
      if (!coords) return
      try {
        const [snowR, pointR] = await Promise.allSettled([
          fetch(`${API_BASE}/api/resort-snow?resort=${resortKey}`).then((r) => r.json()),
          fetch(`${API_BASE}/api/nws/point?lat=${coords.lat}&lon=${coords.lon}`).then((r) => r.json()),
        ])
        const snow = snowR.status === "fulfilled" && !snowR.value?.error ? snowR.value : {}
        let wx = {}
        if (pointR.status === "fulfilled" && !pointR.value?.error) {
          const hourlyUrl = pointR.value?.properties?.forecastHourly
          if (hourlyUrl) {
            try {
              const hourly = await fetch(`${API_BASE}/api/nws/forecast?url=${encodeURIComponent(hourlyUrl)}`).then((r) => r.json())
              const h0 = hourly?.properties?.periods?.[0]
              wx = { tempF: h0?.temperature, windSpeed: h0?.windSpeed, shortForecast: h0?.shortForecast || "" }
            } catch {}
          }
        }
        const merged = { ...snow, ...wx }
        if (!cancelled && Object.keys(merged).length) setWxData(merged)
      } catch {}
    }
    fetchWeather()
    return () => { cancelled = true }
  }, [resortKey])

  async function fetchDetail() {
    try {
      const detail = await getTripDetail(initialTrip.id)
      setTrip(detail)
      setMyRsvp(detail.my_rsvp)
      setSpotifyInput(detail.spotify_playlist_url || "")
    } catch (e) {
      console.warn("Detail fetch failed:", e)
      setTrip({ ...initialTrip, updates: [], polls: [], invites: [], my_rsvp: null })
      setMyRsvp(initialTrip.rsvps?.find((r) => r.user_id === currentUser?.id) || null)
      setSpotifyInput(initialTrip.spotify_playlist_url || "")
    } finally {
      setLoading(false)
    }
  }

  async function handleCancelRsvp() {
    setRsvpLoading(true)
    try { await cancelTripRsvp(initialTrip.id); setMyRsvp(null); setPendingStatus(null); await fetchDetail(); onUpdate?.() }
    catch (e) { console.warn(e) }
    finally { setRsvpLoading(false) }
  }

  async function handleConfirmGoingRsvp() {
    setRsvpLoading(true)
    try {
      const data = await rsvpWithMessage(initialTrip.id, "going", { message: rsvpMessage, gifUrl: rsvpGifUrl, plusOnes: rsvpPlusOnes })
      if (rsvpRideStatus) await updateRideStatus(initialTrip.id, rsvpRideStatus)
      setMyRsvp(data); setPendingStatus(null); setRsvpRideStatus(null); await fetchDetail(); onUpdate?.()
    } catch (e) { console.warn(e) }
    finally { setRsvpLoading(false) }
  }

  async function handleQuickRsvp(status) {
    if (myRsvp?.status === status) { await handleCancelRsvp(); return }
    setRsvpLoading(true)
    try {
      const data = await rsvpWithMessage(initialTrip.id, status, {})
      setMyRsvp(data); setPendingStatus(null); await fetchDetail(); onUpdate?.()
    } catch (e) { console.warn(e) }
    finally { setRsvpLoading(false) }
  }

  async function handleComment(e) {
    e.preventDefault()
    if (!commentInput.trim() || commentLoading || !currentUser) return
    const text = commentInput; setCommentInput(""); setCommentLoading(true)
    try { await addTripComment(initialTrip.id, text); await fetchDetail() }
    catch { setCommentInput(text) }
    finally { setCommentLoading(false) }
  }

  async function handlePostUpdate(e) {
    e.preventDefault()
    if (!updateInput.trim() || updateLoading) return
    setUpdateLoading(true)
    try { await addTripUpdate(initialTrip.id, updateInput.trim()); setUpdateInput(""); setShowUpdateForm(false); await fetchDetail() }
    catch (e) { console.warn(e) }
    finally { setUpdateLoading(false) }
  }

  async function handleSaveSpotify() {
    try { await updateTripMeta(initialTrip.id, { spotify_playlist_url: spotifyInput.trim() || null }); setEditingSpotify(false); await fetchDetail() }
    catch (e) { console.warn(e) }
  }

  async function handleDeleteTrip() {
    if (!window.confirm("Cancel this trip for everyone?")) return
    setDeleting(true)
    try { await deleteTrip(initialTrip.id); onUpdate?.(); onClose() }
    catch { setDeleting(false) }
  }

  async function handleCreatePoll(e) {
    e.preventDefault()
    const validOpts = pollOptions.filter((o) => o.trim())
    if (!pollQuestion.trim() || validOpts.length < 2) return
    setPollLoading(true)
    try {
      await createTripPoll(initialTrip.id, { question: pollQuestion.trim(), options: validOpts })
      setPollQuestion(""); setPollOptions(["", ""]); setShowPollForm(false); await fetchDetail()
    } catch (e) { console.warn(e) }
    finally { setPollLoading(false) }
  }

  async function handleVote(pollId, optionId) {
    try { await voteOnPoll(pollId, optionId); await fetchDetail() }
    catch (e) { console.warn(e) }
  }

  async function handleDeletePoll(pollId) {
    try { await deleteTripPoll(pollId); await fetchDetail() }
    catch (e) { console.warn(e) }
  }

  async function handleOpenInvitePanel() {
    if (!showInvitePanel) {
      setShowInvitePanel(true)
      if (!friends.length) {
        try { const f = await getAcceptedFriends(); setFriends(f || []) } catch {}
      }
    } else {
      setShowInvitePanel(false)
    }
  }

  async function handleSendFriendInvites() {
    if (!selectedFriendIds.size) return
    setInviteLoading(true)
    try { await inviteFriendsToTrip(initialTrip.id, [...selectedFriendIds]); setSelectedFriendIds(new Set()); setShowInvitePanel(false); await fetchDetail() }
    catch (e) { console.warn(e) }
    finally { setInviteLoading(false) }
  }

  async function handleSendEmailInvite() {
    if (!inviteEmail.trim()) return
    setInviteLoading(true)
    try { await inviteByEmailToTrip(initialTrip.id, { email: inviteEmail, name: inviteEmailName }); setInviteEmail(""); setInviteEmailName(""); await fetchDetail() }
    catch (e) { console.warn(e) }
    finally { setInviteLoading(false) }
  }

  async function handleRemoveInvite(inviteId) {
    try { await removeTripInvite(inviteId); await fetchDetail() }
    catch (e) { console.warn(e) }
  }

  async function handleSetRideStatus(status) {
    setCarpoolActionLoading(true)
    try { await updateRideStatus(initialTrip.id, status); await fetchDetail() }
    catch (e) { console.warn(e) }
    finally { setCarpoolActionLoading(false) }
  }

  async function handleAddCar() {
    if (!newCarSeats || newCarSeats < 1) return
    setCarpoolActionLoading(true)
    try {
      const rsvpProfile = (trip?.rsvps || []).find((r) => r.user_id === currentUser?.id)?.profile
      const hostProfile = trip?.host_profile || initialTrip.host_profile
      const myProfile = rsvpProfile || (isHost ? hostProfile : null)
      const driverName = myProfile?.full_name || myProfile?.username || currentUser?.email?.split("@")[0] || "Driver"
      await addCarpool(initialTrip.id, { driverName, seatsTotal: newCarSeats, carLabel: newCarLabel.trim() || null, note: newCarNote.trim() || null })
      setShowAddCarForm(false)
      setNewCarLabel("")
      setNewCarSeats(3)
      setNewCarNote("")
      if (isGoing) await updateRideStatus(initialTrip.id, "driving")
      await fetchDetail()
    } catch (e) { console.warn(e) }
    finally { setCarpoolActionLoading(false) }
  }

  async function handleRemoveCar(carpoolId) {
    setCarpoolActionLoading(true)
    try { await removeCarpool(carpoolId); await fetchDetail() }
    catch (e) { console.warn(e) }
    finally { setCarpoolActionLoading(false) }
  }

  async function handleClaimSeat(carpoolId) {
    setCarpoolActionLoading(true)
    try {
      await claimSeat(initialTrip.id, carpoolId)
      await updateRideStatus(initialTrip.id, "have_ride")
      await fetchDetail()
    } catch (e) { console.warn(e) }
    finally { setCarpoolActionLoading(false) }
  }

  async function handleReleaseSeat(carpoolId) {
    setCarpoolActionLoading(true)
    try {
      await releaseSeat(carpoolId)
      await updateRideStatus(initialTrip.id, "need_ride")
      await fetchDetail()
    } catch (e) { console.warn(e) }
    finally { setCarpoolActionLoading(false) }
  }

  function handleOpenEdit() {
    const t = trip || initialTrip
    setEditTitle(t.title || "")
    setEditDescription(t.description || "")
    setEditMeetingSpot(t.meeting_spot || "")
    setEditDepartureTime(t.departure_time || "")
    setEditTheme(t.theme || "default")
    setEditSpotify(t.spotify_playlist_url || "")
    setEditing(true)
  }

  async function handleSaveEdit() {
    setEditSaving(true)
    try {
      await updateTripMeta(initialTrip.id, {
        title: editTitle.trim() || null,
        description: editDescription.trim() || null,
        meeting_spot: editMeetingSpot.trim() || null,
        departure_time: editDepartureTime.trim() || null,
        theme: editTheme,
        spotify_playlist_url: editSpotify.trim() || null,
      })
      setEditing(false)
      await fetchDetail()
      onUpdate?.()
    } catch (e) { console.warn(e) }
    finally { setEditSaving(false) }
  }

  async function handleSubmitRecap(e) {
    e.preventDefault()
    setRecapSaving(true)
    try {
      await submitTripRecap(initialTrip.id, { rating: recapRating || null, conditions: recapConditions || null, highlight: recapHighlight.trim() || null, notes: recapNotes.trim() || null })
      const { recaps: r, myRecap: m } = await getTripRecaps(initialTrip.id)
      setRecaps(r); setMyRecap(m); setShowRecapForm(false)
    } catch (e) { console.warn(e) }
    finally { setRecapSaving(false) }
  }

  async function handleUploadMedia(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setMediaUploading(true)
    try {
      await uploadTripMedia(initialTrip.id, file, mediaCaption.trim() || null)
      const updated = await getTripMedia(initialTrip.id)
      setMedia(updated); setMediaCaption("")
      if (mediaFileRef.current) mediaFileRef.current.value = ""
    } catch (err) { console.warn("Media upload failed:", err) }
    finally { setMediaUploading(false) }
  }

  async function handleDeleteMedia(mediaId, storagePath) {
    try {
      await deleteTripMedia(mediaId, storagePath)
      setMedia((prev) => prev.filter((m) => m.id !== mediaId))
    } catch (e) { console.warn(e) }
  }

  const rsvps = trip?.rsvps || initialTrip.rsvps || []
  const goingRsvps = rsvps.filter((r) => r.status === "going")
  const maybeRsvps = rsvps.filter((r) => r.status === "maybe")
  const cantRsvps = rsvps.filter((r) => r.status === "cantgo")
  const invites = trip?.invites || []
  const comments = trip?.comments || initialTrip.comments || []
  const updates = trip?.updates || []
  const polls = trip?.polls || []
  const carpools = trip?.carpools || []
  const spotifyUrl = trip?.spotify_playlist_url ?? initialTrip.spotify_playlist_url ?? ""
  const goingCount = goingRsvps.reduce((sum, r) => sum + 1 + (r.plus_ones || 0), 0)

  const myRideStatus = myRsvp?.ride_status || null
  const isGoing = myRsvp?.status === "going"
  const myCarpoolSeat = carpools.find((c) => c.riders.some((r) => r.user_id === currentUser?.id))
  const needRideRsvps = goingRsvps.filter((r) => r.ride_status === "need_ride")
  const totalSeatsOffered = carpools.reduce((sum, c) => sum + c.seats_total, 0)
  const totalSeatsTaken = carpools.reduce((sum, c) => sum + c.seats_taken, 0)

  const hostFirstName = (trip?.host_profile || initialTrip.host_profile)?.full_name?.split(" ")[0] || (trip?.host_profile || initialTrip.host_profile)?.username || "Someone"
  const tripTitle = trip?.title || initialTrip.title || (isHost ? "Your Powder Day" : `${hostFirstName}'s Powder Day`)
  const departureTime = trip?.departure_time ?? initialTrip.departure_time
  const meetingSpot = trip?.meeting_spot ?? initialTrip.meeting_spot
  const description = trip?.description ?? initialTrip.description

  const fieldStyle = { background: "rgba(255,255,255,0.07)", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "9px 13px", color: "white", fontSize: 16, outline: "none", fontFamily: "inherit" }
  const chipBtn = (active) => ({ background: active ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)", border: `1px solid ${active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)"}`, borderRadius: 8, padding: "5px 11px", fontSize: 12, fontWeight: 700, color: active ? "white" : "rgba(255,255,255,0.55)", cursor: "pointer" })

  return (
    <div
      onClick={onClose}
      className="modal-sheet-overlay"
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        background: "rgba(2,6,23,0.88)",
        backdropFilter: "blur(14px)",
        display: "flex",
        alignItems: isMobile ? "flex-end" : "flex-start",
        justifyContent: "center",
        padding: isMobile ? "0" : "20px 16px 60px",
        overflowY: isMobile ? "hidden" : "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-sheet"
        style={{
          width: "100%",
          maxWidth: isMobile ? "100%" : 620,
          background: "#08111e",
          border: isMobile ? "none" : "1px solid rgba(255,255,255,0.1)",
          borderRadius: isMobile ? "24px 24px 0 0" : 28,
          overflow: "hidden",
          boxShadow: "0 40px 120px rgba(0,0,0,0.85)",
          marginTop: isMobile ? 0 : 8,
          maxHeight: isMobile ? "94vh" : "none",
          overflowY: isMobile ? "auto" : "visible",
        }}
      >
        {isMobile && <div className="sheet-handle" />}

        {/* ── Hero ── */}
        <div style={{ position: "relative", height: 210, background: photo ? `${theme.overlay}, url(${photo}) center/cover no-repeat` : "linear-gradient(135deg,#1e293b,#0f172a)" }}>
          {theme.snow && <SnowEffect />}
          {theme.wind && <WindEffect />}

          <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, zIndex: 3, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", color: "white", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>

          {countdown && (
            <div style={{ position: "absolute", top: 14, left: 14, zIndex: 3, background: accent, color: "#020617", borderRadius: 999, padding: "5px 13px", fontSize: 12, fontWeight: 900, letterSpacing: 0.3, boxShadow: `0 4px 18px ${accent}77` }}>
              {countdown}
            </div>
          )}

          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 20px 18px", zIndex: 2 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: `${accent}22`, border: `1px solid ${accent}44`, borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 900, color: accent, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
              🏔️ {resortName}
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "white", lineHeight: 1.1, letterSpacing: -0.5 }}>{tripTitle}</div>
            {isHost && <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>You're hosting</div>}
          </div>
        </div>

        {/* ── Event details ── */}
        <div style={{ padding: "18px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 13, color: "rgba(255,255,255,0.72)" }}>
              <span>📅 {formatDateFull(initialTrip.ski_date)}</span>
              {departureTime && <span>🚗 {departureTime}</span>}
              {meetingSpot && <span>📍 {meetingSpot}</span>}
            </div>
            {isHost && !isPast && !editing && (
              <button onClick={handleOpenEdit} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 8, padding: "4px 11px", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.6)", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 4, lineHeight: 1.5 }}>
                ✏️ Edit
              </button>
            )}
          </div>

          {/* ── Inline edit form ── */}
          {editing && (
            <div style={{ marginTop: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: "16px 18px", display: "grid", gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 2 }}>Edit Trip</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 }}>Trip Name</div>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Powder day vibes" maxLength={80} style={{ ...fieldStyle, width: "100%", boxSizing: "border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 }}>Departure</div>
                  <input value={editDepartureTime} onChange={(e) => setEditDepartureTime(e.target.value)} placeholder="7:00 AM" style={{ ...fieldStyle, width: "100%", boxSizing: "border-box" }} />
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 }}>Meet At</div>
                <input value={editMeetingSpot} onChange={(e) => setEditMeetingSpot(e.target.value)} placeholder="Base lodge" maxLength={80} style={{ ...fieldStyle, width: "100%", boxSizing: "border-box" }} />
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 }}>Notes</div>
                <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Fresh pow, no excuses…" maxLength={400} rows={2} style={{ ...fieldStyle, width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.5 }} />
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 5 }}>Spotify Playlist</div>
                <input value={editSpotify} onChange={(e) => setEditSpotify(e.target.value)} placeholder="https://open.spotify.com/playlist/…" type="url" style={{ ...fieldStyle, width: "100%", boxSizing: "border-box" }} />
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Theme</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
                  {Object.entries(THEMES).map(([key, t]) => (
                    <button key={key} type="button" onClick={() => setEditTheme(key)} style={{
                      background: editTheme === key ? `${t.accent}22` : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${editTheme === key ? t.accent : "rgba(255,255,255,0.1)"}`,
                      borderRadius: 10, padding: "8px 4px 6px",
                      cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                      boxShadow: editTheme === key ? `0 0 10px ${t.accent}55` : "none",
                      transition: "all 0.15s ease",
                    }}>
                      <span style={{ fontSize: 16, lineHeight: 1 }}>
                        {key === "default" ? "🏔️" : key === "blizzard" ? "❄️" : key === "powder" ? "🌨️" : key === "aurora" ? "🌌" : key === "sunset" ? "🌅" : key === "sunny" ? "☀️" : "💨"}
                      </span>
                      <span style={{ fontSize: 8, fontWeight: 800, color: editTheme === key ? t.accent : "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.3, lineHeight: 1.2, textAlign: "center" }}>
                        {t.label.split(" ")[0]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button onClick={() => setEditing(false)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 16px", color: "rgba(255,255,255,0.55)", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Cancel</button>
                <button onClick={handleSaveEdit} disabled={editSaving} style={{ background: editSaving ? "rgba(255,255,255,0.07)" : accent, border: "none", borderRadius: 10, padding: "8px 20px", color: editSaving ? "rgba(255,255,255,0.3)" : "#020617", fontWeight: 900, cursor: editSaving ? "wait" : "pointer", fontSize: 13, boxShadow: editSaving ? "none" : `0 4px 16px ${accent}55` }}>
                  {editSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          )}

          {!editing && description && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.55 }}>
              {description}
            </div>
          )}

          {/* Spotify */}
          {!editing && spotifyUrl && !editingSpotify ? (
            <div style={{ marginTop: 12 }}>
              <a href={spotifyUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(30,215,96,0.08)", border: "1px solid rgba(30,215,96,0.22)", borderRadius: 14, textDecoration: "none" }}>
                <span style={{ fontSize: 22 }}>🎵</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#1ed760" }}>Trip Playlist</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>Open in Spotify</div>
                </div>
                {isHost && <button onClick={(e) => { e.preventDefault(); setEditingSpotify(true) }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 12 }}>Edit</button>}
              </a>
            </div>
          ) : !editing && isHost && !isPast && (
            <div style={{ marginTop: editingSpotify ? 8 : 10 }}>
              {editingSpotify ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input value={spotifyInput} onChange={(e) => setSpotifyInput(e.target.value)} placeholder="Paste Spotify playlist URL…" style={{ ...fieldStyle, flex: 1, border: "1.5px solid rgba(30,215,96,0.3)" }} />
                  <button onClick={handleSaveSpotify} style={{ background: "rgba(30,215,96,0.18)", border: "1px solid rgba(30,215,96,0.35)", borderRadius: 10, padding: "9px 14px", color: "#1ed760", fontWeight: 800, cursor: "pointer", fontSize: 13 }}>Save</button>
                  <button onClick={() => { setEditingSpotify(false); setSpotifyInput(spotifyUrl) }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 13 }}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => setEditingSpotify(true)} style={{ background: "rgba(30,215,96,0.05)", border: "1px dashed rgba(30,215,96,0.18)", borderRadius: 12, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "rgba(30,215,96,0.55)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  🎵 Add trip playlist
                </button>
              )}
            </div>
          )}

          {/* Weather snapshot */}
          {!editing && <WeatherSnapshot data={wxData} />}

          {/* Quick actions */}
          {!editing && <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <a href={googleCalendarUrl(trip || initialTrip, resortName)} target="_blank" rel="noopener noreferrer" style={{ ...chipBtn(false), textDecoration: "none", display: "flex", alignItems: "center", gap: 5 }}>
              📅 Add to Calendar
            </a>
            {/* Share — opens native share sheet on mobile (Messages, AirDrop, etc.), copies on desktop */}
            <button
              onClick={async () => {
                const inviteUrl = `${window.location.origin}/?trip=${initialTrip.id}`
                const shareData = {
                  title: tripTitle,
                  text: `Join me for a ski day at ${resortName}! 🎿`,
                  url: inviteUrl,
                }
                if (typeof navigator?.share === "function" && navigator.canShare?.(shareData)) {
                  try { await navigator.share(shareData) } catch (e) { if (e.name !== "AbortError") console.warn(e) }
                } else {
                  await navigator.clipboard?.writeText(`${shareData.text}\n${inviteUrl}`)
                  setLinkCopied(true)
                  setTimeout(() => setLinkCopied(false), 2000)
                }
              }}
              style={{ ...chipBtn(false), display: "flex", alignItems: "center", gap: 5 }}
            >
              {linkCopied ? "✓ Copied!" : "📤 Share"}
            </button>
            {/* Text — opens native SMS app with pre-filled message */}
            <a
              href={`sms:?body=${encodeURIComponent(`Join me for a ski trip to ${resortName}! 🎿\n\nRSVP here: ${window.location.origin}/?trip=${initialTrip.id}`)}`}
              style={{ ...chipBtn(false), textDecoration: "none", display: "flex", alignItems: "center", gap: 5 }}
            >
              💬 Text
            </a>
          </div>}
        </div>

        {/* ── RSVP section ── */}
        {!isHost && !isPast && currentUser && (
          <div style={{ padding: "16px 20px 0" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { status: "going",  label: "Going",  icon: "✓", active: "#22c55e", glow: "rgba(34,197,94,0.38)",   text: "#052e16" },
                { status: "maybe",  label: "Maybe",  icon: "〜", active: "#fbbf24", glow: "rgba(251,191,36,0.38)", text: "#1c1004" },
                { status: "cantgo", label: "Can't",  icon: "✕", active: "#f43f5e", glow: "rgba(244,63,94,0.38)",   text: "#200008" },
              ].map(({ status, label, icon, active, glow, text }) => {
                const isActive = myRsvp?.status === status
                const isPending = pendingStatus === status
                return (
                  <button key={status} disabled={rsvpLoading}
                    onClick={() => {
                      if (status === "going") { isActive ? handleCancelRsvp() : (setPendingStatus("going"), setRsvpMessage(""), setRsvpGifUrl(""), setRsvpPlusOnes(0), setRsvpRideStatus(null)) }
                      else handleQuickRsvp(status)
                    }}
                    style={{ padding: "12px 6px", borderRadius: 14, border: (isActive || isPending) ? `1.5px solid ${active}` : "1.5px solid rgba(255,255,255,0.1)", background: isActive ? active : isPending ? `${active}1a` : "rgba(255,255,255,0.05)", color: isActive ? text : "rgba(255,255,255,0.7)", fontWeight: 900, fontSize: 13, cursor: rsvpLoading ? "wait" : "pointer", transition: "all 0.18s ease", boxShadow: isActive ? `0 0 22px ${glow}` : "none", display: "grid", gap: 3, justifyItems: "center" }}
                  >
                    <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>

            {pendingStatus === "going" && (
              <div style={{ marginTop: 12, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.18)", borderRadius: 16, padding: "16px", display: "grid", gap: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#22c55e" }}>Let the crew know you're in 🎿</div>
                <textarea value={rsvpMessage} onChange={(e) => setRsvpMessage(e.target.value)} placeholder="Drop a message… (optional)" maxLength={200} rows={2} style={{ ...fieldStyle, resize: "none", lineHeight: 1.5, width: "100%", boxSizing: "border-box" }} />
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input value={rsvpGifUrl} onChange={(e) => setRsvpGifUrl(e.target.value)} placeholder="Paste a GIF URL (optional)" style={{ ...fieldStyle, flex: 1 }} />
                    <a href="https://giphy.com" target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textDecoration: "none", flexShrink: 0 }}>Find GIF →</a>
                  </div>
                  {rsvpGifUrl && <GifPreview url={rsvpGifUrl} />}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.68)" }}>Bringing guests?</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {[{ fn: () => setRsvpPlusOnes((p) => Math.max(0, p - 1)), label: "−" }, null, { fn: () => setRsvpPlusOnes((p) => Math.min(10, p + 1)), label: "+" }].map((btn, i) =>
                      btn ? (
                        <button key={i} onClick={btn.fn} style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "white", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{btn.label}</button>
                      ) : (
                        <span key={i} style={{ fontSize: 16, fontWeight: 800, color: "white", minWidth: 22, textAlign: "center" }}>{rsvpPlusOnes}</span>
                      )
                    )}
                  </div>
                </div>

                {/* Ride status */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>Your ride situation</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    {[
                      { key: "need_ride", label: "Need a Ride", emoji: "🙋" },
                      { key: "driving",   label: "I'm Driving", emoji: "🚗" },
                      { key: "have_ride", label: "Got a Ride",  emoji: "👍" },
                    ].map(({ key, label, emoji }) => {
                      const active = rsvpRideStatus === key
                      return (
                        <button key={key} type="button" onClick={() => setRsvpRideStatus(active ? null : key)}
                          style={{ padding: "9px 6px", borderRadius: 12, border: active ? "1.5px solid rgba(96,165,250,0.7)" : "1.5px solid rgba(255,255,255,0.1)", background: active ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.05)", color: active ? "#60a5fa" : "rgba(255,255,255,0.6)", fontWeight: 800, fontSize: 11, cursor: "pointer", display: "grid", gap: 4, justifyItems: "center", transition: "all 0.15s ease" }}
                        >
                          <span style={{ fontSize: 16, lineHeight: 1 }}>{emoji}</span>
                          <span style={{ textAlign: "center", lineHeight: 1.2 }}>{label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setPendingStatus(null); setRsvpRideStatus(null) }} style={{ flex: 1, padding: "10px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Nevermind</button>
                  <button onClick={handleConfirmGoingRsvp} disabled={rsvpLoading} style={{ flex: 2, padding: "10px", borderRadius: 12, background: rsvpLoading ? "rgba(34,197,94,0.3)" : "#22c55e", border: "none", color: "#052e16", fontWeight: 900, cursor: rsvpLoading ? "wait" : "pointer", fontSize: 14, boxShadow: "0 6px 20px rgba(34,197,94,0.3)" }}>
                    {rsvpLoading ? "Sending…" : "I'm In! 🎿"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <Divider />

        {/* ── Host updates ── */}
        <div style={{ padding: "16px 20px 0" }}>
          <SectionLabel
            action={isHost && !isPast && (
              <button onClick={() => setShowUpdateForm((v) => !v)} style={{ ...chipBtn(showUpdateForm) }}>
                + Update
              </button>
            )}
          >
            Host Updates
          </SectionLabel>

          {showUpdateForm && isHost && (
            <form onSubmit={handlePostUpdate} style={{ marginBottom: 14, display: "grid", gap: 8 }}>
              <textarea value={updateInput} onChange={(e) => setUpdateInput(e.target.value)} placeholder="Roads clear? Meeting time change? Let your crew know…" maxLength={400} rows={2} autoFocus style={{ ...fieldStyle, resize: "none", lineHeight: 1.5, border: "1.5px solid rgba(251,191,36,0.28)", width: "100%", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowUpdateForm(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 13 }}>Cancel</button>
                <button type="submit" disabled={!updateInput.trim() || updateLoading} style={{ padding: "8px 18px", background: updateInput.trim() ? "rgba(251,191,36,0.88)" : "rgba(255,255,255,0.06)", border: "none", borderRadius: 10, color: updateInput.trim() ? "#1c1004" : "rgba(255,255,255,0.3)", fontWeight: 900, cursor: updateInput.trim() ? "pointer" : "default", fontSize: 13 }}>
                  {updateLoading ? "Posting…" : "Post"}
                </button>
              </div>
            </form>
          )}

          {updates.length === 0 && !showUpdateForm && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", paddingBottom: 4 }}>{isHost ? "No updates yet." : "No updates from the host yet."}</div>}

          <div style={{ display: "grid", gap: 8 }}>
            {updates.map((u) => (
              <div key={u.id} style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.18)", borderLeft: "3px solid rgba(251,191,36,0.65)", borderRadius: "0 12px 12px 0", padding: "10px 14px", display: "grid", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(251,191,36,0.65)", textTransform: "uppercase", letterSpacing: 0.5 }}>Host Update</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{new Date(u.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                    {isHost && <button onClick={() => deleteTripUpdate(u.id).then(fetchDetail)} style={{ background: "none", border: "none", color: "rgba(255,80,80,0.4)", cursor: "pointer", fontSize: 11, padding: 0 }}>Remove</button>}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.82)", lineHeight: 1.5 }}>{u.content}</div>
              </div>
            ))}
          </div>
        </div>

        <Divider />

        {/* ── Chat ── */}
        <div style={{ padding: "16px 20px 0" }}>
          <SectionLabel>Trip Chat {comments.length > 0 && `· ${comments.length}`}</SectionLabel>

          {/* Pinned logistics card */}
          {(departureTime || meetingSpot || carpools.length > 0) && (
            <div style={{ marginBottom: 14, background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 14, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(96,165,250,0.7)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>📌 Pinned Logistics</div>
              <div style={{ display: "grid", gap: 6 }}>
                {departureTime && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span style={{ fontSize: 16 }}>🕐</span>
                    <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 700 }}>Departure</span>
                    <span style={{ color: "white", fontWeight: 800, marginLeft: "auto" }}>{departureTime}</span>
                  </div>
                )}
                {meetingSpot && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span style={{ fontSize: 16 }}>📍</span>
                    <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 700 }}>Meet at</span>
                    <span style={{ color: "white", fontWeight: 800, marginLeft: "auto", textAlign: "right", maxWidth: "55%" }}>{meetingSpot}</span>
                  </div>
                )}
                {carpools.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span style={{ fontSize: 16 }}>🚗</span>
                    <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 700 }}>Rides</span>
                    <span style={{ color: "white", fontWeight: 800, marginLeft: "auto" }}>
                      {carpools.reduce((s, c) => s + c.seats_available, 0)} open seat{carpools.reduce((s, c) => s + c.seats_available, 0) !== 1 ? "s" : ""} in {carpools.length} car{carpools.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            {comments.length === 0 && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>No messages yet — drop some hype ☝️</div>}
            {comments.slice(-40).map((c, i) => (
              <div key={c.id || i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <Avatar profile={c.profile} size={28} />
                <div style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "0 14px 14px 14px", padding: "7px 11px", fontSize: 13, color: "rgba(255,255,255,0.85)", wordBreak: "break-word", lineHeight: 1.4 }}>
                  {c.profile && <span style={{ fontWeight: 800, color: "rgba(255,255,255,0.5)", fontSize: 11, marginRight: 6 }}>{c.profile.full_name?.split(" ")[0] || c.profile.username}</span>}
                  {c.content}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {currentUser && (
            <form onSubmit={handleComment} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
              <Avatar profile={currentUser?.user_metadata} size={28} />
              <input value={commentInput} onChange={(e) => setCommentInput(e.target.value)} placeholder="Add a message… 🎿" maxLength={280} style={{ flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: "8px 14px", fontSize: 16, color: "white", outline: "none" }} />
              <button type="submit" disabled={!commentInput.trim() || commentLoading} style={{ background: commentInput.trim() ? accent : "rgba(255,255,255,0.07)", color: commentInput.trim() ? "#020617" : "rgba(255,255,255,0.35)", border: "none", borderRadius: 999, padding: "8px 16px", fontSize: 12, fontWeight: 900, cursor: commentInput.trim() ? "pointer" : "default", transition: "all 0.15s ease", flexShrink: 0 }}>Send</button>
            </form>
          )}
        </div>

        <Divider />

        {/* ── Guest list ── */}
        <div style={{ padding: "16px 20px 0" }}>
          <SectionLabel
            action={isHost && !isPast && (
              <button onClick={handleOpenInvitePanel} style={{ ...chipBtn(showInvitePanel), display: "flex", alignItems: "center", gap: 4 }}>
                + Invite
              </button>
            )}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Guest List
              {goingCount > 0 && <span style={{ background: "rgba(34,197,94,0.14)", border: "1px solid rgba(34,197,94,0.28)", borderRadius: 999, padding: "2px 9px", fontSize: 11, color: "#22c55e", fontWeight: 900, textTransform: "none", letterSpacing: 0 }}>{goingCount} going</span>}
              {maybeRsvps.length > 0 && <span style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 999, padding: "2px 9px", fontSize: 11, color: "#fbbf24", fontWeight: 900, textTransform: "none", letterSpacing: 0 }}>{maybeRsvps.length} maybe</span>}
            </span>
          </SectionLabel>

          {/* Invite panel */}
          {showInvitePanel && isHost && (
            <div style={{ marginBottom: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: "14px 16px" }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {["friends", "email"].map((tab) => (
                  <button key={tab} onClick={() => setInviteTab(tab)} style={{ ...chipBtn(inviteTab === tab), textTransform: "capitalize" }}>{tab === "friends" ? "Friends" : "By Email"}</button>
                ))}
              </div>
              {inviteTab === "friends" ? (
                <>
                  <div style={{ display: "grid", gap: 8, maxHeight: 200, overflowY: "auto", marginBottom: 10 }}>
                    {friends.length === 0 && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>No friends to invite yet.</div>}
                    {friends.map((f) => {
                      const alreadyInvited = invites.some((i) => i.invitee_id === f.id)
                      const alreadyRsvpd = rsvps.some((r) => r.user_id === f.id)
                      const selected = selectedFriendIds.has(f.id)
                      const disabled = alreadyInvited || alreadyRsvpd
                      return (
                        <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1 }}>
                          <input type="checkbox" checked={selected || disabled} disabled={disabled} onChange={() => {
                            setSelectedFriendIds((prev) => {
                              const next = new Set(prev)
                              next.has(f.id) ? next.delete(f.id) : next.add(f.id)
                              return next
                            })
                          }} style={{ accentColor: accent, width: 16, height: 16 }} />
                          <Avatar profile={f} size={28} />
                          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.82)" }}>{f.full_name || f.username}</span>
                          {(alreadyInvited || alreadyRsvpd) && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginLeft: "auto" }}>{alreadyRsvpd ? "Going" : "Invited"}</span>}
                        </label>
                      )
                    })}
                  </div>
                  <button onClick={handleSendFriendInvites} disabled={!selectedFriendIds.size || inviteLoading} style={{ background: selectedFriendIds.size ? accent : "rgba(255,255,255,0.07)", border: "none", borderRadius: 10, padding: "9px 16px", color: selectedFriendIds.size ? "#020617" : "rgba(255,255,255,0.3)", fontWeight: 900, cursor: selectedFriendIds.size ? "pointer" : "default", fontSize: 13 }}>
                    {inviteLoading ? "Inviting…" : `Invite ${selectedFriendIds.size || ""} Friend${selectedFriendIds.size !== 1 ? "s" : ""}`}
                  </button>
                </>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  <input value={inviteEmailName} onChange={(e) => setInviteEmailName(e.target.value)} placeholder="Name (optional)" style={{ ...fieldStyle }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Email address" type="email" style={{ ...fieldStyle, flex: 1 }} />
                    <button onClick={handleSendEmailInvite} disabled={!inviteEmail.trim() || inviteLoading} style={{ background: inviteEmail.trim() ? accent : "rgba(255,255,255,0.07)", border: "none", borderRadius: 10, padding: "9px 14px", color: inviteEmail.trim() ? "#020617" : "rgba(255,255,255,0.3)", fontWeight: 900, cursor: inviteEmail.trim() ? "pointer" : "default", fontSize: 13, flexShrink: 0 }}>
                      {inviteLoading ? "…" : "Invite"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Going list */}
          {goingRsvps.length === 0 ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", paddingBottom: 4 }}>No one's in yet — be the first!</div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {goingRsvps.map((rsvp) => <GuestRow key={rsvp.id} rsvp={rsvp} accent={accent} />)}
            </div>
          )}

          {/* Maybe row */}
          {maybeRsvps.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.32)", marginBottom: 8 }}>MAYBE</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {maybeRsvps.map((rsvp) => (
                  <div key={rsvp.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 999, padding: "4px 10px 4px 5px" }}>
                    <Avatar profile={rsvp.profile} size={22} />
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{(rsvp.profile?.full_name || rsvp.profile?.username || "?").split(" ")[0]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Can't make it */}
          {cantRsvps.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", fontWeight: 700 }}>
                Can't make it: {cantRsvps.map((r) => (r.profile?.full_name || r.profile?.username || "?").split(" ")[0]).join(", ")}
              </span>
            </div>
          )}

          {/* Invited (pending) */}
          {invites.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.32)", marginBottom: 8 }}>INVITED</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {invites.map((inv) => (
                  <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 999, padding: "4px 8px 4px 5px" }}>
                    <Avatar profile={inv.profile} size={22} />
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                      {inv.profile?.full_name || inv.profile?.username || inv.invitee_name || inv.email || "Guest"}
                    </span>
                    {isHost && (
                      <button onClick={() => handleRemoveInvite(inv.id)} style={{ background: "none", border: "none", color: "rgba(255,80,80,0.4)", cursor: "pointer", fontSize: 11, padding: "0 2px", lineHeight: 1 }}>×</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <Divider />

        {/* ── Rides / Carpool ── */}
        <div style={{ padding: "16px 20px 0" }}>
          <SectionLabel
            action={(isGoing || isHost) && !isPast && (
              <button onClick={() => setShowAddCarForm((v) => !v)} style={{ ...chipBtn(showAddCarForm), display: "flex", alignItems: "center", gap: 4 }}>
                🚗 Add My Car
              </button>
            )}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Rides 🚗
              {totalSeatsOffered > 0 && (
                <span style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 999, padding: "2px 9px", fontSize: 11, color: "#22c55e", fontWeight: 900 }}>
                  {totalSeatsOffered - totalSeatsTaken} open seat{totalSeatsOffered - totalSeatsTaken !== 1 ? "s" : ""}
                </span>
              )}
              {needRideRsvps.length > 0 && (
                <span style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.22)", borderRadius: 999, padding: "2px 9px", fontSize: 11, color: "#fbbf24", fontWeight: 900 }}>
                  {needRideRsvps.length} need{needRideRsvps.length === 1 ? "s" : ""} a ride
                </span>
              )}
            </span>
          </SectionLabel>

          {/* My ride status pill row */}
          {isGoing && !isPast && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.42)", marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>How are you getting there?</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {[
                  { key: "need_ride", label: "Need a Ride", icon: "🙋" },
                  { key: "driving",   label: "I'm Driving",  icon: "🚗" },
                  { key: "have_ride", label: "Got a Ride",   icon: "✓" },
                ].map(({ key, label, icon }) => {
                  const isActive = myRideStatus === key
                  return (
                    <button
                      key={key}
                      disabled={carpoolActionLoading}
                      onClick={() => handleSetRideStatus(isActive ? null : key)}
                      style={{
                        padding: "7px 13px",
                        borderRadius: 999,
                        border: isActive ? `1.5px solid ${accent}` : "1.5px solid rgba(255,255,255,0.12)",
                        background: isActive ? `${accent}22` : "rgba(255,255,255,0.05)",
                        color: isActive ? accent : "rgba(255,255,255,0.6)",
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        transition: "all 0.15s",
                      }}
                    >
                      <span>{icon}</span>{label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Add car form */}
          {showAddCarForm && (isGoing || isHost) && (
            <div style={{ marginBottom: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: "14px 16px", display: "grid", gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.8)" }}>Add your car to the pool</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontWeight: 700 }}>Car (optional)</div>
                  <input
                    value={newCarLabel}
                    onChange={(e) => setNewCarLabel(e.target.value)}
                    placeholder="Blue Outback, White RAV4…"
                    maxLength={40}
                    style={{ ...fieldStyle, width: "100%", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontWeight: 700 }}>Open Seats</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button type="button" onClick={() => setNewCarSeats((s) => Math.max(1, s - 1))} style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "white", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                    <span style={{ fontSize: 16, fontWeight: 800, color: "white", minWidth: 20, textAlign: "center" }}>{newCarSeats}</span>
                    <button type="button" onClick={() => setNewCarSeats((s) => Math.min(8, s + 1))} style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "white", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                  </div>
                </div>
              </div>
              <input
                value={newCarNote}
                onChange={(e) => setNewCarNote(e.target.value)}
                placeholder="Note (e.g. leaving at 6 AM from REI parking lot)"
                maxLength={120}
                style={{ ...fieldStyle, width: "100%", boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowAddCarForm(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 13 }}>Cancel</button>
                <button onClick={handleAddCar} disabled={carpoolActionLoading} style={{ background: accent, border: "none", borderRadius: 10, padding: "8px 18px", color: "#020617", fontWeight: 900, cursor: "pointer", fontSize: 13 }}>
                  {carpoolActionLoading ? "Adding…" : "Add Car"}
                </button>
              </div>
            </div>
          )}

          {/* Car list */}
          {carpools.length === 0 && !showAddCarForm && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", paddingBottom: 4 }}>
              {isPast ? "No carpools were set up." : "No cars added yet. Going? Add yours above."}
            </div>
          )}

          <div style={{ display: "grid", gap: 10, marginBottom: needRideRsvps.length > 0 ? 14 : 0 }}>
            {carpools.map((car) => {
              const isMyRide = myCarpoolSeat?.id === car.id
              const isMyOwnCar = car.driver_user_id === currentUser?.id
              const seatsLeft = car.seats_available
              const canClaim = !isMyRide && !isMyOwnCar && seatsLeft > 0 && isGoing && !isPast
              return (
                <div
                  key={car.id}
                  style={{
                    background: isMyRide
                      ? `${accent}0d`
                      : isMyOwnCar
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(255,255,255,0.04)",
                    border: isMyRide
                      ? `1.5px solid ${accent}44`
                      : isMyOwnCar
                      ? "1px solid rgba(255,255,255,0.12)"
                      : "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 14,
                    padding: "12px 14px",
                    display: "grid",
                    gap: 9,
                  }}
                >
                  {/* Driver row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <Avatar profile={car.driver_profile} size={32} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>
                          {car.driver_name}
                          {isMyOwnCar && <span style={{ marginLeft: 6, fontSize: 10, color: accent, fontWeight: 700 }}>YOU</span>}
                        </div>
                        {car.car_label && (
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>{car.car_label}</div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {/* Seat dots */}
                      <div style={{ display: "flex", gap: 3 }}>
                        {Array.from({ length: car.seats_total }).map((_, i) => (
                          <div
                            key={i}
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: i < car.seats_taken ? accent : "rgba(255,255,255,0.15)",
                              border: i < car.seats_taken ? "none" : "1px solid rgba(255,255,255,0.2)",
                            }}
                          />
                        ))}
                      </div>
                      <span style={{ fontSize: 11, color: seatsLeft === 0 ? "rgba(255,80,80,0.6)" : "rgba(255,255,255,0.4)", fontWeight: 700 }}>
                        {seatsLeft === 0 ? "Full" : `${seatsLeft} open`}
                      </span>
                      {isMyOwnCar && !isPast && (
                        <button
                          onClick={() => handleRemoveCar(car.id)}
                          disabled={carpoolActionLoading}
                          style={{ background: "none", border: "none", color: "rgba(255,80,80,0.4)", cursor: "pointer", fontSize: 13, padding: "0 2px" }}
                        >
                          ×
                        </button>
                      )}
                      {isHost && !isMyOwnCar && !isPast && (
                        <button
                          onClick={() => handleRemoveCar(car.id)}
                          disabled={carpoolActionLoading}
                          style={{ background: "none", border: "none", color: "rgba(255,80,80,0.3)", cursor: "pointer", fontSize: 11, padding: "0 2px" }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Note */}
                  {car.note && (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", paddingLeft: 41 }}>{car.note}</div>
                  )}

                  {/* Riders */}
                  {car.riders.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 41, flexWrap: "wrap" }}>
                      {car.riders.map((r) => (
                        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.06)", borderRadius: 999, padding: "3px 8px 3px 4px" }}>
                          <Avatar profile={r.profile} size={18} />
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
                            {(r.profile?.full_name || r.profile?.username || "?").split(" ")[0]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Claim / Release buttons */}
                  {!isPast && (
                    <div style={{ paddingLeft: 41, display: "flex", gap: 7 }}>
                      {isMyRide ? (
                        <button
                          onClick={() => handleReleaseSeat(car.id)}
                          disabled={carpoolActionLoading}
                          style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.55)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                        >
                          Leave This Car
                        </button>
                      ) : canClaim ? (
                        <button
                          onClick={() => handleClaimSeat(car.id)}
                          disabled={carpoolActionLoading}
                          style={{ padding: "6px 12px", borderRadius: 8, background: `${accent}22`, border: `1px solid ${accent}44`, color: accent, fontWeight: 800, fontSize: 12, cursor: "pointer" }}
                        >
                          🚗 Claim a Seat
                        </button>
                      ) : seatsLeft === 0 && !isMyRide ? (
                        <span style={{ fontSize: 12, color: "rgba(255,80,80,0.5)", fontWeight: 700 }}>Car full</span>
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Smart carpool match suggestion */}
          {!isPast && needRideRsvps.length > 0 && totalSeatsOffered - totalSeatsTaken > 0 && (
            <div style={{ marginBottom: 14, background: "linear-gradient(135deg,rgba(96,165,250,0.08),rgba(34,197,94,0.06))", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 14, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>🤝 Ride Matches Available</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.5, marginBottom: 10 }}>
                <strong style={{ color: "white" }}>{needRideRsvps.length}</strong> {needRideRsvps.length === 1 ? "person needs" : "people need"} a ride and there {totalSeatsOffered - totalSeatsTaken === 1 ? "is" : "are"} <strong style={{ color: "#22c55e" }}>{totalSeatsOffered - totalSeatsTaken} open seat{totalSeatsOffered - totalSeatsTaken !== 1 ? "s" : ""}</strong> available.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {needRideRsvps.map((rsvp) => {
                  const availableCar = carpools.find((c) => c.seats_available > 0 && c.driver_user_id !== rsvp.user_id && !c.riders.some((r) => r.user_id === rsvp.user_id))
                  if (!availableCar) return null
                  const isMe = rsvp.user_id === currentUser?.id
                  const driverFirst = (availableCar.driver_name || "Driver").split(" ")[0]
                  const riderFirst = (rsvp.profile?.full_name || rsvp.profile?.username || "?").split(" ")[0]
                  return (
                    <div key={rsvp.id} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "7px 12px", fontSize: 12, color: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", gap: 7 }}>
                      <Avatar profile={rsvp.profile} size={20} />
                      <span>{riderFirst} → {driverFirst}'s car</span>
                      {isMe && (
                        <button onClick={() => handleClaimSeat(availableCar.id)} disabled={carpoolActionLoading}
                          style={{ background: "#60a5fa", border: "none", borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 800, color: "#020617", cursor: "pointer", marginLeft: 4 }}>
                          Claim →
                        </button>
                      )}
                    </div>
                  )
                }).filter(Boolean)}
              </div>
            </div>
          )}

          {/* Needs a Ride section */}
          {needRideRsvps.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(251,191,36,0.65)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>🙋 Needs a Ride</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {needRideRsvps.map((rsvp) => (
                  <div key={rsvp.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.18)", borderRadius: 999, padding: "4px 10px 4px 5px" }}>
                    <Avatar profile={rsvp.profile} size={22} />
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                      {(rsvp.profile?.full_name || rsvp.profile?.username || "?").split(" ")[0]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <Divider />

        {/* ── Polls ── */}
        <div style={{ padding: "16px 20px 0" }}>
          <SectionLabel
            action={currentUser && !isPast && (
              <button onClick={() => setShowPollForm((v) => !v)} style={{ ...chipBtn(showPollForm), display: "flex", alignItems: "center", gap: 4 }}>
                + Poll
              </button>
            )}
          >
            Polls
          </SectionLabel>

          {showPollForm && (
            <form onSubmit={handleCreatePoll} style={{ marginBottom: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 16px", display: "grid", gap: 10 }}>
              <input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} placeholder="Ask your crew something… (e.g. Where should we eat?)" maxLength={140} style={{ ...fieldStyle, width: "100%", boxSizing: "border-box" }} />
              <div style={{ display: "grid", gap: 6 }}>
                {pollOptions.map((opt, i) => (
                  <div key={i} style={{ display: "flex", gap: 6 }}>
                    <input
                      value={opt}
                      onChange={(e) => setPollOptions((prev) => prev.map((o, j) => j === i ? e.target.value : o))}
                      placeholder={`Option ${i + 1}`}
                      maxLength={80}
                      style={{ ...fieldStyle, flex: 1 }}
                    />
                    {pollOptions.length > 2 && (
                      <button type="button" onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "rgba(255,80,80,0.45)", cursor: "pointer", fontSize: 18, padding: "0 4px" }}>×</button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 6 && (
                  <button type="button" onClick={() => setPollOptions((prev) => [...prev, ""])} style={{ background: "none", border: "1px dashed rgba(255,255,255,0.14)", borderRadius: 10, padding: "7px", fontSize: 12, color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
                    + Add option
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setShowPollForm(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 13 }}>Cancel</button>
                <button type="submit" disabled={!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2 || pollLoading} style={{ background: pollQuestion.trim() ? accent : "rgba(255,255,255,0.07)", border: "none", borderRadius: 10, padding: "8px 18px", color: pollQuestion.trim() ? "#020617" : "rgba(255,255,255,0.3)", fontWeight: 900, cursor: pollQuestion.trim() ? "pointer" : "default", fontSize: 13 }}>
                  {pollLoading ? "Creating…" : "Create Poll"}
                </button>
              </div>
            </form>
          )}

          {polls.length === 0 && !showPollForm && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", paddingBottom: 4 }}>No polls yet.</div>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            {polls.map((poll) => (
              <PollCard key={poll.id} poll={poll} currentUserId={currentUser?.id} accent={accent} onVote={handleVote} onDelete={handleDeletePoll} />
            ))}
          </div>
        </div>

        {/* ── Post-trip recap & media (past trips only) ── */}
        {isPast && (
          <>
            <Divider />
            <div style={{ padding: "16px 20px 0" }}>
              <SectionLabel
                action={(isGoing || isHost) && !myRecap && (
                  <button onClick={() => setShowRecapForm((v) => !v)} style={{ ...chipBtn(showRecapForm), display: "flex", alignItems: "center", gap: 4 }}>
                    {showRecapForm ? "Cancel" : "✍️ Add Recap"}
                  </button>
                )}
              >
                How Was It?
              </SectionLabel>

              {/* Recap form */}
              {showRecapForm && !myRecap && (
                <form onSubmit={handleSubmitRecap} style={{ marginBottom: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "14px 16px", display: "grid", gap: 12 }}>
                  {/* Star rating */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>Rating</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[1,2,3,4,5].map((s) => (
                        <button key={s} type="button" onClick={() => setRecapRating(s)} style={{
                          background: "none", border: "none", cursor: "pointer",
                          fontSize: 26, lineHeight: 1, opacity: s <= recapRating ? 1 : 0.3,
                          filter: s <= recapRating ? "none" : "grayscale(1)",
                          transition: "all 0.1s",
                        }}>⭐</button>
                      ))}
                    </div>
                  </div>

                  {/* Conditions */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>Conditions</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {["powder","groomed","icy","slushy","packed","variable"].map((c) => (
                        <button key={c} type="button" onClick={() => setRecapConditions(recapConditions === c ? "" : c)} style={{
                          padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                          border: recapConditions === c ? `1.5px solid ${accent}` : "1.5px solid rgba(255,255,255,0.12)",
                          background: recapConditions === c ? `${accent}22` : "rgba(255,255,255,0.05)",
                          color: recapConditions === c ? accent : "rgba(255,255,255,0.65)",
                        }}>
                          {c.charAt(0).toUpperCase() + c.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <input
                    value={recapHighlight}
                    onChange={(e) => setRecapHighlight(e.target.value)}
                    placeholder="Best moment of the day…"
                    maxLength={140}
                    style={{ ...fieldStyle, width: "100%", boxSizing: "border-box" }}
                  />
                  <textarea
                    value={recapNotes}
                    onChange={(e) => setRecapNotes(e.target.value)}
                    placeholder="Any other notes, tips for next time…"
                    rows={3}
                    maxLength={500}
                    style={{ ...fieldStyle, width: "100%", boxSizing: "border-box", resize: "none" }}
                  />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button type="button" onClick={() => setShowRecapForm(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", cursor: "pointer", fontSize: 13 }}>Cancel</button>
                    <button type="submit" disabled={recapSaving} style={{ background: accent, border: "none", borderRadius: 10, padding: "8px 18px", color: "#020617", fontWeight: 900, cursor: "pointer", fontSize: 13 }}>
                      {recapSaving ? "Saving…" : "Save Recap"}
                    </button>
                  </div>
                </form>
              )}

              {/* Existing recaps */}
              {recaps.length === 0 && !showRecapForm && (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", paddingBottom: 4 }}>No recaps yet — be the first to share how it was!</div>
              )}
              <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
                {recaps.map((r) => {
                  const name = r.profile?.full_name || r.profile?.username || "Skier"
                  return (
                    <div key={r.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 999, background: `${accent}33`, border: `1px solid ${accent}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: accent }}>
                          {name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#fff" }}>{name}</div>
                        {r.rating && (
                          <div style={{ marginLeft: "auto", fontSize: 14 }}>{"⭐".repeat(r.rating)}</div>
                        )}
                      </div>
                      {r.conditions && (
                        <div style={{ display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${accent}22`, color: accent, marginBottom: 6 }}>
                          {r.conditions.charAt(0).toUpperCase() + r.conditions.slice(1)}
                        </div>
                      )}
                      {r.highlight && <div style={{ fontSize: 13, color: "#fff", fontWeight: 600, marginBottom: 4 }}>"{r.highlight}"</div>}
                      {r.notes && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{r.notes}</div>}
                    </div>
                  )
                })}
              </div>

              {/* Media upload + gallery */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 10 }}>Photos & Videos</div>
                {(isGoing || isHost) && (
                  <div style={{ marginBottom: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "12px 14px", display: "grid", gap: 8 }}>
                    <input
                      value={mediaCaption}
                      onChange={(e) => setMediaCaption(e.target.value)}
                      placeholder="Caption (optional)…"
                      maxLength={120}
                      style={{ ...fieldStyle, width: "100%", boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <input ref={mediaFileRef} type="file" accept="image/*,video/*" onChange={handleUploadMedia} disabled={mediaUploading} style={{ display: "none" }} id="media-upload" />
                      <label htmlFor="media-upload" style={{
                        flex: 1, textAlign: "center", padding: "9px", borderRadius: 11, cursor: mediaUploading ? "default" : "pointer",
                        border: "1.5px dashed rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 600,
                        background: "rgba(255,255,255,0.04)",
                      }}>
                        {mediaUploading ? "Uploading…" : "📷 Add Photo / Video"}
                      </label>
                    </div>
                  </div>
                )}
                {media.length === 0 && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.28)" }}>No photos or videos yet.</div>
                )}
                {media.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
                    {media.map((m) => (
                      <div key={m.id} style={{ position: "relative", borderRadius: 12, overflow: "hidden", aspectRatio: "1", background: "rgba(255,255,255,0.05)" }}>
                        {m.media_type === "video" ? (
                          <video src={m.url} controls style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <img src={m.url} alt={m.caption || "Trip photo"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        )}
                        {m.caption && (
                          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.6)", fontSize: 10, color: "#fff", padding: "3px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {m.caption}
                          </div>
                        )}
                        {m.user_id === currentUser?.id && (
                          <button onClick={() => handleDeleteMedia(m.id, m.storage_path)} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 999, width: 20, height: 20, color: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>×</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Host controls ── */}
        {isHost && !isPast && (
          <div style={{ padding: "0 20px 20px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <button onClick={handleDeleteTrip} disabled={deleting} style={{ marginTop: 14, background: "none", border: "none", color: "rgba(255,80,80,0.5)", fontSize: 12, cursor: "pointer", fontWeight: 700, padding: 0 }}>
              {deleting ? "Cancelling…" : "Cancel this trip"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
