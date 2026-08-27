# PowDays Routing + Code Splitting Implementation Plan

> **STATUS: QUEUED — not started.** Tracked as **TASK 20.6** in `ROADMAP.md`.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.
>
> Written 2026-08-27 against HEAD `a9dadd5`. **Line numbers below were verified against that
> commit** — re-verify with grep before trusting any of them, since `App.jsx` moves fast (it
> shrank 2,008 → 1,512 lines during the IA restructure).

**Goal:** Give every screen in PowDays a real URL, and stop shipping Leaflet to people who
never open the map.

**Architecture:** Replace the `activeTab` `useState` in `src/App.jsx` with `react-router-dom`
routes, driving the existing 5-tab nav from `useLocation`/`useNavigate`. The tab↔path mapping
lives in a new **pure** module `src/lib/routes.js`, unit-testable under the existing
`node --test` runner — no new test harness needed. Then lazy-load the heavy route subtrees and
the map.

**Tech Stack:** React 19.2, Vite 7.3.1, `react-router-dom` v7 (new dep), `node:test`.

---

## Context

PowDays has exactly one URL. Navigation is `const [activeTab, setActiveTab] = useState("today")`
at `App.jsx:562` — 17 references, no router installed. You cannot link anyone to a trip, back
does nothing, and refresh dumps you on Today.

Worse, `App.jsx:971-979` reads a `?trip=` param and then calls
`window.history.replaceState({}, "", window.location.pathname)` — **destroying the entire query
string**. The one shareable link in the app (generated at `TripDetailModal.jsx:973`) dismantles
itself on arrival.

Meanwhile `dist/assets/index-*.js` is a **single 1,184 KB chunk** with nothing lazy-loaded.

### Scope decision: no true multi-page app

Separate HTML entry points with full reloads were considered and rejected. Every navigation
would re-authenticate against Supabase, re-run the 12-resort fan-out that populates `live` /
`skierCounts` (a 15-second polling loop), and restart `navigator.geolocation.watchPosition`.

