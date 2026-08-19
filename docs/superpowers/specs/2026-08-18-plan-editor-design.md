# Design — The Ski Plan Editor (Sprint 36)

**Date:** 2026-08-18
**Status:** Approved for planning
**Origin:** Kyle's live testing of Sprint 35 on powdays.app, immediately after merge.
**Companion:** per-crew plan visibility was raised in the same session and is deliberately
**not** here — it needs a migration and new RLS policies, and is scoped as Sprint 37.

---

## 1. The problem

Sprint 35 shipped the friends calendar. Testing it against real data surfaced four things,
all about the moment a user actually *records* a plan:

1. **Joining a friend's mountain silently moved an existing plan.** `daily_plans` is
   `UNIQUE (user_id, ski_date)`, so one plan per day is enforced by the schema and joining
   genuinely relocates you. The behavior is correct; the button was not — it said "I'm in"
   when the real action was "leave Vail, go to Copper."
2. **Nothing ever asks for an ETA.** The column exists, `buildPlanEta`/`etaToTimeInput`
   already round-trip it, and Sprint 35 went to some trouble to stop the join path wiping
   it — but no UI has ever offered to set one.
3. **The plan editor is easy to miss.** Tapping a day on Profile → 📅 Ski Plans renders an
   editing card *below* the calendar, off the part of the screen the user is looking at.
4. **There is no way to say "I'm skiing, I don't care where."** Every plan demands a
   specific resort, so the common case — free on Saturday, open to suggestions — cannot be
   expressed at all.

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Editing moves into a modal**, opened by tapping a day on your own Ski Plans calendar. | An editor below the fold is an editor users don't find. A friend's calendar is unchanged — there is nothing to edit, so its read-only summary stays inline. |
| 2 | **ETA is optional**, with four one-tap presets plus a time field. | Requiring it would block the ordinary case of knowing the day before the time, and people would type a fake time to get past the gate — worse than no time at all. |
| 3 | **ETA snaps to 15-minute increments.** | Kyle's call. `step="900"` handles the desktop stepper; a pure `snapToQuarterHour()` on save handles iOS Safari, whose time wheel ignores `step`. |
| 4 | **"Open" is a real resort_key sentinel (`"open"`)**, not null. | `resort_key` is `NOT NULL` in the schema. A sentinel keeps the column honest and avoids a migration. Audited: no consumer resolves a plan's resort to coordinates or weather, and both shared lookup helpers already fall back safely — see §3.3. |
| 5 | **The Open card is pinned below every real mountain**, regardless of headcount. | Mountain cards sort by headcount because the top card answers "where should we go". Open is not a destination — it is available people. Letting four open users outrank three at Copper would make the layout lie in the one place it must not. |
| 6 | **The join button states what it will actually do.** `I'm in` when the day is free, `Switch from Vail` when it isn't. | The action was already correct; only its label was dishonest. This is the smallest change that fixes what surprised the user. |
| 7 | **The `note` column stays unused.** | Nothing in the app renders it. Adding a field that writes to a surface nobody reads is write-only work. |

## 3. The design

### 3.1 The plan editor modal

New component. Bottom sheet on mobile, centered dialog on desktop — the same responsive
pattern `CalendarFilterSheet` established in Sprint 35, so there is one modal idiom in this
codebase rather than two.

```
+----------------------------------+
| Saturday, February 21        [x] |
|                                  |
| WHERE                            |
| [ Copper Mountain            v ] |
|   ...list includes:              |
|   [ ✳️ Open — no preference   ]  |
|                                  |
| WHEN   (optional)                |
| [First chair] [9:00] [10:00] [PM]|
| or  [  08:45  ]         [ Clear ]|
|                                  |
| WHO CAN SEE                      |
| [ 👥 Friends & crews         v ] |
|                                  |
| [ Remove day ]          [ Save ] |
+----------------------------------+
```

- **Opens from** two places: tapping a day on your own Ski Plans calendar, and the
  `Add ETA` affordance on your own card in the friends calendar.
- **Presets** are `First chair` (08:30), `9:00`, `10:00`, `Afternoon` (13:00). All four sit
  on quarter hours already.
- **`Clear`** removes an ETA without removing the plan. `Remove day` deletes the plan and
  only appears when one exists.
- **Visibility** keeps today's two options (`Friends & crews`, `Private`). Sprint 37
  replaces this control; this sprint must not change its stored values.
