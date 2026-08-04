# Sprint 29 — Mountain Board (Location-Gated Public Feed)

**Goal:** A public, per-resort message board where any logged-in user can *read* posts for any resort, but can only *post* to a resort's board if their device's current GPS position is within that resort's geofence. Supports free-text posts with a category tag (Safety / Lost & Found / Social / General) — covers the example posts: trail closures, lost items, "who wants to ride park," "teach me a 360."
**Estimated effort:** ~2 days
**Depends on:** None — fully self-contained, can start immediately.

**Not in `ROADMAP.md` yet** — this is a new feature request, not an existing task. Add a "SECTION 11 — Mountain Board" entry pointing at this file before starting, so it's tracked the same way as the other 28.

---

## Design notes (read before starting)

**Reads are open, writes are geofenced.** Anyone logged in can browse any resort's board (useful for checking "is anything closed" before you even leave the house). Only *posting* requires proof of proximity. This is a deliberate interpretation of "users have to be on the mountain to post" — posting is gated, reading isn't.

**All writes go through two `SECURITY DEFINER` RPCs (`create_board_post`, `report_board_post`) — no direct table `INSERT` policy exists on either table.** This isn't optional stylistic choice: if `mountain_board_posts` had a normal RLS `INSERT ... WITH CHECK` policy, the geofence check would have to live in the policy itself, and a client could still hit the raw REST insert endpoint. Routing all writes through an RPC means the distance check, content-length check, and report-threshold logic all live in one server-side place that can't be bypassed by calling a different endpoint. This mirrors the lesson already written into `migrations/019_lock_down_public_leaderboard_rpc.sql` — both new functions explicitly `REVOKE ... FROM PUBLIC` before granting to `authenticated`, so the default PUBLIC grant Postgres attaches to new functions can't leak them to the `anon` role.

**The Haversine formula is duplicated on purpose.** `src/lib/geoMath.js` already has `haversineDistanceMiles()` — this sprint adds a second copy as a Postgres function (`public.haversine_miles`). That's intentional, not an oversight: the server must independently recompute distance from the raw lat/lng it receives, never trust a client-sent "I'm in range" boolean or a client-computed distance. The client-side copy is only ever used for UX (see below), never for enforcement.

**New `resort_coordinates` table is a *third* copy of resort lat/lon in this codebase.** `App.jsx`'s `RESORTS` constant (line ~38) and `server/index.js` (line ~277) each already hardcode all 11–12 resorts' coordinates independently. This sprint adds a third, DB-side copy because it's the one that needs to be tamper-proof (client-editable state can't be trusted for a security check). Consolidating all three into one source of truth is a reasonable follow-up but is out of scope here — flagging it so it doesn't surprise you later if a resort's coordinates ever need to change in three places instead of one.

**Bug found while grounding this plan, fix it first (S29-T0):** `src/lib/resorts.js`'s `RESORT_NAMES`/`RESORT_EMOJI` maps are missing `arapahoebasin` — it exists in `server/index.js`'s resort list (used for weather) but not in the frontend display map. If this isn't fixed, Arapahoe Basin silently can't appear as a resort-picker option anywhere in this new board (or anywhere else that iterates `RESORT_NAMES`).

**GPS-gating is a soft deterrent, not a security boundary.** A determined user can spoof location (browser devtools override, mock-location apps). This is fine for the intended purpose — casual friction against someone posting "trail closed at X" from their couch three states away — but don't oversell it as fraud-proof anywhere in the UI copy.

**Moderation is minimal by design for v1:** 3 independent reports auto-hides a post (no human review queue, no admin unhide UI). That's a real gap for a board where people can post false safety claims — acceptable to ship with for a low-traffic MVP, but worth revisiting before this gets real distribution.

---

## Project Context

**`src/lib/geoMath.js`** already exports `haversineDistanceMiles(lat1, lng1, lat2, lng2)` — reused for the client-side "which resort chip should default to selected" hint (not for enforcement).

**`src/lib/useGpsTracker.js`** is a continuous `watchPosition`-based hook for active ski-session tracking (run/lift/rest segment classification) — **do not reuse it here.** This sprint's `useCurrentPosition.js` is a one-shot `getCurrentPosition()` hook; conceptually and functionally different from session tracking.

