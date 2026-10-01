# Powder Alerts — SMS Delivery Channel + Scheduling — Design Spec

**Date:** 2026-10-01
**Author:** Claude (brainstorming session with Kyle)
**Status:** Draft, pending Kyle's review
**Part of:** ROADMAP SECTION 7 (Powder Alert System). TASK 7.1-7.3 shipped email-only delivery
and collected (but never used) an `alert_phone` field "for future SMS alerts" — this spec is
that deferred SMS work, tracked as a new task (number TBD at grooming time) rather than reopening
7.1-7.3, since those shipped and work correctly as-is.

## Context

The Wednesday powder briefing cron (`server/cron.js`) already composes a "top 3 resorts + Best
Bet" briefing and emails it via Resend to every profile with `powder_alerts_enabled = true`. The
PRD (§Phase 5) always named Twilio as the intended SMS provider; no Twilio account or credentials
exist yet — this was a documented plan, not a partial build.

Kyle's ask: let users choose SMS instead of email for the same weekly briefing, **and** let each
user pick which day and time they receive it (Wednesday stays the default), instead of everyone
getting it at one fixed global time. A real-time, threshold-triggered alert (e.g., a text the
moment a resort crosses some condition) was discussed and **explicitly deferred to a future
sprint** — this spec is channel choice + delivery scheduling on top of the existing weekly
briefing content only.

**Cost constraint, confirmed with Kyle:** the current email path is free (Resend's free tier
comfortably covers current/expected subscriber volume). No SMS provider is free — Twilio's
toll-free path costs roughly $1-3/month once activated (number rental + fractions of a cent per
message), regardless of volume. **Kyle wants the whole feature built and deployed now, with the
SMS option fully hidden from users until he creates and funds a Twilio account** — so there is
zero ongoing cost until he deliberately switches it on, and no further code change or redeploy is
needed at that point.

## Design Decisions

### 1. Data model (new migration 049, latest on disk is 048)

- `profiles.alert_channel TEXT NOT NULL DEFAULT 'email' CHECK (alert_channel IN ('email', 'sms'))`
  — one channel per user. Default preserves current behavior for every existing subscriber with
  zero migration risk.
- `profiles.alert_phone_verified_at TIMESTAMPTZ` — null until the number is confirmed via the new
  OTP flow below. `alert_phone` itself already exists (migration 015) and is unchanged.
- `profiles.alert_day_of_week TEXT NOT NULL DEFAULT 'wed' CHECK (alert_day_of_week IN ('mon',
  'tue', 'wed', 'thu', 'fri'))` — default matches today's only option, zero behavior change for
  existing subscribers.
- `profiles.alert_time_slot TEXT NOT NULL DEFAULT 'morning' CHECK (alert_time_slot IN ('morning',
  'midday', 'evening'))` — three preset Mountain Time slots (approximately 7am / 12pm / 6pm MT,
  exact minute left to the implementation plan). Default matches today's 7am send time.
- New table `alert_phone_otps` (`user_id UUID PRIMARY KEY REFERENCES profiles(id)`, `phone TEXT`,
  `code_hash TEXT`, `expires_at TIMESTAMPTZ`, `attempts INT DEFAULT 0`). RLS: no direct client
  read/write — all access goes through the two backend routes in §3, which use the service-role
  key, consistent with how `server/index.js` already handles signed unsubscribe tokens.

**Deliberately a separate system from the existing phone-verification infrastructure.**
`sendPhoneOtp`/`verifyPhoneOtp` and `startPhoneVerificationForTier1`/`verifyPhoneForTier1`
(`src/lib/socialApi.js`) exist for a different feature entirely — Supabase Auth's login-phone and
the account's identity-trust Tier system. Reusing either would mean "which number should your
powder alert go to" silently also changes login behavior or identity tier, which is not what
either feature is for. This stays a narrow, independent verification tied only to
`alert_phone`/`alert_channel`.

### 2. Profile UI

- The existing "📧 Weekly powder forecast every Wednesday" toggle becomes "📧 Weekly powder
  forecast" plus three controls: a day selector (Mon–Fri, default Wed), a time-slot selector
  (Early morning / Midday / Evening, default Early morning), and a channel choice (Email / Text
  message). Scheduling and channel are independent of each other, and existing subscribers see no
  change until they touch a control — every new column defaults to today's only option.
- **The SMS channel option does not render at all** (not shown-disabled, not "Coming soon" — fully
  absent from the DOM) until a capability check says it's available. Only "Email" is shown
  otherwise, matching current behavior exactly. The day/time selectors are unaffected by this gate
  — they're available immediately, since they work the same way regardless of channel.
