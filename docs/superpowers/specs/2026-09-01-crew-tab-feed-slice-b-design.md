# Design — Crew Tab: Feed Sub-Tab, Slice B of 3 (Comments)

**Date:** 2026-09-01
**Status:** Approved for planning
**Origin:** ROADMAP.md TASK 22.0, continuing the Feed sub-tab work after Feed-A (shipped and
live). Feed's mockup implied several genuinely new subsystems (comments, photo attachments,
group-level cards) too large for one slice; Kyle decomposed into **Feed-A (done) → Feed-B (this
spec) → Feed-C (photos)**, with group-level cards backlogged separately.

## 1. The problem

Unlike Feed-A, the mockup gives almost nothing to build toward here: `PowDays Reorg Mockup.dc.html`'s
only comment-related content is a single static button (a speech-bubble icon + the word
"Comment") with zero built-out behavior — no count, no thread, no composer, nothing in the
interactive prototype's data model. There is no comments table anywhere related to the activity
feed, and no comment UI anywhere in the app to route to.

**A directly relevant precedent exists elsewhere, and it comes with a real lesson attached.**
`trip_comments` (the trip-level chat) originally had `SELECT USING (true)` — readable by *any*
authenticated user, not just people on the trip. Kyle found this and fixed it in migration 042
across 7 trip-content tables at once, replacing the open policies with `SECURITY DEFINER STABLE`
helper functions (`can_see_trip_content()`, etc.) that check real membership without reading an
RLS-protected table inline (the exact mistake migration 041 nearly shipped). **The identical
vulnerability class exists right now, live, on `activity_feed_reactions`** — its SELECT policy is
`USING (true)`, so any authenticated user can read any reaction regardless of friendship. Lower
stakes than comments (an emoji + user_id, not free text), but the same pattern.

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Fix `activity_feed_reactions`' open RLS in the same migration as the new comments table**, not as a separate future task. | Kyle's choice. Same reasoning as migration 042 itself: fix the whole vulnerability class discovered while building something adjacent, rather than leaving a known-identical gap next door. `activity_feed`'s existing SELECT policy (actor-or-friend) is the correct rule; a new `can_see_activity(activity_id)` helper (built on the already-existing `are_friends()`) applies it to both tables. |
| 2 | **Comments expand inline under the card**, same shape as `SkiBuddyBoard.jsx`'s `ResponseThread` (name, time-ago, text, a lightweight composer) — not `TripChatView`'s full chat-bubble screen. | Kyle's choice. `TripChatView` is built for a dedicated full-screen trip chat with media messages and realtime; a feed card's comment thread is a much lighter interaction, and `ResponseThread` is the app's existing pattern for exactly that shape. |
| 3 | **The Comment button shows a count**, matching the kudos button beside it. | Kyle's choice. Without a count, a new comment is invisible until every card is expanded — undiscoverable. |
| 4 | **Comments are reportable** via the existing `reportContent("activity_comment", commentId, reason)` path. **Correction, added at plan time: this DOES need a schema change**, not just wiring. | Kyle's choice on the feature; the "no schema change" rationale was wrong. `reportContent()` calls the `report_content` RPC, which writes to **`content_reports`** — not `moderation_flags` (a different table, written only by the server's service-role moderation endpoint, uninvolved in this path). `content_reports.target_type` has a real CHECK constraint (`migrations/026_verification_infrastructure.sql:17`, `IN ('post','response','profile','username')`), and `report_content` itself has a second, redundant guard raising `INVALID_TARGET_TYPE` for anything outside that same list (`migrations/027_report_content_dedupe.sql:14`). Both had to be widened to include `'activity_comment'` in the migration, or every report attempt would throw and fail silently behind the existing swallowed-catch pattern this code already copies from `SkiBuddyBoard.jsx`. |
| 5 | **No realtime subscription.** Comments refresh via refetch (after posting), not a live channel. | Consistent with Feed-A's own no-subscription stance, and deliberately avoiding the "subscription inside a component that unmounts on tab-switch" bug class that has already bitten this app once (Crews slice) and nearly a second time. |
| 6 | **All comments for visible feed items are batch-fetched upfront**, grouped client-side by `activity_id` — same pattern `getActivityReactions()` already uses, not a per-card lazy fetch on expand (`ResponseThread`'s own pattern, used there because a Board post's response thread can be arbitrarily deep and is owner-only). Feed comments are a flat, lightweight list; one batched query for all 30 visible items avoids 30 round-trips if every card were expanded. | Matches the shape of the data (flat, small) to the shape of the existing analogous fetch (`getActivityReactions`), rather than importing `ResponseThread`'s lazy pattern where it doesn't fit. |
| 7 | **Own-comment deletion is included**, mirroring `trip_comments`' existing DELETE policy (`user_id = auth.uid()`). | Free to include — same RLS shape as the reference table — and matches the ordinary expectation that you can remove your own comment. |

