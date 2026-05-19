import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "../lib/supabase"
import { getTripChatMessages, addTripComment } from "../lib/socialApi"
import { resortName } from "../lib/resorts"
import { timeAgo } from "../lib/format"
import Avatar from "./ui/Avatar"

export function tripDisplayName(trip) {
  return trip?.title || resortName(trip?.resort_key) || "Ski Trip"
}

export default function TripChatView({ trip, currentUser, onBack }) {
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState("")
  const [sending, setSending]   = useState(false)
  const bottomRef = useRef(null)
  const name = tripDisplayName(trip)

  const load = useCallback(async () => {
    try { setMessages(await getTripChatMessages(trip.id)) } catch {}
  }, [trip.id])

  useEffect(() => {
    load()
    const ch = supabase
      .channel(`trip-chat-${trip.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "trip_comments", filter: `trip_id=eq.${trip.id}` }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [trip.id, load])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages.length])

  async function handleSend(e) {
    e.preventDefault()
    if (!input.trim() || sending) return
    const text = input.trim()
    setInput("")
    setSending(true)
    try { await addTripComment(trip.id, text); await load() }
    catch { setInput(text) }
    finally { setSending(false) }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 22, padding: 0, lineHeight: 1, marginRight: 2 }}>←</button>
        )}
        <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg,rgba(251,191,36,0.18),rgba(234,88,12,0.12))", border: "1px solid rgba(251,191,36,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🎿</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>
            {new Date(trip.ski_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 6px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            No messages yet — kick things off! 🎿
          </div>
        )}
        {messages.map((msg, i) => {
          const isMe = msg.user_id === currentUser?.id
          return (
            <div key={msg.id || i} style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end", gap: 8 }}>
              {!isMe && <Avatar profile={msg.profile} size={28} />}
              <div style={{ maxWidth: "72%", minWidth: 0 }}>
                {!isMe && msg.profile && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 3, paddingLeft: 10 }}>
                    {msg.profile.full_name?.split(" ")[0] || msg.profile.username}
                  </div>
                )}
                <div style={{ background: isMe ? "linear-gradient(135deg,#2563eb,#0891b2)" : "rgba(255,255,255,0.09)", color: "white", borderRadius: isMe ? "14px 14px 0 14px" : "0 14px 14px 14px", padding: "8px 12px", fontSize: 13, lineHeight: 1.45, wordBreak: "break-word" }}>
                  {msg.content}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 3, textAlign: isMe ? "right" : "left", paddingLeft: isMe ? 0 : 10, paddingRight: isMe ? 10 : 0 }}>
                  {timeAgo(msg.created_at)}
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
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message…"
          maxLength={280}
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
