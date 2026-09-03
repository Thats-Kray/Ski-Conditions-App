import { useState, useEffect } from "react"
import { updateSessionStats } from "../lib/leaderboardApi"
import { saveSkiDayDetails, getSessionPhotos, getSessionTags } from "../lib/socialApi"
import { formatMinutes } from "../lib/profileStats"
import { resortName, resortEmoji } from "../lib/resorts"
import { fmt } from "../lib/format"
import SnowStat from "./ui/SnowStat"
import SessionEditForm from "./SessionEditForm"
import ShareStatCard from "./ShareStatCard"

/**
 * Presentational season-stat components, lifted out of ProfilePage.jsx (Sprint
 * 34) so the read-only friend-profile view can render the same cards. Moving
 * them also keeps ProfilePage under control — it was ~1040 lines before adding
 * a second mode.
 *
 * Bodies are unchanged from the originals.
 */

// ── Season Stats Card ─────────────────────────────────────────────────────────

export function SeasonStatsCard({ stats, priorStats, season, viewMode = "season" }) {
  const statItems = [
    { label: "Days on Mountain", value: stats.days,                  emoji: "⛷️" },
    { label: "Vertical Feet",    value: fmt(stats.vertical) + " ft", emoji: "📏" },
    { label: "Resorts",          value: stats.resorts,               emoji: "🏔️" },
    { label: "Powder Days",      value: stats.powderDays,            emoji: "❄️" },
  ]

  return (
    <div style={{
      background: "linear-gradient(135deg,rgba(15,118,110,0.35),rgba(37,99,235,0.28))",
      border: "1px solid rgba(96,165,250,0.2)",
      borderRadius: 20,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "14px 18px 10px" }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 0.9 }}>
          {viewMode === "allTime" ? "All-Time" : `${season.label} Season`}
        </div>
      </div>

      {/* 2×2 stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 14px 14px" }}>
        {statItems.map(item => (
          <div key={item.label} style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: "16px 16px 14px",
          }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: "white", lineHeight: 1, letterSpacing: -1 }}>
              {item.value}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", marginTop: 5, textTransform: "uppercase", letterSpacing: 0.6 }}>
              {item.emoji} {item.label}
            </div>
          </div>
        ))}
      </div>

      {/* New stat tiles — Total Runs / Top Speed / Time on Mountain */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: "12px 14px 0" }}>
        <SnowStat icon="🎿" label="Total Runs" value={stats.totalRuns} />
        <SnowStat icon="⚡" label="Top Speed" value={stats.topSpeed ?? "—"} unit={stats.topSpeed != null ? "mph" : undefined} />
        <SnowStat icon="⏱️" label="Time on Mountain" value={formatMinutes(stats.timeOnMountain)} />
      </div>

      {/* Season-over-season delta row */}
      {priorStats && (
        <div style={{ fontSize: 13, color: "var(--color-text-2)", marginTop: 8, padding: "0 14px" }}>
          {stats.days === priorStats.days
            ? "Same days on mountain as last season"
            : stats.days > priorStats.days
              ? `↑ ${stats.days - priorStats.days} more day${stats.days - priorStats.days === 1 ? "" : "s"} than last season`
              : `↓ ${priorStats.days - stats.days} fewer day${priorStats.days - stats.days === 1 ? "" : "s"} than last season`}
        </div>
      )}

      {/* Bottom: top resort + miles */}
      {(stats.topResort || stats.miles > 0) && (
        <div style={{ display: "flex", gap: 8, padding: "12px 14px" }}>
          {stats.topResort && (
            <div style={{ flex: 1, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15 }}>🏆</span>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.5 }}>Top Resort</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "white", marginTop: 1 }}>{resortName(stats.topResort)}</div>
              </div>
            </div>
          )}
          {stats.miles > 0 && (
            <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15 }}>🛷</span>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.5 }}>Miles Skied</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "white", marginTop: 1 }}>{stats.miles} mi</div>
              </div>
            </div>
          )}
        </div>
      )}

      {stats.days === 0 && (
        <div style={{ textAlign: "center", padding: "20px", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
          No days logged yet — get out there! ⛷️
        </div>
      )}
    </div>
  )
}

