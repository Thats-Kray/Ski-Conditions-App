# Sprint 1 — Strava OAuth Backend

**Goal:** Working Strava OAuth flow with token storage. No UI. Server-side only.  
**Estimated effort:** 1–2 days  
**Depends on:** Nothing — this is the first Strava sprint.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**Stack:**
- Frontend: React 19 + Vite, deployed on Vercel
- Backend API: Express (ES modules), single file at `server/index.js`, deployed on Railway
- Database: Supabase (Postgres). Migrations live in `migrations/` at the project root, numbered `001`–`009`. The next migration number is **010** — but `010`–`015` are reserved for ROADMAP session-tracking tasks. Strava migrations start at **016**.
- Client-side Supabase client: `src/lib/supabase.js` using `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`
- The server does NOT yet have `@supabase/supabase-js` installed. You must add it.

**Server facts you need:**
- All routes today are inline in `server/index.js`. You will create `server/routes/strava.js` as a new module and mount it in `server/index.js`.
- The server uses ES module `import/export` syntax (not CommonJS `require`).
- Server `package.json` is at `server/package.json` — separate from the root `package.json`.
- Existing server deps: `express`, `cors`, `node-fetch`, `cheerio`. You will add `@supabase/supabase-js`.

**Environment variables needed (add to Railway + local `.env`):**

| Variable | Description |
|---|---|
| `STRAVA_CLIENT_ID` | From Strava API app settings |
| `STRAVA_CLIENT_SECRET` | From Strava API app settings |
| `STRAVA_REDIRECT_URI` | Must match exactly what's registered on Strava: `https://<railway-domain>/api/strava/callback` |
| `SUPABASE_URL` | Same URL as `VITE_SUPABASE_URL` on the frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (not anon key) — required for server-side writes that bypass RLS |
| `FRONTEND_URL` | Vercel frontend URL, used for redirecting back after OAuth (e.g. `https://powderdays.vercel.app`) |

---

## Tasks

