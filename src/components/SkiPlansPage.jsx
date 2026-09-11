import { useCallback, useEffect, useState } from "react"
import { getAllVisibleTrips, getCurrentUser, getAcceptedFriends } from "../lib/socialApi"
import TripCard from "./TripCard"
import CreateTripModal from "./CreateTripModal"
import TripDetailModal from "./TripDetailModal"
import FriendsCalendar from "./FriendsCalendar"
import { SkiPingComposer } from "./SkiPingModal"

/* ── Ski Ping CTA ─────────────────────────────────────────────────────
 * DO NOT DELETE. This button is the ONLY trigger for SkiPingComposer anywhere in
 * the app — the Friends slice removed its own duplicate "Ping Crew" button on
 * exactly that basis. Cutting it makes ski pings unreachable, not tidier.
 *
 * Restyled here (2026-09-04) from a full-width hero card to a text link under the
 * page header: the mockup has no equivalent element, so it gets the smallest
 * treatment that keeps it discoverable. */
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
      <button
        onClick={handleOpen}
        style={{
          background: "none", border: "none", padding: "0", cursor: "pointer",
          minHeight: 44, display: "inline-flex", alignItems: "center",
          color: "var(--color-accent)", fontSize: 12, fontWeight: 700,
          textDecoration: "underline", textUnderlineOffset: 3,
        }}
      >
        👋 Ping a friend to ski →
      </button>
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

const SUB_TABS = [
  { key: "calendar", label: "Ski days" },
  { key: "trips",    label: "Trips" },
]

/* The mockup carries a one-line explainer under each segment. Kept verbatim: a ski
   day and a trip are genuinely different objects in this app and people conflate
   them constantly. */
