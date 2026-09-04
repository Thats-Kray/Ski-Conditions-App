# Crew Tab — Friends Sub-Tab Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut `FriendsPage.jsx` down to the mockup's three-block Friends screen (search / Requests / Friends), deleting six superseded sections plus the page's dead internal routing, and add the one new server-side query (`get_mutual_friend_count`) the mockup's request subtitle needs.

**Architecture:** One new `SECURITY DEFINER STABLE` Postgres function (migration `047`) computes the mutual-friend intersection server-side, because `friend_requests`' SELECT policy is caller-scoped and a client cannot read another user's friend list. One new pure helper module (`src/lib/friendSubtitle.js`) holds the subtitle/pluralisation formatting so it is reachable by `node --test`. Everything else is deletion and restyling inside the single existing `FriendsPage.jsx`.

**Tech Stack:** React 19 (function components, hooks, inline `style={{}}` objects), Supabase JS v2, Postgres RLS + `SECURITY DEFINER` helpers, `node --test` over `src/lib` only, Vite 7, ESLint 9.

---

## Verified against the live codebase and live database (2026-09-03)

Every claim below was checked before this plan was written. Where a check contradicted
the spec's prose, this plan follows the check and says so.

| # | Claim | Verified result |
|---|---|---|
| 1 | `friend_requests` SELECT policy is caller-scoped | **CONFIRMED.** `pg_policies` on project `hkzaohqrycwfgmcogwdo` returns `friend_requests_select_own` / SELECT / `((auth.uid() = requester_id) OR (auth.uid() = recipient_id))`. It is **not** `USING (true)`. **There is no pre-existing RLS hole on this table, so migration 047 changes no policy.** |
| 2 | `are_friends(p_other UUID)` exists, one arg, `SECURITY DEFINER STABLE` | **CONFIRMED.** `migrations/032_daily_plans_visibility_fix.sql:61-70`; `pg_proc` shows `pronargs=1, prosecdef=true, provolatile='s'`. |
| 3 | `get_mutual_friend_count` already exists | **NO.** Absent from `pg_proc`. `046` is the last migration on disk; `047` is free. |
| 4 | `getAcceptedFriends()` selects `favorite_mountain`/`skill_level` | **NO.** `src/lib/socialApi.js:1578` selects only `id, first_name, last_name, full_name, username, avatar_url`. Both columns must be added. |
| 5 | `profiles.favorite_mountain` and `profiles.skill_level` exist | **CONFIRMED.** Both `text`, per `information_schema.columns`. |
| 6 | `skill_level` holds a display label | **NO — it holds a key.** Values are `green`/`blue`/`black`/`double_black`/`experts_only` (`ProfilePage.jsx:31-37`). The mockup's "Winter Park · Expert" therefore needs a key→label map. `DirectMessageView.jsx:15-21` already has one; this plan lifts it into `src/lib/` rather than adding a third copy. |
| 7 | Live data density for the new subtitle | **1 of 6 profiles has `skill_level`; 4 of 6 have `favorite_mountain`.** So today the subtitle usually renders as the mountain alone, and sometimes as neither. Graceful degradation is a requirement, not an edge case. |
| 8 | `DateMatchmakerComposer({ friends, onClose, onCreated })` | **CONFIRMED** unchanged at `src/components/DateMatchmaker.jsx:23`. `DatePollCard` at `:236`. |
| 9 | `Avatar({ profile, size = 32 })`, hash-based `COLORS[name.length % COLORS.length]` | **CONFIRMED** unchanged, `src/components/ui/Avatar.jsx`. |
| 10 | `FriendsPage.jsx` has exactly one caller | **CONFIRMED.** `MessagingCenter.jsx:197` — `<FriendsPage hideTabBar initialSection="friends" onMessageFriend={handleMessageFriend} />`. No other `.jsx`/`.js` reference exists. |
| 11 | `npm test` runs `node --test src/lib/*.test.js`; no DOM harness | **CONFIRMED** (`package.json` scripts). Baseline on `main`: **207 tests, 207 pass, 0 fail.** |
| 12 | An existing `src/lib` test mocks `supabase.rpc` | **NO — and one is impossible.** No `src/lib/*.test.js` references `rpc`, there is no `socialApi.test.js`, and `node -e "import('./src/lib/socialApi.js')"` fails with `Cannot find module '/…/src/lib/supabase'` (extensionless import, plus `src/lib/supabase.js` throws on missing `import.meta.env` under plain Node). **`socialApi.js` is not importable by `node --test` at all.** See "Deviation 1" below. |

### Deviation 1 (from the spec's Testing section) — where the new unit test lives

The spec asks for a unit test on the `getMutualFriendCount` wrapper "with a mocked Supabase
client (matching the existing test patterns in `socialApi.test.js`-equivalent files)".
**No such file exists and none can**, per finding 12. Every one of the repo's 13
`src/lib/*.test.js` files tests a **pure module with no Supabase import** —
`skiBuddyOptions.js`, `activityComments.js`, `skiDayDetails.js`, `crewColors.js` and the
rest are exactly this shape: the Supabase call stays in `socialApi.js`, and the logic
worth asserting is extracted next door and tested directly.

This plan follows that established convention instead of inventing a mocking harness:
Task 2 creates `src/lib/friendSubtitle.js` (pure; fully tested, including the count
normalisation the RPC wrapper delegates to), and Task 3's thin `socialApi.js` wrapper is
three lines that call `supabase.rpc` and hand the result to the tested helper. Adding
Vitest or a `--experimental-loader` mock to cover those three lines is explicitly out of
scope — no new dependency is introduced by this slice.

### Deviation 2 — the RPC's parameter name

The spec names the signature `get_mutual_friend_count(other_user_id uuid)`. This plan uses
that name verbatim. Note that it departs from the repo's `p_`-prefix convention
(`are_friends(p_other)`, `owns_ski_session(p_session_id)`, `approve_trip_request(p_invite_id)`).
It is safe here — `friend_requests` has no column named `other_user_id`, so there is no
ambiguity for the parser to resolve the wrong way — and it is what the client will send as
the JSON key. **If Kyle prefers convention over the spec's literal signature, it is a
rename in exactly two places: the migration body and the `supabase.rpc` argument object in
Task 3.** Flag it at review; do not change it unilaterally mid-execution.

### Deviation 3 — 32x32 tap targets

The mockup's accept/decline/message buttons are `width:32px;height:32px`. This codebase
otherwise uses `minHeight: 44`/`48` for every tap target in this file. The spec confirms
32x32, so this plan ships 32x32 to match the mockup. **Call it out in Kyle's click-through:
if the accept/decline buttons are hard to hit on a real phone, bumping to 36-40px is a
one-line change per button.**

---

## Global Constraints

- **No new npm dependency.** `package.json` is not modified by this slice.
- **No new test framework.** `npm test` stays `node --test src/lib/*.test.js`. Component/DOM tests are not introduced.
- **Only `src/lib/*.js` is unit-testable.** Anything importing `./supabase` cannot be imported by `node --test`.
- **Styling is inline `style={{}}` objects.** Semantic/stateful colours use `var(--color-*)` / `var(--gradient-*)` tokens, never raw hex — the app ships 5 themes (`src/index.css:157-236`) and a hardcoded accent breaks 4 of them.
- **Mockup colour mapping (the mockup is drawn in the default "Blizzard" theme, so its literals ARE the tokens):**
  - `#38bdf8` → `var(--color-accent)` (`src/index.css:33`)
  - `#04080f` → `var(--color-bg)` (`:26`)
  - `rgba(125,211,252,0.45)` → `var(--color-text-3)` (`:40`); the mockup's `0.5`/`0.55` variants also use `var(--color-text-3)`
  - `#e0f2fe` → `var(--color-text-1)` (`:38`)
  - `linear-gradient(135deg,#0284c7,#38bdf8)` → `var(--gradient-primary)` (`:46`)
  - `rgba(56,189,248,0.1)` / `rgba(56,189,248,0.25)` / `rgba(255,255,255,0.03)` / `rgba(255,255,255,0.08)` / `rgba(255,255,255,0.14)` stay as literals — they are neutral/alpha scrims already used verbatim throughout this file and its neighbours.
- **Migration numbering:** `047`, applied via the Supabase MCP `apply_migration` tool against project `hkzaohqrycwfgmcogwdo`, and **verified against live data before it is applied** (Task 1).
- **Migration comment discipline:** migrations in this repo explain WHY, name the specific bug or reproduction they prevent, cite file:line for anything they lean on, and carry a ROLLBACK block. See `042`, `045`, `046`.
- **Assert the success case.** Per the migration-041 lesson, migration verification must prove the function returns the *right number* for real friend pairs, not merely that unauthorised reads are denied.
- **No presence/online tracking.** Backlogged per spec decision 2. No online dot, no status column, and nothing that reads as one.
- **`FriendsPage.jsx` keeps exactly one caller** (`MessagingCenter.jsx:197`) and must keep rendering there after every task.
- **Commit after every task.** Branch off `main` first; do not commit to `main`.

---

## File Structure

**Created:**
- `migrations/047_mutual_friend_count.sql` — the one new Postgres function. No policy changes.
- `src/lib/friendSubtitle.js` — pure formatting: skill-key→label map, friend-row subtitle, mutual-count phrasing, RPC-count normalisation. No Supabase import, so `node --test` can reach it.
- `src/lib/friendSubtitle.test.js` — its tests.

**Modified:**
- `src/lib/socialApi.js` — add `getMutualFriendCount()`; add two columns to `getAcceptedFriends()`'s profile select (`:1578`).
- `src/components/FriendsPage.jsx` — the whole slice: ~450 lines deleted, the remainder restyled.

- `src/components/MessagingCenter.jsx:197` — drop the two now-nonexistent props from the single `<FriendsPage>` call site (Task 4).

**Not modified:** `Avatar.jsx`, `DateMatchmaker.jsx`, `SkiPingModal.jsx`, `package.json`.

---

## Task 0: Branch

