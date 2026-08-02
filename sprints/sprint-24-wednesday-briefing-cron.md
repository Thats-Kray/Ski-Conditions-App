# Sprint 24 — Wednesday Powder Briefing Cron Job

**Goal:** ROADMAP TASK 7.2 — every Wednesday at 7 AM MT, email a powder forecast briefing (top 3 resorts, one "Best Bet," weekend outlook) to every user with `powder_alerts_enabled = true`.
**Estimated effort:** 2 days
**Depends on:** Sprint 23 (powder alert preference) merged and its migration run — this job queries `profiles.powder_alerts_enabled`.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**This is the most structurally involved sprint in the alerts/conditions batch** — it needs 3 things that don't exist anywhere in `server/` today: a scheduling library, an email-sending library, and a way to compute powder scores **server-side** (today, powder-score math only exists client-side in `src/App.jsx`'s `refresh()` — the server only proxies raw conditions data, it has zero score-computation logic).

**`server/package.json`** current dependencies (verbatim): `@supabase/supabase-js, @vercel/analytics, cheerio, cors, express, node-fetch`. No cron library, no `resend`, no `jsonwebtoken`.

**`server/index.js`** (632 lines) — relevant existing pieces, **read the full file before starting**:
- `RESORT_COORDS` (lines 220-233) — 12 resorts keyed by `resortKey`: `{ name, lat, lon }`.
- `VAIL_RESORT_DOMAINS` (441-447, 5 resorts) and `IKON_RESORT_REPORT_URLS` (451-459, 7 resorts).
- `fetchVailResortsConditions(domain)` (467) and `fetchHtmlConditions(url)` (583) — the scrapers.
- The `/api/resort-conditions` route (596-629) calls those scrapers and returns `{ resort, fetchedAt, isOpen, liftsOpen, liftsTotal, runsOpen, runsTotal, baseDepth, summitDepth, snowLast24in, source }` per resort — **but only as an HTTP route handler, not as a directly-callable function.**
- `/api/nws/point`, `/api/nws/forecast`, `/api/nws/snow`, `/api/drive-risk` — also HTTP-only today.
- The in-memory cache helper `cached(key, fn, ttl)` (lines 15-30) — reuse this for the cron job's internal fetches too, so a manual test run doesn't hammer NWS/scrapers if run twice in quick succession.

**The Powder Score formula does not exist anywhere server-side.** It must be reproduced exactly from the PRD (`PRD.md` §7.1) — not reverse-engineered from `App.jsx`'s client implementation, since the goal is both sides conforming to the documented spec (if you find `App.jsx`'s actual behavior differs from the PRD text, that's a separate bug to flag, not something to replicate here):

```
freshSnow     = min(snowPrev24in × 5.0, 32) + min(snowPrev48in × 1.5, 8)
incomingSnow  = min(snow24in × 3.5, 15) + min(snow48in × 1.0, 5)
tempScore     = temperature band (see below)
terrainScore  = (runsOpen/runsTotal × 10) + (liftsOpen/liftsTotal × 5)
baseScore     = min(baseDepth / 14, 5)
snowHint      = +2 if /snow|powder|flurr|wintry/i matches the forecast text
windPenalty   = min(windMph × 0.75, 15)
drivePenalty  = 0 (Low) | 5 (Moderate) | 10 (High or Severe)

rawScore = freshSnow + incomingSnow + tempScore + terrainScore + baseScore + snowHint − windPenalty − drivePenalty
powderScore = clamp(rawScore, 0, 100)
```
Temperature bands (°F → points): `< 0` → 2, `0–12` → 8, `12–20` → 15, `20–30` → 20, `30–35` → 17, `35–40` → 11, `40–48` → 4, `≥ 48` → 0.
Tiers: `≥80` Elite, `≥65` Very Good, `≥50` Good, `≥35` Okay, else Poor. Closed resorts get `powderScore: null`.

---

## Tasks

S24-T1 (dependencies) has no dependency. S24-T2 (server-side powder score module) has no dependency. S24-T3 (refactor conditions-fetching into callable functions) has no dependency but touches the same file as several existing routes — do it carefully, preserving existing HTTP behavior. S24-T4 (email template) has no dependency. S24-T5 (the cron job itself) depends on S24-T2, T3, T4. S24-T6 (register in `server/index.js`) depends on T5.

---

### S24-T1 — Add dependencies

**File to modify:** `server/package.json`

Add to `dependencies`:
```json
"node-cron": "^3.0.3",
"resend": "^4.0.0"
```
Run `npm install` inside `server/`.

**Commit:**
```bash
git add server/package.json server/package-lock.json
git commit -m "chore: add node-cron and resend to server dependencies"
```