**`src/lib/resorts.js`** exports `RESORT_NAMES`, `RESORT_EMOJI`, `normalizeResortKey()` — the canonical resort-key → display-name/emoji lookups used across the app.

**`src/lib/socialApi.js`** convention: exported `async function` per operation, `supabase.from(...)` for simple reads, `supabase.rpc(...)` for anything with server-side business logic (see `getResortActivityCounts()` calling `get_resort_activity_counts`).

**Migration style** (from `migrations/013_activity_feed.sql`): idempotent `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, and `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE ...) THEN CREATE POLICY ... END IF; END $$;` guards so migrations are safe to re-run.

**`App.jsx`'s Snow tab** (`activeTab === "dashboard"`) already has a sub-tab switcher with `conditions` and `map` (~line 1672-1698), driven by `const [conditionsSubTab, setConditionsSubTab] = useState("conditions")`. This sprint adds a third `board` sub-tab there rather than consuming one of the 5 fixed bottom-nav slots (`BOTTOM_TABS` is a hardcoded 5-item array — Home/Snow/Plans/Social/Profile — adding a 6th top-level tab is a bigger redesign than this feature warrants).

**`topResort`** (`App.jsx` ~line 1336, `= rankedResorts[0]`) is today's top-scoring resort by Powder Score — each resort object carries its key as **`resortKey`** (confirmed from the `RESORTS` constant definition, ~line 45), not `resort_key`. Used as the board's default resort selection.

---

## Tasks

S29-T0 has no dependency, do it first. S29-T1 (migration) has no dependency. S29-T2 (hook) and S29-T3 (API functions) depend on S29-T1. S29-T4 (component) depends on S29-T2 + S29-T3. S29-T5 (wiring) depends on S29-T4.

---

### S29-T0 — Fix missing Arapahoe Basin in `resorts.js`

**File to modify:** `src/lib/resorts.js`

Add one entry to each of the three existing maps:
```js
// RESORT_NAMES
arapahoebasin: "Arapahoe Basin",

// RESORT_EMOJI
arapahoebasin: "🏕️",

// RESORT_PHOTOS
arapahoebasin: "/resorts/arapahoe-basin.jpg",
```
(`RESORT_ACCENTS` too, for consistency — pick any hex not already used, e.g. `"#a3e635"`.) If `/resorts/arapahoe-basin.jpg` doesn't exist in `public/`, either add a photo or point it at an existing placeholder — not this sprint's concern, just don't let a missing image break the resort card.

**Acceptance criteria:** `RESORT_NAMES`, `RESORT_EMOJI`, `RESORT_PHOTOS`, `RESORT_ACCENTS` all have an `arapahoebasin` key.

---

### S29-T1 — `migrations/020_mountain_board.sql`

**File to create:** `migrations/020_mountain_board.sql`

```sql
-- Migration 020: Mountain Board — location-gated public resort feed
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

-- Reference table: single source of truth for the geofence check specifically.
-- (App.jsx's RESORTS constant and server/index.js each already hardcode their
-- own copy of these coordinates for other purposes — see sprint design notes.)
CREATE TABLE IF NOT EXISTS resort_coordinates (
  resort_key            TEXT PRIMARY KEY,
  lat                    DOUBLE PRECISION NOT NULL,
  lon                    DOUBLE PRECISION NOT NULL,
  geofence_radius_miles  DOUBLE PRECISION NOT NULL DEFAULT 3.0
);

INSERT INTO resort_coordinates (resort_key, lat, lon) VALUES
  ('vail',            39.6403, -106.3742),
  ('beavercreek',     39.6042, -106.5165),
  ('breckenridge',    39.4817, -106.0384),
  ('keystone',        39.6084, -105.9437),
  ('crestedbutte',    38.8996, -106.9653),
  ('telluride',       37.9363, -107.8466),
  ('winterpark',      39.8863, -105.7626),
  ('coppermountain',  39.5022, -106.1512),
  ('arapahoebasin',   39.6423, -105.8717),
  ('steamboat',       40.4572, -106.8047),
  ('eldora',          39.9372, -105.5842),
  ('aspensnowmass',   39.2097, -106.9499)
