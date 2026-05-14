import { useState } from "react"
import { createSkiPing, respondToPing } from "../lib/socialApi"

const RESORT_OPTIONS = [
  { key: "vail", label: "Vail" },
  { key: "breckenridge", label: "Breckenridge" },
  { key: "keystone", label: "Keystone" },
  { key: "beavercreek", label: "Beaver Creek" },
  { key: "coppermountain", label: "Copper Mountain" },
  { key: "winterpark", label: "Winter Park" },
  { key: "arapahoebasin", label: "Arapahoe Basin" },
  { key: "crestedbutte", label: "Crested Butte" },
  { key: "telluride", label: "Telluride" },
  { key: "steamboat", label: "Steamboat" },
  { key: "eldora", label: "Eldora" },
  { key: "aspensnowmass", label: "Aspen Snowmass" },
]

const RESPONSE_OPTS = [
  { value: "yes",   label: "I'm In! 🤙",  bg: "rgba(34,197,94,0.18)",  border: "rgba(34,197,94,0.45)",  color: "#4ade80" },
  { value: "maybe", label: "Maybe 🤔",     bg: "rgba(251,191,36,0.15)", border: "rgba(251,191,36,0.4)",  color: "#fbbf24" },
  { value: "no",    label: "Can't 😔",     bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.3)",   color: "#f87171" },
]

