import { useId } from "react"
import { TIER_COLORS } from "./Badge"

export default function ScoreRing({ score, tier, size = 96, strokeWidth = 8, label, showTier = false }) {
  const gradientId = useId()
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100
  const offset = circumference * (1 - pct)
  const tierColor = TIER_COLORS[tier] ?? "#64748b"

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      {label && (
        <text
          x="50%"
          y={size * 0.32}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--color-text-3)"
          fontSize={size * 0.1}
          fontWeight={700}
        >
          {label}
        </text>
      )}
      <text
        x="50%"
        y={label || showTier ? "50%" : "50%"}
        dy={label ? size * 0.06 : 0}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--color-text-1)"
        fontSize={size * 0.28}
        fontWeight={900}
      >
        {score == null ? "—" : Math.round(score)}
      </text>
      {showTier && tier && (
        <text
          x="50%"
          y={size * 0.72}
          textAnchor="middle"
          dominantBaseline="central"
          fill={tierColor}
          fontSize={size * 0.11}
          fontWeight={800}
        >
          {tier}
        </text>
      )}
    </svg>
  )
}
