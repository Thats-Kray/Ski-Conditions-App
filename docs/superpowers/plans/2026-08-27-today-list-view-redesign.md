# Today Tab List View — Mockup Fidelity Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Today tab's List sub-view match the new mockup screenshots
(`mockups/PowDays.app mockup design/Screen Shots/PowDays Reorg Mockup-Today Mountains.png`):
a compact "Best Bet Today" hero, a compact tappable resort list that expands in place, and a
"Ski here today" action wired into the existing daily-plans flow.

**Architecture:** Presentation-layer change plus one new data dependency (the user's own plan
for today). No migration, no new dependency, no new write path — every save goes through the
existing `buildPlanUpsert` → `upsertDailyPlan` pair already used by `SkiPlansTab.jsx`. Two new
presentational components (`BestBetCard`, `ResortListRow`); one existing local component
(`FriendsGoingBadge`) extracted to its own file so both the hero and the resort list can share
it; the existing `ResortCard` gains one new button and two new props, everything else about it
is untouched.

**Tech Stack:** React (no router, no state library — plain `useState`/props), inline
`style={{}}` objects with `var(--color-*)`/`var(--rating-*)` CSS custom properties, Supabase JS
client, `node --test` for the one piece of new pure logic.

**Spec:** `docs/superpowers/specs/2026-08-27-today-list-view-redesign-design.md`

## Global Constraints

