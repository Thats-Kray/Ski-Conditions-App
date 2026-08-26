import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import PlanCalendar from "./PlanCalendar"
import WeekView from "./calendar/WeekView"
import DayPlanCard from "./calendar/DayPlanCard"
import FilterChipRow from "./calendar/FilterChipRow"
import CalendarFilterSheet from "./calendar/CalendarFilterSheet"
import PlanEditorModal from "./PlanEditorModal"
import FailureNotice from "./ui/FailureNotice"
import { runLoaders, mergeFailed, selectLoaders } from "../lib/loaderRegistry"
import { localDateKey, monthBounds, weekBounds } from "../lib/calendarDates"
import { groupByDayAndMountain, totalAttendees } from "../lib/calendarGrouping"
import { ringColorFor, NEUTRAL_RING } from "../lib/crewColors"
import { resortName } from "../lib/resorts"
import { formatDate } from "../lib/format"
import { buildPlanUpsert } from "../lib/planUpsert"
import {
  getVisiblePlansInRange, getAcceptedFriends, getMyPartyMembershipsInRange, requestToJoinParty,
  getMyCrews, getCrewMembers, joinPlanAtResort, upsertDailyPlan,
} from "../lib/socialApi"


/**
 * "Where is everyone skiing this weekend?" — the friends calendar.
 *
 * Owns fetching, filter state and view mode. Everything it renders is a dumb
 * component fed from two pure modules (calendarGrouping, crewColors), which is what
 * lets the grouping and color rules be unit-tested without a browser.
 *
 * Trips are NOT fetched here. SkiPlansPage already owns the trip fetch/refresh
 * loop (create/RSVP modals call its loadTrips), so this component takes the
 * flattened mine+friends+rsvpd+invited array as a prop — one fetch, one place
 * that refreshes it, and the calendar's headcounts update the moment a modal closes.
 */