## 3. The design

### 3.1 Schema (migration `045_activity_feed_comments.sql`)

```sql
CREATE TABLE IF NOT EXISTS activity_feed_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID REFERENCES activity_feed(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_feed_comments_activity ON activity_feed_comments (activity_id);
```

Same shape as `trip_comments` (§1), scoped to `activity_feed` instead of `ski_trips`.
**Correction, added at plan time:** this table needs `ALTER TABLE activity_feed_comments ENABLE
ROW LEVEL SECURITY;` immediately after creation. Supabase grants `authenticated` full DML on new
`public`-schema tables by default, so the §3.2 policies below are inert without it — the table
would be world-readable *and* world-writable to any logged-in user until this line runs.
`migrations/013_activity_feed.sql` includes the equivalent line for `activity_feed`/
`activity_feed_reactions`; a brand-new table needs its own.

### 3.2 RLS — the `can_see_activity()` helper, applied to two tables

```sql
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
```

Mirrors `can_see_trip_content()`'s exact shape and `activity_feed`'s own existing SELECT policy
rule (actor-or-friend, from `migrations/013_activity_feed.sql`) — not a new visibility rule, a
reusable wrapper around the one that already exists.

**On `activity_feed_comments`** (new table):
```sql
CREATE POLICY activity_feed_comments_select ON activity_feed_comments
  FOR SELECT TO authenticated USING (public.can_see_activity(activity_id));

-- Posting needs the same standing as reading — same lesson migration 042 already recorded
-- for trip_comments ("It was only 'the row is mine', so an outsider could write into any
-- trip's conversation"). A stranger who somehow obtains an activity_id must not be able to
-- comment on an activity they cannot see.
CREATE POLICY activity_feed_comments_insert ON activity_feed_comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_see_activity(activity_id));

CREATE POLICY activity_feed_comments_delete ON activity_feed_comments
  FOR DELETE TO authenticated USING (user_id = auth.uid());
```

