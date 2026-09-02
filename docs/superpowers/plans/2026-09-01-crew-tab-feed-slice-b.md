# Crew Tab — Feed Sub-Tab Slice B Implementation Plan (Comments)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comments to the Crew tab's Feed sub-tab — a new `activity_feed_comments` table behind a `can_see_activity()` RLS helper, an inline expandable comment thread with a composer and a count on each `ActivityFeed.jsx` card, report and delete-your-own affordances — and, in the same pass, close the live `USING (true)` read hole on `activity_feed_reactions` that is the same vulnerability class migration 042 fixed across 7 trip-content tables.

**Architecture:** One migration (`045`) creates the table, the `SECURITY DEFINER STABLE` helper, RLS on the new table, the reactions SELECT fix, and the `content_reports` allowlist widening that makes comments reportable. `src/lib/socialApi.js` gains three additive functions (`getActivityComments`, `addActivityComment`, `deleteActivityComment`) mirroring the batched shape of the `getActivityReactions`/`addActivityReaction` pair immediately above them. `src/lib/activityComments.js` is a new pure, unit-tested grouping helper — the only non-DOM logic in this slice, and the repo's `node --test` harness covers `src/lib` only. `ActivityFeed.jsx` consumes all four in its existing single `useEffect`, with no realtime subscription anywhere. Photo attachments (Feed-C) and group-level activity cards (backlogged) are explicitly out of scope.

**Tech Stack:** React 19 (inline styles, no CSS framework), Supabase (Postgres + RLS), `node --test` for pure-logic unit tests (`npm test` runs `node --test src/lib/*.test.js`).

---

## ⚠️ Two spec corrections the implementer must apply (read before Task 1)

Both were found by reading the live database and the real migration files rather than trusting the spec's paraphrase. Feed-A's plan-writing pass found the same class of error (wrong `ski_sessions` column names); this is the equivalent for Feed-B.

### Correction 1 — Decision 4 names the wrong table. Reporting a comment DOES need a schema change.

The spec's Decision 4 says `reportContent("activity_comment", commentId, reason)` "needs no schema change" because "`moderation_flags.content_type` has no CHECK constraint restricting values". That sentence is true *about `moderation_flags`*, but `moderation_flags` is not on the report path at all — it is written only by the server's service-role moderation endpoint (`migrations/026_verification_infrastructure.sql:54-56`).

`reportContent()` (`src/lib/socialApi.js:218-226`) calls the `report_content` RPC, which writes to **`content_reports`**, and that path is gated twice:

| Gate | Location | Current value |
|---|---|---|
| Table CHECK constraint `content_reports_target_type_check` | `migrations/026_verification_infrastructure.sql:17` | `target_type IN ('post','response','profile','username')` |
| RPC guard, raises `INVALID_TARGET_TYPE` | `migrations/027_report_content_dedupe.sql:14-16` | same 4 values |

Both confirmed still live and unmodified by any later migration (`grep -rn "content_reports\|report_content" migrations/ supabase/migrations/` returns hits only in 026 and 027; `pg_get_constraintdef` and `pg_get_functiondef` on the production database both still show the 4-value list).

**Consequence if uncorrected:** `reportContent("activity_comment", …)` raises `INVALID_TARGET_TYPE:activity_comment` before it ever reaches the table. The Report button would look fine, do nothing, and — because `SkiBuddyBoard`'s copied catch block deliberately swallows the error to leave the retry UI open — fail silently forever.

**The fix, in Task 1:** migration 045 widens the CHECK to include `'activity_comment'` and re-issues `report_content` with the same value added to its allowlist, reproducing 027's body otherwise byte-for-byte so the dedupe/empty-reason behaviour is preserved. Nothing in `src/` reads `content_reports.target_type` (`grep -rn "target_type" src/` finds only `notifications.target_type`, an unrelated column from migration 043), so widening the allowlist breaks no consumer.

This does **not** change Decision 4's substance — comments still route through the one existing `reportContent()` path, matching the Board precedent. Only the "no schema change" clause is wrong.

### Correction 2 — the spec's §3.2 never enables RLS on the new table.

The spec's SQL block for `activity_feed_comments` writes three policies but no `ALTER TABLE … ENABLE ROW LEVEL SECURITY`. Migration 042 didn't need that line because all 7 tables it touched already had RLS on; a brand-new table does not.

Supabase grants `authenticated` full DML on new tables in the `public` schema by default. A table with policies but RLS disabled ignores those policies entirely — every logged-in user could read, insert into, and delete from `activity_feed_comments`, which is the precise opposite of what this slice exists to establish. `migrations/013_activity_feed.sql:17` and `:49` both include the line for exactly this reason.

**The fix, in Task 1:** `ALTER TABLE public.activity_feed_comments ENABLE ROW LEVEL SECURITY;` immediately after `CREATE TABLE`, plus a verification query in Step 4 that asserts `pg_class.relrowsecurity = true`.

### Verified as written — do not "correct" these

- `045` is genuinely the next free number; `044_crew_photos.sql` is the last file in `migrations/`.
- The reactions SELECT policy really is named `"Auth users view activity reactions"` with `qual = true` on the live database — the spec's `DROP POLICY IF EXISTS` string is exact.
- `are_friends(p_other UUID)` exists, is `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`, and reads `friend_requests` where `status = 'accepted'` in both directions (`migrations/032_daily_plans_visibility_fix.sql:61-70`, confirmed identical live). This reproduces `activity_feed`'s own inline SELECT rule character-for-character, so `can_see_activity()` is a faithful wrapper around an existing rule, not a new visibility policy.
- `can_see_activity` does not exist yet.

---

## Global Constraints