export function StatsViewToggle({ viewMode, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {["season", "allTime"].map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          style={{
            padding: "6px 14px", borderRadius: "var(--radius-pill)", border: "none", cursor: "pointer",
            background: viewMode === mode ? "var(--color-accent)" : "rgba(255,255,255,0.06)",
            color: viewMode === mode ? "var(--color-bg)" : "var(--color-text-2)",
            fontWeight: 700, fontSize: 13,
          }}
        >
          {mode === "season" ? "This Season" : "All-Time"}
        </button>
      ))}
    </div>
  )
}

export function HistoryViewToggle({ viewMode, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {["list", "calendar"].map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          style={{
            padding: "6px 14px", borderRadius: "var(--radius-pill)", border: "none", cursor: "pointer",
            background: viewMode === mode ? "var(--color-accent)" : "rgba(255,255,255,0.06)",
            color: viewMode === mode ? "var(--color-bg)" : "var(--color-text-2)",
            fontWeight: 700, fontSize: 13,
          }}
        >
          {mode === "list" ? "List" : "Calendar"}
        </button>
      ))}
    </div>
  )
}

// ── Recent Sessions Feed ──────────────────────────────────────────────────────

export function RecentSessionsFeed({ sessions, limit = 5, onRefresh, profile, fullName }) {
  const [editingSessionId, setEditingSessionId] = useState(null)
  const [savingStatsFor, setSavingStatsFor]       = useState(null)
  const [editError, setEditError]                 = useState("")
  const [shareSession, setShareSession]           = useState(null)

  // { photos, tags } for the session currently being edited, or null while loading.
  // Declared here, above the `if (!sessions.length)` early return on line 163 — a hook
  // below it would change the hook count between the empty and non-empty renders.
  const [sessionDetails, setSessionDetails] = useState(null)

  // If the photo/tag fetch fails, block editing to prevent silent tag deletion. A failed
  // fetch would seed the form with empty arrays, making the picker think there are no tags
  // when tags might exist — leading to reconcile deleting them on a "Save Details" click.
  const [detailsLoadFailed, setDetailsLoadFailed] = useState(false)

  useEffect(() => {
    if (!editingSessionId) {
      // Cleared on close so reopening a DIFFERENT session can never show the previous
      // one's photos, and can never seed SkiDayDetailsForm with another day's tags.
      setSessionDetails(null)
      setDetailsLoadFailed(false)
      return
    }
    let cancelled = false
    let photosErr = false
    let tagsErr = false

    Promise.all([
      getSessionPhotos([editingSessionId]).catch((e) => {
        console.warn("RecentSessionsFeed: getSessionPhotos failed", e)
        photosErr = true
        return []
      }),
      getSessionTags([editingSessionId]).catch((e) => {
        console.warn("RecentSessionsFeed: getSessionTags failed", e)
        tagsErr = true
        return []
      }),
    ]).then(([photos, tags]) => {
      if (!cancelled) {
        // If either fetch failed, block editing. A failed fetch would look like "no photos/tags"
        // but they might actually exist — reconciling against empty arrays would silently delete
        // existing tags (the exact silent tag-wipe this guard prevents).
        if (photosErr || tagsErr) {
          setDetailsLoadFailed(true)
          setSessionDetails(null)
        } else {
          setDetailsLoadFailed(false)
          setSessionDetails({ photos, tags })
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [editingSessionId])

  if (!sessions.length) {
    return (
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "18px 16px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
        No sessions logged yet — check in from the Home tab
      </div>
    )
  }

  const editingSession = sessions.find((s) => s.id === editingSessionId)
  const shown = Number.isFinite(limit) ? sessions.slice(0, limit) : sessions

  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px 10px", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8 }}>
        {Number.isFinite(limit) ? "Recent Sessions" : "Session History"}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {shown.map((s, i) => {
          const date = new Date(s.session_date + "T12:00:00")
          const dateLabel = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
          const emoji = resortEmoji(s.resort_key || s.resort_name)
          const canEdit = typeof s.id === "string" && !s.id.startsWith("trip-")
          return (
            <div key={s.id || i} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 16px",
              borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {resortName(s.resort_name || s.resort_key)}
                  {s.is_powder_day && <span style={{ marginLeft: 6, fontSize: 12 }}>❄️</span>}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{dateLabel}</div>
              </div>
              {s.vertical_feet > 0 && (
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-accent-soft)", flexShrink: 0 }}>+{fmt(s.vertical_feet)} ft</div>
              )}
              {canEdit && (
                <button
                  onClick={() => { setEditError(""); setEditingSessionId(s.id) }}
                  title="Edit session"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, width: 28, height: 28, flexShrink: 0, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}
                >✏️</button>
              )}
              <button
                onClick={() => setShareSession(s)}
                title="Share this session"
                aria-label="Share this session"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, width: 28, height: 28, flexShrink: 0, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}
              >📤</button>
            </div>
          )
        })}
      </div>

      {editingSession && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => { setEditError(""); setEditingSessionId(null) }}
        >
          <div
            /* maxHeight + overflowY are load-bearing, not polish. This sheet is a child of
               a `position: fixed; inset: 0` flex container with `alignItems: flex-end`, so
               a sheet taller than the viewport overflows the TOP of the screen — and a
               fixed container with no overflow gives the user no way to scroll to it. That
               content is simply unreachable.

               Feed slice C1 grew this one form by ~440-510px (a new Title field plus
               SkiDayDetailsForm's photo strip, friend picker and Save Details button) on
               top of an already ~700px form. At 375x667 that put Title, Notes and the
               Mountain picker — including the Title field this whole slice exists to add —
               off the top of the screen with no way back. Capping the sheet at 90vh and
               making it its own scroll container is SessionRecapModal.jsx:201-202's exact
               shape, one modal over. */
            style={{ background: "var(--color-modal-bg)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "20px 20px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: "white" }}>✏️ Edit Session</div>
              <button
                onClick={() => { setEditError(""); setEditingSessionId(null) }}
                style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.6)", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}
              >✕</button>
            </div>
            <SessionEditForm
              session={editingSession}
              details={sessionDetails}
              detailsLoadFailed={detailsLoadFailed}
              saving={savingStatsFor === editingSession.id}
              error={editError}
              onError={setEditError}
              onSave={async (fields, detailsDiff) => {
                setSavingStatsFor(editingSession.id)
                setEditError("")
                try {
                  await updateSessionStats(editingSession.id, fields)
                  // Guard layer 1: only reached when SkiDayDetailsForm's own Save fired.
                  // The plain Save button passes no second argument, so a stats-only edit
                  // never runs a reconcile and cannot delete an existing tag or photo.
                  if (detailsDiff) {
                    await saveSkiDayDetails(editingSession.id, detailsDiff)
                  }
                  await onRefresh?.()
                  // Only close on success — a failure here is a real, expected
                  // outcome (renaming onto a date+mountain the user already
                  // has), so keep the modal open with the reason showing.
                  setEditingSessionId(null)
                } catch (e) {
                  setEditError(e.message || "Could not save this session.")
                } finally {
                  setSavingStatsFor(null)
                }
              }}
            />
          </div>
        </div>
      )}

      {shareSession && (
        <ShareStatCard
          profile={{ ...profile, full_name: fullName }}
          session={shareSession}
          onClose={() => setShareSession(null)}
        />
      )}
    </div>
  )
}
