# Mountain Page Architecture & Krames Butte Dev Resort

## Problem

Sprint 29 (`sprints/sprint-29-mountain-board.md`) shipped the Mountain Board — a per-resort message board where reads are open to any logged-in user but posting requires the poster's GPS position to be within ~3 miles of the resort's real-world coordinates (enforced server-side in the `create_board_post` RPC via a Haversine distance check against `resort_coordinates`). This makes the feature impossible to exercise end-to-end (posting, not just reading) without physically traveling to a resort.

More broadly, the app's owner (`raykyle1104@gmail.com`) wants a standing, private testing ground for new per-resort features generally — not just the Board. The long-term vision is a **Mountain Page** per resort that composes several resort-scoped components (conditions detail, lift status, friends currently there, daily events, a resort-scoped leaderboard, the Board), built and iterated against a fake resort — **Krames Butte** — before being promoted to real resorts with minimal effort ("as easy as copying the new version over to the other mountains").

This spec covers two things together, since the second motivates the first:
1. **Krames Butte**: a fake resort, visible/usable only by the owner account, that bypasses the Board's geofence check.
2. **The Mountain Page architecture**: a reusable per-resort page and a widget-registry pattern that makes "build against Krames Butte, ship to everyone" a one-line config change rather than a rewrite.

## Goals

