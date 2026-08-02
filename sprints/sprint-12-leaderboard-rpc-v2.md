# Sprint 12 — Leaderboard RPC v2

**Goal:** ROADMAP TASK 2.2 — extend the `get_leaderboard` Postgres function to aggregate the new session-tracking columns (top speed, longest run, total runs, total lifts, time on mountain) and surface them through `leaderboardApi.js`.
**Estimated effort:** 0.5 day
**Depends on:** `sprints/sprint-3-gps-tracker-hook.md` **must be fully executed and its migration run against Supabase first** — this sprint aggregates `runs_logged`, `lifts_ridden`, `longest_run_ft`, `time_on_mountain_min` columns that sprint-3's `migrations/010_ski_runs.sql` adds to `ski_sessions`. If sprint-3 hasn't landed yet, this sprint cannot be started (the new RPC would reference columns that don't exist).

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**Critical fact: this repo has two separate migrations directories.**
- `migrations/` (project root) — numbered files `001`–`009`, `016`. ROADMAP.md reserves `010`–`015` for session-tracking tasks. **This sprint's new file goes here: `migrations/011_leaderboard_rpc_v2.sql`.**
- `supabase/migrations/` — timestamp-named files. This is where `ski_sessions` (table) and the **current** `get_leaderboard` (RPC function) actually live today: `supabase/migrations/20260515_ski_sessions.sql` and `supabase/migrations/20260515_leaderboard_rpc.sql`. You are not editing either of those files directly — `migrations/011_leaderboard_rpc_v2.sql` will `CREATE OR REPLACE` the same function name/signature, which is how you version a Postgres function across separate migration files (the DB doesn't care which folder a `.sql` file was organized in — only that you run it).

**Exact current `get_leaderboard` function** (`supabase/migrations/20260515_leaderboard_rpc.sql`, reproduce this whole structure in your `CREATE OR REPLACE`, just adding new columns — do not remove or rename any existing returned column):
```sql
create or replace function public.get_leaderboard(
  p_start_year int,
  p_mode       text default 'friends'
)
returns table (
  id uuid, full_name text, username text, avatar_url text, skill_level text,
  days bigint, resorts bigint, powder_days bigint, vertical_ft bigint,
  miles_ski numeric, top_resort text
)
language plpgsql security definer set search_path = public
as $$
declare
  v_from date := (p_start_year || '-10-01')::date;
  v_to   date := ((p_start_year + 1) || '-05-31')::date;
begin
  if p_mode = 'public' then
    return query
      select p.id, p.full_name, p.username, p.avatar_url, p.skill_level,
        count(s.id)::bigint,
        count(distinct s.resort_name)::bigint,
        count(s.id) filter (where s.is_powder_day)::bigint,
        coalesce(sum(s.vertical_feet), 0)::bigint,
        coalesce(sum(s.miles_skied), 0)::numeric,
        (select s2.resort_name from ski_sessions s2
         where s2.user_id = p.id and s2.session_date between v_from and v_to
         group by s2.resort_name order by count(*) desc limit 1)
      from profiles p
      inner join ski_sessions s on s.user_id = p.id and s.session_date between v_from and v_to
      group by p.id, p.full_name, p.username, p.avatar_url, p.skill_level;
  else
    return query
      select p.id, p.full_name, p.username, p.avatar_url, p.skill_level,
        count(s.id)::bigint,
        count(distinct s.resort_name)::bigint,
        count(s.id) filter (where s.is_powder_day)::bigint,
        coalesce(sum(s.vertical_feet), 0)::bigint,
        coalesce(sum(s.miles_skied), 0)::numeric,
        (select s2.resort_name from ski_sessions s2
         where s2.user_id = p.id and s2.session_date between v_from and v_to
         group by s2.resort_name order by count(*) desc limit 1)
      from profiles p
      left join ski_sessions s on s.user_id = p.id and s.session_date between v_from and v_to
      where p.id = auth.uid()
         or exists (select 1 from friend_requests fr
                     where fr.status = 'accepted'
                       and ((fr.requester_id = auth.uid() and fr.recipient_id = p.id)
                         or (fr.recipient_id = auth.uid() and fr.requester_id = p.id)))
      group by p.id, p.full_name, p.username, p.avatar_url, p.skill_level;
  end if;
end;
$$;

grant execute on function public.get_leaderboard(int, text) to authenticated;
```

**`ski_sessions` columns this sprint adds aggregation over** (added by sprint-3's `migrations/010_ski_runs.sql`, assume present): `runs_logged INT`, `lifts_ridden INT`, `longest_run_ft INT`, `time_on_mountain_min INT`. Also `top_speed_mph` — note this column **already exists** in the original `ski_sessions` schema (a pre-existing, currently-unused Strava field), so `MAX(s.top_speed_mph)` works regardless of whether sprint-3 re-adds it (its `ADD COLUMN IF NOT EXISTS` is a safe no-op for this one column).

**`src/lib/leaderboardApi.js` (233 lines) — exact current mapped row shape, constructed in TWO places (both need the same new fields added):**
- `fetchLeaderboard(startYear, mode)` (internal, not exported, L149-174) — the raw-row-to-JS-object mapping.
- `getLeaderboard(startYear)` (exported, L176-229) — friends-mode wrapper, does its own equivalent mapping (L215-228) plus friend-backfill logic for 0-day friends.

Both currently map to: `{ id, full_name, username, avatar_url, skill_level, isMe, days, resorts, powderDays, verticalFt, milesSki, topResort }`. You are adding 5 new fields to both mapping sites: `topSpeed`, `longestRun`, `totalRuns`, `totalLifts`, `timeOnMountain`.

---

## Tasks

S12-T1 (SQL migration) must land and be run against Supabase before S12-T2 (JS mapping) can be verified end-to-end, but you can write both in the same pass.

---

### S12-T1 — Write `migrations/011_leaderboard_rpc_v2.sql`

**File to create:** `migrations/011_leaderboard_rpc_v2.sql`

```sql
-- Migration 011: Leaderboard RPC v2 — add speed, longest run, runs, lifts, time-on-mountain
-- Run in Supabase SQL Editor. Depends on migrations/010_ski_runs.sql having been run first
-- (adds runs_logged, lifts_ridden, longest_run_ft, time_on_mountain_min to ski_sessions).

create or replace function public.get_leaderboard(
  p_start_year int,
  p_mode       text default 'friends'
)
returns table (
  id uuid, full_name text, username text, avatar_url text, skill_level text,
  days bigint, resorts bigint, powder_days bigint, vertical_ft bigint,
  miles_ski numeric, top_resort text,
  top_speed_mph numeric, longest_run_ft int, total_runs bigint,
  total_lifts bigint, time_on_mountain_min bigint
)
language plpgsql security definer set search_path = public
as $$
declare
  v_from date := (p_start_year || '-10-01')::date;
  v_to   date := ((p_start_year + 1) || '-05-31')::date;
begin
  if p_mode = 'public' then
    return query
      select p.id, p.full_name, p.username, p.avatar_url, p.skill_level,
        count(s.id)::bigint,
        count(distinct s.resort_name)::bigint,
        count(s.id) filter (where s.is_powder_day)::bigint,
        coalesce(sum(s.vertical_feet), 0)::bigint,
        coalesce(sum(s.miles_skied), 0)::numeric,
        (select s2.resort_name from ski_sessions s2
         where s2.user_id = p.id and s2.session_date between v_from and v_to
         group by s2.resort_name order by count(*) desc limit 1),
        max(s.top_speed_mph),
        max(s.longest_run_ft),
        coalesce(sum(s.runs_logged), 0)::bigint,
        coalesce(sum(s.lifts_ridden), 0)::bigint,
        coalesce(sum(s.time_on_mountain_min), 0)::bigint
      from profiles p
      inner join ski_sessions s on s.user_id = p.id and s.session_date between v_from and v_to
      group by p.id, p.full_name, p.username, p.avatar_url, p.skill_level;
  else
    return query
      select p.id, p.full_name, p.username, p.avatar_url, p.skill_level,
        count(s.id)::bigint,
        count(distinct s.resort_name)::bigint,
        count(s.id) filter (where s.is_powder_day)::bigint,
        coalesce(sum(s.vertical_feet), 0)::bigint,
        coalesce(sum(s.miles_skied), 0)::numeric,
        (select s2.resort_name from ski_sessions s2
         where s2.user_id = p.id and s2.session_date between v_from and v_to
         group by s2.resort_name order by count(*) desc limit 1),
        max(s.top_speed_mph),
        max(s.longest_run_ft),
        coalesce(sum(s.runs_logged), 0)::bigint,
        coalesce(sum(s.lifts_ridden), 0)::bigint,
        coalesce(sum(s.time_on_mountain_min), 0)::bigint
      from profiles p
      left join ski_sessions s on s.user_id = p.id and s.session_date between v_from and v_to
      where p.id = auth.uid()
         or exists (select 1 from friend_requests fr
                     where fr.status = 'accepted'
                       and ((fr.requester_id = auth.uid() and fr.recipient_id = p.id)
                         or (fr.recipient_id = auth.uid() and fr.requester_id = p.id)))
      group by p.id, p.full_name, p.username, p.avatar_url, p.skill_level;
  end if;
end;
$$;

grant execute on function public.get_leaderboard(int, text) to authenticated;
```

Note: `max(s.top_speed_mph)`/`max(s.longest_run_ft)` on an all-null group (a friend with zero sessions this season, in friends-mode's `left join`) returns SQL `NULL`, not `0` — this is intentional (distinguishes "never recorded a top speed" from "recorded a 0 mph top speed"). `leaderboardApi.js` must handle `null` for these two fields in S12-T2, unlike the `coalesce(...,0)` fields which are never null.

**Do not run this migration yourself** — per this repo's established convention (see sprint-1's S1-T1), migrations are written and reviewed, then run manually against Supabase by the project owner.

**Acceptance criteria:**
- `migrations/011_leaderboard_rpc_v2.sql` exists, `create or replace function public.get_leaderboard(int, text)` with the exact 16-column return signature above (11 existing + 5 new).
- No existing column was removed, renamed, or reordered before the 5 new ones (JS code indexes by field name, not position, but keep this discipline anyway for readability).

---

### S12-T2 — Update `src/lib/leaderboardApi.js` mapping

**File to modify:** `src/lib/leaderboardApi.js`

In both `fetchLeaderboard` (the raw-to-JS mapping around L160-173) and `getLeaderboard` (the equivalent block around L215-228), add the 5 new fields to the returned object, reading from the RPC's new snake_case columns:

```js
topSpeed: row.top_speed_mph,          // number | null
longestRun: row.longest_run_ft,       // number | null
totalRuns: row.total_runs,            // number (never null — RPC coalesces to 0)
totalLifts: row.total_lifts,          // number (never null)
timeOnMountain: row.time_on_mountain_min, // number (never null)
```

Read the actual surrounding object-literal syntax in both locations before editing (variable name for the raw row may differ between the two call sites) and add these 5 lines to each, matching the existing field style (no trailing type comments in the real file — the comments above are for you, not for the committed code, unless the file already uses inline comments elsewhere, in which case match that convention).

**Acceptance criteria:**
- Both `fetchLeaderboard` and `getLeaderboard` return objects with all 5 new fields.
- `topSpeed` and `longestRun` can be `null`; the other 3 are always a number (0 or greater).

**Verify against a live Supabase instance:**
```bash
node -e "
import('./src/lib/leaderboardApi.js').then(async (m) => {
  // adapt this to however the project runs ad-hoc scripts against Supabase locally —
  // check if there's an existing pattern (e.g. a .env.local with VITE_SUPABASE_URL) —
  // otherwise verify via the browser (see below) instead of a standalone script.
})
"
```
If there's no existing convention for standalone Node scripts against this Supabase project (there likely isn't — this app's data layer is client-side only), skip the script and verify via the browser instead: run `npm run dev`, open the Social tab's leaderboard, and inspect the network tab for the `get_leaderboard` RPC call's response — confirm the 5 new fields are present in the JSON payload.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add migrations/011_leaderboard_rpc_v2.sql src/lib/leaderboardApi.js
git commit -m "feat: extend get_leaderboard RPC with speed, longest run, runs, lifts, time-on-mountain"
```

---

## Sprint Acceptance Criteria

- [ ] `migrations/011_leaderboard_rpc_v2.sql` exists with the documented `CREATE OR REPLACE FUNCTION` (16 return columns)
- [ ] Migration has been run against Supabase (manually, by the project owner — not by the implementing agent)
- [ ] `leaderboardApi.js`'s `fetchLeaderboard` and `getLeaderboard` both map the 5 new RPC fields onto their returned objects
- [ ] `npm run build` succeeds
- [ ] Verified via browser network inspection that the RPC response includes the new fields after the migration is applied

## Out of Scope for This Sprint

- Rendering the new fields anywhere in the UI — that's sprint-16 (8-stat leaderboard expansion), which depends on this sprint.
- Any change to `getPublicLeaderboard`'s call signature (it stays a thin wrapper over `fetchLeaderboard(startYear, "public")`, unchanged).
- Backfilling historical `top_speed_mph`/`longest_run_ft`/etc. for existing `ski_sessions` rows — those columns are simply `NULL`/`0` for pre-existing sessions until users log new sessions with the richer data (sprint-13).
</content>
