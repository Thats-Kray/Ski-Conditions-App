import { useState, useEffect, useCallback, useRef } from "react"
import { useMobile } from "../lib/useMobile"
import { supabase } from "../lib/supabase"
import {
  getMyCrews,
  getAcceptedFriends,
  getAllVisibleTrips,
  getMyTripConversations,
  getCurrentUser,
  getDMConversations,
  markDMsRead,
} from "../lib/socialApi"
import DirectMessageView from "./DirectMessageView"
import { getLeaderboard, getCurrentSeason } from "../lib/leaderboardApi"
import { CrewChatView } from "./CrewGroupChat"
import TripDetailModal from "./TripDetailModal"
import TripChatView, { tripDisplayName } from "./TripChatView"
import { resortName, resortEmoji } from "../lib/resorts"
import { timeAgo } from "../lib/format"
import Avatar from "./ui/Avatar"
import { SkiPingComposer } from "./SkiPingModal"

// ── Helpers ───────────────────────────────────────────────────────────────────

function tierColor(tier) {
  if (tier === "Elite")     return "#8ef6d1"
  if (tier === "Very Good") return "#9bc6ff"
  if (tier === "Good")      return "#ffe39a"
  if (tier === "Okay")      return "#ffc996"
  if (tier === "Closed")    return "#64748b"
  return "#ff9d9d"
}

function scoreGradient(score) {
  if (score == null) return "linear-gradient(135deg,#334155,#1e293b)"
  if (score >= 80)   return "linear-gradient(135deg,#0f766e,#2563eb)"
  if (score >= 65)   return "linear-gradient(135deg,#1d4ed8,#4338ca)"
  if (score >= 50)   return "linear-gradient(135deg,#475569,#334155)"
  if (score >= 35)   return "linear-gradient(135deg,#7c2d12,#92400e)"
  return               "linear-gradient(135deg,#7f1d1d,#451a03)"
}

function tripResortName(trip) {
  return trip.title || resortName(trip.resort_key) || trip.resort_key || "Unknown Resort"
}

function tripResortEmoji(trip) {
  return resortEmoji(trip.resort_key)
}

const LS_PREFIX = "pd_cr_"
function getLastRead(id) { try { return localStorage.getItem(LS_PREFIX + id) || null } catch { return null } }
function markRead(id)    { try { localStorage.setItem(LS_PREFIX + id, new Date().toISOString()) } catch {} }

// ── Shared primitives ─────────────────────────────────────────────────────────

function DashCard({ children, style = {} }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 20,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      ...style,
    }}>
      {children}
    </div>
  )
}

function CardHeader({ title, action }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      flexShrink: 0,
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 0.9 }}>
        {title}
      </div>
      {action}
    </div>
  )
}

function EmptyState({ icon, text, sub }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 8, padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 32 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>{text}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", lineHeight: 1.5 }}>{sub}</div>}
    </div>
  )
}

// ── Panel 1: Mountain Conditions ──────────────────────────────────────────────

const RANK_ICONS = ["🥇", "🥈", "🥉"]

function ConditionsWidget({ resorts, onTabChange }) {
  const top3 = [...resorts]
    .filter(r => r.powderScore != null)
    .sort((a, b) => b.powderScore - a.powderScore)
    .slice(0, 3)

  return (
    <DashCard>
      <CardHeader
        title="🏔️ Mountain Conditions"
        action={
          <button
            onClick={() => onTabChange("dashboard")}
            style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "4px 8px", borderRadius: 8 }}
          >
            View All →
          </button>
        }
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {top3.length === 0 ? (
          <EmptyState icon="🏔️" text="Loading conditions…" />
        ) : top3.map((r, i) => (
          <div
            key={r.name}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 16px",
              borderBottom: i < top3.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
              background: i === 0 ? "rgba(255,255,255,0.02)" : "transparent",
            }}
          >
            <span style={{ fontSize: 20, flexShrink: 0 }}>{RANK_ICONS[i]}</span>

            {/* Score badge */}
            <div style={{
              width: 52, height: 52, borderRadius: 14, flexShrink: 0,
              background: scoreGradient(r.powderScore),
              border: "1px solid rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 900, fontSize: 16, color: "white",
            }}>
              {r.powderScore ?? "—"}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.name}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: tierColor(r.powderTier) }}>{r.powderTier}</span>
                {r.snowPrev24in != null && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.38)" }}>❄️ {r.snowPrev24in}"</span>}
                {r.tempF != null && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.38)" }}>🌡️ {r.tempF}°F</span>}
              </div>
            </div>

            {/* Forecast snippet */}
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "right", maxWidth: 110, lineHeight: 1.4, flexShrink: 0 }}>
              {r.shortForecast?.slice(0, 40) || ""}
            </div>
          </div>
        ))}
      </div>
    </DashCard>
  )
}

