# Sprint 35 — Social Tab Cleanup & the Friends Calendar

> **STATUS: PARTIAL PLAN.** Only **Task 1** below is specified and executable — it was
> designed during Sprint 34 and deliberately deferred to here. Sections 2 and 3 are
> **carried-over context, not plans**: the Social tab IA and the friends-calendar view
> are design work that must go through `superpowers:brainstorming` first. Do not
> implement them from this document.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> or superpowers:executing-plans for Task 1. Steps use checkbox (`- [ ]`) syntax.

**Goal (Task 1):** Stop a single failed request from blanking the entire Social tab, without
making failures invisible.

**Tech Stack:** React 19 (no router), Supabase JS v2, inline `style={{}}` objects only.
No new dependencies. No test framework in this repo — verification is a forced-failure
browser check, described at the end of the task.

## Global Constraints

- **No new npm dependencies.**
- **Inline styles only** — no CSS modules, no Tailwind. Colors via `var(--color-*)` tokens,
  except where a value feeds a hex-alpha template literal (`` `${c}22` ``), which must stay literal hex.
- **`profiles` queries use explicit column lists.** Never `select("*")`, never a bare
  `.select()` after a write — migration 031 revoked table-level SELECT. See
  `PROFILE_SELECT_COLUMNS` in `src/lib/socialApi.js`.
- **`npm run lint` baseline is 91 problems** as of `2fe6613`. Diff against that.
- Commit after the task. Branch from `main`.

---

## Task 1: Per-block load resilience in `FriendsPage`

**Files:**
- Modify: `src/components/FriendsPage.jsx` (`loadPageData`, ~line 213, and the render blocks it feeds)

**Why this exists.** On 2026-08-18 a stale browser bundle issued a `profiles` query that
migration 031 had made illegal. That single 403 rejected `loadPageData`'s `Promise.all`,
so **every** section of the Social tab rendered empty and the user saw a raw Postgres
string — `permission denied for table profiles` — as a toast. The friends list, the
leaderboard, the weekend planner and the invites all disappeared because one unrelated
call failed.

**The naive fix is wrong.** Wrapping every call in `.catch(() => [])` converts a loud
failure into a silent one. That loud failure is exactly what made the bug findable in
minutes; a quietly half-empty tab would likely have gone unreported. **Requirement: a
failed block must still be visibly failed.**

**Design.** Replace the single `Promise.all` with a declarative loader registry run through
`Promise.allSettled`. Each loader owns a key, a fetch function, a state setter and a
fallback value. Failures are recorded per key and surfaced as a small inline notice with a
Retry button, placed in the block that actually depends on that data. Raw errors go to
`console.error` so the real message stays recoverable during beta.

**Data-flow note (verified against the current file).** Nearly everything `loadPageData`
fetches feeds the **Friends** sub-tab: `leaderboard` builds `leaderboardById` (line ~336,
decorates friend rows), `skiPlans` builds `upcomingPlans`/`pastPlans` (~353), and
`friendsWeekend` feeds `<WeekendPlanner>` (~489). `acceptedFriends` is the exception — it
is also passed to `<CrewGroupChat friends={acceptedFriends} />` in the **Crews** sub-tab
(~416). So granularity is per *data block*, not per sub-tab, and `friends` is the one key
whose failure must be visible in two places.

- [ ] **Step 1: Add the loader registry and failure state**

Replace the whole `loadPageData` function with the following. Keep every existing state
setter name — this changes how they are called, not what they hold.

