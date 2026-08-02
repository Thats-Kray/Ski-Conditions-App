# Sprint 17 — Leaderboard Emoji Reactions

**Goal:** ROADMAP TASK 4.2 — let users react to a friend's leaderboard entry (per stat category, per season) with one of 4 emoji, one-tap, with counts and the current user's own reaction highlighted.
**Estimated effort:** 1 day
**Depends on:** Sprint 16 (8-stat leaderboard expansion) merged — reactions are scoped per active stat tab, so the tab switcher needs to exist first.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**Migration convention — this repo has two active migrations directories; this one goes in `migrations/` (numbered, idempotent-guard style), matching ROADMAP's own file listing (`migrations/012_leaderboard_reactions.sql`).** Reference pattern, `migrations/007_ski_pings.sql` (`ski_ping_responses` table, lines 16-23 + 58-67) — same UNIQUE-per-user shape with a `CHECK` constraint on an enum-like text column, which is what this table also needs (fixed emoji set):
```sql
CREATE TABLE IF NOT EXISTS ski_ping_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ping_id     UUID REFERENCES ski_pings ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users NOT NULL,
  response    TEXT NOT NULL CHECK (response IN ('yes','maybe','no')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ping_id, user_id)
);
ALTER TABLE ski_ping_responses ENABLE ROW LEVEL SECURITY;
-- inside idempotent DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE ...) THEN CREATE POLICY ... END IF; blocks
```

**`src/components/LeaderboardPage.jsx`** — from sprint-16, `CATEGORIES` has 8 entries (`days, powderDays, vertical, miles, topSpeed, longestRun, totalLifts, timeOnMountain`), an `activeCategory` (or equivalent) state tracks which tab is selected, and `LeaderboardRow` renders each entry. This sprint adds a reaction bar to each row, scoped to `(target_user_id, stat_type = activeCategory.key, season)`.

