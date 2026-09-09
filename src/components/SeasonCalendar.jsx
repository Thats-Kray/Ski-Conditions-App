import { useMemo, useState } from "react"
import { resortName, resortEmoji } from "../lib/resorts"
import { formatDateFull } from "../lib/format"
import { SEASON_GRID_COLUMNS, seasonDayKeys, sessionTier } from "../lib/seasonGrid"

/**
 * The Profile page's Season grid: one cell per day of the Oct-May season,
 * coloured by how big that day was, with powder days pinned to the top tier.
 *
 * Restyled in TASK 22.0's Profile slice from a horizontal-scroll-by-week strip
 * (GitHub-contributions layout) to the mockup's fixed 18-column grid. Columns no
 * longer mean weekdays — cells are simply chronological, 18 to a row — which is
 * what the mockup shows and what makes the whole season fit on screen without
 * horizontal scrolling.
 *
 * Cells are deliberately ~14px, under the repo's 44px tap floor (Deviation 3 in
 * the plan): a heat-map cell IS its data, and every day is also reachable from
 * the History list below the grid.
 */

// Index = the tier sessionTier() returns. Defined in index.css beside the
// --rating-* scale; see the Track E comment there for why they are theme-invariant.
const TIER_COLORS = [
  "var(--season-grid-tier-0)",
  "var(--season-grid-tier-1)",
  "var(--season-grid-tier-2)",
  "var(--season-grid-tier-3)",
  "var(--season-grid-tier-4)",
]

export default function SeasonCalendar({ sessions, startYear }) {
  const [selectedDate, setSelectedDate] = useState(null)

  // 243 keys per season, recomputed only when the season changes.
  const dayKeys = useMemo(() => seasonDayKeys(startYear), [startYear])

  const byDate = useMemo(
    () => new Map((sessions || []).map((s) => [s.session_date, s])),
    [sessions],
  )

  const selectedSession = selectedDate ? byDate.get(selectedDate) : undefined

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
      padding: 14,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${SEASON_GRID_COLUMNS}, 1fr)`, gap: 4 }}>
        {dayKeys.map((key) => {
          const session = byDate.get(key)
          const selected = selectedDate === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedDate(selected ? null : key)}
              title={key}
              aria-label={session ? `${key} — session logged` : `${key} — no session`}
              aria-pressed={selected}
              style={{
                width: "100%", aspectRatio: "1", padding: 0,
                border: "none", borderRadius: 3,
                background: TIER_COLORS[sessionTier(session)],
                cursor: "pointer",
                boxShadow: selected ? "0 0 0 2px var(--color-accent)" : "none",
              }}
            />
          )
        })}
      </div>

      {/* Less-to-More legend, matching the mockup */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6,
        marginTop: 12, fontSize: 10, color: "var(--color-accent-soft)", opacity: 0.7,
      }}>
        Less
        {TIER_COLORS.map((color, i) => (
          <span key={i} style={{ width: 11, height: 11, borderRadius: 3, background: color }} />
        ))}
        More
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: "var(--color-text-3)", textAlign: "right" }}>
        Brightest tier = powder day
      </div>

      {selectedDate && (
        <div style={{
          marginTop: 12, padding: 14, borderRadius: "var(--radius-card)",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
        }}>
          {selectedSession ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 15, color: "var(--color-text-1)" }}>
                {resortEmoji(selectedSession.resort_key || selectedSession.resort_name)}{" "}
                {resortName(selectedSession.resort_name || selectedSession.resort_key)} — {formatDateFull(selectedDate)}
                {selectedSession.is_powder_day && <span style={{ marginLeft: 8 }}>❄️ Powder Day</span>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 8, fontSize: 13, color: "var(--color-text-2)" }}>
                <span>Vertical: {selectedSession.vertical_feet ?? "—"} ft</span>
                <span>Runs: {selectedSession.runs_logged ?? "—"}</span>
                <span>Top speed: {selectedSession.top_speed_mph != null ? `${selectedSession.top_speed_mph} mph` : "—"}</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--color-text-3)" }}>
              No session logged on {formatDateFull(selectedDate)}.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