- Capability check: a new `GET /api/config` endpoint returns `{ smsAlertsAvailable: boolean }`,
  computed as `Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)` — no
  Supabase round-trip needed, no secret exposed. The Profile page fetches this once on mount.
  Unauthenticated/public is fine — the response reveals nothing beyond "is SMS turned on," no
  different from information already visible by trying to select the option.
- Once `smsAlertsAvailable` is true, selecting "Text message" reveals the phone input + a "Send
  code" button → 6-digit code input → verify, mirroring the app's existing OTP UX pattern. Saving
  the profile with `alert_channel: 'sms'` is only possible after `alert_phone_verified_at` is set
  for the currently-entered phone number (changing the phone number after verification clears
  `alert_phone_verified_at`, requiring re-verification — same invalidation rule the Tier-1 phone
  flow already follows).
- This means: **today's deploy ships the data model, backend routes, and cron logic in full, but
  no user will ever see an SMS option in the UI until Kyle sets the two Twilio env vars on
  Render.** No frontend redeploy is needed to activate it at that point — only the env vars.

### 3. Backend (new `server/smsAlerts.js`, mounted into `server/index.js`)

- `POST /api/alerts/send-phone-code` — generates a 6-digit code, stores its hash + expiry (5 min)
  in `alert_phone_otps`, sends it via Twilio. Rate-limited to one send per phone number per 60
  seconds (checked against `alert_phone_otps.expires_at`/a last-sent timestamp) to prevent cost
  abuse from repeated sends.
- `POST /api/alerts/verify-phone-code` — checks the submitted code against the stored hash,
  within expiry, under a small attempt cap (e.g. 5 tries) before requiring a fresh code. On
  success, sets `profiles.alert_phone_verified_at = now()` and deletes the OTP row.
- Both routes return a clear "SMS alerts aren't available yet" error (503) if the Twilio env vars
  are absent — a defensive second gate behind the UI's own hiding of the option, in case of a
  direct API call.
- `POST /api/sms/inbound` — Twilio webhook for inbound messages. On a STOP/UNSUBSCRIBE/CANCEL/
  END/QUIT keyword (Twilio also auto-blocks future sends to that number at the platform level
  regardless of what this endpoint does), sets `powder_alerts_enabled = false` for the profile
  matching that `alert_phone`. This keeps our own data in sync with Twilio's carrier-mandated
  auto-block, so the Wednesday cron stops wasting attempts on a number that will never deliver
  again. Not a compliance requirement in itself (Twilio enforces the block with or without this),
  but closes a real "keep retrying into a wall forever" gap.

### 4. Cron job (`server/cron.js`) — per-slot firing + per-channel branching

**Scheduling mechanic:** `composeBriefing()` itself is unchanged — it reflects live conditions at
send time regardless of which day/time slot triggered it, so no date-specific content is needed.
What changes is *when the job runs and who it sends to*. Today there's one weekly cron tick
(Wednesday 7am MT) that sends to every subscriber. That becomes **15 weekly ticks** — one for each
of the 5 weekdays × 3 time slots — registered as node-cron schedules at the approximate MT times
for morning/midday/evening, Monday through Friday. Each tick:

1. Queries subscribers where `alert_day_of_week` and `alert_time_slot` match the slot that just
   fired (plus `powder_alerts_enabled = true`, as today).
