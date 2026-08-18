# Friends Calendar Implementation Plan (Sprint 35)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-08-18-friends-calendar-design.md` — read it first. Section
references below (§4.4, §5.3, decision #7) point into it.

**Goal:** Turn the Plans tab's calendar into a view that answers "where is everyone
skiing this weekend?" at a glance — mountains as headlines, the friends going stacked
underneath, filterable by crew, with one tap to join.

**Architecture:** Three dependency-free pure modules (`calendarGrouping`, `crewColors`,
a `weekBounds` addition to `calendarDates`) carry all the logic and are unit-tested with
Node's built-in test runner. Four new presentational components consume them, and one
orchestrator (`FriendsCalendar`) owns fetching and filter state. The existing
`PlanCalendar` is extended by one optional prop rather than forked, and the inline
`CalendarView` in `SkiPlansPage.jsx` is deleted.

**Tech Stack:** React 19 (no router), Supabase JS v2, Vite, inline `style={{}}` objects,
`node --test` (built into Node — **not** a new dependency).

## Global Constraints

Every task's requirements implicitly include this section.

- **No new npm dependencies.** `node --test` and `node:assert` ship with Node (v26.7.0
  verified on this machine). Adding a `"test"` script to `package.json` is allowed.
- **Inline styles only** — no CSS modules, no Tailwind, no new `.css` files.
- **Colors via `var(--color-*)` tokens**, except where a value feeds a hex-alpha template
  literal (`` `${c}22` ``), which must stay a literal hex. Crew colors are token strings
  and must **never** be concatenated with an alpha suffix.
- **`profiles` queries use explicit column lists.** Never `select("*")` on `profiles` —
  migration 031 revoked table-level SELECT. See `PROFILE_SELECT_COLUMNS` in
  `src/lib/socialApi.js`. (`select("*")` on `daily_plans` and `ski_trips` is fine.)
- **Date keys are built from local date parts, never `toISOString()`.** See the header
  comment in `src/lib/calendarDates.js`. Sprint 34 review finding #3 was this exact bug.
- **`npm run lint` baseline is 91 problems** as of `2fe6613`. Diff against that number,
  do not compare to zero.
- **Branch from `main`. Commit after every task.** Per project convention, pushing to
  `main` during beta is expected.
- **Prerequisite:** Task 1 of `docs/superpowers/plans/2026-08-18-sprint-35-social-tab-and-calendar.md`
  (FriendsPage per-block load resilience) lands **before** Task 8 here, which reuses its
  loader-registry pattern.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/calendarDates.js` | *modify* — add `weekBounds()`, `weekDayKeys()` |
| `src/lib/format.js` | *modify* — add `etaToTimeInput()`, shared by two call sites |
| `src/lib/crewColors.js` | *new, pure* — crew index → theme token; user → ring color |
| `src/lib/calendarGrouping.js` | *new, pure* — plans + trips → `Map<dateKey, MountainGroup[]>` |
| `src/lib/*.test.js` | *new* — Node test-runner unit tests for the three pure modules |
| `src/lib/socialApi.js` | *modify* — `getCrewMembers` status filter; `joinPlanAtResort()` |
| `src/components/calendar/DayPlanCard.jsx` | *new* — one mountain: name, count, rings, badge, "I'm in" |
| `src/components/calendar/WeekView.jsx` | *new* — responsive 7-column / stacked-row week |
| `src/components/calendar/CalendarFilterSheet.jsx` | *new* — the checkbox list |
| `src/components/calendar/FilterChipRow.jsx` | *new* — the always-visible chip row |
| `src/components/PlanCalendar.jsx` | *modify* — one optional `renderCellContent` prop |
| `src/components/FriendsCalendar.jsx` | *new* — orchestrator: fetching, filter state, view mode |
| `src/components/SkiPlansPage.jsx` | *modify* — mount it, delete `CalendarView` + old chips |
| `src/components/SkiPlansTab.jsx` | *modify* — import the shared `etaToTimeInput` |

---

## Task 1: Week date helpers

**Files:**
- Modify: `src/lib/calendarDates.js`
- Create: `src/lib/calendarDates.test.js`
- Modify: `package.json` (add a `test` script)

**Interfaces:**
- Consumes: existing `dateKeyOf()`, `localDateKey()` from `calendarDates.js`
- Produces:
  - `weekBounds(date) -> { start: string, end: string }` — inclusive `YYYY-MM-DD` keys for
    the Sunday–Saturday week containing `date`
  - `weekDayKeys(date) -> string[]` — the seven `YYYY-MM-DD` keys of that week, Sunday first

Weeks are **Sunday-start** to match the `Su Mo Tu We Th Fr Sa` header `PlanCalendar`
already renders. Do not use `toISOString()` anywhere — see Global Constraints.

- [ ] **Step 1: Add the test script to `package.json`**

In the `"scripts"` block, after `"lint"`:

```json
    "test": "node --test src/lib/*.test.js",
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/calendarDates.test.js`:

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `SyntaxError: The requested module './calendarDates.js' does not provide an export named 'weekBounds'`

- [ ] **Step 4: Implement**

Append to `src/lib/calendarDates.js`:

```js
/**
 * First and last date key of the Sunday–Saturday week containing `d`.
 *
 * Sunday-start matches the "Su Mo Tu We Th Fr Sa" header PlanCalendar renders,
 * so the week view and the month grid never disagree about which column a day
 * belongs in.
 *
 * Built from local date parts for the same reason documented at the top of this
 * file: toISOString() shifts a day east of Greenwich for every negative-offset
 * timezone, which is all of Colorado.
 */
export function weekBounds(d) {
  const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
  const saturday = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 6)
  return { start: localDateKey(sunday), end: localDateKey(saturday) }
}

/** The seven date keys of the week containing `d`, Sunday first. */
export function weekDayKeys(d) {
  const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
  return Array.from({ length: 7 }, (_, i) =>
    localDateKey(new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i))
  )
}
```

The `new Date(y, m, day + n)` form is deliberate: JS normalizes out-of-range day
numbers across month and year boundaries, which is what makes the boundary tests pass
without any special-casing.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 7 tests.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: 91 problems (the baseline) — no new ones.

- [ ] **Step 7: Commit**

```bash
git add src/lib/calendarDates.js src/lib/calendarDates.test.js package.json
git commit -m "feat: add weekBounds/weekDayKeys with node --test unit tests"
```

---

## Task 2: Crew color resolution

**Files:**
- Create: `src/lib/crewColors.js`
- Create: `src/lib/crewColors.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `CREW_COLOR_VARS: string[]` — six `var(--color-*)` strings
  - `SELF_RING: string`, `NEUTRAL_RING: string`
  - `crewColor(stableIndex: number) -> string`
  - `ringColorFor(userId: string, ctx) -> string` where
    `ctx = { currentUserId, selectedCrewIds: string[], crewIndexById: Map<string,number>, crewMemberIds: Map<string, Set<string>> }`

**Two subtleties this task exists to get right:**

1. **Color comes from a crew's *stable* index** (its position in `getMyCrews()` order),
   never from its position among the *selected* crews. Otherwise every color shuffles
   when you toggle a chip, and the legend lies.
2. **`SELF_RING` must not collide with any crew slot.** Slot 0 is `--color-accent`, so
   "you" uses `--color-text-1` instead — near-white in every theme, unmistakably
   distinct from the six accents.

- [ ] **Step 1: Write the failing test**

Create `src/lib/crewColors.test.js`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  CREW_COLOR_VARS, SELF_RING, NEUTRAL_RING, crewColor, ringColorFor,
} from "./crewColors.js"

const ctx = {
  currentUserId: "me",
  selectedCrewIds: ["crewA", "crewB"],
  crewIndexById: new Map([["crewA", 0], ["crewB", 1], ["crewC", 2]]),
  crewMemberIds: new Map([
    ["crewA", new Set(["me", "rafe", "gaby"])],
    ["crewB", new Set(["gaby", "kramer"])],
    ["crewC", new Set(["nate"])],
  ]),
}

test("the six crew slots are all distinct theme tokens", () => {
  assert.equal(CREW_COLOR_VARS.length, 6)
  assert.equal(new Set(CREW_COLOR_VARS).size, 6)
  CREW_COLOR_VARS.forEach((c) => assert.match(c, /^var\(--color-[a-z0-9-]+\)$/))
})

test("SELF_RING does not collide with any crew slot", () => {
  assert.ok(!CREW_COLOR_VARS.includes(SELF_RING))
})

