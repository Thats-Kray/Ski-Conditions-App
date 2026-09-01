import { test } from "node:test"
import assert from "node:assert/strict"
import { computeNextOut } from "./crewNextOut.js"

test("returns the earliest date where 2+ members share a resort", () => {
  const plans = [
    { user_id: "a", ski_date: "2026-09-01", resort_key: "vail" },
    { user_id: "b", ski_date: "2026-09-05", resort_key: "vail" },
    { user_id: "a", ski_date: "2026-09-05", resort_key: "vail" },
  ]
  assert.deepEqual(computeNextOut(["a", "b"], plans), { resortKey: "vail", skiDate: "2026-09-05" })
})

test("ignores plans from users not in memberIds", () => {
  const plans = [
    { user_id: "stranger", ski_date: "2026-09-01", resort_key: "vail" },
    { user_id: "a", ski_date: "2026-09-10", resort_key: "vail" },
  ]
  assert.equal(computeNextOut(["a", "b"], plans), null)
})

test("ignores same-day plans at different resorts", () => {
  const plans = [
    { user_id: "a", ski_date: "2026-09-01", resort_key: "vail" },
    { user_id: "b", ski_date: "2026-09-01", resort_key: "breckenridge" },
  ]
  assert.equal(computeNextOut(["a", "b"], plans), null)
})

test("a single member alone on a date does not count", () => {
  const plans = [{ user_id: "a", ski_date: "2026-09-01", resort_key: "vail" }]
  assert.equal(computeNextOut(["a", "b"], plans), null)
})

test("no plans returns null", () => {
  assert.equal(computeNextOut(["a", "b"], []), null)
})
