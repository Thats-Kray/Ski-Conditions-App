# Technical Spec: Trust Tiers, Verification & Ski Buddy Board
**Product:** Powdays
**Stack:** React (Vite) + Supabase (Postgres, Auth, RLS) + Vercel
**Companion doc:** PRD-Ski-Buddy-Board.md

> Note: this spec was drafted without direct repo access in this session. Table/column names follow the conventions described in project memory (`socialApi.js` naming style, existing `daily_plans`/`friend_requests`/`crew_invites` patterns). Verify exact existing schema against the live migrations before running any of this — Claude Code should reconcile against the actual repo state first.
>
> **Reconciled against the live repo on 2026-08-12** — see inline `[Reconciled]` notes below for corrections. Summary: `resort_coordinates` exists and matches the shape assumed here; Sprint 29 is fully merged (not in progress) and its Arapahoe Basin fix already landed; Sprint 29's actual RLS convention routes all writes through `SECURITY DEFINER` RPCs rather than direct insert policies, so Part B.2 below needs to change to match; the OAuth-linking and phone-verification methods flagged as unverified are now confirmed.

---

## Part A — Trust Tier & Verification Infrastructure

This is shared plumbing used by both the Ski Buddy Board and (optionally, pending decision) the Mountain Board.

### A.1 Data model

```sql
-- Tracks verification state per user. One row per user, created on signup.
create table user_verification (
  user_id uuid primary key references auth.users(id) on delete cascade,
  oauth_provider text check (oauth_provider in ('google', 'facebook')),
  oauth_linked_at timestamptz,
  phone_verified_at timestamptz,
  tier integer not null default 0, -- 0=base, 1=verified, 2=established, 3=id_verified
  tier_updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Reports against any content type. Never triggers auto-action.
create table content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id),
  target_type text not null check (target_type in ('post', 'response', 'profile', 'username')),
  target_id uuid not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  resolution_notes text
);

-- Automated moderation hits, kept separate from user reports for audit clarity.
create table moderation_flags (
  id uuid primary key default gen_random_uuid(),
  content_type text not null,
  content_id uuid not null,
  source text not null check (source in ('openai_moderation', 'profanity_filter')),
  category text,
  score numeric,
  auto_held boolean default false,
  created_at timestamptz default now()
);
```

### A.2 Tier-check helper (SECURITY DEFINER RPC)

Following the pattern already used for Mountain Board's geofence RPCs:

```sql
create or replace function public.is_verified(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select tier >= 1 from user_verification where user_id = check_user_id),
    false
  );
$$;

revoke all on function public.is_verified(uuid) from public;
grant execute on function public.is_verified(uuid) to authenticated;
```

**[Reconciled]** Added `set search_path = public` and the explicit `revoke`/`grant` pair — both are present on Sprint 29's `create_board_post`/`report_board_post` (`migrations/020_mountain_board.sql`) but were missing from the original draft here. Match that pattern for every new function in this spec.

**[Reconciled]** Sprint 29 does **not** use `is_verified()`-style helpers inside plain RLS `insert` policies — it uses no direct insert policies at all. Every write to `mountain_board_posts`/`mountain_board_reports` goes through a `SECURITY DEFINER` RPC (`create_board_post`, `report_board_post`) that owns the business-logic check internally, with RLS providing only `select` policies. Part B.2 below needs to follow that same pattern rather than gating inserts with `is_verified()` in a table-level policy — see the note there.

### A.3 OAuth linking flow

Users sign up and use the app fully on email/password (Tier 0). The upgrade to Tier 1 happens contextually, the first time they try to post or respond on a public board.

