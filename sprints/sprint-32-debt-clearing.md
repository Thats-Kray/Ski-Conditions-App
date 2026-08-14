# Sprint 32 — Debt Clearing (TASK 15.1 + defects + nav reorg)

**Planned:** 2026-08-13 (Opus, plan mode)
**Execution model:** Opus plans → Sonnet implements bounded slices → Sonnet reviews → Opus only on escalation.
Per `Claude Code - Opus Planning Mode.md`. Reusable agent definitions now live in `.claude/agents/`.

## Why this sprint

Three unrelated pieces of debt with clean file boundaries. The gating item is TASK 15.1:
`ski_buddy_posts.is_held_for_review` can be set `true` by the moderation route but never back to `false`,
so `OPENAI_API_KEY` cannot safely go live — a false-positive flag would hide a post permanently.

## Non-goals (explicit)

- No moderation *queue* UI reading `content_reports` / `moderation_flags`. Owner-only release surface only.
- No notification to a post's author on release. Deferred (ROADMAP 15.1 bullet 3) — revisit when notifications are reworked.
- No auto-decline of sibling responses, no `getMySkiBuddyPosts()` caller, none of the other Sprint 31 Minor deferrals.
- Not setting `OPENAI_API_KEY`. That is a separate manual step *after* this sprint merges.
- No native iOS widget, no live-tracking UI. Different sprint.

## Known failure modes in this codebase — check every task

1. **Postgres CHECK constraints pass on NULL.** `array_length()` on an empty array returns NULL, not 0. Wrap in `COALESCE`.
2. **RLS `GRANT UPDATE` defaults to full-row.** If only one column should be writable, use `GRANT UPDATE (col)`.
3. **User-driven async fetches need a cancellation guard.** Pattern established in `MountainBoard.jsx`.
4. **A `SECURITY DEFINER` RPC must re-check every gate its siblings enforce.** `respond_to_ski_buddy_post` shipped
   without an `is_held_for_review` check and it took a whole-branch review to catch.

---

## TASK 1 — `migrations/029_admin_moderation_release.sql`  *(no file conflicts; run first)*

Add an admin capability and the release path for held posts.

**Acceptance criteria**
- `profiles.is_admin BOOLEAN NOT NULL DEFAULT false`.
- An `is_admin()` helper mirroring `is_verified()` from `026_verification_infrastructure.sql` — read that file
  and match its shape exactly (`SECURITY DEFINER`, explicit `search_path`, `REVOKE ALL ON FUNCTION ... FROM public`,
  scoped `GRANT EXECUTE`).
- `release_held_post(p_post_id uuid)` — `SECURITY DEFINER`. Must raise/return an error for a non-admin caller.
  Sets `is_held_for_review = false` on that `ski_buddy_posts` row. Idempotent: releasing an already-released
  post is a no-op success, not an error.
- `get_held_posts()` — `SECURITY DEFINER`, admin-only. **Required**: RLS hides held posts from everyone except
  their owner, so without this the admin surface has nothing to render. Returns held posts with enough columns
  to identify them (id, user_id, resort, date, description/message, created_at).
- Do **not** widen any RLS policy to accomplish this. All access goes through the RPCs.
- No `GRANT UPDATE` on `ski_buddy_posts` is added or broadened by this migration.

**Verification (required before reporting done)**
- Apply to the live Supabase project via the Supabase MCP `apply_migration`.
- Read back: confirm `profiles.is_admin` exists, and that calling `release_held_post` as a non-admin fails.
- Set `is_admin = true` for `raykyle1104@gmail.com` and report the statement used.

**Files:** `migrations/029_admin_moderation_release.sql`

---

## TASK 2 — Admin release surface  *(depends on Task 1's RPC names only, not its files)*

**Acceptance criteria**
- Three functions added to `src/lib/socialApi.js`, matching the file's existing error/return conventions:
  `getHeldPosts()`, `releaseHeldPost(postId)`, and an admin check (`getMyAdminStatus()` or equivalent —
  reuse the existing profile fetch if one already returns the row, rather than adding a round trip).
