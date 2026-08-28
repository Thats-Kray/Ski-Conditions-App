# Crew Tab — Crews Sub-Tab Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new 5-way Crew-tab navigation shell (Friends/Crews/Feed/Board/Leaderboard) and fully redesign the Crews sub-tab to match the mockup — color-dot/photo crew icon, real member avatars, member count, a "Next out" line, and unread-message dots — while the other four sub-tabs route to their existing, unpolished components unchanged.

**Architecture:** `MessagingCenter.jsx` shrinks from a chat-inbox app-shell (sidebar + main panel, its own duplicate Create-Crew/Ping/Date-Matchmaker modals) down to a thin tab router: page title, the new pill-chip tab bar, and routing to five child components. Four of those five (`FriendsPage` via new minimal props, `ActivityFeed`, `SkiBuddyBoard`, `LeaderboardPage`) are unchanged or near-unchanged. The fifth, `CrewGroupChat`, becomes fully self-contained — it already owns its own crew-list ↔ crew-chat transition internally, so it grows to also own member/next-out data, per-crew and aggregate unread state (reported up via a new callback prop), and crew photo upload, rather than `MessagingCenter` duplicating any of that.

**Tech Stack:** React (inline styles, no CSS framework), Supabase (Postgres + Realtime + Storage), `node --test` for pure-logic unit tests.

## Global Constraints

