import { fmt } from "../../lib/format"
import { resortName } from "../../lib/resorts"
import { formatMinutes } from "../../lib/profileStats"
import SnowStat from "../ui/SnowStat"

/**
 * The Profile page's two stat strips (TASK 22.0, Profile slice).
 *
 * Both take a stats object in computeStats()' shape. The own profile builds that
 * from session rows; the friend view builds it from one getLeaderboard() row via
 * statsFromLeaderboardRow(). profileStats.test.js asserts those two shapes carry
 * the same keys, because a mismatch shows up as blanks on the friend view only.
 */

/**
 * The mockup's five-stat header strip (PowDays Reorg Mockup.dc.html:450-454).
 * Replaces BOTH the old hero Trips/Friends/Days row and SeasonStatsCard's 2x2
 * grid, which showed the same four numbers as each other.
 */
export function ProfileStatStrip({ stats }) {
  const items = [
    { label: "Days",    value: stats?.days ?? 0 },
    { label: "Vert ft", value: fmt(stats?.vertical ?? 0) },
    { label: "Miles",   value: Math.round(stats?.miles ?? 0) },
    { label: "Resorts", value: stats?.resorts ?? 0 },
    { label: "Powder",  value: stats?.powderDays ?? 0 },
  ]

  return (
    <div style={{
      display: "flex", gap: 1, overflow: "hidden",
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
    }}>
      {items.map((item) => (
        <div key={item.label} style={{
          flex: 1, textAlign: "center", padding: "12px 4px",
          background: "rgba(255,255,255,0.02)",
        }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: "white", lineHeight: 1.1 }}>
            {item.value}
          </div>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 0.4, marginTop: 2,
            textTransform: "uppercase", color: "var(--color-accent-soft)", opacity: 0.75,
          }}>
            {item.label}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The facts SeasonStatsCard carried that the header strip does NOT duplicate,
 * kept so none of that data is lost: total runs, top speed, time on mountain,
 * top resort, plus the season-over-season delta line.
 *
 * Two columns rather than the old card's three, because "Time on Mountain" wraps
 * badly at a third of a 390px screen. Tiles are ui/SnowStat, the same component
 * SeasonStatsCard used, so the styling is reused rather than re-typed.
 */
export function ProfileExtraFacts({ stats, deltaLabel = null }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: "14px 16px",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <SnowStat icon="🎿" label="Total Runs" value={stats?.totalRuns ?? 0} />
        <SnowStat
          icon="⚡"
          label="Top Speed"
          value={stats?.topSpeed ?? "—"}
          unit={stats?.topSpeed != null ? "mph" : undefined}
        />
        <SnowStat icon="⏱️" label="Time on Mountain" value={formatMinutes(stats?.timeOnMountain)} />
        <SnowStat icon="🏆" label="Top Resort" value={stats?.topResort ? resortName(stats.topResort) : "—"} />
      </div>

      {deltaLabel && (
        <div style={{
          marginTop: 12, paddingTop: 10,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          fontSize: 13, color: "var(--color-text-2)",
        }}>
          {deltaLabel}
        </div>
      )}
    </div>
  )
}