---

### S24-T2 — `server/powderScore.js`

**File to create:** `server/powderScore.js`

```js
const TEMP_BANDS = [
  { max: 0, points: 2 },
  { max: 12, points: 8 },
  { max: 20, points: 15 },
  { max: 30, points: 20 },
  { max: 35, points: 17 },
  { max: 40, points: 11 },
  { max: 48, points: 4 },
]

function temperatureScore(tempF) {
  if (tempF == null) return 0
  for (const band of TEMP_BANDS) {
    if (tempF < band.max) return band.points
  }
  return 0 // >= 48
}

function tierForScore(score) {
  if (score >= 80) return "Elite"
  if (score >= 65) return "Very Good"
  if (score >= 50) return "Good"
  if (score >= 35) return "Okay"
  return "Poor"
}

export function computePowderScore({
  isOpen = true,
  snowPrev24in = 0, snowPrev48in = 0, snow24in = 0, snow48in = 0,
  tempF, windMph = 0,
  runsOpen = 0, runsTotal = 0, liftsOpen = 0, liftsTotal = 0,
  baseDepth = 0, forecastText = "", driveRisk = "Low",
}) {
  if (!isOpen) return { powderScore: null, powderTier: "Closed" }

  const freshSnow = Math.min(snowPrev24in * 5.0, 32) + Math.min(snowPrev48in * 1.5, 8)
  const incomingSnow = Math.min(snow24in * 3.5, 15) + Math.min(snow48in * 1.0, 5)
  const tempScore = temperatureScore(tempF)
  const terrainScore = (runsTotal > 0 ? (runsOpen / runsTotal) * 10 : 0) + (liftsTotal > 0 ? (liftsOpen / liftsTotal) * 5 : 0)
  const baseScore = Math.min(baseDepth / 14, 5)
  const snowHint = /snow|powder|flurr|wintry/i.test(forecastText || "") ? 2 : 0
  const windPenalty = Math.min(windMph * 0.75, 15)
  const drivePenalty = driveRisk === "Moderate" ? 5 : driveRisk === "High" || driveRisk === "Severe" ? 10 : 0

  const raw = freshSnow + incomingSnow + tempScore + terrainScore + baseScore + snowHint - windPenalty - drivePenalty
  const powderScore = Math.max(0, Math.min(100, raw))

  return { powderScore, powderTier: tierForScore(powderScore) }
}
```