- Post to the Mountain Board as the owner account without needing to be near a real resort.
- Krames Butte is invisible to every other account — in the UI, and at the database level (RLS + RPC), not just hidden by client-side conditionals.
- Krames Butte never appears anywhere resorts are listed outside the Mountain Board / Mountain Page (leaderboard, `ResortPicker`, `App.jsx`'s `RESORTS` constant, powder conditions, vibe score).
- A reusable Mountain Page exists for every resort, reachable from its resort card, laid out like a Facebook Page (cover header + tab bar + feed-first default tab).
- Promoting a widget from "Krames Butte only" to "every resort" is a one-line config change (no rewrite, no new plumbing).

## Non-goals (this round)

- Building the lift-status, friends-on-mountain, daily-events, or mountain-scoped-leaderboard widgets themselves — each is a future spec, built against the architecture defined here. This round wires in exactly one widget: the already-shipped Mountain Board.
- General-purpose "fake resort" or admin tooling for creating more test resorts later — Krames Butte is a one-off, hardcoded to a single email and a single resort name.
- Bypassing the geofence for any real resort or for any other user.
- Database-driven / runtime-toggleable feature flags — rollout state lives in a code file, promoted by editing it and deploying, matching how a solo developer actually ships.

## Design

### A — Data model & access control for Krames Butte (`migrations/021_krames_butte_dev_resort.sql`)

- Insert one row into `resort_coordinates` for `resort_key = 'kramesbutte'` — `lat 39.5, lon -105.5` (roughly central Colorado; a recognizable, deliberately-not-`0,0` placeholder). The value is functionally irrelevant since the distance check is explicitly bypassed for this key (see below), not satisfied by a wide radius.
- `create_board_post` gets a new branch at the very top of the function body:
  ```
  IF p_resort_key = 'kramesbutte' THEN
    -- verify auth.uid() maps to raykyle1104@gmail.com via auth.users; RAISE EXCEPTION otherwise
    -- skip the Haversine distance check entirely, proceed straight to INSERT
  ```
  This is an explicit, self-documenting bypass — not a giant geofence radius that someone could mistake for a real, satisfiable distance requirement six months from now.
- The existing "Authenticated can read visible posts" RLS policy on `mountain_board_posts` gets an added clause: rows where `resort_key = 'kramesbutte'` are only visible to the owner email (checked via a subquery against `auth.users`/`auth.uid()`). All other resorts' posts are unaffected.
- Same email-restriction clause added to the `resort_coordinates` SELECT policy, scoped to the `kramesbutte` row only — so a direct table query from another account doesn't even reveal that the row exists.
- `report_board_post` needs no changes — no one but the owner can ever see a Krames Butte post to report it.

### B — Client-side gating for the standalone Board tab (`MountainBoard.jsx`, `App.jsx`)

- `App.jsx` passes a new prop, `currentUserEmail={currentUser?.email}`, to `<MountainBoard>`. `currentUser` is already the Supabase auth object and already carries `.email` — no new state.
- `MountainBoard.jsx` accepts `currentUserEmail`. The resort-chip row conditionally appends one extra chip — `🧪 Krames Butte (Dev)` — after the 12 real resort chips, only when `currentUserEmail === "raykyle1104@gmail.com"`. Visually distinct (flask emoji, "(Dev)" suffix) so it reads unmistakably as a test entry even to the owner.
- No changes to `getBoardPosts` / `createBoardPost` / `reportBoardPost` — they already take `resortKey` as an opaque string. All enforcement lives in Section A; if another account's client were hand-crafted to call these with `resortKey: "kramesbutte"`, the RLS/RPC checks reject it regardless of what the UI renders.
- `src/lib/resorts.js` and `App.jsx`'s `RESORTS` constant are untouched. Krames Butte deliberately never enters `RESORT_NAMES`, which is what structurally guarantees it can't appear in the ski-day resort picker, the leaderboard, Home/Snow resort cards, powder conditions, or vibe score — rather than relying on a special-case filter added to each of those features that could later be forgotten.

### C — Mountain Page architecture and layout

**Navigation.** New App-level state, `mountainPageResortKey`. When set, the tab content area is replaced by `<MountainPage resortKey={...} resort={...} currentUserEmail={...} onBack={...} />` instead of whatever `activeTab` would normally render — a full page, not another sub-tab, since it will hold several widgets over time. Each `ResortCard` gets an added "View Mountain Page →" affordance that sets this state; the card's existing tap-to-expand-forecast behavior is untouched.

**Widget registry (`src/lib/mountainPageWidgets.js`).** A plain array: `{ key, label, rolloutResorts: ['kramesbutte'] | 'all', Component }`. `MountainPage.jsx` has no widget-specific knowledge — it just renders what the registry says is visible. This is the one-line promotion mechanism: build a new widget against `rolloutResorts: ['kramesbutte']`, iterate freely, flip to `'all'` when it's ready for every resort, commit, deploy.

**Visibility rule.** A widget renders on a given resort's page if `rolloutResorts === 'all'`, or `rolloutResorts` includes that `resortKey` — **except** when `resortKey === 'kramesbutte'` and `currentUserEmail` is the owner, in which case *every* registered widget renders regardless of rollout state. Krames Butte is where in-progress widgets are always visible to their author; real resorts only ever show what's actually shipped.

**First widget — Mountain Board.** Registered immediately with `rolloutResorts: 'all'`, since it's already live. `MountainBoard.jsx` gets one small addition — an optional `lockedResortKey` prop. When set (i.e. embedded in a Mountain Page), it hides its own resort-switcher chips and shows only that resort's board. The standalone global "📋 Board" tab passes no such prop, so it keeps today's multi-resort-switcher behavior unchanged.

**Layout — Facebook-Page-style.**
- *Cover header:* the resort's existing photo as a banner, name + emoji overlaid, an Open/Closed badge, and (when available) current powder score/tier — all pulled from the same resort object `ResortCard` already uses, no new data source. Krames Butte's header omits the conditions bits it has no real data for and shows a small "🧪 Dev" tag instead.
- *Tab bar:* generated directly from the widget registry, one tab per visible widget, in registry order. Adding a future widget to the registry automatically adds a tab — no page-layout changes required.
- *Feed-first default:* the first visible widget is the active tab on load, the way a Facebook Page opens on its post feed rather than its About tab. Today that's the Mountain Board, so opening any resort's Mountain Page lands directly in that resort's board.
- Tab selection (`activeWidgetKey`) is local state in `MountainPage.jsx`, reset to the first visible widget whenever a different resort's page is opened.

**Reaching Krames Butte's page.** Since it's deliberately excluded from `RESORTS`/`RESORT_NAMES`, it needs its own entry point that doesn't touch those shared data structures. A small owner-only banner — "🧪 Krames Butte — Dev Testing Ground →" — appears above the resort-card grid on the Snow tab, gated by `currentUserEmail` (same pattern as the Section B chip). It opens `MountainPage` directly with a synthetic resort object: `{ resortKey: "kramesbutte", name: "Krames Butte", emoji: "🧪", isOpen: null, powderScore: null }` — no photo, no live conditions fields. `MountainPage`'s header treats a `null` `powderScore`/`isOpen` as "omit this badge" rather than rendering a broken/zero state.

## Testing

- Log in as the owner account, confirm the "🧪 Krames Butte (Dev)" chip appears in the standalone Board tab and posting succeeds regardless of real GPS location.
- Log in as a second test account, confirm the chip does not render, and confirm a direct `supabase.rpc('create_board_post', { p_resort_key: 'kramesbutte', ... })` call from that account's session fails.
- Confirm a direct `select * from resort_coordinates where resort_key = 'kramesbutte'` from the second account's session returns zero rows.
- Confirm Krames Butte never appears in: the ski-day logging resort picker, the leaderboard, Home/Snow tab resort cards, or the powder-conditions/vibe-score displays.
- Tap a real resort's card, confirm its Mountain Page opens showing the cover header and a single "📋 Board" tab, locked to that resort (no resort-switcher chips visible).
- As the owner, confirm the Krames Butte banner appears above the resort grid, opens the Mountain Page for `kramesbutte`, and shows the Board tab locked to `kramesbutte`.
- As a second account, confirm the Krames Butte banner does not render anywhere.
- Confirm the standalone "📋 Board" sub-tab (Snow → Board) still shows the full multi-resort switcher exactly as it did before this change.