- [ ] **Step 1: Confirm a clean baseline**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
git status --short
npm test 2>&1 | tail -6
```

Expected: no modified tracked files (untracked `mockups/` and `Mockup POWDERDAYS-DESIGN-SYSTEM.md` are fine and pre-existing), and `pass 207 / fail 0`. If the pass count differs from 207, stop and report — the baseline moved.

- [ ] **Step 2: Branch off main**

```bash
git checkout -b crew-tab-friends-slice
git branch --show-current
```

Expected: `crew-tab-friends-slice`.

---

## Task 1: Migration 047 — `get_mutual_friend_count()`

**Files:**
- Create: `migrations/047_mutual_friend_count.sql`
- Apply: Supabase MCP `apply_migration`, project `hkzaohqrycwfgmcogwdo`

**Interfaces:**
- Consumes: `public.friend_requests(requester_id, recipient_id, status)`; `auth.uid()`.
- Produces: `public.get_mutual_friend_count(other_user_id UUID) RETURNS INT`, `SECURITY DEFINER STABLE`, `EXECUTE` granted to `authenticated` only. Task 3's `socialApi.js` wrapper calls it as `supabase.rpc("get_mutual_friend_count", { other_user_id })`.

### Background the implementer needs

`friend_requests` is the table this app actually writes for friendships (`are_friends()`'s
own comment says so, `032:60-61`). Its live SELECT policy — re-verified on the production
project on 2026-09-03, before this plan was written — is:

```
friend_requests_select_own   SELECT   USING ((auth.uid() = requester_id) OR (auth.uid() = recipient_id))
```

That is **correct and stays exactly as it is.** This migration adds a function and changes
no policy. (The check mattered: this app has twice found a `USING (true)` behind a spec's
prose — `activity_feed_reactions` in `045`, seven `trip_*` tables in `042`. This table was
already right.)

Because the policy is caller-scoped, a client holding my session can never read the
requester's own friend edges, so the intersection must happen server-side under
`SECURITY DEFINER`.

`STABLE`, not the default `VOLATILE`, for the reason `032:52-57` documents: a VOLATILE
function cannot be inlined and is re-executed per candidate row.

- [ ] **Step 1: Write the migration file**

Create `migrations/047_mutual_friend_count.sql` with exactly this content:

```sql
-- Migration 047: mutual friend count for the Friends sub-tab's request rows
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS
--
-- The Crew tab's Friends sub-tab (ROADMAP.md TASK 22.0, the last slice of the 5-way
-- split) restyles each incoming friend request to the mockup's row, whose subtitle is a
-- mutual-friend count -- "3 mutual friends". The client cannot compute that number.
--
-- WHY THE CLIENT CANNOT COMPUTE IT
--
-- friend_requests' SELECT policy is caller-scoped, and was re-verified against the live
-- project on 2026-09-03 immediately before this migration was written:
--
--   friend_requests_select_own  SELECT  USING ((auth.uid() = requester_id)
--                                           OR (auth.uid() = recipient_id))
--
-- So a client session can only ever see MY OWN edges -- which is exactly why
-- getAcceptedFriends() (socialApi.js:1558-1562) works at all. The requester's own friend
-- list is invisible to me by design, and intersecting two friend lists in the browser
-- would need precisely the read that policy refuses.
--
-- That policy is CORRECT and this migration does not touch it. It was checked rather than
-- assumed because this app has twice found a USING (true) hiding behind a spec's prose:
-- activity_feed_reactions (045) and seven trip_* tables (042). This one was already right.
-- The only thing added here is the one server-side function that can do the intersection
-- without widening any read.
--
-- WHY SECURITY DEFINER STABLE, AND WHY IT IS SAFE
--
-- Same shape as are_friends() (032:61-70), can_see_activity() (045) and
-- can_see_ski_session() (046:105-115). SECURITY DEFINER so the two reads happen outside
-- the policy evaluator; STABLE so it inlines and is not re-executed per candidate row
-- (032:52-57).
--
-- The function is safe to expose despite reading rows the caller cannot SELECT, because
-- it returns ONE INTEGER and never a row, an id, or a name. A caller learns "you and this
-- person have 3 friends in common" -- which is what every social product shows on a friend
-- request -- and cannot learn WHICH three, nor enumerate anyone's friend list. It is
-- deliberately not a set-returning function for that reason: get_mutual_friends()
-- returning profiles would leak the friend graph this table's policy exists to protect.
--
-- WHY THE TWO <> EXCLUSIONS ARE THERE ANYWAY
--
-- friend_requests carries CHECK (requester_id <> recipient_id) (constraint
-- friend_requests_check, verified live), so no self-friendship row can exist, and neither
-- exclusion below can currently fire. They are kept as one line of defence-in-depth in
-- case that constraint is ever relaxed: without them, dropping the CHECK would silently
-- make every count off by one rather than fail. Documented as a deliberate no-op so a
-- future reader does not "simplify" them away without also checking the constraint.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--
-- No policy is created, altered or dropped. No table is created. No notification is
-- written. No bulk/batch variant is added -- the UI calls this once per incoming friend
-- request row, and request volume is inherently tiny (the whole production database has
-- 4 accepted friendships today), matching the N-small-calls pattern socialApi.js already
-- uses everywhere else rather than introducing a first array-argument RPC.
--
-- ROLLBACK, if anything breaks:
--   DROP FUNCTION IF EXISTS public.get_mutual_friend_count(UUID);
--   -- Nothing else to undo: this migration adds one function and touches nothing else.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_mutual_friend_count(other_user_id UUID)
RETURNS INT
LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COUNT(*)::int
  FROM (
    SELECT CASE WHEN fr.requester_id = auth.uid()
                THEN fr.recipient_id ELSE fr.requester_id END AS friend_id
      FROM friend_requests fr
     WHERE fr.status = 'accepted'
       AND (fr.requester_id = auth.uid() OR fr.recipient_id = auth.uid())
  ) mine
  JOIN (
    SELECT CASE WHEN fr.requester_id = other_user_id
                THEN fr.recipient_id ELSE fr.requester_id END AS friend_id
      FROM friend_requests fr
     WHERE fr.status = 'accepted'
       AND (fr.requester_id = other_user_id OR fr.recipient_id = other_user_id)
  ) theirs
    ON theirs.friend_id = mine.friend_id
  WHERE mine.friend_id <> auth.uid()
    AND mine.friend_id <> other_user_id;
$$;

-- Not optional. A SECURITY DEFINER function is executable by PUBLIC by default, which
-- would hand the anon role a friend-graph oracle. Same two lines as 032:87-88 and
-- 046:102-103.
REVOKE ALL ON FUNCTION public.get_mutual_friend_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mutual_friend_count(UUID) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Verify the file is syntactically what you meant**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
grep -c "" migrations/047_mutual_friend_count.sql
grep -n "SECURITY DEFINER STABLE\|REVOKE ALL\|GRANT EXECUTE\|BEGIN;\|COMMIT;" migrations/047_mutual_friend_count.sql
```

Expected: one `SECURITY DEFINER STABLE`, one `REVOKE ALL`, one `GRANT EXECUTE`, one `BEGIN;`, one `COMMIT;`.

- [ ] **Step 3: Prove the expected answers from live data BEFORE creating anything**

This is the "assert the success case" step (the migration-041 lesson). Run this
**read-only** query with the Supabase MCP `execute_sql` tool, project `hkzaohqrycwfgmcogwdo`:

```sql
with edges as (
  select requester_id as a, recipient_id as b from friend_requests where status='accepted'
  union
  select recipient_id, requester_id from friend_requests where status='accepted'
)
select e1.a as user_a, e2.a as user_b, count(*) as expected_mutual
from edges e1 join edges e2 on e1.b = e2.b and e1.a <> e2.a
where e1.b <> e1.a and e1.b <> e2.a
group by e1.a, e2.a
order by user_a, user_b;
```

As of 2026-09-03 the production friend graph is exactly four accepted edges:

```
D = db7fe685-68e2-4420-a6c5-d254b0e4fa26   (no username set)
S = 3fc059fa-2034-402e-881d-e92329e70c1b   (stumpswithsteez, Winter Park)
A = 31e0eece-9175-4c0f-bacf-48024588c837   (Dog_on_skis, Breckenridge)
E = 93d9e5e3-1971-4cf6-9493-3751704b14a7   (Edge queen, Vail)

edges:  A-D,  S-A,  E-D,  D-S
so:     D's friends = {A, E, S}   S's friends = {A, D}
        A's friends = {D, S}      E's friends = {D}

expected mutual counts:
        D vs S = |{A,E,S} n {A,D}| = 1     (A)
        D vs A = |{A,E,S} n {D,S}| = 1     (S)
        D vs E = |{A,E,S} n {D}|   = 0     (D is excluded as the caller)
        S vs E = |{A,D}   n {D}|   = 1     (D)
        D vs D = |{A,E,S} n {A,E,S}| = 3   (your own friend count -- correct by
                                            construction; the UI never calls it with
                                            your own id, since you cannot friend-request
                                            yourself)
```

**If the query above returns a different graph, the data has changed since planning.** Do
not skip the step — recompute the four expected numbers from whatever it returns and use
those in Step 5. The point is that Step 5 asserts specific non-zero counts derived from
real rows, never just "it didn't error".

- [ ] **Step 4: Apply the migration**

Use the Supabase MCP `apply_migration` tool:
- `project_id`: `hkzaohqrycwfgmcogwdo`
- `name`: `mutual_friend_count`
- `query`: the full SQL body from Step 1 (everything from `BEGIN;` through `COMMIT;`; the leading `--` comment block may be included, it is valid SQL)

- [ ] **Step 5: Verify the live function returns the RIGHT NUMBERS**

`execute_sql` runs as a privileged role where `auth.uid()` is NULL, so the caller must be
simulated. `set_config('request.jwt.claims', …, true)` is transaction-local and the MCP
tool wraps each call in its own transaction, so **the `set_config` and the assertions must
be in one single statement** — this technique was confirmed working against this project
during planning (`auth.uid()` echoed the injected sub, and `are_friends()` returned true
for a known pair).

Run, as ONE `execute_sql` call:

```sql
select
  set_config('request.jwt.claims',
             '{"sub":"db7fe685-68e2-4420-a6c5-d254b0e4fa26","role":"authenticated"}',
             true) is not null                                                  as ctx_set,
  auth.uid()                                                                    as acting_as,
  public.get_mutual_friend_count('3fc059fa-2034-402e-881d-e92329e70c1b') as d_vs_s,
  public.get_mutual_friend_count('31e0eece-9175-4c0f-bacf-48024588c837') as d_vs_a,
  public.get_mutual_friend_count('93d9e5e3-1971-4cf6-9493-3751704b14a7') as d_vs_e,
  public.get_mutual_friend_count('db7fe685-68e2-4420-a6c5-d254b0e4fa26') as d_vs_self;
```

Expected: `ctx_set = true`, `acting_as = db7fe685-…`, **`d_vs_s = 1`, `d_vs_a = 1`,
`d_vs_e = 0`, `d_vs_self = 3`.**

`d_vs_e = 0` is the important one: it is the case where the *other* user's only friend is
the caller. A naive intersection that forgot `mine.friend_id <> auth.uid()` would still
report 0 here today, but a `d_vs_e` of 1 would mean the CASE-expression flip is inverted —
so it is a real correctness signal, not decoration.

- [ ] **Step 6: Verify the count follows the CALLER, not just the argument**

A function that ignored `auth.uid()` would pass Step 5 by coincidence. Run, as one
`execute_sql` call, the same question from a different seat:

```sql
select
  set_config('request.jwt.claims',
             '{"sub":"3fc059fa-2034-402e-881d-e92329e70c1b","role":"authenticated"}',
             true) is not null                                                  as ctx_set,
  auth.uid()                                                                    as acting_as,
  public.get_mutual_friend_count('93d9e5e3-1971-4cf6-9493-3751704b14a7') as s_vs_e,
  public.get_mutual_friend_count('db7fe685-68e2-4420-a6c5-d254b0e4fa26') as s_vs_d;
```

Expected: `acting_as = 3fc059fa-…`, **`s_vs_e = 1`** (they share D) and **`s_vs_d = 1`**
(they share A). Note `s_vs_e = 1` while Step 5's `d_vs_e = 0` for the *same second
argument* — that difference is the proof the function is caller-relative.

- [ ] **Step 7: Verify the anonymous caller learns nothing**

```sql
select
  set_config('request.jwt.claims', '', true) is not null as ctx_cleared,
  auth.uid()                                             as acting_as,
  public.get_mutual_friend_count('db7fe685-68e2-4420-a6c5-d254b0e4fa26') as anon_result;
```

Expected: `acting_as` is NULL and `anon_result = 0` — with no `auth.uid()`, the `mine`
subquery is empty, so the join yields nothing. (The `REVOKE ALL FROM PUBLIC` is the real
guard; this confirms the body degrades safely even so.)

- [ ] **Step 8: Verify the grants landed**

```sql
select p.proname, p.prosecdef, p.provolatile,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed_can_exec,
       has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_can_exec
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname = 'get_mutual_friend_count';
```

Expected exactly one row: `prosecdef = true`, `provolatile = 's'`, **`authed_can_exec = true`, `anon_can_exec = false`.** If `anon_can_exec` is true, the `REVOKE` did not run — stop and fix before continuing.

- [ ] **Step 9: Reload the PostgREST schema cache**

Without this, `supabase.rpc("get_mutual_friend_count", …)` returns `PGRST202 Could not find the function` from the client even though it exists. Run as `execute_sql`:

```sql
notify pgrst, 'reload schema';
```

- [ ] **Step 10: Check the security advisors did not regress**

Use the Supabase MCP `get_advisors` tool with `project_id: hkzaohqrycwfgmcogwdo`, `type: security`. Expected: no **new** finding naming `get_mutual_friend_count`. Pre-existing findings unrelated to this function are out of scope for this slice — note them, do not fix them here.

- [ ] **Step 11: Commit**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
git add migrations/047_mutual_friend_count.sql
git commit -m "feat(db): migration 047 — get_mutual_friend_count() RPC

friend_requests' SELECT policy is caller-scoped (re-verified live), so the
mutual-friend count on a friend-request row cannot be computed client-side.
Adds one SECURITY DEFINER STABLE function that returns only an integer.
No policy is changed. Verified against production data before applying:
D/S=1, D/A=1, D/E=0, and caller-relativity confirmed from a second seat."
```

---

## Task 2: `src/lib/friendSubtitle.js` — the pure formatting helpers

**Files:**
- Create: `src/lib/friendSubtitle.js`
- Test: `src/lib/friendSubtitle.test.js`

