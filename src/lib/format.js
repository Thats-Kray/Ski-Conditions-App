export function timeAgo(ts) {
  if (!ts) return ""
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (m < 1)  return "now"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d`
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function formatDate(dateStr) {
  if (!dateStr) return ""
  const d = new Date(`${dateStr}T12:00:00`)
  return isNaN(d) ? dateStr : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}

export function formatDateFull(dateStr) {
  if (!dateStr) return ""
  const d = new Date(`${dateStr}T12:00:00`)
  return isNaN(d) ? dateStr : d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
}

export function fmt(n) {
  if (!n) return "0"
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k"
  return String(n)
}

/**
 * daily_plans.eta is stored as a timestamptz, but upsertDailyPlan re-parses whatever
 * it is handed through buildPlanEta(), which accepts only "HH:MM" or "H:MM AM/PM" and
 * returns null for anything else — including an ISO timestamp.
 *
 * So any code path that reads a plan and writes it back MUST convert first, or it
 * silently blanks an ETA the user set. Shared by SkiPlansTab's editor and by
 * joinPlanAtResort's "I'm in".
 */
export function etaToTimeInput(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

/**
 * A stored ETA (timestamptz ISO instant) as a short wall-clock time: "9:00 AM".
 *
 * This exact function existed three times as a module-local `formatPlanTime` — in
 * TodaysCrew, SkiCheckInForm and PowderMap — and the copies had already drifted on
 * the empty case: two returned the string "No ETA", one returned null.
 *
 * The shared version returns null and lets each caller supply its own fallback
 * text, because "No ETA" is a UI decision and this is a formatter. Callers that
 * want the label write `formatEtaShort(x) ?? "No ETA"`.
 *
 * Note this is the OUTPUT side. etaToTimeInput() above is the input side — same
 * column, different target format, and they are not interchangeable.
 */
export function formatEtaShort(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

/**
 * Rounds an "HH:MM" string to the nearest quarter hour.
 *
 * `<input type="time" step="900">` gives a 15-minute stepper on desktop, but iOS
 * Safari's time wheel ignores `step` — so a phone can still hand us "08:07". This
 * is the actual guarantee, applied on save rather than trusted from the input.
 *
 * Returns null for null/unparseable input so clearing an ETA stays possible.
 */
export function snapToQuarterHour(hhmm) {
  if (!hhmm) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim())
  if (!m) return null

  let hour = Number(m[1])
  const minute = Number(m[2])
  if (hour > 23 || minute > 59) return null

  let snapped = Math.round(minute / 15) * 15
  if (snapped === 60) {
    snapped = 0
    hour = (hour + 1) % 24     // 23:53 becomes 00:00, never hour 24
  }
  return `${String(hour).padStart(2, "0")}:${String(snapped).padStart(2, "0")}`
}
