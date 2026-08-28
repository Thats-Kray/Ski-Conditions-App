export const TIER_COLORS = {
  "Elite": "var(--rating-mint)",
  "Very Good": "var(--rating-sky)",
  "Good": "var(--rating-gold)",
  "Okay": "var(--rating-peach)",
  "Poor": "var(--rating-coral)",
  "Closed": "var(--rating-slate)",
}

export const TIER_BORDER_COLORS = {
  "Elite": "var(--rating-mint-border)",
  "Very Good": "var(--rating-sky-border)",
  "Good": "var(--rating-gold-border)",
  "Okay": "var(--rating-peach-border)",
  "Poor": "var(--rating-coral-border)",
  "Closed": "var(--rating-slate-border)",
}

export const RISK_COLORS = {
  "Low": "var(--rating-mint)",
  "Moderate": "var(--rating-gold)",
  "High": "var(--rating-peach)",
  "Severe": "var(--rating-coral)",
}

// Maps each rating token to its pre-computed border-alpha variant, since a
// CSS var() string can't have a hex-alpha suffix appended at use time.
const BORDER_COLORS = {
  "var(--rating-mint)": "var(--rating-mint-border)",
  "var(--rating-sky)": "var(--rating-sky-border)",
  "var(--rating-gold)": "var(--rating-gold-border)",
  "var(--rating-peach)": "var(--rating-peach-border)",
  "var(--rating-coral)": "var(--rating-coral-border)",
  "var(--rating-slate)": "var(--rating-slate-border)",
}

export default function Badge({ label, color, size = "md" }) {
  const pad = size === "sm" ? "4px 8px" : "5px 10px"
  const fontSize = size === "sm" ? 11 : 12
  const borderColor = BORDER_COLORS[color] ?? "rgba(255,255,255,0.2)"
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
        border: `1px solid ${borderColor}`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  )
}
