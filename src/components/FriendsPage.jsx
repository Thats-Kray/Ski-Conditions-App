import { useEffect, useMemo, useState } from "react";
import UserProfileModal from "./UserProfileModal";
import {
  searchProfiles,
  sendFriendRequest,
  cancelOutgoingFriendRequest,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  respondToFriendRequest,
  getAcceptedFriends,
  getFriendsLeaderboard,
  getMyPings,
  respondToPing,
  getMyDatePolls,
  voteOnDateOption,
} from "../lib/socialApi";
import { PingCard } from "./SkiPingModal";
import { DateMatchmakerComposer, DatePollCard } from "./DateMatchmaker";
import { resortName, resortEmoji as getResortEmoji } from "../lib/resorts";
import Avatar from "./ui/Avatar";
import FailureNotice from "./ui/FailureNotice";
import { runLoaders, mergeFailed, selectLoaders } from "../lib/loaderRegistry";

// ── Utilities ─────────────────────────────────────────────────────────────────

function getDisplayName(person) {
  return (
    person?.full_name ||
    [person?.first_name, person?.last_name].filter(Boolean).join(" ") ||
    person?.username ||
    "Unknown Skier"
  );
}

function formatResortName(v) {
  if (!v) return "Unknown resort"
  if (typeof v === "object") return v?.name || "Unknown resort"
  const s = String(v).trim()
  if (s.startsWith("{")) { try { const p = JSON.parse(s); return p?.name || "Unknown resort" } catch { return s } }
  return resortName(s) || s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FriendsPage({ onMessageFriend = null }) {
  const [searchText, setSearchText]           = useState("")
  const [searchResults, setSearchResults]     = useState([])
  const [incomingRequests, setIncomingRequests] = useState([])
  const [outgoingRequests, setOutgoingRequests] = useState([])
  const [acceptedFriends, setAcceptedFriends] = useState([])
  const [leaderboard, setLeaderboard]         = useState([])
  const [loadingPage, setLoadingPage]         = useState(true)
  const [failed, setFailed]                   = useState({}) // loader key -> true
  const [searching, setSearching]             = useState(false)
  const [workingId, setWorkingId]             = useState(null)
  const [toast, setToast]                     = useState(null) // { type: "success"|"error", text }
  const [friendsFilter, setFriendsFilter]     = useState("all") // "all" | "pending"
  const [pings, setPings]                     = useState({ sent: [], received: [] })
  const [respondingPingId, setRespondingPingId] = useState(null)
  const [showDateComposer, setShowDateComposer] = useState(false)
  const [showOverflow, setShowOverflow]       = useState(false)
  const [datePolls, setDatePolls]             = useState({ created: [], received: [] })
  const [votingOptionId, setVotingOptionId]   = useState(null)
  const [viewingUserId, setViewingUserId]         = useState(null)

  function showToast(type, text) {
    setToast({ type, text })
    setTimeout(() => setToast(null), 3000)
  }

  /**
   * The page's six data blocks, as loader descriptors.
   *
   * These were ten calls in a single Promise.all. Because Promise.all is all-or-
   * nothing, ONE rejection skipped all six setters and left five healthy sections
   * rendering as empty behind a toast that vanished after three seconds — which is
   * exactly what a stale-bundle 403 on `profiles` did to the whole Social tab on
   * 2026-08-18.
   *
   * Note that pings and datePolls no longer carry a `.catch(() => ...)`. Those
   * swallows meant those two blocks failed with no toast, no console line and no
   * visible difference from "you have no pings". The fallback below produces the
   * same empty state, but the failure is also recorded and surfaced.
   *
   * The setters are stable across renders, so rebuilding this array per call costs
   * nothing and avoids a memo whose deps could drift.
   */
  function pageLoaders() {
    return [
      { key: "incoming",     label: "your friend requests", fn: getIncomingFriendRequests, fallback: [], apply: setIncomingRequests },
      { key: "outgoing",     label: "your sent requests",   fn: getOutgoingFriendRequests, fallback: [], apply: setOutgoingRequests },
      { key: "friends",      label: "your friends list",    fn: getAcceptedFriends,        fallback: [], apply: setAcceptedFriends },
      { key: "leaderboard",  label: "the leaderboard",      fn: getFriendsLeaderboard,     fallback: [], apply: setLeaderboard },
      { key: "pings",        label: "your ski pings",       fn: getMyPings,                fallback: { sent: [], received: [] },    apply: setPings },
      { key: "datePolls",    label: "your date polls",      fn: getMyDatePolls,            fallback: { created: [], received: [] }, apply: setDatePolls },
    ]
  }

  /**
   * @param {string[]} [subset] loader keys to reload; omit to reload everything.
   *
   * Array.isArray guards the case where this is ever wired as `onClick={loadPageData}`
   * — React would hand it a click event as `subset`, and it would silently reload
   * nothing. That exact mistake shipped once already (onClick={loadPlans} feeding a
   * click event into a new parameter), so it is cheap to make impossible here.
   */
  async function loadPageData(subset) {
    const keys = Array.isArray(subset) ? subset : null
    const list = selectLoaders(pageLoaders(), keys)

    // Only the full load owns the page-level spinner; a single-block retry should
    // not blank the nine sections that are fine.
    if (!keys) setLoadingPage(true)

    const { values, failed: nowFailed } = await runLoaders(list, { logPrefix: "FriendsPage" })
    list.forEach((l) => l.apply(values.get(l.key)))
    setFailed((prev) => mergeFailed(prev, list.map((l) => l.key), nowFailed.keys()))

    if (!keys) setLoadingPage(false)
  }

  useEffect(() => { loadPageData() }, [])

  async function handleSearch(e) {
    e?.preventDefault()
    if (!searchText.trim()) return
    setSearching(true)
    try {
      setSearchResults(await searchProfiles(searchText.trim()) || [])
    } catch (e) {
      showToast("error", e.message || "Search failed.")
    } finally {
      setSearching(false)
    }
  }

  async function handleSendRequest(profileId) {
    setWorkingId(profileId)
    try {
      const r = await sendFriendRequest(profileId)
      await loadPageData()
      if (searchText.trim()) setSearchResults(await searchProfiles(searchText.trim()) || [])
      const msgs = { created: "Request sent!", revived: "Request re-sent.", already_sent: "Already sent.", incoming_pending: "They already sent you a request.", already_friends: "Already friends." }
      showToast("success", msgs[r?.action] || "Done.")
    } catch (e) { showToast("error", e.message || "Could not send request.") }
    finally { setWorkingId(null) }
  }

  async function handleRespondToRequest(requestId, status) {
    setWorkingId(requestId)
    try {
      await respondToFriendRequest(requestId, status)
      await loadPageData()
      showToast("success", status === "accepted" ? "Friend added!" : "Request declined.")
    } catch (e) { showToast("error", e.message || "Could not update request.") }
    finally { setWorkingId(null) }
  }

  async function handleCancelOutgoing(requestId) {
    setWorkingId(requestId)
    try {
      await cancelOutgoingFriendRequest(requestId)
      await loadPageData()
      showToast("success", "Request canceled.")
    } catch (e) { showToast("error", e.message || "Could not cancel.") }
    finally { setWorkingId(null) }
  }

  async function handleRespondToPing(pingId, response) {
    setRespondingPingId(pingId)
    try {
      await respondToPing(pingId, response)
      setPings(await getMyPings().catch(() => ({ sent: [], received: [] })))
    } catch (e) { console.error(e) }
    finally { setRespondingPingId(null) }
  }

  async function handleVoteOnDate(optionId, available) {
    setVotingOptionId(optionId)
    try {
      await voteOnDateOption(optionId, available)
      setDatePolls(await getMyDatePolls().catch(() => ({ created: [], received: [] })))
    } catch (e) { console.error(e) }
    finally { setVotingOptionId(null) }
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  const outgoingRecipientIds = useMemo(() => new Set(outgoingRequests.map(r => r.recipient_id)), [outgoingRequests])
  const incomingRequesterIds = useMemo(() => new Set(incomingRequests.map(r => r.requester_id)), [incomingRequests])
  const acceptedFriendIds    = useMemo(() => new Set(acceptedFriends.map(f => f.id)), [acceptedFriends])
  const leaderboardById      = useMemo(() => new Map(leaderboard.map(f => [f.id, f])), [leaderboard])

  const decoratedSearch = useMemo(() => searchResults.map(p => ({
    ...p,
    isPending: outgoingRecipientIds.has(p.id),
    hasIncoming: incomingRequesterIds.has(p.id),
    isFriend: acceptedFriendIds.has(p.id),
    daysTogether: leaderboardById.get(p.id)?.daysTogether ?? 0,
  })), [searchResults, outgoingRecipientIds, incomingRequesterIds, acceptedFriendIds, leaderboardById])

  const decoratedFriends = useMemo(() => acceptedFriends.map(f => ({
    ...f,
    daysTogether: leaderboardById.get(f.id)?.daysTogether ?? 0,
    daysOnMountain: leaderboardById.get(f.id)?.daysOnMountain ?? 0,
    topResort: leaderboardById.get(f.id)?.topResort ?? null,
  })), [acceptedFriends, leaderboardById])

  const hasActivity = pings.received.length > 0 || pings.sent.length > 0 || datePolls.received.length > 0 || datePolls.created.length > 0

  // ── Styles ────────────────────────────────────────────────────────────────
  // Values transcribed from the mockup (PowDays Reorg Mockup.dc.html:318-351). The
  // mockup is drawn in the default Blizzard theme, so its literals ARE this app's
  // tokens: #38bdf8 is --color-accent, rgba(125,211,252,0.45) is --color-text-3,
  // #04080f is --color-bg. Tokens are used rather than the hexes because the app ships
  // five themes (index.css:157-236) and a hardcoded accent breaks four of them.

  // Not yet consumed in this task -- Tasks 7-10 (Requests/Friends/pending-disclosure
  // rows) wire these in as they restyle their own sections. Defined here, once, so
  // every later task shares the exact same row shape instead of re-deriving it.
  /* eslint-disable no-unused-vars */
  const sectionLabelStyle = {
    fontSize: 11, fontWeight: 800, letterSpacing: 0.8,
    textTransform: "uppercase", color: "var(--color-text-3)",
  }

  const rowStyle = {
    display: "flex", alignItems: "center", gap: 11,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14, padding: "10px 12px",
  }

  const rowNameStyle = {
    fontSize: 13, fontWeight: 800, color: "var(--color-text-1)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  }

  const rowSubStyle = {
    fontSize: 11, color: "var(--color-text-3)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  }
  /* eslint-enable no-unused-vars */

  // 32x32 per the mockup. Smaller than the 44px minimum used elsewhere in this file --
  // a deliberate, spec-confirmed mockup match. Flag at click-through if it is hard to
  // hit on a real phone; bumping to 36-40 is a one-line change here.
  const iconButtonBase = {
    width: 32, height: 32, borderRadius: 9, flexShrink: 0,
    display: "grid", placeItems: "center",
    cursor: "pointer", padding: 0,
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 0 80px", color: "var(--color-text-1)" }}>

      {/* ── Per-block load failures ──
          One row per block that failed, each with its own Retry. Persistent by
          design: the old 3-second toast disappeared while the empty section it
          explained stayed on screen, so a broken tab looked identical to an
          empty one. */}
      {pageLoaders()
        .filter((l) => failed[l.key])
        .map((l) => (
          <FailureNotice
            key={l.key}
            label={l.label}
            onRetry={() => loadPageData([l.key])}
          />
        ))}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: "fixed", top: "max(20px, env(safe-area-inset-top) + 12px)", left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, padding: "10px 20px", borderRadius: 12, fontWeight: 700, fontSize: 14,
          background: toast.type === "error" ? "rgba(239,68,68,0.95)" : "rgba(16,185,129,0.95)",
          color: "white", boxShadow: "0 4px 24px rgba(0,0,0,0.4)", pointerEvents: "none",
          whiteSpace: "nowrap",
        }}>
          {toast.text}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* 1 ── Search + overflow ──
            Mockup order puts search first. The "···" button is the only home for the
            Date Matchmaker composer now that the quick-action strip is gone --
            DateMatchmakerComposer is not reachable from anywhere else in the app, and
            createDatePoll writes no notification, so losing this trigger would make
            date polls uncreatable. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <form onSubmit={handleSearch} style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 9,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12, padding: "10px 12px",
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="var(--color-text-3)" strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={searchText}
                onChange={e => { setSearchText(e.target.value); if (!e.target.value) setSearchResults([]) }}
                placeholder="Search skiers"
                aria-label="Search skiers by name or username"
                style={{
                  flex: 1, minWidth: 0, background: "transparent", border: "none",
                  outline: "none", color: "var(--color-text-1)",
                  fontSize: 16, padding: 0,
                }}
              />
              {searching && (
                <span style={{ fontSize: 12, color: "var(--color-text-3)", flexShrink: 0 }}>…</span>
              )}
            </div>
            {/* Submit-on-Enter only. The mockup has no Search button, and the form's
                native submit already covers the Enter key -- so the old explicit
                onKeyDown handler is gone rather than duplicated. */}
          </form>

          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setShowOverflow(v => !v)}
              aria-label="More friend actions"
              aria-expanded={showOverflow}
              style={{
                ...iconButtonBase,
                width: 36, height: 36,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "var(--color-text-3)",
                fontSize: 16, fontWeight: 900, lineHeight: 1,
              }}
            >
              ···
            </button>

            {showOverflow && (
              <>
                {/* Full-screen click-catcher: without it the menu can only be closed
                    by picking an item, which on touch means it sticks. */}
                <div
                  onClick={() => setShowOverflow(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 40 }}
                />
                <div style={{
                  position: "absolute", top: 42, right: 0, zIndex: 41,
                  minWidth: 172,
                  background: "var(--color-surface-popover)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12, padding: 4,
                  boxShadow: "var(--shadow-card)",
                }}>
                  <button
                    type="button"
                    onClick={() => { setShowOverflow(false); setShowDateComposer(true) }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "10px 12px", borderRadius: 9, minHeight: 44,
                      background: "transparent", border: "none",
                      color: "var(--color-text-1)", fontSize: 13, fontWeight: 700,
                      cursor: "pointer", textAlign: "left",
                    }}
                  >
                    📅 Pick a Date
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 2 ── Search results ── */}
        {searchResults.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
              Search Results
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {decoratedSearch.map((p) => (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  borderRadius: 12, background: "rgba(255,255,255,0.04)",
                }}>
                  <button onClick={() => setViewingUserId(p.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}>
                    <Avatar profile={p} size={40} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setViewingUserId(p.id)}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {getDisplayName(p)}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>
                      @{p.username || "—"}
                      {p.favorite_mountain ? ` · ${p.favorite_mountain}` : ""}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {p.isFriend ? (
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-success)", background: "rgba(134,239,172,0.12)", borderRadius: 8, padding: "5px 10px" }}>Friends</span>
                    ) : p.hasIncoming ? (
                      <button onClick={() => handleRespondToRequest(incomingRequests.find(r => r.requester_id === p.id)?.id, "accepted")}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(250,204,21,0.15)", color: "var(--color-warning)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        Accept
                      </button>
                    ) : p.isPending ? (
                      <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.07)", borderRadius: 8, padding: "5px 10px" }}>Pending</span>
                    ) : (
                      <button onClick={() => handleSendRequest(p.id)} disabled={workingId === p.id}
                        style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "var(--color-accent-deep)", color: "white", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        {workingId === p.id ? "…" : "+ Add"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3 ── Incoming friend requests (priority surface) ── */}
        {incomingRequests.length > 0 && (
          <div style={{
            borderRadius: 16,
            background: "linear-gradient(135deg, rgba(59,130,246,0.14), rgba(139,92,246,0.1))",
            border: "1px solid rgba(96,165,250,0.28)",
            padding: "14px 16px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--color-accent-soft)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
              {incomingRequests.length} Friend Request{incomingRequests.length > 1 ? "s" : ""}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {incomingRequests.map((req) => (
                <div key={req.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button onClick={() => setViewingUserId(req.requester_profile?.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}>
                    <Avatar profile={req.requester_profile} size={38} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setViewingUserId(req.requester_profile?.id)}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {getDisplayName(req.requester_profile)}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>
                      @{req.requester_profile?.username || "—"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => handleRespondToRequest(req.id, "accepted")}
                      disabled={workingId === req.id}
                      style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "var(--color-accent-deep)", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                      Accept
                    </button>
                    <button
                      onClick={() => handleRespondToRequest(req.id, "declined")}
                      disabled={workingId === req.id}
                      style={{ padding: "7px 10px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", fontWeight: 700, fontSize: 16, cursor: "pointer", lineHeight: 1 }}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4 ── Activity feed (pings + date polls) ── */}
        {hasActivity && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
              Activity
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pings.received.map(p => (
                <PingCard key={p.id} ping={p} onRespond={handleRespondToPing} responding={respondingPingId} />
              ))}
              {datePolls.received.map(p => (
                <DatePollCard key={p.id} poll={p} onVote={handleVoteOnDate} voting={votingOptionId} />
              ))}
              {pings.sent.map(p => <PingCard key={p.id} ping={p} />)}
              {datePolls.created.map(p => <DatePollCard key={p.id} poll={p} />)}
            </div>
          </div>
        )}

        {/* 5 ── Friends list ── */}
        <div>
          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 2, marginBottom: 10, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 3 }}>
            {[
              { key: "all", label: "Friends", count: decoratedFriends.length },
              { key: "pending", label: "Pending", count: outgoingRequests.length },
            ].map(({ key, label, count }) => (
              <button key={key} onClick={() => setFriendsFilter(key)} style={{
                flex: 1, padding: "10px 8px", borderRadius: 8, border: "none", cursor: "pointer",
                fontWeight: 700, fontSize: 14, minHeight: 44,
                background: friendsFilter === key ? "rgba(255,255,255,0.13)" : "transparent",
                color: friendsFilter === key ? "white" : "rgba(255,255,255,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                {label}
                {count > 0 && (
                  <span style={{
                    background: friendsFilter === key ? "var(--color-accent-deep)" : "rgba(255,255,255,0.12)",
                    color: friendsFilter === key ? "white" : "rgba(255,255,255,0.45)",
                    borderRadius: 999, padding: "1px 7px", fontSize: 11, fontWeight: 800,
                  }}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Friends list */}
          {friendsFilter === "all" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {loadingPage ? (
                <div style={{ padding: "20px 0", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Loading…</div>
              ) : decoratedFriends.length === 0 ? (
                <div style={{ padding: "28px 20px", textAlign: "center", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🎿</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>No friends yet</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>Search for skiers above to get started</div>
                </div>
              ) : (
                decoratedFriends.map((friend) => (
                  <div key={friend.id}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "12px 12px",
                      borderRadius: 12, background: "rgba(255,255,255,0.04)",
                      border: "1px solid transparent", minHeight: 64,
                    }}>
                      <button onClick={() => setViewingUserId(friend.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}>
                        <Avatar profile={friend} size={42} />
                      </button>
                      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setViewingUserId(friend.id)}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {getDisplayName(friend)}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                          {friend.username && (
                            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>@{friend.username}</span>
                          )}
                          {friend.daysTogether > 0 && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-accent-soft)", background: "rgba(96,165,250,0.12)", borderRadius: 6, padding: "2px 7px" }}>
                              {friend.daysTogether} shared day{friend.daysTogether !== 1 ? "s" : ""}
                            </span>
                          )}
                          {friend.topResort && (
                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                              {getResortEmoji(friend.topResort)} {formatResortName(friend.topResort)}
                            </span>
                          )}
                        </div>
                      </div>
                      {onMessageFriend && (
                        <button
                          onClick={() => onMessageFriend(friend)}
                          title="Message"
                          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(96,165,250,0.25)", background: "rgba(37,99,235,0.12)", color: "var(--color-accent-soft)", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0, minHeight: 40 }}
                        >
                          💬
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Pending outgoing */}
          {friendsFilter === "pending" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {outgoingRequests.length === 0 ? (
                <div style={{ padding: "24px 20px", textAlign: "center", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
                  No pending requests.
                </div>
              ) : (
                outgoingRequests.map((req) => (
                  <div key={req.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px", borderRadius: 12, background: "rgba(255,255,255,0.04)", minHeight: 64 }}>
                    <Avatar profile={req.recipient_profile} size={42} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {getDisplayName(req.recipient_profile)}
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(250,204,21,0.7)", marginTop: 2, fontWeight: 600 }}>Pending</div>
                    </div>
                    <button onClick={() => handleCancelOutgoing(req.id)} disabled={workingId === req.id}
                      style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0, minHeight: 40 }}>
                      {workingId === req.id ? "…" : "Cancel"}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

      </div>

      {/* ── Modals ── */}
      {showDateComposer && (
        <DateMatchmakerComposer
          friends={acceptedFriends}
          onClose={() => setShowDateComposer(false)}
          onCreated={async () => setDatePolls(await getMyDatePolls().catch(() => ({ created: [], received: [] })))}
        />
      )}
      {viewingUserId && (
        <UserProfileModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />
      )}
    </div>
  )
}