- Client-side: on the "post" or "respond" action, check `user_verification.tier` first. If `< 1`, show an upgrade modal instead of the action.
- **[Reconciled — confirmed against live Supabase docs, 2026-08-12, against installed `@supabase/supabase-js@2.99.0`]** The method is `supabase.auth.linkIdentity({ provider: 'google' })` (or `'facebook'`). It supports PKCE and requires the user already be signed in. **Prerequisite not previously called out:** manual linking is disabled by default — "Enable Manual Linking" must be turned on in Supabase Dashboard → Authentication → Settings (or `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=true` self-hosted) or `linkIdentity()` fails outright. Add flipping this setting as an explicit Sprint 30 setup step.
- On successful OAuth link: pull `avatar_url` from the provider payload as the profile photo if the user doesn't already have one, mark `oauth_provider` + `oauth_linked_at`.
- **[Reconciled]** Phone verification: the codebase already has `sendPhoneOtp(phone)` / `verifyPhoneOtp(phone, token)` in `src/lib/socialApi.js`, but that pair is wired up in `AuthForm.jsx` as a **sign-in method** ("Sign In with Phone") — it calls `supabase.auth.signInWithOtp({ phone })` + `verifyOtp({ ..., type: "sms" })`, which authenticates/creates a session for that phone number rather than attaching a phone number to the currently-signed-in Tier 0 account. Reusing it as-is here risks silently switching the user's session. The correct call for attaching a phone number to an *existing* session is `supabase.auth.updateUser({ phone })` (sends the OTP) followed by `supabase.auth.verifyOtp({ phone, token, type: "phone_change" })`, which preserves the current session. Build this as a distinct function — don't extend or rename the existing sign-in pair, and pick a name for the new one that won't collide with `verifyPhoneOtp` already in the file (e.g. `verifyPhoneForTier1` or similar — final name TBD at implementation time).
- A Postgres trigger or a small server-side check (Edge Function) sets `tier = 1` once both `oauth_linked_at` and `phone_verified_at` are non-null. Don't compute this client-side only — client state shouldn't be the source of truth for a security gate.

### A.4 Tier 2 ("Established") calculation

Simple, computed periodically or via trigger rather than real-time critical:
```sql
-- Example threshold — tune with product: e.g. 3+ accepted friends OR 2+ completed daily_plans
```
Used only to widen review tolerance, never to bypass reporting.

### A.5 Reporting & review queue

- Reports insert into `content_reports` with `status = 'pending'`. No downstream automation removes content or restricts the reported user automatically.
- Admin view (internal-only route, not customer-facing) lists pending reports sorted by count-per-target and recency.
- Tier 2 accounts: when reported, the review queue entry is flagged "established user — review before any restriction," which is a UI/priority signal only, not a code path that suppresses the report.

---

## Part B — Ski Buddy Board

### B.1 Data model

```sql
create table ski_buddy_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pass_type text not null check (pass_type in ('ikon', 'epic', 'independent', 'other')),
  resort_key text not null references resort_coordinates(resort_key), -- reuse Sprint 29's reference table
  ski_date date not null,
  riding_style text[] not null, -- constrained tag list, validated app-side against an enum
  group_size_wanted integer,
  carpool_status text not null default 'none' check (carpool_status in ('offering', 'needing', 'none')),
  carpool_seats integer,
  description text,
  status text not null default 'open' check (status in ('open', 'filled', 'expired', 'removed')),
  created_at timestamptz default now()
);

create table ski_buddy_responses (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references ski_buddy_posts(id) on delete cascade,
  responder_id uuid not null references auth.users(id),
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  unique (post_id, responder_id) -- one active response per user per post
);
```

**Tech-debt note (from project memory):** resort data is currently hardcoded in three places. This board should consume `resort_coordinates` as the single source, not add a fourth hardcoded list.

**[Reconciled]** `resort_coordinates` exists (`migrations/020_mountain_board.sql`) with exactly the shape assumed above (`resort_key text primary key`, `lat`, `lon`, plus an unused-here `geofence_radius_miles`) — the FK on `resort_key` will work as written. The "Arapahoe Basin missing" tech debt flagged in the original draft is **already fixed** (S29-T0 landed it in `src/lib/resorts.js`, and Sprint 29 is fully merged) — no action needed before wiring this board's resort dropdown.