- No new npm dependencies.
- Inline `style={{}}` objects only; colors via `var(--color-*)` tokens for anything semantic/stateful. The crew color dot is a deliberate, already-established exception — fixed hex from `crewColors.js`, not a token (see that file's own header comment).
- Date keys via `localDateKey()`, never `toISOString()`.
- `npm test` baseline: **134 passing** as of 2026-08-27 — re-verify in the fresh worktree before starting, don't trust this number.
- `npx eslint .` baseline: get the real number from the fresh worktree, not from `main` (which runs persistently higher due to unrelated drift — see project memory). Don't raise it.
- No subagent in this environment has browser or Supabase-auth tooling. Every task is verified via `npm test`/`npx eslint`/`npm run build`/diff review only — say so plainly in each task's report, don't imply a browser check happened.
- Follow existing patterns exactly where one already exists (see each task's "Consumes" — these are real, already-in-the-codebase functions, not to be reimplemented).

---

## File Structure

| File | Change |
|---|---|
| `migrations/044_crew_photos.sql` | *new* — `crews.photo_url` column + `crew-photos` storage bucket/RLS |
| `src/lib/crewNextOut.js` | *new* — pure `computeNextOut()` helper + test |
| `src/lib/socialApi.js` | *modify* — add `uploadCrewPhoto()` |
| `src/components/CrewGroupChat.jsx` | *modify* — card restyle, member/next-out/unread data, realtime, photo picker |
| `src/components/FriendsPage.jsx` | *modify (minimal)* — two new optional props |
| `src/components/MessagingCenter.jsx` | *rewrite* — new tab bar + routing, drop now-dead chat-inbox code |

---

### Task 1: Migration — crew photo column + storage bucket

**Files:**
- Create: `migrations/044_crew_photos.sql`

**Interfaces:**
- Produces: `crews.photo_url` (nullable TEXT column); `crew-photos` public Storage bucket with INSERT (authenticated) and SELECT (public) policies, same pattern as the existing `chat-media` bucket at `supabase/migrations/20260519_chat_media.sql`.

- [ ] **Step 1: Write the migration**

```sql
-- Migration 044: crew photos
--
-- Lets a crew set a real photo instead of only an emoji/color-dot identity
-- (TASK 22.0 Crews-tab redesign). The default card icon becomes a flat color
-- dot via the existing crewColor() function; this column is the opt-in
-- override, same fallback shape Avatar.jsx already uses for people
-- (photo if set, else color+initial).
--
-- Bucket/policy shape mirrors supabase/migrations/20260519_chat_media.sql
-- exactly: any authenticated user can upload, bucket is publicly readable.
-- Admin-only editing is enforced at the UI layer (EditCrewModal is only
-- ever rendered when the caller is already a crew admin — see
-- CrewGroupChat.jsx's `isAdmin` check gating the Edit button), same as the
-- rest of this app's storage buckets; no per-crew storage RLS needed.
--
-- ROLLBACK, if anything breaks:
--   ALTER TABLE public.crews DROP COLUMN IF EXISTS photo_url;
--   DROP POLICY IF EXISTS "Authenticated users can upload crew photos" ON storage.objects;
--   DROP POLICY IF EXISTS "Crew photos are publicly readable" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'crew-photos';

BEGIN;

ALTER TABLE public.crews ADD COLUMN IF NOT EXISTS photo_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('crew-photos', 'crew-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload crew photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'crew-photos');

CREATE POLICY "Crew photos are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'crew-photos');

COMMIT;
```

- [ ] **Step 2: Apply it via the Supabase MCP tool** (`mcp__claude_ai_Supabase__apply_migration`), name `044_crew_photos`, using the SQL above verbatim.

- [ ] **Step 3: Verify** — query `information_schema.columns` for `crews.photo_url` and `storage.buckets` for `crew-photos`, confirm both exist. Report the verification query output in the task report, not just "looks right."

- [ ] **Step 4: Commit**

```bash
git add migrations/044_crew_photos.sql
git commit -m "feat: add crews.photo_url column and crew-photos storage bucket"
```

---

### Task 2: `computeNextOut` pure helper

**Files:**
- Create: `src/lib/crewNextOut.js`
- Test: `src/lib/crewNextOut.test.js`

**Interfaces:**
- Produces: `computeNextOut(memberIds, plans)` — `memberIds: string[]`, `plans: Array<{ user_id: string, ski_date: string, resort_key: string }>` (already sorted ascending by `ski_date`, matching what `getVisiblePlansInRange` in `src/lib/socialApi.js` already returns — do not re-sort inside this function). Returns `{ resortKey: string, skiDate: string } | null`: the earliest date where 2 or more of `memberIds` share the same `resort_key`, or `null` if there's no such overlap.

- [ ] **Step 1: Write the failing tests**

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { computeNextOut } from "./crewNextOut.js"

test("returns the earliest date where 2+ members share a resort", () => {
  const plans = [
    { user_id: "a", ski_date: "2026-09-01", resort_key: "vail" },
    { user_id: "b", ski_date: "2026-09-05", resort_key: "vail" },
    { user_id: "a", ski_date: "2026-09-05", resort_key: "vail" },
  ]
  assert.deepEqual(computeNextOut(["a", "b"], plans), { resortKey: "vail", skiDate: "2026-09-05" })
})

test("ignores plans from users not in memberIds", () => {
  const plans = [
    { user_id: "stranger", ski_date: "2026-09-01", resort_key: "vail" },
    { user_id: "a", ski_date: "2026-09-10", resort_key: "vail" },
  ]
  assert.equal(computeNextOut(["a", "b"], plans), null)
})

test("ignores same-day plans at different resorts", () => {
  const plans = [
    { user_id: "a", ski_date: "2026-09-01", resort_key: "vail" },
    { user_id: "b", ski_date: "2026-09-01", resort_key: "breckenridge" },
  ]
  assert.equal(computeNextOut(["a", "b"], plans), null)
})

test("a single member alone on a date does not count", () => {
  const plans = [{ user_id: "a", ski_date: "2026-09-01", resort_key: "vail" }]
  assert.equal(computeNextOut(["a", "b"], plans), null)
})

test("no plans returns null", () => {
  assert.equal(computeNextOut(["a", "b"], []), null)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test src/lib/crewNextOut.test.js`
Expected: FAIL — `crewNextOut.js` doesn't exist yet.

- [ ] **Step 3: Implement**

```js
/**
 * Earliest upcoming date where 2+ of a crew's members have a daily_plans row
 * at the same resort — the "Next out" line on a Crews-tab card.
 *
 * @param {string[]} memberIds
 * @param {Array<{user_id: string, ski_date: string, resort_key: string}>} plans
 *   Already sorted ascending by ski_date (as getVisiblePlansInRange returns).
 * @returns {{resortKey: string, skiDate: string} | null}
 */
export function computeNextOut(memberIds, plans) {
  const memberSet = new Set(memberIds)
  const seenByKey = new Map() // `${ski_date}|${resort_key}` -> Set(user_id)

  for (const p of plans) {
    if (!memberSet.has(p.user_id)) continue
    const key = `${p.ski_date}|${p.resort_key}`
    if (!seenByKey.has(key)) seenByKey.set(key, new Set())
    seenByKey.get(key).add(p.user_id)
  }

  for (const p of plans) {
    if (!memberSet.has(p.user_id)) continue
    const key = `${p.ski_date}|${p.resort_key}`
    if (seenByKey.get(key).size >= 2) {
      return { resortKey: p.resort_key, skiDate: p.ski_date }
    }
  }
  return null
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test src/lib/crewNextOut.test.js`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crewNextOut.js src/lib/crewNextOut.test.js
git commit -m "feat: add computeNextOut pure helper for crew 'Next out' line"
```

---

### Task 3: `uploadCrewPhoto` in `socialApi.js`

**Files:**
- Modify: `src/lib/socialApi.js` (add new function near `uploadProfilePhoto`, ~line 494)

**Interfaces:**
- Consumes: `supabase` (already imported at the top of this file).
- Produces: `uploadCrewPhoto(crewId, file)` — `crewId: string`, `file: File`. Returns `Promise<string>` (public URL). Throws if `file` is falsy or on a Supabase upload error, same contract as the existing `uploadProfilePhoto`.

- [ ] **Step 1: Add the function**

Insert directly after `uploadProfilePhoto` (after the closing `}` following `return data.publicUrl;` around line 496):

```js
export async function uploadCrewPhoto(crewId, file) {
  if (!file) {
    throw new Error("No file provided.");
  }

  const fileExt = file.name.split(".").pop();
  const filePath = `${crewId}/photo-${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("crew-photos")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("crew-photos").getPublicUrl(filePath);

  return data.publicUrl;
}
```

- [ ] **Step 2: Verify no syntax errors**

Run: `npx eslint src/lib/socialApi.js`
Expected: no new errors introduced (this file already has pre-existing baseline warnings/errors unrelated to this change — don't fix those, just confirm this addition introduces none of its own).

- [ ] **Step 3: Commit**

```bash
git add src/lib/socialApi.js
git commit -m "feat: add uploadCrewPhoto for the crew-photos storage bucket"
```

---

### Task 4: `CrewGroupChat.jsx` — card redesign, member/next-out/unread data, photo picker

**Files:**
- Modify: `src/components/CrewGroupChat.jsx` (846 lines → see exact edits below; unchanged: `CreateCrewModal` lines 38-226, `timeLabel` lines 25-34, `CrewChatView` lines 306-620 except the one wrapper addition in Step 6)

**Interfaces:**
- Consumes (all already exist, do not reimplement):
  - `getMyCrews()`, `getPendingCrewInvites()`, `getCrewMembers(crewId, { includePending })`, `updateCrewGroup(crewId, updates)`, `acceptCrewInvite`, `declineCrewInvite`, `getCurrentUser` — all from `../lib/socialApi`, already imported.
  - `getVisiblePlansInRange(startDate, endDate)` from `../lib/socialApi` (new import) — returns `Array<{ id, user_id, ski_date, resort_key, ... }>`, already RLS-scoped and sorted ascending by `ski_date`.
  - `uploadCrewPhoto(crewId, file)` from `../lib/socialApi` (new import, Task 3).
  - `computeNextOut(memberIds, plans)` from `../lib/crewNextOut` (new import, Task 2).
  - `crewColor(stableIndex)` from `../lib/crewColors` (new import) — same function already coloring crews on the Plans calendar.
  - `localDateKey` from `../lib/calendarDates` (new import).
  - `resortName` from `../lib/resorts` (new import).
  - `useMobile` from `../lib/useMobile` (new import).
  - `Avatar` from `./ui/Avatar` (already imported).
- Produces: `CrewGroupChat` default export gains one new optional prop, `onUnreadChange?: (hasUnread: boolean) => void`, called whenever aggregate crew-message unread state changes. All other props/behavior unchanged from the outside (still `{ friends }`).

- [ ] **Step 1: Update imports**

Replace the import block (lines 1-21) with:

```jsx
import { useEffect, useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import UserProfileModal from "./UserProfileModal"
import Avatar from "./ui/Avatar"
import MediaMessageInput, { MessageMedia } from "./ui/MediaMessageInput"
import { useMobile } from "../lib/useMobile"
import { crewColor } from "../lib/crewColors"
import { computeNextOut } from "../lib/crewNextOut"
import { localDateKey } from "../lib/calendarDates"
import { resortName } from "../lib/resorts"
import {
  createCrew,
  getMyCrews,
  getPendingCrewInvites,
  getCrewMembers,
  getCrewMessages,
  sendCrewMessage,
  inviteToCrewGroup,
  leaveCrewGroup,
  removeCrewMember,
  updateCrewGroup,
  deleteCrew,
  acceptCrewInvite,
  declineCrewInvite,
  getCurrentUser,
  getVisiblePlansInRange,
  uploadCrewPhoto,
} from "../lib/socialApi"
```

- [ ] **Step 2: Add the photo picker to `EditCrewModal`**

In `EditCrewModal` (starts at the `function EditCrewModal({ crew, onSaved, onClose }) {` line), replace its state declarations and `handleSave` with:

```jsx
function EditCrewModal({ crew, onSaved, onClose }) {
  const [name, setName]         = useState(crew.name)
  const [emoji, setEmoji]       = useState(crew.emoji)
  const [description, setDesc]  = useState(crew.description || "")
  const [inviteOnly, setInviteOnly] = useState(crew.invite_only)
  const [photoUrl, setPhotoUrl] = useState(crew.photo_url || null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState("")

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    setError("")
    try {
      const url = await uploadCrewPhoto(crew.id, file)
      setPhotoUrl(url)
    } catch (err) {
      setError(err.message || "Photo upload failed.")
    } finally {
      setUploadingPhoto(false)
      e.target.value = ""
    }
  }

  async function handleSave() {
    if (!name.trim()) { setError("Crew name can't be empty."); return }
    setSaving(true); setError("")
    try {
      await updateCrewGroup(crew.id, { name: name.trim(), emoji, description: description.trim(), invite_only: inviteOnly, photo_url: photoUrl })
      onSaved({ ...crew, name: name.trim(), emoji, description: description.trim(), invite_only: inviteOnly, photo_url: photoUrl })
    } catch (e) {
      setError(e.message || "Failed to save.")
    } finally {
      setSaving(false)
    }
  }
```

Then, immediately after the `{error && ...}` line inside the returned JSX and before the existing `{/* Emoji */}` block, insert:

```jsx
        {/* Photo */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>Crew Photo (optional)</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, overflow: "hidden", background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {photoUrl ? <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 22 }}>{emoji}</span>}
            </div>
            <label style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, cursor: uploadingPhoto ? "default" : "pointer" }}>
              {uploadingPhoto ? "Uploading…" : photoUrl ? "Change photo" : "Upload photo"}
              <input type="file" accept="image/*" onChange={handlePhotoChange} disabled={uploadingPhoto} style={{ display: "none" }} />
            </label>
            {photoUrl && (
              <button onClick={() => setPhotoUrl(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
                Remove
              </button>
            )}
          </div>
        </div>
```

- [ ] **Step 3: Rewrite the default export's state/data-loading**

Replace the default export's opening (from `export default function CrewGroupChat({ friends = [] }) {` through the end of `loadCrews`/`useEffect(() => { loadCrews() }, [])`, i.e. through the line before `async function handleAcceptInvite`) with:

```jsx
const LS_PREFIX = "pd_cr_"
function getLastRead(crewId) {
  try { return localStorage.getItem(LS_PREFIX + crewId) || null } catch { return null }
}
function markRead(crewId) {
  try { localStorage.setItem(LS_PREFIX + crewId, new Date().toISOString()) } catch {}
}

export default function CrewGroupChat({ friends = [], onUnreadChange }) {
  const isMobile = useMobile()
  const [crews, setCrews] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCrew, setSelectedCrew] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [currentUserId, setCurrentUserId] = useState(null)
  const channelRef = useRef(null)

  function notifyUnread(list) {
    onUnreadChange?.(list.some((c) => c.unread))
  }

  async function loadCrews() {
    try {
      const [user, crewData, pending] = await Promise.all([
        getCurrentUser(),
        getMyCrews(),
        getPendingCrewInvites(),
      ])
      setCurrentUserId(user?.id || null)
      setPendingInvites(pending)

      if (crewData.length === 0) {
        setCrews([])
        notifyUnread([])
        return
      }

      const crewIds = crewData.map((c) => c.id)
      const today = localDateKey()
      const horizon = localDateKey(new Date(Date.now() + 30 * 86400000))

      const [membersByCrewArr, visiblePlans, recentMsgsRes] = await Promise.all([
        Promise.all(crewData.map((c) => getCrewMembers(c.id))),
        getVisiblePlansInRange(today, horizon).catch(() => []),
        supabase
          .from("crew_messages")
          .select("crew_id, created_at")
          .in("crew_id", crewIds)
          .order("created_at", { ascending: false })
          .limit(Math.min(crewIds.length * 6, 120)),
      ])

      const lastMsgByCrewId = {}
      for (const msg of (recentMsgsRes.data || [])) {
        if (!lastMsgByCrewId[msg.crew_id]) lastMsgByCrewId[msg.crew_id] = msg
      }

      const enriched = crewData.map((crew, i) => {
        const members = membersByCrewArr[i]
        const memberIds = members.map((m) => m.profile?.id).filter(Boolean)
        const lastMessage = lastMsgByCrewId[crew.id] || null
        const lastRead = getLastRead(crew.id)
        const unread = !!(lastMessage && (!lastRead || new Date(lastMessage.created_at) > new Date(lastRead)))
        return { ...crew, members, nextOut: computeNextOut(memberIds, visiblePlans), unread }
      })
      setCrews(enriched)
      notifyUnread(enriched)
    } catch (e) {
      console.warn("Crews load error:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCrews() }, [])

  useEffect(() => {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    channelRef.current = supabase
      .channel("crew-list-unread")
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "crew_messages",
      }, (payload) => {
        const crewId = payload.new?.crew_id
        if (!crewId) return
        setCrews((prev) => {
          const inList = prev.some((c) => c.id === crewId)
          if (!inList) return prev
          const next = prev.map((c) =>
            c.id === crewId
              ? { ...c, lastMessage: payload.new, unread: c.id !== selectedCrew?.id }
              : c
          )
          notifyUnread(next)
          return next
        })
      })
      .subscribe()
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [selectedCrew?.id])

  function openCrew(crew) {
    markRead(crew.id)
    setCrews((prev) => {
      const next = prev.map((c) => c.id === crew.id ? { ...c, unread: false } : c)
      notifyUnread(next)
      return next
    })
    setSelectedCrew(crew)
  }

```

- [ ] **Step 4: Update the remaining handlers to use `loadCrews`/`crews` (rename, no behavior change)**

The existing `handleAcceptInvite`, `handleDeclineInvite`, `handleCreated`, `handleLeft` functions (originally right after `loadCrews`) are unchanged in body — keep them as-is, they already call `loadCrews()`. Only change: in `handleAcceptInvite`, replace the line `const accepted = await getMyCrews()` + `const crew = accepted.find((c) => c.id === crewId)` + `if (crew) setSelectedCrew(crew)` with a call through the new `openCrew` for consistent unread-marking:

```jsx
  async function handleAcceptInvite(crewId) {
    try {
      await acceptCrewInvite(crewId)
      await loadCrews()
      const accepted = await getMyCrews()
      const crew = accepted.find((c) => c.id === crewId)
      if (crew) openCrew(crew)
    } catch (e) {
      console.error("Accept invite error:", e)
    }
  }
```

(`handleDeclineInvite`, `handleCreated`, `handleLeft` stay exactly as they are today.)

- [ ] **Step 5: Wrap the `CrewChatView` branch in a height-bounded container**

Replace the existing `if (selectedCrew) { return <CrewChatView ... /> }` block with:

```jsx
  if (selectedCrew) {
    const containerHeight = isMobile ? "calc(100dvh - 88px)" : "calc(100dvh - 132px)"
    return (
      <div style={{
        height: containerHeight,
        background: "rgba(4,8,20,0.85)",
        borderRadius: isMobile ? 0 : 18,
        overflow: "hidden",
        border: isMobile ? "none" : "1px solid rgba(255,255,255,0.07)",
      }}>
        <CrewChatView
          crew={selectedCrew}
          currentUserId={currentUserId}
          friends={friends}
          onBack={() => setSelectedCrew(null)}
          onLeft={handleLeft}
        />
      </div>
    )
  }
```

(This restores the same viewport-relative height treatment `MessagingCenter.jsx` used to provide — `CrewChatView`'s internal message list needs a bounded ancestor height to scroll correctly instead of growing the whole page.)

- [ ] **Step 6: Replace the crew card list rendering**

Replace the final `<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{crews.map((crew) => ( <button ...> ... </button> ))}</div>` block (the crew-card list) with:

```jsx
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {crews.map((crew, i) => {
          const color = crewColor(i)
          const visibleMembers = crew.members.slice(0, 4)
          const overflowCount = crew.members.length - visibleMembers.length
          return (
            <button
              key={crew.id}
              onClick={() => openCrew(crew)}
              style={{
                position: "relative", display: "flex", alignItems: "center", gap: 14,
                padding: "14px 16px", borderRadius: 16, cursor: "pointer",
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                textAlign: "left", width: "100%",
              }}
            >
              {crew.unread && (
                <span style={{ position: "absolute", top: 10, right: 10, width: 9, height: 9, borderRadius: "50%", background: "var(--color-accent-strong)" }} />
              )}

              {/* Icon: photo if set, else flat color dot */}
              {crew.photo_url ? (
                <img src={crew.photo_url} alt="" style={{ width: 48, height: 48, borderRadius: 14, objectFit: "cover", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 12, height: 12, borderRadius: 4, background: color, flexShrink: 0 }} />
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {crew.name}
                  </div>
                  {crew.myRole === "admin" && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: "var(--color-warning)", background: "rgba(251,191,36,0.15)", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>
                      ADMIN
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                  {crew.members.length} member{crew.members.length !== 1 ? "s" : ""}
                </div>
                {crew.nextOut && (
                  <div style={{ fontSize: 12, color: "var(--color-accent-soft)", marginTop: 3 }}>
                    Next out: {resortName(crew.nextOut.resortKey) || crew.nextOut.resortKey} · {new Date(crew.nextOut.skiDate + "T12:00:00").toLocaleDateString([], { weekday: "short" })}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexShrink: 0 }}>
                {visibleMembers.map((m, idx) => (
                  <div key={m.id} style={{ marginLeft: idx === 0 ? 0 : -8, border: "2px solid rgba(10,14,26,1)", borderRadius: "50%" }}>
                    <Avatar profile={m.profile} size={26} />
                  </div>
                ))}
                {overflowCount > 0 && (
                  <div style={{ marginLeft: -8, width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "2px solid rgba(10,14,26,1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.6)" }}>
                    +{overflowCount}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
```

- [ ] **Step 7: Verify build and lint**

Run: `npm run build`
Expected: succeeds with no new errors.

Run: `npx eslint src/components/CrewGroupChat.jsx`
Expected: no new errors beyond whatever pre-existing baseline issues (if any) were already in this file before this task.

- [ ] **Step 8: Commit**

```bash
git add src/components/CrewGroupChat.jsx
git commit -m "feat: redesign Crews sub-tab cards (color dot/photo, members, next out, unread)"
```

---

### Task 5: `FriendsPage.jsx` — minimal props to hide its own tab bar

**Files:**
- Modify: `src/components/FriendsPage.jsx:191`, `:208`, `:430-455`

**Interfaces:**
- Produces: `FriendsPage` default export gains two new optional props, both backward-compatible (grep confirms `FriendsPage` has exactly one caller today, `MessagingCenter.jsx`, so no other caller can be broken):
  - `hideTabBar?: boolean` (default `false`) — when `true`, suppresses rendering of the component's own internal Leaderboard/Crews/Friends/Community pill bar.
  - `initialSection?: string` (default `"leaderboard"`, matching today's existing default) — sets the initial `activeSection` value.

- [ ] **Step 1: Update the function signature**

Change line 191 from:

```jsx
export default function FriendsPage({ hideCrew = false, onMessageFriend = null }) {
```

to:

```jsx
export default function FriendsPage({ hideCrew = false, onMessageFriend = null, hideTabBar = false, initialSection = "leaderboard" }) {
```

- [ ] **Step 2: Use the new prop for the initial state**

Change line 208 from:

```jsx
  const [activeSection, setActiveSection]     = useState("leaderboard")
```

to:

```jsx
  const [activeSection, setActiveSection]     = useState(initialSection)
```

- [ ] **Step 3: Gate the tab bar render**

Wrap the existing top tab bar block (lines 430-455, the `{/* ── Top tab bar ── */}` comment through its closing `</div>`) in a conditional:

```jsx
      {/* ── Top tab bar ── */}
      {!hideTabBar && (
        <div style={{ display: "flex", gap: 2, marginBottom: 16, background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 4 }}>
          {[
            { key: "leaderboard", label: "🏆 Friend Leaderboard" },
            ...(hideCrew ? [] : [{ key: "crews", label: "🤙 Crews" }]),
            { key: "friends",     label: "👥 Friends" },
            { key: "community",   label: "🎿 Community" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setActiveSection(key)} style={{
              flex: 1, padding: "11px 8px", borderRadius: 9, border: "none", cursor: "pointer",
              fontWeight: 800, fontSize: 14, minHeight: 44,
              background: activeSection === key ? "rgba(255,255,255,0.14)" : "transparent",
              color: activeSection === key ? "white" : "rgba(255,255,255,0.4)",
              position: "relative",
            }}>
              {label}
              {key === "friends" && incomingRequests.length > 0 && (
                <span style={{
                  position: "absolute", top: 6, right: 8,
                  width: 7, height: 7, borderRadius: 999,
                  background: "var(--color-danger)",
                }} />
              )}
            </button>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Verify existing behavior is unchanged when the new props are omitted**

Run: `npm run build`
Expected: succeeds. Since `MessagingCenter.jsx` isn't updated to pass the new props until Task 6, this task alone doesn't change any rendered output yet — confirm by reading the diff: the only behavioral difference possible is when `hideTabBar`/`initialSection` are explicitly passed, which nothing does yet.

- [ ] **Step 5: Commit**

```bash
git add src/components/FriendsPage.jsx
git commit -m "feat: add optional hideTabBar/initialSection props to FriendsPage"
```

---

### Task 6: `MessagingCenter.jsx` — new tab bar, routing, drop dead code

**Files:**
- Modify: `src/components/MessagingCenter.jsx` (846 lines → full rewrite of the file body; imports and entire component replaced)

**Interfaces:**
- Consumes: `CrewGroupChat` with new `onUnreadChange` prop (Task 4); `FriendsPage` with new `hideTabBar`/`initialSection` props (Task 5); existing default exports `ActivityFeed`, `SkiBuddyBoard`, `LeaderboardPage`, `DirectMessageView`; existing `getCurrentUser`, `getAcceptedFriends`, `getDMConversations`, `markDMsRead` from `../lib/socialApi`; existing `useMobile` from `../lib/useMobile`; existing `supabase` from `../lib/supabase`.
- Produces: `MessagingCenter` default export — same as before, no props, no exports consumed elsewhere change (grep confirms no other file imports anything from this file besides the default export itself, used by `App.jsx`'s Crew tab).

This task **deletes** the following, now-dead: the local `CreateCrewModal` (duplicate of `CrewGroupChat.jsx`'s own, unreachable once Crews routes through `CrewGroupChat` wholesale), `EmptyChat`, `ConversationRow`, `InviteRow`, the `panel`/`filter`/`selectedCrew`/`conversations`/`pendingInvites`/`pendingFriendCount`/`acceptingId`/`showCreate`/`showPingComposer`/`showDateMatchmaker` state, the merged-inbox `loadInbox`/realtime-subscription logic for crews, and the `NotificationBell` render (already present globally in `TopNav`/`MobileTopBar` per the app-wide branding work — this was a redundant second instance).

- [ ] **Step 1: Replace the entire file**

```jsx
import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "../lib/supabase"
import { useMobile } from "../lib/useMobile"
import { getCurrentUser, getAcceptedFriends, getDMConversations, markDMsRead } from "../lib/socialApi"
import CrewGroupChat from "./CrewGroupChat"
import FriendsPage from "./FriendsPage"
import ActivityFeed from "./ActivityFeed"
import SkiBuddyBoard from "./SkiBuddyBoard"
import LeaderboardPage from "./LeaderboardPage"
import DirectMessageView from "./DirectMessageView"

const TABS = [
  { key: "crews",       label: "Crews" },
  { key: "friends",     label: "Friends" },
  { key: "feed",        label: "Feed" },
  { key: "board",       label: "Board" },
  { key: "leaderboard", label: "Leaderboard" },
]

export default function MessagingCenter() {
  const isMobile = useMobile()
  const [crewSubTab, setCrewSubTab] = useState("crews")
  const [selectedDM, setSelectedDM] = useState(null)
  const [dmConversations, setDmConversations] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [friends, setFriends] = useState([])
  const [hasUnreadCrewMsg, setHasUnreadCrewMsg] = useState(false)
  const channelRef = useRef(null)

  const loadInbox = useCallback(async () => {
    try {
      const user = await getCurrentUser()
      setCurrentUser(user)
      const [friendList, dms] = await Promise.all([
        getAcceptedFriends(),
        getDMConversations().catch(() => []),
      ])
      setFriends(friendList || [])
      setDmConversations(dms || [])
    } catch (e) {
      console.warn("MessagingCenter load error:", e)
    }
  }, [])

  useEffect(() => { loadInbox() }, [loadInbox])

  useEffect(() => {
    if (!currentUser) return
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    channelRef.current = supabase
      .channel("msg-center-dms")
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "direct_messages",
      }, (payload) => {
        const msg = payload.new
        if (!msg) return
        const uid = currentUser?.id
        if (!uid) return
        const isFromMe = msg.sender_id === uid
        const partnerId = isFromMe ? msg.recipient_id : msg.sender_id
        setDmConversations((prev) => {
          const existing = prev.find((d) => d.partnerId === partnerId)
          if (!existing) { loadInbox(); return prev }
          return prev.map((d) =>
            d.partnerId === partnerId
              ? { ...d, lastMessage: msg, unread: !isFromMe && selectedDM?.partnerId !== partnerId }
              : d
          )
        })
      })
      .subscribe()

    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [currentUser, loadInbox, selectedDM?.partnerId])

  function openDM(dm) {
    if (dm.partnerId) markDMsRead(dm.partnerId).catch(() => {})
    setDmConversations((prev) => prev.map((d) => d.partnerId === dm.partnerId ? { ...d, unread: false } : d))
    setSelectedDM(dm)
  }

  function handleMessageFriend(friend) {
    const existing = dmConversations.find((d) => d.partnerId === friend.id)
    openDM(existing || { partnerId: friend.id, partner: friend, lastMessage: null, unread: false })
  }

  const hasUnreadDM = dmConversations.some((d) => d.unread)

  if (selectedDM) {
    const containerHeight = isMobile ? "calc(100dvh - 88px)" : "calc(100dvh - 132px)"
    return (
      <div style={{
        height: containerHeight,
        background: "rgba(4,8,20,0.85)",
        borderRadius: isMobile ? 0 : 18,
        overflow: "hidden",
        border: isMobile ? "none" : "1px solid rgba(255,255,255,0.07)",
      }}>
        <DirectMessageView
          partner={selectedDM.partner}
          partnerId={selectedDM.partnerId}
          currentUser={currentUser}
          onBack={() => setSelectedDM(null)}
        />
      </div>
    )
  }

  return (
    <div style={{ padding: "0 0 80px", color: "var(--color-text-1)" }}>
      <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5, color: "white", marginBottom: 14 }}>
        Crew
      </div>

      <div className="pd-x" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 16 }}>
        {TABS.map(({ key, label }) => {
          const active = crewSubTab === key
          const showDot = (key === "crews" && hasUnreadCrewMsg) || (key === "friends" && hasUnreadDM)
          return (
            <button
              key={key}
              onClick={() => setCrewSubTab(key)}
              style={{
                position: "relative", flexShrink: 0,
                padding: "8px 16px", borderRadius: 999, fontSize: 13, fontWeight: 800, cursor: "pointer",
                background: active ? "var(--color-accent)" : "rgba(255,255,255,0.05)",
                color: active ? "var(--color-bg)" : "rgba(255,255,255,0.6)",
                border: active ? "1px solid var(--color-accent)" : "1px solid rgba(255,255,255,0.1)",
                whiteSpace: "nowrap",
              }}
            >
              {label}
              {showDot && (
                <span style={{ position: "absolute", top: -2, right: -2, width: 9, height: 9, borderRadius: "50%", background: "var(--color-accent-strong)", border: "2px solid rgba(6,10,22,1)" }} />
              )}
            </button>
          )
        })}
      </div>

      {crewSubTab === "crews" && (
        <CrewGroupChat friends={friends} onUnreadChange={setHasUnreadCrewMsg} />
      )}
      {crewSubTab === "friends" && (
        <FriendsPage hideTabBar initialSection="friends" onMessageFriend={handleMessageFriend} />
      )}
      {crewSubTab === "feed" && <ActivityFeed />}
      {crewSubTab === "board" && <SkiBuddyBoard />}
      {crewSubTab === "leaderboard" && <LeaderboardPage />}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds with no errors. Watch specifically for unused-import lint errors (the old imports `getMyCrews`, `getPendingCrewInvites`, `acceptCrewInvite`, `declineCrewInvite`, `createCrew`, `getIncomingFriendRequests`, `SkiPingComposer`, `DateMatchmakerComposer`, `NotificationBell`, `Avatar`, `timeAgo` should all be gone from this file's imports now — they aren't in the Step 1 import list above, confirm none were missed).

- [ ] **Step 3: Verify no other file breaks**

Run: `grep -rn "MessagingCenter" src --include="*.jsx" | grep -v "MessagingCenter.jsx:"`
Expected: only `App.jsx`'s import/render of the default export — confirms nothing else depended on internals this rewrite removed.

- [ ] **Step 4: Run full test suite and lint**

Run: `npm test`
Expected: same pass count as the fresh-worktree baseline recorded at the start of this plan's execution (this task touches no `src/lib` logic, so the count should be unchanged from Task 2's addition).

Run: `npx eslint .`
Expected: at or below the fresh-worktree baseline.

- [ ] **Step 5: Commit**

```bash
git add src/components/MessagingCenter.jsx
git commit -m "refactor: rebuild Crew tab as a 5-way tab router, drop dead chat-inbox code"
```

---

## Self-Review Notes (for the plan author, already applied above)

- **Spec coverage:** §3.1 (tab bar, default tab, unread dots, routing) → Task 6. §3.2 (card redesign, icon/members/next-out/unread) → Task 4 Steps 3-6. §3.3 (photo upload) → Tasks 1, 3, 4 Step 2. §3.4 (member/next-out data) → Tasks 2, 4 Step 3. §3.5 (migration) → Task 1. FriendsPage tab-bar bypass (spec's revised architecture-table row) → Task 5.
- **Type consistency checked:** `computeNextOut`'s return shape `{ resortKey, skiDate }` (Task 2) matches exactly what Task 4 Step 6 destructures (`crew.nextOut.resortKey`, `crew.nextOut.skiDate`). `onUnreadChange` prop name matches between Task 4's `CrewGroupChat` definition and Task 6's `MessagingCenter` usage. `hideTabBar`/`initialSection` prop names match between Task 5's `FriendsPage` definition and Task 6's usage.
- **No placeholders:** every step above has real, complete code — nothing deferred to "implement later."
