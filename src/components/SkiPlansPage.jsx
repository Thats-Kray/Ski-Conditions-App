import { useCallback, useEffect, useRef, useState } from "react"
import {
  getAllVisibleTrips,
  getCurrentUser,
  getAcceptedFriends,
  rsvpToTrip,
} from "../lib/socialApi"
import TripCard from "./TripCard"
import CreateTripModal from "./CreateTripModal"
import TripDetailModal from "./TripDetailModal"
import FriendsCalendar from "./FriendsCalendar"
import { resortName, resortEmoji } from "../lib/resorts"
import { formatDate } from "../lib/format"
import Avatar from "./ui/Avatar"
import AvatarStatusRail from "./ui/AvatarStatusRail"
import Card from "./ui/Card"
import { SkiPingComposer } from "./SkiPingModal"

/* ── Your Next Trip / pending invite ─────────────────────────────────
 * Moved here from HomeDashboard.jsx (Task 5) unchanged — internals are a
 * faithful copy. Only the call site differs: HomeDashboard wired onTabChange
 * to App.jsx's tab switcher so "See all trips →" would jump here from Home.
 * From inside this page that jump is self-referential, so the render call
 * below passes a callback that switches to the Trips sub-tab instead — the
 * only edit made to accommodate the new home. */
function NextTripCard({ currentUser, onTabChange }) {
  const [loading, setLoading] = useState(true)
  const [invited, setInvited] = useState([])
  const [nextTrip, setNextTrip] = useState(null)
  const [dismissed, setDismissed] = useState(new Set())
  const [rsvpBusyId, setRsvpBusyId] = useState(null)
  const [showCreateTrip, setShowCreateTrip] = useState(false)

  useEffect(() => {
    if (!currentUser) { setLoading(false); return }
    let cancelled = false
    getAllVisibleTrips()
      .then(({ mine = [], rsvpd = [], invited: invitedTrips = [] }) => {
        if (cancelled) return
        setInvited(invitedTrips)
        const upcoming = [...mine, ...rsvpd].sort((a, b) => (a.ski_date || "").localeCompare(b.ski_date || ""))
        setNextTrip(upcoming[0] || null)
      })
      .catch(() => { if (!cancelled) { setInvited([]); setNextTrip(null) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [currentUser])

  const pendingInvite = invited.find((t) => !dismissed.has(t.id))

  async function handleRsvp(tripId, status) {
    setRsvpBusyId(tripId)
    setDismissed((prev) => new Set([...prev, tripId])) // optimistic
    try {
      await rsvpToTrip(tripId, status)
    } catch (e) {
      console.warn("RSVP failed:", e)
      setDismissed((prev) => { const next = new Set(prev); next.delete(tripId); return next }) // rollback
    } finally {
      setRsvpBusyId(null)
    }
  }

  const cardHeader = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ fontSize: 11, color: "var(--color-text-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {pendingInvite ? "Trip Invite" : "Your Next Trip"}
      </div>
      <button
        onClick={() => onTabChange("plans")}
        style={{ background: "none", border: "none", color: "var(--color-accent)", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 }}
      >
        See all trips →
      </button>
    </div>
  )

  if (!currentUser || loading) {
    return (
      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {cardHeader}
        <div style={{ fontSize: 13, color: "var(--color-text-2)" }}>
          {!currentUser ? "Sign in to see your plans." : "Loading…"}
        </div>
      </Card>
    )
  }

  // State A — pending invite
  if (pendingInvite) {
    const host = pendingInvite.host_profile
    return (
      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {cardHeader}
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>
            {resortEmoji(pendingInvite.resort_key)} {resortName(pendingInvite.resort_key) || pendingInvite.resort_key}
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-2)", marginTop: 4 }}>
            {formatDate(pendingInvite.ski_date)}
            {host && ` · Hosted by ${host.full_name || host.username || "a friend"}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => handleRsvp(pendingInvite.id, "going")}
            disabled={rsvpBusyId === pendingInvite.id}
            style={{
              flex: 1, background: "var(--gradient-cta)", color: "white",
              border: "none", borderRadius: 10, padding: "10px 14px", fontWeight: 800, fontSize: 13,
              cursor: rsvpBusyId === pendingInvite.id ? "not-allowed" : "pointer",
            }}
          >
            Accept
          </button>
          <button
            onClick={() => handleRsvp(pendingInvite.id, "cantgo")}
            disabled={rsvpBusyId === pendingInvite.id}
            style={{
              flex: 1, background: "rgba(255,255,255,0.06)", color: "var(--color-text-1)",
              border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 14px",
              fontWeight: 800, fontSize: 13, cursor: rsvpBusyId === pendingInvite.id ? "not-allowed" : "pointer",
            }}
          >
            Decline
          </button>
        </div>
      </Card>
    )
  }

  // State B — next upcoming trip
  if (nextTrip) {
    const goingCount = (nextTrip.rsvps || []).filter((r) => r.status === "going").length
    return (
      <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {cardHeader}
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>
            {resortEmoji(nextTrip.resort_key)} {resortName(nextTrip.resort_key) || nextTrip.resort_key}
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-2)", marginTop: 4 }}>
            {formatDate(nextTrip.ski_date)} · {goingCount} going
          </div>
        </div>
      </Card>
    )
  }

  // State C — no invite, no upcoming trips
  return (
    <>
      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {cardHeader}
        <button
          onClick={() => setShowCreateTrip(true)}
          style={{ background: "none", border: "none", color: "var(--color-accent)", fontWeight: 700, fontSize: 14, cursor: "pointer", padding: 0, textAlign: "left" }}
        >
          Plan a ski day with your crew →
        </button>
      </Card>
      {showCreateTrip && (
        <CreateTripModal
          onClose={() => setShowCreateTrip(false)}
          onCreated={() => setShowCreateTrip(false)}
        />
      )}
    </>
  )
}

/* ── Ski Ping CTA ─────────────────────────────────────────────────────
 * Also moved here unchanged from HomeDashboard.jsx (Task 5). */
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
            color: "var(--color-accent-soft)", fontSize: 13, fontWeight: 700,
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
          // with a hex alpha suffix (same constraint as SKILL_OPTIONS/TYPE_META
          // precedent from Tasks 6/8).
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

/* ── Main page ─────────────────────────────────────────────────────── */
export default function SkiPlansPage({ onRequireLogin, resorts, focusDate = null, onFocusHandled }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [myTrips, setMyTrips] = useState([])
  const [rsvpdTrips, setRsvpdTrips] = useState([])
  const [friendsTrips, setFriendsTrips] = useState([])
  const [invitedTrips, setInvitedTrips] = useState([])
  const [deletedIds, setDeletedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [stripTrip, setStripTrip] = useState(null)
  const [subTab, setSubTab] = useState("calendar")

  // A notification pointing at a ski day has to land ON the calendar. Tapping it while the
  // Trips sub-tab happened to be open would otherwise leave you on the wrong half of the page
  // with nothing obviously different.
  //
  // Adjusted during render rather than in an effect — React's documented pattern for
  // "adjust state when a prop changes". An effect here would set state synchronously on mount
  // and cascade an extra render, which is what react-hooks/set-state-in-effect flags.
  const [lastFocus, setLastFocus] = useState(null)
  if (focusDate && focusDate !== lastFocus) {
    setLastFocus(focusDate)
    setSubTab("calendar")
  }

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
        await loadTrips()
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
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <NextTripCard currentUser={currentUser} onTabChange={() => setSubTab("trips")} />
          <PingCta currentUser={currentUser} />
          <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 20, padding: "20px 18px" }}>
            <FriendsCalendar
              currentUser={currentUser}
              onOpenTrip={setStripTrip}
              trips={flatTrips}
              loading={loading}
              onRequireLogin={onRequireLogin}
              onPlanADay={() => { setSubTab("trips"); handleCreateClick() }}
              resorts={resorts}
              focusDate={focusDate}
              onFocusHandled={onFocusHandled}
            />
          </div>
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
