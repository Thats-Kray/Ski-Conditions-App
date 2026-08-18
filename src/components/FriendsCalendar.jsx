import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import PlanCalendar from "./PlanCalendar"
import WeekView from "./calendar/WeekView"
import DayPlanCard from "./calendar/DayPlanCard"
import FilterChipRow from "./calendar/FilterChipRow"
import CalendarFilterSheet from "./calendar/CalendarFilterSheet"
import { localDateKey, monthBounds, weekBounds } from "../lib/calendarDates"
import { groupByDayAndMountain, totalAttendees } from "../lib/calendarGrouping"
import { ringColorFor, NEUTRAL_RING } from "../lib/crewColors"
import { resortName } from "../lib/resorts"
import { formatDate } from "../lib/format"
import {
  getVisiblePlansInRange, getAllVisibleTrips, getAcceptedFriends,
  getMyCrews, getCrewMembers, joinPlanAtResort,
} from "../lib/socialApi"

function FailureNotice({ label, onRetry }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      background: "var(--color-danger-bg)", border: "1px solid var(--color-danger)",
      borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "var(--color-text-1)",
      marginBottom: 10,
    }}>
      <span>Couldn't load {label}.</span>
      <button
        onClick={onRetry}
        style={{
          background: "transparent", border: "1px solid var(--color-danger)", borderRadius: 8,
          color: "var(--color-text-1)", padding: "6px 12px", fontSize: 12, fontWeight: 800,
          cursor: "pointer", minHeight: 44,
        }}
      >
        Retry
      </button>
    </div>
  )
}

/**
 * "Where is everyone skiing this weekend?" — the friends calendar.
 *
 * Owns fetching, filter state and view mode. Everything it renders is a dumb
 * component fed from two pure modules (calendarGrouping, crewColors), which is what
 * lets the grouping and color rules be unit-tested without a browser.
 */
