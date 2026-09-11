import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import DayAgendaList from "./calendar/DayAgendaList"
import FilterChipRow from "./calendar/FilterChipRow"
import CalendarFilterSheet from "./calendar/CalendarFilterSheet"
import PlanEditorModal from "./PlanEditorModal"
import FailureNotice from "./ui/FailureNotice"
import { runLoaders, mergeFailed, selectLoaders } from "../lib/loaderRegistry"
import { agendaRange, localDateKey } from "../lib/calendarDates"
import { groupByDayAndMountain } from "../lib/calendarGrouping"
import { resortName } from "../lib/resorts"
import { formatDate } from "../lib/format"
import { buildPlanUpsert } from "../lib/planUpsert"
import {
  getVisiblePlansInRange, getAcceptedFriends, getMyPartyMembershipsInRange, requestToJoinParty,
  getIncomingPartyRequests, respondToCrewInvite,
  getMyCrews, getCrewMembers, joinPlanAtResort, upsertDailyPlan,
  deleteDailyPlan, leaveParty,
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
  resorts = [], focusDate = null, onFocusHandled, addDayTick = 0,
}) {
  const [selected, setSelected] = useState(() => new Set(["me", "friends"]))
  const [sheetOpen, setSheetOpen] = useState(false)

  const [plans, setPlans] = useState([])
  const [partyMembers, setPartyMembers] = useState([])
  const [friends, setFriends] = useState([])
  const [crews, setCrews] = useState([])
  const [crewMemberIds, setCrewMemberIds] = useState(new Map())

  const [failed, setFailed] = useState({})
  const [hasLoaded, setHasLoaded] = useState(false)
  // The day a notification pointed at, if any: scrolled into view, and kept inside
  // the window even when it falls past the window's far edge.
  const [focusedDay, setFocusedDay] = useState(null)
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
  // True only when the editor was opened from "Add ski day" rather than by tapping a
  // specific day — that is the one case where the user still needs to choose the date.
  const [datePickable, setDatePickable] = useState(false)
  const [leavingKey, setLeavingKey] = useState(null)
  const [partyRequests, setPartyRequests] = useState([])
  const [decidingRequestId, setDecidingRequestId] = useState(null)
  const [decliningRequestId, setDecliningRequestId] = useState(null)
  const [declineNote, setDeclineNote] = useState("")

  const todayKey = localDateKey()
  const currentUserId = currentUser?.id || null

  // The page header's "+" lives in SkiPlansPage; the ski-day editor and its save path
  // live here. SkiPlansPage bumps a counter, we open the editor when it changes.
  //
  // A counter, not a boolean, so a second tap after cancelling still fires. Adjusted
  // during render rather than in an effect for the same reason SkiPlansPage adjusts
  // `lastFocus` that way — an effect would cascade an extra render and trip
  // react-hooks/set-state-in-effect. Guarded on currentUserId because the signed-out
  // path calls onRequireLogin, and calling a PARENT's setState during render is
  // illegal; SkiPlansPage does that guard itself before ever bumping the counter.
  const [lastAddTick, setLastAddTick] = useState(addDayTick)
  if (addDayTick !== lastAddTick) {
    setLastAddTick(addDayTick)
    if (currentUserId) handleAddSkiDay()
  }

  // ── Static blocks: load once, cached across date navigation ──────────────
  const STATIC_LOADERS = useMemo(() => [
    { key: "friends", label: "your friends list", fn: getAcceptedFriends, apply: (v) => setFriends(v || []), fallback: [] },
    // People asking to ski WITH me. In the registry rather than a bare fetch so a failure
    // surfaces as a retryable notice instead of an empty strip that looks like "no requests".
    { key: "partyRequests", label: "requests to ski with you", fn: getIncomingPartyRequests,
      apply: (v) => setPartyRequests(v || []), fallback: [] },
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

  // ── Plan range: a rolling window, not a navigable one ────────────────────
  // Keyed on a date STRING so the memo is stable across renders — `new Date()`
  // would be a new object every time and refetch the calendar forever.
  const { start, end, keys: dayKeys } = useMemo(
    () => agendaRange(todayKey, { includeKey: focusedDay }),
    [todayKey, focusedDay]
  )

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

  // Arrived from a notification about a specific day. There is no anchor to move any
  // more, so instead the day is remembered: agendaRange widens the window to include
  // it, DayAgendaList scrolls to it and opens "Show past days" if it is behind us.
  // Still released via onFocusHandled — a focus prop that never clears is a trap.
  useEffect(() => {
    if (!focusDate) return
    setFocusedDay(focusDate)
    onFocusHandled?.()
  }, [focusDate, onFocusHandled])

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

  /**
   * Back out of a day from the calendar itself.
   *
   * Deletes the plan rather than marking it cancelled: daily_plans is UNIQUE (user_id,
   * ski_date) and has no "not going" state, so no row IS not going. Same call the profile's
   * ski-plans tab already uses.
   *
   * Also leaves that day's party. If you are not skiing, you are not skiing WITH anyone — and
   * a membership row left behind would silently put you back in the group if you planned that
   * mountain again later. The plan delete goes first because it is the thing the user asked
   * for; a failed party-leave afterwards is untidy but invisible, since attendees are built
   * from plans.
   */
  async function handleLeavePlan(dateKey) {
    const plan = myPlanByDate.get(dateKey)
    if (!plan?.id || leavingKey) return

    setLeavingKey(dateKey)
    setJoinError(null)
    try {
      await deleteDailyPlan(plan.id)
      try {
        await leaveParty(dateKey)
      } catch (err) {
        console.error("[FriendsCalendar] left the plan but not the party:", err)
      }
      await loadPlans()
    } catch (err) {
      console.error("[FriendsCalendar] leave plan failed:", err)
      setJoinError(err?.message || "Couldn't remove your plan.")
    } finally {
      setLeavingKey(null)
    }
  }

  /**
   * Approve or turn down someone asking to ski with me on a given day.
   *
   * Lives here, on the calendar, because that is where the notification sends you. It used to
   * exist only in the Social tab's collapsed "Ski Invites" accordion, so tapping the
   * notification landed you on a calendar with nothing to act on — which is exactly what Kyle
   * reported.
   *
   * Accepting routes through respondToCrewInvite, which calls accept_plan_party and wires the
   * membership; the calendar then reloads so they appear in the group immediately.
   */
  async function handlePartyRequest(inviteId, status, note = null) {
    if (decidingRequestId) return
    setDecidingRequestId(inviteId)
    try {
      await respondToCrewInvite(inviteId, status, note)
      setDecliningRequestId(null)
      await Promise.all([runStatic(["partyRequests"]), loadPlans()])
    } catch (err) {
      console.error("[FriendsCalendar] party request decision failed:", err)
      setJoinError(err?.message || "Couldn't respond to that request.")
    } finally {
      setDecidingRequestId(null)
    }
  }

  /**
   * Open the ski-day editor.
   *
   * Two callers, one code path:
   *   handleAddSkiDay()            — from the page header's "+". No day chosen yet,
   *                                  so the modal gets onDateChange and lets you pick.
   *   handleAddSkiDay("2026-01-19") — from a day card's own "+". The day IS the
   *                                  question already answered; the modal renders the
   *                                  date as a plain heading (PlanEditorModal:90).
   */
  function handleAddSkiDay(seedDate = null) {
    if (!currentUserId) { onRequireLogin?.(); return }
    setEditorError(null)
    setEditorSeedResort(null)
    setDatePickable(!seedDate)
    // Clamp: past days are unreachable from the UI (DayAgendaList hides their "+"),
    // and a past date in a pickable editor would fight its own minDate.
    setEditorDate(!seedDate || seedDate < todayKey ? todayKey : seedDate)
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
      // A date beyond the visible window (picked via the pickable-date editor) would
      // otherwise vanish after saving -- the fetched range is still today's window,
      // so a plan saved past it renders nowhere. Reuse the same focusedDay/agendaRange
      // machinery this branch already built for notification deep-links (bounded by
      // AGENDA_MAX_WIDEN_DAYS) to widen the window and land on the day just saved.
      setFocusedDay(editorDate)
      setEditorDate(null)
      setEditorSeedResort(null)
    } catch (err) {
      console.error("[FriendsCalendar] plan save failed:", err)
      setEditorError(err?.message || "Couldn't save that plan.")
    } finally {
      setEditorBusy(false)
    }
  }

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
        borderRadius: 24, background: "var(--overlay-03)", border: "1px solid var(--overlay-08)",
        padding: "48px 28px", textAlign: "center", display: "grid", gap: 16, justifyItems: "center",
      }}>
        <div style={{ fontSize: 38 }}>📅</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: "var(--color-text-1)" }}>Sign in to see where your friends are skiing</div>
        <button
          onClick={() => onRequireLogin?.()}
          style={{ background: "var(--gradient-cta)", color: "var(--color-on-accent)", border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 14, fontWeight: 900, cursor: "pointer" }}
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
      <FilterChipRow
        crews={crews}
        selected={selected}
        onToggle={toggle}
        onOpenSheet={() => setSheetOpen(true)}
        friendFilterCount={friendFilterCount}
      />

      {/* People asking to ski WITH you, answerable right here.
          This is where the notification lands, so this is where the decision has to live —
          sending someone to a calendar and making them hunt the Social tab for the Approve
          button is the same as sending them nowhere. Sorted soonest-first: the day that is
          almost here is the one you need to answer. */}
      {partyRequests.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {[...partyRequests]
            .sort((a, b) => (a.ski_date || "").localeCompare(b.ski_date || ""))
            .map((req) => {
            const who = req.requester_profile?.full_name
              || req.requester_profile?.username
              || "Someone"
            const busy = decidingRequestId === req.id
            return (
              <div key={req.id} style={{
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                padding: "10px 12px", borderRadius: 12,
                background: "var(--color-accent-dim)",
                border: "1px solid var(--color-accent)",
              }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--color-text-1)" }}>
                    {who} wants to ski with you
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-2)", marginTop: 1 }}>
                    {resortName(req.resort_key) || req.resort_key} · {formatDate(req.ski_date)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => handlePartyRequest(req.id, "accepted")}
                    disabled={busy}
                    style={{
                      background: "var(--gradient-cta)", color: "var(--color-on-accent)", border: "none",
                      borderRadius: 10, padding: "8px 14px", minHeight: 40,
                      fontSize: 12, fontWeight: 900, cursor: busy ? "wait" : "pointer",
                    }}
                  >
                    {busy ? "…" : "Add to my group"}
                  </button>
                  <button
                    onClick={() => { setDecliningRequestId(req.id); setDeclineNote("") }}
                    disabled={busy}
                    style={{
                      background: "transparent", color: "var(--color-text-3)",
                      border: "1px solid var(--color-border)", borderRadius: 10,
                      padding: "8px 12px", minHeight: 40,
                      fontSize: 12, fontWeight: 700, cursor: busy ? "wait" : "pointer",
                    }}
                  >
                    Full group
                  </button>
                </div>

                {/* Same two-step as turning down a trip request: the note has to be writable
                    BEFORE the decision is sent, or it could never be written at all. Optional
                    — Send works empty and falls back to standard wording. */}
                {decliningRequestId === req.id && (
                  <div style={{ display: "grid", gap: 6, width: "100%" }}>
                    <textarea
                      value={declineNote}
                      onChange={(e) => setDeclineNote(e.target.value)}
                      placeholder="Add a note (optional) — goes to their inbox"
                      rows={2}
                      style={{
                        width: "100%", boxSizing: "border-box", resize: "none",
                        background: "var(--color-surface)", color: "var(--color-text-1)",
                        border: "1px solid var(--color-border)", borderRadius: 10,
                        padding: "8px 10px", fontSize: 13, outline: "none", fontFamily: "inherit",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => handlePartyRequest(req.id, "declined", declineNote)}
                        disabled={busy}
                        style={{
                          flex: 1, background: "var(--color-surface)", color: "var(--color-text-1)",
                          border: "1px solid var(--color-border)", borderRadius: 10,
                          padding: "8px 12px", minHeight: 38, fontSize: 12, fontWeight: 800,
                          cursor: busy ? "wait" : "pointer",
                        }}
                      >
                        {busy ? "Sending…" : "Send"}
                      </button>
                      <button
                        onClick={() => setDecliningRequestId(null)}
                        style={{
                          background: "transparent", color: "var(--color-text-3)", border: "none",
                          padding: "8px 12px", minHeight: 38, fontSize: 12, fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {failed.plans && <FailureNotice label="these days' plans" onRetry={loadPlans} />}
      {failed.crews && <FailureNotice label="your crews" onRetry={() => runStatic(["crews"])} />}
      {failed.friends && <FailureNotice label="your friends list" onRetry={() => runStatic(["friends"])} />}
      {failed.partyRequests && (
        <FailureNotice label="requests to ski with you" onRetry={() => runStatic(["partyRequests"])} />
      )}
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
            Nobody&apos;s planned a day yet.
          </div>
          {/* Two different things, so two buttons. This said "+ Plan a day" and created a
              TRIP — the same plan/trip conflation the rest of this feature works to undo. */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={handleAddSkiDay}
              style={{
                background: "var(--gradient-cta)", color: "var(--color-on-accent)", border: "none", borderRadius: 12,
                padding: "10px 20px", fontSize: 13, fontWeight: 900, cursor: "pointer", minHeight: 44,
              }}
            >
              + Add ski day
            </button>
            <button
              onClick={() => onPlanADay?.()}
              style={{
                background: "transparent", color: "var(--color-text-2)",
                border: "1px solid var(--color-border)", borderRadius: 12,
                padding: "10px 20px", fontSize: 13, fontWeight: 800, cursor: "pointer", minHeight: 44,
              }}
            >
              Create a trip
            </button>
          </div>
        </div>
      )}

      {!nobodyPlanned && (
        <DayAgendaList
          dayKeys={dayKeys}
          groupsByDay={groupsByDay}
          colorCtx={colorCtx}
          currentUserId={currentUserId}
          todayKey={todayKey}
          focusedDayKey={focusedDay}
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
          onLeave={handleLeavePlan}
          leavingKey={leavingKey}
          onAddDay={handleAddSkiDay}
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
          // Remount when the date changes so the form reseeds from THAT day's plan. The modal
          // initialises resort/ETA/visibility with useState, which only runs on mount, so
          // without this you would change the date and keep the previous day's values.
          key={editorDate}
          dateKey={editorDate}
          plan={myPlanByDate.get(editorDate) || null}
          resorts={resorts}
          busy={editorBusy}
          error={editorError}
          defaultResortKey={editorSeedResort}
          // Only the "Add ski day" button opens the editor without a day already chosen, so
          // only it makes the date editable.
          onDateChange={datePickable ? setEditorDate : undefined}
          minDate={datePickable ? todayKey : undefined}
          onSave={handleEditorSave}
          // The editor has always supported Remove; this page just never passed it, so the
          // only way to undo a plan was from the profile tab.
          onRemove={myPlanByDate.get(editorDate)
            ? () => { setEditorDate(null); handleLeavePlan(editorDate) }
            : undefined}
          onClose={() => { setEditorDate(null); setEditorSeedResort(null); setDatePickable(false) }}
        />
      )}
    </div>
  )
}
