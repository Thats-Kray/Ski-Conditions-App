# Sprint 31 — Ski Buddy Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public matchmaking/carpool board — post creation, browsing/filtering, and responding — gated on Tier 1 verification (Sprint 30's `is_verified()`), with moderation-flagged posts held for review instead of silently published or dropped.

**Architecture:** Two new tables (`ski_buddy_posts`, `ski_buddy_responses`) with `SELECT`/owner-`UPDATE` RLS policies only — all writes route through `SECURITY DEFINER` RPCs (`create_ski_buddy_post`, `respond_to_ski_buddy_post`) that call `is_verified(auth.uid())` internally, matching Sprint 29/30's established convention. Post descriptions get checked against OpenAI Moderation *after* insert (the RPC can't reach an external API; Postgres has no outbound HTTP), via a re-wired `POST /api/moderate-content` on the existing Express server — the exact route Sprint 30 built but deliberately left disconnected because it had no caller yet. This sprint is that caller. `SkiBuddyBoard.jsx` and `PostSkiBuddyForm.jsx` mirror `MountainBoard.jsx`'s established filter-chip/`AccentCard`-list/inline-composer conventions; the multi-field creation form uses the modal pattern from `VerificationUpgradeModal.jsx`.

**Tech Stack:** Supabase Postgres/Auth, React 19, Express (`server/`, Railway) — no new dependencies.

## Global Constraints

- Every new `SECURITY DEFINER` function: `SET search_path = public` + explicit `REVOKE ALL ... FROM PUBLIC` / `GRANT EXECUTE ... TO authenticated` (Sprint 29/30 convention).
- No direct client `INSERT` policies on either new table — both write paths are RPCs only. `SELECT`/`UPDATE` policies are fine as direct RLS (matches `mountain_board_posts`/`user_verification`).
- `ski_buddy_posts.user_id` only references `auth.users`, never `profiles` — no FK path for a PostgREST embed. `getSkiBuddyPosts()`/`getSkiBuddyResponses()` must resolve `profiles` via a second query, exactly like `getBoardPosts()` (`src/lib/socialApi.js`) already does. This exact bug already hit Mountain Board in production once — don't rediscover it.
- The riding-style tag list is enforced in two places that must stay in sync: the Postgres `valid_riding_styles()` CHECK function (Task 1) and the `RIDING_STYLES` JS constant (Task 2, `src/lib/skiBuddyOptions.js`). If one changes, the other must too.
- Moderation is best-effort, not a hard gate. The post already exists (verified via `is_verified()` at the RPC layer, which IS the hard gate) before the moderation check runs — a moderation-service failure (missing `OPENAI_API_KEY`, network error) must never undo or block a successful post. Reports remain the real backstop, matching the PRD's explicit "review, not auto-punish" stance.
- Auto-expiry is a query-time computed filter (`ski_date >= CURRENT_DATE`), not a cron job or a trigger that mutates `status` — per the sprint file's own instruction ("simplest first; don't over-engineer a cron job for v1") and this codebase's zero-DB-trigger precedent.
- Match existing conventions: RPC names/params `snake_case`; JS function names `camelCase`; migrations `migrations/NNN_description.sql`, three-digit sequential (next is `028`).

---

## Task 1: Database migration — tables, RLS, and RPCs

**Files:**
- Create: `migrations/028_ski_buddy_board.sql`

**Interfaces:**
- Produces: tables `ski_buddy_posts`, `ski_buddy_responses`; helper `public.valid_riding_styles(text[]) returns boolean`; RPCs `public.create_ski_buddy_post(text,text,date,text[],int,text,int,text) returns ski_buddy_posts`, `public.respond_to_ski_buddy_post(uuid,text) returns ski_buddy_responses`; adds `moderation_flags.submitted_by uuid` (nullable, `ON DELETE SET NULL`) so Task 3's moderation route can attribute a flag to the user whose content triggered it — Sprint 30's final review flagged this column as missing when the route had no real caller; it has one now.
- Consumes: `resort_coordinates` (Sprint 29), `is_verified(uuid)` (Sprint 30), `moderation_flags` (Sprint 30, altered here).

**Design decision — post visibility via RLS, not app-level filtering.** The public `SELECT` policy encodes all three visibility rules (not held for review, status open/filled, not past its ski date) directly in the policy — a Tier 0 user browsing can never retrieve a held-for-review or expired post even via a raw API call, not just "the UI happens to hide it." The post's own author can always see their own post regardless of state (needed so they see their own "under review" post, per the sprint's testing checklist).

**Design decision — response accept/decline via cross-table RLS, not a third RPC.** The post owner isn't the response's own `responder_id`, so a simple owner-only policy doesn't cover "post owner can accept/decline responses to their post." Rather than add another RPC for a single-column status flip, an `UPDATE` policy checks ownership via a subquery against `ski_buddy_posts` — declarative, matches this codebase's general preference for RLS over procedural code where the check is simple.

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 028: Ski Buddy Board (Sprint 31)
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

-- Attribution for moderation_flags rows — Sprint 30 left this column out
-- since the moderation route had no real caller yet; it does now (below).
ALTER TABLE moderation_flags ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Constrained tag list for riding_style — keep this array in sync with
-- RIDING_STYLES in src/lib/skiBuddyOptions.js if it ever changes.
CREATE OR REPLACE FUNCTION public.valid_riding_styles(p_styles TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE AS $$
  SELECT p_styles IS NOT NULL
     AND array_length(p_styles, 1) > 0
     AND p_styles <@ ARRAY['beginner_friendly','cruiser','park_terrain','backcountry_curious','advanced_expert','anyone_chill']::text[];
$$;

CREATE TABLE IF NOT EXISTS ski_buddy_posts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pass_type           TEXT NOT NULL CHECK (pass_type IN ('ikon', 'epic', 'independent', 'other')),
  resort_key          TEXT NOT NULL REFERENCES resort_coordinates(resort_key),
  ski_date            DATE NOT NULL,
  riding_style        TEXT[] NOT NULL CHECK (public.valid_riding_styles(riding_style)),
  group_size_wanted   INT,
  carpool_status      TEXT NOT NULL DEFAULT 'none' CHECK (carpool_status IN ('offering', 'needing', 'none')),
  carpool_seats       INT,
  description         TEXT,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'expired', 'removed')),
  is_held_for_review  BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ski_buddy_posts_browse ON ski_buddy_posts (ski_date, status);