**Interfaces:**
- Consumes: nothing. **This module must not import anything** — that is the whole point (see Deviation 1: any module reaching `./supabase` cannot be loaded by `node --test`).
- Produces, all named exports:
  - `SKILL_LABELS: Record<string, string>` — the five `profiles.skill_level` keys → display labels.
  - `skillLabel(key: string | null | undefined): string | null`
  - `formatFriendSubtitle(profile: object | null | undefined): string` — `""` when there is nothing to say.
  - `formatMutualFriends(count: unknown): string | null` — `null` when there is nothing to say.
  - `normalizeMutualCount(value: unknown): number` — used by Task 3's RPC wrapper.

### Background the implementer needs

`profiles.skill_level` stores a **key**, not a label: `green`, `blue`, `black`,
`double_black`, `experts_only` (`src/components/ProfilePage.jsx:31-37`). Rendering it raw
would put "double_black" in the UI. A key→label map already exists at
`src/components/DirectMessageView.jsx:15-21`; this task lifts those exact strings into
`src/lib/` so there is one copy in a testable place rather than a third copy in
`FriendsPage.jsx`. **Do not invent new labels** — "Black Diamond" and "Experts Only" are
the strings already shown elsewhere in the app, and two spellings of the same skill level
in two screens is a real inconsistency.

Live data as of 2026-09-03: of 6 profiles, **1 has `skill_level` and 4 have
`favorite_mountain`**. The all-null and mountain-only branches are the common cases today,
not exotic ones.

- [ ] **Step 1: Write the failing test**

Create `src/lib/friendSubtitle.test.js`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  SKILL_LABELS,
  skillLabel,
  formatFriendSubtitle,
  formatMutualFriends,
  normalizeMutualCount,
} from "./friendSubtitle.js"

// ── skillLabel ──────────────────────────────────────────────────────────────
// profiles.skill_level stores a KEY ("double_black"), never a label. Rendering the
// raw column is the bug this map exists to prevent.

test("skillLabel maps every stored key to a human label", () => {
  assert.equal(skillLabel("green"), "Green")
  assert.equal(skillLabel("blue"), "Blue")
  assert.equal(skillLabel("black"), "Black Diamond")
  assert.equal(skillLabel("double_black"), "Double Black")
  assert.equal(skillLabel("experts_only"), "Experts Only")
})

test("skillLabel returns null for null, undefined, empty and unknown keys", () => {
  // 5 of 6 live profiles have skill_level NULL, so this is the common path.
  assert.equal(skillLabel(null), null)
  assert.equal(skillLabel(undefined), null)
  assert.equal(skillLabel(""), null)
  assert.equal(skillLabel("expert"), null)
})

test("SKILL_LABELS covers exactly the five keys ProfilePage can write", () => {
  // If ProfilePage.jsx:31-37 gains a sixth option, this fails and points at the map
  // that needs updating -- rather than silently dropping the new level from the row.
  assert.deepEqual(
    Object.keys(SKILL_LABELS).sort(),
    ["black", "blue", "double_black", "experts_only", "green"],
  )
})

// ── formatFriendSubtitle ────────────────────────────────────────────────────

test("formatFriendSubtitle joins mountain and skill with a middot", () => {
  assert.equal(
    formatFriendSubtitle({ favorite_mountain: "Winter Park", skill_level: "experts_only" }),
    "Winter Park · Experts Only",
  )
})

test("formatFriendSubtitle drops the missing half instead of leaving a dangling separator", () => {
  assert.equal(formatFriendSubtitle({ favorite_mountain: "Vail", skill_level: null }), "Vail")
  assert.equal(
    formatFriendSubtitle({ favorite_mountain: null, skill_level: "double_black" }),
    "Double Black",
  )
})

test("formatFriendSubtitle falls back to @username when neither field is set", () => {
  // The live majority case: 2 of 6 profiles have no favorite_mountain.
  assert.equal(formatFriendSubtitle({ username: "stumpswithsteez" }), "@stumpswithsteez")
})

test("formatFriendSubtitle returns an empty string when there is nothing at all to say", () => {
  assert.equal(formatFriendSubtitle({}), "")
  assert.equal(formatFriendSubtitle(null), "")
  assert.equal(formatFriendSubtitle(undefined), "")
})

test("formatFriendSubtitle ignores whitespace-only values", () => {
  // A profile saved with a spacebar in the mountain field must not render " · Blue".
  assert.equal(
    formatFriendSubtitle({ favorite_mountain: "   ", skill_level: "blue" }),
    "Blue",
  )
  assert.equal(formatFriendSubtitle({ favorite_mountain: "  ", username: "  " }), "")
})

test("formatFriendSubtitle trims surrounding whitespace on the mountain", () => {
  assert.equal(
    formatFriendSubtitle({ favorite_mountain: " Breckenridge ", skill_level: "green" }),
    "Breckenridge · Green",
  )
})

// ── formatMutualFriends ─────────────────────────────────────────────────────

test("formatMutualFriends pluralises correctly", () => {
  assert.equal(formatMutualFriends(1), "1 mutual friend")
  assert.equal(formatMutualFriends(3), "3 mutual friends")
  assert.equal(formatMutualFriends(12), "12 mutual friends")
})

test("formatMutualFriends returns null for zero, so the row shows no subtitle at all", () => {
  // "0 mutual friends" is worse than nothing -- it draws the eye to an absence.
  assert.equal(formatMutualFriends(0), null)
})

test("formatMutualFriends returns null for a failed or not-yet-loaded count", () => {
  // The count is a decoration fetched per row; a failure must degrade to silence,
  // never to "NaN mutual friends".
  assert.equal(formatMutualFriends(null), null)
  assert.equal(formatMutualFriends(undefined), null)
  assert.equal(formatMutualFriends(NaN), null)
  assert.equal(formatMutualFriends("3"), null)
  assert.equal(formatMutualFriends(-1), null)
})

// ── normalizeMutualCount ────────────────────────────────────────────────────
// The RPC returns an INT, but PostgREST hands back JSON, and a wrapper that trusts
// it blindly is how "NaN mutual friends" reaches a screen.

test("normalizeMutualCount passes through a valid count", () => {
  assert.equal(normalizeMutualCount(0), 0)
  assert.equal(normalizeMutualCount(7), 7)
})

test("normalizeMutualCount coerces a numeric string, which is how PostgREST can return bigints", () => {
  assert.equal(normalizeMutualCount("4"), 4)
})

test("normalizeMutualCount returns 0 for null, undefined, garbage and negatives", () => {
  assert.equal(normalizeMutualCount(null), 0)
  assert.equal(normalizeMutualCount(undefined), 0)
  assert.equal(normalizeMutualCount("many"), 0)
  assert.equal(normalizeMutualCount({}), 0)
  assert.equal(normalizeMutualCount(-3), 0)
})

