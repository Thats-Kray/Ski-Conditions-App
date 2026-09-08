import { test } from "node:test"
import assert from "node:assert/strict"
import {
  weekBounds, weekDayKeys, agendaRange, AGENDA_PAST_DAYS, AGENDA_FORWARD_DAYS,
  AGENDA_MAX_WIDEN_DAYS,
} from "./calendarDates.js"

test("weekBounds spans Sunday to Saturday around a midweek date", () => {
  // Tue 2026-08-18. Local-time constructor: month is 0-indexed, so 7 = August.
  assert.deepEqual(weekBounds(new Date(2026, 7, 18)), {
    start: "2026-08-16",
    end: "2026-08-22",
  })
})

test("weekBounds is stable when the date is already Sunday", () => {
  assert.deepEqual(weekBounds(new Date(2026, 7, 16)), {
    start: "2026-08-16",
    end: "2026-08-22",
  })
})

test("weekBounds is stable when the date is already Saturday", () => {
  assert.deepEqual(weekBounds(new Date(2026, 7, 22)), {
    start: "2026-08-16",
    end: "2026-08-22",
  })
})

test("weekBounds crosses a month boundary", () => {
  // Wed 2026-09-02 sits in the week starting Sun 2026-08-30.
  assert.deepEqual(weekBounds(new Date(2026, 8, 2)), {
    start: "2026-08-30",
    end: "2026-09-05",
  })
})

test("weekBounds crosses a year boundary", () => {
  // Thu 2027-01-01 sits in the week starting Sun 2026-12-27.
  assert.deepEqual(weekBounds(new Date(2027, 0, 1)), {
    start: "2026-12-27",
    end: "2027-01-02",
  })
})

test("weekDayKeys returns seven keys, Sunday first", () => {
  assert.deepEqual(weekDayKeys(new Date(2026, 7, 18)), [
    "2026-08-16", "2026-08-17", "2026-08-18",
    "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22",
  ])
})

test("weekDayKeys never produces a UTC-shifted key late in the day", () => {
  // 11pm local on Sat 2026-08-22. toISOString() would roll this to the 23rd
  // in Mountain Time and shift the whole week. Local parts must not.
  const keys = weekDayKeys(new Date(2026, 7, 22, 23, 30))
  assert.equal(keys[0], "2026-08-16")
  assert.equal(keys[6], "2026-08-22")
})

test("agendaRange spans 7 days back through 21 forward by default", () => {
  const { start, end, keys } = agendaRange("2026-01-18")
  assert.equal(AGENDA_PAST_DAYS, 7)
  assert.equal(AGENDA_FORWARD_DAYS, 21)
  assert.equal(keys.length, 29)          // 7 back + today + 21 forward
  assert.equal(start, "2026-01-11")
  assert.equal(end, "2026-02-08")
  assert.equal(keys[0], start)
  assert.equal(keys[keys.length - 1], end)
  assert.ok(keys.includes("2026-01-18"))
})

test("agendaRange keys are strictly chronological with no gaps or repeats", () => {
  const { keys } = agendaRange("2026-01-18")
  assert.equal(new Set(keys).size, keys.length)
  for (let i = 1; i < keys.length; i++) {
    assert.ok(keys[i] > keys[i - 1], `${keys[i]} should sort after ${keys[i - 1]}`)
  }
})

test("agendaRange crosses a year boundary", () => {
  const { start, end } = agendaRange("2026-12-28")
  assert.equal(start, "2026-12-21")
  assert.equal(end, "2027-01-18")
})

test("agendaRange honours custom past and forward sizes", () => {
  const { start, end, keys } = agendaRange("2026-03-15", { past: 1, forward: 2 })
  assert.deepEqual(keys, ["2026-03-14", "2026-03-15", "2026-03-16", "2026-03-17"])
  assert.equal(start, "2026-03-14")
  assert.equal(end, "2026-03-17")
})

test("agendaRange survives the spring-forward Sunday without losing a day", () => {
  // 2026-03-08 is US DST start. Adding 86_400_000ms would produce a duplicate key.
  const { keys } = agendaRange("2026-03-08", { past: 2, forward: 2 })
  assert.deepEqual(keys, [
    "2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10",
  ])
})

test("agendaRange widens forward to reach a focused day past the far edge", () => {
  const { start, end, keys } = agendaRange("2026-01-18", { includeKey: "2026-03-01" })
  assert.equal(start, "2026-01-11")       // past side untouched
  assert.equal(end, "2026-03-01")
  assert.ok(keys.includes("2026-03-01"))
})

test("agendaRange widens backward to reach a focused day before the near edge", () => {
  const { start, end } = agendaRange("2026-01-18", { includeKey: "2025-12-25" })
  assert.equal(start, "2025-12-25")
  assert.equal(end, "2026-02-08")         // forward side untouched
})

test("agendaRange ignores a focused day already inside the window", () => {
  const plain = agendaRange("2026-01-18")
  const focused = agendaRange("2026-01-18", { includeKey: "2026-01-20" })
  assert.deepEqual(focused, plain)
})

test("agendaRange ignores a null or malformed focused day", () => {
  const plain = agendaRange("2026-01-18")
  assert.deepEqual(agendaRange("2026-01-18", { includeKey: null }), plain)
  assert.deepEqual(agendaRange("2026-01-18", { includeKey: "" }), plain)
  assert.deepEqual(agendaRange("2026-01-18", { includeKey: "not-a-date" }), plain)
})

test("agendaRange never returns fewer keys than requested for negative options", () => {
  const { keys } = agendaRange("2026-01-18", { past: -5, forward: 0 })
  assert.deepEqual(keys, ["2026-01-18"])
})

test("agendaRange ignores a digit-shaped but calendrically invalid includeKey", () => {
  // "2026-13-40" passes the shape regex but is not a real date -- month 13, day 40 --
  // and must not be allowed to silently normalize into some unrelated day via Date's
  // rollover behavior.
  const plain = agendaRange("2026-01-18")
  const withBogusKey = agendaRange("2026-01-18", { includeKey: "2026-13-40" })
  assert.deepEqual(withBogusKey, plain)
})

test("agendaRange caps how far includeKey can widen the window", () => {
  assert.equal(AGENDA_MAX_WIDEN_DAYS, 180)
  // "2027-06-01" is far more than 180 days past "2026-01-18" -- the window must
  // widen only up to the cap, not all the way out to the far-future date itself.
  const { end, keys } = agendaRange("2026-01-18", { includeKey: "2027-06-01" })
  assert.equal(end, "2026-07-17")   // todayKey + 180 days, not the includeKey itself
  assert.ok(!keys.includes("2027-06-01"))
})
