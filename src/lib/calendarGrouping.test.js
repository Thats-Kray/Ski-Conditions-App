import { test } from "node:test"
import assert from "node:assert/strict"
import { groupByDayAndMountain, totalAttendees, earliestEta } from "./calendarGrouping.js"

const p = (user_id, ski_date, resort_key, full_name, eta = null) => ({
  id: `plan-${user_id}-${ski_date}`, user_id, ski_date, resort_key, eta,
  profile: { id: user_id, full_name, username: full_name.toLowerCase(), avatar_url: null },
})

// A local-time ISO instant, the shape daily_plans.eta comes back as.
const at = (hh, mm = 0) => new Date(2026, 7, 22, hh, mm, 0).toISOString()

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

test("totalAttendees dedupes one person present at two mountains, not sums them", () => {
  // A naive sum of per-group attendee counts would report 2 here. The whole point
  // of totalAttendees is the Set dedupe, so the test has to put the same person at
  // two mountains on the same day to actually exercise it.
  const out = groupByDayAndMountain({
    plans: [p("u1", "2026-08-22", "vail", "A")],
    trips: [{
      id: "t1", host_id: "u1", resort_key: "coppermountain", ski_date: "2026-08-22", title: "T",
      host_profile: { id: "u1", full_name: "A", avatar_url: null }, rsvps: [],
    }],
    currentUserId: "me",
  })
  assert.equal(out.get("2026-08-22").length, 2, "two separate mountain cards")
  assert.equal(totalAttendees(out.get("2026-08-22")), 1, "same person counted once, not summed across mountains")
})

test("attendees other than the signed-in user sort alphabetically by display name", () => {
  // Regression guard: a comparator that degrades to `return 0` would pass every
  // other test in this file (they only ever have one non-self attendee per
  // mountain) but would leave these two in insertion order.
  const out = groupByDayAndMountain({
    plans: [
      p("u1", "2026-08-22", "vail", "Zed"),
      p("u2", "2026-08-22", "vail", "Amy"),
    ],
    trips: [], currentUserId: "me",
  })
  const names = out.get("2026-08-22")[0].attendees.map((a) => a.profile.full_name)
  assert.deepEqual(names, ["Amy", "Zed"])
})

test("a stray display-name resort_key merges into the same card as its normalized form", () => {
  const out = groupByDayAndMountain({
    plans: [
      p("u1", "2026-08-22", "Beaver Creek", "A"),
      p("u2", "2026-08-22", "beavercreek", "B"),
    ],
    trips: [], currentUserId: "me",
  })
  const groups = out.get("2026-08-22")
  assert.equal(groups.length, 1, "one card, not two, for the same mountain")
  assert.equal(groups[0].attendees.length, 2)
})

test("isVisible excludes a non-matching trip RSVP-er from the count", () => {
  const out = groupByDayAndMountain({
    plans: [],
    trips: [{
      id: "t1", host_id: "u2", resort_key: "vail", ski_date: "2026-08-22", title: "T",
      host_profile: { id: "u2", full_name: "Rafe", avatar_url: null },
      rsvps: [{ user_id: "u3", status: "going", profile: { id: "u3", full_name: "Gaby", avatar_url: null } }],
    }],
    currentUserId: "me",
    isVisible: (userId) => userId === "u2",   // only the host is visible
  })
  const attendees = out.get("2026-08-22")[0].attendees
  assert.equal(attendees.length, 1, "the non-matching RSVP-er is excluded")
  assert.equal(attendees[0].userId, "u2")
})

test("isVisible always keeps the signed-in user, even if the predicate would exclude them", () => {
  const out = groupByDayAndMountain({
    plans: [],
    trips: [{
      id: "t1", host_id: "u2", resort_key: "vail", ski_date: "2026-08-22", title: "T",
      host_profile: { id: "u2", full_name: "Rafe", avatar_url: null },
      rsvps: [{ user_id: "me", status: "going", profile: { id: "me", full_name: "Me", avatar_url: null } }],
    }],
    currentUserId: "me",
    isVisible: () => false,   // excludes everyone, including "me"
  })
  const attendees = out.get("2026-08-22")[0].attendees
  assert.ok(attendees.some((a) => a.userId === "me"), "the signed-in user is always kept")
})

test("omitting isVisible leaves trip RSVP grouping unchanged", () => {
  const out = groupByDayAndMountain({
    plans: [],
    trips: [{
      id: "t1", host_id: "u2", resort_key: "vail", ski_date: "2026-08-22", title: "T",
      host_profile: { id: "u2", full_name: "Rafe", avatar_url: null },
      rsvps: [{ user_id: "u3", status: "going", profile: { id: "u3", full_name: "Gaby", avatar_url: null } }],
    }],
    currentUserId: "me",
  })
  assert.equal(out.get("2026-08-22")[0].attendees.length, 2, "host + RSVP-er, same as before isVisible existed")
})

