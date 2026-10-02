# Powder Alerts — SMS Delivery Channel + Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let powder-alert subscribers choose SMS instead of email, and pick which weekday + time of day they receive the briefing — with the SMS option fully hidden until Twilio credentials exist, so this ships at zero ongoing cost.

**Architecture:** One cron tick becomes fifteen (5 weekdays × 3 time slots), each querying only the subscribers scheduled for that slot and branching per-subscriber on email (existing Resend path, unchanged) vs. SMS (new Twilio path). Phone numbers are verified via a dedicated OTP flow — fully separate from the app's existing identity-verification phone system — before SMS delivery can be selected. A capability check (`GET /api/config`) hides the SMS option in the UI entirely until `TWILIO_*` env vars exist on the server.

**Tech Stack:** Express + node-cron + Supabase (existing), new `twilio` npm package in `server/` only (server has its own `package.json`, independent of the frontend's "no new deps" convention).

## Global Constraints

- **Deploy order is migration-first.** Per this project's established rule (see migration 048's own header comment): run migration 049 in the Supabase SQL editor, confirm the grants, THEN deploy code. Deploying first means every profile save 404s/403s on the new columns.
- Mountain Time only, for every slot — no per-user timezones (spec §5, non-goal).
- Days: Monday–Friday only, no weekends (spec §5, non-goal).
- Time slots: exactly three presets (morning/midday/evening) — no arbitrary HH:MM (spec §5, non-goal).
- The SMS channel option must not render in the UI at all (not disabled, not "Coming soon") until `GET /api/config` reports `smsAlertsAvailable: true`.
- No message to a user ever omits "Reply STOP to unsubscribe" (CTIA requirement for recurring automated texts).
- SMS message text must stay plain-ASCII (no emoji) — a single non-GSM character (e.g. ❄️) forces the whole message into UCS-2 encoding, dropping the per-segment limit from 160 to 70 characters and silently multiplying the per-message cost. This directly matters given the cost-consciousness that shaped this whole feature.
- Every new Supabase column added to `profiles` needs its own explicit `GRANT SELECT` — migration 031 replaced the table-level grant with an explicit column list, so a new column is invisible to `authenticated`/`anon` until granted (confirmed by migration 048's identical situation with `theme_mode`).

---

### Task 1: Migration 049 — alert channel, phone verification, and scheduling columns

**Files:**
- Create: `migrations/049_powder_alert_channel_and_scheduling.sql`

**Interfaces:**
- Produces: `profiles.alert_channel` (`'email'|'sms'`, default `'email'`), `profiles.alert_phone_verified_at` (nullable timestamp), `profiles.alert_day_of_week` (`'mon'|'tue'|'wed'|'thu'|'fri'`, default `'wed'`), `profiles.alert_time_slot` (`'morning'|'midday'|'evening'`, default `'morning'`), and table `alert_phone_otps(user_id, phone, code_hash, expires_at, attempts, created_at)` — all consumed by Tasks 3, 5, 6, 7.

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 049: Powder Alert SMS channel + delivery scheduling
--
-- Adds a channel choice (email vs SMS) and a day/time schedule to the existing
-- powder-alert preference (migration 015), plus a short-lived OTP table used to
-- verify a phone number before it can be used for SMS delivery.
--
-- ORDER OF OPERATIONS MATTERS — APPLY THIS BEFORE DEPLOYING THE BRANCH:
--   1. Run this whole file (ALTER, CREATE TABLE, and the GRANT) in the Supabase
--      SQL Editor.
--   2. NOTIFY pgrst, 'reload schema';
--   3. Only then deploy/push the frontend and server code.
-- Getting this order wrong breaks the app the same two ways migration 048 did:
--   * Code first, column absent: every profile save sends the new fields, so
--     EVERY save fails with PGRST204 ("column not found in schema cache").
--   * ALTER without the GRANT: migration 031 replaced profiles' table-level
--     SELECT with an explicit column list, so a new column is invisible to
--     authenticated/anon until explicitly granted — reads/RETURNING on these
--     columns fail with Postgres 42501 ("permission denied for column ...").
--
-- Only SELECT needs a column-level grant here — INSERT and UPDATE on
-- public.profiles are still table-level (031 only column-scoped SELECT), so
-- they cover new columns automatically.
--
-- ROLLBACK, if anything breaks:
--   ALTER TABLE profiles
--     DROP COLUMN IF EXISTS alert_channel,
--     DROP COLUMN IF EXISTS alert_phone_verified_at,
--     DROP COLUMN IF EXISTS alert_day_of_week,
--     DROP COLUMN IF EXISTS alert_time_slot;
--   DROP TABLE IF EXISTS alert_phone_otps;
--   (the column grants disappear with the columns)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS alert_channel TEXT NOT NULL DEFAULT 'email'
    CHECK (alert_channel IN ('email', 'sms')),
  ADD COLUMN IF NOT EXISTS alert_phone_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alert_day_of_week TEXT NOT NULL DEFAULT 'wed'
    CHECK (alert_day_of_week IN ('mon', 'tue', 'wed', 'thu', 'fri')),
  ADD COLUMN IF NOT EXISTS alert_time_slot TEXT NOT NULL DEFAULT 'morning'
    CHECK (alert_time_slot IN ('morning', 'midday', 'evening'));

GRANT SELECT (alert_channel, alert_phone_verified_at, alert_day_of_week, alert_time_slot)
  ON public.profiles TO authenticated, anon;

-- Short-lived OTP codes for verifying a phone number before it can be used for
-- SMS alerts. Deliberately separate from user_verification/mark_phone_verified
-- (migration 026) — that system verifies auth.users.phone for the account's
-- identity-trust tier, a different feature entirely. Conflating the two would
-- mean "where should your powder alert go" silently also changes login
-- behavior or identity tier.
CREATE TABLE IF NOT EXISTS alert_phone_otps (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS enabled with ZERO policies, same pattern as moderation_flags: every
-- access to this table goes through server/smsAlerts.js using the
-- service-role key, which bypasses RLS entirely. Enabling RLS with no
-- policies means that even if this table inherited anon/authenticated's
-- broad schema-wide default privileges (the still-open TASK 18.6 condition),
-- the default-deny behavior blocks every row operation for those roles
-- regardless. Not re-auditing TASK 18.6 here — this follows the existing,
-- already-verified-safe pattern for a new table.
ALTER TABLE alert_phone_otps ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP tool (`apply_migration`, project id `hkzaohqrycwfgmcogwdo`) or paste the file into the Supabase SQL Editor. Then run `NOTIFY pgrst, 'reload schema';`.

- [ ] **Step 3: Verify the grant actually took effect**

Run via `execute_sql` (read-only check, matches this project's established verification habit):

```sql
SELECT column_name FROM information_schema.column_privileges
WHERE table_name = 'profiles' AND grantee = 'authenticated'
  AND column_name IN ('alert_channel', 'alert_phone_verified_at', 'alert_day_of_week', 'alert_time_slot');
```

Expected: all 4 rows present. If any are missing, the GRANT statement didn't run — re-run it before proceeding to any later task.

- [ ] **Step 4: Commit**

```bash
git add migrations/049_powder_alert_channel_and_scheduling.sql
git commit -m "feat: add powder alert SMS channel and scheduling columns (migration 049)"
```

---

### Task 2: `server/alertSchedule.js` — day/time-slot → cron-expression mapping

**Files:**
- Create: `server/alertSchedule.js`
- Test: `server/alertSchedule.test.js`

**Interfaces:**
- Produces: `ALERT_DAYS` (array of 5 day codes), `ALERT_TIME_SLOTS` (object keyed by slot name), `cronExpressionForSlot(day, timeSlot)` → cron string, `ALL_ALERT_SLOTS` (array of `{ day, timeSlot, cron }`, length 15) — consumed by Task 5 (`server/cron.js`).

This is the piece most likely to hide a silent bug (an off-by-one in cron's day-of-week numbering sends nobody's alert, or the wrong day's), so it's written test-first.

- [ ] **Step 1: Write the failing test**

```js
// server/alertSchedule.test.js
import { test } from "node:test"
import assert from "node:assert/strict"
import { ALERT_DAYS, ALERT_TIME_SLOTS, cronExpressionForSlot, ALL_ALERT_SLOTS } from "./alertSchedule.js"

test("cronExpressionForSlot matches today's existing Wednesday-morning schedule exactly", () => {
  // The pre-existing cron.schedule("0 7 * * 3", ...) this feature replaces —
  // this slot must produce the byte-identical expression so Wednesday-morning
  // subscribers (every current subscriber, via the column defaults) see zero
  // change in when their briefing arrives.
  assert.equal(cronExpressionForSlot("wed", "morning"), "0 7 * * 3")
})

test("cronExpressionForSlot maps each weekday to the correct cron day number", () => {
  assert.equal(cronExpressionForSlot("mon", "morning"), "0 7 * * 1")
  assert.equal(cronExpressionForSlot("tue", "morning"), "0 7 * * 2")
  assert.equal(cronExpressionForSlot("thu", "morning"), "0 7 * * 4")
  assert.equal(cronExpressionForSlot("fri", "morning"), "0 7 * * 5")
})

test("cronExpressionForSlot maps each time slot to the correct hour", () => {
  assert.equal(cronExpressionForSlot("mon", "midday"), "0 12 * * 1")
  assert.equal(cronExpressionForSlot("mon", "evening"), "0 18 * * 1")
})

test("cronExpressionForSlot throws on an unknown day or time slot", () => {
  assert.throws(() => cronExpressionForSlot("sat", "morning"))
  assert.throws(() => cronExpressionForSlot("mon", "night"))
})

test("ALL_ALERT_SLOTS covers every weekday x time-slot combination exactly once", () => {
  assert.equal(ALL_ALERT_SLOTS.length, 15)
  const keys = new Set(ALL_ALERT_SLOTS.map((s) => `${s.day}-${s.timeSlot}`))
  assert.equal(keys.size, 15)
  for (const day of ALERT_DAYS) {
    for (const timeSlot of Object.keys(ALERT_TIME_SLOTS)) {
      assert.ok(keys.has(`${day}-${timeSlot}`), `missing ${day}/${timeSlot}`)
    }
  }
})

test("ALL_ALERT_SLOTS never includes a weekend day", () => {
  assert.ok(ALL_ALERT_SLOTS.every((s) => !["sat", "sun"].includes(s.day)))
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/alertSchedule.test.js`
Expected: FAIL — `server/alertSchedule.js` doesn't exist yet (module not found).

- [ ] **Step 3: Write the implementation**

```js
// server/alertSchedule.js
//
// Pure mapping from (day, time slot) to the node-cron expression that fires
// it. No I/O, no Supabase — kept separate from cron.js so the one place most
// likely to hide an off-by-one (cron's day-of-week numbering: 0/7=Sun,
// 1=Mon...6=Sat) is unit-testable on its own.

export const ALERT_DAYS = ["mon", "tue", "wed", "thu", "fri"]

const CRON_DAY_NUMBER = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 }

export const ALERT_TIME_SLOTS = {
  morning: { hour: 7, minute: 0 },
  midday: { hour: 12, minute: 0 },
  evening: { hour: 18, minute: 0 },
}

export function cronExpressionForSlot(day, timeSlot) {
  const dayNum = CRON_DAY_NUMBER[day]
  const slot = ALERT_TIME_SLOTS[timeSlot]
  if (dayNum === undefined || !slot) {
    throw new Error(`Unknown alert slot: ${day}/${timeSlot}`)
  }
  return `${slot.minute} ${slot.hour} * * ${dayNum}`
}

export const ALL_ALERT_SLOTS = ALERT_DAYS.flatMap((day) =>
  Object.keys(ALERT_TIME_SLOTS).map((timeSlot) => ({
    day,
    timeSlot,
    cron: cronExpressionForSlot(day, timeSlot),
  }))
)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test server/alertSchedule.test.js`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add server/alertSchedule.js server/alertSchedule.test.js
git commit -m "feat: add pure day/time-slot cron-expression mapping for powder alerts"
```

---

### Task 3: `server/smsAlerts.js` — Twilio wrapper, OTP verification, and inbound STOP handling

**Files:**
- Create: `server/smsAlerts.js`
- Test: `server/smsAlerts.test.js`
- Modify: `server/package.json` (add `twilio` dependency)

**Interfaces:**
- Consumes: `profiles` table (Task 1), `alert_phone_otps` table (Task 1).
- Produces: `smsAlertsAvailable()` → boolean, `getTwilioClient()` → Twilio client instance, `composeSmsBriefing(briefing)` → string (same `briefing` shape `composeBriefing()` in `server/cron.js` already returns: `{ top3, bestBet, weekendOutlook }`), default export `router` (Express Router mounted in Task 4) exposing `POST /api/alerts/send-phone-code`, `POST /api/alerts/verify-phone-code`, `POST /api/sms/inbound`. Consumed by Task 4 (`server/index.js`) and Task 5 (`server/cron.js`, which imports `composeSmsBriefing`/`smsAlertsAvailable`/`getTwilioClient`).

- [ ] **Step 1: Add the Twilio dependency**

```bash
cd server && npm install twilio
```

- [ ] **Step 2: Write the failing tests for the pure helpers**

```js
// server/smsAlerts.test.js
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  normalizeUsPhoneToE164,
  generateOtpCode,
  hashOtpCode,
  composeSmsBriefing,
  isStopKeyword,
} from "./smsAlerts.js"

test("normalizeUsPhoneToE164 formats a plain 10-digit number", () => {
  assert.equal(normalizeUsPhoneToE164("3035551234"), "+13035551234")
})

test("normalizeUsPhoneToE164 strips formatting characters", () => {
  assert.equal(normalizeUsPhoneToE164("(303) 555-1234"), "+13035551234")
})

test("normalizeUsPhoneToE164 accepts a number already prefixed with country code 1", () => {
  assert.equal(normalizeUsPhoneToE164("13035551234"), "+13035551234")
})

test("normalizeUsPhoneToE164 leaves an already-E.164 number unchanged", () => {
  assert.equal(normalizeUsPhoneToE164("+13035551234"), "+13035551234")
})

test("normalizeUsPhoneToE164 rejects a too-short number", () => {
  assert.equal(normalizeUsPhoneToE164("5551234"), null)
})

test("normalizeUsPhoneToE164 rejects empty input", () => {
  assert.equal(normalizeUsPhoneToE164(""), null)
  assert.equal(normalizeUsPhoneToE164(undefined), null)
})

test("generateOtpCode always returns a 6-digit numeric string", () => {
  for (let i = 0; i < 50; i++) {
    const code = generateOtpCode()
    assert.equal(code.length, 6)
    assert.match(code, /^\d{6}$/)
  }
})

test("hashOtpCode is deterministic for the same code", () => {
  assert.equal(hashOtpCode("123456"), hashOtpCode("123456"))
})

test("hashOtpCode differs for different codes", () => {
  assert.notEqual(hashOtpCode("123456"), hashOtpCode("654321"))
})

test("composeSmsBriefing includes the resort name, score, and required opt-out line", () => {
  const text = composeSmsBriefing({
    bestBet: { name: "Vail", powderScore: 82.4, powderTier: "Elite" },
  })
  assert.ok(text.includes("Vail"))
  assert.ok(text.includes("82"))
  assert.ok(text.includes("Reply STOP to unsubscribe"))
})

test("composeSmsBriefing stays plain-ASCII (no emoji) to avoid forcing UCS-2 encoding", () => {
  // A single non-GSM-7 character (e.g. the snowflake emoji used elsewhere in
  // this app) forces the WHOLE message into UCS-2 encoding, which drops the
  // per-segment limit from 160 to 70 characters — silently multiplying the
  // billed segment count. This message must stay GSM-7-safe.
  const text = composeSmsBriefing({
    bestBet: { name: "Vail", powderScore: 82.4, powderTier: "Elite" },
  })
  assert.match(text, /^[\x00-\x7F]*$/)
})

test("composeSmsBriefing fits in one SMS segment", () => {
  const text = composeSmsBriefing({
    bestBet: { name: "Vail", powderScore: 82.4, powderTier: "Elite" },
  })
  assert.ok(text.length <= 160, `message is ${text.length} chars, expected <= 160`)
})

test("isStopKeyword matches the standard opt-out keywords case-insensitively", () => {
  for (const word of ["STOP", "stop", "Unsubscribe", "Cancel", "end", "QUIT"]) {
    assert.equal(isStopKeyword(word), true)
  }
})

test("isStopKeyword ignores surrounding whitespace", () => {
  assert.equal(isStopKeyword("  stop  "), true)
})

test("isStopKeyword rejects ordinary message text", () => {
  assert.equal(isStopKeyword("thanks!"), false)
  assert.equal(isStopKeyword(""), false)
  assert.equal(isStopKeyword(undefined), false)
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test server/smsAlerts.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

```js
// server/smsAlerts.js
import crypto from "crypto"
import express, { Router } from "express"
import twilio from "twilio"
import { createClient } from "@supabase/supabase-js"

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// Same local-copy pattern as requireAuth in routes/strava.js and index.js —
// every route below uses req.userId, never req.body.userId, which is
// attacker-controlled and, against a service-role client that bypasses RLS,
// amounts to "act as any user you can name".
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
    console.error("[smsAlerts] Auth verification error:", err.message)
    res.status(401).json({ error: "Could not verify session" })
  }
}

// ── Capability gate ──────────────────────────────────────────────────────
// The single source of truth for "is SMS turned on" — consumed by the
// /api/config route (Task 4), the OTP routes below, and server/cron.js
// (Task 5). Checking TWILIO_FROM_NUMBER too, not just the two auth values,
// because a real send also needs a number to send from.
export function smsAlertsAvailable() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  )
}

export function getTwilioClient() {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
}

// ── Pure helpers (unit tested above) ────────────────────────────────────

export function normalizeUsPhoneToE164(input) {
  const digits = (input || "").replace(/\D/g, "")
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
  return null
}

export function generateOtpCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0")
}

export function hashOtpCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex")
}

// Deliberately plain-ASCII — see the "stays plain-ASCII" test above for why.
export function composeSmsBriefing(briefing) {
  const { bestBet } = briefing
  const score = Math.round(bestBet.powderScore)
  return `PowDays: Best Bet today is ${bestBet.name} (${score}/100, ${bestBet.powderTier}). Full forecast: powdays.app. Reply STOP to unsubscribe.`
}

const STOP_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"])

export function isStopKeyword(body) {
  return STOP_KEYWORDS.has((body || "").trim().toLowerCase())
}

// ── Routes ───────────────────────────────────────────────────────────────

const OTP_TTL_MS = 5 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_ATTEMPTS = 5

const router = Router()

router.post("/api/alerts/send-phone-code", requireAuth, async (req, res) => {
  if (!smsAlertsAvailable()) {
    return res.status(503).json({ error: "SMS alerts aren't available yet." })
  }
  const phone = normalizeUsPhoneToE164(req.body?.phone)
  if (!phone) {
    return res.status(400).json({ error: "Enter a valid 10-digit US phone number." })
  }

  const supabase = getSupabase()
  const { data: existing } = await supabase
    .from("alert_phone_otps")
    .select("created_at")
    .eq("user_id", req.userId)
    .maybeSingle()

  if (existing && Date.now() - new Date(existing.created_at).getTime() < RESEND_COOLDOWN_MS) {
    return res.status(429).json({ error: "Please wait a moment before requesting another code." })
  }

  const code = generateOtpCode()
  const { error } = await supabase.from("alert_phone_otps").upsert({
    user_id: req.userId,
    phone,
    code_hash: hashOtpCode(code),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    attempts: 0,
    created_at: new Date().toISOString(),
  })
  if (error) throw error

  try {
    await getTwilioClient().messages.create({
      to: phone,
      from: process.env.TWILIO_FROM_NUMBER,
      body: `Your PowDays verification code is ${code}. It expires in 5 minutes.`,
    })
  } catch (e) {
    console.warn("[smsAlerts] Failed to send OTP SMS:", e.message)
    return res.status(502).json({ error: "Could not send the verification text. Try again." })
  }

  res.json({ ok: true })
})

router.post("/api/alerts/verify-phone-code", requireAuth, async (req, res) => {
  if (!smsAlertsAvailable()) {
    return res.status(503).json({ error: "SMS alerts aren't available yet." })
  }
  const code = String(req.body?.code || "").trim()
  const supabase = getSupabase()
  const { data: row, error } = await supabase
    .from("alert_phone_otps")
    .select("*")
    .eq("user_id", req.userId)
    .maybeSingle()
  if (error) throw error
  if (!row) {
    return res.status(400).json({ error: "No verification code pending. Request a new one." })
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await supabase.from("alert_phone_otps").delete().eq("user_id", req.userId)
    return res.status(400).json({ error: "That code has expired. Request a new one." })
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await supabase.from("alert_phone_otps").delete().eq("user_id", req.userId)
    return res.status(400).json({ error: "Too many attempts. Request a new code." })
  }
  if (hashOtpCode(code) !== row.code_hash) {
    await supabase.from("alert_phone_otps").update({ attempts: row.attempts + 1 }).eq("user_id", req.userId)
    return res.status(400).json({ error: "That code is incorrect." })
  }

  const verifiedAt = new Date().toISOString()
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ alert_phone: row.phone, alert_phone_verified_at: verifiedAt })
    .eq("id", req.userId)
  if (updateErr) throw updateErr

  await supabase.from("alert_phone_otps").delete().eq("user_id", req.userId)

  res.json({ ok: true, phone: row.phone, verifiedAt })
})

// Twilio posts this as application/x-www-form-urlencoded, not JSON — the
// global express.json() middleware in index.js won't parse it, so this
// route needs its own urlencoded parser.
router.post("/api/sms/inbound", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const signature = req.get("X-Twilio-Signature")
    const url = `${process.env.BACKEND_URL}/api/sms/inbound`
    const valid =
      smsAlertsAvailable() &&
      twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, url, req.body)

    if (valid && isStopKeyword(req.body?.Body)) {
      await getSupabase()
        .from("profiles")
        .update({ powder_alerts_enabled: false })
        .eq("alert_phone", req.body.From)
    }
  } catch (e) {
    console.warn("[smsAlerts] Inbound webhook error:", e.message)
  }
  // Twilio expects TwiML back, even if empty — an unacknowledged webhook gets retried.
  res.type("text/xml").send("<Response></Response>")
})

export default router
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test server/smsAlerts.test.js`
Expected: PASS, all 14 tests.

- [ ] **Step 6: Commit**

```bash
git add server/smsAlerts.js server/smsAlerts.test.js server/package.json server/package-lock.json
git commit -m "feat: add Twilio-backed phone OTP verification and SMS sending"
```

---

### Task 4: Wire the SMS router and capability check into `server/index.js`

**Files:**
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `smsAlertsAvailable` (from Task 3's `server/smsAlerts.js`), default-exported `router` (Task 3).
- Produces: `GET /api/config` → `{ smsAlertsAvailable: boolean }`, consumed by the frontend in Task 8.

- [ ] **Step 1: Add the import and mount the router**

In `server/index.js`, alongside the existing `import stravaRouter from "./routes/strava.js"` (line 7):

```js
import smsAlertsRouter from "./smsAlerts.js"
import { smsAlertsAvailable } from "./smsAlerts.js"
```

Alongside the existing `app.use(stravaRouter)` (line 21):

```js
app.use(smsAlertsRouter)
```

- [ ] **Step 2: Add the `/api/config` route**

Add near the other simple `GET` routes (e.g. just above `/api/unsubscribe` at line 799):

```js
// ── Capability check: does the UI get to offer SMS alerts at all? ──
// Public/unauthenticated is fine — this reveals nothing beyond "is SMS turned
// on," no different from information already visible by trying to select it.
app.get("/api/config", (_req, res) => {
  res.json({ smsAlertsAvailable: smsAlertsAvailable() })
})
```

- [ ] **Step 3: Manually verify the route**

No automated test for this (pure routing glue, consistent with how `/api/unsubscribe` has no test either). Run the server locally and confirm:

```bash
cd server && node index.js &
curl http://localhost:8787/api/config
```

Expected: `{"smsAlertsAvailable":false}` (no `TWILIO_*` env vars are set locally yet).

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: mount SMS alert routes and add /api/config capability check"
```

---

### Task 5: Rewrite `server/cron.js` for per-slot firing and per-channel branching

**Files:**
- Modify: `server/cron.js` (full rewrite of the body; `composeBriefing()` itself is untouched)

**Interfaces:**
- Consumes: `ALL_ALERT_SLOTS` (Task 2), `composeSmsBriefing`, `smsAlertsAvailable`, `getTwilioClient` (Task 3).
- Produces: `sendBriefingForSlot(day, timeSlot)` (exported for manual/local testing), `registerPowderAlertCrons()` (replaces the old `registerWeeklyBriefingCron` export name — Task requires updating `server/index.js`'s import too).

- [ ] **Step 1: Replace the file contents**

```js
// server/cron.js
import cron from "node-cron"
import { Resend } from "resend"
import { createClient } from "@supabase/supabase-js"
import { getAllResortConditions } from "./index.js"
import { renderPowderBriefingEmail } from "./emailTemplates.js"
import { signAlertToken } from "./alertTokens.js"
import { ALL_ALERT_SLOTS } from "./alertSchedule.js"
import { composeSmsBriefing, smsAlertsAvailable, getTwilioClient } from "./smsAlerts.js"

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

async function composeBriefing() {
  const resorts = await getAllResortConditions()
  const openScored = resorts.filter((r) => r.isOpen && r.powderScore != null)

  if (!openScored.length) return null // F-REQ-ALERT-003 — no briefing if nothing is open/scoreable

  const ranked = [...openScored].sort((a, b) => b.powderScore - a.powderScore)
  const top3 = ranked.slice(0, 3)
  const bestBet = { ...ranked[0], reason: `${Math.round(ranked[0].powderScore)} powder score, ${ranked[0].powderTier} conditions.` }

  return { top3, bestBet, weekendOutlook: null }
}

export async function sendBriefingForSlot(day, timeSlot) {
  const briefing = await composeBriefing()
  if (!briefing) {
    console.log(`[cron] No open/scoreable resorts — skipping ${day}/${timeSlot} send (F-REQ-ALERT-003).`)
    return
  }

  const supabase = getSupabase()
  const { data: subscribers, error } = await supabase
    .from("profiles")
    .select("id, full_name, alert_channel, alert_phone, alert_phone_verified_at")
    .eq("powder_alerts_enabled", true)
    .eq("alert_day_of_week", day)
    .eq("alert_time_slot", timeSlot)
  if (error) throw error

  if (!subscribers || !subscribers.length) {
    console.log(`[cron] No subscribers for ${day}/${timeSlot} — skipping send.`)
    return
  }

  const emailSubs = subscribers.filter((s) => (s.alert_channel ?? "email") === "email")
  const smsSubs = subscribers.filter((s) => s.alert_channel === "sms")

  let sent = 0
  let failed = 0

  if (emailSubs.length) {
    const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers()
    if (authErr) throw authErr
    const emailById = new Map(authUsers.users.map((u) => [u.id, u.email]))

    const resend = new Resend(process.env.RESEND_API_KEY)
    const html = renderPowderBriefingEmail(briefing)

    for (const sub of emailSubs) {
      const email = emailById.get(sub.id)
      if (!email) { failed++; continue }
      try {
        const unsubscribeToken = signAlertToken(sub.id, "unsubscribe")
        const unsubscribeUrl = `${process.env.BACKEND_URL}/api/unsubscribe?token=${unsubscribeToken}`
        const personalizedHtml = html.replace("{{UNSUBSCRIBE_URL}}", unsubscribeUrl)
        await resend.emails.send({
          from: process.env.FROM_EMAIL,
          to: email,
          subject: `❄️ This week's best bet: ${briefing.bestBet.name}`,
          html: personalizedHtml,
        })
        sent++
      } catch (e) {
        console.warn(`[cron] Failed to email briefing to ${email}:`, e.message)
        failed++
      }
    }
  }

  if (smsSubs.length) {
    if (!smsAlertsAvailable()) {
      console.warn(`[cron] ${smsSubs.length} SMS subscriber(s) in ${day}/${timeSlot} but Twilio isn't configured — skipping.`)
      failed += smsSubs.length
    } else {
      const client = getTwilioClient()
      const text = composeSmsBriefing(briefing)
      for (const sub of smsSubs) {
        if (!sub.alert_phone_verified_at || !sub.alert_phone) {
          console.warn(`[cron] Subscriber ${sub.id} has alert_channel=sms but no verified phone — skipping.`)
          failed++
          continue
        }
        try {
          await client.messages.create({ to: sub.alert_phone, from: process.env.TWILIO_FROM_NUMBER, body: text })
          sent++
        } catch (e) {
          console.warn(`[cron] Failed to text briefing to subscriber ${sub.id}:`, e.message)
          failed++
        }
      }
    }
  }

  console.log(`[cron] ${day}/${timeSlot} briefing: ${sent} sent, ${failed} failed.`)
}

export function registerPowderAlertCrons() {
  // node-cron's `timezone` option (America/Denver) handles the MST/MDT switch
  // automatically for every slot, same as the single schedule this replaces.
  for (const slot of ALL_ALERT_SLOTS) {
    cron.schedule(slot.cron, () => {
      sendBriefingForSlot(slot.day, slot.timeSlot).catch((e) =>
        console.error(`[cron] Briefing job failed for ${slot.day}/${slot.timeSlot}:`, e)
      )
    }, { timezone: "America/Denver" })
  }
  console.log(`[cron] Powder alert briefings scheduled across ${ALL_ALERT_SLOTS.length} weekly slots (Mon-Fri x morning/midday/evening, MT)`)
}
```

- [ ] **Step 2: Update `server/index.js`'s import and call site**

```js
// Before:
import { registerWeeklyBriefingCron } from "./cron.js"
// After:
import { registerPowderAlertCrons } from "./cron.js"
```

And at the bottom of `server/index.js` (the `if` guard that boots cron only when this file is the real entrypoint):

```js
// Before:
  registerWeeklyBriefingCron()
// After:
  registerPowderAlertCrons()
```

- [ ] **Step 3: Manually verify**

No automated test for `sendBriefingForSlot` itself (it's I/O-heavy — DB + email/SMS sends — matching how the original `sendWeeklyBriefing` was never unit tested either; the pure pieces it calls, `composeSmsBriefing` and the cron-expression mapping, already have full coverage from Tasks 2-3). Verify by code review: re-read the branching logic against Task 1's schema and confirm the `.eq()` filter names exactly match the migration's column names (`alert_day_of_week`, `alert_time_slot`, `alert_channel`, `alert_phone`, `alert_phone_verified_at`).

Run the full suite to confirm nothing else broke:

```bash
npm test
```

Expected: all existing tests still pass, plus the new `alertSchedule.test.js` and `smsAlerts.test.js` tests from Tasks 2-3.

- [ ] **Step 4: Commit**

```bash
git add server/cron.js server/index.js
git commit -m "feat: fire powder alert briefings per weekday/time slot with per-channel delivery"
```

---

### Task 6: `src/lib/profileForm.js` — writable fields + phone-change verification guard

**Files:**
- Modify: `src/lib/profileForm.js`
- Modify: `src/lib/profileForm.test.js`

**Interfaces:**
- Produces: `PROFILE_WRITE_FIELDS` gains `alert_channel`, `alert_phone_verified_at`, `alert_day_of_week`, `alert_time_slot`. `buildProfileUpdate` gains a guard: changing `alert_phone` clears `alert_phone_verified_at` to `null`, UNLESS the caller explicitly provides `alert_phone_verified_at` in `changes` (used by Task 8's UI to carry a just-completed verification through the same save that also updates the phone field).

This guard exists because of a real race: Task 8's Notifications sheet calls the OTP-verify endpoint (which writes `alert_phone`/`alert_phone_verified_at` directly to the DB via service-role key) and THEN, on the same screen, the user clicks "Save Changes" — which goes through this function using the sheet's *stale* `profile` prop (captured when the sheet opened, before verification happened). Without the explicit-override escape hatch, the generic "phone changed → clear verification" rule would immediately undo the verification that had just succeeded, because the stale `profile.alert_phone` still shows the old number.

- [ ] **Step 1: Write the failing tests**

Update the `LOADED` fixture at the top of `src/lib/profileForm.test.js` to include the new fields:

```js
const LOADED = {
  id: "u1",
  first_name: "Kyle", last_name: "Ray", full_name: "Kyle Ray",
  username: "kray", avatar_url: "https://example.test/a.png",
  skill_level: "black", sport_type: "ski", ski_passes: ["Ikon"],
  favorite_mountain: "Winter Park",
  vehicle_label: "Blue Subaru", vehicle_seats: 3,
  powder_alerts_enabled: true, alert_phone: "5550100",
  alert_channel: "sms", alert_phone_verified_at: "2026-09-01T00:00:00.000Z",
  alert_day_of_week: "wed", alert_time_slot: "morning",
  theme: "storm-chaser",
  theme_mode: "light",
  is_admin: false, strava_athlete_id: 12345,
}
```

(Changed `alert_phone` from `"555-0100"` to `"5550100"` only so later tests can compare it with `!==` cleanly against a differently-formatted new number — the OTP flow normalizes to E.164 server-side, so by the time a verified number lands in `profile.alert_phone` it won't contain dashes.)

Add these tests at the end of the file:

```js
test("buildProfileUpdate preserves alert_channel/day/time when another screen saves", () => {
  const out = buildProfileUpdate(LOADED, { vehicle_seats: 4 })
  assert.equal(out.alert_channel, "sms")
  assert.equal(out.alert_day_of_week, "wed")
  assert.equal(out.alert_time_slot, "morning")
  assert.equal(out.alert_phone_verified_at, "2026-09-01T00:00:00.000Z")
})

test("buildProfileUpdate clears alert_phone_verified_at when alert_phone changes with no explicit override", () => {
  const out = buildProfileUpdate(LOADED, { alert_phone: "5559999" })
  assert.equal(out.alert_phone, "5559999")
  assert.equal(out.alert_phone_verified_at, null)
})

test("buildProfileUpdate respects an explicitly-provided alert_phone_verified_at even when alert_phone also changes", () => {
  // This is the just-verified-then-save race Task 8's UI hits: it passes both
  // fields together from its own live state, not from the stale profile prop.
  const out = buildProfileUpdate(LOADED, {
    alert_phone: "5559999",
    alert_phone_verified_at: "2026-10-01T12:00:00.000Z",
  })
  assert.equal(out.alert_phone, "5559999")
  assert.equal(out.alert_phone_verified_at, "2026-10-01T12:00:00.000Z")
})

test("buildProfileUpdate does not clear alert_phone_verified_at when alert_phone is resaved unchanged", () => {
  const out = buildProfileUpdate(LOADED, { alert_phone: "5550100" })
  assert.equal(out.alert_phone_verified_at, "2026-09-01T00:00:00.000Z")
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/profileForm.test.js` (or `node --test src/lib/profileForm.test.js`)
Expected: FAIL — `PROFILE_WRITE_FIELDS` doesn't include the new fields yet, so `Object.keys(out)` won't have `alert_channel` etc.

- [ ] **Step 3: Update `PROFILE_WRITE_FIELDS` and add the guard**

In `src/lib/profileForm.js`:

```js
export const PROFILE_WRITE_FIELDS = [
  "first_name",
  "last_name",
  "full_name",
  "username",
  "avatar_url",
  "ski_passes",
  "favorite_mountain",
  "sport_type",
  "skill_level",
  "vehicle_label",
  "vehicle_seats",
  "powder_alerts_enabled",
  "alert_phone",
  "alert_channel",
  "alert_phone_verified_at",
  "alert_day_of_week",
  "alert_time_slot",
  "theme",
  "theme_mode",
]
```

Add the guard immediately after the existing `full_name` recompute block, before the `""` → `null` normalization loop:

```js
  // Changing the phone number invalidates any prior verification — the
  // number saved in alert_phone_verified_at must always match the number
  // actually stored in alert_phone. The explicit-override escape hatch exists
  // for a real race: the Notifications sheet calls a dedicated OTP-verify
  // endpoint that writes both fields directly to the DB, then the user hits
  // "Save Changes" here using the sheet's now-stale `profile` prop (captured
  // before verification happened). Without this escape hatch, the generic
  // "phone changed -> clear verification" rule below would immediately undo
  // the verification that had just succeeded. The sheet avoids this by always
  // passing alert_phone_verified_at explicitly from its own live state rather
  // than relying on this function's default carry-forward behavior.
  if (
    changes.alert_phone !== undefined &&
    changes.alert_phone !== (profile?.alert_phone ?? null) &&
    changes.alert_phone_verified_at === undefined
  ) {
    payload.alert_phone_verified_at = null
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/profileForm.test.js`
Expected: PASS, all tests including the pre-existing ones (the "returns exactly the writable field set" test passes automatically since it derives its expectation from `PROFILE_WRITE_FIELDS` itself).

- [ ] **Step 5: Commit**

```bash
git add src/lib/profileForm.js src/lib/profileForm.test.js
git commit -m "feat: add alert channel/schedule fields to profile writes, guard phone-change verification"
```

---

### Task 7: `src/lib/socialApi.js` — extend the profile read/write surface

**Files:**
- Modify: `src/lib/socialApi.js`

**Interfaces:**
- Consumes: Task 1's migration (must be live in Supabase before this code is deployed — see Global Constraints).
- Produces: `getMyProfile()` and `upsertMyProfile()` now read/write `alert_channel`, `alert_phone_verified_at`, `alert_day_of_week`, `alert_time_slot`.

This is the second half of the "writer census" this app has been bitten by before — `PROFILE_WRITE_FIELDS` (Task 6) only controls what `buildProfileUpdate` *returns*; `upsertMyProfile` rebuilds its own payload object by hand from scratch rather than spreading it, so it independently needs the same 4 fields added or they're silently dropped on every save regardless of what Task 6 did.

- [ ] **Step 1: Update `PROFILE_SELECT_COLUMNS`**

In `src/lib/socialApi.js` (line 22-23):

```js
const PROFILE_SELECT_COLUMNS =
  "id, first_name, last_name, full_name, username, avatar_url, skill_level, sport_type, ski_passes, favorite_mountain, vehicle_label, vehicle_seats, powder_alerts_enabled, alert_phone, alert_channel, alert_phone_verified_at, alert_day_of_week, alert_time_slot, theme, theme_mode, is_admin, strava_athlete_id";
```

- [ ] **Step 2: Update `upsertMyProfile`'s payload**

In `src/lib/socialApi.js`, inside `upsertMyProfile` (around line 446-467), add these four lines after the existing `alert_phone` line:

```js
    powder_alerts_enabled: profile.powder_alerts_enabled ?? false,
    alert_phone: profile.alert_phone || null,
    alert_channel: profile.alert_channel === "sms" ? "sms" : "email",
    alert_phone_verified_at: profile.alert_phone_verified_at || null,
    alert_day_of_week: profile.alert_day_of_week || "wed",
    alert_time_slot: profile.alert_time_slot || "morning",
    theme: profile.theme || "blizzard",
```

- [ ] **Step 3: Manually verify against `buildProfileUpdate`'s output shape**

No new automated test for this file (there's no existing `socialApi.test.js` in the repo, and this change doesn't warrant creating one from scratch — consistent with this codebase's existing testing boundary at `src/lib` pure-logic files, not Supabase-calling glue). Instead, grep-verify the two writer lists actually agree:

```bash
grep -A20 "export const PROFILE_WRITE_FIELDS" src/lib/profileForm.js
grep -A25 "export async function upsertMyProfile" src/lib/socialApi.js
```

Confirm every field `PROFILE_WRITE_FIELDS` lists also appears as a key in `upsertMyProfile`'s payload object (both lists should now have exactly 19 fields in common, modulo `id`/`updated_at` which `upsertMyProfile` adds itself and `profileForm.js`'s own header comment already documents as excluded).

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: all tests pass (no `src/lib` test directly exercises `socialApi.js`, so this step is really confirming Task 6's tests and everything else are undisturbed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/socialApi.js
git commit -m "feat: read and write alert channel/schedule fields on the profile"
```

---

### Task 8: `ProfileSettingsList.jsx` — day/time scheduling controls

**Files:**
- Modify: `src/components/profile/ProfileSettingsList.jsx`

**Interfaces:**
- Consumes: `profile.alert_day_of_week`, `profile.alert_time_slot` (Task 7).

This task adds the scheduling controls only — no SMS/channel UI yet (that's Task 9, which depends on backend routes already being live). Scoped separately because a reviewer could reasonably accept day/time scheduling (simple, no new backend dependency) while still wanting changes to the channel/OTP flow, or vice versa.

- [ ] **Step 1: Add the option constants above `NotificationsSheet`**

```js
const DAY_OPTIONS = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
]

const TIME_SLOT_OPTIONS = [
  { value: "morning", label: "Early morning" },
  { value: "midday", label: "Midday" },
  { value: "evening", label: "Evening" },
]
```

- [ ] **Step 2: Add state and the controls inside `NotificationsSheet`**

Add to the existing state declarations:

```js
  const [dayOfWeek, setDayOfWeek] = useState(profile?.alert_day_of_week ?? "wed")
  const [timeSlot, setTimeSlot] = useState(profile?.alert_time_slot ?? "morning")
```

Replace the toggle label text (drop the hardcoded day, since it's now a real choice below it):

```jsx
        📧 Weekly powder forecast
```

Add the two selectors right after the existing checkbox `<label>`, still inside the `{enabled && (...)}` block (which doesn't exist yet in the current file — wrap the checkbox's sibling content, starting with the existing phone `<input>`, in `{enabled && (<>...</>)}`):

```jsx
      {enabled && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
            <div>
              <div style={labelStyle}>Day</div>
              <select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} style={fieldStyle}>
                {DAY_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <div style={labelStyle}>Time</div>
              <select value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)} style={fieldStyle}>
                {TIME_SLOT_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <input
            type="tel"
            placeholder="Phone number (for future SMS alerts)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ ...fieldStyle, marginTop: 12 }}
          />
        </>
      )}
```

(This temporarily keeps the existing phone input's old placeholder text and unconditional rendering — Task 9 replaces this whole block with the channel-aware version.)

- [ ] **Step 3: Pass the new fields on save**

In `handleSave`:

```js
      await upsertMyProfile(buildProfileUpdate(profile, {
        powder_alerts_enabled: enabled,
        alert_phone: phone.trim() || null,
        alert_day_of_week: dayOfWeek,
        alert_time_slot: timeSlot,
      }))
```

- [ ] **Step 4: Manually verify**

No component test harness exists in this codebase (confirmed: `npm test` only globs `src/lib`/`server`). Verify by running the dev server and clicking through:

```bash
npm run dev
```

Open the app, go to Profile → Settings → Notifications, enable Powder Alerts, confirm the Day and Time dropdowns appear and default to Wednesday / Early morning, change them, save, reopen the sheet, and confirm the saved values persisted.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile/ProfileSettingsList.jsx
git commit -m "feat: add day/time scheduling controls to the powder alert settings"
```

---

### Task 9: `ProfileSettingsList.jsx` — channel choice and phone verification flow

**Files:**
- Modify: `src/components/profile/ProfileSettingsList.jsx`

**Interfaces:**
- Consumes: `GET /api/config` (Task 4), `POST /api/alerts/send-phone-code` / `POST /api/alerts/verify-phone-code` (Task 3), `authHeaders()` (`src/lib/supabase.js`, already exists — used identically by `StravaConnect.jsx`).
- Produces: the SMS channel option in the UI, which **does not render at all** unless `GET /api/config` reports `smsAlertsAvailable: true`.

- [ ] **Step 1: Add the imports and `API_BASE` constant**

At the top of `ProfileSettingsList.jsx`:

```js
import { authHeaders } from "../../lib/supabase"

// Matches the API_BASE fallback pattern used elsewhere (StravaConnect.jsx, App.jsx).
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8787"
```

- [ ] **Step 2: Add channel/verification state and the capability check**

Inside `NotificationsSheet`, add alongside the existing state:

```js
  const [channel, setChannel] = useState(profile?.alert_channel === "sms" ? "sms" : "email")
  const [smsAvailable, setSmsAvailable] = useState(false)
  const [verifiedPhone, setVerifiedPhone] = useState(
    profile?.alert_phone_verified_at ? profile?.alert_phone : null
  )
  const [verifiedAt, setVerifiedAt] = useState(profile?.alert_phone_verified_at ?? null)
  const [otpStage, setOtpStage] = useState("idle") // 'idle' | 'sent'
  const [otpCode, setOtpCode] = useState("")
  const [otpError, setOtpError] = useState("")
  const [otpSending, setOtpSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/config`)
      .then((res) => (res.ok ? res.json() : { smsAlertsAvailable: false }))
      .then((data) => { if (!cancelled) setSmsAvailable(!!data.smsAlertsAvailable) })
      .catch(() => { if (!cancelled) setSmsAvailable(false) })
    return () => { cancelled = true }
  }, [])

  const phoneIsVerified = verifiedPhone !== null && verifiedPhone === phone.trim()
```

Add `useEffect` to the React import at the top of the file: `import { useState, useEffect } from "react"`.

- [ ] **Step 3: Add the send/verify handlers**

```js
  async function handleSendCode() {
    setOtpError(""); setOtpSending(true)
    try {
      const res = await fetch(`${API_BASE}/api/alerts/send-phone-code`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ phone: phone.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || "Could not send a verification code.")
      setOtpStage("sent")
    } catch (e) {
      setOtpError(e.message)
    } finally {
      setOtpSending(false)
    }
  }

  async function handleVerifyCode() {
    setOtpError(""); setOtpSending(true)
    try {
      const res = await fetch(`${API_BASE}/api/alerts/verify-phone-code`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ code: otpCode.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || "That code didn't work.")
      setVerifiedPhone(body.phone)
      setVerifiedAt(body.verifiedAt)
      setPhone(body.phone)
      setOtpStage("idle")
      setOtpCode("")
    } catch (e) {
      setOtpError(e.message)
    } finally {
      setOtpSending(false)
    }
  }
```

- [ ] **Step 4: Replace the phone input from Task 8 with the channel-aware version**

Replace the block added in Task 8 Step 2 (the plain, unconditional phone `<input>`) with:

```jsx
          {smsAvailable && (
            <div style={{ marginTop: 14 }}>
              <div style={labelStyle}>Delivery</div>
              <div style={{ display: "flex", gap: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--color-text-1)", cursor: "pointer" }}>
                  <input type="radio" name="alert-channel" checked={channel === "email"} onChange={() => setChannel("email")} />
                  📧 Email
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--color-text-1)", cursor: "pointer" }}>
                  <input type="radio" name="alert-channel" checked={channel === "sms"} onChange={() => setChannel("sms")} />
                  📱 Text message
                </label>
              </div>
            </div>
          )}

          {smsAvailable && channel === "sms" && (
            <div style={{ marginTop: 12 }}>
              <input
                type="tel"
                placeholder="Phone number"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setOtpStage("idle") }}
                style={fieldStyle}
              />
              {phoneIsVerified ? (
                <div style={{ fontSize: 13, color: "var(--color-success)", marginTop: 8 }}>✓ Verified</div>
              ) : otpStage === "idle" ? (
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={otpSending || !phone.trim()}
                  style={{ marginTop: 8, minHeight: 36, padding: "8px 14px", borderRadius: 10, border: "1px solid var(--overlay-12)", background: "var(--overlay-07)", color: "var(--color-text-1)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                >
                  {otpSending ? "Sending…" : "Send code"}
                </button>
              ) : (
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="6-digit code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    style={{ ...fieldStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={handleVerifyCode}
                    disabled={otpSending || otpCode.trim().length < 4}
                    style={{ minHeight: 44, padding: "0 16px", borderRadius: 10, border: "none", background: "var(--gradient-cta)", color: "var(--color-on-accent)", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
                  >
                    Verify
                  </button>
                </div>
              )}
              {otpError && <div style={{ fontSize: 13, color: "var(--color-danger)", marginTop: 8 }}>{otpError}</div>}
            </div>
          )}

          {(!smsAvailable || channel === "email") && (
            <input
              type="tel"
              placeholder="Phone number (optional, for future SMS alerts)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ ...fieldStyle, marginTop: 12 }}
            />
          )}
```

- [ ] **Step 5: Update `handleSave` to require verification and pass the full field set**

```js
  async function handleSave() {
    if (smsAvailable && channel === "sms" && !phoneIsVerified) {
      setError("Verify your phone number before saving Text message delivery.")
      return
    }
    setSaving(true); setError("")
    try {
      await upsertMyProfile(buildProfileUpdate(profile, {
        powder_alerts_enabled: enabled,
        alert_phone: phone.trim() || null,
        alert_phone_verified_at: phoneIsVerified ? verifiedAt : null,
        alert_channel: smsAvailable ? channel : "email",
        alert_day_of_week: dayOfWeek,
        alert_time_slot: timeSlot,
      }))
      await onSaved()
    } catch (e) {
      setError(e.message || "Could not save notification settings.")
      setSaving(false)
    }
  }
```

- [ ] **Step 6: Manually verify both states**

No component test harness exists for this (same limitation as Task 8). Verify with the dev server:

```bash
npm run dev
```

1. **With no Twilio env vars set** (the real state until Kyle activates Twilio): confirm the Delivery radio and phone/OTP UI never appear at all — only Email, matching today's behavior exactly.
2. **With fake `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER` env vars set** (to make `smsAlertsAvailable()` return true locally — the actual Twilio API calls will fail, which is fine for this check): confirm the Delivery radio appears, selecting "Text message" reveals the phone field and "Send code" button, and attempting to save with `channel="sms"` but no verification shows the blocking error message instead of saving.

- [ ] **Step 7: Commit**

```bash
git add src/components/profile/ProfileSettingsList.jsx
git commit -m "feat: add SMS channel choice and phone verification to powder alert settings"
```

---

### Task 10: PRD.md updates

**Files:**
- Modify: `PRD.md`

**Interfaces:** None (documentation only).

- [ ] **Step 1: Update F-REQ-ALERT-001**

Find the line (§Phase 5, `Powder Alert Subscription Service`):

```
F-REQ-ALERT-001: Briefings must be sent by 7 AM MT on Wednesdays
```

Replace with:

```
F-REQ-ALERT-001: Briefings are sent at the subscriber's chosen day (Mon-Fri) and time slot
(morning/midday/evening, all Mountain Time), defaulting to Wednesday morning for any subscriber
who hasn't changed it.
```

- [ ] **Step 2: Update the signup-flow opt-in copy line**

Find:

```
Opt-in during signup flow (checkbox: "Send me a weekly powder forecast every Wednesday")
```

Replace with:

```
Opt-in during signup flow (checkbox: "Send me a weekly powder forecast") — the real day/time
choice lives on the Profile page, not at signup.
```

- [ ] **Step 3: Add a note to F-REQ-ALERT-002**

Find:

```
F-REQ-ALERT-002: Users must be able to unsubscribe in one tap (standard unsubscribe link in email, STOP reply for SMS)
```

Add directly below it:

```
(The SMS half of this requirement is fulfilled by the inbound Twilio webhook added alongside SMS
delivery itself — previously aspirational, since no SMS sending existed to need it.)
```

- [ ] **Step 4: Add a note to F-REQ-ALERT-003**

Find:

```
F-REQ-ALERT-003: No briefing should be sent if zero resorts are open (off-season cutoff)
```

Add directly below it:

```
(Evaluated independently per day/time slot now that briefings fire 15 times a week instead of
once — not "once, globally" anymore.)
```

- [ ] **Step 5: Commit**

```bash
git add PRD.md
git commit -m "docs: update PRD powder alert requirements for SMS channel and scheduling"
```

---

## Post-Plan: Activating SMS (Kyle's own step, not part of this implementation)

Once all 10 tasks are merged and deployed, SMS alerts stay invisible until Kyle:

1. Creates a Twilio account and completes toll-free number verification (takes a few days).
2. Sets `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` on Render.
3. Configures the Twilio number's inbound-message webhook to point at `${BACKEND_URL}/api/sms/inbound` (needed for the STOP-sync handler in Task 3 to ever receive anything).

No code change or redeploy is needed at that point — `smsAlertsAvailable()` flips to `true` the moment the env vars exist, and the UI picks it up on the next page load.
