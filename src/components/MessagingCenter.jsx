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
} from "../lib/socialApi"
import { CrewChatView } from "./CrewGroupChat"
import FriendsPage from "./FriendsPage"

// ── Local read-status tracking ───────────────────────────────────────────────

const LS_PREFIX = "pd_cr_"
function getLastRead(crewId) {
  try { return localStorage.getItem(LS_PREFIX + crewId) || null } catch { return null }
}
function markRead(crewId) {
  try { localStorage.setItem(LS_PREFIX + crewId, new Date().toISOString()) } catch {}
}

// ── Utilities ────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  if (!ts) return ""
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "now"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function Avatar({ profile, size = 32 }) {
  const name = profile?.full_name || profile?.username || "?"
  if (profile?.avatar_url) {
    return (
      <img src={profile.avatar_url} alt={name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg,rgba(37,99,235,0.5),rgba(8,145,178,0.5))",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.42, fontWeight: 800, color: "white",
    }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
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
        Choose a crew from the sidebar to start chatting, or create a new one.
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MessagingCenter() {
  const isMobile = useMobile()
  const [panel, setPanel] = useState("chats")        // "chats" | "people"
  const [selectedCrew, setSelectedCrew] = useState(null)
  const [conversations, setConversations] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [acceptingId, setAcceptingId] = useState(null)
  const [filter, setFilter] = useState("all")        // "all" | "unread"
  const channelRef = useRef(null)

  const loadInbox = useCallback(async () => {
    try {
      const [user, crews, pending, friendList] = await Promise.all([
        getCurrentUser(),
        getMyCrews(),
        getPendingCrewInvites(),
        getAcceptedFriends(),
      ])
      setCurrentUser(user)
      setFriends(friendList || [])
      setPendingInvites(pending || [])

      if (crews.length === 0) {
        setConversations([])
        setLoading(false)
        return
      }

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
      }).sort((a, b) => {
        const ta = new Date(a.lastMessage?.created_at || a.created_at)
        const tb = new Date(b.lastMessage?.created_at || b.created_at)
        return tb - ta
      })

      setConversations(enriched)
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
      .subscribe()

    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [currentUser, loadInbox, selectedCrew?.id])

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
    setPanel("chats")
  }

  const displayedConversations = filter === "unread"
    ? conversations.filter(c => c.unread)
    : conversations

  const totalUnread = conversations.filter(c => c.unread).length + pendingInvites.length

  // Layout: on mobile show sidebar OR chat, never both
  const showSidebar = !isMobile || !selectedCrew
  const showMainPanel = !isMobile || !!selectedCrew

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

          {/* Panel toggle: Chats / People */}
          <div style={{
            padding: "8px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            display: "flex", gap: 4, flexShrink: 0,
          }}>
            {[
              { key: "chats",  label: "Chats" },
              { key: "people", label: "People" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setPanel(key); if (isMobile) setSelectedCrew(null) }}
                style={{
                  flex: 1, padding: "7px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: panel === key ? "rgba(96,165,250,0.18)" : "transparent",
                  color: panel === key ? "#60a5fa" : "rgba(255,255,255,0.4)",
                  fontWeight: panel === key ? 800 : 500, fontSize: 13,
                  transition: "all 0.15s",
                }}
              >
                {label}
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

                {/* Section label */}
                {conversations.length > 0 && (
                  <div style={{
                    padding: "10px 14px 4px",
                    fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.3)",
                    textTransform: "uppercase", letterSpacing: 0.9,
                  }}>
                    Crews
                  </div>
                )}

                {/* Conversation rows */}
                {loading ? (
                  <div style={{ padding: "24px 16px", textAlign: "center", color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
                    Loading…
                  </div>
                ) : displayedConversations.length === 0 ? (
                  <div style={{ padding: "32px 20px", textAlign: "center" }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>💬</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>
                      {filter === "unread" ? "No unread conversations." : "No crews yet. Create one to get started."}
                    </div>
                    {filter === "all" && (
                      <button
                        onClick={() => setShowCreate(true)}
                        style={{
                          marginTop: 14, padding: "9px 18px", borderRadius: 10, border: "none",
                          background: "linear-gradient(135deg,#2563eb,#0891b2)",
                          color: "white", fontWeight: 800, fontSize: 13, cursor: "pointer",
                        }}
                      >
                        + New Crew
                      </button>
                    )}
                  </div>
                ) : (
                  displayedConversations.map(crew => (
                    <ConversationRow
                      key={crew.id}
                      crew={crew}
                      unread={crew.unread}
                      active={selectedCrew?.id === crew.id}
                      onOpen={() => openCrew(crew)}
                    />
                  ))
                )}
              </>
            )}

            {panel === "people" && (
              <div style={{ padding: "12px 12px 0" }}>
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
                      padding: "9px 8px", borderRadius: 10, cursor: "default",
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
              <FriendsPage hideCrew />
            </div>
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
      {isMobile && panel === "people" && !selectedCrew && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(4,8,20,0.95)", overflowY: "auto", padding: "16px 14px", zIndex: 10 }}>
          <FriendsPage hideCrew />
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

      <style>{`
        .conv-row:hover { background: rgba(255,255,255,0.05) !important; }
      `}</style>
    </div>
  )
}