**`getCurrentSeason()`** returns `{ startYear, label }` — use `String(startYear)` as the `season` column value (a stable, sortable identifier — don't use the display `label` string, which contains an en-dash and is meant for UI text only).

---

## Tasks

S17-T1 (migration) has no dependency. S17-T2 (API functions) depends on S17-T1 being run against Supabase to test against. S17-T3 (UI) depends on S17-T2.

---

### S17-T1 — `migrations/012_leaderboard_reactions.sql`

**File to create:** `migrations/012_leaderboard_reactions.sql`

```sql
-- Migration 012: Leaderboard emoji reactions
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS leaderboard_reactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  stat_type      TEXT NOT NULL,
  emoji          TEXT NOT NULL CHECK (emoji IN ('🎿','❄️','🔥','👑')),
  season         TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, target_user_id, stat_type, season)
);

CREATE INDEX IF NOT EXISTS leaderboard_reactions_target
  ON leaderboard_reactions (target_user_id, stat_type, season);

ALTER TABLE leaderboard_reactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'leaderboard_reactions' AND policyname = 'Auth users view reactions'
  ) THEN
    CREATE POLICY "Auth users view reactions"
      ON leaderboard_reactions FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'leaderboard_reactions' AND policyname = 'Users manage own reactions'
  ) THEN
    CREATE POLICY "Users manage own reactions"
      ON leaderboard_reactions FOR ALL
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
```

The `UNIQUE (user_id, target_user_id, stat_type, season)` constraint means one reaction per (reactor, target, stat category, season) — the app enforces "pick one emoji at a time per stat category" via upsert-or-delete in S17-T2, not via the schema allowing multiple simultaneous emoji from the same user.

**Do not run this migration yourself** — it's reviewed and run manually against Supabase per this repo's convention.

**Acceptance criteria:**
- Table, index, RLS, and both policies exist exactly as written.
- The `emoji` `CHECK` constraint only allows the 4 documented emoji.

---

### S17-T2 — `addLeaderboardReaction` and `getLeaderboardReactions`

**File to modify:** `src/lib/leaderboardApi.js`

Check how existing functions in this file obtain the current user (e.g. `supabase.auth.getUser()` directly, or an imported `getCurrentUser()` from `socialApi.js`) and match that exact convention — don't introduce a second way of getting the current user in this file.

```js
export async function getLeaderboardReactions(targetUserIds, statType, season) {
  if (!targetUserIds?.length) return []
  const { data, error } = await supabase
    .from("leaderboard_reactions")
    .select("target_user_id, user_id, emoji")
    .eq("stat_type", statType)
    .eq("season", season)
    .in("target_user_id", targetUserIds)
  if (error) throw error
  return data || []
}

export async function addLeaderboardReaction(targetUserId, statType, emoji, season) {
  const user = /* however this file already gets the current user */
  const { data: existing, error: findErr } = await supabase
    .from("leaderboard_reactions")
    .select("id, emoji")
    .eq("user_id", user.id)
    .eq("target_user_id", targetUserId)
    .eq("stat_type", statType)
    .eq("season", season)
    .maybeSingle()
  if (findErr) throw findErr

  if (existing?.emoji === emoji) {
    // toggle off — clicking your own active reaction again removes it
    const { error } = await supabase.from("leaderboard_reactions").delete().eq("id", existing.id)
    if (error) throw error
    return null
  }

  const { data, error } = await supabase
    .from("leaderboard_reactions")
    .upsert(
      { user_id: user.id, target_user_id: targetUserId, stat_type: statType, emoji, season },
      { onConflict: "user_id,target_user_id,stat_type,season" }
    )
    .select()
    .single()
  if (error) throw error
  return data
}
```

**Acceptance criteria:**
- `getLeaderboardReactions([userA, userB], "topSpeed", "2025")` returns all reactions for those 2 users' Top Speed entries this season.
- `addLeaderboardReaction(userA, "topSpeed", "🔥", "2025")` creates a row if none exists for that (caller, userA, topSpeed, 2025) tuple, or updates the emoji if a different one already existed.
- Calling it again with the **same** emoji deletes the existing reaction (toggle-off).
- `getLeaderboardReactions([], ...)` returns `[]` without querying (avoids an invalid empty `.in()` filter).

---

### S17-T3 — Reaction bar UI in `LeaderboardPage.jsx`

**File to modify:** `src/components/LeaderboardPage.jsx`

**Step 1 — Fetch reactions in bulk at the page level, not per-row** (avoids an N-row-N-query pattern). Where `entries` is loaded/sorted for the active category, add:
```js
const [reactionsByUser, setReactionsByUser] = useState({}) // { [target_user_id]: [{user_id, emoji}] }

useEffect(() => {
  if (!entries.length) return
  let cancelled = false
  getLeaderboardReactions(entries.map((e) => e.id), activeCategory.key, String(season.startYear))
    .then((rows) => {
      if (cancelled) return
      const grouped = {}
      for (const r of rows) {
        grouped[r.target_user_id] = grouped[r.target_user_id] || []
        grouped[r.target_user_id].push(r)
      }
      setReactionsByUser(grouped)
    })
    .catch(() => {})
  return () => { cancelled = true }
}, [entries, activeCategory.key, season.startYear])
```
Adjust variable names (`entries`, `activeCategory`, `season`) to match whatever they're actually called in the current file — read the file first.

**Step 2 — Add a reaction handler at the page level** so it can optimistically update `reactionsByUser` before/after the API call:
```js
async function handleReact(targetUserId, emoji) {
  const currentUserId = /* however this component knows the current user's id */
  setReactionsByUser((prev) => {
    const existing = prev[targetUserId] || []
    const mine = existing.find((r) => r.user_id === currentUserId)
    const withoutMine = existing.filter((r) => r.user_id !== currentUserId)
    const next = mine?.emoji === emoji ? withoutMine : [...withoutMine, { user_id: currentUserId, emoji }]
    return { ...prev, [targetUserId]: next }
  })
  try {
    await addLeaderboardReaction(targetUserId, activeCategory.key, emoji, String(season.startYear))
  } catch {
    // rollback by refetching this one user's reactions
    const rows = await getLeaderboardReactions([targetUserId], activeCategory.key, String(season.startYear)).catch(() => [])
    setReactionsByUser((prev) => ({ ...prev, [targetUserId]: rows }))
  }
}
```

**Step 3 — Render the reaction bar in `LeaderboardRow`.** Pass `reactions={reactionsByUser[entry.id] || []}` and `onReact={(emoji) => handleReact(entry.id, emoji)}` into `LeaderboardRow`, and inside it render:
```jsx
const EMOJIS = ["🎿", "❄️", "🔥", "👑"]

<div style={{ display: "flex", gap: 4, marginTop: 6 }}>
  {EMOJIS.map((emoji) => {
    const count = reactions.filter((r) => r.emoji === emoji).length
    const mine = reactions.some((r) => r.user_id === currentUserId && r.emoji === emoji)
    return (
      <button
        key={emoji}
        onClick={() => onReact(emoji)}
        style={{
          display: "flex", alignItems: "center", gap: 3, padding: "3px 7px",
          borderRadius: "var(--radius-pill)", border: "none", cursor: "pointer",
          background: mine ? "var(--color-accent)" : "rgba(255,255,255,0.06)",
          color: mine ? "var(--color-bg)" : "var(--color-text-2)",
          fontSize: 13,
        }}
      >
        {emoji}
        {count > 0 && <span style={{ fontSize: 11, fontWeight: 700 }}>{count}</span>}
      </button>
    )
  })}
</div>
```
Do not render a reaction bar on the current user's own row (reacting to yourself doesn't make sense) — skip rendering it when `entry.isMe` is true (the existing `isMe` field already used for the "YOU" badge).

**Acceptance criteria:**
- Each non-self row shows 4 emoji buttons with live counts.
- The current user's own active reaction (if any) is visually highlighted.
- Clicking updates optimistically, with rollback-via-refetch on API error.
- Switching stat tabs refetches reactions scoped to the new tab's `stat_type` (a user's 🔥 on someone's Top Speed doesn't bleed into the Vertical tab).
- The current user's own leaderboard row shows no reaction bar.

**Verify in browser:**
```bash
npm run dev
```
Open the leaderboard with at least 2 friends visible. React to a friend's entry, confirm the count and highlight update, switch tabs and confirm reactions are scoped per-tab, click your own active reaction again to confirm it toggles off.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add migrations/012_leaderboard_reactions.sql src/lib/leaderboardApi.js src/components/LeaderboardPage.jsx
git commit -m "feat: add emoji reactions to leaderboard entries"
```

---

## Sprint Acceptance Criteria

- [ ] `migrations/012_leaderboard_reactions.sql` exists with the documented table/index/RLS, and has been run against Supabase
- [ ] `getLeaderboardReactions` and `addLeaderboardReaction` exist in `leaderboardApi.js` with toggle-on-same-emoji-removes semantics
- [ ] Reaction bar renders on every non-self leaderboard row, scoped per active stat tab and season
- [ ] `npm run build` succeeds
- [ ] Verified in browser: react, toggle off, switch tabs, confirm per-tab scoping

## Out of Scope for This Sprint

- Notifications when someone reacts to your leaderboard entry (could be a natural follow-up using the existing `notifications` table pattern, not built here).
- Reacting to your own row (explicitly disallowed).
- A reactions history/audit view.
</content>
