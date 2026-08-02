import { useState } from "react"

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSessionDate(dateStr) {
  if (!dateStr) return ""
  const d = new Date(`${dateStr}T12:00:00`)
  if (isNaN(d)) return dateStr
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function formatMinutes(min) {
  if (min == null) return "—"
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function buildShareText(session) {
  const parts = [`Just skied ${session.resort_name || "the mountain"}!`]
  if (session.runs_logged != null) parts.push(`${session.runs_logged} runs,`)
  if (session.top_speed_mph != null) parts.push(`${session.top_speed_mph} mph top speed,`)
  if (session.time_on_mountain_min != null) parts.push(`${formatMinutes(session.time_on_mountain_min)} on mountain`)
  return `${parts.join(" ")} 🎿❄️ #PowderDays`
}

function StatTile({ value, label }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 16,
        padding: "12px 8px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>{value}</div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 3 }}>
        {label}
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function SessionRecapModal({ session, runs, onClose, stravaConnected, onPostToStrava }) {
  const [breakdownOpen, setBreakdownOpen] = useState(false)
  const [shareStatus, setShareStatus] = useState(null) // null | "copied" | "shared"

  if (!session) return null

  const runRows = (runs || []).filter((r) => r.run_type === "run")

  async function handleShare() {
    const text = buildShareText(session)
    if (navigator.share) {
      try {
        await navigator.share({ text })
        setShareStatus("shared")
      } catch {
        // User cancelled the native share sheet — not an error, no-op.
      }
      return
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        setShareStatus("copied")
        setTimeout(() => setShareStatus(null), 2500)
        return
      } catch {
        // Clipboard write failed — fall through to the last-resort alert below.
      }
    }
    // No Web Share API, no clipboard access — last resort so the text is still visible.
    window.alert(text)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "rgba(4,8,15,0.85)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px 16px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 500,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#08111e",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 24,
          boxShadow: "0 40px 120px rgba(0,0,0,0.85)",
          padding: 22,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>🎿 Day Complete</div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "50%",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: 18,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginBottom: 20 }}>
          {session.resort_name} · {formatSessionDate(session.session_date)}
        </div>

        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
          <StatTile value={session.runs_logged ?? 0} label="Runs" />
          <StatTile value={session.lifts_ridden ?? 0} label="Lifts" />
          <StatTile value={session.top_speed_mph != null ? `${session.top_speed_mph}` : "—"} label="Top mph" />
          <StatTile value={formatMinutes(session.time_on_mountain_min)} label="Time" />
        </div>

        {/* Run breakdown */}
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => setBreakdownOpen((v) => !v)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: "10px 14px",
              color: "white",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <span>Run Breakdown</span>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>{breakdownOpen ? "▴" : "▾"}</span>
          </button>

          {breakdownOpen && (
            <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
              {runRows.length === 0 ? (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", padding: "8px 4px" }}>
                  No individual runs recorded.
                </div>
              ) : runRows.map((r, i) => (
                <div
                  key={r.id ?? i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    color: "rgba(255,255,255,0.75)",
                    padding: "6px 10px",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: 8,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>Run {r.run_number ?? i + 1}</span>
                  <span>
                    {r.vertical_ft != null ? `${Math.round(r.vertical_ft).toLocaleString()}ft` : "—"} ·{" "}
                    {r.distance_mi != null ? `${r.distance_mi}mi` : "—"} ·{" "}
                    {r.speed_max_mph != null ? `${r.speed_max_mph} mph` : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={handleShare}
            style={{
              flex: 1,
              minWidth: 100,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 14,
              padding: "12px 14px",
              color: "white",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {shareStatus === "copied" ? "Copied ✓" : "📤 Share"}
          </button>

          {stravaConnected && (
            <button
              onClick={onPostToStrava}
              style={{
                flex: 1,
                minWidth: 100,
                background: "linear-gradient(135deg, #fc4c02, #e34402)",
                border: "none",
                borderRadius: 14,
                padding: "12px 14px",
                color: "white",
                fontWeight: 800,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Post to Strava
            </button>
          )}

          <button
            onClick={onClose}
            style={{
              flex: 1,
              minWidth: 100,
              background: "linear-gradient(135deg, #0284c7, #38bdf8)",
              border: "none",
              borderRadius: 14,
              padding: "12px 14px",
              color: "white",
              fontWeight: 900,
              fontSize: 13,
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(56,189,248,0.3)",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
