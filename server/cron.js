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
