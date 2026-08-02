# Sprint 11 — Move "Today" Check-In to Home

**Goal:** ROADMAP TASK 1.2 / UX_CLEANUP TASK 5 — add a "Check In Today" CTA to `HomeDashboard.jsx` and remove the redundant "Today" sub-tab from `SkiPlansPage.jsx`.
**Estimated effort:** 0.5–1 day
**Depends on:** Sprint 10 (Home 3-card feed) merged — this sprint adds the check-in CTA above the Card 1/2/3 feed sprint-10 built, and its successful-submit callback should refresh sprint-10's Card 3 (Who's Skiing Today).

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**`src/components/SkiPlansPage.jsx` (501 lines) — current sub-tab structure:**
```js
// line ~312
const SUB_TABS = [
  { key: "trips",    label: "🎿 Trips" },
  { key: "today",    label: "📍 Today" },
  { key: "calendar", label: "📅 Calendar" },
]
```
State variable is `subTab` (not `activeSubTab`), declared `const [subTab, setSubTab] = useState("trips")` — default is already `"trips"`, so ROADMAP's "confirm default" step is a no-op verification, not a code change.

The `subTab === "today"` render block (currently ~lines 449–465):
```jsx
{subTab === "today" && (
  <div style={{ display: "grid", gap: 20 }}>
    {currentUser ? (
      <SkiCheckInForm resorts={resorts} />
    ) : (
      <div style={{ /* ... */ }}>
        <div>Log in to post your plan</div>
        <div>You can still browse Today's Crew below.</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => onRequireLogin?.("login")}>Log In</button>
          <button onClick={() => onRequireLogin?.("signup")}>Sign Up</button>
        </div>
      </div>
    )}
    <TodaysCrew />
  </div>
)}
```
Imports: `import SkiCheckInForm from "./SkiCheckInForm"` (line 6), `import TodaysCrew from "./TodaysCrew"` (line 7).

**`src/components/SkiCheckInForm.jsx` (267 lines):**
- Signature: `export default function SkiCheckInForm({ resorts })` — no `currentUser` prop, it calls `getCurrentUser()` internally.
- Fields: resort `<select>`, ETA `<input type="time">`, note `<textarea>`.
- On mount, checks `getMyDailyPlan(today)` (where `today = new Date().toISOString().slice(0, 10)`) to set internal `hasPlan`/`isEditing` state and pre-fill the form if a plan already exists today.
- On submit, calls `upsertDailyPlan(plan)` (both from `src/lib/socialApi.js`).
- **Read this file in full before editing it** — you need to see the exact submit handler to add a callback in S11-T1 without breaking existing behavior.

