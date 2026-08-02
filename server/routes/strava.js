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

// Verifies the caller's Supabase JWT and pins req.userId to the *authenticated*
// user. Every route below uses req.userId — never req.body.userId, which is
// attacker-controlled and, against a service-role client that bypasses RLS,
// amounts to "act as any user you can name".
async function requireAuth(req, res, next) {
  const header = req.get("authorization") || ""
  const token  = header.startsWith("Bearer ") ? header.slice(7).trim() : null

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

function buildGpxFromRuns(runs, trackName) {
  const allPoints = (runs || [])
    .flatMap((run) => run.gps_track ?? [])
    .sort((a, b) => a.t - b.t)

  if (!allPoints.length) return null

  const trkpts = allPoints
    .map((pt) => {
      const ele  = pt.alt != null ? `\n        <ele>${Number(pt.alt).toFixed(1)}</ele>` : ""
      const time = `\n        <time>${new Date(pt.t).toISOString()}</time>`
      return `      <trkpt lat="${Number(pt.lat).toFixed(6)}" lon="${Number(pt.lng).toFixed(6)}">${ele}${time}\n      </trkpt>`
    })
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="PowderDays" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${trackName.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</name>
  <trkseg>\n${trkpts}\n  </trkseg></trk>
</gpx>`
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

router.post("/api/strava/disconnect", requireAuth, async (req, res) => {
  const userId = req.userId

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

router.post("/api/strava/sync", requireAuth, async (req, res) => {
  const userId = req.userId

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

router.post("/api/strava/upload", requireAuth, async (req, res) => {
  const { sessionId, activityName, activityDate } = req.body
  const userId = req.userId

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" })
  }

  // Ownership check + idempotency in one read. Scoping by user_id as well as id
  // is what stops a caller from uploading someone else's raw GPS track (and so
  // their home address / location history) to their own Strava account.
  const supabase = getSupabase()
  const { data: session } = await supabase
    .from("ski_sessions")
    .select("strava_activity_id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!session) {
    return res.status(404).json({ error: "Session not found" })
  }

  if (session?.strava_activity_id) {
    return res.json({
      already_uploaded: true,
      strava_activity_id: session.strava_activity_id,
      strava_url: `https://www.strava.com/activities/${session.strava_activity_id}`,
    })
  }

  try {
    // Fetch GPS tracks from Supabase. Safe to scope by session_id alone —
    // the session's ownership was verified against req.userId above.
    const { data: runs, error: runsError } = await supabase
      .from("ski_runs")
      .select("gps_track, run_type, started_at")
      .eq("session_id", sessionId)
      .order("started_at", { ascending: true })

    if (runsError) return res.status(500).json({ error: runsError.message })

    const gpxString = buildGpxFromRuns(runs, activityName || `Ski Day - ${activityDate || ""}`)

    if (!gpxString) {
      return res.status(422).json({ error: "No GPS track data available for this session." })
    }

    // Get a valid Strava access token (auto-refreshes if expired)
    const accessToken = await getValidStravaToken(userId)

    // Upload GPX to Strava as multipart form
    const formData = new FormData()
    formData.append("data_type", "gpx")
    formData.append("activity_type", "AlpineSki")
    formData.append("name", activityName || `Ski Day - ${activityDate || ""}`)
    formData.append("file", new Blob([gpxString], { type: "application/gpx+xml" }), "session.gpx")

    const uploadRes = await fetch("https://www.strava.com/api/v3/uploads", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    })

    if (!uploadRes.ok) {
      const body = await uploadRes.text()
      return res.status(502).json({ error: `Strava upload failed: ${uploadRes.status} ${body}` })
    }

    const upload = await uploadRes.json()

    if (upload.error) {
      return res.status(422).json({ error: `Strava rejected upload: ${upload.error}` })
    }

    // Poll until Strava processes the activity (usually 5–30 seconds)
    let stravaActivityId = null
    let attempts = 0
    const maxAttempts = 12 // 12 × 5s = 60s max wait

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5_000))
      attempts++

      const pollRes = await fetch(`https://www.strava.com/api/v3/uploads/${upload.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      const poll = await pollRes.json()

      if (poll.error) {
        return res.status(422).json({ error: `Strava processing error: ${poll.error}` })
      }

      if (poll.activity_id) {
        stravaActivityId = poll.activity_id
        break
      }
    }

    if (!stravaActivityId) {
      return res.status(504).json({ error: "Strava processing timed out. Check Strava app in a few minutes." })
    }

    // Save strava_activity_id back to ski_sessions
    await supabase
      .from("ski_sessions")
      .update({ strava_activity_id: stravaActivityId })
      .eq("id", sessionId)
      .eq("user_id", userId)

    res.json({
      strava_activity_id: stravaActivityId,
      strava_url: `https://www.strava.com/activities/${stravaActivityId}`,
    })
  } catch (err) {
    console.error("Strava upload error:", err)
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
