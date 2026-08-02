# Sprint 20 — Activity Feed

**Goal:** ROADMAP TASK 5.3 — a chronological feed of friend activity (ski sessions logged, trip RSVPs, trips created) with avatars, relative timestamps, and inline emoji reactions, surfaced as a new sub-tab in the Social tab.
**Estimated effort:** 1.5 days
**Depends on:** Sprint 13 (Enhanced Log-a-Day) not required, but this sprint hooks into `logSkiDay()` in `leaderboardApi.js` regardless of whether sprint-13 has landed.

**Correction to ROADMAP.md before you start:** ROADMAP TASK 5.3 asks for DB triggers on `ski_sessions`/`trip_rsvps`/`ski_trips` INSERT/UPDATE to populate the feed. This codebase has **no existing DB-trigger precedent anywhere** in its `migrations/` — the one existing similar table, `notifications` (`migrations/004_notifications.sql`), is populated entirely via **app-level inserts** after the relevant action succeeds (`notifyTripChat`, `notifyTripUpdate`, `notifyRsvp` in `socialApi.js`, each doing `supabase.from("notifications").insert(...)` directly in client code). This sprint follows that same established, working convention — app-level inserts via a shared `logActivity()` helper called from the 3 relevant mutation functions — rather than introducing a brand-new DB-trigger pattern this codebase has never used. The result is functionally identical for users; it's a lower-risk implementation choice.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**`notifications` table** (`migrations/004_notifications.sql`) is the closest existing pattern — reference it for migration style (idempotent `CREATE TABLE IF NOT EXISTS` + `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_policies ...) THEN CREATE POLICY ... END IF; $$` guards).

**`src/components/MessagingCenter.jsx`** — the panel toggle this sprint extends, exact current code (lines ~604-637):
```jsx
<div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: 4, flexShrink: 0 }}>
  {[
    { key: "chats",  label: "Chats",   badge: 0 },
    { key: "people", label: "Friends", badge: pendingFriendCount },
  ].map(({ key, label, badge }) => (
    <button key={key} onClick={() => { setPanel(key); if (isMobile) { setSelectedCrew(null); setSelectedTrip(null) } }} style={{ /* ... */ }}>
      {label}
      {badge > 0 && <span style={{ /* red count badge */ }}>{badge}</span>}
    </button>
  ))}
</div>
```
State: `const [panel, setPanel] = useState("chats")`. Content blocks are conditionally rendered on `panel === "chats"` / `panel === "people"` throughout the rest of the file. This sprint adds a third `{ key: "activity", label: "Activity", badge: 0 }` entry and a matching `{panel === "activity" && <ActivityFeed />}` block.

**`getAcceptedFriends()`** (exported, `src/lib/socialApi.js`) is the pattern used elsewhere for friend-scoped queries (e.g. `leaderboardApi.js`: `const friendIdSet = new Set(friends.map(f => f.id)); friendIdSet.add(user.id)`) — you likely won't need this directly since RLS handles friend-scoping server-side for this feature (see S20-T1), but it's there if a client-side fallback is ever needed.

---

## Tasks

S20-T1 (migration) has no dependency. S20-T2 (`logActivity`/`getActivityFeed` + reaction helpers) depends on S20-T1 being run. S20-T3 (wire `logActivity` into the 3 mutation call sites) depends on S20-T2. S20-T4 (`ActivityFeed.jsx` UI) depends on S20-T2. S20-T5 (wire into `MessagingCenter.jsx`) depends on S20-T4.

---

### S20-T1 — `migrations/013_activity_feed.sql`

**File to create:** `migrations/013_activity_feed.sql`

