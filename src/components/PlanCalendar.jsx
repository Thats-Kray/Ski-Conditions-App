import { useState } from "react"
import { dateKeyOf, localDateKey } from "../lib/calendarDates"

/**
 * Generic month-grid calendar. Knows nothing about trips, plans, or profiles —
 * the caller supplies a Map of date-key → entries and decides how to color dots
 * and render the selected-day panel.
 *
 * Date key helpers live in lib/calendarDates.js — see the note there about why
 * they are not exported from this file.
 */
export default function PlanCalendar({
  entriesByDate,
  dotColorFor,
  legend = [],
  onSelectDay,
  renderDayDetail,
  renderCellContent,
  selectedDate = null,
  initialMonth,
  onMonthChange,
}) {
  const today = new Date()
  const [viewDate, setViewDate] = useState(
    () => initialMonth || new Date(today.getFullYear(), today.getMonth(), 1)
  )

  const yr = viewDate.getFullYear()
  const mo = viewDate.getMonth()
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })
  const todayKey = localDateKey(today)

  const firstDow = new Date(yr, mo, 1).getDay()
  const daysInMonth = new Date(yr, mo + 1, 0).getDate()

  function goToMonth(next) {
    setViewDate(next)
    onMonthChange?.(next)
  }

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const selectedEntries = selectedDate ? (entriesByDate.get(selectedDate) || []) : []

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button
          onClick={() => goToMonth(new Date(yr, mo - 1, 1))}
          aria-label="Previous month"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "6px 12px", color: "white", cursor: "pointer", fontWeight: 700 }}
        >
          ‹
        </button>
        <div style={{ fontWeight: 900, fontSize: 16, color: "white" }}>{monthLabel}</div>
        <button
          onClick={() => goToMonth(new Date(yr, mo + 1, 1))}
          aria-label="Next month"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "6px 12px", color: "white", cursor: "pointer", fontWeight: 700 }}
        >
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", padding: "4px 0" }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />
          const key = dateKeyOf(yr, mo, day)
          const dayEntries = entriesByDate.get(key) || []
          const isToday = key === todayKey
          const isSelected = selectedDate === key
          const dow = new Date(yr, mo, day).getDay()
          const isWeekend = dow === 0 || dow === 6
          const has = dayEntries.length > 0

          // Dedupe dots by color so three plans at one resort render one dot.
          const dotColors = [...new Set(dayEntries.map(dotColorFor))].slice(0, 3)

          return (
            <button
              key={key}
              onClick={() => onSelectDay?.(isSelected ? null : key)}
              style={{
                padding: "6px 4px 8px",
                borderRadius: 10,
                border: isSelected
                  ? "1.5px solid var(--color-accent-soft)"
                  : isToday
                  ? "1.5px solid rgba(255,255,255,0.25)"
                  : "1.5px solid transparent",
                background: isSelected
                  ? "rgba(96,165,250,0.15)"
                  : has && isWeekend
                  ? "rgba(255,255,255,0.07)"
                  : has
                  ? "rgba(255,255,255,0.04)"
                  : "transparent",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                minHeight: renderCellContent ? 78 : 46,
              }}
            >
              <span style={{
                fontSize: 13,
                fontWeight: isToday ? 900 : isWeekend ? 700 : 400,
                color: isToday ? "white" : isWeekend ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)",
                background: isToday ? "var(--color-accent-soft)" : "transparent",
                borderRadius: "50%",
                width: 24, height: 24,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {day}
              </span>
              {renderCellContent
                ? renderCellContent(key, dayEntries)
                : dotColors.length > 0 && (
                    <div style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
                      {dotColors.map((color) => (
                        <div key={color} style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                      ))}
                    </div>
                  )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      {legend.length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14, padding: "10px 0 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {legend.map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              {label}
            </div>
          ))}
        </div>
      )}

      {/* Selected day panel — caller-rendered */}
      {selectedDate && renderDayDetail && (
        <div style={{ marginTop: 16 }}>
          {renderDayDetail(selectedDate, selectedEntries)}
        </div>
      )}
    </div>
  )
}