test("normalizeMutualCount floors a non-integer rather than rendering '2.5 mutual friends'", () => {
  assert.equal(normalizeMutualCount(2.5), 2)
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
node --test src/lib/friendSubtitle.test.js
```

Expected: FAIL — `Cannot find module '/…/src/lib/friendSubtitle.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/friendSubtitle.js`:

```js
/**
 * Formatting for the Crew tab's Friends sub-tab rows (TASK 22.0, Friends slice).
 *
 * This module imports NOTHING on purpose. `npm test` is `node --test src/lib/*.test.js`,
 * and anything that reaches `./supabase` cannot be loaded under plain Node --
 * src/lib/supabase.js reads `import.meta.env` and throws when it is undefined. Keeping
 * the formatting here (and the supabase call in socialApi.js) is the same split
 * skiBuddyOptions.js, activityComments.js and skiDayDetails.js already use, and it is
 * the only reason any of this is covered by a test at all.
 */

/**
 * profiles.skill_level stores a KEY, not a label. These five keys are the complete set
 * ProfilePage.jsx:31-37 and ProfileSetup.jsx can write, and these labels are the exact
 * strings DirectMessageView.jsx:15-21 already shows -- lifted here rather than copied a
 * third time, so the same skill level can never be spelled two ways in two screens.
 */
export const SKILL_LABELS = {
  green:        "Green",
  blue:         "Blue",
  black:        "Black Diamond",
  double_black: "Double Black",
  experts_only: "Experts Only",
}

/**
 * @param {string|null|undefined} key a profiles.skill_level value
 * @returns {string|null} the display label, or null for missing/unknown keys
 */
export function skillLabel(key) {
  if (typeof key !== "string") return null
  return SKILL_LABELS[key] || null
}

/** Trim, then treat whitespace-only as absent. A profile saved with a spacebar in the
 *  mountain field must not render " · Blue" with a dangling separator. */
function cleaned(value) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * The mockup's friend-row subtitle: `favorite_mountain · skill_level`.
 *
 * Live data (2026-09-03) has skill_level set on 1 of 6 profiles and favorite_mountain on
 * 4 of 6, so the partial and empty branches are the ordinary cases, not edge cases. When
 * neither is set we fall back to @username -- which is what the row showed before this
 * slice, so nobody loses information -- and to "" only when there is genuinely nothing,
 * at which point the caller should render no subtitle line at all.
 *
 * @param {{favorite_mountain?: string|null, skill_level?: string|null, username?: string|null}|null|undefined} profile
 * @returns {string} never null; "" means "render nothing"
 */
export function formatFriendSubtitle(profile) {
  const parts = [cleaned(profile?.favorite_mountain), skillLabel(profile?.skill_level)]
    .filter(Boolean)

  if (parts.length > 0) return parts.join(" · ")

  const username = cleaned(profile?.username)
  return username ? `@${username}` : ""
}

/**
 * The mockup's request-row subtitle.
 *
 * Returns null rather than "0 mutual friends" for a zero count: a row that announces an
 * absence is worse than a row that stays quiet. Also returns null for a count that never
 * arrived or failed to load, so a per-row fetch failure degrades to silence instead of
 * "NaN mutual friends".
 *
 * @param {unknown} count
 * @returns {string|null}
 */
export function formatMutualFriends(count) {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 1) return null
  return `${count} mutual friend${count === 1 ? "" : "s"}`
}

/**
 * Coerce whatever PostgREST hands back for the get_mutual_friend_count RPC into a
 * non-negative integer. The function is declared RETURNS INT, but the value arrives as
 * JSON, and a wrapper that trusts it blindly is exactly how "NaN mutual friends" gets on
 * screen. Negative and non-numeric inputs collapse to 0, which formatMutualFriends then
 * renders as no subtitle.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeMutualCount(value) {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
node --test src/lib/friendSubtitle.test.js
```

Expected: PASS, 0 fail.

- [ ] **Step 5: Run the whole suite and lint**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
npm test 2>&1 | tail -6
npx eslint src/lib/friendSubtitle.js src/lib/friendSubtitle.test.js
```

Expected: `pass 226 / fail 0` (207 baseline + 19 new), and eslint clean with no output.
If the total differs, count the `test(` blocks you actually wrote and reconcile — the
number matters less than `fail 0` and the new file being included.

- [ ] **Step 6: Commit**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
git add src/lib/friendSubtitle.js src/lib/friendSubtitle.test.js
git commit -m "feat: friendSubtitle helpers for the Friends sub-tab rows

skill_level stores a key ('double_black'), not a label, so the mockup's
'Mountain · Skill' subtitle needs the key->label map DirectMessageView
already had -- lifted into src/lib so it is testable and single-sourced.
Live data has skill_level on 1 of 6 profiles, so the partial/empty
branches are the common path and are covered."
```

---

## Task 3: `socialApi.js` — the RPC wrapper and the two missing columns

**Files:**
- Modify: `src/lib/socialApi.js` (import block at `:1-8`; `getAcceptedFriends()` at `:1551-1588`, specifically the profile select at `:1578`; new function appended after `getAcceptedFriends()` ends at `:1588`)

**Interfaces:**
- Consumes: `public.get_mutual_friend_count(other_user_id UUID)` from Task 1; `normalizeMutualCount` from Task 2.
- Produces:
  - `getMutualFriendCount(otherUserId: string): Promise<number>` — resolves to a non-negative integer; **rejects** on a Supabase error (the caller decides how to degrade).
  - `getAcceptedFriends(): Promise<Array<{id, first_name, last_name, full_name, username, avatar_url, favorite_mountain, skill_level}>>` — two properties wider than before.

### Background the implementer needs

`getAcceptedFriends()` currently selects six profile columns (`socialApi.js:1578`,
verified). The restyled friend row needs `favorite_mountain` and `skill_level` as well.
Adding columns here is safe: `profiles`' SELECT policy is `USING (true)` for
`authenticated` (verified live — a deliberate app design decision, "Users can view all
profiles", and out of scope for this slice), and **neither new column is one of the
revoked Strava token columns** that `PROFILE_WRITE_COLUMNS` at the top of this file exists
to protect. That constraint applies to `RETURNING` clauses on *writes*; this is a read.

`getFriendsLeaderboard()` (`:2658-2669`) already selects `favorite_mountain` from
`profiles` the same way, so this is an established pattern in this file, not a new one.

- [ ] **Step 1: Add the two columns to `getAcceptedFriends()`**

In `src/lib/socialApi.js`, find the profile select inside `getAcceptedFriends()` (line
1576-1579 as of this plan; re-grep if it has moved):

```js
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, full_name, username, avatar_url")
    .in("id", friendIds)
```

Replace the `.select(...)` line with:

```js
    // favorite_mountain + skill_level feed the Friends sub-tab row's subtitle
    // (formatFriendSubtitle in friendSubtitle.js). Neither is a revoked Strava token
    // column, and this is a read, so PROFILE_WRITE_COLUMNS does not apply.
    .select("id, first_name, last_name, full_name, username, avatar_url, favorite_mountain, skill_level")
```

- [ ] **Step 2: Add the `normalizeMutualCount` import**

At the top of `src/lib/socialApi.js`, the import block currently ends at line 7 with:

```js
import { nudgeCutoffDateKey, isSessionUntouched } from "./skiDayNudge";
```

Add immediately after it:

```js
import { normalizeMutualCount } from "./friendSubtitle";
```

- [ ] **Step 3: Add the RPC wrapper**

Insert immediately after `getAcceptedFriends()`'s closing brace (line 1588 as of this
plan) and **before** the `/* -----------------------------\n   Friends Leaderboard`
comment block at line 1590:

```js
/**
 * How many friends the signed-in user has in common with `otherUserId`.
 *
 * Goes through the get_mutual_friend_count RPC (migration 047) rather than intersecting
 * two friend lists here, because it CANNOT be done here: friend_requests' SELECT policy
 * is USING (auth.uid() = requester_id OR auth.uid() = recipient_id), so a browser session
 * can only ever read its own edges. The requester's own friend list is invisible by
 * design. The RPC is SECURITY DEFINER and returns only an integer -- never a row, an id
 * or a name -- so the friend graph itself stays unreadable.
 *
 * Called once per incoming friend-request row. That is deliberate: request volumes are
 * inherently tiny, and it matches the N-small-calls shape the rest of this file already
 * uses rather than introducing this file's first array-argument RPC.
 *
 * Throws on a Supabase error. The Friends page catches per row and renders no subtitle,
 * because a missing decoration must not blank a section -- see FriendsPage.jsx's own
 * loader comment for why silent swallows are otherwise avoided in this codebase.
 *
 * @param {string} otherUserId
 * @returns {Promise<number>} non-negative integer; 0 when there are none
 */
export async function getMutualFriendCount(otherUserId) {
  if (!otherUserId) return 0

  const { data, error } = await supabase.rpc("get_mutual_friend_count", {
    other_user_id: otherUserId,
  })

  if (error) throw error

  return normalizeMutualCount(data)
}
```

- [ ] **Step 4: Verify the edits landed where you meant**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
grep -n "favorite_mountain, skill_level" src/lib/socialApi.js
grep -n "normalizeMutualCount" src/lib/socialApi.js
grep -n "export async function getMutualFriendCount" src/lib/socialApi.js
```

Expected: the select line matches once; `normalizeMutualCount` appears twice (import + use); `getMutualFriendCount` is exported once.

- [ ] **Step 5: Lint and run the suite**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
npx eslint src/lib/socialApi.js
npm test 2>&1 | tail -6
```

Expected: eslint clean; `fail 0` with the same count as Task 2 Step 5 (this task adds no tests — `socialApi.js` is not importable under `node --test`, per Deviation 1).

- [ ] **Step 6: Verify the app still builds**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
npm run build 2>&1 | tail -8
```

Expected: `built in …`, no errors. This is the only automated check that the new
`friendSubtitle` import resolves from `socialApi.js` under Vite.

- [ ] **Step 7: Commit**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
git add src/lib/socialApi.js
git commit -m "feat: getMutualFriendCount() + favorite_mountain/skill_level on getAcceptedFriends

The mutual count must be an RPC: friend_requests' SELECT policy is
caller-scoped, so the intersection is impossible client-side. The two new
profile columns feed the restyled friend row's subtitle."
```

---

## Task 4: `FriendsPage.jsx` — delete the six superseded sections

**Files:**
- Modify: `src/components/FriendsPage.jsx` (currently 979 lines)

**Interfaces:**
- Consumes: nothing new.
- Produces: a `FriendsPage.jsx` whose `pageLoaders()` returns exactly six descriptors — `incoming`, `outgoing`, `friends`, `leaderboard`, `pings`, `datePolls` — and which no longer references `crew_invites`, `getMySkiPlans`, `getFriendsUpcomingTrips` or `getIncomingTripRequests`. Task 5 depends on this file having shrunk first.

### Why this task comes before the routing deletion

Deleting the dead `activeSection === "friends" &&` wrapper (Task 5) re-indents the entire
render body, which invalidates every line number below it. Doing the bulk deletions first
means Task 4 works against the line numbers verified in this plan, and Task 5 re-indents a
much smaller file exactly once.

### The full deletion list, with verified line numbers

Line numbers below are from `FriendsPage.jsx` at `main` (979 lines, verified 2026-09-03).
**Work top-to-bottom through the list in DESCENDING line order** so earlier deletions do
not shift later targets. Each entry also gives a unique anchor string — if a line number
does not match, `grep -n` the anchor instead of guessing.

| # | Lines | What | Anchor to grep |
|---|---|---|---|
| 1 | 960-966 | `showPingComposer` modal | `<SkiPingComposer` |
| 2 | 920-954 | §7 legacy crew-invites section | `7 ── Legacy crew invites` |
| 3 | 869-918 | §6 "My Ski Plans" section | `6 ── Upcoming Ski Plans` |
| 4 | 790-834 | the per-friend "Invite" button **and** the inline invite composer that follows it | `Inline invite composer` |
| 5 | 617-618 | §3 `<WeekendPlanner …>` render + its comment | `3 ── Friends' Ski Plans` |
| 6 | 601-602 | the **Ping Crew entry only** inside the §2 quick-action array | `label: "Ping Crew"` |
| 7 | 474-526 | the top-of-tab trip-join-request block + its comment | `People asking to join a trip I host` |
| 8 | 415 | `const hasLegacyInvites = …` | `hasLegacyInvites` |
| 9 | 411-412 | `upcomingPlans` / `pastPlans` memos | `const upcomingPlans` |
| 10 | 368-387 | `handleSendCrewInvite` + `handleRespondToCrewInvite` | `async function handleSendCrewInvite` |
| 11 | 270-274 | five loader descriptors: `crewInvites`, `tripRequests`, `sentInvites`, `skiPlans`, `friendsTrips` | `key: "crewInvites"` |
| 12 | 244-262 | `handleTripRequest` **and its own `/** … */` doc comment** (lines 244-249) | `async function handleTripRequest` |
| 13 | 198-202, 210-212, 218-219 | ten `useState` lines (listed in Step 3) | see Step 3 |
| 14 | 140-187 | `CrewInviteCard` component + its `── Crew Invite Card (legacy) ──` banner | `function CrewInviteCard` |
| 15 | 83-136 | `WeekendPlanner` component + its `── Weekend Planner ──` banner | `function WeekendPlanner` |
| 16 | 65-81 | `FriendAvatar` component | `function FriendAvatar` |
| 17 | 56-61 | `isPast()` helper | `function isPast` |
| 18 | 15-24, 29, 32 | nine `socialApi` imports, `SkiPingComposer`, `formatDate` | see Step 2 |

**Note on item 6:** only the `Ping Crew` object is removed from the quick-action array,
**not the whole strip.** The strip's second entry, `Pick a Date`, is the only trigger for
`DateMatchmakerComposer` anywhere in the app — Task 6 moves it into the `···` overflow
menu and deletes the strip then. Removing the strip here would leave the Date Matchmaker
unreachable across two tasks.

### Imports that must SURVIVE — check before deleting

Three imports look dead after these deletions but are not. Verified by grep:

- **`resortEmoji as getResortEmoji`** — also used by the friend row's `topResort` badge (`:776`), which this slice keeps.
- **`formatResortName` / `resortName`** — same, `:776`.
- **`PingCard`** — the Activity section (`:628`, `:633`) keeps it. Only `SkiPingComposer` goes from that import line.
- **`Avatar`** — used by the requests list (`:569`), search results (`:678`), friends list (`:759`) and pending list (`:851`).

`formatDate` **is** fully dead after this task: its only five call sites (`:160`, `:492`, `:889`, `:911`, `:944`) are all inside deleted blocks.

- [ ] **Step 1: Record the starting size**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
wc -l src/components/FriendsPage.jsx
```

Expected: `979`. If it differs, the file moved since planning — re-grep every anchor in the table above before editing.

- [ ] **Step 2: Make the import block exactly this**

Replace lines 6-34 of `src/components/FriendsPage.jsx` so the imports read:

```jsx
import {
  searchProfiles,
  sendFriendRequest,
  cancelOutgoingFriendRequest,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  respondToFriendRequest,
  getAcceptedFriends,
  getFriendsLeaderboard,
  getMyPings,
  respondToPing,
  getMyDatePolls,
  voteOnDateOption,
} from "../lib/socialApi";
import { PingCard } from "./SkiPingModal";
import { DateMatchmakerComposer, DatePollCard } from "./DateMatchmaker";
import { resortName, resortEmoji as getResortEmoji } from "../lib/resorts";
import Avatar from "./ui/Avatar";
import FailureNotice from "./ui/FailureNotice";
import { runLoaders, mergeFailed, selectLoaders } from "../lib/loaderRegistry";
```

(Leave lines 1-5 — the `react`, `CrewGroupChat`, `LeaderboardPage`, `SkiBuddyBoard` and `UserProfileModal` imports — alone for now; Task 5 removes the three page imports.)

Removed here: `createCrewInvite`, `getReceivedCrewInvites`, `getIncomingTripRequests`, `approveTripRequest`, `declineTripRequest`, `getSentCrewInvites`, `respondToCrewInvite`, `getMySkiPlans`, `getFriendsUpcomingTrips`, `SkiPingComposer`, and the whole `formatDate` import line.

- [ ] **Step 3: Delete the ten dead `useState` lines**

Remove exactly these from the state block (lines 198-219):

```jsx
  const [receivedInvites, setReceivedInvites] = useState([])
  const [tripRequests, setTripRequests]       = useState([])
  const [sentInvites, setSentInvites]         = useState([])
  const [skiPlans, setSkiPlans]               = useState([])
  const [friendsWeekend, setFriendsWeekend]   = useState([])
  const [showInviteId, setShowInviteId]       = useState(null)
  const [inviteForm, setInviteForm]           = useState({ resort_key: "", ski_date: "", departure_time: "06:00 AM", seats_available: 3, message: "" })
  const [showPingComposer, setShowPingComposer] = useState(false)
  const [showPastPlans, setShowPastPlans]     = useState(false)
  const [showLegacyInvites, setShowLegacyInvites] = useState(false)
```

**Keep** `activeSection` for now — Task 5 removes it. **Keep** `leaderboard`: the friend row's `daysTogether` / `topResort` badges read from `leaderboardById`, and that badge survives this slice (spec decision 5).

- [ ] **Step 4: Cut `pageLoaders()` down to six descriptors**

Replace the body of `pageLoaders()` (lines 264-278) with:

```jsx
  function pageLoaders() {
    return [
      { key: "incoming",     label: "your friend requests", fn: getIncomingFriendRequests, fallback: [], apply: setIncomingRequests },
      { key: "outgoing",     label: "your sent requests",   fn: getOutgoingFriendRequests, fallback: [], apply: setOutgoingRequests },
      { key: "friends",      label: "your friends list",    fn: getAcceptedFriends,        fallback: [], apply: setAcceptedFriends },
      { key: "leaderboard",  label: "the leaderboard",      fn: getFriendsLeaderboard,     fallback: [], apply: setLeaderboard },
      { key: "pings",        label: "your ski pings",       fn: getMyPings,                fallback: { sent: [], received: [] },    apply: setPings },
      { key: "datePolls",    label: "your date polls",      fn: getMyDatePolls,            fallback: { created: [], received: [] }, apply: setDatePolls },
    ]
  }
```

- [ ] **Step 5: Fix the loader doc comment's now-wrong arithmetic**

The `/** … */` block above `pageLoaders()` (lines 227-243) opens with "The page's **ten**
data blocks" and later says a single rejection "left **nine** healthy sections rendering as
empty". There are six now. Change those two words:

- `The page's ten data blocks, as loader descriptors.` → `The page's six data blocks, as loader descriptors.`
- `skipped all ten setters and left nine healthy sections` → `skipped all six setters and left five healthy sections`

Leave the rest of that comment verbatim — the 2026-08-18 incident it records is still the reason this registry exists.

- [ ] **Step 6: Delete everything else in the table, in descending line order**

Work items 1 through 17 from the table above, **highest line number first**. For item 4, delete the `Invite`/`✕` toggle button (lines 790-799) *and* the `{showInviteId === friend.id && ( … )}` composer block (lines 802-834) — the friend row keeps only the avatar, the name/subtitle column, and the `onMessageFriend` button.

For item 6, the quick-action array at lines 601-603 becomes:

```jsx
            {[
              { icon: "📅", label: "Pick a Date", onClick: () => setShowDateComposer(true), accent: "rgba(139,92,246,0.8)" },
            ].map(({ icon, label, onClick, accent }) => (
```

- [ ] **Step 7: Verify nothing dead is left behind**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
grep -n "WeekendPlanner\|FriendAvatar\|CrewInviteCard\|showInviteId\|inviteForm\|handleSendCrewInvite\|handleRespondToCrewInvite\|tripRequests\|handleTripRequest\|skiPlans\|upcomingPlans\|pastPlans\|showPastPlans\|hasLegacyInvites\|showLegacyInvites\|sentInvites\|receivedInvites\|friendsWeekend\|isPast\|formatDate\|SkiPingComposer\|showPingComposer\|Ping Crew" src/components/FriendsPage.jsx
```

Expected: **no output at all.** Any hit is a leftover reference — fix it before continuing.

- [ ] **Step 8: Verify the survivors are still there**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
grep -c "getResortEmoji\|formatResortName" src/components/FriendsPage.jsx
grep -n "PingCard\|DatePollCard\|DateMatchmakerComposer\|leaderboardById" src/components/FriendsPage.jsx
wc -l src/components/FriendsPage.jsx
```

Expected: `getResortEmoji`/`formatResortName` still present; `PingCard`, `DatePollCard`, `DateMatchmakerComposer` and `leaderboardById` all still referenced; the file is roughly **560-590 lines** (about 400 removed).

- [ ] **Step 9: Lint — this is the real test for this task**

There is no DOM harness, so ESLint's `no-unused-vars` is the automated check that catches a missed import, a state variable left without a reader, or a handler nobody calls.

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
npx eslint src/components/FriendsPage.jsx
```

Expected: **clean, no output.** An `'X' is defined but never used` error names exactly what Step 6 missed.

- [ ] **Step 10: Build and run the suite**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
npm run build 2>&1 | tail -8
npm test 2>&1 | tail -6
```

Expected: build succeeds; `fail 0`, same count as Task 3.

- [ ] **Step 11: Commit**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
git add src/components/FriendsPage.jsx
git commit -m "refactor: delete six superseded sections from FriendsPage

Each has a better home after the TASK 21.1 IA restructure: Ping Crew ->
SkiPlansPage's PingCta; Weekend Planner -> FriendsCalendar on the Plans
tab; My Ski Plans -> the Plans calendar; legacy crew-invite inbox and the
per-friend invite composer (same crew_invites flow, so they go together
or the composer sends invites with no way to see their status) -> Crews
tab + trip invites; trip-join requests -> the trip's own Interested list.
Takes FriendAvatar with it -- a second, always-blue avatar implementation
whose only caller was WeekendPlanner, so the ROADMAP's flagged fix is
deletion, not reconciliation."
```

---

## Task 5: `FriendsPage.jsx` — delete the dead internal routing

**Files:**
- Modify: `src/components/FriendsPage.jsx`
- Modify: `src/components/MessagingCenter.jsx:197`

**Interfaces:**
- Consumes: the shrunken file from Task 4.
- Produces: `export default function FriendsPage({ onMessageFriend = null })` — a single-purpose component with no internal tab state. `MessagingCenter.jsx` is its only caller and passes only `onMessageFriend`.

### Background the implementer needs

`FriendsPage.jsx` was built as a self-contained page with its own 4-way tab bar
(`activeSection`) and props (`hideCrew`, `hideTabBar`, `initialSection`) so callers could
reconfigure it. It has exactly one caller today — `MessagingCenter.jsx:197` — which always
passes `hideTabBar` and `initialSection="friends"`. `MessagingCenter` grew its own real
5-way Crew tab bar during the Crews slice (`MessagingCenter.jsx:193-201`). So this file's
tab bar never renders, and the `leaderboard`, `crews` and `community` branches are
unreachable. That is accumulated dead code, not a design anyone chose.

The three components those branches render — `LeaderboardPage`, `CrewGroupChat`,
`SkiBuddyBoard` — are **not** being deleted. `MessagingCenter.jsx` already imports and
mounts all three itself (`:193`, `:200`, `:201`). Only `FriendsPage`'s second, dead copies
of the mounts go.

- [ ] **Step 1: Confirm the caller and the reachability claim before deleting**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
grep -rn "FriendsPage" src --include="*.jsx" --include="*.js" | grep -v "src/components/FriendsPage.jsx:"
grep -n "LeaderboardPage\|CrewGroupChat\|SkiBuddyBoard" src/components/MessagingCenter.jsx
```

Expected: exactly one JSX call site — `src/components/MessagingCenter.jsx:197` — plus two doc-comment mentions in `src/lib/profileNav.js` and `src/lib/loaderRegistry.test.js` (both are prose in comments/log-prefix strings, neither is an import). And all three page components confirmed imported and mounted by `MessagingCenter` itself.

- [ ] **Step 2: Delete the three now-dead page imports**

Remove lines 2, 3 and 4 of `src/components/FriendsPage.jsx`:

```jsx
import CrewGroupChat from "./CrewGroupChat";
import LeaderboardPage from "./LeaderboardPage";
import SkiBuddyBoard from "./SkiBuddyBoard";
```

**Keep** line 5, `import UserProfileModal from "./UserProfileModal";` — the avatar/name tap targets still open it (`setViewingUserId`).

- [ ] **Step 3: Simplify the component signature**

```jsx
export default function FriendsPage({ hideCrew = false, onMessageFriend = null, hideTabBar = false, initialSection = "leaderboard" }) {
```

becomes:

```jsx
export default function FriendsPage({ onMessageFriend = null }) {
```

- [ ] **Step 4: Delete the `activeSection` state**

Remove:

```jsx
  const [activeSection, setActiveSection]     = useState(initialSection)
```

- [ ] **Step 5: Delete the tab bar**

Remove the whole `{!hideTabBar && ( … )}` block — the `{/* ── Top tab bar ── */}` comment through its closing `)}`. It is lines 430-457 in the original file; after Task 4 grep for `Top tab bar`.

- [ ] **Step 6: Delete the three unreachable branches**

Remove:

```jsx
      {/* ══ LEADERBOARD TAB ══ */}
      {activeSection === "leaderboard" && <LeaderboardPage />}

      {/* ══ CREWS TAB ══ */}
      {activeSection === "crews" && <CrewGroupChat friends={acceptedFriends} />}

      {/* ══ COMMUNITY TAB (Ski Buddy board) ══ */}
      {activeSection === "community" && <SkiBuddyBoard />}
```

- [ ] **Step 7: Unwrap the friends branch and re-indent**

The remaining body is wrapped in `{activeSection === "friends" && ( … )}`. Replace the opening:

```jsx
      {/* ══ FRIENDS TAB ══ */}
      {activeSection === "friends" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
```

with:

```jsx
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
```

and replace the matching close:

```jsx
        </div>
      )}
```

with:

```jsx
        </div>
```

Then **de-indent the unwrapped body by 2 spaces** so it lines up with its siblings. Do not skip this — a whole section indented two spaces deeper than everything around it is exactly the kind of drift a reviewer will (correctly) send back.

- [ ] **Step 8: Verify no routing remnants**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
grep -n "activeSection\|hideTabBar\|hideCrew\|initialSection\|LeaderboardPage\|CrewGroupChat\|SkiBuddyBoard" src/components/FriendsPage.jsx
```

Expected: **no output.**

- [ ] **Step 9: Clean the call site**

In `src/components/MessagingCenter.jsx:197`, change:

```jsx
        <FriendsPage hideTabBar initialSection="friends" onMessageFriend={handleMessageFriend} />
```

to:

```jsx
        <FriendsPage onMessageFriend={handleMessageFriend} />
```

React would silently ignore the two extra props, which is exactly why they would sit there forever otherwise.

- [ ] **Step 10: Lint, build, test**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
npx eslint src/components/FriendsPage.jsx src/components/MessagingCenter.jsx
npm run build 2>&1 | tail -8
npm test 2>&1 | tail -6
```

Expected: eslint clean, build succeeds, `fail 0`.

- [ ] **Step 11: Verify the JSX still balances**

An unwrap that drops or keeps one bracket too many usually still lints but fails the build.
The build in Step 10 is the real check; additionally confirm the file ends sanely:

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
tail -5 src/components/FriendsPage.jsx
wc -l src/components/FriendsPage.jsx
```

Expected: the file ends with the modals block, `  )` , `}` — and is roughly **520-550 lines**.

- [ ] **Step 12: Commit**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
git add src/components/FriendsPage.jsx src/components/MessagingCenter.jsx
git commit -m "refactor: delete FriendsPage's dead internal tab bar and routing

FriendsPage had its own 4-way tab bar and hideCrew/hideTabBar/
initialSection props from when it was a self-contained page. Its one
caller, MessagingCenter, has passed hideTabBar + initialSection='friends'
since it grew the real 5-way Crew tab bar during the Crews slice, so the
tab bar never rendered and three of its four branches were unreachable.
LeaderboardPage/CrewGroupChat/SkiBuddyBoard are untouched -- Messaging
Center already mounts all three itself."
```

---

## Task 6: Search bar restyle, the `···` overflow menu, and the new section order

**Files:**
- Modify: `src/components/FriendsPage.jsx`

**Interfaces:**
- Consumes: the file from Task 5.
- Produces, for Tasks 7-10 to reuse — define these **once**, just above the `// ── Render ──` banner where `inputStyle` used to live:
  - `sectionLabelStyle` — the mockup's uppercase section label.
  - `rowStyle` — the mockup's card row (used by request rows, friend rows and pending rows).
  - `rowNameStyle`, `rowSubStyle` — the row's two text lines.
  - `iconButtonBase` — the shared 32x32 icon-button box.
- Also produces the new top-to-bottom section order the later tasks slot into.

### Mockup values (read from `mockups/PowDays.app mockup design/PowDays Reorg Mockup.dc.html:319-322`)

```
search box:   display:flex; align-items:center; gap:9px;
              background:rgba(255,255,255,0.05);
              border:1px solid rgba(255,255,255,0.1);
              border-radius:12px; padding:10px 12px;
search icon:  <svg width=16 height=16 viewBox="0 0 24 24" fill=none
                   stroke="rgba(125,211,252,0.5)" stroke-width=2>
                <circle cx=11 cy=11 r=7/><path d="m20 20-3.5-3.5"/>
              </svg>
placeholder:  font-size:13px; color:rgba(125,211,252,0.45)
```

Per Global Constraints, `rgba(125,211,252,0.45)` is `var(--color-text-3)` verbatim.

### The new section order

The mockup is search-first. Rearrange the render body to exactly this order (later tasks
restyle the contents, this task only establishes the order and the search block):

1. per-loader `FailureNotice` rows (unchanged, stays first)
2. the fixed `toast` (unchanged, position:fixed so its DOM order is irrelevant — leave it where it is)
3. **search bar + `···` overflow button** (this task)
4. search results (moved as-is with the search bar, restyled in Task 8 Step 6)
5. **Requests** (Task 7)
6. **Friends** (Task 8)
7. pending-outgoing disclosure (Task 9)
8. **Activity** (Task 10)

- [ ] **Step 1: Replace `inputStyle` with the shared style constants**

Delete the `inputStyle` object (its only two consumers were the search input, restyled
below, and the invite composer deleted in Task 4) and put these in its place:

```jsx
  // ── Styles ────────────────────────────────────────────────────────────────
  // Values transcribed from the mockup (PowDays Reorg Mockup.dc.html:318-351). The
  // mockup is drawn in the default Blizzard theme, so its literals ARE this app's
  // tokens: #38bdf8 is --color-accent, rgba(125,211,252,0.45) is --color-text-3,
  // #04080f is --color-bg. Tokens are used rather than the hexes because the app ships
  // five themes (index.css:157-236) and a hardcoded accent breaks four of them.

  const sectionLabelStyle = {
    fontSize: 11, fontWeight: 800, letterSpacing: 0.8,
    textTransform: "uppercase", color: "var(--color-text-3)",
  }

  const rowStyle = {
    display: "flex", alignItems: "center", gap: 11,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14, padding: "10px 12px",
  }

  const rowNameStyle = {
    fontSize: 13, fontWeight: 800, color: "var(--color-text-1)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  }

  const rowSubStyle = {
    fontSize: 11, color: "var(--color-text-3)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  }

  // 32x32 per the mockup. Smaller than the 44px minimum used elsewhere in this file --
  // a deliberate, spec-confirmed mockup match. Flag at click-through if it is hard to
  // hit on a real phone; bumping to 36-40 is a one-line change here.
  const iconButtonBase = {
    width: 32, height: 32, borderRadius: 9, flexShrink: 0,
    display: "grid", placeItems: "center",
    cursor: "pointer", padding: 0,
  }
```

- [ ] **Step 2: Add the overflow-menu state**

Next to the other `useState` calls, add:

```jsx
  const [showOverflow, setShowOverflow]       = useState(false)
```

- [ ] **Step 3: Replace the search form**

Replace the whole existing `<form onSubmit={handleSearch}>` block (the search input plus
its "Search" submit button) with:

```jsx
          {/* 1 ── Search + overflow ──
              Mockup order puts search first. The "···" button is the only home for the
              Date Matchmaker composer now that the quick-action strip is gone --
              DateMatchmakerComposer is not reachable from anywhere else in the app, and
              createDatePoll writes no notification, so losing this trigger would make
              date polls uncreatable. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <form onSubmit={handleSearch} style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 9,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12, padding: "10px 12px",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                     stroke="var(--color-text-3)" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  value={searchText}
                  onChange={e => { setSearchText(e.target.value); if (!e.target.value) setSearchResults([]) }}
                  placeholder="Search skiers"
                  aria-label="Search skiers by name or username"
                  style={{
                    flex: 1, minWidth: 0, background: "transparent", border: "none",
                    outline: "none", color: "var(--color-text-1)",
                    fontSize: 16, padding: 0,
                  }}
                />
                {searching && (
                  <span style={{ fontSize: 12, color: "var(--color-text-3)", flexShrink: 0 }}>…</span>
                )}
              </div>
              {/* Submit-on-Enter only. The mockup has no Search button, and the form's
                  native submit already covers the Enter key -- so the old explicit
                  onKeyDown handler is gone rather than duplicated. */}
            </form>

            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setShowOverflow(v => !v)}
                aria-label="More friend actions"
                aria-expanded={showOverflow}
                style={{
                  ...iconButtonBase,
                  width: 36, height: 36,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "var(--color-text-3)",
                  fontSize: 16, fontWeight: 900, lineHeight: 1,
                }}
              >
                ···
              </button>

              {showOverflow && (
                <>
                  {/* Full-screen click-catcher: without it the menu can only be closed
                      by picking an item, which on touch means it sticks. */}
                  <div
                    onClick={() => setShowOverflow(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 40 }}
                  />
                  <div style={{
                    position: "absolute", top: 42, right: 0, zIndex: 41,
                    minWidth: 172,
                    background: "var(--color-surface-popover)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12, padding: 4,
                    boxShadow: "var(--shadow-card)",
                  }}>
                    <button
                      type="button"
                      onClick={() => { setShowOverflow(false); setShowDateComposer(true) }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        padding: "10px 12px", borderRadius: 9, minHeight: 44,
                        background: "transparent", border: "none",
                        color: "var(--color-text-1)", fontSize: 13, fontWeight: 700,
                        cursor: "pointer", textAlign: "left",
                      }}
                    >
                      📅 Pick a Date
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
```

- [ ] **Step 4: Delete the old quick-action strip**

Remove the whole `{/* 2 ── Quick action strip ── */}` block — the single-entry array Task 4
left behind. Its `Pick a Date` trigger now lives in the overflow menu, so `showDateComposer`
still has exactly one trigger and the `DateMatchmakerComposer` modal at the bottom of the
file is untouched.

- [ ] **Step 5: Move the search block and search results to the top of the body**

The search form and the `{searchResults.length > 0 && ( … )}` block currently sit inside
the `{/* 5 ── Friends list ── */}` wrapper `<div>`. Move both out of it, to the top of the
column — immediately after the `FailureNotice` map — so the render order matches the list
in "The new section order" above.

- [ ] **Step 6: Verify the Date Matchmaker still has exactly one trigger**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
grep -n "setShowDateComposer\|DateMatchmakerComposer" src/components/FriendsPage.jsx
grep -n "Quick action strip\|inputStyle" src/components/FriendsPage.jsx
```

Expected: `setShowDateComposer(true)` appears exactly once (the overflow item), `setShowDateComposer(false)` once (the modal's `onClose`), `<DateMatchmakerComposer` once. The second grep returns **no output**.

- [ ] **Step 7: Confirm the composer's props are unchanged**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
grep -n "export function DateMatchmakerComposer" src/components/DateMatchmaker.jsx
```

Expected: `DateMatchmakerComposer({ friends, onClose, onCreated })` at line 23. The modal block at the bottom of `FriendsPage.jsx` must still pass exactly those three props with the same values it passed before this slice — this task changes the trigger, never the composer.

- [ ] **Step 8: Lint, build, test**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
npx eslint src/components/FriendsPage.jsx
npm run build 2>&1 | tail -8
npm test 2>&1 | tail -6
```

Expected: clean, build succeeds, `fail 0`.

- [ ] **Step 9: Commit**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
git add src/components/FriendsPage.jsx
git commit -m "feat: mockup search bar + '···' overflow menu on the Friends sub-tab

Search moves to the top per the mockup and loses its separate Search
button (the form already submits on Enter). The overflow menu is the new
and only home for DateMatchmakerComposer: it is unreachable elsewhere in
the app, and createDatePoll writes no notification, so dropping the
trigger would make date polls uncreatable rather than merely hidden."
```

---

## Task 7: Restyle the Requests section

**Files:**
- Modify: `src/components/FriendsPage.jsx`

**Interfaces:**
- Consumes: `getMutualFriendCount` (Task 3), `formatMutualFriends` (Task 2), `sectionLabelStyle`/`rowStyle`/`rowNameStyle`/`rowSubStyle`/`iconButtonBase` (Task 6).
- Produces: `mutualCounts: Record<string, number>` keyed by `requester_id`, available to nothing else (local to this section).

### Mockup values (`PowDays Reorg Mockup.dc.html:323-334`)

```
header row:   margin-top:16px; display:flex; align-items:center; justify-content:space-between
label:        "Requests"  (sectionLabelStyle)
count pill:   font-size:11px; font-weight:800; color:#04080f;
              background:#38bdf8; border-radius:999px; padding:2px 8px
list:         margin-top:10px; display:flex; flex-direction:column; gap:8px
row:          rowStyle
accept btn:   32x32; border-radius:9px; background:linear-gradient(135deg,#0284c7,#38bdf8);
              border:none; color:#04080f; font-size:15px; font-weight:900   ->  ✓
decline btn:  32x32; border-radius:9px; background:transparent;
              border:1px solid rgba(255,255,255,0.14); color:rgba(125,211,252,0.6);
              font-size:15px                                                 ->  ✕
```

### Behaviour that must not change

`handleRespondToRequest(req.id, "accepted" | "declined")` is kept **exactly as it is**.
This task restyles the buttons around it; it does not touch the accept/decline flow, the
`workingId` disable, or the `loadPageData()` refresh that follows.

- [ ] **Step 1: Add the mutual-count state and its fetch**

Add next to the other `useState` calls:

```jsx
  const [mutualCounts, setMutualCounts]       = useState({}) // requester_id -> count
```

and, after the `useEffect(() => { loadPageData() }, [])` line, add:

```jsx
  /**
   * Mutual-friend counts for the incoming-request rows.
   *
   * One RPC per row, not a batch: request volume is inherently tiny, and this matches the
   * N-small-calls shape socialApi.js uses everywhere else. See getMutualFriendCount for
   * why this cannot be an intersection computed here (friend_requests' SELECT policy is
   * caller-scoped, so the requester's own friend list is unreadable from the client).
   *
   * A failure resolves to null, not a thrown error and not a retry row. This is the one
   * place in this file where a swallow is right: the count is a decoration on a row that
   * renders fine without it, so a failed count falls back to the @username subtitle the
   * row showed before this slice. The loader registry above exists for the opposite case
   * -- a whole section silently rendering empty -- which is not what this is.
   *
   * Keyed on the joined id list rather than the array itself: loadPageData() rebuilds
   * incomingRequests with a fresh identity on every refresh, and depending on the array
   * would re-run this whole fetch after every accept, decline and search.
   */
  const incomingRequesterKey = useMemo(
    () => incomingRequests.map(r => r.requester_id).filter(Boolean).join(","),
    [incomingRequests],
  )

  useEffect(() => {
    const ids = incomingRequesterKey ? incomingRequesterKey.split(",") : []
    if (ids.length === 0) { setMutualCounts({}); return }

    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(ids.map(async (id) => {
        try { return [id, await getMutualFriendCount(id)] }
        catch { return [id, null] }
      }))
      if (!cancelled) setMutualCounts(Object.fromEntries(entries))
    })()

    return () => { cancelled = true }
  }, [incomingRequesterKey])
```

Add `getMutualFriendCount` to the `../lib/socialApi` import list, and
`formatMutualFriends` via a new import line:

```jsx
import { formatMutualFriends, formatFriendSubtitle } from "../lib/friendSubtitle";
```

(`formatFriendSubtitle` is imported here and consumed in Task 8 — one import line rather
than two edits to the same line. If Task 8 is not being run in the same session, ESLint
will flag it as unused; in that case import only `formatMutualFriends` now and add the
other in Task 8.)

- [ ] **Step 2: Replace the incoming-requests block**

Replace the whole `{/* 1 ── Incoming friend requests (priority surface) ── */}` block with:

```jsx
          {/* 2 ── Requests ── */}
          {incomingRequests.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={sectionLabelStyle}>Requests</div>
                <span style={{
                  fontSize: 11, fontWeight: 800,
                  color: "var(--color-bg)", background: "var(--color-accent)",
                  borderRadius: 999, padding: "2px 8px",
                }}>
                  {incomingRequests.length}
                </span>
              </div>

              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {incomingRequests.map((req) => {
                  // null while loading and after a failed count -- formatMutualFriends
                  // returns null for both, and for 0, so the row falls back to @username
                  // rather than flashing "0 mutual friends".
                  const mutual = formatMutualFriends(mutualCounts[req.requester_id])
                  const subtitle = mutual || `@${req.requester_profile?.username || "—"}`
                  return (
                    <div key={req.id} style={rowStyle}>
                      <button
                        onClick={() => setViewingUserId(req.requester_profile?.id)}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}
                        aria-label={`View ${getDisplayName(req.requester_profile)}'s profile`}
                      >
                        <Avatar profile={req.requester_profile} size={38} />
                      </button>

                      <div
                        style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                        onClick={() => setViewingUserId(req.requester_profile?.id)}
                      >
                        <div style={rowNameStyle}>{getDisplayName(req.requester_profile)}</div>
                        <div style={rowSubStyle}>{subtitle}</div>
                      </div>

                      <button
                        onClick={() => handleRespondToRequest(req.id, "accepted")}
                        disabled={workingId === req.id}
                        aria-label={`Accept ${getDisplayName(req.requester_profile)}'s friend request`}
                        style={{
                          ...iconButtonBase,
                          background: "var(--gradient-primary)",
                          border: "none", color: "var(--color-bg)",
                          fontSize: 15, fontWeight: 900,
                          opacity: workingId === req.id ? 0.5 : 1,
                        }}
                      >
                        ✓
                      </button>

                      <button
                        onClick={() => handleRespondToRequest(req.id, "declined")}
                        disabled={workingId === req.id}
                        aria-label={`Decline ${getDisplayName(req.requester_profile)}'s friend request`}
                        style={{
                          ...iconButtonBase,
                          background: "transparent",
                          border: "1px solid rgba(255,255,255,0.14)",
                          color: "var(--color-text-3)",
                          fontSize: 15,
                          opacity: workingId === req.id ? 0.5 : 1,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
```

- [ ] **Step 3: Confirm the accept/decline handler is untouched**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
grep -n "handleRespondToRequest" src/components/FriendsPage.jsx
```

Expected: the `async function handleRespondToRequest` definition, plus three call sites —
accept, decline, and the search-results "Accept" shortcut (`:693` pre-slice). All three
still pass `"accepted"`/`"declined"` exactly as before.

- [ ] **Step 4: Verify `useMemo` is imported**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
head -1 src/components/FriendsPage.jsx
```

Expected: `import { useEffect, useMemo, useState } from "react";` — all three are used. If `useMemo` had been dropped, the new `incomingRequesterKey` would fail to build.

- [ ] **Step 5: Lint, build, test**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
npx eslint src/components/FriendsPage.jsx
npm run build 2>&1 | tail -8
npm test 2>&1 | tail -6
```

Expected: clean, build succeeds, `fail 0`.

- [ ] **Step 6: Commit**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
git add src/components/FriendsPage.jsx
git commit -m "feat: mockup Requests section with mutual-friend-count subtitle

Compact 32x32 gradient-check / ghost-cross buttons per the mockup, and a
subtitle from the new get_mutual_friend_count RPC. The count is fetched
per row and degrades to the @username subtitle on failure or zero -- it
is a decoration, so 'NaN mutual friends' or '0 mutual friends' would both
be worse than the row it replaces. Accept/decline handlers unchanged."
```

---

## Task 8: Restyle the Friends list

**Files:**
- Modify: `src/components/FriendsPage.jsx`

**Interfaces:**
- Consumes: `formatFriendSubtitle` (Task 2), the shared style constants (Task 6), `decoratedFriends` (existing memo, unchanged), `getAcceptedFriends`'s two new columns (Task 3).
- Produces: a friends list rendered unconditionally (no filter pill row). The outgoing-requests block is left rendering unconditionally at the bottom for Task 9 to restyle — it is never unreachable between tasks.

### Mockup values (`PowDays Reorg Mockup.dc.html:335-347`)

```
header:       margin-top:18px  +  sectionLabelStyle   ->  "Friends · 5"
list:         margin-top:10px; display:flex; flex-direction:column; gap:8px
row:          rowStyle
avatar wrap:  position:relative; flex-shrink:0
              (the mockup's green online dot inside this wrapper is CUT -- spec
               decision 2, no presence subsystem exists in this app)
name:         rowNameStyle
sub:          rowSubStyle
status span:  CUT (that is the online-status column)
message btn:  32x32; border-radius:9px; background:rgba(56,189,248,0.1);
              border:1px solid rgba(56,189,248,0.25); color:#38bdf8;
              display:grid; place-items:center
              <svg width=15 height=15 viewBox="0 0 24 24" fill=none
                   stroke=currentColor stroke-width=2>
                <path d="M21 11.5a8.4 8.4 0 0 1-11.7 7.7L3 21l1.8-6.3A8.4 8.4 0 1 1 21 11.5Z"/>
              </svg>
```

### The one deliberate deviation from the mockup

Spec decision 5 keeps the existing `daysTogether` / `topResort` badges as a **secondary
line** below the subtitle — real information this view uniquely surfaces (shared ski days
and most-skied-together resort) that appears nowhere else in the app. They render only
when there is something to show, so for a friend with no shared days the row is exactly
the mockup's two lines.

**This is why the `leaderboard` loader survived Task 4** — `decoratedFriends` reads
`daysTogether` / `topResort` / `daysOnMountain` out of `leaderboardById`. Do not remove it.

### Why `formatFriendSubtitle` and not an inline template

`profiles.skill_level` is a key (`double_black`), not a label — see Task 2. On live data
only 1 of 6 profiles has one set and 2 of 6 have no `favorite_mountain`, so the fallback
branches are the ordinary path. All of that is tested in `friendSubtitle.test.js`; none of
it is testable inline in this component.

- [ ] **Step 1: Delete the filter pill row**

Remove the whole `{/* Filter tabs */}` block (the two-button `Friends` / `Pending` pill
row). The mockup has no such row, and Task 9 replaces it with a lighter disclosure.

- [ ] **Step 2: Delete the `friendsFilter` state**

Remove:

```jsx
  const [friendsFilter, setFriendsFilter]     = useState("all")
```

- [ ] **Step 3: Make the outgoing block unconditional for now**

Change the pending block's guard from `{friendsFilter === "pending" && (` to
`{outgoingRequests.length > 0 && (`, leaving its contents alone. Task 9 restyles it. This
keeps pending requests reachable at every commit rather than orphaning them for one task.

- [ ] **Step 4: Replace the friends list block**

Replace the `{friendsFilter === "all" && ( … )}` block with:

```jsx
          {/* 3 ── Friends ── */}
          <div>
            <div style={sectionLabelStyle}>
              Friends{decoratedFriends.length > 0 ? ` · ${decoratedFriends.length}` : ""}
            </div>

            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {loadingPage ? (
                <div style={{ padding: "20px 0", textAlign: "center", color: "var(--color-text-3)", fontSize: 13 }}>
                  Loading…
                </div>
              ) : decoratedFriends.length === 0 ? (
                <div style={{
                  padding: "28px 20px", textAlign: "center",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14,
                }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🎿</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-3)" }}>No friends yet</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-3)", marginTop: 4 }}>
                    Search for skiers above to get started
                  </div>
                </div>
              ) : (
                decoratedFriends.map((friend) => {
                  const subtitle = formatFriendSubtitle(friend)
                  const hasBadges = friend.daysTogether > 0 || friend.topResort
                  return (
                    <div key={friend.id} style={rowStyle}>
                      <button
                        onClick={() => setViewingUserId(friend.id)}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}
                        aria-label={`View ${getDisplayName(friend)}'s profile`}
                      >
                        <Avatar profile={friend} size={38} />
                      </button>

                      <div
                        style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                        onClick={() => setViewingUserId(friend.id)}
                      >
                        <div style={rowNameStyle}>{getDisplayName(friend)}</div>
                        {subtitle && <div style={rowSubStyle}>{subtitle}</div>}

                        {/* Secondary badges -- a deliberate deviation from the mockup
                            (spec decision 5). Shared ski days and the most-skied-together
                            resort appear nowhere else in the app, and they only render
                            when there is something to say, so a friend with no shared
                            days gets exactly the mockup's two-line row. */}
                        {hasBadges && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                            {friend.daysTogether > 0 && (
                              <span style={{
                                fontSize: 10, fontWeight: 700,
                                color: "var(--color-accent)",
                                background: "rgba(56,189,248,0.1)",
                                borderRadius: 6, padding: "2px 6px",
                              }}>
                                {friend.daysTogether} shared day{friend.daysTogether !== 1 ? "s" : ""}
                              </span>
                            )}
                            {friend.topResort && (
                              <span style={{ fontSize: 10, color: "var(--color-text-3)" }}>
                                {getResortEmoji(friend.topResort)} {formatResortName(friend.topResort)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {onMessageFriend && (
                        <button
                          onClick={() => onMessageFriend(friend)}
                          aria-label={`Message ${getDisplayName(friend)}`}
                          style={{
                            ...iconButtonBase,
                            background: "rgba(56,189,248,0.1)",
                            border: "1px solid rgba(56,189,248,0.25)",
                            color: "var(--color-accent)",
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                               stroke="currentColor" strokeWidth="2">
                            <path d="M21 11.5a8.4 8.4 0 0 1-11.7 7.7L3 21l1.8-6.3A8.4 8.4 0 1 1 21 11.5Z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
```

- [ ] **Step 5: Confirm the message wiring is byte-for-byte the same behaviour**

The button's `onClick={() => onMessageFriend(friend)}` and the `{onMessageFriend && …}`
guard are unchanged from the pre-slice row — only the styling and the emoji-to-SVG swap
differ. `MessagingCenter` passes `handleMessageFriend`, so DMs must still open.

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
grep -n "onMessageFriend" src/components/FriendsPage.jsx src/components/MessagingCenter.jsx
```

Expected: in `FriendsPage.jsx`, the prop in the signature plus the guard and the `onClick`
— and nothing else. In `MessagingCenter.jsx`, `handleMessageFriend` passed at the call site.

- [ ] **Step 6: Restyle the search-results rows to match**

In the search-results block moved to the top in Task 6, swap its hand-rolled row wrapper
for the shared `rowStyle`, and its name/handle lines for `rowNameStyle`/`rowSubStyle`, so
a result row and a friend row look like the same component:

```jsx
                    <div key={p.id} style={rowStyle}>
```

and

```jsx
                        <div style={rowNameStyle}>{getDisplayName(p)}</div>
                        <div style={rowSubStyle}>
                          @{p.username || "—"}
                          {p.favorite_mountain ? ` · ${p.favorite_mountain}` : ""}
                        </div>
```

Also change the block's `Search Results` heading to use `sectionLabelStyle`. Leave the
`Friends` / `Accept` / `Pending` / `+ Add` action buttons and all their handlers alone —
they are not part of this slice's mockup and changing them would be scope creep.

- [ ] **Step 7: Verify there is no presence/online affordance anywhere**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
grep -in "online\|presence\|last_seen\|is_active\|statusStyle" src/components/FriendsPage.jsx
```

Expected: **no output.** Spec decision 2 backlogs presence entirely, and the mockup's green
dot plus its status column are both cut. A stray dot would read as a live status the app
cannot actually provide.

- [ ] **Step 8: Lint, build, test**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
npx eslint src/components/FriendsPage.jsx
npm run build 2>&1 | tail -8
npm test 2>&1 | tail -6
```

Expected: clean, build succeeds, `fail 0`.

- [ ] **Step 9: Commit**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
git add src/components/FriendsPage.jsx
git commit -m "feat: mockup friend rows -- shared Avatar, mountain/skill subtitle, chat icon

Subtitle is favorite_mountain · skill_level via formatFriendSubtitle,
which maps skill_level's stored key ('double_black') to a label and
degrades to @username -- on live data only 1 of 6 profiles has a skill
level set, so the partial branches are the normal path. daysTogether and
topResort are kept as a secondary badge line (spec decision 5): real
information surfaced nowhere else in the app. No online dot and no status
column -- presence does not exist in this app and is backlogged."
```

---

## Task 9: Restyle the pending-outgoing requests as a secondary affordance

**Files:**
- Modify: `src/components/FriendsPage.jsx`

**Interfaces:**
- Consumes: the unconditional outgoing block Task 8 left in place; `rowStyle`/`rowNameStyle`/`rowSubStyle`.
- Produces: `showPending: boolean` state, local to this section.

### Why a disclosure and not a tab

Before this slice, "Pending" was one half of a two-button pill row, giving outgoing
requests exactly the same visual weight as the entire friends list. That is the wrong
ratio: a sent request is a thing you check occasionally, not a primary view. The mockup has
no pill row at all. This task uses the **collapsed-disclosure pattern this same file
already used** for the legacy-invites section (the `›` chevron that rotates 90deg on open,
deleted in Task 4) — so the interaction is one the codebase already establishes rather than
a new invention.

- [ ] **Step 1: Add the state**

```jsx
  const [showPending, setShowPending]         = useState(false)
```

- [ ] **Step 2: Replace the outgoing block**

Replace the `{outgoingRequests.length > 0 && ( … )}` block from Task 8 Step 3 with:

```jsx
          {/* 4 ── Sent requests (secondary) ──
              A disclosure, not a tab. As a pill-row tab this had the same visual weight
              as the whole friends list; a request you sent is something you check
              occasionally. Same chevron pattern the legacy-invites section used. */}
          {outgoingRequests.length > 0 && (
            <div>
              <button
                onClick={() => setShowPending(v => !v)}
                aria-expanded={showPending}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 0", minHeight: 40,
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--color-text-3)", fontWeight: 700, fontSize: 12,
                }}
              >
                <span style={{
                  display: "inline-block",
                  transform: showPending ? "rotate(90deg)" : "none",
                  transition: "transform 0.15s",
                }}>
                  ›
                </span>
                {outgoingRequests.length} sent request{outgoingRequests.length > 1 ? "s" : ""} pending
              </button>

              {showPending && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                  {outgoingRequests.map((req) => (
                    <div key={req.id} style={rowStyle}>
                      <Avatar profile={req.recipient_profile} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={rowNameStyle}>{getDisplayName(req.recipient_profile)}</div>
                        <div style={{ ...rowSubStyle, color: "var(--color-warning)" }}>Pending</div>
                      </div>
                      <button
                        onClick={() => handleCancelOutgoing(req.id)}
                        disabled={workingId === req.id}
                        style={{
                          padding: "8px 12px", borderRadius: 9, minHeight: 36, flexShrink: 0,
                          background: "transparent",
                          border: "1px solid rgba(255,255,255,0.14)",
                          color: "var(--color-text-3)",
                          fontWeight: 700, fontSize: 12, cursor: "pointer",
                        }}
                      >
                        {workingId === req.id ? "…" : "Cancel"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 3: Confirm the cancel flow is unchanged**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
grep -n "handleCancelOutgoing\|cancelOutgoingFriendRequest" src/components/FriendsPage.jsx
```

Expected: the handler definition, its `cancelOutgoingFriendRequest` call, and exactly one
call site (the Cancel button). The handler body is untouched by this task.

- [ ] **Step 4: Confirm `friendsFilter` is fully gone**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
grep -n "friendsFilter" src/components/FriendsPage.jsx
```

Expected: **no output.**

- [ ] **Step 5: Lint, build, test**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
npx eslint src/components/FriendsPage.jsx
npm run build 2>&1 | tail -8
npm test 2>&1 | tail -6
```

Expected: clean, build succeeds, `fail 0`.

- [ ] **Step 6: Commit**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
git add src/components/FriendsPage.jsx
git commit -m "refactor: sent friend requests become a disclosure, not a tab

As half of a pill row they carried the same visual weight as the entire
friends list. Reuses the chevron disclosure this file already used for
the legacy-invites section. Cancel flow unchanged."
```

---

## Task 10: Restyle the Activity section

**Files:**
- Modify: `src/components/FriendsPage.jsx`

**Interfaces:**
- Consumes: `sectionLabelStyle` (Task 6); `PingCard`, `DatePollCard`, `handleRespondToPing`, `handleVoteOnDate`, `hasActivity` (all existing, unchanged).
- Produces: nothing new.

### Why this section survives at all

`createSkiPing` and `createDatePoll` in `socialApi.js` **do not call the app's shared
`notify()` helper**, so no notification is ever created for a ping or a date poll. This
section is the only place in the entire app where a recipient can discover or respond to
one. Cutting it — the obvious-looking move, since the mockup does not show it — would
silently break a real flow. It stays.

### Scope of this task

**Presentation only.** `PingCard` and `DatePollCard` are shared components rendered
elsewhere too; this task does not open either file. The section keeps its conditional
`hasActivity` guard, its four maps in the same order (received pings, received polls, sent
pings, created polls), and both handlers.

**No status dot.** The row spacing must not introduce anything that reads like the
presence indicator cut in Task 8.

- [ ] **Step 1: Move the Activity block to the bottom and restyle its header**

Activity currently sits above the friends list. Move it to the end of the column (after
the sent-requests disclosure from Task 9) and replace the block with:

```jsx
          {/* 5 ── Activity (pings + date polls) ──
              Kept deliberately. createSkiPing and createDatePoll never call notify(), so
              no notification is ever written for either -- this section is the only place
              in the app a recipient can find or answer one. The mockup does not show it
              because the mockup does not know it exists. */}
          {hasActivity && (
            <div>
              <div style={sectionLabelStyle}>Activity</div>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {pings.received.map(p => (
                  <PingCard key={p.id} ping={p} onRespond={handleRespondToPing} responding={respondingPingId} />
                ))}
                {datePolls.received.map(p => (
                  <DatePollCard key={p.id} poll={p} onVote={handleVoteOnDate} voting={votingOptionId} />
                ))}
                {pings.sent.map(p => <PingCard key={p.id} ping={p} />)}
                {datePolls.created.map(p => <DatePollCard key={p.id} poll={p} />)}
              </div>
            </div>
          )}
```

The only changes from the previous version are the wrapper's `marginTop: 10` / `gap: 8`
(matching the Requests and Friends lists) and the header adopting `sectionLabelStyle`. The
four maps, their props and their key order are identical.

- [ ] **Step 2: Verify the ping/poll behaviour is untouched**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
grep -n "PingCard\|DatePollCard\|handleRespondToPing\|handleVoteOnDate\|respondingPingId\|votingOptionId\|hasActivity" src/components/FriendsPage.jsx
git diff --stat src/components/SkiPingModal.jsx src/components/DateMatchmaker.jsx
```

Expected: all identifiers present with the same call shapes; and **`git diff --stat` prints
nothing** — neither shared card component is modified by this slice.

- [ ] **Step 3: Confirm the final section order matches the mockup**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
grep -n "── Search + overflow\|── Requests ──\|── Friends ──\|── Sent requests\|── Activity" src/components/FriendsPage.jsx
```

Expected: five hits, in ascending line order — Search, Requests, Friends, Sent requests, Activity.

- [ ] **Step 4: Full verification pass**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
npx eslint .
npm test 2>&1 | tail -6
npm run build 2>&1 | tail -8
wc -l src/components/FriendsPage.jsx
```

Expected: eslint clean across the repo, `fail 0`, build succeeds, and `FriendsPage.jsx`
around **480-540 lines** (down from 979).

- [ ] **Step 5: Read the whole file once, top to bottom**

Open `src/components/FriendsPage.jsx` and read it end to end. Specifically confirm:
- no import is unused and none is missing
- every `useState` has both a reader and a writer
- the five section comments are numbered 1-5 in render order
- indentation is uniform (Task 5's unwrap did not leave a two-space step)
- no `TODO`, no commented-out block, no leftover `console.log`

- [ ] **Step 6: Commit**

```bash
cd /Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App
git add src/components/FriendsPage.jsx
git commit -m "feat: restyle the Activity section to the new visual rhythm

Presentation only -- same guard, same four maps, same handlers, and
PingCard/DatePollCard untouched. The section stays because createSkiPing
and createDatePoll never call notify(), making this the only place in the
app a ping or date poll can be discovered or answered."
```

---

## What Kyle must click through

No subagent in this environment has browser or Supabase-auth tooling, so `npm test`,
`npx eslint` and `npm run build` are the ceiling of automated verification for everything
in `FriendsPage.jsx`. The migration is the exception — Task 1 verifies it against real
production rows. These need a human on a real device:

1. **Requests accept and decline** — both buttons act on the right row, the row leaves the list, and the friend appears in Friends after an accept.
2. **The mutual-friend-count subtitle reads sensibly** on real data. Expect "1 mutual friend" between the accounts that share one. A request row from someone with no mutuals should show `@username`, never "0 mutual friends".
3. **The friends-list subtitle and badges at real mobile width** — on live data most friends will show the mountain alone (only 1 of 6 profiles has a skill level), and the shared-days badge line should not push the row into an awkward third line on a small phone.
4. **The message button still opens the DM thread** for the right person.
5. **The `···` overflow menu** — opens, closes on outside tap, and its Date Matchmaker composer still creates a poll end to end.
6. **Sent-requests disclosure** — expands, and Cancel actually cancels.
7. **Activity** — a received ping and a received date poll still render and still accept a response.
8. **Tap-target check on the 32x32 buttons** (Deviation 3) — if accept/decline/message are fiddly, say so and they get bumped to 36-40px.

---

## Self-Review

**1. Spec coverage.** Every item in the spec's "What ships" maps to a task:

| Spec requirement | Task |
|---|---|
| Delete internal tab bar, `activeSection`, `hideCrew`/`hideTabBar`/`initialSection`, three branches, three page imports | 5 |
| Delete `WeekendPlanner`, `FriendAvatar`, `CrewInviteCard`, legacy invites, inline invite composer, My Ski Plans, Ping Crew, trip-join-request block | 4 |
| Delete unused loaders (`sentInvites`, `crewInvites`, `skiPlans`, `friendsTrips`, `tripRequests`) | 4, Step 4 |
| Search bar restyle + `···` overflow menu opening `DateMatchmakerComposer` | 6 |
| Requests section: 32x32 ✓/✕, mutual-friend-count subtitle | 7 |
| Friends list: `Avatar.jsx`, `favorite_mountain · skill_level`, kept `daysTogether`/`topResort` badge, message icon, no online column | 8 |
| Pending-outgoing as a lighter secondary affordance | 9 |
| Activity restyled, behaviour unchanged, no online-dot lookalike | 10 |
| Migration 047 `get_mutual_friend_count()`, verified live | 1 |
| New `socialApi.js` RPC wrapper + its unit test | 3 (wrapper), 2 (the tested logic — see Deviation 1) |
| `favorite_mountain`/`skill_level` added to `getAcceptedFriends()` | 3, Step 1 |

Two spec items are handled differently than the prose implies, both flagged in-plan rather
than silently: **Deviation 1** (the unit test lives in a new pure module because
`socialApi.js` is not importable by `node --test` — verified, not assumed) and **the
spec's loader name `friendsWeekend`**, which is actually the loader key `friendsTrips`
feeding the state setter `setFriendsWeekend`; Task 4's table uses the real key.

The spec's premise that a **new RPC is needed** was the highest-risk claim and it
**checked out**: `friend_requests_select_own` really is caller-scoped. Because of that,
**this plan contains no RLS-policy fix** — there was no hole to close on that table. (The
`profiles` SELECT policy *is* `USING (true)`, but that is the app's deliberate "Users can
view all profiles" design, it long predates this slice, and widening the friend row's
profile select in Task 3 does not depend on or change it.)

**2. Placeholder scan.** No `TBD`, no "add error handling", no "similar to Task N", no
"write tests for the above". Every code step carries the literal code. Task 1's
verification queries carry real UUIDs and real expected integers derived from the live
graph, not "run some checks". Task 4's deletion table carries verified line numbers *and*
grep anchors, so a shifted file does not turn the task into guesswork.

**3. Type consistency.** Cross-checked:
- `get_mutual_friend_count(other_user_id UUID)` (Task 1) ⇄ `supabase.rpc("get_mutual_friend_count", { other_user_id: otherUserId })` (Task 3) — names match; the deviation from the `p_` convention is called out once, up front.
- `normalizeMutualCount` — exported in Task 2, imported in Task 3, tested in Task 2.
- `formatMutualFriends` — exported Task 2, used Task 7. Returns `string | null`; Task 7 relies on the `null` for the `@username` fallback, and Task 2 tests `null` for 0, `null`, `undefined`, `NaN`, `"3"` and `-1`.
- `formatFriendSubtitle` — exported Task 2, used Task 8, imported in Task 7 Step 1 (with an explicit note for the case where Task 8 is not run in the same session).
- `sectionLabelStyle` / `rowStyle` / `rowNameStyle` / `rowSubStyle` / `iconButtonBase` — defined once in Task 6, consumed in 7, 8, 9, 10 under exactly those names.
- `mutualCounts` is keyed by `requester_id`; Task 7 both writes and reads it by `requester_id`.
- `showOverflow` (6), `showPending` (9), `mutualCounts` (7) are the only three new state names, and none collides with an existing one.

**4. Sequencing.** Tasks 1-3 are backend/lib and independently reviewable. Tasks 4-10 all
touch one file and are strictly ordered: 4 shrinks it (using this plan's verified line
numbers), 5 re-indents it once, 6 defines the shared styles the rest consume. No task
leaves a feature unreachable: Task 4 keeps the `Pick a Date` trigger alive until Task 6
gives it the overflow menu, and Task 8 keeps the outgoing-requests block rendering until
Task 9 restyles it.