2. Runs the same `composeBriefing()` + F-REQ-ALERT-003 guard (skip entirely if nothing's open) —
   evaluated independently per tick, same as today's single tick.
3. Sends to that tick's subscriber set only, branching per channel below.

This keeps every tick's logic identical to today's single cron, just parameterized by which
day/time slot it represents and filtered to that slot's subscribers — no change to the one-timezone
(Mountain Time) assumption the app already makes everywhere else.

The subscriber query additionally selects `alert_channel`, `alert_phone`, `alert_phone_verified_at`
alongside the existing `alert_day_of_week`/`alert_time_slot` filter. At send time, branch per
subscriber:

- `alert_channel === 'email'` (or null, pre-migration default): existing Resend/HTML path,
  byte-for-byte unchanged.
- `alert_channel === 'sms'` **and** `alert_phone_verified_at IS NOT NULL`: compose a short
  plain-text message via Twilio's REST API, e.g.:

  > `PowDays: Best Bet today is Vail (82/100, Elite ❄️). Full forecast: powdays.app. Reply STOP to unsubscribe.`

  Kept near 160 characters to stay within one billed SMS segment. The "Reply STOP" disclosure is
  required on every message, not just the first, per CTIA guidelines for recurring automated
  texts.
- `alert_channel === 'sms'` but **not yet verified** (shouldn't normally occur, since the UI only
  allows saving `'sms'` post-verification, but defensive): skip with a logged warning, same
  per-subscriber try/catch pattern the email loop already uses so one bad row never aborts the
  whole run.
- Twilio env vars absent at cron-run time (shouldn't occur in practice, since no user could have
  reached `'sms'` without them): skip SMS subscribers entirely with a logged warning, same
  defensive posture as above. The run must never fail outright just because SMS isn't configured.

### 5. Explicitly out of scope

- Any real-time/threshold-triggered alert (fresh snow, resort opens, score crosses a line) — a
  distinct future feature, discussed and deferred.
- A standard 10DLC long code — toll-free verification is the intended path (simpler, faster to
  activate, no ongoing campaign fee) for this volume.
- Sending the same briefing to both channels for one user — `alert_channel` is a single choice,
  not a multi-select.
- Actually creating/funding the Twilio account — that's Kyle's own step, outside this codebase
  change, whenever he's ready to activate.
- Arbitrary/exact-time scheduling (any HH:MM) — three preset slots only, per Kyle's choice.
- Weekend days (Sat/Sun) as a schedule option — Mon–Fri only, per Kyle's choice.
- Per-user timezone support — every slot is Mountain Time for everyone, matching every other
  time-of-day assumption already baked into this Colorado-focused app (e.g. the existing cron's
  fixed MT send time, with no per-user override anywhere today).

## Testing

- `server/smsAlerts.js`'s message-composition function (the plain-text template above) should be
  a pure function, following `composeBriefing()`'s existing shape, so it can be unit tested the
  same way `server/powderScore.test.js` tests `computePowderScore` — no live Twilio call needed
  to verify message content/length.
- OTP generation/hashing/expiry logic should also be extracted as pure functions where possible
  (code generation, hash comparison, expiry check) and unit tested without a live Twilio send.
- The cron job's per-subscriber branching (email vs. sms vs. skip-unverified vs.
  skip-unconfigured) has no existing test coverage today (`cron.js` has no test file) — the
  implementation plan should decide whether to add one, following the same "recommended, not
  required" posture the base-depth-gate spec took for `server/powderScore.js`.
- The slot-matching logic (which subscribers belong to a given day/time tick) should also be a
  pure, testable function — given a slot identifier and a list of profiles, return the matching
  subset — independent of the actual node-cron registration, so it can be unit tested without
  waiting for a real cron tick.
- No live Twilio send can be verified in this environment (no credentials). Verification before
  shipping is: code review + unit tests on pure logic + confirming the capability-gate hides the
  UI correctly with no env vars set. Live SMS delivery itself can only be confirmed by Kyle once
  he activates a real Twilio account — flag this as an explicit open verification gap, same as
  this project's established pattern for anything needing live credentials it doesn't have
  (OAuth creds, TASK 14.1).

## PRD.md updates required

PRD §Phase 5 (`Powder Alert Subscription Service`) currently hardcodes the schedule as a
requirement, not a default — this needs correcting alongside the code change:

- F-REQ-ALERT-001 ("Briefings must be sent by 7 AM MT on Wednesdays") becomes: briefings are sent
  at the subscriber's chosen day (Mon–Fri) and time slot (morning/midday/evening MT), defaulting
  to Wednesday morning.
- The signup-flow opt-in copy ("Send me a weekly powder forecast every Wednesday") should drop the
  hardcoded day — e.g. "Send me a weekly powder forecast" — since the real day/time choice now
  lives on the Profile page, matching its new copy there.
- F-REQ-ALERT-002 already names "STOP reply for SMS" as a requirement — this spec's §3 inbound
  webhook is what actually fulfills that line for the first time (previously aspirational, since
  no SMS sending existed to need it).
- F-REQ-ALERT-003 (skip send if zero resorts open) is unchanged in substance, just now evaluated
  per tick instead of once a week — note this explicitly so a future reader doesn't assume it
  still means "once, globally."

## Non-goals (explicitly out of scope)

- Real-time/threshold-triggered alerts (future sprint).
- Multi-channel delivery (both email and SMS for one user).
- Any change to the briefing content/ranking logic itself, or the existing email template.
- Standard 10DLC registration (toll-free only).
- Actually setting up the Twilio account itself.
- Arbitrary time-of-day or weekend scheduling, or per-user timezones.
