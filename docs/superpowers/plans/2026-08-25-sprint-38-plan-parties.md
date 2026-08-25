# Sprint 38 — Plan parties: same mountain, separate crews

## Context

Kyle tested Sprint 37 on two accounts and reported: account one could "jump into" account
two's ski plan without an invite.

The first diagnosis was that this is the feature working as designed — and mechanically that
is true. `daily_plans` is `UNIQUE (user_id, ski_date)`, so "I'm in" never touched account
two's row; it wrote account one's own row for the same mountain. Nothing was joined, because
there is nothing to join.

**But the report was right and the model is wrong.** Kyle:

> "Multiple groups will go to the same mountain, but they typically stay with their core crew,
> then link up with other friends' crews. If user 2 wasn't invited to a plan, they can still go
> to the same mountain, but they should not automatically be added to user 1's crew."

The app currently conflates two different things into one card:

| Concept | Ownable? | Should be gated? |
|---|---|---|
| **Which mountain I'm skiing** | No — Copper belongs to nobody | **No.** Anyone can ski Copper; the plan editor lets you pick it directly, so any gate here is bypassable in two taps and would mean asking permission to record your own weekend. |
| **Who I'm skiing WITH** | **Yes** — a party has an owner | **Yes.** This is the real object, and joining it should require an invite or an approved request. |

So the calendar keeps showing where everyone is going (that is the flagship discovery view and
it stays). What changes is that a mountain card stops implying one undifferentiated group.

**The lucky part: the invite half already exists.** `crew_invites` is misnamed — it has no
`crew_id`. Its columns are `inviter_id, invitee_id, resort_key, ski_date, departure_time,
seats_available, message, status`, i.e. it is already a per-day ski invite, and
`respondToCrewInvite` already writes the invitee's `daily_plans` row on accept (the path
repaired in Sprint 37 TASK 19.6). What is missing is the *party*, the *request* direction, and
the calendar rendering.

---

## The model

- **Plan** (`daily_plans`) — my mountain for a day. One row per user per day. **Never gated.**
- **Party** (new) — the people skiing together that day. Has an owner. Join by invite or by
  approved request.
- A plan belongs to **at most one** party. Being at the same mountain implies nothing.

A mountain card becomes: `Copper — 9 going · 3 groups`, listing each party plus unaffiliated
skiers, rather than one flat headcount.

---

## Task 1 — Migration 037: parties

New table, one new column, and the `crew_invites` rename question.

```sql
CREATE TABLE plan_parties (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ski_date   DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, ski_date)          -- you host at most one party per day
);

ALTER TABLE daily_plans ADD COLUMN party_id UUID REFERENCES plan_parties(id) ON DELETE SET NULL;
```

`ON DELETE SET NULL`, not CASCADE: disbanding a party must not delete its members' ski plans.

**RLS.** Follow the established pattern exactly — a `STABLE SECURITY DEFINER SET search_path
= public` helper, `REVOKE ALL ... FROM PUBLIC`, `GRANT EXECUTE ... TO authenticated`, and
**never an inline `EXISTS` on another RLS-protected relation** (this is why
`20260515_crew_rls_fix.sql` and `022_fix_kramesbutte_rls_auth_users.sql` exist). Needs
`public.shares_party_with(p_other UUID)`.

**Party membership grants visibility — scoped to that ONE day. (Kyle, 2026-08-25.)**

> "If user 1 joined their friend, user 2's ski plan, user 3 is not a friend, but yes that means
> they get to see user 3's plans for that specific ski plan. The rest of user 3's ski
> plans/calendar are not visible, until they become friends on the app."

So being in a party together reveals exactly the rows for that party's date, and nothing else.

**THE TRAP, and it is the whole feature.** The helper MUST be date-scoped:

```sql
public.in_my_party(p_other UUID, p_date DATE) RETURNS BOOLEAN
```

A `shares_party_with(p_other)` returning "have we ever shared a party" would be evaluated per
row against the *person*, not the *day*, and would expose user 3's ENTIRE calendar forever
after a single shared Saturday — precisely the thing this ruling excludes. If you find yourself
writing a party helper that takes one argument, stop.

This branch sits OUTSIDE the visibility check, so it also overrides `private`. That is correct
and safe because party membership is consensual in both directions: the owner either invited
you or approved your request, so they have already chosen to reveal that day to you. A day you
marked Private stays hidden from everyone you have not brought into the party.

