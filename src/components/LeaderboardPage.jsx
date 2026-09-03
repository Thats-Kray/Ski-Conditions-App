import { useState, useEffect, useCallback, useMemo } from "react"
import { getLeaderboard, getPublicLeaderboard, getMySessions, logSkiDay, updateSessionStats, deleteSkiDay, getCurrentSeason, getLeaderboardReactions, addLeaderboardReaction } from "../lib/leaderboardApi"
import { logActivityOnce, saveSkiDayDetails } from "../lib/socialApi"
import { localDateKey } from "../lib/calendarDates"
import { resortName } from "../lib/resorts"
import Avatar from "./ui/Avatar"
import SessionStatsForm from "./SessionStatsForm"
import SkiDayDetailsForm from "./SkiDayDetailsForm"
import ResortPicker from "./ui/ResortPicker"

// Order and set match the mockup's 7-chip Leaderboard row exactly (TASK 22.0
// Leaderboard-slice redesign). Top Speed/Most Lifts/Time on Mountain are
// deliberately not sortable categories here anymore — their data still flows
// through leaderboardApi.js and SessionStatsForm.jsx, they're just not tabs
// on this page. "Longest Day" is the mockup's label for the same longestRun
// stat (longest single run, in feet) — not a new day-level metric.
const CATEGORIES = [
  { key: "vertical",   label: "↕️ Vertical",    stat: (e) => e.verticalFt, unit: "ft"      },
  { key: "days",       label: "🎿 Days",        stat: (e) => e.days,       unit: "days"    },
  { key: "powderDays", label: "❄️ Powder Days", stat: (e) => e.powderDays, unit: "days"    },
  { key: "resorts",    label: "⛰️ Resorts",     stat: (e) => e.resorts,    unit: "resorts" },
  { key: "miles",      label: "🛣️ Miles",       stat: (e) => e.milesSki,   unit: "mi"      },
  { key: "runs",       label: "🎿 Runs",        stat: (e) => e.totalRuns,  unit: "runs"    },
  { key: "longestRun", label: "📏 Longest Day", stat: (e) => e.longestRun, unit: "ft"      },
]

const RANK_MEDALS = ["🥇", "🥈", "🥉"]
const REACTION_EMOJIS = ["🎿", "❄️", "🔥", "👑"]

