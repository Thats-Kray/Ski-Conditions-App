# Today Tab Map View — Mockup Fidelity Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Today tab's Map sub-view match the new mockup
(`mockups/PowDays.app mockup design/Screen Shots/PowDays Reorg Mockup-Today Map View.png`):
glowing tier-colored score bubbles with a name label, a friend-initials badge when crew is going,
and a tap-toggle "Top of the List" bottom sheet.

**Architecture:** Presentation-only change to a single file, `src/components/PowderMap.jsx`, plus
one small pure-logic extraction to `src/lib`. No new props, no backend/schema change — same
`resorts`/`skierCounts`/`skierDetails`/`friendIds` already flowing in from `TodayScreen.jsx`.
Leaflet stays; resort markers move from `CircleMarker` (SVG circle) to `Marker` + a custom
`divIcon` (raw HTML string) so the bubble can have a gradient glow and a label underneath. The
bottom sheet is a new component docked absolutely inside the map's existing rounded card.

**Tech Stack:** React, `react-leaflet` (already a dependency, no new package), inline
`style={{}}` objects with `var(--color-*)`/`var(--rating-*)` tokens, `node --test` for the one
new pure function.

**Spec:** `docs/superpowers/specs/2026-08-27-today-map-view-redesign-design.md`

## Global Constraints

