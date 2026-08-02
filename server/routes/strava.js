import { Router } from "express"
import { createClient } from "@supabase/supabase-js"

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