Non-blocker, verified: `profiles` are world-readable (see `033:50`), so a non-friend party
member's name and avatar resolve normally. No profile-visibility work is needed.

**This migration must absorb TASK 19.1** (per-crew visibility), because both rewrite the same
policy. 19.1's trap still applies and is the reason to be careful: `032:101-109` keys off
`visibility <> 'private'` — a **blacklist of one value**, so any new visibility value is
readable by all friends and crewmates. Rewrite it as a **whitelist**. Also drop the dead
`group_id` column and the `'groups'` CHECK value (TASK 18.1); note the visibility CHECK **has
no name in the repo** (`daily_plans` predates `migrations/001`), so use a `DO` block over
`pg_constraint` rather than guessing the name.

Per migration 036's lesson, revoke from `anon` as well as `authenticated`.

## Task 2 — Requests: the other direction

`crew_invites` covers owner → invitee. Ask-to-join is invitee → owner.

Rather than a second table, add `kind TEXT NOT NULL DEFAULT 'invite' CHECK (kind IN
('invite','request'))` to `crew_invites`. A request is the same row with the direction
reversed and `kind='request'`; approving it runs the same accept path.

**Do NOT rename `crew_invites` in this sprint.** It is misnamed, but it is live, it has RLS
policies (035), and renaming it touches every reader while the real work is happening. Log the
rename as its own task.

## Task 3 — API

In `src/lib/socialApi.js`:

- `createParty(skiDate)` — lazily, when the owner first invites someone.
- `requestToJoinParty(partyId, message)` — writes a `kind='request'` row.
- `respondToPartyRequest(id, status)` — on accept, sets the requester's
  `daily_plans.party_id`. **Must route through `buildPlanUpsert()`** — see below.
- Extend `respondToCrewInvite` so accepting also sets `party_id`.
- `leaveParty(skiDate)` — clears my `party_id`.

**THE invariant, non-negotiable:** `upsertDailyPlan` writes the WHOLE row, so every write goes
through `buildPlanUpsert()` in `src/lib/planUpsert.js`. There are currently **five** writers.
Anything here that touches `daily_plans` becomes the sixth — add `party_id` to
`buildPlanUpsert`'s merge with a carry-forward rule, add it to the census comment, and add
tests. Sprint 37 fixed a bug caused by exactly this census being wrong.

Notifications: `migrations/004`'s `type` CHECK allows only
`invite|rsvp|host_update|chat|friend_request|trip_update`. New types need a CHECK change in
the same migration, or they will throw `23514` — the identical failure mode as TASK 19.6.

## Task 4 — Grouping (pure, fully testable)

`src/lib/calendarGrouping.js` — `groupByDayAndMountain` currently returns
`{ resortKey, trip, attendees }`. Add a party dimension: within a mountain, partition
attendees by `party_id`, with `null` meaning unaffiliated.

This is the highest-value test target in the sprint and it needs no DOM. Cover: two parties at
one mountain; a party spanning two mountains (possible — members can differ); solo skiers;
me-first sort preserved within my own party; and `earliestEta` per party rather than per
mountain.

## Task 5 — UI

- `DayPlanCard` — render parties as labelled sub-groups ("Kyle's group · 4") with unaffiliated
  skiers below.
- Split the actions: **"I'm also going"** (ungated, sets my plan, same as today) versus
  **"Ask to join"** on a specific party (sends a request). The distinction is the entire point
  of the sprint and has to be legible on the card.
- An inbox for pending requests, reusing `FailureNotice`'s shell idiom and the existing
  invites UI in `FriendsPage`.

---

## Verification

- `npm test` — 107 today. Expect ~130+; the grouping and `planUpsert` changes are pure.
- `npm run lint` — baseline **88**, must not rise. (It is `eslint .`; Sprint 37 added `.claude`
  to globalIgnores so it no longer lints worktree bundles.)
- `npm run build` must pass.
- Two accounts, by hand: plan the same mountain from both **without** an invite and confirm
  they appear as separate groups on one card. Then invite, accept, confirm they merge into one
  party. Then ask-to-join from the other side and approve it.
- Migration 037 in the Supabase SQL editor, then `NOTIFY pgrst, 'reload schema';`

## Sequencing note

The migration is the risky part and everything depends on it, so it goes first and gets
verified against the live schema before any UI is written. Pushing to `main` deploys to
production with no staging step.