const SUB_TAB_HINT = {
  calendar: "Where you and your friends are skiing, by day. Tap + on a day to add yours.",
  trips: "Bigger plans — meeting spots, carpool, chat. A trip is a multi-part outing; a ski day is just where you're riding.",
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
  const [tripDetail, setTripDetail] = useState(null)
  const [subTab, setSubTab] = useState("calendar")
  // Bumped by the header "+" while the Ski days tab is open. FriendsCalendar owns
  // the ski-day editor and its save path, so a counter is how a button up here
  // reaches down into it without a second copy of that wiring.
  const [addDayTick, setAddDayTick] = useState(0)

  // A notification pointing at a ski day has to land ON the calendar. Tapping it while
  // the Trips sub-tab happened to be open would otherwise leave you on the wrong half
  // of the page with nothing obviously different.
  //
  // Adjusted during render rather than in an effect — React's documented pattern for
  // "adjust state when a prop changes". An effect here would set state synchronously on
  // mount and cascade an extra render, which is what react-hooks/set-state-in-effect flags.
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

  function handleCreateTrip() {
    if (!currentUser) { onRequireLogin?.(); return }
    setShowCreate(true)
  }

  /**
   * The header "+" means whichever thing the open sub-tab is about: a ski day on
   * Ski days, a trip on Trips. It replaces a "+ New Trip" button that was visible
   * even while you were looking at the calendar, where it was the wrong verb.
   *
   * The signed-out guard lives HERE, not in FriendsCalendar, because FriendsCalendar
   * reacts to addDayTick during render and calling a parent's onRequireLogin from a
   * child's render is illegal.
   */
  function handleHeaderAdd() {
    if (!currentUser) { onRequireLogin?.(); return }
    if (subTab === "trips") { setShowCreate(true); return }
    setAddDayTick((n) => n + 1)
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

  return (
    <div style={{ paddingBottom: 48 }}>
      {/* TripCard.jsx:219 carries className="trip-card" and this is the only
          definition of its hover rule anywhere in src/. It stays. The .strip-card,
          .plan-cta and .hype-btn rules that used to live here went with their
          elements (.hype-btn had no consumer at all — verified by grep). */}
      <style>{`
        .trip-card:hover { transform: translateY(-3px); box-shadow: 0 36px 90px rgba(0,0,0,0.65) !important; }
      `}</style>

      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: -0.5, color: "var(--color-text-1)" }}>
          Plans
        </h2>
        <button
          onClick={handleHeaderAdd}
          aria-label={subTab === "trips" ? "New trip" : "Add a ski day"}
          title={subTab === "trips" ? "New trip" : "Add a ski day"}
          style={{
            width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
            background: "var(--gradient-cta)", border: "none", color: "var(--color-on-accent)",
            fontSize: 24, fontWeight: 400, lineHeight: 1, cursor: "pointer",
            display: "grid", placeItems: "center",
            boxShadow: "0 6px 20px var(--color-accent-glow)",
          }}
        >
          +
        </button>
      </div>

      <PingCta currentUser={currentUser} />

      {/* ── Sub-tab selector ── */}
      <div style={{
        display: "flex", gap: 3, marginTop: 14,
        background: "var(--color-surface)", border: "1px solid var(--color-border)",
        borderRadius: 12, padding: 4,
      }}>
        {SUB_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            style={{
              flex: 1, borderRadius: 9, border: "none", minHeight: 44,
              padding: "10px 0", fontSize: 13, fontWeight: 800, cursor: "pointer",
              background: subTab === key ? "var(--gradient-cta)" : "transparent",
              color: subTab === key ? "var(--color-on-accent)" : "var(--color-text-3)",
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{
        fontSize: 11, color: "var(--color-text-3)", lineHeight: 1.5, margin: "12px 2px 16px",
      }}>
        {SUB_TAB_HINT[subTab]}
      </div>

      {/* ── Trips tab ── unchanged below this line except for the two renamed
          handlers; TripCard and the grid it sits in are explicitly out of scope. */}
      {subTab === "trips" && (
        <>
          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-30)", fontSize: 14 }}>Loading trips…</div>
          ) : !currentUser ? (
            <div style={{ borderRadius: 24, background: "var(--overlay-03)", border: "1px solid var(--overlay-08)", padding: "48px 28px", textAlign: "center", display: "grid", gap: 16, justifyItems: "center" }}>
              <div style={{ fontSize: 38 }}>🎿</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "var(--color-text-1)" }}>Sign in to see your trips</div>
              <button onClick={() => onRequireLogin?.()} style={{ background: "var(--gradient-cta)", color: "var(--color-on-accent)", border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>Sign In</button>
            </div>
          ) : flatTrips.length === 0 ? (
            <div style={{ borderRadius: 24, background: "var(--overlay-03)", border: "1px solid var(--overlay-08)", padding: "52px 28px", textAlign: "center", display: "grid", gap: 18, justifyItems: "center" }}>
              <div style={{ fontSize: 38 }}>🏔️</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "var(--color-text-1)" }}>No ski trips yet</div>
              <div style={{ fontSize: 14, color: "var(--ink-48)", maxWidth: 340, lineHeight: 1.6 }}>Create a trip, pick a mountain, then let your crew RSVP in one tap.</div>
              <button onClick={handleCreateTrip} style={{ background: "var(--gradient-cta)", color: "var(--color-on-accent)", border: "none", borderRadius: 14, padding: "13px 28px", fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 28px rgba(37,99,235,0.4)" }}>
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
                  <span style={{ fontSize: 12, color: "var(--ink-45)" }}>Respond below ↓</span>
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

      {/* ── Ski days tab ──
          No surrounding panel any more: each day is its own card in the agenda list,
          and a card-inside-a-card was the old grid's frame, not the mockup's. */}
      {subTab === "calendar" && (
        <FriendsCalendar
          currentUser={currentUser}
          onOpenTrip={setTripDetail}
          trips={flatTrips}
          loading={loading}
          onRequireLogin={onRequireLogin}
          onPlanADay={() => { setSubTab("trips"); handleCreateTrip() }}
          resorts={resorts}
          focusDate={focusDate}
          onFocusHandled={onFocusHandled}
          addDayTick={addDayTick}
        />
      )}

      {/* Trip detail — opened from a day card's trip badge */}
      {tripDetail && (
        <TripDetailModal
          trip={tripDetail}
          currentUser={currentUser}
          onClose={() => setTripDetail(null)}
          onUpdate={() => { loadTrips() }}
        />
      )}

      {/* Create trip — header "+" on the Trips tab, and the two empty-state buttons */}
      {showCreate && (
        <CreateTripModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadTrips() }}
        />
      )}
    </div>
  )
}
