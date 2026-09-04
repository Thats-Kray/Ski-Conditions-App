# Plans Page — Mockup Fidelity Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Plans page to match `mockups/PowDays.app mockup design/` — one scrolling day-agenda list in place of the week/month calendar toggle, mountain-heading-plus-one-card-per-party group cards, a context-sensitive header `+`, and three redundant widgets cut.

**Architecture:** One new pure helper (`agendaRange` in `src/lib/calendarDates.js`) defines the rolling window and is the only new unit-testable logic. One new dumb component (`src/components/calendar/DayAgendaList.jsx`) replaces `WeekView.jsx` and renders the day list; `FriendsCalendar.jsx` keeps every fetch, filter, and action handler it already owns and simply loses `viewMode`. `DayPlanCard.jsx` is restructured from "one bordered card per mountain with parties nested inside" to "an unbordered mountain block whose parties are the cards". `SkiPlansPage.jsx` is mostly deletion plus a header restyle. No migration, no RLS change, no new dependency.

**Tech Stack:** React 19 (function components, hooks, inline `style={{}}` objects), Supabase JS v2, `node --test` over `src/lib` only, Vite 7, ESLint 9.

## Global Constraints

- **Source of truth:** `docs/superpowers/specs/2026-09-04-plans-page-slice-design.md`. Every numbered Design Decision in it has a task below; every Non-goal is untouched.
- **No database work.** Nothing under `migrations/`, no RLS change, no new RPC, no `supabase/` change. This slice is client-only.
- **`TripCard.jsx` does not change.** Neither do `CreateTripModal.jsx`, `TripDetailModal.jsx`, or the Trips sub-tab's list rendering, beyond the shared page header and sub-tab selector.
- **`FilterChipRow.jsx` and `CalendarFilterSheet.jsx` do not change.** They keep rendering, in the same order, above the new agenda list.
- **No "open party" / direct-join state.** Every party the viewer is not already in shows a locked "Ask to join" driving the existing `requestToJoinParty` flow. "I'm also going" (joining a mountain, not a party) keeps its exact current behaviour and label.
- **`PingCta` must not be deleted.** It is the only trigger for `SkiPingComposer` anywhere in the app (the Friends slice cut its own duplicate on that basis). It is restyled, never removed.
- **Test harness:** `npm test` = `node --test src/lib/*.test.js`. There is **no DOM/component test runner** and none is being added. New pure logic goes in `src/lib` with `node --test` coverage; component work is verified by `npm run build` + `npx eslint .` + Kyle's click-through, exactly as every prior TASK 22.0 slice was.
- **Baselines measured on `main` at d9cb79b, 2026-09-04:** `npm test` → **223 tests, 223 pass, 0 fail**. `npx eslint .` (whole repo) → the ROADMAP records **88 problems in a fresh checkout**; do not "fix" that baseline incidentally. Scoped to the four files this slice touches, `npx eslint src/components/SkiPlansPage.jsx src/components/FriendsCalendar.jsx src/components/calendar/ src/lib/calendarDates.js` → **exactly 2 problems, both in `SkiPlansPage.jsx`** (`'useRef' is defined but never used` at 1:34, `'currentUser' is defined but never used` at 215:47). Both sit in code this slice deletes, so **the target for those paths after this branch is 0 problems**, and the repo total must not rise.
- **Tap targets:** this repo puts `minHeight: 44` on interactive controls. Where the mockup specifies something smaller, follow the repo (see Deviation 2) and flag the visual difference for Kyle.
- **Colors come from CSS custom properties** (`var(--color-*)`, `var(--gradient-cta)`), never raw hex, except in `crewColors.js`, which documents at length why its six hues are fixed. The mockup's literal hexes (`#38bdf8`, `#0284c7`, `#4ade80`) are the default theme's values of `--color-accent`, `--color-accent-deep` and `--color-success`; use the tokens so the other four themes keep working.

---

## Verified against the live codebase (2026-09-04, `main` @ d9cb79b)

Every claim below was checked against the files on disk before this plan was written. Where a check contradicted a description given to me, this plan follows the check and says so.

| # | Claim | Verified result |
|---|---|---|
| 1 | `AvatarStatusRail.jsx` has exactly one importer | **CONFIRMED.** `grep -rn "AvatarStatusRail" src/` returns 8 hits: an `import` + a `<AvatarStatusRail />` in `SkiPlansPage.jsx`, the file's own header comment and `export default`, and **four prose comments** that merely name it (`TodaysCrew.jsx:23`, `ActiveSessionBar.jsx:18`, `socialApi.js:706`, `profileNav.js:8`). No other component imports it. **Cutting the `SkiPlansPage` usage makes the file dead → Task 5 deletes it and repairs the four comments.** |
| 2 | `PlanCalendar.jsx` becomes dead when `FriendsCalendar` stops using it | **NO. It has a second importer:** `SkiPlansTab.jsx:2` (Profile → Ski Plans). **`PlanCalendar.jsx` must NOT be deleted.** Only `FriendsCalendar`'s import of it goes. |
| 3 | `WeekView.jsx` has exactly one importer | **CONFIRMED.** `FriendsCalendar.jsx:3` only. Safe to delete once `FriendsCalendar` renders `DayAgendaList` instead. |
| 4 | `DayPlanCard.jsx` importers | **CONFIRMED: two.** `FriendsCalendar.jsx:4` (month-grid `renderDayDetail` branch, deleted in Task 2) and `WeekView.jsx:4` (deleted in Task 2). After Task 2 its only importer is the new `DayAgendaList.jsx`, which is why Task 3 can drop the `compact` prop outright. |
| 5 | `groupByDayAndMountain()` already emits `parties` / `solo` per mountain | **CONFIRMED.** `calendarGrouping.js:162-178` returns `{ resortKey, trip, attendees, parties, solo }`; each party is `{ partyId, ownerId, name, attendees }`, sorted biggest-first with a `partyId` tie-break. **No change to this module is needed and none is planned.** |
| 6 | `ringColorFor(userId, ctx)` can take a party's `ownerId` | **CONFIRMED.** `crewColors.js:81` — pure `(userId, ctx)`; a `null` id falls through to `NEUTRAL_RING`, and an owner who is the signed-in user returns `SELF_RING` (`var(--color-text-1)`). Both are acceptable accent-bar colors. No change to `crewColors.js`. |
| 7 | `calendarDates.js` already has a forward-window helper | **NO.** It has `dateKeyOf`, `localDateKey`, `monthBounds`, `weekBounds`, `weekDayKeys` only. A new helper is required (Task 1). `calendarDates.test.js` exists (8 tests, `weekBounds`/`weekDayKeys` only) and is extended, not replaced. |
| 8 | `PlanEditorModal` prop names | **CONFIRMED at `PlanEditorModal.jsx:44-47`:** `{ dateKey, plan = null, resorts = [], busy = false, error = null, defaultResortKey = null, onSave, onRemove, onClose, onDateChange, minDate }`. The date input renders **only when `onDateChange` is passed** (`:90`); otherwise it is a plain `formatDate(dateKey)` heading. **The "pre-seeded date, not pickable" path already exists** — the per-day `+` just omits `onDateChange`/`minDate`. |
| 9 | `CreateTripModal` prop names | **CONFIRMED at `CreateTripModal.jsx:56`:** `{ onClose, onCreated }`. |
| 10 | `WeekView`'s `showPast` disclosure is reusable | **CONFIRMED** (`WeekView.jsx:96-131`): `past = days.filter(d => d.key < todayKey)`, `rest = days.filter(d => d.key >= todayKey)`, `pastWithPlans` count, dashed-border pill, `aria-expanded`. `DayAgendaList` reuses this shape verbatim over a longer key list. |
| 11 | `.trip-card:hover` is defined in `SkiPlansPage.jsx`'s `<style>` block | **CONFIRMED, and `TripCard.jsx:219` is the consumer** (`className="trip-card"`). **That rule must survive Task 4** or `TripCard` silently loses its hover, which the spec forbids. `.strip-card` and `.plan-cta` belong to elements being deleted; `.hype-btn` has **no consumer anywhere in `src/`** (verified by `grep -rn "hype" src/`). |
| 12 | `SkiPlansPage` renders for signed-out users | **NO.** `App.jsx:1560-1571` gates it behind `currentUser ? <SkiPlansPage/> : <AuthGate/>`. The in-component signed-out branches are unreachable in practice; **leave them alone** — removing them is not in scope. |
| 13 | The segmented-control precedent | **`LeaderboardPage.jsx:394-415`** is the two-segment full-width pill (`display:flex`, container `borderRadius:12`, `padding:4`, each button `flex:1`, `borderRadius:9`). Its *category* tabs (`:457`) are a scrolling chip row, not a segmented control. The shipped **Crew** page header is `MessagingCenter.jsx:160` — `fontSize: 20, fontWeight: 900, letterSpacing: -0.5, color: "white"` — which is also exactly what the mockup specifies for "Plans". Task 4 matches both. |
| 14 | Mockup markup for the Plans screen | **Read directly** from `mockups/PowDays.app mockup design/PowDays Reorg Mockup.dc.html:151-235` plus its `segBig` (`:590`) and `grp(...)` (`:598-602`) style factories. The party card really is `borderLeft: "3px solid " + color`, `borderRadius: 12`, `padding: "11px 12px"`; avatars are 26px overlapped at `margin-left:-8px`; the per-day button is `26×26`, `borderRadius: 8`. |

### Deviation 1 — the `nobodyPlanned` empty-state sentence

Spec decision #9 says the three empty states keep "their current three conditions and copy". The `nobodyPlanned` copy is `Nobody's planned a day {viewMode === "week" ? "this week" : "this month"} yet.` — it **interpolates the state variable this slice deletes**. Keeping the literal string is impossible. Task 2 uses **`Nobody's planned a day yet.`** — the same sentence with the now-meaningless range clause dropped. Conditions are unchanged. Flag at review if Kyle wants different wording.

Similarly `<FailureNotice label="this week's plans" />` (`FriendsCalendar.jsx:632`) renders "Couldn't load this week's plans." — Task 2 changes the label to `these days' plans`. Same reason, same one-line scope.

### Deviation 2 — tap-target sizes vs. the mockup

