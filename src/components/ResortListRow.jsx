import { TIER_COLORS } from "./ui/Badge"

/**
 * One compact row in the Today List View — rank (or a text label, for the
 * "Best Bet Today" hero), score pill, name, tier·pass subtitle, and
 * 24h-snow/base numbers on the right, with an expand/collapse chevron at the
 * trailing edge. Tapping toggles the full ResortCard open beneath it
 * (TodayScreen/hero caller owns the expanded/collapsed state).
 */
export default function ResortListRow({ rank, r, label, expanded, onToggle }) {
  const tierColor = TIER_COLORS[r.powderTier] ?? TIER_COLORS.Closed

  return (
    <button
      onClick={onToggle}
      aria-expanded={expanded}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        textAlign: "left",
        background: expanded ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: expanded ? "16px 16px 0 0" : 16,
        padding: "12px 14px",
        cursor: "pointer",
        opacity: r.isOpen === false ? 0.6 : 1,
      }}
    >
      {label ? (
        <div style={{
          width: 54, fontSize: 9, fontWeight: 900, letterSpacing: 0.3, lineHeight: 1.15,
          color: "rgba(255,255,255,0.5)", textTransform: "uppercase", flexShrink: 0,
        }}>
          {label}
        </div>
      ) : (
        <div style={{ width: 18, textAlign: "center", fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>
          {rank}
        </div>
      )}

      <div style={{
        display: "grid", placeItems: "center", minWidth: 40, height: 32, padding: "0 6px",
        borderRadius: 10, border: `1px solid ${tierColor}`, color: tierColor,
        fontSize: 15, fontWeight: 900, flexShrink: 0,
      }}>
        {r.powderScore ?? "—"}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.name}
        </div>
        <div style={{ marginTop: 2, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          {r.powderTier ?? "Closed"} · {r.pass}
        </div>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>
          {r.snowPrev24in != null ? `${r.snowPrev24in}"` : "—"}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>24H SNOW</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 40 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>
          {r.baseDepth != null ? `${r.baseDepth}"` : "—"}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>BASE</div>
      </div>

      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", flexShrink: 0, marginLeft: 4 }}>
        {expanded ? "▴" : "▾"}
      </div>
    </button>
  )
}
