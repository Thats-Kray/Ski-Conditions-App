# Mountain Page Architecture & Krames Butte Dev Resort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app owner a private, fake "resort" (Krames Butte) to test the Mountain Board without traveling, and build the reusable per-resort "Mountain Page" (cover header + tab bar of widgets) that Krames Butte will be the permanent staging ground for.

**Architecture:** A Postgres-side owner-only bypass on the existing `create_board_post`/RLS layer (migration 021) makes Krames Butte postable/readable by exactly one account. A new `MountainPage.jsx` component renders a cover header plus a tab bar generated from a plain-array widget registry (`src/lib/mountainPageWidgets.js`); the already-shipped `MountainBoard.jsx` becomes the first registered widget via a new `resortKey` locking prop. `App.jsx` gains one new piece of navigation state (`mountainPageResortKey`) that swaps the whole tab-content area for `MountainPage` when set.

**Tech Stack:** React 19 (no router — state-based tab switching), Supabase (Postgres + RLS + `SECURITY DEFINER` RPCs), Vite. No test runner exists in this repo — verification is `npm run build` (catches syntax/reference errors) plus explicit manual browser checks, matching how every prior sprint in this codebase (1–29) was verified.

## Global Constraints

- Owner email, hardcoded everywhere it's checked: `raykyle1104@gmail.com`.
- Dev resort key, hardcoded everywhere it's checked: `kramesbutte` (display name "Krames Butte", emoji `🧪`).
- Krames Butte must never appear in `src/lib/resorts.js` (`RESORT_NAMES`/`RESORT_EMOJI`/`RESORT_PHOTOS`/`RESORT_ACCENTS`) or `App.jsx`'s `RESORTS` constant — that exclusion is what structurally keeps it out of the leaderboard, the ski-day resort picker, and the powder-conditions/vibe-score displays.
- Rollout mechanism is a code-level config value (`rolloutResorts: ['kramesbutte'] | 'all'`) in `src/lib/mountainPageWidgets.js` — no database-driven feature flags.
- Every widget component is rendered with the same two props: `resortKey` (string) and `currentUserEmail` (string or `undefined`). Widgets must not require anything else from `MountainPage`.
- No test runner is configured in this repo (`package.json` has no `test` script). Do not add one as part of this plan — verification is `npm run build` + manual browser checks, per existing project convention.

---

## Task 1: Migration 021 — Krames Butte access control

**Files:**
- Create: `migrations/021_krames_butte_dev_resort.sql`

**Interfaces:**
- Consumes: `resort_coordinates`, `mountain_board_posts`, `create_board_post` from `migrations/020_mountain_board.sql` (already live).
- Produces: a `kramesbutte` row in `resort_coordinates`; `create_board_post('kramesbutte', ...)` succeeds only for the owner and skips the geofence check; reads of `kramesbutte` rows in `resort_coordinates`/`mountain_board_posts` are restricted to the owner.

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 021: Krames Butte — private dev-testing resort for Mountain Board
-- Owner-only fake resort that bypasses the geofence check in create_board_post.
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

INSERT INTO resort_coordinates (resort_key, lat, lon) VALUES
  ('kramesbutte', 39.5, -105.5)
ON CONFLICT (resort_key) DO NOTHING;

-- Replaces migration 020's blanket "Authenticated can read resort
-- coordinates" policy with one that adds a kramesbutte-only exception.
-- DROP + CREATE (not the guarded IF-NOT-EXISTS pattern from 020) is
-- deliberate: this is a redefinition of an existing policy, not a
-- first-time creation, and the guarded pattern would silently skip
-- redefinition, leaving the old (unrestricted) policy in place.
DROP POLICY IF EXISTS "Authenticated can read resort coordinates" ON resort_coordinates;
CREATE POLICY "Authenticated can read resort coordinates" ON resort_coordinates FOR SELECT TO authenticated
  USING (
    resort_key <> 'kramesbutte'
    OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND u.email = 'raykyle1104@gmail.com')
  );