**On `activity_feed_reactions`** (existing table, Decision 1):
```sql
DROP POLICY IF EXISTS "Auth users view activity reactions" ON activity_feed_reactions;
CREATE POLICY activity_feed_reactions_select ON activity_feed_reactions
  FOR SELECT TO authenticated USING (public.can_see_activity(activity_id));
```
The existing `"Users manage own activity reaction"` policy (INSERT/UPDATE/DELETE, already scoped
to `user_id = auth.uid()`) is unchanged — only the open SELECT policy is replaced. (Note:
reactions' own INSERT doesn't need a `can_see_activity` check added the way comments' does,
because reacting to an activity you can't see is already a no-op with no information disclosure —
unlike a comment, a reaction reveals nothing if you can't also read the activity it's attached
to. Not touching it keeps this fix minimal and matches what's actually broken.)

### 3.3 Data layer (`src/lib/socialApi.js`)

Three new functions, alongside the existing `getActivityFeed`/`getActivityReactions`/
`addActivityReaction`:

- `getActivityComments(activityIds)` — batched, same shape as `getActivityReactions(activityIds)`:
  selects `id, activity_id, user_id, content, created_at` from `activity_feed_comments` where
  `activity_id IN (...)`, plus a resolved `profiles` join (mirroring `getActivityFeed`'s existing
  `profiles:actor_id(...)` embed) so each comment can show its author's name/avatar without a
  third query.
- `addActivityComment(activityId, content)` — inserts one row, returns it (with profile resolved
  the same way, or resolved client-side from the current user's already-known profile).
- `deleteActivityComment(commentId)` — deletes one row; RLS enforces ownership, no need for an
  extra ownership check in the JS layer.

### 3.4 UI (`ActivityFeed.jsx`)

- All comments for the loaded page of activities are fetched once, alongside reactions, in the
  same `useEffect` that already fetches `getActivityFeed`/`getActivityReactions` — grouped into
  `{ [activity_id]: [...] }` the same way reactions already are.
- A new "💬 {count}" button sits next to the reactions row (or inline with it — implementer's
  layout call within the mockup's general divider-row language already established in Feed-A).
  Tapping it toggles an expanded inline thread for that card: each comment (avatar, name,
  time-ago, text, a "Report" affordance mirroring `SkiBuddyBoard.jsx`'s existing report-inline-
  form pattern for non-owners), plus a composer (textarea + Send) at the bottom, matching
  `ResponseThread`'s existing visual language rather than inventing a new one.
- Posting a comment appends it optimistically (or refetches just that activity's comments) and
  clears the composer. No subscription, no auto-refresh timer (Decision 5).
- Deleting your own comment removes it from the local state after a successful RLS-enforced
  delete.

## 4. Architecture

| File | Responsibility |
|---|---|
| `migrations/045_activity_feed_comments.sql` | *new* — `activity_feed_comments` table + index; `can_see_activity()` helper; RLS on the new table; RLS fix on `activity_feed_reactions` |
| `src/lib/socialApi.js` | *modify (additive)* — `getActivityComments`, `addActivityComment`, `deleteActivityComment` |
| `src/components/ActivityFeed.jsx` | *modify* — comment fetch/group alongside reactions, comment-count button, inline expandable thread + composer + report/delete affordances |
| `src/components/SkiBuddyBoard.jsx` | *unmodified* — `ResponseThread`'s visual pattern is a reference, not a shared component (it's tightly coupled to Board's own post/response data shape, same reasoning that kept it un-extracted originally) |
| `src/lib/format.js`, `src/lib/leaderboardApi.js` | *unmodified* |

## 5. Constraints inherited from the repo

- No new npm dependencies.
- Inline `style={{}}` objects; colors via `var(--color-*)` tokens for anything semantic/stateful.
- Migration numbering: next is `045` (`044_crew_photos.sql` is the last one in `migrations/`).
- **RLS policy discipline, per the repo's own recorded lessons:** never read an RLS-protected
  relation inline inside another policy (migration 041's near-miss) — always go through a
  `SECURITY DEFINER STABLE` helper. **Test the success case, not just denials** — migration 041's
  first version refused every legitimate member action while passing every "strangers are
  blocked" test; any test suite for this migration must assert a friend's comment/reaction
  actually succeeds, not just that a non-friend's is refused.
- Re-verify the test/lint baseline in a fresh worktree at build time — last recorded (Feed-A,
  2026-09-01): 157 tests / 89 lint problems, both due for re-verification here.
- No subagent in this environment has browser or Supabase-auth tooling — every task, and the
  final whole-branch review, are verified via `npm test`/`npx eslint .`/`npm run build`/diff
  review only, **plus this slice's migration needs to be applied via the Supabase MCP tool and
  verified with a read-only query**, same as every prior slice that touched schema (Crews'
  `photo_url` column). Kyle does the real click-through after it ships.
- Ask before pushing to `main` — it auto-deploys to `powdays.app` live, no staging step.

## 6. Out of scope

- **Feed-C (photo attachments)** — separate future spec/plan.
- **Group-level activity cards** — backlogged.
- **Realtime comment updates** — declined (Decision 5).
- **Any change to `trip_comments`, `TripChatView.jsx`, or the trip-chat subsystem** — reused only
  as a schema/RLS reference, not modified.
- **Nested/threaded replies to comments** — a flat per-activity list, matching the mockup's own
  minimal implication (a single "Comment" affordance, not a reply-to-reply structure).

## 7. Verification

1. Migration applied via the Supabase MCP tool (`apply_migration`), verified with a read-only
   query confirming the table, index, helper function, and all 4 policy changes exist as
   expected.
2. `npm test`/`npx eslint .`/`npm run build` at or better than the fresh-worktree baseline.
3. Diff review confirms: `can_see_activity()` matches `activity_feed`'s own SELECT rule exactly;
   comments' INSERT policy requires both ownership AND visibility (not ownership alone); the
   reactions RLS fix touches only its SELECT policy, not INSERT/UPDATE/DELETE; the UI's comment
   count/thread/composer/report/delete all wire to the new functions correctly; no realtime
   subscription was added anywhere.
4. Kyle does the real authenticated click-through after it ships — commenting, seeing a friend's
   comment, deleting your own, reporting someone else's, and confirming a non-friend genuinely
   cannot read or post comments on an activity they can't see (the actual security property this
   slice exists to establish) all need a live multi-account check no source review can fully
   replace.