- New `src/components/ModerationQueue.jsx` — lists held posts, one "Release" button each, optimistic removal
  from the list on success, visible error state on failure (Sprint 31 shipped a silent-failure report path; don't repeat it).
- Rendered inside the **existing owner-only dev area in `MountainBoard.jsx`**, next to the "🔒 Test Verification Gate"
  button (the `currentUserEmail === OWNER_EMAIL` block at ~line 153). This surface is already established and is
  independent of Task 3's file changes.
- Gate rendering on the server-side admin check, not only on `OWNER_EMAIL`. The email constant may stay as the
  cheap client-side render hint, but the authoritative gate is the RPC.
- Empty state: "No posts held for review." Do not render an empty panel.
- Theme tokens (`var(--color-*)`), not hardcoded colors.

**Files:** `src/lib/socialApi.js`, `src/components/ModerationQueue.jsx` (new), `src/components/MountainBoard.jsx`

---

## TASK 3 — Move Ski Buddy board to Social, rename to Community  *(fully independent)*

**Acceptance criteria**
- `SkiBuddyBoard` is removed from the Snow tab's sub-nav in `App.jsx` (the `buddy` / "🎿 Buddy" entry ~line 1742).
  Snow tab retains exactly: 🏔️ Snow, 🗺️ Map, 📋 Board.
- It becomes a 4th section in `FriendsPage.jsx`, alongside the existing `leaderboard` / `crews` / `friends`
  sections (~lines 374-376), labeled **"🎿 Community"**. Match the existing section-switching mechanism exactly —
  do not introduce a second pattern.
- Any props `SkiBuddyBoard` received from `App.jsx` must still reach it through `FriendsPage`. Trace them; do not assume.
- No user-facing string "Buddy" remains. Internal identifiers (`SkiBuddyBoard`, `ski_buddy_posts`, `skiBuddyOptions.js`,
  RPC names) are **not** renamed — DB objects and file names stay as they are. Label text only.
- Deep links / tab state: if anything persists the active Snow sub-tab, confirm a stored `"buddy"` value doesn't
  strand a returning user on a tab that no longer exists.

**Files:** `src/App.jsx`, `src/components/FriendsPage.jsx`

---

## TASK 4 — Two defects from `defects/defects-1`  *(fully independent)*

### 4a — Milestone popups repeat (defect #2, Functionality)

Root cause, already diagnosed — do not re-investigate: `ProfilePage.jsx:612-614` queues every newly-crossed
milestone, but `dismissMilestone()` (`:637-641`) writes to localStorage one at a time as each is individually
closed. A user who closes 2 of 5 and navigates away leaves 3 unmarked; they reappear on the next visit.
The read key and write key are both `pd_milestones_shown_${startYear}` and both derive from `getCurrentSeason()` —
the keys match, that is not the bug.

**Acceptance criteria**
- Mark the entire newly-crossed batch as shown at the moment it is queued (`:614`), not on individual dismissal.
- `dismissMilestone()` still advances the queue; it no longer needs to be the thing that persists.
- Re-mounting `ProfilePage` after a partially-dismissed queue must show zero milestone modals.
- Preserve the existing try/catch silent-failure behavior for disabled/private-mode localStorage.

### 4b — Notification popup clipped on the left (defect #1, Cosmetic)

`NotificationBell.jsx:233-267` renders an absolutely-positioned dropdown (`right: 0`, `width: 340`,
`maxWidth: calc(100vw - 32px)`). It is clipped by `overflow: "hidden"` on an ancestor at
`MessagingCenter.jsx:552`.

**Acceptance criteria**
- Popup is fully visible on a 375px-wide viewport with no horizontal clipping and no horizontal page scroll.
- Do **not** simply delete the ancestor's `overflow: hidden` without checking what it was containing —
  it is likely there to clip a scrolling list or rounded corners. Prefer changing how the popup is positioned
  (e.g. portal / fixed positioning) over removing the ancestor's containment. If removing it genuinely is the
  right call, say what it was clipping and why removal is safe.
- No change to bell behavior, unread counts, or open/close logic.

**Files:** `src/components/ProfilePage.jsx`, `src/components/NotificationBell.jsx`, `src/components/MessagingCenter.jsx`

---

## Execution order

1. **Task 1** alone (migration must be live before Task 2 can verify).
2. **Tasks 3 and 4** in parallel with Task 1 — no shared files, no shared state.
3. **Task 2** after Task 1 lands.
4. Whole-branch **Sonnet** review before merge. Escalate to Opus only if review finds a Critical issue or a
   fix loop fails twice.

## File conflict map (verified disjoint)

| Task | Files |
|------|-------|
| 1 | `migrations/029_*.sql` |
| 2 | `socialApi.js`, `ModerationQueue.jsx` (new), `MountainBoard.jsx` |
| 3 | `App.jsx`, `FriendsPage.jsx` |
| 4 | `ProfilePage.jsx`, `NotificationBell.jsx`, `MessagingCenter.jsx` |

## Definition of done

- `npm run lint` clean.
- Migration 029 applied live and read back.
- ROADMAP.md: TASK 15.1 checked off, Section 15 Outstanding item 1 resolved, Section 16 added for the nav/defect work.
- `defects/defects-1` entries 1 and 2 marked Status: Fixed.
- `OPENAI_API_KEY` still unset — flag to Kyle that it is now safe to set.