- Save is disabled until a mountain is chosen. ETA never blocks save.
- **Past dates do not open the modal.** `SkiPlansTab` already computes
  `canEdit = editable && !isPast`; tapping a past day keeps today's read-only summary
  inline. The friends calendar likewise suppresses join and `Add ETA` on past days, which
  it already does.

### 3.2 ETA handling

`daily_plans.eta` is `timestamptz`. The existing round-trip is unchanged and must stay
that way — Sprint 35 verified it and a regression here silently destroys user data:

- **Reading:** `etaToTimeInput(plan.eta)` → `"HH:MM"` for the input.
- **Writing:** `snapToQuarterHour("HH:MM")` → `buildPlanEta(skiDate, "HH:MM")` → `timestamptz`.

`snapToQuarterHour` is a new pure function in `src/lib/format.js`, rounding to the nearest
15 minutes: `:00-:07` → `:00`, `:08-:22` → `:15`, `:23-:37` → `:30`, `:38-:52` → `:45`, and
`:53-:59` → the next hour at `:00` (carrying `23:53` → `00:00`, which `buildPlanEta` then
combines with the ski date). It returns `null` for `null` so clearing an ETA stays possible.

### 3.3 "Open — no preference"

`OPEN_RESORT_KEY = "open"` is added to `src/lib/resorts.js`, with `resortName("open")` →
`"Open — no preference"` and its own emoji. `normalizeResortKey` must pass it through
untouched.

On the calendar its group renders as a mountain card with two differences: the headcount
reads **"4 free"** rather than "4 going", and the group sorts **last within its day**,
after every real mountain, whatever the counts are. Everything else — avatars, crew rings,
the join button — behaves identically, so marking yourself free is the same gesture as
joining a mountain.

**Blast radius, audited against the code rather than assumed.** An earlier draft of this
spec called Open the riskiest item in the sprint. That was wrong, and the correction is
recorded here so the plan is not built around a phantom risk.

Six components read `daily_plans`: `FriendsCalendar`, `FriendsPage`, `HomeDashboard`,
`SkiPlansTab`, `TodaysCrew`, `ui/AvatarStatusRail`. Of those, three display the resort, and
**none resolve a plan's `resort_key` to coordinates, weather, or a mountain page** — those
surfaces are driven by the Snow tab's own resort selection, not by anyone's plan. There is
no crash path.

The shared helpers already degrade safely for an unrecognised key:

```js
resortName(key)  => RESORT_NAMES[normalizeResortKey(key)] || key   // raw string, no throw
resortEmoji(key) => RESORT_EMOJI[normalizeResortKey(key)] || "⛷️"  // fallback, no throw
```

**But `open` must NOT be added to `RESORT_NAMES`.** A second pass over that map's consumers
found `Object.keys(RESORT_NAMES)` is used to *build resort dropdowns* in three places —
`MountainBoard.jsx:164`, `PostSkiBuddyForm.jsx:117`, `SkiBuddyBoard.jsx:293`. Adding the
sentinel there would offer "Open — no preference" as a selectable mountain when posting to
the Community board, which is nonsense.

`RESORT_NAMES` therefore stays exactly what it is: the canonical list of real mountains.
The sentinel is handled inside the display helpers instead, ahead of the map lookup:

```js
export const OPEN_RESORT_KEY = "open"
export const OPEN_RESORT_LABEL = "Open — no preference"

export function resortName(key) {
  if (!key) return ""
  const k = normalizeResortKey(key)
  if (k === OPEN_RESORT_KEY) return OPEN_RESORT_LABEL
  return RESORT_NAMES[k] || key
}
```

Display gets the friendly label everywhere; every picker built from `Object.keys()` stays
clean. Only the plan editor's own dropdown adds Open explicitly, because it is the one
place the option should exist.

A handful of components (`TripCard`, `TripDetailModal`, `ModerationQueue`, `SkiBuddyBoard`)
read `RESORT_NAMES[key] || key` directly rather than through `resortName()`. They are not a
concern: all four render `ski_trips` or buddy-board rows, and the sentinel only ever reaches
`daily_plans`.

**One call site does not route through them.** `TodaysCrew.jsx:40` carries
`prettifyResortKey`, a local hardcoded duplicate of `RESORT_NAMES`. It predates this sprint
and is the only place that would show a raw `open`. The fix is to delete the duplicate and
call the shared `resortName()` — a targeted improvement to code this sprint already touches,
not a new abstraction.

