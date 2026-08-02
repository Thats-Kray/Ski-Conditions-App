import cron from "node-cron"
import { Resend } from "resend"
import { createClient } from "@supabase/supabase-js"
import { getAllResortConditions } from "./index.js"
import { renderPowderBriefingEmail } from "./emailTemplates.js"
import { signAlertToken } from "./alertTokens.js"

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
  // profiles has no email column (confirmed across all migrations) — emails live
  // only on auth.users, so subscriber emails must come from the admin API.
  const { data: subscribers, error } = await supabase
    .from("profiles")
    .select("id, full_name, alert_phone")
    .eq("powder_alerts_enabled", true)
  if (error) throw error

  if (!subscribers || !subscribers.length) {
    console.log("[cron] No subscribers with powder_alerts_enabled — skipping send.")
    return
  }

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
      console.warn(`[cron] Failed to send briefing to ${email}:`, e.message)
      failed++
    }
  }
  console.log(`[cron] Weekly briefing: ${sent} sent, ${failed} failed.`)
}

export function registerWeeklyBriefingCron() {
  // node-cron's `timezone` option (America/Denver) handles the MST/MDT switch
  // automatically, so 7 AM MT stays correct year-round without manual UTC math.
  cron.schedule("0 7 * * 3", () => {
    sendWeeklyBriefing().catch((e) => console.error("[cron] Weekly briefing job failed:", e))
  }, { timezone: "America/Denver" })
  console.log("[cron] Weekly briefing scheduled for Wednesdays 7am MT")
}
