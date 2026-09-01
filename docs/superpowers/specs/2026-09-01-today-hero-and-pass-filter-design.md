# Design — Today Tab: Compact Expandable Hero + Pass-Aware Default Filter

**Date:** 2026-09-01
**Status:** Approved for planning
**Origin:** Follow-up polish on the Today tab, requested directly by Kyle after the List/Map
mockup-fidelity slices (TASK 22.0) shipped. Two small, related features on the same screen —
`TodayScreen.jsx` / `App.jsx` — covered in one spec rather than two, since neither is large enough
to need separate planning cycles.

## 1. Compact expandable "Best Bet Today" hero

### 1.1 The problem

`BestBetCard.jsx` is a large, uniquely-styled hero card — its own header row, big score number,
stat line, and two always-visible CTA buttons (Directions, Ski here today) — visually inconsistent
with the compact `ResortListRow` rows below it, and structurally separate (duplicates the
CTA/pass-badge logic `ResortCard` already has once expanded).

### 1.2 Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **`BestBetCard.jsx` is deleted.** The hero becomes a `ResortListRow` (with a `label` prop showing "BEST BET TODAY" instead of a numeric rank) followed by the same conditional `ResortCard` every list row already expands into. | Same compact row, one accordion pattern, no duplicated CTA/detail rendering between hero and list. |
| 2 | **The hero's expanded/collapsed state is independent of the list's `expandedKeys` Set** — its own `heroExpanded` boolean in `TodayScreen.jsx`. | With sorts other than Powder Score, the hero's resort can also appear in the list below (existing `excludeHero` logic only applies when `sortBy === "Powder Score"`). Sharing one state would risk the same full `ResortCard` rendering twice on screen at once if both happened to be expanded. Independent state avoids that entirely. |
| 3 | **`heroExpanded` defaults to `true`.** Kyle's call: same compact row style when collapsed, but starts open so the "Ski here today" CTA stays one tap away, matching today's always-visible behavior — collapsing is available, not the default. | Preserves the existing one-tap access to the hero's plan action (Kyle explicitly expanded scope to add it there in an earlier slice) while still gaining the compact row look. |
| 4 | **`ResortListRow` gains a chevron (▾ collapsed / ▴ expanded) at the row's right edge**, on every row — hero and list — reflecting the existing `expanded` prop. Purely visual; the whole row remains one `<button onClick={onToggle}>`, nothing new becomes independently clickable. | Standard expand/collapse affordance; the row currently has no visual indicator of its own tappability/state beyond a subtle background-color shift. |

### 1.3 The design

**`ResortListRow.jsx`** gains two additions to its existing props (`rank`, `r`, `expanded`,
`onToggle`):
- `label` (optional string): when provided, renders in the slot that currently shows the numeric
  `rank`, replacing it (small uppercase text, matching the row's existing rank-slot sizing rather
  than introducing a new visual weight).
- A chevron glyph at the row's right edge (after the BASE stat), `▾` when `!expanded`, `▴` when
  `expanded`.

**`TodayScreen.jsx`**: the `<BestBetCard ... />` block is replaced with:
```jsx
{conditionsSubTab === "conditions" && topResort && (
  <div style={{ marginBottom: 20 }}>
    <ResortListRow r={topResort} label="BEST BET TODAY" expanded={heroExpanded}
      onToggle={() => setHeroExpanded((e) => !e)} />
    {heroExpanded && (
      <ResortCard r={topResort} skierCounts={skierCounts} skierDetails={skierDetails}
        activityCount={resortActivityCounts[topResort.resortKey] || 0}
        friendsGoing={friendTripsByResort[topResort.resortKey] || []}
        vibeData={vibeData} onOpenMountainPage={setMountainPageResortKey}
        myTodayPlan={myTodayPlan} onSkiHereToday={setSkiHereModalResortKey} />
    )}
  </div>
)}
```
(props mirror exactly what the list's own `ResortCard` usage already passes, so this is not a new
prop shape — same component, same call pattern, applied to `topResort` instead of a list row's
`r`.) `heroExpanded` is a new `useState(true)` in `TodayScreen.jsx`, alongside the existing
`expandedKeys` state — not derived from or coupled to it.

`BestBetCard.jsx` is deleted; its import in `TodayScreen.jsx` is removed. No other file references
it (confirmed: only `TodayScreen.jsx` imports it today).

### 1.4 Out of scope