function LogDayModal({ onClose, onLogged }) {
  // Seeds the date input. A UTC key pre-filled TOMORROW for anyone logging an
  // evening session, which is when people actually log the day they just skied.
  const today = localDateKey()
  const [resort, setResort]       = useState("")
  const [date, setDate]           = useState(today)
  const [isPowder, setIsPowder]   = useState(false)
  const [notes, setNotes]         = useState("")
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState("")

  // Steps 2 and 3 — optional post-submit "add your stats" then "add details" steps.
  // Both are skippable; the day itself is already logged by the time either is reached.
  const [step, setStep]                     = useState("basic") // "basic" | "stats" | "details"
  const [savedSession, setSavedSession]     = useState(null)
  const [statsSaving, setStatsSaving]       = useState(false)
  const [statsError, setStatsError]         = useState("")
  const [detailsSaving, setDetailsSaving]   = useState(false)
  const [detailsError, setDetailsError]     = useState("")

  async function handleSubmit(e) {
    e.preventDefault()
    if (!resort) { setError("Pick a resort first."); return }
    setSaving(true)
    setError("")
    try {
      const session = await logSkiDay({ resortName: resort, sessionDate: date, isPowderDay: isPowder, notes: notes || null })

      // Deduped, so re-logging the same day (which upserts onto the same row)
      // won't post a second feed entry. Awaited rather than fire-and-forget:
      // `saving` only stays true while this handler runs, so leaving it pending
      // would let a fast double-submit clear the button and race a second call
      // past the existence check before the first insert lands.
      await logActivityOnce("ski_session", {
        subjectId:   session.id,
        subjectType: "ski_sessions",
        metadata:    { resort_name: session.resort_name, is_powder_day: session.is_powder_day },
      })

      onLogged()
      setSavedSession(session)
      setStep("stats")
    } catch (err) {
      setError(err.message || "Something went wrong.")
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveStats(stats) {
    setStatsSaving(true)
    setStatsError("")
    try {
      await updateSessionStats(savedSession.id, stats)
      // Correction 6: this used to be onClose(). Both exits of the stats step have to
      // route into "details" or the new step is unreachable — onSkip is rewired the same
      // way at the SessionStatsForm call site below. onClose() now lives only on the
      // details step's own save and skip.
      setStep("details")
    } catch (err) {
      setStatsError(err.message || "Could not save stats.")
    } finally {
      setStatsSaving(false)
    }
  }

  async function handleSaveDetails(diff) {
    setDetailsSaving(true)
    setDetailsError("")
    try {
      await saveSkiDayDetails(savedSession.id, diff)
      onClose()
    } catch (err) {
      // Keep the modal open with the reason showing. The day and its stats are already
      // saved at this point, so a failure here costs the user only the details — closing
      // would silently discard photos they picked and friends they checked.
      setDetailsError(err.message || "Could not save details.")
    } finally {
      setDetailsSaving(false)
    }
  }

  const inputStyle = {
    width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10, padding: "10px 12px", color: "white", fontSize: 14, boxSizing: "border-box",
    outline: "none",
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--color-modal-bg)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "20px 20px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "white" }}>
            {step === "basic" ? "🎿 Log a Ski Day" : step === "stats" ? "📊 Add Your Stats" : "📸 Add Details"}
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.6)", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        {step === "details" ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: -10 }}>
              Add a title, a few photos, and tag who you skied with.
            </div>
            {detailsError && <div style={{ fontSize: 13, color: "var(--color-danger)", padding: "8px 12px", background: "rgba(248,113,113,0.1)", borderRadius: 8 }}>{detailsError}</div>}
            {/* A day that was just created has no photos and no tags, so the empty
                initial arrays are correct rather than a placeholder — nothing async has
                to load before this can be mounted (Task 5's contract rule 3).
                initialTitle="" (not omitted) is what makes the title input appear. */}
            <SkiDayDetailsForm
              initialTitle=""
              initialPhotos={[]}
              initialTags={[]}
              saving={detailsSaving}
              onSave={handleSaveDetails}
              onSkip={onClose}
            />
          </div>
        ) : step === "stats" ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: -10 }}>
              Nice — {resortName(savedSession?.resort_name) || "your day"} is logged. Want to add stats now?
            </div>
            {statsError && <div style={{ fontSize: 13, color: "var(--color-danger)", padding: "8px 12px", background: "rgba(248,113,113,0.1)", borderRadius: 8 }}>{statsError}</div>}
            <SessionStatsForm
              saving={statsSaving}
              onSave={handleSaveStats}
              onSkip={() => setStep("details")}
            />
          </div>
        ) : (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          {/* Resort */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Resort</label>
            <ResortPicker value={resort} onChange={setResort} />
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
            <div onClick={() => setIsPowder(!isPowder)} style={{ width: 44, height: 24, borderRadius: 12, background: isPowder ? "var(--color-accent-deep)" : "rgba(255,255,255,0.15)", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
              <div style={{ position: "absolute", top: 2, left: isPowder ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Notes <span style={{ opacity: 0.5 }}>(optional)</span></label>
            <input style={inputStyle} placeholder="Best run, who you went with..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <div style={{ fontSize: 13, color: "var(--color-danger)", padding: "8px 12px", background: "rgba(248,113,113,0.1)", borderRadius: 8 }}>{error}</div>}

          <button type="submit" disabled={saving} style={{ background: "var(--gradient-cta)", color: "white", border: "none", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 900, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, marginTop: 4 }}>
            {saving ? "Logging…" : "Log This Day"}
          </button>
        </form>
        )}
      </div>
    </div>
  )
}

function LeaderboardRow({ entry, rank, category, reactions, onReact, currentUserId }) {
  const cat    = CATEGORIES.find((c) => c.key === category)
  const value  = cat.stat(entry)
  const medal  = rank <= 3 ? RANK_MEDALS[rank - 1] : null
  const isTop  = rank <= 3

  return (
    <div style={{
      padding: "12px 14px",
      background: entry.isMe ? "rgba(37,99,235,0.12)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${entry.isMe ? "rgba(37,99,235,0.3)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
              <span style={{ fontSize: 10, fontWeight: 900, color: "var(--color-accent-soft)", background: "rgba(96,165,250,0.15)", borderRadius: 999, padding: "2px 7px", flexShrink: 0 }}>YOU</span>
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
          <div style={{ fontSize: 16, fontWeight: 900, color: isTop ? "var(--color-accent-soft)" : "white", whiteSpace: "nowrap" }}>
            {value == null ? "—" : `${typeof value === "number" ? value.toLocaleString("en-US") : value} ${cat.unit}`}
          </div>
        </div>
      </div>

      {/* Reactions — not shown on the current user's own row */}
      {!entry.isMe && (
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
          {REACTION_EMOJIS.map((emoji) => {
            const count = (reactions || []).filter((r) => r.emoji === emoji).length
            const mine = (reactions || []).some((r) => r.user_id === currentUserId && r.emoji === emoji)
            return (
              <button
                key={emoji}
                onClick={() => onReact(emoji)}
                style={{
                  display: "flex", alignItems: "center", gap: 3, padding: "3px 7px",
                  borderRadius: 999, border: "none", cursor: "pointer",
                  background: mine ? "var(--color-accent-deep)" : "rgba(255,255,255,0.06)",
                  color: mine ? "white" : "rgba(255,255,255,0.55)",
                  fontSize: 13,
                }}
              >
                {emoji}
                {count > 0 && <span style={{ fontSize: 11, fontWeight: 700 }}>{count}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function LeaderboardPage() {
  const season = getCurrentSeason()
  const [boardMode, setBoardMode] = useState("friends")
  const [category, setCategory]   = useState("vertical")
  const [board, setBoard]         = useState([]) // unsorted, as fetched
  const [mySessions, setMySessions] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showLog, setShowLog]     = useState(false)
  const [showMySessions, setShowMySessions] = useState(false)
  const [reactionsByUser, setReactionsByUser] = useState({}) // { [target_user_id]: [{user_id, emoji}] }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const fetchBoard = boardMode === "public" ? getPublicLeaderboard : getLeaderboard
      const [rows, sessions] = await Promise.all([
        fetchBoard(season.startYear),
        getMySessions(season.startYear),
      ])
      setMySessions(sessions)
      setBoard(rows)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
    // NOTE: `category` is deliberately absent. It only decides the sort order of
    // rows we already have, so including it here made every tab click refire the
    // leaderboard RPC *and* getMySessions (3 queries + a background upsert),
    // flashing "Loading…" on all 7 tabs. The sort now lives in a useMemo below.
  }, [season.startYear, boardMode])

  useEffect(() => { load() }, [load])

  // Switching tabs is a pure client-side re-sort — no network round-trip.
  const entries = useMemo(() => {
    const cat = CATEGORIES.find((c) => c.key === category)
    if (!cat) return board
    return [...board].sort((a, b) => {
      const av = cat.stat(a), bv = cat.stat(b)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return bv - av // descending — highest first
    })
  }, [board, category])

  const me = entries.find((e) => e.isMe)
  const myRank = entries.indexOf(me) + 1

  // Reactions are scoped per active category tab + season — refetch whenever
  // either changes so a 🔥 on Runs doesn't bleed into the Vertical tab.
  useEffect(() => {
    if (!entries.length) return
    let cancelled = false
    // Drop the previous tab's badges up front. They're keyed by user, not by
    // stat, so leaving them up would render Runs' 🔥 against Vertical's
    // rows for the length of the fetch.
    setReactionsByUser({})
    getLeaderboardReactions(entries.map((e) => e.id), category, String(season.startYear))
      .then((rows) => {
        if (cancelled) return
        const grouped = {}
        for (const r of rows) {
          grouped[r.target_user_id] = grouped[r.target_user_id] || []
          grouped[r.target_user_id].push(r)
        }
        setReactionsByUser(grouped)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [entries, category, season.startYear])

  async function handleReact(targetUserId, emoji) {
    const currentUserId = me?.id
    setReactionsByUser((prev) => {
      const existing = prev[targetUserId] || []
      const mine = existing.find((r) => r.user_id === currentUserId)
      const withoutMine = existing.filter((r) => r.user_id !== currentUserId)
      const next = mine?.emoji === emoji ? withoutMine : [...withoutMine, { user_id: currentUserId, emoji }]
      return { ...prev, [targetUserId]: next }
    })
    try {
      await addLeaderboardReaction(targetUserId, category, emoji, String(season.startYear))
    } catch {
      // rollback by refetching this one user's reactions
      const rows = await getLeaderboardReactions([targetUserId], category, String(season.startYear)).catch(() => [])
      setReactionsByUser((prev) => ({ ...prev, [targetUserId]: rows }))
    }
  }

  async function handleDeleteSession(id) {
    await deleteSkiDay(id)
    load()
  }

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 999, padding: "4px 11px", fontSize: 11, fontWeight: 700, color: "var(--color-warning)", marginBottom: 8 }}>
            🏆 {season.label} Season
          </div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: -0.5, color: "white" }}>Leaderboard</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
            {boardMode === "friends" ? "You + your friends, ranked" : "All PowderDays skiers"}
          </p>
        </div>
        <button onClick={() => setShowLog(true)} style={{ background: "var(--gradient-cta)", color: "white", border: "none", borderRadius: 12, padding: "10px 16px", fontSize: 13, fontWeight: 900, cursor: "pointer", boxShadow: "0 6px 20px rgba(37,99,235,0.4)", whiteSpace: "nowrap" }}>
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
                {/* resort_name is a normalised key as of migration 039 ('vail'), so it has to
                    go through resortName(). Trip-derived rows were already keys and had been
                    rendering as "arapahoebasin" here long before that. */}
                <div style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{resortName(s.resort_name)}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                  {new Date(s.session_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {s.is_powder_day && " · ❄️ Powder"}
                </div>
              </div>
              <button onClick={() => handleDeleteSession(s.id)} style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)", color: "var(--color-danger)", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {/* Category tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, overflowX: "auto", paddingBottom: 2 }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            style={{
              background: category === cat.key ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
              border: category === cat.key ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.07)",
              color: category === cat.key ? "white" : "rgba(255,255,255,0.55)",
              borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700,
              cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              position: "relative",
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

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
          <button onClick={() => setShowLog(true)} style={{ background: "var(--gradient-cta)", color: "white", border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>
            Log Your First Day
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {entries.map((entry, i) => (
            <LeaderboardRow
              key={entry.id}
              entry={entry}
              rank={i + 1}
              category={category}
              reactions={reactionsByUser[entry.id] || []}
              onReact={(emoji) => handleReact(entry.id, emoji)}
              currentUserId={me?.id}
            />
          ))}
        </div>
      )}

      {showLog && <LogDayModal onClose={() => setShowLog(false)} onLogged={load} />}
    </div>
  )
}
