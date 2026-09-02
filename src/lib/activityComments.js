/**
 * Group a flat batch of activity_feed_comments rows into { [activity_id]: [row, ...] } —
 * the same shape ActivityFeed.jsx already builds by hand for reactions.
 *
 * Each bucket is sorted oldest-first. getActivityComments already asks PostgREST for
 * created_at ascending, so this re-sort is belt-and-braces: the thread's reading order is
 * the opposite of the feed's own newest-first order, getting it backwards is silently
 * wrong rather than an error, and a `.order()` clause can vanish in a later edit to the
 * select without anything failing. It costs a sort over a handful of rows per card.
 *
 * A row whose created_at is missing or unparseable sorts LAST, not first — that is the
 * shape of a comment appended locally before it has round-tripped, and it belongs at the
 * bottom of the thread.
 *
 * Rows with no activity_id are dropped rather than collected under an "undefined" key,
 * which would never match a card and would only confuse whoever reads the object next.
 *
 * @param {Array<{id: string, activity_id: string, user_id: string, content: string, created_at: string}> | null | undefined} rows
 * @returns {Record<string, Array<object>>} never null; {} when there is nothing to group
 */
export function groupCommentsByActivity(rows) {
  const grouped = {}

  for (const row of rows || []) {
    if (!row?.activity_id) continue
    if (!grouped[row.activity_id]) grouped[row.activity_id] = []
    grouped[row.activity_id].push(row)
  }

  const stamp = (row) => {
    const ms = Date.parse(row?.created_at)
    return Number.isFinite(ms) ? ms : Infinity
  }

  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => stamp(a) - stamp(b))
  }

  return grouped
}
