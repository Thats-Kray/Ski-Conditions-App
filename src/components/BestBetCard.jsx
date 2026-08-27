import Badge, { TIER_COLORS, RISK_COLORS } from "./ui/Badge"
import FriendsGoingBadge from "./FriendsGoingBadge"
import { mapsUrl } from "../lib/resorts"
import { planButtonState } from "../lib/planUpsert"

/**
 * The Today List View's single hero card — "Best Bet Today". Replaces the old
 * 👑 crown card plus the separate Best-Epic/Best-Ikon boxes (ROADMAP TASK 22.0,
 * Decision 5): that per-pass callout is dropped, the pass badge on this card and on
 * every list row below it is what's left of it.
 */
export default function BestBetCard({ topResort, friendsGoing, myTodayPlan, onSkiHereToday }) {
  if (!topResort) return null

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 24,
        padding: 22,
        display: "grid",
        gap: 14,
        boxShadow: "0 18px 50px rgba(0,0,0,0.3)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
            Best Bet Today
          </div>
          <div style={{ marginTop: 4, fontSize: 26, fontWeight: 900, lineHeight: 1.1 }}>
            {topResort.name}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge label={topResort.pass} color="var(--rating-slate)" />
            <Badge label={topResort.powderTier ?? "Closed"} color={TIER_COLORS[topResort.powderTier] ?? TIER_COLORS.Closed} />
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, color: TIER_COLORS[topResort.powderTier] ?? TIER_COLORS.Closed }}>
            {topResort.powderScore}
          </div>
          <div style={{ marginTop: 2, fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
            Powder Score
          </div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
        {topResort.snowPrev24in != null ? `${topResort.snowPrev24in}" overnight` : "—"}
        {" · "}
        {topResort.wind || "—"}
        {" · "}
        Drive risk <span style={{ color: RISK_COLORS[topResort.driveRisk] ?? RISK_COLORS.Severe, fontWeight: 800 }}>{topResort.driveRisk || "Unknown"}</span>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <FriendsGoingBadge friends={friendsGoing} variant="solid" />
        <a
          href={mapsUrl(topResort.directionsQuery)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            textDecoration: "none", color: "white", fontWeight: 800, fontSize: 14,
            padding: "12px 20px", borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.06)",
          }}
        >
          Directions
        </a>
        {(() => {
          const { label, mode } = planButtonState(myTodayPlan, topResort.resortKey)
          const isConfirmed = mode === "edit"
          return (
            <button
              onClick={() => onSkiHereToday(topResort.resortKey)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                border: isConfirmed ? "1px solid rgba(34,197,94,0.4)" : "none",
                color: isConfirmed ? "var(--color-success)" : "var(--color-pass-pill-text)",
                fontWeight: 800, fontSize: 14, padding: "12px 20px", borderRadius: 999,
                background: isConfirmed ? "rgba(10,30,10,0.5)" : "var(--gradient-primary)",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          )
        })()}
      </div>
    </div>
  )
}