export default function FriendsCalendar({
  currentUser, onOpenTrip, trips = [], loading = false, onRequireLogin, onPlanADay,
  resorts = [],
}) {
  const [viewMode, setViewMode] = useState("week")   // "week" | "month"
  const [anchor, setAnchor] = useState(() => new Date())
  const [selected, setSelected] = useState(() => new Set(["me", "friends"]))
  const [sheetOpen, setSheetOpen] = useState(false)
  // Bumped by month-mode's Today button to force PlanCalendar to remount and
  // reseed its internal viewDate from the freshly-reset anchor. This is a
  // deliberate, occasional reset — not the continuous two-navigator desync that
  // month mode's outer ‹/›/label caused, which is why those stay hidden while
  // Today does not. Stable between resets, so PlanCalendar's own ‹/› keep
  // working against the same mounted instance and its state is not lost.
  const [monthResetKey, setMonthResetKey] = useState(0)

  const [plans, setPlans] = useState([])
  const [partyMembers, setPartyMembers] = useState([])
  const [friends, setFriends] = useState([])
  const [crews, setCrews] = useState([])
  const [crewMemberIds, setCrewMemberIds] = useState(new Map())

  const [failed, setFailed] = useState({})
  const [hasLoaded, setHasLoaded] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null)
  const [joiningKey, setJoiningKey] = useState(null)
  const [joinError, setJoinError] = useState(null)
  const [askingPartyId, setAskingPartyId] = useState(null)
  const [askError, setAskError] = useState(null)
  // Local so the button can say "Asked" immediately. Requests live in crew_invites and are
  // not part of the calendar fetch; refetching the whole range to flip one label would be a
  // lot of work for a confirmation.
  const [askedPartyIds, setAskedPartyIds] = useState(() => new Set())
  const [lastJoinAttempt, setLastJoinAttempt] = useState(null)
  const [editorDate, setEditorDate] = useState(null)
  const [editorSeedResort, setEditorSeedResort] = useState(null)
  const [editorError, setEditorError] = useState(null)
  const [editorBusy, setEditorBusy] = useState(false)

  const todayKey = localDateKey()
  const currentUserId = currentUser?.id || null

  // ── Static blocks: load once, cached across date navigation ──────────────
  const STATIC_LOADERS = useMemo(() => [
    { key: "friends", label: "your friends list", fn: getAcceptedFriends, apply: (v) => setFriends(v || []), fallback: [] },
    { key: "crews", label: "your crews", fallback: { rows: [], pairs: [] },
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
    const list = selectLoaders(STATIC_LOADERS, subset)
    const { values, failed: nowFailed } = await runLoaders(list, { logPrefix: "FriendsCalendar" })
    list.forEach((l) => l.apply(values.get(l.key)))
    setFailed((prev) => mergeFailed(prev, list.map((l) => l.key), nowFailed.keys()))
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
      // Fetched together so the calendar never renders plans against a stale party map,
      // which would briefly show people grouped with the wrong crew. Party membership lives
      // in its own table (migration 037) rather than on daily_plans, so it is a second query
      // by design, not an oversight.
      const [rows, memberships] = await Promise.all([
        getVisiblePlansInRange(start, end),
        getMyPartyMembershipsInRange(start, end),
      ])
      if (rangeRef.current !== token) return   // a newer range already won
      setPlans(rows || [])
      setPartyMembers(memberships || [])
      setFailed((prev) => { const n = { ...prev }; delete n.plans; return n })
    } catch (err) {
      if (rangeRef.current !== token) return
      setPlans([])
      setPartyMembers([])
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

  // Your own plan per date, for the join button's Switch label and for opening the
  // editor on a day you already planned. Built from `plans`, which already covers
  // the visible range. Callers that only need the resort key read
  // `myPlanByDate.get(dateKey)?.resort_key` rather than a second parallel map.
  const myPlanByDate = useMemo(() => {
    const m = new Map()
    if (!currentUserId) return m
    for (const p of plans) {
      if (p.user_id !== currentUserId) continue
      const key = (p.ski_date || "").slice(0, 10)
      if (key) m.set(key, p)
    }
    return m
  }, [plans, currentUserId])
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

  const groupsByDay = useMemo(() => groupByDayAndMountain({
    partyMembers,
    plans: plans.filter((p) => inScope(p.user_id)),
    // Scoping on host alone would drop a trip you RSVP'd going to unless its host
    // is separately in scope, and would hide invites from non-friend hosts under
    // every chip. "me" also has to cover the trip's own host/RSVP fields, not just
    // membership tests, because a host or RSVP-er is not necessarily a friend or
    // crewmate (Sprint 35 review finding #2).
    trips: trips.filter((t) =>
      inScope(t.host_id) ||
      (selected.has("me") && (t.host_id === currentUserId || t.my_rsvp_status === "going" || t._isInvited))
    ),
    currentUserId,
    // Applies to trip hosts/RSVP-ers only — plans are already pre-filtered above.
    // Without this, a trip that survives the filter still contributes every one of
    // its "going" RSVPs to the headcount, even people in no selected crew (Sprint
    // 35 review finding #7).
    isVisible: inScope,
  }), [plans, partyMembers, trips, inScope, currentUserId, selected])

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

  /**
   * Ask to ski WITH a group. Deliberately does not touch your plan: where you ski is yours to
   * decide (that is the "I'm also going" button), and who you ski with is theirs to approve.
   */
  async function handleAskToJoin(dateKey, resortKey, party) {
    if (!party?.ownerId) return
    setAskingPartyId(party.partyId)
    setAskError(null)
    try {
      await requestToJoinParty(party.ownerId, { skiDate: dateKey, resortKey })
      setAskedPartyIds((prev) => new Set(prev).add(party.partyId))
    } catch (err) {
      console.error("[FriendsCalendar] ask to join failed:", err)
      setAskError(err?.message || "Couldn't send your request.")
    } finally {
      setAskingPartyId(null)
    }
  }

  async function handleEditorSave({ resortKey, eta, visibility }) {
    if (!editorDate) return
    setEditorBusy(true); setEditorError(null)
    const existing = myPlanByDate.get(editorDate) || null
    try {
      // buildPlanUpsert carries status/note/arrived_at forward from the existing
      // row (and resets status/arrived_at if the mountain changed) — upsertDailyPlan
      // writes the whole row, so anything omitted here would be written as null.
      await upsertDailyPlan(buildPlanUpsert(existing, {
        skiDate: editorDate,
        resortKey,
        visibility,
        eta,                                   // already snapped by the modal
      }))
      await loadPlans()
      setEditorDate(null)
      setEditorSeedResort(null)
    } catch (err) {
      console.error("[FriendsCalendar] plan save failed:", err)
      setEditorError(err?.message || "Couldn't save that plan.")
    } finally {
      setEditorBusy(false)
    }
  }

  const rangeLabel = anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })

  // "Not known yet" — currentUser starts null and fills in asynchronously, so
  // without this a signed-in user sees the signed-out copy flash before their
  // session resolves.
  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: "var(--color-text-3)", fontSize: 14 }}>
        Loading calendar…
      </div>
    )
  }

  if (!currentUserId) {
    return (
      <div style={{
        borderRadius: 24, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
        padding: "48px 28px", textAlign: "center", display: "grid", gap: 16, justifyItems: "center",
      }}>
        <div style={{ fontSize: 38 }}>📅</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>Sign in to see where your friends are skiing</div>
        <button
          onClick={() => onRequireLogin?.()}
          style={{ background: "var(--gradient-cta)", color: "white", border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 14, fontWeight: 900, cursor: "pointer" }}
        >
          Sign In
        </button>
      </div>
    )
  }

  const nobodyToShow = hasLoaded && friends.length === 0 && crews.length === 0
  const nothingSelected = selected.size === 0
  // Spec §4.7's third empty state: friends/crews exist, at least one chip is
  // selected, and the fetch has settled — but nobody has a plan in the visible
  // range. Distinct from the two above; do not merge them.
  const nobodyPlanned = hasLoaded && !nobodyToShow && !nothingSelected && groupsByDay.size === 0

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        {/* Month mode's day grid owns its own ‹/›/label nav (PlanCalendar's internal
            viewDate). Rendering a second continuously-driven set here — advancing
            `anchor` on every click independent of that internal state — is what
            caused the grid-goes-blank bug, so ‹/›/label stay hidden in month mode.
            Today is different: it's a one-shot reset, not incremental, so it can
            reseed the child safely by remounting it (via monthResetKey) rather than
            fighting over live navigation state. */}
        {viewMode === "week" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => { setAnchor(new Date()); setSelectedDay(null) }} style={navBtn}>Today</button>
            <button onClick={() => shiftAnchor(-1)} aria-label="Previous" style={navBtn}>‹</button>
            <div style={{ fontWeight: 900, fontSize: 15, color: "var(--color-text-1)", minWidth: 130, textAlign: "center" }}>
              {rangeLabel}
            </div>
            <button onClick={() => shiftAnchor(1)} aria-label="Next" style={navBtn}>›</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => {
                setAnchor(new Date())
                setSelectedDay(null)
                setMonthResetKey((k) => k + 1)
              }}
              style={navBtn}
            >
              Today
            </button>
          </div>
        )}
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
      {joinError && (
        <FailureNotice
          message={`Couldn't save your plan (${joinError})`}
          onRetry={() => lastJoinAttempt && handleJoin(lastJoinAttempt.dateKey, lastJoinAttempt.resortKey)}
          onDismiss={() => setJoinError(null)}
        />
      )}
      {askError && (
        <FailureNotice
          message={`Couldn't send your request (${askError})`}
          onDismiss={() => setAskError(null)}
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

      {nobodyPlanned && (
        <div style={{ padding: "20px 16px", textAlign: "center", display: "grid", gap: 12, justifyItems: "center" }}>
          <div style={{ color: "var(--color-text-3)", fontSize: 13 }}>
            Nobody's planned a day {viewMode === "week" ? "this week" : "this month"} yet.
          </div>
          <button
            onClick={() => onPlanADay?.()}
            style={{
              background: "var(--gradient-cta)", color: "white", border: "none", borderRadius: 12,
              padding: "10px 20px", fontSize: 13, fontWeight: 900, cursor: "pointer", minHeight: 44,
            }}
          >
            + Plan a day
          </button>
        </div>
      )}

      {viewMode === "week" ? (
        !nobodyPlanned && (
          <WeekView
            anchorDate={anchor}
            groupsByDay={groupsByDay}
            colorCtx={colorCtx}
            currentUserId={currentUserId}
            todayKey={todayKey}
            joiningKey={joiningKey}
            onJoin={handleJoin}
            onOpenTrip={onOpenTrip}
            myPlanByDate={myPlanByDate}
            onEditPlan={(dateKey, resortKey) => {
              setEditorError(null); setEditorDate(dateKey); setEditorSeedResort(resortKey)
            }}
            onAskToJoin={handleAskToJoin}
            askingPartyId={askingPartyId}
            askedPartyIds={askedPartyIds}
          />
        )
      ) : (
        <PlanCalendar
          key={monthResetKey}
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
                  myResortKey={myPlanByDate.get(dateKey)?.resort_key ?? null}
                  myPlanHasEta={Boolean(myPlanByDate.get(dateKey)?.eta)}
                  onEditPlan={(resortKey) => {
                    setEditorError(null); setEditorDate(dateKey); setEditorSeedResort(resortKey)
                  }}
                  onAskToJoin={(party) => handleAskToJoin(dateKey, g.resortKey, party)}
                  askingPartyId={askingPartyId}
                  askedPartyIds={askedPartyIds}
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

      {editorDate && (
        <PlanEditorModal
          dateKey={editorDate}
          plan={myPlanByDate.get(editorDate) || null}
          resorts={resorts}
          busy={editorBusy}
          error={editorError}
          defaultResortKey={editorSeedResort}
          onSave={handleEditorSave}
          onClose={() => { setEditorDate(null); setEditorSeedResort(null) }}
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
