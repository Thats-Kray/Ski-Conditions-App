# Krames Butte — Private Dev-Testing Resort for Mountain Board

## Problem

Sprint 29 (`sprints/sprint-29-mountain-board.md`) shipped the Mountain Board — a per-resort message board where reads are open to any logged-in user but posting requires the poster's GPS position to be within ~3 miles of the resort's real-world coordinates (enforced server-side in the `create_board_post` RPC via a Haversine distance check against `resort_coordinates`).

This makes the feature impossible to exercise end-to-end (posting, not just reading) without physically traveling to a resort. We need a fake "resort" — **Krames Butte** — that bypasses the distance check for testing purposes, visible and usable by exactly one account (`raykyle1104@gmail.com`), and that never leaks into any other resort-driven feature in the app (leaderboard, resort picker for logging ski days, Home/Snow tab resort cards, powder conditions, vibe score).

## Goals

- Post to the Mountain Board as the owner account without needing to be near a real resort.
- Krames Butte is invisible to every other account — in the UI, and at the database level (RLS + RPC), not just hidden by client-side conditionals.
- Krames Butte never appears anywhere resorts are listed outside the Mountain Board (leaderboard, `ResortPicker`, `App.jsx`'s `RESORTS` constant, powder conditions, vibe score).

## Non-goals

- General-purpose "fake resort" or admin tooling for creating more test resorts later — this is a one-off, hardcoded to a single email and a single resort name.
- Bypassing the geofence for any real resort or for any other user.

## Design

### A — Data model & access control (`migrations/021_krames_butte_dev_resort.sql`)

- Insert one row into `resort_coordinates` for `resort_key = 'kramesbutte'`. Coordinates are placeholder values — irrelevant, since the distance check is explicitly bypassed for this key (see below), not satisfied by a wide radius.
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

### B — Client-side (`MountainBoard.jsx`, `App.jsx`)

- `App.jsx` passes a new prop, `currentUserEmail={currentUser?.email}`, to `<MountainBoard>`. `currentUser` is already the Supabase auth object and already carries `.email` — no new state.
- `MountainBoard.jsx` accepts `currentUserEmail`. The resort-chip row conditionally appends one extra chip — `🧪 Krames Butte (Dev)` — after the 12 real resort chips, only when `currentUserEmail === "raykyle1104@gmail.com"`. Visually distinct (flask emoji, "(Dev)" suffix) so it reads unmistakably as a test entry even to the owner.
- No changes to `getBoardPosts` / `createBoardPost` / `reportBoardPost` — they already take `resortKey` as an opaque string. All enforcement lives in Section A; if another account's client were hand-crafted to call these with `resortKey: "kramesbutte"`, the RLS/RPC checks reject it regardless of what the UI renders.
- `src/lib/resorts.js` and `App.jsx`'s `RESORTS` constant are untouched. Krames Butte deliberately never enters `RESORT_NAMES`, which is what structurally guarantees it can't appear in the ski-day resort picker, the leaderboard, Home/Snow resort cards, powder conditions, or vibe score — rather than relying on a special-case filter added to each of those features that could later be forgotten.

## Testing

- Log in as the owner account, confirm the "🧪 Krames Butte (Dev)" chip appears and posting succeeds regardless of real GPS location.
- Log in as a second test account, confirm the chip does not render, and confirm a direct `supabase.rpc('create_board_post', { p_resort_key: 'kramesbutte', ... })` call from that account's session fails.
- Confirm a direct `select * from resort_coordinates where resort_key = 'kramesbutte'` from the second account's session returns zero rows.
- Confirm Krames Butte never appears in: the ski-day logging resort picker, the leaderboard, Home/Snow tab resort cards, or the powder-conditions/vibe-score displays.
