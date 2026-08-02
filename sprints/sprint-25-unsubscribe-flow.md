# Sprint 25 — Unsubscribe Flow

**Goal:** ROADMAP TASK 7.3 — signed, one-tap unsubscribe/resubscribe links in the weekly powder briefing email.
**Estimated effort:** 0.5 day
**Depends on:** Sprint 24 (Wednesday briefing cron job) merged — this sprint wires real links into `server/emailTemplates.js`'s `{{UNSUBSCRIBE_URL}}` placeholder and `server/cron.js`'s send loop.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**No JWT/signing utility exists anywhere in `server/` today** (confirmed: no `jsonwebtoken`, no `crypto`-based signing pattern in `server/index.js` or `server/routes/*.js`). ROADMAP explicitly specifies a "signed_jwt" token format for the unsubscribe link, so this sprint adds the `jsonwebtoken` package rather than hand-rolling HMAC signing with Node's built-in `crypto` — it's the more standard, less error-prone choice for this exact use case (short-lived, single-claim signed tokens) and matches the ROADMAP's stated intent directly.

**`src/routes/strava.js`'s `getSupabase()` helper** (from sprint-1) is the existing convention for a server-side Supabase client using the service-role key — reuse the same pattern (a small local `getSupabase()` function using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, already configured as Railway env vars since sprint-1).

---

## Tasks

S25-T1 (JWT helper + dependency) has no dependency. S25-T2 (routes) depends on S25-T1. S25-T3 (wire real links into the email/cron flow from sprint-24) depends on S25-T2.

---

### S25-T1 — Add `jsonwebtoken` + signing helper

**File to modify:** `server/package.json`

Add to `dependencies`: `"jsonwebtoken": "^9.0.2"`. Run `npm install` inside `server/`.

**File to create:** `server/alertTokens.js`

```js
import jwt from "jsonwebtoken"

export function signAlertToken(userId, action) {
  return jwt.sign({ userId, action }, process.env.JWT_SECRET, { expiresIn: "90d" })
}

export function verifyAlertToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET) // throws on invalid/expired — caller must catch
}
```
`action` is either `"unsubscribe"` or `"resubscribe"` — encoding it in the token (rather than trusting the route path alone) means a token minted for one action can't be silently reused for the other if a link is copy-pasted into the wrong context; the routes in S25-T2 should verify `payload.action` matches the route they're hit on.

**New environment variable:** `JWT_SECRET` — a long random string, added to Railway + local `.env`. Generate one with `openssl rand -hex 32` and document that in your PR/commit description; do not commit the actual secret value anywhere.

**Acceptance criteria:**
- `signAlertToken(userId, "unsubscribe")` produces a JWT that `verifyAlertToken` can decode back to `{ userId, action: "unsubscribe", iat, exp }`.
- Tokens expire in 90 days (long enough that an email sitting unread for weeks still has a working link, per the weekly-cadence use case).

---

### S25-T2 — `/api/unsubscribe` and `/api/resubscribe` routes

**File to modify:** `server/index.js`

```js
import { signAlertToken, verifyAlertToken } from "./alertTokens.js"
import { createClient } from "@supabase/supabase-js"

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

app.get("/api/unsubscribe", async (req, res) => {
  try {
    const payload = verifyAlertToken(req.query.token)
    if (payload.action !== "unsubscribe") throw new Error("Wrong token action")
    const { error } = await getSupabase().from("profiles").update({ powder_alerts_enabled: false }).eq("id", payload.userId)
    if (error) throw error
    const resubscribeToken = signAlertToken(payload.userId, "resubscribe")
    res.send(`
      <html><body style="font-family:sans-serif;background:#04080f;color:#e0f2fe;padding:40px;text-align:center;">
        <h2>You've been unsubscribed.</h2>
        <p>You won't receive weekly powder briefings anymore.</p>
        <a href="/api/resubscribe?token=${resubscribeToken}" style="color:#38bdf8;">Click here to re-enable alerts.</a>
      </body></html>
    `)
  } catch (e) {
    res.status(400).send(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;">This link is invalid or has expired.</body></html>`)
  }
})

