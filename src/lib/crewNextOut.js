/**
 * Earliest upcoming date where 2+ of a crew's members have a daily_plans row
 * at the same resort — the "Next out" line on a Crews-tab card.
 *
 * @param {string[]} memberIds
 * @param {Array<{user_id: string, ski_date: string, resort_key: string}>} plans
 *   Already sorted ascending by ski_date (as getVisiblePlansInRange returns).
 * @returns {{resortKey: string, skiDate: string} | null}
 */
export function computeNextOut(memberIds, plans) {
  const memberSet = new Set(memberIds)
  const seenByKey = new Map() // `${ski_date}|${resort_key}` -> Set(user_id)

  for (const p of plans) {
    if (!memberSet.has(p.user_id)) continue
    const key = `${p.ski_date}|${p.resort_key}`
    if (!seenByKey.has(key)) seenByKey.set(key, new Set())
    seenByKey.get(key).add(p.user_id)
  }

  for (const p of plans) {
    if (!memberSet.has(p.user_id)) continue
    const key = `${p.ski_date}|${p.resort_key}`
    if (seenByKey.get(key).size >= 2) {
      return { resortKey: p.resort_key, skiDate: p.ski_date }
    }
  }
  return null
}
