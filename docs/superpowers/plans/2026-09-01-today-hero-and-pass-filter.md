# Today Tab: Compact Expandable Hero + Pass-Aware Default Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Best Bet Today" hero a compact, expandable row matching the list below it
(open by default), and make the resort list's pass filter default to the signed-in user's own
`ski_passes` while staying fully editable.

**Architecture:** Two independent, small presentation/state changes on the Today tab, done
together because they touch the same two files. `BestBetCard.jsx` is deleted — the hero becomes
`ResortListRow` (given a small `label` prop addition) followed by the same `ResortCard` every
list row already expands into, with its own independent `heroExpanded` state. The pass filter
changes from a single-string `useState` to a `Set`-based multi-select, seeded once from
`currentProfile.ski_passes` via a ref-guarded effect so a later profile refetch can't stomp a
manual choice.

**Tech Stack:** React (`useState`/`useEffect`/`useRef`, no router, no state library), inline
`style={{}}` objects with `var(--color-*)` tokens.

**Spec:** `docs/superpowers/specs/2026-09-01-today-hero-and-pass-filter-design.md`

## Global Constraints

- No new npm dependencies.
- Inline `style={{}}` objects only, matching this file's existing convention.
- `npm test` baseline: **134 passing** (`node --test src/lib/*.test.js`) — this plan adds no new
  `src/lib` logic, so the count should stay exactly 134 throughout.
- `npx eslint .` baseline: **88 problems (80 errors, 8 warnings)** — verify in a fresh
  worktree/checkout, not the long-lived main tree, which has shown a persistent unrelated +7
  discrepancy confined to `server/*.js` (environment/node_modules drift, not a code issue). Do
  not raise the 88 baseline.
- React state must be replaced with a new object, never mutated in place — `Set` toggles must do
  `new Set(prev)` + add/delete, not `prev.add(...)`, or the component won't re-render.
- No new files beyond what's listed per task; `BestBetCard.jsx` is deleted, not deprecated.

---

### Task 1: `ResortListRow` — add a `label` prop and an expand/collapse chevron

**Files:**
- Modify: `src/components/ResortListRow.jsx` (whole file, 65 lines)

**Interfaces:**
- Produces: `ResortListRow`'s prop shape becomes `{ rank, r, label, expanded, onToggle }` — `label`
  is new and optional; when provided it replaces the numeric `rank` in the row's leading slot.
  `rank` and `label` are mutually exclusive per call site (a caller passes one or the other, never
  both). Task 2 depends on `label` existing.

- [ ] **Step 1: Add the `label` prop and the two-column leading slot**

Replace the whole file:

```jsx
import { TIER_COLORS } from "./ui/Badge"

/**
 * One compact row in the Today List View — rank (or a text label, for the
 * "Best Bet Today" hero), score pill, name, tier·pass subtitle, and
 * 24h-snow/base numbers on the right, with an expand/collapse chevron at the
 * trailing edge. Tapping toggles the full ResortCard open beneath it
 * (TodayScreen/hero caller owns the expanded/collapsed state).
 */
export default function ResortListRow({ rank, r, label, expanded, onToggle }) {
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
      {label ? (
        <div style={{
          width: 54, fontSize: 9, fontWeight: 900, letterSpacing: 0.3, lineHeight: 1.15,
          color: "rgba(255,255,255,0.5)", textTransform: "uppercase", flexShrink: 0,
        }}>
          {label}
        </div>
      ) : (
        <div style={{ width: 18, textAlign: "center", fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>
          {rank}
        </div>
      )}

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

      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", flexShrink: 0, marginLeft: 4 }}>
        {expanded ? "▴" : "▾"}
      </div>
    </button>
  )
}
```

