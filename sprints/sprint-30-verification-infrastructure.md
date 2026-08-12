# Sprint 30 — Trust Tier & Verification Infrastructure

**Depends on:** Sprint 29 (Mountain Board) — already merged and live, for `resort_coordinates` conventions
**Blocks:** Sprint 31 (Ski Buddy Board)
**Reference docs:** PRD-Ski-Buddy-Board.md, Technical-Spec-Ski-Buddy-Board.md (Part A)

> **Reconciled against the live repo, 2026-08-12** — see the Technical Spec's `[Reconciled]` notes for full detail. In short: `is_verified()` should get the same `set search_path`/`revoke`/`grant` treatment as Sprint 29's RPCs (item 2); OAuth linking is confirmed as `supabase.auth.linkIdentity({ provider })`, gated behind Supabase's "Enable Manual Linking" dashboard setting (item 3); phone verification must be a new flow (`updateUser` + `verifyOtp(type: "phone_change")`), not a reuse of the existing sign-in-oriented `sendPhoneOtp`/`verifyPhoneOtp` pair already in `socialApi.js` (item 4, item 8).

## Objective

Build the shared verification and moderation plumbing that any future public-facing board (Ski Buddy Board, and potentially Mountain Board) can gate on. No new user-facing board ships in this sprint — this is infrastructure.

## Scope

1. **Postgres migration**: `user_verification`, `content_reports`, `moderation_flags` tables (see Technical Spec Part A.1)
2. **`is_verified(user_id)` SECURITY DEFINER RPC** (Part A.2) — include `set search_path = public` and explicit `revoke all ... from public` / `grant execute ... to authenticated`, matching Sprint 29's `create_board_post`/`report_board_post`
3. **OAuth identity linking flow**: Google + Facebook, triggered contextually rather than at signup. Confirmed method: `supabase.auth.linkIdentity({ provider })` (supabase-js 2.99.0, currently installed). Requires "Enable Manual Linking" turned on in Supabase Dashboard → Authentication → Settings first — it's off by default and `linkIdentity()` fails until enabled. Flip this setting as a one-time setup step for this sprint.
4. **Phone verification flow**: a *new* flow, not a reuse of the existing `sendPhoneOtp`/`verifyPhoneOtp` pair (those authenticate via `signInWithOtp`/`verifyOtp({type:"sms"})` and are wired into `AuthForm.jsx` as a sign-in method — reusing them here would risk switching the user's session instead of verifying the currently-signed-in account). Use `supabase.auth.updateUser({ phone })` to send the OTP, then `supabase.auth.verifyOtp({ phone, token, type: "phone_change" })` to confirm — this attaches the phone number to the existing session. Triggered from the same upgrade modal as OAuth linking.
5. **Tier computation**: sets `tier = 1` once both OAuth + phone are verified. Implement server-side (trigger or Edge Function), not client-computed.
6. **Moderation service wiring**:
   - Server-side (Edge Function) call to OpenAI Moderation API for any text destined for a public board
   - Client-side profanity check on username field (signup + profile edit), backed by an npm profanity-filter library, with a server-side re-check as defense-in-depth
7. **Reporting API**: generic `reportContent(targetType, targetId, reason)` writing to `content_reports`, status always starts `pending` — no auto-action path
8. **New API functions in `socialApi.js`**:
   - `getMyVerificationTier()`
   - `linkOAuthIdentity(provider)`
   - `verifyPhoneForTier1(phone, otp)` — renamed from `verifyPhoneNumber` to avoid colliding with the existing `verifyPhoneOtp` (phone sign-in) already in `socialApi.js`; implement via `updateUser`/`verifyOtp(type: "phone_change")`, not the existing sign-in pair
   - `reportContent(targetType, targetId, reason)`
9. **New component**: `VerificationUpgradeModal.jsx` — the contextual "you need to verify to do this" flow, handling OAuth link + phone OTP in one place so it can be reused by any future gated action

## Explicitly out of scope for this sprint

- Ski Buddy Board itself (Sprint 31)
- Admin review queue UI (needed before Sprint 31 ships to real users, but can be a fast-follow — flag this if deprioritizing)
- Tier 2 ("established") threshold tuning — stub the column/logic, don't over-invest in exact thresholds yet
- Tier 3 (ID verification) — no vendor integration this sprint

## Testing checklist

- [ ] New Tier 0 user can use every existing private feature (friends, crew invites, daily plans) with zero verification prompts
- [ ] Attempting a gated action (stub this with a test button if no real gated action exists yet) correctly blocks Tier 0 and shows the upgrade modal
- [ ] OAuth link + phone verify together correctly flips `tier` to 1 — confirm via direct DB check, not just UI state
- [ ] A profane/slur username is rejected at signup and at profile edit, both client-side and if the client check is bypassed (test by calling the insert directly)
- [ ] `reportContent()` never triggers any automatic restriction — confirm no downstream trigger silently escalates on report count
- [ ] Moderation-flagged post content lands in `moderation_flags` with `auto_held = true` and does not silently disappear from the author's perspective

## Definition of done

Verification infrastructure exists, is testable in isolation, and no existing feature's UX has changed for Tier 0 users. Sprint 31 can build on `is_verified()` without further changes here.