The plan still carries a verification step confirming Open renders correctly on Today's
Crew, Home and the avatar rail. It is a check, not an investigation.

### 3.4 Honest join / switch labeling

`DayPlanCard` currently knows only its own mountain group. It gains one prop: the
`resort_key` you already have on that date, if any.

| Your state that day | Button |
|---|---|
| No plan | `I'm in` |
| Plan at another mountain | `Switch from Vail` |
| Plan at this mountain | `✓ You're in` and `Add ETA` |

The underlying call is unchanged — `joinPlanAtResort` already reads, merges and writes, so
the ETA and note survive a switch. Only the label changes, plus the new `Add ETA` entry
point into the modal.

## 4. Architecture

| File | Responsibility |
|---|---|
| `src/lib/format.js` | *modify* — add `snapToQuarterHour(hhmm)` |
| `src/lib/resorts.js` | *modify* — `OPEN_RESORT_KEY`/`OPEN_RESORT_LABEL`, handled inside `resortName`/`resortEmoji` — **not** added to `RESORT_NAMES` |
| `src/components/TodaysCrew.jsx` | *modify* — delete the local `prettifyResortKey` map, call shared `resortName()` |
| `src/lib/calendarGrouping.js` | *modify* — pin the Open group last within each day |
| `src/components/PlanEditorModal.jsx` | *new* — the modal of §3.1 |
| `src/components/SkiPlansTab.jsx` | *modify* — tap a day opens the modal; drop the inline editor |
| `src/components/calendar/DayPlanCard.jsx` | *modify* — switch labeling, "N free", `Add ETA` |
| `src/components/calendar/WeekView.jsx` | *modify* — thread the new prop through `renderCard` |
| `src/components/FriendsCalendar.jsx` | *modify* — own the modal, supply your plan for each date |

No migration. No new dependencies. No change to `upsertDailyPlan` or `joinPlanAtResort`.

## 5. Constraints inherited from the repo

- No new npm dependencies. Tests run on `node --test` via `npm test` (39 passing today);
  only pure `src/lib/` modules are testable — there is no component harness.
- Inline `style={{}}` objects only. Colors via `var(--color-*)` tokens, never concatenated
  with a hex alpha suffix.
- `profiles` queries use explicit column lists — never `select("*")` on that table.
- Date keys from local date parts, never `toISOString()`.
- `npm run lint` baseline is **91 problems (82 errors, 9 warnings)**. Diff against it.
- `upsertDailyPlan` writes the whole row; every omitted field becomes `null`. Any path that
  saves a plan must carry `status`, `arrived_at` and `note` forward.

## 6. Out of scope

- **Per-crew visibility** — Sprint 37, with its own migration and RLS work.
- The unused `daily_plans.note` column.
- Any change to `UNIQUE (user_id, ski_date)`; one plan per day stands.
- Retiring `daily_plans.group_id` (ROADMAP 18.1) — it belongs with Sprint 37's migration.

## 7. Verification

`snapToQuarterHour` and the Open-pinning rule are pure and get real unit tests. The rest is
browser work:

1. Tap a future day on your own Ski Plans calendar → the modal opens **over** the calendar,
   not below it.
2. Save a mountain with no ETA → succeeds.
3. Save with each of the four presets → the stored time matches, and re-opening shows it.
4. Type `08:07` on a phone → it stores `08:00`. Type `08:53` → it stores `09:00`.
5. `Clear` removes the ETA but leaves the plan.
6. `Remove day` deletes the plan; the day empties.
7. Choose **Open** → the day shows an Open card on the friends calendar, **below** a real
   mountain that has fewer people on it.
8. An Open plan renders as "Open — no preference" on Today's Crew, the Home dashboard and
   the avatar rail — the three surfaces outside the calendar that display a plan's resort.
8b. **Open does NOT appear** in the mountain dropdowns on the Community board's post form,
   the buddy-board filter, or the Mountain board. Those are built from
   `Object.keys(RESORT_NAMES)` and must stay real mountains only.
9. With a plan at Vail on Saturday, a Copper card reads `Switch from Vail`; tapping it moves
   you, **and your ETA survives**.
10. With no plan that day, the same card reads `I'm in`.
11. Your own card shows `✓ You're in` and `Add ETA`, and `Add ETA` opens the modal
    pre-filled with that day and mountain.
12. A friend's Ski Plans calendar is unchanged — read-only summary inline, no modal.
13. Mobile 375px and desktop 1440px; the sheet clears the bottom nav.
