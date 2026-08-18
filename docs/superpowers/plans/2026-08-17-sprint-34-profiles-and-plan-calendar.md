# Sprint 34 — Friend-Visible Profiles & Ski Plan Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the broken `daily_plans` friend-visibility RLS, then ship friend-viewable profiles with season stats, a personal editable "days I plan to ski" calendar, and a crew-filterable shared calendar.

**Architecture:** No new tables. Migration 032 replaces two dead RLS policies on the existing `daily_plans` table with a single policy backed by two `SECURITY DEFINER` helpers (`are_friends`, `shares_crew_with`). The frontend gets one new date-range query, one extracted reusable month-grid component (`PlanCalendar`), and a read-only mode on the existing `ProfilePage` driven by an optional `userId` prop. Friend season stats reuse the existing `get_leaderboard` RPC — zero new SQL.

**Tech Stack:** React 19 (no router, tab state in `App.jsx`), Supabase JS v2, Postgres 17 w/ RLS, Vite. Inline `style={{}}` objects only — no CSS modules, no Tailwind. Native `Date` + `Intl` — **do not add a date library.**

## Global Constraints

- **No new npm dependencies.** No `date-fns`, `dayjs`, `react-calendar`. Native `Date`/`Intl` only.
- **No test framework exists** (no vitest/jest, zero `*.test.*` files). Verification is live-DB read-back + browser walkthrough with exact expected results. Do not scaffold a test harness.
- **`profiles` queries must use an explicit column list.** Never `select("*")`, never a bare `.select()` after an insert/update/upsert — migration 031 revoked table-level SELECT, so `RETURNING *` throws. See `PROFILE_SELECT_COLUMNS` at `src/lib/socialApi.js:17`.
- **Migration house style:** header `-- Migration NNN: <Title> (Sprint 34)`, then `-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';`, a prose block explaining why, and a `ROLLBACK, if anything breaks:` line.
- **Every `SECURITY DEFINER` function** gets `SET search_path = public`, plus the mandatory pair `REVOKE ALL ON FUNCTION public.name(TYPES) FROM PUBLIC;` / `GRANT EXECUTE ON FUNCTION public.name(TYPES) TO authenticated;` repeating the full argument type list. `CREATE FUNCTION` grants EXECUTE to PUBLIC by default — migration 019 exists because someone forgot.
- **Redefining an existing policy uses `DROP POLICY IF EXISTS` + `CREATE POLICY`**, never the guarded `IF NOT EXISTS (SELECT 1 FROM pg_policies…)` block — per migration 021, the guarded form silently skips and leaves the broken policy live.
- **Never reference another RLS-protected relation inline in a policy expression.** Wrap it in a `SECURITY DEFINER` helper — migration 022 exists solely because of this.
- **Calendar date keys must be built from local date parts**, never `toISOString()`, or every cell shifts a day east of Greenwich. See the comment at `src/components/SeasonCalendar.jsx:4-7`.
- **Dot/accent colors stay literal hex, never `var()`**, wherever they feed a hex-alpha-suffix template literal (`` `${color}11` ``). Documented at `src/components/SkiPlansPage.jsx:110-113`.
- **`npm run lint` baseline on `main` is 92 problems (83 errors, 9 warnings).** Diff against that; do not expect a clean run.
- **Supabase project id:** `hkzaohqrycwfgmcogwdo` ("Colorado Ski Dashboard + Ski With Friends").
- **Commit after every task.** Branch is `worktree-sprint-34-profiles-and-plan-calendar`.

---

## Background: what is actually broken

Verified against the live DB, not the repo. `daily_plans` currently has these SELECT policies:

| Policy | Predicate | Status |
|---|---|---|
| `users can manage own daily plans` (ALL) | `auth.uid() = user_id` | Fine, keep |
| `friends can read visible friend plans` | `visibility='friends' AND EXISTS (SELECT 1 FROM friendships …)` | **Dead.** `friendships` has 0 rows; the app writes `friend_requests` (4 accepted) |
| `group members can read group plans` | `visibility='groups' AND EXISTS (SELECT 1 FROM group_members …)` | **Dead.** `groups`/`group_members` both 0 rows, no code path |

Consequence: no user can read any other user's `daily_plans` row. Two shipped features are silently degraded — `TodaysCrew.jsx:139` never shows a friend, and `getFriendsLeaderboard` (`socialApi.js:2082`) renders `daysOnMountain: 0` for everyone.

Other live drift: `status` column default is `'planning'` but the CHECK only allows `planned|driving|arrived` — **the default violates its own constraint**. `visibility` CHECK allows `friends|groups|private`, so the `visibility === "public"` branch in `getTodaysVisiblePlans` is dead code. `UNIQUE(user_id, ski_date)` enforces one mountain per day (keeping this). `daily_plans` has 7 rows, 0 with a future date — no data at risk.

**Relationship tables, confirmed live:**
- `friend_requests(requester_id, recipient_id, status)` — `status='accepted'` means friends, either direction.
- `crew_members(crew_id, user_id, role, status)` — `status` CHECK is `active|pending`. **Both sides must be `active`**, or a user with a pending crew invite could read plans.

---

## File Structure

**Created:**
- `migrations/032_daily_plans_visibility_fix.sql` — RLS repair + two relationship helpers + status default fix + index.
- `src/components/PlanCalendar.jsx` — generic month-grid calendar. Takes an `entriesByDate` Map; knows nothing about trips, plans, or profiles.
- `src/components/ProfileStats.jsx` — presentational stat components lifted out of `ProfilePage.jsx` so both own-profile and friend-profile can render them.
- `src/lib/profileNav.js` — 8-line React context so any component can open a full profile without prop drilling.

**Modified:**
- `src/lib/socialApi.js` — add `getVisiblePlansInRange`, `deleteDailyPlan`; refactor `getTodaysVisiblePlans`; fix `getFriendsLeaderboard` date filter.
- `src/components/SkiPlansPage.jsx` — consume `PlanCalendar` instead of its inline `CalendarView`; add crew scope chips.
- `src/components/ProfilePage.jsx` — optional `userId` prop → read-only mode; `Stats | Ski Plans` sub-tabs.
- `src/components/UserProfileModal.jsx` — "View Full Profile" button via context.
- `src/App.jsx` — `viewingProfileId` full-page takeover + context provider.
- `ROADMAP.md` — Section 18.

**Deliberately NOT modified:** `TodaysCrew.jsx`, `PowderMap.jsx`, `CrewGroupChat.jsx`, `FriendsPage.jsx`, `ui/AvatarStatusRail.jsx`. All five render `UserProfileModal`; the context in Task 5 means none of them need a new prop.

---

## Task 1: Migration 032 — repair `daily_plans` visibility

**Files:**
- Create: `migrations/032_daily_plans_visibility_fix.sql`
- Verify against: live Supabase project `hkzaohqrycwfgmcogwdo`

**Interfaces:**
- Produces: `public.are_friends(p_other UUID) RETURNS BOOLEAN`, `public.shares_crew_with(p_other UUID) RETURNS BOOLEAN`, and policy `daily_plans_select_visible`. Task 2's `getVisiblePlansInRange` relies on this policy doing all filtering server-side.

- [ ] **Step 1: Capture the "before" state so the fix is provable**

Run this via the Supabase MCP tool `execute_sql` and save the output into the task notes:

```sql
select policyname, cmd, qual from pg_policies where tablename = 'daily_plans' order by policyname;
select column_default from information_schema.columns
  where table_name = 'daily_plans' and column_name = 'status';
```

Expected before: three policies including `friends can read visible friend plans` (referencing `friendships`) and `group members can read group plans`; `status` default `'planning'::text`.

- [ ] **Step 2: Write the migration file**

Create `migrations/032_daily_plans_visibility_fix.sql`:

