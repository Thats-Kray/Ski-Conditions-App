import { useCallback, useEffect, useRef, useState } from "react"
import {
  getAllVisibleTrips,
  getCurrentUser,
  getMyCrews,
  getCrewMembers,
  getVisiblePlansInRange,
} from "../lib/socialApi"
import { monthBounds } from "../lib/calendarDates"
import TripCard from "./TripCard"
import CreateTripModal from "./CreateTripModal"
import TripDetailModal from "./TripDetailModal"
import PlanCalendar from "./PlanCalendar"
import { resortName, resortEmoji } from "../lib/resorts"
import { formatDate } from "../lib/format"
import Avatar from "./ui/Avatar"
import AvatarStatusRail from "./ui/AvatarStatusRail"

/* ── Compact upcoming trip strip ───────────────────────────────────── */
function UpcomingStrip({ trips, invitedTrips, currentUser, onOpen }) {
  const allCards = [
    ...trips.map((t) => ({ ...t, _role: "mine" })),
    ...invitedTrips.map((t) => ({ ...t, _role: "invited" })),
  ].sort((a, b) => (a.ski_date || "").localeCompare(b.ski_date || "")).slice(0, 3)

  if (!allCards.length) return null

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.38)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
        Upcoming Trips
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6, scrollbarWidth: "none" }}>
        {allCards.map((trip) => {
          // Kept literal: feeds hex-alpha-suffix template literals below
          // (`${accent}22`/`44`) — var() references break when concatenated
          // with a hex alpha suffix (same constraint as DOT_COLORS below,
          // SKILL_OPTIONS/TYPE_META precedent from Tasks 6/8).
          const accent = trip._role === "invited" ? "#60a5fa" : "#22c55e"
          const going = (trip.rsvps || []).filter((r) => r.status === "going").length
          return (
            <button
              key={trip.id}
              onClick={() => onOpen(trip)}
              style={{
                flexShrink: 0,
                width: 170,
                background: trip._role === "invited" ? "rgba(96,165,250,0.07)" : "rgba(255,255,255,0.05)",
                border: `1.5px solid ${trip._role === "invited" ? "rgba(96,165,250,0.3)" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 16,
                padding: "12px 14px",
                textAlign: "left",
                cursor: "pointer",
                display: "grid",
                gap: 7,
                transition: "transform 0.15s, box-shadow 0.15s",
              }}
              className="strip-card"
            >
              <div style={{ fontSize: 22 }}>{resortEmoji(trip.resort_key)}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "white", lineHeight: 1.2 }}>
                {resortName(trip.resort_key) || trip.resort_key}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{formatDate(trip.ski_date)}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex" }}>
                  {(trip.rsvps || []).filter((r) => r.status === "going").slice(0, 4).map((r, i) => (
                    <div key={r.id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                      <Avatar profile={r.profile} size={20} />
                    </div>
                  ))}
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  background: `${accent}22`, border: `1px solid ${accent}44`,
                  color: accent, borderRadius: 999, padding: "2px 7px",
                }}>
                  {trip._role === "invited" ? "Invited" : going > 0 ? `${going} going` : "Host"}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Calendar view ─────────────────────────────────────────────────── */
// Dot colors kept as literal hex: they feed `${color}11`/`33` alpha-suffix
// template literals below, and var() references break when concatenated with a
// hex alpha suffix (same constraint as SKILL_OPTIONS / TYPE_META).
const DOT_COLORS = { mine: "#60a5fa", going: "#22c55e", invited: "#fbbf24", friend: "#a78bfa", daily: "#67e8f9" }
const DOT_LABELS = { mine: "Your Trip", going: "Going", invited: "Invited", friend: "Friend's Trip", daily: "Check-in" }

function CalendarView({ myTrips, rsvpdTrips, invitedTrips, friendsTrips, skiPlans, currentUserId, onOpenTrip, onMonthChange }) {
  const [selectedDate, setSelectedDate] = useState(null)

  const entriesByDate = new Map()
  function addToDate(date, entry) {
    if (!date) return
    const key = date.slice(0, 10)
    if (!entriesByDate.has(key)) entriesByDate.set(key, [])
    entriesByDate.get(key).push(entry)
  }
  myTrips.forEach((t) => addToDate(t.ski_date, { ...t, _role: "mine" }))
  rsvpdTrips.forEach((t) => addToDate(t.ski_date, { ...t, _role: "going" }))
  invitedTrips.forEach((t) => addToDate(t.ski_date, { ...t, _role: "invited" }))
  friendsTrips.forEach((t) => addToDate(t.ski_date, { ...t, _role: "friend" }))
  skiPlans.forEach((p) => addToDate(p.ski_date, { ...p, _role: "daily" }))

  return (
    <PlanCalendar
      entriesByDate={entriesByDate}
      dotColorFor={(e) => DOT_COLORS[e._role]}
      legend={Object.entries(DOT_COLORS).map(([role, color]) => ({ color, label: DOT_LABELS[role] }))}
      selectedDate={selectedDate}
      onSelectDay={setSelectedDate}
      onMonthChange={onMonthChange}
      renderDayDetail={(dateKey, entries) => (
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 16px", display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.7)" }}>
            {formatDate(dateKey)}
          </div>
          {entries.length === 0 ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Nothing planned this day.</div>
          ) : entries.map((t, i) => {
            const isTrip = Boolean(t.id) && t._role !== "daily"
            const isSomeoneElsesPlan = t._role === "daily" && t.profile && t.user_id !== currentUserId
            return (
              <button
                key={t.id || i}
                onClick={() => isTrip && onOpenTrip(t)}
                style={{
                  background: `${DOT_COLORS[t._role]}11`,
                  border: `1px solid ${DOT_COLORS[t._role]}33`,
                  borderLeft: `3px solid ${DOT_COLORS[t._role]}`,
                  borderRadius: "0 12px 12px 0",
                  padding: "10px 14px",
                  textAlign: "left",
                  cursor: isTrip ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 18 }}>{resortEmoji(t.resort_key)}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>
                    {isSomeoneElsesPlan
                      ? `${t.profile.first_name || t.profile.username || "Someone"} → ${resortName(t.resort_key) || t.resort_key}`
                      : (t.title || resortName(t.resort_key) || t.resort_key)}
                  </div>
                  <div style={{ fontSize: 11, color: DOT_COLORS[t._role], fontWeight: 700, marginTop: 2 }}>
                    {DOT_LABELS[t._role]}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    />
  )
}


/* ── Main page ─────────────────────────────────────────────────────── */
export default function SkiPlansPage({ onRequireLogin, resorts }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [myTrips, setMyTrips] = useState([])
  const [rsvpdTrips, setRsvpdTrips] = useState([])
  const [friendsTrips, setFriendsTrips] = useState([])
  const [invitedTrips, setInvitedTrips] = useState([])
  const [deletedIds, setDeletedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [stripTrip, setStripTrip] = useState(null)
  const [subTab, setSubTab] = useState("trips")

  // ── Shared calendar scope (Sprint 34) ──
  const [crews, setCrews] = useState([])                          // [{ id, name, emoji }]
  const [crewMemberIds, setCrewMemberIds] = useState(new Map())   // crewId -> Set(userId)
  const [scopes, setScopes] = useState(() => new Set(["me", "friends"]))
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [visiblePlans, setVisiblePlans] = useState([])

  const loadTrips = useCallback(async () => {
    try {
      const { mine, friends, rsvpd, invited } = await getAllVisibleTrips()
      setMyTrips(mine)
      setRsvpdTrips(rsvpd)
      setFriendsTrips(friends)
      setInvitedTrips(invited || [])
    } catch (e) {
      console.warn("Trips load failed:", e)
    }
  }, [])

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      setCurrentUser(user)
      if (user) {
        await Promise.allSettled([
          loadTrips(),
          getMyCrews()
            .then(async (rows) => {
              setCrews(rows || [])
              const pairs = await Promise.all(
                (rows || []).map(async (c) => {
                  const members = await getCrewMembers(c.id).catch(() => [])
                  // The user id lives at m.profile.id — getCrewMembers selects
                  // `profile:user_id (...)` and returns no bare user_id column;
                  // m.id is the crew_members row id, not a user.
                  return [c.id, new Set(members.map((m) => m.profile?.id).filter(Boolean))]
                })
              )
              setCrewMemberIds(new Map(pairs))
            })
            .catch(() => {}),
        ])
      }
      setLoading(false)
    }
    init()
  }, [loadTrips])

  // Plans visible to me for the month the calendar is showing. RLS decides who
  // is included (own + non-private rows of friends/active crewmates); the crew
  // chips below are a display lens over rows already authorized server-side.
  useEffect(() => {
    // Plain guard, no setState here — scopedPlans below already yields [] when
    // there is no signed-in user, and setting state synchronously in an effect
    // trips react-hooks/set-state-in-effect.
    if (!currentUser) return
    let cancelled = false
    const { start, end } = monthBounds(calMonth)
    getVisiblePlansInRange(start, end)
      .then((rows) => { if (!cancelled) setVisiblePlans(rows) })
      .catch(() => { if (!cancelled) setVisiblePlans([]) })
    return () => { cancelled = true }
  }, [calMonth, currentUser])

  const scopedPlans = !currentUser ? [] : visiblePlans.filter((p) => {
    if (p.user_id === currentUser?.id) return scopes.has("me")
    if (scopes.has("friends")) return true
    for (const s of scopes) {
      if (!s.startsWith("crew:")) continue
      if (crewMemberIds.get(s.slice(5))?.has(p.user_id)) return true
    }
    return false
  })

  function handleCreateClick() {
    if (!currentUser) { onRequireLogin?.(); return }
    setShowCreate(true)
  }

  const seenIds = new Set()
  const flatTrips = [
    ...invitedTrips.map((t) => ({ ...t, _isInvited: true })),
    ...myTrips.map((t) => ({ ...t, _isInvited: false })),
    ...rsvpdTrips.map((t) => ({ ...t, _isInvited: false })),
    ...friendsTrips.map((t) => ({ ...t, _isInvited: false })),
  ].filter((t) => {
    if (seenIds.has(t.id) || deletedIds.has(t.id)) return false
    seenIds.add(t.id)
    return true
  }).sort((a, b) => (a.ski_date || "").localeCompare(b.ski_date || ""))

  const SUB_TABS = [
    { key: "trips",    label: "🎿 Trips" },
    { key: "calendar", label: "📅 Calendar" },
  ]

  return (
    <div style={{ paddingBottom: 48 }}>
      <style>{`
        .strip-card:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,0,0,0.5); }
        .plan-cta:hover { transform: translateY(-2px); box-shadow: 0 12px 36px rgba(37,99,235,0.5) !important; }
        .trip-card:hover { transform: translateY(-3px); box-shadow: 0 36px 90px rgba(0,0,0,0.65) !important; }
        .hype-btn:hover { transform: scale(1.22) !important; background: rgba(255,255,255,0.13) !important; }
        @media (max-width: 767px) {
          .plan-cta {
            width: 100%;
            justify-content: center;
            padding: 14px 20px !important;
            font-size: 15px !important;
            box-shadow: 0 8px 24px rgba(37,99,235,0.35) !important;
          }
        }
      `}</style>

      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 999, padding: "5px 11px", fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 10 }}>
            🎿 Ski Plans
          </div>
          <h2 style={{ margin: 0, fontSize: 32, fontWeight: 900, letterSpacing: -0.7, lineHeight: 1.05 }}>Plans</h2>
          <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.48)", fontSize: 14 }}>
            Trips, today's crew, and your whole season at a glance
          </p>
        </div>

        <button
          onClick={handleCreateClick}
          className="plan-cta"
          style={{
            background: "var(--gradient-cta)",
            color: "white", border: "none", borderRadius: 14,
            padding: "13px 20px", fontSize: 14, fontWeight: 900,
            cursor: "pointer", boxShadow: "0 8px 28px rgba(37,99,235,0.42)",
            display: "flex", alignItems: "center", gap: 7,
            transition: "transform 0.15s, box-shadow 0.15s", flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 16 }}>+</span> New Trip
        </button>
      </div>

      {/* ── Upcoming strip ── */}
      {!loading && currentUser && (
        <UpcomingStrip
          trips={myTrips}
          invitedTrips={invitedTrips}
          currentUser={currentUser}
          onOpen={setStripTrip}
        />
      )}

      {/* ── Active crew rail ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.38)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
          Active Crew
        </div>
        <AvatarStatusRail />
      </div>

      {/* ── Sub-tab selector ── */}
      <div style={{
        display: "flex", gap: 4, background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14,
        padding: 4, marginBottom: 24, width: "fit-content",
      }}>
        {SUB_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            style={{
              padding: "8px 16px", borderRadius: 10,
              background: subTab === key ? "rgba(255,255,255,0.12)" : "transparent",
              border: subTab === key ? "1px solid rgba(255,255,255,0.14)" : "1px solid transparent",
              color: subTab === key ? "white" : "rgba(255,255,255,0.5)",
              fontWeight: subTab === key ? 800 : 600,
              fontSize: 13, cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Trips tab ── */}
      {subTab === "trips" && (
        <>
          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Loading trips…</div>
          ) : !currentUser ? (
            <div style={{ borderRadius: 24, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "48px 28px", textAlign: "center", display: "grid", gap: 16, justifyItems: "center" }}>
              <div style={{ fontSize: 38 }}>🎿</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>Sign in to see your trips</div>
              <button onClick={() => onRequireLogin?.()} style={{ background: "var(--gradient-cta)", color: "white", border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>Sign In</button>
            </div>
          ) : flatTrips.length === 0 ? (
            <div style={{ borderRadius: 24, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "52px 28px", textAlign: "center", display: "grid", gap: 18, justifyItems: "center" }}>
              <div style={{ fontSize: 38 }}>🏔️</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "white" }}>No ski trips yet</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.48)", maxWidth: 340, lineHeight: 1.6 }}>Create a trip, pick a mountain, then let your crew RSVP in one tap.</div>
              <button onClick={handleCreateClick} style={{ background: "var(--gradient-cta)", color: "white", border: "none", borderRadius: 14, padding: "13px 28px", fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 28px rgba(37,99,235,0.4)" }}>
                Plan a Trip 🎿
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {invitedTrips.length > 0 && (
                <div style={{
                  background: "rgba(96,165,250,0.07)",
                  border: "1px solid rgba(96,165,250,0.25)",
                  borderLeft: "4px solid var(--color-accent-soft)",
                  borderRadius: 14,
                  padding: "13px 18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-banner-highlight)" }}>
                    ✉️ You have {invitedTrips.length} trip invite{invitedTrips.length > 1 ? "s" : ""}
                  </span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Respond below ↓</span>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                {flatTrips.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    currentUser={currentUser}
                    onUpdate={loadTrips}
                    onRequireLogin={onRequireLogin}
                    isInvited={trip._isInvited}
                    onDeleted={() => { setDeletedIds((p) => new Set([...p, trip.id])); loadTrips() }}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Calendar tab ── */}
      {subTab === "calendar" && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "20px 18px" }}>

          {/* Scope chips — "where is this crew skiing this weekend?" */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {[
              { key: "me", label: "🙋 Me" },
              { key: "friends", label: "👥 All Friends" },
              ...crews.map((c) => ({ key: `crew:${c.id}`, label: `${c.emoji || "🤙"} ${c.name}` })),
            ].map(({ key, label }) => {
              const on = scopes.has(key)
              return (
                <button
                  key={key}
                  onClick={() => setScopes((prev) => {
                    const next = new Set(prev)
                    if (next.has(key)) next.delete(key); else next.add(key)
                    return next
                  })}
                  style={{
                    borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700,
                    border: on ? "1px solid rgba(56,189,248,0.5)" : "1px solid rgba(255,255,255,0.12)",
                    background: on ? "rgba(56,189,248,0.25)" : "transparent",
                    color: on ? "white" : "rgba(255,255,255,0.5)",
                    cursor: "pointer", minHeight: 44,
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {scopedPlans.length === 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>
              {scopes.size === 0
                ? "Pick at least one group above to see plans."
                : "No one in the selected groups has plans this month."}
            </div>
          )}

          <CalendarView
            myTrips={myTrips}
            rsvpdTrips={rsvpdTrips}
            invitedTrips={invitedTrips}
            friendsTrips={friendsTrips}
            skiPlans={scopedPlans}
            currentUserId={currentUser?.id}
            onOpenTrip={setStripTrip}
            onMonthChange={setCalMonth}
          />
        </div>
      )}

      {/* Strip detail modal */}
      {stripTrip && (
        <TripDetailModal
          trip={stripTrip}
          currentUser={currentUser}
          onClose={() => setStripTrip(null)}
          onUpdate={() => { loadTrips(); }}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateTripModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadTrips() }}
        />
      )}
    </div>
  )
}
