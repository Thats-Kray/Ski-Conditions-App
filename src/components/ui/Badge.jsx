export const TIER_COLORS = {
  "Elite": "#8ef6d1",
  "Very Good": "#9bc6ff",
  "Good": "#ffe39a",
  "Okay": "#ffc996",
  "Poor": "#ff9d9d",
  "Closed": "#64748b",
}

export const RISK_COLORS = {
  "Low": "#8ef6d1",
  "Moderate": "#ffe39a",
  "High": "#ffc996",
  "Severe": "#ff9d9d",
}

export default function Badge({ label, color, size = "md" }) {
  const pad = size === "sm" ? "4px 8px" : "5px 10px"
  const fontSize = size === "sm" ? 11 : 12
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "var(--radius-pill)",
        padding: pad,
        fontSize,
        fontWeight: 800,
        color,
        background: "rgba(0,0,0,0.35)",
        border: `1px solid ${color}33`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  )
}
