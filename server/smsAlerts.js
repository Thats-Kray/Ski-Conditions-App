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