// ── Panel 2: Upcoming Ski Plans ───────────────────────────────────────────────

const ROLE_LABEL = { mine: "Host", going: "Going", invited: "Invited" }
const ROLE_COLOR = { mine: "#60a5fa", going: "#22c55e", invited: "#fbbf24" }
const RSVP_LABEL = { going: "Going ✓", maybe: "Maybe", cantgo: "Can't Go" }
const RSVP_COLOR = { going: "#22c55e", maybe: "#fbbf24", cantgo: "#f87171" }

function TripAvatar({ profile, size = 26, style = {} }) {
  const name = profile?.full_name || profile?.username || "?"
  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(10,14,30,0.9)", flexShrink: 0, ...style }}
      />
    )
  }
  const colors = ["#2563eb","#0891b2","#7c3aed","#16a34a","#ea580c"]
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: colors[name.length % colors.length],
      border: "2px solid rgba(10,14,30,0.9)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 800, color: "white", ...style,
    }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function AvatarStack({ attendees, total, onClick }) {
  const visible = attendees.slice(0, 3)
  const overflow = total - visible.length
  return (
    <div
      onClick={e => { e.stopPropagation(); onClick() }}
      title={`${total} going — click to see guest list`}
      style={{ display: "flex", alignItems: "center", cursor: "pointer", flexShrink: 0 }}
    >
      {visible.map((person, i) => (
        <TripAvatar
          key={person.id || i}
          profile={person}
          size={26}
          style={{ marginLeft: i === 0 ? 0 : -8 }}
        />
      ))}
      {overflow > 0 && (
        <div style={{
          width: 26, height: 26, borderRadius: "50%", marginLeft: -8,
          background: "rgba(255,255,255,0.12)", border: "2px solid rgba(10,14,30,0.9)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 900, color: "rgba(255,255,255,0.7)",
        }}>
          +{overflow}
        </div>
      )}
    </div>
  )
}

