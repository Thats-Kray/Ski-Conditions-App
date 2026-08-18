import { test } from "node:test"
import assert from "node:assert/strict"
import { groupByDayAndMountain, totalAttendees } from "./calendarGrouping.js"

const p = (user_id, ski_date, resort_key, full_name) => ({
  id: `plan-${user_id}-${ski_date}`, user_id, ski_date, resort_key,
  profile: { id: user_id, full_name, username: full_name.toLowerCase(), avatar_url: null },
})

test("groups one day's plans by mountain", () => {
  const out = groupByDayAndMountain({
    plans: [
      p("u1", "2026-08-22", "coppermountain", "Nate"),
      p("u2", "2026-08-22", "coppermountain", "Rafe"),
      p("u3", "2026-08-22", "vail", "Suzanne"),
    ],
    trips: [],
    currentUserId: "me",
  })
  const sat = out.get("2026-08-22")
  assert.equal(sat.length, 2)
  assert.equal(sat[0].resortKey, "coppermountain")
  assert.equal(sat[0].attendees.length, 2)
  assert.equal(sat[1].resortKey, "vail")
})

test("the busiest mountain sorts first", () => {
  const out = groupByDayAndMountain({
    plans: [
      p("u3", "2026-08-22", "vail", "Suzanne"),
      p("u1", "2026-08-22", "coppermountain", "Nate"),
      p("u2", "2026-08-22", "coppermountain", "Rafe"),
    ],
    trips: [], currentUserId: "me",
  })
  assert.equal(out.get("2026-08-22")[0].resortKey, "coppermountain")
})

test("equal headcounts break ties by resort key, deterministically", () => {
  const out = groupByDayAndMountain({
    plans: [p("u1", "2026-08-22", "vail", "A"), p("u2", "2026-08-22", "aspensnowmass", "B")],
    trips: [], currentUserId: "me",
  })
  assert.deepEqual(out.get("2026-08-22").map((g) => g.resortKey), ["aspensnowmass", "vail"])
})

test("the signed-in user sorts first within a mountain", () => {
  const out = groupByDayAndMountain({
    plans: [p("aaa", "2026-08-22", "vail", "Aaron"), p("me", "2026-08-22", "vail", "Zed")],
    trips: [], currentUserId: "me",
  })
  assert.equal(out.get("2026-08-22")[0].attendees[0].userId, "me")
})

test("a trip merges into the plan group at the same resort", () => {
  const out = groupByDayAndMountain({
    plans: [p("u1", "2026-08-22", "coppermountain", "Nate")],
    trips: [{
      id: "t1", host_id: "u2", resort_key: "coppermountain", ski_date: "2026-08-22",
      title: "Powder Day",
      host_profile: { id: "u2", full_name: "Rafe", avatar_url: null },
      rsvps: [{ user_id: "u3", status: "going", profile: { id: "u3", full_name: "Gaby", avatar_url: null } }],
    }],
    currentUserId: "me",
  })
  const groups = out.get("2026-08-22")
  assert.equal(groups.length, 1, "one card, not two")
  assert.equal(groups[0].trip.title, "Powder Day")
  assert.equal(groups[0].attendees.length, 3, "planner + host + going RSVP")
})

test("a trip with no matching plan still creates its group", () => {
  const out = groupByDayAndMountain({
    plans: [],
    trips: [{
      id: "t1", host_id: "u2", resort_key: "vail", ski_date: "2026-08-22", title: "Solo",
      host_profile: { id: "u2", full_name: "Rafe", avatar_url: null }, rsvps: [],
    }],
    currentUserId: "me",
  })
  assert.equal(out.get("2026-08-22")[0].attendees.length, 1)
})

test("maybe and out RSVPs are not counted", () => {
  const out = groupByDayAndMountain({
    plans: [],
    trips: [{
      id: "t1", host_id: "u2", resort_key: "vail", ski_date: "2026-08-22", title: "T",
      host_profile: { id: "u2", full_name: "Rafe", avatar_url: null },
      rsvps: [
        { user_id: "u3", status: "maybe", profile: { id: "u3", full_name: "Gaby", avatar_url: null } },
        { user_id: "u4", status: "out", profile: { id: "u4", full_name: "Nate", avatar_url: null } },
      ],
    }],
    currentUserId: "me",
  })
  assert.equal(out.get("2026-08-22")[0].attendees.length, 1, "host only")
})

test("one person with both a plan and a going RSVP counts once", () => {
  const out = groupByDayAndMountain({
    plans: [p("u3", "2026-08-22", "vail", "Gaby")],
    trips: [{
      id: "t1", host_id: "u2", resort_key: "vail", ski_date: "2026-08-22", title: "T",
      host_profile: { id: "u2", full_name: "Rafe", avatar_url: null },
      rsvps: [{ user_id: "u3", status: "going", profile: { id: "u3", full_name: "Gaby", avatar_url: null } }],
    }],
    currentUserId: "me",
  })
  assert.equal(out.get("2026-08-22")[0].attendees.length, 2)
})

test("a timestamp ski_date is normalized to a date key", () => {
  const out = groupByDayAndMountain({
    plans: [{ ...p("u1", "2026-08-22T00:00:00+00:00", "vail", "Nate") }],
    trips: [], currentUserId: "me",
  })
  assert.ok(out.has("2026-08-22"))
})

test("rows with no resort_key are skipped, not grouped under undefined", () => {
  const out = groupByDayAndMountain({
    plans: [p("u1", "2026-08-22", null, "Nate"), p("u2", "2026-08-22", "vail", "Rafe")],
    trips: [], currentUserId: "me",
  })
  const groups = out.get("2026-08-22")
  assert.equal(groups.length, 1)
  assert.equal(groups[0].resortKey, "vail")
})

test("empty input yields an empty map, not a throw", () => {
  const out = groupByDayAndMountain({ plans: [], trips: [], currentUserId: null })
  assert.equal(out.size, 0)
})

test("totalAttendees counts distinct people across a day's mountains", () => {
  const out = groupByDayAndMountain({
    plans: [
      p("u1", "2026-08-22", "vail", "A"),
      p("u2", "2026-08-22", "coppermountain", "B"),
    ],
    trips: [], currentUserId: "me",
  })
  assert.equal(totalAttendees(out.get("2026-08-22")), 2)
})