- No new npm dependencies. `leaflet` is already installed (used via `react-leaflet`).
- Inline `style={{}}` objects only (React) / inline `style="..."` attribute strings (the divIcon
  HTML, which is not React and can't take a style object). Semantic/tier colors go through
  `var(--rating-*)` tokens in both places — CSS custom properties resolve fine inside a raw HTML
  string too, since it's inserted into the same live document. Purely decorative one-off colors
  chosen to match the mockup exactly, with no existing token (e.g. the friend-badge orange), stay
  literal hex — same convention already used for the Popup's white-chrome colors in this file.
- **Anything interpolated into the divIcon's `html` string must go through `escapeHtml()`**
  (Task 2 adds this). Unlike JSX, a raw HTML string is not auto-escaped — `people[0]`'s display
  name flows from user profile data before it's reduced to initials, so treat it as untrusted.
- `npm test` runs `node --test` over `src/lib/*.test.js` only — no DOM, no component harness.
  Baseline **as of 2026-08-27: 134 passing.** Task 1 adds ~6 for the one new pure function; every
  other task in this plan is UI-only and is verified by manual browser check, not a test count.
- `npx eslint .` baseline **as of 2026-08-27: 94 problems (85 errors, 9 warnings).** Do not raise
  it. When JSX that consumed a variable/prop is deleted (e.g. `markerRadius`, the legend
  components), delete the now-unused function/variable too.
- Reuse existing helpers: `scoreTier`/`scoreColor` (Task 1), `displayName()`, `avatarFallback()`
  — don't re-derive initials or tier logic a second time.

---

### Task 1: `scoreTier()` — extract the tier lookup to `src/lib`, unit tested

**Files:**
- Create: `src/lib/powderMapTiers.js`
- Create: `src/lib/powderMapTiers.test.js`
- Modify: `src/components/PowderMap.jsx:8-15` (`scoreColor` refactor only)

**Interfaces:**
- Produces: `scoreTier(score: number | null | undefined): "mint" | "sky" | "gold" | "peach" |
  "coral" | "slate"`. Task 2 uses this for the bubble's fill/glow tokens; Task 3 uses it for the
  bottom sheet's score badge. Both need the *same* tier for a given score as `scoreColor()`
  already produces today — extracting it once avoids two independently-drifting threshold copies.

- [ ] **Step 1: Write the failing test**

Create `src/lib/powderMapTiers.test.js`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { scoreTier } from "./powderMapTiers.js"

test("scores >= 88 are mint (elite / best snow)", () => {
  assert.equal(scoreTier(88), "mint")
  assert.equal(scoreTier(95), "mint")
})

test("scores 76-87 are sky (very good)", () => {
  assert.equal(scoreTier(76), "sky")
  assert.equal(scoreTier(87), "sky")
})

test("scores 63-75 are gold (good)", () => {
  assert.equal(scoreTier(63), "gold")
  assert.equal(scoreTier(75), "gold")
})

test("scores 50-62 are peach (okay / decent)", () => {
  assert.equal(scoreTier(50), "peach")
  assert.equal(scoreTier(62), "peach")
})

test("scores below 50 are coral (low powder score)", () => {
  assert.equal(scoreTier(49), "coral")
  assert.equal(scoreTier(0), "coral")
})

test("null or undefined score is slate (no data)", () => {
  assert.equal(scoreTier(null), "slate")
  assert.equal(scoreTier(undefined), "slate")
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test src/lib/powderMapTiers.test.js`
Expected: FAIL — `Cannot find module './powderMapTiers.js'`

- [ ] **Step 3: Implement**

Create `src/lib/powderMapTiers.js`:

```js
export function scoreTier(score) {
  if (score == null) return "slate"
  if (score >= 88) return "mint"
  if (score >= 76) return "sky"
  if (score >= 63) return "gold"
  if (score >= 50) return "peach"
  return "coral"
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test src/lib/powderMapTiers.test.js`
Expected: PASS, 6/6.

- [ ] **Step 5: Refactor `scoreColor()` to use it**

In `src/components/PowderMap.jsx`, add the import after the existing `formatEtaShort` import
(line 6):

```js
import { scoreTier } from "../lib/powderMapTiers"
```

Replace the current `scoreColor` (lines 8-15):

```js
function scoreColor(score) {
  if (score == null) return "var(--rating-slate)"  // no data
  if (score >= 88) return "var(--rating-mint)"      // elite / best snow
  if (score >= 76) return "var(--rating-sky)"       // very good
  if (score >= 63) return "var(--rating-gold)"      // good
  if (score >= 50) return "var(--rating-peach)"     // okay / decent
  return "var(--rating-coral)"                      // low powder score
}
```

with:

```js
function scoreColor(score) {
  return `var(--rating-${scoreTier(score)})`
}
```

- [ ] **Step 6: Run the full suite and lint**

Run: `npm test`
Expected: 140 passing (134 baseline + 6 new), 0 failing.

Run: `npx eslint .`
Expected: 94 problems (85 errors, 9 warnings) — unchanged from baseline.

- [ ] **Step 7: Commit**

```bash
git add src/lib/powderMapTiers.js src/lib/powderMapTiers.test.js src/components/PowderMap.jsx
git commit -m "refactor: extract scoreTier() as a tested pure function, used by scoreColor()"
```

---

### Task 2: Resort markers — glowing `divIcon` bubbles, replacing `CircleMarker`

**Files:**
- Modify: `src/components/PowderMap.jsx` (imports; delete `markerRadius`, `LegendItem`,
  `MarkerSizeItem`, and the two-legend-card block; add `escapeHtml` + `resortBubbleIcon`; swap
  the resort `CircleMarker` loop for `Marker`)

**Interfaces:**
- Consumes: `scoreTier` (Task 1), `displayName()`, `avatarFallback()` (both already defined in
  this file, unchanged).
- Produces: `resortBubbleIcon(resort, people)` — returns an `L.divIcon`. Not consumed outside
  this file. `escapeHtml(str)` — also file-local, reused by Task 3 is **not** needed (Task 3's
  data isn't attacker-influenced the same way; see Task 3 notes), so this stays private to Task 2.

- [ ] **Step 1: Update imports**

Replace `src/components/PowderMap.jsx:1-6`:

```js
import { useState } from "react"
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import UserProfileModal from "./UserProfileModal"
import { useLiveFriendLocations } from "../lib/useLiveFriendLocations"
import { formatEtaShort } from "../lib/format"
```

with:

```js
import { useState } from "react"
import { MapContainer, TileLayer, CircleMarker, Marker, Popup } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import UserProfileModal from "./UserProfileModal"
import { useLiveFriendLocations } from "../lib/useLiveFriendLocations"
import { formatEtaShort } from "../lib/format"
import { scoreTier } from "../lib/powderMapTiers"
```

(This supersedes Task 1 Step 5's import line — same line, now with `Marker`/`L` added alongside.)

- [ ] **Step 2: Delete `markerRadius()`**

Delete this whole function (originally lines 17-24, now shifted by Task 1's edits — find it by
name, it's the only function between `scoreColor` and `displayName`):

```js
function markerRadius(count) {
  if (!count || count <= 0) return 8
  if (count >= 10) return 20
  if (count >= 7) return 17
  if (count >= 4) return 14
  if (count >= 2) return 11
  return 9
}
```

It has no other callers (only the resort `CircleMarker`'s `radius` prop, removed in Step 6).

- [ ] **Step 3: Add `escapeHtml` and `resortBubbleIcon`, right after `avatarFallback()`**

Find `avatarFallback` (unchanged, still present):

```js
function avatarFallback(name) {
  return (name || "S")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}
```

Immediately after it, add:

```js
// L.divIcon's `html` is raw innerHTML, not JSX — nothing here is auto-escaped the way React
// escapes {}. resort.name is static config, but people[0]'s name flows from user profile data
// before avatarFallback() reduces it to 2 initials, so escape both defensively.
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]))
}

