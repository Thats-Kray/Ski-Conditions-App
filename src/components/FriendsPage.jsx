import { useEffect, useMemo, useState } from "react";
import CrewGroupChat from "./CrewGroupChat";
import LeaderboardPage from "./LeaderboardPage";
import {
  searchProfiles,
  sendFriendRequest,
  cancelOutgoingFriendRequest,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  respondToFriendRequest,
  getAcceptedFriends,
  getFriendsLeaderboard,
  createCrewInvite,
  getReceivedCrewInvites,
  getSentCrewInvites,
  respondToCrewInvite,
  getMySkiPlans,
  getFriendsUpcomingTrips,
  getMyPings,
  respondToPing,
  getMyDatePolls,
  voteOnDateOption,
} from "../lib/socialApi";
import { SkiPingComposer, PingCard } from "./SkiPingModal";
import { DateMatchmakerComposer, DatePollCard } from "./DateMatchmaker";

// ── Utilities ─────────────────────────────────────────────────────────────────

function getDisplayName(person) {
  return (
    person?.full_name ||
    [person?.first_name, person?.last_name].filter(Boolean).join(" ") ||
    person?.username ||
    "Unknown Skier"
  );
}

const RESORT_NAME_MAP = {
  arapahoebasin: "Arapahoe Basin", coppermountain: "Copper Mountain",
  winterpark: "Winter Park", vail: "Vail", beavercreek: "Beaver Creek",
  breckenridge: "Breckenridge", keystone: "Keystone", crestedbutte: "Crested Butte",
  telluride: "Telluride", steamboat: "Steamboat", eldora: "Eldora",
  aspen: "Aspen Snowmass", aspensnowmass: "Aspen Snowmass",
}

const RESORT_EMOJI = {
  vail: "🏔️", beavercreek: "⛰️", breckenridge: "❄️", keystone: "🎯",
  crestedbutte: "🌨️", telluride: "🌅", winterpark: "🌲", coppermountain: "🔴",
  arapahoebasin: "💎", steamboat: "♨️", eldora: "🌿", aspensnowmass: "✨",
}

