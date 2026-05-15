import { useEffect, useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import {
  createCrew,
  getMyCrews,
  getCrewMembers,
  getCrewMessages,
  sendCrewMessage,
  inviteToCrewGroup,
  leaveCrewGroup,
  removeCrewMember,
  updateCrewGroup,
  deleteCrew,
  getCurrentUser,
} from "../lib/socialApi"

const EMOJI_OPTIONS = ["⛷️", "🏂", "🤙", "🏔️", "❄️", "🔥", "💎", "🎿", "🌨️", "🦅", "🐻", "🐺"]

function timeLabel(ts) {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now - d
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" })
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

function Avatar({ profile, size = 32 }) {
  const name = profile?.full_name || profile?.username || "?"
  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "linear-gradient(135deg,rgba(37,99,235,0.5),rgba(8,145,178,0.5))",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.4, fontWeight: 800, color: "white",
    }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

// ── Create Crew Modal ─────────────────────────────────────────────────────────

function CreateCrewModal({ friends, onCreated, onClose }) {
  const [name, setName] = useState("")
  const [emoji, setEmoji] = useState("⛷️")
  const [description, setDescription] = useState("")
  const [inviteOnly, setInviteOnly] = useState(true)
  const [selectedFriends, setSelectedFriends] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function toggleFriend(id) {
    setSelectedFriends((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function handleCreate() {
    if (!name.trim()) { setError("Give your crew a name."); return }
    setSaving(true)
    setError("")
    try {
      const crew = await createCrew({
        name: name.trim(),
        emoji,
        description: description.trim(),
        inviteOnly,
        memberIds: selectedFriends,
      })
      onCreated(crew)
    } catch (e) {
      setError(e.message || "Failed to create crew.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(2,6,23,0.82)",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "flex-start", overflowY: "auto",
        padding: "20px 16px max(20px,env(safe-area-inset-bottom)) 16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480,
          background: "rgba(10,14,30,0.98)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20, padding: 22, color: "white",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 900 }}>New Crew</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 22, cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {error && (
          <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 10, background: "rgba(239,68,68,0.14)", border: "1px solid rgba(239,68,68,0.3)", color: "#fecaca", fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Emoji picker */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>Crew Emoji</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EMOJI_OPTIONS.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                style={{
                  fontSize: 22, width: 40, height: 40, borderRadius: 10, cursor: "pointer",
                  background: emoji === e ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.05)",
                  border: emoji === e ? "2px solid rgba(96,165,250,0.6)" : "2px solid transparent",
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>Crew Name</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Weekend Shredders"
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 16,
              border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
              color: "white", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>Description (optional)</div>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this crew about?"
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 16,
              border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
              color: "white", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Permissions */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>Permissions</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { v: true,  label: "🔒 Invite Only" },
              { v: false, label: "🌐 Open" },
            ].map(({ v, label }) => (
              <button
                key={String(v)}
                onClick={() => setInviteOnly(v)}
                style={{
                  flex: 1, padding: "9px 12px", borderRadius: 10, cursor: "pointer",
                  background: inviteOnly === v ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.05)",
                  border: inviteOnly === v ? "1px solid rgba(96,165,250,0.5)" : "1px solid rgba(255,255,255,0.1)",
                  color: inviteOnly === v ? "#93c5fd" : "rgba(255,255,255,0.55)",
                  fontWeight: 700, fontSize: 13,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>
            {inviteOnly ? "Only admins can add new members." : "Any member can invite friends."}
          </div>
        </div>

        {/* Add friends */}
        {friends.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>Add Friends ({selectedFriends.length} selected)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
              {friends.map((f) => {
                const name = f.full_name || f.username || "?"
                const sel = selectedFriends.includes(f.id)
                return (
                  <button
                    key={f.id}
                    onClick={() => toggleFriend(f.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", borderRadius: 10, cursor: "pointer",
                      background: sel ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.04)",
                      border: sel ? "1px solid rgba(96,165,250,0.4)" : "1px solid rgba(255,255,255,0.07)",
                      textAlign: "left",
                    }}
                  >
                    <Avatar profile={f} size={30} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{name}</div>
                      {f.username && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>@{f.username}</div>}
                    </div>
                    {sel && <div style={{ fontSize: 16, color: "#60a5fa" }}>✓</div>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={saving}
          style={{
            width: "100%", padding: "13px 20px", borderRadius: 12, border: "none",
            background: saving ? "rgba(37,99,235,0.5)" : "linear-gradient(135deg,#2563eb,#0891b2)",
            color: "white", fontWeight: 800, fontSize: 15, cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "Creating…" : `Create Crew ${emoji}`}
        </button>
      </div>
    </div>
  )
}

// ── Edit Crew Modal ───────────────────────────────────────────────────────────

function EditCrewModal({ crew, onSaved, onClose }) {
  const [name, setName]         = useState(crew.name)
  const [emoji, setEmoji]       = useState(crew.emoji)
  const [description, setDesc]  = useState(crew.description || "")
  const [inviteOnly, setInviteOnly] = useState(crew.invite_only)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState("")

  async function handleSave() {
    if (!name.trim()) { setError("Crew name can't be empty."); return }
    setSaving(true); setError("")
    try {
      await updateCrewGroup(crew.id, { name: name.trim(), emoji, description: description.trim(), invite_only: inviteOnly })
      onSaved({ ...crew, name: name.trim(), emoji, description: description.trim(), invite_only: inviteOnly })
    } catch (e) {
      setError(e.message || "Failed to save.")
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 15,
    border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
    color: "white", outline: "none", boxSizing: "border-box",
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "20px 20px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: "white" }}>Edit Crew</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.6)", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        {error && <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 10, background: "rgba(239,68,68,0.14)", border: "1px solid rgba(239,68,68,0.3)", color: "#fecaca", fontSize: 13 }}>{error}</div>}

        {/* Emoji */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>Emoji</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EMOJI_OPTIONS.map((e) => (
              <button key={e} onClick={() => setEmoji(e)} style={{ fontSize: 22, width: 40, height: 40, borderRadius: 10, cursor: "pointer", background: emoji === e ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.05)", border: emoji === e ? "2px solid rgba(96,165,250,0.6)" : "2px solid transparent" }}>{e}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>Name</div>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>Description</div>
          <input style={inputStyle} value={description} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>Permissions</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[{ v: true, label: "🔒 Invite Only" }, { v: false, label: "🌐 Open" }].map(({ v, label }) => (
              <button key={String(v)} onClick={() => setInviteOnly(v)} style={{ flex: 1, padding: "9px 12px", borderRadius: 10, cursor: "pointer", background: inviteOnly === v ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.05)", border: inviteOnly === v ? "1px solid rgba(96,165,250,0.5)" : "1px solid rgba(255,255,255,0.1)", color: inviteOnly === v ? "#93c5fd" : "rgba(255,255,255,0.55)", fontWeight: 700, fontSize: 13 }}>{label}</button>
            ))}
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: saving ? "rgba(37,99,235,0.5)" : "linear-gradient(135deg,#2563eb,#0891b2)", color: "white", fontWeight: 800, fontSize: 15, cursor: saving ? "default" : "pointer" }}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  )
}

// ── Crew Chat View ────────────────────────────────────────────────────────────

function CrewChatView({ crew: initialCrew, currentUserId, friends, onBack, onLeft }) {
  const [crew, setCrew] = useState(initialCrew)
  const [messages, setMessages] = useState([])
  const [members, setMembers] = useState([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(true)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const isAdmin = members.find((m) => m.profile?.id === currentUserId)?.role === "admin"

  async function loadAll() {
    setLoadingMsgs(true)
    try {
      const [msgs, mems] = await Promise.all([
        getCrewMessages(initialCrew.id),
        getCrewMembers(initialCrew.id),
      ])
      setMessages(msgs)
      setMembers(mems)
    } catch (e) {
      console.warn("Crew load error:", e)
    } finally {
      setLoadingMsgs(false)
    }
  }

  useEffect(() => {
    loadAll()

    const channel = supabase
      .channel(`crew-${initialCrew.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public",
        table: "crew_messages", filter: `crew_id=eq.${initialCrew.id}`,
      }, () => {
        getCrewMessages(initialCrew.id).then(setMessages).catch(() => {})
      })
      .on("postgres_changes", {
        event: "*", schema: "public",
        table: "crew_members", filter: `crew_id=eq.${initialCrew.id}`,
      }, () => {
        getCrewMembers(initialCrew.id).then(setMembers).catch(() => {})
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [crew.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function handleSend(e) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput("")
    try {
      const msg = await sendCrewMessage(crew.id, text)
      setMessages((prev) => [...prev, msg])
    } catch (err) {
      console.warn("Send failed:", err)
      setInput(text)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  async function handleLeave() {
    if (!confirm(`Leave "${crew.name}"?`)) return
    try {
      await leaveCrewGroup(crew.id)
      onLeft()
    } catch (e) {
      alert(e.message || "Failed to leave crew.")
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${crew.name}" permanently? This removes all messages and members.`)) return
    try {
      await deleteCrew(crew.id)
      onLeft()
    } catch (e) {
      alert(e.message || "Failed to delete crew.")
    }
  }

  async function handleRemoveMember(memberId, memberUserId) {
    if (!confirm("Remove this member?")) return
    try {
      await removeCrewMember(crew.id, memberUserId)
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
    } catch (e) {
      alert(e.message || "Failed to remove member.")
    }
  }

  async function handleInvite(friendId) {
    try {
      await inviteToCrewGroup(crew.id, friendId)
      const mems = await getCrewMembers(crew.id)
      setMembers(mems)
      setShowInvite(false)
    } catch (e) {
      alert(e.message || "Failed to add member.")
    }
  }

  const memberUserIds = new Set(members.map((m) => m.profile?.id).filter(Boolean))
  const invitableFriends = friends.filter((f) => !memberUserIds.has(f.id))

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 180px)", minHeight: 400 }}>

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(10,14,30,0.6)", borderRadius: "16px 16px 0 0", flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 20, cursor: "pointer", padding: "0 4px 0 0", lineHeight: 1 }}
        >
          ←
        </button>
        <div style={{ fontSize: 26 }}>{crew.emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {crew.name}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            {members.length} member{members.length !== 1 ? "s" : ""} · {crew.invite_only ? "🔒 Invite Only" : "🌐 Open"}
          </div>
        </div>
        <button
          onClick={() => setShowMembers((v) => !v)}
          style={{
            padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
            background: showMembers ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.08)",
            color: showMembers ? "#60a5fa" : "rgba(255,255,255,0.6)",
            fontWeight: 700, fontSize: 12,
          }}
        >
          👥 Members
        </button>
      </div>

      {/* ── Members panel ── */}
      {showMembers && (
        <div style={{
          background: "rgba(8,12,26,0.98)", borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "12px 16px", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.7 }}>
              Members
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {invitableFriends.length > 0 && (
                <button onClick={() => setShowInvite((v) => !v)} style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: "#2563eb", color: "white", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  + Add
                </button>
              )}
              {isAdmin && (
                <button onClick={() => setShowEdit(true)} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  Edit
                </button>
              )}
              {isAdmin ? (
                <button onClick={handleDelete} style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: "rgba(239,68,68,0.15)", color: "#fca5a5", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  Delete
                </button>
              ) : (
                <button onClick={handleLeave} style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: "rgba(239,68,68,0.15)", color: "#fca5a5", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  Leave
                </button>
              )}
            </div>
          </div>

          {/* Invite picker */}
          {showInvite && invitableFriends.length > 0 && (
            <div style={{ marginBottom: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {invitableFriends.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleInvite(f.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 10px", borderRadius: 999, border: "1px solid rgba(96,165,250,0.3)",
                    background: "rgba(96,165,250,0.1)", color: "#93c5fd", fontWeight: 700, fontSize: 12, cursor: "pointer",
                  }}
                >
                  <Avatar profile={f} size={18} />
                  {f.full_name || f.username}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
            {members.map((m) => {
              const p = m.profile
              const name = p?.full_name || p?.username || "?"
              const isMe = p?.id === currentUserId
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar profile={p} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{name}</span>
                    {isMe && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginLeft: 4 }}>you</span>}
                    {m.role === "admin" && <span style={{ fontSize: 10, color: "#fbbf24", fontWeight: 800, marginLeft: 6, background: "rgba(251,191,36,0.15)", borderRadius: 4, padding: "1px 5px" }}>Admin</span>}
                  </div>
                  {isAdmin && !isMe && (
                    <button
                      onClick={() => handleRemoveMember(m.id, p?.id)}
                      style={{ background: "none", border: "none", color: "rgba(255,255,255,0.25)", fontSize: 14, cursor: "pointer", padding: 2 }}
                      title="Remove member"
                    >
                      ×
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {loadingMsgs && (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13, paddingTop: 20 }}>Loading…</div>
        )}
        {!loadingMsgs && messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 20px" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>{crew.emoji}</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>No messages yet. Say something!</div>
          </div>
        )}
        {messages.map((msg) => {
          if (msg.is_system) {
            return (
              <div key={msg.id} style={{ textAlign: "center", padding: "4px 0" }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>
                  {msg.content}
                </span>
              </div>
            )
          }
          const isMe = msg.profile?.id === currentUserId
          const name = msg.profile?.full_name || msg.profile?.username || "?"
          return (
            <div key={msg.id} style={{ display: "flex", gap: 8, flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end" }}>
              {!isMe && <Avatar profile={msg.profile} size={28} />}
              <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", gap: 2, alignItems: isMe ? "flex-end" : "flex-start" }}>
                {!isMe && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", paddingLeft: 4 }}>{name}</div>
                )}
                <div style={{
                  padding: "9px 13px", borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  background: isMe
                    ? "linear-gradient(135deg,#2563eb,#0891b2)"
                    : "rgba(255,255,255,0.1)",
                  color: "white", fontSize: 14, lineHeight: 1.45,
                  boxShadow: isMe ? "0 2px 8px rgba(37,99,235,0.3)" : "none",
                }}>
                  {msg.content}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", paddingLeft: 4, paddingRight: 4 }}>
                  {timeLabel(msg.created_at)}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      <form
        onSubmit={handleSend}
        style={{
          display: "flex", gap: 8, padding: "10px 12px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(8,12,26,0.9)", flexShrink: 0,
          borderRadius: "0 0 16px 16px",
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder={`Message ${crew.name}…`}
          style={{
            flex: 1, padding: "10px 14px", borderRadius: 20, fontSize: 16,
            border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.07)",
            color: "white", outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          style={{
            width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
            background: input.trim() ? "linear-gradient(135deg,#2563eb,#0891b2)" : "rgba(255,255,255,0.08)",
            color: "white", fontSize: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          ↑
        </button>
      </form>

      {showEdit && (
        <EditCrewModal
          crew={crew}
          onSaved={(updated) => { setCrew(updated); setShowEdit(false) }}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  )
}

// ── Crew List ─────────────────────────────────────────────────────────────────

export default function CrewGroupChat({ friends = [] }) {
  const [crews, setCrews] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCrew, setSelectedCrew] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [currentUserId, setCurrentUserId] = useState(null)

  async function loadCrews() {
    try {
      const [user, crewData] = await Promise.all([getCurrentUser(), getMyCrews()])
      setCurrentUserId(user?.id || null)
      setCrews(crewData)
    } catch (e) {
      console.warn("Crews load error:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCrews() }, [])

  function handleCreated(crew) {
    setShowCreate(false)
    loadCrews()
    setSelectedCrew({ ...crew, myRole: "admin" })
  }

  function handleLeft() {
    setSelectedCrew(null)
    loadCrews()
  }

  if (selectedCrew) {
    return (
      <CrewChatView
        crew={selectedCrew}
        currentUserId={currentUserId}
        friends={friends}
        onBack={() => setSelectedCrew(null)}
        onLeft={handleLeft}
      />
    )
  }

  return (
    <div>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 900, color: "white" }}>Your Crews</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            Group chats to coordinate with your ski circle
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            padding: "9px 16px", borderRadius: 12, border: "none",
            background: "linear-gradient(135deg,#2563eb,#0891b2)",
            color: "white", fontWeight: 800, fontSize: 13, cursor: "pointer",
            boxShadow: "0 2px 12px rgba(37,99,235,0.35)",
          }}
        >
          + New Crew
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "32px 20px", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
          Loading crews…
        </div>
      )}

      {!loading && crews.length === 0 && (
        <div style={{
          textAlign: "center", padding: "40px 20px",
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 18,
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🤙</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "white", marginBottom: 8 }}>No crews yet</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 20, lineHeight: 1.5 }}>
            Create a crew with your closest ski friends to coordinate plans and chat all season.
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: "11px 24px", borderRadius: 12, border: "none",
              background: "linear-gradient(135deg,#2563eb,#0891b2)",
              color: "white", fontWeight: 800, fontSize: 14, cursor: "pointer",
            }}
          >
            Create Your First Crew
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {crews.map((crew) => (
          <button
            key={crew.id}
            onClick={() => setSelectedCrew(crew)}
            style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "14px 16px", borderRadius: 16, cursor: "pointer",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              textAlign: "left", width: "100%",
              transition: "background 0.15s",
            }}
          >
            {/* Crew emoji badge */}
            <div style={{
              width: 48, height: 48, borderRadius: 14, flexShrink: 0,
              background: "linear-gradient(135deg,rgba(37,99,235,0.25),rgba(8,145,178,0.2))",
              border: "1px solid rgba(96,165,250,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
            }}>
              {crew.emoji}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {crew.name}
                </div>
                {crew.myRole === "admin" && (
                  <span style={{ fontSize: 9, fontWeight: 800, color: "#fbbf24", background: "rgba(251,191,36,0.15)", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>
                    ADMIN
                  </span>
                )}
              </div>
              {crew.description ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {crew.description}
                </div>
              ) : null}
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>
                {crew.invite_only ? "🔒 Invite only" : "🌐 Open"} · Tap to open chat
              </div>
            </div>

            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 18 }}>›</div>
          </button>
        ))}
      </div>

      {showCreate && (
        <CreateCrewModal
          friends={friends}
          onCreated={handleCreated}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}