The mockup's header `+` is `34×34` and its per-day `+` is `26×26`. This repo puts `minHeight: 44` on essentially every button (`PlanEditorModal`, `FriendsCalendar`, `DayPlanCard`, `FailureNotice` all do). This plan renders the **header `+` at 44×44** (a 10px difference on a 390px artboard; the mockup is a picture, the 44px floor is an accessibility rule) and the **per-day `+` at the mockup's 26×26**, because a 44px control in a 12px-tall day-card header row would dominate it. The per-day `+` is therefore the one knowingly-small target in this slice — it is on Kyle's click-through list, and bumping it to 32-36 is a two-number change if it feels fiddly.

### Deviation 3 — `focusDate` for a day outside the window

Today a notification about a ski day moves `anchor` so any date is reachable. With a fixed rolling window there is no anchor. Rather than regress that, `agendaRange` takes an `includeKey` option that widens the window to cover the focused day (Task 1), and `FriendsCalendar` passes the focused day into it (Task 2). This is why `agendaRange` has a third option instead of being a two-line loop.

---

## File Structure

**Create**
- `src/components/calendar/DayAgendaList.jsx` — the scrolling day list: past-days disclosure, one row per day, empty days collapsed to a thin line, a `+` per future day, and a `DayPlanCard` per mountain. Dumb: every action arrives as a prop. Replaces `WeekView.jsx`.

**Modify**
- `src/lib/calendarDates.js` — add `AGENDA_PAST_DAYS`, `AGENDA_FORWARD_DAYS`, `agendaRange()`. Nothing existing changes.
- `src/lib/calendarDates.test.js` — add the `agendaRange` suite. Existing tests untouched.
- `src/components/FriendsCalendar.jsx` — delete `viewMode`/`anchor`/`monthResetKey`/`shiftAnchor`/`rangeLabel`/`navBtn`, the `‹ › Today week month` header, the `PlanCalendar` month branch and the `WeekView` branch; render `DayAgendaList`; range now comes from `agendaRange`; `handleAddSkiDay` takes an optional seed date; new `addDayTick` prop opens the editor from the page header.
- `src/components/calendar/DayPlanCard.jsx` — restructure into mountain heading + one card per party; per-party avatars; left accent bar from `ringColorFor(ownerId, colorCtx)`; drop the `compact` prop.
- `src/components/SkiPlansPage.jsx` — delete `NextTripCard`, `UpcomingStrip`, the `AvatarStatusRail` block; restyle header (title + context-sensitive circular `+`), sub-tab selector (full-width two-segment pill) and `PingCta` (text link); pass `addDayTick` to `FriendsCalendar`.

**Delete**
- `src/components/calendar/WeekView.jsx` — replaced by `DayAgendaList.jsx` (single importer, verified).
- `src/components/ui/AvatarStatusRail.jsx` — dead once `SkiPlansPage` stops rendering it (single importer, verified).

**Explicitly NOT touched:** `src/components/PlanCalendar.jsx` (still used by `SkiPlansTab.jsx`), `TripCard.jsx`, `CreateTripModal.jsx`, `TripDetailModal.jsx`, `calendar/FilterChipRow.jsx`, `calendar/CalendarFilterSheet.jsx`, `PlanEditorModal.jsx`, `src/lib/calendarGrouping.js`, `src/lib/crewColors.js`, anything under `migrations/`.

---

## Task 1: The rolling agenda window (`agendaRange`)

Implements spec decision **#1** (rolling 21-day forward window, past days on demand) and Deviation 3.

**Files:**
- Modify: `src/lib/calendarDates.js` (append after `weekDayKeys`, currently ends at line 63)
- Test: `src/lib/calendarDates.test.js` (append; currently 8 tests importing `weekBounds`, `weekDayKeys`)

**Interfaces:**
- Consumes: `localDateKey(d)` — already exported from this module.
- Produces, used by Task 2:
  - `AGENDA_PAST_DAYS: number` (= `7`)
  - `AGENDA_FORWARD_DAYS: number` (= `21`)
  - `agendaRange(todayKey: string, opts?: { past?: number, forward?: number, includeKey?: string|null }) => { start: string, end: string, keys: string[] }` — `keys` is chronological, inclusive of both ends, always contains `todayKey`; `start === keys[0]`, `end === keys[keys.length - 1]`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/calendarDates.test.js`. Also widen the existing import on line 3 to:

```js
import {
  weekBounds, weekDayKeys, agendaRange, AGENDA_PAST_DAYS, AGENDA_FORWARD_DAYS,
} from "./calendarDates.js"
```

Then append these tests:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/calendarDates.test.js`
Expected: FAIL — `TypeError: agendaRange is not a function` (the import resolves to `undefined` because the export does not exist yet).

- [ ] **Step 3: Write the implementation**

Append to `src/lib/calendarDates.js`:

```js
/**
 * How far the Plans agenda list reaches, in days.
 *
 * Not a mockup-stated number: the mockup shows a plain scrolling list with no
 * navigator, so the window size is this app's choice (design spec decision #1).
 * 21 days forward covers "this weekend and the next two", which is the horizon
 * people actually plan on; 7 days back is what the "Show past days" disclosure
 * reveals and nothing more, because a plan you can no longer act on is history.
 */
export const AGENDA_PAST_DAYS = 7
export const AGENDA_FORWARD_DAYS = 21

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The rolling agenda window around `todayKey`, as local date keys.
 *
 * Takes a date KEY, not a Date, on purpose: the caller already holds one from
 * localDateKey(), and a string argument makes the result stable under useMemo —
 * `new Date()` is a fresh object on every render and would refetch the calendar
 * forever.
 *
 * Day arithmetic goes through `new Date(y, m, d + i)`, which normalises month and
 * year rollover for free and is immune to DST. Adding 86_400_000ms would duplicate
 * a key across the spring-forward Sunday; there is a test for exactly that.
 *
 * @param {string} todayKey "YYYY-MM-DD", local, from localDateKey()
 * @param {Object} [opts]
 * @param {number} [opts.past=AGENDA_PAST_DAYS] days before todayKey
 * @param {number} [opts.forward=AGENDA_FORWARD_DAYS] days after todayKey
 * @param {string|null} [opts.includeKey=null] a day that MUST be inside the
 *   window. A notification can point at a ski day past either edge, and a
 *   calendar that cannot show the day you tapped is a dead end. Widens the
 *   relevant side only; never narrows either.
 * @returns {{start: string, end: string, keys: string[]}}
 */
export function agendaRange(todayKey, {
  past = AGENDA_PAST_DAYS, forward = AGENDA_FORWARD_DAYS, includeKey = null,
} = {}) {
  const [y, m, d] = todayKey.split("-").map(Number)
  let back = Math.max(0, past)
  let ahead = Math.max(0, forward)

  if (includeKey && DATE_KEY_RE.test(includeKey) && includeKey !== todayKey) {
    const [iy, im, id] = includeKey.split("-").map(Number)
    // Date.UTC on both sides: same construction, so the difference is exact whole
    // days with no DST hour left over to round away.
    const delta = Math.round(
      (Date.UTC(iy, im - 1, id) - Date.UTC(y, m - 1, d)) / 86400000
    )
    if (delta > 0) ahead = Math.max(ahead, delta)
    else back = Math.max(back, -delta)
  }

  const keys = []
  for (let i = -back; i <= ahead; i++) {
    keys.push(localDateKey(new Date(y, m - 1, d + i)))
  }
  return { start: keys[0], end: keys[keys.length - 1], keys }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/calendarDates.test.js`
Expected: PASS — 18 tests (the 8 that were there plus the 10 new ones), 0 fail.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: **233 pass, 0 fail** (223 baseline + 10).

- [ ] **Step 6: Commit**

```bash
git add src/lib/calendarDates.js src/lib/calendarDates.test.js
git commit -m "feat: agendaRange, the Plans page's rolling day window

A day-key in, day-keys out helper so the new agenda list has a range
without a Date object that changes identity on every render. includeKey
exists so a notification pointing at a day beyond the window still has
somewhere to land, which the old anchor-shifting calendar handled and a
fixed window otherwise would not."
```

---

## Task 2: Day-agenda list replaces the week/month calendar

Implements spec decisions **#1** (agenda list, no toggle, no navigator, empty-day collapse, "Show past days"), **#6** (per-day `+`) and **#9** (empty states restyled, conditions unchanged).

**No unit test in this task, deliberately.** Everything it adds is JSX and prop plumbing; the only extractable logic — the date window — was extracted and tested in Task 1. This repo has no DOM test runner and this slice does not add one (see Global Constraints). Verification is `npm run build`, `npx eslint .`, and Kyle's click-through.

**Files:**
- Create: `src/components/calendar/DayAgendaList.jsx`
- Modify: `src/components/FriendsCalendar.jsx`
- Delete: `src/components/calendar/WeekView.jsx`

**Interfaces:**
- Consumes: `agendaRange`, `AGENDA_PAST_DAYS`, `AGENDA_FORWARD_DAYS` (Task 1); `DayPlanCard` with its **current** props — `{ group, colorCtx, currentUserId, canJoin, joining, onJoin, onOpenTrip, myResortKey, myPlanHasEta, onEditPlan, onAskToJoin, askingPartyId, askedPartyIds, onLeave, leaving }`. Task 3 restructures `DayPlanCard`'s internals but **keeps every one of those prop names**, so this task's call site does not change again.
- Produces:
  - `DayAgendaList(props)` default export, props: `{ dayKeys: string[], groupsByDay: Map<string, MountainGroup[]>, colorCtx, currentUserId: string|null, todayKey: string, focusedDayKey: string|null, joiningKey: string|null, onJoin(dateKey, resortKey), onOpenTrip(trip), myPlanByDate: Map<string, Plan>, onEditPlan(dateKey, resortKey), onAskToJoin(dateKey, resortKey, party), askingPartyId, askedPartyIds: Set<string>, onLeave(dateKey), leavingKey, onAddDay(dateKey) }`.
  - `FriendsCalendar` gains one prop: `addDayTick: number` (default `0`). Task 4 increments it from the page header to open the date-pickable ski-day editor.

- [ ] **Step 1: Create `src/components/calendar/DayAgendaList.jsx`**