test("the Open group sorts last even when it has the most people", () => {
  const out = groupByDayAndMountain({
    plans: [
      p("u1", "2026-08-22", "open", "Amy"),
      p("u2", "2026-08-22", "open", "Ben"),
      p("u3", "2026-08-22", "open", "Cal"),
      p("u4", "2026-08-22", "open", "Dee"),
      p("u5", "2026-08-22", "coppermountain", "Eve"),
    ],
    trips: [], currentUserId: "me",
  })
  const groups = out.get("2026-08-22")
  assert.deepEqual(groups.map((g) => g.resortKey), ["coppermountain", "open"])
  assert.equal(groups[1].attendees.length, 4, "Open still holds everyone, it just sorts last")
})

test("Open sorts last against several mountains, which keep their headcount order", () => {
  const out = groupByDayAndMountain({
    plans: [
      p("u1", "2026-08-22", "open", "Amy"),
      p("u2", "2026-08-22", "vail", "Ben"),
      p("u3", "2026-08-22", "coppermountain", "Cal"),
      p("u4", "2026-08-22", "coppermountain", "Dee"),
    ],
    trips: [], currentUserId: "me",
  })
  assert.deepEqual(
    out.get("2026-08-22").map((g) => g.resortKey),
    ["coppermountain", "vail", "open"]
  )
})

test("a day of only Open still returns the group", () => {
  const out = groupByDayAndMountain({
    plans: [p("u1", "2026-08-22", "open", "Amy")],
    trips: [], currentUserId: "me",
  })
  assert.deepEqual(out.get("2026-08-22").map((g) => g.resortKey), ["open"])
})

// ── ETA on the calendar (TASK 19.3) ──────────────────────────────────────────

test("an attendee carries the eta from their plan row", () => {
  const out = groupByDayAndMountain({
    plans: [p("u1", "2026-08-22", "coppermountain", "Nate", at(9))],
  })
  const [group] = out.get("2026-08-22")
  assert.equal(group.attendees[0].eta, at(9))
})

test("an attendee with no eta gets null, not undefined", () => {
  const out = groupByDayAndMountain({
    plans: [p("u1", "2026-08-22", "coppermountain", "Nate")],
  })
  const [group] = out.get("2026-08-22")
  assert.equal(group.attendees[0].eta, null)
  assert.ok("eta" in group.attendees[0], "the key must exist so callers read it uniformly")
})

test("trip-derived attendees have a null eta", () => {
  // Hosts and RSVPs come from ski_trips, which carries no per-person ETA.
  const out = groupByDayAndMountain({
    trips: [{
      id: "t1", ski_date: "2026-08-22", resort_key: "vail", host_id: "h1",
      host_profile: { id: "h1", full_name: "Kyle" },
      rsvps: [{ user_id: "u9", status: "going", profile: { id: "u9", full_name: "Gaby" } }],
    }],
  })
  const [group] = out.get("2026-08-22")
  assert.deepEqual(group.attendees.map((a) => a.eta), [null, null])
})

test("earliestEta returns the earliest of several", () => {
  assert.equal(earliestEta([{ eta: at(10, 30) }, { eta: at(8, 45) }, { eta: at(9, 15) }]), at(8, 45))
})

test("earliestEta ignores attendees with no eta", () => {
  assert.equal(earliestEta([{ eta: null }, { eta: at(9) }, { eta: null }]), at(9))
})

test("earliestEta returns null when nobody set one", () => {
  // The card renders no ETA line at all in this case, so null is the signal.
  assert.equal(earliestEta([{ eta: null }, { eta: null }]), null)
  assert.equal(earliestEta([]), null)
})

test("earliestEta compares instants, not strings", () => {
  // Lexicographic ordering of ISO strings only holds when the offset format is
  // identical. These two are an hour apart but sort the wrong way as strings.
  const later = "2026-08-22T15:00:00.000Z"
  const earlier = "2026-08-22T14:00:00+00:00"
  assert.equal(earliestEta([{ eta: later }, { eta: earlier }]), earlier)
})

test("earliestEta skips an unparseable eta rather than throwing", () => {
  assert.equal(earliestEta([{ eta: "not a date" }, { eta: at(9) }]), at(9))
  assert.equal(earliestEta([{ eta: "not a date" }]), null)
})

// ── Parties: same mountain, separate groups (Sprint 38) ──────────────────────
//
// Kyle, 2026-08-25: "multiple groups will go to the same mountain, but they typically stay
// with their core crew, then link up." Being at Copper together is not being in a group
// together, and the card has to stop implying it is.

const member = (user_id, ski_date, party_id, owner_id = "owner1") => ({
  user_id, ski_date, party_id, party: { id: party_id, owner_id, name: null },
})

test("attendees carry the party they belong to that day", () => {
  const out = groupByDayAndMountain({
    plans: [p("u1", "2026-08-22", "coppermountain", "Nate")],
    partyMembers: [member("u1", "2026-08-22", "pA")],
  })
  assert.equal(out.get("2026-08-22")[0].attendees[0].partyId, "pA")
})

