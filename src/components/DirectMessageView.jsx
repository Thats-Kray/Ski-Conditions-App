import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "../lib/supabase"
import { getDMMessages, sendDM } from "../lib/socialApi"
import { timeAgo } from "../lib/format"
import Avatar from "./ui/Avatar"

const SKILL_COLORS = {
  green:        "#22c55e",
  blue:         "#60a5fa",
  black:        "#e2e8f0",
  double_black: "#f43f5e",
  experts_only: "#c084fc",
}
const SKILL_LABELS = {
  green:        "Green",
  blue:         "Blue",
  black:        "Black Diamond",
  double_black: "Double Black",
  experts_only: "Experts Only",
}

export default function DirectMessageView({ partner, partnerId, currentUser, onBack }) {
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState("")
  const [sending, setSending]   = useState(false)
  const bottomRef = useRef(null)

  const load = useCallback(async () => {
    try { setMessages(await getDMMessages(partnerId)) } catch {}
  }, [partnerId])

  useEffect(() => {
    load()
    const ch = supabase
      .channel(`dm-${partnerId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (payload) => {
        const msg = payload.new
        if (!msg) return
        const relevant =
          (msg.sender_id === currentUser?.id && msg.recipient_id === partnerId) ||
          (msg.sender_id === partnerId && msg.recipient_id === currentUser?.id)
        if (relevant) load()
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [partnerId, currentUser?.id, load])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages.length])

  async function handleSend(e) {
    e.preventDefault()
    if (!input.trim() || sending) return
    const text = input.trim()
    setInput("")
    setSending(true)
    try { await sendDM(partnerId, text); await load() }
    catch { setInput(text) }
    finally { setSending(false) }
  }

  const partnerName = partner?.full_name || partner?.username || "Friend"
  const skillColor  = SKILL_COLORS[partner?.skill_level]
  const skillLabel  = SKILL_LABELS[partner?.skill_level]

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 22, padding: 0, lineHeight: 1, marginRight: 2 }}>←</button>
        )}
        <Avatar profile={partner} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {partnerName}
          </div>
          {partner?.username && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>@{partner.username}</div>
          )}
        </div>
        {skillColor && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: `${skillColor}18`, border: `1px solid ${skillColor}44`, borderRadius: 999, padding: "3px 10px", flexShrink: 0 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: skillColor }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: skillColor }}>{skillLabel}</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 6px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>💬</div>
            Start a conversation with {partnerName}!
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.sender_id === currentUser?.id
          return (
            <div key={msg.id || i} style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end", gap: 8 }}>
              {!isMe && <Avatar profile={partner} size={26} />}
              <div style={{ maxWidth: "72%", minWidth: 0 }}>
                <div style={{ background: isMe ? "linear-gradient(135deg,#2563eb,#0891b2)" : "rgba(255,255,255,0.09)", color: "white", borderRadius: isMe ? "14px 14px 0 14px" : "0 14px 14px 14px", padding: "9px 13px", fontSize: 14, lineHeight: 1.45, wordBreak: "break-word" }}>
                  {msg.content}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 3, textAlign: isMe ? "right" : "left", paddingLeft: isMe ? 0 : 8, paddingRight: isMe ? 8 : 0 }}>
                  {timeAgo(msg.created_at)}{isMe && msg.read_at ? " · Read" : ""}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} style={{ display: "flex", gap: 8, padding: "10px 14px 14px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={`Message ${partnerName}…`}
          maxLength={1000}
          style={{ flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: "10px 16px", color: "white", fontSize: 14, outline: "none" }}
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          style={{ background: input.trim() ? "linear-gradient(135deg,#2563eb,#0891b2)" : "rgba(255,255,255,0.08)", color: "white", border: "none", borderRadius: 999, padding: "0 18px", fontWeight: 800, fontSize: 13, cursor: input.trim() ? "pointer" : "default" }}
        >
          Send
        </button>
      </form>
    </div>
  )
}