function RsvpPanel({ trip, onClose }) {
  const rsvps = trip.rsvps || []
  const host = trip.host_profile

  const groups = [
    { label: "Going", color: "#22c55e", items: rsvps.filter(r => r.status === "going") },
    { label: "Maybe", color: "#fbbf24", items: rsvps.filter(r => r.status === "maybe") },
    { label: "Can't Go", color: "#f87171", items: rsvps.filter(r => r.status === "cantgo") },
  ].filter(g => g.items.length > 0)

  return (
    <div
      style={{
        position: "absolute", top: "100%", right: 0, zIndex: 50,
        width: 240, background: "rgba(10,14,30,0.98)",
        border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14,
        boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
        overflow: "hidden", marginTop: 6,
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "white" }}>Guest List</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 16, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
      </div>

      {/* Host */}
      {host && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <TripAvatar profile={host} size={22} />
          <div style={{ flex: 1, fontSize: 12, color: "white", fontWeight: 600 }}>{host.full_name || host.username}</div>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#60a5fa" }}>Host</span>
        </div>
      )}

      {/* RSVP groups */}
      {groups.length === 0 ? (
        <div style={{ padding: "14px", fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>No RSVPs yet</div>
      ) : groups.map(group => (
        <div key={group.label}>
          <div style={{ padding: "6px 14px 2px", fontSize: 9, fontWeight: 900, color: group.color, textTransform: "uppercase", letterSpacing: 0.8 }}>
            {group.label} · {group.items.length}
          </div>
          {group.items.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px" }}>
              <TripAvatar profile={r.profile} size={22} />
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>
                {r.profile?.full_name || r.profile?.username || "Skier"}
                {r.plus_ones > 0 && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}> +{r.plus_ones}</span>}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function PlansWidget({ currentUser, resorts, onTabChange }) {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [openRsvpId, setOpenRsvpId] = useState(null)
  const [selectedTrip, setSelectedTrip] = useState(null)

  useEffect(() => {
    if (!currentUser) { setLoading(false); return }
    getAllVisibleTrips()
      .then(({ mine = [], rsvpd = [], invited = [] }) => {
        const all = [
          ...mine.map(t => ({ ...t, _role: "mine" })),
          ...rsvpd.map(t => ({ ...t, _role: "going" })),
          ...invited.map(t => ({ ...t, _role: "invited" })),
        ]
        const seen = new Set()
        const unique = all.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true })
        unique.sort((a, b) => (a.ski_date || "").localeCompare(b.ski_date || ""))
        setTrips(unique.slice(0, 3))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [currentUser])

  // Close RSVP panel on outside click
  useEffect(() => {
    if (!openRsvpId) return
    const handler = () => setOpenRsvpId(null)
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [openRsvpId])

  return (
    <>
    <DashCard>
      <CardHeader
        title="🎿 Upcoming Ski Plans"
        action={
          <button
            onClick={() => onTabChange("plans")}
            style={{
              width: 28, height: 28, borderRadius: 8, border: "none",
              background: "linear-gradient(135deg,#2563eb,#0891b2)",
              color: "white", fontSize: 18, fontWeight: 900, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
            }}
          >
            +
          </button>
        }
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {!currentUser ? (
          <EmptyState icon="🎿" text="Sign in to see your plans" />
        ) : loading ? (
          <EmptyState icon="⏳" text="Loading…" />
        ) : trips.length === 0 ? (
          <EmptyState icon="🏔️" text="No upcoming trips" sub="Tap + to plan your next powder day" />
        ) : trips.map((trip, i) => {
          const date = new Date(`${trip.ski_date}T12:00:00`)
          const isValid = !isNaN(date)

          // Match live resort conditions
          const cond = resorts.find(r => r.resortKey === trip.resort_key)

          // Build attendee list: host first, then going RSVPs (excluding host)
          const goingRsvps = (trip.rsvps || []).filter(r => r.status === "going")
          const hostProfile = trip.host_profile
          const attendees = [
            ...(hostProfile ? [hostProfile] : []),
            ...goingRsvps.filter(r => r.user_id !== trip.host_id).map(r => r.profile).filter(Boolean),
          ]
          const totalAttendees = attendees.length

          return (
            <div key={trip.id} style={{ position: "relative" }}>
              <div
                onClick={() => { setOpenRsvpId(null); setSelectedTrip(trip) }}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 16px",
                  borderBottom: i < trips.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  cursor: "pointer", transition: "background 0.12s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                {/* Resort emoji badge */}
                <div style={{
                  width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                  background: "linear-gradient(135deg,rgba(37,99,235,0.22),rgba(8,145,178,0.18))",
                  border: "1px solid rgba(96,165,250,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                }}>
                  {tripResortEmoji(trip)}
                </div>

                {/* Main info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tripResortName(trip)}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.38)" }}>
                      {isValid ? date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : trip.ski_date}
                    </span>
                    {trip._role && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: ROLE_COLOR[trip._role], background: `${ROLE_COLOR[trip._role]}18`, borderRadius: 999, padding: "1px 6px" }}>
                        {ROLE_LABEL[trip._role]}
                      </span>
                    )}
                  </div>
                  {/* Snow + weather row */}
                  {cond && (
                    <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                      {cond.snowPrev24in != null && (
                        <span style={{ fontSize: 10, color: "#93c5fd" }}>❄️ {cond.snowPrev24in}"</span>
                      )}
                      {cond.tempF != null && (
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.38)" }}>🌡️ {cond.tempF}°F</span>
                      )}
                      {cond.powderTier && cond.powderTier !== "Closed" && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: tierColor(cond.powderTier) }}>{cond.powderTier}</span>
                      )}
                      {cond.shortForecast && (
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)" }}>{cond.shortForecast.slice(0, 28)}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Avatar stack + chevron */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {totalAttendees > 0 && (
                    <AvatarStack
                      attendees={attendees}
                      total={totalAttendees}
                      onClick={() => setOpenRsvpId(openRsvpId === trip.id ? null : trip.id)}
                    />
                  )}
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.25)" }}>›</div>
                </div>
              </div>

              {/* RSVP dropdown panel */}
              {openRsvpId === trip.id && (
                <RsvpPanel trip={trip} onClose={() => setOpenRsvpId(null)} />
              )}
            </div>
          )
        })}
      </div>
      {trips.length > 0 && (
        <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <button
            onClick={() => onTabChange("plans")}
            style={{ width: "100%", background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px", color: "rgba(255,255,255,0.38)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            View All Plans →
          </button>
        </div>
      )}
    </DashCard>
    {selectedTrip && (
      <TripDetailModal
        trip={selectedTrip}
        currentUser={currentUser}
        onClose={() => setSelectedTrip(null)}
        onUpdate={() => {}}
      />
    )}
    </>
  )
}

// ── Panel 3: Leaderboard Ticker ───────────────────────────────────────────────

const MEDALS = ["🥇", "🥈", "🥉"]

function LeaderboardTicker({ currentUser }) {
  const [entries, setEntries] = useState([])
  const season = getCurrentSeason()

  useEffect(() => {
    if (!currentUser) return
    getLeaderboard(season.startYear)
      .then(data => {
        const sorted = [...data].sort((a, b) => b.days - a.days).filter(e => e.days > 0 || e.isMe).slice(0, 25)
        setEntries(sorted)
      })
      .catch(() => {})
  }, [currentUser, season.startYear])

  if (entries.length === 0) return null

  const doubled = [...entries, ...entries]
  // ~180px per item × 25 items = ~4500px; move at ~75px/s → ~60s for one full pass
  const duration = Math.max(30, entries.length * 2.5)

  return (
    <DashCard style={{ height: 58, borderRadius: 14, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", height: "100%", overflow: "hidden" }}>
        {/* Static label */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "0 18px", borderRight: "1px solid rgba(255,255,255,0.08)",
          height: "100%", flexShrink: 0,
          background: "rgba(251,191,36,0.08)",
        }}>
          <span style={{ fontSize: 15 }}>🏆</span>
          <div>
            <div style={{ fontSize: 10, fontWeight: 900, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 0.9, whiteSpace: "nowrap" }}>
              Friend Leaderboard
            </div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}>
              {season.label} Season · Days
            </div>
          </div>
        </div>

        {/* Scrolling track */}
        <div style={{ flex: 1, overflow: "hidden", height: "100%", position: "relative" }}>
          <div
            className="ticker-track"
            style={{
              display: "flex",
              alignItems: "center",
              height: "100%",
              width: "max-content",
              animation: `ticker-scroll ${duration}s linear infinite`,
            }}
          >
            {doubled.map((entry, idx) => {
              const rank = idx % entries.length
              return (
                <div
                  key={`${entry.id}-${idx}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "0 22px",
                    height: "100%",
                    borderRight: "1px solid rgba(255,255,255,0.05)",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 15, flexShrink: 0 }}>
                    {rank < 3 ? MEDALS[rank] : <span style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.4)" }}>#{rank + 1}</span>}
                  </span>
                  <Avatar profile={entry} size={28} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: entry.isMe ? 900 : 600, color: entry.isMe ? "#60a5fa" : "white", whiteSpace: "nowrap" }}>
                      {entry.full_name || entry.username || "Skier"}
                      {entry.isMe && <span style={{ fontSize: 10, marginLeft: 5, color: "#60a5fa", opacity: 0.7 }}>YOU</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", whiteSpace: "nowrap" }}>
                      {entry.days} {entry.days === 1 ? "day" : "days"}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </DashCard>
  )
}

// ── Panels 4+5: Messaging ─────────────────────────────────────────────────────

function MessagingWidget({ currentUser }) {
  const [allConvs, setAllConvs]       = useState([])   // merged crews + trips sorted by recency
  const [selected, setSelected]       = useState(null)  // { type: "crew"|"trip", data: {...} }
  const [friends, setFriends]         = useState([])
  const [loading, setLoading]         = useState(true)
  const channelRef = useRef(null)

  const loadConversations = useCallback(async () => {
    if (!currentUser?.id) { setLoading(false); return }
    try {
      const [crews, friendList, trips, dms] = await Promise.all([
        getMyCrews(),
        getAcceptedFriends(),
        getMyTripConversations(currentUser.id),
        getDMConversations().catch(() => []),
      ])
      setFriends(friendList || [])

      // ── Crew last messages ──
      let crewConvs = []
      if (crews.length > 0) {
        const crewIds = crews.map(c => c.id)
        const { data: msgs } = await supabase
          .from("crew_messages")
          .select("crew_id, content, is_system, created_at, profile:user_id(full_name, username)")
          .in("crew_id", crewIds)
          .order("created_at", { ascending: false })
          .limit(Math.min(crewIds.length * 6, 120))
        const lastMsgMap = {}
        for (const m of (msgs || [])) {
          if (!lastMsgMap[m.crew_id]) lastMsgMap[m.crew_id] = m
        }
        crewConvs = crews.map(crew => {
          const lastMessage = lastMsgMap[crew.id] || null
          const lastRead = getLastRead(crew.id)
          const unread = lastMessage && (!lastRead || new Date(lastMessage.created_at) > new Date(lastRead))
          return { type: "crew", id: crew.id, name: crew.name, emoji: crew.emoji, lastMessage, lastComment: null, unread, data: crew, _ts: new Date(lastMessage?.created_at || crew.created_at).getTime() }
        })
      }

      // ── Trip last comments ──
      let tripConvs = []
      if (trips.length > 0) {
        const tripIds = trips.map(t => t.id)
        const { data: comments } = await supabase
          .from("trip_comments")
          .select("trip_id, content, user_id, created_at")
          .in("trip_id", tripIds)
          .order("created_at", { ascending: false })
          .limit(Math.min(tripIds.length * 6, 120))
        const lastCommentMap = {}
        for (const c of (comments || [])) {
          if (!lastCommentMap[c.trip_id]) lastCommentMap[c.trip_id] = c
        }
        // Enrich with sender names
        const senderIds = [...new Set(Object.values(lastCommentMap).map(c => c.user_id))]
        let senderMap = {}
        if (senderIds.length) {
          const { data: senders } = await supabase.from("profiles").select("id, full_name, username").in("id", senderIds)
          senderMap = Object.fromEntries((senders || []).map(p => [p.id, p]))
        }
        tripConvs = trips.map(trip => {
          const lastComment = lastCommentMap[trip.id]
            ? { ...lastCommentMap[trip.id], profile: senderMap[lastCommentMap[trip.id].user_id] || null }
            : null
          const lastRead = getLastRead("trip_" + trip.id)
          const unread = lastComment && (!lastRead || new Date(lastComment.created_at) > new Date(lastRead))
          return { type: "trip", id: trip.id, name: tripDisplayName(trip), emoji: "🎿", lastMessage: lastComment, lastComment, unread, data: trip, _ts: new Date(lastComment?.created_at || trip.ski_date).getTime() }
        })
      }

      // ── DM conversations ──
      const dmConvs = (dms || []).map(d => ({
        type: "dm",
        id: d.partnerId,
        partnerId: d.partnerId,
        partner: d.partner,
        name: d.partner?.full_name || d.partner?.username || "Friend",
        emoji: null,
        lastMessage: d.lastMessage,
        unread: d.unread,
        data: d,
        _ts: new Date(d.lastMessage?.created_at || 0).getTime(),
      }))

      // Merge and sort by most recent activity
      const merged = [...crewConvs, ...tripConvs, ...dmConvs].sort((a, b) => b._ts - a._ts)
      setAllConvs(merged)
    } catch (e) {
      console.warn("MessagingWidget load error:", e)
    } finally {
      setLoading(false)
    }
  }, [currentUser?.id])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (!currentUser?.id) return
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    channelRef.current = supabase
      .channel("home-dash-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "crew_messages" }, () => loadConversations())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "trip_comments" }, () => loadConversations())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, () => loadConversations())
      .subscribe()
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [currentUser?.id, loadConversations])

  function openConv(conv) {
    if (conv.type === "dm") {
      markDMsRead(conv.partnerId).catch(() => {})
    } else {
      markRead(conv.type === "trip" ? "trip_" + conv.id : conv.id)
    }
    setAllConvs(prev => prev.map(c => c.id === conv.id && c.type === conv.type ? { ...c, unread: false } : c))
    setSelected(conv)
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 2.2fr", gap: 16, minHeight: 320 }}>

      {/* Panel 4: Conversation list */}
      <DashCard>
        <CardHeader title="💬 Messages" />
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!currentUser ? (
            <EmptyState icon="💬" text="Sign in to chat" />
          ) : loading ? (
            <EmptyState icon="⏳" text="Loading…" />
          ) : allConvs.length === 0 ? (
            <EmptyState icon="💬" text="No conversations yet" sub="Join a crew or create a ski plan" />
          ) : allConvs.map((conv) => {
            const active = selected?.id === conv.id && selected?.type === conv.type
            const lastMsg = conv.lastMessage
            const preview = (() => {
              if (!lastMsg) return "No messages yet"
              const content = lastMsg.content || ""
              const truncated = content.length > 32 ? content.slice(0, 32) + "…" : content
              if (conv.type === "dm") {
                const isMe = lastMsg.sender_id === currentUser?.id
                return isMe ? `You: ${truncated}` : truncated
              }
              const sender = lastMsg.profile?.full_name?.split(" ")[0] || lastMsg.profile?.username || "Someone"
              return `${sender}: ${truncated}`
            })()
            const avatarName = conv.partner?.full_name || conv.partner?.username || "?"
            return (
              <div
                key={`${conv.type}-${conv.id}`}
                onClick={() => openConv(conv)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderLeft: `3px solid ${active ? "#60a5fa" : "transparent"}`, borderBottom: "1px solid rgba(255,255,255,0.04)", background: active ? "rgba(96,165,250,0.1)" : "transparent", cursor: "pointer", transition: "background 0.12s" }}
                className="conv-row"
              >
                <div style={{ position: "relative", flexShrink: 0 }}>
                  {conv.type === "dm" ? (
                    conv.partner?.avatar_url
                      ? <img src={conv.partner.avatar_url} alt={avatarName} style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover" }} />
                      : <div style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,rgba(37,99,235,0.5),rgba(8,145,178,0.5))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "white" }}>{avatarName.charAt(0).toUpperCase()}</div>
                  ) : (
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: conv.type === "trip" ? "linear-gradient(135deg,rgba(251,191,36,0.2),rgba(234,88,12,0.15))" : "linear-gradient(135deg,rgba(37,99,235,0.2),rgba(8,145,178,0.15))", border: `1px solid ${conv.type === "trip" ? "rgba(251,191,36,0.2)" : "rgba(96,165,250,0.15)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                      {conv.emoji}
                    </div>
                  )}
                  {conv.unread && !active && (
                    <div style={{ position: "absolute", top: -2, right: -2, width: 9, height: 9, borderRadius: "50%", background: "#3b82f6", border: "2px solid rgba(6,10,22,1)" }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4, marginBottom: 2 }}>
                    <div style={{ fontWeight: conv.unread ? 800 : 600, fontSize: 13, color: active ? "#93c5fd" : "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {conv.name}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>
                      {timeAgo(lastMsg?.created_at)}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: conv.unread ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.33)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {preview}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </DashCard>

      {/* Panel 5: Message thread */}
      <DashCard>
        {selected?.type === "dm" ? (
          <DirectMessageView
            partner={selected.partner}
            partnerId={selected.partnerId}
            currentUser={currentUser}
            onBack={null}
          />
        ) : selected?.type === "crew" ? (
          <CrewChatView
            crew={selected.data}
            currentUserId={currentUser?.id}
            friends={friends}
            onBack={null}
            onLeft={() => { setSelected(null); loadConversations() }}
          />
        ) : selected?.type === "trip" ? (
          <TripChatView
            trip={selected.data}
            currentUser={currentUser}
            onBack={null}
          />
        ) : (
          <EmptyState icon="💬" text="Select a conversation" sub="Choose a chat from the left" />
        )}
      </DashCard>
    </div>
  )
}

// ── Mobile: Crew list (tap → Friends tab) ────────────────────────────────────

function MobileCrewListWidget({ currentUser, onTabChange }) {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentUser) { setLoading(false); return }
    ;(async () => {
      try {
        const crews = await getMyCrews()
        if (!crews.length) { setConversations([]); setLoading(false); return }

        const crewIds = crews.map(c => c.id)
        const { data: msgs } = await supabase
          .from("crew_messages")
          .select("crew_id, content, is_system, created_at, profile:user_id(full_name, username)")
          .in("crew_id", crewIds)
          .order("created_at", { ascending: false })
          .limit(Math.min(crewIds.length * 6, 120))

        const lastMsgMap = {}
        for (const m of (msgs || [])) {
          if (!lastMsgMap[m.crew_id]) lastMsgMap[m.crew_id] = m
        }

        const enriched = crews.map(crew => {
          const lastMessage = lastMsgMap[crew.id] || null
          const lastRead = getLastRead(crew.id)
          const unread = lastMessage && (!lastRead || new Date(lastMessage.created_at) > new Date(lastRead))
          return { ...crew, lastMessage, unread }
        }).sort((a, b) =>
          new Date(b.lastMessage?.created_at || b.created_at) -
          new Date(a.lastMessage?.created_at || a.created_at)
        ).slice(0, 4)

        setConversations(enriched)
      } catch (e) {
        console.warn("MobileCrewListWidget:", e)
      } finally {
        setLoading(false)
      }
    })()
  }, [currentUser])

  return (
    <DashCard>
      <CardHeader
        title="💬 Messages"
        action={
          <button
            onClick={() => onTabChange("friends")}
            style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "4px 8px", borderRadius: 8 }}
          >
            Open →
          </button>
        }
      />
      <div>
        {!currentUser ? (
          <EmptyState icon="💬" text="Sign in to see messages" />
        ) : loading ? (
          <EmptyState icon="⏳" text="Loading…" />
        ) : conversations.length === 0 ? (
          <EmptyState icon="💬" text="No crew chats yet" sub="Join a crew to get started" />
        ) : conversations.map((crew, i) => {
          const lastMsg = crew.lastMessage
          const preview = (() => {
            if (!lastMsg) return "No messages yet"
            const sender = lastMsg.profile?.full_name?.split(" ")[0] || lastMsg.profile?.username || "Someone"
            const content = lastMsg.content || ""
            return `${sender}: ${content.length > 42 ? content.slice(0, 42) + "…" : content}`
          })()
          return (
            <div
              key={crew.id}
              onClick={() => onTabChange("friends")}
              className="conv-row"
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "13px 16px",
                borderBottom: i < conversations.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                cursor: "pointer",
              }}
            >
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: "linear-gradient(135deg,rgba(37,99,235,0.2),rgba(8,145,178,0.15))",
                  border: "1px solid rgba(96,165,250,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                }}>
                  {crew.emoji}
                </div>
                {crew.unread && (
                  <div style={{ position: "absolute", top: -2, right: -2, width: 10, height: 10, borderRadius: "50%", background: "#3b82f6", border: "2px solid rgba(6,10,22,1)" }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4, marginBottom: 3 }}>
                  <div style={{ fontWeight: crew.unread ? 800 : 600, fontSize: 14, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {crew.name}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", flexShrink: 0 }}>
                    {timeAgo(lastMsg?.created_at)}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {preview}
                </div>
              </div>
              <div style={{ fontSize: 16, color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>›</div>
            </div>
          )
        })}
      </div>
    </DashCard>
  )
}

// ── Ski Ping CTA ──────────────────────────────────────────────────────────────

function PingCta({ currentUser }) {
  const [open, setOpen] = useState(false)
  const [friends, setFriends] = useState(null)

  if (!currentUser) return null

  async function handleOpen() {
    setOpen(true)
    if (!friends) {
      getAcceptedFriends().then(setFriends).catch(() => setFriends([]))
    }
  }

  return (
    <>
      <div style={{ textAlign: "center", padding: "4px 0 2px" }}>
        <button
          onClick={handleOpen}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#60a5fa", fontSize: 13, fontWeight: 700,
            textDecoration: "underline", textUnderlineOffset: 3,
            padding: "6px 12px",
          }}
        >
          👋 Ping a friend to ski →
        </button>
      </div>
      {open && friends !== null && (
        <SkiPingComposer
          friends={friends}
          onClose={() => setOpen(false)}
          onSent={() => setOpen(false)}
        />
      )}
    </>
  )
}

// ── Offseason launch banner ───────────────────────────────────────────────────

function OffseasonBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("pd_offseason_banner_26") === "1" } catch { return false }
  })

  if (dismissed) return null

  return (
    <div style={{
      position: "relative",
      background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f2744 100%)",
      border: "1px solid rgba(96,165,250,0.3)",
      borderRadius: 20,
      padding: "20px 48px 20px 24px",
      display: "flex",
      alignItems: "flex-start",
      gap: 16,
    }}>
      {/* Snowflake accent */}
      <div style={{ fontSize: 36, flexShrink: 0, lineHeight: 1 }}>❄️</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: 1.2,
          color: "#60a5fa", textTransform: "uppercase", marginBottom: 6,
        }}>
          Colorado Season Wrap — Winter 2025/26
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 6, lineHeight: 1.4 }}>
          The mountains are closing for the summer. See you on the slopes this fall! ⛷️
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
          PowderDays is officially launching for the <span style={{ color: "#93c5fd", fontWeight: 700 }}>2026/27 season</span>.
          Invite your crew now — resort conditions, trip planning, and leaderboards
          will be live when the lifts spin up in <span style={{ color: "#93c5fd", fontWeight: 700 }}>November 2026</span>.
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.25)",
            borderRadius: 20, padding: "5px 14px",
            fontSize: 12, fontWeight: 700, color: "#93c5fd",
          }}>
            🎿 Rope Drops Winter 2026
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
            borderRadius: 20, padding: "5px 14px",
            fontSize: 12, fontWeight: 700, color: "#6ee7b7",
          }}>
            11 Colorado Resorts Tracked
          </div>
        </div>
      </div>

      {/* Dismiss button */}
      <button
        onClick={() => {
          try { localStorage.setItem("pd_offseason_banner_26", "1") } catch {}
          setDismissed(true)
        }}
        style={{
          position: "absolute", top: 12, right: 12,
          background: "none", border: "none", cursor: "pointer",
          color: "rgba(255,255,255,0.35)", fontSize: 18, lineHeight: 1,
          padding: 4, borderRadius: 6,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

// ── Mobile layout ─────────────────────────────────────────────────────────────

function MobileHomeDashboard({ resorts, currentUser, onTabChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <OffseasonBanner />
      <ConditionsWidget resorts={resorts} onTabChange={onTabChange} />
      <PlansWidget currentUser={currentUser} resorts={resorts} onTabChange={onTabChange} />
      <LeaderboardTicker currentUser={currentUser} />
      <MobileCrewListWidget currentUser={currentUser} onTabChange={onTabChange} />
      <PingCta currentUser={currentUser} />
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function HomeDashboard({ resorts, currentUser, onTabChange }) {
  const isMobile = useMobile()

  if (isMobile) {
    return <MobileHomeDashboard resorts={resorts} currentUser={currentUser} onTabChange={onTabChange} />
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Offseason launch banner */}
      <OffseasonBanner />

      {/* Row 1: Conditions + Plans */}
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 16, minHeight: 260 }}>
        <ConditionsWidget resorts={resorts} onTabChange={onTabChange} />
        <PlansWidget currentUser={currentUser} resorts={resorts} onTabChange={onTabChange} />
      </div>

      {/* Row 2: Leaderboard ticker */}
      <LeaderboardTicker currentUser={currentUser} />

      {/* Row 3: Crew chat list + message thread */}
      <MessagingWidget currentUser={currentUser} />

      {/* Ping CTA */}
      <PingCta currentUser={currentUser} />
    </div>
  )
}
