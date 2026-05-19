import { useState, useEffect, useCallback } from "react"
import { getLeaderboard, getPublicLeaderboard, getMySessions, logSkiDay, deleteSkiDay, getCurrentSeason } from "../lib/leaderboardApi"

const RESORT_NAMES = [
  "Vail", "Beaver Creek", "Breckenridge", "Keystone", "Park City",
  "Heavenly", "Northstar", "Kirkwood", "Stowe", "Whistler Blackcomb",
  "Telluride", "Arapahoe Basin", "Winter Park", "Steamboat", "Copper Mountain",
  "Crested Butte", "Eldora", "Aspen Snowmass", "Snowbird", "Alta",
  "Park City Mountain", "Mammoth Mountain", "Big Sky", "Jackson Hole",
  "Taos", "Sun Valley", "Squaw Valley", "Lake Tahoe", "Palisades Tahoe",
  "Loveland", "Monarch", "Wolf Creek", "Sunlight", "Powderhorn",
]

const CATEGORIES = [
  { key: "days",       label: "🎿 Days",        stat: (e) => e.days,       unit: "days",    locked: false },
  { key: "resorts",    label: "🏔️ Resorts",     stat: (e) => e.resorts,    unit: "visited", locked: false },
  { key: "powderDays", label: "❄️ Powder Days", stat: (e) => e.powderDays, unit: "days",    locked: false },
  { key: "vertical",   label: "↕️ Vertical",    stat: (e) => e.verticalFt, unit: "ft",      locked: true  },
  { key: "miles",      label: "🛣️ Miles",       stat: (e) => e.milesSki,   unit: "mi",      locked: true  },
]

const RANK_MEDALS = ["🥇", "🥈", "🥉"]

function Avatar({ profile, size = 36 }) {
  const initials = (profile?.full_name || profile?.username || "?")
    .split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
  const colors = ["#2563eb","#0891b2","#7c3aed","#16a34a","#ea580c","#db2777"]
  const color  = colors[(profile?.full_name || profile?.username || "").length % colors.length]
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt={initials} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 800, color: "white", flexShrink: 0 }}>
      {initials}
    </div>
  )
}

