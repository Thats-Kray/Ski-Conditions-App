import { test } from "node:test"
import assert from "node:assert/strict"
import { buildPlanUpsert } from "./planUpsert.js"

const isoEta = (h, m) => new Date(2026, 0, 15, h, m, 0).toISOString()

test("existing = null produces sane defaults", () => {
  const result = buildPlanUpsert(null, { skiDate: "2026-01-15", resortKey: "vail" })
  assert.deepEqual(result, {
    ski_date: "2026-01-15",
    resort_key: "vail",
    eta: null,
    visibility: "friends",
    status: "planned",
    note: null,
    arrived_at: null,
  })
})

test("an omitted field is carried forward and never nulled", () => {
  const existing = {
    ski_date: "2026-01-15",
    resort_key: "vail",
    eta: isoEta(8, 30),
    visibility: "private",
    status: "arrived",
    note: "meet at gondola",
    arrived_at: "2026-01-15T15:00:00.000Z",
  }
  // Caller only wants to touch visibility; everything else must ride along.
  const result = buildPlanUpsert(existing, { visibility: "friends" })

  assert.equal(result.ski_date, "2026-01-15")
  assert.equal(result.resort_key, "vail")
  assert.equal(result.eta, "08:30")
  assert.equal(result.visibility, "friends")
  assert.equal(result.status, "arrived")
  assert.equal(result.note, "meet at gondola")
  assert.equal(result.arrived_at, "2026-01-15T15:00:00.000Z")
})

test("an ISO eta on existing round-trips to HH:MM when eta is omitted", () => {
  const existing = { resort_key: "vail", eta: isoEta(14, 5) }
  const result = buildPlanUpsert(existing, { resortKey: "vail" })
  assert.equal(result.eta, "14:05")
})

test("an explicit null eta clears it, even when existing had one", () => {
  const existing = { resort_key: "vail", eta: isoEta(9, 0) }
  const result = buildPlanUpsert(existing, { resortKey: "vail", eta: null })
  assert.equal(result.eta, null)
})

test("an explicit HH:MM eta is used as-is", () => {
  const existing = { resort_key: "vail", eta: isoEta(9, 0) }
  const result = buildPlanUpsert(existing, { resortKey: "vail", eta: "11:45" })
  assert.equal(result.eta, "11:45")
})

test("a resort change resets status and arrived_at", () => {
  const existing = {
    resort_key: "vail",
    status: "arrived",
    arrived_at: "2026-01-15T15:00:00.000Z",
    eta: isoEta(8, 30),
    visibility: "friends",
    note: "carpooling",
  }
  const result = buildPlanUpsert(existing, { resortKey: "coppermountain" })

  assert.equal(result.resort_key, "coppermountain")
  assert.equal(result.status, "planned")
  assert.equal(result.arrived_at, null)
  // Switching mountains must not silently wipe the ETA/note/visibility too.
  assert.equal(result.eta, "08:30")
  assert.equal(result.visibility, "friends")
  assert.equal(result.note, "carpooling")
})

test("a same-resort save preserves status and arrived_at", () => {
  const existing = {
    resort_key: "vail",
    status: "arrived",
    arrived_at: "2026-01-15T15:00:00.000Z",
  }
  const result = buildPlanUpsert(existing, { resortKey: "vail", visibility: "private" })

  assert.equal(result.status, "arrived")
  assert.equal(result.arrived_at, "2026-01-15T15:00:00.000Z")
})

test("resortKey omitted falls back to existing.resort_key and does not count as a change", () => {
  const existing = { resort_key: "vail", status: "arrived", arrived_at: "2026-01-15T15:00:00.000Z" }
  const result = buildPlanUpsert(existing, { visibility: "friends" })

  assert.equal(result.resort_key, "vail")
  assert.equal(result.status, "arrived")
  assert.equal(result.arrived_at, "2026-01-15T15:00:00.000Z")
})

test("note omitted falls back to existing note, then null", () => {
  const withNote = buildPlanUpsert({ resort_key: "vail", note: "hello" }, { resortKey: "vail" })
  assert.equal(withNote.note, "hello")

  const withoutNote = buildPlanUpsert(null, { skiDate: "2026-01-15", resortKey: "vail" })
  assert.equal(withoutNote.note, null)
})

test("visibility omitted falls back to existing.visibility, then friends", () => {
  const withVisibility = buildPlanUpsert({ resort_key: "vail", visibility: "private" }, { resortKey: "vail" })
  assert.equal(withVisibility.visibility, "private")

  const withoutVisibility = buildPlanUpsert(null, { skiDate: "2026-01-15", resortKey: "vail" })
  assert.equal(withoutVisibility.visibility, "friends")
})