```jsx
  const [failedBlocks, setFailedBlocks] = useState({})   // { [key]: true }

  // One entry per independently-failable block. `fallback` is what the block shows
  // when its own fetch fails, so a failure is contained to that block.
  const LOADERS = useMemo(() => [
    { key: "requests", fallback: [],
      fn: getIncomingFriendRequests, apply: setIncomingRequests },
    { key: "outgoing", fallback: [],
      fn: getOutgoingFriendRequests, apply: setOutgoingRequests },
    { key: "friends",  fallback: [],
      fn: getAcceptedFriends,        apply: setAcceptedFriends },
    { key: "leaderboard", fallback: [],
      fn: getFriendsLeaderboard,     apply: setLeaderboard },
    { key: "crewInvitesIn", fallback: [],
      fn: getReceivedCrewInvites,    apply: setReceivedInvites },
    { key: "crewInvitesOut", fallback: [],
      fn: getSentCrewInvites,        apply: setSentInvites },
    { key: "skiPlans", fallback: [],
      fn: getMySkiPlans,             apply: setSkiPlans },
    { key: "weekend",  fallback: [],
      fn: getFriendsUpcomingTrips,   apply: setFriendsWeekend },
    { key: "pings",    fallback: { sent: [], received: [] },
      fn: getMyPings,                apply: setPings },
    { key: "polls",    fallback: { created: [], received: [] },
      fn: getMyDatePolls,            apply: setDatePolls },
  ], [])

  // Runs a subset of loaders (all of them by default). One rejection no longer takes
  // down the others — allSettled, not all.
  const runLoaders = useCallback(async (subset) => {
    const list = subset ? LOADERS.filter((l) => subset.includes(l.key)) : LOADERS
    const results = await Promise.allSettled(list.map((l) => l.fn()))

    const nowFailed = {}
    results.forEach((res, i) => {
      const loader = list[i]
      if (res.status === "fulfilled") {
        loader.apply(res.value ?? loader.fallback)
      } else {
        loader.apply(loader.fallback)
        nowFailed[loader.key] = true
        // Keep the real error reachable. The UI shows friendly copy, but during beta
        // the raw Postgres/PostgREST message is what makes a bug diagnosable — that is
        // how the 2026-08-18 stale-bundle 403 was traced.
        console.error(`[FriendsPage] "${loader.key}" failed to load:`, res.reason)
      }
    })

    setFailedBlocks((prev) => {
      const next = { ...prev }
      list.forEach((l) => { delete next[l.key] })     // clear anything we just retried
      return { ...next, ...nowFailed }
    })
  }, [LOADERS])

  async function loadPageData() {
    setLoadingPage(true)
    try {
      await runLoaders()
    } finally {
      setLoadingPage(false)
    }
  }
```

Verified against the current file: all ten registry functions are already imported
from `../lib/socialApi`, and line 1 is `import { useEffect, useMemo, useState } from "react";`
— so **add only `useCallback`** to that import. `useMemo` is already present.

- [ ] **Step 2: Add the inline failure notice component**

Put this beside the other small helpers near the top of the file (outside `FriendsPage`).

```jsx
/**
 * Shown in place of one block's content when that block's fetch failed.
 * Deliberately NOT a silent empty state: a failure the user cannot see is a failure
 * nobody reports. Friendly copy here; the raw error goes to console.error.
 */
function BlockLoadError({ label, onRetry, retrying }) {
  return (
    <div style={{
      background: "var(--color-danger-bg)",
      border: "1px solid var(--color-danger)",
      borderRadius: 12, padding: "12px 14px",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    }}>
      <div style={{ fontSize: 13, color: "var(--color-danger)", fontWeight: 700 }}>
        Couldn&apos;t load {label}.
      </div>
      <button
        onClick={onRetry}
        disabled={retrying}
        style={{
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 999, padding: "7px 14px", color: "white",
          fontSize: 12, fontWeight: 800, minHeight: 44,
          cursor: retrying ? "default" : "pointer", opacity: retrying ? 0.6 : 1,
        }}
      >
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Wire a retry helper inside the component**

```jsx
  const [retryingBlock, setRetryingBlock] = useState(null)

  async function retryBlock(key) {
    setRetryingBlock(key)
    try {
      await runLoaders([key])
    } finally {
      setRetryingBlock(null)
    }
  }

  // Small helper so each block is one line at the call site.
  function blockError(key, label) {
    if (!failedBlocks[key]) return null
    return (
      <BlockLoadError
        label={label}
        retrying={retryingBlock === key}
        onRetry={() => retryBlock(key)}
      />
    )
  }
```

- [ ] **Step 4: Place the notices in the blocks that depend on each key**

Insert each of these immediately above the corresponding block's existing markup:

- Friends list (inside `activeSection === "friends"`, above the friends list):
  `{blockError("friends", "your friends list")}`
- Incoming/outgoing requests block:
  `{blockError("requests", "friend requests")}`
- `<WeekendPlanner days={friendsWeekend} />` (~line 489):
  `{blockError("weekend", "this weekend's plans")}`
- The ski-plans block driven by `upcomingPlans`/`pastPlans`:
  `{blockError("skiPlans", "your ski plans")}`
- The legacy invites block gated on `hasLegacyInvites` (~line 799) — render the notice
  **outside** that gate, since `hasLegacyInvites` is false when the fetch failed:
  `{blockError("crewInvitesIn", "ski invites")}`
- Crews sub-tab (~line 416), because `acceptedFriends` feeds `<CrewGroupChat>`:
  `{blockError("friends", "your friends list")}` above the `<CrewGroupChat />`.

Leave `leaderboard`, `outgoing`, `pings` and `polls` without notices — each only decorates
or supplements an existing block, and an extra banner for them would be noise. They still
log to console and still fall back cleanly.

- [ ] **Step 5: Remove the blanket error toast**

The old `catch (e) { showToast("error", e.message || "Failed to load.") }` is gone with the
rewritten `loadPageData`. Confirm no remaining call site shows a whole-page load toast —
`showToast` should now be used only for user *actions* (send request, respond, cancel),
which is what it was designed for. Raw driver messages should never reach a toast again;
that is what produced the confusing `permission denied for table profiles` popup.

- [ ] **Step 6: Verify by forcing a real failure**

There is no test framework, so force the failure the way production did.

Temporarily break exactly one loader — in `src/lib/socialApi.js`, change
`getFriendsUpcomingTrips`'s table name to something nonexistent:

```js
    .from("ski_trips_DOES_NOT_EXIST")
