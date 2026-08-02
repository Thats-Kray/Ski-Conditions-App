# Sprint 10 — Home Dashboard 3-Card Feed

**Goal:** ROADMAP TASK 1.1 / UX_CLEANUP TASK 4 — replace `HomeDashboard.jsx`'s current 5-panel layout (conditions widget, plans widget, leaderboard ticker, messaging panel) with exactly 3 cards: Today's Best Mountain, Your Next Trip (or pending invite), Who's Skiing Today.
**Estimated effort:** 2 days
**Depends on:** Sprint 8 (UI component library) merged — the 3 new cards should use `Card`, `Badge`, `ScoreRing`, `SnowStat` from `src/components/ui/`.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**Read `src/components/HomeDashboard.jsx` (1068 lines) in full before starting.** This plan gives you exact line ranges and code as of the current commit, but line numbers will shift as you edit — re-locate each block by content, not by trusting a stale line number after your first edit.

**Current import list (top of file):**
```js
import { useState, useEffect, useCallback, useRef } from "react"
import { useMobile } from "../lib/useMobile"
import { supabase } from "../lib/supabase"
import {
  getMyCrews,
  getAcceptedFriends,
  getAllVisibleTrips,
  getMyTripConversations,
  getCurrentUser,
  getDMConversations,
  markDMsRead,
} from "../lib/socialApi"
import DirectMessageView from "./DirectMessageView"
import { getLeaderboard, getCurrentSeason } from "../lib/leaderboardApi"
import { CrewChatView } from "./CrewGroupChat"
import TripDetailModal from "./TripDetailModal"
import TripChatView, { tripDisplayName } from "./TripChatView"
import { resortName, resortEmoji } from "../lib/resorts"
import { timeAgo } from "../lib/format"
import Avatar from "./ui/Avatar"
import { SkiPingComposer } from "./SkiPingModal"
```
Note `getCurrentUser` is imported but already unused in this file today (dead import predating this sprint — remove it in S10-T4 regardless of your other changes).

