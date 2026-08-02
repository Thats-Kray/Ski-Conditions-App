import { useState } from "react"
import { resortName, resortEmoji } from "../lib/resorts"

function dateKey(d) {
  return d.toISOString().slice(0, 10)
}

function buildWeeks(start, end) {
  const weeks = []
  let cur = new Date(start)
  cur.setDate(cur.getDate() - cur.getDay()) // back up to the preceding Sunday
  while (cur <= end) {
    const week = []
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

export default function SeasonCalendar({ sessions, startYear }) {
  const [selectedDate, setSelectedDate] = useState(null)

  const seasonStart = new Date(startYear, 9, 1)   // Oct 1
  const seasonEnd = new Date(startYear + 1, 4, 31) // May 31
  const weeks = buildWeeks(seasonStart, seasonEnd)

  const byDate = new Map((sessions || []).map((s) => [s.session_date, s]))
  const selectedSession = selectedDate ? byDate.get(selectedDate) : undefined

  return (
    <div>
      <div style={{ display: "flex", gap: 3, overflowX: "auto", padding: "4px 2px" }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {week.map((day, di) => {
              const key = dateKey(day)
              const inSeason = day >= seasonStart && day <= seasonEnd
              const session = byDate.get(key)
              const bg = !inSeason
                ? "transparent"
                : session?.is_powder_day
                  ? "#2dd4bf"
                  : session
                    ? "var(--color-accent)"
                    : "rgba(255,255,255,0.06)"
              return (
                <div
                  key={di}
                  onClick={() => inSeason && setSelectedDate(key)}
                  title={inSeason ? key : undefined}
                  style={{
                    width: 11, height: 11, borderRadius: 2,
                    background: bg,
                    cursor: inSeason ? "pointer" : "default",
                    boxShadow: selectedDate === key ? "0 0 0 2px var(--color-accent)" : "none",
                  }}
                />
              )
            })}
          </div>
        ))}
      </div>

      {selectedDate && (
        <div style={{ marginTop: 12, padding: 14, borderRadius: "var(--radius-card)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {selectedSession ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 15 }}>
                {resortEmoji(selectedSession.resort_name)} {resortName(selectedSession.resort_name)} — {selectedDate}
                {selectedSession.is_powder_day && <span style={{ marginLeft: 8 }}>❄️ Powder Day</span>}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 13, color: "var(--color-text-2)" }}>
                <span>Vertical: {selectedSession.vertical_feet ?? "—"} ft</span>
                <span>Runs: {selectedSession.runs_logged ?? "—"}</span>
                <span>Top speed: {selectedSession.top_speed_mph != null ? `${selectedSession.top_speed_mph} mph` : "—"}</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--color-text-3)" }}>No session logged on {selectedDate}.</div>
          )}
        </div>
      )}
    </div>
  )
}