test("crewColor wraps past six crews", () => {
  assert.equal(crewColor(0), CREW_COLOR_VARS[0])
  assert.equal(crewColor(6), CREW_COLOR_VARS[0])
  assert.equal(crewColor(7), CREW_COLOR_VARS[1])
})

test("the signed-in user always gets SELF_RING, even inside a selected crew", () => {
  assert.equal(ringColorFor("me", ctx), SELF_RING)
})

test("a member of exactly one selected crew gets that crew's color", () => {
  assert.equal(ringColorFor("rafe", ctx), crewColor(0))
})

test("a member of two selected crews takes the first in filter order", () => {
  assert.equal(ringColorFor("gaby", ctx), crewColor(0))
  assert.equal(ringColorFor("gaby", { ...ctx, selectedCrewIds: ["crewB", "crewA"] }), crewColor(1))
})

test("color follows the STABLE crew index, not the selected position", () => {
  // Only crewB is selected. Its color must still be slot 1 — the slot it owns
  // in getMyCrews() order — not slot 0 just because it is first in the filter.
  assert.equal(ringColorFor("kramer", { ...ctx, selectedCrewIds: ["crewB"] }), crewColor(1))
})

test("a friend in no selected crew gets the neutral ring", () => {
  assert.equal(ringColorFor("nate", ctx), NEUTRAL_RING)
})

test("an unknown user gets the neutral ring rather than throwing", () => {
  assert.equal(ringColorFor("stranger", ctx), NEUTRAL_RING)
})