```sql
-- Migration 013: Activity feed + reactions
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS activity_feed (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('ski_session','trip_rsvp','trip_created')),
  subject_id   UUID,
  subject_type TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_feed_created ON activity_feed (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_feed_actor ON activity_feed (actor_id);

ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_feed' AND policyname = 'Friends and self view activity') THEN
    CREATE POLICY "Friends and self view activity" ON activity_feed FOR SELECT TO authenticated
      USING (
        actor_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM friend_requests fr
          WHERE fr.status = 'accepted'
            AND ((fr.requester_id = auth.uid() AND fr.recipient_id = activity_feed.actor_id)
              OR (fr.recipient_id = auth.uid() AND fr.requester_id = activity_feed.actor_id))
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_feed' AND policyname = 'Authenticated users insert own activity') THEN
    CREATE POLICY "Authenticated users insert own activity" ON activity_feed FOR INSERT TO authenticated
      WITH CHECK (actor_id = auth.uid());
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS activity_feed_reactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID REFERENCES activity_feed(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  emoji       TEXT NOT NULL CHECK (emoji IN ('🎿','❄️','🔥','👑')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, user_id)
);

ALTER TABLE activity_feed_reactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_feed_reactions' AND policyname = 'Auth users view activity reactions') THEN
    CREATE POLICY "Auth users view activity reactions" ON activity_feed_reactions FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_feed_reactions' AND policyname = 'Users manage own activity reaction') THEN
    CREATE POLICY "Users manage own activity reaction" ON activity_feed_reactions FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
```
Note: `activity_feed_reactions` intentionally uses a simpler "any authenticated user can read" policy (matching `notifications`' permissive-read precedent) rather than replicating the friends-only visibility subquery — reactions on an already-friends-filtered feed item aren't independently sensitive, and re-deriving friend visibility per-reaction-row would be redundant with the feed query's own filtering.

**Acceptance criteria:**
- Both tables, their indexes, RLS, and all 4 policies exist exactly as written.
- `activity_feed_reactions.UNIQUE(activity_id, user_id)` allows exactly one emoji per user per activity item.

---

### S20-T2 — `logActivity`, `getActivityFeed`, reaction helpers

**File to modify:** `src/lib/socialApi.js`

```js
export async function logActivity(type, { subjectId = null, subjectType = null, metadata = null } = {}) {
  try {
    const user = await getCurrentUser()
    const { error } = await supabase
      .from("activity_feed")
      .insert({ actor_id: user.id, type, subject_id: subjectId, subject_type: subjectType, metadata })
    if (error) throw error
  } catch (e) {
    console.warn("logActivity failed", e) // non-blocking — never let a feed-logging failure break the user's real action
  }
}

export async function getActivityFeed(limit = 30) {
  const { data, error } = await supabase
    .from("activity_feed")
    .select("*, profiles:actor_id(id, full_name, username, avatar_url)")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function getActivityReactions(activityIds) {
  if (!activityIds?.length) return []
  const { data, error } = await supabase
    .from("activity_feed_reactions")
    .select("activity_id, user_id, emoji")
    .in("activity_id", activityIds)
  if (error) throw error
  return data || []
}

export async function addActivityReaction(activityId, emoji) {
  const user = await getCurrentUser()
  const { data: existing, error: findErr } = await supabase
    .from("activity_feed_reactions")
    .select("id, emoji")
    .eq("activity_id", activityId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (findErr) throw findErr

  if (existing?.emoji === emoji) {
    const { error } = await supabase.from("activity_feed_reactions").delete().eq("id", existing.id)
    if (error) throw error
    return null
  }

  const { data, error } = await supabase
    .from("activity_feed_reactions")
    .upsert({ activity_id: activityId, user_id: user.id, emoji }, { onConflict: "activity_id,user_id" })
    .select()
    .single()
  if (error) throw error
  return data
}
```
`getActivityFeed`'s RLS-scoped `select("*")` returns only self + accepted-friends rows automatically (per S20-T1's policy) — no client-side friend-ID filtering is needed here, unlike some older functions in this file that predate that RLS pattern being available.

**Acceptance criteria:**
- `logActivity` never throws to its caller (wrapped in try/catch, warns on failure) — logging activity must never block the real user action it's attached to.
- `getActivityFeed(30)` returns up to 30 rows, newest first, each with an embedded `profiles` relation.
- `addActivityReaction` follows the same toggle-same-emoji-removes semantics as sprint-17's leaderboard reactions.

---

### S20-T3 — Wire `logActivity` into the 3 mutation call sites

**Files to modify:** `src/lib/leaderboardApi.js`, `src/lib/socialApi.js`

