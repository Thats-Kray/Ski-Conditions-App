//
// Pure mapping from (day, time slot) to the node-cron expression that fires
// it. No I/O, no Supabase — kept separate from cron.js so the one place most
// likely to hide an off-by-one (cron's day-of-week numbering: 0/7=Sun,
// 1=Mon...6=Sat) is unit-testable on its own.

export const ALERT_DAYS = ["mon", "tue", "wed", "thu", "fri"]

const CRON_DAY_NUMBER = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 }

export const ALERT_TIME_SLOTS = {
  morning: { hour: 7, minute: 0 },
  midday: { hour: 12, minute: 0 },
  evening: { hour: 18, minute: 0 },
}

export function cronExpressionForSlot(day, timeSlot) {
  const dayNum = CRON_DAY_NUMBER[day]
  const slot = ALERT_TIME_SLOTS[timeSlot]
  if (dayNum === undefined || !slot) {
    throw new Error(`Unknown alert slot: ${day}/${timeSlot}`)
  }
  return `${slot.minute} ${slot.hour} * * ${dayNum}`
}

export const ALL_ALERT_SLOTS = ALERT_DAYS.flatMap((day) =>
  Object.keys(ALERT_TIME_SLOTS).map((timeSlot) => ({
    day,
    timeSlot,
    cron: cronExpressionForSlot(day, timeSlot),
  }))
)