- **No new npm dependencies.**
- **Inline `style={{}}` objects**; colors via `var(--color-*)` tokens for anything semantic/stateful. This slice introduces no new hardcoded color — the existing `#fb923c`/`#a78bfa` `typeAccent` literals in `ActivityFeed.jsx:72` are pre-existing documented exceptions carried over untouched.
- **Migration number `045`** — verified free as of 2026-09-01.
- **RLS discipline, per the repo's own recorded lessons:** never read an RLS-protected relation inline inside another policy (the mistake migration 041 nearly shipped, and that `20260515_crew_rls_fix.sql`/`022` exist to undo) — always go through a `SECURITY DEFINER STABLE` helper. **And test the success case, not just denials:** a different migration's first version refused every legitimate member action while passing every "strangers are blocked" test. Task 1 Step 5 is a mandatory live, impersonated *success*-case test; it is not optional and it is not satisfied by "the SQL looks right."
- **Re-verify the `npm test` / `npx eslint .` baseline in the fresh worktree before starting — do not trust this cited number.** Last observed on `main`, 2026-09-01: **157 tests passing / 96 lint problems (88 errors, 8 warnings)**. The spec cites 89 lint problems; that was a worktree figure, and `main` runs persistently higher due to unrelated drift (see project memory). Record what you actually observe in the worktree and compare against that.
- **No subagent in this environment has browser or Supabase-auth tooling.** Tasks 2, 3 and 4 are verified via `npm test` / `npx eslint .` / `npm run build` / diff review **only** — say so plainly in each task report, do not imply a browser check happened. **Task 1 is the deliberate exception:** it has real database tooling (`mcp__claude_ai_Supabase__apply_migration` and `mcp__claude_ai_Supabase__execute_sql`, both proven working in this environment — the Crews slice applied migration 044 this way) and must use it for both application and verification.
- **Follow existing patterns exactly where one already exists** (see each task's "Consumes" — these are real, already-in-the-codebase functions, not to be reimplemented).
- **No realtime subscription anywhere in this slice** (Decision 5). Comments refresh by refetch/local splice only.
- **Ask before pushing to `main`** — it auto-deploys to `powdays.app` live, with no staging step. This plan's execution stays on a worktree branch; merging happens only after Kyle signs off.

---

## File Structure

| File | Change |
|---|---|
| `migrations/045_activity_feed_comments.sql` | *new* — `can_see_activity()` helper; `activity_feed_comments` table + index + RLS enable + 3 policies; the `activity_feed_reactions` SELECT fix; the `content_reports` allowlist widening + `report_content` re-issue (Correction 1) |
| `src/lib/activityComments.js` | *new* — pure `groupCommentsByActivity()` helper |
| `src/lib/activityComments.test.js` | *new* — 8 `node --test` cases |
| `src/lib/socialApi.js` | *modify (additive)* — `getActivityComments`, `addActivityComment`, `deleteActivityComment`, inserted after `addActivityReaction` (ends line 3977) |
| `src/components/ActivityFeed.jsx` | *modify* — comment batch-fetch in the existing `useEffect`, comment-count button, inline expandable thread, composer, report form, delete-own |
| `src/components/SkiBuddyBoard.jsx` | *unmodified* — `ResponseThread` (lines 44-98) and the inline report form (lines 378-394) are visual/interaction references only, not shared components; they are tightly coupled to Board's own post/response data shape |
| `migrations/013_activity_feed.sql`, `migrations/026`, `migrations/027`, `migrations/042` | *unmodified* — read as precedent; 045 supersedes the relevant policies at runtime without editing history |
| `src/lib/format.js`, `src/lib/leaderboardApi.js`, `src/components/MessagingCenter.jsx`, `src/components/TodayScreen.jsx` | *unmodified* |

**Note on mount sites:** `ActivityFeed.jsx` is mounted in **two** places — the Crew tab's Feed sub-tab (`MessagingCenter.jsx`) and the Today tab's Friends section (`TodayScreen.jsx`, from TASK 22.5). Neither passes props. Everything in Task 4 lands on both surfaces automatically; do not scope anything to one call site, and do not add a required prop.

---

### Task 1: Migration 045 — comments table, `can_see_activity()`, the reactions RLS fix, and the reportable-comment allowlist

**Files:**
- Create: `migrations/045_activity_feed_comments.sql`

**Interfaces:**
- Consumes: `public.are_friends(p_other UUID) RETURNS BOOLEAN` (exists, `migrations/032_daily_plans_visibility_fix.sql:61`); `public.activity_feed(id, actor_id)`; `public.activity_feed_reactions(activity_id, user_id, emoji)`; `public.content_reports(target_type, …)`.
- Produces (Tasks 3 and 4 depend on all of these existing):
  - Table `public.activity_feed_comments (id UUID PK, activity_id UUID NOT NULL, user_id UUID NOT NULL, content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL)`, RLS **enabled**, with `activity_feed_comments_select` / `_insert` / `_delete` policies.
  - `public.can_see_activity(p_activity_id UUID) RETURNS BOOLEAN`, `SECURITY DEFINER STABLE`, executable by `authenticated`.
  - `activity_feed_reactions_select` replacing `"Auth users view activity reactions"`.
  - `report_content('activity_comment', <uuid>, <text>)` accepted rather than raising `INVALID_TARGET_TYPE`.

- [ ] **Step 1: Write the migration file**

Create `migrations/045_activity_feed_comments.sql` with exactly this content:

```sql
-- Migration 045: activity feed comments, and the reactions read hole next door
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- WHY THIS EXISTS
--
-- Feed slice B adds comments to activity feed cards (ROADMAP.md TASK 22.0). The new
-- table is shaped exactly like trip_comments — the app's existing lightweight comment
-- table — scoped to activity_feed instead of ski_trips.
--
-- While building it, the identical vulnerability class migration 042 fixed across seven
-- trip-content tables turned out to be live, right next door:
--
--   activity_feed_reactions  SELECT USING (true)    who reacted to whose day
--
-- Lower stakes than a trip's private chat (an emoji plus a user_id, not free text), but
-- the same mistake: readable by EVERY authenticated user regardless of friendship, while
-- the activity_feed row it hangs off has been correctly scoped to actor-or-friend since
-- migration 013. Kyle's call was to fix the whole class in the same pass rather than
-- leave a known-identical gap next to brand-new code, which is migration 042's own
-- reasoning applied one table over.
--
-- THE RULE. Everything hanging off an activity is visible to exactly whoever can see the
-- activity: the actor, or a friend of the actor. That is not a new rule — it is
-- activity_feed's own SELECT policy from migration 013, lifted into a reusable helper so
-- two more tables can share it instead of restating it.
--
-- can_see_activity() is SECURITY DEFINER so no policy ever reads an RLS-protected
-- relation inline (the bug migration 041 nearly shipped), and STABLE so it inlines and
-- does not re-execute per candidate row (032:52-57). It calls are_friends(), whose body
-- is character-for-character the friendship half of activity_feed's own policy.
--
-- WHY content_reports IS TOUCHED HERE
--
-- Comments are reportable through the app's one existing report path,
-- reportContent(type, id, reason) -> the report_content RPC -> content_reports. That path
-- is allowlisted in two places, both of which reject 'activity_comment' today:
--
--   * content_reports_target_type_check   (migration 026:17)
--   * the report_content RPC's own guard  (migration 027:14)
--
-- So the Report button on a comment cannot work without widening both. The RPC below is
-- migration 027's body verbatim with one value added -- the dedupe ON CONFLICT and the
-- empty-reason guard are preserved exactly; nothing else about reporting changes.
-- (moderation_flags is a different table entirely, written only by the server's
-- service-role moderation endpoint, and is NOT on this path.)
--
-- ROLLBACK, if anything breaks:
--   -- reactions (WARNING: this re-opens the read hole; emergencies only)
--   DROP POLICY IF EXISTS activity_feed_reactions_select ON public.activity_feed_reactions;
--   CREATE POLICY "Auth users view activity reactions" ON public.activity_feed_reactions
--     FOR SELECT TO authenticated USING (true);
--   -- comments
--   DROP TABLE IF EXISTS public.activity_feed_comments;
--   DROP FUNCTION IF EXISTS public.can_see_activity(UUID);
--   -- reports allowlist (fails if any activity_comment report already exists; delete those first)
--   ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_target_type_check;
--   ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_target_type_check
--     CHECK (target_type IN ('post', 'response', 'profile', 'username'));
--   -- then re-apply migrations/027_report_content_dedupe.sql's report_content body verbatim.

BEGIN;

-- ── The visibility helper ───────────────────────────────────────────────────
-- Mirrors can_see_trip_content()'s exact shape (042:56-69), wrapping the rule
-- activity_feed's own SELECT policy has enforced since migration 013.

CREATE OR REPLACE FUNCTION public.can_see_activity(p_activity_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM activity_feed af
     WHERE af.id = p_activity_id
       AND (af.actor_id = auth.uid() OR public.are_friends(af.actor_id))
  );
$$;

REVOKE ALL ON FUNCTION public.can_see_activity(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_see_activity(UUID) TO authenticated;

-- ── Comments ────────────────────────────────────────────────────────────────
-- Same shape as trip_comments, scoped to activity_feed instead of ski_trips.
-- user_id references auth.users(id), matching activity_feed.actor_id exactly, so
-- PostgREST resolves a `profiles:user_id(...)` embed the same way it already
-- resolves `profiles:actor_id(...)` on activity_feed (profiles.id is itself a
-- one-to-one FK onto auth.users(id)).

CREATE TABLE IF NOT EXISTS public.activity_feed_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID REFERENCES public.activity_feed(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_feed_comments_activity
  ON public.activity_feed_comments (activity_id);

-- NOT optional, and NOT inherited: this is a brand-new table, and Supabase grants
-- `authenticated` full DML on new public-schema tables by default. Without this line the
-- three policies below are inert and every logged-in user could read, write and delete
-- any comment. Migrations 013:17 and 013:49 carry the same line for the same reason.
ALTER TABLE public.activity_feed_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_feed_comments_select ON public.activity_feed_comments;
CREATE POLICY activity_feed_comments_select ON public.activity_feed_comments
  FOR SELECT TO authenticated USING (public.can_see_activity(activity_id));

-- Posting needs the same standing as reading -- the lesson migration 042 already
-- recorded for trip_comments ("It was only 'the row is mine', so an outsider could write
-- into any trip's conversation"). A stranger who somehow obtains an activity_id must not
-- be able to comment on an activity they cannot see.
DROP POLICY IF EXISTS activity_feed_comments_insert ON public.activity_feed_comments;
CREATE POLICY activity_feed_comments_insert ON public.activity_feed_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_see_activity(activity_id));

DROP POLICY IF EXISTS activity_feed_comments_delete ON public.activity_feed_comments;
CREATE POLICY activity_feed_comments_delete ON public.activity_feed_comments
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── The reactions read hole ─────────────────────────────────────────────────
-- Only the open SELECT is replaced. "Users manage own activity reaction" is FOR ALL
-- scoped to user_id = auth.uid() and is deliberately left alone: it already prevents
-- writing someone else's reaction, and because permissive policies OR together, its
-- USING clause keeps a user able to read their OWN reaction row even on an activity that
-- has since become invisible to them -- which is what addActivityReaction's
-- select-then-upsert round trip depends on.
--
-- Reactions' INSERT is deliberately NOT given a can_see_activity check. Unlike a comment,
-- a reaction on an activity you cannot read discloses nothing and displays nowhere; adding
-- the check would widen this fix past what is actually broken.

DROP POLICY IF EXISTS "Auth users view activity reactions" ON public.activity_feed_reactions;
DROP POLICY IF EXISTS activity_feed_reactions_select ON public.activity_feed_reactions;
CREATE POLICY activity_feed_reactions_select ON public.activity_feed_reactions
  FOR SELECT TO authenticated USING (public.can_see_activity(activity_id));

-- ── Reportable comments ─────────────────────────────────────────────────────
-- See "WHY content_reports IS TOUCHED HERE" above. Nothing in src/ reads
-- content_reports.target_type, so widening the allowlist breaks no consumer.

ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_target_type_check;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_target_type_check
  CHECK (target_type IN ('post', 'response', 'profile', 'username', 'activity_comment'));

-- Migration 027's body verbatim, with 'activity_comment' added to the guard. The
-- ON CONFLICT dedupe (027:25) and the empty-reason guard (027:19-21) are unchanged.
CREATE OR REPLACE FUNCTION public.report_content(p_target_type TEXT, p_target_id UUID, p_reason TEXT)
RETURNS content_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row content_reports;
  v_reason TEXT;
BEGIN
  IF p_target_type NOT IN ('post', 'response', 'profile', 'username', 'activity_comment') THEN
    RAISE EXCEPTION 'INVALID_TARGET_TYPE:%', p_target_type;
  END IF;

  v_reason := trim(coalesce(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'EMPTY_REASON';
  END IF;

  INSERT INTO content_reports (reporter_id, target_type, target_id, reason)
  VALUES (auth.uid(), p_target_type, p_target_id, v_reason)
  ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    SELECT * INTO v_row FROM content_reports
    WHERE reporter_id = auth.uid() AND target_type = p_target_type AND target_id = p_target_id;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.report_content(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_content(TEXT, UUID, TEXT) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Apply it via the Supabase MCP tool**

Call `mcp__claude_ai_Supabase__apply_migration` with `project_id` = the "Colorado Ski Dashboard + Ski With Friends" project (`hkzaohqrycwfgmcogwdo`), `name` = `045_activity_feed_comments`, and the SQL above **verbatim** (including comments — every prior migration's rationale is preserved in the database's migration history).

If it errors, do not retry blindly: read the error, fix the SQL file, and re-apply. Report the exact error text if you need to deviate from the SQL above.

- [ ] **Step 3: Reload the PostgREST schema cache**

Supabase installs DDL event triggers that reload PostgREST automatically, but a new table that the client will query by name is worth being explicit about. Run via `mcp__claude_ai_Supabase__execute_sql`:

```sql
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 4: Verify the structure with read-only queries**

Run each of these via `mcp__claude_ai_Supabase__execute_sql` and **paste the actual output into the task report** — "looks right" is not a verification.

Query A — the table's columns:
```sql
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'activity_feed_comments'
 ORDER BY ordinal_position;
```
Expected: exactly 5 rows — `id` (uuid, NO, `gen_random_uuid()`), `activity_id` (uuid, NO), `user_id` (uuid, NO), `content` (text, NO), `created_at` (timestamp with time zone, NO, `now()`).

Query B — RLS is actually ON (Correction 2):
```sql
SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class
 WHERE oid = 'public.activity_feed_comments'::regclass;
```
Expected: `relrowsecurity = true`. **If this is false, stop — the policies are inert and the table is world-writable.**

Query C — the index and the foreign keys:
```sql
SELECT indexname, indexdef FROM pg_indexes
 WHERE schemaname='public' AND tablename='activity_feed_comments';

SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint WHERE conrelid = 'public.activity_feed_comments'::regclass ORDER BY conname;
```
Expected: `activity_feed_comments_activity` on `(activity_id)`, plus the pkey index. FKs: `activity_id → public.activity_feed(id) ON DELETE CASCADE`, `user_id → auth.users(id) ON DELETE CASCADE`. **The `user_id` FK target must be `auth.users(id)`** — that is the exact relationship shape that makes PostgREST resolve `profiles:actor_id(...)` on `activity_feed` today, and Task 3 relies on the identical embed working here.

Query D — all policies on both tables:
```sql
SELECT tablename, policyname, cmd, qual, with_check
  FROM pg_policies
 WHERE tablename IN ('activity_feed', 'activity_feed_reactions', 'activity_feed_comments')
 ORDER BY tablename, policyname;
```
Expected, exactly:
- `activity_feed` — `"Friends and self view activity"` (SELECT) and `"Authenticated users insert own activity"` (INSERT), **both unchanged from before this migration**.
- `activity_feed_comments` — `activity_feed_comments_select` (SELECT, `can_see_activity(activity_id)`), `activity_feed_comments_insert` (INSERT, with_check `(user_id = auth.uid()) AND can_see_activity(activity_id)`), `activity_feed_comments_delete` (DELETE, `user_id = auth.uid()`).
- `activity_feed_reactions` — `activity_feed_reactions_select` (SELECT, `can_see_activity(activity_id)`) and `"Users manage own activity reaction"` (ALL, `user_id = auth.uid()`, **unchanged**). `"Auth users view activity reactions"` must be **gone**.

Query E — the helper's properties:
```sql
SELECT p.proname, p.prosecdef AS security_definer, p.provolatile AS volatility,
       pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'can_see_activity';
```
Expected: `security_definer = true`, `volatility = 's'` (STABLE, not `'v'`). If it comes back `'v'`, the function will re-execute per candidate row and the STABLE contract in the plan is violated — fix and re-apply.

Query F — the report allowlist (Correction 1):
```sql
SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
 WHERE conrelid = 'public.content_reports'::regclass AND conname = 'content_reports_target_type_check';

SELECT pg_get_functiondef(p.oid) LIKE '%activity_comment%' AS rpc_allows_activity_comment
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'report_content';
```
Expected: the CHECK def contains all five values including `'activity_comment'`, and `rpc_allows_activity_comment = true`.

- [ ] **Step 5: Verify the RLS behaviour live — the SUCCESS case first, then the denials**

This step is **mandatory and is the point of the whole task.** The repo has already shipped a migration whose first version refused every legitimate action while passing every "strangers are blocked" test; that only surfaced because a success-case test was added. Denial-only verification does not satisfy this step.

The `mcp__claude_ai_Supabase__execute_sql` tool can impersonate a user — this was proven working in this environment while writing this plan:

```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<UUID>","role":"authenticated"}';
SELECT auth.uid();
ROLLBACK;
```
returns the impersonated UUID and runs policies as that user.

**5a — pick real fixtures** (the production database has 4 accepted friendships, 11 activity rows, 6 users, so these will return rows):

```sql
SELECT af.id AS activity_id,
       af.actor_id,
       CASE WHEN fr.requester_id = af.actor_id THEN fr.recipient_id ELSE fr.requester_id END AS friend_id
  FROM activity_feed af
  JOIN friend_requests fr
    ON fr.status = 'accepted'
   AND (fr.requester_id = af.actor_id OR fr.recipient_id = af.actor_id)
 ORDER BY af.created_at DESC
 LIMIT 1;
```

Then, substituting the `actor_id` and `friend_id` you just got:

```sql
SELECT u.id AS stranger_id
  FROM auth.users u
 WHERE u.id NOT IN ('<ACTOR_ID>', '<FRIEND_ID>')
   AND NOT EXISTS (
     SELECT 1 FROM friend_requests fr
      WHERE fr.status = 'accepted'
        AND ((fr.requester_id = u.id AND fr.recipient_id = '<ACTOR_ID>')
          OR (fr.recipient_id = u.id AND fr.requester_id = '<ACTOR_ID>'))
   )
 LIMIT 1;
```

If no stranger exists (all 6 users are mutual friends), record that fact and use a synthetic UUID such as `'00000000-0000-0000-0000-0000000000ff'` for the denial tests only — `can_see_activity()` and the SELECT policies work fine for a non-existent user; only the INSERT denial test needs a real `auth.users` row because of the FK, and in that case the FK error is itself a pass for "cannot insert".

**5b — THE SUCCESS CASE. A friend can read and comment.** Substitute the three UUIDs and run as one block:

```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<FRIEND_ID>","role":"authenticated"}';

SELECT public.can_see_activity('<ACTIVITY_ID>') AS helper_should_be_true;

SELECT count(*) AS activity_readable_should_be_1
  FROM public.activity_feed WHERE id = '<ACTIVITY_ID>';

SELECT count(*) AS reactions_readable_no_error
  FROM public.activity_feed_reactions WHERE activity_id = '<ACTIVITY_ID>';

INSERT INTO public.activity_feed_comments (activity_id, user_id, content)
VALUES ('<ACTIVITY_ID>', '<FRIEND_ID>', 'rls success-case probe 045');

SELECT count(*) AS comment_readable_should_be_1
  FROM public.activity_feed_comments
 WHERE activity_id = '<ACTIVITY_ID>' AND content = 'rls success-case probe 045';

SELECT public.report_content('activity_comment',
        (SELECT id FROM public.activity_feed_comments
          WHERE content = 'rls success-case probe 045' LIMIT 1),
        'report path probe') IS NOT NULL AS report_should_be_true;

DELETE FROM public.activity_feed_comments
 WHERE activity_id = '<ACTIVITY_ID>' AND content = 'rls success-case probe 045';

SELECT count(*) AS own_comment_deleted_should_be_0
  FROM public.activity_feed_comments
 WHERE activity_id = '<ACTIVITY_ID>' AND content = 'rls success-case probe 045';

ROLLBACK;
```

Expected: `helper_should_be_true = true`, `activity_readable_should_be_1 = 1`, the reactions count returns a number with **no error**, the INSERT **succeeds**, `comment_readable_should_be_1 = 1`, `report_should_be_true = true` (this is Correction 1's live proof — before the migration it would raise `INVALID_TARGET_TYPE:activity_comment`), and `own_comment_deleted_should_be_0 = 0` (Decision 7's delete policy).

**Any failure here means the policies are too strict and the feature is broken for real users, even though every denial test below would still pass.** That is the exact failure mode this step exists to catch.

**5c — the denial cases.** Run each as its own call, because a policy violation aborts the surrounding block:

```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<STRANGER_ID>","role":"authenticated"}';
SELECT public.can_see_activity('<ACTIVITY_ID>') AS helper_should_be_false;
SELECT count(*) AS comments_visible_should_be_0
  FROM public.activity_feed_comments WHERE activity_id = '<ACTIVITY_ID>';
SELECT count(*) AS reactions_visible_should_be_0
  FROM public.activity_feed_reactions WHERE activity_id = '<ACTIVITY_ID>';
ROLLBACK;
```
Expected: `false`, `0`, `0`. The reactions count is the proof the `USING (true)` hole is closed — **run this exact query once before applying the migration too if you can, so you have a before/after pair** (before: a non-zero count if any reaction exists on that activity).

```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<STRANGER_ID>","role":"authenticated"}';
INSERT INTO public.activity_feed_comments (activity_id, user_id, content)
VALUES ('<ACTIVITY_ID>', '<STRANGER_ID>', 'should be refused');
ROLLBACK;
```
Expected: **ERROR** — `new row violates row-level security policy for table "activity_feed_comments"`. An error here is a PASS.

```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<FRIEND_ID>","role":"authenticated"}';
INSERT INTO public.activity_feed_comments (activity_id, user_id, content)
VALUES ('<ACTIVITY_ID>', '<ACTOR_ID>', 'impersonating someone else');
ROLLBACK;
```
Expected: **ERROR** — the `user_id = auth.uid()` half of the INSERT policy. An error here is a PASS.

- [ ] **Step 6: Confirm the probes left nothing behind**

The blocks above are wrapped in `ROLLBACK`, but confirm rather than assume:

```sql
SELECT count(*) AS leftover_probe_comments FROM public.activity_feed_comments;
SELECT count(*) AS leftover_probe_reports FROM public.content_reports WHERE target_type = 'activity_comment';
```
Expected: `0` and `0`. If either is non-zero, delete the probe rows (`DELETE FROM public.activity_feed_comments WHERE content = 'rls success-case probe 045';` and the matching `content_reports` row) and re-verify before moving on.

- [ ] **Step 7: Commit**

```bash
git add migrations/045_activity_feed_comments.sql
git commit -m "feat: activity feed comments table, can_see_activity RLS helper, reactions read fix"
```

- [ ] **Step 8: Report**

Record in the task report: the full output of every query in Steps 4-6, an explicit statement that the **success case** (5b) passed with the INSERT actually succeeding, the before/after reactions-visibility pair from 5c if you captured it, and the confirmation that Corrections 1 and 2 were both applied (the `content_reports` widening and the `ENABLE ROW LEVEL SECURITY` line) with the live evidence for each.

---

### Task 2: `getActivityComments` / `addActivityComment` / `deleteActivityComment` + the pure grouping helper

Both halves of the comment data path live in one task on purpose: `groupCommentsByActivity()`'s expected row shape and the `SELECT` that produces it must agree on field names, and one reviewer should see both. Same reasoning as Feed-A's Task 1.

**Files:**
- Create: `src/lib/activityComments.js`
- Create: `src/lib/activityComments.test.js`
- Modify: `src/lib/socialApi.js` — insert after `addActivityReaction` (which ends at line 3977), before the `// ─── Mountain Board (sprint-29) ───` comment on line 3979

**Interfaces:**
- Consumes: `supabase` and `getCurrentUser()` (both already at the top of `socialApi.js`; `getCurrentUser` is defined at line 26 and returns the Supabase auth user, so `user.id` is the UUID). The `activity_feed_comments` table and its three policies from Task 1.
- Produces (Task 4 consumes all four):
  - `getActivityComments(activityIds: string[] | null) => Promise<Array<{ id: string, activity_id: string, user_id: string, content: string, created_at: string, profiles: { id, full_name, username, avatar_url } | null }>>` — returns `[]` for an empty/absent id list; **throws** on a query error.
  - `addActivityComment(activityId: string, content: string) => Promise<Row>` — same row shape as above, one row. Throws on empty content or on a query error.
  - `deleteActivityComment(commentId: string) => Promise<void>`. Throws on a query error.
  - `groupCommentsByActivity(rows) => Record<string, Row[]>` from `src/lib/activityComments.js` — never `null`, buckets sorted oldest-first.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/activityComments.test.js`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { groupCommentsByActivity } from "./activityComments.js"

const c = (id, activity_id, created_at) => ({
  id,
  activity_id,
  user_id: "u1",
  content: `comment ${id}`,
  created_at,
})

test("groups rows into one bucket per activity_id", () => {
  const rows = [c("1", "a", "2026-09-01T10:00:00+00:00"), c("2", "b", "2026-09-01T11:00:00+00:00")]
  const grouped = groupCommentsByActivity(rows)
  assert.deepEqual(Object.keys(grouped).sort(), ["a", "b"])
  assert.deepEqual(grouped.a.map((r) => r.id), ["1"])
  assert.deepEqual(grouped.b.map((r) => r.id), ["2"])
})

test("sorts each bucket oldest-first regardless of the order rows arrive in", () => {
  // The feed itself is newest-first; a comment thread reads top-down oldest-first, the
  // opposite direction. Getting this backwards is silently wrong, not an error.
  const rows = [
    c("late", "a", "2026-09-01T12:00:00+00:00"),
    c("early", "a", "2026-09-01T08:00:00+00:00"),
    c("mid", "a", "2026-09-01T10:00:00+00:00"),
  ]
  assert.deepEqual(groupCommentsByActivity(rows).a.map((r) => r.id), ["early", "mid", "late"])
})

test("returns an empty object for empty, null and undefined input", () => {
  assert.deepEqual(groupCommentsByActivity([]), {})
  assert.deepEqual(groupCommentsByActivity(null), {})
  assert.deepEqual(groupCommentsByActivity(undefined), {})
})

test("drops rows with no activity_id instead of bucketing them under undefined", () => {
  const rows = [c("1", "a", "2026-09-01T10:00:00+00:00"), c("2", null, "2026-09-01T11:00:00+00:00")]
  const grouped = groupCommentsByActivity(rows)
  assert.deepEqual(Object.keys(grouped), ["a"])
  assert.equal(grouped.a.length, 1)
})

test("sorts a row with no created_at last, not first", () => {
  // A locally-appended row that has not round-tripped yet belongs at the bottom of the
  // thread. Treating an unparseable timestamp as 0 would put it at the top.
  const rows = [
    c("pending", "a", undefined),
    c("existing", "a", "2026-09-01T08:00:00+00:00"),
  ]
  assert.deepEqual(groupCommentsByActivity(rows).a.map((r) => r.id), ["existing", "pending"])
})

test("keeps buckets independent — mutating one does not touch another", () => {
  const rows = [c("1", "a", "2026-09-01T10:00:00+00:00"), c("2", "b", "2026-09-01T11:00:00+00:00")]
  const grouped = groupCommentsByActivity(rows)
  grouped.a.push(c("3", "a", "2026-09-01T12:00:00+00:00"))
  assert.equal(grouped.b.length, 1)
})

test("does not reorder the caller's input array", () => {
  const rows = [
    c("late", "a", "2026-09-01T12:00:00+00:00"),
    c("early", "a", "2026-09-01T08:00:00+00:00"),
  ]
  groupCommentsByActivity(rows)
  assert.deepEqual(rows.map((r) => r.id), ["late", "early"])
})

test("preserves every field on each row, including the resolved profile", () => {
  const row = {
    id: "1",
    activity_id: "a",
    user_id: "u9",
    content: "nice day",
    created_at: "2026-09-01T10:00:00+00:00",
    profiles: { id: "u9", full_name: "Ada", username: "ada", avatar_url: null },
  }
  assert.deepEqual(groupCommentsByActivity([row]).a[0], row)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/activityComments.test.js`
Expected: FAIL — `Cannot find module './activityComments.js'`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/activityComments.js`:

```js
/**
 * Group a flat batch of activity_feed_comments rows into { [activity_id]: [row, ...] } —
 * the same shape ActivityFeed.jsx already builds by hand for reactions.
 *
 * Each bucket is sorted oldest-first. getActivityComments already asks PostgREST for
 * created_at ascending, so this re-sort is belt-and-braces: the thread's reading order is
 * the opposite of the feed's own newest-first order, getting it backwards is silently
 * wrong rather than an error, and a `.order()` clause can vanish in a later edit to the
 * select without anything failing. It costs a sort over a handful of rows per card.
 *
 * A row whose created_at is missing or unparseable sorts LAST, not first — that is the
 * shape of a comment appended locally before it has round-tripped, and it belongs at the
 * bottom of the thread.
 *
 * Rows with no activity_id are dropped rather than collected under an "undefined" key,
 * which would never match a card and would only confuse whoever reads the object next.
 *
 * @param {Array<{id: string, activity_id: string, user_id: string, content: string, created_at: string}> | null | undefined} rows
 * @returns {Record<string, Array<object>>} never null; {} when there is nothing to group
 */
export function groupCommentsByActivity(rows) {
  const grouped = {}

  for (const row of rows || []) {
    if (!row?.activity_id) continue
    if (!grouped[row.activity_id]) grouped[row.activity_id] = []
    grouped[row.activity_id].push(row)
  }

  const stamp = (row) => {
    const ms = Date.parse(row?.created_at)
    return Number.isFinite(ms) ? ms : Infinity
  }

  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => stamp(a) - stamp(b))
  }

  return grouped
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/activityComments.test.js`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Add the three data-layer functions**

In `src/lib/socialApi.js`, insert the following **after** `addActivityReaction`'s closing `}` (currently line 3977) and **before** the `// ─── Mountain Board (sprint-29) ─────` comment (currently line 3979):