CREATE INDEX IF NOT EXISTS ski_buddy_posts_user ON ski_buddy_posts (user_id);

CREATE TABLE IF NOT EXISTS ski_buddy_responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID NOT NULL REFERENCES ski_buddy_posts(id) ON DELETE CASCADE,
  responder_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, responder_id)
);

ALTER TABLE ski_buddy_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ski_buddy_responses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_buddy_posts' AND policyname='ski_buddy_posts_select') THEN
    CREATE POLICY "ski_buddy_posts_select" ON ski_buddy_posts FOR SELECT TO authenticated
      USING (
        user_id = auth.uid()
        OR (NOT is_held_for_review AND status IN ('open','filled') AND ski_date >= CURRENT_DATE)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_buddy_posts' AND policyname='ski_buddy_posts_update_own') THEN
    CREATE POLICY "ski_buddy_posts_update_own" ON ski_buddy_posts FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_buddy_responses' AND policyname='ski_buddy_responses_select') THEN
    CREATE POLICY "ski_buddy_responses_select" ON ski_buddy_responses FOR SELECT TO authenticated
      USING (
        responder_id = auth.uid()
        OR EXISTS (SELECT 1 FROM ski_buddy_posts WHERE id = ski_buddy_responses.post_id AND user_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ski_buddy_responses' AND policyname='ski_buddy_responses_update_by_post_owner') THEN
    CREATE POLICY "ski_buddy_responses_update_by_post_owner" ON ski_buddy_responses FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM ski_buddy_posts WHERE id = ski_buddy_responses.post_id AND user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM ski_buddy_posts WHERE id = ski_buddy_responses.post_id AND user_id = auth.uid()));
  END IF;

  -- No INSERT policies on either table — writes go through the
  -- SECURITY DEFINER RPCs below, matching Sprint 29/30's convention.
END $$;

CREATE OR REPLACE FUNCTION public.create_ski_buddy_post(
  p_pass_type TEXT, p_resort_key TEXT, p_ski_date DATE, p_riding_style TEXT[],
  p_group_size_wanted INT, p_carpool_status TEXT, p_carpool_seats INT, p_description TEXT
)
RETURNS ski_buddy_posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row ski_buddy_posts;
BEGIN
  IF NOT public.is_verified(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_VERIFIED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM resort_coordinates WHERE resort_key = p_resort_key) THEN
    RAISE EXCEPTION 'UNKNOWN_RESORT';
  END IF;

  IF p_ski_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'SKI_DATE_IN_PAST';
  END IF;

  INSERT INTO ski_buddy_posts (
    user_id, pass_type, resort_key, ski_date, riding_style,
    group_size_wanted, carpool_status, carpool_seats, description
  )
  VALUES (
    auth.uid(), p_pass_type, p_resort_key, p_ski_date, p_riding_style,
    p_group_size_wanted, p_carpool_status, p_carpool_seats, p_description
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ski_buddy_post(TEXT,TEXT,DATE,TEXT[],INT,TEXT,INT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ski_buddy_post(TEXT,TEXT,DATE,TEXT[],INT,TEXT,INT,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_ski_buddy_post(p_post_id UUID, p_message TEXT)
RETURNS ski_buddy_responses
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_post ski_buddy_posts;
  v_row  ski_buddy_responses;
BEGIN
  IF NOT public.is_verified(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_VERIFIED';
  END IF;

  SELECT * INTO v_post FROM ski_buddy_posts WHERE id = p_post_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POST_NOT_FOUND';
  END IF;

  IF v_post.user_id = auth.uid() THEN
    RAISE EXCEPTION 'CANNOT_RESPOND_TO_OWN_POST';
  END IF;

  IF v_post.status <> 'open' THEN
    RAISE EXCEPTION 'POST_NOT_OPEN';
  END IF;

  INSERT INTO ski_buddy_responses (post_id, responder_id, message)
  VALUES (p_post_id, auth.uid(), NULLIF(trim(p_message), ''))
  ON CONFLICT (post_id, responder_id) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    SELECT * INTO v_row FROM ski_buddy_responses WHERE post_id = p_post_id AND responder_id = auth.uid();
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_ski_buddy_post(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_ski_buddy_post(UUID, TEXT) TO authenticated;
```

- [ ] **Step 2: Apply the migration to the live Supabase project**

Same as every prior migration in this repo — apply via the Supabase MCP tool (`mcp__claude_ai_Supabase__apply_migration`) after confirming with Kyle, since this is a live database change.

- [ ] **Step 3: Verify — RPCs exist, are locked down, and the riding-style check works**

```sql
select proname, prosecdef from pg_proc where proname in ('create_ski_buddy_post','respond_to_ski_buddy_post');
-- Expect 2 rows, prosecdef = true on both.

select routine_name, grantee from information_schema.routine_privileges
  where routine_name in ('create_ski_buddy_post','respond_to_ski_buddy_post') and grantee = 'authenticated';
-- Expect both present.

select public.valid_riding_styles(ARRAY['cruiser']);        -- expect true
select public.valid_riding_styles(ARRAY['made_up_style']);  -- expect false
select public.valid_riding_styles(ARRAY[]::text[]);         -- expect false (empty not allowed)
```

- [ ] **Step 4: Verify — a Tier 0 user cannot create a post**

Run as an authenticated-but-unverified test user (or reason about it from the RPC body): calling `create_ski_buddy_post` should raise `NOT_VERIFIED` before touching the table, since `is_verified()` is checked first.

- [ ] **Step 5: Commit**

```bash
git add migrations/028_ski_buddy_board.sql
git commit -m "feat: add Ski Buddy Board tables, RLS, and RPCs (Sprint 31)"
```

---

## Task 2: Re-wire the moderation route with validation and post-hold logic

**Files:**
- Modify: `server/index.js`

**Interfaces:**
- Consumes: `moderateText(text)` from `server/moderation.js` (already exists, untouched since Sprint 30), `getSupabase()` (`server/index.js`), `moderation_flags.submitted_by` (Task 1).
- Produces: live route `POST /api/moderate-content` — this is the exact route Sprint 30 built and then removed the wiring for, since it had no caller. This task is that caller's arrival.

**Why now:** Sprint 30's final review deliberately held this route back — "zero callers exist until Sprint 31's board ships... Sprint 31 should wire the route with request attribution and input validation when a real caller exists." That's this task.

- [ ] **Step 1: Replace the placeholder comment with the real route**

Find the placeholder left by Sprint 30 in `server/index.js` (search for `POST /api/moderate-content` — it's currently just a 7-line comment where the route used to be, right after the `/api/resubscribe` route):

```js
// ── Server-side content moderation (OpenAI Moderation API) ──
// server/moderation.js's moderateText() is ready to use, but the route that
// calls it (POST /api/moderate-content) is intentionally not wired up yet —
// there's no real caller until Sprint 31's board ships. Wire it back in then,
// with request attribution (req.userId on the moderation_flags row) and input
// validation this sprint's version was missing. See Sprint 30's final review
// for the full reasoning.
```

Replace it with:

```js
import { moderateText } from "./moderation.js"

const MODERATION_CONTENT_TYPES = new Set(["ski_buddy_post"])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Verifies the caller's Supabase JWT and pins req.userId to the *authenticated*
// user, same pattern as requireAuth in routes/strava.js:49-70 — defined locally
// here since it isn't currently exported from that module.
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
    console.error("Auth verification error:", err.message)
    res.status(401).json({ error: "Could not verify session" })
  }
}

app.post("/api/moderate-content", requireAuth, async (req, res) => {
  const { contentType, contentId, text } = req.body || {}

  if (!contentType || !contentId || !text) {
    return res.status(400).json({ error: "contentType, contentId, and text are required" })
  }
  if (!MODERATION_CONTENT_TYPES.has(contentType)) {
    return res.status(400).json({ error: `Unsupported contentType: ${contentType}` })
  }
  if (!UUID_RE.test(contentId)) {
    return res.status(400).json({ error: "contentId must be a UUID" })
  }
  if (typeof text !== "string" || text.length > 2000) {
    return res.status(400).json({ error: "text must be a string of 2000 characters or fewer" })
  }

  try {
    const result = await moderateText(text)

    if (result.flagged) {
      const { error: flagError } = await getSupabase().from("moderation_flags").insert({
        content_type: contentType,
        content_id: contentId,
        source: "openai_moderation",
        category: result.category,
        score: result.score,
        auto_held: true,
        submitted_by: req.userId,
      })
      if (flagError) throw flagError

      if (contentType === "ski_buddy_post") {
        const { error: holdError } = await getSupabase()
          .from("ski_buddy_posts")
          .update({ is_held_for_review: true })
          .eq("id", contentId)
        if (holdError) throw holdError
      }
    }

    res.json({ flagged: result.flagged, held: result.flagged })
  } catch (err) {
    console.error("Moderation check failed:", err.message)
    res.status(500).json({ error: "Moderation check failed" })
  }
})
```

- [ ] **Step 2: Verify**

`cd server && node --check index.js` — confirm it still parses. Then, with the server running locally (`npm run dev` from `server/`) and a valid Supabase access token:

```bash
curl -X POST http://localhost:8787/api/moderate-content \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"contentType":"ski_buddy_post","contentId":"<a real ski_buddy_posts.id>","text":"anyone want to ski saturday"}'
```

Expect `{"flagged":false,"held":false}`. Try `contentType: "bogus"` — expect a 400. Try a `contentId` that isn't a UUID — expect a 400. (A real flagged-content test needs a working `OPENAI_API_KEY` in `server/.env`, which may not be set up yet locally — if it isn't, note that in your report rather than blocking on it; the input-validation checks above don't need a real key.)

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: wire up /api/moderate-content for Ski Buddy Board posts"
```

---

## Task 3: `socialApi.js` — Ski Buddy Board API layer

**Files:**
- Create: `src/lib/skiBuddyOptions.js`
- Modify: `src/lib/socialApi.js` (add new exports; a good insertion point is right after `reportContent`, near the end of the Verification section)

**Interfaces:**
- Produces: `createSkiBuddyPost(postData)`, `getSkiBuddyPosts(filters)`, `getMySkiBuddyPosts()`, `respondToSkiBuddyPost(postId, message)`, `getSkiBuddyResponses(postId)`, `respondToSkiBuddyResponse(responseId, status)`, `updateSkiBuddyPostStatus(postId, status)` — all used by Task 4/5's components. Also `RIDING_STYLES`, `PASS_TYPES`, `CARPOOL_STATUSES` (from `skiBuddyOptions.js`) — shared display constants for both the filter UI and the creation form.
- Consumes: `create_ski_buddy_post`/`respond_to_ski_buddy_post` RPCs (Task 1), `POST /api/moderate-content` (Task 2), `getCurrentUser()` (existing, `socialApi.js`).

- [ ] **Step 1: Create `src/lib/skiBuddyOptions.js`**

```js
// Keep RIDING_STYLES' keys in sync with the Postgres valid_riding_styles()
// CHECK function in migrations/028_ski_buddy_board.sql — if one changes, so
// must the other.
export const RIDING_STYLES = [
  { key: "beginner_friendly", label: "Beginner-Friendly", emoji: "🌱" },
  { key: "cruiser",           label: "Cruiser",            emoji: "🎿" },
  { key: "park_terrain",      label: "Park/Terrain",       emoji: "🛹" },
  { key: "backcountry_curious", label: "Backcountry-Curious", emoji: "🏔️" },
  { key: "advanced_expert",   label: "Advanced/Expert",    emoji: "🔥" },
  { key: "anyone_chill",      label: "Anyone Chill",       emoji: "🤙" },
]

export const PASS_TYPES = [
  { key: "ikon",        label: "Ikon" },
  { key: "epic",         label: "Epic" },
  { key: "independent",  label: "Independent" },
  { key: "other",        label: "Other" },
]

export const CARPOOL_STATUSES = [
  { key: "none",     label: "No Carpool" },
  { key: "offering", label: "🚗 Offering Seats" },
  { key: "needing",  label: "🙋 Need a Seat" },
]
```

- [ ] **Step 2: Add the API functions to `socialApi.js`**

Insert after `reportContent` (end of the `/* Verification (Sprint 30) */` section):

```js
/* -----------------------------
   Ski Buddy Board (Sprint 31)
----------------------------- */

const MODERATE_ENDPOINT = `${import.meta.env.VITE_API_URL || "http://localhost:8787"}/api/moderate-content`

// Best-effort — the post already exists (is_verified() already gated its
// creation at the RPC layer, which is the real security boundary) before
// this runs. A moderation-service outage must never undo or block a
// successful post; reports are the actual backstop (see PRD: "review, not
// auto-punish"). Failures are logged, never thrown.
async function moderatePostDescription(postId, description) {
  if (!description || !description.trim()) return
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch(MODERATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ contentType: "ski_buddy_post", contentId: postId, text: description }),
    })
  } catch (err) {
    console.error("Post moderation check failed:", err?.message)
  }
}

export async function createSkiBuddyPost({
  passType, resortKey, skiDate, ridingStyle, groupSizeWanted, carpoolStatus, carpoolSeats, description,
}) {
  const { data, error } = await supabase.rpc("create_ski_buddy_post", {
    p_pass_type: passType,
    p_resort_key: resortKey,
    p_ski_date: skiDate,
    p_riding_style: ridingStyle,
    p_group_size_wanted: groupSizeWanted || null,
    p_carpool_status: carpoolStatus || "none",
    p_carpool_seats: carpoolSeats || null,
    p_description: description || null,
  })
  if (error) throw error

  await moderatePostDescription(data.id, description)

  // Re-fetch so the caller sees is_held_for_review if the moderation check
  // (which just ran, above) flagged it.
  const { data: fresh, error: freshError } = await supabase
    .from("ski_buddy_posts")
    .select("*")
    .eq("id", data.id)
    .single()
  if (freshError) throw freshError
  return fresh
}

export async function getSkiBuddyPosts(filters = {}) {
  let query = supabase
    .from("ski_buddy_posts")
    .select("*")
    .in("status", ["open", "filled"])
    .gte("ski_date", new Date().toISOString().slice(0, 10))
    .order("ski_date", { ascending: true })

  if (filters.passType) query = query.eq("pass_type", filters.passType)
  if (filters.resortKey) query = query.eq("resort_key", filters.resortKey)
  if (filters.carpoolStatus) query = query.eq("carpool_status", filters.carpoolStatus)
  if (filters.ridingStyle) query = query.contains("riding_style", [filters.ridingStyle])
  if (filters.dateFrom) query = query.gte("ski_date", filters.dateFrom)
  if (filters.dateTo) query = query.lte("ski_date", filters.dateTo)

  const { data, error } = await query
  if (error) throw error
  const posts = data || []
  if (!posts.length) return posts

  // ski_buddy_posts.user_id only references auth.users, never profiles — no
  // FK path for a PostgREST embed. Resolve as a second query, matching
  // getBoardPosts()'s established fix for the same situation.
  const userIds = [...new Set(posts.map((p) => p.user_id))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", userIds)

  const pm = new Map((profiles || []).map((p) => [p.id, p]))
  return posts.map((p) => ({ ...p, profiles: pm.get(p.user_id) || null }))
}

export async function getMySkiBuddyPosts() {
  const user = await getCurrentUser()
  const { data, error } = await supabase
    .from("ski_buddy_posts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
  if (error) throw error
  return data || []
}

export async function respondToSkiBuddyPost(postId, message) {
  const { data, error } = await supabase.rpc("respond_to_ski_buddy_post", {
    p_post_id: postId,
    p_message: message || null,
  })
  if (error) throw error
  return data
}

export async function getSkiBuddyResponses(postId) {
  const { data, error } = await supabase
    .from("ski_buddy_responses")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
  if (error) throw error
  const responses = data || []
  if (!responses.length) return responses

  const responderIds = [...new Set(responses.map((r) => r.responder_id))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", responderIds)

  const pm = new Map((profiles || []).map((p) => [p.id, p]))
  return responses.map((r) => ({ ...r, profiles: pm.get(r.responder_id) || null }))
}

export async function respondToSkiBuddyResponse(responseId, status) {
  if (!["accepted", "declined"].includes(status)) {
    throw new Error("Invalid response status.")
  }
  const { data, error } = await supabase
    .from("ski_buddy_responses")
    .update({ status })
    .eq("id", responseId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSkiBuddyPostStatus(postId, status) {
  if (!["open", "filled", "removed"].includes(status)) {
    throw new Error("Invalid post status.")
  }
  const { data, error } = await supabase
    .from("ski_buddy_posts")
    .update({ status })
    .eq("id", postId)
    .select()
    .single()
  if (error) throw error
  return data
}
```

- [ ] **Step 3: Verify**

`npm run lint` — confirm no new errors. Then a browser-console smoke test with the app running and logged in as a Tier 1 test account (if one exists yet; otherwise a Tier 0 read-only check is fine):

```js
import("/src/lib/socialApi.js").then(async (m) => {
  console.log(await m.getSkiBuddyPosts())
})
```

Expect `[]` (empty array, no posts yet) rather than an error.

- [ ] **Step 4: Commit**

```bash
git add src/lib/skiBuddyOptions.js src/lib/socialApi.js
git commit -m "feat: add Ski Buddy Board API functions to socialApi.js"
```

---

## Task 4: `SkiBuddyBoard.jsx` — filterable list + response threads

**Files:**
- Create: `src/components/SkiBuddyBoard.jsx`

**Interfaces:**
- Consumes: `getSkiBuddyPosts`, `getSkiBuddyResponses`, `respondToSkiBuddyPost`, `respondToSkiBuddyResponse`, `updateSkiBuddyPostStatus`, `reportContent` (Sprint 30, existing), `syncVerificationFromAuth` (Sprint 30, existing), `RIDING_STYLES`/`PASS_TYPES`/`CARPOOL_STATUSES` (Task 3), `VerificationUpgradeModal` (Sprint 30, existing), `PostSkiBuddyForm` (Task 5).
- Produces: default export `SkiBuddyBoard()` — no props needed (unlike `MountainBoard`, this board isn't per-resort-locked; resort is just one of several filters).

**Design note — response threads live in this file, not a separate component.** The sprint's own file list names only `SkiBuddyBoard.jsx` and `PostSkiBuddyForm.jsx`; a per-post response thread is tightly coupled to how posts render in the list (expand-in-place), so it's a local, unexported sub-component in this file — matching this codebase's existing pattern of colocating tightly-coupled sub-components (e.g. `EditProfileModal` inside `ProfilePage.jsx`) rather than fragmenting into extra files the plan didn't ask for.

- [ ] **Step 1: Write the component**

Read `src/components/MountainBoard.jsx` first (filter-chip row styling, `AccentCard` usage, composer-open-toggle pattern, error-message conventions) — this file follows the same conventions but with more filter dimensions and a response-thread feature MountainBoard doesn't have.

```jsx
import { useEffect, useMemo, useState } from "react"
import {
  getSkiBuddyPosts,
  getSkiBuddyResponses,
  respondToSkiBuddyPost,
  respondToSkiBuddyResponse,
  updateSkiBuddyPostStatus,
  reportContent,
  syncVerificationFromAuth,
  getCurrentUser,
} from "../lib/socialApi"
import { RIDING_STYLES, PASS_TYPES, CARPOOL_STATUSES } from "../lib/skiBuddyOptions"
import { RESORT_NAMES, RESORT_EMOJI } from "../lib/resorts"
import { timeAgo } from "../lib/format"
import AccentCard from "./ui/AccentCard"
import VerificationUpgradeModal from "./VerificationUpgradeModal"
import PostSkiBuddyForm from "./PostSkiBuddyForm"

function passLabel(key) {
  return PASS_TYPES.find((p) => p.key === key)?.label || key
}

function formatDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}

// Local, unexported — tightly coupled to how each post renders in the list
// (expand-in-place), not reused elsewhere. See Task 4's design note.
function ResponseThread({ post, currentUserId, onStatusChange }) {
  const [responses, setResponses] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getSkiBuddyResponses(post.id)
      .then((rows) => { if (!cancelled) setResponses(rows) })
      .catch(() => { if (!cancelled) setResponses([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [post.id])

  async function handleDecision(responseId, status) {
    setResponses((prev) => prev.map((r) => (r.id === responseId ? { ...r, status } : r)))
    try {
      await respondToSkiBuddyResponse(responseId, status)
      if (status === "accepted") onStatusChange?.(post.id, "filled")
    } catch {
      setResponses((prev) => prev.map((r) => (r.id === responseId ? { ...r, status: "pending" } : r)))
    }
  }

  if (loading) return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "8px 0" }}>Loading responses…</div>
  if (!responses?.length) return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "8px 0" }}>No responses yet.</div>

  return (
    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
      {responses.map((r) => {
        const name = r.profiles?.full_name || r.profiles?.username || "Someone"
        const isOwner = post.user_id === currentUserId
        return (
          <div key={r.id} style={{ padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.04)", fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "white" }}>{name}</span>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>{timeAgo(r.created_at)}</span>
            </div>
            {r.message && <div style={{ color: "rgba(255,255,255,0.7)", marginTop: 3 }}>{r.message}</div>}
            {isOwner && r.status === "pending" && (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => handleDecision(r.id, "accepted")} style={{ padding: "4px 10px", borderRadius: 8, border: "none", background: "var(--color-success-strong)", color: "white", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Accept</button>
                <button onClick={() => handleDecision(r.id, "declined")} style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.6)", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Decline</button>
              </div>
            )}
            {r.status !== "pending" && (
              <div style={{ marginTop: 4, fontWeight: 700, color: r.status === "accepted" ? "var(--color-success-strong)" : "rgba(255,255,255,0.4)" }}>
                {r.status === "accepted" ? "✅ Accepted" : "Declined"}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function SkiBuddyBoard() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [currentUserId, setCurrentUserId] = useState(null)

  const [passTypeFilter, setPassTypeFilter] = useState("all")
  const [resortFilter, setResortFilter] = useState("all")
  const [carpoolFilter, setCarpoolFilter] = useState("all")
  const [ridingStyleFilter, setRidingStyleFilter] = useState("all")

  const [showForm, setShowForm] = useState(false)
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [expandedPostId, setExpandedPostId] = useState(null)

  const [respondingPostId, setRespondingPostId] = useState(null)
  const [responseMessage, setResponseMessage] = useState("")
  const [responseError, setResponseError] = useState(null)
  const [responding, setResponding] = useState(false)

  const [reportingId, setReportingId] = useState(null)
  const [reportReason, setReportReason] = useState("")

  useEffect(() => {
    getCurrentUser().then((u) => setCurrentUserId(u.id)).catch(() => setCurrentUserId(null))
  }, [])

  function loadPosts() {
    setLoading(true)
    setLoadError(null)
    getSkiBuddyPosts({
      passType: passTypeFilter === "all" ? null : passTypeFilter,
      resortKey: resortFilter === "all" ? null : resortFilter,
      carpoolStatus: carpoolFilter === "all" ? null : carpoolFilter,
      ridingStyle: ridingStyleFilter === "all" ? null : ridingStyleFilter,
    })
      .then(setPosts)
      .catch((err) => { setPosts([]); setLoadError(err) })
      .finally(() => setLoading(false))
  }

  useEffect(loadPosts, [passTypeFilter, resortFilter, carpoolFilter, ridingStyleFilter])

  async function requireTier1(action) {
    try {
      const { tier } = await syncVerificationFromAuth()
      if (tier >= 1) { action(); return }
    } catch {
      // fall through to the modal — if we can't confirm tier, don't assume it
    }
    setShowVerifyModal(true)
  }

  function handleNewPostClick() {
    requireTier1(() => setShowForm(true))
  }

  function handleRespondClick(postId) {
    requireTier1(() => { setRespondingPostId(postId); setResponseMessage(""); setResponseError(null) })
  }

  async function handleSubmitResponse(postId) {
    setResponding(true)
    setResponseError(null)
    try {
      await respondToSkiBuddyPost(postId, responseMessage.trim())
      setRespondingPostId(null)
      setExpandedPostId(postId)
    } catch (err) {
      if (err?.message?.includes("CANNOT_RESPOND_TO_OWN_POST")) {
        setResponseError("You can't respond to your own post.")
      } else if (err?.message?.includes("POST_NOT_OPEN")) {
        setResponseError("This post is no longer open.")
      } else {
        setResponseError("Couldn't send your response. Try again in a bit.")
      }
    } finally {
      setResponding(false)
    }
  }

  function handleStatusChange(postId, status) {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status } : p)))
    updateSkiBuddyPostStatus(postId, status).catch(() => loadPosts())
  }

  async function handleReportSubmit(targetId) {
    if (!reportReason.trim()) return
    try {
      await reportContent("post", targetId, reportReason.trim())
      setReportingId(null)
      setReportReason("")
    } catch {
      // leave the report UI open so the user can retry
    }
  }

  const visiblePosts = useMemo(() => posts, [posts])

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {!showForm ? (
        <button
          onClick={handleNewPostClick}
          style={{ padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(56,189,248,0.4)", background: "rgba(56,189,248,0.1)", color: "var(--color-accent)", fontWeight: 800, cursor: "pointer" }}
        >
          🎿 Post a Listing
        </button>
      ) : (
        <PostSkiBuddyForm
          onClose={() => setShowForm(false)}
          onCreated={(newPost) => { setPosts((prev) => [newPost, ...prev]); setShowForm(false) }}
        />
      )}

      {showVerifyModal && (
        <VerificationUpgradeModal
          onClose={() => setShowVerifyModal(false)}
          onVerified={() => setShowVerifyModal(false)}
        />
      )}

      {/* Filters */}
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["all", ...PASS_TYPES.map((p) => p.key)].map((key) => (
            <button key={key} onClick={() => setPassTypeFilter(key)} style={{
              padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.1)",
              background: passTypeFilter === key ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.04)", color: "white",
            }}>
              {key === "all" ? "All Passes" : passLabel(key)}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["all", ...CARPOOL_STATUSES.map((c) => c.key)].map((key) => {
            const c = CARPOOL_STATUSES.find((c) => c.key === key)
            return (
              <button key={key} onClick={() => setCarpoolFilter(key)} style={{
                padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: "1px solid rgba(255,255,255,0.1)",
                background: carpoolFilter === key ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.04)", color: "white",
              }}>
                {key === "all" ? "Any Carpool" : c.label}
              </button>
            )
          })}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["all", ...RIDING_STYLES.map((s) => s.key)].map((key) => {
            const s = RIDING_STYLES.find((s) => s.key === key)
            return (
              <button key={key} onClick={() => setRidingStyleFilter(key)} style={{
                padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: "1px solid rgba(255,255,255,0.1)",
                background: ridingStyleFilter === key ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.04)", color: "white",
              }}>
                {key === "all" ? "Any Style" : `${s.emoji} ${s.label}`}
              </button>
            )
          })}
        </div>
        <select
          value={resortFilter}
          onChange={(e) => setResortFilter(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: 13, colorScheme: "dark" }}
        >
          <option value="all">All Resorts</option>
          {Object.keys(RESORT_NAMES).map((key) => (
            <option key={key} value={key}>{RESORT_EMOJI[key]} {RESORT_NAMES[key]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 20, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Loading…</div>
      ) : loadError ? (
        <div style={{ padding: 20, fontSize: 13, color: "var(--color-danger)" }}>Couldn't load the board. Try again in a bit.</div>
      ) : !visiblePosts.length ? (
        <div style={{ padding: 20, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>No listings match your filters yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {visiblePosts.map((post) => {
            const author = post.profiles?.full_name || post.profiles?.username || "Someone"
            const isOwner = post.user_id === currentUserId
            const styles = RIDING_STYLES.filter((s) => post.riding_style?.includes(s.key))
            return (
              <AccentCard key={post.id} accentColor="var(--color-accent)">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{RESORT_EMOJI[post.resort_key]} {RESORT_NAMES[post.resort_key] || post.resort_key}</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginLeft: 8 }}>{formatDate(post.ski_date)}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--color-accent)" }}>{passLabel(post.pass_type)}</span>
                </div>

                {post.is_held_for_review && isOwner && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-danger)", marginBottom: 6 }}>
                    ⏳ Under review — only you can see this post right now.
                  </div>
                )}

                {post.description && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 6 }}>{post.description}</div>}

                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                  {styles.map((s) => (
                    <span key={s.key} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
                      {s.emoji} {s.label}
                    </span>
                  ))}
                  {post.carpool_status !== "none" && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(56,189,248,0.15)", color: "var(--color-accent)" }}>
                      {CARPOOL_STATUSES.find((c) => c.key === post.carpool_status)?.label}
                      {post.carpool_status === "offering" && post.carpool_seats ? ` (${post.carpool_seats})` : ""}
                    </span>
                  )}
                  {post.status === "filled" && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(34,197,94,0.15)", color: "var(--color-success-strong)" }}>Filled</span>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{author} · {timeAgo(post.created_at)}</span>
                  <div style={{ display: "flex", gap: 10 }}>
                    {isOwner ? (
                      <button onClick={() => setExpandedPostId(expandedPostId === post.id ? null : post.id)} style={{ background: "none", border: "none", color: "var(--color-accent)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        {expandedPostId === post.id ? "Hide responses" : "View responses"}
                      </button>
                    ) : (
                      <button onClick={() => handleRespondClick(post.id)} disabled={post.status !== "open"} style={{ background: "none", border: "none", color: post.status === "open" ? "var(--color-accent)" : "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: 700, cursor: post.status === "open" ? "pointer" : "default" }}>
                        Respond
                      </button>
                    )}
                    {!isOwner && (
                      <button onClick={() => setReportingId(reportingId === post.id ? null : post.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 11, cursor: "pointer" }}>
                        🚩 Report
                      </button>
                    )}
                  </div>
                </div>

                {respondingPostId === post.id && (
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    <textarea
                      value={responseMessage}
                      onChange={(e) => setResponseMessage(e.target.value.slice(0, 300))}
                      placeholder="Say hi, mention your plan…"
                      rows={2}
                      style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 8, color: "white", fontSize: 12, resize: "none" }}
                    />
                    {responseError && <div style={{ fontSize: 11, color: "var(--color-danger)" }}>{responseError}</div>}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setRespondingPostId(null)} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12 }}>Cancel</button>
                      <button onClick={() => handleSubmitResponse(post.id)} disabled={responding} style={{ flex: 2, padding: 8, borderRadius: 8, border: "none", background: "var(--gradient-primary)", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 12, opacity: responding ? 0.6 : 1 }}>
                        {responding ? "Sending…" : "Send"}
                      </button>
                    </div>
                  </div>
                )}

                {reportingId === post.id && (
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    <textarea
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value.slice(0, 300))}
                      placeholder="Why are you reporting this?"
                      rows={2}
                      style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 8, color: "white", fontSize: 12, resize: "none" }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setReportingId(null); setReportReason("") }} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12 }}>Cancel</button>
                      <button onClick={() => handleReportSubmit(post.id)} disabled={!reportReason.trim()} style={{ flex: 2, padding: 8, borderRadius: 8, border: "none", background: "var(--color-danger)", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 12, opacity: reportReason.trim() ? 1 : 0.5 }}>
                        Submit Report
                      </button>
                    </div>
                  </div>
                )}

                {expandedPostId === post.id && isOwner && (
                  <ResponseThread post={post} currentUserId={currentUserId} onStatusChange={handleStatusChange} />
                )}
              </AccentCard>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify**

`npm run lint` and `npm run build` — confirm no new errors. `npm run dev`, temporarily mount `<SkiBuddyBoard />` somewhere reachable (Task 6 will do this for real) — confirm it renders, filters toggle, and the empty-state message shows with zero posts in the database.

- [ ] **Step 3: Commit**

```bash
git add src/components/SkiBuddyBoard.jsx
git commit -m "feat: add SkiBuddyBoard.jsx with filters and response threads"
```

---

## Task 5: `PostSkiBuddyForm.jsx` — creation form

**Files:**
- Create: `src/components/PostSkiBuddyForm.jsx`

**Interfaces:**
- Consumes: `createSkiBuddyPost` (Task 3), `RIDING_STYLES`/`PASS_TYPES`/`CARPOOL_STATUSES` (Task 3).
- Produces: default export `PostSkiBuddyForm({ onClose, onCreated })` — `onCreated(newPost)` fires after a successful create.

- [ ] **Step 1: Write the component**

Modal-overlay pattern, matching `VerificationUpgradeModal.jsx`'s established overlay/card/close-button conventions (read that file first if you haven't already touched it this session) rather than `MountainBoard.jsx`'s lighter inline composer — this form has seven fields and needs the room.

```jsx
import { useState } from "react"
import { createSkiBuddyPost } from "../lib/socialApi"
import { RIDING_STYLES, PASS_TYPES, CARPOOL_STATUSES } from "../lib/skiBuddyOptions"
import { RESORT_NAMES, RESORT_EMOJI } from "../lib/resorts"

const fieldLabelStyle = {
  fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7,
}

const fieldStyle = {
  width: "100%", padding: "11px 13px", borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)",
  color: "white", fontSize: 15, outline: "none", boxSizing: "border-box", colorScheme: "dark",
}

function chipStyle(active) {
  return {
    padding: "7px 14px", borderRadius: 10, cursor: "pointer",
    border: `1.5px solid ${active ? "var(--color-accent)" : "rgba(255,255,255,0.1)"}`,
    background: active ? "rgba(56,189,248,0.2)" : "rgba(255,255,255,0.04)",
    color: active ? "var(--color-accent)" : "rgba(255,255,255,0.6)",
    fontWeight: active ? 800 : 500, fontSize: 12,
  }
}

const todayISO = new Date().toISOString().slice(0, 10)

export default function PostSkiBuddyForm({ onClose, onCreated }) {
  const [passType, setPassType] = useState("")
  const [resortKey, setResortKey] = useState("")
  const [skiDate, setSkiDate] = useState("")
  const [ridingStyle, setRidingStyle] = useState([])
  const [groupSizeWanted, setGroupSizeWanted] = useState("")
  const [carpoolStatus, setCarpoolStatus] = useState("none")
  const [carpoolSeats, setCarpoolSeats] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  function toggleStyle(key) {
    setRidingStyle((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!passType || !resortKey || !skiDate || ridingStyle.length === 0) {
      setError("Pass type, resort, date, and at least one riding style are required.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const newPost = await createSkiBuddyPost({
        passType, resortKey, skiDate, ridingStyle,
        groupSizeWanted: groupSizeWanted ? parseInt(groupSizeWanted, 10) : null,
        carpoolStatus,
        carpoolSeats: carpoolStatus === "offering" && carpoolSeats ? parseInt(carpoolSeats, 10) : null,
        description: description.trim() || null,
      })
      onCreated?.(newPost)
    } catch (err) {
      if (err?.message?.includes("NOT_VERIFIED")) {
        setError("You need to verify your account before posting.")
      } else if (err?.message?.includes("SKI_DATE_IN_PAST")) {
        setError("Pick a date that hasn't passed yet.")
      } else {
        setError("Couldn't create your post. Try again in a bit.")
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div onClick={busy ? undefined : onClose} style={{
      position: "fixed", inset: 0, zIndex: 600, background: "rgba(4,8,15,0.85)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 16px", overflowY: "auto",
    }}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto",
          background: "var(--color-bg-deep)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 24, boxShadow: "0 40px 120px rgba(0,0,0,0.85)", padding: 22, display: "grid", gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>Post a Ski Buddy Listing</div>
          <button type="button" onClick={onClose} style={{
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "50%",
            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontSize: 18, cursor: "pointer", flexShrink: 0,
          }}>×</button>
        </div>

        {error && (
          <div style={{ fontSize: 13, color: "var(--color-danger)", background: "var(--color-danger-bg)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 12, padding: "10px 13px" }}>
            {error}
          </div>
        )}

        <div>
          <div style={fieldLabelStyle}>Pass Type</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {PASS_TYPES.map((p) => (
              <button key={p.key} type="button" onClick={() => setPassType(p.key)} style={chipStyle(passType === p.key)}>{p.label}</button>
            ))}
          </div>
        </div>

        <div>
          <div style={fieldLabelStyle}>Resort</div>
          <select value={resortKey} onChange={(e) => setResortKey(e.target.value)} style={fieldStyle}>
            <option value="">Select a resort…</option>
            {Object.keys(RESORT_NAMES).map((key) => (
              <option key={key} value={key}>{RESORT_EMOJI[key]} {RESORT_NAMES[key]}</option>
            ))}
          </select>
        </div>

        <div>
          <div style={fieldLabelStyle}>Date</div>
          <input type="date" min={todayISO} value={skiDate} onChange={(e) => setSkiDate(e.target.value)} style={fieldStyle} />
        </div>

        <div>
          <div style={fieldLabelStyle}>Riding Style (pick at least one)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {RIDING_STYLES.map((s) => (
              <button key={s.key} type="button" onClick={() => toggleStyle(s.key)} style={chipStyle(ridingStyle.includes(s.key))}>
                {s.emoji} {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={fieldLabelStyle}>Group Size Wanted (optional)</div>
          <input type="number" min="1" max="20" value={groupSizeWanted} onChange={(e) => setGroupSizeWanted(e.target.value)} placeholder="e.g. 3" style={fieldStyle} />
        </div>

        <div>
          <div style={fieldLabelStyle}>Carpool</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CARPOOL_STATUSES.map((c) => (
              <button key={c.key} type="button" onClick={() => setCarpoolStatus(c.key)} style={chipStyle(carpoolStatus === c.key)}>{c.label}</button>
            ))}
          </div>
        </div>

        {carpoolStatus === "offering" && (
          <div>
            <div style={fieldLabelStyle}>Seats Available</div>
            <input type="number" min="1" max="8" value={carpoolSeats} onChange={(e) => setCarpoolSeats(e.target.value)} style={fieldStyle} />
          </div>
        )}

        <div>
          <div style={fieldLabelStyle}>Description (optional)</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            placeholder="Anything else people should know?"
            rows={3}
            style={{ ...fieldStyle, resize: "none" }}
          />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right", marginTop: 4 }}>{description.length}/500</div>
        </div>

        <button type="submit" disabled={busy} style={{
          padding: "14px", borderRadius: 14, border: "none",
          background: busy ? "rgba(255,255,255,0.1)" : "var(--gradient-cta)", color: "white",
          fontWeight: 900, fontSize: 15, cursor: busy ? "default" : "pointer",
        }}>
          {busy ? "Posting…" : "Post Listing"}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

`npm run lint` and `npm run build`. `npm run dev`, exercise the form manually (Task 6 wires it in for real) — confirm chip toggles, the carpool-seats field's conditional visibility, and the character counter all work; confirm submitting with missing required fields shows the inline error instead of calling `createSkiBuddyPost`.

- [ ] **Step 3: Commit**

```bash
git add src/components/PostSkiBuddyForm.jsx
git commit -m "feat: add PostSkiBuddyForm.jsx"
```

---

## Task 6: Wire into `App.jsx`'s Snow tab sub-nav

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `SkiBuddyBoard` (Task 4).

**Exact wiring point:** `App.jsx`'s "dashboard" tab (the Snow tab) has a sub-tab switcher around line 1736-1763 — an array of `{ key, label }` objects rendered as buttons, currently `conditions` / `map` / `board`. Mountain Board's own render block is `{conditionsSubTab === "board" && <MountainBoard .../>}` right after the switcher (around line 1774-1776).

- [ ] **Step 1: Add the import**

Near the existing `import MountainBoard from "./components/MountainBoard"` (around line 16):

```js
import SkiBuddyBoard from "./components/SkiBuddyBoard"
```

- [ ] **Step 2: Add the sub-tab entry**

In the sub-tab switcher array (around line 1737-1740):

```js
{ key: "conditions", label: "🏔️ Snow" },
{ key: "map",        label: "🗺️ Map" },
{ key: "board",      label: "📋 Board" },
{ key: "buddy",      label: "🎿 Buddy" },
```

- [ ] **Step 3: Add the render block**

Right after the existing `{conditionsSubTab === "board" && ...}` block (around line 1776):

```jsx
{conditionsSubTab === "buddy" && (
  <SkiBuddyBoard />
)}
```

- [ ] **Step 4: Verify**

`npm run lint` and `npm run build`. `npm run dev`, log in, go to the Snow tab, click "🎿 Buddy" — confirm the board renders (empty state, since no posts exist yet), filters are clickable, and "Post a Listing" opens the form (or the verification modal, if the logged-in test account is Tier 0).

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire SkiBuddyBoard into App.jsx Snow tab sub-nav"
```

---

## Self-review notes

- **Spec coverage:** item 1 (migration) → Task 1; item 2 (RLS + RPCs) → Task 1; item 3 (moderation hook) → Task 2 + Task 3's `moderatePostDescription`; item 4 (new `socialApi.js` functions) → Task 3 (plus `getMySkiBuddyPosts`/`getSkiBuddyResponses`/`respondToSkiBuddyResponse`, added beyond the sprint file's literal list because the Definition of Done — "the original poster can accept the response" — requires them and the sprint file's API list was incomplete relative to its own acceptance criteria); item 5 (`SkiBuddyBoard.jsx`, `PostSkiBuddyForm.jsx`, response UI) → Tasks 4/5; item 6 (App.jsx wiring) → Task 6; item 7 (auto-expiry) → Task 1's RLS policy (`ski_date >= CURRENT_DATE`) + Task 3's `getSkiBuddyPosts()` query filter, both query-time, no cron. Testing checklist: Tier 0 routed to verification modal → Task 4's `requireTier1`; Tier 1 end-to-end post/filter/respond → Tasks 3-5; moderation-held post visible to author as "under review" → Task 1's RLS policy + Task 4's held-state banner; expired posts drop from default view but aren't deleted → Task 1's RLS policy (no `DELETE` anywhere in this plan); Arapahoe Basin in the resort dropdown → already true, `RESORT_NAMES` used directly in Tasks 4/5, no new resort list introduced (avoids the "fourth hardcoded list" tech debt the spec explicitly warns against).
- **Deviations from the sprint file, and why:** `updateSkiBuddyPostStatus`'s spec signature is unchanged, but response accept/decline is handled via a new `respondToSkiBuddyResponse` function (not in the sprint's literal API list) — the sprint file names the required end-user capability ("the original poster can accept the response") without naming the function for it; this plan closes that gap rather than shipping an incomplete Definition of Done. Response accept/decline authorization is a cross-table RLS policy, not a third RPC — declarative and consistent with how this codebase already handles simple ownership-gated updates elsewhere, and avoids inventing an RPC for a single-column status flip.