```sql
-- Migration 032: repair daily_plans friend visibility (Sprint 34)
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS: the "friends can read visible friend plans" policy tests
-- membership in public.friendships. That table has 0 rows — the app has always
-- written friendships to public.friend_requests (4 accepted rows today). The
-- policy therefore never matches, so no user can read any other user's plan.
-- This is the same bug supabase/migrations/20260515_ski_sessions_rls_fix.sql
-- fixed on ski_sessions; daily_plans was missed.
--
-- Two shipped features are silently degraded by it right now:
--   * TodaysCrew.jsx never shows a friend (its client-side friend filter runs
--     over rows RLS already stripped).
--   * getFriendsLeaderboard (socialApi.js) reports daysOnMountain: 0 for every
--     friend because its daily_plans query comes back empty.
--
-- The "group members can read group plans" policy is dead the same way:
-- public.groups and public.group_members both have 0 rows and no code path.
-- The app uses crews/crew_members (4 and 6 rows). Dropped here.
--
-- Sprint 34 adds a crew read path deliberately: a crew can contain someone you
-- have not friended, and without it the Crew calendar view would silently drop
-- those members with no explanation to the user.
--
-- Both helpers are SECURITY DEFINER rather than inline EXISTS clauses. Migration
-- 022 exists because referencing another RLS-protected relation directly inside
-- a policy expression breaks reads for everyone — Postgres checks privileges on
-- every referenced relation at plan time.
--
-- KNOWN GAP: daily_plans.group_id and the 'groups' value in the visibility CHECK
-- are left in place (non-destructive). Both are now unreachable. Setting
-- visibility='groups' makes a plan visible to nobody but its owner. Tracked as
-- ROADMAP.md TASK 18.1.
--
-- KNOWN GAP: daily_plans still has no CREATE TABLE migration — it predates
-- migrations/001. This file does not attempt to backfill one.
--
-- ROLLBACK, if anything breaks:
--   DROP POLICY IF EXISTS daily_plans_select_visible ON daily_plans;
--   CREATE POLICY "friends can read visible friend plans" ON daily_plans
--     FOR SELECT TO authenticated
--     USING (visibility = 'friends' AND EXISTS (
--       SELECT 1 FROM friendships f WHERE f.status = 'accepted'
--         AND ((f.requester_id = auth.uid() AND f.addressee_id = daily_plans.user_id)
--          OR  (f.addressee_id = auth.uid() AND f.requester_id = daily_plans.user_id))));
--   ALTER TABLE daily_plans ALTER COLUMN status SET DEFAULT 'planning';

-- ── Relationship helpers ────────────────────────────────────────────────────

-- Accepted friendship in either direction. Reads friend_requests, which is what
-- the app actually writes (sendFriendRequest/respondToFriendRequest).
CREATE OR REPLACE FUNCTION public.are_friends(p_other UUID)
RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM friend_requests
    WHERE status = 'accepted'
      AND ((requester_id = auth.uid() AND recipient_id = p_other)
        OR (recipient_id = auth.uid() AND requester_id = p_other))
  );
$$;

-- Shared crew membership. Both sides must be status='active' — crew_members
-- allows 'pending' (an unaccepted invite), and a pending invitee must NOT get
-- read access to anyone's plans.
CREATE OR REPLACE FUNCTION public.shares_crew_with(p_other UUID)
RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM crew_members me
    JOIN crew_members them ON them.crew_id = me.crew_id
    WHERE me.user_id = auth.uid() AND me.status = 'active'
      AND them.user_id = p_other AND them.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.are_friends(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.are_friends(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.shares_crew_with(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shares_crew_with(UUID) TO authenticated;

-- ── Policies ────────────────────────────────────────────────────────────────
-- DROP + CREATE, not the guarded IF NOT EXISTS block: per migration 021 the
-- guarded form would silently skip and leave the broken policy in place.

DROP POLICY IF EXISTS "friends can read visible friend plans" ON daily_plans;
DROP POLICY IF EXISTS "group members can read group plans" ON daily_plans;
DROP POLICY IF EXISTS daily_plans_select_visible ON daily_plans;

CREATE POLICY daily_plans_select_visible ON daily_plans
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      visibility <> 'private'
      AND (public.are_friends(user_id) OR public.shares_crew_with(user_id))
    )
  );

-- ── Column default ──────────────────────────────────────────────────────────
-- The existing default 'planning' violates daily_plans_status_check, which only
-- allows planned|driving|arrived. Any INSERT omitting status fails today.

ALTER TABLE daily_plans ALTER COLUMN status SET DEFAULT 'planned';

-- ── Index ───────────────────────────────────────────────────────────────────
-- Supports the calendar's month-range scan (getVisiblePlansInRange).

CREATE INDEX IF NOT EXISTS daily_plans_date_range ON daily_plans (ski_date, user_id);
```

- [ ] **Step 3: Apply it**

Apply via the Supabase MCP `apply_migration` tool with name `daily_plans_visibility_fix`, passing the file's contents. Then run `NOTIFY pgrst, 'reload schema';` via `execute_sql`.

- [ ] **Step 4: Verify the policy actually changed**

Run via `execute_sql`:

```sql
select policyname, cmd, qual from pg_policies where tablename = 'daily_plans' order by policyname;
select column_default from information_schema.columns
  where table_name = 'daily_plans' and column_name = 'status';
select proname, prosecdef, proconfig from pg_proc
  where proname in ('are_friends','shares_crew_with');
```

Expected:
- Exactly two policies: `users can manage own daily plans` (ALL) and `daily_plans_select_visible` (SELECT). The `friendships` and `group_members` policies are **gone**.
- `daily_plans_select_visible` qual mentions `are_friends` and `shares_crew_with`.
- `status` default is `'planned'::text`.
- Both functions: `prosecdef = true`, `proconfig = {search_path=public}`.

Migration 030 shipped a REVOKE that reported success but did nothing. Do not trust "applied successfully" — trust this read-back.

- [ ] **Step 5: Verify the helpers return correct answers on real data**

```sql
-- Should be true: two users with an accepted friend_request between them.
select requester_id, recipient_id, status from friend_requests where status = 'accepted' limit 2;
-- Should list real shared-crew pairs.
select me.user_id as a, them.user_id as b, me.crew_id
from crew_members me join crew_members them on them.crew_id = me.crew_id
where me.user_id <> them.user_id and me.status = 'active' and them.status = 'active' limit 5;
```

Confirm at least one accepted friend pair and note two user UUIDs — Task 5's browser walkthrough needs them.

- [ ] **Step 6: Commit**