test("crewBadgesFor lists every selected crew a user belongs to", async () => {
  const { crewBadgesFor } = await import("./crewColors.js")
  assert.deepEqual(crewBadgesFor("gaby", ctx), ["crewA", "crewB"])
  assert.deepEqual(crewBadgesFor("nate", ctx), [])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module .../crewColors.js`

- [ ] **Step 3: Implement**

Create `src/lib/crewColors.js`:

```js
/**
 * Crew → color mapping for the friends calendar.
 *
 * Spec decision #6: color encodes CREW. Decision #7: the color rides the person
 * (an avatar ring), never the mountain card — a mountain can hold skiers from two
 * crews, so a card cannot take one color without an arbitrary tie-break.
 *
 * Every value here is a `var(--color-*)` token that src/index.css already
 * redefines per [data-theme], so all five themes reskin the calendar for free and
 * any theme added later works with no change to this file. That is also why there
 * is no JS color math and no getComputedStyle: nothing here needs to know what the
 * token resolves to.
 *
 * These strings must never be concatenated with a hex alpha suffix (`${c}22`) —
 * var() references break when suffixed. Use a separate rgba overlay instead.
 */

export const CREW_COLOR_VARS = [
  "var(--color-accent)",
  "var(--color-accent-2)",
  "var(--color-accent-soft)",
  "var(--color-accent-strong)",
  "var(--color-accent-teal)",
  "var(--color-accent-deep)",
]

/**
 * You. Deliberately NOT a member of CREW_COLOR_VARS — slot 0 is --color-accent,
 * so reusing it would make "me" indistinguishable from the first crew.
 */
export const SELF_RING = "var(--color-text-1)"

/** A friend visible via "All Friends" but in no selected crew. */
export const NEUTRAL_RING = "var(--color-text-3)"

/**
 * @param {number} stableIndex position in getMyCrews() order — NOT position among
 *   the selected crews. Using the selected position would reshuffle every color
 *   whenever a chip is toggled.
 */
export function crewColor(stableIndex) {
  return CREW_COLOR_VARS[stableIndex % CREW_COLOR_VARS.length]
}

/**
 * @typedef {Object} CrewColorContext
 * @property {string|null} currentUserId
 * @property {string[]} selectedCrewIds  crew ids currently toggled on, in chip order
 * @property {Map<string, number>} crewIndexById  crew id → stable index
 * @property {Map<string, Set<string>>} crewMemberIds  crew id → member user ids
 */

/**
 * Ring color for one person, per spec §4.6:
 *   1. the signed-in user  → SELF_RING
 *   2. one selected crew   → that crew's stable color
 *   3. two or more         → the first in chip order (the rest survive as badges)
 *   4. none                → NEUTRAL_RING
 *
 * @param {string} userId
 * @param {CrewColorContext} ctx
 */
export function ringColorFor(userId, ctx) {
  if (userId && userId === ctx.currentUserId) return SELF_RING
  for (const crewId of ctx.selectedCrewIds) {
    if (ctx.crewMemberIds.get(crewId)?.has(userId)) {
      return crewColor(ctx.crewIndexById.get(crewId) ?? 0)
    }
  }
  return NEUTRAL_RING
}

/**
 * Every selected crew this user belongs to, in chip order. The ring can only show
 * one; the day panel uses this so the other memberships are not lost.
 *
 * @param {string} userId
 * @param {CrewColorContext} ctx
 * @returns {string[]} crew ids
 */
export function crewBadgesFor(userId, ctx) {
  return ctx.selectedCrewIds.filter((crewId) => ctx.crewMemberIds.get(crewId)?.has(userId))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 17 tests total (7 from Task 1 + 10 here).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: 91 problems.

- [ ] **Step 6: Commit**

```bash
git add src/lib/crewColors.js src/lib/crewColors.test.js
git commit -m "feat: add theme-token crew color resolution"
```

---

## Task 3: Grouping plans and trips by day and mountain

**Files:**
- Create: `src/lib/calendarGrouping.js`
- Create: `src/lib/calendarGrouping.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `groupByDayAndMountain({ plans, trips, currentUserId }) -> Map<string, MountainGroup[]>`
  - `totalAttendees(groups: MountainGroup[]) -> number`

```js
/**
 * @typedef {Object} Attendee
 * @property {string} userId
 * @property {Object|null} profile   // { id, full_name, username, avatar_url, first_name? }
 *
 * @typedef {Object} MountainGroup
 * @property {string} resortKey
 * @property {Attendee[]} attendees  // deduped by userId; the signed-in user first
 * @property {Object|null} trip      // the ski_trips row whose badge this card shows
 */
```

**Input shapes, verified against the current code — do not guess:**

- A plan row from `getVisiblePlansInRange()` (`socialApi.js:629`) has
  `{ id, user_id, ski_date, resort_key, eta, note, status, visibility, arrived_at, profile }`,
  where `profile` is `{ id, first_name, last_name, full_name, username, avatar_url, favorite_mountain }`.
- A trip from `getAllVisibleTrips()` (`socialApi.js:1478`, enriched at `:1392`) has
  `{ id, host_id, resort_key, ski_date, title, status, ..., host_profile, rsvps }`, where
  `rsvps` is `[{ user_id, status, profile }]` and `status` is one of `going | maybe | out`.
- **`ski_date` may carry a time component.** Always `.slice(0, 10)` it.

**Rules:**

- Group key is the date; within a day, group by `resort_key`.
- A trip merges into the group for its own resort, creating that group if no plan exists
  there (spec decision #10). Its host and its `going` RSVPs become attendees.
- `maybe` and `out` RSVPs do **not** count. A headcount that includes maybes is a lie,
  and the whole feature is a counting exercise.
- Attendees dedupe by `userId` — someone with both a plan and a trip RSVP counts once.
- Groups sort by `attendees.length` descending; ties break by `resortKey` ascending so
  the order is deterministic across renders.
- Within a group the signed-in user sorts first, then everyone else by display name.
- Rows with no `resort_key` are skipped, not grouped under `undefined`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/calendarGrouping.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module .../calendarGrouping.js`

- [ ] **Step 3: Implement**

Create `src/lib/calendarGrouping.js`:

```js
/**
 * Reshapes daily_plans rows and ski_trips rows into the calendar's display model:
 * one entry per (day, mountain), with everyone going stacked underneath.
 *
 * Mountain-as-headline is the whole point of the feature (spec decision #2): the
 * question users ask is "which mountain won", and per-person rows make them do the
 * grouping in their heads.
 *
 * Pure. No React, no Supabase, no Date-of-today — every input is a parameter, which
 * is what makes it unit-testable without a browser.
 */

/** ski_date can arrive as a date or a timestamp. Always key on the date part. */
function dayKey(skiDate) {
  return (skiDate || "").slice(0, 10)
}

function displayName(profile) {
  return profile?.full_name || profile?.username || "Someone"
}

/**
 * @param {Object} input
 * @param {Array} input.plans   rows from getVisiblePlansInRange()
 * @param {Array} input.trips   enriched rows from getAllVisibleTrips()
 * @param {string|null} input.currentUserId
 * @returns {Map<string, Array>} date key → MountainGroup[], busiest mountain first
 */
export function groupByDayAndMountain({ plans = [], trips = [], currentUserId = null }) {
  // day key → resort key → { resortKey, byUser: Map, trip }
  const days = new Map()

  function bucket(day, resortKey) {
    if (!day || !resortKey) return null
    if (!days.has(day)) days.set(day, new Map())
    const byResort = days.get(day)
    if (!byResort.has(resortKey)) {
      byResort.set(resortKey, { resortKey, byUser: new Map(), trip: null })
    }
    return byResort.get(resortKey)
  }

  for (const plan of plans) {
    const g = bucket(dayKey(plan.ski_date), plan.resort_key)
    if (!g) continue
    g.byUser.set(plan.user_id, { userId: plan.user_id, profile: plan.profile || null })
  }

  for (const trip of trips) {
    const g = bucket(dayKey(trip.ski_date), trip.resort_key)
    if (!g) continue
    // Last trip wins if two land on the same resort and day — vanishingly rare,
    // and the badge only has room for one.
    g.trip = trip
    if (trip.host_id && !g.byUser.has(trip.host_id)) {
      g.byUser.set(trip.host_id, { userId: trip.host_id, profile: trip.host_profile || null })
    }
    for (const rsvp of trip.rsvps || []) {
      // "maybe" and "out" are not attendance. A headcount that counts maybes is
      // a lie, and this whole view is a counting exercise.
      if (rsvp.status !== "going") continue
      if (g.byUser.has(rsvp.user_id)) continue
      g.byUser.set(rsvp.user_id, { userId: rsvp.user_id, profile: rsvp.profile || null })
    }
  }

  const out = new Map()
  for (const [day, byResort] of days) {
    const groups = [...byResort.values()].map((g) => ({
      resortKey: g.resortKey,
      trip: g.trip,
      attendees: [...g.byUser.values()].sort((a, b) => {
        if (a.userId === currentUserId) return -1
        if (b.userId === currentUserId) return 1
        return displayName(a.profile).localeCompare(displayName(b.profile))
      }),
    }))
    // Busiest mountain first — this is the single most important sort in the
    // feature, because it is literally the answer. Ties break on resortKey so the
    // order does not jitter between renders.
    groups.sort((a, b) =>
      b.attendees.length - a.attendees.length || a.resortKey.localeCompare(b.resortKey)
    )
    out.set(day, groups)
  }
  return out
}

/** Distinct people across every mountain in one day. */
export function totalAttendees(groups = []) {
  const ids = new Set()
  for (const g of groups) for (const a of g.attendees) ids.add(a.userId)
  return ids.size
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 29 tests total.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: 91 problems.

- [ ] **Step 6: Commit**

```bash
git add src/lib/calendarGrouping.js src/lib/calendarGrouping.test.js
git commit -m "feat: group plans and trips by day and mountain"
```

---

## Task 4: API — crew status filter, shared ETA helper, and the join write path

**Files:**
- Modify: `src/lib/socialApi.js` (`getCrewMembers` at ~line 2958; add `joinPlanAtResort`)
- Modify: `src/lib/format.js` (add `etaToTimeInput`)
- Modify: `src/components/SkiPlansTab.jsx` (delete its local copy, import the shared one)

**Interfaces:**
- Consumes: existing `getMyDailyPlan(skiDate)`, `upsertDailyPlan(plan)`
- Produces:
  - `etaToTimeInput(iso: string|null) -> string|null` from `lib/format.js`
  - `joinPlanAtResort(skiDate: string, resortKey: string) -> Promise<Object>` from `lib/socialApi.js`
  - `getCrewMembers(crewId)` unchanged in signature, now active-members-only

**Why each piece exists:**

1. **`getCrewMembers` returns pending invitees.** It neither selects nor filters
   `crew_members.status` (ROADMAP TASK 18.2). Harmless until now — RLS still refuses a
   pending member's rows — but crew colors make it visible: someone who never accepted
   your invite would be colored into your crew and counted in the chip.
2. **`upsertDailyPlan` writes the whole row** (`onConflict: "user_id,ski_date"`), so every
   omitted field is written as `null`. "I'm in" must merge, or joining a mountain silently
   wipes your ETA, note and check-in — the trap already documented at `SkiPlansTab.jsx:23-35`.
3. **The ETA needs converting on the way back in.** `upsertDailyPlan` re-parses `eta`
   through `buildPlanEta()`, which accepts only `"HH:MM"` or `"H:MM AM/PM"` and returns
   `null` for an ISO timestamp. Passing the stored `timestamptz` straight back through
   therefore blanks it. `SkiPlansTab` already solves this with a local `etaToTimeInput`;
   this task lifts that into `lib/format.js` so both callers share one copy.

- [ ] **Step 1: Move `etaToTimeInput` into `lib/format.js`**

Append to `src/lib/format.js`:

```js
/**
 * daily_plans.eta is stored as a timestamptz, but upsertDailyPlan re-parses whatever
 * it is handed through buildPlanEta(), which accepts only "HH:MM" or "H:MM AM/PM" and
 * returns null for anything else — including an ISO timestamp.
 *
 * So any code path that reads a plan and writes it back MUST convert first, or it
 * silently blanks an ETA the user set. Shared by SkiPlansTab's editor and by
 * joinPlanAtResort's "I'm in".
 */
export function etaToTimeInput(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}
```

- [ ] **Step 2: Point `SkiPlansTab` at the shared helper**

In `src/components/SkiPlansTab.jsx`, delete the local `etaToTimeInput` function and its
doc comment (~lines 23-35) and add it to the existing `format` import:

```jsx
import { formatDate, etaToTimeInput } from "../lib/format"
```

- [ ] **Step 3: Filter `getCrewMembers` to active members**

In `src/lib/socialApi.js`, replace the body of `getCrewMembers`:

```js
export async function getCrewMembers(crewId) {
  const { data, error } = await supabase
    .from("crew_members")
    .select(`
      id, role, joined_at, status,
      profile:user_id ( id, full_name, username, avatar_url, skill_level )
    `)
    .eq("crew_id", crewId)
    // ROADMAP 18.2: without this, invitees who never accepted come back as members.
    // Latent until Sprint 35 — RLS refuses their rows anyway — but the friends
    // calendar colors members by crew and counts them in the chip, so a pending
    // invitee would appear to be in your crew. shares_crew_with() already requires
    // 'active' on both sides, so this makes the client agree with the database.
    .eq("status", "active")
  if (error) throw error
  return data || []
}
```

- [ ] **Step 4: Add the join write path**

Add to `src/lib/socialApi.js`, immediately after `upsertDailyPlan`:

```js
/**
 * "I'm in" — set my mountain for a day I am looking at on the friends calendar.
 *
 * daily_plans is unique on (user_id, ski_date), so joining a mountain IS setting my
 * plan for that day. No RSVP table, no second concept.
 *
 * Reads first and merges, because upsertDailyPlan writes the whole row: without the
 * spread, tapping "I'm in" on a day I had already planned with an ETA would null the
 * ETA, the note and the check-in. The eta round-trip needs etaToTimeInput or
 * buildPlanEta rejects the stored ISO timestamp and writes null anyway.
 */
export async function joinPlanAtResort(skiDate, resortKey) {
  const existing = await getMyDailyPlan(skiDate)
  return upsertDailyPlan({
    ...(existing || {}),
    ski_date: skiDate,
    resort_key: resortKey,
    eta: etaToTimeInput(existing?.eta),
    visibility: existing?.visibility || "friends",
  })
}
```

Add `etaToTimeInput` to `socialApi.js`'s existing import from `./format`. If there is no
such import yet, add:

```js
import { etaToTimeInput } from "./format"
```

- [ ] **Step 5: Verify nothing regressed in the existing editor**

Run: `npm run dev`, open Profile → 📅 Ski Plans, pick a future day, save a resort, then
edit that same day and save again.
Expected: the ETA you set survives the second save. This exercises the moved helper on
its original call site before anything new depends on it.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: 91 problems.

- [ ] **Step 7: Commit**

```bash
git add src/lib/socialApi.js src/lib/format.js src/components/SkiPlansTab.jsx
git commit -m "fix: scope getCrewMembers to active; add joinPlanAtResort (ROADMAP 18.2)"
```

---

## Task 5: The mountain card

**Files:**
- Create: `src/components/calendar/DayPlanCard.jsx`

**Interfaces:**
- Consumes: `ringColorFor`, `crewBadgesFor` (Task 2); `resortName`, `resortEmoji` from
  `lib/resorts`; `Avatar` from `components/ui/Avatar`; `useProfileNav` from `lib/profileNav`
- Produces:

```jsx
<DayPlanCard
  group={MountainGroup}          // from Task 3
  colorCtx={CrewColorContext}    // from Task 2
  currentUserId={string|null}
  canJoin={boolean}              // false for past dates and logged-out users
  joining={boolean}              // shows the pending state on this card
  onJoin={(resortKey) => void}
  onOpenTrip={(trip) => void}
  compact={boolean}              // true inside a narrow week column
/>
```

The card is the atom of the whole feature and is reused unchanged in the week view, in
the month view's day panel, and in the mobile day rows. Spec §4.4.

- [ ] **Step 1: Create the component**

Create `src/components/calendar/DayPlanCard.jsx`:

```jsx
import { resortName, resortEmoji } from "../../lib/resorts"
import { ringColorFor } from "../../lib/crewColors"
import { useProfileNav } from "../../lib/profileNav"
import Avatar from "../ui/Avatar"

const MAX_AVATARS = 6
const MAX_NAMES = 3

function shortName(profile) {
  return profile?.first_name || profile?.full_name?.split(" ")[0] || profile?.username || "Someone"
}

/**
 * One mountain on one day: who is going, whether there is a trip for it, and a way
 * to join.
 *
 * The card surface is deliberately NEUTRAL — never a crew color. A mountain can hold
 * skiers from two different crews, so coloring the card would need an arbitrary
 * tie-break (spec decision #7). The crew color rides each person's avatar ring
 * instead, which is never ambiguous.
 */
export default function DayPlanCard({
  group, colorCtx, currentUserId, canJoin = false, joining = false,
  onJoin, onOpenTrip, compact = false,
}) {
  const openProfile = useProfileNav()
  const { resortKey, attendees, trip } = group
  const alreadyIn = attendees.some((a) => a.userId === currentUserId)
  const shown = attendees.slice(0, MAX_AVATARS)
  const overflow = attendees.length - shown.length
  const names = attendees.slice(0, MAX_NAMES).map((a) => shortName(a.profile)).join(", ")
  const nameOverflow = attendees.length - Math.min(attendees.length, MAX_NAMES)

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        padding: compact ? "9px 10px" : "12px 14px",
        display: "grid",
        gap: 8,
      }}
    >
      {/* Mountain headline + headcount */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div style={{
          fontSize: compact ? 12 : 14, fontWeight: 800, color: "var(--color-text-1)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {resortEmoji(resortKey)} {resortName(resortKey) || resortKey}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-3)", flexShrink: 0 }}>
          {attendees.length} going
        </div>
      </div>

      {/* Trip badge — a trip at this resort folds into this card rather than
          sitting beside it, so one day's answer is not split across two lists. */}
      {trip && (
        <button
          onClick={() => onOpenTrip?.(trip)}
          style={{
            justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 6,
            background: "var(--color-accent-dim)", border: "1px solid var(--color-border)",
            borderRadius: 999, padding: "3px 10px", cursor: "pointer",
            fontSize: 10, fontWeight: 800, color: "var(--color-text-1)",
            maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          🎿 TRIP · {trip.title || "Untitled"}
        </button>
      )}

      {/* Avatars, ringed by crew */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        {shown.map((a) => (
          <button
            key={a.userId}
            onClick={() => a.userId !== currentUserId && openProfile(a.userId)}
            title={a.profile?.full_name || a.profile?.username || "Someone"}
            style={{
              background: "none", border: "none", padding: 0, lineHeight: 0,
              cursor: a.userId === currentUserId ? "default" : "pointer",
              borderRadius: "50%",
              boxShadow: `0 0 0 2px ${ringColorFor(a.userId, colorCtx)}`,
            }}
          >
            <Avatar profile={a.profile} size={compact ? 22 : 26} />
          </button>
        ))}
        {overflow > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-3)" }}>+{overflow}</span>
        )}
      </div>

      {/* Names */}
      <div style={{ fontSize: 11, color: "var(--color-text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {names}{nameOverflow > 0 ? `, +${nameOverflow}` : ""}
      </div>

      {/* Join — hidden once you are on this mountain, and on past dates */}
      {canJoin && !alreadyIn && (
        <button
          onClick={() => onJoin?.(resortKey)}
          disabled={joining}
          style={{
            justifySelf: "end", background: "var(--gradient-cta)", color: "white",
            border: "none", borderRadius: 10, padding: "8px 14px",
            fontSize: 12, fontWeight: 800, minHeight: 44,
            cursor: joining ? "wait" : "pointer", opacity: joining ? 0.6 : 1,
          }}
        >
          {joining ? "Joining…" : "I'm in"}
        </button>
      )}
      {alreadyIn && (
        <div style={{ justifySelf: "end", fontSize: 11, fontWeight: 800, color: "var(--color-success)" }}>
          ✓ You're in
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 91 problems.

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/DayPlanCard.jsx
git commit -m "feat: add the mountain card with crew-ringed avatars and trip badge"
```

*(The card is rendered for the first time in Task 6, which is where it gets its browser
verification. There is nothing to look at yet — do not add a throwaway mount for it.)*

---

## Task 6: Week view

**Files:**
- Create: `src/components/calendar/WeekView.jsx`

**Interfaces:**
- Consumes: `weekDayKeys` (Task 1), `DayPlanCard` (Task 5), `useMobile` from `lib/useMobile`,
  `formatDate` from `lib/format`
- Produces:

```jsx
<WeekView
  anchorDate={Date}                       // any date inside the week to render
  groupsByDay={Map<string, MountainGroup[]>}   // from Task 3
  colorCtx={CrewColorContext}
  currentUserId={string|null}
  todayKey={string}
  joiningKey={string|null}                // `${dateKey}|${resortKey}` currently saving
  onJoin={(dateKey, resortKey) => void}
  onOpenTrip={(trip) => void}
/>
```

Two orientations, one data path. Desktop gets the 7-column scan from the mockup; mobile
gets full-width rows, because a phone column is ~50px and neither mountain names nor
skier names fit in one.

- [ ] **Step 1: Create the component**

Create `src/components/calendar/WeekView.jsx`:

```jsx
import { weekDayKeys } from "../../lib/calendarDates"
import { useMobile } from "../../lib/useMobile"
import DayPlanCard from "./DayPlanCard"

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

function dayNumber(dateKey) {
  return Number(dateKey.slice(8, 10))
}

/**
 * The week the mockup asked for, minus the hour grid.
 *
 * The mockup is a Google Calendar screenshot whose annotated blocks sit at ~9:30,
 * ~9:00 and ~10:30 — arbitrary positions. daily_plans has an optional `eta` and
 * nothing else, and most rows have none, so a time axis would carry no information
 * while spending ~90% of the viewport on empty rows.
 */
export default function WeekView({
  anchorDate, groupsByDay, colorCtx, currentUserId, todayKey,
  joiningKey, onJoin, onOpenTrip,
}) {
  const isMobile = useMobile()
  const keys = weekDayKeys(anchorDate)

  if (isMobile) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        {keys.map((key, i) => {
          const groups = groupsByDay.get(key) || []
          const isToday = key === todayKey
          const isWeekend = i === 0 || i === 6

          // Empty weekdays collapse to one thin line. At full height, four of them
          // push Saturday — the day people are actually deciding about — below the
          // fold on a phone.
          if (groups.length === 0) {
            return (
              <div key={key} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 12px", fontSize: 11,
                color: isToday ? "var(--color-text-2)" : "var(--color-text-muted)",
              }}>
                <span style={{ fontWeight: 800 }}>{DOW[i]} {dayNumber(key)}</span>
                <span>— no plans —</span>
              </div>
            )
          }

          return (
            <div key={key} style={{
              background: isWeekend ? "var(--color-surface)" : "transparent",
              border: `1px solid ${isToday ? "var(--color-accent)" : "var(--color-border-subtle)"}`,
              borderRadius: 16, padding: "12px 12px 14px", display: "grid", gap: 8,
            }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "var(--color-text-1)", letterSpacing: 0.4 }}>
                {DOW[i]} {dayNumber(key)}{isToday ? " · TODAY" : ""}
              </div>
              {groups.map((g) => (
                <DayPlanCard
                  key={`${key}-${g.resortKey}`}
                  group={g}
                  colorCtx={colorCtx}
                  currentUserId={currentUserId}
                  canJoin={Boolean(currentUserId) && key >= todayKey}
                  joining={joiningKey === `${key}|${g.resortKey}`}
                  onJoin={(resortKey) => onJoin?.(key, resortKey)}
                  onOpenTrip={onOpenTrip}
                />
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6, alignItems: "start" }}>
      {keys.map((key, i) => {
        const groups = groupsByDay.get(key) || []
        const isToday = key === todayKey
        const isWeekend = i === 0 || i === 6
        return (
          <div key={key} style={{
            background: isWeekend ? "var(--color-surface)" : "transparent",
            border: `1px solid ${isToday ? "var(--color-accent)" : "var(--color-border-subtle)"}`,
            borderRadius: 14, padding: 8, minHeight: 120, display: "grid",
            gap: 6, alignContent: "start",
          }}>
            <div style={{ textAlign: "center", fontSize: 10, fontWeight: 800, color: "var(--color-text-3)" }}>
              {DOW[i]}
            </div>
            <div style={{
              textAlign: "center", fontSize: 16, fontWeight: 900,
              color: isToday ? "var(--color-accent)" : "var(--color-text-1)", marginBottom: 2,
            }}>
              {dayNumber(key)}
            </div>
            {groups.length === 0 ? (
              <div style={{ textAlign: "center", fontSize: 10, color: "var(--color-text-muted)" }}>—</div>
            ) : groups.map((g) => (
              <DayPlanCard
                key={`${key}-${g.resortKey}`}
                group={g}
                colorCtx={colorCtx}
                currentUserId={currentUserId}
                canJoin={Boolean(currentUserId) && key >= todayKey}
                joining={joiningKey === `${key}|${g.resortKey}`}
                onJoin={(resortKey) => onJoin?.(key, resortKey)}
                onOpenTrip={onOpenTrip}
                compact
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
```

Note `canJoin={... && key >= todayKey}` — date keys are `YYYY-MM-DD`, so string
comparison is chronological. That is why the format is fixed-width.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 91 problems.

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/WeekView.jsx
git commit -m "feat: add responsive week view"
```

---

## Task 7: Month cell content

**Files:**
- Modify: `src/components/PlanCalendar.jsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `PlanCalendar` accepts one new **optional** prop,
  `renderCellContent(dateKey, entries) -> ReactNode`. When supplied it replaces the dot
  row inside a day cell; when omitted the dot row renders exactly as today.

`PlanCalendar` is extended, not forked. It is already generic over `entriesByDate`,
`dotColorFor` and `renderDayDetail`; the only thing it cannot do is render inside a
cell. Profile → 📅 Ski Plans (`SkiPlansTab`) passes nothing and must keep its current
dots — forking would leave two month grids to keep in sync, which is the bug class that
made Sprint 34 mostly repair work.

- [ ] **Step 1: Add the prop**

In `src/components/PlanCalendar.jsx`, add `renderCellContent` to the destructured props:

```jsx
export default function PlanCalendar({
  entriesByDate,
  dotColorFor,
  legend = [],
  onSelectDay,
  renderDayDetail,
  renderCellContent,
  selectedDate = null,
  initialMonth,
  onMonthChange,
}) {
```

- [ ] **Step 2: Use it in the cell**

Replace the dot-row block (currently `{dotColors.length > 0 && (...)}`, ~lines 127-133) with:

```jsx
              {renderCellContent
                ? renderCellContent(key, dayEntries)
                : dotColors.length > 0 && (
                    <div style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
                      {dotColors.map((color) => (
                        <div key={color} style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                      ))}
                    </div>
                  )}
```

- [ ] **Step 3: Raise the cell height when a renderer is supplied**

Month chips need more room than dots. In the day `<button>`'s style, change:

```jsx
                minHeight: 46,
```

to:

```jsx
                minHeight: renderCellContent ? 78 : 46,
```

- [ ] **Step 4: Verify the existing caller is unchanged**

Run: `npm run dev`, open Profile → 📅 Ski Plans.
Expected: the month grid looks exactly as it did before — cyan dots on planned days,
46px cells, month navigation working. This prop is additive; if anything moved, the
change is wrong.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: 91 problems.

- [ ] **Step 6: Commit**

```bash
git add src/components/PlanCalendar.jsx
git commit -m "feat: add optional renderCellContent prop to PlanCalendar"
```

---

## Task 8: Filter chip row and filter sheet

**Files:**
- Create: `src/components/calendar/FilterChipRow.jsx`
- Create: `src/components/calendar/CalendarFilterSheet.jsx`

**Interfaces:**
- Consumes: `crewColor` (Task 2), `useMobile`, `Avatar`
- Produces:

```jsx
<FilterChipRow
  crews={[{ id, name, emoji }]}            // getMyCrews() order — the stable order
  selected={Set<string>}                   // "me" | "friends" | "crew:<id>" | "friend:<id>"
  onToggle={(key) => void}
  onOpenSheet={() => void}
  friendFilterCount={number}               // how many "friend:" keys are active
/>

<CalendarFilterSheet
  crews={[{ id, name, emoji }]}
  crewMemberIds={Map<string, Set<string>>}
  friends={[{ id, full_name, username, avatar_url }]}   // getAcceptedFriends()
  selected={Set<string>}
  onToggle={(key) => void}
  onClose={() => void}
/>
```

Filter keys keep the exact shape `SkiPlansPage` already uses (`"me"`, `"friends"`,
`"crew:<id>"`), extended with `"friend:<id>"`. That is what lets Task 10 rewire the
existing `inScope()` helper instead of rewriting it.

- [ ] **Step 1: Create the chip row**

Create `src/components/calendar/FilterChipRow.jsx`:

```jsx
import { crewColor } from "../../lib/crewColors"

function Chip({ active, tint, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0, borderRadius: 999, padding: "7px 14px", minHeight: 44,
        fontSize: 12, fontWeight: 700, cursor: "pointer",
        border: `1px solid ${active ? (tint || "var(--color-accent)") : "var(--color-border)"}`,
        background: active ? "var(--color-accent-dim)" : "transparent",
        color: active ? "var(--color-text-1)" : "var(--color-text-3)",
        display: "inline-flex", alignItems: "center", gap: 6,
      }}
    >
      {tint && (
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: tint, flexShrink: 0 }} />
      )}
      {children}
    </button>
  )
}

/**
 * The mockup's left sidebar, rewritten for a phone.
 *
 * Google Calendar can afford an always-visible checkbox column because it is a
 * two-pane desktop app. This app is mobile-first with a bottom nav, so the everyday
 * toggles live in a horizontal chip row and the full per-friend list lives behind
 * the Filter button (CalendarFilterSheet).
 */
export default function FilterChipRow({ crews = [], selected, onToggle, onOpenSheet, friendFilterCount = 0 }) {
  return (
    <div style={{
      display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4,
      scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
    }}>
      <Chip active={selected.has("me")} onClick={() => onToggle("me")}>🙋 Me</Chip>
      <Chip active={selected.has("friends")} onClick={() => onToggle("friends")}>👥 All Friends</Chip>
      {crews.map((c, i) => (
        <Chip
          key={c.id}
          active={selected.has(`crew:${c.id}`)}
          tint={crewColor(i)}
          onClick={() => onToggle(`crew:${c.id}`)}
        >
          {c.emoji || "🤙"} {c.name}
        </Chip>
      ))}
      <Chip active={friendFilterCount > 0} onClick={onOpenSheet}>
        ☰ Filter{friendFilterCount > 0 ? ` (${friendFilterCount})` : ""}
      </Chip>
    </div>
  )
}
```

The crew's color comes from its index `i` in the `crews` array — the `getMyCrews()`
order — which is the same stable index `crewIndexById` carries in Task 2. The chip and
the avatar ring therefore always agree.

- [ ] **Step 2: Create the sheet**

Create `src/components/calendar/CalendarFilterSheet.jsx`:

```jsx
import { crewColor } from "../../lib/crewColors"
import { useMobile } from "../../lib/useMobile"
import Avatar from "../ui/Avatar"

function Row({ checked, tint, onToggle, children }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        background: "none", border: "none", padding: "10px 4px", minHeight: 44,
        cursor: "pointer", textAlign: "left", color: "var(--color-text-1)", fontSize: 14,
      }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
        border: `1.5px solid ${checked ? (tint || "var(--color-accent)") : "var(--color-border)"}`,
        background: checked ? (tint || "var(--color-accent)") : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, color: "var(--color-bg)", fontWeight: 900,
      }}>
        {checked ? "✓" : ""}
      </span>
      {children}
    </button>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "var(--color-text-3)",
      padding: "12px 4px 4px", borderBottom: "1px solid var(--color-border-subtle)",
    }}>
      {children}
    </div>
  )
}

/** The mockup's "My calendars" sidebar: a bottom sheet on mobile, a popover on desktop. */
export default function CalendarFilterSheet({
  crews = [], crewMemberIds, friends = [], selected, onToggle, onClose,
}) {
  const isMobile = useMobile()

  const panel = (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: "var(--color-modal-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: isMobile ? "20px 20px 0 0" : 18,
        padding: "16px 18px 24px",
        width: isMobile ? "100%" : 340,
        maxHeight: "70vh", overflowY: "auto",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, color: "var(--color-text-2)" }}>
          SHOW ON CALENDAR
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "var(--color-text-3)", fontSize: 20, cursor: "pointer", minHeight: 44, minWidth: 44 }}
          aria-label="Close filter"
        >
          ×
        </button>
      </div>

      <Row checked={selected.has("me")} onToggle={() => onToggle("me")}>🙋 Me</Row>
      <Row checked={selected.has("friends")} onToggle={() => onToggle("friends")}>👥 All Friends</Row>

      {crews.length > 0 && <SectionLabel>CREWS</SectionLabel>}
      {crews.map((c, i) => (
        <Row
          key={c.id}
          checked={selected.has(`crew:${c.id}`)}
          tint={crewColor(i)}
          onToggle={() => onToggle(`crew:${c.id}`)}
        >
          <span style={{ flex: 1 }}>{c.emoji || "🤙"} {c.name}</span>
          <span style={{ fontSize: 11, color: "var(--color-text-3)" }}>
            {crewMemberIds?.get(c.id)?.size ?? 0}
          </span>
        </Row>
      ))}

      {friends.length > 0 && <SectionLabel>FRIENDS</SectionLabel>}
      {friends.map((f) => (
        <Row
          key={f.id}
          checked={selected.has(`friend:${f.id}`)}
          onToggle={() => onToggle(`friend:${f.id}`)}
        >
          <Avatar profile={f} size={22} />
          <span>{f.full_name || f.username || "Friend"}</span>
        </Row>
      ))}
    </div>
  )

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 20,
      }}
    >
      {panel}
    </div>
  )
}
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 91 problems.

- [ ] **Step 4: Commit**

```bash
git add src/components/calendar/FilterChipRow.jsx src/components/calendar/CalendarFilterSheet.jsx
git commit -m "feat: add calendar filter chip row and filter sheet"
```

---

## Task 9: The orchestrator

**Files:**
- Create: `src/components/FriendsCalendar.jsx`

**Interfaces:**
- Consumes: everything from Tasks 1-8
- Produces:

```jsx
<FriendsCalendar
  currentUser={Object|null}
  onOpenTrip={(trip) => void}
  onScopeChange={(Set<string>) => void}   // lets SkiPlansPage filter its trips list
/>
```

**Prerequisite:** Task 1 of `2026-08-18-sprint-35-social-tab-and-calendar.md` must be
merged — this task reuses its loader-registry pattern.

**Fetching rules:**
- Crew, friend and trip data load **once** and are cached across date navigation.
- Only the plan range refetches when the anchor date or view mode changes.
- Failures are per-block and **visible**: `Promise.allSettled`, an inline Retry notice,
  and the raw error to `console.error`. Never a blanket `.catch(() => [])` — the
  2026-08-18 stale-bundle 403 was diagnosable in minutes precisely because it failed
  loudly, and a silently half-empty calendar would not have been reported at all.

- [ ] **Step 1: Create the component**

Create `src/components/FriendsCalendar.jsx`:

```jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import PlanCalendar from "./PlanCalendar"
import WeekView from "./calendar/WeekView"
import DayPlanCard from "./calendar/DayPlanCard"
import FilterChipRow from "./calendar/FilterChipRow"
import CalendarFilterSheet from "./calendar/CalendarFilterSheet"
import { localDateKey, monthBounds, weekBounds } from "../lib/calendarDates"
import { groupByDayAndMountain, totalAttendees } from "../lib/calendarGrouping"
import { ringColorFor, NEUTRAL_RING } from "../lib/crewColors"
import { resortName } from "../lib/resorts"
import { formatDate } from "../lib/format"
import {
  getVisiblePlansInRange, getAllVisibleTrips, getAcceptedFriends,
  getMyCrews, getCrewMembers, joinPlanAtResort,
} from "../lib/socialApi"

function FailureNotice({ label, onRetry }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      background: "var(--color-danger-bg)", border: "1px solid var(--color-danger)",
      borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "var(--color-text-1)",
      marginBottom: 10,
    }}>
      <span>Couldn't load {label}.</span>
      <button
        onClick={onRetry}
        style={{
          background: "transparent", border: "1px solid var(--color-danger)", borderRadius: 8,
          color: "var(--color-text-1)", padding: "6px 12px", fontSize: 12, fontWeight: 800,
          cursor: "pointer", minHeight: 44,
        }}
      >
        Retry
      </button>
    </div>
  )
}

/**
 * "Where is everyone skiing this weekend?" — the friends calendar.
 *
 * Owns fetching, filter state and view mode. Everything it renders is a dumb
 * component fed from two pure modules (calendarGrouping, crewColors), which is what
 * lets the grouping and color rules be unit-tested without a browser.
 */
export default function FriendsCalendar({ currentUser, onOpenTrip, onScopeChange }) {
  const [viewMode, setViewMode] = useState("week")   // "week" | "month"
  const [anchor, setAnchor] = useState(() => new Date())
  const [selected, setSelected] = useState(() => new Set(["me", "friends"]))
  const [sheetOpen, setSheetOpen] = useState(false)

  const [plans, setPlans] = useState([])
  const [trips, setTrips] = useState([])
  const [friends, setFriends] = useState([])
  const [crews, setCrews] = useState([])
  const [crewMemberIds, setCrewMemberIds] = useState(new Map())

  const [failed, setFailed] = useState({})
  const [hasLoaded, setHasLoaded] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null)
  const [joiningKey, setJoiningKey] = useState(null)
  const [joinError, setJoinError] = useState(null)

  const todayKey = localDateKey()
  const currentUserId = currentUser?.id || null

  // ── Static blocks: load once, cached across date navigation ──────────────
  const STATIC_LOADERS = useMemo(() => [
    { key: "friends", label: "your friends list", fn: getAcceptedFriends, apply: (v) => setFriends(v || []), fallback: [] },
    { key: "trips", label: "trips", fn: getAllVisibleTrips, fallback: { mine: [], friends: [], rsvpd: [], invited: [] },
      apply: (v) => setTrips([...(v.mine || []), ...(v.friends || []), ...(v.rsvpd || []), ...(v.invited || [])]) },
    { key: "crews", label: "your crews", fallback: [],
      fn: async () => {
        const rows = await getMyCrews()
        const pairs = await Promise.all((rows || []).map(async (c) => {
          // getCrewMembers returns `profile:user_id (...)` with no bare user_id
          // column, so the user id lives at m.profile.id. m.id is the
          // crew_members row id, not a user.
          const members = await getCrewMembers(c.id).catch(() => [])
          return [c.id, new Set(members.map((m) => m.profile?.id).filter(Boolean))]
        }))
        return { rows: rows || [], pairs }
      },
      apply: (v) => { setCrews(v.rows || []); setCrewMemberIds(new Map(v.pairs || [])) },
    },
  ], [])

  const runStatic = useCallback(async (subset) => {
    const list = subset ? STATIC_LOADERS.filter((l) => subset.includes(l.key)) : STATIC_LOADERS
    const results = await Promise.allSettled(list.map((l) => l.fn()))
    const nowFailed = {}
    results.forEach((res, i) => {
      const loader = list[i]
      if (res.status === "fulfilled") {
        loader.apply(res.value ?? loader.fallback)
      } else {
        loader.apply(loader.fallback)
        nowFailed[loader.key] = true
        // Keep the real error reachable. The UI shows friendly copy, but during
        // beta the raw PostgREST message is what makes a bug diagnosable — that is
        // how the 2026-08-18 stale-bundle 403 was traced in minutes.
        console.error(`[FriendsCalendar] "${loader.key}" failed to load:`, res.reason)
      }
    })
    setFailed((prev) => {
      const next = { ...prev }
      list.forEach((l) => { delete next[l.key] })
      return { ...next, ...nowFailed }
    })
  }, [STATIC_LOADERS])

  useEffect(() => {
    if (!currentUserId) return
    let cancelled = false
    runStatic().finally(() => { if (!cancelled) setHasLoaded(true) })
    return () => { cancelled = true }
  }, [currentUserId, runStatic])

  // ── Plan range: refetches on every date/view change ──────────────────────
  const { start, end } = viewMode === "week" ? weekBounds(anchor) : monthBounds(anchor)

  // Guards against out-of-order responses: clicking > twice quickly fires two
  // fetches, and the slower one must not overwrite the newer range's rows.
  const rangeRef = useRef("")

  const loadPlans = useCallback(async () => {
    const token = `${start}|${end}`
    rangeRef.current = token
    try {
      const rows = await getVisiblePlansInRange(start, end)
      if (rangeRef.current !== token) return   // a newer range already won
      setPlans(rows || [])
      setFailed((prev) => { const n = { ...prev }; delete n.plans; return n })
    } catch (err) {
      if (rangeRef.current !== token) return
      setPlans([])
      console.error("[FriendsCalendar] \"plans\" failed to load:", err)
      setFailed((prev) => ({ ...prev, plans: true }))
    }
  }, [start, end])

  useEffect(() => {
    if (!currentUserId) return
    loadPlans()
  }, [currentUserId, loadPlans])

  // ── Filtering ────────────────────────────────────────────────────────────
  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends])
  const selectedCrewIds = useMemo(
    () => crews.map((c) => c.id).filter((id) => selected.has(`crew:${id}`)),
    [crews, selected]
  )
  const crewIndexById = useMemo(
    () => new Map(crews.map((c, i) => [c.id, i])),
    [crews]
  )
  const friendFilterCount = useMemo(
    () => [...selected].filter((k) => k.startsWith("friend:")).length,
    [selected]
  )

  // A display lens over rows RLS already authorized. It must never be the only
  // thing protecting visibility.
  const inScope = useCallback((userId) => {
    if (!userId) return false
    if (userId === currentUserId) return selected.has("me")
    if (selected.has(`friend:${userId}`)) return true
    // Must test real friendship: getVisiblePlansInRange returns friends AND active
    // crewmates, so a bare non-self test would leak non-friend crewmates under a
    // chip that says "All Friends" (Sprint 34 review finding #2).
    if (selected.has("friends") && friendIds.has(userId)) return true
    for (const crewId of selectedCrewIds) {
      if (crewMemberIds.get(crewId)?.has(userId)) return true
    }
    return false
  }, [currentUserId, selected, friendIds, selectedCrewIds, crewMemberIds])

  useEffect(() => { onScopeChange?.(selected) }, [selected, onScopeChange])

  const groupsByDay = useMemo(() => groupByDayAndMountain({
    plans: plans.filter((p) => inScope(p.user_id)),
    trips: trips.filter((t) => inScope(t.host_id)),
    currentUserId,
  }), [plans, trips, inScope, currentUserId])

  const colorCtx = useMemo(() => ({
    currentUserId, selectedCrewIds, crewIndexById, crewMemberIds,
  }), [currentUserId, selectedCrewIds, crewIndexById, crewMemberIds])

  // ── Actions ──────────────────────────────────────────────────────────────
  function toggle(key) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function shiftAnchor(delta) {
    setSelectedDay(null)
    setAnchor((d) => viewMode === "week"
      ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * delta)
      : new Date(d.getFullYear(), d.getMonth() + delta, 1))
  }

  async function handleJoin(dateKey, resortKey) {
    setJoiningKey(`${dateKey}|${resortKey}`)
    setJoinError(null)
    try {
      await joinPlanAtResort(dateKey, resortKey)
      await loadPlans()
    } catch (err) {
      console.error("[FriendsCalendar] join failed:", err)
      setJoinError(err?.message || "Couldn't save your plan.")
    } finally {
      setJoiningKey(null)
    }
  }

  const rangeLabel = anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })

  if (!currentUserId) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-3)", fontSize: 14 }}>
        Sign in to see where your friends are skiing.
      </div>
    )
  }

  const nobodyToShow = hasLoaded && friends.length === 0 && crews.length === 0

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => { setAnchor(new Date()); setSelectedDay(null) }} style={navBtn}>Today</button>
          <button onClick={() => shiftAnchor(-1)} aria-label="Previous" style={navBtn}>‹</button>
          <div style={{ fontWeight: 900, fontSize: 15, color: "var(--color-text-1)", minWidth: 130, textAlign: "center" }}>
            {rangeLabel}
          </div>
          <button onClick={() => shiftAnchor(1)} aria-label="Next" style={navBtn}>›</button>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["week", "month"].map((m) => (
            <button
              key={m}
              onClick={() => { setViewMode(m); setSelectedDay(null) }}
              style={{
                ...navBtn,
                background: viewMode === m ? "var(--color-accent-dim)" : "transparent",
                color: viewMode === m ? "var(--color-text-1)" : "var(--color-text-3)",
                textTransform: "capitalize",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <FilterChipRow
        crews={crews}
        selected={selected}
        onToggle={toggle}
        onOpenSheet={() => setSheetOpen(true)}
        friendFilterCount={friendFilterCount}
      />

      {failed.plans && <FailureNotice label="this week's plans" onRetry={loadPlans} />}
      {failed.crews && <FailureNotice label="your crews" onRetry={() => runStatic(["crews"])} />}
      {failed.friends && <FailureNotice label="your friends list" onRetry={() => runStatic(["friends"])} />}
      {failed.trips && <FailureNotice label="trips" onRetry={() => runStatic(["trips"])} />}
      {joinError && <FailureNotice label={`your plan (${joinError})`} onRetry={() => setJoinError(null)} />}

      {nobodyToShow && (
        <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--color-text-3)", fontSize: 13 }}>
          Add friends to see where they're skiing.
        </div>
      )}

      {viewMode === "week" ? (
        <WeekView
          anchorDate={anchor}
          groupsByDay={groupsByDay}
          colorCtx={colorCtx}
          currentUserId={currentUserId}
          todayKey={todayKey}
          joiningKey={joiningKey}
          onJoin={handleJoin}
          onOpenTrip={onOpenTrip}
        />
      ) : (
        <PlanCalendar
          entriesByDate={groupsByDay}
          dotColorFor={() => NEUTRAL_RING}
          selectedDate={selectedDay}
          onSelectDay={setSelectedDay}
          onMonthChange={(d) => { setSelectedDay(null); setAnchor(d) }}
          initialMonth={new Date(anchor.getFullYear(), anchor.getMonth(), 1)}
          renderCellContent={(dateKey, groups) => {
            if (!groups || groups.length === 0) return null
            // One dot per CREW present, not per mountain — the dots have to mean
            // the same thing the chips mean or the legend lies (spec decision #6).
            const crewsPresent = new Set()
            let hasUnaffiliated = false
            for (const g of groups) {
              for (const a of g.attendees) {
                const c = ringColorFor(a.userId, colorCtx)
                if (c === NEUTRAL_RING) hasUnaffiliated = true
                else crewsPresent.add(c)
              }
            }
            const dots = [...crewsPresent, ...(hasUnaffiliated ? [NEUTRAL_RING] : [])].slice(0, 4)
            return (
              <div style={{ display: "grid", gap: 2, justifyItems: "center", width: "100%" }}>
                <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
                  {dots.map((c) => (
                    <div key={c} style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />
                  ))}
                </div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--color-text-2)" }}>
                  {totalAttendees(groups)}
                </div>
                <div style={{
                  fontSize: 9, color: "var(--color-text-3)", maxWidth: "100%",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {resortName(groups[0].resortKey) || groups[0].resortKey}
                  {groups.length > 1 ? ` +${groups.length - 1}` : ""}
                </div>
              </div>
            )
          }}
          renderDayDetail={(dateKey, groups) => (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--color-text-2)" }}>
                {formatDate(dateKey)}
              </div>
              {(!groups || groups.length === 0) ? (
                <div style={{ fontSize: 13, color: "var(--color-text-3)" }}>Nobody's planned this day.</div>
              ) : groups.map((g) => (
                <DayPlanCard
                  key={g.resortKey}
                  group={g}
                  colorCtx={colorCtx}
                  currentUserId={currentUserId}
                  canJoin={dateKey >= todayKey}
                  joining={joiningKey === `${dateKey}|${g.resortKey}`}
                  onJoin={(resortKey) => handleJoin(dateKey, resortKey)}
                  onOpenTrip={onOpenTrip}
                />
              ))}
            </div>
          )}
        />
      )}

      {sheetOpen && (
        <CalendarFilterSheet
          crews={crews}
          crewMemberIds={crewMemberIds}
          friends={friends}
          selected={selected}
          onToggle={toggle}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  )
}

const navBtn = {
  background: "var(--color-surface)", border: "1px solid var(--color-border)",
  borderRadius: 10, padding: "8px 12px", color: "var(--color-text-1)",
  cursor: "pointer", fontWeight: 700, fontSize: 13, minHeight: 44,
}
```

**Note on the month branch:** `PlanCalendar` is handed `groupsByDay` directly as
`entriesByDate`. That works because `PlanCalendar` treats the map's values as an opaque
array it passes back to the render props — it only ever reads `.length` and maps
`dotColorFor` over it. The `dotColorFor` here is a constant because
`renderCellContent` replaces the dot row entirely; it is supplied only so the
no-renderer path stays valid for other callers.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: 91 problems. If `react-hooks/exhaustive-deps` fires on the effects, fix the
dependency arrays rather than suppressing the rule.

- [ ] **Step 3: Commit**

```bash
git add src/components/FriendsCalendar.jsx
git commit -m "feat: add FriendsCalendar orchestrator with per-block load resilience"
```

---

## Task 10: Mount it and retire the old calendar

**Files:**
- Modify: `src/components/SkiPlansPage.jsx`

**Interfaces:**
- Consumes: `FriendsCalendar` (Task 9)
- Produces: nothing new

This is the task that makes the feature visible. Four edits:

1. Default sub-tab flips from `"trips"` to `"calendar"`.
2. The inline `CalendarView` function (lines 97-165) and its `DOT_COLORS` / `DOT_LABELS`
   constants are deleted.
3. The Calendar sub-tab body — the scope chips, the empty-state line and the
   `<CalendarView>` mount — is replaced by `<FriendsCalendar>`.
4. The local `scopes` state is deleted; `inScope()` now reads a `scopes` value lifted
   from `FriendsCalendar` via `onScopeChange`, so the Trips sub-tab keeps following the
   same filter.

- [ ] **Step 1: Flip the default sub-tab**

```jsx
  const [subTab, setSubTab] = useState("calendar")
```

- [ ] **Step 2: Delete the inline calendar**

Delete `DOT_COLORS`, `DOT_LABELS` and the entire `CalendarView` function
(`SkiPlansPage.jsx:90-165`). Then remove now-unused imports — check each before
deleting, since the trips list below may still use them: `PlanCalendar`, and possibly
`resortEmoji` / `resortName` / `formatDate` / `monthBounds` / `getVisiblePlansInRange`.

- [ ] **Step 3: Delete the plan-range fetch and the calendar-month state**

The month fetch now lives inside `FriendsCalendar`. Delete these two state
declarations:

```jsx
  const [calMonth, setCalMonth] = useState(...)
  const [visiblePlans, setVisiblePlans] = useState([])
```

along with the whole `useEffect` that calls `getVisiblePlansInRange`, and the
`scopedPlans` computation (nothing reads it once `CalendarView` is gone).

**Keep `scopes` exactly as it is** — same declaration, same initial value:

```jsx
  const [scopes, setScopes] = useState(() => new Set(["me", "friends"]))
```

Its *writer* changes, not its shape. Today the deleted chip row calls `setScopes`;
from now on `FriendsCalendar` does, through the `onScopeChange` prop wired in Step 4.
That is what keeps the Trips sub-tab following the same filter as the calendar.

`inScope()`, `mineScoped`, `scopedMyTrips`, `scopedRsvpdTrips`, `scopedInvitedTrips` and
`scopedFriendsTrips` all stay exactly as they are — they already read `scopes`.

- [ ] **Step 4: Replace the Calendar sub-tab body**

Replace the entire `{subTab === "calendar" && (...)}` block with:

```jsx
      {subTab === "calendar" && (
        <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 20, padding: "20px 18px" }}>
          <FriendsCalendar
            currentUser={currentUser}
            onOpenTrip={setStripTrip}
            onScopeChange={setScopes}
          />
        </div>
      )}
```

and add the import at the top:

```jsx
import FriendsCalendar from "./FriendsCalendar"
```

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: 91 problems. Unused-variable errors here mean Step 2 or 3 missed a deletion —
fix them rather than leaving dead code.

- [ ] **Step 6: Browser verification — the full spec §8 list**

Run: `npm run dev`. Work through every item; do not mark this step done on a partial pass.

1. Plans tab opens on **Calendar**, showing the current week.
2. Two accounts, one crew containing one of them, one friend outside that crew.
3. Two mountains planned the same day → both cards render, **busier one on top**.
4. A trip at a resort where someone also has a plan → **one** card with a TRIP badge.
   Tapping the badge opens `TripDetailModal`.
5. Week ↔ month toggle preserves the anchor date; `Today` returns to the current week.
6. Month navigation works — click ‹ and › repeatedly. (Sprint 34 review finding #1: a
   `loading` early-return that unmounts the calendar resets its internal `viewDate`.)
7. Each chip and each sheet checkbox changes what renders. Unchecking everything gives
   an empty calendar, not a crash.
8. A person in two selected crews shows exactly **one** ring; reordering which crew is
   selected first changes which color.
9. **"I'm in" on a date where you already have a plan with an ETA preserves the ETA.**
   Set an ETA in Profile → Ski Plans first, then join a different mountain that day,
   then go back and confirm the ETA is still there. *This is the highest-risk assertion
   in the list — do not skip it.*
10. Switch profile theme; confirm crew colors reskin. Check at least two themes.
11. Temporarily `throw new Error("boom")` inside the `crews` loader → that block shows a
    Retry notice, the rest of the calendar still renders, and the raw error is in the
    console. **Revert the throw.**
12. Check at 375px and 1440px widths. The page body must never scroll horizontally.
13. Trips sub-tab still lists trips, and toggling a calendar chip changes which trips
    it shows.

- [ ] **Step 7: Commit**

```bash
git add src/components/SkiPlansPage.jsx
git commit -m "feat: make the friends calendar the Plans tab's default view"
```

- [ ] **Step 8: Update the roadmap**

In `ROADMAP.md`, strike through the "where are my friends skiing" calendar item under
Kyle's Notes and mark TASK 18.2 (`getCrewMembers` returns pending members) done,
referencing Task 4 of this plan.

```bash
git add ROADMAP.md
git commit -m "docs: mark friends calendar and ROADMAP 18.2 done"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §4.1 shell, default sub-tab | 10 |
| §4.2 week view, both orientations | 6 |
| §4.3 month cells + day panel | 7, 9 |
| §4.4 mountain card, trip badge, name/avatar truncation | 5 |
| §4.5 chip row + filter sheet | 8 |
| §4.6 color rules 1-4, legend | 2, 8 |
| §4.7 empty / failed / past-date states | 5, 6, 9 |
| §5.1 file structure | all |
| §5.2 data + `getCrewMembers` fix | 4, 9 |
| §5.3 "I'm in" field-preserving merge | 4 |
| §5.4 load resilience | 9 |
| §8 verification | 10 step 6 |
| decision #10 trips fold in | 3, 5 |

**Known gap, accepted:** §4.6 says a legend renders only the crews currently in view.
The chip row is that legend — each crew chip carries its own color dot — so no separate
legend element is built. Recorded here so a reviewer does not read it as an omission.

**Type consistency:** `MountainGroup` (`{ resortKey, attendees, trip }`) is produced in
Task 3 and consumed identically in Tasks 5, 6 and 9. `CrewColorContext`
(`{ currentUserId, selectedCrewIds, crewIndexById, crewMemberIds }`) is defined in Task 2
and constructed in Task 9. Filter keys are `"me" | "friends" | "crew:<id>" | "friend:<id>"`
everywhere. `joiningKey` is `` `${dateKey}|${resortKey}` `` in Tasks 6 and 9.
