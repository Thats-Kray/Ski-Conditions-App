import { useEffect, useState } from "react"
import { MOUNTAIN_PAGE_WIDGETS } from "../lib/mountainPageWidgets"
import { RESORT_EMOJI } from "../lib/resorts"
import Badge, { TIER_COLORS } from "./ui/Badge"
import ScoreRing from "./ui/ScoreRing"

const OWNER_EMAIL = "raykyle1104@gmail.com"
const KRAMES_BUTTE_KEY = "kramesbutte"

// Krames Butte, viewed by its owner, always sees every registered widget
// regardless of rollout state — that's what makes it "the staging ground
// for everything in progress." Every other resort (and every other
// viewer) only sees widgets that have actually been promoted.
function visibleWidgets(resortKey, currentUserEmail) {
  const isOwnerOnKramesButte = resortKey === KRAMES_BUTTE_KEY && currentUserEmail === OWNER_EMAIL
  if (isOwnerOnKramesButte) return MOUNTAIN_PAGE_WIDGETS
  return MOUNTAIN_PAGE_WIDGETS.filter(
    (w) => w.rolloutResorts === "all" || (Array.isArray(w.rolloutResorts) && w.rolloutResorts.includes(resortKey))
  )
}

export default function MountainPage({ resortKey, resort, currentUserEmail, onBack }) {
  const widgets = visibleWidgets(resortKey, currentUserEmail)
  const [activeWidgetKey, setActiveWidgetKey] = useState(widgets[0]?.key)

  useEffect(() => {
    setActiveWidgetKey(widgets[0]?.key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resortKey])

  const emoji = resort?.emoji || RESORT_EMOJI[resortKey] || "⛷️"
  const name = resort?.name || resortKey
  const activeWidget = widgets.find((w) => w.key === activeWidgetKey) || widgets[0]

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <button
        onClick={onBack}
        style={{ justifySelf: "start", background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}
      >
        ← Back
      </button>

      <div
        style={{
          position: "relative",
          borderRadius: 24,
          overflow: "hidden",
          padding: 20,
          background: resort?.photoPath
            ? `linear-gradient(to top, rgba(4,8,15,0.88), rgba(2,6,23,0.3)), url(${resort.photoPath}) center/cover`
            : "linear-gradient(135deg, #1e293b, #334155)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              {resortKey === KRAMES_BUTTE_KEY && (
                <span style={{ fontSize: 11, fontWeight: 900, color: "#a3e635", border: "1px dashed rgba(163,230,53,0.5)", borderRadius: 999, padding: "3px 8px" }}>
                  🧪 DEV
                </span>
              )}
              {resort?.isOpen === true && (
                <span style={{ fontSize: 11, fontWeight: 900, color: "#4ade80", border: "1px solid rgba(34,197,94,0.5)", borderRadius: 999, padding: "3px 8px" }}>
                  Open
                </span>
              )}
              {resort?.isOpen === false && (
                <span style={{ fontSize: 11, fontWeight: 900, color: "#f87171", border: "1px solid rgba(239,68,68,0.5)", borderRadius: 999, padding: "3px 8px" }}>
                  Closed for Season
                </span>
              )}
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "white" }}>{emoji} {name}</h1>
          </div>
          {resort?.powderScore != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <ScoreRing score={resort.powderScore} tier={resort.powderTier ?? "Closed"} size={64} strokeWidth={6} />
              <Badge label={resort.powderTier || "—"} color={TIER_COLORS[resort.powderTier] ?? TIER_COLORS.Closed} />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {widgets.map((w) => (
          <button
            key={w.key}
            onClick={() => setActiveWidgetKey(w.key)}
            style={{
              flexShrink: 0, padding: "10px 16px", borderRadius: "12px 12px 0 0", fontSize: 13, fontWeight: 800,
              border: "none", borderBottom: activeWidgetKey === w.key ? "2px solid #38bdf8" : "2px solid transparent",
              cursor: "pointer",
              background: activeWidgetKey === w.key ? "rgba(56,189,248,0.1)" : "transparent",
              color: activeWidgetKey === w.key ? "#38bdf8" : "rgba(255,255,255,0.6)",
            }}
          >
            {w.label}
          </button>
        ))}
      </div>

      {activeWidget && <activeWidget.Component resortKey={resortKey} currentUserEmail={currentUserEmail} />}
    </div>
  )
}