**Current structure (5 sections, by line range):**
1. `ConditionsWidget` (lines 103–169) — shows the **top 3** resorts ranked by `powderScore`, with a "View All →" button. This is the closest existing analog to Card 1, but shows 3 resorts, not 1 — Card 1 replaces it with a single top resort.
2. `PlansWidget` (lines 293–466) — shows up to 3 upcoming trips (mine/going/invited merged), with a "+" button and a "View All Plans →" button. No Accept/Decline UI for pending invites today. Closest analog to Card 2, but Card 2 needs invite-detection + inline Accept/Decline that doesn't exist yet in this file.
3. `LeaderboardTicker` (lines 472–559) — **being removed entirely** (component definition + both render call sites).
4. `MessagingWidget` (lines 563–781) — **being removed entirely** (desktop-only messaging panel: conversation list + thread view).
5. `MobileCrewListWidget` (lines 785–901) — a simpler, mobile-only "crew list" that deep-links to the friends tab (`onTabChange("friends")`). This is a **distinct component from `MessagingWidget`**, not automatically in scope for removal. Read it in full and decide (S10-T5): if it renders essentially the same "who's checked in / skiing today" data that Card 3 will show, delete it and let Card 3 cover mobile too; if it renders something structurally different (e.g. a generic friends list unrelated to today's activity), leave it in place below the 3-card feed rather than forcing a lossy merge.

**Render call sites (current):**
- `LeaderboardTicker`: mobile layout line 1031, desktop layout line 1059.
- `MessagingWidget`: desktop layout only, line 1062.
- Component signature: `export default function HomeDashboard({ resorts, currentUser, onTabChange })` (line 1040). Called from `src/App.jsx` lines 1426–1432 with exactly those 3 props — you are not changing the props contract, only what's rendered inside.

**`onTabChange` pattern already used in this file (replicate for new cards' "view all" links):**
```jsx
onClick={() => onTabChange("dashboard")}   // → Snow/Conditions tab (note the tab KEY is "dashboard", not "snow")
onClick={() => onTabChange("plans")}       // → Plans tab
onClick={() => onTabChange("friends")}     // → Social tab
```

**Resort object shape** (each item in the `resorts` prop, assembled in `App.jsx`'s `refresh()`): `resortKey, name, pass, isOpen, powderScore, powderTier, snowPrev24in, snowPrev48in, snow24in, snow48in, baseDepth, liftsOpen, liftsTotal, runsOpen, runsTotal, driveRisk, ...`. Use `resortName(resortKey)` / `resortEmoji(resortKey)` from `../lib/resorts` for display, matching existing convention in `ConditionsWidget`.

**`daily_plans` / "who's skiing today" data source:** `src/lib/socialApi.js` exports `getTodaysVisiblePlans(skiDate)` (used today only by `src/components/TodaysCrew.jsx`) — it joins `daily_plans` with `profiles` and returns rows for friends + self for the given date. `skiDate` should be computed the same way `SkiCheckInForm.jsx` does it: `new Date().toISOString().slice(0, 10)`.

---

## Tasks

Build the 3 new card components first (S10-T1, S10-T2, S10-T3 — independent of each other), then remove the old panels and wire the new ones in (S10-T4, S10-T5, in that order since T5 depends on T4's import cleanup being done first to avoid editing the same import block twice).

---

### S10-T1 — Card 1: Today's Best Mountain

**File to modify:** `src/components/HomeDashboard.jsx` (add this as a new local component in the file, near where `ConditionsWidget` currently is — you'll delete `ConditionsWidget` in S10-T5)

```jsx
import Card from "./ui/Card"
import Badge, { TIER_COLORS } from "./ui/Badge"
import ScoreRing from "./ui/ScoreRing"
import SnowStat from "./ui/SnowStat"

function TodaysBestMountainCard({ resorts, onTabChange }) {
  const best = [...(resorts || [])]
    .filter((r) => r.isOpen && r.powderScore != null)
    .sort((a, b) => b.powderScore - a.powderScore)[0]

  if (!best) {
    return (
      <Card>
        <div style={{ fontSize: 13, color: "var(--color-text-2)" }}>
          No resorts open right now — check back for the season opener.
        </div>
      </Card>
    )
  }

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--color-text-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Today's Best Mountain
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2 }}>
            {resortEmoji(best.resortKey)} {resortName(best.resortKey)}
          </div>
          <div style={{ marginTop: 6 }}>
            <Badge label={best.powderTier ?? "Closed"} color={TIER_COLORS[best.powderTier] ?? TIER_COLORS.Closed} />
          </div>
        </div>
        <ScoreRing score={best.powderScore} tier={best.powderTier ?? "Closed"} size={64} strokeWidth={6} />
      </div>
      <div style={{ display: "flex", gap: 20 }}>
        <SnowStat icon="❄️" label="Snow 24h" value={best.snowPrev24in ?? "—"} unit="in" />
        <SnowStat icon="🚗" label="Drive Risk" value={best.driveRisk ?? "—"} />
      </div>
      <button
        onClick={() => onTabChange("dashboard")}
        style={{ background: "none", border: "none", color: "var(--color-accent)", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, textAlign: "left" }}
      >
        View All Resorts →
      </button>
    </Card>
  )
}
```

**Acceptance criteria:**
- With `resorts` containing at least one open resort with a non-null `powderScore`, the card shows that resort's name, tier badge, score ring, 24h snow, and drive risk.
- With all resorts closed or `powderScore == null`, the card shows the empty-state message and does not crash.
- Clicking "View All Resorts →" calls `onTabChange("dashboard")`.

---

### S10-T2 — Card 2: Your Next Trip / pending invite

**File to modify:** `src/components/HomeDashboard.jsx`

**Before writing this card, read `src/components/SkiPlansPage.jsx` in full.** Its already-complete Task 6 (per `UX_CLEANUP.md`) implements a "pending invite" banner above a flat, deduped, `ski_date`-sorted trip list (`flatTrips`), using a `deletedIds` Set for optimistic removal. Card 2 needs the **same invite-detection logic** — identify exactly how `SkiPlansPage.jsx` determines a trip is a "pending invite" for the current user (what field/table it checks — this may be a specific RSVP status, a `crew_invites` row, or a flag on the trip object returned by `getAllVisibleTrips()`), and reuse that same check here rather than inventing new invite-detection logic. Do not guess at the shape — read the actual code.

**Card structure (two states):**

**State A — has a pending invite:** show the invite's resort + date + host, with inline "Accept" / "Decline" buttons that call the same RSVP mutation `SkiPlansPage.jsx`/`TripDetailModal.jsx` use (`rsvpToTrip(tripId, status)`, exported from `src/lib/socialApi.js`) with `status: "going"` (Accept) or `status: "cantgo"` (Decline). Optimistically remove the invite from view on click, matching the optimistic-update convention already used elsewhere in this codebase (F-REQ-020 in the PRD: optimistic update with silent rollback on error).

**State B — no pending invite:** show the next upcoming trip (soonest `ski_date` from `getAllVisibleTrips()`, already imported in this file and used by the current `PlansWidget`) with date, resort, and going-count. If there are zero upcoming trips at all, show an empty state: "Plan a ski day with your crew →" button.

For the empty-state button: **read `src/components/CreateTripModal.jsx`'s exported function signature and props before wiring it up** — it is not currently imported into `HomeDashboard.jsx`. Add the import and the open/close modal state (`const [showCreateTrip, setShowCreateTrip] = useState(false)`) following whatever prop contract `CreateTripModal.jsx` actually expects (check how it's invoked from `SkiPlansPage.jsx`, which already uses it, for the exact prop list — likely `onClose` and a success callback, possibly `currentUser`).

**Acceptance criteria:**
- If the current user has at least one pending invite, it's shown first with working Accept/Decline buttons that call `rsvpToTrip`.
- If no pending invite but at least one upcoming trip exists, that trip is shown with date/resort/going-count.
- If neither exists, the empty state renders and its CTA opens `CreateTripModal`.
- A "See all trips →" link calls `onTabChange("plans")`.

---

### S10-T3 — Card 3: Who's Skiing Today

**File to modify:** `src/components/HomeDashboard.jsx`

This is new — no existing "who's skiing today" widget currently lives in `HomeDashboard.jsx` (that data currently only surfaces via `TodaysCrew.jsx`, rendered inside `SkiPlansPage.jsx`'s "Today" sub-tab, which sprint-11 removes). Build a **compact** version here using the same data source, not by embedding the full `TodaysCrew.jsx` component (that component includes driving/arrived status controls designed for a full-page context, not a compact home-feed card).

```jsx
import { getTodaysVisiblePlans } from "../lib/socialApi"

function WhosSkiingTodayCard({ onTabChange }) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const today = new Date().toISOString().slice(0, 10)
    getTodaysVisiblePlans(today)
      .then((rows) => { if (!cancelled) setPlans(rows || []) })
      .catch(() => { if (!cancelled) setPlans([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 11, color: "var(--color-text-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Who's Skiing Today
      </div>
      {loading ? (
        <div style={{ fontSize: 13, color: "var(--color-text-3)" }}>Loading…</div>
      ) : plans.length === 0 ? (
        <button
          onClick={() => onTabChange("plans")}
          style={{ background: "none", border: "none", color: "var(--color-accent)", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, textAlign: "left" }}
        >
          Be the first to check in today →
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {plans.slice(0, 5).map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar profile={p.profiles ?? p.profile} size={28} />
              <div style={{ fontSize: 13 }}>
                <strong>{p.profiles?.full_name ?? p.profile?.full_name ?? "Someone"}</strong>{" "}
                <span style={{ color: "var(--color-text-3)" }}>· {resortName(p.resort_key)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
```

Note: `getTodaysVisiblePlans`'s return shape (the joined `profiles` relation's key name — `p.profiles` vs `p.profile`) is written above as a best guess based on Supabase's default embedded-resource naming convention. **Verify the actual key by reading `TodaysCrew.jsx`'s render code** (it already consumes this same function's output) before finalizing — adjust the property access to match exactly what that file uses.

**Acceptance criteria:**
- Shows up to 5 people skiing today with avatar + name + resort.
- Empty state shows the "Be the first to check in today →" CTA, which calls `onTabChange("plans")`.
- Does not crash if `getTodaysVisiblePlans` rejects (network error) — falls back to the empty-state render.

---

### S10-T4 — Remove messaging panel, leaderboard ticker, and now-unused imports

**File to modify:** `src/components/HomeDashboard.jsx`

**Step 1 — Delete `MessagingWidget`** (component definition, currently lines 563–781) and its single desktop render call site (currently line 1062).

**Step 2 — Delete `LeaderboardTicker`** (component definition, currently lines 472–559) and both render call sites (currently mobile line 1031, desktop line 1059).

**Step 3 — Delete `ConditionsWidget`** (lines 103–169) and `PlansWidget` (lines 293–466) — both are fully superseded by Cards 1 and 2 from S10-T1/S10-T2. Find and remove their render call sites too.

**Step 4 — Clean up imports.** For each of `getMyCrews`, `getDMConversations`, `getMyTripConversations`, `markDMsRead`, `getLeaderboard`, `getCurrentSeason`, `DirectMessageView`, `CrewChatView`, `TripChatView`, `tripDisplayName`: run `grep -n "<name>" src/components/HomeDashboard.jsx` **after** completing Steps 1–3, and remove the import only if it now has zero remaining usages in the file. Do not blindly remove all of them — `TripDetailModal` in particular is very likely still needed (e.g. for viewing trip details from Card 2) and must stay; verify each one individually. `getCurrentUser` should be removed regardless (confirmed dead-unused even before this sprint).

**Acceptance criteria:**
- `grep -c "MessagingWidget\|LeaderboardTicker\|ConditionsWidget\|PlansWidget" src/components/HomeDashboard.jsx` returns `0`.
- No import remains in the file for anything with zero usages remaining (verify per-symbol via grep, not by assumption).
- `npm run build` succeeds (a stray unused import doesn't break the build, but an import of something that no longer exists, or a missing import for something still used, will — this is your real signal).

---

### S10-T5 — Wire the 3 cards into mobile and desktop layouts

**File to modify:** `src/components/HomeDashboard.jsx`

**Step 1 — Decide `MobileCrewListWidget`'s fate** (lines 785–901 pre-edit — re-locate by content). Per the Project Context above: if it shows essentially the same "who's checked in / skiing today" data as Card 3, delete it and let Card 3 serve mobile too. If it shows something structurally different, leave it rendered below the 3-card feed on mobile only.

**Step 2 — Restructure `MobileHomeDashboard`** (the mobile layout function) to render, in order: `<TodaysBestMountainCard resorts={resorts} onTabChange={onTabChange} />`, `<NextTripCard ... />` (from S10-T2, with whatever props it needs — `currentUser`, `onTabChange`, and access to `getAllVisibleTrips`), `<WhosSkiingTodayCard onTabChange={onTabChange} />`, plus `MobileCrewListWidget` only if Step 1 decided to keep it, plus the existing `PingCta` element if it's still present elsewhere in the file (from UX_CLEANUP Task 8, already complete — do not remove it, it's unrelated to this sprint).

**Step 3 — Restructure the desktop layout** (the default export's non-mobile return, currently the tail of the file after ~line 1040) to render the same 3 cards in a single vertical column (per ROADMAP: "3-card feed" — this replaces the previous multi-column desktop layout with mobile-style rows, not a new desktop-specific grid). If the existing desktop return has other unrelated rows (e.g. a page header) above where the panels used to render, keep those and only replace the panel section.

**Step 4 — Verify in browser:**
```bash
npm run dev
```
Log in as a user with: at least one open resort with live data, at least one pending trip invite (if you can arrange test data — otherwise verify the "no pending invite, has upcoming trip" and "no trips at all" states individually), and at least one other user checked in today (or verify the empty state). Confirm exactly 3 cards render on both mobile viewport width and desktop width, in the documented order, with no messaging panel or leaderboard ticker visible anywhere on Home.

**Step 5 — Build check:**
```bash
npm run build
```

**Step 6 — Commit:**
```bash
git add src/components/HomeDashboard.jsx
git commit -m "feat: simplify Home to 3-card feed (best mountain, next trip, who's skiing today)"
```

---

## Sprint Acceptance Criteria

- [ ] `HomeDashboard.jsx` renders exactly 3 cards on both mobile and desktop: Today's Best Mountain, Your Next Trip (or pending invite), Who's Skiing Today
- [ ] Messaging panel and leaderboard ticker are fully removed (component definitions + all render call sites)
- [ ] `ConditionsWidget` and `PlansWidget` are removed, superseded by the new cards
- [ ] Pending invites show inline Accept/Decline that call `rsvpToTrip`
- [ ] Empty states are handled for: no open resorts, no pending invite + no upcoming trips, nobody checked in today
- [ ] All now-unused imports are removed; all still-used imports remain
- [ ] `npm run build` succeeds
- [ ] Verified in browser at both mobile and desktop widths

## Out of Scope for This Sprint

- Moving the "Check In Today" CTA onto Home — that's sprint-11 (ROADMAP TASK 1.2), which lands after this sprint.
- Any change to `SkiPlansPage.jsx`, `MessagingCenter.jsx`, or `LeaderboardPage.jsx` — those pages keep their own full messaging/leaderboard UIs; only Home's redundant copies are removed.
- Building a new invite/RSVP data model — Card 2 reuses whatever `SkiPlansPage.jsx` already has.
</content>