**Ski session logged** — in `logSkiDay()` (`leaderboardApi.js`), after the upsert succeeds, add (import `logActivity` from `./socialApi`):
```js
logActivity("ski_session", { subjectId: data.id, subjectType: "ski_sessions", metadata: { resort_name: data.resort_name, is_powder_day: data.is_powder_day } })
```
Fire-and-forget (don't `await` it in a way that delays returning the session row to the caller — either `await` it since it never throws, or call it without awaiting; either is fine given `logActivity`'s internal try/catch, prefer `await` for predictable ordering in tests/debugging).

**Trip RSVP** — find `rsvpToTrip(tripId, status)` in `socialApi.js`. After a successful RSVP with `status === "going"` only (skip logging "maybe"/"cantgo" — keeps the feed focused on commitments, not indecision):
```js
if (status === "going") {
  logActivity("trip_rsvp", { subjectId: tripId, subjectType: "ski_trips", metadata: { status } })
}
```

**Trip created** — find the function in `socialApi.js` that creates a new `ski_trips` row (used by `CreateTripModal.jsx` on submit — search for `.from("ski_trips").insert(` to locate it). After success:
```js
logActivity("trip_created", { subjectId: newTrip.id, subjectType: "ski_trips", metadata: { resort_key: newTrip.resort_key, ski_date: newTrip.ski_date } })
```

**Acceptance criteria:**
- Logging a ski day, RSVPing "going" to a trip, and creating a trip each produce exactly one new `activity_feed` row.
- RSVPing "maybe" or "cantgo" produces no `activity_feed` row.
- None of these 3 user actions fail or behave differently if `logActivity` internally fails (verify by temporarily breaking the insert, e.g. wrong column name, and confirming the parent action — logging a day, RSVPing, creating a trip — still succeeds).

---

### S20-T4 — `ActivityFeed.jsx`

**File to create:** `src/components/ActivityFeed.jsx`

