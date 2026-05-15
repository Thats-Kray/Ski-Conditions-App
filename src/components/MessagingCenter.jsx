import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "../lib/supabase"
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

// ── Local read-status tracking (localStorage per crew) ──────────────────────

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
    <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "flex-end", background: "rgba(0,0,0,0.6)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ width: "100%", maxHeight: "90vh", overflowY: "auto", background: "rgba(10,14,30,0.99)", borderRadius: "24px 24px 0 0", padding: "24px 20px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontWeight: 900, fontSize: 18, color: "white" }}>New Crew</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer", padding: 4 }}>×</button>
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

// ── Conversation Row ──────────────────────────────────────────────────────────

function ConversationRow({ crew, lastMessage, unread, onOpen }) {
  const preview = (() => {
    if (!lastMessage) return "No messages yet"
    if (lastMessage.is_system) return lastMessage.content
    const sender = lastMessage.profile?.full_name || lastMessage.profile?.username || "Someone"
    const content = lastMessage.content || ""
    return `${sender}: ${content.length > 40 ? content.slice(0, 40) + "…" : content}`
  })()

  return (
    <div onClick={onOpen} style={{
      display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
      cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)",
      background: unread ? "rgba(96,165,250,0.04)" : "transparent",
      transition: "background 0.15s",
    }}
      className="msg-row"
    >
      {/* Crew emoji avatar */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div style={{
          width: 54, height: 54, borderRadius: 18,
          background: "linear-gradient(135deg,rgba(37,99,235,0.2),rgba(8,145,178,0.15))",
          border: "1px solid rgba(96,165,250,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26,
        }}>
          {crew.emoji}
        </div>
        {unread && (
          <div style={{
            position: "absolute", top: -2, right: -2, width: 13, height: 13,
            borderRadius: "50%", background: "#3b82f6",
            border: "2.5px solid rgb(2,6,23)",
          }} />
        )}
      </div>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
          <div style={{
            fontWeight: unread ? 800 : 600, fontSize: 15, color: "white",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {crew.name}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", flexShrink: 0, marginLeft: 8 }}>
            {timeAgo(lastMessage?.created_at)}
          </div>
        </div>
        <div style={{
          fontSize: 13,
          color: unread ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.35)",
          fontWeight: unread ? 500 : 400,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {preview}
        </div>
      </div>
    </div>
  )
}

// ── Pending Invite Row ────────────────────────────────────────────────────────

function InviteRow({ crew, onAccept, onDecline, accepting }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "13px 16px",
      background: "rgba(37,99,235,0.08)",
      borderBottom: "1px solid rgba(96,165,250,0.12)",
    }}>
      <div style={{
        width: 46, height: 46, borderRadius: 14,
        background: "linear-gradient(135deg,rgba(37,99,235,0.25),rgba(8,145,178,0.2))",
        border: "1px solid rgba(96,165,250,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 22, flexShrink: 0,
      }}>
        {crew.emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {crew.name}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>
          {crew.creator?.full_name || crew.creator?.username || "Someone"} invited you
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={onDecline} style={{
          padding: "6px 12px", borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}>
          Decline
        </button>
        <button onClick={onAccept} disabled={accepting} style={{
          padding: "6px 14px", borderRadius: 8, border: "none",
          background: accepting ? "rgba(37,99,235,0.4)" : "linear-gradient(135deg,#2563eb,#0891b2)",
          color: "white", fontSize: 12, fontWeight: 800, cursor: accepting ? "default" : "pointer",
        }}>
          {accepting ? "…" : "Accept"}
        </button>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MessagingCenter() {
  const [view, setView] = useState("inbox") // "inbox" | "people"
  const [selectedCrew, setSelectedCrew] = useState(null)
  const [conversations, setConversations] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [acceptingId, setAcceptingId] = useState(null)
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

      // Fetch recent messages across all crews in one query
      const crewIds = crews.map(c => c.id)
      const { data: recentMsgs } = await supabase
        .from("crew_messages")
        .select("crew_id, content, is_system, created_at, profile:user_id(full_name, username)")
        .in("crew_id", crewIds)
        .order("created_at", { ascending: false })
        .limit(Math.min(crewIds.length * 6, 120))

      // Last message per crew
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

  useEffect(() => {
    loadInbox()
  }, [loadInbox])

  // Realtime: watch crew_members (membership changes) + crew_messages (new messages)
  useEffect(() => {
    if (!currentUser) return

    if (channelRef.current) supabase.removeChannel(channelRef.current)

    channelRef.current = supabase
      .channel("msg-center-inbox")
      // Membership changes for this user (invite accepted, new invite, left crew)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "crew_members",
        filter: `user_id=eq.${currentUser.id}`,
      }, () => {
        loadInbox()
      })
      // New messages in any crew — update last-message preview + unread dot
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "crew_messages",
      }, (payload) => {
        const crewId = payload.new?.crew_id
        if (!crewId) return
        setConversations(prev => {
          const inList = prev.some(c => c.id === crewId)
          if (!inList) {
            // New crew appeared (e.g. just accepted invite) — full reload
            loadInbox()
            return prev
          }
          const updated = prev.map(c => {
            if (c.id !== crewId) return c
            const newMsg = { ...payload.new, profile: null }
            return { ...c, lastMessage: newMsg, unread: true }
          })
          return updated.sort((a, b) =>
            new Date(b.lastMessage?.created_at || b.created_at) -
            new Date(a.lastMessage?.created_at || a.created_at)
          )
        })
      })
      .subscribe()

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [currentUser, loadInbox])

  async function handleAcceptInvite(crew) {
    setAcceptingId(crew.id)
    try {
      await acceptCrewInvite(crew.id)
      setPendingInvites(prev => prev.filter(c => c.id !== crew.id))
      await loadInbox()
      // Open the crew chat
      setSelectedCrew({ ...crew, myRole: "member" })
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
  }

  function handleBack() {
    setSelectedCrew(null)
    loadInbox() // refresh previews in case messages were sent
  }

  const totalUnread = conversations.filter(c => c.unread).length + pendingInvites.length

  // ── If a crew is selected, show full chat ──────────────────────────────────
  if (selectedCrew) {
    return (
      <CrewChatView
        crew={selectedCrew}
        currentUserId={currentUser?.id}
        friends={friends}
        onBack={handleBack}
        onLeft={() => { setSelectedCrew(null); loadInbox() }}
      />
    )
  }

  return (
    <div style={{ color: "white", paddingBottom: 80 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, padding: "0 2px" }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "white", letterSpacing: -0.5 }}>Messages</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setView(v => v === "people" ? "inbox" : "people")}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
              borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)",
              background: view === "people" ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.06)",
              color: view === "people" ? "#60a5fa" : "rgba(255,255,255,0.7)",
              fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}
          >
            👥 People
          </button>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              width: 38, height: 38, borderRadius: 12, border: "none",
              background: "linear-gradient(135deg,#2563eb,#0891b2)",
              color: "white", fontSize: 20, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            title="New Crew"
          >
            +
          </button>
        </div>
      </div>

      {/* ── People / Friends view ── */}
      {view === "people" && (
        <div style={{ marginTop: 16 }}>
          <FriendsPage hideCrew />
        </div>
      )}

      {/* ── Inbox ── */}
      {view === "inbox" && (
        <>
          {loading ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
              Loading…
            </div>
          ) : (
            <>
              {/* Pending invites */}
              {pendingInvites.length > 0 && (
                <div style={{ marginTop: 16, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(96,165,250,0.2)" }}>
                  <div style={{ padding: "10px 16px 8px", fontSize: 11, fontWeight: 800, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 0.8, background: "rgba(37,99,235,0.06)" }}>
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
                </div>
              )}

              {/* Conversations */}
              {conversations.length === 0 && pendingInvites.length === 0 ? (
                <div style={{ textAlign: "center", padding: "64px 20px" }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: "white", marginBottom: 8 }}>No chats yet</div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>
                    Create a crew to start chatting with your ski friends
                  </div>
                  <button onClick={() => setShowCreate(true)} style={{
                    padding: "12px 24px", borderRadius: 14, border: "none",
                    background: "linear-gradient(135deg,#2563eb,#0891b2)",
                    color: "white", fontWeight: 800, fontSize: 15, cursor: "pointer",
                  }}>
                    + New Crew
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: 16, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" }}>
                  {/* Unread badge */}
                  {totalUnread > 0 && (
                    <div style={{ padding: "10px 16px 8px", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 0.8, background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      {totalUnread} unread
                    </div>
                  )}
                  {conversations.map(crew => (
                    <ConversationRow
                      key={crew.id}
                      crew={crew}
                      lastMessage={crew.lastMessage}
                      unread={crew.unread}
                      onOpen={() => openCrew(crew)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {showCreate && (
        <CreateCrewModal
          friends={friends}
          onCreated={crew => {
            setShowCreate(false)
            loadInbox().then(() => {
              setSelectedCrew({ ...crew, myRole: "admin" })
            })
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      <style>{`
        .msg-row:hover { background: rgba(255,255,255,0.04) !important; }
      `}</style>
    </div>
  )
}