const BUBBLE_SIZE = 56
const ICON_WIDTH = 110
const ICON_HEIGHT = 92

// Mockup's friend-initials badge has no existing design token to match (not a tier/risk/status
// color) — literal hex chosen to match the mockup exactly, same convention as this file's other
// one-off literal colors (see the Popup-chrome comment below).
function resortBubbleIcon(resort, people) {
  const tier = scoreTier(resort.powderScore)
  const fill = `var(--rating-${tier})`
  const glow = `var(--rating-${tier}-border)`
  const scoreText = escapeHtml(resort.powderScore ?? "—")
  const name = escapeHtml(resort.name)

  const badge = people.length > 0
    ? `<div style="position:absolute;top:-4px;right:-4px;width:20px;height:20px;border-radius:999px;background:#f97316;color:#fff;font-size:9px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid #0A1628;">${escapeHtml(avatarFallback(displayName(people[0])))}</div>`
    : ""

  const html = `
    <div style="width:${ICON_WIDTH}px;height:${ICON_HEIGHT}px;display:flex;flex-direction:column;align-items:center;">
      <div style="position:relative;width:${BUBBLE_SIZE}px;height:${BUBBLE_SIZE}px;">
        <div style="width:100%;height:100%;border-radius:999px;background:radial-gradient(circle at 35% 30%, ${fill}, ${fill} 55%, ${glow} 100%);box-shadow:0 0 20px 4px ${glow};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;color:#0f172a;">
          ${scoreText}
        </div>
        ${badge}
      </div>
      <div style="margin-top:6px;font-weight:800;font-size:12px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.8);white-space:nowrap;">
        ${name}
      </div>
    </div>
  `

  return L.divIcon({
    html,
    className: "resort-bubble-marker",
    iconSize: [ICON_WIDTH, ICON_HEIGHT],
    iconAnchor: [ICON_WIDTH / 2, BUBBLE_SIZE / 2],
  })
}
```

`displayName` is defined earlier in this same file (line 26-28), already in scope.
`className: "resort-bubble-marker"` matters: Leaflet's default divIcon class (`leaflet-div-icon`)
paints a white box with a border via `leaflet.css` — overriding the className is what avoids
that, since every visual property here is already set inline.

- [ ] **Step 4: Delete the legend components**

Delete `LegendItem` (lines 106-121):

```js
function LegendItem({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          background: color,
          border: "1px solid rgba(255,255,255,0.25)",
        }}
      />
      <div>{label}</div>
    </div>
  )
}
```

Delete `MarkerSizeItem` (lines 123-138):

```js
function MarkerSizeItem({ size, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          background: "var(--color-accent-deep)",
          border: "1px solid rgba(255,255,255,0.25)",
        }}
      />
      <div>{label}</div>
    </div>
  )
}
```

- [ ] **Step 5: Delete the two-legend-card block, keep the outer wrapper**

Find (originally lines 151-203 — the outer `<div style={{ display: "grid", gap: 12 }}>` wrapper
stays, only its first child, the two-column legend grid, goes):

```jsx
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 16,
            padding: 14,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 14 }}>
            Powder Score Color
          </div>

          <LegendItem color="var(--rating-coral)" label="Low powder score" />
          <LegendItem color="var(--rating-peach)" label="Okay / decent" />
          <LegendItem color="var(--rating-gold)" label="Good" />
          <LegendItem color="var(--rating-sky)" label="Very good" />
          <LegendItem color="var(--rating-mint)" label="Elite / best snow" />
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 16,
            padding: 14,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 14 }}>
            Marker Size = Skier Density
          </div>

          <MarkerSizeItem size={8} label="0–1 skiers" />
          <MarkerSizeItem size={11} label="2–3 skiers" />
          <MarkerSizeItem size={14} label="4–6 skiers" />
          <MarkerSizeItem size={17} label="7–9 skiers" />
          <MarkerSizeItem size={20} label="10+ skiers" />
        </div>
      </div>

      <div
        style={{
          height: "min(520px, calc(100dvh - 340px))",
          minHeight: 280,
          borderRadius: 20,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
```

Replace with (legend grid gone, map container div gains `position: "relative"` so Task 3's sheet
can dock inside it):

```jsx
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          position: "relative",
          height: "min(520px, calc(100dvh - 340px))",
          minHeight: 280,
          borderRadius: 20,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
```

- [ ] **Step 6: Swap the resort `CircleMarker` loop for `Marker` + `resortBubbleIcon`**

Find:

```jsx
          {resorts.map((r) => {
            const count = skierCounts?.[r.resortKey] || 0
            const people = skierDetails?.[r.resortKey] || []

            return (
              <CircleMarker
                key={r.name}
                center={[r.lat, r.lon]}
                radius={markerRadius(count)}
                pathOptions={{
                  color: scoreColor(r.powderScore),
                  fillColor: scoreColor(r.powderScore),
                  fillOpacity: 0.88,
                  weight: 2,
                }}
              >
```

Replace with:

```jsx
          {resorts.map((r) => {
            const count = skierCounts?.[r.resortKey] || 0
            const people = skierDetails?.[r.resortKey] || []

            return (
              <Marker
                key={r.name}
                position={[r.lat, r.lon]}
                icon={resortBubbleIcon(r, people)}
              >
```

Two lines later, find the matching closing tag:

```jsx
              </CircleMarker>
            )
          })}
```

(this is the one that immediately follows the resort `Popup`'s closing tag, **not** the live-GPS
`CircleMarker` closing tag further down — that one stays `CircleMarker`, untouched). Replace with:

```jsx
              </Marker>
            )
          })}
```

Everything between the opening and closing tag (the `<Popup maxWidth={320}>...</Popup>` block,
lines 238-280 in the original file) is unchanged — same `count`/`people` variables, same
`SkierRow` usage, same literal-hex Popup-chrome colors and their existing comment.

- [ ] **Step 7: Manual verification**

`npm run dev`, Today tab → Map. Confirm: each resort renders as a glowing circular bubble (not a
flat circle) with its score number centered and its name below it; bubble color/glow matches the
resort's tier (a low-score resort glows coral/peach, a high-score one glows mint); no white boxes
around any marker; tapping a bubble still opens the same detail popup as before; a resort with
someone in its friends/crew list shows a small orange initials badge on the bubble's edge, one
without does not; the two legend cards above the map are gone.

- [ ] **Step 8: Commit**

```bash
git add src/components/PowderMap.jsx
git commit -m "feat: glowing tier-colored divIcon bubbles for resort markers, drop legends"
```

---

### Task 3: "Top of the List" bottom sheet

**Files:**
- Modify: `src/components/PowderMap.jsx` (add `SheetRow`, `TopOfTheListSheet`; add
  `sheetExpanded` state; render the sheet inside the map container)

**Interfaces:**
- Consumes: `scoreTier` (Task 1), the `resorts` prop `PowderMap` already receives (same array and
  sort order the List sub-view uses — no new sorting logic here).
- Produces: nothing consumed elsewhere — leaf UI.

- [ ] **Step 1: Add `SheetRow` and `TopOfTheListSheet`, right after `resortBubbleIcon`**

```jsx
function SheetRow({ resort }) {
  const tier = scoreTier(resort.powderScore)
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
      <div
        style={{
          minWidth: 36,
          height: 28,
          borderRadius: 8,
          background: `var(--rating-${tier}-border)`,
          color: `var(--rating-${tier})`,
          fontWeight: 900,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {resort.powderScore ?? "—"}
      </div>
      <div style={{ flex: 1, fontWeight: 700, fontSize: 14, color: "var(--color-text-1)" }}>
        {resort.name}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-accent)" }}>
        {resort.snowPrev24in != null ? `${resort.snowPrev24in}" new` : "—"}
      </div>
    </div>
  )
}

function TopOfTheListSheet({ resorts, expanded, onToggle }) {
  const top3 = resorts.slice(0, 3)
  if (top3.length === 0) return null

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10,
        background: "var(--color-modal-bg)",
        borderTop: "1px solid var(--color-border)",
        borderRadius: "20px 20px 0 0",
        padding: "8px 16px 14px",
        boxShadow: "0 -8px 30px rgba(0,0,0,0.4)",
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse top of the list" : "Expand top of the list"}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "2px 0",
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 999, background: "var(--color-border)" }} />
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: "var(--color-text-2)" }}>
          TOP OF THE LIST
        </div>
      </button>

      {expanded && (
        <div>
          {top3.map((r) => (
            <SheetRow key={r.name} resort={r} />
          ))}
        </div>
      )}
    </div>
  )
}
```

`resort.name` here renders through JSX (`{resort.name}`), which React auto-escapes — no
`escapeHtml()` needed in this component, unlike Task 2's raw `divIcon` HTML string.

- [ ] **Step 2: Add `sheetExpanded` state**

Find, inside `export default function PowderMap(...)`:

```jsx
  const [viewingUserId, setViewingUserId] = useState(null)
  // Live "N friends on mountain now" pins (S28-T3) — ephemeral Realtime
  // Broadcast, only ever shown for accepted friends.
  const liveLocations = useLiveFriendLocations(friendIds)