ON CONFLICT (resort_key) DO NOTHING;

-- Mirrors src/lib/geoMath.js's haversineDistanceMiles — duplicated on purpose,
-- see design notes above.
CREATE OR REPLACE FUNCTION public.haversine_miles(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision
LANGUAGE sql IMMUTABLE AS $$
  SELECT 3958.8 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

CREATE TABLE IF NOT EXISTS mountain_board_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  resort_key    TEXT NOT NULL REFERENCES resort_coordinates(resort_key),
  category      TEXT NOT NULL CHECK (category IN ('safety','lost_found','social','general')),
  content       TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 280),
  post_lat      DOUBLE PRECISION NOT NULL,
  post_lng      DOUBLE PRECISION NOT NULL,
  report_count  INT NOT NULL DEFAULT 0,
  is_hidden     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours')
);

CREATE INDEX IF NOT EXISTS mountain_board_posts_resort_feed ON mountain_board_posts (resort_key, created_at DESC);
CREATE INDEX IF NOT EXISTS mountain_board_posts_expires ON mountain_board_posts (expires_at);

CREATE TABLE IF NOT EXISTS mountain_board_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      UUID REFERENCES mountain_board_posts(id) ON DELETE CASCADE NOT NULL,
  reporter_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, reporter_id)
);

ALTER TABLE resort_coordinates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mountain_board_posts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mountain_board_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='resort_coordinates' AND policyname='Authenticated can read resort coordinates') THEN
    CREATE POLICY "Authenticated can read resort coordinates" ON resort_coordinates FOR SELECT TO authenticated USING (true);
  END IF;

  -- Deliberately no INSERT policy on either table below — all writes go
  -- through the SECURITY DEFINER functions further down.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mountain_board_posts' AND policyname='Authenticated can read visible posts') THEN
    CREATE POLICY "Authenticated can read visible posts" ON mountain_board_posts FOR SELECT TO authenticated
      USING (NOT is_hidden AND expires_at > NOW());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mountain_board_reports' AND policyname='Authenticated can view own reports') THEN
    CREATE POLICY "Authenticated can view own reports" ON mountain_board_reports FOR SELECT TO authenticated
      USING (reporter_id = auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_board_post(
  p_resort_key TEXT, p_category TEXT, p_content TEXT, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION
)
RETURNS mountain_board_posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_resort   resort_coordinates%ROWTYPE;
  v_distance DOUBLE PRECISION;
  v_post     mountain_board_posts;
BEGIN
  SELECT * INTO v_resort FROM resort_coordinates WHERE resort_key = p_resort_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_RESORT';
  END IF;

  v_distance := public.haversine_miles(p_lat, p_lng, v_resort.lat, v_resort.lon);
  IF v_distance > v_resort.geofence_radius_miles THEN
    RAISE EXCEPTION 'TOO_FAR:%', round(v_distance::numeric, 1);
  END IF;

  INSERT INTO mountain_board_posts (author_id, resort_key, category, content, post_lat, post_lng)
  VALUES (auth.uid(), p_resort_key, p_category, trim(p_content), p_lat, p_lng)
  RETURNING * INTO v_post;

  RETURN v_post;
END;
$$;

REVOKE ALL ON FUNCTION public.create_board_post(TEXT,TEXT,TEXT,DOUBLE PRECISION,DOUBLE PRECISION) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_board_post(TEXT,TEXT,TEXT,DOUBLE PRECISION,DOUBLE PRECISION) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_board_post(p_post_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO mountain_board_reports (post_id, reporter_id)
  VALUES (p_post_id, auth.uid())
  ON CONFLICT (post_id, reporter_id) DO NOTHING;

  SELECT count(*) INTO v_count FROM mountain_board_reports WHERE post_id = p_post_id;

  UPDATE mountain_board_posts
  SET report_count = v_count, is_hidden = (v_count >= 3)
  WHERE id = p_post_id;
END;
$$;

REVOKE ALL ON FUNCTION public.report_board_post(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_board_post(UUID) TO authenticated;
```

**Acceptance criteria:**
- Running this in the Supabase SQL Editor succeeds with no errors, twice in a row (idempotency check).
- `SELECT * FROM resort_coordinates` returns 12 rows.
- Calling `create_board_post` via `select public.create_board_post('vail', 'general', 'test', 39.64, -106.37)` (i.e. right at Vail's coordinates) succeeds and returns a row.
- Calling it again with `lat`/`lng` far away (e.g. `40.0, -105.0`, which is >3mi from Vail) raises an exception starting with `TOO_FAR:`.
- `SELECT has_function_privilege('anon', 'public.create_board_post(text,text,text,double precision,double precision)', 'execute')` returns `false`.

---

### S29-T2 — `src/lib/useCurrentPosition.js`

**File to create:** `src/lib/useCurrentPosition.js`

```js
import { useCallback, useState } from "react"

const POSITION_OPTIONS = { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }

/**
 * One-shot geolocation capture for "confirm I'm here right now" moments
 * (e.g. posting to the Mountain Board). Distinct from useGpsTracker, which
 * is a continuous watchPosition-based session tracker — do not conflate
 * the two.
 */
export function useCurrentPosition() {
  const [status, setStatus] = useState("idle") // idle | requesting | success | error
  const [position, setPosition] = useState(null) // { lat, lng, accuracy }
  const [error, setError] = useState(null)

  const requestPosition = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const err = new Error("Geolocation is not supported on this device")
        setStatus("error"); setError(err); reject(err)
        return
      }
      setStatus("requesting")
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }
          setPosition(coords); setStatus("success"); setError(null)
          resolve(coords)
        },
        (err) => {
          setStatus("error"); setError(err)
          reject(err)
        },
        POSITION_OPTIONS
      )
    })
  }, [])

  return { status, position, error, requestPosition }
}
```

**Acceptance criteria:** `requestPosition()` resolves `{ lat, lng, accuracy }` on success, rejects with the browser's `GeolocationPositionError` (or a plain `Error` if unsupported) on failure, and never throws synchronously.

---

### S29-T3 — Board API functions

**File to modify:** `src/lib/socialApi.js`

```js
export async function getResortCoordinates() {
  const { data, error } = await supabase.from("resort_coordinates").select("*")
  if (error) throw error
  return data || []
}