function formatResortName(v) {
  if (!v) return "Unknown resort"
  if (typeof v === "object") return v?.name || "Unknown resort"
  const s = String(v).trim()
  if (s.startsWith("{")) { try { const p = JSON.parse(s); return p?.name || "Unknown resort" } catch { return s } }
  const key = s.toLowerCase().replace(/\s+/g, "")
  return RESORT_NAME_MAP[key] || s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

function formatDate(d) {
  if (!d) return ""
  const date = new Date(`${d}T12:00:00`)
  return isNaN(date) ? d : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}

function isPast(plan) {
  if (!plan?.ski_date) return false
  const today = new Date(); today.setHours(0,0,0,0)
  const d = new Date(`${plan.ski_date}T12:00:00`)
  return !isNaN(d) && d < today
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────

function Avatar({ profile, size = 40 }) {
  const name = getDisplayName(profile)
  if (profile?.avatar_url) {
    return (
      <img src={profile.avatar_url} alt={name}
        style={{ width: size, height: size, borderRadius: 999, objectFit: "cover", flexShrink: 0, border: "2px solid rgba(255,255,255,0.1)" }} />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 999, flexShrink: 0,
      background: "linear-gradient(135deg, rgba(37,99,235,0.6), rgba(8,145,178,0.5))",
      border: "2px solid rgba(96,165,250,0.25)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size * 0.38, color: "white",
    }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function FriendAvatar({ profile, size = 26 }) {
  const name = profile?.full_name || profile?.username || "?"
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt={name} title={name}
      style={{ width: size, height: size, borderRadius: 999, objectFit: "cover", border: "2px solid rgba(10,14,30,0.8)", flexShrink: 0 }} />
  }
  return (
    <div title={name} style={{
      width: size, height: size, borderRadius: 999, flexShrink: 0,
      background: "rgba(96,165,250,0.2)", border: "2px solid rgba(96,165,250,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.42, fontWeight: 800, color: "#93c5fd",
    }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

// ── Weekend Planner ───────────────────────────────────────────────────────────

function WeekendPlanner({ days }) {
  if (!days?.length) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.8 }}>
          Friends' Ski Plans
        </div>
        <div style={{ background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800, color: "#60a5fa" }}>
          Next 2 weeks
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
        {days.map((day) => (
          <div key={day.date} style={{
            flexShrink: 0, minWidth: 148,
            background: day.isWeekend ? "linear-gradient(145deg, rgba(37,99,235,0.2), rgba(8,145,178,0.12))" : "rgba(255,255,255,0.04)",
            border: day.isWeekend ? "1px solid rgba(96,165,250,0.25)" : "1px solid rgba(255,255,255,0.07)",
            borderRadius: 14, padding: "10px 12px",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: day.isWeekend ? "#60a5fa" : "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {day.dayName}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{day.dateLabel}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {day.trips.map((trip) => (
                <div key={trip.id} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "7px 9px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                    <span style={{ fontSize: 12 }}>{RESORT_EMOJI[trip.resort_key] || "⛷️"}</span>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "white" }}>{trip.resort_name}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {trip.friends.slice(0, 4).map((f, i) => (
                      <div key={f.id} style={{ marginLeft: i === 0 ? 0 : -6, zIndex: 10 - i }}>
                        <FriendAvatar profile={f} size={20} />
                      </div>
                    ))}
                    {trip.friends.length > 4 && (
                      <div style={{ marginLeft: 4, fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: 700 }}>+{trip.friends.length - 4}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Crew Invite Card (legacy) ─────────────────────────────────────────────────

function CrewInviteCard({ invite, onAccept, onDecline, working }) {
  const profile = invite.inviter_profile
  return (
    <div style={{
      borderRadius: 14, padding: "12px 14px",
      background: "linear-gradient(135deg, rgba(236,72,153,0.1), rgba(59,130,246,0.1))",
      border: "1px solid rgba(236,72,153,0.2)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Avatar profile={profile} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{getDisplayName(profile)} invited you to ski</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>
            {formatResortName(invite.resort_key)} · {formatDate(invite.ski_date)}
          </div>
        </div>
      </div>
      {invite.message && (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "8px 10px", marginBottom: 8, lineHeight: 1.4 }}>
          {invite.message}
        </div>
      )}
      {invite.status === "pending" ? (
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => onAccept(invite.id)} disabled={working === invite.id}
            style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#2563eb", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Accept
          </button>
          <button onClick={() => onDecline(invite.id)} disabled={working === invite.id}
            style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Decline
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12, fontWeight: 700, color: invite.status === "accepted" ? "#86efac" : "rgba(255,255,255,0.4)" }}>
          {invite.status === "accepted" ? "Accepted" : "Declined"}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FriendsPage({ hideCrew = false }) {
  const [searchText, setSearchText]           = useState("")
  const [searchResults, setSearchResults]     = useState([])
  const [incomingRequests, setIncomingRequests] = useState([])
  const [outgoingRequests, setOutgoingRequests] = useState([])
  const [acceptedFriends, setAcceptedFriends] = useState([])
  const [leaderboard, setLeaderboard]         = useState([])
  const [receivedInvites, setReceivedInvites] = useState([])
  const [sentInvites, setSentInvites]         = useState([])
  const [skiPlans, setSkiPlans]               = useState([])
  const [friendsWeekend, setFriendsWeekend]   = useState([])
  const [loadingPage, setLoadingPage]         = useState(true)
  const [searching, setSearching]             = useState(false)
  const [workingId, setWorkingId]             = useState(null)
  const [toast, setToast]                     = useState(null) // { type: "success"|"error", text }
  const [activeSection, setActiveSection]     = useState("leaderboard")
  const [friendsFilter, setFriendsFilter]     = useState("all") // "all" | "pending"
  const [showInviteId, setShowInviteId]       = useState(null)
  const [inviteForm, setInviteForm]           = useState({ resort_key: "", ski_date: "", departure_time: "06:00 AM", seats_available: 3, message: "" })
  const [showPingComposer, setShowPingComposer] = useState(false)
  const [pings, setPings]                     = useState({ sent: [], received: [] })
  const [respondingPingId, setRespondingPingId] = useState(null)
  const [showDateComposer, setShowDateComposer] = useState(false)
  const [datePolls, setDatePolls]             = useState({ created: [], received: [] })
  const [votingOptionId, setVotingOptionId]   = useState(null)
  const [showPastPlans, setShowPastPlans]     = useState(false)
  const [showLegacyInvites, setShowLegacyInvites] = useState(false)

  function showToast(type, text) {
    setToast({ type, text })
    setTimeout(() => setToast(null), 3000)
  }

  async function loadPageData() {
    setLoadingPage(true)
    try {
      const [incoming, outgoing, accepted, leaderboardData, receivedCrewInvites, sentCrewInvites, mySkiPlans, friendsTrips, pingData, pollData] = await Promise.all([
        getIncomingFriendRequests(),
        getOutgoingFriendRequests(),
        getAcceptedFriends(),
        getFriendsLeaderboard(),
        getReceivedCrewInvites(),
        getSentCrewInvites(),
        getMySkiPlans(),
        getFriendsUpcomingTrips(),
        getMyPings().catch(() => ({ sent: [], received: [] })),
        getMyDatePolls().catch(() => ({ created: [], received: [] })),
      ])
      setIncomingRequests(incoming || [])
      setOutgoingRequests(outgoing || [])
      setAcceptedFriends(accepted || [])
      setLeaderboard(leaderboardData || [])
      setReceivedInvites(receivedCrewInvites || [])
      setSentInvites(sentCrewInvites || [])
      setSkiPlans(mySkiPlans || [])
      setFriendsWeekend(friendsTrips || [])
      setPings(pingData || { sent: [], received: [] })
      setDatePolls(pollData || { created: [], received: [] })
    } catch (e) {
      showToast("error", e.message || "Failed to load.")
    } finally {
      setLoadingPage(false)
    }
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

  async function handleSendCrewInvite(friendId) {
    setWorkingId(friendId)
    try {
      const r = await createCrewInvite(friendId, inviteForm)
      await loadPageData()
      setShowInviteId(null)
      showToast("success", r?.action === "updated" ? "Invite updated." : "Invite sent!")
    } catch (e) { showToast("error", e.message || "Could not send invite.") }
    finally { setWorkingId(null) }
  }

  async function handleRespondToCrewInvite(inviteId, status) {
    setWorkingId(inviteId)
    try {
      await respondToCrewInvite(inviteId, status)
      await loadPageData()
      showToast("success", status === "accepted" ? "Invite accepted!" : "Invite declined.")
    } catch (e) { showToast("error", e.message || "Could not respond.") }
    finally { setWorkingId(null) }
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

  const upcomingPlans = useMemo(() => skiPlans.filter(p => !isPast(p)).sort((a,b) => new Date(a.ski_date) - new Date(b.ski_date)), [skiPlans])
  const pastPlans     = useMemo(() => skiPlans.filter(p => isPast(p)).sort((a,b) => new Date(b.ski_date) - new Date(a.ski_date)), [skiPlans])

  const hasActivity = pings.received.length > 0 || pings.sent.length > 0 || datePolls.received.length > 0 || datePolls.created.length > 0
  const hasLegacyInvites = receivedInvites.length > 0 || sentInvites.length > 0

  // ── Styles ────────────────────────────────────────────────────────────────

  const inputStyle = {
    width: "100%", padding: "12px 14px", borderRadius: 12, fontSize: 16,
    border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)",
    color: "white", outline: "none", boxSizing: "border-box", minHeight: 48,
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 0 80px", color: "#fff" }}>

      {/* ── Top tab bar ── */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16, background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 4 }}>
        {[
          { key: "leaderboard", label: "🏆 Board" },
          ...(hideCrew ? [] : [{ key: "crews", label: "🤙 Crews" }]),
          { key: "friends",     label: "👥 Friends" },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setActiveSection(key)} style={{
            flex: 1, padding: "11px 8px", borderRadius: 9, border: "none", cursor: "pointer",
            fontWeight: 800, fontSize: 14, minHeight: 44,
            background: activeSection === key ? "rgba(255,255,255,0.14)" : "transparent",
            color: activeSection === key ? "white" : "rgba(255,255,255,0.4)",
            position: "relative",
          }}>
            {label}
            {key === "friends" && incomingRequests.length > 0 && (
              <span style={{
                position: "absolute", top: 6, right: 8,
                width: 7, height: 7, borderRadius: 999,
                background: "#ef4444",
              }} />
            )}
          </button>
        ))}
      </div>

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

      {/* ══ LEADERBOARD TAB ══ */}
      {activeSection === "leaderboard" && <LeaderboardPage />}

      {/* ══ CREWS TAB ══ */}
      {activeSection === "crews" && <CrewGroupChat friends={acceptedFriends} />}

      {/* ══ FRIENDS TAB ══ */}
      {activeSection === "friends" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* 1 ── Incoming friend requests (priority surface) ── */}
          {incomingRequests.length > 0 && (
            <div style={{
              borderRadius: 16,
              background: "linear-gradient(135deg, rgba(59,130,246,0.14), rgba(139,92,246,0.1))",
              border: "1px solid rgba(96,165,250,0.28)",
              padding: "14px 16px",
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                {incomingRequests.length} Friend Request{incomingRequests.length > 1 ? "s" : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {incomingRequests.map((req) => (
                  <div key={req.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar profile={req.requester_profile} size={38} />
                    <div style={{ flex: 1, minWidth: 0 }}>
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
                        style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#2563eb", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
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

          {/* 2 ── Quick action strip ── */}
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { icon: "👋", label: "Ping Crew", onClick: () => setShowPingComposer(true), accent: "rgba(59,130,246,0.8)" },
              { icon: "📅", label: "Pick a Date", onClick: () => setShowDateComposer(true), accent: "rgba(139,92,246,0.8)" },
            ].map(({ icon, label, onClick, accent }) => (
              <button key={label} onClick={onClick} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                padding: "13px 14px", borderRadius: 12, minHeight: 48,
                border: `1px solid ${accent.replace("0.8", "0.3")}`,
                background: accent.replace("0.8", "0.12"),
                color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer",
              }}>
                {icon} {label}
              </button>
            ))}
          </div>

          {/* 3 ── Friends' Ski Plans (weekend planner) ── */}
          <WeekendPlanner days={friendsWeekend} />

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
            {/* Search bar */}
            <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15, color: "rgba(255,255,255,0.35)", pointerEvents: "none" }}>
                  🔍
                </span>
                <input
                  value={searchText}
                  onChange={e => { setSearchText(e.target.value); if (!e.target.value) setSearchResults([]) }}
                  onKeyDown={e => e.key === "Enter" && handleSearch(e)}
                  placeholder="Find skiers by name or username…"
                  style={{ ...inputStyle, paddingLeft: 38 }}
                />
              </div>
              <button type="submit" disabled={searching || !searchText.trim()} style={{
                padding: "12px 18px", borderRadius: 12, border: "none", flexShrink: 0, minHeight: 48,
                background: searchText.trim() ? "#2563eb" : "rgba(255,255,255,0.07)",
                color: searchText.trim() ? "white" : "rgba(255,255,255,0.3)",
                fontWeight: 700, fontSize: 14, cursor: searchText.trim() ? "pointer" : "default",
              }}>
                {searching ? "…" : "Search"}
              </button>
            </form>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                  Search Results
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {decoratedSearch.map((p) => (
                    <div key={p.id} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                      borderRadius: 12, background: "rgba(255,255,255,0.04)",
                    }}>
                      <Avatar profile={p} size={40} />
                      <div style={{ flex: 1, minWidth: 0 }}>
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
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#86efac", background: "rgba(134,239,172,0.12)", borderRadius: 8, padding: "5px 10px" }}>Friends</span>
                        ) : p.hasIncoming ? (
                          <button onClick={() => handleRespondToRequest(incomingRequests.find(r => r.requester_id === p.id)?.id, "accepted")}
                            style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(250,204,21,0.15)", color: "#fde68a", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                            Accept
                          </button>
                        ) : p.isPending ? (
                          <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.07)", borderRadius: 8, padding: "5px 10px" }}>Pending</span>
                        ) : (
                          <button onClick={() => handleSendRequest(p.id)} disabled={workingId === p.id}
                            style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#2563eb", color: "white", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                            {workingId === p.id ? "…" : "+ Add"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                      background: friendsFilter === key ? "#2563eb" : "rgba(255,255,255,0.12)",
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
                        <Avatar profile={friend} size={42} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {getDisplayName(friend)}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                            {friend.username && (
                              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>@{friend.username}</span>
                            )}
                            {friend.daysTogether > 0 && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", background: "rgba(96,165,250,0.12)", borderRadius: 6, padding: "2px 7px" }}>
                                {friend.daysTogether} shared day{friend.daysTogether !== 1 ? "s" : ""}
                              </span>
                            )}
                            {friend.topResort && (
                              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                                {RESORT_EMOJI[friend.topResort] || "⛷️"} {formatResortName(friend.topResort)}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setShowInviteId(showInviteId === friend.id ? null : friend.id)}
                          style={{
                            padding: "10px 14px", borderRadius: 10, border: "none", flexShrink: 0, minHeight: 40,
                            background: showInviteId === friend.id ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.07)",
                            color: showInviteId === friend.id ? "#60a5fa" : "rgba(255,255,255,0.5)",
                            fontWeight: 700, fontSize: 13, cursor: "pointer",
                          }}>
                          {showInviteId === friend.id ? "✕" : "Invite"}
                        </button>
                      </div>

                      {/* Inline invite composer */}
                      {showInviteId === friend.id && (
                        <div style={{
                          margin: "2px 0 4px", borderRadius: "0 0 14px 14px",
                          padding: "14px 14px 16px",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderTop: "none",
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>
                            Invite {getDisplayName(friend)} to ski
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <input value={inviteForm.resort_key} onChange={e => setInviteForm(f => ({ ...f, resort_key: e.target.value }))}
                              placeholder="Resort (e.g. vail)" style={{ ...inputStyle, fontSize: 13, padding: "8px 10px" }} />
                            <input type="date" value={inviteForm.ski_date} onChange={e => setInviteForm(f => ({ ...f, ski_date: e.target.value }))}
                              style={{ ...inputStyle, fontSize: 13, padding: "8px 10px" }} />
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <input value={inviteForm.departure_time} onChange={e => setInviteForm(f => ({ ...f, departure_time: e.target.value }))}
                              placeholder="Departure time" style={{ ...inputStyle, fontSize: 13, padding: "8px 10px" }} />
                            <input type="number" min="0" value={inviteForm.seats_available} onChange={e => setInviteForm(f => ({ ...f, seats_available: e.target.value }))}
                              placeholder="Extra seats" style={{ ...inputStyle, fontSize: 13, padding: "8px 10px" }} />
                          </div>
                          <textarea value={inviteForm.message} onChange={e => setInviteForm(f => ({ ...f, message: e.target.value }))}
                            placeholder="Add a note…" rows={2}
                            style={{ ...inputStyle, fontSize: 13, padding: "8px 10px", resize: "none", marginBottom: 8 }} />
                          <button onClick={() => handleSendCrewInvite(friend.id)} disabled={workingId === friend.id}
                            style={{ width: "100%", padding: "9px", borderRadius: 10, border: "none", background: "#2563eb", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                            {workingId === friend.id ? "Sending…" : "Send Invite"}
                          </button>
                        </div>
                      )}
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

          {/* 6 ── Upcoming Ski Plans ── */}
          {(upcomingPlans.length > 0 || !loadingPage) && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                My Ski Plans
              </div>
              {upcomingPlans.length === 0 ? (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", padding: "12px 0" }}>No upcoming plans yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {upcomingPlans.map((plan) => (
                    <div key={plan.id} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
                      borderRadius: 12,
                      background: "linear-gradient(135deg, rgba(37,99,235,0.12), rgba(8,145,178,0.08))",
                      border: "1px solid rgba(96,165,250,0.15)",
                    }}>
                      <span style={{ fontSize: 22, flexShrink: 0 }}>{RESORT_EMOJI[plan.resort_key] || "⛷️"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: "white" }}>{formatResortName(plan.resort_key)}</div>
                        <div style={{ fontSize: 12, color: "#93c5fd", marginTop: 1 }}>{formatDate(plan.ski_date)}</div>
                      </div>
                      {plan.note && (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{plan.note}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {pastPlans.length > 0 && (
                <button onClick={() => setShowPastPlans(v => !v)}
                  style={{ marginTop: 8, padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  {showPastPlans ? "Hide" : `Show ${pastPlans.length} past plan${pastPlans.length > 1 ? "s" : ""}`}
                </button>
              )}
              {showPastPlans && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                  {pastPlans.map((plan) => (
                    <div key={plan.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <span style={{ fontSize: 16 }}>{RESORT_EMOJI[plan.resort_key] || "⛷️"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{formatResortName(plan.resort_key)}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>{formatDate(plan.ski_date)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 7 ── Legacy crew invites (collapsed by default) ── */}
          {hasLegacyInvites && (
            <div>
              <button onClick={() => setShowLegacyInvites(v => !v)} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 0",
                background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontWeight: 700, fontSize: 12,
              }}>
                <span style={{ transform: showLegacyInvites ? "rotate(90deg)" : "none", display: "inline-block", transition: "transform 0.15s" }}>›</span>
                Ski Invites ({receivedInvites.filter(i => i.status === "pending").length} pending)
              </button>
              {showLegacyInvites && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                  {receivedInvites.map((invite) => (
                    <CrewInviteCard
                      key={invite.id}
                      invite={invite}
                      onAccept={(id) => handleRespondToCrewInvite(id, "accepted")}
                      onDecline={(id) => handleRespondToCrewInvite(id, "declined")}
                      working={workingId}
                    />
                  ))}
                  {sentInvites.map((invite) => (
                    <div key={invite.id} style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>
                        Invited {getDisplayName(invite.invitee_profile)} · {formatResortName(invite.resort_key)} · {formatDate(invite.ski_date)}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3, fontWeight: 600 }}>
                        Status: {invite.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* ── Modals ── */}
      {showPingComposer && (
        <SkiPingComposer
          friends={acceptedFriends}
          onClose={() => setShowPingComposer(false)}
          onSent={async () => setPings(await getMyPings().catch(() => ({ sent: [], received: [] })))}
        />
      )}
      {showDateComposer && (
        <DateMatchmakerComposer
          friends={acceptedFriends}
          onClose={() => setShowDateComposer(false)}
          onCreated={async () => setDatePolls(await getMyDatePolls().catch(() => ({ created: [], received: [] })))}
        />
      )}
    </div>
  )
}