```js
// ─── Activity feed comments (Feed slice B, migration 045) ───────────────────

/**
 * Every comment on a batch of activities, in one query — the same batched shape as
 * getActivityReactions above, not a per-card lazy fetch. A feed page is 30 flat,
 * lightweight threads; one query beats 30 round trips if every card gets expanded.
 *
 * No visibility filtering belongs here: activity_feed_comments_select routes through
 * can_see_activity(), so Postgres has already restricted this to activities the caller
 * can see (migration 045).
 *
 * The profiles embed is the same shape getActivityFeed uses 40 lines up:
 * activity_feed_comments.user_id references auth.users(id) exactly as
 * activity_feed.actor_id does, and profiles.id is a one-to-one FK onto the same target,
 * which is what lets PostgREST resolve the relationship.
 */
export async function getActivityComments(activityIds) {
  if (!activityIds?.length) return []
  const { data, error } = await supabase
    .from("activity_feed_comments")
    .select("id, activity_id, user_id, content, created_at, profiles:user_id(id, full_name, username, avatar_url)")
    .in("activity_id", activityIds)
    .order("created_at", { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Post one comment and return the stored row with its author profile resolved, so the
 * caller can splice it straight into the open thread without a refetch (Decision 5: no
 * realtime, no auto-refresh timer).
 *
 * There is deliberately no client-side visibility check. activity_feed_comments_insert
 * requires BOTH user_id = auth.uid() AND can_see_activity(activity_id), so commenting on
 * an activity the caller cannot see is refused by Postgres — the real boundary — not by
 * a JS guard that an attacker never runs.
 */
export async function addActivityComment(activityId, content) {
  const trimmed = (content || "").trim()
  if (!trimmed) throw new Error("Comment can't be empty.")

  const user = await getCurrentUser()
  const { data, error } = await supabase
    .from("activity_feed_comments")
    .insert({ activity_id: activityId, user_id: user.id, content: trimmed })
    .select("id, activity_id, user_id, content, created_at, profiles:user_id(id, full_name, username, avatar_url)")
    .single()
  if (error) throw error
  return data
}

/**
 * Delete one comment. Ownership is enforced by activity_feed_comments_delete
 * (user_id = auth.uid()), which makes someone else's comment match zero rows rather than
 * error — so there is deliberately no second ownership check here, matching how
 * trip_comments' own DELETE policy is relied on.
 */
export async function deleteActivityComment(commentId) {
  const { error } = await supabase.from("activity_feed_comments").delete().eq("id", commentId)
  if (error) throw error
}
```

