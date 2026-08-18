import { test } from "node:test"
import assert from "node:assert/strict"
import { weekBounds, weekDayKeys } from "./calendarDates.js"

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