```bash
git add migrations/032_daily_plans_visibility_fix.sql
git commit -m "fix: repair daily_plans friend visibility RLS (Sprint 34)

The friends read policy tested membership in public.friendships, which has
zero rows — the app writes friend_requests. No user could read another
user's plan, silently breaking TodaysCrew and the friend leaderboard.

Replaces both dead policies (friendships, group_members) with one policy
backed by SECURITY DEFINER are_friends()/shares_crew_with() helpers, adds a
crew read path, and fixes the status default which violated its own CHECK.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Plan queries in `socialApi.js`

**Files:**
- Modify: `src/lib/socialApi.js` — `getTodaysVisiblePlans` (~line 623), `getFriendsLeaderboard` (~line 2082); add two new functions

**Interfaces:**
- Consumes: policy `daily_plans_select_visible` from Task 1.
- Produces:
  - `getVisiblePlansInRange(startDate: string, endDate: string) => Promise<Plan[]>` where `Plan` has `{ id, user_id, ski_date, resort_key, eta, note, status, visibility, profile: { id, first_name, last_name, full_name, username, avatar_url, favorite_mountain } }`. Dates are `'YYYY-MM-DD'`, inclusive both ends.
  - `deleteDailyPlan(planId: string) => Promise<void>`
  - Tasks 6 and 7 both consume these. Task 4 consumes `getVisiblePlansInRange`.

- [ ] **Step 1: Add `getVisiblePlansInRange` directly above `getTodaysVisiblePlans`**

The `profile:profiles (…)` embed works because `daily_plans.user_id` has a real FK to `profiles(id)` (confirmed live: `daily_plans_user_id_fkey`). Columns are listed explicitly per the global constraint.

```js
// Plans the current user is allowed to see in a date range, inclusive.
// Visibility is enforced entirely by RLS (migration 032): own rows, plus
// non-private rows belonging to an accepted friend or an active crewmate.
// Do NOT re-filter by friendship on the client — the server already did it,
// and a second filter would silently drop crewmates who aren't friends.
export async function getVisiblePlansInRange(startDate, endDate) {
  const { data, error } = await supabase
    .from("daily_plans")
    .select(`
      id, user_id, ski_date, resort_key, eta, note, status, visibility, arrived_at,
      profile:profiles (
        id,
        first_name,
        last_name,
        full_name,
        username,
        avatar_url,
        favorite_mountain
      )
    `)
    .gte("ski_date", startDate)
    .lte("ski_date", endDate)
    .order("ski_date", { ascending: true })

  if (error) throw error
  return data || []
}
```

- [ ] **Step 2: Replace the body of `getTodaysVisiblePlans` with a delegation**

Find the existing function (it starts `export async function getTodaysVisiblePlans(skiDate) {` and ends after the `.filter(...)` returning `false`). Replace the whole function with:

```js
// Kept as a named function because TodaysCrew.jsx, HomeDashboard.jsx and
// ui/AvatarStatusRail.jsx all call it. Sprint 34 moved visibility enforcement
// into RLS, so the old client-side friend filter (and its dead
// visibility === "public" branch — the CHECK only allows friends|groups|private)
// is gone.
export async function getTodaysVisiblePlans(skiDate) {
  return getVisiblePlansInRange(skiDate, skiDate)
}
```

Note this drops the previous `getCurrentUser()` + `getAcceptedFriendIds()` round trips — two fewer network calls on every Home and Today's Crew render.

- [ ] **Step 3: Add `deleteDailyPlan` immediately after `markArrival`**

```js
// Owner-only delete; covered by the existing "users can manage own daily plans"
// ALL policy, so no RPC is needed.
export async function deleteDailyPlan(planId) {
  const { error } = await supabase
    .from("daily_plans")
    .delete()
    .eq("id", planId)

  if (error) throw error
}
```

- [ ] **Step 4: Stop the friend leaderboard from counting future plans**

In `getFriendsLeaderboard`, find:

```js
  const { data: allPlans, error: plansError } = await supabase
    .from("daily_plans")
    .select("user_id, ski_date, resort_key")
    .in("user_id", [user.id, ...friendIdArray]);
```

Replace with:

```js
  // Sprint 34: cap at today. Before migration 032 this query returned only the
  // caller's own rows (the friends RLS policy was dead), so every friend showed
  // 0 days. Now that friends' rows come back, forward-looking planned days would
  // inflate "days on mountain" — a plan for next Saturday is not a day skied.
  const todayISO = new Date().toISOString().slice(0, 10);

  const { data: allPlans, error: plansError } = await supabase
    .from("daily_plans")
    .select("user_id, ski_date, resort_key")
    .in("user_id", [user.id, ...friendIdArray])
    .lte("ski_date", todayISO);
```

- [ ] **Step 5: Verify in the browser**

```bash
npm run dev
```

Open the app, log in, and check the Social tab → Friend Leaderboard. Expected: friends who have checked in now show **non-zero** `daysOnMountain` where they previously showed 0. Home tab → Today's Crew shows friends who checked in today, not just you.

Confirm no console errors mentioning `daily_plans` or `profiles`.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint 2>&1 | tail -5
```

Expected: same problem count as `main`'s 92 baseline (±0 from these edits).

```bash
git add src/lib/socialApi.js
git commit -m "feat: date-range plan queries; stop leaderboard counting future plans

Adds getVisiblePlansInRange/deleteDailyPlan and reduces
getTodaysVisiblePlans to a single-date delegation, dropping the now-redundant
client-side friend filter and its dead visibility==='public' branch.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Extract `PlanCalendar.jsx`

**Files:**
- Create: `src/components/PlanCalendar.jsx`
- Modify: `src/components/SkiPlansPage.jsx` — delete the inline `CalendarView` (lines ~82–260) and consume the new component

**Interfaces:**
- Produces: `<PlanCalendar entriesByDate dotColorFor legend onSelectDay renderDayDetail selectedDate initialMonth />`
  - `entriesByDate: Map<'YYYY-MM-DD', entry[]>` — caller owns entry shape entirely
  - `dotColorFor: (entry) => string` — must return a **literal hex** string
  - `legend: Array<{ color: string, label: string }>` — pass `[]` to hide
  - `onSelectDay: (dateKey: string | null) => void` — fires on every cell tap, including empty days (Task 6 needs empty days clickable to create a plan)
  - `renderDayDetail: (dateKey, entries) => ReactNode` — caller renders the panel below the grid
  - `selectedDate: string | null` — controlled by the caller
  - `initialMonth?: Date` — defaults to the current month
  - `onMonthChange?: (d: Date) => void` — fires on `‹`/`›`; Tasks 6 and 7 use it to refetch the newly displayed month
- Also exports `dateKeyOf(year, monthIndex, day)`, `localDateKey(date?)`, `monthBounds(date) => { start, end }`.
- Tasks 6 and 7 both consume this.

**Why the interface changed from the original:** the old `CalendarView` took five hardcoded arrays (`myTrips`, `rsvpdTrips`, `invitedTrips`, `friendsTrips`, `skiPlans`) and owned `selectedDate` internally. Both are wrong for reuse — Task 6 needs to control selection to drive an edit panel, and Task 7 has a completely different entry shape.

- [ ] **Step 1: Create `src/components/PlanCalendar.jsx`**

```jsx
import { useState } from "react"

/**
 * Generic month-grid calendar. Knows nothing about trips, plans, or profiles —
 * the caller supplies a Map of date-key → entries and decides how to color dots
 * and render the selected-day panel.
 *
 * Date keys are ALWAYS built from local date parts, never toISOString(). Using
 * toISOString() shifts every cell one day east of Greenwich for anyone in a
 * negative-offset timezone (i.e. all of Colorado). Same constraint documented in
 * SeasonCalendar.jsx.
 */
export function dateKeyOf(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** Local-date key for a JS Date. Use this instead of toISOString().slice(0,10). */
export function localDateKey(d = new Date()) {
  return dateKeyOf(d.getFullYear(), d.getMonth(), d.getDate())
}

/** First and last date key of the month containing `d`. */
export function monthBounds(d) {
  const start = dateKeyOf(d.getFullYear(), d.getMonth(), 1)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const end = dateKeyOf(d.getFullYear(), d.getMonth(), lastDay)
  return { start, end }
}

export default function PlanCalendar({
  entriesByDate,
  dotColorFor,
  legend = [],
  onSelectDay,
  renderDayDetail,
  selectedDate = null,
  initialMonth,
  onMonthChange,
}) {
  const today = new Date()
  const [viewDate, setViewDate] = useState(
    () => initialMonth || new Date(today.getFullYear(), today.getMonth(), 1)
  )

  const yr = viewDate.getFullYear()
  const mo = viewDate.getMonth()
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })
  const todayKey = localDateKey(today)

  const firstDow = new Date(yr, mo, 1).getDay()
  const daysInMonth = new Date(yr, mo + 1, 0).getDate()

  function goToMonth(next) {
    setViewDate(next)
    onMonthChange?.(next)
  }

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const selectedEntries = selectedDate ? (entriesByDate.get(selectedDate) || []) : []

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button
          onClick={() => goToMonth(new Date(yr, mo - 1, 1))}
          aria-label="Previous month"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "6px 12px", color: "white", cursor: "pointer", fontWeight: 700, minHeight: 44 }}
        >
          ‹
        </button>
        <div style={{ fontWeight: 900, fontSize: 16, color: "white" }}>{monthLabel}</div>
        <button
          onClick={() => goToMonth(new Date(yr, mo + 1, 1))}
          aria-label="Next month"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "6px 12px", color: "white", cursor: "pointer", fontWeight: 700, minHeight: 44 }}
        >
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", padding: "4px 0" }}>{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />
          const key = dateKeyOf(yr, mo, day)
          const dayEntries = entriesByDate.get(key) || []
          const isToday = key === todayKey
          const isSelected = selectedDate === key
          const dow = new Date(yr, mo, day).getDay()
          const isWeekend = dow === 0 || dow === 6
          const has = dayEntries.length > 0

          // Dedupe dots by color so three plans at one resort render one dot.
          const dotColors = [...new Set(dayEntries.map(dotColorFor))].slice(0, 3)

          return (
            <button
              key={key}
              onClick={() => onSelectDay?.(isSelected ? null : key)}
              style={{
                padding: "6px 4px 8px",
                borderRadius: 10,
                border: isSelected
                  ? "1.5px solid var(--color-accent-soft)"
                  : isToday
                  ? "1.5px solid rgba(255,255,255,0.25)"
                  : "1.5px solid transparent",
                background: isSelected
                  ? "rgba(96,165,250,0.15)"
                  : has && isWeekend
                  ? "rgba(255,255,255,0.07)"
                  : has
                  ? "rgba(255,255,255,0.04)"
                  : "transparent",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                minHeight: 46,
              }}
            >
              <span style={{
                fontSize: 13,
                fontWeight: isToday ? 900 : isWeekend ? 700 : 400,
                color: isToday ? "white" : isWeekend ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)",
                background: isToday ? "var(--color-accent-soft)" : "transparent",
                borderRadius: "50%",
                width: 24, height: 24,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {day}
              </span>
              {dotColors.length > 0 && (
                <div style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>
                  {dotColors.map((color) => (
                    <div key={color} style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      {legend.length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14, padding: "10px 0 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {legend.map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              {label}
            </div>
          ))}
        </div>
      )}

      {/* Selected day panel — caller-rendered */}
      {selectedDate && renderDayDetail && (
        <div style={{ marginTop: 16 }}>
          {renderDayDetail(selectedDate, selectedEntries)}
        </div>
      )}
    </div>
  )
}
```

Note two behavior changes from the original, both required by later tasks: every cell is clickable (`cursor: "pointer"` unconditionally — Task 6 needs empty days tappable to create a plan), and `selectedDate` is controlled by the caller.

- [ ] **Step 2: Rewrite `SkiPlansPage`'s calendar to use it**

Delete the entire `CalendarView` function from `SkiPlansPage.jsx` (from the `/* ── Calendar view ── */` comment through its closing brace, ~lines 81–260). Add to the imports at the top:

```jsx
import PlanCalendar, { dateKeyOf } from "./PlanCalendar"
```

Then add this replacement `CalendarView` in its place — it now owns the data-shaping and detail panel, and delegates the grid:

```jsx
/* ── Calendar view ─────────────────────────────────────────────────── */
// Dot colors kept as literal hex: they feed `${color}11`/`33` alpha-suffix
// template literals below, and var() references break when concatenated with a
// hex alpha suffix (same constraint as SKILL_OPTIONS / TYPE_META).
const DOT_COLORS = { mine: "#60a5fa", going: "#22c55e", invited: "#fbbf24", friend: "#a78bfa", daily: "#67e8f9" }
const DOT_LABELS = { mine: "Your Trip", going: "Going", invited: "Invited", friend: "Friend's Trip", daily: "Check-in" }

function CalendarView({ myTrips, rsvpdTrips, invitedTrips, friendsTrips, skiPlans, onOpenTrip }) {
  const [selectedDate, setSelectedDate] = useState(null)

  const entriesByDate = new Map()
  function addToDate(date, entry) {
    if (!date) return
    const key = date.slice(0, 10)
    if (!entriesByDate.has(key)) entriesByDate.set(key, [])
    entriesByDate.get(key).push(entry)
  }
  myTrips.forEach((t) => addToDate(t.ski_date, { ...t, _role: "mine" }))
  rsvpdTrips.forEach((t) => addToDate(t.ski_date, { ...t, _role: "going" }))
  invitedTrips.forEach((t) => addToDate(t.ski_date, { ...t, _role: "invited" }))
  friendsTrips.forEach((t) => addToDate(t.ski_date, { ...t, _role: "friend" }))
  skiPlans.forEach((p) => addToDate(p.ski_date, { ...p, _role: "daily" }))

  return (
    <PlanCalendar
      entriesByDate={entriesByDate}
      dotColorFor={(e) => DOT_COLORS[e._role]}
      legend={Object.entries(DOT_COLORS).map(([role, color]) => ({ color, label: DOT_LABELS[role] }))}
      selectedDate={selectedDate}
      onSelectDay={setSelectedDate}
      renderDayDetail={(dateKey, entries) => (
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 16px", display: "grid", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.7)" }}>
            {formatDate(dateKey)}
          </div>
          {entries.length === 0 ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Nothing planned this day.</div>
          ) : entries.map((t, i) => (
            <button
              key={t.id || i}
              onClick={() => t.id && t._role !== "daily" && onOpenTrip(t)}
              style={{
                background: `${DOT_COLORS[t._role]}11`,
                border: `1px solid ${DOT_COLORS[t._role]}33`,
                borderLeft: `3px solid ${DOT_COLORS[t._role]}`,
                borderRadius: "0 12px 12px 0",
                padding: "10px 14px",
                textAlign: "left",
                cursor: t.id && t._role !== "daily" ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 18 }}>{resortEmoji(t.resort_key)}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>
                  {t.title || resortName(t.resort_key) || t.resort_key}
                </div>
                <div style={{ fontSize: 11, color: DOT_COLORS[t._role], fontWeight: 700, marginTop: 2 }}>
                  {DOT_LABELS[t._role]}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    />
  )
}
```

Then update the call site (search for `<CalendarView`) to drop the now-unused `currentUser` prop, keeping the rest identical.

- [ ] **Step 3: Verify the Plans calendar is unchanged**

```bash
npm run dev
```

Go to the **Plans** tab → **📅 Calendar** sub-tab. Expected, all identical to before this task:
- Month label and `‹`/`›` navigation work.
- Days with trips/check-ins show colored dots; the legend lists all five roles.
- Tapping a day with trips opens the detail panel; tapping a trip opens `TripDetailModal`.
- Today's date is circled.

The one intended change: tapping an *empty* day now selects it and shows "Nothing planned this day." That is required by Task 6.

If any dot color or layout differs, the extraction is wrong — fix before committing. This refactor is the proof the component is correct.

- [ ] **Step 4: Lint and commit**

```bash
npm run lint 2>&1 | tail -5
git add src/components/PlanCalendar.jsx src/components/SkiPlansPage.jsx
git commit -m "refactor: extract reusable PlanCalendar from SkiPlansPage

Generalizes the month grid to a caller-supplied entriesByDate Map with
controlled selection, so the Profile plan tab and the crew shared calendar
can reuse it. Exports localDateKey/monthBounds helpers that build keys from
local date parts (toISOString shifts cells a day west of Greenwich).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `ProfileStats.jsx` + `ProfilePage` read-only mode

**Files:**
- Create: `src/components/ProfileStats.jsx`
- Modify: `src/components/ProfilePage.jsx`

**Interfaces:**
- Consumes: `getVisiblePlansInRange` (Task 2), `PlanCalendar` (Task 3).
- Produces: `<ProfilePage userId={string|null} onLogOut onTabChange onBack />`. When `userId` is falsy the component behaves exactly as today. Task 5 renders it with a `userId`.
- `ProfileStats.jsx` exports: `SeasonStatsCard`, `StatsViewToggle`, `HistoryViewToggle`, `RecentSessionsFeed`, `computeStats`, `getCurrentSeason`-consumers unchanged.

- [ ] **Step 1: Move the presentational stat components into `ProfileStats.jsx`**

Cut `computeStats`, `SeasonStatsCard`, `StatsViewToggle`, `HistoryViewToggle`, and `RecentSessionsFeed` out of `ProfilePage.jsx` verbatim into a new `src/components/ProfileStats.jsx`. Add `export` to each, carry over only the imports they actually use, and re-import them in `ProfilePage.jsx`:

```jsx
import {
  computeStats,
  SeasonStatsCard,
  StatsViewToggle,
  HistoryViewToggle,
  RecentSessionsFeed,
} from "./ProfileStats"
```

Do not change their internals. This is a pure move — verify the Profile tab renders identically before continuing.

- [ ] **Step 2: Add the `userId` prop and read-only branching**

Change the signature and add derived state at the top of the component:

```jsx
export default function ProfilePage({ onLogOut, onTabChange, userId = null, onBack }) {
  const isOwnProfile = !userId
```

Add two pieces of state alongside the existing ones:

```jsx
  const [profileTab, setProfileTab] = useState("stats")   // "stats" | "plans"
  const [notFriends, setNotFriends] = useState(false)
```

- [ ] **Step 3: Branch the `load()` callback**

Replace the body of `load()` with a branch on `isOwnProfile`. The own-profile path is unchanged; the friend path uses `getProfileById` for the header and pulls stats out of the existing leaderboard RPC.

`getLeaderboard(startYear)` (`src/lib/leaderboardApi.js:216`) already returns **self plus every accepted friend** with 16 stats each, so a friend's season stats need no new SQL. If the target user is absent from that array they are not a friend — that is the `notFriends` signal.

```jsx
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { startYear } = getCurrentSeason()

      if (isOwnProfile) {
        // ... existing own-profile Promise.all block, unchanged ...
        return
      }

      const [prof, board] = await Promise.all([
        getProfileById(userId),
        getLeaderboard(startYear).catch(() => []),
      ])
      setProfile(prof)

      const row = board.find((r) => r.id === userId)
      if (!row) {
        // Not in the friends leaderboard => not an accepted friend.
        setNotFriends(true)
        setSeasonStats(null)
      } else {
        setNotFriends(false)
        setSeasonStats({
          days:            row.days,
          vertical:        row.verticalFt,
          miles:           row.milesSki,
          powderDays:      row.powderDays,
          resorts:         row.resorts,
          topResort:       row.topResort,
          totalRuns:       row.totalRuns,
          topSpeed:        row.topSpeed,
          timeOnMountain:  row.timeOnMountain,
        })
      }
      setRecentSessions([])
      setPriorStats(null)
      setAllTimeStats(null)
    } catch (e) {
      console.warn("Profile load failed:", e)
    } finally {
      setLoading(false)
    }
  }, [isOwnProfile, userId])
```

Add `getProfileById` to the `socialApi` import and `getLeaderboard` to the `leaderboardApi` import.

The shape assigned to `setSeasonStats` must match what `computeStats` produces, since `SeasonStatsCard` consumes both. Verify the key names against `computeStats` in `ProfileStats.jsx` before moving on — mismatched keys render as blank stats, not an error.

- [ ] **Step 4: Gate the owner-only UI**

Wrap each of these in `{isOwnProfile && ( … )}`:
- the avatar upload menu / `fileInputRef` trigger
- the **Edit Profile** button and `EditProfileModal`
- the **Share Season** button and `ShareStatCard`
- the **Theme** picker block
- the **Connected Apps** block containing `<StravaConnect />`
- the **Log Out** button
- `MilestoneModal` and the `milestoneQueue` effect

In the three-stat row, change the Trips and Friends buttons to plain `<div>`s when `!isOwnProfile` — they call `onTabChange` to navigate the viewer's own tabs, which is wrong on someone else's profile.

Add a back affordance at the top when `!isOwnProfile`:

```jsx
      {!isOwnProfile && (
        <button
          onClick={onBack}
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 14px", color: "white", cursor: "pointer", fontWeight: 700, fontSize: 13, minHeight: 44, justifySelf: "start" }}
        >
          ‹ Back
        </button>
      )}
```

- [ ] **Step 5: Add the `Stats | Ski Plans` sub-tab bar**

Insert directly above the Season Stats block, following the `SUB_TABS` pattern from `SkiPlansPage.jsx:319`:

```jsx
      <div style={{
        display: "flex", gap: 4, background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14,
        padding: 4, marginBottom: 8, width: "fit-content",
      }}>
        {[{ key: "stats", label: "📊 Stats" }, { key: "plans", label: "📅 Ski Plans" }].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setProfileTab(key)}
            style={{
              padding: "8px 16px", borderRadius: 10,
              background: profileTab === key ? "rgba(255,255,255,0.12)" : "transparent",
              border: profileTab === key ? "1px solid rgba(255,255,255,0.14)" : "1px solid transparent",
              color: profileTab === key ? "white" : "rgba(255,255,255,0.5)",
              fontWeight: profileTab === key ? 800 : 600,
              fontSize: 13, cursor: "pointer", minHeight: 44,
            }}
          >
            {label}
          </button>
        ))}
      </div>
```

Wrap the existing Season Stats + Session History blocks in `{profileTab === "stats" && ( … )}`. Leave a placeholder for the plans tab — Task 6 fills it:

```jsx
      {profileTab === "plans" && (
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "24px 0" }}>
          Ski plans calendar — Task 6.
        </div>
      )}
```

- [ ] **Step 6: Add the not-a-friend state**

Inside the stats tab, ahead of the stats card:

```jsx
      {profileTab === "stats" && notFriends && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "28px 20px", textAlign: "center", display: "grid", gap: 8, justifyItems: "center" }}>
          <div style={{ fontSize: 30 }}>🔒</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>Season stats are friends-only</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", maxWidth: 280 }}>
            Add {profile?.first_name || profile?.username || "them"} as a friend to see their days, vertical, and top resort.
          </div>
        </div>
      )}
```

Guard the stats card so it renders only when `seasonStats && !notFriends`.

- [ ] **Step 7: Verify**

Own profile must be byte-for-byte unchanged in behavior. Run `npm run dev`, go to **Profile**, and confirm: avatar upload menu opens, Edit Profile works, theme switching works, Strava block present, Log Out present, stats and session history render, and the new `📊 Stats | 📅 Ski Plans` toggle appears.

The friend path can't be reached from the UI until Task 5. Verify it temporarily by rendering `<ProfilePage userId="<a-real-friend-uuid>" onBack={() => {}} />` in place of the normal one in `App.jsx`, confirming: friend's name/avatar in the header, their season stats populated, and no Edit/Theme/Strava/Log Out. **Revert that temporary edit before committing.**

- [ ] **Step 8: Lint and commit**

```bash
npm run lint 2>&1 | tail -5
git add src/components/ProfileStats.jsx src/components/ProfilePage.jsx
git commit -m "feat: read-only friend mode on ProfilePage

Extracts the presentational stat components to ProfileStats.jsx so both own
and friend views share them, then adds an optional userId prop. Friend season
stats reuse the existing get_leaderboard RPC (which already returns self +
accepted friends) rather than adding new SQL.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Navigate to a friend's profile

**Files:**
- Create: `src/lib/profileNav.js`
- Modify: `src/App.jsx`, `src/components/UserProfileModal.jsx`

**Interfaces:**
- Consumes: `<ProfilePage userId onBack />` (Task 4).
- Produces: `ProfileNavContext` + `useProfileNav()` returning `(userId: string) => void`.

**Why a context and not props:** `UserProfileModal` has five call sites — `TodaysCrew`, `PowderMap`, `CrewGroupChat` (nested inside `MessagingCenter` inside `FriendsPage`), `FriendsPage`, and the shared `ui/AvatarStatusRail` primitive. Prop-drilling a callback to all five touches seven files and puts a navigation concern into a `ui/` primitive's API. A context touches two and leaves every call site untouched.

- [ ] **Step 1: Create `src/lib/profileNav.js`**

```js
import { createContext, useContext } from "react"

/**
 * Lets any descendant open a full-page profile without prop drilling.
 * UserProfileModal has five call sites, one of which is a shared ui/ primitive;
 * threading a callback through all of them would put navigation into that
 * primitive's public API. Provided in App.jsx.
 *
 * Default is a no-op so components render fine outside a provider.
 */
export const ProfileNavContext = createContext(() => {})

export function useProfileNav() {
  return useContext(ProfileNavContext)
}
```

- [ ] **Step 2: Wire the provider and the takeover in `App.jsx`**

Add the import:

```jsx
import { ProfileNavContext } from "./lib/profileNav"
```

Add state next to `mountainPageResortKey` (~line 914):

```jsx
  const [viewingProfileId, setViewingProfileId] = useState(null)
```

Clear it in `handleTabChange` (~line 1358) so bottom-nav navigation never leaves a stale friend profile mounted:

```jsx
  const handleTabChange = (tab) => {
    setMountainPageResortKey(null)
    setViewingProfileId(null)
    setActiveTab(tab)
  }
```

Wrap the app's rendered tree in the provider. Find the outermost returned element in `App()` and wrap it:

```jsx
    <ProfileNavContext.Provider value={setViewingProfileId}>
      {/* ...existing tree... */}
    </ProfileNavContext.Provider>
```

Then add the takeover, mirroring the existing `mountainPageResortKey` branch. Find:

```jsx
{mountainPageResortKey ? (
  <MountainPage ... />
) : (
```

and make the profile takeover take precedence, so opening a profile from inside a Mountain Page works:

```jsx
{viewingProfileId ? (
  <ProfilePage
    userId={viewingProfileId}
    onBack={() => setViewingProfileId(null)}
    onTabChange={setActiveTab}
  />
) : mountainPageResortKey ? (
  <MountainPage ... />
) : (
```

- [ ] **Step 3: Add the button to `UserProfileModal.jsx`**

Add the import:

```jsx
import { useProfileNav } from "../lib/profileNav"
```

Inside the component, near the other hooks:

```jsx
  const openFullProfile = useProfileNav()
```

Add a button in the modal's action area (above or beside the existing close affordance):

```jsx
      <button
        onClick={() => { onClose?.(); openFullProfile(userId) }}
        style={{
          width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
          background: "var(--gradient-cta)", color: "white",
          fontWeight: 800, fontSize: 14, cursor: "pointer", minHeight: 44,
        }}
      >
        View Full Profile
      </button>
```

Order matters: `onClose()` first so the bottom sheet unmounts before the page swaps underneath it.

- [ ] **Step 4: Verify all five entry points**

`npm run dev`, mobile viewport. For each, tap through to the modal and press **View Full Profile** — the sheet must close and the friend's full profile must fill the page:

1. **Home** → Today's Crew → tap a friend's avatar
2. **Snow → Map** → tap a friend's pin (or a skier row)
3. **Social → Friends** → tap a friend row
4. **Social → Chats** → open a crew chat → tap a member avatar
5. Any surface showing the avatar status rail

Then, from a friend's profile, tap any **bottom-nav** tab. The profile must clear and the chosen tab must render — no stale profile.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint 2>&1 | tail -5
git add src/lib/profileNav.js src/App.jsx src/components/UserProfileModal.jsx
git commit -m "feat: open a friend's full profile from the peek modal

Adds a ProfileNavContext so UserProfileModal can trigger a full-page profile
takeover without drilling a callback through its five call sites (one of which
is a shared ui/ primitive). Profile takeover takes precedence over MountainPage
so it works from inside a mountain page too.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Editable ski-plan calendar on the Profile

**Files:**
- Modify: `src/components/ProfilePage.jsx` — replace the Task 4 placeholder
- Create: `src/components/SkiPlansTab.jsx`

**Interfaces:**
- Consumes: `PlanCalendar`, `localDateKey`, `monthBounds` (Task 3); `getVisiblePlansInRange`, `upsertDailyPlan`, `deleteDailyPlan` (Task 2); `RESORTS` from `App.jsx` via the `resorts` prop chain.
- Produces: `<SkiPlansTab userId={string|null} editable={boolean} resorts={Resort[]} />`

Kept in its own file rather than inlined — `ProfilePage.jsx` is already ~1000 lines after Task 4's extraction, and this tab is self-contained.

- [ ] **Step 1: Create `src/components/SkiPlansTab.jsx`**

```jsx
import { useCallback, useEffect, useState } from "react"
import PlanCalendar, { localDateKey, monthBounds } from "./PlanCalendar"
import { getCurrentUser, getVisiblePlansInRange, upsertDailyPlan, deleteDailyPlan } from "../lib/socialApi"
import { resortName, resortEmoji } from "../lib/resorts"
import { formatDate } from "../lib/format"

// Literal hex: feeds `${color}11`/`33` alpha-suffix template literals below.
const PLAN_COLOR = "#67e8f9"

const fieldStyle = {
  width: "100%", background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10,
  padding: "10px 12px", color: "white", fontSize: 14,
  boxSizing: "border-box", outline: "none", colorScheme: "dark",
}

export default function SkiPlansTab({ userId = null, editable = false, resorts = [] }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [plans, setPlans] = useState([])
  const [ownerId, setOwnerId] = useState(userId)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [draftResort, setDraftResort] = useState("")
  const [draftVisibility, setDraftVisibility] = useState("friends")
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const todayKey = localDateKey()

  // Whose plans this tab shows. On a friend's profile that's the userId prop;
  // on your own it's you, which getVisiblePlansInRange doesn't tell us on its
  // own — the range query returns friends' and crewmates' rows too.
  useEffect(() => {
    let cancelled = false
    if (userId) { setOwnerId(userId); return }
    getCurrentUser()
      .then((u) => { if (!cancelled) setOwnerId(u?.id ?? null) })
      .catch(() => { if (!cancelled) setOwnerId(null) })
    return () => { cancelled = true }
  }, [userId])

  const fetchPlans = useCallback(() => {
    const { start, end } = monthBounds(month)
    return getVisiblePlansInRange(start, end)
  }, [month])

  useEffect(() => {
    if (!ownerId) return
    let cancelled = false
    setLoading(true); setLoadError(null)
    fetchPlans()
      // RLS already scoped these rows to what we're allowed to see; narrow to
      // the one person whose profile this is.
      .then((rows) => { if (!cancelled) setPlans(rows.filter((p) => p.user_id === ownerId)) })
      .catch((err) => { if (!cancelled) { setPlans([]); setLoadError(err) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fetchPlans, ownerId])

  const entriesByDate = new Map()
  for (const p of plans) {
    const key = (p.ski_date || "").slice(0, 10)
    if (!key) continue
    if (!entriesByDate.has(key)) entriesByDate.set(key, [])
    entriesByDate.get(key).push(p)
  }

  const selectedPlan = selectedDate
    ? plans.find((p) => (p.ski_date || "").slice(0, 10) === selectedDate) || null
    : null
  const isPast = selectedDate ? selectedDate < todayKey : false
  const canEdit = editable && !isPast

  function handleSelectDay(key) {
    setSelectedDate(key)
    setSaveError(null)
    const existing = key ? plans.find((p) => (p.ski_date || "").slice(0, 10) === key) : null
    setDraftResort(existing?.resort_key || "")
    setDraftVisibility(existing?.visibility || "friends")
  }

  async function handleSave() {
    if (!draftResort || !selectedDate) return
    setBusy(true); setSaveError(null)
    const previous = plans
    try {
      const saved = await upsertDailyPlan({
        ski_date: selectedDate,
        resort_key: draftResort,
        visibility: draftVisibility,
        status: "planned",
      })
      setPlans((prev) => [
        ...prev.filter((p) => (p.ski_date || "").slice(0, 10) !== selectedDate),
        saved,
      ])
    } catch (err) {
      setPlans(previous)
      setSaveError(err?.message || "Couldn't save that plan. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (!selectedPlan) return
    setBusy(true); setSaveError(null)
    const previous = plans
    setPlans((prev) => prev.filter((p) => p.id !== selectedPlan.id))
    try {
      await deleteDailyPlan(selectedPlan.id)
      setDraftResort("")
    } catch (err) {
      setPlans(previous)
      setSaveError(err?.message || "Couldn't remove that plan. Try again.")
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Loading plans…</div>
  }
  if (loadError) {
    return <div style={{ textAlign: "center", padding: "40px 0", color: "var(--color-danger)", fontSize: 13 }}>Couldn't load ski plans. Try again in a bit.</div>
  }

  return (
    <div>
      <PlanCalendar
        entriesByDate={entriesByDate}
        dotColorFor={() => PLAN_COLOR}
        legend={[{ color: PLAN_COLOR, label: "Planned ski day" }]}
        selectedDate={selectedDate}
        onSelectDay={handleSelectDay}
        onMonthChange={(d) => { setMonth(d); setSelectedDate(null) }}
        renderDayDetail={(dateKey) => (
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 16px", display: "grid", gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.7)" }}>{formatDate(dateKey)}</div>

            {selectedPlan && (
              <div style={{
                background: `${PLAN_COLOR}11`, border: `1px solid ${PLAN_COLOR}33`,
                borderLeft: `3px solid ${PLAN_COLOR}`, borderRadius: "0 12px 12px 0",
                padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>{resortEmoji(selectedPlan.resort_key)}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>
                    {resortName(selectedPlan.resort_key) || selectedPlan.resort_key}
                  </div>
                  <div style={{ fontSize: 11, color: PLAN_COLOR, fontWeight: 700, marginTop: 2 }}>
                    {selectedPlan.visibility === "private" ? "Private" : "Visible to friends"}
                  </div>
                </div>
              </div>
            )}

            {!selectedPlan && !canEdit && (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>No plans this day.</div>
            )}

            {canEdit && (
              <>
                <select
                  value={draftResort}
                  onChange={(e) => setDraftResort(e.target.value)}
                  style={fieldStyle}
                  disabled={busy}
                >
                  <option value="">Pick a mountain…</option>
                  {resorts.map((r) => (
                    <option key={r.resortKey} value={r.resortKey}>{r.name}</option>
                  ))}
                </select>

                <div style={{ display: "flex", gap: 6 }}>
                  {[{ key: "friends", label: "👥 Friends" }, { key: "private", label: "🔒 Private" }].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setDraftVisibility(key)}
                      disabled={busy}
                      style={{
                        flex: 1, padding: "8px 0", borderRadius: 999, fontSize: 12, fontWeight: 700,
                        border: draftVisibility === key ? "1px solid rgba(56,189,248,0.5)" : "1px solid rgba(255,255,255,0.12)",
                        background: draftVisibility === key ? "rgba(56,189,248,0.25)" : "transparent",
                        color: draftVisibility === key ? "white" : "rgba(255,255,255,0.5)",
                        cursor: busy ? "default" : "pointer", minHeight: 44,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {saveError && (
                  <div style={{ fontSize: 12, color: "var(--color-danger)" }}>{saveError}</div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleSave}
                    disabled={busy || !draftResort}
                    style={{
                      flex: 1, padding: "11px 0", borderRadius: 12, border: "none",
                      background: draftResort ? "var(--gradient-cta)" : "rgba(255,255,255,0.08)",
                      color: "white", fontWeight: 800, fontSize: 14,
                      cursor: busy || !draftResort ? "default" : "pointer",
                      opacity: busy ? 0.6 : 1, minHeight: 44,
                    }}
                  >
                    {busy ? "Saving…" : selectedPlan ? "Update Plan" : "Save Plan"}
                  </button>
                  {selectedPlan && (
                    <button
                      onClick={handleRemove}
                      disabled={busy}
                      style={{
                        padding: "11px 16px", borderRadius: 12,
                        border: "1px solid var(--color-danger)", background: "var(--color-danger-bg)",
                        color: "var(--color-danger)", fontWeight: 800, fontSize: 14,
                        cursor: busy ? "default" : "pointer", minHeight: 44,
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </>
            )}

            {editable && isPast && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                Past days can't be edited here — log a session from the Leaderboard instead.
              </div>
            )}
          </div>
        )}
      />
    </div>
  )
}
```

- [ ] **Step 2: Mount it in `ProfilePage`**

Replace the Task 4 placeholder:

```jsx
      {profileTab === "plans" && (
        <SkiPlansTab userId={userId} editable={isOwnProfile} resorts={resorts} />
      )}
```

Add `import SkiPlansTab from "./SkiPlansTab"`, and thread `resorts` into `ProfilePage`'s props: `export default function ProfilePage({ onLogOut, onTabChange, userId = null, onBack, resorts = [] })`. In `App.jsx`, pass `resorts={RESORTS}` to **both** `ProfilePage` render sites (the profile tab and the Task 5 takeover).

`RESORTS` entries have shape `{ name, pass, lat, lon, resortKey, photoPath, directionsQuery, isOpen }` — the `<select>` uses `resortKey` as the value, matching `daily_plans.resort_key`. Do **not** use `ui/ResortPicker.jsx`; it emits display names, not keys.

- [ ] **Step 3: Verify**

`npm run dev`, **Profile → 📅 Ski Plans**:
1. Tap a future day → picker appears → choose a mountain → **Save Plan** → a cyan dot appears on that day.
2. Reload the page → the dot and plan persist.
3. Tap that day again → **Update Plan** relabels the button; change the resort → saves.
4. Tap **Remove** → the dot disappears; reload confirms it's gone.
5. Tap a past day → shows "Past days can't be edited here", no picker.
6. Navigate to next month with `›` → the grid refetches; the previously selected day clears.
7. Set a day to **🔒 Private** → detail panel shows "Private".

Then verify the read-only path: open a friend's profile (Task 5) → **📅 Ski Plans** → their plans render with no picker, no Save, no Remove.

- [ ] **Step 4: Lint and commit**

```bash
npm run lint 2>&1 | tail -5
git add src/components/SkiPlansTab.jsx src/components/ProfilePage.jsx src/App.jsx
git commit -m "feat: editable days-I-plan-to-ski calendar on Profile

Tap a future day, pick a mountain, save. Per-day friends/private visibility.
Read-only when viewing a friend's profile. Optimistic writes with rollback and
the standard cancelled-fetch guard.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Crew-filtered shared calendar

**Files:**
- Modify: `src/components/SkiPlansPage.jsx`

**Interfaces:**
- Consumes: `getVisiblePlansInRange` (Task 2), `PlanCalendar` + `monthBounds` (Task 3), `getMyCrews`/`getCrewMembers` (existing, `socialApi.js` ~2843).

Extends the existing `📅 Calendar` sub-tab with scope chips rather than adding a second calendar beside it.

- [ ] **Step 1: Load crews and their members once**

In `SkiPlansPage`, add state and a loader beside the existing ones:

```jsx
  const [crews, setCrews] = useState([])              // [{ id, name, emoji }]
  const [crewMemberIds, setCrewMemberIds] = useState(new Map())  // crewId -> Set(userId)
  const [scopes, setScopes] = useState(() => new Set(["me", "friends"]))
```

In the existing `init()` effect's `Promise.allSettled`, add:

```jsx
          getMyCrews()
            .then(async (rows) => {
              setCrews(rows || [])
              const pairs = await Promise.all(
                (rows || []).map(async (c) => {
                  const members = await getCrewMembers(c.id).catch(() => [])
                  return [c.id, new Set(members.map((m) => m.user_id || m.id))]
                })
              )
              setCrewMemberIds(new Map(pairs))
            })
            .catch(() => {}),
```

Import `getMyCrews, getCrewMembers` from `../lib/socialApi`.

Verify the member row shape before relying on `m.user_id || m.id` — read `getCrewMembers` in `socialApi.js` and use whichever field actually holds the user id. Guessing here produces an empty crew filter that fails silently.

- [ ] **Step 2: Fetch visible plans for the displayed month**

```jsx
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [visiblePlans, setVisiblePlans] = useState([])

  useEffect(() => {
    let cancelled = false
    const { start, end } = monthBounds(calMonth)
    getVisiblePlansInRange(start, end)
      .then((rows) => { if (!cancelled) setVisiblePlans(rows) })
      .catch(() => { if (!cancelled) setVisiblePlans([]) })
    return () => { cancelled = true }
  }, [calMonth])
```

- [ ] **Step 3: Add the scope chips above the calendar**

Rendered inside the `subTab === "calendar"` block, above `<CalendarView …>`:

```jsx
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {[
              { key: "me", label: "🙋 Me" },
              { key: "friends", label: "👥 All Friends" },
              ...crews.map((c) => ({ key: `crew:${c.id}`, label: `${c.emoji || "🤙"} ${c.name}` })),
            ].map(({ key, label }) => {
              const on = scopes.has(key)
              return (
                <button
                  key={key}
                  onClick={() => setScopes((prev) => {
                    const next = new Set(prev)
                    if (next.has(key)) next.delete(key); else next.add(key)
                    return next
                  })}
                  style={{
                    borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700,
                    border: on ? "1px solid rgba(56,189,248,0.5)" : "1px solid rgba(255,255,255,0.12)",
                    background: on ? "rgba(56,189,248,0.25)" : "transparent",
                    color: on ? "white" : "rgba(255,255,255,0.5)",
                    cursor: "pointer", minHeight: 44,
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
```

- [ ] **Step 4: Filter plans by the selected scopes**

```jsx
  const scopedPlans = visiblePlans.filter((p) => {
    if (p.user_id === currentUser?.id) return scopes.has("me")
    if (scopes.has("friends")) return true
    for (const s of scopes) {
      if (!s.startsWith("crew:")) continue
      if (crewMemberIds.get(s.slice(5))?.has(p.user_id)) return true
    }
    return false
  })
```

Pass `scopedPlans` into `CalendarView` as `skiPlans` in place of the current `skiPlans` prop, and add `onMonthChange={setCalMonth}` passthrough on the `PlanCalendar` inside `CalendarView` (add it to `CalendarView`'s props and forward it).

Update `CalendarView`'s day-detail entry rendering so a `_role: "daily"` entry belonging to someone else shows who it is — replace its title line with:

```jsx
                  {t._role === "daily" && t.profile && t.user_id !== currentUserId
                    ? `${t.profile.first_name || t.profile.username} → ${resortName(t.resort_key) || t.resort_key}`
                    : (t.title || resortName(t.resort_key) || t.resort_key)}
```

passing `currentUserId` into `CalendarView`.

- [ ] **Step 5: Add the empty state**

Below the chips, when `scopedPlans.length === 0`:

```jsx
          {scopedPlans.length === 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>
              No one in the selected crews has plans this month.
            </div>
          )}
```

- [ ] **Step 6: Verify**

`npm run dev` → **Plans → 📅 Calendar**:
1. Default chips `🙋 Me` and `👥 All Friends` are lit; the grid shows your plans plus friends'.
2. Turn **All Friends** off → only your own cyan dots remain.
3. Turn **Me** off and one crew on → only that crew's members' plans show.
4. Turn every chip off → the empty-state line appears.
5. Navigate months with `›` → data refetches for the new month; chips stay selected.
6. Tap a day with a friend's plan → the detail panel names the person and their mountain.

- [ ] **Step 7: Lint and commit**

```bash
npm run lint 2>&1 | tail -5
git add src/components/SkiPlansPage.jsx
git commit -m "feat: crew-filtered shared ski calendar

Adds multi-select scope chips (Me / All Friends / one per crew) to the Plans
calendar so you can see where a given crew is skiing this weekend. Crew chips
filter client-side over rows RLS already authorized.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: ROADMAP Section 18

**Files:**
- Modify: `ROADMAP.md`

- [ ] **Step 1: Add Section 18 after Section 17**

```markdown
## SECTION 18 — Friend-Visible Profiles & Ski Plan Calendar (Sprint 34)

Backlog items from Kyle's Notes: make profiles viewable by friends with season
stats, and add a "days I plan to ski" calendar so friends can coordinate.

**The foundation was broken.** `daily_plans`' friend-read RLS policy tested
membership in `public.friendships` — a table with 0 rows. The app has always
written friendships to `friend_requests` (4 accepted). The policy never matched,
so no user could read another user's plan. Same bug class as
`20260515_ski_sessions_rls_fix.sql`, which fixed `ski_sessions` and missed
`daily_plans`. Two shipped features were silently degraded:
`TodaysCrew.jsx` never showed a friend, and `getFriendsLeaderboard` reported
`daysOnMountain: 0` for everyone. A second dead policy referenced
`group_members` (also 0 rows; the app uses `crews`/`crew_members`).

Also fixed: `daily_plans.status` defaulted to `'planning'`, which its own CHECK
constraint (`planned|driving|arrived`) rejected — every INSERT omitting `status`
failed.

### TASK 18.1 — Retire `daily_plans.group_id` and the `'groups'` visibility value
- [ ] `group_id` FKs to `groups`, which has 0 rows and no code path
- [ ] `visibility='groups'` is now unreachable — such a plan is visible to nobody
      but its owner. Left in place by migration 032 as a non-destructive choice.

**Files:** `migrations/032_daily_plans_visibility_fix.sql`, `src/lib/socialApi.js`,
`src/lib/profileNav.js`, `src/components/PlanCalendar.jsx`,
`src/components/ProfileStats.jsx`, `src/components/SkiPlansTab.jsx`,
`src/components/ProfilePage.jsx`, `src/components/SkiPlansPage.jsx`,
`src/components/UserProfileModal.jsx`, `src/App.jsx`
```

- [ ] **Step 2: Strike the two backlog lines**

At lines ~681–682 under `# Improvements`, wrap both in `~~…~~` and append `**DONE — Sprint 34.**`, matching the existing struck entry's format on the line below them.

- [ ] **Step 3: Update the Progress Summary table**

Add a Section 18 row and update the totals (currently 44 total / 41 done).

- [ ] **Step 4: Commit**

```bash
git add ROADMAP.md
git commit -m "docs: add Section 18 (Friend-Visible Profiles & Ski Plan Calendar)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Final verification before merge

Run all of this before considering the branch done.

- [ ] **RLS actually enforces, tested with two real accounts.** Policy text passing review is not evidence — migration 030 shipped a REVOKE that read correctly and did nothing. With account A logged in, create a future plan with visibility `friends`. Confirm: account B (accepted friend) sees it on A's profile and in the shared calendar; a third account that is neither friend nor active crewmate does not. Set the plan to `private`; confirm B can no longer see it.

- [ ] **Pending crew members are excluded.** If a `crew_members` row with `status='pending'` exists, confirm that user cannot read the crew's plans. If none exists, create one directly via SQL, test, then delete it.

- [ ] **The two previously-broken features are fixed.** Today's Crew shows friends who checked in today. Friend Leaderboard shows non-zero `daysOnMountain` — and does **not** count future planned days (create a plan for next month, confirm the count doesn't move).

- [ ] **Own profile is unregressed.** Avatar upload, Edit Profile, theme switch, Strava connect block, Log Out, season stats, session history list and calendar toggle all work as before.

- [ ] **Lint diff.** `npm run lint 2>&1 | tail -5` — compare to `main`'s 92 problems (83 errors, 9 warnings). Investigate any increase.

- [ ] **Build passes.** `npm run build` completes without error.

- [ ] **Whole-branch code review.** Sprints 30, 31, 32 and 33 each shipped bugs that only a whole-branch review caught — issues invisible to any single task's reviewer, especially where a later task activated a guard an earlier task left inert. Run `/code-review high` against the full branch diff before merging.

- [ ] **Merge.** Fast-forward to `main` and push, per the standing beta preference.
