import { useState } from "react"
import { weekDayKeys } from "../../lib/calendarDates"
import { useMobile } from "../../lib/useMobile"
import DayPlanCard from "./DayPlanCard"

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

function dayNumber(dateKey) {
  return Number(dateKey.slice(8, 10))
}

/**
 * The week the mockup asked for, minus the hour grid.
 *
 * The mockup is a Google Calendar screenshot whose annotated blocks sit at ~9:30,
 * ~9:00 and ~10:30 — arbitrary positions. daily_plans has an optional `eta` and
 * nothing else, and most rows have none, so a time axis would carry no information
 * while spending ~90% of the viewport on empty rows.
 */
export default function WeekView({
  anchorDate, groupsByDay, colorCtx, currentUserId, todayKey,
  joiningKey, onJoin, onOpenTrip, myPlanByDate, onEditPlan,
  onAskToJoin, askingPartyId, askedPartyIds,
}) {
  const isMobile = useMobile()
  const [showPast, setShowPast] = useState(false)
  const keys = weekDayKeys(anchorDate)

  const days = keys.map((key, i) => ({
    key,
    index: i,
    groups: groupsByDay.get(key) || [],
    isToday: key === todayKey,
    isWeekend: i === 0 || i === 6,
  }))

  const renderCard = (day, group, compact) => (
    <DayPlanCard
      key={`${day.key}-${group.resortKey}`}
      group={group}
      colorCtx={colorCtx}
      currentUserId={currentUserId}
      canJoin={Boolean(currentUserId) && day.key >= todayKey}
      joining={joiningKey === `${day.key}|${group.resortKey}`}
      onJoin={(resortKey) => onJoin?.(day.key, resortKey)}
      onOpenTrip={onOpenTrip}
      compact={compact}
      myResortKey={myPlanByDate?.get(day.key)?.resort_key ?? null}
      myPlanHasEta={Boolean(myPlanByDate?.get(day.key)?.eta)}
      onEditPlan={onEditPlan ? (resortKey) => onEditPlan(day.key, resortKey) : undefined}
      onAskToJoin={onAskToJoin ? (party) => onAskToJoin(day.key, group.resortKey, party) : undefined}
      askingPartyId={askingPartyId}
      askedPartyIds={askedPartyIds}
    />
  )

  const renderDay = (day) => {
    // Empty weekdays collapse to one thin line. At full height, four of them
    // push Saturday — the day people are actually deciding about — below the
    // fold on a phone.
    if (day.groups.length === 0) {
      return (
        <div key={day.key} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 12px", fontSize: 11,
          color: day.isToday ? "var(--color-text-2)" : "var(--color-text-muted)",
        }}>
          <span style={{ fontWeight: 800 }}>{DOW[day.index]} {dayNumber(day.key)}</span>
          <span>— no plans —</span>
        </div>
      )
    }

    return (
      <div key={day.key} style={{
        background: day.isWeekend ? "var(--color-surface)" : "transparent",
        border: `1px solid ${day.isToday ? "var(--color-accent)" : "var(--color-border-subtle)"}`,
        borderRadius: 16, padding: "12px 12px 14px", display: "grid", gap: 8,
      }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "var(--color-text-1)", letterSpacing: 0.4 }}>
          {DOW[day.index]} {dayNumber(day.key)}{day.isToday ? " · TODAY" : ""}
        </div>
        {day.groups.map((g) => renderCard(day, g))}
      </div>
    )
  }

  if (isMobile) {
    // Rolling week: today first, with the days already gone folded away above it.
    //
    // A week grid always starts on Sunday, so by Thursday most of a phone screen is spent on
    // days you can do nothing about, pushing the weekend you are actually deciding on below
    // the fold. The past is still reachable, just not in the way.
    const past = days.filter((d) => d.key < todayKey)
    const rest = days.filter((d) => d.key >= todayKey)

    // Viewing an earlier week deliberately — everything in it is "past", and collapsing the
    // entire screen behind a button would look broken. Show it as an ordinary week.
    const isPastWeek = rest.length === 0
    const pastWithPlans = past.filter((d) => d.groups.length > 0).length

    return (
      <div style={{ display: "grid", gap: 8 }}>
        {!isPastWeek && past.length > 0 && (
          <>
            <button
              onClick={() => setShowPast((v) => !v)}
              aria-expanded={showPast}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                background: "transparent", border: "1px dashed var(--color-border)",
                borderRadius: 999, padding: "7px 14px", minHeight: 36,
                color: "var(--color-text-3)", fontSize: 11, fontWeight: 800, cursor: "pointer",
              }}
            >
              <span style={{
                display: "inline-block", transition: "transform 0.15s",
                transform: showPast ? "rotate(90deg)" : "none",
              }}>›</span>
              {showPast ? "Hide past days" : "Show past plans"}
              {pastWithPlans > 0 && (
                <span style={{ color: "var(--color-accent)", fontWeight: 900 }}>
                  {pastWithPlans}
                </span>
              )}
            </button>
            {showPast && past.map(renderDay)}
          </>
        )}
        {(isPastWeek ? days : rest).map(renderDay)}
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6, alignItems: "start" }}>
      {days.map((day) => (
        <div key={day.key} style={{
          background: day.isWeekend ? "var(--color-surface)" : "transparent",
          border: `1px solid ${day.isToday ? "var(--color-accent)" : "var(--color-border-subtle)"}`,
          borderRadius: 14, padding: 8, minHeight: 120, display: "grid",
          gap: 6, alignContent: "start",
        }}>
          <div style={{ textAlign: "center", fontSize: 10, fontWeight: 800, color: "var(--color-text-3)" }}>
            {DOW[day.index]}
          </div>
          <div style={{
            textAlign: "center", fontSize: 16, fontWeight: 900,
            color: day.isToday ? "var(--color-accent)" : "var(--color-text-1)", marginBottom: 2,
          }}>
            {dayNumber(day.key)}
          </div>
          {day.groups.length === 0 ? (
            <div style={{ textAlign: "center", fontSize: 10, color: "var(--color-text-muted)" }}>—</div>
          ) : day.groups.map((g) => renderCard(day, g, true))}
        </div>
      ))}
    </div>
  )
}
