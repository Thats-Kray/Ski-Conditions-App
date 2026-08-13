# Sprint 30 — Trust Tier & Verification Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared verification/moderation plumbing (`user_verification`, `is_verified()`, OAuth linking, phone verification, reporting, moderation service) that Sprint 31 (Ski Buddy Board) gates on — with zero UX change for existing Tier 0 users.

**Architecture:** Postgres tables + `SECURITY DEFINER` RPCs (matching Sprint 29's `create_board_post`/`report_board_post` convention) own every write and the tier-flip logic, re-verified server-side against Supabase Auth's own `auth.identities`/`auth.users` tables rather than trusted from client-passed arguments. A new `VerificationUpgradeModal.jsx` drives OAuth linking (`supabase.auth.linkIdentity`) and phone verification (`updateUser` + `verifyOtp(type:"phone_change")`). OpenAI Moderation calls run through the existing `server/index.js` Express app (Railway-deployed), never client-side, reusing its established Bearer-token auth pattern from `server/routes/strava.js`.

**Tech Stack:** Supabase Postgres/Auth (`@supabase/supabase-js@2.99.0`), React 19, Express (`server/`, deployed on Railway), `leo-profanity` (new client dependency), OpenAI Moderation API (new server-side integration, no new npm dependency — plain `fetch`/`node-fetch`).

## Global Constraints

- Every new `SECURITY DEFINER` function must include `SET search_path = public` plus explicit `REVOKE ALL ... FROM PUBLIC` / `GRANT EXECUTE ... TO authenticated` — the pattern already used in `migrations/020_mountain_board.sql`.
- This codebase has **no DB-trigger precedent anywhere** (confirmed at Sprint 20/Activity Feed) and **no direct client `INSERT` policies** on sensitive tables (confirmed at Sprint 29) — all writes to `user_verification`/`content_reports` go through RPCs, never raw table policies, and tier computation happens inside those RPCs, not a trigger.
- No Supabase Edge Functions exist in this codebase. Anything needing a server-side secret (OpenAI key) goes through the existing Express app in `server/` (Railway), using its established `getSupabase()` service-role client and Bearer-token `requireAuth` pattern from `server/routes/strava.js`.
- `linkIdentity()` requires "Enable Manual Linking" turned on in Supabase Dashboard → Authentication → Settings — off by default, calls fail until flipped. One-time manual step (Task 2).
- Phone verification for Tier 1 must use `supabase.auth.updateUser({ phone })` + `verifyOtp({ phone, token, type: "phone_change" })` — never the existing `sendPhoneOtp`/`verifyPhoneOtp` pair in `src/lib/socialApi.js:110-118`, which is a **sign-in** flow (`signInWithOtp`) and would switch the caller's session instead of verifying it.
- `ski_buddy_posts`/future board tables aside — this sprint ships **no new user-facing board**. The moderation service and gated-action UI are proven with a dev-only stub button, not a real board (Definition of Done: "testable in isolation").
- Match existing file conventions: RPC names/params `snake_case`, JS function names `camelCase`, all Postgres migrations go in `migrations/NNN_description.sql` (three-digit, sequential — next is `026`).

---

## Task 1: Database migration — tables, RLS, and RPCs

**Files:**
- Create: `migrations/026_verification_infrastructure.sql`

**Interfaces:**
- Produces: tables `user_verification`, `content_reports`, `moderation_flags`; RPCs `public.is_verified(uuid) returns boolean`, `public.mark_oauth_linked(text) returns user_verification`, `public.mark_phone_verified() returns user_verification`, `public.report_content(text, uuid, text) returns content_reports`; a `profiles.username` CHECK constraint via `public.contains_blocked_word(text)`.
- Consumes: existing `profiles` table (for the CHECK constraint) and `auth.users`/`auth.identities` (Supabase-managed, already present).

**Design decision — no row is created at signup.** The spec says "one row per user, created on signup," but `is_verified()`'s `COALESCE(..., false)` already treats a *missing* row as Tier 0 — functionally identical to a row with `tier=0`. Creating the row at signup would require a client-facing `INSERT` policy on `user_verification`, which is a real hole: a raw REST call could set `tier` directly in that insert. Instead, `mark_oauth_linked`/`mark_phone_verified` lazily create the row via `INSERT ... ON CONFLICT DO UPDATE` on first verification action — no INSERT policy needed at all, matching Sprint 29's "no direct insert policies, RPC owns it" convention.

**Design decision — RPCs re-verify against Supabase Auth, not client-passed claims.** `mark_oauth_linked(p_provider)` checks `auth.identities` for a real linked identity before flipping anything; `mark_phone_verified()` checks `auth.users.phone_confirmed_at`. This is what makes the tier gate server-side-authoritative per the spec ("client state shouldn't be the source of truth for a security gate") — a client can't just call the RPC to self-upgrade.

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 026: Trust Tier & Verification Infrastructure (Sprint 30)
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

CREATE TABLE IF NOT EXISTS user_verification (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  oauth_provider    TEXT CHECK (oauth_provider IN ('google', 'facebook')),
  oauth_linked_at   TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,
  tier              INT NOT NULL DEFAULT 0,
  tier_updated_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID NOT NULL REFERENCES auth.users(id),
  target_type      TEXT NOT NULL CHECK (target_type IN ('post', 'response', 'profile', 'username')),
  target_id        UUID NOT NULL,
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by      UUID REFERENCES auth.users(id),
  reviewed_at      TIMESTAMPTZ,
  resolution_notes TEXT
);

CREATE TABLE IF NOT EXISTS moderation_flags (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_id   UUID NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('openai_moderation', 'profanity_filter')),
  category     TEXT,
  score        NUMERIC,
  auto_held    BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_reports    ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_flags   ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_verification' AND policyname='Users can read own verification row') THEN
    CREATE POLICY "Users can read own verification row" ON user_verification FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='content_reports' AND policyname='Users can read own reports') THEN
    CREATE POLICY "Users can read own reports" ON content_reports FOR SELECT TO authenticated
      USING (reporter_id = auth.uid());
  END IF;

  -- Deliberately no policies at all on moderation_flags (internal-only, no admin
  -- UI this sprint — written by the server's service-role client, which bypasses
  -- RLS) and no INSERT policies anywhere above — see Task 1's design notes.
