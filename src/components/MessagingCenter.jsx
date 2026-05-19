import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "../lib/supabase"
import { useMobile } from "../lib/useMobile"
import {
  getCurrentUser,
  getMyCrews,
  getPendingCrewInvites,
  acceptCrewInvite,
  declineCrewInvite,
  createCrew,
  getAcceptedFriends,
  getMyTripConversations,
  getDMConversations,
  markDMsRead,
  getIncomingFriendRequests,
} from "../lib/socialApi"
import { CrewChatView } from "./CrewGroupChat"
import FriendsPage from "./FriendsPage"
import TripChatView, { tripDisplayName } from "./TripChatView"
import DirectMessageView from "./DirectMessageView"
import { timeAgo } from "../lib/format"
import Avatar from "./ui/Avatar"
import { SkiPingComposer } from "./SkiPingModal"

// ── Local read-status tracking ───────────────────────────────────────────────

const LS_PREFIX = "pd_cr_"
function getLastRead(crewId) {
  try { return localStorage.getItem(LS_PREFIX + crewId) || null } catch { return null }
}
function markRead(crewId) {
  try { localStorage.setItem(LS_PREFIX + crewId, new Date().toISOString()) } catch {}
}

// ── Sidebar: Conversation Row ─────────────────────────────────────────────────