Tasks S1-T1 and S1-T2 have no dependency on each other and can be done in parallel.  
S1-T3 depends on S1-T2 (callback needs the token exchange logic).  
S1-T4 can be built after S1-T2 (it's a helper used by later sprints, but wired into S1-T3).

---

### S1-T1 — Supabase Migration: Strava token columns on `profiles`

**File to create:** `migrations/016_strava_tokens.sql`

Add four columns to the existing `profiles` table. Do not alter or drop any existing columns.

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS strava_athlete_id   BIGINT,
  ADD COLUMN IF NOT EXISTS strava_access_token  TEXT,
  ADD COLUMN IF NOT EXISTS strava_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS strava_token_expires_at TIMESTAMPTZ;
```

- `strava_athlete_id`: the numeric Strava user ID. Used to detect if a user has connected Strava.
- `strava_access_token`: short-lived Strava OAuth token. Expires every 6 hours.
- `strava_refresh_token`: long-lived token. Used to obtain new access tokens.
- `strava_token_expires_at`: UTC timestamp when the access token expires.

**No RLS changes needed** — `profiles` already has RLS. The server will use the service role key, which bypasses RLS. The frontend only needs to read `strava_athlete_id` (non-sensitive) to check if a user has connected Strava — no token values are ever sent to the frontend.

**Acceptance criteria:**
- Migration file exists at `migrations/016_strava_tokens.sql`
- Running it against Supabase succeeds without errors
- `profiles` table has all 4 new columns

**Out of scope:** Do not run the migration yourself. Do not modify any existing columns or RLS policies.

---

### S1-T2 — Install Supabase on server + scaffold routes file

**Files to modify/create:**
- `server/package.json` — add `@supabase/supabase-js`
- `server/routes/strava.js` — new file, scaffold the router
- `server/index.js` — import and mount the new router

**Step 1 — Add Supabase to server:**

In `server/package.json`, add to `dependencies`:
```json
"@supabase/supabase-js": "^2.99.0"
```

Then run `npm install` inside the `server/` directory.

**Step 2 — Create `server/routes/strava.js`:**

```js
import { Router } from "express"
import { createClient } from "@supabase/supabase-js"

const router = Router()

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export default router
```

This is the scaffold. Routes will be added in S1-T2 (auth) and S1-T3 (callback).

**Step 3 — Mount in `server/index.js`:**

Add near the top of `server/index.js`, after the existing imports:
```js
import stravaRouter from "./routes/strava.js"
```

Add after `app.use(cors(...))` and before the first `app.get(...)`:
```js
app.use(stravaRouter)
```

**Acceptance criteria:**
- `server/routes/strava.js` exists and exports a Router
- `server/index.js` mounts it
- Server starts without errors (`node index.js` in the `server/` directory)
- No existing routes are broken

**Out of scope:** Do not add any actual OAuth routes yet — that's S1-T2 and S1-T3.

---

### S1-T2 — `GET /api/strava/auth` — Initiate OAuth

**File:** `server/routes/strava.js` (add to the router scaffolded above)

This route receives a GET request from the frontend (the user clicks "Connect Strava") and redirects the browser to Strava's authorization URL.

**Implementation:**

```js
router.get("/api/strava/auth", (req, res) => {
  // The Supabase user ID is passed as a query param so we can associate
  // the Strava account with the correct PowderDays user after the callback.
  // Example: /api/strava/auth?userId=<supabase-uuid>
  const { userId } = req.query

  if (!userId) {
    return res.status(400).json({ error: "userId is required" })
  }

  const params = new URLSearchParams({
    client_id:     process.env.STRAVA_CLIENT_ID,
    redirect_uri:  process.env.STRAVA_REDIRECT_URI,
    response_type: "code",
    approval_prompt: "auto",
    scope:         "activity:read_all",
    state:         userId,   // passed back by Strava in the callback
  })

  const stravaAuthUrl = `https://www.strava.com/oauth/authorize?${params}`
  res.redirect(stravaAuthUrl)
})
```

**How `state` is used:** Strava echoes `state` back in the callback query params. We use it to know which PowderDays user to attach the tokens to. This is standard OAuth state parameter usage.

**Acceptance criteria:**
- `GET /api/strava/auth?userId=test-123` redirects to `https://www.strava.com/oauth/authorize` with all required params
- Missing `userId` returns 400
- `scope` is exactly `activity:read_all`

---

### S1-T3 — `GET /api/strava/callback` — Token Exchange + Storage

**File:** `server/routes/strava.js` (add to the same router)

Strava redirects back here after the user approves (or denies) the connection. This route exchanges the authorization code for tokens and stores them in Supabase.

**Implementation:**

```js
router.get("/api/strava/callback", async (req, res) => {
  const { code, state: userId, error } = req.query

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173"

  // User denied access
  if (error) {
    return res.redirect(`${frontendUrl}/profile?strava_error=access_denied`)
  }

  if (!code || !userId) {
    return res.redirect(`${frontendUrl}/profile?strava_error=missing_params`)
  }

  try {
    // Exchange authorization code for tokens
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

    // tokens shape:
    // {
    //   access_token: string,
    //   refresh_token: string,
    //   expires_at: number,   ← unix timestamp in seconds
    //   athlete: { id: number, firstname, lastname, ... }
    // }

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
```

**Acceptance criteria:**
- On success: stores all 4 token columns in `profiles`, redirects to `${FRONTEND_URL}/profile?strava_connected=true`
- On Strava error/denial: redirects to `${FRONTEND_URL}/profile?strava_error=access_denied`
- On token exchange failure: redirects with `strava_error=token_exchange_failed`
- `expires_at` is stored as a proper ISO 8601 timestamp, not a unix integer

**Out of scope:** Do not trigger a sync after connection — that's Sprint 2. Do not send any HTML response — always redirect.

---

### S1-T4 — `GET /api/strava/disconnect` + Token Refresh Helper

**File:** `server/routes/strava.js`

**Part A — Disconnect route:**

```js
router.post("/api/strava/disconnect", async (req, res) => {
  const { userId } = req.body

  if (!userId) return res.status(400).json({ error: "userId is required" })

  try {
    const supabase = getSupabase()

    // Fetch the current access token so we can revoke it with Strava
    const { data: profile } = await supabase
      .from("profiles")
      .select("strava_access_token")
      .eq("id", userId)
      .single()

    // Attempt to revoke with Strava (best-effort — don't fail if this errors)
    if (profile?.strava_access_token) {
      await fetch("https://www.strava.com/oauth/deauthorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: profile.strava_access_token }),
      }).catch(() => {}) // silent — Strava revoke failure shouldn't block disconnect
    }

    // Clear all Strava fields from the profile
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
```

**Part B — Token refresh helper function (exported for use by Sprint 2):**

Add this as a named export from `server/routes/strava.js`:

```js
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

  // Token is still valid — return as-is
  if (expiresAt > fiveMinFromNow) {
    return profile.strava_access_token
  }

  // Token is expired or expiring soon — refresh it
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

  // Persist the new tokens
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
```

**Acceptance criteria:**
- `POST /api/strava/disconnect` with `{ userId }` clears all 4 Strava columns and returns `{ success: true }`
- `getValidStravaToken(userId)` returns a valid access token, auto-refreshing if expired
- `getValidStravaToken` is a named export (not a route) — Sprint 2 imports it
- If token refresh fails, it throws an error (does not silently return stale token)

---

## Acceptance Criteria (Sprint Level)

- [x] `migrations/016_strava_tokens.sql` exists with all 4 columns
- [x] `server/routes/strava.js` exports a default Router + named `getValidStravaToken`
- [x] `server/index.js` mounts the Strava router
- [x] `GET /api/strava/auth?userId=X` redirects to Strava authorize URL
- [x] `GET /api/strava/callback?code=X&state=userId` stores tokens in `profiles` and redirects to frontend
- [x] `POST /api/strava/disconnect` clears tokens
- [x] Server starts cleanly with no errors
- [x] No existing routes (`/api/nws/*`, `/api/resort-conditions`, etc.) are broken
- [x] `@supabase/supabase-js` is in `server/package.json` dependencies

## Out of Scope for This Sprint

- No frontend UI (that's Sprint 2)
- No activity sync (that's Sprint 2)
- No Strava webhook registration
- No email or notification of any kind
- Do not modify any frontend files
- Do not modify `src/lib/supabase.js`
- Do not alter migrations `001`–`009` or create migration numbers `010`–`015` (those belong to session-tracking tasks)