test("an attendee in no party has a null partyId", () => {
  const out = groupByDayAndMountain({
    plans: [p("u1", "2026-08-22", "coppermountain", "Nate")],
  })
  assert.equal(out.get("2026-08-22")[0].attendees[0].partyId, null)
})

test("membership is matched on user AND date, never user alone", () => {
  // The security rule this mirrors is date-scoped, and so is the display: being in someone's
  // party on Saturday must not group you with them on Sunday.
  const out = groupByDayAndMountain({
    plans: [
      p("u1", "2026-08-22", "coppermountain", "Nate"),
      p("u1", "2026-08-23", "coppermountain", "Nate"),
    ],
    partyMembers: [member("u1", "2026-08-22", "pA")],
  })
  assert.equal(out.get("2026-08-22")[0].attendees[0].partyId, "pA")
  assert.equal(out.get("2026-08-23")[0].attendees[0].partyId, null, "Sunday is a different day")
})

test("two parties at one mountain are two groups, not one crowd", () => {
  const out = groupByDayAndMountain({
    plans: [
      p("u1", "2026-08-22", "coppermountain", "Nate"),
      p("u2", "2026-08-22", "coppermountain", "Rafe"),
      p("u3", "2026-08-22", "coppermountain", "Gaby"),
    ],
    partyMembers: [
      member("u1", "2026-08-22", "pA", "u1"),
      member("u2", "2026-08-22", "pA", "u1"),
      member("u3", "2026-08-22", "pB", "u3"),
    ],
  })
  const [copper] = out.get("2026-08-22")
  assert.equal(copper.attendees.length, 3, "the mountain headcount still counts everyone")
  assert.equal(copper.parties.length, 2)
  assert.deepEqual(copper.parties.map((g) => g.partyId), ["pA", "pB"])
  assert.deepEqual(copper.parties.map((g) => g.attendees.length), [2, 1])
})

test("parties are sorted biggest first, ties broken on id so order never jitters", () => {
  const out = groupByDayAndMountain({
    plans: ["u1", "u2", "u3", "u4"].map((u, i) =>
      p(u, "2026-08-22", "coppermountain", `Skier${i}`)),
    partyMembers: [
      member("u1", "2026-08-22", "pZ", "u1"),
      member("u2", "2026-08-22", "pA", "u2"),
      member("u3", "2026-08-22", "pA", "u2"),
      member("u4", "2026-08-22", "pZ", "u1"),
    ],
  })
  assert.deepEqual(out.get("2026-08-22")[0].parties.map((g) => g.partyId), ["pA", "pZ"])
})

test("unaffiliated skiers are listed apart from every party", () => {
  const out = groupByDayAndMountain({
    plans: [
      p("u1", "2026-08-22", "coppermountain", "Nate"),
      p("u2", "2026-08-22", "coppermountain", "Rafe"),
    ],
    partyMembers: [member("u1", "2026-08-22", "pA", "u1")],
  })
  const [copper] = out.get("2026-08-22")
  assert.deepEqual(copper.parties.map((g) => g.partyId), ["pA"])
  assert.deepEqual(copper.solo.map((a) => a.userId), ["u2"])
})

test("a day with no parties at all reports every skier as solo", () => {
  const out = groupByDayAndMountain({
    plans: [
      p("u1", "2026-08-22", "coppermountain", "Nate"),
      p("u2", "2026-08-22", "coppermountain", "Rafe"),
    ],
  })
  const [copper] = out.get("2026-08-22")
  assert.deepEqual(copper.parties, [])
  assert.equal(copper.solo.length, 2)
})

test("a party spanning two mountains appears at each, with only its own people", () => {
  // Members can split up on the day. The party is who you are with, not where you ended up.
  const out = groupByDayAndMountain({
    plans: [
      p("u1", "2026-08-22", "coppermountain", "Nate"),
      p("u2", "2026-08-22", "vail", "Rafe"),
    ],
    partyMembers: [
      member("u1", "2026-08-22", "pA", "u1"),
      member("u2", "2026-08-22", "pA", "u1"),
    ],
  })
  const day = out.get("2026-08-22")
  const copper = day.find((g) => g.resortKey === "coppermountain")
  const vail = day.find((g) => g.resortKey === "vail")
  assert.deepEqual(copper.parties.map((g) => g.attendees.map((a) => a.userId)), [["u1"]])
  assert.deepEqual(vail.parties.map((g) => g.attendees.map((a) => a.userId)), [["u2"]])
})

test("a party group exposes its owner so the card can name it", () => {
  const out = groupByDayAndMountain({
    plans: [p("u1", "2026-08-22", "coppermountain", "Nate")],
    partyMembers: [member("u1", "2026-08-22", "pA", "owner9")],
  })
  assert.equal(out.get("2026-08-22")[0].parties[0].ownerId, "owner9")
})
