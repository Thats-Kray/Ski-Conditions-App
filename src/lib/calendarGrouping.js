/**
 * Reshapes daily_plans rows and ski_trips rows into the calendar's display model:
 * one entry per (day, mountain), with everyone going stacked underneath.
 *
 * Mountain-as-headline is the whole point of the feature (spec decision #2): the
 * question users ask is "which mountain won", and per-person rows make them do the
 * grouping in their heads.
 *
 * Pure. No React, no Supabase, no Date-of-today — every input is a parameter, which
 * is what makes it unit-testable without a browser.
 */

import { normalizeResortKey, OPEN_RESORT_KEY } from "./resorts.js"

/** ski_date can arrive as a date or a timestamp. Always key on the date part. */
function dayKey(skiDate) {
  return (skiDate || "").slice(0, 10)
}

function displayName(profile) {
  return profile?.full_name || profile?.username || "Someone"
}

/**
 * @param {Object} input
 * @param {Array} input.plans   rows from getVisiblePlansInRange()
 * @param {Array} input.trips   enriched rows from getAllVisibleTrips()
 * @param {string|null} input.currentUserId
 * @param {(userId: string) => boolean} [input.isVisible] optional display-scope
 *   predicate applied to trip hosts and trip RSVP-ers (plans are expected to
 *   already be pre-filtered by the caller). The signed-in user always passes
 *   regardless of the predicate. Omitted entirely, behavior is unchanged.
 * @returns {Map<string, Array>} date key → MountainGroup[], busiest mountain first
 */
export function groupByDayAndMountain({ plans = [], trips = [], currentUserId = null, isVisible = null }) {
  // day key → resort key → { resortKey, byUser: Map, trip }
  const days = new Map()

  function bucket(day, resortKeyRaw) {
    const resortKey = normalizeResortKey(resortKeyRaw)
    if (!day || !resortKey) return null
    if (!days.has(day)) days.set(day, new Map())
    const byResort = days.get(day)
    if (!byResort.has(resortKey)) {
      byResort.set(resortKey, { resortKey, byUser: new Map(), trip: null })
    }
    return byResort.get(resortKey)
  }

  // The signed-in user always passes — a filter chip should never be able to hide
  // you from your own calendar.
  function passes(userId) {
    return !isVisible || userId === currentUserId || isVisible(userId)
  }

  for (const plan of plans) {
    const g = bucket(dayKey(plan.ski_date), plan.resort_key)
    if (!g) continue
    g.byUser.set(plan.user_id, { userId: plan.user_id, profile: plan.profile || null })
  }

  for (const trip of trips) {
    const g = bucket(dayKey(trip.ski_date), trip.resort_key)
    if (!g) continue
    // Last trip wins if two land on the same resort and day — vanishingly rare,
    // and the badge only has room for one.
    g.trip = trip
    if (trip.host_id && passes(trip.host_id) && !g.byUser.has(trip.host_id)) {
      g.byUser.set(trip.host_id, { userId: trip.host_id, profile: trip.host_profile || null })
    }
    for (const rsvp of trip.rsvps || []) {
      // "maybe" and "out" are not attendance. A headcount that counts maybes is
      // a lie, and this whole view is a counting exercise.
      if (rsvp.status !== "going") continue
      if (!passes(rsvp.user_id)) continue
      if (g.byUser.has(rsvp.user_id)) continue
      g.byUser.set(rsvp.user_id, { userId: rsvp.user_id, profile: rsvp.profile || null })
    }
  }

  const out = new Map()
  for (const [day, byResort] of days) {
    const groups = [...byResort.values()].map((g) => ({
      resortKey: g.resortKey,
      trip: g.trip,
      attendees: [...g.byUser.values()].sort((a, b) => {
        if (a.userId === currentUserId) return -1
        if (b.userId === currentUserId) return 1
        return displayName(a.profile).localeCompare(displayName(b.profile))
      }),
    }))
    // Busiest mountain first — this is the single most important sort in the
    // feature, because it is literally the answer. Ties break on resortKey so the
    // order does not jitter between renders.
    //
    // "Open — no preference" is pinned below every real mountain regardless of its
    // headcount. The top card is supposed to answer "where should we go", and
    // available people are not a where (spec decision #5).
    groups.sort((a, b) => {
      const aOpen = a.resortKey === OPEN_RESORT_KEY
      const bOpen = b.resortKey === OPEN_RESORT_KEY
      if (aOpen !== bOpen) return aOpen ? 1 : -1
      return b.attendees.length - a.attendees.length || a.resortKey.localeCompare(b.resortKey)
    })
    out.set(day, groups)
  }
  return out
}

/** Distinct people across every mountain in one day. */
export function totalAttendees(groups = []) {
  const ids = new Set()
  for (const g of groups) for (const a of g.attendees) ids.add(a.userId)
  return ids.size
}