```

Replace with:

```jsx
  const [viewingUserId, setViewingUserId] = useState(null)
  const [sheetExpanded, setSheetExpanded] = useState(true)
  // Live "N friends on mountain now" pins (S28-T3) — ephemeral Realtime
  // Broadcast, only ever shown for accepted friends.
  const liveLocations = useLiveFriendLocations(friendIds)
```

Defaults to expanded, matching the mockup's shown state.

- [ ] **Step 3: Render the sheet inside the (now `position: relative`) map container**

Find the end of the map container, where `</MapContainer>` is immediately followed by the
container div's closing tag and then the `viewingUserId` modal:

```jsx
        </MapContainer>
      </div>
      {viewingUserId && (
```

Replace with:

```jsx
        </MapContainer>

        <TopOfTheListSheet
          resorts={resorts}
          expanded={sheetExpanded}
          onToggle={() => setSheetExpanded((e) => !e)}
        />
      </div>
      {viewingUserId && (
```

- [ ] **Step 4: Manual verification**

`npm run dev`, Today tab → Map. Confirm: a "TOP OF THE LIST" sheet docks to the bottom of the map
card (not the whole viewport) showing the top 3 resorts by the same order the List sub-view uses,
each row shows a tier-colored score badge/name/24h-snow; tapping the handle collapses it to just
the header, tapping again re-expands; the sheet renders above the map tiles and markers, not
behind them; with zero resorts (offseason — confirm by checking the current app state, matching
the known open offseason gap from the List slice) the sheet doesn't render at all rather than
showing an empty shell.

- [ ] **Step 5: Commit**

```bash
git add src/components/PowderMap.jsx
git commit -m "feat: add tap-toggle \"Top of the List\" bottom sheet to the Map sub-view"
```

---

## Final check (after all 3 tasks)

- [ ] Run `npm test` — expect 140 passing, 0 failing.
- [ ] Run `npx eslint .` — expect 94 problems (85 errors, 9 warnings), not higher.
- [ ] Run `npm run build` — expect a clean build with no new warnings about `PowderMap.jsx`.
- [ ] `npm run dev`, full click-through of the Map sub-view: bubbles across a few different score
  tiers, the friend badge on/off, popup detail still opens, sheet collapse/expand, and — since
  it's sitting right there — the two still-open List-slice checks from ROADMAP (offseason list
  state, a non-Powder-Score sort) if the session has working auth.
