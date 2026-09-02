import { test } from "node:test"
import assert from "node:assert/strict"
import { groupCommentsByActivity } from "./activityComments.js"

const c = (id, activity_id, created_at) => ({
  id,
  activity_id,
  user_id: "u1",
  content: `comment ${id}`,
  created_at,
})

test("groups rows into one bucket per activity_id", () => {
  const rows = [c("1", "a", "2026-09-01T10:00:00+00:00"), c("2", "b", "2026-09-01T11:00:00+00:00")]
  const grouped = groupCommentsByActivity(rows)
  assert.deepEqual(Object.keys(grouped).sort(), ["a", "b"])
  assert.deepEqual(grouped.a.map((r) => r.id), ["1"])
  assert.deepEqual(grouped.b.map((r) => r.id), ["2"])
})

test("sorts each bucket oldest-first regardless of the order rows arrive in", () => {
  // The feed itself is newest-first; a comment thread reads top-down oldest-first, the
  // opposite direction. Getting this backwards is silently wrong, not an error.
  const rows = [
    c("late", "a", "2026-09-01T12:00:00+00:00"),
    c("early", "a", "2026-09-01T08:00:00+00:00"),
    c("mid", "a", "2026-09-01T10:00:00+00:00"),
  ]
  assert.deepEqual(groupCommentsByActivity(rows).a.map((r) => r.id), ["early", "mid", "late"])
})

test("returns an empty object for empty, null and undefined input", () => {
  assert.deepEqual(groupCommentsByActivity([]), {})
  assert.deepEqual(groupCommentsByActivity(null), {})
  assert.deepEqual(groupCommentsByActivity(undefined), {})
})

test("drops rows with no activity_id instead of bucketing them under undefined", () => {
  const rows = [c("1", "a", "2026-09-01T10:00:00+00:00"), c("2", null, "2026-09-01T11:00:00+00:00")]
  const grouped = groupCommentsByActivity(rows)
  assert.deepEqual(Object.keys(grouped), ["a"])
  assert.equal(grouped.a.length, 1)
})

test("sorts a row with no created_at last, not first", () => {
  // A locally-appended row that has not round-tripped yet belongs at the bottom of the
  // thread. Treating an unparseable timestamp as 0 would put it at the top.
  const rows = [
    c("pending", "a", undefined),
    c("existing", "a", "2026-09-01T08:00:00+00:00"),
  ]
  assert.deepEqual(groupCommentsByActivity(rows).a.map((r) => r.id), ["existing", "pending"])
})

test("keeps buckets independent — mutating one does not touch another", () => {
  const rows = [c("1", "a", "2026-09-01T10:00:00+00:00"), c("2", "b", "2026-09-01T11:00:00+00:00")]
  const grouped = groupCommentsByActivity(rows)
  grouped.a.push(c("3", "a", "2026-09-01T12:00:00+00:00"))
  assert.equal(grouped.b.length, 1)
})

test("does not reorder the caller's input array", () => {
  const rows = [
    c("late", "a", "2026-09-01T12:00:00+00:00"),
    c("early", "a", "2026-09-01T08:00:00+00:00"),
  ]
  groupCommentsByActivity(rows)
  assert.deepEqual(rows.map((r) => r.id), ["late", "early"])
})

test("preserves every field on each row, including the resolved profile", () => {
  const row = {
    id: "1",
    activity_id: "a",
    user_id: "u9",
    content: "nice day",
    created_at: "2026-09-01T10:00:00+00:00",
    profiles: { id: "u9", full_name: "Ada", username: "ada", avatar_url: null },
  }
  assert.deepEqual(groupCommentsByActivity([row]).a[0], row)
})