test("status is carried forward when the caller omits it", () => {
  const out = buildPlanUpsert(
    { resort_key: "vail", status: "driving", arrived_at: null },
    { skiDate: "2026-08-21", resortKey: "vail" }
  )
  assert.equal(out.status, "driving")
})

test("an explicit status is used", () => {
  const out = buildPlanUpsert(
    { resort_key: "vail", status: "planned", arrived_at: null },
    { skiDate: "2026-08-21", resortKey: "vail", status: "arrived", arrivedAt: "2026-08-21T16:30:00.000Z" }
  )
  assert.equal(out.status, "arrived")
  assert.equal(out.arrived_at, "2026-08-21T16:30:00.000Z")
})

test("an invalid status falls back instead of reaching the CHECK constraint", () => {
  const out = buildPlanUpsert(
    { resort_key: "vail", status: "driving", arrived_at: null },
    { skiDate: "2026-08-21", resortKey: "vail", status: "teleporting" }
  )
  assert.equal(out.status, "driving")
})

test("an explicit status overrides the resort-change reset", () => {
  // Changing mountain normally resets status to planned. Saying "I'm arrived" in the
  // same breath is deliberate, so it wins.
  const out = buildPlanUpsert(
    { resort_key: "vail", status: "arrived", arrived_at: "2026-08-21T15:00:00.000Z" },
    { skiDate: "2026-08-21", resortKey: "coppermountain", status: "arrived", arrivedAt: "2026-08-21T17:00:00.000Z" }
  )
  assert.equal(out.resort_key, "coppermountain")
  assert.equal(out.status, "arrived")
  assert.equal(out.arrived_at, "2026-08-21T17:00:00.000Z")
})

test("a resort change with no explicit status still resets status and arrival", () => {
  const out = buildPlanUpsert(
    { resort_key: "vail", status: "arrived", arrived_at: "2026-08-21T15:00:00.000Z" },
    { skiDate: "2026-08-21", resortKey: "coppermountain" }
  )
  assert.equal(out.status, "planned")
  assert.equal(out.arrived_at, null)
})

test("arrivedAt can be explicitly cleared", () => {
  const out = buildPlanUpsert(
    { resort_key: "vail", status: "arrived", arrived_at: "2026-08-21T15:00:00.000Z" },
    { skiDate: "2026-08-21", resortKey: "vail", status: "driving", arrivedAt: null }
  )
  assert.equal(out.status, "driving")
  assert.equal(out.arrived_at, null)
})

// Invariant: arrived_at is only meaningful when status === "arrived". Any write
// that leaves status planned/driving must clear it — regardless of how the
// caller got there (explicit status, carried-forward arrivedAt, or an explicit
// but contradictory arrivedAt).
test("switching an existing arrived plan to driving clears arrived_at", () => {
  const existing = { resort_key: "vail", status: "arrived", arrived_at: "2026-08-21T15:00:00.000Z" }
  const out = buildPlanUpsert(existing, { resortKey: "vail", status: "driving" })
  assert.equal(out.status, "driving")
  assert.equal(out.arrived_at, null)
})

test("switching an existing arrived plan to planned clears arrived_at", () => {
  const existing = { resort_key: "vail", status: "arrived", arrived_at: "2026-08-21T15:00:00.000Z" }
  const out = buildPlanUpsert(existing, { resortKey: "vail", status: "planned" })
  assert.equal(out.status, "planned")
  assert.equal(out.arrived_at, null)
})

test("an explicit arrivedAt passed alongside a non-arrived status is discarded", () => {
  const existing = { resort_key: "vail", status: "planned", arrived_at: null }
  const out = buildPlanUpsert(existing, {
    resortKey: "vail",
    status: "driving",
    arrivedAt: "2026-08-21T15:00:00.000Z",
  })
  assert.equal(out.status, "driving")
  assert.equal(out.arrived_at, null)
})

test("a plan that stays arrived keeps its timestamp", () => {
  const existing = { resort_key: "vail", status: "arrived", arrived_at: "2026-08-21T15:00:00.000Z" }
  const out = buildPlanUpsert(existing, { resortKey: "vail", status: "arrived" })
  assert.equal(out.status, "arrived")
  assert.equal(out.arrived_at, "2026-08-21T15:00:00.000Z")
})

test("carrying status forward (caller omits status) on an arrived plan keeps the timestamp", () => {
  const existing = { resort_key: "vail", status: "arrived", arrived_at: "2026-08-21T15:00:00.000Z" }
  const out = buildPlanUpsert(existing, { resortKey: "vail" })
  assert.equal(out.status, "arrived")
  assert.equal(out.arrived_at, "2026-08-21T15:00:00.000Z")
})
