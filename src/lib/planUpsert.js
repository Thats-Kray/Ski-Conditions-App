import { etaToTimeInput } from "./format.js"

/**
 * Builds the payload for a `daily_plans` write, merging caller-supplied fields
 * over whatever the existing row already has.
 *
 * upsertDailyPlan() writes the WHOLE row (onConflict: "user_id,ski_date"), so any
 * field missing from its payload is written as null. There are now four writers
 * (SkiPlansTab, FriendsCalendar, joinPlanAtResort, SkiCheckInForm) that need this
 * merge, and the logic was duplicated verbatim in two of them before this module
 * existed — exactly the kind of drift that let SkiCheckInForm blank an ETA and
 * un-private a Private plan. One function, one set of rules.
 *
 * `existing` is the current daily_plans row, or null when there isn't one yet.
 *
 * Field rules:
 * - ski_date / resort_key: an explicitly passed value wins; omitted (undefined)
 *   falls back to `existing`.
 * - eta: omitted (undefined) carries `existing.eta` forward, converted through
 *   etaToTimeInput() — upsertDailyPlan re-parses eta through buildPlanEta(),
 *   which rejects the ISO timestamp the database returns and would otherwise
 *   silently null it out. An explicit `null` is a real clear-the-ETA request and
 *   stays null. An "HH:MM" string is used as-is.
 * - visibility: omitted falls back to existing.visibility, then "friends".
 * - note: omitted falls back to existing.note, then null.
 * - status: an explicit value (one of VALID_STATUSES) wins outright — including over
 *   the resort-change reset below. Omitted, or an unrecognised value, falls back to
 *   existing.status ("planned" default) — UNLESS resortKey differs from the existing
 *   row's resort_key, in which case it resets to "planned". Moving to a different
 *   mountain cannot leave you marked as having arrived at the old one, unless the
 *   caller is explicitly telling us they arrived at the new one.
 * - arrived_at: an explicit value (including `null`, to clear it) wins outright.
 *   Omitted falls back to existing.arrived_at (null default) — UNLESS resortKey
 *   differs from the existing row's resort_key AND the caller passed no explicit
 *   status, in which case it resets to null alongside status.
 *
 * @param {object|null} existing - current daily_plans row, or null
 * @param {object} fields
 * @param {string} [fields.skiDate]
 * @param {string} [fields.resortKey]
 * @param {string|null} [fields.eta] - "HH:MM", null to clear, or omit to carry forward
 * @param {string} [fields.visibility]
 * @param {string|null} [fields.note]
 * @param {string} [fields.status] - "planned" | "driving" | "arrived"; anything else is ignored
 * @param {string|null} [fields.arrivedAt] - ISO instant, null to clear, or omit to carry forward
 * @returns {{ ski_date: string, resort_key: string, eta: string|null, visibility: string, status: string, note: string|null, arrived_at: string|null }}
 */
// daily_plans.status has a CHECK constraint allowing exactly these three values.
// Anything else must never reach the database.
const VALID_STATUSES = ["planned", "driving", "arrived"]

export function buildPlanUpsert(existing, { skiDate, resortKey, eta, visibility, note, status, arrivedAt } = {}) {
  const ski_date = skiDate !== undefined ? skiDate : existing?.ski_date
  const resort_key = resortKey !== undefined ? resortKey : existing?.resort_key

  const etaOut = eta !== undefined ? eta : (etaToTimeInput(existing?.eta) ?? null)

  const visibilityOut = visibility !== undefined ? visibility : (existing?.visibility || "friends")
  const noteOut = note !== undefined ? note : (existing?.note ?? null)

  const explicitStatus = VALID_STATUSES.includes(status) ? status : null
  const resortChanged = Boolean(existing) && existing.resort_key !== resort_key

  // A resort change normally clears status and arrival — you cannot have arrived at a
  // mountain you are no longer going to. But an explicit status is the user telling us
  // directly, so it outranks the inference.
  const statusOut = explicitStatus
    ?? (resortChanged ? "planned" : (existing?.status || "planned"))

  const arrivedOut = arrivedAt !== undefined
    ? arrivedAt
    : (explicitStatus ? (existing?.arrived_at ?? null)
                      : (resortChanged ? null : (existing?.arrived_at ?? null)))

  return {
    ski_date,
    resort_key,
    eta: etaOut,
    visibility: visibilityOut,
    status: statusOut,
    note: noteOut,
    arrived_at: arrivedOut,
  }
}
