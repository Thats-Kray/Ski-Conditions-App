# Today's Crew Repair — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring back "who's on the mountain right now" and the ability to mark yourself
driving or arrived — a feature that has been unreachable since 2026-08-01 — and stop Home's
check-in button from vanishing the moment today has a plan.

**Origin:** Kyle's live testing of Sprint 36 on powdays.app, 2026-08-21. Root causes were
established before any code was written; see §Root Causes.

**Architecture:** Three repairs inside `TodaysCrew.jsx`, one mount in `HomeDashboard.jsx`, and
one predicate change in `HomeDashboard.jsx`. No new components, no migration, no new
dependencies.

## Root Causes (established, not assumed)

1. **`TodaysCrew` is mounted by nothing.** `grep -rn "TodaysCrew" src --include="*.jsx"` returns
   only its own definition. Commit `013c4af` ("chore: remove Today sub-tab from Plans (moved to
   Home)", 2026-08-01) deleted 22 lines from `SkiPlansPage.jsx` and **added nothing to Home** —
   `1 file changed, 22 deletions(-)`. The move was never completed.
2. **`markArrival` / `markDriving` are called with the wrong argument.** Both take a `planId`
   and run `.eq("id", planId)` against a uuid column, but `TodaysCrew.jsx:140,155` pass `today`,
   a `YYYY-MM-DD` string. Every click would throw Postgres `22P02 invalid input syntax for type
   uuid`. Never observed because the component has no mount.
3. **`TodaysCrew` derives today from UTC.** `TodaysCrew.jsx:104` uses
   `new Date().toISOString().slice(0, 10)`, which after ~5pm Mountain Time returns *tomorrow*.
   The repo has `localDateKey()` for exactly this and documents the hazard at the top of
   `src/lib/calendarDates.js`.
4. **Home's check-in button hides on plan existence, not arrival.**
   `HomeDashboard.jsx:374-381` sets `hasChecked = !!plan` and returns `null` when true. Sprint 36
   gave plans an ETA and a visibility setting, so there is now a reason to reopen today's plan —
   but that button is the only entry point to the check-in form.

**Kyle's decisions:** mount Today's Crew on **Home** (finishing the Aug 1 intent); gate the
check-in button on **`status === "arrived"`** rather than plan existence.

## Global Constraints

- **No new npm dependencies.** `npm test` runs `node --test src/lib/*.test.js`; only pure
  `src/lib/` modules are testable and no component harness exists.
- **`npm test` is at 64 passing** and must not fall.
- **`npm run lint` baseline is 89 problems (80 errors, 9 warnings).** Diff against that.
  Note `TodaysCrew.jsx` is currently linted but **not** built — nothing imports it — so mounting
  it puts it in the bundle graph for the first time. `npm run build` must still succeed.
- **Inline `style={{}}` objects only**; colors via `var(--color-*)` tokens, never concatenated
  with a hex alpha suffix.
- **Date keys from local date parts, never `toISOString()`.**
- **Never `select("*")` on `profiles`.**

---

## Task 1: Repair `TodaysCrew` and mount it on Home

**Files:**
- Modify: `src/components/TodaysCrew.jsx`
- Modify: `src/components/HomeDashboard.jsx`

- [ ] **Step 1: Fix the UTC date derivation**

In `src/components/TodaysCrew.jsx`, replace line 104:

```jsx
  const today = new Date().toISOString().slice(0, 10)
```

with a local-date key, adding the import alongside the existing ones:

```jsx
import { localDateKey } from "../lib/calendarDates"
```
```jsx
  // Local date parts, never toISOString() — after ~5pm Mountain Time UTC has already
  // rolled over and this component would show tomorrow's crew all evening. Same
  // constraint documented at the top of lib/calendarDates.js.
  const today = localDateKey()
```

- [ ] **Step 2: Pass a plan id to the status mutations, not a date**

`markDriving(planId)` and `markArrival(planId)` both run `.eq("id", planId)` against a uuid
column. `TodaysCrew` currently hands them `today`.

Derive the signed-in user's own plan from state already loaded, immediately after the `today`
line:

```jsx
  // plans is sorted with the signed-in user first (loadPlans), but find by id rather
  // than taking [0] — the sort only guarantees position when the user has a plan at all.
  const myPlan = plans.find((p) => p.user_id === user?.id) || null
```

Then in `handleMarkDriving`, replace `await markDriving(today)` with:

```jsx
      if (!myPlan) { setMessage("Set today's plan first."); return }
      await markDriving(myPlan.id)
```

and in `handleMarkArrived`, replace `await markArrival(today)` with:

```jsx
      if (!myPlan) { setMessage("Set today's plan first."); return }
      await markArrival(myPlan.id)
```

Both guards must run **before** the `try` body's mutation but inside it, so the `finally`
still clears the pending flag. If the existing structure sets `setDriving(true)` before the
`try`, keep the guard inside the `try` so `finally` runs.

- [ ] **Step 3: Mount it on Home**

In `src/components/HomeDashboard.jsx`, add the import beside the existing component imports:

```jsx
import TodaysCrew from "./TodaysCrew"
```

Render it directly **below** the `CheckInTodayCta` in the dashboard's main column, so the
"who's out right now" answer sits with the "check yourself in" control. Wrap it in the same
`<Card>` primitive the neighbouring widgets use, matching their spacing exactly — read the two
adjacent widgets and copy their wrapper, do not invent new margins.

`TodaysCrew` takes **no props** and fetches its own data.

- [ ] **Step 4: Gate the check-in button on arrival, not existence**

In `HomeDashboard.jsx`'s `CheckInTodayCta`, the effect currently does:

```jsx
      .then((plan) => { if (!cancelled) setHasChecked(!!plan) })
```

Change it to test arrival:

```jsx
      // Hide only once the user has actually arrived — not merely because a plan exists.
      // Sprint 36 gave plans an ETA and a visibility setting, so "I have a plan today"
      // is no longer a reason to remove the only entry point for editing it.
      .then((plan) => { if (!cancelled) setHasChecked(plan?.status === "arrived") })
```

Leave the `catch` and the logged-out branch exactly as they are.

- [ ] **Step 5: Verify**

Run: `npm test` → 64 passing.
Run: `npm run lint` → 89 problems (80 errors, 9 warnings).
Run: `npm run build` → succeeds. **This is the important one** — it is the first time
`TodaysCrew.jsx` has ever entered the bundle graph, so any unresolved import or syntax problem
in it surfaces here and nowhere earlier.

- [ ] **Step 6: Commit**

```bash
git add src/components/TodaysCrew.jsx src/components/HomeDashboard.jsx
git commit -m "fix: mount Today's Crew on Home and repair its date and status writes"
```

## Verification the human runs

1. Home shows **Today's Crew** below the check-in control.
2. With a plan for today, Home still shows the check-in entry point — it only disappears once
   you mark yourself **arrived**.
3. **Mark driving** and **Mark arrived** both succeed. Before this fix they would throw
   `invalid input syntax for type uuid`.
4. After marking arrived, the check-in button is gone and Today's Crew shows you as arrived.
5. A friend with a plan today appears with their **name and avatar**, not "Skier".
6. **After 5pm Mountain Time**, Today's Crew still shows *today's* plans, not tomorrow's.
7. With no plan for today, the driving/arrived buttons say "Set today's plan first" rather than
   throwing.