```jsx
import { useCallback, useState } from "react"
import { formatDate } from "../../lib/format"
import DayPlanCard from "./DayPlanCard"

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

/**
 * "SUN".."SAT" for a "YYYY-MM-DD" key.
 *
 * Built from local date parts, never `new Date(key)` — that parses as UTC midnight
 * and lands on the previous day for every negative-offset timezone, i.e. all of
 * Colorado. Same constraint documented at the top of lib/calendarDates.js.
 */
function dowLabel(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number)
  return DOW[new Date(y, m - 1, d).getDay()]
}

/** "18" from "2026-01-18". */
function dayNumber(dateKey) {
  return Number(dateKey.slice(8, 10))
}

const emptyRowStyle = {
  display: "flex", alignItems: "center", gap: 8,
  padding: "7px 12px", minHeight: 36, fontSize: 11,
  color: "var(--color-text-muted)",
}

const addDayButtonStyle = {
  // 26x26 is the mockup's size and is deliberately below this repo's 44px floor —
  // a 44px control inside a 12px-tall day header would dominate the row it sits in.
  // Flagged for Kyle's click-through; bumping it is a two-number change.
  width: 26, height: 26, borderRadius: 8, padding: 0, flexShrink: 0,
  background: "var(--color-accent-dim)", border: "1px solid var(--color-accent)",
  color: "var(--color-accent)", fontSize: 16, lineHeight: 1,
  cursor: "pointer", display: "grid", placeItems: "center",
}

/**
 * The Plans calendar, as one scrolling list of days.
 *
 * Replaces WeekView's split personality (a 7-column desktop grid plus a rolling
 * mobile list) and PlanCalendar's month grid with a single layout that is the same
 * on every screen size — which is all the mockup shows, and the only thing anyone
 * was actually using on a phone.
 *
 * Dumb by design: every fetch, filter and action still lives in FriendsCalendar, so
 * the grouping and color rules stay unit-testable without a browser.
 */
export default function DayAgendaList({
  dayKeys = [], groupsByDay, colorCtx, currentUserId, todayKey,
  joiningKey, onJoin, onOpenTrip, myPlanByDate, onEditPlan,
  onAskToJoin, askingPartyId, askedPartyIds, onLeave, leavingKey,
  onAddDay, focusedDayKey = null,
}) {
  const [showPast, setShowPast] = useState(
    () => Boolean(focusedDayKey) && focusedDayKey < todayKey
  )

  // "Adjust state when a prop changes" — React's documented render-time pattern. An
  // effect here would set state on mount and cascade an extra render, which is what
  // react-hooks/set-state-in-effect flags (same reasoning as SkiPlansPage's lastFocus).
  const [lastFocused, setLastFocused] = useState(focusedDayKey)
  if (focusedDayKey !== lastFocused) {
    setLastFocused(focusedDayKey)
    if (focusedDayKey && focusedDayKey < todayKey) setShowPast(true)
  }

  // Callback ref rather than an effect: React hands us the node the moment the
  // focused day mounts (including the mount caused by opening "Show past days"),
  // and null when it unmounts. Stable identity, so it does not re-fire on every
  // render of the same node.
  const scrollFocusedIntoView = useCallback((node) => {
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "center", behavior: "smooth" })
    }
  }, [])

  const days = dayKeys.map((key) => ({
    key,
    groups: groupsByDay?.get(key) || [],
    isToday: key === todayKey,
    isPast: key < todayKey,
  }))
  const past = days.filter((d) => d.isPast)
  const upcoming = days.filter((d) => !d.isPast)
  const pastWithPlans = past.filter((d) => d.groups.length > 0).length

  function renderDay(day) {
    const dayRef = day.key === focusedDayKey ? scrollFocusedIntoView : undefined
    // No "+" on a day that has already happened: daily_plans has no back-dating
    // path, and handleAddSkiDay clamps to today, so the button would lie.
    const canAdd = Boolean(onAddDay) && !day.isPast
    const label = day.isToday ? "TODAY" : dowLabel(day.key)
    const addLabel = `Add a ski day on ${formatDate(day.key)}`

    // Empty days collapse to one thin line. Twenty-one full-height "no plans" cards
    // would push the weekend — the thing anyone opened this page to decide — off the
    // bottom of a phone. Same treatment WeekView already used for empty weekdays.
    if (day.groups.length === 0) {
      const line = (
        <>
          <span style={{
            fontWeight: 800,
            color: day.isToday ? "var(--color-text-2)" : "var(--color-text-muted)",
          }}>
            {label} {dayNumber(day.key)}
          </span>
          <span>— no plans —</span>
        </>
      )
      if (!canAdd) {
        return <div key={day.key} ref={dayRef} style={emptyRowStyle}>{line}</div>
      }
      return (
        <button
          key={day.key}
          ref={dayRef}
          onClick={() => onAddDay(day.key)}
          aria-label={addLabel}
          style={{
            ...emptyRowStyle, width: "100%", textAlign: "left",
            background: "transparent", border: "none", cursor: "pointer",
          }}
        >
          {line}
          <span aria-hidden="true" style={{
            marginLeft: "auto", color: "var(--color-accent)", fontSize: 15, fontWeight: 800,
          }}>
            +
          </span>
        </button>
      )
    }

    return (
      <div key={day.key} ref={dayRef} style={{
        background: "var(--color-surface)",
        border: `1px solid ${day.isToday ? "var(--color-accent)" : "var(--color-border)"}`,
        borderRadius: 18, overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          padding: "12px 14px", borderBottom: "1px solid var(--color-border-subtle)",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: 0.4, color: "var(--color-text-1)" }}>
              {label}
            </span>
            <span style={{
              fontSize: 12, color: "var(--color-text-3)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {formatDate(day.key)}
            </span>
          </div>
          {canAdd && (
            <button onClick={() => onAddDay(day.key)} aria-label={addLabel} style={addDayButtonStyle}>
              +
            </button>
          )}
        </div>

        <div style={{ padding: "12px 14px", display: "grid", gap: 14 }}>
          {day.groups.map((group) => (
            <DayPlanCard
              key={group.resortKey}
              group={group}
              colorCtx={colorCtx}
              currentUserId={currentUserId}
              canJoin={Boolean(currentUserId) && !day.isPast}
              joining={joiningKey === `${day.key}|${group.resortKey}`}
              onJoin={(resortKey) => onJoin?.(day.key, resortKey)}
              onOpenTrip={onOpenTrip}
              myResortKey={myPlanByDate?.get(day.key)?.resort_key ?? null}
              myPlanHasEta={Boolean(myPlanByDate?.get(day.key)?.eta)}
              onEditPlan={onEditPlan ? (resortKey) => onEditPlan(day.key, resortKey) : undefined}
              onAskToJoin={onAskToJoin ? (party) => onAskToJoin(day.key, group.resortKey, party) : undefined}
              askingPartyId={askingPartyId}
              askedPartyIds={askedPartyIds}
              onLeave={onLeave ? () => onLeave(day.key) : undefined}
              leaving={leavingKey === day.key}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {/* The past is reachable, just not in the way. Straight port of WeekView's
          disclosure, restyled to the mockup's dashed pill and now covering the
          whole past window rather than the current week's leading days. */}
      {past.length > 0 && (
        <>
          <button
            onClick={() => setShowPast((v) => !v)}
            aria-expanded={showPast}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: "none", border: "1px dashed var(--color-accent-dim)",
              borderRadius: 14, padding: "12px 14px", minHeight: 44,
              color: "var(--color-text-3)", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            <span style={{
              display: "inline-block", transition: "transform 0.15s",
              transform: showPast ? "rotate(90deg)" : "none",
            }}>
              ›
            </span>
            {showPast ? "Hide past days" : "Show past days"}
            {pastWithPlans > 0 && (
              <span style={{ color: "var(--color-accent)", fontWeight: 900 }}>{pastWithPlans}</span>
            )}
          </button>
          {showPast && past.map(renderDay)}
        </>
      )}
      {upcoming.map(renderDay)}
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `FriendsCalendar.jsx`'s imports and signature**

Replace lines 1-21 (the import block) with:

```jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import DayAgendaList from "./calendar/DayAgendaList"
import FilterChipRow from "./calendar/FilterChipRow"
import CalendarFilterSheet from "./calendar/CalendarFilterSheet"
import PlanEditorModal from "./PlanEditorModal"
import FailureNotice from "./ui/FailureNotice"
import { runLoaders, mergeFailed, selectLoaders } from "../lib/loaderRegistry"
import { agendaRange, localDateKey } from "../lib/calendarDates"
import { groupByDayAndMountain } from "../lib/calendarGrouping"
import { resortName } from "../lib/resorts"
import { formatDate } from "../lib/format"
import { buildPlanUpsert } from "../lib/planUpsert"
import {
  getVisiblePlansInRange, getAcceptedFriends, getMyPartyMembershipsInRange, requestToJoinParty,
  getIncomingPartyRequests, respondToCrewInvite,
  getMyCrews, getCrewMembers, joinPlanAtResort, upsertDailyPlan,
  deleteDailyPlan, leaveParty,
} from "../lib/socialApi"
```

Gone: `PlanCalendar`, `WeekView`, `DayPlanCard` (now only `DayAgendaList` imports it), `monthBounds`, `weekBounds`, `totalAttendees`, `ringColorFor`, `NEUTRAL_RING` — every one of those was used only by the two view branches this task deletes.

Then change the component signature (line 36-39) to add `addDayTick`:

```jsx
export default function FriendsCalendar({
  currentUser, onOpenTrip, trips = [], loading = false, onRequireLogin, onPlanADay,
  resorts = [], focusDate = null, onFocusHandled, addDayTick = 0,
}) {
```

- [ ] **Step 3: Replace the view-mode state with the agenda window**

Delete these four state declarations (currently lines 40-50): `viewMode`, `anchor`, `monthResetKey`, and the block comment above `monthResetKey`. Rename `selectedDay` (line 60) to `focusedDay`:

```jsx
  // The day a notification pointed at, if any: scrolled into view, and kept inside
  // the window even when it falls past the window's far edge.
  const [focusedDay, setFocusedDay] = useState(null)
```

Then replace line 132 (`const { start, end } = viewMode === "week" ? weekBounds(anchor) : monthBounds(anchor)`) with:

```jsx
  // ── Plan range: a rolling window, not a navigable one ────────────────────
  // Keyed on a date STRING so the memo is stable across renders — `new Date()`
  // would be a new object every time and refetch the calendar forever.
  const { start, end, keys: dayKeys } = useMemo(
    () => agendaRange(todayKey, { includeKey: focusedDay }),
    [todayKey, focusedDay]
  )
```

`todayKey` is already defined on line 83, above this point. `loadPlans`'s `[start, end]` dependency and its `rangeRef` out-of-order guard are unchanged and still correct — the range now changes when a focused day widens it rather than when someone clicks `›`.

- [ ] **Step 4: Point the focus effect and the add-day handler at the new state**

Replace the `focusDate` effect (lines 172-177) with:

```jsx
  // Arrived from a notification about a specific day. There is no anchor to move any
  // more, so instead the day is remembered: agendaRange widens the window to include
  // it, DayAgendaList scrolls to it and opens "Show past days" if it is behind us.
  // Still released via onFocusHandled — a focus prop that never clears is a trap.
  useEffect(() => {
    if (!focusDate) return
    setFocusedDay(focusDate)
    onFocusHandled?.()
  }, [focusDate, onFocusHandled])
```

Delete `shiftAnchor` entirely (lines 265-270). Replace `handleAddSkiDay` (lines 379-386) with:

```jsx
  /**
   * Open the ski-day editor.
   *
   * Two callers, one code path:
   *   handleAddSkiDay()            — from the page header's "+". No day chosen yet,
   *                                  so the modal gets onDateChange and lets you pick.
   *   handleAddSkiDay("2026-01-19") — from a day card's own "+". The day IS the
   *                                  question already answered; the modal renders the
   *                                  date as a plain heading (PlanEditorModal:90).
   */
  function handleAddSkiDay(seedDate = null) {
    if (!currentUserId) { onRequireLogin?.(); return }
    setEditorError(null)
    setEditorSeedResort(null)
    setDatePickable(!seedDate)
    // Clamp: past days are unreachable from the UI (DayAgendaList hides their "+"),
    // and a past date in a pickable editor would fight its own minDate.
    setEditorDate(!seedDate || seedDate < todayKey ? todayKey : seedDate)
  }
```

- [ ] **Step 5: Wire the page header's "+" to the editor**

Insert immediately after `const currentUserId = currentUser?.id || null` (line 84):

```jsx
  // The page header's "+" lives in SkiPlansPage; the ski-day editor and its save path
  // live here. SkiPlansPage bumps a counter, we open the editor when it changes.
  //
  // A counter, not a boolean, so a second tap after cancelling still fires. Adjusted
  // during render rather than in an effect for the same reason SkiPlansPage adjusts
  // `lastFocus` that way — an effect would cascade an extra render and trip
  // react-hooks/set-state-in-effect. Guarded on currentUserId because the signed-out
  // path calls onRequireLogin, and calling a PARENT's setState during render is
  // illegal; SkiPlansPage does that guard itself before ever bumping the counter.
  const [lastAddTick, setLastAddTick] = useState(addDayTick)
  if (addDayTick !== lastAddTick) {
    setLastAddTick(addDayTick)
    if (currentUserId) handleAddSkiDay()
  }
```

`handleAddSkiDay` is a hoisted function declaration further down the component body, so calling it here is valid.

- [ ] **Step 6: Delete the navigator header and render the agenda list**

Delete `const rangeLabel = ...` (line 413) and the entire header block (lines 453-501, from the `{/* Header */}` comment through the closing `</div>` of the week/month toggle). The rendered tree now opens directly with `<FilterChipRow …>`, unchanged.

Change the plans failure notice (line 632) to:

```jsx
      {failed.plans && <FailureNotice label="these days' plans" onRetry={loadPlans} />}
```

Change the `nobodyPlanned` sentence (line 667) to:

```jsx
          <div style={{ color: "var(--color-text-3)", fontSize: 13 }}>
            Nobody&apos;s planned a day yet.
          </div>
```

Then replace the whole `{viewMode === "week" ? (…) : (…)}` block (lines 695-792) with:

```jsx
      {!nobodyPlanned && (
        <DayAgendaList
          dayKeys={dayKeys}
          groupsByDay={groupsByDay}
          colorCtx={colorCtx}
          currentUserId={currentUserId}
          todayKey={todayKey}
          focusedDayKey={focusedDay}
          joiningKey={joiningKey}
          onJoin={handleJoin}
          onOpenTrip={onOpenTrip}
          myPlanByDate={myPlanByDate}
          onEditPlan={(dateKey, resortKey) => {
            setEditorError(null); setEditorDate(dateKey); setEditorSeedResort(resortKey)
          }}
          onAskToJoin={handleAskToJoin}
          askingPartyId={askingPartyId}
          askedPartyIds={askedPartyIds}
          onLeave={handleLeavePlan}
          leavingKey={leavingKey}
          onAddDay={handleAddSkiDay}
        />
      )}
```

Finally delete the trailing `const navBtn = { … }` (lines 834-838) — its only users were the deleted header buttons.

**Leave the in-calendar `+ Add ski day` button (lines 618-630) in place for now.** Task 4 removes it, once the page header's `+` is actually wired; deleting it here would leave one commit with no way to add a ski day.

- [ ] **Step 7: Delete `WeekView.jsx`**

```bash
git rm src/components/calendar/WeekView.jsx
```

- [ ] **Step 8: Verify nothing still references the deleted pieces**

```bash
grep -rn "WeekView\|viewMode\|monthResetKey\|shiftAnchor\|navBtn\|selectedDay\|PlanCalendar\|rangeLabel" src/components/FriendsCalendar.jsx src/components/calendar/
grep -rn "WeekView" src/
```
Expected: **no output from either.** (`PlanCalendar` must still appear in `SkiPlansTab.jsx` — that one stays.)

- [ ] **Step 9: Build and lint**

Run: `npx eslint src/components/FriendsCalendar.jsx src/components/calendar/ && npm run build`
Expected: eslint clean for those paths; build succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/components/calendar/DayAgendaList.jsx src/components/FriendsCalendar.jsx
# WeekView.jsx's deletion is already staged by Step 7's `git rm`.
git commit -m "feat: one scrolling day agenda replaces the week/month calendar

The mockup shows no grid, no month, and no navigator, so viewMode, the
7-column desktop week and PlanCalendar's month branch all go. The window
is a fixed 21 days forward with the past behind a disclosure, which is
WeekView's existing mobile behaviour widened rather than new logic.
PlanCalendar itself stays -- SkiPlansTab still uses it.

Each day now carries its own + that opens the plan editor pre-seeded with
that date, which is PlanEditorModal's existing non-pickable path."
```

---

## Task 3: One card per party, not one card per mountain

Implements spec decisions **#8** (mountain heading + `N going` pill, one bordered card per party, party-scoped avatars, `ringColorFor(ownerId, colorCtx)` left accent bar, solo attendees stay a footnote) and **#4** (every party the viewer is not in shows the locked "Ask to join", no "open" state).

**No unit test in this task, deliberately** — same reason as Task 2. The grouping this renders (`parties`, `solo`, `attendees`) is produced by `groupByDayAndMountain`, which already has `node --test` coverage in `src/lib/calendarGrouping.test.js` and is not being changed. Verified by build, lint and click-through.

**Files:**
- Modify: `src/components/calendar/DayPlanCard.jsx` (full render rewrite; 325 lines today)

**Interfaces:**
- Consumes: `group` from `groupByDayAndMountain()` — `{ resortKey, trip, attendees, parties, solo }`, where `attendees[i] = { userId, profile, eta, partyId, ownerId, name }` and `parties[i] = { partyId, ownerId, name, attendees }`. `ringColorFor(userId, ctx)` and `crewBadgesFor(userId, ctx)` from `crewColors.js`, `earliestEta(attendees)` from `calendarGrouping.js` — all unchanged.
- Produces: the same default export with the same props **minus `compact`**, which is deleted: `{ group, colorCtx, currentUserId, canJoin, joining, onJoin, onOpenTrip, myResortKey, myPlanHasEta, onEditPlan, onAskToJoin, askingPartyId, askedPartyIds, onLeave, leaving }`. `DayAgendaList` (Task 2) never passed `compact`, so no call site changes.

- [ ] **Step 1: Confirm `compact` has no remaining caller**

```bash
grep -rn "compact" src/components/calendar/ src/components/FriendsCalendar.jsx
```
Expected: matches **only inside `DayPlanCard.jsx` itself**. (The two callers that used it — `WeekView.jsx` and `FriendsCalendar`'s month branch — were deleted in Task 2. If anything else appears, stop and re-read Task 2.)

- [ ] **Step 2: Replace `src/components/calendar/DayPlanCard.jsx` with this file**

```jsx
import { resortName, resortEmoji, OPEN_RESORT_KEY } from "../../lib/resorts"
import { ringColorFor, crewBadgesFor } from "../../lib/crewColors"
import { earliestEta } from "../../lib/calendarGrouping"
import { formatEtaShort } from "../../lib/format"
import { useProfileNav } from "../../lib/profileNav"
import Avatar from "../ui/Avatar"

const MAX_AVATARS = 5
const MAX_NAMES = 3

function shortName(profile) {
  return profile?.first_name || profile?.full_name?.split(" ")[0] || profile?.username || "Someone"
}

/**
 * One mountain on one day: who is going, in which groups, and how to join.
 *
 * Structure follows the mockup: an unbordered heading row (mountain + "N going")
 * over one BORDERED CARD PER PARTY. It used to be the reverse — one card per
 * mountain with the parties as thin rows inside it — which showed every avatar at
 * the mountain on a card labelled with one crew's name.
 *
 * Each party card carries a left accent bar in its OWNER's crew color
 * (ringColorFor(ownerId, colorCtx)), reusing the existing crew-color system rather
 * than inventing a second one. The card surface itself stays neutral: a mountain
 * can hold skiers from two crews, so coloring the surface would need an arbitrary
 * tie-break (the original spec decision #7 — still true, now applied one level down).
 *
 * There is no "open"/direct-join party. Every party you are not in shows the locked
 * "Ask to join", which is the only thing migrations 037/038 actually support.
 *
 * @param {Object} props
 * @param {Object} props.group - { resortKey, attendees, parties, solo, trip }
 * @param {Object} props.colorCtx - crew color context; optionally includes crewNameById (Map<crewId, string>)
 * @param {string|null} props.currentUserId
 * @param {boolean} props.canJoin
 * @param {boolean} props.joining
 * @param {Function} props.onJoin
 * @param {Function} props.onOpenTrip
 * @param {string|null} props.myResortKey - the signed-in user's own resort_key for
 *   this date, if any, so the join button can say "Switch from X" honestly.
 * @param {Function} [props.onEditPlan] - called with this card's resortKey when the
 *   "Add ETA"/"Edit plan" affordance is tapped.
 * @param {boolean} [props.myPlanHasEta] - purely to choose that affordance's label.
 * @param {Function} [props.onAskToJoin] - called with the party object.
 * @param {string|null} [props.askingPartyId]
 * @param {Set<string>} [props.askedPartyIds]
 * @param {Function} [props.onLeave]
 * @param {boolean} [props.leaving]
 */
export default function DayPlanCard({
  group, colorCtx, currentUserId, canJoin = false, joining = false,
  onJoin, onOpenTrip, myResortKey = null, onEditPlan,
  myPlanHasEta = false, onAskToJoin, askingPartyId = null, askedPartyIds,
  onLeave, leaving = false,
}) {
  const openProfile = useProfileNav()
  const { resortKey, attendees, trip, parties = [], solo = [] } = group
  const alreadyIn = attendees.some((a) => a.userId === currentUserId)
  const isOpenGroup = resortKey === OPEN_RESORT_KEY
  // daily_plans is UNIQUE (user_id, ski_date), so joining a second mountain moves
  // the plan rather than adding one. The button has to say so before the tap.
  const switchingFrom = !alreadyIn && myResortKey && myResortKey !== resortKey
    ? resortName(myResortKey)
    : null
  // "I'm also going", not "I'm in". This sets YOUR plan for this mountain; it does
  // not put you in anyone's group. That is what "Ask to join" is for.
  const joinLabel = switchingFrom ? `Switch from ${switchingFrom}` : "I'm also going"
  // Which of these groups I am in, if any. Only meaningful when I am on this mountain.
  const myPartyId = attendees.find((a) => a.userId === currentUserId)?.partyId ?? null
  const groupEta = formatEtaShort(earliestEta(attendees))

  function partyLabel(p) {
    if (p.name) return p.name
    const owner = p.attendees.find((a) => a.userId === p.ownerId)
    if (owner) return `${shortName(owner.profile)}'s group`
    // The owner is in this party but skiing a different mountain today.
    return "Group"
  }

  function canAsk(p) {
    return Boolean(canJoin && currentUserId && p.partyId !== myPartyId && p.ownerId !== currentUserId)
  }

  /** One ringed, tappable avatar. `overlap` stacks it under the previous one. */
  function renderAvatar(a, index, overlap) {
    const badges = crewBadgesFor(a.userId, colorCtx)
    const crewNames = badges
      .map((id) => colorCtx.crewNameById?.get?.(id))
      .filter(Boolean)
    const crewPart = badges.length > 1 && crewNames.length > 0 ? ` · ${crewNames.join(", ")}` : ""
    const displayTitle = (a.profile?.full_name || a.profile?.username || "Someone") + crewPart
    return (
      <button
        key={a.userId}
        onClick={() => a.userId !== currentUserId && openProfile(a.userId)}
        title={displayTitle}
        style={{
          background: "none", border: "none", padding: 0, lineHeight: 0,
          cursor: a.userId === currentUserId ? "default" : "pointer",
          borderRadius: "50%",
          marginLeft: overlap && index > 0 ? -8 : 0,
          boxShadow: `0 0 0 2px ${ringColorFor(a.userId, colorCtx)}`,
        }}
      >
        <Avatar profile={a.profile} size={26} />
      </button>
    )
  }

  return (
    <div style={{ display: "grid", gap: 9 }}>
      {/* Mountain heading — a heading, not a card. The cards below are the groups. */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 14, fontWeight: 800, color: "var(--color-text-1)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {resortEmoji(resortKey)} {resortName(resortKey) || resortKey}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, color: "var(--color-accent)",
          background: "var(--color-accent-dim)", borderRadius: 999,
          padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0,
        }}>
          {attendees.length} {isOpenGroup ? "free" : "going"}
        </span>
        {/* First chair: the EARLIEST ETA of everyone on the mountain, not any one
            person's — it answers "when is everyone on the hill". Rendered only when
            somebody actually set one. */}
        {groupEta && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: "var(--color-text-3)", whiteSpace: "nowrap",
          }}>
            from {groupEta}
          </span>
        )}
      </div>

      {/* Trip badge — a trip at this resort folds in here rather than sitting beside
          it, so one day's answer is not split across two lists. */}
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

      {parties.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          {parties.map((p) => {
            const mine = p.partyId === myPartyId
            const shown = p.attendees.slice(0, MAX_AVATARS)
            const overflow = p.attendees.length - shown.length
            const asking = askingPartyId === p.partyId
            const asked = Boolean(askedPartyIds?.has?.(p.partyId))
            return (
              <div
                key={p.partyId}
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  // The one place a color rides the surface, and it is unambiguous:
                  // a PARTY has exactly one owner, so there is nothing to tie-break.
                  borderLeft: `3px solid ${ringColorFor(p.ownerId, colorCtx)}`,
                  borderRadius: 12, padding: "11px 12px", display: "grid", gap: 10,
                }}
              >
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                }}>
                  <span style={{
                    fontSize: 13, fontWeight: 800, color: "var(--color-text-1)", minWidth: 0,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {mine ? "👥 Your group" : `👥 ${partyLabel(p)}`}
                    <span style={{ color: "var(--color-text-3)", fontWeight: 600 }}>
                      {" · "}{p.attendees.length}
                    </span>
                  </span>
                  {/* Avatars scoped to THIS party. The mountain headcount above still
                      counts everyone; this row says who is actually together. */}
                  <div style={{ display: "flex", paddingLeft: 8, flexShrink: 0 }}>
                    {shown.map((a, i) => renderAvatar(a, i, true))}
                    {overflow > 0 && (
                      <span style={{
                        marginLeft: -8, width: 26, height: 26, borderRadius: "50%",
                        background: "var(--color-surface-popover)", border: "2px solid var(--color-bg)",
                        display: "grid", placeItems: "center",
                        fontSize: 9, fontWeight: 800, color: "var(--color-text-2)",
                      }}>
                        +{overflow}
                      </span>
                    )}
                  </div>
                </div>

                {mine && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    background: "var(--color-success-bg)", border: "1px solid var(--color-success)",
                    color: "var(--color-success)", borderRadius: 10, padding: 9,
                    fontSize: 12, fontWeight: 800,
                  }}>
                    ✓ You&apos;re in this group
                  </div>
                )}
                {!mine && canAsk(p) && asked && (
                  <div style={{
                    textAlign: "center", borderRadius: 10, padding: 9,
                    border: "1px solid var(--color-border)",
                    fontSize: 12, fontWeight: 800, color: "var(--color-text-3)",
                  }}>
                    Asked
                  </div>
                )}
                {!mine && canAsk(p) && !asked && (
                  <button
                    onClick={() => onAskToJoin?.(p)}
                    disabled={asking}
                    style={{
                      width: "100%", display: "flex", alignItems: "center",
                      justifyContent: "center", gap: 7,
                      background: "transparent", color: "var(--color-accent)",
                      border: "1px solid var(--color-accent)", borderRadius: 10,
                      padding: 9, minHeight: 44, fontSize: 12, fontWeight: 800,
                      cursor: asking ? "wait" : "pointer", opacity: asking ? 0.6 : 1,
                    }}
                  >
                    {asking ? "Asking…" : "🔒 Ask to join"}
                  </button>
                )}
              </div>
            )
          })}
          {/* Solo attendees stay a footnote rather than becoming their own card shape:
              the mockup has no ungrouped sample to match, and inventing one is not
              warranted by anything in it. */}
          {solo.length > 0 && (
            <div style={{ fontSize: 10, color: "var(--color-text-3)" }}>
              {solo.length} not in a group
            </div>
          )}
        </div>
      ) : (
        // Nobody on this mountain is in a party — which is most of them, since
        // parties are opt-in. Without this fallback the card would show a headcount
        // and no faces at all.
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
            {attendees.slice(0, MAX_AVATARS).map((a, i) => renderAvatar(a, i, false))}
            {attendees.length > MAX_AVATARS && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-3)" }}>
                +{attendees.length - MAX_AVATARS}
              </span>
            )}
          </div>
          <div style={{
            fontSize: 11, color: "var(--color-text-2)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {attendees.slice(0, MAX_NAMES).map((a) => shortName(a.profile)).join(", ")}
            {attendees.length > MAX_NAMES ? `, +${attendees.length - MAX_NAMES}` : ""}
          </div>
        </div>
      )}

      {/* Crew badges footnote — only for attendees in two or more selected crews,
          whose ring can only show the first one. */}
      {attendees.some((a) => crewBadgesFor(a.userId, colorCtx).length > 1) && (
        <div style={{ display: "grid", gap: 2 }}>
          {attendees
            .map((a) => {
              const badges = crewBadgesFor(a.userId, colorCtx)
              if (badges.length < 2) return null
              const crewNames = badges
                .map((id) => colorCtx.crewNameById?.get?.(id))
                .filter(Boolean)
              if (crewNames.length === 0) return null
              return (
                <div
                  key={a.userId}
                  style={{
                    fontSize: 10,
                    color: "var(--color-text-3)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {shortName(a.profile)} · {crewNames.join(", ")}
                </div>
              )
            })
            .filter(Boolean)}
        </div>
      )}

      {/* Mountain-level actions. "I'm also going" joins the MOUNTAIN, not a party —
          unchanged, deliberately named, and hidden once you are on this mountain or
          the date has passed. */}
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
          {joining ? "Saving…" : joinLabel}
        </button>
      )}
      {alreadyIn && (
        <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--color-success)" }}>
            ✓ You&apos;re in
          </span>
          {onEditPlan && canJoin && (
            <button
              onClick={() => onEditPlan(resortKey)}
              style={{
                background: "transparent", border: "1px solid var(--color-border)",
                borderRadius: 10, padding: "8px 12px", minHeight: 44,
                fontSize: 12, fontWeight: 700, color: "var(--color-text-2)",
                cursor: "pointer",
              }}
            >
              {myPlanHasEta ? "Edit plan" : "Add ETA"}
            </button>
          )}
          {/* Only when YOUR PLAN is what puts you on this card. You can also be here
              via a trip RSVP with no plan of your own, and there "Not going" would
              delete nothing — a button that silently does nothing is worse than none.
              Leaving a trip is a different action, on the trip card. */}
          {onLeave && canJoin && myResortKey === resortKey && (
            <button
              onClick={() => onLeave(resortKey)}
              disabled={leaving}
              style={{
                background: "transparent", border: "none",
                padding: "8px 6px", minHeight: 44,
                fontSize: 11, fontWeight: 700,
                color: "var(--color-text-3)", textDecoration: "underline",
                cursor: leaving ? "wait" : "pointer", opacity: leaving ? 0.6 : 1,
              }}
            >
              {leaving ? "…" : "Not going"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Build and lint**

Run: `npx eslint src/components/calendar/ && npm run build`
Expected: clean; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/calendar/DayPlanCard.jsx
git commit -m "feat: a card per party under a mountain heading

The old card put one crew's name on a row while showing every avatar at
the mountain -- the avatars said 'these people', the label said 'this
group', and only one of them was true. Now the mountain is a heading with
its own headcount and each party is its own card with only its own faces,
accented on the left in the owner's crew color.

Parties you are not in still show the locked Ask to join. There is no
open/direct-join party in the schema and this does not invent one.

compact is gone with its last caller (WeekView)."
```

---

## Task 4: Page header, sub-tab pill, and three widgets cut

Implements spec decisions **#2** (cut `UpcomingStrip`, `NextTripCard`, `AvatarStatusRail`; keep `PingCta`, restyled to a text link), **#5** (context-sensitive header `+`) and **#7** (full-width two-segment pill). Honours non-goal **#1** (`TripCard` and the Trips list rendering unchanged).

**No unit test in this task, deliberately** — it is deletion plus restyling in one component file, with no extractable logic. Verified by build, lint and click-through.

**Files:**
- Modify: `src/components/SkiPlansPage.jsx` (543 lines today → ~245)
- Modify: `src/components/FriendsCalendar.jsx` (delete the now-duplicated in-calendar "+ Add ski day" button)

**Interfaces:**
- Consumes: `FriendsCalendar`'s `addDayTick: number` prop (Task 2); `CreateTripModal({ onClose, onCreated })`; `TripDetailModal({ trip, currentUser, onClose, onUpdate })`; `TripCard({ trip, currentUser, onUpdate, onRequireLogin, isInvited, onDeleted })` — all verified unchanged.
- Produces: nothing consumed by a later task. Task 5 depends only on the `AvatarStatusRail` import disappearing here.

- [ ] **Step 1: Replace `src/components/SkiPlansPage.jsx` with this file**

```jsx
import { useCallback, useEffect, useState } from "react"
import { getAllVisibleTrips, getCurrentUser, getAcceptedFriends } from "../lib/socialApi"
import TripCard from "./TripCard"
import CreateTripModal from "./CreateTripModal"
import TripDetailModal from "./TripDetailModal"
import FriendsCalendar from "./FriendsCalendar"
import { SkiPingComposer } from "./SkiPingModal"

/* ── Ski Ping CTA ─────────────────────────────────────────────────────
 * DO NOT DELETE. This button is the ONLY trigger for SkiPingComposer anywhere in
 * the app — the Friends slice removed its own duplicate "Ping Crew" button on
 * exactly that basis. Cutting it makes ski pings unreachable, not tidier.
 *
 * Restyled here (2026-09-04) from a full-width hero card to a text link under the
 * page header: the mockup has no equivalent element, so it gets the smallest
 * treatment that keeps it discoverable. */
function PingCta({ currentUser }) {
  const [open, setOpen] = useState(false)
  const [friends, setFriends] = useState(null)

  if (!currentUser) return null

  async function handleOpen() {
    setOpen(true)
    if (!friends) {
      getAcceptedFriends().then(setFriends).catch(() => setFriends([]))
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        style={{
          background: "none", border: "none", padding: "6px 0", cursor: "pointer",
          color: "var(--color-accent)", fontSize: 12, fontWeight: 700,
          textDecoration: "underline", textUnderlineOffset: 3,
        }}
      >
        👋 Ping a friend to ski →
      </button>
      {open && friends !== null && (
        <SkiPingComposer
          friends={friends}
          onClose={() => setOpen(false)}
          onSent={() => setOpen(false)}
        />
      )}
    </>
  )
}

const SUB_TABS = [
  { key: "calendar", label: "Ski days" },
  { key: "trips",    label: "Trips" },
]

/* The mockup carries a one-line explainer under each segment. Kept verbatim: a ski
   day and a trip are genuinely different objects in this app and people conflate
   them constantly. */
const SUB_TAB_HINT = {
  calendar: "Where you and your friends are skiing, by day. Tap + on a day to add yours.",
  trips: "Bigger plans — meeting spots, carpool, chat. A trip is a multi-part outing; a ski day is just where you're riding.",
}

/* ── Main page ─────────────────────────────────────────────────────── */
export default function SkiPlansPage({ onRequireLogin, resorts, focusDate = null, onFocusHandled }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [myTrips, setMyTrips] = useState([])
  const [rsvpdTrips, setRsvpdTrips] = useState([])
  const [friendsTrips, setFriendsTrips] = useState([])
  const [invitedTrips, setInvitedTrips] = useState([])
  const [deletedIds, setDeletedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [tripDetail, setTripDetail] = useState(null)
  const [subTab, setSubTab] = useState("calendar")
  // Bumped by the header "+" while the Ski days tab is open. FriendsCalendar owns
  // the ski-day editor and its save path, so a counter is how a button up here
  // reaches down into it without a second copy of that wiring.
  const [addDayTick, setAddDayTick] = useState(0)

  // A notification pointing at a ski day has to land ON the calendar. Tapping it while
  // the Trips sub-tab happened to be open would otherwise leave you on the wrong half
  // of the page with nothing obviously different.
  //
  // Adjusted during render rather than in an effect — React's documented pattern for
  // "adjust state when a prop changes". An effect here would set state synchronously on
  // mount and cascade an extra render, which is what react-hooks/set-state-in-effect flags.
  const [lastFocus, setLastFocus] = useState(null)
  if (focusDate && focusDate !== lastFocus) {
    setLastFocus(focusDate)
    setSubTab("calendar")
  }

  const loadTrips = useCallback(async () => {
    try {
      const { mine, friends, rsvpd, invited } = await getAllVisibleTrips()
      setMyTrips(mine)
      setRsvpdTrips(rsvpd)
      setFriendsTrips(friends)
      setInvitedTrips(invited || [])
    } catch (e) {
      console.warn("Trips load failed:", e)
    }
  }, [])

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser()
      setCurrentUser(user)
      if (user) {
        await loadTrips()
      }
      setLoading(false)
    }
    init()
  }, [loadTrips])

  function handleCreateTrip() {
    if (!currentUser) { onRequireLogin?.(); return }
    setShowCreate(true)
  }

  /**
   * The header "+" means whichever thing the open sub-tab is about: a ski day on
   * Ski days, a trip on Trips. It replaces a "+ New Trip" button that was visible
   * even while you were looking at the calendar, where it was the wrong verb.
   *
   * The signed-out guard lives HERE, not in FriendsCalendar, because FriendsCalendar
   * reacts to addDayTick during render and calling a parent's onRequireLogin from a
   * child's render is illegal.
   */
  function handleHeaderAdd() {
    if (!currentUser) { onRequireLogin?.(); return }
    if (subTab === "trips") { setShowCreate(true); return }
    setAddDayTick((n) => n + 1)
  }

  const seenIds = new Set()
  const flatTrips = [
    ...invitedTrips.map((t) => ({ ...t, _isInvited: true })),
    ...myTrips.map((t) => ({ ...t, _isInvited: false })),
    ...rsvpdTrips.map((t) => ({ ...t, _isInvited: false })),
    ...friendsTrips.map((t) => ({ ...t, _isInvited: false })),
  ].filter((t) => {
    if (seenIds.has(t.id) || deletedIds.has(t.id)) return false
    seenIds.add(t.id)
    return true
  }).sort((a, b) => (a.ski_date || "").localeCompare(b.ski_date || ""))

  return (
    <div style={{ paddingBottom: 48 }}>
      {/* TripCard.jsx:219 carries className="trip-card" and this is the only
          definition of its hover rule anywhere in src/. It stays. The .strip-card,
          .plan-cta and .hype-btn rules that used to live here went with their
          elements (.hype-btn had no consumer at all — verified by grep). */}
      <style>{`
        .trip-card:hover { transform: translateY(-3px); box-shadow: 0 36px 90px rgba(0,0,0,0.65) !important; }
      `}</style>

      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: -0.5, color: "white" }}>
          Plans
        </h2>
        <button
          onClick={handleHeaderAdd}
          aria-label={subTab === "trips" ? "New trip" : "Add a ski day"}
          title={subTab === "trips" ? "New trip" : "Add a ski day"}
          style={{
            width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
            background: "var(--gradient-cta)", border: "none", color: "white",
            fontSize: 24, fontWeight: 400, lineHeight: 1, cursor: "pointer",
            display: "grid", placeItems: "center",
            boxShadow: "0 6px 20px var(--color-accent-glow)",
          }}
        >
          +
        </button>
      </div>

      <PingCta currentUser={currentUser} />

      {/* ── Sub-tab selector ── */}
      <div style={{
        display: "flex", gap: 3, marginTop: 14,
        background: "var(--color-surface)", border: "1px solid var(--color-border)",
        borderRadius: 12, padding: 4,
      }}>
        {SUB_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            style={{
              flex: 1, borderRadius: 9, border: "none", minHeight: 44,
              padding: "10px 0", fontSize: 13, fontWeight: 800, cursor: "pointer",
              background: subTab === key ? "var(--gradient-cta)" : "transparent",
              color: subTab === key ? "white" : "var(--color-text-3)",
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{
        fontSize: 11, color: "var(--color-text-3)", lineHeight: 1.5, margin: "12px 2px 16px",
      }}>
        {SUB_TAB_HINT[subTab]}
      </div>

      {/* ── Trips tab ── unchanged below this line except for the two renamed
          handlers; TripCard and the grid it sits in are explicitly out of scope. */}
      {subTab === "trips" && (
        <>
          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Loading trips…</div>
          ) : !currentUser ? (
            <div style={{ borderRadius: 24, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "48px 28px", textAlign: "center", display: "grid", gap: 16, justifyItems: "center" }}>
              <div style={{ fontSize: 38 }}>🎿</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>Sign in to see your trips</div>
              <button onClick={() => onRequireLogin?.()} style={{ background: "var(--gradient-cta)", color: "white", border: "none", borderRadius: 12, padding: "12px 24px", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>Sign In</button>
            </div>
          ) : flatTrips.length === 0 ? (
            <div style={{ borderRadius: 24, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "52px 28px", textAlign: "center", display: "grid", gap: 18, justifyItems: "center" }}>
              <div style={{ fontSize: 38 }}>🏔️</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "white" }}>No ski trips yet</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.48)", maxWidth: 340, lineHeight: 1.6 }}>Create a trip, pick a mountain, then let your crew RSVP in one tap.</div>
              <button onClick={handleCreateTrip} style={{ background: "var(--gradient-cta)", color: "white", border: "none", borderRadius: 14, padding: "13px 28px", fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 28px rgba(37,99,235,0.4)" }}>
                Plan a Trip 🎿
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {invitedTrips.length > 0 && (
                <div style={{
                  background: "rgba(96,165,250,0.07)",
                  border: "1px solid rgba(96,165,250,0.25)",
                  borderLeft: "4px solid var(--color-accent-soft)",
                  borderRadius: 14,
                  padding: "13px 18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "var(--color-banner-highlight)" }}>
                    ✉️ You have {invitedTrips.length} trip invite{invitedTrips.length > 1 ? "s" : ""}
                  </span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Respond below ↓</span>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                {flatTrips.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    currentUser={currentUser}
                    onUpdate={loadTrips}
                    onRequireLogin={onRequireLogin}
                    isInvited={trip._isInvited}
                    onDeleted={() => { setDeletedIds((p) => new Set([...p, trip.id])); loadTrips() }}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Ski days tab ──
          No surrounding panel any more: each day is its own card in the agenda list,
          and a card-inside-a-card was the old grid's frame, not the mockup's. */}
      {subTab === "calendar" && (
        <FriendsCalendar
          currentUser={currentUser}
          onOpenTrip={setTripDetail}
          trips={flatTrips}
          loading={loading}
          onRequireLogin={onRequireLogin}
          onPlanADay={() => { setSubTab("trips"); handleCreateTrip() }}
          resorts={resorts}
          focusDate={focusDate}
          onFocusHandled={onFocusHandled}
          addDayTick={addDayTick}
        />
      )}

      {/* Trip detail — opened from a day card's trip badge */}
      {tripDetail && (
        <TripDetailModal
          trip={tripDetail}
          currentUser={currentUser}
          onClose={() => setTripDetail(null)}
          onUpdate={() => { loadTrips() }}
        />
      )}

      {/* Create trip — header "+" on the Trips tab, and the two empty-state buttons */}
      {showCreate && (
        <CreateTripModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadTrips() }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Remove the now-duplicated "+ Add ski day" button from `FriendsCalendar.jsx`**

Delete this whole block (lines 615-630 before this task's edits — find it by its comment, which starts `Add a ski day without leaving the Plans tab`):

```jsx
      {currentUserId && (
        <button
          onClick={handleAddSkiDay}
          style={{ … }}
        >
          + Add ski day
        </button>
      )}
```

`handleAddSkiDay` keeps three callers and must NOT be deleted: the `addDayTick` render-time hook (Task 2 Step 5), `DayAgendaList`'s `onAddDay`, and the `nobodyPlanned` empty state's own `+ Add ski day` button, which spec decision #9 keeps.

- [ ] **Step 3: Verify the three cut widgets are really gone**

```bash
grep -rn "UpcomingStrip\|NextTripCard\|AvatarStatusRail\|stripTrip\|handleCreateClick" src/components/SkiPlansPage.jsx
grep -rn "rsvpToTrip" src/components/SkiPlansPage.jsx
```
Expected: **no output.** (`rsvpToTrip` is still exported from `socialApi.js` and used by `TripCard.jsx` — it is only this page's import of it that goes.)

- [ ] **Step 4: Lint and build**

Run: `npx eslint src/components/SkiPlansPage.jsx src/components/FriendsCalendar.jsx`
Expected: **0 problems** — including the two pre-existing errors (`useRef` unused, `currentUser` unused in `UpcomingStrip`), whose code no longer exists.

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add src/components/SkiPlansPage.jsx src/components/FriendsCalendar.jsx
git commit -m "feat: mockup header, segmented sub-tabs, three widgets cut

UpcomingStrip and NextTripCard both re-showed the Trips sub-tab's own
data one tap away from it; AvatarStatusRail re-showed TodaysCrew's live
statuses from the Today tab. None appear in the mockup.

PingCta stays -- it is the only trigger for SkiPingComposer in the whole
app -- restyled from a hero card to a text link.

The header + now means the thing the open sub-tab is about, replacing a
'New Trip' button that was the wrong verb while you were on the calendar."
```

---

## Task 5: Delete the dead `AvatarStatusRail`

Completes spec decision **#2**. Verified finding 1: after Task 4 nothing imports this file.

**Files:**
- Delete: `src/components/ui/AvatarStatusRail.jsx`
- Modify: `src/components/TodaysCrew.jsx` (comment, line 23), `src/components/ActiveSessionBar.jsx` (comment, line 18), `src/lib/socialApi.js` (comment, line 706), `src/lib/profileNav.js` (comment, line 8)

**Interfaces:**
- Consumes: nothing. Produces: nothing. This task is pure removal and comment repair.

- [ ] **Step 1: Prove there is no importer left**

```bash
grep -rn "AvatarStatusRail" src/
```
Expected: exactly six hits — `AvatarStatusRail.jsx`'s own two (its header comment on line 1 and `export default` on line 29) plus the four prose comments listed above. **If any line contains `import` or `<AvatarStatusRail`, stop:** Task 4 was not completed.

- [ ] **Step 2: Delete the file**

```bash
git rm src/components/ui/AvatarStatusRail.jsx
```

- [ ] **Step 3: Repair the four comments that name it**

Each of these mentions a file that no longer exists. Edit only the prose; no code changes.

`src/components/TodaysCrew.jsx:23` — currently `// unresolved value as AvatarStatusRail.jsx's identical "done" case (Task 1, rule 9).` Replace that line with:

```js
  // unresolved value the same way the old ui/AvatarStatusRail.jsx did for "done"
  // (Task 1, rule 9; that file was deleted with the Plans redesign, 2026-09-04).
```

`src/components/ActiveSessionBar.jsx:18` — currently `// flagged TODO(theming) on AvatarStatusRail.jsx's unknown-status case; left`. Replace with:

```js
  // flagged TODO(theming) on the old ui/AvatarStatusRail.jsx unknown-status case
  // (deleted 2026-09-04); left
```

`src/lib/socialApi.js:706` — currently `// ui/AvatarStatusRail.jsx all call it. Sprint 34 moved visibility enforcement`. Replace with:

```js
// TodaysCrew.jsx calls it. Sprint 34 moved visibility enforcement
```

Read the two lines above it first and keep the sentence grammatical — it is a list of callers and `ui/AvatarStatusRail.jsx` is one item in it.

`src/lib/profileNav.js:8` — currently `* shared ui/AvatarStatusRail primitive. Threading a callback to all of them`. Replace with:

```js
 * shared avatar primitives. Threading a callback to all of them
```

- [ ] **Step 4: Verify**

```bash
grep -rn "AvatarStatusRail" src/
```
Expected: **no output.**

Run: `npx eslint . ; npm run build`
Expected: build succeeds; eslint total no higher than the pre-branch baseline.

- [ ] **Step 5: Commit**

```bash
git add -A src/
git commit -m "refactor: delete ui/AvatarStatusRail, now unimported

Its live-status data has been on the Today tab in TodaysCrew.jsx since
TASK 22.5 with the same status vocabulary; the Plans page was the only
importer and no longer renders it. Four comments elsewhere named the file
and have been reworded rather than left pointing at nothing."
```

---

## Task 6: Full verification and roadmap bookkeeping

Closes the spec's note that TASK 22.1's placement/framing/grouping questions are resolved by this slice.

**Files:**
- Modify: `ROADMAP.md` (the `### TASK 22.1` block at line 2189, and its Sprint 43 row at line 2249)

**Interfaces:**
- Consumes: everything Tasks 1-5 produced. Produces: nothing.

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: **233 pass, 0 fail** (223 on `main` + Task 1's 10). If the number is higher, someone else's tests landed — re-baseline against `main`, do not "fix" it.

- [ ] **Step 2: Lint the whole repo**

Run: `npx eslint .`
Expected: **no new problems versus a fresh-worktree baseline of this branch's merge-base.** The ROADMAP records 88 problems (80 errors, 8 warnings) in a fresh checkout; a working copy has separately shown 95, all confined to `server/*.js` from node_modules drift, so **compare counts, and if the number looks off re-run the baseline in a clean worktree of the merge-base rather than trusting either figure.** The four paths this branch touches must be **0**:

```bash
npx eslint src/components/SkiPlansPage.jsx src/components/FriendsCalendar.jsx src/components/calendar/ src/lib/calendarDates.js
```
Expected: `0 problems` (down from the 2 measured on `main`).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: success, no new warnings about unresolved imports.

- [ ] **Step 4: Confirm the non-goals really were not touched**

```bash
git diff --stat main...HEAD
```
Expected: the changed-file list is **exactly** — `ROADMAP.md`, `docs/superpowers/plans/2026-09-04-plans-page-slice.md`, `src/components/FriendsCalendar.jsx`, `src/components/SkiPlansPage.jsx`, `src/components/calendar/DayAgendaList.jsx` (new), `src/components/calendar/DayPlanCard.jsx`, `src/components/calendar/WeekView.jsx` (deleted), `src/components/ui/AvatarStatusRail.jsx` (deleted), `src/lib/calendarDates.js`, `src/lib/calendarDates.test.js`, plus the four comment-only edits from Task 5 (`src/components/TodaysCrew.jsx`, `src/components/ActiveSessionBar.jsx`, `src/lib/socialApi.js`, `src/lib/profileNav.js`).

**Anything under `migrations/`, `supabase/`, `TripCard.jsx`, `CreateTripModal.jsx`, `TripDetailModal.jsx`, `PlanCalendar.jsx`, `PlanEditorModal.jsx`, `calendar/FilterChipRow.jsx`, `calendar/CalendarFilterSheet.jsx`, `lib/calendarGrouping.js` or `lib/crewColors.js` in that list is a scope violation — revert it.**

- [ ] **Step 5: Mark TASK 22.1 subsumed in `ROADMAP.md`**

Replace the heading at line 2189:

```markdown
### TASK 22.1 — Friends-calendar as the flagship view — **CLOSED, subsumed by TASK 22.0's Plans slice (2026-09-04)**
```

and insert immediately under it, above the existing `**Scheduled Sprint 43**` paragraph:

```markdown
**Resolved by the Plans mockup-fidelity slice** (`docs/superpowers/specs/2026-09-04-plans-page-slice-design.md`,
`docs/superpowers/plans/2026-09-04-plans-page-slice.md`). Three of the five open questions
below are now answered in code: it **stays inside Plans**, as the default "Ski days" sub-tab
rather than a buried one; the month grid is **replaced by a near-term day agenda** (rolling
21 days forward, past behind a disclosure); and it **groups by mountain**, with one card per
party underneath. The two that remain — a nudge to join a friend's day beyond the existing
"Ask to join", and richer empty-state copy — stay backlog, and are not worth their own task.
```

Then update the Sprint 43 row at line 2249 so the sequence table does not still schedule it:

```markdown
| **43** | ~~TASK 22.1 — Friends-calendar flagship placement~~ — closed, subsumed by TASK 22.0's Plans slice | — |
```

- [ ] **Step 6: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: close TASK 22.1, subsumed by the Plans page slice

Placement, framing and grouping were its three blocking design questions
and all three are now shipped code, not open questions."
```

---

## What Kyle must click through

No subagent in this environment has a browser. `npm test`, `npx eslint .` and `npm run build` are the ceiling of automated verification for everything in Tasks 2-5. These need a human on a real device:

1. **The agenda list itself** — Plans → Ski days shows one scrolling list of days, no week/month buttons, no `‹ › Today`, on both phone and desktop width. Days with plans are cards; days without are one thin line.
2. **"Show past days"** — the dashed pill appears above the list, expands to reveal the last 7 days, collapses again, and shows a count when a past day had plans.
3. **The per-day `+`** (Deviation 2's knowingly-small 26×26 target) — opens the plan editor with **that day's date as a plain heading, no date picker**, and saving lands the plan on that day. Say so if the target is fiddly; bumping it to 32-36 is two numbers.
4. **The header `+`** — on Ski days it opens the editor **with a date picker** defaulting to today; on Trips it opens Create Trip. Switching sub-tabs changes what it does.
5. **Party cards** — a mountain with two or more parties shows a heading with the mountain's total, then one card per party, each showing **only its own people's avatars**, each with a colored left bar. Confirm the bar colors are distinguishable in your theme and that a party you own reads sensibly (it uses the near-white "self" color).
6. **"Ask to join"** — still sends the request, still flips to "Asked", on a party you are not in. **No party should ever show a direct-join button.**
7. **"I'm also going" / "✓ You're in" / "Add ETA" / "Not going"** — unchanged behaviour at the mountain level, including "Switch from X" when you already have a plan elsewhere that day.
8. **A mountain where nobody is in a party** (the common case today) — still shows faces and names, not just a headcount.
9. **The notification path** — tapping a ski-day notification lands on Plans → Ski days, scrolls to that day, and works even for a day more than 21 days out or already past (Deviation 3).
10. **Empty states** — all three still reachable: no friends/crews, no chips selected, nobody planned. The third now reads "Nobody's planned a day yet." (Deviation 1) and still offers both `+ Add ski day` and `Create a trip`.
11. **Ping a friend to ski** — the text link under the header still opens the ski-ping composer and still sends. **This is the only route to that feature in the entire app.**
12. **The Trips sub-tab is visually unchanged** apart from the shared header and segmented control — same trip cards, same RSVP chips, same invite banner. Hover on a trip card still lifts it (the `.trip-card` rule moved nowhere but its neighbours were deleted).
13. **Theme check** — switch themes; the segmented control's active segment, the `N going` pill and the party accent bars should all still be legible.

---

## Self-Review

**1. Spec coverage.** Every Design Decision and Non-goal in `2026-09-04-plans-page-slice-design.md` maps to a task:

| Spec item | Task |
|---|---|
| #1 agenda list; `viewMode`/`WeekView` desktop grid/`PlanCalendar` month grid removed | 2 (Steps 2, 3, 6, 7) |
| #1 rolling 21-day forward window as a tested pure helper | 1 |
| #1 empty days collapse to a thin line | 2 (Step 1, `renderDay`) |
| #1 no `‹ › Today` navigator | 2 (Step 6, header block deleted) |
| #1 "Show past days" disclosure, reusing `showPast` | 2 (Step 1, the `past`/`upcoming`/`pastWithPlans` block) |
| #2 cut `UpcomingStrip`, `NextTripCard` | 4 (Step 1) |
| #2 cut `AvatarStatusRail` usage, then the now-dead file | 4 (Step 1), 5 |
| #2 `PingCta` kept, restyled to a text link under the header | 4 (Step 1) |
| #3 `TripCard.jsx` unchanged | enforced by Task 6 Step 4's diff check |
| #4 no "open" join state; locked "Ask to join" via existing `requestToJoinParty` | 3 (Step 2, the `canAsk`/`asked` branches); handler untouched in `FriendsCalendar` |
| #4 "I'm also going" unchanged | 3 (Step 2, mountain-level actions) |
| #5 header `+` opens the date-pickable editor on Ski days | 4 (`handleHeaderAdd`) + 2 (Step 5's `addDayTick` hook, Step 4's `handleAddSkiDay()`) |
| #5 header `+` opens `CreateTripModal` on Trips; replaces "+ New Trip" | 4 (Step 1) |
| #6 per-day `+`, date pre-seeded and not pickable | 2 (Step 1's `addDayButtonStyle` button, Step 4's `handleAddSkiDay(seedDate)`) |
| #7 full-width two-segment pill, filled/gradient active | 4 (Step 1), matching `LeaderboardPage.jsx:394-415` |
| #8 mountain heading + `N going` pill | 3 (Step 2) |
| #8 one card per party, party-scoped avatars | 3 (Step 2) |
| #8 left accent bar from `ringColorFor(ownerId, colorCtx)` | 3 (Step 2) |
| #8 solo attendees stay the "N not in a group" footnote | 3 (Step 2) |
| #9 three empty states, same conditions, container restyled | 2 (Step 6) — copy change documented as Deviation 1 |
| Non-goal: no `TripDetailModal`/`CreateTripModal`/Trips-list change | Task 6 Step 4 |
| Non-goal: no new open-party feature, no migration, no RLS | nothing in this plan touches `migrations/` or `supabase/`; Task 6 Step 4 verifies |
| Non-goal: no filter-chip redesign | `FilterChipRow`/`CalendarFilterSheet` are re-rendered unchanged in Task 2 Step 6 and appear in no Files list |
| Testing section: new pure logic gets `node --test`; component work is not covered | 1 (tests); 2, 3, 4 each state the omission and why |
| Context: TASK 22.1 marked subsumed | 6 (Step 5) |

**Gaps found and closed while reviewing:** the spec's `nobodyPlanned` copy interpolates the deleted `viewMode` and could not be kept verbatim (Deviation 1, with the replacement string written out); the spec says nothing about `focusDate`, which the removed anchor used to serve, so `agendaRange` grew an `includeKey` option rather than silently regressing notifications (Deviation 3); the spec's per-mountain avatar row disappears entirely when nobody is in a party, so Task 3 keeps a mountain-wide avatar+names fallback for `parties.length === 0` — the common case today, and not a "new card shape", so decision #8 is respected.

**2. Placeholder scan.** No `TBD`, no "implement later", no "add appropriate error handling", no "write tests for the above", no "similar to Task N". Every code step carries literal code — Task 2 and Task 3 give whole files rather than diffs precisely so an engineer reading tasks out of order is not reconstructing them. Every `grep`/`npm` step states its expected output. The only judgement calls left open are the two flagged deviations and the tap-target question, all of which are explicitly Kyle's to decide at click-through.

**3. Type and signature consistency.** Cross-checked across tasks:
- `agendaRange(todayKey, { past, forward, includeKey })` → `{ start, end, keys }` — defined and tested in Task 1, destructured as `{ start, end, keys: dayKeys }` in Task 2 Step 3. Same three property names.
- `AGENDA_PAST_DAYS` / `AGENDA_FORWARD_DAYS` — exported in Task 1, asserted in Task 1's tests, referenced by name nowhere else (Task 2 relies on the defaults), so there is no second spelling to drift.
- `DayAgendaList`'s prop `dayKeys` ⇄ `agendaRange`'s `keys`: renamed exactly once, at the call site in Task 2 Step 6, and the rename is visible in both the Interfaces block and the JSX.
- `DayAgendaList` prop `focusedDayKey` ⇄ `FriendsCalendar` state `focusedDay` — one rename, at the one call site; the state was `selectedDay` on `main` and every reference to it is replaced in Task 2 Steps 3, 4 and 6 (`setSelectedDay` appears nowhere in the final code, and `selectedDay` is included in Task 2 Step 8's grep so a missed reference fails loudly).
- `onAddDay(dateKey)` (Task 2's `DayAgendaList` prop) ⇄ `handleAddSkiDay(seedDate = null)` (Task 2 Step 4) — arity and meaning match; passed as a bare reference `onAddDay={handleAddSkiDay}`, and `handleAddSkiDay()` with no argument is exactly what the header path needs.
- `addDayTick` — declared as a prop with default `0` in Task 2 Step 2, consumed in Task 2 Step 5, supplied in Task 4 Step 1. Same spelling in all three.
- `DayPlanCard` props — Task 2's call site passes exactly the fifteen props Task 3's signature declares, and passes **no** `compact`, which Task 3 deletes. `onJoin` is `(resortKey) => …` at the card and `(dateKey, resortKey)` at `DayAgendaList`'s own prop; `onEditPlan` and `onAskToJoin` follow the same one-level-of-currying convention, identical to what `WeekView` did, so no handler in `FriendsCalendar` changes signature.
- `party` object shape — Task 3 reads `p.partyId`, `p.ownerId`, `p.name`, `p.attendees`, which is exactly what `calendarGrouping.js:167` constructs, and `handleAskToJoin(dateKey, resortKey, party)` in `FriendsCalendar` reads `party.ownerId`/`party.partyId` from the same object. No adapter needed.
- `tripDetail` (Task 4) is the rename of `stripTrip`; both its setter (`onOpenTrip={setTripDetail}`) and its reader (`{tripDetail && <TripDetailModal trip={tripDetail} …>}`) use the new name, and Task 4 Step 3's grep proves the old one is gone.
- `handleCreateTrip` (Task 4) is the rename of `handleCreateClick`; used in three places — the trips empty state, `onPlanADay`, and `handleHeaderAdd` — all rewritten in the same file replacement.

**4. Sequencing.** Task 1 is standalone and testable. Task 2 leaves the app fully working (the in-calendar "+ Add ski day" deliberately survives until Task 4 wires the header `+`, so no commit exists in which a ski day cannot be added). Task 3 only touches a component whose sole caller Task 2 just created. Task 4 is the only task that changes two files, and the second change is a 9-line deletion that would be a regression if done any earlier. Task 5 cannot run before Task 4 and says so, with a grep that fails loudly if it is. Task 6 verifies the whole thing and does the bookkeeping the spec asked for.