**`daily_plans` helpers in `src/lib/socialApi.js`** (exact exports, for reference — you don't need to modify these): `upsertDailyPlan(plan)`, `getMyDailyPlan(skiDate)`, `getMySkiPlans()`, `getTodaysVisiblePlans(skiDate)`, `markDriving(planId)`, `markArrival(planId)`.

---

## Tasks

S11-T1 (add CTA to Home) and S11-T2 (remove sub-tab from Plans) can be done in either order but should land together — Home is the only place to check in once this sprint completes, so don't ship one half without the other.

---

### S11-T1 — Add "Check In Today" CTA to `HomeDashboard.jsx`

**Files to modify:** `src/components/SkiCheckInForm.jsx`, `src/components/HomeDashboard.jsx`

**Step 1 — Add an optional `onSaved` callback prop to `SkiCheckInForm.jsx`.** Find the submit handler (the function that calls `upsertDailyPlan`). After a successful save, alongside whatever internal state update already happens (e.g. `setHasPlan(true)`), call `onSaved?.()` if the prop was passed. Update the signature to `export default function SkiCheckInForm({ resorts, onSaved })`. This is additive and backward-compatible — no existing caller breaks from an unused optional prop.

**Step 2 — Add the CTA + expandable form to `HomeDashboard.jsx`.** Import `SkiCheckInForm` and `getMyDailyPlan` (add to the existing `../lib/socialApi` import list):

```jsx
import SkiCheckInForm from "./SkiCheckInForm"
import { getMyDailyPlan /* , ...existing imports */ } from "../lib/socialApi"
```

Add a new local component, rendered above `TodaysBestMountainCard` (sprint-10's Card 1) in both the mobile and desktop layouts:

```jsx
function CheckInTodayCta({ resorts, currentUser, onCheckedIn }) {
  const [hasChecked, setHasChecked] = useState(null) // null = still loading
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!currentUser) { setHasChecked(true); return } // logged-out: hide the CTA entirely
    let cancelled = false
    const today = new Date().toISOString().slice(0, 10)
    getMyDailyPlan(today)
      .then((plan) => { if (!cancelled) setHasChecked(!!plan) })
      .catch(() => { if (!cancelled) setHasChecked(false) })
    return () => { cancelled = true }
  }, [currentUser])

  if (hasChecked === null || hasChecked) return null // hide once checked in, or while loading, or if logged out

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          width: "100%", padding: "14px", borderRadius: "var(--radius-button)",
          background: "var(--gradient-primary)", color: "var(--color-bg)",
          border: "none", fontWeight: 900, fontSize: 15, cursor: "pointer",
        }}
      >
        📍 Check In Today
      </button>
    )
  }

  return (
    <Card>
      <SkiCheckInForm
        resorts={resorts}
        onSaved={() => { setExpanded(false); setHasChecked(true); onCheckedIn?.() }}
      />
    </Card>
  )
}
```

**Step 3 — Wire `onCheckedIn` to refresh Card 3.** Sprint-10's `WhosSkiingTodayCard` fetches its own data in a `useEffect` with no external refresh trigger. Add a simple refresh mechanism: lift a `refreshKey` state (`const [crewRefreshKey, setCrewRefreshKey] = useState(0)`) up to the parent (`MobileHomeDashboard` / the desktop layout function), pass `refreshKey={crewRefreshKey}` into `WhosSkiingTodayCard` and add it to that card's `useEffect` dependency array (so it refetches when incremented), and call `setCrewRefreshKey((k) => k + 1)` from `CheckInTodayCta`'s `onCheckedIn`.

**Step 4 — Render the CTA** at the top of both `MobileHomeDashboard` and the desktop layout, above `TodaysBestMountainCard`:
```jsx
<CheckInTodayCta resorts={resorts} currentUser={currentUser} onCheckedIn={() => setCrewRefreshKey((k) => k + 1)} />
```

**Acceptance criteria:**
- Logged-in user with no plan today sees the "📍 Check In Today" button.
- Clicking it expands `SkiCheckInForm` inline.
- Submitting successfully collapses the form, hides the CTA (since `hasChecked` is now `true`), and Card 3 (Who's Skiing Today) reflects the new check-in without a full page reload.
- Logged-in user who already checked in today sees no CTA at all.
- Logged-out user sees no CTA (no crash from `getMyDailyPlan` being called without a session).

**Verify in browser:**
```bash
npm run dev
```
Log in as a user with no plan for today, confirm the CTA appears, expand it, submit a check-in, confirm the CTA disappears and Card 3 updates.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add src/components/SkiCheckInForm.jsx src/components/HomeDashboard.jsx
git commit -m "feat: add Check In Today CTA to Home dashboard"
```

---

### S11-T2 — Remove "Today" sub-tab from `SkiPlansPage.jsx`

**File to modify:** `src/components/SkiPlansPage.jsx`

**Step 1 — Update `SUB_TABS`:**
```js
const SUB_TABS = [
  { key: "trips",    label: "🎿 Trips" },
  { key: "calendar", label: "📅 Calendar" },
]
```

**Step 2 — Delete the `subTab === "today"` render block** (the JSX block shown in Project Context above).

**Step 3 — Remove now-unused imports.** `grep -n "SkiCheckInForm\|TodaysCrew" src/components/SkiPlansPage.jsx` after Step 2 — if both have zero remaining usages in the file, remove their import lines (currently lines 6–7). If either is still referenced elsewhere in the file (check before assuming), leave that one import in place.

**Step 4 — Confirm the default sub-tab.** `subTab` already defaults to `"trips"` — verify this is still true after your edits (it should be untouched), no code change needed here.

**Acceptance criteria:**
- `SUB_TABS` has exactly 2 entries: `trips`, `calendar`.
- No `"today"`-keyed render block remains.
- `grep -n "\"today\"" src/components/SkiPlansPage.jsx` returns zero matches.
- If `SkiCheckInForm`/`TodaysCrew` are no longer used anywhere in this file, their imports are removed; if still used, they remain.

**Verify in browser:**
```bash
npm run dev
```
Open the Plans tab. Confirm only "🎿 Trips" and "📅 Calendar" sub-tabs are visible, no "📍 Today" tab.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add src/components/SkiPlansPage.jsx
git commit -m "chore: remove Today sub-tab from Plans (moved to Home)"
```

---

## Sprint Acceptance Criteria

- [ ] `HomeDashboard.jsx` shows a "Check In Today" CTA when the logged-in user hasn't checked in today, hidden otherwise
- [ ] The CTA expands to an inline `SkiCheckInForm`, which collapses and disappears on successful submit
- [ ] Card 3 (Who's Skiing Today) refreshes after a successful check-in, without a page reload
- [ ] `SkiPlansPage.jsx`'s sub-tabs are reduced to `trips` and `calendar` — no `today` tab
- [ ] `npm run build` succeeds
- [ ] Verified in browser: check-in flow works end-to-end from Home, and Plans no longer shows the Today tab

## Out of Scope for This Sprint

- Any change to `TodaysCrew.jsx` itself (it's still used elsewhere — e.g. potentially by `MobileCrewListWidget` if sprint-10 kept it).
- Editing an existing check-in from Home (the CTA only covers the "not checked in yet" case — editing today's plan after the fact is not part of this sprint).
</content>
