import { useEffect, useState } from "react"
import { computeSegmentStats } from "../lib/useGpsTracker"

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatElapsed(ms) {
  if (ms == null || ms < 0) ms = 0
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function gpsDotColor(status, gpsAccuracy) {
  if (status === "requesting" || status === "paused") return "#94a3b8" // gray
  if (status === "error" || (gpsAccuracy != null && gpsAccuracy > 50)) return "#ef4444" // red
  if (gpsAccuracy != null && gpsAccuracy >= 20) return "#f59e0b" // orange
  if (gpsAccuracy != null && gpsAccuracy < 20) return "#22c55e" // green
  return "#94a3b8" // fallback gray (accuracy unknown yet)
}

function isGpsPulsing(status, gpsAccuracy) {
  return status === "error" || (gpsAccuracy != null && gpsAccuracy > 50)
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ActiveSessionBar({ activeSession, tracker, onSessionEnd }) {
  const [now, setNow] = useState(Date.now())
  const [sheetOpen, setSheetOpen] = useState(false)

  // Tick every second for the elapsed-time display
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(t)
  }, [])

  if (!activeSession) return null

  const elapsedMs = now - activeSession.startedAt
  const dotColor = gpsDotColor(tracker.status, tracker.gpsAccuracy)
  const pulsing = isGpsPulsing(tracker.status, tracker.gpsAccuracy)
  const isPaused = tracker.status === "paused"

  // Live running estimate of vertical descended this session (see S4-T2 spec) —
  // only closed "run" segments have full point data; the in-progress segment
  // is intentionally excluded since it hasn't been classified/closed yet.
  const estimatedVertical = (tracker.segments || [])
    .filter((s) => s.type === "run")
    .reduce((acc, seg, idx) => {
      const stats = computeSegmentStats(seg, idx + 1)
      return acc + (stats?.vertical_ft ?? 0)
    }, 0)

  function handleEnd(e) {
    e?.stopPropagation()
    const finalSegments = tracker.stopTracking()
    setSheetOpen(false)
    onSessionEnd(finalSegments)
  }

  function handlePauseResume(e) {
    e.stopPropagation()
    if (isPaused) {
      tracker.resumeTracking()
    } else {
      tracker.pauseTracking()
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: "calc(64px + env(safe-area-inset-bottom))",
        zIndex: 150,
      }}
    >
      {/* ── Session Sheet (S4-T2) ── */}
      <div
        style={{
          maxHeight: sheetOpen ? 360 : 0,
          overflow: "hidden",
          transition: "max-height 0.28s ease",
          background: "rgba(4,8,15,0.96)",
          backdropFilter: "blur(16px)",
          borderTop: sheetOpen ? "1px solid rgba(56,189,248,0.2)" : "none",
          borderRadius: "20px 20px 0 0",
        }}
      >
        <div style={{ padding: "18px 18px 16px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "white", display: "flex", alignItems: "center", gap: 6 }}>
              ⛷ Skiing at {activeSession.resortName}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setSheetOpen(false) }}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 999,
                padding: "5px 12px",
                color: "rgba(255,255,255,0.7)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              × Close
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
            {[
              { label: "Runs", value: tracker.runCount ?? 0 },
              { label: "Lifts", value: tracker.liftCount ?? 0 },
              { label: "Vertical", value: `~${Math.round(estimatedVertical).toLocaleString()}ft` },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 14,
                  padding: "10px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 900, color: "white" }}>{value}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Current segment + speed */}
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginBottom: 4 }}>
            Current: {tracker.currentSegmentType || "—"}
            {tracker.currentSpeedMph > 0 && <span> · ↓ {tracker.currentSpeedMph} mph</span>}
          </div>

          {/* GPS accuracy */}
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
            GPS:
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: dotColor,
                display: "inline-block",
                animation: pulsing ? "pd-gps-pulse 1s ease-in-out infinite" : "none",
              }}
            />
            {tracker.gpsAccuracy != null ? `${Math.round(tracker.gpsAccuracy)}m accuracy` : "acquiring…"}
          </div>

          {/* Controls */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handlePauseResume}
              style={{
                flex: 1,
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
              {isPaused ? "▶ Resume GPS" : "⏸ Pause GPS"}
            </button>
            <button
              onClick={handleEnd}
              style={{
                flex: 1,
                background: "linear-gradient(135deg, #dc2626, #ef4444)",
                border: "none",
                borderRadius: 14,
                padding: "12px 14px",
                color: "white",
                fontWeight: 900,
                fontSize: 13,
                cursor: "pointer",
                boxShadow: "0 4px 16px rgba(239,68,68,0.3)",
              }}
            >
              🔴 End My Day
            </button>
          </div>
        </div>
      </div>

      {/* ── Floating bar (S4-T1) ── */}
      <div
        onClick={() => setSheetOpen((v) => !v)}
        style={{
          background: "rgba(4,8,15,0.92)",
          backdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(56,189,248,0.25)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
            animation: pulsing ? "pd-gps-pulse 1s ease-in-out infinite" : "none",
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 800, color: "white", flexShrink: 0 }}>
          {isPaused ? "Paused" : "Active"}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.75)", flexShrink: 0 }}>
          {formatElapsed(elapsedMs)}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.75)", flexShrink: 0 }}>
          ⛷ {tracker.runCount ?? 0} runs
        </span>
        {tracker.currentSpeedMph > 0 && (
          <span style={{ fontSize: 13, fontWeight: 700, color: "#38bdf8", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {tracker.currentSpeedMph} mph
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          onClick={handleEnd}
          style={{
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.35)",
            borderRadius: 10,
            padding: "6px 12px",
            color: "#f87171",
            fontWeight: 800,
            fontSize: 12,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          End Day
        </button>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", flexShrink: 0, transition: "transform 0.2s", transform: sheetOpen ? "rotate(180deg)" : "none" }}>
          ▲
        </span>
      </div>

      <style>{`
        @keyframes pd-gps-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  )
}