The only behavioral changes from the original: the leading slot renders `label` (54px, wrapping,
uppercase, small) instead of the numeric `rank` when `label` is passed, and a chevron glyph is
appended after the BASE column, flipping between `▾`/`▴` off the existing `expanded` prop. Every
existing caller (the list's own `<ResortListRow rank={...} r={...} expanded={...} onToggle={...}
/>`, no `label`) is unaffected — `label` is `undefined` there, so the `rank` branch renders exactly
as before, just with the new chevron appended.

- [ ] **Step 2: Manual verification**

`npm run dev`, Today tab, List sub-view: confirm every existing row still shows its numeric rank
unchanged, and a small ▾ now appears at the right edge of each collapsed row, flipping to ▴ when
that row is tapped open. (The `label` path has no caller yet — Task 2 adds the one that uses it.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ResortListRow.jsx
git commit -m "feat: add label prop and expand/collapse chevron to ResortListRow"
```

---

### Task 2: Replace `BestBetCard` with a compact, independently-expandable hero row

**Files:**
- Modify: `src/components/TodayScreen.jsx:6` (import), `src/components/TodayScreen.jsx:518-520`
  (state), `src/components/TodayScreen.jsx:591-600` (hero render block)
- Delete: `src/components/BestBetCard.jsx`

**Interfaces:**
- Consumes: `ResortListRow`'s `label` prop (Task 1).
- Produces: nothing consumed by Task 3 — independent of it.

- [ ] **Step 1: Remove the `BestBetCard` import**

In `src/components/TodayScreen.jsx`, delete this line (line 6):

```js
import BestBetCard from "./BestBetCard"
```

- [ ] **Step 2: Add `heroExpanded` state**

Find (`TodayScreen.jsx`, inside `export default function TodayScreen({...}) {`):

```jsx
  const [conditionsSubTab, setConditionsSubTab] = useState("conditions")
  const [expandedKeys, setExpandedKeys] = useState(new Set())
  const [skiHereModalResortKey, setSkiHereModalResortKey] = useState(null)
```

Replace with:

```jsx
  const [conditionsSubTab, setConditionsSubTab] = useState("conditions")
  const [expandedKeys, setExpandedKeys] = useState(new Set())
  const [heroExpanded, setHeroExpanded] = useState(true)
  const [skiHereModalResortKey, setSkiHereModalResortKey] = useState(null)
```

`heroExpanded` defaults to `true` (Kyle's call — the hero opens showing its full detail and CTA by
default, matching today's always-visible behavior; collapsing is available, not the default). It
is intentionally separate from `expandedKeys`: with sorts other than Powder Score, `topResort` can
also appear as its own row in the list below (see the existing `excludeHero` check further down in
this file), and sharing one state would risk the same `ResortCard` rendering twice on screen at
once if both ended up expanded.

- [ ] **Step 3: Replace the hero render block**

Find:

```jsx
      {conditionsSubTab === "conditions" && topResort && (
        <div style={{ marginBottom: 20 }}>
          <BestBetCard
            topResort={topResort}
            friendsGoing={friendTripsByResort[topResort.resortKey] || []}
            myTodayPlan={myTodayPlan}
            onSkiHereToday={setSkiHereModalResortKey}
          />
        </div>
      )}
```

Replace with:

```jsx
      {conditionsSubTab === "conditions" && topResort && (
        <div style={{ marginBottom: 20 }}>
          <ResortListRow
            r={topResort}
            label="BEST BET TODAY"
            expanded={heroExpanded}
            onToggle={() => setHeroExpanded((e) => !e)}
          />
          {heroExpanded && (
            <ResortCard
              r={topResort}
              skierCounts={skierCounts}
              skierDetails={skierDetails}
              activityCount={resortActivityCounts[topResort.resortKey] || 0}
              friendsGoing={friendTripsByResort[topResort.resortKey] || []}
              vibeData={vibeData}
              onOpenMountainPage={setMountainPageResortKey}
              myTodayPlan={myTodayPlan}
              onSkiHereToday={setSkiHereModalResortKey}
            />
          )}
        </div>
      )}
```

Every prop passed to `ResortCard` here mirrors exactly what the list's own `ResortCard` usage
already passes for a list row (same file, further down) — same component, same call shape,
applied to `topResort` instead of a list row's `r`. No new props are introduced on `ResortCard`
or `ResortListRow` beyond Task 1's `label`.

- [ ] **Step 4: Delete `BestBetCard.jsx`**

```bash
git rm src/components/BestBetCard.jsx
```

- [ ] **Step 5: Confirm no other file imports it**

Run: `grep -rn "BestBetCard" src/`
Expected: no output (empty).

- [ ] **Step 6: Manual verification**

`npm run dev`, Today tab, List sub-view: confirm the hero now renders as a compact row reading
"BEST BET TODAY" in place of a rank number, already expanded on load showing the full mountain
card beneath it (forecast, CTAs, etc. — identical to what any other expanded list row shows).
Tapping the hero row's chevron collapses it back to just the compact row; tapping again
re-expands it. Confirm collapsing/expanding the hero does not change any list row's own
expanded/collapsed state below it, and vice versa.

- [ ] **Step 7: Run the full suite and lint**

Run: `npm test` — expect 134/134 passing (unchanged).
Run: `npx eslint .` — expect 88 problems (80 errors, 8 warnings), unchanged (verify in a fresh
worktree if this number looks different).

- [ ] **Step 8: Commit**

```bash
git add src/components/TodayScreen.jsx
git commit -m "feat: replace BestBetCard with a compact, independently-expandable hero row"
```

---

### Task 3: Pass-aware default resort filter (multi-select)

**Files:**
- Modify: `src/App.jsx:1` (import), `src/App.jsx:603` (state), `src/App.jsx:1054-1063`
  (`visibleResorts` filter), `src/App.jsx:1482-1483` (props passed to `TodayScreen`)
- Modify: `src/components/TodayScreen.jsx:492-493` (props destructuring),
  `src/components/TodayScreen.jsx:624-646` (filter-bar buttons)

**Interfaces:**
- Produces: `passFilters` (a `Set<string>` of `"Epic"`/`"Ikon"`, empty = no filter/"All") replaces
  `passFilter` (a single string) everywhere it existed. Not consumed by Tasks 1/2.

- [ ] **Step 1: Add `useRef` to the React import**

In `src/App.jsx`, replace line 1:

```js
import { useEffect, useMemo, useState } from "react"
```

with:

```js
import { useEffect, useMemo, useRef, useState } from "react"
```

- [ ] **Step 2: Replace the `passFilter` state with `passFilters` + a default-applied guard**

Find (`src/App.jsx:603`):

```js
  const [passFilter, setPassFilter] = useState("All")
```

Replace with:

```js
  const [passFilters, setPassFilters] = useState(() => new Set())
  // Guards the one-time default below so a later profile refetch (e.g. the
  // user edits their passes in Profile mid-session) never silently
  // overwrites a filter choice they've already made by hand.
  const passDefaultAppliedRef = useRef(false)
```

- [ ] **Step 3: Seed the default from `currentProfile.ski_passes`, once**

Immediately after the code from Step 2, add:

```js
  useEffect(() => {
    if (passDefaultAppliedRef.current || !currentProfile) return
    passDefaultAppliedRef.current = true
    const owned = (currentProfile.ski_passes || []).filter((p) => p === "Epic" || p === "Ikon")
    if (owned.length > 0) setPassFilters(new Set(owned))
  }, [currentProfile])
```

Every resort in `RESORTS` has `pass` of exactly `"Epic"` or `"Ikon"` — `ski_passes` values like
`"Indy"`, `"Mountain Collective"`, or `"None"` are filtered out here since no resort would ever
match them; if `owned` ends up empty (no matching pass, no profile, signed out), `passFilters`
simply stays the empty `Set` it already was, i.e. "All" — nobody lands on an accidentally-empty
list.

- [ ] **Step 4: Update the `visibleResorts` filter**

Find (`src/App.jsx:1054-1063`):

```js
  const visibleResorts = useMemo(() => {
    return RESORTS.filter((r) => {
      const passOk = passFilter === "All" || r.pass === passFilter
      const qOk = r.name.toLowerCase().includes(query.toLowerCase())
      return passOk && qOk
    }).map((r) => ({
      ...r,
      ...(live[r.name] || {}),
    }))
  }, [live, passFilter, query])
```

Replace with:

```js
  const visibleResorts = useMemo(() => {
    return RESORTS.filter((r) => {
      const passOk = passFilters.size === 0 || passFilters.has(r.pass)
      const qOk = r.name.toLowerCase().includes(query.toLowerCase())
      return passOk && qOk
    }).map((r) => ({
      ...r,
      ...(live[r.name] || {}),
    }))
  }, [live, passFilters, query])
```

- [ ] **Step 5: Update the props passed to `TodayScreen`**

Find (`src/App.jsx:1482-1483`):

```jsx
            passFilter={passFilter}
            setPassFilter={setPassFilter}
```

Replace with:

```jsx
            passFilters={passFilters}
            setPassFilters={setPassFilters}
```

- [ ] **Step 6: Update `TodayScreen`'s props destructuring**

Find (`src/components/TodayScreen.jsx:492-493`):

```jsx
  passFilter,
  setPassFilter,
```

Replace with:

```jsx
  passFilters,
  setPassFilters,
```

- [ ] **Step 7: Replace the filter-bar buttons**

Find (`src/components/TodayScreen.jsx:624-646`):

```jsx
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
                    padding: "7px 12px",
                    borderRadius: 999,
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
```

Replace with:

```jsx
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setPassFilters(new Set())}
                style={{
                  background: passFilters.size === 0 ? "var(--gradient-pass-pill)" : "rgba(255,255,255,0.06)",
                  color: passFilters.size === 0 ? "var(--color-pass-pill-text)" : "white",
                  border: "1px solid rgba(255,255,255,0.1)",
                  padding: "7px 12px",
                  borderRadius: 999,
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                All
              </button>
              {["Epic", "Ikon"].map((p) => (
                <button
                  key={p}
                  onClick={() => setPassFilters((prev) => {
                    const next = new Set(prev)
                    if (next.has(p)) next.delete(p)
                    else next.add(p)
                    return next
                  })}
                  style={{
                    background: passFilters.has(p) ? "var(--gradient-pass-pill)" : "rgba(255,255,255,0.06)",
                    color: passFilters.has(p) ? "var(--color-pass-pill-text)" : "white",
                    border: "1px solid rgba(255,255,255,0.1)",
                    padding: "7px 12px",
                    borderRadius: 999,
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
```

"All" is active (highlighted) exactly when `passFilters.size === 0` — whether the user tapped
"All" directly or manually toggled off every other chip, it converges on the same empty-`Set`
state and lights up on its own; there is no separate boolean to keep in sync with it.

- [ ] **Step 8: Manual verification**

`npm run dev`, Today tab: with no profile pass set (or signed out), confirm "All" is active by
default and every resort shows. Sign in as a user whose profile has `ski_passes: ["Epic"]` (or set
this via Profile > Ski Passes, then reload) and confirm the list loads with only "Epic" active and
only Epic resorts shown. Set both Epic and Ikon on the profile and confirm both chips light up by
default with every resort shown. Manually toggle a chip off/on and confirm the list updates
immediately; toggle every chip off and confirm "All" lights back up and every resort reappears.
Confirm the Map sub-view reflects the same filtered set (it already shares `rows`, unchanged by
this task).

- [ ] **Step 9: Run the full suite and lint**

Run: `npm test` — expect 134/134 passing (unchanged).
Run: `npx eslint .` — expect 88 problems (80 errors, 8 warnings), unchanged.

- [ ] **Step 10: Commit**

```bash
git add src/App.jsx src/components/TodayScreen.jsx
git commit -m "feat: default the resort pass filter to the user's own ski_passes"
```

---

## Final check (after all 3 tasks)

- [ ] Run `npm test` — expect 134/134 passing.
- [ ] Run `npx eslint .` — expect 88 problems (80 errors, 8 warnings), not higher.
- [ ] Run `npm run build` — expect a clean build.
- [ ] `npm run dev`, full click-through: hero row (expanded by default, collapses/expands
  independently of the list), chevrons on every row (hero and list), and the pass filter
  (default from profile, manual toggle, "All" convergence, Map sub-view staying in sync).
