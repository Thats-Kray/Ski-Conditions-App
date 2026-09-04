import { useCallback, useState } from "react"
import { formatDate } from "../../lib/format"
import DayPlanCard from "./DayPlanCard"

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

/**
 * "SUN".."SAT" for a "YYYY-MM-DD" key.
 *
 * Built from local date parts, never `new Date(key)` — that parses as UTC midnight
 * and lands on the previous day for every negative-offset timezone, i.e. all of
 * Colorado. Same constraint documented at the top of lib/calendarDates.js.
 */
function dowLabel(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number)
  return DOW[new Date(y, m - 1, d).getDay()]
}

/** "18" from "2026-01-18". */
function dayNumber(dateKey) {
  return Number(dateKey.slice(8, 10))
}

const emptyRowStyle = {
  display: "flex", alignItems: "center", gap: 8,
  padding: "7px 12px", minHeight: 36, fontSize: 11,
  color: "var(--color-text-muted)",
}

const addDayButtonStyle = {
  // 26x26 is the mockup's size and is deliberately below this repo's 44px floor —
  // a 44px control inside a 12px-tall day header would dominate the row it sits in.
  // Flagged for Kyle's click-through; bumping it is a two-number change.
  width: 26, height: 26, borderRadius: 8, padding: 0, flexShrink: 0,
  background: "var(--color-accent-dim)", border: "1px solid var(--color-accent)",
  color: "var(--color-accent)", fontSize: 16, lineHeight: 1,
  cursor: "pointer", display: "grid", placeItems: "center",
}

/**
 * The Plans calendar, as one scrolling list of days.
 *
 * Replaces WeekView's split personality (a 7-column desktop grid plus a rolling
 * mobile list) and PlanCalendar's month grid with a single layout that is the same
 * on every screen size — which is all the mockup shows, and the only thing anyone
 * was actually using on a phone.
 *
 * Dumb by design: every fetch, filter and action still lives in FriendsCalendar, so
 * the grouping and color rules stay unit-testable without a browser.
 */