-- Same exception on mountain_board_posts reads: kramesbutte posts are only
-- visible to the owner; every other resort's posts are unaffected (the
-- `resort_key <> 'kramesbutte'` clause short-circuits true for them).
DROP POLICY IF EXISTS "Authenticated can read visible posts" ON mountain_board_posts;
CREATE POLICY "Authenticated can read visible posts" ON mountain_board_posts FOR SELECT TO authenticated
  USING (
    NOT is_hidden AND expires_at > NOW()
    AND (
      resort_key <> 'kramesbutte'
      OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND u.email = 'raykyle1104@gmail.com')
    )
  );

-- create_board_post: add an owner-only, geofence-bypassing branch for
-- kramesbutte specifically, as an explicit early return. Every other
-- resort_key falls through to the unchanged distance check below —
-- this is NOT implemented as a large geofence_radius_miles value, so
-- there's no number here that could be mistaken for a real, satisfiable
-- distance requirement.
CREATE OR REPLACE FUNCTION public.create_board_post(
  p_resort_key TEXT, p_category TEXT, p_content TEXT, p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION
)
RETURNS mountain_board_posts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_resort   resort_coordinates%ROWTYPE;
  v_distance DOUBLE PRECISION;
  v_post     mountain_board_posts;
  v_is_owner BOOLEAN;
BEGIN
  IF p_resort_key = 'kramesbutte' THEN
    SELECT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND u.email = 'raykyle1104@gmail.com')
      INTO v_is_owner;
    IF NOT v_is_owner THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    INSERT INTO mountain_board_posts (author_id, resort_key, category, content, post_lat, post_lng)
    VALUES (auth.uid(), p_resort_key, p_category, trim(p_content), p_lat, p_lng)
    RETURNING * INTO v_post;

    RETURN v_post;
  END IF;

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
```

- [ ] **Step 2: Apply the migration to the live Supabase project**

Use the `apply_migration` Supabase MCP tool (project ID `hkzaohqrycwfgmcogwdo`, matching how migrations 010–020 were applied), with `name: "krames_butte_dev_resort"` and the SQL above as `query`. Confirm the tool call returns `{"success": true}`.

- [ ] **Step 3: Verify in the Supabase SQL editor (or via the `execute_sql` MCP tool), logged in as the owner account's session is not directly testable from SQL editor — instead verify via `service_role` context with explicit checks:**

```sql
-- Row exists
select * from resort_coordinates where resort_key = 'kramesbutte';
-- expect 1 row, lat 39.5, lon -105.5

