import { Router } from "express"
import { createClient } from "@supabase/supabase-js"
import { syncUserActivities, syncSingleActivity } from "../services/stravaSync.js"

const router = Router()

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

router.get("/api/strava/auth", (req, res) => {
  const { userId } = req.query

  if (!userId) {
    return res.status(400).json({ error: "userId is required" })
  }

  const params = new URLSearchParams({
    client_id:       process.env.STRAVA_CLIENT_ID,
    redirect_uri:    process.env.STRAVA_REDIRECT_URI,
    response_type:   "code",
    approval_prompt: "auto",
    scope:           "activity:read_all",
    state:           userId,
  })

  const stravaAuthUrl = `https://www.strava.com/oauth/authorize?${params}`
  res.redirect(stravaAuthUrl)
})

router.get("/api/strava/callback", async (req, res) => {
  const { code, state: userId, error } = req.query

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173"

  if (error) {
    return res.redirect(`${frontendUrl}/profile?strava_error=access_denied`)
  }

  if (!code || !userId) {
    return res.redirect(`${frontendUrl}/profile?strava_error=missing_params`)
  }

  try {
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id:     process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    })

    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      console.error("Strava token exchange failed:", body)
      return res.redirect(`${frontendUrl}/profile?strava_error=token_exchange_failed`)
    }

    const tokens = await tokenRes.json()

    const supabase = getSupabase()

    const { error: dbError } = await supabase
      .from("profiles")
      .update({
        strava_athlete_id:       tokens.athlete.id,
        strava_access_token:     tokens.access_token,
        strava_refresh_token:    tokens.refresh_token,
        strava_token_expires_at: new Date(tokens.expires_at * 1000).toISOString(),
      })
      .eq("id", userId)

    if (dbError) {
      console.error("Supabase update failed:", dbError.message)
      return res.redirect(`${frontendUrl}/profile?strava_error=db_error`)
    }

    res.redirect(`${frontendUrl}/profile?strava_connected=true`)
  } catch (err) {
    console.error("Strava callback error:", err)
    res.redirect(`${frontendUrl}/profile?strava_error=server_error`)
  }
})

router.post("/api/strava/disconnect", async (req, res) => {
  const { userId } = req.body

  if (!userId) return res.status(400).json({ error: "userId is required" })

  try {
    const supabase = getSupabase()

    const { data: profile } = await supabase
      .from("profiles")
      .select("strava_access_token")
      .eq("id", userId)
      .single()

    if (profile?.strava_access_token) {
      await fetch("https://www.strava.com/oauth/deauthorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: profile.strava_access_token }),
      }).catch(() => {})
    }

    const { error: dbError } = await supabase
      .from("profiles")
      .update({
        strava_athlete_id:       null,
        strava_access_token:     null,
        strava_refresh_token:    null,
        strava_token_expires_at: null,
      })
      .eq("id", userId)

    if (dbError) return res.status(500).json({ error: dbError.message })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post("/api/strava/sync", async (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: "userId is required" })

  try {
    const result = await syncUserActivities(userId)
    res.json(result)
  } catch (err) {
    console.error("Strava sync error:", err.message)
    res.status(500).json({ error: err.message })
  }
})

// NOTE: Registering the webhook subscription itself is a one-time step done
// manually after deploy — it is NOT handled by this file. Run once:
//   POST https://www.strava.com/api/v3/push_subscriptions
//     client_id, client_secret, callback_url, verify_token
// (callback_url should point at GET/POST /api/strava/webhook on this server,
// verify_token must match STRAVA_WEBHOOK_VERIFY_TOKEN below.)

router.get("/api/strava/webhook", (req, res) => {
  const mode      = req.query["hub.mode"]
  const token     = req.query["hub.verify_token"]
  const challenge = req.query["hub.challenge"]

  if (mode === "subscribe" && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    res.json({ "hub.challenge": challenge })
  } else {
    res.status(403).json({ error: "Forbidden" })
  }
})

router.post("/api/strava/webhook", async (req, res) => {
  // Strava expects a 200 immediately — process async
  res.sendStatus(200)

  const { object_type, aspect_type, object_id, owner_id } = req.body

  // Only handle new activities
  if (object_type !== "activity" || aspect_type !== "create") return

  try {
    const supabase = getSupabase()

    // Look up the PowderDays user by their Strava athlete ID
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("strava_athlete_id", owner_id)
      .single()

    if (!profile) return // User not connected or deauthorized

    await syncSingleActivity(profile.id, object_id)
  } catch (err) {
    console.error("Webhook sync error:", err.message)
    // Don't re-throw — Strava already got its 200
  }
})

export async function getValidStravaToken(userId) {
  const supabase = getSupabase()

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("strava_access_token, strava_refresh_token, strava_token_expires_at")
    .eq("id", userId)
    .single()

  if (error || !profile?.strava_refresh_token) {
    throw new Error("No Strava connection found for this user")
  }

  const expiresAt = new Date(profile.strava_token_expires_at)
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000)

  if (expiresAt > fiveMinFromNow) {
    return profile.strava_access_token
  }

  const refreshRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type:    "refresh_token",
      refresh_token: profile.strava_refresh_token,
    }),
  })

  if (!refreshRes.ok) {
    throw new Error(`Strava token refresh failed: ${refreshRes.status}`)
  }

  const tokens = await refreshRes.json()

  await supabase
    .from("profiles")
    .update({
      strava_access_token:     tokens.access_token,
      strava_refresh_token:    tokens.refresh_token,
      strava_token_expires_at: new Date(tokens.expires_at * 1000).toISOString(),
    })
    .eq("id", userId)

  return tokens.access_token
}

export default router