**Acceptance criteria:**
- `computePowderScore({ isOpen: false })` returns `{ powderScore: null, powderTier: "Closed" }`.
- The 5 calibration examples from `PRD.md` §7.1 (epic powder day ~90+, solid mid-winter ~60-70, warm bluebird ~25-35, late-season slush ~15-20) produce scores in the documented ranges when fed matching inputs — write a quick manual check with those example inputs before moving on (this module has no test runner to automate it, per this repo's convention — verify by hand, e.g. `node -e "import('./server/powderScore.js').then(m => console.log(m.computePowderScore({...})))"`).

---

### S24-T3 — Extract callable conditions-fetching functions (no HTTP route behavior change)

**File to modify:** `server/index.js`

Refactor so the logic inside the `/api/resort-conditions`, `/api/nws/point`, `/api/nws/forecast`, `/api/nws/snow`, and `/api/drive-risk` route handlers is available as plain exported/callable async functions that both the existing route AND the new cron job can call — **the HTTP routes' request/response behavior must not change** (this is a pure extraction, not a rewrite). **`/api/nws/snow` matters as much as the others here**: `computePowderScore()` from S24-T2 needs real `snowPrev24in`/`snowPrev48in`/`snow24in`/`snow48in` values, and those come only from `/api/nws/snow`'s grid data — `/api/nws/forecast` is text-only and cannot supply them (see sprint-26's Project Context for the full explanation of this split, if that sprint has landed by the time you read this; regardless, extract `/api/nws/snow`'s logic into a callable function here). Without this, `getAllResortConditions()` would silently score every resort with those 4 fields defaulting to 0. For each route:

```js
// Example shape — adapt to the real existing route body, don't invent new logic:
export async function getResortConditions(resortKey) {
  // the actual body currently inside the /api/resort-conditions route handler,
  // parameterized by resortKey instead of reading req.query.resort
}

app.get("/api/resort-conditions", async (req, res) => {
  try {
    const data = await getResortConditions(req.query.resort)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
```
Do the same extraction for whatever NWS point/forecast lookups and the COtrip-based drive-risk scoring currently do inline in their route handlers — you need a `getAllResortConditions()` aggregate function (loops `RESORT_COORDS`, calls the per-resort conditions + NWS + drive-risk functions, and runs each result through `computePowderScore()` from S24-T2) that the cron job can call directly, without making HTTP requests to itself.

**Acceptance criteria:**
- Every existing HTTP route continues to behave identically (same response shape, same status codes, same caching) — verify with `curl` against a couple of routes before and after this refactor.
- A new `getAllResortConditions()` function exists, returns an array of 12 resort objects each with `resortKey, name, isOpen, powderScore, powderTier`, plus whatever raw fields (snow, temp, drive risk) are needed for briefing composition.
- This function reuses the existing `cached()` helper so repeated calls within the 5-minute TTL don't re-scrape.

**Verify:**
```bash
cd server && node index.js &
curl "http://localhost:8787/api/resort-conditions?resort=vail"
curl "http://localhost:8787/health"  # if it exists — confirm no regression on any route you touched
```

---

### S24-T4 — `server/emailTemplates.js`

**File to create:** `server/emailTemplates.js`

```js
export function renderPowderBriefingEmail({ top3, bestBet, weekendOutlook }) {
  const resortRow = (r) => `
    <tr>
      <td style="padding:8px 0;font-weight:700;color:#e0f2fe;">${r.name}</td>
      <td style="padding:8px 0;color:#38bdf8;font-weight:800;">${r.powderScore != null ? Math.round(r.powderScore) : "—"} · ${r.powderTier}</td>
    </tr>`

  return `
  <div style="background:#04080f;color:#e0f2fe;font-family:sans-serif;padding:24px;max-width:520px;margin:0 auto;">
    <div style="font-size:20px;font-weight:900;color:#38bdf8;">❄️ PowderDays — Wednesday Briefing</div>
    <p style="color:#7dd3fc;font-size:14px;">Here's where the snow is this weekend.</p>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;">
      ${top3.map(resortRow).join("")}
    </table>
    ${bestBet ? `<div style="margin-top:20px;padding:14px;background:rgba(56,189,248,0.1);border-radius:12px;">
      <strong>🏆 Best Bet: ${bestBet.name}</strong><br/>
      <span style="font-size:13px;color:#7dd3fc;">${bestBet.reason || "Highest powder score this week."}</span>
    </div>` : ""}
    ${weekendOutlook ? `<p style="margin-top:16px;font-size:13px;color:#7dd3fc;">${weekendOutlook}</p>` : ""}
    <p style="margin-top:24px;font-size:12px;color:#334155;">
      <a href="{{UNSUBSCRIBE_URL}}" style="color:#334155;">Unsubscribe</a> from weekly powder briefings.
    </p>
  </div>`
}
```
The `{{UNSUBSCRIBE_URL}}` placeholder is filled in by the cron job per-recipient in S24-T5, using the signed-link mechanism sprint-25 builds — if sprint-25 hasn't landed yet when you do this sprint, leave the placeholder literal in the template (a broken/no-op link is an acceptable interim state; do not block this sprint on sprint-25).

**Acceptance criteria:**
- Function returns a self-contained HTML string, Blizzard-themed (dark background, ice-blue accents matching `--color-bg`/`--color-accent`).
- Renders sensibly even if `bestBet` or `weekendOutlook` is `null`/undefined (no broken HTML).

---

### S24-T5 — `server/cron.js`

**File to create:** `server/cron.js`

```js
import cron from "node-cron"
import { Resend } from "resend"
import { createClient } from "@supabase/supabase-js"
import { getAllResortConditions } from "./index.js" // adjust the import path/shape to match however S24-T3 actually exported it
import { renderPowderBriefingEmail } from "./emailTemplates.js"

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

  return { top3, bestBet, weekendOutlook: null } // weekendOutlook: a fuller Fri–Sun forecast summary is a nice-to-have refinement, not required for a valid send
}

export async function sendWeeklyBriefing() {
  const briefing = await composeBriefing()
  if (!briefing) {
    console.log("[cron] No open/scoreable resorts — skipping this week's briefing (F-REQ-ALERT-003).")
    return
  }

  const supabase = getSupabase()
  const { data: subscribers, error } = await supabase
    .from("profiles")
    .select("id, full_name, alert_phone")
    .eq("powder_alerts_enabled", true)
  if (error) throw error

  const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers()
  if (authErr) throw authErr
  const emailById = new Map(authUsers.users.map((u) => [u.id, u.email]))

  const resend = new Resend(process.env.RESEND_API_KEY)
  const html = renderPowderBriefingEmail(briefing)

  let sent = 0, failed = 0
  for (const sub of subscribers || []) {
    const email = emailById.get(sub.id)
    if (!email) { failed++; continue }
    try {
      await resend.emails.send({
        from: process.env.FROM_EMAIL,
        to: email,
        subject: `❄️ This week's best bet: ${briefing.bestBet.name}`,
        html,
      })
      sent++
    } catch (e) {
      console.warn(`[cron] Failed to send briefing to ${email}:`, e.message)
      failed++
    }
  }
  console.log(`[cron] Weekly briefing: ${sent} sent, ${failed} failed.`)
}