- [ ] **Step 6: Verify nothing else in `socialApi.js` changed and the names are unique**

Run: `git diff src/lib/socialApi.js`
Expected: one additive hunk only. `getActivityFeed`, `getActivityReactions`, `addActivityReaction`, `logActivity`, `logActivityOnce` and `reportContent` are all byte-identical to `main`.

Run: `grep -n "getActivityComments\|addActivityComment\|deleteActivityComment" src/lib/socialApi.js`
Expected: exactly one `export async function` line each — no accidental duplicate definition.

Run: `grep -n "activity_feed_comments" src/lib/socialApi.js`
Expected: three matches, one per function, all spelled `activity_feed_comments` (matching Task 1's `CREATE TABLE` exactly).

- [ ] **Step 7: Run the full suite, build and lint**

Run: `npm test`
Expected: fresh-worktree baseline **+ 8** (this task's new `activityComments.test.js` cases). No pre-existing test changes status.

Run: `npm run build`
Expected: succeeds.

Run: `npx eslint .`
Expected: at or below the fresh-worktree baseline recorded before Task 1 started.

- [ ] **Step 8: Commit**

```bash
git add src/lib/activityComments.js src/lib/activityComments.test.js src/lib/socialApi.js
git commit -m "feat: add activity comment data layer and pure grouping helper"
```

State plainly in the task report that verification was `npm test`/`npx eslint .`/`npm run build`/diff review only — no subagent in this environment has browser or Supabase-auth tooling, so the three new functions have not been exercised against a live authenticated session.

---

### Task 3: `ActivityFeed.jsx` — comment count, inline thread, composer, report, delete-own

**Files:**
- Modify: `src/components/ActivityFeed.jsx` — the import block (lines 1-6), the state block (lines 17-21), the `useEffect` (lines 23-42), a new set of handlers after `handleReact` (which ends line 58), and the reactions row + a new thread block inside the render (lines 107-127). `TYPE_COPY` (8-14), `EMOJIS` (15), `handleReact` (44-58), the loading/empty returns (60-61), the card header (93-101) and the body line (103-105) are **untouched**.

**Interfaces:**
- Consumes:
  - `getActivityComments(activityIds)`, `addActivityComment(activityId, content)`, `deleteActivityComment(commentId)` from `../lib/socialApi` (Task 2) — the row shape is `{ id, activity_id, user_id, content, created_at, profiles }`.
  - `groupCommentsByActivity(rows)` from `../lib/activityComments` (Task 2) — returns `Record<activity_id, Row[]>`, never `null`.
  - `reportContent(targetType, targetId, reason)` from `../lib/socialApi` (already exists, `socialApi.js:218`) — three positional args, called here as `reportContent("activity_comment", commentId, reason)`. Migration 045 (Task 1) is what makes `"activity_comment"` an accepted value.
  - Already imported and unchanged: `getActivityFeed`, `getActivityReactions`, `addActivityReaction`, `getCurrentUser`, `Avatar` (props `profile`, `size`; handles a null profile), `AccentCard`, `timeAgo`, `formatSessionStat`, `resortName`.
- Produces: nothing consumed by a later task. `ActivityFeed` still takes **no props** — both mount sites (`MessagingCenter.jsx`, `TodayScreen.jsx`) render `<ActivityFeed />` bare and must keep working.

**Visual reference (not a shared component):** `SkiBuddyBoard.jsx`'s `ResponseThread` (lines 44-98) for the thread rows — an 8px-padded `rgba(255,255,255,0.04)` card, a bold name, a right-aligned `timeAgo`, the body underneath — and its inline report form (lines 378-394) for the report affordance. Neither is imported; Board's are coupled to its own post/response shape, which is why they were never extracted.

- [ ] **Step 1: Update the imports**

Replace lines 1-6 of `src/components/ActivityFeed.jsx` with:

```jsx
import { useState, useEffect } from "react"
import {
  getActivityFeed,
  getActivityReactions,
  addActivityReaction,
  getActivityComments,
  addActivityComment,
  deleteActivityComment,
  reportContent,
  getCurrentUser,
} from "../lib/socialApi"
import Avatar from "./ui/Avatar"
import AccentCard from "./ui/AccentCard"
import { timeAgo, formatSessionStat } from "../lib/format"
import { resortName } from "../lib/resorts"
import { groupCommentsByActivity } from "../lib/activityComments"
```

Leave `TYPE_COPY` and `EMOJIS` exactly as they are.

- [ ] **Step 2: Add the comment state**

Directly after the existing `const [loading, setLoading] = useState(true)` line, add:

```jsx
  const [comments, setComments] = useState({}) // { [activity_id]: [row, ...] }, oldest-first
  // One thread open at a time, mirroring SkiBuddyBoard's expandedPostId. That is what
  // lets the composer and the report form be single shared pieces of state instead of
  // per-card maps: only one of each can be on screen.
  const [expandedId, setExpandedId] = useState(null)
  const [draft, setDraft] = useState("")
  const [posting, setPosting] = useState(false)
  const [reportingId, setReportingId] = useState(null) // a comment id, not an activity id
  const [reportReason, setReportReason] = useState("")
```

- [ ] **Step 3: Fetch comments alongside reactions in the existing effect**

Replace the whole `useEffect` block (currently lines 23-42) with:

```jsx
  useEffect(() => {
    let cancelled = false
    Promise.all([getActivityFeed(30), getCurrentUser()])
      .then(async ([rows, user]) => {
        if (cancelled) return
        setItems(rows)
        setCurrentUserId(user?.id ?? null)
        const ids = rows.map((r) => r.id)
        const [reactionRows, commentRows] = await Promise.all([
          getActivityReactions(ids).catch(() => []),
          // Warned, not silently swallowed. A PostgREST relationship error or an RLS
          // refusal here is otherwise indistinguishable from "nobody has commented yet" —
          // the exact silent-failure class Feed-A's session-stats join had to guard
          // against. An empty list still renders the feed; it just says so in the console.
          getActivityComments(ids).catch((e) => {
            console.warn("getActivityComments failed", e)
            return []
          }),
        ])
        if (cancelled) return
        const grouped = {}
        for (const r of reactionRows) {
          grouped[r.activity_id] = grouped[r.activity_id] || []
          grouped[r.activity_id].push(r)
        }
        setReactions(grouped)
        setComments(groupCommentsByActivity(commentRows))
      })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])
```

No subscription is added here or anywhere else in this file (Decision 5).

- [ ] **Step 4: Add the comment handlers**

Insert directly after `handleReact`'s closing `}` (currently line 58) and before the `if (loading)` return:

```jsx
  function toggleThread(activityId) {
    // Opening a different card resets the composer and any open report form, so a draft
    // can never be posted onto the wrong activity or a reason submitted for the wrong
    // comment.
    setExpandedId((prev) => (prev === activityId ? null : activityId))
    setDraft("")
    setReportingId(null)
    setReportReason("")
  }

  async function handlePostComment(activityId) {
    const text = draft.trim()
    if (!text || posting) return
    setPosting(true)
    try {
      const row = await addActivityComment(activityId, text)
      // Appended rather than refetched: the new row is by definition the newest in the
      // thread, and it comes back with its profile already resolved.
      setComments((prev) => ({ ...prev, [activityId]: [...(prev[activityId] || []), row] }))
      setDraft("")
    } catch (e) {
      console.warn("addActivityComment failed", e)
    } finally {
      setPosting(false)
    }
  }

  async function handleDeleteComment(activityId, commentId) {
    const before = comments[activityId] || []
    setComments((prev) => ({
      ...prev,
      [activityId]: (prev[activityId] || []).filter((c) => c.id !== commentId),
    }))
    try {
      await deleteActivityComment(commentId)
    } catch (e) {
      // RLS refused it, or the network did. Put the comment back rather than leaving the
      // UI claiming a deletion that did not happen.
      console.warn("deleteActivityComment failed", e)
      setComments((prev) => ({ ...prev, [activityId]: before }))
    }
  }

  async function handleReportComment(commentId) {
    if (!reportReason.trim()) return
    try {
      await reportContent("activity_comment", commentId, reportReason.trim())
      setReportingId(null)
      setReportReason("")
    } catch (e) {
      // Leave the report UI open so the user can retry, same as SkiBuddyBoard's
      // handleReportSubmit. Warned rather than fully swallowed: "activity_comment" is only
      // an accepted target_type because migration 045 widened the allowlist, so if that
      // migration were ever rolled back this would be the one visible symptom.
      console.warn("reportContent(activity_comment) failed", e)
    }
  }
```

- [ ] **Step 5: Derive the per-card comment list**

Inside the `items.map((item) => {` body, directly after the existing `const itemReactions = reactions[item.id] || []` line, add:

```jsx
        const itemComments = comments[item.id] || []
        const threadOpen = expandedId === item.id
```

- [ ] **Step 6: Add the comment-count button to the reactions row**

The reactions row is the `<div style={{ display: "flex", gap: 6, marginTop: 12, paddingTop: 12, borderTop: … }}>` block. Insert this button **after** the closing `)}` of the `EMOJIS.map(...)` expression and **before** that div's closing `</div>`:

```jsx
              <button
                onClick={() => toggleThread(item.id)}
                aria-expanded={threadOpen}
                style={{
                  display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
                  borderRadius: "var(--radius-pill)", border: "none", cursor: "pointer", fontSize: 13,
                  marginLeft: "auto",
                  background: threadOpen ? "var(--color-accent)" : "rgba(255,255,255,0.06)",
                  color: threadOpen ? "var(--color-bg)" : "var(--color-text-2)",
                }}
              >
                💬
                {itemComments.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{itemComments.length}</span>
                )}
              </button>
```

The padding, radius, font sizes and active/inactive colors are copied from the kudos buttons beside it on purpose (Decision 3 — the count has to read as a peer of the reaction counts). `marginLeft: "auto"` pushes it to the right edge of the same divider row rather than adding a second row.

- [ ] **Step 7: Add the thread block**

Insert this immediately after the reactions row's closing `</div>`, still inside `<AccentCard>`, before `</AccentCard>`:

```jsx
            {threadOpen && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", display: "grid", gap: 6 }}>
                {itemComments.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--color-text-3)" }}>No comments yet.</div>
                )}

                {itemComments.map((c) => {
                  const commenterName = c.profiles?.full_name || c.profiles?.username || "Someone"
                  const isMine = c.user_id === currentUserId
                  return (
                    <div key={c.id} style={{ padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.04)", fontSize: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Avatar profile={c.profiles} size={20} />
                        <span style={{ fontWeight: 700, color: "var(--color-text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {commenterName}
                        </span>
                        <span style={{ color: "var(--color-text-3)", marginLeft: "auto", flexShrink: 0 }}>
                          {timeAgo(c.created_at)}
                        </span>
                      </div>

                      <div style={{ color: "var(--color-text-2)", marginTop: 3, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {c.content}
                      </div>

                      <div style={{ display: "flex", gap: 12, marginTop: 5 }}>
                        {isMine ? (
                          <button
                            onClick={() => handleDeleteComment(item.id, c.id)}
                            style={{ background: "none", border: "none", padding: 0, color: "var(--color-text-3)", fontSize: 11, cursor: "pointer" }}
                          >
                            Delete
                          </button>
                        ) : (
                          <button
                            onClick={() => { setReportingId(reportingId === c.id ? null : c.id); setReportReason("") }}
                            style={{ background: "none", border: "none", padding: 0, color: "var(--color-text-3)", fontSize: 11, cursor: "pointer" }}
                          >
                            🚩 Report
                          </button>
                        )}
                      </div>

                      {reportingId === c.id && (
                        <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                          <textarea
                            value={reportReason}
                            onChange={(e) => setReportReason(e.target.value.slice(0, 300))}
                            placeholder="Why are you reporting this?"
                            rows={2}
                            style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 8, color: "var(--color-text-1)", fontSize: 12, resize: "none", fontFamily: "inherit" }}
                          />
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() => { setReportingId(null); setReportReason("") }}
                              style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--color-text-2)", cursor: "pointer", fontSize: 12 }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleReportComment(c.id)}
                              disabled={!reportReason.trim()}
                              style={{ flex: 2, padding: 8, borderRadius: 8, border: "none", background: "var(--color-danger)", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 12, opacity: reportReason.trim() ? 1 : 0.5 }}
                            >
                              Submit Report
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 2 }}>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.slice(0, 500))}
                    placeholder="Add a comment…"
                    rows={2}
                    style={{ flex: 1, minWidth: 0, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 8, color: "var(--color-text-1)", fontSize: 12, resize: "none", fontFamily: "inherit" }}
                  />
                  <button
                    onClick={() => handlePostComment(item.id)}
                    disabled={!draft.trim() || posting}
                    style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 10, border: "none", background: "var(--gradient-primary)", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 12, opacity: !draft.trim() || posting ? 0.5 : 1 }}
                  >
                    {posting ? "Sending…" : "Send"}
                  </button>
                </div>
              </div>
            )}
```

Notes on specific choices, so a reviewer does not have to guess:
- `Avatar size={20}` — `Avatar.jsx:28` scales its initial to `Math.round(size * 0.42)`, so 20 renders an 8px initial, correct for a 12px-font thread row.
- `whiteSpace: "pre-wrap"` + `wordBreak: "break-word"` on the comment body: comments are free text, unlike every existing string in this card. Without `break-word` a pasted URL overflows the 375px-wide card horizontally.
- `fontFamily: "inherit"` on both textareas: browsers default `<textarea>` to a monospace-ish UA font, which would look wrong next to the rest of the card. `SkiBuddyBoard`'s textareas omit it; that is a pre-existing inconsistency there, not one to reproduce here.
- The report form's colors and layout are lifted from `SkiBuddyBoard.jsx:378-394` deliberately — the same affordance should look the same in both places — with `"white"` and `rgba(255,255,255,0.6)` swapped for `var(--color-text-1)`/`var(--color-text-2)` where a token exists.
- `.slice(0, 500)` on the composer and `.slice(0, 300)` on the report reason: the report cap matches Board's existing cap exactly; the comment cap is higher because a comment is the content, not a metadata field. Neither is enforced in the database (`content` is plain `TEXT`) — these are input affordances, and the plan does not add a schema constraint for them.

- [ ] **Step 8: Verify the component's contract and that nothing was orphaned**

Run: `grep -rn "ActivityFeed" src/`
Expected: the component itself, plus `MessagingCenter.jsx` and `TodayScreen.jsx` (an import line and a render line each). Both must still render `<ActivityFeed />` with **no props** — confirm this task added no required prop, or both call sites break silently.

Run: `grep -n "TYPE_COPY\|EMOJIS\|handleReact\|formatSessionStat\|resortName\|timeAgo\|groupCommentsByActivity\|reportContent" src/components/ActivityFeed.jsx`
Expected: every one of these has both its import/definition and at least one use — no dangling import, no orphaned helper.

Run: `grep -n "supabase\|channel\|subscribe" src/components/ActivityFeed.jsx`
Expected: **zero matches.** Decision 5 — no realtime subscription, and this component must not gain its first direct `supabase` import.

- [ ] **Step 9: Build, lint, test**

Run: `npm run build`
Expected: succeeds with no errors and no unused-import warnings.

Run: `npx eslint .`
Expected: at or below the fresh-worktree baseline recorded before Task 1 started.

Run: `npm test`
Expected: unchanged from Task 2's count — this task is pure JSX/presentation and adds no `src/lib` logic.

- [ ] **Step 10: Diff self-check**

Run: `git diff src/components/ActivityFeed.jsx`
Confirm in the diff:
- `TYPE_COPY` (lines 8-14) and `EMOJIS` (line 15) are character-for-character unchanged.
- `handleReact` is unchanged, and every emoji button still calls `handleReact(item.id, emoji)` with the same two arguments — Feed-B touches no reaction behaviour.
- The card header (`Avatar`/`actorName`/`subtitle`) and `bodyLine` from Feed-A are unchanged.
- `reportContent` is called with exactly three positional arguments, the first being the string literal `"activity_comment"`.
- `handleDeleteComment` is reachable only under `isMine`, and the report button only under `!isMine`.
- `expandedId` holds an **activity** id and `reportingId` holds a **comment** id; they are never compared to each other.

- [ ] **Step 11: Commit**

```bash
git add src/components/ActivityFeed.jsx
git commit -m "feat: inline comment thread, count, composer, report and delete on feed cards"
```

State plainly in the task report that verification was `npm test`/`npx eslint .`/`npm run build`/diff review only — no subagent in this environment has browser or Supabase-auth tooling, so no rendered UI was observed.

---

### Task 4: Whole-branch final review + fix wave

Dispatch a review of the full branch diff (all three implementation tasks combined) **on the most capable available model**, per the project's established pattern. This step has caught real cross-task bugs in every prior TASK 22.0 slice: a stale-state save bug and two offseason-data bugs in the Today List slice; a z-index/hitbox/tier-mismatch trio in the Today Map slice; 4 bugs including a tab-switch-killed realtime subscription in the Crews slice; 2 mobile-layout regressions in the Board slice, one of which a per-task reviewer had wrongly adjudicated as "pre-existing"; number-formatting and default-tab bugs in the Leaderboard slice. Do not omit it.

- [ ] **Step 1: Review the full diff**

Review `git diff main...HEAD` (the whole branch, not per-task diffs) against `docs/superpowers/specs/2026-09-01-crew-tab-feed-slice-b-design.md` in full, **plus this plan's two "Spec corrections"** — the spec's Decision 4 is known-wrong about which table gates reporting, and its §3.2 SQL is known-incomplete (no RLS enable), so a reviewer comparing the diff to the spec verbatim would raise two false positives. Specifically check:

- **Security, first and hardest.** `activity_feed_comments` has `ENABLE ROW LEVEL SECURITY` (Correction 2). Its INSERT policy requires **both** `user_id = auth.uid()` **and** `can_see_activity(activity_id)`, not ownership alone. `can_see_activity()` is `SECURITY DEFINER` **and** `STABLE`, has `SET search_path = public`, is `REVOKE`d from `PUBLIC` and `GRANT`ed only to `authenticated`, and reads `activity_feed` only inside the definer function — never inline in a policy (migration 041's near-miss).
- **`can_see_activity()` matches `activity_feed`'s own SELECT rule exactly** — actor-or-friend, and nothing wider. Re-derive it from `pg_policies` on the live database, not from the spec. A helper that is *broader* than the policy it wraps would leak comments on activities the caller cannot see.
- **The reactions fix is scoped to SELECT only.** `"Users manage own activity reaction"` (FOR ALL, `user_id = auth.uid()`) is untouched, and `"Auth users view activity reactions"` is gone. Confirm from `pg_policies`, not from the SQL file. Then reason about the interaction the two policies now have: they are permissive and OR together, so a user can still read their own reaction row on an activity that has become invisible — check that this is what `addActivityReaction`'s select-then-upsert round trip needs, and that it is not a leak.
- **Correction 1 was actually applied and actually works.** `content_reports_target_type_check` includes `'activity_comment'`; `report_content`'s guard includes it; the rest of `report_content`'s body is byte-identical to `migrations/027_report_content_dedupe.sql` (the `ON CONFLICT … DO NOTHING` dedupe and the `EMPTY_REASON` guard both survive). Confirm Task 1 Step 5b's live `report_content('activity_comment', …)` probe returned true.
- **The success case was tested, not just the denials.** Task 1's report must show a friend's `INSERT` into `activity_feed_comments` **succeeding** under an impersonated session, plus a friend reading the comment back, plus a friend reading `activity_feed_reactions` without error. If the report only shows strangers being blocked, this review **fails** — that is precisely the shape of the bug the repo already shipped once. Re-run Step 5b yourself if the evidence is not in the report.
- **Silent-failure surface.** `getActivityComments`'s error is thrown from the data layer and `console.warn`ed (not discarded) at the call site; a failed comment fetch still renders the feed. Trace what a user sees if migration 045 were somehow absent: the fetch fails loudly in the console, counts read 0, threads say "No comments yet", posting warns — the feed itself still works.
- **Grouping and ordering.** `groupCommentsByActivity` sorts oldest-first (the opposite of the feed's newest-first), the query's `.order("created_at", { ascending: true })` agrees with it, and `handlePostComment`'s plain append lands the new comment at the bottom. Trace a card with 3 existing comments through fetch → group → post → render.
- **State-crossing bugs.** `expandedId` (activity id) vs `reportingId` (comment id) are never conflated. `draft`, `posting`, `reportReason` are single shared values that are only correct because exactly one thread is open at a time — verify `toggleThread` clears all of them, and that there is no path where a card can be expanded without going through `toggleThread`.
- **Delete and report gating.** Delete appears only on your own comments, report only on others'. The optimistic delete restores the prior list on failure. Neither is the security boundary — RLS is — but neither should be reachable in the wrong place either.
- **Nothing out of scope crept in.** No photo attachment, no group-level activity card, no nested/threaded replies, no realtime subscription anywhere (`grep -n "subscribe\|channel" src/components/ActivityFeed.jsx` must be empty), no change to `trip_comments`/`TripChatView.jsx`/the trip-chat subsystem, no change to `activity_feed`'s own policies, no edit to `migrations/013`, `026`, `027` or `042`, and no change to reaction behaviour.
- **Row layout at real widths.** Two mobile-layout regressions shipped from the Board restyle, so give this real attention rather than assuming. At ~375px viewport, minus the parent padding, `AccentCard`'s 12px padding each side and its 3px accent border, then the thread row's own 8px padding: does the comment header (20px avatar + name + right-aligned time-ago) hold together for a long display name? Does the composer's textarea + "Sending…" button row fit without the button wrapping or shrinking? Does a pasted URL in a comment body break rather than overflow? Check the `+ count` badge does not push the 💬 button off the divider row when four reaction counts are also showing.
- **Both mount sites.** `MessagingCenter.jsx` (Crew tab → Feed) and `TodayScreen.jsx` (Today tab → Friends section, from TASK 22.5) both render `<ActivityFeed />` bare. Confirm no required prop was added, and sanity-check that a card that can now grow by a whole expanded thread does not break `TodayScreen`'s section layout, which sits inside a scrolling page rather than a dedicated tab pane.
- **Test/lint baseline.** `npm test` and `npx eslint .` are at or better than the fresh-worktree baseline recorded before Task 1 started, with `npm test` up by exactly the 8 new `activityComments.test.js` cases.

- [ ] **Step 2: Fix any findings**

Apply fixes for everything the review surfaces, in a single consolidated fix-wave commit (not one commit per finding), same pattern as every prior slice. Re-run `npm test` / `npx eslint .` / `npm run build` after fixing. If a finding requires a migration change, apply it as a **new** statement set via `mcp__claude_ai_Supabase__apply_migration` and edit `045_activity_feed_comments.sql` to match, then re-run Task 1 Steps 4-6's verification queries in full — including the success case.

- [ ] **Step 3: Commit the fix wave (only if there were findings)**

```bash
git add -A
git commit -m "fix: final-review fix wave — Feed sub-tab slice B"
```

- [ ] **Step 4: Report final state**

Record in the task report:
- Final `npm test` pass count and final `npx eslint .` problem count, against the fresh-worktree baseline recorded at the start.
- **Both spec corrections**, so they can be folded back into the spec or noted in ROADMAP.md: (1) Decision 4 named `moderation_flags` but the report path goes through `content_reports`, which is allowlisted in two places and needed widening — reporting a comment was **not** a no-schema-change wiring job; (2) §3.2's SQL omitted `ENABLE ROW LEVEL SECURITY` on the new table, which would have left it world-readable and world-writable.
- The live RLS evidence: the friend-can-comment success result and the stranger-is-blocked denial results, quoted from Task 1's report.
- An explicit statement that **no subagent in this build had browser or Supabase-auth tooling** — UI verification was tests/lint/build/diff-review only. The migration task was the one exception and did use real database tooling.
- The standing gap for Kyle, per the spec's §7.4: a live multi-account click-through — posting a comment, seeing a friend's comment, deleting your own, reporting someone else's, and confirming a non-friend genuinely cannot read or post comments on an activity they cannot see — is the actual security property this slice exists to establish, and no source review replaces it. **Do not push to `main` before that** (it auto-deploys to `powdays.app` live, with no staging step).

---

## Self-Review Notes (for the plan author, already applied above)

- **Spec coverage:** §3.1 (table + index) → Task 1 Step 1. §3.2 (`can_see_activity()`, the 3 comment policies, the reactions SELECT replacement) → Task 1 Step 1, verified in Steps 4-5. §3.3 (`getActivityComments`/`addActivityComment`/`deleteActivityComment`, batched, profile-resolved) → Task 2 Step 5. §3.4 (batch fetch in the same effect, grouping, the count button, the inline thread, composer, report, delete, no subscription) → Task 3 Steps 3-7. §4's architecture table → this plan's File Structure, same rows plus the two mount sites and the three precedent migrations. §5's constraints → Global Constraints, with the lint baseline number corrected to the observed one. §6's out-of-scope list → Task 4 Step 1's "nothing out of scope crept in" item. §7's four verification steps → §7.1 in Task 1 Steps 2-6, §7.2 in every task's build/lint/test steps, §7.3 in Task 4 Step 1, §7.4 in Task 4 Step 4. Decisions 1-7 all land: 1 → Task 1; 2 → Task 3 Step 7 (ResponseThread's shape, not TripChatView's); 3 → Task 3 Step 6; 4 → Task 1 (with Correction 1) + Task 3 Steps 4/7; 5 → Task 3 Step 3 + Step 8's zero-match grep; 6 → Task 2's batched `getActivityComments` + Task 3's single effect; 7 → Task 1's delete policy + Task 3's `isMine` branch.
- **Two documented spec corrections, both verified against the live database rather than the migration files alone:** Decision 4's wrong table (reporting genuinely needs a schema change) and §3.2's missing `ENABLE ROW LEVEL SECURITY`. Both are flagged in a dedicated section at the top, applied in Task 1's SQL, verified by a named query in Task 1 Step 4, probed live in Step 5b, and re-checked as review items in Task 4 Step 1.
- **Verified-as-written, so no false corrections were introduced:** `045` is free; the reactions policy name string is exact; `are_friends()`'s body reproduces `activity_feed`'s inline friendship clause character-for-character, so `can_see_activity()` is genuinely a wrapper and not a widening.
- **Type consistency checked:** the row shape `{ id, activity_id, user_id, content, created_at, profiles }` is identical across Task 1's `CREATE TABLE` + embed target, Task 2's three selects and its test fixtures, and Task 3's `c.id`/`c.user_id`/`c.content`/`c.created_at`/`c.profiles` reads. `groupCommentsByActivity` is spelled identically in its definition, its test import, and its `ActivityFeed.jsx` import and call. `getActivityComments`/`addActivityComment`/`deleteActivityComment` match between Task 2's definitions and Task 3's import block. `reportContent("activity_comment", commentId, reason)`'s three positional args match `socialApi.js:218`'s existing signature and the string matches the value added to both allowlists in Task 1. `comments` is `Record<activity_id, Row[]>` everywhere; `expandedId` is always an activity id and `reportingId` always a comment id.
- **RLS testing discipline:** Task 1 Step 5b is a success-case test that performs a real `INSERT` under an impersonated friend session and reads the row back, and it is called out again as a *blocking* item in Task 4's review. The impersonation technique (`SET LOCAL role authenticated` + `SET LOCAL request.jwt.claims`) was proven working through the Supabase MCP tool before this plan was written, and the production database has real fixtures for it (4 accepted friendships, 11 activity rows, 6 users). Step 6 confirms the probes left nothing behind.
- **No placeholders:** every step has complete, real code or a complete, real query with its expected output — no "add appropriate styling", no "handle errors", no "similar to Task N", no deferred detail.