function LogDayModal({ onClose, onLogged }) {
  const today = new Date().toISOString().split("T")[0]
  const [resort, setResort]       = useState("")
  const [date, setDate]           = useState(today)
  const [isPowder, setIsPowder]   = useState(false)
  const [notes, setNotes]         = useState("")
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState("")
  const [search, setSearch]       = useState("")
  const [showDropdown, setShowDropdown] = useState(false)

  const filtered = search.length > 0
    ? RESORT_NAMES.filter((r) => r.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : []

  async function handleSubmit(e) {
    e.preventDefault()
    if (!resort) { setError("Pick a resort first."); return }
    setSaving(true)
    setError("")
    try {
      await logSkiDay({ resortName: resort, sessionDate: date, isPowderDay: isPowder, notes: notes || null })
      onLogged()
      onClose()
    } catch (err) {
      setError(err.message || "Something went wrong.")
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10, padding: "10px 12px", color: "white", fontSize: 14, boxSizing: "border-box",
    outline: "none",
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "20px 20px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "white" }}>🎿 Log a Ski Day</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.6)", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          {/* Resort */}
          <div style={{ position: "relative" }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Resort</label>
            <input
              style={inputStyle}
              placeholder="Search resort..."
              value={resort || search}
              onChange={(e) => { setSearch(e.target.value); setResort(""); setShowDropdown(true) }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            />
            {showDropdown && filtered.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1e293b", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, zIndex: 10, overflow: "hidden", marginTop: 4 }}>
                {filtered.map((r) => (
                  <div key={r} onMouseDown={() => { setResort(r); setSearch(r); setShowDropdown(false) }}
                    style={{ padding: "10px 12px", cursor: "pointer", fontSize: 14, color: "white", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >{r}</div>
                ))}
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Date</label>
            <input type="date" style={inputStyle} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </div>

          {/* Powder toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 14px" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "white" }}>❄️ Powder Day</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Fresh snow on the ground</div>
            </div>
            <div onClick={() => setIsPowder(!isPowder)} style={{ width: 44, height: 24, borderRadius: 12, background: isPowder ? "#2563eb" : "rgba(255,255,255,0.15)", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
              <div style={{ position: "absolute", top: 2, left: isPowder ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Notes <span style={{ opacity: 0.5 }}>(optional)</span></label>
            <input style={inputStyle} placeholder="Best run, who you went with..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <div style={{ fontSize: 13, color: "#f87171", padding: "8px 12px", background: "rgba(248,113,113,0.1)", borderRadius: 8 }}>{error}</div>}

          <button type="submit" disabled={saving} style={{ background: "linear-gradient(135deg,#2563eb,#0891b2)", color: "white", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 900, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, marginTop: 4 }}>
            {saving ? "Logging…" : "Log This Day"}
          </button>
        </form>
      </div>
    </div>
  )
}

function LeaderboardRow({ entry, rank, category }) {
  const cat    = CATEGORIES.find((c) => c.key === category)
  const value  = cat.stat(entry)
  const medal  = rank <= 3 ? RANK_MEDALS[rank - 1] : null
  const isTop  = rank <= 3

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
      background: entry.isMe ? "rgba(37,99,235,0.12)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${entry.isMe ? "rgba(37,99,235,0.3)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 14,
    }}>
      {/* Rank */}
      <div style={{ width: 28, textAlign: "center", flexShrink: 0 }}>
        {medal ? (
          <span style={{ fontSize: 20 }}>{medal}</span>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.35)" }}>{rank}</span>
        )}
      </div>

      <Avatar profile={entry} size={36} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 14, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.full_name || entry.username || "Skier"}
          </span>
          {entry.isMe && (
            <span style={{ fontSize: 10, fontWeight: 900, color: "#60a5fa", background: "rgba(96,165,250,0.15)", borderRadius: 999, padding: "2px 7px", flexShrink: 0 }}>YOU</span>
          )}
        </div>
        {entry.topResort && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            ⛷️ {entry.topResort}
          </div>
        )}
      </div>

      {/* Stat */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: isTop ? "#60a5fa" : "white", lineHeight: 1 }}>
          {cat.locked ? "—" : (value ?? 0)}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{cat.unit}</div>
      </div>
    </div>
  )
}

export default function LeaderboardPage() {
  const season = getCurrentSeason()
  const [boardMode, setBoardMode] = useState("friends")
  const [category, setCategory]   = useState("days")
  const [entries, setEntries]     = useState([])
  const [mySessions, setMySessions] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showLog, setShowLog]     = useState(false)
  const [showMySessions, setShowMySessions] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const fetchBoard = boardMode === "public" ? getPublicLeaderboard : getLeaderboard
      const [board, sessions] = await Promise.all([
        fetchBoard(season.startYear),
        getMySessions(season.startYear),
      ])
      setMySessions(sessions)

      const cat = CATEGORIES.find((c) => c.key === category)
      const sorted = [...board].sort((a, b) => cat.stat(b) - cat.stat(a))
      setEntries(sorted)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [season.startYear, category, boardMode])

  useEffect(() => { load() }, [load])

  const me = entries.find((e) => e.isMe)
  const myRank = entries.indexOf(me) + 1

  async function handleDeleteSession(id) {
    await deleteSkiDay(id)
    load()
  }

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 999, padding: "4px 11px", fontSize: 11, fontWeight: 700, color: "#fbbf24", marginBottom: 8 }}>
            🏆 {season.label} Season
          </div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: -0.5, color: "white" }}>Leaderboard</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
            {boardMode === "friends" ? "You + your friends, ranked" : "All PowderDays skiers"}
          </p>
        </div>
        <button onClick={() => setShowLog(true)} style={{ background: "linear-gradient(135deg,#2563eb,#0891b2)", color: "white", border: "none", borderRadius: 12, padding: "10px 16px", fontSize: 13, fontWeight: 900, cursor: "pointer", boxShadow: "0 6px 20px rgba(37,99,235,0.4)", whiteSpace: "nowrap" }}>
          + Log Day
        </button>
      </div>

      {/* Friends / Public toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 4 }}>
        {[
          { key: "friends", label: "👥 Friends" },
          { key: "public",  label: "🌐 Global" },
        ].map((mode) => (
          <button
            key={mode.key}
            onClick={() => setBoardMode(mode.key)}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 9,
              background: boardMode === mode.key ? "rgba(255,255,255,0.12)" : "transparent",
              border: boardMode === mode.key ? "1px solid rgba(255,255,255,0.18)" : "1px solid transparent",
              color: boardMode === mode.key ? "white" : "rgba(255,255,255,0.4)",
              fontSize: 13, fontWeight: boardMode === mode.key ? 800 : 600, cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* My season snapshot */}
      {me && (
        <div style={{ background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.2)", borderRadius: 16, padding: "14px 16px", marginBottom: 20, display: "flex", gap: 8, justifyContent: "space-between", cursor: "pointer" }} onClick={() => setShowMySessions(!showMySessions)}>
          {[
            { label: "Days",        val: me.days },
            { label: "Resorts",     val: me.resorts },
            { label: "Powder Days", val: me.powderDays },
            { label: "Rank",        val: myRank ? `#${myRank}` : "—" },
          ].map(({ label, val }) => (
            <div key={label} style={{ textAlign: "center", flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>{val}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* My sessions list */}
      {showMySessions && mySessions.length > 0 && (
        <div style={{ marginBottom: 20, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)", fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.6)" }}>Your logged days</div>
          {mySessions.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{s.resort_name}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                  {new Date(s.session_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {s.is_powder_day && " · ❄️ Powder"}
                </div>
              </div>
              <button onClick={() => handleDeleteSession(s.id)} style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {/* Category tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, overflowX: "auto", paddingBottom: 2 }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => !cat.locked && setCategory(cat.key)}
            style={{
              background: category === cat.key ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
              border: category === cat.key ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.07)",
              color: cat.locked ? "rgba(255,255,255,0.25)" : (category === cat.key ? "white" : "rgba(255,255,255,0.55)"),
              borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700,
              cursor: cat.locked ? "default" : "pointer", whiteSpace: "nowrap", flexShrink: 0,
              position: "relative",
            }}
          >
            {cat.label}
            {cat.locked && <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.6 }}>🔒</span>}
          </button>
        ))}
      </div>

      {/* Strava lock notice */}
      {CATEGORIES.find((c) => c.key === category)?.locked && (
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "20px", textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🎿</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "white", marginBottom: 6 }}>Strava integration coming soon</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>Connect Strava to automatically track vertical feet and miles from every run.</div>
        </div>
      )}

      {/* Leaderboard */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Loading leaderboard…</div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 24px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏔️</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: "white", marginBottom: 8 }}>
            {boardMode === "friends" ? "No friends on the board yet" : "No days logged yet"}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>
            {boardMode === "friends" ? "Add friends to see how you stack up." : "Be the first to log a ski day and top the board."}
          </div>
          <button onClick={() => setShowLog(true)} style={{ background: "linear-gradient(135deg,#2563eb,#0891b2)", color: "white", border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>
            Log Your First Day
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {entries.map((entry, i) => (
            <LeaderboardRow key={entry.id} entry={entry} rank={i + 1} category={category} />
          ))}
        </div>
      )}

      {showLog && <LogDayModal onClose={() => setShowLog(false)} onLogged={load} />}
    </div>
  )
}