-- Function still rejects unknown resorts (unchanged behavior)
select has_function_privilege('anon', 'public.create_board_post(text,text,text,double precision,double precision)', 'execute');
-- expect false
```

Full owner-vs-non-owner behavior (posting, reading) is verified end-to-end in the browser at the end of Task 4, once the UI exists to drive it — this step only confirms the migration applied cleanly and the anon lockout is intact.

- [ ] **Step 4: Commit**

```bash
git add migrations/021_krames_butte_dev_resort.sql
git commit -m "feat: add Krames Butte owner-only dev resort with geofence bypass"
```

---

## Task 2: `MountainBoard.jsx` — Krames Butte chip + resort-locking prop

**Files:**
- Modify: `src/components/MountainBoard.jsx` (full-file rewrite; the file is 198 lines, small enough to replace wholesale)

**Interfaces:**
- Consumes: `getBoardPosts`, `createBoardPost`, `reportBoardPost` from `src/lib/socialApi.js` (unchanged); `useCurrentPosition` from `src/lib/useCurrentPosition.js` (unchanged); `RESORT_NAMES`, `RESORT_EMOJI` from `src/lib/resorts.js` (unchanged); `timeAgo` from `src/lib/format.js` (unchanged).
- Produces: `MountainBoard` now accepts two new optional props — `currentUserEmail` (string) and `resortKey` (string; when present, the component is "locked" to that resort). This is the shape every future widget in the registry (Task 3) must also accept: `{ resortKey, currentUserEmail }`.

- [ ] **Step 1: Replace the full file**

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

const OWNER_EMAIL = "raykyle1104@gmail.com"
const KRAMES_BUTTE_KEY = "kramesbutte"

function displayName(key) {
  return key === KRAMES_BUTTE_KEY ? "Krames Butte" : (RESORT_NAMES[key] || key)
}

// `resortKey` prop, when present, "locks" the board to that resort — no
// resort-switcher chips are shown and the value can't change. This is how
// MountainPage (see src/lib/mountainPageWidgets.js) embeds this component
// as a per-resort widget. When absent (the standalone "📋 Board" tab in
// App.jsx), behavior is unchanged: a free-standing multi-resort switcher
// defaulting to `defaultResortKey`.
export default function MountainBoard({ defaultResortKey, currentUserEmail, resortKey: lockedResortKey }) {
  const [selectedResortKey, setSelectedResortKey] = useState(defaultResortKey || "vail")
  const resortKey = lockedResortKey || selectedResortKey
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
        setPostError(`You're about ${miles} miles from ${displayName(resortKey)} — you need to be on the mountain to post here.`)
      } else if (err?.message?.includes("NOT_AUTHORIZED")) {
        setPostError("This board is private.")
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
      {!lockedResortKey && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {Object.keys(RESORT_NAMES).map((key) => (
            <button
              key={key}
              onClick={() => setSelectedResortKey(key)}
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
          {currentUserEmail === OWNER_EMAIL && (
            <button
              key={KRAMES_BUTTE_KEY}
              onClick={() => setSelectedResortKey(KRAMES_BUTTE_KEY)}
              style={{
                flexShrink: 0, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800,
                border: "1px dashed rgba(163,230,53,0.5)", cursor: "pointer",
                background: resortKey === KRAMES_BUTTE_KEY ? "linear-gradient(135deg,#65a30d,#a3e635)" : "rgba(163,230,53,0.08)",
                color: "white",
              }}
            >
              🧪 Krames Butte (Dev)
            </button>
          )}
        </div>
      )}

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
          📍 Post to {displayName(resortKey)}
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
          No posts yet at {displayName(resortKey)}. Be the first.
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

- [ ] **Step 2: Run the build to catch syntax/reference errors**

```bash
npm run build
```
Expected: succeeds with no new errors.

- [ ] **Step 3: Manual verification in the browser (standalone tab only — locked mode is verified in Task 4)**

```bash
npm run dev
```
Log in as the owner account, go to Snow → Board. Confirm the "🧪 Krames Butte (Dev)" chip appears after the 12 real resort chips. Click it, confirm the composer button reads "📍 Post to Krames Butte" and (with location permission granted) posting succeeds regardless of real GPS position. Log in as a second account, confirm the chip does not render.

- [ ] **Step 4: Commit**

```bash
git add src/components/MountainBoard.jsx
git commit -m "feat: add Krames Butte chip and resort-locking prop to MountainBoard"
```

---

## Task 3: Widget registry + `MountainPage.jsx`

**Files:**
- Create: `src/lib/mountainPageWidgets.js`
- Create: `src/components/MountainPage.jsx`

**Interfaces:**
- Consumes: `MountainBoard` (default export) from `src/components/MountainBoard.jsx`, with its `{ resortKey, currentUserEmail }` contract from Task 2. `RESORT_EMOJI` from `src/lib/resorts.js`. `Badge`, `TIER_COLORS` (named exports) from `src/components/ui/Badge.jsx`. `ScoreRing` (default export) from `src/components/ui/ScoreRing.jsx`.
- Produces: `MOUNTAIN_PAGE_WIDGETS` (array of `{ key, label, rolloutResorts, Component }`) from `mountainPageWidgets.js`. `MountainPage` (default export) from `MountainPage.jsx`, accepting props `{ resortKey, resort, currentUserEmail, onBack }` where `resort` is either a real entry from `App.jsx`'s `rows` (has `.name`, `.photoPath`, `.isOpen`, `.powderScore`, `.powderTier`) or the synthetic Krames Butte object `{ resortKey: "kramesbutte", name: "Krames Butte", emoji: "🧪", isOpen: null, powderScore: null }` that Task 4 constructs.

- [ ] **Step 1: Write the widget registry**

```js
import MountainBoard from "../components/MountainBoard"

// Each widget's rolloutResorts is either 'all' (live everywhere) or an
// array of resortKeys (still in development — visible only on those
// resorts' Mountain Pages). Promoting a widget to every resort is a
// one-line change: flip its rolloutResorts to 'all', commit, deploy.
//
// MountainPage renders every widget's Component with exactly two props:
// { resortKey, currentUserEmail }. A widget must not require anything else.
export const MOUNTAIN_PAGE_WIDGETS = [
  { key: "board", label: "📋 Board", rolloutResorts: "all", Component: MountainBoard },
]
```

- [ ] **Step 2: Write `MountainPage.jsx`**

```jsx
import { useEffect, useState } from "react"
import { MOUNTAIN_PAGE_WIDGETS } from "../lib/mountainPageWidgets"
import { RESORT_EMOJI } from "../lib/resorts"
import Badge, { TIER_COLORS } from "./ui/Badge"
import ScoreRing from "./ui/ScoreRing"

const OWNER_EMAIL = "raykyle1104@gmail.com"
const KRAMES_BUTTE_KEY = "kramesbutte"

// Krames Butte, viewed by its owner, always sees every registered widget
// regardless of rollout state — that's what makes it "the staging ground
// for everything in progress." Every other resort (and every other
// viewer) only sees widgets that have actually been promoted.
function visibleWidgets(resortKey, currentUserEmail) {
  const isOwnerOnKramesButte = resortKey === KRAMES_BUTTE_KEY && currentUserEmail === OWNER_EMAIL
  if (isOwnerOnKramesButte) return MOUNTAIN_PAGE_WIDGETS
  return MOUNTAIN_PAGE_WIDGETS.filter(
    (w) => w.rolloutResorts === "all" || (Array.isArray(w.rolloutResorts) && w.rolloutResorts.includes(resortKey))
  )
}

export default function MountainPage({ resortKey, resort, currentUserEmail, onBack }) {
  const widgets = visibleWidgets(resortKey, currentUserEmail)
  const [activeWidgetKey, setActiveWidgetKey] = useState(widgets[0]?.key)

  useEffect(() => {
    setActiveWidgetKey(widgets[0]?.key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resortKey])

  const emoji = resort?.emoji || RESORT_EMOJI[resortKey] || "⛷️"
  const name = resort?.name || resortKey
  const activeWidget = widgets.find((w) => w.key === activeWidgetKey) || widgets[0]

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <button
        onClick={onBack}
        style={{ justifySelf: "start", background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}
      >
        ← Back
      </button>

      <div
        style={{
          position: "relative",
          borderRadius: 24,
          overflow: "hidden",
          padding: 20,
          background: resort?.photoPath
            ? `linear-gradient(to top, rgba(4,8,15,0.88), rgba(2,6,23,0.3)), url(${resort.photoPath}) center/cover`
            : "linear-gradient(135deg, #1e293b, #334155)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              {resortKey === KRAMES_BUTTE_KEY && (
                <span style={{ fontSize: 11, fontWeight: 900, color: "#a3e635", border: "1px dashed rgba(163,230,53,0.5)", borderRadius: 999, padding: "3px 8px" }}>
                  🧪 DEV
                </span>
              )}
              {resort?.isOpen === true && (
                <span style={{ fontSize: 11, fontWeight: 900, color: "#4ade80", border: "1px solid rgba(34,197,94,0.5)", borderRadius: 999, padding: "3px 8px" }}>
                  Open
                </span>
              )}
              {resort?.isOpen === false && (
                <span style={{ fontSize: 11, fontWeight: 900, color: "#f87171", border: "1px solid rgba(239,68,68,0.5)", borderRadius: 999, padding: "3px 8px" }}>
                  Closed for Season
                </span>
              )}
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "white" }}>{emoji} {name}</h1>
          </div>
          {resort?.powderScore != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <ScoreRing score={resort.powderScore} tier={resort.powderTier ?? "Closed"} size={64} strokeWidth={6} />
              <Badge label={resort.powderTier || "—"} color={TIER_COLORS[resort.powderTier] ?? TIER_COLORS.Closed} />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {widgets.map((w) => (
          <button
            key={w.key}
            onClick={() => setActiveWidgetKey(w.key)}
            style={{
              flexShrink: 0, padding: "10px 16px", borderRadius: "12px 12px 0 0", fontSize: 13, fontWeight: 800,
              border: "none", borderBottom: activeWidgetKey === w.key ? "2px solid #38bdf8" : "2px solid transparent",
              cursor: "pointer",
              background: activeWidgetKey === w.key ? "rgba(56,189,248,0.1)" : "transparent",
              color: activeWidgetKey === w.key ? "#38bdf8" : "rgba(255,255,255,0.6)",
            }}
          >
            {w.label}
          </button>
        ))}
      </div>

      {activeWidget && <activeWidget.Component resortKey={resortKey} currentUserEmail={currentUserEmail} />}
    </div>
  )
}
```

- [ ] **Step 3: Run the build**

```bash
npm run build
```
Expected: succeeds. (`MountainPage.jsx` isn't imported/mounted anywhere yet, so this only confirms it's syntactically and referentially valid — full rendering is verified in Task 4.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/mountainPageWidgets.js src/components/MountainPage.jsx
git commit -m "feat: add Mountain Page component and widget registry"
```

---

## Task 4: Wire it into `App.jsx`

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `MountainPage` (default export, Task 3) with props `{ resortKey, resort, currentUserEmail, onBack }`. `MountainBoard` (default export, Task 2) with its existing `{ defaultResortKey, currentUserEmail }` standalone-tab usage, now also passing `currentUserEmail`.
- Produces: user-visible navigation — tapping any `ResortCard`'s new button opens that resort's Mountain Page; an owner-only banner opens Krames Butte's page; tapping any nav tab while a Mountain Page is open returns to normal browsing.

- [ ] **Step 1: Add the owner/Krames-Butte constants and the `MountainPage` import**

Find this line near the top of the file:
```js
import MountainBoard from "./components/MountainBoard"
```
Add directly after it:
```js
import MountainPage from "./components/MountainPage"
```

Find the closing of the `RESORTS` array:
```js
]
```
(the one immediately preceded by the `aspensnowmass` entry, i.e. the very end of the `const RESORTS = [...]` block — it's the only top-level `]` before any function declarations). Add directly after it:
```js

const OWNER_EMAIL = "raykyle1104@gmail.com"
const KRAMES_BUTTE_KEY = "kramesbutte"
const KRAMES_BUTTE_RESORT = { resortKey: KRAMES_BUTTE_KEY, name: "Krames Butte", emoji: "🧪", isOpen: null, powderScore: null }
```

- [ ] **Step 2: Add the `onOpenMountainPage` prop to `ResortCard` and a button in its body**

Find:
```jsx
function ResortCard({ r, skierCounts, skierDetails, activityCount = 0, friendsGoing, vibeData }) {
```
Replace with:
```jsx
function ResortCard({ r, skierCounts, skierDetails, activityCount = 0, friendsGoing, vibeData, onOpenMountainPage }) {
```

Find the Directions link block:
```jsx
        {/* Directions */}
        <a
          href={mapsUrl(r.directionsQuery)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "grid", placeItems: "center", textDecoration: "none", color: "#052e2b", fontWeight: 900, padding: "11px 14px", borderRadius: 14, background: "linear-gradient(135deg, #34d399, #22c55e)", fontSize: 13 }}
        >
          📍 Directions
        </a>
      </div>
    </div>
  )
}
```
Replace with:
```jsx
        {/* Mountain Page */}
        <button
          onClick={() => onOpenMountainPage(r.resortKey)}
          style={{ display: "grid", placeItems: "center", border: "1px solid rgba(56,189,248,0.3)", color: "#38bdf8", fontWeight: 800, padding: "11px 14px", borderRadius: 14, background: "rgba(56,189,248,0.08)", fontSize: 13, cursor: "pointer" }}
        >
          🏔️ Mountain Page →
        </button>

        {/* Directions */}
        <a
          href={mapsUrl(r.directionsQuery)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "grid", placeItems: "center", textDecoration: "none", color: "#052e2b", fontWeight: 900, padding: "11px 14px", borderRadius: 14, background: "linear-gradient(135deg, #34d399, #22c55e)", fontSize: 13 }}
        >
          📍 Directions
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add the `mountainPageResortKey` state**