**Accuracy note, since an earlier read of this got it wrong:** `useGpsTracker` *does* flush
`segments`/`runCount`/`liftCount` to `sessionStorage` every 30s and restore on mount
([useGpsTracker.js:55-77](src/lib/useGpsTracker.js#L55-L77)), so a reload does **not** lose the
whole run. What it loses is the live watch handle, the in-progress segment, and up to 30s of
data — *per navigation*, plus GPS re-acquisition lag each time. That is still disqualifying on
a ski-tracking app, but the reason is "death by a thousand reloads," not "loses everything."

---

## Global Constraints

- **Repo:** `/Users/kyleray/Desktop/OS/Dev/Ski-Conditions-App`, `main`, HEAD `a9dadd5`. Work in
  an isolated worktree (`superpowers:using-git-worktrees`). **Confirm `pwd` and `git status -sb`
  before believing any green run** — worktree/cwd confusion has silently wasted work here twice.
- **Tests must stay green.** Baseline was **130 passing** on 2026-08-27 — re-check with
  `npm test` before starting; this number moves between sessions. `npm test` → `node --test src/lib/*.test.js`.
- **Lint baseline is 87 problems (79 errors, 8 warnings)** — verified on the current tree. Do not
  exceed it; do not "fix" it incidentally. ⚠️ `ROADMAP.md` says 88 at `:15` and `:1220` — stale
  since the IA restructure. Task 9 corrects it.
- **New dependency: `react-router-dom` only.** Second deliberate exception to the "no new deps"
  convention (first is the queued Vitest harness). Justified: hand-rolled history handling is
  exactly what produced the query-string bug above.
- **`BrowserRouter`, never `HashRouter`.** Supabase password recovery arrives in the URL **hash**
  (`AuthForm.jsx:91`); a hash router would fight it.
- **`react-refresh/only-export-components` is enforced** — a component file may export only its
  component. Route constants therefore live in `src/lib/routes.js`, never in `App.jsx`. Same
  reasoning as the doc comment in `src/lib/calendarDates.js:1-12`.
- **Tab keys are `today, plans, track, crew, me`** (5-tab IA, `30fa4cc`). `HomeDashboard.jsx` is
  deleted — do not reintroduce it.
- Commit after every task.
- **First action when execution starts:** copy this plan to
  `docs/superpowers/plans/2026-08-27-routing-and-code-splitting.md` and commit it. That is where
  every prior sprint plan lives, and the SDD ledger discipline is what made a cold resume
  possible after VS Code restarted mid-sprint last time.

---

## Ground truth about the current structure

Read this before Task 3 — three things here contradict the obvious assumptions.

1. **`TodayScreen` and `TrackScreen` already exist** as `src/components/TodayScreen.jsx` and
   `TrackScreen.jsx`. Only `plans`, `crew`, and `me` render inline JSX in `App.jsx`. There is no
   need to invent a `src/screens/` directory.
2. **Leaflet is NOT reachable by route-splitting.** `PowderMap.jsx` is the only file importing
   Leaflet, and it is **statically imported at `TodayScreen.jsx:2`** and rendered only behind the
   `map` sub-tab (`TodayScreen.jsx:632`, default sub-tab is `conditions`). Since Today is the
   eager landing route, splitting routes does nothing for Leaflet — it needs its own lazy
   boundary. This is why Task 8 is independent and is the single biggest win.
3. **Two full-page takeovers sit above the tabs** in a 3-way ternary at `App.jsx:1348-1364`:
   `viewingProfileId ? <ProfilePage> : mountainPageResortKey ? <MountainPage> : <>tabs</>`.
   Neither is in the URL. `handleTabChange` (`:1046-1052`) exists *only* to clear them plus set
   the tab — it does no scroll reset, refetch, or analytics.

**State that must stay above `<Routes>`** or you re-fetch everything on each navigation:
`currentUser`, `currentProfile`, `authReady`, `authModalMode`, `isRecoveryMode`,
`browseModeOverride`, `showOnboarding`, `pendingInviteId`, `activeSession`, `recapData`, and the
polling caches `live`, `skierCounts`, `skierDetails`. The `useGpsTracker()` call at `App.jsx:629`
and `<ActiveSessionBar>` at `:1287-1294` must remain in the persistent shell.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/routes.js` **(new)** | Pure route table + helpers. The only place a path string is written. No React import. |
| `src/lib/routes.test.js` **(new)** | `node --test` coverage. |
| `vercel.json` **(new)** | SPA rewrite. **Without it every deep link 404s on hard refresh.** |
| `src/main.jsx` | Wrap `<App/>` in `<BrowserRouter>`. |
| `src/App.jsx` | Tabs → `<Routes>`; takeovers → routes; lazy boundaries. |
| `src/components/NotificationBell.jsx` | 4 `onTabChange("crew")` sites → `useNavigate()`. |
| `src/components/ProfilePage.jsx` | 3 `onTabChange?.(...)` sites → `useNavigate()`. |
| `src/components/TodayScreen.jsx` | Lazy boundary around `PowderMap` (Task 8). |
| `public/sw.js` | `CACHE_NAME` bump only — navigation handling is already correct. |

---

## Task 1: The pure route module

Do this first and alone. It is the only part with real automated coverage, and every later task
imports it.

**Files:** Create `src/lib/routes.js`, `src/lib/routes.test.js`

**Interfaces — Produces:**
- `TABS: string[]` — the 5 tab keys in nav order
- `pathForTab(tab) => string` — `"today"` → `"/"`
- `tabForPath(pathname) => string` — inverse; `"today"` for `/` and for anything unknown
- `legacyTripPath(search) => string | null` — `"?trip=abc"` → `"/trip/abc"`, else `null`

- [ ] **Step 1: Write the failing test** — create `src/lib/routes.test.js`:

```javascript
import { test } from "node:test"
import assert from "node:assert/strict"
import { TABS, pathForTab, tabForPath, legacyTripPath } from "./routes.js"

test("TABS is the five-tab IA in nav order", () => {
  assert.deepEqual(TABS, ["today", "plans", "track", "crew", "me"])
})

test("today is the root path, not /today", () => {
  assert.equal(pathForTab("today"), "/")
  assert.equal(tabForPath("/"), "today")
})

test("every tab round-trips through path and back", () => {
  for (const tab of TABS) {
    assert.equal(tabForPath(pathForTab(tab)), tab, `round-trip failed for ${tab}`)
  }
})

test("non-root tabs get their own path", () => {
  assert.equal(pathForTab("plans"), "/plans")
  assert.equal(pathForTab("crew"), "/crew")
})

test("an unknown tab falls back to root rather than throwing", () => {
  assert.equal(pathForTab("nope"), "/")
})

test("an unknown path resolves to today, so a bad URL still renders the app", () => {
  assert.equal(tabForPath("/garbage"), "today")
  assert.equal(tabForPath(""), "today")
})

test("a trip detail page keeps the Plans tab highlighted", () => {
  assert.equal(tabForPath("/trip/abc-123"), "plans")
})

test("a user profile page keeps the Crew tab highlighted", () => {
  assert.equal(tabForPath("/u/some-uuid"), "crew")
})

test("a mountain page keeps the Today tab highlighted", () => {
  assert.equal(tabForPath("/mountain/vail"), "today")
})

test("a trailing slash does not break tab resolution", () => {
  assert.equal(tabForPath("/plans/"), "plans")
})

test("a prefix must not match a different tab by accident", () => {
  // "/tracksuit" is not "/track".
  assert.equal(tabForPath("/tracksuit"), "today")
})

test("legacyTripPath upgrades the old ?trip= share link", () => {
  assert.equal(legacyTripPath("?trip=abc-123"), "/trip/abc-123")
})

test("legacyTripPath ignores unrelated params so Strava and recovery survive", () => {
  assert.equal(legacyTripPath("?strava_connected=true"), null)
  assert.equal(legacyTripPath(""), null)
})
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm test 2>&1 | tail -20
```
Expected: FAIL — `Cannot find module './routes.js'`.

- [ ] **Step 3: Implement** — create `src/lib/routes.js`:

```javascript
/**
 * The single source of truth for URL paths.
 *
 * Lives in lib/ rather than App.jsx for the same reason calendarDates.js does:
 * react-refresh/only-export-components forbids a component file from exporting
 * anything but its component. Being pure also makes it testable under the
 * existing `node --test src/lib/*.test.js` runner, which has no DOM.
 *
 * "today" maps to "/" rather than "/today" so the PWA start_url ("/" in
 * public/manifest.json) and the service worker's offline fallback
 * (caches.match("/")) both land on a real route with no redirect.
 */

/** Tab keys in nav order. Must match BOTTOM_TABS / NAV_ICONS in App.jsx. */
export const TABS = ["today", "plans", "track", "crew", "me"]

const PATH_BY_TAB = {
  today: "/",
  plans: "/plans",
  track: "/track",
  crew: "/crew",
  me: "/me",
}

/**
 * Detail routes that belong to a tab, so the nav highlight stays correct on
 * a detail page. Matched on a full segment boundary — "/tracksuit" must not
 * match "/track".
 */
const NESTED_PREFIX_TO_TAB = {
  "/trip": "plans",
  "/u": "crew",
  "/mountain": "today",
}

export function pathForTab(tab) {
  return PATH_BY_TAB[tab] || "/"
}

export function tabForPath(pathname) {
  if (!pathname) return "today"
  // Strip trailing slashes so "/plans/" behaves like "/plans", but keep bare "/".
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
  if (clean === "/" || clean === "") return "today"

  const exact = TABS.find((tab) => PATH_BY_TAB[tab] === clean)
  if (exact) return exact

  const prefix = Object.keys(NESTED_PREFIX_TO_TAB).find(
    (p) => clean === p || clean.startsWith(`${p}/`)
  )
  if (prefix) return NESTED_PREFIX_TO_TAB[prefix]

  // Unknown path renders the app on Today rather than a blank screen.
  return "today"
}

/**
 * Upgrades the pre-router share link (`/?trip=<id>`) to its real route.
 * Returns null when there is nothing to upgrade — importantly, it must not
 * claim Strava's or Supabase recovery's params.
 */
export function legacyTripPath(search) {
  const tripId = new URLSearchParams(search || "").get("trip")
  return tripId ? `/trip/${tripId}` : null
}
```

- [ ] **Step 4: Run and confirm green**

```bash
npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
```
Expected: **baseline + 13** (143 if the baseline is still 130), `fail 0`. Confirm the
baseline first rather than trusting this number.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint . 2>&1 | tail -2   # must be ≤ 87 problems
git add src/lib/routes.js src/lib/routes.test.js
git commit -m "feat: pure route table for tab<->path mapping"
```

---

## Task 2: Install the router and fix the deploy config

No visible behavior change. Separate task because **the Vercel rewrite is the single most likely
way this ships broken**, and it deserves its own review gate.

**Files:** Create `vercel.json`; modify `package.json`, `src/main.jsx`

- [ ] **Step 1:** `npm install react-router-dom`

- [ ] **Step 2: Create `vercel.json`.** Vercel serves static files; without a rewrite,
`https://powdays.app/plans` returns **404** on hard refresh or a shared link — the exact thing
this sprint exists to enable. There is no `vercel.json` in the repo today.

```json
{
  "rewrites": [
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

- [ ] **Step 3: Wrap the app.** `src/main.jsx` is 9 lines and mounts `<App/>` bare:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 4: Verify nothing changed**

```bash
npm run build 2>&1 | tail -5
npm test 2>&1 | grep -E "^ℹ (pass|fail)"
npx eslint . 2>&1 | tail -2
```
The app still uses `activeTab`; it should look identical.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vercel.json src/main.jsx
git commit -m "chore: add react-router-dom and the Vercel SPA rewrite"
```

---

## Task 3: Drive the 5 tabs from the URL

The core change. `activeTab` stops being state and becomes a function of the URL.

**Files:** `src/App.jsx` — `:562`, `:1046-1052`, the seven `setActiveTab` calls, and the tab
blocks at `:1424-1506`.

**Interfaces — Consumes:** `TABS`, `pathForTab`, `tabForPath` from `src/lib/routes.js`.
**Produces:** `activeTab` as a derived value. `handleTabChange(tab)` keeps its signature, so
`BottomNav` (`:396`) and `TopNav` (`:462`) need **no prop changes**.

- [ ] **Step 1: Derive the tab from the URL.** Replace the `useState` at `:562`:

```jsx
import { useLocation, useNavigate } from "react-router-dom"
import { TABS, pathForTab, tabForPath } from "./lib/routes"

// inside App(), replacing: const [activeTab, setActiveTab] = useState("today")
const location = useLocation()
const navigate = useNavigate()
const activeTab = tabForPath(location.pathname)
```

- [ ] **Step 2: Rewrite `handleTabChange`.** It currently clears both takeovers and sets state
(`:1046-1052`). Keep the clearing — the takeovers are still state until Task 6:

```jsx
const handleTabChange = (tab) => {
  setMountainPageResortKey(null)
  // Clear the friend-profile takeover too, or bottom-nav navigation would
  // leave a stale profile mounted over the tab the user just picked.
  setViewingProfileId(null)
  navigate(pathForTab(tab))
}
```

- [ ] **Step 3: Replace the seven direct `setActiveTab` calls.** Each becomes
`navigate(pathForTab(<same string>))`:

| Line | Tab | Context |
|---|---|---|
| 609 | `plans` | `handleOpenTripById` catch |
| 615 | `plans` | `handleOpenPlanDate` |
| 840 | `plans` | `handleAuthSuccess`, pending invite |
| 850 | `plans` | `handleOnboardingComplete` |
| 865 | `today` | `handleLogOut` |
| 990 | `me` | Strava OAuth redirect |
| 1002 | `plans` | pending-invite effect |

⚠️ **Also fix `:1476`**, which passes raw `setActiveTab` as `onTabChange` to `ProfilePage` while
`:1354` passes `handleTabChange`. Two contracts for one component — that is why navigating from
your own profile does not clear the takeovers. Pass `handleTabChange` in both places.

⚠️ **Verify the census.** Run `grep -n "setActiveTab" src/App.jsx` — it must return **zero**
results. A missed call site is this codebase's single most common failure mode (five recorded
incidents; see ROADMAP's "THE RECURRING LESSON").

- [ ] **Step 4: Wrap the tab blocks in `<Routes>`.**

**Copy each block's body verbatim from these exact lines.** Do not retype it — `TodayScreen`
alone takes 22 props, and a transcription slip there is a silent bug. Delete only the
`{activeTab === "..." && (` wrapper and its closing `)}`; everything inside, including the auth
gate, moves unchanged.

| Route | Source lines in `App.jsx` | What's inside | Auth gate |
|---|---|---|---|
| `/` | **1424–1451** | `<TodayScreen>` (22 props) | none — renders logged-out |
| `/plans` | **1494–1506** | `<SkiPlansPage>` | `<AuthGate>` 🎿 |
| `/track` | **1453–1460** | `<TrackScreen>` | none — renders logged-out |
| `/crew` | **1462–1471** | `<MessagingCenter />` (zero props) | `<AuthGate>` 💬 |
| `/me` | **1473–1492** | `<ProfilePage>` | centered `<AuthForm mode="login">` |

The gates genuinely differ — `me` uses `<AuthForm>`, not `<AuthGate>`. Preserve that asymmetry;
it is not a bug to tidy up here.

Assign the plans body to a named const — **Task 5 reuses it for `/trip/:tripId`**, and
duplicating that JSX across two `<Route>` elements is how the two paths drift apart later:

```jsx
const plansElement = (
  <>{/* body of App.jsx:1494-1506, verbatim */}</>
)

<Routes>
  <Route path="/"      element={<>{/* body of App.jsx:1424-1451 */}</>} />
  <Route path="/plans" element={plansElement} />
  <Route path="/track" element={<>{/* body of App.jsx:1453-1460 */}</>} />
  <Route path="/crew"  element={<>{/* body of App.jsx:1462-1471 */}</>} />
  <Route path="/me"    element={<>{/* body of App.jsx:1473-1492 */}</>} />
  <Route path="*"      element={<Navigate to="/" replace />} />
</Routes>
```

⚠️ `<HeroBannerStrip>` at `:1369` is suppressed by `activeTab !== "track"`. `activeTab` is still
derived in Step 1, so this keeps working untouched — but confirm the banner still hides on
`/track` before committing.

Leave the three-way takeover ternary at `:1348-1364` **exactly as it is** for now — Task 6 moves
it. Leave the landing-page early return at `:1081` alone too; it returns above all nav and is
unaffected.

- [ ] **Step 5: Verify by hand**

```bash
npm run dev
```
1. Each of the 5 nav items changes the URL (`/`, `/plans`, `/track`, `/crew`, `/me`).
2. Nav highlight follows the URL; back/forward work.
3. **Hard-refresh on `/plans` stays on Plans.** This is the payoff.
4. A garbage URL like `/asdf` lands on Today, not a blank screen.
5. Logged out, `/plans` and `/crew` show their AuthGates; `/me` shows the login form.
6. **Start a GPS session on Track, navigate to Crew and back — the session must survive.** If it
   does not, routing is remounting the shell; that is a bug in this task.

- [ ] **Step 6: Commit**

```bash
grep -n "setActiveTab" src/App.jsx   # must print nothing
npm test 2>&1 | grep -E "^ℹ (pass|fail)" && npx eslint . 2>&1 | tail -2
git add src/App.jsx && git commit -m "feat: drive the 5-tab nav from the URL"
```

---

## Task 4: Migrate the descendant navigation call sites

**Files:** `src/components/NotificationBell.jsx` (`:63`, `:159`, `:161`, `:165`, `:178`),
`src/components/ProfilePage.jsx` (`:300`, `:642`, `:650`, `:840`), `src/App.jsx` (drop dead props)

Note the codebase already solved prop-drilling for a sibling concern with `ProfileNavContext`
(`src/lib/profileNav.js`). **Leave that file alone here** — Task 6 retires it.

- [ ] **Step 1: NotificationBell.** All four call sites pass `"crew"`:

```jsx
import { useNavigate } from "react-router-dom"
import { pathForTab } from "../lib/routes"

export default function NotificationBell({ currentUser, onOpenTrip, onOpenPlan, dropUp = false, variant = "icon" }) {
  const navigate = useNavigate()
  // every `onTabChange("crew")` becomes:
  navigate(pathForTab("crew"))
```

⚠️ `NotificationBell` is rendered in **two** places — `TopNav` (`App.jsx:523`) and inside
`MessagingCenter` (`MessagingCenter.jsx:24`). Only the TopNav one currently receives
`onTabChange`; using the hook fixes both at once. Check the MessagingCenter instance still
behaves after the change.

- [ ] **Step 2: ProfilePage.** Drop `onTabChange` from the signature at `:300`; replace
`onTabChange?.("plans")` at `:642` and `onTabChange?.("crew")` at `:650`/`:840` with
`navigate(pathForTab(...))`.

- [ ] **Step 3: Remove dead props in App.jsx** at `:1326`, `:1335`, `:1354`, `:1476`. Keep
`handleTabChange` — `BottomNav`/`TopNav` still use it.

- [ ] **Step 4: Verify**

```bash
grep -rn "onTabChange" src/ | grep -v "BottomNav\|TopNav"   # only nav components remain
npm test 2>&1 | grep -E "^ℹ (pass|fail)" && npx eslint . 2>&1 | tail -2
```
In the browser: tap a notification targeting messages → lands on Crew. Tap Profile's Trips and
Friends stat buttons → Plans and Crew.

- [ ] **Step 5: Commit**

```bash
git add src/components/NotificationBell.jsx src/components/ProfilePage.jsx src/App.jsx
git commit -m "refactor: descendants navigate via useNavigate, not an onTabChange prop"
```

---

## Task 5: A real `/trip/:id` route, and stop nuking the query string

**Files:** `src/App.jsx` — the deep-link effect at `:971-979`, plus the `<Routes>` block.

- [ ] **Step 1: Add the route.** `tabForPath("/trip/abc")` already returns `"plans"` (tested in
Task 1), so the nav highlight is correct for free:

```jsx
{/* Same body as the /plans route — App.jsx:1494-1506. Extract it to a local
    variable in Task 3 rather than duplicating the JSX in two Route elements. */}
<Route path="/trip/:tripId" element={plansElement} />
```

Inside it, read `useParams().tripId` and feed it to the **existing** `handleOpenTripById`
(`App.jsx:601-611`). Do not write a second opener.

- [ ] **Step 2: Redirect legacy links instead of destroying them.** Replace `:971-979`. The line
`window.history.replaceState({}, "", window.location.pathname)` currently drops the **whole**
query string, which would also eat Strava's `?strava_connected=` and any future router param:

```jsx
useEffect(() => {
  const upgraded = legacyTripPath(window.location.search)
  if (upgraded) {
    navigate(upgraded, { replace: true })
    return
  }
  const stored = sessionStorage.getItem("pending_invite_trip")
  if (stored) setPendingInviteId(stored)
}, [])   // once, on mount
```

Keep the `sessionStorage` fallback — it carries an invite across the auth redirect, which the URL
cannot. **Do not reintroduce a blanket `replaceState`**: `StravaConnect.jsx:46-55` already strips
its own params correctly, preserving siblings. Follow that pattern if you ever need to strip one.

- [ ] **Step 3: Update the generated share link.** `TripDetailModal.jsx:973` builds
`${window.location.origin}/?trip=${id}`. Change it to `${window.location.origin}/trip/${id}`.
The legacy form keeps working via Step 2, so old links already sent out are safe.

- [ ] **Step 4: Verify** — with `npm run dev`:
1. `/trip/<real-id>` opens the trip modal; nav highlights Plans.
2. `/?trip=<same-id>` redirects to `/trip/<id>` and opens the modal.
3. Copy the URL from an open trip, paste into a new tab → same trip. **This is the feature.**
4. Back from an open trip returns to Plans.
5. Connect Strava and confirm the `?strava_connected=true` toast still fires and the param still
   gets cleaned up by `StravaConnect`.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/TripDetailModal.jsx
git commit -m "feat: real /trip/:id route, and stop destroying the query string"
```

---

## Task 6: Promote the two takeovers to routes

⚠️ **This is the task to cut if the sprint runs long.** Tasks 1–5 ship a coherent improvement on
their own. Everything after this is upside.

Right now `viewingProfileId` and `mountainPageResortKey` render full-page takeovers *above* the
tabs (`App.jsx:1348-1364`) with no URL. So you can be looking at someone's profile while the URL
says `/crew` — the URL lies, and profiles are unshareable.

**Files:** `src/App.jsx` (`:1348-1364`, `:1042-1044`, `:1046-1052`, `:1120`),
`src/lib/profileNav.js`, `src/components/UserProfileModal.jsx:27`,
`src/components/calendar/DayPlanCard.jsx:47`

- [ ] **Step 1: Add the routes** (path→tab mapping is already tested from Task 1):

Both bodies come out of the takeover ternary at **`App.jsx:1348-1364`** — the `<ProfilePage>`
branch (`userId`, `onBack`, `onTabChange`, `resorts`) and the `<MountainPage>` branch
(`resortKey`, `resort`, `currentUserEmail`, `onBack`). Copy them verbatim, then swap the id
source and the back handler:

```jsx
<Route path="/u/:userId"           element={<ProfileRoute />} />
<Route path="/mountain/:resortKey" element={<MountainRoute />} />
```

Read the id with `useParams()` instead of the state variable, and make `onBack` call
`navigate(-1)` instead of `setViewingProfileId(null)` / `setMountainPageResortKey(null)`.

⚠️ Note `<ProfilePage>` appears **twice** in the current file — at `:1354` (this takeover, which
takes `userId` + `onBack`) and at `:1476` (the `me` tab, which takes `onLogOut` and no `userId`).
They are different call shapes. Only the `:1354` one becomes `/u/:userId`; the `me` route keeps
its own.

- [ ] **Step 2: Delete the takeover ternary and the clearing logic.** With routes, `/crew` simply
does not match `/u/:userId`, so the takeovers cannot go stale. `handleTabChange` collapses to:

```jsx
const handleTabChange = (tab) => navigate(pathForTab(tab))
```

Delete the `viewingProfileId` and `mountainPageResortKey` `useState` declarations (`:572`, `:569`).

- [ ] **Step 3: Retire `ProfileNavContext`.** `src/lib/profileNav.js` exists purely to let
descendants open a profile without prop-drilling through five call sites — `useNavigate()` does
that natively. Replace `useProfileNav()` in `UserProfileModal.jsx:27` and `DayPlanCard.jsx:47`
with `navigate(\`/u/${userId}\`)`, then delete `src/lib/profileNav.js` and the provider at
`App.jsx:1120`.

- [ ] **Step 4: Handle the cold-load gap.** `mountainPageResort` (`:1042-1044`) is derived from
`rows`, which depends on the `live` fetch. Landing directly on `/mountain/vail` therefore renders
with `resort={null}` until `refresh()` completes. Render the existing loading state rather than
letting `MountainPage` receive null — verify this by hard-refreshing on `/mountain/vail`, not just
by clicking into it.

- [ ] **Step 5: Verify**

```bash
grep -rn "profileNav\|useProfileNav" src/    # must print nothing
npm test 2>&1 | grep -E "^ℹ (pass|fail)" && npx eslint . 2>&1 | tail -2
```
Browser: open a friend's profile from Crew → URL becomes `/u/<id>`; back returns to Crew;
hard-refresh on `/u/<id>` loads that profile; open a mountain page from Today and hard-refresh it.

- [ ] **Step 6: Commit**

```bash
git commit -am "feat: profiles and mountain pages are real, shareable routes"
```

---

## Task 7: Route-based code splitting

**Files:** `src/App.jsx`, `public/sw.js`

- [ ] **Step 1: Record the "before" number**

```bash
npm run build 2>&1 | tail -15
ls -la dist/assets/*.js | awk '{printf "%-44s %6.0f KB\n", $NF, $5/1024}'
```
Baseline on the current tree is a single **~1,184 KB** chunk. Write it down.

- [ ] **Step 2: Lazy-load the heavy subtrees.** Keep Today eager — it is the landing view, and
lazying it only adds a spinner to the critical path. Lazy the rest, biggest subtree first:

```jsx
import { lazy, Suspense } from "react"

const MessagingCenter = lazy(() => import("./components/MessagingCenter"))
const ProfilePage     = lazy(() => import("./components/ProfilePage"))
const SkiPlansPage    = lazy(() => import("./components/SkiPlansPage"))
const MountainPage    = lazy(() => import("./components/MountainPage"))
const TripDetailModal = lazy(() => import("./components/TripDetailModal"))
```

`MessagingCenter` is the widest subtree (it pulls `CrewGroupChat`, `FriendsPage`, `ActivityFeed`,
`DirectMessageView`, `SkiPingModal`, `DateMatchmaker`). `TripDetailModal` is imported by **both**
`App.jsx:11` and `SkiPlansPage` — lazying it in App stops the deep-link modal from anchoring that
subtree into the shell.

Wrap `<Routes>` once:

```jsx
<Suspense fallback={<div style={{ padding: 24, textAlign: "center", opacity: 0.6 }}>Loading…</div>}>
  <Routes>{/* ...as before... */}</Routes>
</Suspense>
```

⚠️ **Known consequence:** `StravaConnect`'s param-cleanup effect (`StravaConnect.jsx:46`) lives
inside `ProfilePage`. Lazying `ProfilePage` means `?strava_connected=true` sits in the URL until
that chunk resolves. Acceptable — but confirm the toast still fires after the Strava round-trip.

- [ ] **Step 3: Bump the service worker cache.** `public/sw.js:1` — the SW's navigation handling
is **already correct** for routing (network-first, `caches.match("/")` as the deep-link offline
fallback), so this is its only needed edit:

```javascript
const CACHE_NAME = "powderdays-v3"
```

⚠️ **Deliberate trade-off:** with split chunks, a user who goes offline without having visited a
route will not have that chunk cached and it will fail to load. Today's single bundle works
offline everywhere once loaded. This is the price of the smaller first load. **Do not** "fix" it
by pre-caching every chunk — that just recreates the 1.2 MB download.

- [ ] **Step 4: Measure and commit.** Re-run the build and `ls`. Expect several chunks with the
entry well below 1,184 KB. **Put the real measured numbers in the commit message** — do not claim
an improvement you have not measured. Then verify all five tabs load (a brief "Loading…" on first
visit is correct) and commit.

---

## Task 8: Split Leaflet out — the biggest single win

Independent of routing, and verifiable on its own.

**Files:** `src/components/TodayScreen.jsx` (`:2`, `:632`)

Only `PowderMap.jsx` imports Leaflet, and `leaflet` + `react-leaflet` are ~4.1 MB unminified in
`node_modules` — the heaviest dependency in the app. It is statically imported at
`TodayScreen.jsx:2` but only rendered behind the non-default `map` sub-tab (`:632`). **Every
visitor downloads a mapping library to look at snow totals.**

- [ ] **Step 1: Make the map a lazy boundary** in `TodayScreen.jsx`:

```jsx
const PowderMap = lazy(() => import("./PowderMap"))

// at :632, inside the existing sub-tab conditional:
{conditionsSubTab === "map" && (
  <Suspense fallback={<div style={{ height: 320, display: "grid", placeItems: "center", opacity: 0.6 }}>Loading map…</div>}>
    <PowderMap resorts={rows} skierCounts={skierCounts} skierDetails={skierDetails} friendIds={friendIds} />
  </Suspense>
)}
```

Pass the existing props through unchanged.

- [ ] **Step 2: Prove Leaflet left the entry chunk**

```bash
npm run build
grep -l "leaflet" dist/assets/*.js
```
Expected: the match is in a **separate** chunk, not the entry chunk `index.html` references. If
it is still in the entry chunk, something else imports `PowderMap` eagerly —
`grep -rn "PowderMap" src/`.

- [ ] **Step 3: Verify and commit.** In the browser, tap the 🗺️ Map sub-tab on Today: tiles
render, friend pins appear, tapping a pin still opens that user's profile (now `/u/:id` if Task 6
shipped). Then:

```bash
git commit -am "perf: load Leaflet only when the map sub-tab is opened"
```

---

## Task 9: Documentation and deploy verification

- [ ] **Step 1: Fix the stale lint baseline.** `ROADMAP.md` says 88 at `:15` and `:1220`; the
current tree is **87 (79 errors, 8 warnings)**. Correct both — and re-verify with
`npx eslint . 2>&1 | tail -2` rather than trusting this plan's number.

- [ ] **Step 2: Record the sprint in `ROADMAP.md`:** the routing conversion, the measured
before/after bundle numbers, the deliberate offline trade-off, `react-router-dom` as the second
"no new deps" exception, and the MPA rejection **with the GPS reasoning** so it stops being
re-proposed.

- [ ] **Step 3: Merge and deploy** via `superpowers:finishing-a-development-branch`. Pushing to
`main` ships to production with **no staging step**.

- [ ] **Step 4: Verify the deploy for real.** Hash comparison against a local `dist/` proves
nothing — Vercel's hash differs. Grep the served bundle, then check the rewrite:

```bash
curl -s https://powdays.app/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
curl -s -o /dev/null -w "%{http_code}\n" https://powdays.app/plans
curl -s -o /dev/null -w "%{http_code}\n" https://powdays.app/crew
```

Expected `200` for both. **A 404 means `vercel.json` did not take effect** — the one failure mode
that passes every local test and still breaks the feature in production.

- [ ] **Step 5: Kyle's hands-on check.** The tests cover `src/lib` only and prove nothing that
renders. On a phone: share a trip link to yourself and open it; hard-refresh on `/plans`; confirm
back/forward feel right; confirm cold load feels faster.

---

## Verification Summary

| Gate | Command | Expected |
|---|---|---|
| Unit tests | `npm test` | **baseline + 13** (143 if baseline is 130), 0 fail |
| Lint | `npx eslint . \| tail -2` | ≤ **87 problems** |
| Build | `npm run build` | succeeds, multiple `/assets/*.js` chunks |
| No orphan state | `grep -n "setActiveTab" src/App.jsx` | no output |
| Context retired (T6) | `grep -rn "useProfileNav" src/` | no output |
| Leaflet split | `grep -l "leaflet" dist/assets/*.js` | not the entry chunk |
| Deep link (prod) | `curl -o /dev/null -w "%{http_code}" https://powdays.app/plans` | `200` |
| GPS survives nav | manual | session persists across tab changes |

**Size: M — one session**, matching the ROADMAP scale. Natural split points: **Tasks 1–5** are
the routing half and ship a complete improvement alone; **Task 6** is cuttable upside;
**Tasks 7–8** are the performance half and can wait for a second sitting without leaving anything
broken. Task 8 alone is the largest measurable win and depends on nothing else in this plan.

**Sequencing:** worth doing *before* the queued Vitest harness (ROADMAP TASK 1.1-T). Routing is
far easier to test than state-driven tabs, and `src/lib/routes.js` gives the navigation layer
real coverage under the existing runner — so this makes the harness cheaper, not redundant.

**Deliberately out of scope:** putting the Today `map` sub-tab in the URL as `?view=map` (would
make a map view shareable); splitting the 3,695-line `socialApi.js`; the `crew_invites` rename
(see ROADMAP's "Deliberately NOT doing").