export function registerWeeklyBriefingCron() {
  // 0 14 * * 3 UTC = 7 AM MT Wednesday (MT is UTC-7 in winter/standard time — verify this offset
  // is still correct for the target run date given daylight saving, or use a UTC-agnostic
  // scheduling library option if node-cron supports timezone strings — check node-cron's docs
  // for a `timezone: "America/Denver"` option, which is more robust than a fixed UTC offset)
  cron.schedule("0 14 * * 3", () => {
    sendWeeklyBriefing().catch((e) => console.error("[cron] Weekly briefing job failed:", e))
  }, { timezone: "America/Denver" })
}
```
Getting each subscriber's email address requires `supabase.auth.admin.listUsers()` (the `profiles` table has no email column — confirm this by checking the `profiles` schema; if it turns out there IS an email column already denormalized onto `profiles`, use that directly instead and skip the `auth.admin` call, which is slower and paginated for large user bases — check before assuming).

**Acceptance criteria:**
- `sendWeeklyBriefing()` skips sending entirely (logs and returns) if zero resorts are open/scoreable — F-REQ-ALERT-003.
- Each subscriber is emailed independently; one failure doesn't stop the rest (`try/catch` per-recipient, matching the PRD's Resend failure mode: "Notification emails silently fail — in-app state remains correct").
- The cron schedule targets 7 AM Mountain Time on Wednesdays (verify the timezone handling explicitly — don't assume a hardcoded UTC offset is correct for both summer and winter MT, since the app should be robust to daylight saving; prefer `node-cron`'s `timezone` option if available over manual UTC math).

**Manual verification (do not wait for an actual Wednesday):**
```bash
cd server && node -e "
import('./cron.js').then(m => m.sendWeeklyBriefing())
"
```
Run this against a test Supabase project (or with `powder_alerts_enabled = true` set for exactly one test account you control) and confirm you receive the email.

---

### S24-T6 — Register the cron in `server/index.js`

**File to modify:** `server/index.js`

Near the other startup wiring (e.g. where `stravaRouter` is mounted), add:
```js
import { registerWeeklyBriefingCron } from "./cron.js"
registerWeeklyBriefingCron()
```

**Environment variables to add (Railway + local `.env`):**
| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key |
| `FROM_EMAIL` | Sender address, e.g. `alerts@powderdays.app` |
| `SUPABASE_SERVICE_ROLE_KEY` | Already added in sprint-1 for Strava — reused here |

**Build/run check:**
```bash
cd server && node index.js
```
Expected: server starts without error, cron registers (log a confirmation line, e.g. `"[cron] Weekly briefing scheduled for Wednesdays 7am MT"`, on registration so it's visible in Railway logs).

**Commit:**
```bash
git add server/powderScore.js server/emailTemplates.js server/cron.js server/index.js
git commit -m "feat: add Wednesday powder briefing cron job"
```

---

## Sprint Acceptance Criteria

- [ ] `server/powderScore.js` reproduces the PRD's exact powder score formula
- [ ] `getAllResortConditions()` exists and is callable without an HTTP round-trip, reusing the existing scrapers/cache
- [ ] `server/emailTemplates.js` renders a themed HTML briefing email
- [ ] `server/cron.js` sends to all opted-in subscribers, skips entirely if no resorts are open (F-REQ-ALERT-003), and isolates per-recipient failures
- [ ] Cron is registered in `server/index.js`, scheduled for 7 AM MT Wednesdays with explicit timezone handling
- [ ] Manually verified via a direct `sendWeeklyBriefing()` call against a test subscriber
- [ ] All existing HTTP routes touched during the S24-T3 refactor still behave identically (spot-checked with `curl`)

## Out of Scope for This Sprint

- SMS delivery via Twilio (PRD Phase 5, explicitly deferred — `alert_phone` is collected but unused).
- A fully-computed Friday–Sunday weekend snowfall outlook — `weekendOutlook` ships as `null` this sprint; wiring real forecast-window text is a follow-up refinement, not required for F-REQ-ALERT-001/002/003 compliance.
- Sprint-25 (unsubscribe flow) — the email template has an unsubscribe link placeholder, but the actual endpoint is built next.
</content>