END $$;

-- Tier-check helper, matching Sprint 29's SECURITY DEFINER pattern exactly.
CREATE OR REPLACE FUNCTION public.is_verified(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT tier >= 1 FROM user_verification WHERE user_id = check_user_id), false);
$$;

REVOKE ALL ON FUNCTION public.is_verified(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_verified(UUID) TO authenticated;

-- Records an OAuth link and flips tier to 1 once both conditions are met.
-- Re-verifies against auth.identities — does not trust p_provider blindly.
CREATE OR REPLACE FUNCTION public.mark_oauth_linked(p_provider TEXT)
RETURNS user_verification
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row user_verification;
BEGIN
  IF p_provider NOT IN ('google', 'facebook') THEN
    RAISE EXCEPTION 'UNSUPPORTED_PROVIDER:%', p_provider;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = auth.uid() AND provider = p_provider
  ) THEN
    RAISE EXCEPTION 'OAUTH_NOT_LINKED:%', p_provider;
  END IF;

  INSERT INTO user_verification (user_id, oauth_provider, oauth_linked_at)
  VALUES (auth.uid(), p_provider, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET oauth_provider = EXCLUDED.oauth_provider,
        oauth_linked_at = EXCLUDED.oauth_linked_at
  RETURNING * INTO v_row;

  UPDATE user_verification
  SET tier = 1, tier_updated_at = NOW()
  WHERE user_id = auth.uid() AND tier < 1
    AND oauth_linked_at IS NOT NULL AND phone_verified_at IS NOT NULL
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    SELECT * INTO v_row FROM user_verification WHERE user_id = auth.uid();
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_oauth_linked(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_oauth_linked(TEXT) TO authenticated;

-- Records phone verification and flips tier to 1 once both conditions are met.
-- Re-verifies against auth.users.phone_confirmed_at — the client can't just
-- call this without actually completing verifyOtp(type: "phone_change") first.
CREATE OR REPLACE FUNCTION public.mark_phone_verified()
RETURNS user_verification
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row user_verification;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = auth.uid() AND phone_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PHONE_NOT_VERIFIED';
  END IF;

  INSERT INTO user_verification (user_id, phone_verified_at)
  VALUES (auth.uid(), NOW())
  ON CONFLICT (user_id) DO UPDATE SET phone_verified_at = NOW()
  RETURNING * INTO v_row;

  UPDATE user_verification
  SET tier = 1, tier_updated_at = NOW()
  WHERE user_id = auth.uid() AND tier < 1
    AND oauth_linked_at IS NOT NULL AND phone_verified_at IS NOT NULL
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    SELECT * INTO v_row FROM user_verification WHERE user_id = auth.uid();
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_phone_verified() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_phone_verified() TO authenticated;

-- Generic reporting RPC. Insert-only — no downstream automation, matching spec A.5.
CREATE OR REPLACE FUNCTION public.report_content(p_target_type TEXT, p_target_id UUID, p_reason TEXT)
RETURNS content_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row content_reports;
BEGIN
  IF p_target_type NOT IN ('post', 'response', 'profile', 'username') THEN
    RAISE EXCEPTION 'INVALID_TARGET_TYPE:%', p_target_type;
  END IF;

  INSERT INTO content_reports (reporter_id, target_type, target_id, reason)
  VALUES (auth.uid(), p_target_type, p_target_id, trim(p_reason))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.report_content(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_content(TEXT, UUID, TEXT) TO authenticated;

-- Server-side defense-in-depth for username profanity (client-side check in
-- Task 5 uses leo-profanity's much larger dictionary — this is a short,
-- obvious-offenders list, not meant to be exhaustive).
CREATE OR REPLACE FUNCTION public.contains_blocked_word(p_text TEXT)
RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM unnest(ARRAY[
      'fuck','shit','bitch','cunt','nigger','nigga','faggot','retard','whore','slut'
    ]) AS blocked
    WHERE lower(p_text) LIKE '%' || blocked || '%'
  );
$$;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_username_not_profane
  CHECK (username IS NULL OR NOT public.contains_blocked_word(username));
```

- [ ] **Step 2: Apply the migration to the live Supabase project**

This project has no local Postgres/staging environment (confirmed: `migrations/` has been applied directly to the live Supabase project for every prior sprint, e.g. `migrations/025_crews_created_by_fk.sql`). Apply via the Supabase MCP tool (`mcp__claude_ai_Supabase__apply_migration`) after Kyle confirms — this is a live database change with no undo button beyond a manual `DROP`.

- [ ] **Step 3: Verify — RPCs exist and are locked down**

Run via the Supabase MCP `execute_sql` tool (or Supabase SQL Editor):

```sql
select proname, prosecdef from pg_proc where proname in
  ('is_verified','mark_oauth_linked','mark_phone_verified','report_content');
-- Expect 4 rows, prosecdef = true on all.

select routine_name, grantee, privilege_type from information_schema.routine_privileges
  where routine_name in ('is_verified','mark_oauth_linked','mark_phone_verified','report_content');
-- Expect only 'authenticated' rows, no 'public'/'anon'.
```

- [ ] **Step 4: Verify — username constraint rejects a bad insert, direct-call bypass included**

```sql
-- Should raise a check-constraint violation:
insert into profiles (id, username) values (gen_random_uuid(), 'test_fuck_word');
```

Expected: `ERROR: new row for relation "profiles" violates check constraint "profiles_username_not_profane"`.

- [ ] **Step 5: Commit**

```bash
git add migrations/026_verification_infrastructure.sql
git commit -m "feat: add verification infrastructure tables, RLS, and RPCs (Sprint 30)"
```

---

## Task 2: Manual Supabase Dashboard setup (Kyle — not code)

**Files:** none — this is a console/dashboard task, no repo changes.

This step can't be done from the terminal or by Claude — it's a setting in Supabase's web dashboard tied to your project's credentials. It unblocks OAuth linking (`linkIdentity()` fails outright until this is on) and testing checklist item 3.

- [ ] **Step 1: Enable Manual Linking**
  1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and open the Ski Dashboard project.
  2. Left sidebar → **Authentication** → **Settings** (or **Providers**, depending on dashboard version — look for "Attack Protection" / "User Signups" section).
  3. Find **"Allow manual linking"** (may be labeled "Enable Manual Linking"). Turn it **on**.
  4. Save.

- [ ] **Step 2: Confirm Google + Facebook OAuth providers are configured**

`linkIdentity({ provider: 'google' })` will fail with "Unsupported provider" if that provider isn't enabled under **Authentication → Providers** with a real Client ID/Secret from Google Cloud Console (and similarly a Facebook App ID/Secret from Meta for Developers). If these aren't already set up from an earlier sprint, this is a separate multi-step task in each provider's own console (create an OAuth app, set the redirect URI to your Supabase project's callback URL, get credentials) — worth doing as its own guided session with Kyle rather than folding into this one silently. **Decision point:** flag to Kyle whether Google/Facebook OAuth apps already exist; if not, code work (Tasks 3–8) can still proceed and be verified, but end-to-end tier-flip testing (checklist item 3) waits until this is done.

---

## Task 3: `socialApi.js` — verification and reporting API functions

**Files:**
- Modify: `src/lib/socialApi.js` (add new exports after the existing `verifyPhoneOtp` function, around line 119)

**Interfaces:**
- Consumes: `getCurrentUser()` (already defined, `socialApi.js:6`), `supabase` client (`socialApi.js:1`).
- Produces: `getMyVerificationTier()`, `linkOAuthIdentity(provider)`, `syncVerificationFromAuth()`, `startPhoneVerificationForTier1(phone)`, `verifyPhoneForTier1(phone, otp)`, `reportContent(targetType, targetId, reason)` — all used by Task 6 (`VerificationUpgradeModal.jsx`) and Task 4 (`App.jsx`).

- [ ] **Step 1: Add the functions**

Insert immediately after `verifyPhoneOtp` (`src/lib/socialApi.js:115-119`):

```js
/* -----------------------------
   Verification (Sprint 30)
----------------------------- */

export async function getMyVerificationTier() {
  const user = await getCurrentUser()

  const { data, error } = await supabase
    .from("user_verification")
    .select("tier, oauth_provider, oauth_linked_at, phone_verified_at")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) throw error
  return data || { tier: 0, oauth_provider: null, oauth_linked_at: null, phone_verified_at: null }
}

export async function linkOAuthIdentity(provider) {
  if (!["google", "facebook"].includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`)
  }

  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: { redirectTo: window.location.origin },
  })
  if (error) throw error
  return data // { url } — Supabase redirects the browser there automatically
}

// Reconciles user_verification with whatever Supabase Auth already knows —
// call after any auth-state change (identity link redirect returning, phone
// verified) since linkIdentity()'s OAuth round-trip leaves the app with no
// other signal that an identity was just linked. Safe to call redundantly:
// mark_oauth_linked is idempotent and re-verifies against auth.identities.
export async function syncVerificationFromAuth() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) return null

  const linkedProviders = (user.identities || [])
    .map((identity) => identity.provider)
    .filter((provider) => provider === "google" || provider === "facebook")

  for (const provider of linkedProviders) {
    await supabase.rpc("mark_oauth_linked", { p_provider: provider })
  }

  return getMyVerificationTier()
}

export async function startPhoneVerificationForTier1(phone) {
  const { error } = await supabase.auth.updateUser({ phone })
  if (error) throw error
}

export async function verifyPhoneForTier1(phone, otp) {
  const { error: verifyError } = await supabase.auth.verifyOtp({
    phone,
    token: otp,
    type: "phone_change",
  })
  if (verifyError) throw verifyError

  const { data, error } = await supabase.rpc("mark_phone_verified")
  if (error) throw error
  return data
}

export async function reportContent(targetType, targetId, reason) {
  const { data, error } = await supabase.rpc("report_content", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
  })
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Verify — quick manual smoke test from the browser console**

With the app running (`npm run dev`) and logged in as your test account, open the browser DevTools console on the app page and run:

```js
import("/src/lib/socialApi.js").then(async (m) => {
  console.log(await m.getMyVerificationTier())
})
```

Expected: `{ tier: 0, oauth_provider: null, oauth_linked_at: null, phone_verified_at: null }` (no row yet — this is correct per Task 1's design decision).

- [ ] **Step 3: Commit**

```bash
git add src/lib/socialApi.js
git commit -m "feat: add verification and reporting API functions to socialApi.js"
```

---

## Task 4: Wire `syncVerificationFromAuth()` into the existing auth-state listener

**Files:**
- Modify: `src/App.jsx:1239-1255` (existing `onAuthStateChange` effect)

**Interfaces:**
- Consumes: `syncVerificationFromAuth()` from Task 3.

**Why this file:** `App.jsx` already has the one place that listens to every Supabase auth event (`USER_UPDATED`, `PASSWORD_RECOVERY`, etc.) — see the Strava deep-link comment right above it for the established pattern of reacting to a redirect-back. Linking an OAuth identity causes exactly this kind of redirect-away-and-back; `USER_UPDATED` is what Supabase fires when the session's identity list changes.

- [ ] **Step 1: Add the import**

In `src/App.jsx`, find the existing `socialApi` import block and add `syncVerificationFromAuth` to it.

- [ ] **Step 2: Handle `USER_UPDATED` in the listener**

```js
useEffect(() => {
  loadHeaderUser()

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event) => {
    loadHeaderUser()

    if (event === "PASSWORD_RECOVERY") {
      setIsRecoveryMode(true)
      setAuthModalMode("reset")
    }

    if (event === "USER_UPDATED") {
      syncVerificationFromAuth().catch((err) =>
        console.error("Verification sync failed:", err.message)
      )
    }
  })

  return () => subscription.unsubscribe()
}, [])
```

- [ ] **Step 3: Verify**

`npm run dev`, confirm the app still boots and logs in without console errors. Full exercise of this path happens in Task 7's test button (real OAuth redirect needed, which needs Task 2 done first).

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: sync verification tier on USER_UPDATED auth event"
```

---

## Task 5: Username profanity guard (client-side + wired into signup)

**Files:**
- Create: `src/lib/profanity.js`
- Modify: `src/components/AuthForm.jsx` (signup submit handler)
- Modify: `package.json` (add `leo-profanity` dependency)

**Interfaces:**
- Produces: `isUsernameProfane(username)` from `src/lib/profanity.js`, used by `AuthForm.jsx`.

**Scope note:** the sprint spec says "signup + profile edit," but `ProfilePage.jsx`'s `EditProfileModal` (`src/components/ProfilePage.jsx:363+`) currently has **no username field at all** — username can't be changed after signup in the existing UI. Adding username editing would be a new feature outside this sprint's ask. The client-side check is wired only into the one real entry point (signup); Task 1's DB-level `CHECK` constraint is the actual defense-in-depth layer and covers every path, present or future, including one that doesn't exist yet.

- [ ] **Step 1: Install the dependency**

```bash
npm install leo-profanity
```

- [ ] **Step 2: Create `src/lib/profanity.js`**

```js
import leoProfanity from "leo-profanity"

export function isUsernameProfane(username) {
  if (!username) return false
  return leoProfanity.check(username)
}
```

- [ ] **Step 3: Wire into `AuthForm.jsx`'s signup submit**

Find the signup submit handler in `src/components/AuthForm.jsx` (where `username: username.trim()` is used, around line 126). Add a check before calling `signUpWithProfile`:

```js
import { isUsernameProfane } from "../lib/profanity"

// ...inside the signup submit handler, before calling signUpWithProfile:
if (isUsernameProfane(username.trim())) {
  setError("That username isn't allowed. Please choose another.")
  return
}
```

(Match the existing `setError`/early-return pattern already used elsewhere in this handler for other validation failures — read the surrounding code first to match exactly.)

- [ ] **Step 4: Verify**

`npm run dev`, go through signup with username `fuckthis` — expect the inline error and no signup request fired. Then signup with a normal username — expect it to proceed as before.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/profanity.js src/components/AuthForm.jsx
git commit -m "feat: add client-side username profanity check at signup"
```

---

## Task 6: `VerificationUpgradeModal.jsx`

**Files:**
- Create: `src/components/VerificationUpgradeModal.jsx`

**Interfaces:**
- Consumes: `linkOAuthIdentity(provider)`, `startPhoneVerificationForTier1(phone)`, `verifyPhoneForTier1(phone, otp)`, `getMyVerificationTier()` (all from Task 3).
- Produces: default export `VerificationUpgradeModal({ onClose, onVerified })` — `onVerified` fires once `tier >= 1` is confirmed after a phone verification completes (OAuth completion triggers a full redirect, so there's no in-modal "just linked" moment for that path — the modal simply doesn't survive the redirect; App.jsx's Task 4 wiring handles the return leg).

- [ ] **Step 1: Write the component**

Follow this project's existing modal conventions (see `EditProfileModal` in `src/components/ProfilePage.jsx` or `SessionRecapModal.jsx` for the overlay/card/close-button pattern already established) — read one of those first to match styling/CSS-token usage exactly, then build:

```jsx
import { useState } from "react"
import {
  linkOAuthIdentity,
  startPhoneVerificationForTier1,
  verifyPhoneForTier1,
} from "../lib/socialApi"

const E164_RE = /^\+[1-9]\d{7,14}$/

export default function VerificationUpgradeModal({ onClose, onVerified }) {
  const [phoneStep, setPhoneStep] = useState("enter") // enter | otp
  const [phone, setPhone] = useState("")
  const [otp, setOtp] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function handleOAuthClick(provider) {
    setBusy(true)
    setError("")
    try {
      await linkOAuthIdentity(provider)
      // Browser redirects away here — nothing after this line runs.
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  async function handleSendOtp(e) {
    e.preventDefault()
    if (!E164_RE.test(phone)) {
      setError("Enter your phone number in +1XXXXXXXXXX format.")
      return
    }
    setBusy(true)
    setError("")
    try {
      await startPhoneVerificationForTier1(phone)
      setPhoneStep("otp")
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const row = await verifyPhoneForTier1(phone, otp.trim())
      if (row?.tier >= 1) onVerified?.(row)
      else onClose?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>Verify your account</h2>
        <p>Link one account and confirm your phone number to unlock this action.</p>

        {error && <div className="form-error">{error}</div>}

        <div className="verification-oauth-row">
          <button disabled={busy} onClick={() => handleOAuthClick("google")}>
            Continue with Google
          </button>
          <button disabled={busy} onClick={() => handleOAuthClick("facebook")}>
            Continue with Facebook
          </button>
        </div>

        {phoneStep === "enter" ? (
          <form onSubmit={handleSendOtp}>
            <label>Phone number</label>
            <input
              type="tel"
              placeholder="+15551234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button type="submit" disabled={busy}>Send code</button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <label>Enter the 6-digit code sent to {phone}</label>
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
            <button type="submit" disabled={busy}>Confirm</button>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

`npm run dev`, temporarily render `<VerificationUpgradeModal onClose={() => {}} onVerified={console.log} />` anywhere reachable (e.g. Task 7's stub button will do this for real) — confirm it renders without console errors and the phone step transitions from "enter" to "otp" after a mocked/real send.

- [ ] **Step 3: Commit**

```bash
git add src/components/VerificationUpgradeModal.jsx
git commit -m "feat: add VerificationUpgradeModal for OAuth + phone Tier 1 upgrade"
```

---

## Task 7: Dev test-gate stub (Krames Butte owner area)

**Files:**
- Modify: `src/components/MountainBoard.jsx` (owner-gated Krames Butte chip area, `src/components/MountainBoard.jsx:32-33,131`)

**Interfaces:**
- Consumes: `getMyVerificationTier()` (Task 3), `VerificationUpgradeModal` (Task 6).

**Why here:** Krames Butte was purpose-built in Section 12 as "a permanent, private testing ground for new per-resort features" — exactly the "stub this with a test button if no real gated action exists yet" the testing checklist calls for, and it's already owner-gated (`OWNER_EMAIL` check at `MountainBoard.jsx:131`) so this never appears for real users.

- [ ] **Step 1: Add the stub button and modal wiring**

Inside the existing owner-gated block (`currentUserEmail === OWNER_EMAIL`) in `src/components/MountainBoard.jsx`, add local state (`showVerifyModal`, `tier`) and a button:

```jsx
const [showVerifyModal, setShowVerifyModal] = useState(false)
const [verifyTier, setVerifyTier] = useState(null)

async function handleTestGateClick() {
  const { tier } = await getMyVerificationTier()
  setVerifyTier(tier)
  if (tier < 1) setShowVerifyModal(true)
}

// ...inside the owner-gated JSX block:
<button onClick={handleTestGateClick}>🔒 Test Verification Gate</button>
{verifyTier !== null && (
  <span>{verifyTier >= 1 ? `✅ Tier ${verifyTier}` : "Tier 0 — gate should block"}</span>
)}
{showVerifyModal && (
  <VerificationUpgradeModal
    onClose={() => setShowVerifyModal(false)}
    onVerified={(row) => { setVerifyTier(row.tier); setShowVerifyModal(false) }}
  />
)}
```

Add the corresponding imports (`getMyVerificationTier` from `../lib/socialApi`, `VerificationUpgradeModal` from `./VerificationUpgradeModal`, `useState` if not already imported).

- [ ] **Step 2: Verify end-to-end (requires Task 2 done for the OAuth half)**

Log in as the owner test account, navigate to the Krames Butte area, click "🔒 Test Verification Gate" — expect the modal to open (Tier 0). Complete phone verification (real SMS OTP) — expect `tier` to stay 0 until OAuth is also linked (both required), then complete OAuth linking — expect the redirect to return, `USER_UPDATED` to fire (Task 4), and clicking the test button again to show `✅ Tier 1`. Confirm via direct DB check per the sprint's testing checklist:

```sql
select * from user_verification where user_id = '<your-test-user-id>';
```

- [ ] **Step 3: Commit**

```bash
git add src/components/MountainBoard.jsx
git commit -m "feat: add owner-only verification gate test button to Krames Butte"
```

---

## Task 8: Moderation service (OpenAI Moderation API, server-side)

**Files:**
- Create: `server/moderation.js`
- Modify: `server/index.js` (new route)

**Interfaces:**
- Produces: `moderateText(text)` from `server/moderation.js` (returns `{ flagged, category, score }`), new route `POST /api/moderate-content`.
- Consumes: existing `getSupabase()` (`server/index.js:12-14`), existing Bearer-token auth pattern (`server/routes/strava.js:49-70`), `process.env.OPENAI_API_KEY` (new env var).

- [ ] **Step 1: Write `server/moderation.js`**

```js
export async function moderateText(text) {
  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ input: text }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI Moderation API error: ${response.status}`)
  }

  const data = await response.json()
  const result = data.results?.[0]
  if (!result) throw new Error("OpenAI Moderation API returned no result")

  if (!result.flagged) {
    return { flagged: false, category: null, score: null }
  }

  const [topCategory] = Object.entries(result.category_scores)
    .sort(([, a], [, b]) => b - a)

  return { flagged: true, category: topCategory[0], score: topCategory[1] }
}
```

- [ ] **Step 2: Add the route to `server/index.js`**

Add near the other `/api/*` routes (after the `/api/resubscribe` route, `server/index.js:766+`). This mirrors `requireAuth` from `server/routes/strava.js:49-70` — define it locally since it isn't currently exported from that file:

```js
import { moderateText } from "./moderation.js"

async function requireAuth(req, res, next) {
  const header = req.get("authorization") || ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null

  if (!token) {
    return res.status(401).json({ error: "Missing Authorization bearer token" })
  }

  try {
    const { data, error } = await getSupabase().auth.getUser(token)
    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid or expired session" })
    }
    req.userId = data.user.id
    next()
  } catch (err) {
    console.error("Auth verification error:", err.message)
    res.status(401).json({ error: "Could not verify session" })
  }
}

app.post("/api/moderate-content", requireAuth, async (req, res) => {
  const { contentType, contentId, text } = req.body || {}

  if (!contentType || !contentId || !text) {
    return res.status(400).json({ error: "contentType, contentId, and text are required" })
  }

  try {
    const result = await moderateText(text)

    if (result.flagged) {
      const { error } = await getSupabase().from("moderation_flags").insert({
        content_type: contentType,
        content_id: contentId,
        source: "openai_moderation",
        category: result.category,
        score: result.score,
        auto_held: true,
      })
      if (error) throw error
    }

    res.json({ flagged: result.flagged, held: result.flagged })
  } catch (err) {
    console.error("Moderation check failed:", err.message)
    res.status(500).json({ error: "Moderation check failed" })
  }
})
```

- [ ] **Step 3: Add `OPENAI_API_KEY` to Railway**

This app's backend is deployed on Railway (`railway.json` at repo root). Kyle needs to add the env var there — it won't work locally or in prod without it:
  1. Go to [railway.app](https://railway.app) and open the Ski Dashboard backend service.
  2. Click the **Variables** tab.
  3. Add a new variable: name `OPENAI_API_KEY`, value = an API key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys) (Moderation API calls are free, but the key still needs an OpenAI account with billing set up, per OpenAI's requirements).
  4. Save — Railway redeploys automatically.

For local testing, add the same key to `server/.env` (create it if it doesn't exist; confirm `server/.gitignore` excludes `.env` before creating it, so the key never gets committed).

- [ ] **Step 4: Verify — call the endpoint directly**

With the server running locally (`cd server && npm run dev`) and a valid Supabase access token for your test account (grab it from `localStorage` in the browser DevTools after logging in, key starts with `sb-`):

```bash
curl -X POST http://localhost:8787/api/moderate-content \
  -H "Authorization: Bearer <your-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"contentType":"post","contentId":"00000000-0000-0000-0000-000000000000","text":"I want to kill everyone at this resort"}'
```

Expected: `{"flagged":true,"held":true}`, and a new row in `moderation_flags`:

```sql
select * from moderation_flags order by created_at desc limit 1;
```

Then confirm a clean call doesn't flag:

```bash
curl -X POST http://localhost:8787/api/moderate-content \
  -H "Authorization: Bearer <your-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"contentType":"post","contentId":"00000000-0000-0000-0000-000000000000","text":"Great powder day at Vail today!"}'
```

Expected: `{"flagged":false,"held":false}`, no new `moderation_flags` row.

- [ ] **Step 5: Commit**

```bash
git add server/moderation.js server/index.js
git commit -m "feat: add OpenAI Moderation API service and /api/moderate-content route"
```

---

## Self-review notes

- **Spec coverage:** items 1 (migration) → Task 1; item 2 (`is_verified`) → Task 1; item 3 (OAuth linking) → Tasks 1/2/3/4; item 4 (phone verification) → Tasks 1/3; item 5 (tier computation) → Task 1 (inside the RPCs, not a trigger — see design notes); item 6 (moderation) → Task 8, username profanity → Task 5; item 7 (reporting API) → Task 1/3; item 8 (new `socialApi.js` functions) → Task 3; item 9 (`VerificationUpgradeModal.jsx`) → Task 6. Testing checklist item 1 (Tier 0 UX unchanged) is true by construction — nothing in this plan gates any existing feature. Item 2 (gated action blocks Tier 0) → Task 7. Item 6 (moderation flag doesn't silently disappear) → Task 8 — `auto_held=true` is written but no delete/hide path exists since there's no real board yet; this becomes visible in Sprint 31's UI, out of scope here.
- **Deviations from the sprint file, and why:** no signup-time row creation (security — see Task 1); tier computation via RPC re-verification instead of a DB trigger (matches established no-trigger convention, and is strictly more secure than trusting client args); moderation runs through the existing Express server instead of a Supabase Edge Function (no Edge Function precedent exists in this codebase; the Express app already has the service-role client and secret-handling pattern).