```

Then `npm run dev`, open the Social tab, and confirm:

1. The **friends list still renders** — this is the whole point. Before this task, it went blank.
2. A single red "Couldn't load this weekend's plans." notice appears where `WeekendPlanner` was.
3. No toast appears, and no raw Postgres text is shown to the user.
4. The browser console contains `[FriendsPage] "weekend" failed to load:` with the real error.
5. Clicking **Retry** shows "Retrying…", fails again, and the notice stays — it must not
   vanish or spin forever.
6. Revert the table name, click **Retry** once more, and the notice disappears and
   `WeekendPlanner` renders — without a full page reload.

**Revert the temporary edit to `socialApi.js` before committing.** Confirm with
`git diff src/lib/socialApi.js` showing no changes.

- [ ] **Step 7: Lint, build, commit**

```bash
npm run lint 2>&1 | tail -3     # expect 91, the 2fe6613 baseline
npm run build 2>&1 | tail -3
git add src/components/FriendsPage.jsx
git commit -m "fix: contain Social tab load failures to the block that failed

loadPageData awaited ten calls in one Promise.all, so a single rejection blanked
the entire tab — on 2026-08-18 a stale-bundle profiles 403 took out the friends
list, leaderboard, weekend planner and invites together, and surfaced a raw
Postgres string as a toast.

Replaces it with a loader registry over Promise.allSettled: each block falls back
independently and shows an inline notice with Retry. Failures stay visible on
purpose — a blanket .catch would have made that 403 unreportable — with the raw
error kept in console.error.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 2. Social tab IA cleanup — NEEDS BRAINSTORMING

Carried from `ROADMAP.md` (Kyle's Notes). **Not a plan. Do not implement from this.**

The Social tab stacks a 4-way sub-tab bar (Leaderboard / Crews / Friends / Community)
inside `MessagingCenter`'s own Chats/People/Activity shell — two competing levels of
navigation before any content. Sprint 34 added a fifth reachable surface (full friend
profiles). This needs an information-architecture pass, not spacing tweaks.

Useful facts already established, so they need not be rediscovered:
- `FriendsPage` is mounted only from `MessagingCenter` (two call sites, both with `hideCrew`).
- Its sub-tabs are an inline array at ~line 375; sections render at ~413–422.
- `acceptedFriends` is the one loaded value shared across two sub-tabs (Friends and Crews).
- Task 1 above should land first — it makes the page's failure behaviour predictable
  before anything is moved around.

## 3. The friends calendar as a flagship view — NEEDS BRAINSTORMING

Carried from `ROADMAP.md`. **Not a plan.** Kyle's read: this is the single biggest driver
of return visits, and is worth doing properly rather than incrementally.

Sprint 34 shipped the mechanics — `daily_plans` reads are RLS-correct, `getVisiblePlansInRange`
exists, `PlanCalendar` is a reusable month grid, and crew scope chips work. What is
unresolved is presentation and placement:

- **Where does it live?** Its own top-level tab, the Home tab's primary card, or stay in
  Plans? Today it is a sub-tab of Plans, which buries it.
- **Weekend-first framing.** "This weekend / next weekend" may matter more than a month
  grid. The month grid is the *planning* tool; the weekend view is the *decision* tool.
- **Group by mountain, not by person.** "6 people at Copper Saturday" answers the question
  a user actually has; the current calendar answers "what is Dave doing", which is a
  different and lesser question.
- **A nudge:** join a friend's day, or start one at that mountain.
- **Empty state.** With nobody planned, the page must still give a reason to return.

Existing pieces to reuse: `src/components/PlanCalendar.jsx`, `src/lib/calendarDates.js`
(`localDateKey`/`monthBounds` — never `toISOString()` for date keys),
`getVisiblePlansInRange` in `src/lib/socialApi.js`, and `RESORTS` from `src/App.jsx`.