function Avatar({ profile, size = 32 }) {
  const name = profile?.full_name || profile?.username || "?"
  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={name}
        style={{ width: size, height: size, borderRadius: 999, objectFit: "cover", flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: "rgba(96,165,250,0.2)", border: "1px solid rgba(96,165,250,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.42, fontWeight: 800, color: "#93c5fd", flexShrink: 0,
    }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function formatDate(iso) {
  if (!iso) return null
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}

// ─── Ping composer modal ──────────────────────────────────────────────────────

export function SkiPingComposer({ friends, onClose, onSent }) {
  const [selected, setSelected] = useState(new Set())
  const [message, setMessage] = useState("")
  const [resort, setResort] = useState("")
  const [skiDate, setSkiDate] = useState("")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")

  function toggleFriend(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSend() {
    if (selected.size === 0) { setErr("Pick at least one friend."); return }
    setSaving(true); setErr("")
    try {
      await createSkiPing({
        recipientIds: [...selected],
        message: message.trim() || null,
        resort_key: resort || null,
        ski_date: skiDate || null,
      })
      onSent?.()
      onClose()
    } catch (e) {
      setErr(e.message || "Could not send ping.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: "100%", maxWidth: 480,
        background: "linear-gradient(160deg, #0f172a 0%, #0a0f1e 100%)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "24px 24px 0 0",
        padding: "24px 20px 36px",
        maxHeight: "88vh", overflowY: "auto",
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)", margin: "0 auto 20px" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>👋 Down to ski?</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>Send a quick pulse to your crew</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* Friend picker */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Who?</div>
          {friends.length === 0 ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", padding: "12px 0" }}>No friends yet — add some first!</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {friends.map((f) => {
                const isOn = selected.has(f.id)
                const name = f.full_name || f.username || "?"
                return (
                  <button
                    key={f.id}
                    onClick={() => toggleFriend(f.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "6px 12px 6px 6px", borderRadius: 999,
                      border: isOn ? "1.5px solid #3b82f6" : "1.5px solid rgba(255,255,255,0.12)",
                      background: isOn ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.05)",
                      color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
                      transition: "all 0.15s",
                    }}
                  >
                    <Avatar profile={f} size={24} />
                    {name}
                    {isOn && <span style={{ color: "#60a5fa", marginLeft: 2 }}>✓</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Optional: resort + date */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Resort (optional)</div>
            <select
              value={resort}
              onChange={(e) => setResort(e.target.value)}
              style={{
                width: "100%", padding: "9px 10px", borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
                color: "#fff", fontSize: 13, outline: "none",
              }}
            >
              <option value="">Any mountain</option>
              {RESORT_OPTIONS.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Date (optional)</div>
            <input
              type="date"
              value={skiDate}
              onChange={(e) => setSkiDate(e.target.value)}
              style={{
                width: "100%", padding: "9px 10px", borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
                color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* Message */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Message (optional)</div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Fresh pow tomorrow — who's down? 🏔️"
            rows={2}
            maxLength={200}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
              color: "#fff", fontSize: 14, outline: "none", resize: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {err && <div style={{ fontSize: 13, color: "#f87171", marginBottom: 12 }}>{err}</div>}

        <button
          onClick={handleSend}
          disabled={saving || selected.size === 0}
          style={{
            width: "100%", padding: "14px", borderRadius: 14, border: "none",
            background: selected.size > 0 ? "#3b82f6" : "rgba(255,255,255,0.08)",
            color: selected.size > 0 ? "#fff" : "rgba(255,255,255,0.35)",
            fontWeight: 800, fontSize: 15, cursor: selected.size > 0 ? "pointer" : "default",
          }}
        >
          {saving ? "Sending..." : `Send Ping to ${selected.size > 0 ? selected.size : ""} ${selected.size === 1 ? "friend" : selected.size > 1 ? "friends" : "friends"} 🏔️`}
        </button>
      </div>
    </div>
  )
}

// ─── Received ping card ───────────────────────────────────────────────────────

export function PingCard({ ping, onRespond, responding }) {
  const senderName = ping.senderProfile?.full_name || ping.senderProfile?.username || "Someone"
  const resortLabel = ping.resort_key
    ? RESORT_OPTIONS.find((r) => r.key === ping.resort_key)?.label || ping.resort_key
    : null

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(59,130,246,0.1), rgba(16,185,129,0.06))",
      border: "1px solid rgba(59,130,246,0.25)",
      borderRadius: 16, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Avatar profile={ping.senderProfile} size={36} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>{senderName}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            {resortLabel && <span style={{ marginRight: 8 }}>🏔️ {resortLabel}</span>}
            {ping.ski_date && <span>📅 {formatDate(ping.ski_date)}</span>}
            {!resortLabel && !ping.ski_date && "is asking who's down to ski"}
          </div>
        </div>
        <div style={{
          background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)",
          borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 800, color: "#fbbf24",
          whiteSpace: "nowrap",
        }}>
          Down to ski?
        </div>
      </div>

      {ping.message && (
        <div style={{
          fontSize: 13, color: "rgba(255,255,255,0.78)",
          background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "8px 12px",
          marginBottom: 12, fontStyle: "italic",
        }}>
          "{ping.message}"
        </div>
      )}

      {/* Response tally for sent pings */}
      {ping.isMine && ping.responses.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          {["yes", "maybe", "no"].map((r) => {
            const count = ping.responses.filter((x) => x.response === r).length
            if (count === 0) return null
            const opt = RESPONSE_OPTS.find((o) => o.value === r)
            return (
              <div key={r} style={{
                display: "flex", alignItems: "center", gap: 6,
                background: opt.bg, border: `1px solid ${opt.border}`,
                borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700, color: opt.color,
              }}>
                {opt.label} <span style={{ opacity: 0.8 }}>{count}</span>
              </div>
            )
          })}
          {/* Avatars of responders */}
          <div style={{ display: "flex", alignItems: "center", gap: -4, marginLeft: "auto" }}>
            {ping.responses.slice(0, 5).map((r, i) => (
              <div key={r.user_id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }}>
                <Avatar profile={r.profile} size={22} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Response buttons for recipients */}
      {!ping.isMine && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {RESPONSE_OPTS.map((opt) => {
            const isActive = ping.myResponse === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => onRespond(ping.id, opt.value)}
                disabled={responding === ping.id}
                style={{
                  padding: "9px 6px", borderRadius: 11, border: `1.5px solid ${isActive ? opt.border : "rgba(255,255,255,0.1)"}`,
                  background: isActive ? opt.bg : "rgba(255,255,255,0.04)",
                  color: isActive ? opt.color : "rgba(255,255,255,0.65)",
                  fontWeight: isActive ? 800 : 600, fontSize: 12, cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )}

      {ping.isMine && ping.responses.length === 0 && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>Waiting for responses...</div>
      )}
    </div>
  )
}
