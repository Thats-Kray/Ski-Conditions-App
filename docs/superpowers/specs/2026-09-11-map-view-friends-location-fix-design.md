# TASK 22.4 — Map View + friends'-location test-and-fix

**Date:** 2026-09-11
**Status:** Approved, ready for planning

## Context

The Today tab's Map sub-view was visually redesigned and shipped 2026-08-27 (TASK 22.0's Map
slice — glowing tier-colored resort bubbles, tap-toggle "Top of the List" bottom sheet). Kyle
click-tested that redesign and confirmed it looks great. Two things were deliberately left
untouched during that redesign and have never been specifically tested or revisited: the live-GPS
friend-location pins (`useLiveFriendLocations.js` + the `CircleMarker` rendering in
`PowderMap.jsx`) and the resort marker's `Popup` detail content.

ROADMAP (TASK 22.4, Sprint 46, size S) already notes this task should be scoped to **functional
correctness**, not more restyling, since the visual redesign work now lives under TASK 22.0. This
spec covers a correctness audit of the friend-location pin/popup logic, plus one deliberate visual
change Kyle asked for once the audit was already in scope: shrinking and recoloring the friend pin
itself.

It is currently off-season (September) — there is no real multi-device ski day to test live GPS
sharing against. Verification will be code review plus a simulated browser test (devtools-mocked
geolocation, two logged-in test sessions), not a real-world field test.

## Scope

### 1. Correctness audit and fixes

Two real bugs found reading `useLiveFriendLocations.js`, `PowderMap.jsx`, and
`ActiveSessionBar.jsx`:

**Bug A — friend pin fires both its popup and the profile modal on one click.**
`PowderMap.jsx`'s friend `CircleMarker` has a bound `<Popup>` (which Leaflet auto-opens on click)
*and* `eventHandlers={{ click: () => setViewingUserId(friendId) }}`, which opens the full
`UserProfileModal` on the same click. Both fire together — the popup opens and is immediately
covered by the modal, making the popup dead code from the user's perspective.

*Fix:* remove the marker-level click handler. Match the existing resort-marker pattern in the same
file: the pin's own popup shows avatar + name + status; tapping the avatar/name *inside* the
popup (mirroring `SkierRow`'s `onViewProfile` pattern) is what opens `UserProfileModal`. The
friend-pin popup's avatar/name block becomes clickable, calling `setViewingUserId(friendId)`
in an `onClick`, and the marker's own `eventHandlers` prop is removed.

**Bug B — toggling location sharing on with denied/unavailable GPS fails silently.**
In `ActiveSessionBar.jsx`, `broadcastPosition`'s `getCurrentPosition` error callback is a no-op
(`() => {}`). If geolocation permission is denied, or the position request otherwise fails, no
broadcast is ever sent — but `sharingLocation` stays `true` and the toggle keeps showing "on,"
giving no indication that nothing is actually being shared.

*Fix:* on a geolocation error inside `broadcastPosition`'s error callback, set `sharingLocation`
back to `false` (auto-revert the toggle) and surface a visible message (reuse whatever
lightweight inline-error/toast convention `ActiveSessionBar.jsx` already uses elsewhere in this
component — no new UI pattern). This only needs to happen once per toggle-on attempt, not on
every subsequent failed 30s interval tick, to avoid repeated toast spam — checking the existing
`sharingLocation` state before reacting is enough since setting it to `false` also tears down the
interval via the existing effect cleanup.

No other issues were found in the staleness-cleanup logic (90s timeout, 15s sweep), the
`friendIds` sourcing in `App.jsx` (already correctly scoped to `getAcceptedFriends()`), or the
RLS/broadcast-authorization model (already covered by migration 018, unchanged by this task).

### 2. Friend-pin visual redesign

Replace the current friend-location marker — a 20px-diameter solid amber (`var(--color-warning)`)
`CircleMarker` at 90% fill opacity — with a smaller, more minimal marker:

- **Color:** fixed hex `#06B6D4` (teal/cyan), not a theme token. This follows the precedent
  already documented in `src/lib/crewColors.js`: a marker whose entire job is to stay
  identifiable and legible must use a fixed hue, not a `var(--color-*)` token that reskins per
  theme and can collapse into indistinct shades against some of the app's 5 themes × light/dark
  combinations.
- **Distinctness:** `#06B6D4` is not used by any existing `CREW_COLORS` entry (sky `#38BDF8`,
  violet `#A78BFA`, pink `#F472B6`, orange `#FB923C`, lime `#A3E635`, emerald `#34D399`) or any
  `TIER_COLORS`/`TIER_BORDER_COLORS` rating token, so a friend's live pin can't be misread as a
  crew-membership badge or a resort-tier indicator.
- **Shape/size:** a small solid dot with a thin contrasting ring, ~12px total diameter (down from
  the current 20px) — same `CircleMarker` primitive, smaller `radius` and a `weight`/stroke color
  tuned for a visible ring rather than the current thick amber outline. This is a size/color
  change only; no new marker primitive or icon asset.
- **Interaction:** unchanged apart from Bug A's fix above.
- **Popup content/styling:** unchanged — stays on Leaflet's literal-hex white-chrome styling per
  the existing code comment in `PowderMap.jsx`, since no app-theme override exists for Leaflet's
  own popup chrome.

### Out of scope

- Any further restyling of the resort bubbles or "Top of the List" sheet (already shipped and
  confirmed under TASK 22.0).
- Clustering/grouping multiple friend pins when several friends are near each other — not raised
  as a problem, not being solved here.
- Changing the resort `Popup`'s "Friends / crew at or heading to X" list content (`SkierRow`) —
  read during the audit, no bugs found, left as-is.
- A real field test with live devices on an actual ski day — deferred to the season, per Kyle's
  earlier notes on other Map-view work.

## Verification

- `npm test` / lint / build stay clean (no `src/lib` logic changes beyond what's described above
  — `useLiveFriendLocations.js` itself is untouched; the fixes land in `PowderMap.jsx` and
  `ActiveSessionBar.jsx`).
- Simulated browser test: run the dev server, mock geolocation via devtools (or a second logged-in
  session broadcasting on `mountain:live:{id}`) to produce a live friend pin, and confirm:
  - the pin renders at the new size/color,
  - tapping the pin opens its popup only (no modal fires),
  - tapping the avatar/name inside the popup opens `UserProfileModal`,
  - toggling "share my location" on with geolocation denied auto-reverts the toggle and shows a
    visible message, rather than silently claiming to share.
- Whole-branch final review on Opus, one fix wave, per this project's standard subagent-driven-
  development process.
