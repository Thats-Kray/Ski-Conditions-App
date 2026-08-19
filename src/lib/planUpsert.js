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
 * - status / arrived_at: never taken directly from the caller. They fall back to
 *   existing.status ("planned" default) / existing.arrived_at (null default) —
 *   UNLESS resortKey differs from the existing row's resort_key, in which case
 *   both reset (status -> "planned", arrived_at -> null). Moving to a different
 *   mountain cannot leave you marked as having arrived at the old one.
 *
 * @param {object|null} existing - current daily_plans row, or null
 * @param {object} fields
 * @param {string} [fields.skiDate]
 * @param {string} [fields.resortKey]
 * @param {string|null} [fields.eta] - "HH:MM", null to clear, or omit to carry forward
 * @param {string} [fields.visibility]
 * @param {string|null} [fields.note]
 * @returns {{ ski_date: string, resort_key: string, eta: string|null, visibility: string, status: string, note: string|null, arrived_at: string|null }}
 */
export function buildPlanUpsert(existing, { skiDate, resortKey, eta, visibility, note } = {}) {
  const ski_date = skiDate !== undefined ? skiDate : existing?.ski_date
  const resort_key = resortKey !== undefined ? resortKey : existing?.resort_key

  const etaOut = eta !== undefined ? eta : (etaToTimeInput(existing?.eta) ?? null)

  const visibilityOut = visibility !== undefined ? visibility : (existing?.visibility || "friends")
  const noteOut = note !== undefined ? note : (existing?.note ?? null)

  const resortChanged = Boolean(existing) && existing.resort_key !== resort_key
  const status = resortChanged ? "planned" : (existing?.status || "planned")
  const arrived_at = resortChanged ? null : (existing?.arrived_at ?? null)

  return {
    ski_date,
    resort_key,
    eta: etaOut,
    visibility: visibilityOut,
    status,
    note: noteOut,
    arrived_at,
  }
}