export default function DayAgendaList({
  dayKeys = [], groupsByDay, colorCtx, currentUserId, todayKey,
  joiningKey, onJoin, onOpenTrip, myPlanByDate, onEditPlan,
  onAskToJoin, askingPartyId, askedPartyIds, onLeave, leavingKey,
  onAddDay, focusedDayKey = null,
}) {
  const [showPast, setShowPast] = useState(
    () => Boolean(focusedDayKey) && focusedDayKey < todayKey
  )

  // "Adjust state when a prop changes" — React's documented render-time pattern. An
  // effect here would set state on mount and cascade an extra render, which is what
  // react-hooks/set-state-in-effect flags (same reasoning as SkiPlansPage's lastFocus).
  const [lastFocused, setLastFocused] = useState(focusedDayKey)
  if (focusedDayKey !== lastFocused) {
    setLastFocused(focusedDayKey)
    if (focusedDayKey && focusedDayKey < todayKey) setShowPast(true)
  }

  // Callback ref rather than an effect: React hands us the node the moment the
  // focused day mounts (including the mount caused by opening "Show past days"),
  // and null when it unmounts. Stable identity, so it does not re-fire on every
  // render of the same node.
  const scrollFocusedIntoView = useCallback((node) => {
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "center", behavior: "smooth" })
    }
  }, [])

  const days = dayKeys.map((key) => ({
    key,
    groups: groupsByDay?.get(key) || [],
    isToday: key === todayKey,
    isPast: key < todayKey,
  }))
  const past = days.filter((d) => d.isPast)
  const upcoming = days.filter((d) => !d.isPast)
  const pastWithPlans = past.filter((d) => d.groups.length > 0).length

  function renderDay(day) {
    const dayRef = day.key === focusedDayKey ? scrollFocusedIntoView : undefined
    // No "+" on a day that has already happened: daily_plans has no back-dating
    // path, and handleAddSkiDay clamps to today, so the button would lie.
    const canAdd = Boolean(onAddDay) && !day.isPast
    const label = day.isToday ? "TODAY" : dowLabel(day.key)
    const addLabel = `Add a ski day on ${formatDate(day.key)}`

    // Empty days collapse to one thin line. Twenty-one full-height "no plans" cards
    // would push the weekend — the thing anyone opened this page to decide — off the
    // bottom of a phone. Same treatment WeekView already used for empty weekdays.
    if (day.groups.length === 0) {
      const line = (
        <>
          <span style={{
            fontWeight: 800,
            color: day.isToday ? "var(--color-text-2)" : "var(--color-text-muted)",
          }}>
            {label} {dayNumber(day.key)}
          </span>
          <span>— no plans —</span>
        </>
      )
      if (!canAdd) {
        return <div key={day.key} ref={dayRef} style={emptyRowStyle}>{line}</div>
      }
      return (
        <button
          key={day.key}
          ref={dayRef}
          onClick={() => onAddDay(day.key)}
          aria-label={addLabel}
          style={{
            ...emptyRowStyle, width: "100%", textAlign: "left",
            background: "transparent", border: "none", cursor: "pointer",
          }}
        >
          {line}
          <span aria-hidden="true" style={{
            marginLeft: "auto", color: "var(--color-accent)", fontSize: 15, fontWeight: 800,
          }}>
            +
          </span>
        </button>
      )
    }

    return (
      <div key={day.key} ref={dayRef} style={{
        background: "var(--color-surface)",
        border: `1px solid ${day.isToday ? "var(--color-accent)" : "var(--color-border)"}`,
        borderRadius: 18, overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          padding: "12px 14px", borderBottom: "1px solid var(--color-border-subtle)",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: 0.4, color: "var(--color-text-1)" }}>
              {label}
            </span>
            <span style={{
              fontSize: 12, color: "var(--color-text-3)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {formatDate(day.key)}
            </span>
          </div>
          {canAdd && (
            <button onClick={() => onAddDay(day.key)} aria-label={addLabel} style={addDayButtonStyle}>
              +
            </button>
          )}
        </div>

        <div style={{ padding: "12px 14px", display: "grid", gap: 14 }}>
          {day.groups.map((group) => (
            <DayPlanCard
              key={group.resortKey}
              group={group}
              colorCtx={colorCtx}
              currentUserId={currentUserId}
              canJoin={Boolean(currentUserId) && !day.isPast}
              joining={joiningKey === `${day.key}|${group.resortKey}`}
              onJoin={(resortKey) => onJoin?.(day.key, resortKey)}
              onOpenTrip={onOpenTrip}
              myResortKey={myPlanByDate?.get(day.key)?.resort_key ?? null}
              myPlanHasEta={Boolean(myPlanByDate?.get(day.key)?.eta)}
              onEditPlan={onEditPlan ? (resortKey) => onEditPlan(day.key, resortKey) : undefined}
              onAskToJoin={onAskToJoin ? (party) => onAskToJoin(day.key, group.resortKey, party) : undefined}
              askingPartyId={askingPartyId}
              askedPartyIds={askedPartyIds}
              onLeave={onLeave ? () => onLeave(day.key) : undefined}
              leaving={leavingKey === day.key}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {/* The past is reachable, just not in the way. Straight port of WeekView's
          disclosure, restyled to the mockup's dashed pill and now covering the
          whole past window rather than the current week's leading days. */}
      {past.length > 0 && (
        <>
          <button
            onClick={() => setShowPast((v) => !v)}
            aria-expanded={showPast}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: "none", border: "1px dashed var(--color-accent-dim)",
              borderRadius: 14, padding: "12px 14px", minHeight: 44,
              color: "var(--color-text-3)", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            <span style={{
              display: "inline-block", transition: "transform 0.15s",
              transform: showPast ? "rotate(90deg)" : "none",
            }}>
              ›
            </span>
            {showPast ? "Hide past days" : "Show past days"}
            {pastWithPlans > 0 && (
              <span style={{ color: "var(--color-accent)", fontWeight: 900 }}>{pastWithPlans}</span>
            )}
          </button>
          {showPast && past.map(renderDay)}
        </>
      )}
      {upcoming.map(renderDay)}
    </div>
  )
}
