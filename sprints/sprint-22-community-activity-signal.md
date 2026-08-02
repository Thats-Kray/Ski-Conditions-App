# Sprint 22 — Community Activity Signal

**Goal:** ROADMAP TASK 6.2 — show "X users skied here this week" on each resort card, based on all `ski_sessions` (not just friends), via a new Postgres RPC.
**Estimated effort:** 0.5 day
**Depends on:** Nothing new.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**`ski_sessions` table** (lives in `supabase/migrations/20260515_ski_sessions.sql`, not `migrations/`) — relevant columns for this sprint: `resort_name text not null` (this column actually stores a **resort key**, e.g. `"vail"` — same convention noted in sprint-15/sprint-18), `session_date date not null`. RLS already includes a policy allowing any authenticated user to view all sessions (confirmed in the RLS-fix migration), so this new RPC doesn't need special permission handling beyond the standard `grant execute ... to authenticated`.

**RPC convention** (from `get_leaderboard`, the one existing example in this codebase) — `create or replace function public.<name>(...) returns table (...) language plpgsql security definer set search_path = public as $$ ... $$; grant execute on function public.<name>(...) to authenticated;`. This sprint's function is a single flat aggregate query with no branching, so `language sql` (simpler, equally valid for a non-branching aggregate) is used instead of `plpgsql` — still `security definer` to match the established pattern.

**Migration directory:** per ROADMAP's own file listing, this goes in `migrations/014_resort_activity_rpc.sql` (the numbered, project-root directory), even though the table it reads from lives in `supabase/migrations/` — same cross-directory situation as sprint-12.

---

## Tasks

S22-T1 (RPC migration) has no dependency. S22-T2 (client function + UI wiring) depends on S22-T1 being run against Supabase.

---

### S22-T1 — `migrations/014_resort_activity_rpc.sql`

**File to create:** `migrations/014_resort_activity_rpc.sql`

```sql
-- Migration 014: Community activity signal — resort session counts
-- Run in Supabase SQL Editor.

create or replace function public.get_resort_activity_counts(from_date date)
returns table (resort_name text, session_count bigint)
language sql security definer set search_path = public
as $$
  select resort_name, count(*)::bigint as session_count
  from ski_sessions
  where session_date >= from_date
  group by resort_name;
$$;

grant execute on function public.get_resort_activity_counts(date) to authenticated;
```

**Do not run this migration yourself** — reviewed and run manually against Supabase per this repo's convention.

**Acceptance criteria:**
- Function exists with the exact signature `get_resort_activity_counts(from_date date) returns table (resort_name text, session_count bigint)`.
- `select * from get_resort_activity_counts('2026-01-01')` (run manually in the Supabase SQL editor, once applied) returns one row per resort with at least one session on/after that date.

---

### S22-T2 — `getResortActivityCounts()` + resort card badge

**File to modify:** `src/lib/socialApi.js`

```js
export async function getResortActivityCounts(fromDate) {
  const { data, error } = await supabase.rpc("get_resort_activity_counts", { from_date: fromDate })
  if (error) throw error
  return data || [] // [{ resort_name, session_count }]
}
```

**File to modify:** `src/App.jsx`

**Step 1 — Fetch once per dashboard load**, alongside sprint-21's `friendTripsByResort` fetch if that sprint has landed, otherwise as its own effect:
```js
const [resortActivityCounts, setResortActivityCounts] = useState({}) // { [resort_name]: count }

useEffect(() => {
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  getResortActivityCounts(weekAgo.toISOString().slice(0, 10))
    .then((rows) => {
      const map = {}
      for (const row of rows) map[row.resort_name] = row.session_count
      setResortActivityCounts(map)
    })
    .catch(() => setResortActivityCounts({}))
}, [])
```
Note this fetch does **not** need to be gated on `currentUser` (unlike sprint-21's friend data) — community activity counts are a public, non-friends-scoped signal, visible to any authenticated user (RLS on `ski_sessions` already allows any authenticated user to read all sessions).

**Step 2 — Add the badge to `ResortCard`.** Pass `activityCount={resortActivityCounts[r.resortKey] || 0}` into `ResortCard`'s props at the grid render site, and render a small secondary badge only if `activityCount > 0`:
```jsx
{activityCount > 0 && (
  <div style={{ fontSize: 12, color: "var(--color-text-3)", display: "flex", alignItems: "center", gap: 4 }}>
    ⛷️ {activityCount} user{activityCount === 1 ? "" : "s"} skied here this week
  </div>
)}
```
Place it near (but visually distinct from) sprint-21's `FriendsGoingBadge` if that sprint has landed — this is a secondary/quieter signal, not a competing primary badge; read `ResortCard`'s current layout to pick a spot that doesn't crowd the tier badge/score.

**Acceptance criteria:**
- Resort cards with zero sessions in the last 7 days show no activity badge.
- Resort cards with 1+ sessions show the count with correct singular/plural wording.
- The fetch works for any authenticated user regardless of friend graph.

**Verify in browser:**
```bash
npm run dev
```
With at least one `ski_sessions` row dated within the last 7 days for some resort, confirm that resort's card shows the badge with the correct count.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add migrations/014_resort_activity_rpc.sql src/lib/socialApi.js src/App.jsx
git commit -m "feat: add community activity signal badge to resort cards"
```

---

## Sprint Acceptance Criteria

- [ ] `migrations/014_resort_activity_rpc.sql` exists and has been run against Supabase
- [ ] `getResortActivityCounts(fromDate)` exists in `socialApi.js`
- [ ] Resort cards show "X users skied here this week" only when count > 0
- [ ] `npm run build` succeeds
- [ ] Verified in browser with real session data

## Out of Scope for This Sprint

- Any friends-scoping of this signal — it's intentionally the aggregate across all users, distinct from sprint-21's friends-only badge.
- Historical/trend display (e.g. "up 20% from last week") — just the raw weekly count.
</content>