app.get("/api/resubscribe", async (req, res) => {
  try {
    const payload = verifyAlertToken(req.query.token)
    if (payload.action !== "resubscribe") throw new Error("Wrong token action")
    const { error } = await getSupabase().from("profiles").update({ powder_alerts_enabled: true }).eq("id", payload.userId)
    if (error) throw error
    res.send(`
      <html><body style="font-family:sans-serif;background:#04080f;color:#e0f2fe;padding:40px;text-align:center;">
        <h2>You're back in! ❄️</h2>
        <p>Weekly powder briefings are re-enabled.</p>
      </body></html>
    `)
  } catch (e) {
    res.status(400).send(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;">This link is invalid or has expired.</body></html>`)
  }
})
```

**Acceptance criteria:**
- A valid unsubscribe token sets `powder_alerts_enabled = false` for that user and returns a minimal HTML confirmation page with a working resubscribe link.
- A valid resubscribe token sets it back to `true`.
- An expired, tampered, or wrong-action token returns a 400 with a friendly "invalid or expired" page — never a raw stack trace or a 500.
- Hitting `/api/unsubscribe` with a `resubscribe`-action token (or vice versa) is rejected, not silently accepted.

**Verify:**
```bash
cd server && node index.js &
node -e "
import('./alertTokens.js').then(({ signAlertToken }) => {
  console.log(signAlertToken('00000000-0000-0000-0000-000000000000', 'unsubscribe'))
})
"
# then: curl "http://localhost:8787/api/unsubscribe?token=<paste the token>"
```
Confirm the profile row updates (check against a real test user ID + Supabase, not the placeholder UUID above, for an actual DB-level check) and the HTML response renders correctly. Test an expired/garbage token too (`curl ".../api/unsubscribe?token=garbage"`) and confirm the 400 fallback page, not a crash.

**Build check:**
```bash
cd server && node index.js
```
(no `npm run build` for the server — Express apps run directly; confirm it starts cleanly)

---

### S25-T3 — Wire real signed links into the briefing email

**File to modify:** `server/cron.js`

In `sendWeeklyBriefing()`'s per-subscriber send loop (built in sprint-24), generate a real unsubscribe link per recipient and pass it into the template instead of the `{{UNSUBSCRIBE_URL}}` placeholder:

```js
import { signAlertToken } from "./alertTokens.js"

// inside the per-subscriber loop, before calling resend.emails.send:
const unsubscribeToken = signAlertToken(sub.id, "unsubscribe")
const unsubscribeUrl = `${process.env.BACKEND_URL}/api/unsubscribe?token=${unsubscribeToken}`
const personalizedHtml = html.replace("{{UNSUBSCRIBE_URL}}", unsubscribeUrl)
// then send `personalizedHtml` instead of the shared `html` for this recipient
```
This means the HTML must now be generated **per-recipient** (not once, shared, as sprint-24 built it) since each person's unsubscribe link is unique — move `renderPowderBriefingEmail(briefing)` inside the loop, or keep it outside and just do the per-recipient `.replace()` as shown (cheaper — only string substitution per recipient, not full re-render).

**New environment variable:** `BACKEND_URL` — the deployed Railway backend's public URL (e.g. `https://ski-proxy.railway.app`), needed to build an absolute unsubscribe link usable from an email client (relative URLs don't work in email).

**Acceptance criteria:**
- Every sent briefing email contains a working, recipient-specific unsubscribe link (not the literal `{{UNSUBSCRIBE_URL}}` string).
- Clicking it in a real test send actually unsubscribes that specific user, verified end-to-end.

**Verify:**
```bash
cd server && node -e "
import('./cron.js').then(m => m.sendWeeklyBriefing())
"
```
Against a test subscriber, receive the email, click unsubscribe, confirm the profile flag flips and the confirmation page renders.

**Commit:**
```bash
git add server/package.json server/package-lock.json server/alertTokens.js server/index.js server/cron.js
git commit -m "feat: add signed unsubscribe/resubscribe flow for powder briefing emails"
```

---

## Sprint Acceptance Criteria

- [ ] `server/alertTokens.js` signs and verifies short-lived, action-scoped JWTs
- [ ] `/api/unsubscribe` and `/api/resubscribe` both work end-to-end against real profile rows, with friendly error pages for bad tokens
- [ ] Every briefing email sent by `server/cron.js` contains a real, working, per-recipient unsubscribe link
- [ ] `JWT_SECRET` and `BACKEND_URL` are documented as new required environment variables
- [ ] Verified end-to-end with a real test send + click-through

## Out of Scope for This Sprint

- SMS "STOP" reply handling (Twilio, PRD Phase 5 — deferred along with SMS delivery itself).
- A logged-in, in-app version of this toggle — that's the existing Profile settings toggle from sprint-23; this sprint is specifically the no-login-required email-link flow.
</content>
