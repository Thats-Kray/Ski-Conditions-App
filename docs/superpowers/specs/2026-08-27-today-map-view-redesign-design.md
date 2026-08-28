# Design — Today Tab: Map View Mockup Fidelity Pass

**Date:** 2026-08-27
**Status:** Approved for planning
**Origin:** ROADMAP.md TASK 22.0, second slice. First slice (List view + shared header) shipped
2026-08-27 (`5062d98`); this covers the Map sub-view redesign that slice explicitly deferred.
Mockup: `mockups/PowDays.app mockup design/Screen Shots/PowDays Reorg Mockup-Today Map View.png`.

## 1. The problem

`PowderMap.jsx` (337 lines) uses plain Leaflet `CircleMarker`s (flat colored circles, tap-to-open
`Popup` for detail) and two static legend cards above the map. The mockup shows glowing gradient
score bubbles (score number inside, resort name always visible below), a small orange
friend-initials badge pinned to a bubble's edge when crew is going there, and a draggable
"TOP OF THE LIST" bottom sheet with the top 3 resorts — none of which exist today.

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Resort markers become Leaflet `Marker` + custom `divIcon` HTML**, not `CircleMarker`. | `CircleMarker` is a plain SVG circle — it can't render a radial-gradient glow or a name label underneath. `divIcon` gives full CSS control while staying on Leaflet (mockup's own annotation: "Leaflet map · same data & sort as list" — no map-library swap). |
| 2 | **Bubbles keep tier-color-coding** (mint/sky/gold/peach/coral, same bands as today's `scoreColor()`), using the existing `--rating-*` / `--rating-*-border` tokens for fill/glow. | The mockup screenshot's 5 bubbles happen to render similarly (single example, narrow score range), read as a screenshot limitation, not an intentional drop of the app's established color-by-tier convention. Kyle's call, flagged and accepted. |
| 3 | **Bubbles are a fixed size**, not scaled by skier count. | Matches the mockup exactly. Frees the marker-size legend to be dropped (decision 5). |
| 4 | **Tapping a bubble still opens the existing `Popup`** with detail (snow, base, friends/crew list) — popup content is unchanged, only the marker itself changes. | Lowest risk: reuses `Popup`/`SkierRow` as-is, no new detail surface to build. |
| 5 | **Both legend cards (score-color key, marker-size key) are removed.** | Bubbles are now self-labeled with the score number and are fixed-size, so neither legend adds information the mockup doesn't already show inline. |
| 6 | **Friend badge = first person's initials from `skierDetails[resortKey]`**, shown only when that array is non-empty, pinned top-right edge of the bubble. No "+N" counter for multiple people in this slice. | Matches the mockup's single-badge-per-bubble ("JT" on Winter Park, "MR" on A-Basin). Reuses data already flowing into `PowderMap` — no new prop, no backend change. |
| 7 | **Live-GPS friend pins (`useLiveFriendLocations`, amber `CircleMarker`) are left untouched.** | Different feature (real-time location vs. planned/checked-in), not depicted in this mockup screenshot. Out of scope. |
| 8 | **Bottom sheet is a new sub-component inside `PowderMap.jsx`**, docked to the bottom of the map's existing rounded card (not full-viewport — this app's map isn't full-bleed). Shows the top 3 of the same `resorts` array/sort already driving the list. A handle bar **taps** to toggle peek ⇄ expanded — no drag-physics implementation. | Matches this app's only existing sheet (`CalendarFilterSheet`): tap-toggle, no continuous-drag state machine to build or risk getting janky. Reuses the same sort the list view already applies — no new sorting logic. |

## 3. The design

### 3.1 `ResortBubbleMarker` (new, inside `PowderMap.jsx`)

Leaflet `Marker` with `icon={L.divIcon(...)}`. HTML content per marker:
- Circular bubble, fixed diameter (~56px), `background: radial-gradient(...)` seeded from the
  resort's tier color (reuse `scoreColor(r.powderScore)` for the base hue), `box-shadow: 0 0 20px
  4px var(--rating-{tier}-border)` for the glow, score number centered, bold.
- Resort name as a label positioned below the bubble (absolutely positioned within the same
  `divIcon` HTML block, since Leaflet icons are a single HTML fragment).
- If `skierDetails[resortKey].length > 0`: a small badge (`avatarFallback()`, already exists)
  absolutely positioned top-right of the bubble, orange background, matching mockup.
- `<Marker>` keeps the existing `<Popup>` as a child, unchanged content.

Tier→token mapping mirrors `scoreColor()`'s existing bands exactly (>=88 mint, >=76 sky, >=63
gold, >=50 peach, else coral, null→slate) — no new thresholds.

### 3.2 `TopOfTheListSheet` (new, inside `PowderMap.jsx`)

- Props: `resorts` (already-sorted array — takes the first 3), `expanded`, `onToggle`.
- Positioned `absolute` at the bottom of the map's container box (the existing rounded
  `overflow: hidden` div at `PowderMap.jsx:203-211`), not the viewport.
- Collapsed: header row only ("TOP OF THE LIST" label + handle bar). Expanded: header + 3 compact
  rows (score pill, resort name, snow-new inches) — same visual language as `ResortListRow`'s
  compact styling from the List slice, reused where it fits.
- Styled per `CalendarFilterSheet`'s conventions: `var(--color-modal-bg)`, rounded top corners,
  no dismiss-on-outside-click (this is a docked panel, not a modal).

### 3.3 Removed

- `LegendItem`, `MarkerSizeItem`, and the two legend card `<div>`s (`PowderMap.jsx:160-201`).
- `markerRadius()` (no longer used — bubbles are fixed size).

### 3.4 Unchanged

- `scoreColor()`, `displayName()`, `statusLabel()`, `avatarFallback()`, `SkierRow`, the `Popup`
  content for both resort and live-GPS markers, the live-GPS `CircleMarker` layer entirely,
  `UserProfileModal` wiring, all props (`resorts`, `skierCounts`, `skierDetails`, `friendIds`).

## 4. Testing

Same limitation as the List View slice: `npm test` covers `src/lib` only (no DOM), so this ships
verified by `npm test` / `npx eslint` / `npm run build` + diff review, not an automated UI test.
Worth a manual click-through once in-app: bubble glow/label rendering across all 5 score tiers,
the friend badge showing/not-showing correctly, and the bottom-sheet tap-toggle.

## 5. Out of scope

Plans/Crew/Profile mockup pages (separate TASK 22.0 slices, not started). Live-GPS pin restyling.
Full drag-physics bottom sheet. Multi-person "+N" badge counter.