export default function FriendsCalendar({ currentUser, onOpenTrip, onScopeChange }) {
  const [viewMode, setViewMode] = useState("week")   // "week" | "month"
  const [anchor, setAnchor] = useState(() => new Date())
  const [selected, setSelected] = useState(() => new Set(["me", "friends"]))
  const [sheetOpen, setSheetOpen] = useState(false)

  const [plans, setPlans] = useState([])
  const [trips, setTrips] = useState([])
  const [friends, setFriends] = useState([])
  const [crews, setCrews] = useState([])
  const [crewMemberIds, setCrewMemberIds] = useState(new Map())

  const [failed, setFailed] = useState({})
  const [hasLoaded, setHasLoaded] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null)
  const [joiningKey, setJoiningKey] = useState(null)
  const [joinError, setJoinError] = useState(null)
  const [lastJoinAttempt, setLastJoinAttempt] = useState(null)

  const todayKey = localDateKey()
  const currentUserId = currentUser?.id || null

  // ── Static blocks: load once, cached across date navigation ──────────────
  const STATIC_LOADERS = useMemo(() => [
    { key: "friends", label: "your friends list", fn: getAcceptedFriends, apply: (v) => setFriends(v || []), fallback: [] },
    { key: "trips", label: "trips", fn: getAllVisibleTrips, fallback: { mine: [], friends: [], rsvpd: [], invited: [] },
      apply: (v) => setTrips([...(v.mine || []), ...(v.friends || []), ...(v.rsvpd || []), ...(v.invited || [])]) },
    { key: "crews", label: "your crews", fallback: [],
      fn: async () => {
        const rows = await getMyCrews()
        const pairs = await Promise.all((rows || []).map(async (c) => {
          // getCrewMembers returns `profile:user_id (...)` with no bare user_id
          // column, so the user id lives at m.profile.id. m.id is the
          // crew_members row id, not a user.
          //
          // Deliberately no .catch() here: a swallowed rejection would let this
          // crew's member Set silently resolve empty while Promise.allSettled
          // reports the whole "crews" loader as fulfilled — no Retry notice, no
          // console.error, a crew chip that quietly behaves as memberless. Let it
          // propagate so Promise.all rejects, the outer fn() rejects, and
          // runStatic's Promise.allSettled marks "crews" failed the same way it
          // already does when getMyCrews() itself fails.
          const members = await getCrewMembers(c.id)
          return [c.id, new Set(members.map((m) => m.profile?.id).filter(Boolean))]
        }))
        return { rows: rows || [], pairs }
      },
      apply: (v) => { setCrews(v.rows || []); setCrewMemberIds(new Map(v.pairs || [])) },
    },
  ], [])

  const runStatic = useCallback(async (subset) => {
    const list = subset ? STATIC_LOADERS.filter((l) => subset.includes(l.key)) : STATIC_LOADERS
    const results = await Promise.allSettled(list.map((l) => l.fn()))
    const nowFailed = {}
    results.forEach((res, i) => {
      const loader = list[i]
      if (res.status === "fulfilled") {
        loader.apply(res.value ?? loader.fallback)
      } else {
        loader.apply(loader.fallback)
        nowFailed[loader.key] = true
        // Keep the real error reachable. The UI shows friendly copy, but during
        // beta the raw PostgREST message is what makes a bug diagnosable — that is
        // how the 2026-08-18 stale-bundle 403 was traced in minutes.
        console.error(`[FriendsCalendar] "${loader.key}" failed to load:`, res.reason)
      }
    })
    setFailed((prev) => {
      const next = { ...prev }
      list.forEach((l) => { delete next[l.key] })
      return { ...next, ...nowFailed }
    })
  }, [STATIC_LOADERS])

  useEffect(() => {
    if (!currentUserId) return
    let cancelled = false
    runStatic().finally(() => { if (!cancelled) setHasLoaded(true) })
    return () => { cancelled = true }
  }, [currentUserId, runStatic])

  // ── Plan range: refetches on every date/view change ──────────────────────
  const { start, end } = viewMode === "week" ? weekBounds(anchor) : monthBounds(anchor)

  // Guards against out-of-order responses: clicking > twice quickly fires two
  // fetches, and the slower one must not overwrite the newer range's rows.
  const rangeRef = useRef("")

  const loadPlans = useCallback(async () => {
    const token = `${start}|${end}`
    rangeRef.current = token
    try {
      const rows = await getVisiblePlansInRange(start, end)
      if (rangeRef.current !== token) return   // a newer range already won
      setPlans(rows || [])
      setFailed((prev) => { const n = { ...prev }; delete n.plans; return n })
    } catch (err) {
      if (rangeRef.current !== token) return
      setPlans([])
      console.error("[FriendsCalendar] \"plans\" failed to load:", err)
      setFailed((prev) => ({ ...prev, plans: true }))
    }
  }, [start, end])

  useEffect(() => {
    if (!currentUserId) return
    loadPlans()
  }, [currentUserId, loadPlans])

  // ── Filtering ────────────────────────────────────────────────────────────
  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends])
  const selectedCrewIds = useMemo(
    () => crews.map((c) => c.id).filter((id) => selected.has(`crew:${id}`)),
    [crews, selected]
  )
  const crewIndexById = useMemo(
    () => new Map(crews.map((c, i) => [c.id, i])),
    [crews]
  )
  // DayPlanCard's multi-crew footnote reads colorCtx.crewNameById to label anyone
  // who belongs to two or more selected crews. Built from the same unfiltered
  // `crews` array as crewIndexById — never a sorted/filtered view of it.
  const crewNameById = useMemo(
    () => new Map(crews.map((c) => [c.id, c.name])),
    [crews]
  )
  const friendFilterCount = useMemo(
    () => [...selected].filter((k) => k.startsWith("friend:")).length,
    [selected]
  )

  // A display lens over rows RLS already authorized. It must never be the only
  // thing protecting visibility.
  const inScope = useCallback((userId) => {
    if (!userId) return false
    if (userId === currentUserId) return selected.has("me")
    if (selected.has(`friend:${userId}`)) return true
    // Must test real friendship: getVisiblePlansInRange returns friends AND active
    // crewmates, so a bare non-self test would leak non-friend crewmates under a
    // chip that says "All Friends" (Sprint 34 review finding #2).
    if (selected.has("friends") && friendIds.has(userId)) return true
    for (const crewId of selectedCrewIds) {
      if (crewMemberIds.get(crewId)?.has(userId)) return true
    }
    return false
  }, [currentUserId, selected, friendIds, selectedCrewIds, crewMemberIds])

  useEffect(() => { onScopeChange?.(selected) }, [selected, onScopeChange])

  const groupsByDay = useMemo(() => groupByDayAndMountain({
    plans: plans.filter((p) => inScope(p.user_id)),
    trips: trips.filter((t) => inScope(t.host_id)),
    currentUserId,
  }), [plans, trips, inScope, currentUserId])

  const colorCtx = useMemo(() => ({
    currentUserId, selectedCrewIds, crewIndexById, crewMemberIds, crewNameById,
  }), [currentUserId, selectedCrewIds, crewIndexById, crewMemberIds, crewNameById])

  // ── Actions ──────────────────────────────────────────────────────────────
  function toggle(key) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function shiftAnchor(delta) {
    setSelectedDay(null)
    setAnchor((d) => viewMode === "week"
      ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * delta)
      : new Date(d.getFullYear(), d.getMonth() + delta, 1))
  }

  async function handleJoin(dateKey, resortKey) {
    setJoiningKey(`${dateKey}|${resortKey}`)
    setJoinError(null)
    setLastJoinAttempt({ dateKey, resortKey })
    try {
      await joinPlanAtResort(dateKey, resortKey)
      await loadPlans()
      setLastJoinAttempt(null)
    } catch (err) {
      console.error("[FriendsCalendar] join failed:", err)
      setJoinError(err?.message || "Couldn't save your plan.")
    } finally {
      setJoiningKey(null)
    }
  }

  const rangeLabel = anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })

  if (!currentUserId) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-3)", fontSize: 14 }}>
        Sign in to see where your friends are skiing.
      </div>
    )
  }

  const nobodyToShow = hasLoaded && friends.length === 0 && crews.length === 0
  const nothingSelected = selected.size === 0

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => { setAnchor(new Date()); setSelectedDay(null) }} style={navBtn}>Today</button>
          <button onClick={() => shiftAnchor(-1)} aria-label="Previous" style={navBtn}>‹</button>
          <div style={{ fontWeight: 900, fontSize: 15, color: "var(--color-text-1)", minWidth: 130, textAlign: "center" }}>
            {rangeLabel}
          </div>
          <button onClick={() => shiftAnchor(1)} aria-label="Next" style={navBtn}>›</button>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["week", "month"].map((m) => (
            <button
              key={m}
              onClick={() => { setViewMode(m); setSelectedDay(null) }}
              style={{
                ...navBtn,
                background: viewMode === m ? "var(--color-accent-dim)" : "transparent",
                color: viewMode === m ? "var(--color-text-1)" : "var(--color-text-3)",
                textTransform: "capitalize",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <FilterChipRow
        crews={crews}
        selected={selected}
        onToggle={toggle}
        onOpenSheet={() => setSheetOpen(true)}
        friendFilterCount={friendFilterCount}
      />

      {failed.plans && <FailureNotice label="this week's plans" onRetry={loadPlans} />}
      {failed.crews && <FailureNotice label="your crews" onRetry={() => runStatic(["crews"])} />}
      {failed.friends && <FailureNotice label="your friends list" onRetry={() => runStatic(["friends"])} />}
      {failed.trips && <FailureNotice label="trips" onRetry={() => runStatic(["trips"])} />}
      {joinError && (
        <FailureNotice
          label={`your plan (${joinError})`}
          onRetry={() => lastJoinAttempt && handleJoin(lastJoinAttempt.dateKey, lastJoinAttempt.resortKey)}
        />
      )}

      {nobodyToShow && (
        <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--color-text-3)", fontSize: 13 }}>
          Add friends to see where they're skiing.
        </div>
      )}

      {nothingSelected && (
        <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--color-text-3)", fontSize: 13 }}>
          Pick at least one group above to see plans.
        </div>
      )}

      {viewMode === "week" ? (
        <WeekView
          anchorDate={anchor}
          groupsByDay={groupsByDay}
          colorCtx={colorCtx}
          currentUserId={currentUserId}
          todayKey={todayKey}
          joiningKey={joiningKey}
          onJoin={handleJoin}
          onOpenTrip={onOpenTrip}
        />
      ) : (
        <PlanCalendar
          entriesByDate={groupsByDay}
          dotColorFor={() => NEUTRAL_RING}
          selectedDate={selectedDay}
          onSelectDay={setSelectedDay}
          onMonthChange={(d) => { setSelectedDay(null); setAnchor(d) }}
          initialMonth={new Date(anchor.getFullYear(), anchor.getMonth(), 1)}
          renderCellContent={(dateKey, groups) => {
            if (!groups || groups.length === 0) return null
            // One dot per CREW present, not per mountain — the dots have to mean
            // the same thing the chips mean or the legend lies (spec decision #6).
            const crewsPresent = new Set()
            let hasUnaffiliated = false
            for (const g of groups) {
              for (const a of g.attendees) {
                const c = ringColorFor(a.userId, colorCtx)
                if (c === NEUTRAL_RING) hasUnaffiliated = true
                else crewsPresent.add(c)
              }
            }
            const dots = [...crewsPresent, ...(hasUnaffiliated ? [NEUTRAL_RING] : [])].slice(0, 4)
            return (
              <div style={{ display: "grid", gap: 2, justifyItems: "center", width: "100%" }}>
                <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
                  {dots.map((c) => (
                    <div key={c} style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />
                  ))}
                </div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--color-text-2)" }}>
                  {totalAttendees(groups)}
                </div>
                <div style={{
                  fontSize: 9, color: "var(--color-text-3)", maxWidth: "100%",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {resortName(groups[0].resortKey) || groups[0].resortKey}
                  {groups.length > 1 ? ` +${groups.length - 1}` : ""}
                </div>
              </div>
            )
          }}
          renderDayDetail={(dateKey, groups) => (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--color-text-2)" }}>
                {formatDate(dateKey)}
              </div>
              {(!groups || groups.length === 0) ? (
                <div style={{ fontSize: 13, color: "var(--color-text-3)" }}>Nobody's planned this day.</div>
              ) : groups.map((g) => (
                <DayPlanCard
                  key={g.resortKey}
                  group={g}
                  colorCtx={colorCtx}
                  currentUserId={currentUserId}
                  canJoin={dateKey >= todayKey}
                  joining={joiningKey === `${dateKey}|${g.resortKey}`}
                  onJoin={(resortKey) => handleJoin(dateKey, resortKey)}
                  onOpenTrip={onOpenTrip}
                />
              ))}
            </div>
          )}
        />
      )}

      {sheetOpen && (
        <CalendarFilterSheet
          crews={crews}
          crewMemberIds={crewMemberIds}
          friends={friends}
          selected={selected}
          onToggle={toggle}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  )
}

const navBtn = {
  background: "var(--color-surface)", border: "1px solid var(--color-border)",
  borderRadius: 10, padding: "8px 12px", color: "var(--color-text-1)",
  cursor: "pointer", fontWeight: 700, fontSize: 13, minHeight: 44,
}
