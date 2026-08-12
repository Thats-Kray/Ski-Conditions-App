# Sprint 31 — Ski Buddy Board

**Depends on:** Sprint 30 (`is_verified()` must exist and work)
**Reference docs:** PRD-Ski-Buddy-Board.md, Technical-Spec-Ski-Buddy-Board.md (Part B)

## Pre-flight check

Before writing any code, confirm:
- [ ] Sprint 30's `is_verified()` RPC is live and tested
- [x] ~~Arapahoe Basin fix from Sprint 29 has landed~~ — **[Reconciled 2026-08-12]** confirmed already landed (`src/lib/resorts.js` has `arapahoebasin` in all four display maps; Sprint 29 is fully merged). No action needed here.

## Objective

Ship the public matchmaking/carpool board: post creation, browsing/filtering, and responding, gated on Tier 1 verification per Sprint 30's infrastructure.

## Scope

1. **Postgres migration**: `ski_buddy_posts`, `ski_buddy_responses` tables (Technical Spec Part B.1)
2. **RLS + RPCs**: public `select` policy (Tier 0+) on both tables; gated writes via new `SECURITY DEFINER` RPCs (`create_ski_buddy_post`, `respond_to_ski_buddy_post`) that call `is_verified(auth.uid())` internally — **[Reconciled]** changed from direct RLS insert policies to match Sprint 29's actual convention (`create_board_post`/`report_board_post` — no insert policies, all writes through RPCs). See Technical Spec Part B.2.
3. **Server-side moderation hook** on post `description` insert, using Sprint 30's moderation wiring — held-for-review state, not silent rejection
4. **New API functions in `socialApi.js`**:
   - `createSkiBuddyPost(postData)` — calls the `create_ski_buddy_post` RPC
   - `getSkiBuddyPosts(filters)` — **[Reconciled]** must resolve `profiles` via a separate query, not a PostgREST embed (`ski_buddy_posts.user_id` only references `auth.users`); same fix already applied to `getBoardPosts()` in `socialApi.js`
   - `respondToSkiBuddyPost(postId, message)` — calls the `respond_to_ski_buddy_post` RPC
   - `updateSkiBuddyPostStatus(postId, status)`
5. **New components**:
   - `SkiBuddyBoard.jsx` — filterable list view (pass type, resort, date, riding style, carpool status)
   - `PostSkiBuddyForm.jsx` — creation form; triggers `VerificationUpgradeModal` from Sprint 30 if user is Tier 0
   - Response UI on each post (accept/decline, reusing the RSVP interaction pattern from crew invites where sensible)
6. **Wiring**: add to `App.jsx` Snow tab sub-nav alongside Mountain Board
7. **Auto-expiry**: posts move to `status = 'expired'` the day after `ski_date` — implement as either a scheduled function or a computed check in `getSkiBuddyPosts()` (simplest first; don't over-engineer a cron job for v1)

## Explicitly out of scope for this sprint

- Multi-day post ranges
- Real-time chat/messaging (responses are async, not live)
- Showing approximate carpool origin location (privacy tradeoff — separate decision)
- Admin review queue UI, unless Sprint 30 deferred it — in which case it needs to land before this ships to real users, since reports need somewhere to go

## Testing checklist

- [ ] Tier 0 user can browse the board but posting/responding routes them to the verification modal
- [ ] Tier 1 user can post, filter, and respond end-to-end
- [ ] A post with moderation-flagged description lands in a held state, visible to its author as "under review," not silently missing
- [ ] Expired posts drop out of default view but remain in the DB (no hard delete)
- [ ] Resort dropdown correctly includes Arapahoe Basin (already true as of the current `resort_coordinates` data — regression-check only)

## Definition of done

A Tier 1 verified user can post a listing, a second Tier 1 user can find it via filters and respond, and the original poster can accept the response — all without touching the existing friend/crew/plan systems.
