import { test } from "node:test"
import assert from "node:assert/strict"
import { etaToTimeInput } from "./format.js"

test("an ISO timestamp round-trips to a zero-padded HH:MM local time", () => {
  const d = new Date(2026, 0, 15, 14, 5, 0) // 2:05 PM local
  assert.equal(etaToTimeInput(d.toISOString()), "14:05")
})

test("null input returns null", () => {
  assert.equal(etaToTimeInput(null), null)
})

test("undefined input returns null", () => {
  assert.equal(etaToTimeInput(undefined), null)
})

test("an unparseable string returns null, not \"NaN:NaN\"", () => {
  assert.equal(etaToTimeInput("not a time"), null)
})

test("single-digit hour and minute are both zero-padded", () => {
  const d = new Date(2026, 0, 15, 5, 3, 0) // 5:03 AM local
  assert.equal(etaToTimeInput(d.toISOString()), "05:03")
})