Find:
```js
  const [conditionsSubTab, setConditionsSubTab] = useState("conditions")
```
Replace with:
```js
  const [conditionsSubTab, setConditionsSubTab] = useState("conditions")
  const [mountainPageResortKey, setMountainPageResortKey] = useState(null)
```

- [ ] **Step 4: Compute the resort object to hand to `MountainPage`, right after `rows` is defined**

Find (this is the end of the `rows` `useMemo` — locate the specific `}, [...])` that closes it; it's the block starting `const rows = useMemo(() => {` a few lines below `visibleResorts`):
```js
  const rows = useMemo(() => {
```
After the full `rows` useMemo block ends (look for its closing `}, [...])`), add:
```js

  const mountainPageResort = mountainPageResortKey === KRAMES_BUTTE_KEY
    ? KRAMES_BUTTE_RESORT
    : rows.find((r) => r.resortKey === mountainPageResortKey) || null
```

- [ ] **Step 5: Make nav taps clear the Mountain Page**

Find:
```jsx
      <TopNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        currentProfile={currentProfile}
        notifCount={notifCount}
      />
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        currentProfile={currentProfile}
        notifCount={notifCount}
      />
```
Replace with:
```jsx
      <TopNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        currentProfile={currentProfile}
        notifCount={notifCount}
      />
      <BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        currentProfile={currentProfile}
        notifCount={notifCount}
      />
```
That JSX references a `handleTabChange` function that doesn't exist yet. Define it in the component body, directly after the `mountainPageResort` const added in Step 4:
```js
  const handleTabChange = (tab) => {
    setMountainPageResortKey(null)
    setActiveTab(tab)
  }
```
(This runs before the `return (...)` that contains the `<TopNav>`/`<BottomNav>` JSX from this step, so the ordering is correct.)

- [ ] **Step 6: Swap the whole tab-content area for `MountainPage` when it's open**

Find:
```jsx
      <div className="mobile-scroll-pad" style={{ maxWidth: 1320, margin: "0 auto", padding: isMobile ? "16px 14px 20px" : "30px 20px 48px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: activeTab === "dashboard" ? 20 : 16 }}>
```
Replace with:
```jsx
      <div className="mobile-scroll-pad" style={{ maxWidth: 1320, margin: "0 auto", padding: isMobile ? "16px 14px 20px" : "30px 20px 48px" }}>
        {mountainPageResortKey ? (
          <MountainPage
            resortKey={mountainPageResortKey}
            resort={mountainPageResort}
            currentUserEmail={currentUser?.email}
            onBack={() => setMountainPageResortKey(null)}
          />
        ) : (
          <>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: activeTab === "dashboard" ? 20 : 16 }}>
```
(The indentation on the re-emitted `<header>` line is intentionally left at its original depth — don't reformat the ~300 lines between here and Step 7's closing tag just to fix indentation. This is a mechanical wrap, not a rewrite.)

Now find the end of that same `<div className="mobile-scroll-pad" ...>` block — its matching closing `</div>` (the one immediately followed by one more `</div>` and then the final `)` of the component's return statement). Directly before that `</div>`, add the closing half of the ternary:
```jsx
          </>
        )}
      </div>
```
So the tail of the file's return statement goes from:
```jsx
      </div>
    </div>
  )
}
```
to:
```jsx
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Add the owner-only Krames Butte banner above the resort grid**

Find:
```jsx
            {conditionsSubTab === "conditions" && (
              <>
                <section
                  className="filter-bar"
```
Replace with:
```jsx
            {conditionsSubTab === "conditions" && (
              <>
                {currentUser?.email === OWNER_EMAIL && (
                  <button
                    onClick={() => setMountainPageResortKey(KRAMES_BUTTE_KEY)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      width: "100%", padding: "12px 16px", marginBottom: 16, borderRadius: 14,
                      border: "1px dashed rgba(163,230,53,0.5)", background: "rgba(163,230,53,0.08)",
                      color: "#a3e635", fontWeight: 800, fontSize: 13, cursor: "pointer",
                    }}
                  >
                    🧪 Krames Butte — Dev Testing Ground →
                  </button>
                )}
                <section
                  className="filter-bar"
```

- [ ] **Step 8: Pass `onOpenMountainPage` to `ResortCard` and `currentUserEmail` to the standalone `MountainBoard`**

Find:
```jsx
                <main className="resort-grid">
                  {rows.map((r) => (
                    <ResortCard key={r.name} r={r} skierCounts={skierCounts} skierDetails={skierDetails} activityCount={resortActivityCounts[r.resortKey] || 0} friendsGoing={friendTripsByResort[r.resortKey] || []} vibeData={vibeData} />
                  ))}
                </main>
```
Replace with:
```jsx
                <main className="resort-grid">
                  {rows.map((r) => (
                    <ResortCard key={r.name} r={r} skierCounts={skierCounts} skierDetails={skierDetails} activityCount={resortActivityCounts[r.resortKey] || 0} friendsGoing={friendTripsByResort[r.resortKey] || []} vibeData={vibeData} onOpenMountainPage={setMountainPageResortKey} />
                  ))}
                </main>
```

Find:
```jsx
            {conditionsSubTab === "board" && (
              <MountainBoard defaultResortKey={topResort?.resortKey || "vail"} />
            )}
```
Replace with:
```jsx
            {conditionsSubTab === "board" && (
              <MountainBoard defaultResortKey={topResort?.resortKey || "vail"} currentUserEmail={currentUser?.email} />
            )}
```

- [ ] **Step 9: Run the build**

```bash
npm run build
```
Expected: succeeds with no errors. If it fails on the Step 6 wrap specifically, the most likely cause is a mismatched brace/paren from the ternary — re-check that every `{...}` JSX expression opened in Step 6 has its matching close, and that no stray top-level `</div>` was duplicated or dropped.

- [ ] **Step 10: Full manual verification in the browser**

```bash
npm run dev
```

As the owner account:
- Tap any real resort's card → confirm its Mountain Page opens: cover header with photo/name/emoji/Open-or-Closed badge/powder score ring, a single "📋 Board" tab (already active), and that resort's board locked (no resort-switcher chips visible in the embedded board).
- Tap "← Back" → confirm you land back on the Snow tab's resort grid.
- Tap a resort card again, then tap "Home" in the bottom nav → confirm it navigates to Home (not stuck on the Mountain Page).
- On the Snow tab, confirm the "🧪 Krames Butte — Dev Testing Ground →" banner appears above the resort grid. Tap it → confirm Krames Butte's Mountain Page opens: header shows "🧪 DEV" tag, "🧪 Krames Butte" title, no Open/Closed badge, no powder-score ring (both correctly omitted for null data), and the Board tab locked to `kramesbutte`.
- Post to Krames Butte's board from this locked view → confirm it succeeds regardless of real GPS position.

As a second (non-owner) account:
- Confirm the Krames Butte banner does not render anywhere on the Snow tab.
- Tap a real resort's card → confirm its Mountain Page still opens normally with the Board tab.
- Confirm the standalone Snow → Board sub-tab still shows the full multi-resort switcher exactly as before, with no Krames Butte chip.
- Open the browser console and run:
  ```js
  await supabase.from('resort_coordinates').select('*').eq('resort_key', 'kramesbutte')
  ```
  Confirm `data` is an empty array — the row's existence is invisible to this account even via a direct query.
- In the console, run:
  ```js
  await supabase.rpc('create_board_post', { p_resort_key: 'kramesbutte', p_category: 'general', p_content: 'test', p_lat: 39.5, p_lng: -105.5 })
  ```
  Confirm it returns an error (not a successful post).

On either account, confirm Krames Butte never appears in: the ski-day logging resort picker (`LogDayModal`'s `ResortPicker`), the leaderboard, the Home tab's resort cards, or any powder-conditions/vibe-score display — it should be structurally absent everywhere except the Board tab's owner-only chip and the owner-only banner, both already checked above.

- [ ] **Step 11: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire Mountain Page navigation, Krames Butte banner, and resort-card entry point"
```

---

## Deployment

This repo's Vercel deploy only triggers on a push to `origin/main` (confirmed in the sprint-29 session — commits sitting locally do not go live on their own). After all four tasks are committed, **ask the user before pushing** — `git push origin main` — since it affects the live deployed site. Do not push automatically as part of task execution.