- No new npm dependencies.
- Inline `style={{}}` objects only. Colors via `var(--color-*)`/`var(--rating-*)` tokens —
  **never** a hex value concatenated with an alpha-suffix string (e.g. `` `${color}33` ``); that
  breaks under theming (`Badge.jsx`'s `TIER_COLORS` hazard). Use the pre-computed
  `-border`/`-soft` token variants instead.
- Date keys via `localDateKey()` (from `src/lib/calendarDates.js`), never `new
  Date().toISOString()`.
- `npm test` must stay green. It runs `node --test` over `src/lib/*.test.js` only — there is no
  component test harness yet, so every UI-visible change in this plan is verified manually in
  the browser (steps say exactly what to check).
- `npx eslint .` baseline is **87 problems (79 errors, 8 warnings)** as of 2026-08-27. Do not
  raise it. In particular: when a prop/variable becomes unused because JSX that consumed it is
  deleted, delete the prop/variable too — don't leave it dangling.
- `upsertDailyPlan` writes the **whole** `daily_plans` row (`onConflict: "user_id,ski_date"`).
  Any write must go through `buildPlanUpsert(existing, fields)` first, never a hand-built
  partial object — omitted fields are written as `null` otherwise.
- Reuse existing components/helpers wherever the spec calls for it — this plan is presentation
  work reusing already-permitted data, not new backend surface.

---

### Task 1: Today-tab header — brand row context + compact `Today` / date line

**Files:**
- Modify: `src/App.jsx:1-18` (imports), `src/App.jsx:1389-1433` (Today-tab header branch)

**Interfaces:**
- Consumes: `topResort` (already computed at `src/App.jsx:1088`), `currentUser`,
  `handleOpenTripById`, `handleOpenPlanDate`, `handleTabChange`, `isMobile`, `todaySubTab`,
  `loading`, `refresh` — all already in scope in `App.jsx`'s render.
- Produces: nothing new consumed by later tasks — this is a leaf UI change.

Today, the Today-tab header branch (inside the `<header>` block) renders a `❄️ Morning
Decision Engine` eyebrow pill + a `Colorado Snow Conditions` / `Snow Conditions` heading, and
a separate paragraph below the `<header>` renders a long description. The mockup instead shows
`Today` as the heading and `{date} · {condition}` as a subtitle, with no separate eyebrow pill
or paragraph. The notification bell (`NotificationBell`) already renders on desktop via
`TopNav`, but `TopNav` is `display:none` below 768px and `MobileTopBar` (logo-only, rendered on
every tab) deliberately has no bell — so mobile's Today screen has no bell at all today. Add
one, scoped to the Today tab only, so it doesn't duplicate the desktop bell.

- [ ] **Step 1: Add the `formatDate` import**

In `src/App.jsx`, the import block starts:
```js
import { useEffect, useMemo, useState } from "react"
import SnowfallBackground from "./components/SnowfallBackground"
import { useMobile } from "./lib/useMobile"
import { localDateKey } from "./lib/calendarDates"
```
Add a new import line directly after the `localDateKey` import:
```js
import { formatDate } from "./lib/format"
```

- [ ] **Step 2: Replace the Today-tab branding block**

Find this block (`src/App.jsx:1389-1404`):
```jsx
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: activeTab === "today" ? 20 : 16 }}>
          {/* Left: branding */}
          <div>
            {activeTab === "today" ? (
              <div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", padding: "5px 10px", borderRadius: 999, fontSize: 11, color: "rgba(255,255,255,0.65)", marginBottom: 8 }}>
                  ❄️ Morning Decision Engine
                </div>
                <h1 style={{ margin: 0, fontSize: isMobile ? 24 : 30, fontWeight: 900, letterSpacing: -0.5 }}>
                  {isMobile ? "Snow Conditions" : "Colorado Snow Conditions"}
                </h1>
              </div>
            ) : (
              <div style={{ fontSize: 18, fontWeight: 900, color: "white", letterSpacing: -0.3 }}>❄️ PowDays</div>
            )}
          </div>
```

Replace it with:
```jsx
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: activeTab === "today" ? 20 : 16 }}>
          {/* Left: branding */}
          <div>
            {activeTab === "today" ? (
              <div>
                <h1 style={{ margin: 0, fontSize: isMobile ? 24 : 30, fontWeight: 900, letterSpacing: -0.5 }}>
                  Today
                </h1>
                <div style={{ marginTop: 4, fontSize: 14, color: "rgba(255,255,255,0.55)" }}>
                  {formatDate(localDateKey())}
                  {todayConditionLabel(topResort) ? ` · ${todayConditionLabel(topResort)}` : ""}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 18, fontWeight: 900, color: "white", letterSpacing: -0.3 }}>❄️ PowDays</div>
            )}
          </div>
```

- [ ] **Step 3: Add the `todayConditionLabel` helper**

This is a small presentational helper, not pure-testable business logic (it only shapes a
label string from already-derived resort data for one screen), so it lives directly in
`App.jsx` near the other small helpers rather than in `src/lib`. Add it above `function
TopNav(...)` (`src/App.jsx:462`):

```js
// A short, honest condition label for the Today header. Only claims "Powder day" when
// there's real fresh snow behind it — an empty/undefined topResort or a dry day just
// shows the date with no dash-clause, rather than guessing.
function todayConditionLabel(topResort) {
  if (!topResort) return ""
  if ((topResort.snowPrev24in ?? 0) >= 6) return "❄️ Powder day"
  if ((topResort.snowPrev24in ?? 0) > 0) return "🌨️ Fresh snow"
  return ""
}
```

- [ ] **Step 4: Add the mobile-only notification bell to the Today-tab header's right side**

Find the right-side actions block (`src/App.jsx:1406-1425`):
```jsx
          {/* Right: actions */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* conditionsSubTab itself lives inside TodayScreen now (Task 2) — App.jsx
                only gets a read-only mirror of it (todaySubTab, via onSubTabChange)
                so this button can stay inline with the title, exactly where it was. */}
            {activeTab === "today" && todaySubTab === "conditions" && (
              <button
                onClick={refresh}
                disabled={loading}
                style={{
                  background: loading ? "rgba(255,255,255,0.12)" : "var(--gradient-primary)",
                  color: "white", border: "none", padding: isMobile ? "10px 12px" : "10px 16px",
                  borderRadius: 12, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer",
                  fontSize: 13, boxShadow: "0 6px 20px rgba(56,189,248,0.22)",
                }}
              >
                {loading ? "…" : isMobile ? "⟳" : "Refresh"}
              </button>
            )}
          </div>
```

Replace it with (adds the bell, mobile-only, Today-tab-only — desktop already has one via
`TopNav`):
```jsx
          {/* Right: actions */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Mobile has no bell today — TopNav (which has one) is desktop-only, and the
                always-on MobileTopBar is deliberately logo-only (TASK 21.2). Scope the bell
                to the Today tab specifically so mobile doesn't end up with two bells once
                TopNav is visible again on desktop. */}
            {activeTab === "today" && isMobile && currentUser && (
              <NotificationBell
                currentUser={currentUser}
                onOpenTrip={handleOpenTripById}
                onOpenPlan={handleOpenPlanDate}
                onTabChange={handleTabChange}
                variant="icon"
              />
            )}
            {/* conditionsSubTab itself lives inside TodayScreen now (Task 2) — App.jsx
                only gets a read-only mirror of it (todaySubTab, via onSubTabChange)
                so this button can stay inline with the title, exactly where it was. */}
            {activeTab === "today" && todaySubTab === "conditions" && (
              <button
                onClick={refresh}
                disabled={loading}
                style={{
                  background: loading ? "rgba(255,255,255,0.12)" : "var(--gradient-primary)",
                  color: "white", border: "none", padding: isMobile ? "10px 12px" : "10px 16px",
                  borderRadius: 12, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer",
                  fontSize: 13, boxShadow: "0 6px 20px rgba(56,189,248,0.22)",
                }}
              >
                {loading ? "…" : isMobile ? "⟳" : "Refresh"}
              </button>
            )}
          </div>
```

- [ ] **Step 5: Remove the now-orphaned description paragraph**

Find (`src/App.jsx:1428-1433`):
```jsx
        {/* Today-tab description — only shown on the conditions sub-tab */}
        {activeTab === "today" && todaySubTab === "conditions" && (
          <p style={{ margin: "0 0 20px", color: "rgba(255,255,255,0.55)", fontSize: 14, maxWidth: 680, lineHeight: 1.6 }}>
            Resort snow, NWS forecasts, terrain metrics, and live COtrip travel conditions — blended into one morning ski decision engine.
          </p>
        )}
```
Delete this block entirely — the mockup's header has no long-form description.

- [ ] **Step 6: Manual verification**

Run `npm run dev`, open the app at a mobile width (375px) and desktop width (1440px):
1. Today tab shows `Today` as the heading and `{date} · {condition or nothing}` below it, no
   eyebrow pill, no long paragraph.
2. On mobile, a notification bell appears in the header's top-right, with the correct unread
   badge count, and tapping it opens the notification panel.
3. On desktop, only **one** bell is visible (in `TopNav`) — the new mobile-only bell does not
   also render.
4. Switch to another tab (e.g. Plans) — its header (`❄️ PowDays` wordmark) is unchanged.
5. `Refresh` button still works and still only shows on the List sub-tab.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "feat: restyle Today-tab header to match mockup, add mobile notification bell"
```

---

### Task 2: Segmented `List | Map` pill

**Files:**
- Modify: `src/components/TodayScreen.jsx:602-629`

**Interfaces:**
- Consumes: existing `conditionsSubTab` state, `setConditionsSubTab` (both already in
  `TodayScreen.jsx`).
- Produces: nothing new — styling-only change to an existing control.

Today the sub-tab switcher is two separate pill-shaped buttons (`🏔️ Snow`, `🗺️ Map`) with a
gap between them. The mockup shows one segmented pill with two halves, `List` and `Map`, where
the inactive half looks like plain text and the active half is a solid rounded highlight
sliding inside a single outer pill.

- [ ] **Step 1: Replace the sub-tab switcher**

Find (`src/components/TodayScreen.jsx:602-629`):
```jsx
      {/* Sub-tab switcher */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {[
          { key: "conditions", label: "🏔️ Snow" },
          { key: "map",        label: "🗺️ Map" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setConditionsSubTab(key)}
            style={{
              background: conditionsSubTab === key
                ? "var(--gradient-primary)"
                : "rgba(255,255,255,0.06)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.12)",
              padding: "9px 16px",
              borderRadius: 12,
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: conditionsSubTab === key ? "0 4px 14px rgba(56,189,248,0.2)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>
```

Replace it with:
```jsx
      {/* Segmented List | Map control — one outer pill, two halves */}
      <div
        style={{
          display: "inline-flex",
          gap: 2,
          padding: 3,
          marginBottom: 20,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 999,
        }}
      >
        {[
          { key: "conditions", label: "List" },
          { key: "map",        label: "Map" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setConditionsSubTab(key)}
            style={{
              background: conditionsSubTab === key ? "var(--gradient-primary)" : "transparent",
              color: conditionsSubTab === key ? "white" : "rgba(255,255,255,0.6)",
              border: "none",
              padding: "8px 20px",
              borderRadius: 999,
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: conditionsSubTab === key ? "0 4px 14px rgba(56,189,248,0.25)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>
```

- [ ] **Step 2: Manual verification**

`npm run dev`, Today tab: confirm a single pill-shaped container holds both `List` and `Map`,
tapping either switches the sub-tab exactly as before (map renders `PowderMap`, list renders
the resort content), and the active side is visually highlighted.

- [ ] **Step 3: Commit**

```bash
git add src/components/TodayScreen.jsx
git commit -m "feat: restyle Today sub-tab switcher as a single segmented List|Map pill"
```

---

### Task 3: Extract `FriendsGoingBadge` into its own file with a `variant` prop

**Files:**
- Create: `src/components/FriendsGoingBadge.jsx`
- Modify: `src/components/TodayScreen.jsx:1-6` (imports), `:108-137` (delete local
  definition), `:225` (usage inside `ResortCard`, unchanged call — same import path change
  only)

**Interfaces:**
- Consumes: `Avatar` (`./ui/Avatar`, already imported in `TodayScreen.jsx`).
- Produces: `export default function FriendsGoingBadge({ friends, variant = "subtle" })` — the
  `subtle` variant is byte-for-byte identical to today's only usage (inside `ResortCard`); the
  `solid` variant is consumed by `BestBetCard` in Task 4.

`FriendsGoingBadge` is currently a private component inside `TodayScreen.jsx`, used once
(inside `ResortCard`, showing a stacked-avatar "N friends going" pill). Task 4 needs the exact
same click-to-reveal-names behavior in the new hero card, styled as a solid button with a
headcount bubble instead of avatar thumbnails. Rather than duplicate the popover logic a third
time (`ResortCard`'s own friends handling is the second), extract it once and add a style
variant — no new behavior, just where the pixels go.

- [ ] **Step 1: Create the new file**

`src/components/FriendsGoingBadge.jsx`:
```jsx
import { useState } from "react"
import Avatar from "./ui/Avatar"

/**
 * "N friends going" — click-to-reveal-names popover over a stacked avatar row.
 *
 * `variant="subtle"` (default) matches the original inline-card treatment: a faint
 * rgba pill with a row of overlapping avatar thumbnails.
 * `variant="solid"` is for the Today hero card: a filled accent pill with a dark
 * headcount bubble instead of avatar images — same data, same click behavior, no new
 * logic, just presented larger and bolder for the one "best bet" card on the page.
 */
export default function FriendsGoingBadge({ friends, variant = "subtle" }) {
  const [open, setOpen] = useState(false)
  if (!friends?.length) return null

  const isSolid = variant === "solid"

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={
          isSolid
            ? {
                display: "flex", alignItems: "center", gap: 10,
                background: "var(--gradient-primary)", border: "none",
                borderRadius: 999, padding: "12px 18px", cursor: "pointer",
                boxShadow: "0 6px 20px rgba(56,189,248,0.25)",
              }
            : {
                display: "flex", alignItems: "center", gap: 6,
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 999, padding: "4px 10px 4px 6px", cursor: "pointer",
              }
        }
      >
        {isSolid ? (
          <span style={{
            display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: "50%",
            background: "rgba(4,8,15,0.35)", color: "white", fontSize: 12, fontWeight: 900,
          }}>
            {friends.length}
          </span>
        ) : (
          <div style={{ display: "flex" }}>
            {friends.slice(0, 3).map((f, i) => (
              <div key={f.id} style={{ marginLeft: i > 0 ? -8 : 0, border: "2px solid var(--color-bg)", borderRadius: "50%" }}>
                <Avatar profile={f} size={22} />
              </div>
            ))}
          </div>
        )}
        <span style={{
          fontSize: isSolid ? 14 : 12, fontWeight: 800,
          color: isSolid ? "white" : "rgba(255,255,255,0.75)",
        }}>
          {isSolid ? "Who's going" : `${friends.length} friend${friends.length === 1 ? "" : "s"} going this weekend`}
        </span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "110%", left: 0, background: "var(--color-surface-popover)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 10, zIndex: 20, minWidth: 160, boxShadow: "0 12px 40px rgba(0,0,0,0.4)" }}>
          {friends.map((f) => (
            <div key={f.id} style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", padding: "4px 0" }}>{f.full_name || f.username}</div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Delete the local definition from `TodayScreen.jsx` and import the new file**

Delete `src/components/TodayScreen.jsx:108-137` (the entire `function FriendsGoingBadge({
friends }) { ... }` block).

At the top of `src/components/TodayScreen.jsx`, change:
```js
import { useEffect, useState } from "react"
import PowderMap from "./PowderMap"
import Badge, { TIER_COLORS } from "./ui/Badge"
import ScoreRing from "./ui/ScoreRing"
import Avatar from "./ui/Avatar"
import { useIsStandalone } from "../lib/useMobile"
```
to:
```js
import { useEffect, useState } from "react"
import PowderMap from "./PowderMap"
import Badge, { TIER_COLORS } from "./ui/Badge"
import ScoreRing from "./ui/ScoreRing"
import Avatar from "./ui/Avatar"
import FriendsGoingBadge from "./FriendsGoingBadge"
import { useIsStandalone } from "../lib/useMobile"
```
(`Avatar` stays imported — `ResortLogo` and other local code don't use it directly today, but
leaving the import is harmless and `Avatar` remains genuinely used transitively... actually
verify: if nothing else in `TodayScreen.jsx` uses `Avatar` directly after this extraction,
**remove** the `Avatar` import instead, to avoid a new unused-import lint error. Check with
`grep -n "Avatar" src/components/TodayScreen.jsx` after Step 2 — if the only remaining match is
the import line itself, delete that import line.)

The one existing call site, inside `ResortCard` (`src/components/TodayScreen.jsx:225`):
```jsx
        <FriendsGoingBadge friends={friendsGoing} />
```
is unchanged — same props, same default `variant="subtle"`, just resolving to the new file now.

- [ ] **Step 3: Manual verification**

`npm run dev`, Today tab, List sub-tab: expand any resort card that has friends going (or check
one that already showed the badge before this change) — the "N friends going this weekend"
pill with stacked avatars still renders and the click-to-reveal-names popover still works,
identically to before.

- [ ] **Step 4: Run the test suite**

```bash
npm test
```
Expected: still passes (this task touches no `src/lib` file).

- [ ] **Step 5: Commit**

```bash
git add src/components/FriendsGoingBadge.jsx src/components/TodayScreen.jsx
git commit -m "refactor: extract FriendsGoingBadge to its own file with a solid variant"
```

---

### Task 4: `BestBetCard` — replace the crown card + Best-Epic/Best-Ikon cards

**Files:**
- Create: `src/components/BestBetCard.jsx`
- Modify: `src/lib/resorts.js` (add exported `mapsUrl`)
- Modify: `src/components/TodayScreen.jsx` (imports; replace the hero-render block; remove its
  own private `mapsUrl` in favor of the shared one)
- Modify: `src/App.jsx` (remove now-dead `rankedEpic`/`rankedIkon`/`topEpic`/`topIkon`, remove
  `topEpic`/`topIkon` props passed to `TodayScreen`, remove the `.leader-crown` animation rule)
- Modify: `src/index.css` (remove the now-dead `.leader-grid` rule)

**Interfaces:**
- Consumes: `topResort` (same shape already used by the crown card — `name`, `powderScore`,
  `powderTier`, `pass`, `snowPrev24in`, `wind`, `driveRisk`, `directionsQuery`,
  `resortKey`), `friendTripsByResort` (already a `TodayScreen` prop), `RISK_COLORS` (`./ui/Badge`,
  already exported, identical mapping to `TodayScreen.jsx`'s private `riskColor()` — reuse it
  rather than redefining a third copy), `mapsUrl` (new export from `../lib/resorts`, see Step 1).
- Produces: `export default function BestBetCard({ topResort, friendsGoing })`, consumed by
  `TodayScreen.jsx`. Also `export function mapsUrl(destination)` in `src/lib/resorts.js`,
  consumed by both `BestBetCard.jsx` and (after Step 3) `TodayScreen.jsx`'s existing `ResortCard`.

- [ ] **Step 1: Move `mapsUrl` into `src/lib/resorts.js`, with a test**

`TodayScreen.jsx` already has a private `mapsUrl()` helper (used by `ResortCard`'s Directions
button); `BestBetCard` needs the identical function for its own Directions button. Rather than
add a third copy, promote it to the shared resorts lib both files already import from. It's a
mechanical relocation of already-working code, not new behavior, so this is one step rather
than a full red-green cycle — but it's landing in a file with existing test coverage
(`src/lib/resorts.test.js`), so it gets a test alongside it.

Add to `src/lib/resorts.js` (anywhere among its other exported functions, e.g. directly after
`normalizeResortKey`):
```js
export function mapsUrl(destination) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}
```

Add to `src/lib/resorts.test.js` (check its top for the existing import line from
`"./resorts.js"` and add `mapsUrl` to it):
```js
test("mapsUrl builds a Google Maps directions link, URL-encoding the destination", () => {
  const url = mapsUrl("Vail Parking Structure, Vail CO")
  assert.strictEqual(
    url,
    "https://www.google.com/maps/dir/?api=1&destination=Vail%20Parking%20Structure%2C%20Vail%20CO"
  )
})
```

Run `node --test src/lib/resorts.test.js` — expect PASS (this is confirming a relocation, not
discovering new behavior, so there's no red step here).

- [ ] **Step 2: Remove `TodayScreen.jsx`'s private copy and import the shared one**

In `src/components/TodayScreen.jsx`, delete the local definition (near the top of the file,
directly below the `mapsUrl` used by `formatPercent`):
```js
function mapsUrl(destination) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destination
  )}`
}
```
Add an import for it instead — `src/components/TodayScreen.jsx` doesn't currently import
anything from `../lib/resorts`, so add a new import line near its other imports:
```js
import { mapsUrl } from "../lib/resorts"
```
`ResortCard`'s existing `href={mapsUrl(r.directionsQuery)}` call is unchanged — same function,
same signature, just imported now instead of locally defined.

- [ ] **Step 3: Create `BestBetCard.jsx`**

```jsx
import Badge, { TIER_COLORS, RISK_COLORS } from "./ui/Badge"
import FriendsGoingBadge from "./FriendsGoingBadge"
import { mapsUrl } from "../lib/resorts"

/**
 * The Today List View's single hero card — "Best Bet Today". Replaces the old
 * 👑 crown card plus the separate Best-Epic/Best-Ikon boxes (ROADMAP TASK 22.0,
 * Decision 5): that per-pass callout is dropped, the pass badge on this card and on
 * every list row below it is what's left of it.
 */
export default function BestBetCard({ topResort, friendsGoing }) {
  if (!topResort) return null

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 24,
        padding: 22,
        display: "grid",
        gap: 14,
        boxShadow: "0 18px 50px rgba(0,0,0,0.3)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
            Best Bet Today
          </div>
          <div style={{ marginTop: 4, fontSize: 26, fontWeight: 900, lineHeight: 1.1 }}>
            {topResort.name}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge label={topResort.pass} color="var(--rating-slate)" />
            <Badge label={topResort.powderTier ?? "Closed"} color={TIER_COLORS[topResort.powderTier] ?? TIER_COLORS.Closed} />
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, color: TIER_COLORS[topResort.powderTier] ?? TIER_COLORS.Closed }}>
            {topResort.powderScore}
          </div>
          <div style={{ marginTop: 2, fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
            Powder Score
          </div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
        {topResort.snowPrev24in != null ? `${topResort.snowPrev24in}" overnight` : "—"}
        {" · "}
        {topResort.wind || "—"}
        {" · "}
        Drive risk <span style={{ color: RISK_COLORS[topResort.driveRisk] ?? RISK_COLORS.Severe, fontWeight: 800 }}>{topResort.driveRisk || "Unknown"}</span>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <FriendsGoingBadge friends={friendsGoing} variant="solid" />
        <a
          href={mapsUrl(topResort.directionsQuery)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            textDecoration: "none", color: "white", fontWeight: 800, fontSize: 14,
            padding: "12px 20px", borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.06)",
          }}
        >
          Directions
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire it into `TodayScreen.jsx`, remove the crown card + `LeaderCard` usages**

Add the import (near the other component imports at the top of `src/components/TodayScreen.jsx`):
```js
import BestBetCard from "./BestBetCard"
```

Find the hero block (`src/components/TodayScreen.jsx:640-709`):
```jsx
      {conditionsSubTab === "conditions" && topResort && (
        <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
          <div
            className="leader-crown"
            style={{
              background: scoreGradient(topResort.powderScore),
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 24,
              padding: 22,
              display: "grid",
              gap: 10,
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 28 }}>👑</div>
              <div style={{ fontSize: 24, fontWeight: 900 }}>
                Best Powder Right Now: {topResort.name} — {topResort.powderScore}
              </div>
              <div
                style={{
                  borderRadius: 999,
                  padding: "6px 10px",
                  background: "rgba(255,255,255,0.14)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  color: tierColor(topResort.powderTier),
                  fontSize: 12,
                  fontWeight: 900,
                  textTransform: "uppercase",
                }}
              >
                {topResort.powderTier}
              </div>
            </div>

            <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 14 }}>
              {topResort.snowPrev24in != null
                ? `${topResort.snowPrev24in}" in the last 24h`
                : "—"}{" "}
              ·{" "}
              {topResort.snow24in != null
                ? `${topResort.snow24in}" forecast next 24h`
                : "—"}{" "}
              · {topResort.tempF != null ? `${topResort.tempF}°F` : "—"} ·{" "}
              {topResort.wind || "—"} ·{" "}
              <span style={{ color: riskColor(topResort.driveRisk), fontWeight: 900 }}>
                Drive {topResort.driveRisk}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                fontSize: 13,
                color: "rgba(255,255,255,0.8)",
              }}
            >
              {secondResort && <div>🥈 {secondResort.name} ({secondResort.powderScore})</div>}
              {thirdResort && <div>🥉 {thirdResort.name} ({thirdResort.powderScore})</div>}
            </div>
          </div>

          <div className="leader-grid">
            <LeaderCard title="Best Epic Resort" icon="🎿" resort={topEpic} />
            <LeaderCard title="Best Ikon Resort" icon="🏔️" resort={topIkon} />
          </div>
        </div>
      )}
```

Replace it with:
```jsx
      {conditionsSubTab === "conditions" && topResort && (
        <div style={{ marginBottom: 20 }}>
          <BestBetCard topResort={topResort} friendsGoing={friendTripsByResort[topResort.resortKey] || []} />
        </div>
      )}
```

- [ ] **Step 5: Delete the now-dead `LeaderCard` function**

Delete `src/components/TodayScreen.jsx:334-384` (the entire `function LeaderCard({ title, icon,
resort }) { ... }` block) — its only two call sites were just removed in Step 4.

- [ ] **Step 6: Remove `secondResort`/`thirdResort`/`topEpic`/`topIkon` from `TodayScreen`'s props**

They're no longer read anywhere in the file after Steps 4-5. In the `export default function
TodayScreen({ ... })` destructuring (`src/components/TodayScreen.jsx:561-586`), remove the
lines:
```js
  secondResort,
  thirdResort,
  topEpic,
  topIkon,
```
(`topResort` stays — it's still used by `BestBetCard`.)

- [ ] **Step 7: Remove the same dead data from `App.jsx`**

Delete `src/App.jsx:1078-1086` (`rankedEpic`/`rankedIkon`) and the two lines at
`src/App.jsx:1091-1092` (`topEpic`/`topIkon`), leaving:
```js
  const rankedResorts = useMemo(
    () =>
      [...rows]
        .filter((r) => r.powderScore != null && r.isOpen !== false)
        .sort((a, b) => b.powderScore - a.powderScore),
    [rows]
  )

  const topResort = rankedResorts[0]
  const secondResort = rankedResorts[1]
  const thirdResort = rankedResorts[2]
```

`secondResort`/`thirdResort` are still computed here — leave the constants in place even
though `TodayScreen` no longer reads them via props, **unless** `grep -n
"secondResort\|thirdResort" src/App.jsx` after this step shows no other consumer, in which case
delete those two lines too to avoid an unused-variable lint warning. (Check before assuming —
don't leave dead code either way.)

In the `<TodayScreen ... />` call (`src/App.jsx:1459-1463`), remove the now-invalid props:
```jsx
            secondResort={secondResort}
            thirdResort={thirdResort}
            topEpic={topEpic}
            topIkon={topIkon}
```
(Again: only remove `secondResort={secondResort}`/`thirdResort={thirdResort}` if you deleted
their constants in the previous paragraph — keep the JSX prop consistent with whether the
constant still exists.)

- [ ] **Step 8: Remove the dead `.leader-crown` animation rule**

In `src/App.jsx`, find and delete this line (near line 1147, inside an inline `<style>` block):
```css
        .leader-crown { animation: floaty 2.8s ease-in-out infinite; }
```

- [ ] **Step 9: Remove the dead `.leader-grid` CSS rule**

In `src/index.css`, delete the block at lines 405-416:
```css
/* ── Leader cards grid ──────────────────────────────────────────── */
.leader-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}
@media (max-width: 639px) {
  .leader-grid {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
}
```

- [ ] **Step 10: Manual verification**

`npm run dev`, Today tab, List sub-tab: the hero now renders as the compact `BestBetCard` (Best
Bet Today label, resort name, pass + tier pills, big score number, one stat line, `Who's going`
+ `Directions` buttons) — no crown emoji, no silver/bronze runner-up line, no separate Best
Epic/Best Ikon boxes below it. `Who's going` opens the same name popover as before. `Directions`
opens Google Maps to the resort. Confirm no console errors about missing props.

- [ ] **Step 11: Run the test suite and lint**

```bash
npm test
npx eslint .
```
Expected: `npm test` now shows 131 passing (130 + the new `mapsUrl` test from Step 1). `npx
eslint .` at or below the 87-problem baseline — specifically check there's no new
`no-unused-vars` for `topEpic`/`topIkon`/`secondResort`/`thirdResort`/`LeaderCard`, and no
leftover reference to the deleted local `mapsUrl`/`riskColor` in `TodayScreen.jsx`.

- [ ] **Step 12: Commit**

```bash
git add src/components/BestBetCard.jsx src/lib/resorts.js src/lib/resorts.test.js src/components/TodayScreen.jsx src/App.jsx src/index.css
git commit -m "feat: replace Today hero with compact BestBetCard, drop Best-Epic/Best-Ikon cards"
```

---

### Task 5: `ResortListRow` — compact collapsed row (presentational only)

**Files:**
- Create: `src/components/ResortListRow.jsx`

**Interfaces:**
- Consumes: nothing beyond its own props.
- Produces: `export default function ResortListRow({ rank, r, expanded, onToggle })`, consumed
  by `TodayScreen.jsx` in Task 6. Not wired into the resort list yet in this task — it's built
  and can be eyeballed via a temporary render, but the real integration (replacing the always-
  expanded card grid) is Task 6, kept separate so each task stays independently reviewable.

- [ ] **Step 1: Create `ResortListRow.jsx`**

```jsx
import { TIER_COLORS } from "./ui/Badge"

/**
 * One compact row in the Today List View — rank, score pill, name, tier·pass
 * subtitle, and 24h-snow/base numbers on the right. Tapping toggles the full
 * ResortCard open beneath it (TodayScreen owns the expanded/collapsed state).
 */
export default function ResortListRow({ rank, r, expanded, onToggle }) {
  const tierColor = TIER_COLORS[r.powderTier] ?? TIER_COLORS.Closed

  return (
    <button
      onClick={onToggle}
      aria-expanded={expanded}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        textAlign: "left",
        background: expanded ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: expanded ? "16px 16px 0 0" : 16,
        padding: "12px 14px",
        cursor: "pointer",
        opacity: r.isOpen === false ? 0.6 : 1,
      }}
    >
      <div style={{ width: 18, textAlign: "center", fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>
        {rank}
      </div>

      <div style={{
        display: "grid", placeItems: "center", minWidth: 40, height: 32, padding: "0 6px",
        borderRadius: 10, border: `1px solid ${tierColor}`, color: tierColor,
        fontSize: 15, fontWeight: 900, flexShrink: 0,
      }}>
        {r.powderScore ?? "—"}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.name}
        </div>
        <div style={{ marginTop: 2, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          {r.powderTier ?? "Closed"} · {r.pass}
        </div>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>
          {r.snowPrev24in != null ? `${r.snowPrev24in}"` : "—"}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>24H SNOW</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 40 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>
          {r.baseDepth != null ? `${r.baseDepth}"` : "—"}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>BASE</div>
      </div>
    </button>
  )
}
```

- [ ] **Step 2: Temporary render to eyeball it**

Not committed — for local review only. In `src/components/TodayScreen.jsx`, temporarily add
`import ResortListRow from "./ResortListRow"` and drop `<ResortListRow rank={2} r={rows[0]}
expanded={false} onToggle={() => {}} />` anywhere inside the `conditions` sub-tab render. Run
`npm run dev`, confirm it looks like one compact row per the mockup screenshot (rank, colored
score pill, name, tier·pass subtitle, right-aligned snow/base numbers). Then **revert this
temporary render** — Task 6 does the real integration.

- [ ] **Step 3: Commit**

```bash
git add src/components/ResortListRow.jsx
git commit -m "feat: add ResortListRow, the compact collapsed resort-list row"
```

---

### Task 6: Wire the accordion — compact list + expand-in-place

**Files:**
- Modify: `src/components/TodayScreen.jsx` (imports; resort-list render block)
- Modify: `src/index.css` (new `.resort-list` rule)

**Interfaces:**
- Consumes: `ResortListRow` (Task 5), the existing `ResortCard` (unchanged in this task —
  gains its new props in Task 8), `rows`, `topResort`, `sortBy`.
- Produces: local `expandedKeys` state (a `Set` of `resortKey`s) — internal to `TodayScreen`,
  not consumed elsewhere.

`rows` includes every resort, including the one already shown in `BestBetCard`. The mockup's
list is explicitly "N **MORE** resorts" and starts numbering at 2 — so the top resort must be
excluded from the list below, or it would appear twice.

- [ ] **Step 1: Import `ResortListRow` and add expand-state**

Add the import near the top of `src/components/TodayScreen.jsx`:
```js
import ResortListRow from "./ResortListRow"
```

Inside `export default function TodayScreen({ ... }) { ... }`, alongside the existing
`const [conditionsSubTab, setConditionsSubTab] = useState("conditions")` line, add:
```js
  const [expandedKeys, setExpandedKeys] = useState(new Set())

  function toggleExpanded(resortKey) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(resortKey)) next.delete(resortKey)
      else next.add(resortKey)
      return next
    })
  }
```

- [ ] **Step 2: Replace the resort-list render**

Find (`src/components/TodayScreen.jsx:792-796`):
```jsx
          <main className="resort-grid">
            {rows.map((r) => (
              <ResortCard key={r.name} r={r} skierCounts={skierCounts} skierDetails={skierDetails} activityCount={resortActivityCounts[r.resortKey] || 0} friendsGoing={friendTripsByResort[r.resortKey] || []} vibeData={vibeData} onOpenMountainPage={setMountainPageResortKey} />
            ))}
          </main>
```

Replace it with:
```jsx
          {(() => {
            const moreResorts = rows.filter((r) => r.resortKey !== topResort?.resortKey)
            return (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.8, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
                    {moreResorts.length} More Resort{moreResorts.length === 1 ? "" : "s"}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                    sorted by {sortBy}
                  </div>
                </div>
                <main className="resort-list">
                  {moreResorts.map((r, i) => (
                    <div key={r.resortKey}>
                      <ResortListRow
                        rank={i + 2}
                        r={r}
                        expanded={expandedKeys.has(r.resortKey)}
                        onToggle={() => toggleExpanded(r.resortKey)}
                      />
                      {expandedKeys.has(r.resortKey) && (
                        <ResortCard
                          r={r}
                          skierCounts={skierCounts}
                          skierDetails={skierDetails}
                          activityCount={resortActivityCounts[r.resortKey] || 0}
                          friendsGoing={friendTripsByResort[r.resortKey] || []}
                          vibeData={vibeData}
                          onOpenMountainPage={setMountainPageResortKey}
                        />
                      )}
                    </div>
                  ))}
                </main>
              </>
            )
          })()}
```

(`ResortCard` here still takes exactly its current props — Task 8 adds `myTodayPlan` and
`onSkiHereToday` to this same call site.)

- [ ] **Step 3: Add the `.resort-list` CSS rule**

`ResortCard` still uses the `.resort-card`/`.resort-card-hero` classes and expects to render as
a full-width block when expanded, not a grid cell — so the container needs a simple vertical
stack, not `.resort-grid`'s `repeat(auto-fit, minmax(305px, 1fr))` multi-column layout. In
`src/index.css`, add this new rule directly after the existing `.resort-grid` block (after line
403):
```css
/* ── Compact resort list (Today List View) ──────────────────────── */
.resort-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

- [ ] **Step 4: Restyle the filter bar as a slimmer row (spec Decision 6)**

The filter bar (pass-filter pills, search box, sort dropdown) already sits between the hero
and the resort list structurally — nothing to move. But it's still sized for the old,
taller card grid; spec Decision 6 calls for it "restyled as a slimmer row... so it doesn't
fight the compact list's density." Find the `filter-bar` section
(`src/components/TodayScreen.jsx`, inside the `conditionsSubTab === "conditions"` block):
```jsx
          <section
            className="filter-bar"
            style={{
              marginTop: 4,
              marginBottom: 20,
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              {["All", "Epic", "Ikon"].map((p) => (
                <button
                  key={p}
                  onClick={() => setPassFilter(p)}
                  style={{
                    background:
                      passFilter === p
                        ? "var(--gradient-pass-pill)"
                        : "rgba(255,255,255,0.06)",
                    color: passFilter === p ? "var(--color-pass-pill-text)" : "white",
                    border: "1px solid rgba(255,255,255,0.1)",
                    padding: "10px 14px",
                    borderRadius: 999,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search resort…"
              style={{
                flex: 1,
                minWidth: 220,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "white",
                padding: "12px 14px",
                borderRadius: 14,
                outline: "none",
              }}
            />

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "white",
                padding: "12px 14px",
                borderRadius: 14,
                outline: "none",
              }}
            >
              <option>Powder Score</option>
              <option>Name</option>
              <option>Temp</option>
              <option>Snow 24h</option>
              <option>Travel Risk</option>
            </select>
          </section>
```
Replace the four `style={{...}}` blocks with slimmer padding/sizing (same structure, same
handlers, just smaller): the `<section>`'s `marginBottom: 20` → `14`; each pass-filter
button's `padding: "10px 14px"` → `"7px 12px"` plus `fontSize: 13`; the `<input>`'s and
`<select>`'s `padding: "12px 14px"` → `"9px 12px"` plus `fontSize: 13` on both. No handlers,
state, or structure change — this step is sizing only.

- [ ] **Step 5: Manual verification**

`npm run dev`, Today tab, List sub-tab:
1. The section header reads "N More Resorts" / "sorted by Powder Score" (or whichever sort is
   active), and N is one less than the total resort count (the top resort isn't repeated).
2. Below it, every other resort renders as one compact `ResortListRow`.
3. Tapping a row expands the full `ResortCard` content directly beneath it, tapping again
   collapses it. Multiple rows can be expanded at once.
4. Switching the sort dropdown re-sorts the compact rows, same as it did the old cards.
5. The search box and pass filter still narrow `rows` (hence the list) the same as before.
6. The filter bar visibly reads smaller/tighter than before, and sits close to the "N More
   Resorts" header rather than floating with a lot of space around it.

- [ ] **Step 6: Run the test suite**

```bash
npm test
```
Expected: unchanged, 131 passing (130 baseline + the `mapsUrl` test added in Task 4).

- [ ] **Step 7: Commit**

```bash
git add src/components/TodayScreen.jsx src/index.css
git commit -m "feat: wire compact resort list with accordion expand into Today List View"
```

---

### Task 7: `myTodayPlan` — load and save the user's own plan for today

**Files:**
- Modify: `src/lib/planUpsert.js` (new pure function)
- Test: `src/lib/planUpsert.test.js` (new test cases)
- Modify: `src/App.jsx` (imports; new state, fetch effect, save handler; pass props into
  `TodayScreen`)

**Interfaces:**
- Consumes: `getMyDailyPlan` (`src/lib/socialApi.js`, exists, unmodified), `buildPlanUpsert`
  (`src/lib/planUpsert.js`, exists, unmodified), `upsertDailyPlan` (`src/lib/socialApi.js`,
  exists, unmodified), `currentUser` (already in `App.jsx`).
- Produces: `export function planButtonState(myTodayPlan, resortKey)` returning `{ label:
  string, mode: "create" | "switch" | "edit" }`, consumed by `ResortCard` in Task 8.
  `App.jsx` gains `myTodayPlan`, `savingTodayPlan`, `todayPlanError` state and a
  `handleSaveTodayPlan({ resortKey, eta, visibility })` function, all passed into
  `<TodayScreen>` as new props (`myTodayPlan`, `savingTodayPlan`, `todayPlanError`,
  `onSaveTodayPlan`).

This is the one piece of genuinely pure, unit-testable logic in this plan (§3.5 of the spec's
three button states) — write it test-first.

- [ ] **Step 1: Write the failing test**

Add to the end of `src/lib/planUpsert.test.js`:
```js
test("planButtonState: no plan today → create", () => {
  const result = planButtonState(null, "vail")
  assert.deepStrictEqual(result, { label: "Ski here today", mode: "create" })
})

test("planButtonState: plan exists at a different resort → switch", () => {
  const result = planButtonState({ resort_key: "vail" }, "copper")
  assert.deepStrictEqual(result, { label: "Switch to here", mode: "switch" })
})

test("planButtonState: plan already at this resort → edit", () => {
  const result = planButtonState({ resort_key: "vail" }, "vail")
  assert.deepStrictEqual(result, { label: "✓ You're skiing here", mode: "edit" })
})
```

Check the top of `src/lib/planUpsert.test.js` for its existing import line (e.g. `import {
buildPlanUpsert } from "./planUpsert.js"`) and add `planButtonState` to it:
```js
import { buildPlanUpsert, planButtonState } from "./planUpsert.js"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/planUpsert.test.js`
Expected: FAIL — `planButtonState is not a function` (or a `TypeError`/`ReferenceError` to that
effect), since it doesn't exist yet.

- [ ] **Step 3: Implement `planButtonState`**

Add to the end of `src/lib/planUpsert.js`:
```js
/**
 * The three states the "Ski here today"/"Switch to here"/"✓ You're skiing here" button on
 * a resort card can be in, derived from the user's own plan for today (or null, if they
 * don't have one) and the resort the card belongs to.
 *
 * @param {object|null} myTodayPlan - result of getMyDailyPlan(localDateKey()), or null
 * @param {string} resortKey - the resort this card is for
 * @returns {{ label: string, mode: "create" | "switch" | "edit" }}
 */
export function planButtonState(myTodayPlan, resortKey) {
  if (!myTodayPlan) return { label: "Ski here today", mode: "create" }
  if (myTodayPlan.resort_key === resortKey) return { label: "✓ You're skiing here", mode: "edit" }
  return { label: "Switch to here", mode: "switch" }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/planUpsert.test.js`
Expected: PASS, all three new cases plus every existing `buildPlanUpsert` case.

- [ ] **Step 5: Commit the pure function**

```bash
git add src/lib/planUpsert.js src/lib/planUpsert.test.js
git commit -m "feat: add planButtonState, the Ski-here-today button's three-state logic"
```

- [ ] **Step 6: Add `myTodayPlan` state and the fetch effect to `App.jsx`**

In the `import { ... } from "./lib/socialApi"` block (`src/App.jsx:19-32`), add
`getMyDailyPlan` and `upsertDailyPlan` to the named imports:
```js
import {
  getAcceptedFriends,
  getCurrentUser,
  getFriendUpcomingTripsByResort,
  getMyDailyPlan,
  getMyProfile,
  getResortActivityCounts,
  getResortSkierCounts,
  getResortSkierDetails,
  getResortVibeData,
  getTripDetail,
  logActivityOnce,
  logOut,
  syncVerificationFromAuth,
  upsertDailyPlan,
} from "./lib/socialApi"
```

Add a new import line for `buildPlanUpsert`, directly after the `leaderboardApi` import:
```js
import { flushSessionToSupabase, logSkiDay } from "./lib/leaderboardApi"
import { buildPlanUpsert } from "./lib/planUpsert"
```

Near the other today-tab-adjacent state (alongside `const [friendTripsByResort, ...]` at
`src/App.jsx:598`), add:
```js
  const [myTodayPlan, setMyTodayPlan] = useState(null)
  const [savingTodayPlan, setSavingTodayPlan] = useState(false)
  const [todayPlanError, setTodayPlanError] = useState(null)
```

Directly after the existing `friendTripsByResort` fetch effect (`src/App.jsx:966-973`), add a
new effect with the same shape:
```js
  useEffect(() => {
    if (!currentUser) { setMyTodayPlan(null); return }
    let cancelled = false
    getMyDailyPlan(localDateKey())
      .then((plan) => { if (!cancelled) setMyTodayPlan(plan) })
      .catch(() => { if (!cancelled) setMyTodayPlan(null) })
    return () => { cancelled = true }
  }, [currentUser])
```

- [ ] **Step 7: Add the save handler**

Directly after `handleTabChange` (`src/App.jsx:1062-1068`), add:
```js
  async function handleSaveTodayPlan({ resortKey, eta, visibility }) {
    setSavingTodayPlan(true); setTodayPlanError(null)
    try {
      const saved = await upsertDailyPlan(buildPlanUpsert(myTodayPlan, {
        skiDate: localDateKey(),
        resortKey,
        visibility,
        eta, // already snapped by PlanEditorModal
      }))
      setMyTodayPlan(saved)
      return true
    } catch (err) {
      setTodayPlanError(err?.message || "Couldn't save that plan. Try again.")
      return false
    } finally {
      setSavingTodayPlan(false)
    }
  }
```

- [ ] **Step 8: Pass the new props into `TodayScreen`**

In the `<TodayScreen ... />` call (`src/App.jsx:1441-1468`), add:
```jsx
            myTodayPlan={myTodayPlan}
            savingTodayPlan={savingTodayPlan}
            todayPlanError={todayPlanError}
            onSaveTodayPlan={handleSaveTodayPlan}
```

- [ ] **Step 9: Manual verification**

`npm run dev`, log in, open the Today tab. Open the browser console and confirm no errors from
the new effect. (There's no visible UI yet for this data — that's Task 8. This step is just
confirming the fetch doesn't throw.)

- [ ] **Step 10: Run the full suite and lint**

```bash
npm test
npx eslint .
```
Expected: `npm test` now shows 134 passing (131 + the 3 new `planButtonState` cases). `npx
eslint .` at or below the 87-problem baseline.

- [ ] **Step 11: Commit**

```bash
git add src/App.jsx
git commit -m "feat: load and save the current user's own plan for today"
```

---

### Task 8: "Ski here today" button — wire `ResortCard` to `PlanEditorModal`

**Files:**
- Modify: `src/components/TodayScreen.jsx` (imports; `ResortCard` component; the `ResortCard`
  call site from Task 6; new modal-owning state + render)

**Interfaces:**
- Consumes: `planButtonState` (Task 7), `PlanEditorModal` (existing, unmodified — props
  `dateKey`, `plan`, `resorts`, `busy`, `error`, `defaultResortKey`, `onSave`, `onClose`),
  `localDateKey` (`src/lib/calendarDates.js`), `myTodayPlan`/`savingTodayPlan`/
  `todayPlanError`/`onSaveTodayPlan` (Task 7's new `TodayScreen` props).
- Produces: nothing new for later tasks — this is the last task in the plan.

`PlanEditorModal` is reused completely unmodified (spec Decision 7): `defaultResortKey`
pre-fills the dropdown (still changeable — consistent with the rest of the app, where switching
mountains is a normal action, not a special locked mode), and omitting `onDateChange` already
renders the date as fixed/read-only. Today's date comes from `dateKey={localDateKey()}`.

- [ ] **Step 1: Import what's needed**

At the top of `src/components/TodayScreen.jsx`, add:
```js
import PlanEditorModal from "./PlanEditorModal"
import { planButtonState } from "../lib/planUpsert"
import { localDateKey } from "../lib/calendarDates"
```

- [ ] **Step 2: Add `myTodayPlan` etc. to `TodayScreen`'s props and add modal-open state**

In the `export default function TodayScreen({ ... })` destructuring
(`src/components/TodayScreen.jsx:561-586`), add:
```js
  myTodayPlan,
  savingTodayPlan,
  todayPlanError,
  onSaveTodayPlan,
```

Alongside `expandedKeys` (added in Task 6), add:
```js
  const [skiHereModalResortKey, setSkiHereModalResortKey] = useState(null)
```

- [ ] **Step 3: Add the "Ski here today" button to `ResortCard`**

`ResortCard`'s signature (`src/components/TodayScreen.jsx:139`) currently is:
```js
function ResortCard({ r, skierCounts, skierDetails, activityCount = 0, friendsGoing, vibeData, onOpenMountainPage }) {
```
Change it to:
```js
function ResortCard({ r, skierCounts, skierDetails, activityCount = 0, friendsGoing, vibeData, onOpenMountainPage, myTodayPlan, onSkiHereToday }) {
```

Find the "Mountain Page" button (`src/components/TodayScreen.jsx:283-289`):
```jsx
        {/* Mountain Page */}
        <button
          onClick={() => onOpenMountainPage(r.resortKey)}
          style={{ display: "grid", placeItems: "center", border: "1px solid rgba(56,189,248,0.3)", color: "var(--color-accent)", fontWeight: 800, padding: "11px 14px", borderRadius: 14, background: "rgba(56,189,248,0.08)", fontSize: 13, cursor: "pointer" }}
        >
          🏔️ Mountain Page →
        </button>
```

Insert the new button directly **before** it:
```jsx
        {/* Ski here today */}
        {(() => {
          const { label, mode } = planButtonState(myTodayPlan, r.resortKey)
          const isConfirmed = mode === "edit"
          return (
            <button
              onClick={() => onSkiHereToday(r.resortKey)}
              style={{
                display: "grid", placeItems: "center",
                border: isConfirmed ? "1px solid rgba(34,197,94,0.4)" : "none",
                color: isConfirmed ? "var(--color-success)" : "var(--color-pass-pill-text)",
                fontWeight: 800, padding: "11px 14px", borderRadius: 14,
                background: isConfirmed ? "rgba(10,30,10,0.5)" : "var(--gradient-primary)",
                fontSize: 13, cursor: "pointer",
              }}
            >
              {label}
            </button>
          )
        })()}

        {/* Mountain Page */}
        <button
          onClick={() => onOpenMountainPage(r.resortKey)}
          style={{ display: "grid", placeItems: "center", border: "1px solid rgba(56,189,248,0.3)", color: "var(--color-accent)", fontWeight: 800, padding: "11px 14px", borderRadius: 14, background: "rgba(56,189,248,0.08)", fontSize: 13, cursor: "pointer" }}
        >
          🏔️ Mountain Page →
        </button>
```

- [ ] **Step 4: Pass the new props at the `ResortCard` call site**

In the `moreResorts.map(...)` block added in Task 6, extend the `<ResortCard ... />` call:
```jsx
                        <ResortCard
                          r={r}
                          skierCounts={skierCounts}
                          skierDetails={skierDetails}
                          activityCount={resortActivityCounts[r.resortKey] || 0}
                          friendsGoing={friendTripsByResort[r.resortKey] || []}
                          vibeData={vibeData}
                          onOpenMountainPage={setMountainPageResortKey}
                          myTodayPlan={myTodayPlan}
                          onSkiHereToday={setSkiHereModalResortKey}
                        />
```

- [ ] **Step 5: Render the modal once, at the `TodayScreen` level**

Directly before the final closing `</>` of `TodayScreen`'s returned JSX
(`src/components/TodayScreen.jsx`, the line right before the component's closing tag —
currently the file ends with the `</>` that closes the fragment started at the top of the
`return`), add:
```jsx
      {skiHereModalResortKey && (
        <PlanEditorModal
          dateKey={localDateKey()}
          plan={myTodayPlan}
          resorts={rows}
          defaultResortKey={skiHereModalResortKey}
          busy={savingTodayPlan}
          error={todayPlanError}
          onSave={async (fields) => {
            const ok = await onSaveTodayPlan(fields)
            if (ok) setSkiHereModalResortKey(null)
          }}
          onClose={() => setSkiHereModalResortKey(null)}
        />
      )}
```

(No `onDateChange` is passed — this keeps the date fixed to today, per Decision 7. No
`onRemove` — removing today's plan entirely isn't part of this flow; that already exists on
the Ski Plans calendar if a user wants it.)

- [ ] **Step 6: Manual verification**

`npm run dev`, log in as a user with **no plan today**:
1. Expand any resort card → its button reads `Ski here today`.
2. Tap it → `PlanEditorModal` opens with this resort pre-selected and today's date shown
   (not editable — no date-change control appears).
3. Save with no ETA → modal closes, the button on that card now reads `✓ You're skiing here`.
4. Expand a **different** resort's card → its button now reads `Switch to here`. Tap it, save →
   the modal moves your plan; the original resort's card reverts to `Ski here today` and the
   new resort's card shows `✓ You're skiing here`.
5. Tap `✓ You're skiing here` on the resort you're currently at → modal opens in edit mode with
   your existing ETA/visibility pre-filled (not a blank form).
6. Reload the page → the correct card still shows `✓ You're skiing here` (confirms the
   `myTodayPlan` fetch on mount reflects the saved state, not just local React state).
7. Check the Profile → Ski Plans calendar: today's date shows the same plan that was just
   created/edited from the Today tab — confirms this went through the real `daily_plans` write
   path, not a separate one.

- [ ] **Step 7: Run the full suite and lint**

```bash
npm test
npx eslint .
```
Expected: `npm test` still 134 passing. `npx eslint .` at or below the 87-problem baseline.

- [ ] **Step 8: Commit**

```bash
git add src/components/TodayScreen.jsx
git commit -m "feat: wire Ski-here-today button into the existing plan-editor flow"
```

---

## Post-plan check (not a task — a note for whoever picks this up next)

This plan covers the Today tab's **List** sub-view only, per the approved spec's §6. The
**Map** sub-view's own visual redesign (glowing gradient score bubbles, friend-avatar pins, the
"Top of the List" bottom sheet) is explicitly out of scope here and is the next slice of
ROADMAP TASK 22.0 — see the spec for what's already been compared against the mockup.
