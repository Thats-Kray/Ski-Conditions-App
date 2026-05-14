import { useState } from "react"
import { createDatePoll, voteOnDateOption } from "../lib/socialApi"

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

function Avatar({ profile, size = 28 }) {
  const name = profile?.full_name || profile?.username || "?"
  if (profile?.avatar_url) {
    return (
      <img src={profile.avatar_url} alt={name}
        style={{ width: size, height: size, borderRadius: 999, objectFit: "cover", flexShrink: 0 }} />
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
  if (!iso) return ""
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}

// ─── Composer ────────────────────────────────────────────────────────────────

export function DateMatchmakerComposer({ friends, onClose, onCreated }) {
  const [title, setTitle] = useState("")
  const [resort, setResort] = useState("")
  const [message, setMessage] = useState("")
  const [dateInput, setDateInput] = useState("")
  const [dates, setDates] = useState([])
  const [selectedFriends, setSelectedFriends] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")

  function addDate() {
    if (!dateInput) return
    if (dates.includes(dateInput)) return
    setDates((prev) => [...prev, dateInput].sort())
    setDateInput("")
  }

  function removeDate(d) {
    setDates((prev) => prev.filter((x) => x !== d))
  }

  function toggleFriend(id) {
    setSelectedFriends((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleCreate() {
    if (!title.trim()) { setErr("Give your poll a title."); return }
    if (dates.length < 2) { setErr("Add at least 2 dates."); return }
    if (selectedFriends.size === 0) { setErr("Pick at least one friend."); return }
    setSaving(true); setErr("")
    try {
      const poll = await createDatePoll({
        title: title.trim(),
        resort_key: resort || null,
        message: message.trim() || null,
        dates,
        recipientIds: [...selectedFriends],
      })
      onCreated?.(poll)
      onClose()
    } catch (e) {
      setErr(e.message || "Could not create poll.")
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
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)", margin: "0 auto 20px" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>📅 Date Matchmaker</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>Find dates that work for everyone</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {/* Title */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Title</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Breckenridge weekend?"
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 11,
              border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
              color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Resort */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Resort (optional)</div>
          <select
            value={resort}
            onChange={(e) => setResort(e.target.value)}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 11,
              border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
              color: "#fff", fontSize: 14, outline: "none",
            }}
          >
            <option value="">TBD — vote first, pick resort later</option>
            {RESORT_OPTIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>

        {/* Dates */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Date options</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDate()}
              style={{
                flex: 1, padding: "9px 12px", borderRadius: 11,
                border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
                color: "#fff", fontSize: 14, outline: "none",
              }}
            />
            <button onClick={addDate} style={{
              padding: "9px 16px", borderRadius: 11, border: "none",
              background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>
              + Add
            </button>
          </div>
          {dates.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {dates.map((d) => (
                <div key={d} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)",
                  borderRadius: 10, padding: "5px 10px", fontSize: 12, fontWeight: 600, color: "#93c5fd",
                }}>
                  {formatDate(d)}
                  <button onClick={() => removeDate(d)} style={{
                    background: "none", border: "none", color: "rgba(255,255,255,0.4)",
                    cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0,
                  }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Friends */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Who to ask</div>
          {friends.length === 0 ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Add friends first!</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {friends.map((f) => {
                const isOn = selectedFriends.has(f.id)
                const name = f.full_name || f.username || "?"
                return (
                  <button key={f.id} onClick={() => toggleFriend(f.id)} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 12px 5px 6px", borderRadius: 999,
                    border: isOn ? "1.5px solid #3b82f6" : "1.5px solid rgba(255,255,255,0.12)",
                    background: isOn ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.05)",
                    color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  }}>
                    <Avatar profile={f} size={22} />
                    {name}
                    {isOn && <span style={{ color: "#60a5fa" }}>✓</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Optional message */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Note (optional)</div>
          <textarea
            value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder="When are you free? Trying to lock in a powder day 🏔️"
            rows={2} maxLength={200}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
              color: "#fff", fontSize: 14, outline: "none", resize: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {err && <div style={{ fontSize: 13, color: "#f87171", marginBottom: 12 }}>{err}</div>}

        <button
          onClick={handleCreate}
          disabled={saving}
          style={{
            width: "100%", padding: 14, borderRadius: 14, border: "none",
            background: "#3b82f6", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer",
          }}
        >
          {saving ? "Creating..." : "Create Date Poll 📅"}
        </button>
      </div>
    </div>
  )
}

// ─── Poll card (vote + results) ───────────────────────────────────────────────

export function DatePollCard({ poll, onVote, voting }) {
  const creatorName = poll.creatorProfile?.full_name || poll.creatorProfile?.username || "Someone"
  const resortLabel = poll.resort_key
    ? RESORT_OPTIONS.find((r) => r.key === poll.resort_key)?.label || poll.resort_key
    : null

  const bestOption = poll.options.reduce((best, opt) =>
    opt.yesCount > (best?.yesCount ?? -1) ? opt : best, null)

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(59,130,246,0.08))",
      border: "1px solid rgba(139,92,246,0.25)",
      borderRadius: 16, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#fff", marginBottom: 3 }}>{poll.title}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            {poll.isMine ? "You" : creatorName} asked
            {resortLabel ? ` · 🏔️ ${resortLabel}` : ""}
            {" · "}{poll.participantCount} people
          </div>
        </div>
        <div style={{
          background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)",
          borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 800, color: "#c4b5fd",
          whiteSpace: "nowrap", flexShrink: 0,
        }}>
          📅 Date Poll
        </div>
      </div>

      {poll.message && (
        <div style={{
          fontSize: 13, color: "rgba(255,255,255,0.72)",
          background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "8px 12px",
          marginBottom: 12, fontStyle: "italic",
        }}>
          "{poll.message}"
        </div>
      )}

      {/* Date options with vote bars */}
      <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
        {poll.options.map((opt) => {
          const total = opt.yesCount + opt.noCount || 1
          const pct = Math.round((opt.yesCount / total) * 100)
          const isBest = opt.id === bestOption?.id && opt.yesCount > 0
          const myVote = opt.myVote

          return (
            <div key={opt.id} style={{
              background: isBest ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.04)",
              border: isBest ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12, padding: "10px 12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {isBest && <span style={{ fontSize: 14 }}>⭐</span>}
                  <span style={{ fontSize: 13, fontWeight: 700, color: isBest ? "#4ade80" : "#fff" }}>
                    {formatDate(opt.ski_date)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>
                  {opt.yesCount}/{opt.yesCount + opt.noCount} available
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.08)", marginBottom: 8, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 3,
                  width: `${pct}%`,
                  background: isBest ? "rgba(34,197,94,0.7)" : "rgba(96,165,250,0.6)",
                  transition: "width 0.3s ease",
                }} />
              </div>

              {/* Vote buttons for recipients, or status for creator */}
              {!poll.isMine && (
                <div style={{ display: "flex", gap: 8 }}>
                  {[{ val: true, label: "✓ I'm free", color: "#4ade80", bg: "rgba(34,197,94,0.18)", border: "rgba(34,197,94,0.4)" },
                    { val: false, label: "✗ Can't", color: "#f87171", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)" }].map(({ val, label, color, bg, border }) => {
                    const active = myVote !== null && myVote.available === val
                    return (
                      <button
                        key={String(val)}
                        onClick={() => onVote(opt.id, val)}
                        disabled={voting === opt.id}
                        style={{
                          flex: 1, padding: "6px", borderRadius: 9, fontSize: 12, fontWeight: 700,
                          border: `1.5px solid ${active ? border : "rgba(255,255,255,0.1)"}`,
                          background: active ? bg : "rgba(255,255,255,0.04)",
                          color: active ? color : "rgba(255,255,255,0.55)", cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Participant avatars */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex" }}>
          {poll.recipientProfiles.slice(0, 6).map((p, i) => (
            <div key={p.id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }}>
              <Avatar profile={p} size={22} />
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          {poll.recipientProfiles.length} invited
        </div>
        {bestOption && bestOption.yesCount > 0 && (
          <div style={{
            marginLeft: "auto", fontSize: 11, fontWeight: 800,
            color: "#4ade80", background: "rgba(34,197,94,0.12)",
            border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "3px 8px",
          }}>
            Best: {formatDate(bestOption.ski_date)}
          </div>
        )}
      </div>
    </div>
  )
}
