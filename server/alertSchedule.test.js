// server/alertSchedule.test.js
import { test } from "node:test"
import assert from "node:assert/strict"
import { ALERT_DAYS, ALERT_TIME_SLOTS, cronExpressionForSlot, ALL_ALERT_SLOTS } from "./alertSchedule.js"

test("cronExpressionForSlot matches today's existing Wednesday-morning schedule exactly", () => {
  // The pre-existing cron.schedule("0 7 * * 3", ...) this feature replaces —
  // this slot must produce the byte-identical expression so Wednesday-morning
  // subscribers (every current subscriber, via the column defaults) see zero
  // change in when their briefing arrives.
  assert.equal(cronExpressionForSlot("wed", "morning"), "0 7 * * 3")
})

test("cronExpressionForSlot maps each weekday to the correct cron day number", () => {
  assert.equal(cronExpressionForSlot("mon", "morning"), "0 7 * * 1")
  assert.equal(cronExpressionForSlot("tue", "morning"), "0 7 * * 2")
  assert.equal(cronExpressionForSlot("thu", "morning"), "0 7 * * 4")
  assert.equal(cronExpressionForSlot("fri", "morning"), "0 7 * * 5")
})

test("cronExpressionForSlot maps each time slot to the correct hour", () => {
  assert.equal(cronExpressionForSlot("mon", "midday"), "0 12 * * 1")
  assert.equal(cronExpressionForSlot("mon", "evening"), "0 18 * * 1")
})

test("cronExpressionForSlot throws on an unknown day or time slot", () => {
  assert.throws(() => cronExpressionForSlot("sat", "morning"))
  assert.throws(() => cronExpressionForSlot("mon", "night"))
})

test("ALL_ALERT_SLOTS covers every weekday x time-slot combination exactly once", () => {
  assert.equal(ALL_ALERT_SLOTS.length, 15)
  const keys = new Set(ALL_ALERT_SLOTS.map((s) => `${s.day}-${s.timeSlot}`))
  assert.equal(keys.size, 15)
  for (const day of ALERT_DAYS) {
    for (const timeSlot of Object.keys(ALERT_TIME_SLOTS)) {
      assert.ok(keys.has(`${day}-${timeSlot}`), `missing ${day}/${timeSlot}`)
    }
  }
})

test("ALL_ALERT_SLOTS never includes a weekend day", () => {
  assert.ok(ALL_ALERT_SLOTS.every((s) => !["sat", "sun"].includes(s.day)))
})