No numeric `rank` badge on the hero (the `label` prop replaces it, doesn't add to it) — one or the
other, not both, per row.

---

## 2. Pass-aware default resort filter

### 2.1 The problem

The resort list's pass filter (`passFilter` in `App.jsx`, rendered as three single-select buttons
in `TodayScreen.jsx`) always defaults to `"All"` regardless of which pass(es) the signed-in user
actually owns — `profile.ski_passes` (an array, e.g. `["Epic"]`, `["Epic","Ikon"]`, `["None"]`,
already collected via the existing pass picker in `ProfilePage.jsx`) is never consulted. A user
who only has an Epic pass sees every Ikon resort in their default list too.

### 2.2 Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **The filter becomes a multi-select `Set` of active passes** (`passFilters`, replacing the single-string `passFilter`), with `size === 0` meaning "no filter, show everything." | Only way to represent "show both Epic and Ikon" simultaneously, which single-select can't. Every resort in this app's data is `pass: "Epic"` or `pass: "Ikon"` — no other value exists today. |
| 2 | **"All" stays as a third chip, Kyle's call** — it's not a separate boolean, it's just the visual state when the `Set` is empty. Tapping "All" clears the `Set`. Tapping Epic/Ikon toggles that value's membership. If manually deselecting the last active pass empties the `Set`, "All" lights up on its own — same state, reached two ways. | One state variable, two entry paths to the same "no filter" state, instead of a second boolean that could disagree with the `Set`'s actual contents. |
| 3 | **Default is computed once**, the first time `currentProfile` becomes available after load, from `profile.ski_passes` intersected with `["Epic", "Ikon"]` (the only two values any resort actually has) — `["Indy", "Mountain Collective", "None"]` contribute nothing since no resort matches them. Guarded by a ref so it never re-applies after the user's first manual change or a later profile refetch. | Matches Kyle's ask exactly: pre-select what they own, ignore pass types no resort in this app carries. The once-only guard avoids the class of bug this app's memory repeatedly flags — an effect silently overwriting a user's manual choice. |
| 4 | **No stored `ski_passes`, or signed out entirely → `Set` stays empty → "All."** | Nobody lands on an accidentally-empty list; browse-mode and new-profile users see exactly today's default behavior, unchanged. |

### 2.3 The design

**`App.jsx`:**
- `passFilter` (string state) → `passFilters` (`useState(new Set())`).
- A `useRef(false)` guard (`passDefaultAppliedRef`) plus a `useEffect` keyed on `currentProfile`:
  once `currentProfile` is truthy and the guard hasn't fired yet, compute
  `(currentProfile.ski_passes || []).filter((p) => p === "Epic" || p === "Ikon")`, seed
  `passFilters` with a `new Set(...)` of that, and set the guard `true`. If the computed list is
  empty, `passFilters` simply stays the empty `Set` it already was — no-op, but the guard still
  fires so a later profile refetch can't re-seed it.
- Filter predicate (was `passFilter === "All" || r.pass === passFilter`, `App.jsx:1056`) becomes:
  `passFilters.size === 0 || passFilters.has(r.pass)`.
- `useMemo` deps for `visibleResorts` swap `passFilter` for `passFilters`.

**`TodayScreen.jsx`** filter bar (currently `["All", "Epic", "Ikon"].map(...)`, single-select):
replaced with three toggle buttons —
- "All" active when `passFilters.size === 0`; `onClick` calls a new `onClearPassFilters` (clears
  the `Set`).
- "Epic"/"Ikon" active when `passFilters.has(p)`; `onClick` calls a new `onTogglePassFilter(p)`
  (adds/removes `p` from a **new** `Set` copy — React state must be replaced, not mutated, for the
  change to re-render).

Both handlers are owned by `App.jsx` (where `passFilters` lives) and passed down as props, same as
`passFilter`/`setPassFilter` are today.

### 2.4 Out of scope

No UI change to the `ProfilePage.jsx` pass picker itself — `ski_passes` is read, not written, by
this feature. No change to `PowderMap.jsx` beyond it continuing to receive the same
already-filtered `rows`/`resorts` prop it does today (the Map view has always shared this filter
with the List view, unchanged by this spec).

## 3. Testing

Both features are presentation/state-shape changes with no new pure logic worth extracting to
`src/lib` — the pass-intersection computation is a 2-line `.filter()`, not a function complex
enough to warrant its own test file separate from a manual check. Same accepted limitation as
prior Today-tab work: `npm test` covers `src/lib` only, no DOM harness, so this ships verified by
lint/build/diff review plus a manual browser check (both features are entirely client-side state,
easy to verify: toggling chips, checking a profile with different `ski_passes` combinations, and
confirming the hero collapses/expands independently of an identical resort's list row).