export async function getBoardPosts(resortKey, limit = 50) {
  const { data, error } = await supabase
    .from("mountain_board_posts")
    .select("*, profiles:author_id(id, full_name, username, avatar_url)")
    .eq("resort_key", resortKey)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function createBoardPost({ resortKey, category, content, lat, lng }) {
  const { data, error } = await supabase.rpc("create_board_post", {
    p_resort_key: resortKey, p_category: category, p_content: content, p_lat: lat, p_lng: lng,
  })
  if (error) throw error
  return data
}

export async function reportBoardPost(postId) {
  const { error } = await supabase.rpc("report_board_post", { p_post_id: postId })
  if (error) throw error
}
```

Note for S29-T4: a Postgres `RAISE EXCEPTION 'TOO_FAR:%'` surfaces through `supabase-js` as `error.message` containing that string (exact prefix/format may vary slightly by client version — verify in a real browser call before relying on `startsWith`).

**Acceptance criteria:** all 4 functions follow the existing file's `throw`-on-error, `return data || []` convention exactly as the neighboring functions do.

---

### S29-T4 — `src/components/MountainBoard.jsx`

**File to create:** `src/components/MountainBoard.jsx`

```jsx
import { useEffect, useMemo, useState } from "react"
import {
  getBoardPosts,
  createBoardPost,
  reportBoardPost,
} from "../lib/socialApi"
import { useCurrentPosition } from "../lib/useCurrentPosition"
import { RESORT_NAMES, RESORT_EMOJI } from "../lib/resorts"
import { timeAgo } from "../lib/format"

const CATEGORIES = [
  { key: "safety",     label: "Safety",       emoji: "🚨" },
  { key: "lost_found", label: "Lost & Found", emoji: "🔍" },
  { key: "social",     label: "Social",       emoji: "🤙" },
  { key: "general",    label: "General",      emoji: "💬" },
]

export default function MountainBoard({ defaultResortKey }) {
  const [resortKey, setResortKey] = useState(defaultResortKey || "vail")
  const [posts, setPosts] = useState([])
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [composerOpen, setComposerOpen] = useState(false)
  const [category, setCategory] = useState("general")
  const [content, setContent] = useState("")
  const [postError, setPostError] = useState(null)
  const [posting, setPosting] = useState(false)

  const { requestPosition } = useCurrentPosition()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getBoardPosts(resortKey)
      .then((rows) => { if (!cancelled) setPosts(rows) })
      .catch(() => { if (!cancelled) setPosts([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [resortKey])

  const visiblePosts = useMemo(
    () => (categoryFilter === "all" ? posts : posts.filter((p) => p.category === categoryFilter)),
    [posts, categoryFilter]
  )

  async function handleSubmitPost() {
    if (!content.trim()) return
    setPosting(true)
    setPostError(null)
    try {
      const coords = await requestPosition()
      const newPost = await createBoardPost({
        resortKey, category, content: content.trim(), lat: coords.lat, lng: coords.lng,
      })
      setPosts((prev) => [newPost, ...prev])
      setContent("")
      setComposerOpen(false)
    } catch (err) {
      if (err?.code === 1 || /denied/i.test(err?.message || "")) {
        setPostError("Location access is needed to post — check your browser/device location permission.")
      } else if (err?.message?.includes("TOO_FAR")) {
        const miles = err.message.split(":").pop()
        setPostError(`You're about ${miles} miles from ${RESORT_NAMES[resortKey] || resortKey} — you need to be on the mountain to post here.`)
      } else {
        setPostError("Couldn't post right now. Try again in a bit.")
      }
    } finally {
      setPosting(false)
    }
  }

  async function handleReport(postId) {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, _reported: true } : p)))
    try {
      await reportBoardPost(postId)
    } catch {
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, _reported: false } : p)))
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
        {Object.keys(RESORT_NAMES).map((key) => (
          <button
            key={key}
            onClick={() => setResortKey(key)}
            style={{
              flexShrink: 0, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800,
              border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer",
              background: resortKey === key ? "linear-gradient(135deg,#0284c7,#38bdf8)" : "rgba(255,255,255,0.06)",
              color: "white",
            }}
          >
            {RESORT_EMOJI[key]} {RESORT_NAMES[key]}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        {["all", ...CATEGORIES.map((c) => c.key)].map((key) => {
          const cat = CATEGORIES.find((c) => c.key === key)
          return (
            <button
              key={key}
              onClick={() => setCategoryFilter(key)}
              style={{
                padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer",
                background: categoryFilter === key ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.04)",
                color: "white",
              }}
            >
              {key === "all" ? "All" : `${cat.emoji} ${cat.label}`}
            </button>
          )
        })}
      </div>

      {!composerOpen ? (
        <button
          onClick={() => setComposerOpen(true)}
          style={{ padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(56,189,248,0.4)", background: "rgba(56,189,248,0.1)", color: "#38bdf8", fontWeight: 800, cursor: "pointer" }}
        >
          📍 Post to {RESORT_NAMES[resortKey] || resortKey}
        </button>
      ) : (
        <div style={{ display: "grid", gap: 8, padding: 14, borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                style={{
                  padding: "5px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: category === c.key ? "rgba(56,189,248,0.3)" : "rgba(255,255,255,0.05)",
                  color: "white",
                }}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, 280))}
            placeholder="What's happening on the mountain?"
            rows={3}
            style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 10, color: "white", fontSize: 13, resize: "none" }}
          />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right" }}>{content.length}/280</div>
          {postError && <div style={{ fontSize: 12, color: "#f87171" }}>{postError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setComposerOpen(false); setPostError(null) }} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>
              Cancel
            </button>
            <button
              onClick={handleSubmitPost}
              disabled={posting || !content.trim()}
              style={{ flex: 2, padding: "10px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#0284c7,#38bdf8)", color: "white", fontWeight: 800, cursor: posting ? "wait" : "pointer", opacity: posting || !content.trim() ? 0.6 : 1 }}
            >
              {posting ? "Checking location…" : "Post"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 20, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Loading…</div>
      ) : !visiblePosts.length ? (
        <div style={{ padding: 20, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
          No posts yet at {RESORT_NAMES[resortKey] || resortKey}. Be the first.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {visiblePosts.map((post) => {
            const cat = CATEGORIES.find((c) => c.key === post.category)
            const author = post.profiles?.full_name || post.profiles?.username || "Someone"
            return (
              <div key={post.id} style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8" }}>{cat?.emoji} {cat?.label || post.category}</span>
                  <button onClick={() => handleReport(post.id)} disabled={post._reported} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 11, cursor: "pointer" }}>
                    {post._reported ? "Reported" : "🚩 Report"}
                  </button>
                </div>
                <div style={{ fontSize: 14, color: "white", marginBottom: 6 }}>{post.content}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{author} · {timeAgo(post.created_at)}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

**Acceptance criteria:**
- Resort chips switch the visible feed; category chips filter client-side.
- Tapping "Post" requests location fresh (not cached from an earlier session) and shows a distinct, human-readable error for permission-denied vs. too-far-from-resort vs. generic failure.
- A successful post appears at the top of the feed immediately (no refetch needed).
- Reporting is optimistic with rollback on failure, matching `ActivityFeed.jsx`'s reaction pattern.
- No avatar photos in v1 — text author name only, to keep this component's scope tight. (Straightforward to add later by swapping in the existing `ui/Avatar` component if you want it.)

---

### S29-T5 — Wire into the Snow tab

**File to modify:** `src/App.jsx`

**Step 1 — Import** near the other component imports: `import MountainBoard from "./components/MountainBoard"`

**Step 2 — Add the third sub-tab entry** to the switcher array (~line 1676):
```jsx
{ key: "conditions", label: "🏔️ Snow" },
{ key: "map",        label: "🗺️ Map" },
{ key: "board",      label: "📋 Board" },
```

**Step 3 — Add the render block**, alongside the existing `conditionsSubTab === "map"` / `=== "conditions"` blocks (~line 1701):
```jsx
{conditionsSubTab === "board" && (
  <MountainBoard defaultResortKey={topResort?.resortKey || "vail"} />
)}
```

**Acceptance criteria:**
- A third "📋 Board" sub-tab appears in the Snow tab next to Snow/Map.
- It defaults to today's top-scoring resort and lets the user switch resorts freely.

**Verify in browser:**
```bash
npm run dev
```
Open the Snow tab → Board. Try posting while genuinely at/near a resort (or by overriding location in Chrome DevTools → Sensors → Location, set to one of the 12 lat/lon pairs above, to test without driving anywhere) — confirm success. Then override location somewhere clearly >3mi from a resort and confirm the `TOO_FAR` error message shows a plausible distance. Post as two different test accounts, confirm both see each other's posts. Report a post 3 times (3 different accounts) and confirm it disappears from the feed for a 4th account.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add migrations/020_mountain_board.sql src/lib/resorts.js src/lib/useCurrentPosition.js src/lib/socialApi.js src/components/MountainBoard.jsx src/App.jsx
git commit -m "feat: add location-gated Mountain Board public feed"
```

---

## Sprint Acceptance Criteria

- [ ] `resorts.js` includes Arapahoe Basin in all display maps
- [ ] `migrations/020_mountain_board.sql` run successfully in Supabase, `create_board_post` confirmed unreachable by the `anon` role
- [ ] Posting succeeds within a resort's geofence and fails with a clear, distance-aware message outside it
- [ ] Reads are open to any authenticated user for any resort, regardless of the reader's own location
- [ ] 3 reports auto-hides a post
- [ ] Posts stop appearing in reads after 48 hours (`expires_at` filter)
- [ ] "📋 Board" sub-tab live in the Snow tab
- [ ] `npm run build` succeeds
- [ ] Verified end-to-end with 2+ test accounts, including the DevTools location-override method above

## Out of Scope for This Sprint

- Consolidating the now-3-way resort coordinate duplication (`App.jsx`, `server/index.js`, `resort_coordinates`) into one source of truth.
- Admin moderation UI (manually unhide a post, view report reasons, ban a repeat offender).
- Push notifications when a new post lands at a resort you're checked into.
- "Looks like you're actually closer to resort X" nudge if the detected position doesn't match the selected resort chip — nice next step, not required for v1.
- Hard-deleting expired rows from the database (they're just filtered out of reads; a periodic cleanup could hook into the existing `server/cron.js` later if table size ever becomes a concern).
