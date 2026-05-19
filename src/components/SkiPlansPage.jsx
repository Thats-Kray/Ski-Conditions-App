import { useCallback, useEffect, useRef, useState } from "react"
import { getAllVisibleTrips, getCurrentUser, getMySkiPlans } from "../lib/socialApi"
import TripCard from "./TripCard"
import CreateTripModal from "./CreateTripModal"
import TripDetailModal from "./TripDetailModal"
import SkiCheckInForm from "./SkiCheckInForm"
import TodaysCrew from "./TodaysCrew"
import { resortName, resortEmoji } from "../lib/resorts"
import { formatDate } from "../lib/format"
import Avatar from "./ui/Avatar"

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
        Your Upcoming Plans
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6, scrollbarWidth: "none" }}>
        {allCards.map((trip) => {
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
function CalendarView({ myTrips, rsvpdTrips, invitedTrips, friendsTrips, skiPlans, currentUser, onOpenTrip }) {
  const today = new Date()
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  const yr = viewDate.getFullYear()
  const mo = viewDate.getMonth()
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })

  const firstDow = new Date(yr, mo, 1).getDay()
  const daysInMonth = new Date(yr, mo + 1, 0).getDate()

  // Map trips to dates
  const tripsByDate = new Map()
  function addToDate(date, entry) {
    if (!date) return
    const key = date.slice(0, 10)
    if (!tripsByDate.has(key)) tripsByDate.set(key, [])
    tripsByDate.get(key).push(entry)
  }
  myTrips.forEach((t) => addToDate(t.ski_date, { ...t, _role: "mine" }))
  rsvpdTrips.forEach((t) => addToDate(t.ski_date, { ...t, _role: "going" }))
  invitedTrips.forEach((t) => addToDate(t.ski_date, { ...t, _role: "invited" }))
  friendsTrips.forEach((t) => addToDate(t.ski_date, { ...t, _role: "friend" }))
  skiPlans.forEach((p) => addToDate(p.ski_date, { ...p, _role: "daily", resort_key: p.resort_key }))

  const [selectedDate, setSelectedDate] = useState(null)
  const selectedTrips = selectedDate ? (tripsByDate.get(selectedDate) || []) : []

  const DOT_COLORS = { mine: "#60a5fa", going: "#22c55e", invited: "#fbbf24", friend: "#a78bfa", daily: "#67e8f9" }
  const DOT_LABELS = { mine: "Your Trip", going: "Going", invited: "Invited", friend: "Friend's Trip", daily: "Check-in" }

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button
          onClick={() => setViewDate(new Date(yr, mo - 1, 1))}
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "6px 12px", color: "white", cursor: "pointer", fontWeight: 700 }}
        >
          ‹
        </button>
        <div style={{ fontWeight: 900, fontSize: 16, color: "white" }}>{monthLabel}</div>
        <button
          onClick={() => setViewDate(new Date(yr, mo + 1, 1))}
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "6px 12px", color: "white", cursor: "pointer", fontWeight: 700 }}
        >
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", padding: "4px 0" }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />
          const dateKey = `${yr}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
          const dayTrips = tripsByDate.get(dateKey) || []
          const isToday = today.getDate() === day && today.getMonth() === mo && today.getFullYear() === yr
          const isSelected = selectedDate === dateKey
          const isWeekend = new Date(yr, mo, day).getDay() === 0 || new Date(yr, mo, day).getDay() === 6
          const hasPlan = dayTrips.length > 0

          return (
            <button
              key={dateKey}
              onClick={() => setSelectedDate(isSelected ? null : dateKey)}
              style={{
                padding: "6px 4px 8px",
                borderRadius: 10,
                border: isSelected
                  ? "1.5px solid #60a5fa"
                  : isToday
                  ? "1.5px solid rgba(255,255,255,0.25)"
                  : "1.5px solid transparent",
                background: isSelected
                  ? "rgba(96,165,250,0.15)"
                  : hasPlan && isWeekend
                  ? "rgba(255,255,255,0.07)"
                  : hasPlan
                  ? "rgba(255,255,255,0.04)"
                  : "transparent",
                cursor: hasPlan ? "pointer" : "default",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                minHeight: 46,
              }}
            >
              <span style={{
                fontSize: 13,
                fontWeight: isToday ? 900 : isWeekend ? 700 : 400,
                color: isToday ? "white" : isWeekend ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)",
                background: isToday ? "#60a5fa" : "transparent",
                borderRadius: "50%",
                width: 24, height: 24,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {day}
              </span>
              {dayTrips.length > 0 && (
                <div style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
                  {[...new Set(dayTrips.map((t) => t._role))].slice(0, 3).map((role) => (
                    <div key={role} style={{ width: 6, height: 6, borderRadius: "50%", background: DOT_COLORS[role] }} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14, padding: "10px 0 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {Object.entries(DOT_COLORS).map(([role, color]) => (
          <div key={role} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
            {DOT_LABELS[role]}
          </div>
        ))}
      </div>

      {/* Selected day panel */}
      {selectedDate && (
        <div style={{ marginTop: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 16px", display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.7)" }}>
            {formatDate(selectedDate)}
          </div>
          {selectedTrips.length === 0 ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Nothing planned this day.</div>
          ) : selectedTrips.map((t, i) => (
            <button
              key={t.id || i}
              onClick={() => t.id && onOpenTrip(t)}
              style={{
                background: `${DOT_COLORS[t._role]}11`,
                border: `1px solid ${DOT_COLORS[t._role]}33`,
                borderLeft: `3px solid ${DOT_COLORS[t._role]}`,
                borderRadius: "0 12px 12px 0",
                padding: "10px 14px",
                textAlign: "left",
                cursor: t.id ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 18 }}>{resortEmoji(t.resort_key)}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>
                  {t.title || resortName(t.resort_key) || t.resort_key}
                </div>
                <div style={{ fontSize: 11, color: DOT_COLORS[t._role], fontWeight: 700, marginTop: 2 }}>
                  {DOT_LABELS[t._role]}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


/* ── Main page ─────────────────────────────────────────────────────── */
export default function SkiPlansPage({ onRequireLogin, resorts }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [myTrips, setMyTrips] = useState([])
  const [rsvpdTrips, setRsvpdTrips] = useState([])
  const [friendsTrips, setFriendsTrips] = useState([])
  const [invitedTrips, setInvitedTrips] = useState([])
  const [skiPlans, setSkiPlans] = useState([])
  const [deletedIds, setDeletedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [stripTrip, setStripTrip] = useState(null)
  const [subTab, setSubTab] = useState("trips")

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
          getMySkiPlans().then(setSkiPlans).catch(() => {}),
        ])
      }
      setLoading(false)
    }
    init()
  }, [loadTrips])

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
    { key: "today",    label: "📍 Today" },
    { key: "calendar", label: "📅 Calendar" },
  ]

  return (
    <div style={{ paddingBottom: 48 }}>
      <style>{`
        .strip-card:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,0,0,0.5); }
        .plan-cta:hover { transform: translateY(-2px); box-shadow: 0 12px 36px rgba(37,99,235,0.5) !important; }
        .trip-card:hover { transform: translateY(-3px); box-shadow: 0 36px 90px rgba(0,0,0,0.65) !important; }
        .hype-btn:hover { transform: scale(1.22) !important; background: rgba(255,255,255,0.13) !important; }
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
            background: "linear-gradient(135deg, #2563eb, #0891b2)",
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
              <button onClick={() => onRequireLogin?.()} style={{ background: "linear-gradient(135deg, #2563eb, #0891b2)", color: "white", border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>Sign In</button>
            </div>
          ) : flatTrips.length === 0 ? (
            <div style={{ borderRadius: 24, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "52px 28px", textAlign: "center", display: "grid", gap: 18, justifyItems: "center" }}>
              <div style={{ fontSize: 38 }}>🏔️</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "white" }}>No ski trips yet</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.48)", maxWidth: 340, lineHeight: 1.6 }}>Create a trip, pick a mountain, then let your crew RSVP in one tap.</div>
              <button onClick={handleCreateClick} style={{ background: "linear-gradient(135deg, #2563eb, #0891b2)", color: "white", border: "none", borderRadius: 14, padding: "13px 28px", fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 28px rgba(37,99,235,0.4)" }}>
                Plan a Trip 🎿
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {invitedTrips.length > 0 && (
                <div style={{
                  background: "rgba(96,165,250,0.07)",
                  border: "1px solid rgba(96,165,250,0.25)",
                  borderLeft: "4px solid #60a5fa",
                  borderRadius: 14,
                  padding: "13px 18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#93c5fd" }}>
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

      {/* ── Today tab ── */}
      {subTab === "today" && (
        <div style={{ display: "grid", gap: 20 }}>
          {currentUser ? (
            <SkiCheckInForm resorts={resorts} />
          ) : (
            <div style={{ borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", padding: "28px 24px", display: "grid", gap: 14 }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: "white" }}>Log in to post your plan</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)" }}>You can still browse Today's Crew below.</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => onRequireLogin?.("login")} style={{ background: "linear-gradient(135deg, #2563eb, #0891b2)", color: "white", border: "none", borderRadius: 10, padding: "11px 18px", fontWeight: 800, cursor: "pointer", fontSize: 13 }}>Log In</button>
                <button onClick={() => onRequireLogin?.("signup")} style={{ background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "11px 18px", fontWeight: 800, cursor: "pointer", fontSize: 13 }}>Sign Up</button>
              </div>
            </div>
          )}
          <TodaysCrew />
        </div>
      )}

      {/* ── Calendar tab ── */}
      {subTab === "calendar" && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "20px 18px" }}>
          <CalendarView
            myTrips={myTrips}
            rsvpdTrips={rsvpdTrips}
            invitedTrips={invitedTrips}
            friendsTrips={friendsTrips}
            skiPlans={skiPlans}
            currentUser={currentUser}
            onOpenTrip={setStripTrip}
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