**[Reconciled — new gotcha, not in the original draft]** `ski_buddy_posts.user_id` (like `mountain_board_posts.author_id`) only references `auth.users`, never `profiles` — there is no FK path for a PostgREST embedded select (`select("*, profiles(...)")` will 400). This exact bug already hit Mountain Board in production (see ROADMAP.md's Sprint 29 postmortem: "every board read 400'd since Sprint 29 first shipped"). `getSkiBuddyPosts()` (B.4) must resolve posts and profiles as two separate queries from the start, matching the fix already in `socialApi.js`'s `getBoardPosts()` — don't rediscover this one.

### B.2 RLS policies

**[Reconciled — pattern changed]** The original draft below gated inserts with `is_verified()` directly inside table-level RLS `insert` policies. That's not how Sprint 29 actually does it: `mountain_board_posts`/`mountain_board_reports` have **no insert policies at all** — every write goes through a `SECURITY DEFINER` RPC (`create_board_post`, `report_board_post`) that owns the tier/geofence check internally, with explicit `revoke all ... from public` / `grant execute ... to authenticated` on the function. To match that convention, replace the `insert` policies below with `SECURITY DEFINER` RPCs — e.g. `create_ski_buddy_post(p_pass_type, p_resort_key, p_ski_date, ...)` and `respond_to_ski_buddy_post(p_post_id, p_message)` — that call `is_verified(auth.uid())` internally and raise an exception (not silently reject) if the caller isn't Tier 1, following `create_board_post`'s `raise exception 'TOO_FAR:%'`-style pattern. Only the `select` and owner-`update` policies below should remain as direct RLS policies.

```sql
-- Anyone signed in (Tier 0+) can browse
create policy "ski_buddy_posts_select" on ski_buddy_posts
  for select using (auth.uid() is not null);

-- Owner can update their own post (mark filled/removed)
create policy "ski_buddy_posts_update_own" on ski_buddy_posts
  for update using (user_id = auth.uid());
```

Inserts (both `ski_buddy_posts` and `ski_buddy_responses`) route through `SECURITY DEFINER` RPCs instead of policies — see B.4 for the corresponding API layer changes.

### B.3 Moderation integration

- **Usernames**: validate client-side on signup/profile-edit form submit using a lightweight open-source profanity library (e.g. `bad-words` or `leo-profanity` for npm) plus a small custom blocklist for Denver/ski-specific terms worth catching. Re-validate server-side (Edge Function or DB constraint trigger) as defense-in-depth — never trust client-only validation for something this cheap to bypass.
- **Post descriptions**: before insert commits, send `description` text to the OpenAI Moderation API (free, no per-call cost) server-side. If flagged, insert with `status` held for review and write a row to `moderation_flags` rather than silently discarding — the post owner should get a clear "under review" state, not a silent failure that looks like a bug.
- Keep moderation calls server-side (Edge Function) — never call a moderation API with a client-exposed key.

### B.4 API layer (`socialApi.js` additions)

New functions following existing naming conventions in the file:
- `createSkiBuddyPost(postData)` — **[Reconciled]** calls the new `create_ski_buddy_post` RPC (B.2), not a direct table insert
- `getSkiBuddyPosts(filters)` — pass_type, resort, date range, riding_style, carpool_status. **[Reconciled]** must resolve `profiles` via a second query, same pattern as `getBoardPosts()` — see B.1 note
- `respondToSkiBuddyPost(postId, message)` — **[Reconciled]** calls the new `respond_to_ski_buddy_post` RPC, not a direct table insert
- `updateSkiBuddyPostStatus(postId, status)`
- `getMyVerificationTier()`
- `linkOAuthIdentity(provider)` — **[Reconciled]** implemented via `supabase.auth.linkIdentity({ provider })`, see A.3
- `verifyPhoneForTier1(phone, otp)` — **[Reconciled, renamed]** was `verifyPhoneNumber` in the original draft; renamed to avoid confusion with the existing `verifyPhoneOtp` (phone sign-in) already in `socialApi.js`. Implemented via `updateUser({ phone })` + `verifyOtp({ ..., type: "phone_change" })`, not the existing sign-in pair — see A.3
- `reportContent(targetType, targetId, reason)`

### B.5 Frontend

- New `SkiBuddyBoard.jsx` component, filter UI + post list. **[Reconciled]** The original draft referenced a "March summary" flagging card styling as needing polish — no such note exists in ROADMAP.md, PRD.md, or UX_CLEANUP.md; this appears to be an unverifiable/fabricated reference and has been removed. Follow whatever the current design-token/card conventions are (`sprint-7-design-tokens.md`, `sprint-8-ui-component-library.md`) at implementation time instead.
- New `PostSkiBuddyForm.jsx` for creating a listing
- `VerificationUpgradeModal.jsx` — shown when a Tier 0 user attempts to post/respond; handles OAuth link + phone OTP in one flow
- Wire into `App.jsx` Snow tab sub-nav, alongside Mountain Board (per Sprint 29 pattern)

### B.6 Sequencing dependency

**Part A (verification infrastructure) must ship before Part B (the board itself)** — the board's write RPCs (`create_ski_buddy_post`, `respond_to_ski_buddy_post`) depend on `is_verified()`. This is why it's split into two sprints below.