function ConversationRow({ crew, unread, onOpen, active }) {
  const preview = (() => {
    const msg = crew.lastMessage
    if (!msg) return "No messages yet"
    if (msg.is_system) return msg.content
    const sender = msg.profile?.full_name?.split(" ")[0] || msg.profile?.username || "Someone"
    const content = msg.content || ""
    return `${sender}: ${content.length > 38 ? content.slice(0, 38) + "…" : content}`
  })()

  return (
    <div
      onClick={onOpen}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "11px 14px",
        cursor: "pointer",
        background: active
          ? "rgba(96,165,250,0.14)"
          : unread ? "rgba(96,165,250,0.04)" : "transparent",
        borderLeft: `3px solid ${active ? "#60a5fa" : "transparent"}`,
        transition: "background 0.15s",
        position: "relative",
      }}
      className="conv-row"
    >
      {/* Crew emoji badge */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: active
            ? "linear-gradient(135deg,rgba(37,99,235,0.35),rgba(8,145,178,0.3))"
            : "linear-gradient(135deg,rgba(37,99,235,0.18),rgba(8,145,178,0.14))",
          border: `1px solid ${active ? "rgba(96,165,250,0.4)" : "rgba(96,165,250,0.15)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22,
          transition: "all 0.15s",
        }}>
          {crew.emoji}
        </div>
        {unread && !active && (
          <div style={{
            position: "absolute", top: -3, right: -3,
            width: 11, height: 11, borderRadius: "50%",
            background: "#3b82f6",
            border: "2px solid rgba(6,10,22,1)",
          }} />
        )}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6, marginBottom: 3 }}>
          <div style={{
            fontWeight: unread ? 800 : 600, fontSize: 14,
            color: active ? "#93c5fd" : "white",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            flex: 1, minWidth: 0,
          }}>
            {crew.name}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
            {timeAgo(crew.lastMessage?.created_at)}
          </div>
        </div>
        <div style={{
          fontSize: 12,
          color: unread ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.32)",
          fontWeight: unread ? 500 : 400,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {preview}
        </div>
      </div>
    </div>
  )
}

// ── Sidebar: Pending Invite Row ───────────────────────────────────────────────

function InviteRow({ crew, onAccept, onDecline, accepting }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px",
      background: "rgba(37,99,235,0.07)",
      borderLeft: "3px solid rgba(96,165,250,0.5)",
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: "linear-gradient(135deg,rgba(37,99,235,0.25),rgba(8,145,178,0.2))",
        border: "1px solid rgba(96,165,250,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
      }}>
        {crew.emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {crew.name}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
          {crew.creator?.full_name?.split(" ")[0] || "Someone"} invited you
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button
            onClick={onAccept}
            disabled={accepting}
            style={{
              padding: "4px 12px", borderRadius: 6, border: "none",
              background: accepting ? "rgba(37,99,235,0.4)" : "linear-gradient(135deg,#2563eb,#0891b2)",
              color: "white", fontSize: 11, fontWeight: 800, cursor: accepting ? "default" : "pointer",
            }}
          >
            {accepting ? "…" : "Accept"}
          </button>
          <button
            onClick={onDecline}
            style={{
              padding: "4px 10px", borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Create Crew Modal ─────────────────────────────────────────────────────────

const EMOJI_OPTIONS = ["⛷️", "🏂", "🤙", "🏔️", "❄️", "🔥", "💎", "🎿", "🌨️", "🦅", "🐻", "🐺"]

function CreateCrewModal({ friends, onCreated, onClose }) {
  const [name, setName] = useState("")
  const [emoji, setEmoji] = useState("⛷️")
  const [description, setDescription] = useState("")
  const [selected, setSelected] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function toggleFriend(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleCreate() {
    if (!name.trim()) { setError("Name is required"); return }
    setSaving(true); setError("")
    try {
      const crew = await createCrew({ name: name.trim(), emoji, description: description.trim(), inviteOnly: true, memberIds: selected })
      onCreated(crew)
    } catch (e) {
      setError(e.message || "Failed to create crew")
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.65)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", background: "rgba(10,14,30,0.99)", borderRadius: "22px 22px 0 0", padding: "24px 20px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontWeight: 900, fontSize: 18, color: "white" }}>New Crew</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 18, cursor: "pointer", padding: "4px 8px", borderRadius: 8, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {EMOJI_OPTIONS.map(e => (
            <button key={e} onClick={() => setEmoji(e)} style={{
              width: 40, height: 40, borderRadius: 10, border: `2px solid ${emoji === e ? "#60a5fa" : "rgba(255,255,255,0.1)"}`,
              background: emoji === e ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.04)",
              fontSize: 20, cursor: "pointer",
            }}>{e}</button>
          ))}
        </div>

        <input value={name} onChange={e => setName(e.target.value)} placeholder="Crew name…"
          style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "white", fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)…"
          style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "white", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 16 }} />

        {friends.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Add Friends</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {friends.map(f => {
                const sel = selected.includes(f.id)
                return (
                  <div key={f.id} onClick={() => toggleFriend(f.id)} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                    borderRadius: 10, cursor: "pointer",
                    background: sel ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${sel ? "rgba(96,165,250,0.3)" : "rgba(255,255,255,0.07)"}`,
                  }}>
                    <Avatar profile={f} size={32} />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "white" }}>{f.full_name || f.username}</span>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${sel ? "#60a5fa" : "rgba(255,255,255,0.2)"}`, background: sel ? "#60a5fa" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {sel && <span style={{ color: "white", fontSize: 11 }}>✓</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {error && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <button onClick={handleCreate} disabled={saving || !name.trim()} style={{
          width: "100%", padding: "14px", borderRadius: 14, border: "none",
          background: name.trim() ? "linear-gradient(135deg,#2563eb,#0891b2)" : "rgba(255,255,255,0.08)",
          color: "white", fontWeight: 800, fontSize: 15, cursor: name.trim() ? "pointer" : "default",
        }}>
          {saving ? "Creating…" : `Create ${emoji} ${name || "Crew"}`}
        </button>
      </div>
    </div>
  )
}

// ── Desktop empty state ───────────────────────────────────────────────────────

function EmptyChat() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "rgba(255,255,255,0.25)", padding: 40 }}>
      <div style={{ fontSize: 52 }}>💬</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>Select a conversation</div>
      <div style={{ fontSize: 13, textAlign: "center", lineHeight: 1.6, maxWidth: 260 }}>
        Select a ski plan or crew chat from the sidebar.
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MessagingCenter() {
  const isMobile = useMobile()
  const [panel, setPanel] = useState("chats")        // "chats" | "people"
  const [selectedCrew, setSelectedCrew] = useState(null)
  const [selectedTrip, setSelectedTrip] = useState(null)
  const [selectedDM,   setSelectedDM]   = useState(null)
  const [conversations, setConversations] = useState([])
  const [tripConversations, setTripConversations] = useState([])
  const [dmConversations, setDmConversations] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showPingComposer, setShowPingComposer] = useState(false)
  const [pendingFriendCount, setPendingFriendCount] = useState(0)
  const [acceptingId, setAcceptingId] = useState(null)
  const [filter, setFilter] = useState("all")        // "all" | "unread"
  const channelRef = useRef(null)

  const loadInbox = useCallback(async () => {
    try {
      const user = await getCurrentUser()
      setCurrentUser(user)

      const [crews, pending, friendList, trips, dms, friendRequests] = await Promise.all([
        getMyCrews(),
        getPendingCrewInvites(),
        getAcceptedFriends(),
        getMyTripConversations(user.id),
        getDMConversations().catch(() => []),
        getIncomingFriendRequests().catch(() => []),
      ])
      setFriends(friendList || [])
      setDmConversations(dms || [])
      setPendingInvites(pending || [])
      setPendingFriendCount((friendRequests || []).length)

      // ── Crew conversations ──
      if (crews.length > 0) {
        const crewIds = crews.map(c => c.id)
        const { data: recentMsgs } = await supabase
          .from("crew_messages")
          .select("crew_id, content, is_system, created_at, profile:user_id(full_name, username)")
          .in("crew_id", crewIds)
          .order("created_at", { ascending: false })
          .limit(Math.min(crewIds.length * 6, 120))

        const lastMsgMap = {}
        for (const msg of (recentMsgs || [])) {
          if (!lastMsgMap[msg.crew_id]) lastMsgMap[msg.crew_id] = msg
        }

        const enriched = crews.map(crew => {
          const lastMessage = lastMsgMap[crew.id] || null
          const lastRead = getLastRead(crew.id)
          const unread = lastMessage && (!lastRead || new Date(lastMessage.created_at) > new Date(lastRead))
          return { ...crew, lastMessage, unread }
        }).sort((a, b) =>
          new Date(b.lastMessage?.created_at || b.created_at) - new Date(a.lastMessage?.created_at || a.created_at)
        )
        setConversations(enriched)
      } else {
        setConversations([])
      }

      // ── Trip conversations ──
      if (trips.length > 0) {
        const tripIds = trips.map(t => t.id)
        const { data: recentComments, error: commentErr } = await supabase
          .from("trip_comments")
          .select("trip_id, content, user_id, created_at")
          .in("trip_id", tripIds)
          .order("created_at", { ascending: false })
          .limit(Math.min(tripIds.length * 6, 120))
        if (commentErr) console.error("[PowderDays] MessagingCenter trip_comments fetch:", commentErr)

        const lastCommentMap = {}
        for (const c of (recentComments || [])) {
          if (!lastCommentMap[c.trip_id]) lastCommentMap[c.trip_id] = c
        }

        // Enrich last comment previews with sender names
        const senderIds = [...new Set(Object.values(lastCommentMap).map(c => c.user_id))]
        let senderMap = {}
        if (senderIds.length) {
          const { data: senders } = await supabase
            .from("profiles").select("id, full_name, username").in("id", senderIds)
          senderMap = Object.fromEntries((senders || []).map(p => [p.id, p]))
        }

        const enrichedTrips = trips.map(trip => {
          const lastComment = lastCommentMap[trip.id]
            ? { ...lastCommentMap[trip.id], profile: senderMap[lastCommentMap[trip.id].user_id] || null }
            : null
          const lastRead = getLastRead("trip_" + trip.id)
          const unread = lastComment && (!lastRead || new Date(lastComment.created_at) > new Date(lastRead))
          return { ...trip, lastComment, unread }
        }).sort((a, b) =>
          new Date(b.lastComment?.created_at || b.ski_date) - new Date(a.lastComment?.created_at || a.ski_date)
        )
        setTripConversations(enrichedTrips)
      } else {
        setTripConversations([])
      }
    } catch (e) {
      console.warn("MessagingCenter load error:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadInbox() }, [loadInbox])

  useEffect(() => {
    if (!currentUser) return
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    channelRef.current = supabase
      .channel("msg-center-inbox")
      .on("postgres_changes", {
        event: "*", schema: "public", table: "crew_members",
        filter: `user_id=eq.${currentUser.id}`,
      }, () => loadInbox())
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "crew_messages",
      }, (payload) => {
        const crewId = payload.new?.crew_id
        if (!crewId) return
        setConversations(prev => {
          const inList = prev.some(c => c.id === crewId)
          if (!inList) { loadInbox(); return prev }
          const updated = prev.map(c => {
            if (c.id !== crewId) return c
            const newMsg = { ...payload.new, profile: null }
            return { ...c, lastMessage: newMsg, unread: c.id !== selectedCrew?.id }
          })
          return updated.sort((a, b) =>
            new Date(b.lastMessage?.created_at || b.created_at) -
            new Date(a.lastMessage?.created_at || a.created_at)
          )
        })
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "trip_comments",
      }, (payload) => {
        const tripId = payload.new?.trip_id
        if (!tripId) return
        setTripConversations(prev => {
          const inList = prev.some(t => t.id === tripId)
          if (!inList) { loadInbox(); return prev }
          const updated = prev.map(t => {
            if (t.id !== tripId) return t
            const newComment = { ...payload.new, profile: null }
            return { ...t, lastComment: newComment, unread: t.id !== selectedTrip?.id }
          })
          return updated.sort((a, b) =>
            new Date(b.lastComment?.created_at || b.ski_date) -
            new Date(a.lastComment?.created_at || a.ski_date)
          )
        })
      })
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "direct_messages",
      }, (payload) => {
        const msg = payload.new
        if (!msg) return
        const uid = currentUser?.id
        if (!uid) return
        const isFromMe  = msg.sender_id   === uid
        const partnerId = isFromMe ? msg.recipient_id : msg.sender_id
        setDmConversations(prev => {
          const existing = prev.find(d => d.partnerId === partnerId)
          if (!existing) { loadInbox(); return prev }
          const updated = prev.map(d =>
            d.partnerId === partnerId
              ? { ...d, lastMessage: msg, unread: !isFromMe && selectedDM?.partnerId !== partnerId }
              : d
          )
          return updated.sort((a, b) => new Date(b.lastMessage?.created_at) - new Date(a.lastMessage?.created_at))
        })
      })
      .subscribe()

    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [currentUser, loadInbox, selectedCrew?.id, selectedTrip?.id])

  async function handleAcceptInvite(crew) {
    setAcceptingId(crew.id)
    try {
      await acceptCrewInvite(crew.id)
      setPendingInvites(prev => prev.filter(c => c.id !== crew.id))
      await loadInbox()
      openCrew({ ...crew, myRole: "member" })
    } catch (e) {
      console.warn("Accept invite failed:", e)
    } finally {
      setAcceptingId(null)
    }
  }

  async function handleDeclineInvite(crew) {
    try {
      await declineCrewInvite(crew.id)
      setPendingInvites(prev => prev.filter(c => c.id !== crew.id))
    } catch (e) {
      console.warn("Decline invite failed:", e)
    }
  }

  function openCrew(crew) {
    markRead(crew.id)
    setConversations(prev => prev.map(c => c.id === crew.id ? { ...c, unread: false } : c))
    setSelectedCrew(crew)
    setSelectedTrip(null)
    setSelectedDM(null)
    setPanel("chats")
  }

  function openTrip(trip) {
    markRead("trip_" + trip.id)
    setTripConversations(prev => prev.map(t => t.id === trip.id ? { ...t, unread: false } : t))
    setSelectedTrip(trip)
    setSelectedCrew(null)
    setSelectedDM(null)
    setPanel("chats")
  }

  function openDM(dm) {
    if (dm.partnerId) markDMsRead(dm.partnerId).catch(() => {})
    setDmConversations(prev => prev.map(d => d.partnerId === dm.partnerId ? { ...d, unread: false } : d))
    setSelectedDM(dm)
    setSelectedCrew(null)
    setSelectedTrip(null)
    setPanel("chats")
  }

  function handleMessageFriend(friend) {
    const existing = dmConversations.find(d => d.partnerId === friend.id)
    openDM(existing || { partnerId: friend.id, partner: friend, lastMessage: null, unread: false })
  }

  // Merge crews, trips, and DMs into a single list sorted by most recent activity
  const allConversations = [
    ...conversations.map(c => ({ _type: "crew", _ts: new Date(c.lastMessage?.created_at || c.created_at).getTime(), ...c })),
    ...tripConversations.map(t => ({ _type: "trip", _ts: new Date(t.lastComment?.created_at || t.ski_date).getTime(), ...t })),
    ...dmConversations.map(d => ({ _type: "dm", _ts: new Date(d.lastMessage?.created_at || 0).getTime(), ...d })),
  ].sort((a, b) => b._ts - a._ts)

  const displayedAll = filter === "unread"
    ? allConversations.filter(c => c.unread)
    : allConversations

  const totalUnread = conversations.filter(c => c.unread).length + tripConversations.filter(t => t.unread).length + dmConversations.filter(d => d.unread).length + pendingInvites.length

  // Layout: on mobile show sidebar OR chat, never both
  const hasActiveConv = !!(selectedCrew || selectedTrip || selectedDM)
  const showSidebar = !isMobile || !hasActiveConv
  const showMainPanel = !isMobile || hasActiveConv

  // Container height accounts for fixed navbars
  const containerHeight = isMobile
    ? "calc(100dvh - 88px)"
    : "calc(100dvh - 132px)"

  return (
    <div style={{
      display: "flex",
      height: containerHeight,
      background: "rgba(4,8,20,0.85)",
      borderRadius: isMobile ? 0 : 18,
      overflow: "hidden",
      border: isMobile ? "none" : "1px solid rgba(255,255,255,0.07)",
      boxShadow: isMobile ? "none" : "0 8px 40px rgba(0,0,0,0.35)",
    }}>

      {/* ── Sidebar ── */}
      {showSidebar && (
        <div style={{
          width: isMobile ? "100%" : 280,
          display: "flex",
          flexDirection: "column",
          borderRight: isMobile ? "none" : "1px solid rgba(255,255,255,0.07)",
          background: "rgba(5,9,20,0.95)",
          flexShrink: 0,
        }}>

          {/* Sidebar header */}
          <div style={{
            padding: "14px 16px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "white", letterSpacing: -0.3 }}>
              Messages
              {totalUnread > 0 && (
                <span style={{
                  marginLeft: 8, fontSize: 11, fontWeight: 800,
                  background: "#2563eb", color: "white",
                  borderRadius: 999, padding: "1px 7px",
                }}>
                  {totalUnread}
                </span>
              )}
            </div>
            <button
              onClick={() => setShowCreate(true)}
              title="New Crew"
              style={{
                width: 32, height: 32, borderRadius: 9, border: "none",
                background: "linear-gradient(135deg,#2563eb,#0891b2)",
                color: "white", fontSize: 17, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 10px rgba(37,99,235,0.35)",
              }}
            >
              ✏️
            </button>
          </div>

          {/* Panel toggle: Chats / Friends */}
          <div style={{
            padding: "8px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            display: "flex", gap: 4, flexShrink: 0,
          }}>
            {[
              { key: "chats",  label: "Chats",   badge: 0 },
              { key: "people", label: "Friends",  badge: pendingFriendCount },
            ].map(({ key, label, badge }) => (
              <button
                key={key}
                onClick={() => { setPanel(key); if (isMobile) { setSelectedCrew(null); setSelectedTrip(null) } }}
                style={{
                  flex: 1, padding: "7px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: panel === key ? "rgba(96,165,250,0.18)" : "transparent",
                  color: panel === key ? "#60a5fa" : "rgba(255,255,255,0.4)",
                  fontWeight: panel === key ? 800 : 500, fontSize: 13,
                  transition: "all 0.15s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                }}
              >
                {label}
                {badge > 0 && (
                  <span style={{
                    background: "#ef4444", color: "white",
                    fontSize: 10, fontWeight: 800,
                    borderRadius: 999, padding: "1px 5px",
                    lineHeight: 1.4,
                  }}>
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Filter chips — only in Chats panel */}
          {panel === "chats" && (
            <div style={{
              padding: "8px 12px 6px",
              display: "flex", gap: 6, flexShrink: 0,
            }}>
              {[
                { key: "all",    label: "All" },
                { key: "unread", label: `Unread${totalUnread > 0 ? ` · ${totalUnread}` : ""}` },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  style={{
                    padding: "4px 12px", borderRadius: 999, border: "none", cursor: "pointer",
                    background: filter === key ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.06)",
                    color: filter === key ? "#60a5fa" : "rgba(255,255,255,0.4)",
                    fontWeight: filter === key ? 700 : 500, fontSize: 12,
                    transition: "all 0.15s",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Scrollable list area */}
          <div style={{ flex: 1, overflowY: "auto" }}>

            {panel === "chats" && (
              <>
                {/* Pending invites */}
                {pendingInvites.length > 0 && (
                  <>
                    <div style={{
                      padding: "10px 14px 6px",
                      fontSize: 10, fontWeight: 800, color: "#60a5fa",
                      textTransform: "uppercase", letterSpacing: 0.9,
                    }}>
                      Crew Invites · {pendingInvites.length}
                    </div>
                    {pendingInvites.map(crew => (
                      <InviteRow
                        key={crew.id}
                        crew={crew}
                        accepting={acceptingId === crew.id}
                        onAccept={() => handleAcceptInvite(crew)}
                        onDecline={() => handleDeclineInvite(crew)}
                      />
                    ))}
                    <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "8px 0" }} />
                  </>
                )}

                {/* Merged conversation list */}
                {loading ? (
                  <div style={{ padding: "24px 16px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>Loading…</div>
                ) : displayedAll.length > 0 ? (
                  displayedAll.map(conv => {
                    if (conv._type === "trip") {
                      return (
                        <ConversationRow
                          key={`trip-${conv.id}`}
                          crew={{ id: conv.id, name: tripDisplayName(conv), emoji: "🎿", lastMessage: conv.lastComment ? { ...conv.lastComment, is_system: false } : null }}
                          unread={conv.unread}
                          active={selectedTrip?.id === conv.id}
                          onOpen={() => openTrip(conv)}
                        />
                      )
                    }
                    if (conv._type === "dm") {
                      const partnerName = conv.partner?.full_name || conv.partner?.username || "Friend"
                      const lastMsg = conv.lastMessage
                      const preview = lastMsg
                        ? (lastMsg.sender_id === currentUser?.id ? `You: ${lastMsg.content}` : lastMsg.content)
                        : "No messages yet"
                      return (
                        <div
                          key={`dm-${conv.partnerId}`}
                          onClick={() => openDM(conv)}
                          style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
                            cursor: "pointer",
                            background: selectedDM?.partnerId === conv.partnerId
                              ? "rgba(96,165,250,0.14)"
                              : conv.unread ? "rgba(96,165,250,0.04)" : "transparent",
                            borderLeft: `3px solid ${selectedDM?.partnerId === conv.partnerId ? "#60a5fa" : "transparent"}`,
                            transition: "background 0.15s",
                            position: "relative",
                          }}
                          className="conv-row"
                        >
                          <div style={{ position: "relative", flexShrink: 0 }}>
                            <Avatar profile={conv.partner} size={44} />
                            {conv.unread && selectedDM?.partnerId !== conv.partnerId && (
                              <div style={{ position: "absolute", top: -3, right: -3, width: 11, height: 11, borderRadius: "50%", background: "#3b82f6", border: "2px solid rgba(6,10,22,1)" }} />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6, marginBottom: 3 }}>
                              <div style={{ fontWeight: conv.unread ? 800 : 600, fontSize: 14, color: selectedDM?.partnerId === conv.partnerId ? "#93c5fd" : "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                                {partnerName}
                              </div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
                                {timeAgo(lastMsg?.created_at)}
                              </div>
                            </div>
                            <div style={{ fontSize: 12, color: conv.unread ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.32)", fontWeight: conv.unread ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {preview.length > 48 ? preview.slice(0, 48) + "…" : preview}
                            </div>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <ConversationRow
                        key={`crew-${conv.id}`}
                        crew={conv}
                        unread={conv.unread}
                        active={selectedCrew?.id === conv.id}
                        onOpen={() => openCrew(conv)}
                      />
                    )
                  })
                ) : (
                  <div style={{ padding: "32px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>💬</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>
                      {filter === "unread" ? "No unread conversations." : "No chats yet. Create a crew or plan a ski trip to get started."}
                    </div>
                    {filter === "all" && (
                      <button
                        onClick={() => setShowCreate(true)}
                        style={{ marginTop: 14, padding: "9px 18px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2563eb,#0891b2)", color: "white", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
                      >
                        + New Crew
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {panel === "people" && (
              <div style={{ padding: "12px 12px 0" }}>
                {/* Ping CTA */}
                <button
                  onClick={() => setShowPingComposer(true)}
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 12, border: "none",
                    background: "linear-gradient(135deg,rgba(59,130,246,0.2),rgba(16,185,129,0.12))",
                    border: "1px solid rgba(59,130,246,0.3)",
                    color: "#93c5fd", fontWeight: 800, fontSize: 13, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    marginBottom: 14,
                  }}
                >
                  👋 Ping Friends to Ski
                </button>
                <div style={{ padding: "0 2px 10px", fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.9 }}>
                  Friends
                </div>
                {friends.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 16px", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                    No friends yet.
                  </div>
                ) : (
                  friends.map(f => (
                    <div key={f.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 8px", borderRadius: 10,
                    }}>
                      <Avatar profile={f} size={34} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {f.full_name || f.username}
                        </div>
                        {f.username && (
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>@{f.username}</div>
                        )}
                      </div>
                      <button
                        onClick={() => handleMessageFriend(f)}
                        title="Message"
                        style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, padding: "5px 10px", color: "#60a5fa", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                      >
                        💬
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main panel ── */}
      {showMainPanel && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {panel === "people" && !isMobile ? (
            // Desktop: show full FriendsPage in right panel
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
              <FriendsPage hideCrew onMessageFriend={handleMessageFriend} />
            </div>
          ) : selectedDM ? (
            <DirectMessageView
              partner={selectedDM.partner}
              partnerId={selectedDM.partnerId}
              currentUser={currentUser}
              onBack={isMobile ? () => setSelectedDM(null) : null}
            />
          ) : selectedTrip ? (
            <TripChatView
              trip={selectedTrip}
              currentUser={currentUser}
              onBack={isMobile ? () => setSelectedTrip(null) : null}
            />
          ) : selectedCrew ? (
            <CrewChatView
              crew={selectedCrew}
              currentUserId={currentUser?.id}
              friends={friends}
              onBack={isMobile ? () => setSelectedCrew(null) : null}
              onLeft={() => { setSelectedCrew(null); loadInbox() }}
            />
          ) : (
            <EmptyChat />
          )}
        </div>
      )}

      {/* Mobile: people panel takes full screen */}
      {isMobile && panel === "people" && !hasActiveConv && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(4,8,20,0.95)", overflowY: "auto", padding: "16px 14px", zIndex: 10 }}>
          <FriendsPage hideCrew onMessageFriend={handleMessageFriend} />
        </div>
      )}

      {showCreate && (
        <CreateCrewModal
          friends={friends}
          onCreated={crew => {
            setShowCreate(false)
            loadInbox().then(() => openCrew({ ...crew, myRole: "admin" }))
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {showPingComposer && (
        <SkiPingComposer
          friends={friends}
          onClose={() => setShowPingComposer(false)}
          onSent={() => setShowPingComposer(false)}
        />
      )}

      <style>{`
        .conv-row:hover { background: rgba(255,255,255,0.05) !important; }
      `}</style>
    </div>
  )
}