```jsx
import { useState, useEffect } from "react"
import { getActivityFeed, getActivityReactions, addActivityReaction, getCurrentUser } from "../lib/socialApi"
import Avatar from "./ui/Avatar"
import { timeAgo } from "../lib/format"
import { resortName } from "../lib/resorts"

const TYPE_COPY = {
  ski_session: (name, m) => `${name} skied ${m?.resort_name ? resortName(m.resort_name) : "a resort"}${m?.is_powder_day ? " on a powder day ❄️" : ""}`,
  trip_rsvp: (name) => `${name} is going on a trip`,
  trip_created: (name, m) => `${name} planned a trip${m?.resort_key ? ` to ${resortName(m.resort_key)}` : ""}`,
}
const EMOJIS = ["🎿", "❄️", "🔥", "👑"]

export default function ActivityFeed() {
  const [items, setItems] = useState([])
  const [reactions, setReactions] = useState({}) // { [activity_id]: [{user_id, emoji}] }
  const [currentUserId, setCurrentUserId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([getActivityFeed(30), getCurrentUser()])
      .then(async ([rows, user]) => {
        if (cancelled) return
        setItems(rows)
        setCurrentUserId(user?.id ?? null)
        const reactionRows = await getActivityReactions(rows.map((r) => r.id)).catch(() => [])
        if (cancelled) return
        const grouped = {}
        for (const r of reactionRows) {
          grouped[r.activity_id] = grouped[r.activity_id] || []
          grouped[r.activity_id].push(r)
        }
        setReactions(grouped)
      })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function handleReact(activityId, emoji) {
    setReactions((prev) => {
      const existing = prev[activityId] || []
      const mine = existing.find((r) => r.user_id === currentUserId)
      const withoutMine = existing.filter((r) => r.user_id !== currentUserId)
      const next = mine?.emoji === emoji ? withoutMine : [...withoutMine, { user_id: currentUserId, emoji }]
      return { ...prev, [activityId]: next }
    })
    try {
      await addActivityReaction(activityId, emoji)
    } catch {
      const rows = await getActivityReactions([activityId]).catch(() => [])
      setReactions((prev) => ({ ...prev, [activityId]: rows }))
    }
  }

  if (loading) return <div style={{ padding: 20, fontSize: 13, color: "var(--color-text-3)" }}>Loading…</div>
  if (!items.length) return <div style={{ padding: 20, fontSize: 13, color: "var(--color-text-3)" }}>No recent activity from your crew yet.</div>

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
      {items.map((item) => {
        const actorName = item.profiles?.full_name || item.profiles?.username || "Someone"
        const describe = TYPE_COPY[item.type]
        const itemReactions = reactions[item.id] || []
        return (
          <div key={item.id} style={{ display: "flex", gap: 10, padding: "10px 12px", alignItems: "flex-start" }}>
            <Avatar profile={item.profiles} size={32} />
            <div style={{ fontSize: 13, flex: 1 }}>
              <div>{describe ? describe(actorName, item.metadata) : `${actorName} did something`}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-3)", marginTop: 2 }}>{timeAgo(item.created_at)}</div>
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                {EMOJIS.map((emoji) => {
                  const count = itemReactions.filter((r) => r.emoji === emoji).length
                  const mine = itemReactions.some((r) => r.user_id === currentUserId && r.emoji === emoji)
                  return (
                    <button
                      key={emoji}
                      onClick={() => handleReact(item.id, emoji)}
                      style={{
                        display: "flex", alignItems: "center", gap: 3, padding: "2px 6px",
                        borderRadius: "var(--radius-pill)", border: "none", cursor: "pointer", fontSize: 12,
                        background: mine ? "var(--color-accent)" : "rgba(255,255,255,0.06)",
                        color: mine ? "var(--color-bg)" : "var(--color-text-2)",
                      }}
                    >
                      {emoji}
                      {count > 0 && <span style={{ fontSize: 10, fontWeight: 700 }}>{count}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

**Acceptance criteria:**
- Renders a chronological list with avatar, human-readable description per `type`, relative timestamp, and a 4-emoji reaction bar per item.
- Empty state and loading state both handled.
- Reacting is optimistic with rollback-via-refetch on error, same pattern as sprint-17.

---

### S20-T5 — Add "Activity" sub-tab to `MessagingCenter.jsx`

**File to modify:** `src/components/MessagingCenter.jsx`

**Step 1 — Import:** `import ActivityFeed from "./ActivityFeed"`

**Step 2 — Add the third tab entry** to the toggle array (shown in Project Context above): `{ key: "activity", label: "Activity", badge: 0 }`, appended after `"people"`.

**Step 3 — Add the render block**, following the same `{panel === "..." && (...)}` convention as the existing `chats`/`people` blocks:
```jsx
{panel === "activity" && <ActivityFeed />}
```
Place it alongside the other panel-conditional blocks (near lines 642/689/803/860 per the existing structure — read the file to find the right insertion point so it renders in the same layout slot the other two panels use).

**Acceptance criteria:**
- A third "Activity" tab appears in the Social tab's panel toggle.
- Selecting it renders `ActivityFeed` in the same layout region `Chats`/`Friends` already use.

**Verify in browser:**
```bash
npm run dev
```
Log a ski day, RSVP "going" to a trip, and/or create a trip (as one or more test users with a friend connection). Open the Social tab → Activity, confirm entries appear with correct copy, timestamps, and working reactions.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add migrations/013_activity_feed.sql src/lib/socialApi.js src/lib/leaderboardApi.js src/components/ActivityFeed.jsx src/components/MessagingCenter.jsx
git commit -m "feat: add friend activity feed with reactions to Social tab"
```

---

## Sprint Acceptance Criteria

- [ ] `migrations/013_activity_feed.sql` exists with both tables, RLS, and policies, and has been run against Supabase
- [ ] `logActivity` is wired into ski-day logging, "going" RSVPs, and trip creation — and never blocks those actions on failure
- [ ] `ActivityFeed.jsx` renders a chronological, reactable feed of friends' + own activity
- [ ] "Activity" is a working third sub-tab in the Social tab
- [ ] `npm run build` succeeds
- [ ] Verified in browser end-to-end with at least 2 connected test users

## Out of Scope for This Sprint

- DB triggers (explicitly rejected in favor of the existing app-level-insert convention — see the correction note above).
- Logging every possible action type — only ski sessions, "going" RSVPs, and trip creation are logged; other events (friend accepted, comment posted, etc.) are not part of this sprint.
- Notifications/push alerts when a friend's activity appears — this is a pull feed (view Social → Activity), not a push notification.
</content>
