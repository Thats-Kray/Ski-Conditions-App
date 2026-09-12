# Map View friend-location pins — fix and redesign implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two correctness bugs the TASK 22.4 audit found in the Today tab's Map sub-view friend-location pins — a friend pin that opens its popup and the profile modal on the same tap, and a "share my location" toggle that keeps claiming to share after a GPS fix fails — and shrink/recolor the pin itself from a 22px amber blob to a 12px teal dot with a dark ring.

**Architecture:** Three surgical edits in two existing components, no new files, no new lib code, no data-layer changes. `src/components/PowderMap.jsx` loses the friend `CircleMarker`'s marker-level `eventHandlers` click and instead makes the popup's avatar/name block clickable (mirroring the `SkierRow` / `onViewProfile` pattern already used by the resort marker's popup in the same file), and swaps the marker's `radius`/`pathOptions` for module-level fixed-hex constants. `src/components/ActiveSessionBar.jsx` gains one piece of local state (`shareError`) and a real `getCurrentPosition` error callback in place of the current no-op; the error text renders in the toggle's *existing* sub-label slot rather than in any new banner/toast. `src/lib/useLiveFriendLocations.js` is deliberately untouched — it was read during the audit and no bugs were found in its staleness cleanup (90s timeout, 15s sweep) or its channel wiring.

**Tech Stack:** React 19 function components with inline styles (no CSS modules in these files), react-leaflet 5 / leaflet 1.9, Supabase Realtime Broadcast. Vite dev server. Tests are `node --test src/lib/*.test.js`. No new dependencies.

## Global Constraints

- **Spec of record:** `docs/superpowers/specs/2026-09-11-map-view-friends-location-fix-design.md`. Read it before starting. Anything it lists under "Out of scope" stays out of scope.
- **No automated test coverage is expected from this task.** `package.json`'s test script is `node --test src/lib/*.test.js` — the runner only ever looks at `src/lib`, there is no jsdom / React-Testing-Library dependency in `package.json`, and there are no `*.test.*` files anywhere outside `src/lib` (verified at plan-writing time). Both files this plan touches are `.jsx` components whose changes are Leaflet-DOM and browser-geolocation behavior; testing either would require rendering React and mocking Leaflet, and that harness does not exist. **Do not add one, and do not add a test file for `PowderMap.jsx` or `ActiveSessionBar.jsx`.** Verification for every task here is lint + build + test-suite-stays-green + a scripted manual browser check. `src/lib/useLiveFriendLocations.js` is not modified, so its coverage does not change either.
- **`node_modules` is not present in this worktree** as of plan-writing time. Task 1 Step 0 installs it. Do not skip that step.
- **No baseline numbers are quoted in this plan** — the plan author could not run `npm test` / `npm run lint` (no `node_modules`). Measure your own baseline in Task 1 Step 0 *before* touching any source file, write the two numbers down, and compare every later run against your own measurement, not against a number from some other plan.
- **Do not retint the friend popup's interior.** The popup's avatar chip (`#fef3c7` background, `#92400e` text) and its "On the mountain now" line are amber, chosen back when the pin was amber. Once Task 2 lands they will read as slightly incoherent with a teal pin. The spec explicitly freezes popup content/styling ("Popup content/styling: unchanged"), so leave them alone and mention the observation in your task report instead of fixing it.
- **Keep literal hex literal in Leaflet-owned surfaces.** Both files already carry comments explaining why certain colors are literal hex rather than `var(--color-*)` tokens (`PowderMap.jsx` lines 31-42 and 167-170; `ActiveSessionBar.jsx` lines 16-20). Follow that existing convention and the `src/lib/crewColors.js` "WHY THESE ARE FIXED HEX AND NOT THEME TOKENS" reasoning; do not "restore" theme tokens on the marker.
- **One commit per task**, house style: short imperative present-tense subject with a `fix:` / `refactor:` / `fix(scope):` prefix (see the log: `fix(light-mode): theme-mode localStorage rollback, lint gate, click-test list`, `refactor: tokenise Track and session colours for light mode`).
- **Do not do a whole-branch review, merge, or push from inside this plan.** Those are run separately by the controlling session after the last task here.

---

### Task 1: Stop the friend pin from firing its popup and the profile modal on one tap

**Files:**
- Modify: `src/components/PowderMap.jsx` (the friend `CircleMarker` block, currently lines 317-362)

**Interfaces:**
- Consumes: `setViewingUserId` — the `useState` setter declared at line 232 of the same file, already used as `SkierRow`'s `onViewProfile` at line 306.
- Produces: the friend popup's avatar/name block becomes the only path from a friend pin to `UserProfileModal`. Task 2 edits the same `<CircleMarker>` element's props, so Task 1 must land first.

The bug: the `<CircleMarker>` at line 322 has both a bound `<Popup>` (which Leaflet auto-opens on marker click) and `eventHandlers={{ click: () => setViewingUserId(friendId) }}` at line 327. One tap fires both — the popup opens and `UserProfileModal` immediately covers it, so the popup is dead code from the user's point of view. The fix removes the marker-level handler and moves the profile-opening intent inside the popup, exactly as the resort marker already does with `SkierRow`.

- [ ] **Step 0: Set up the workspace and take a baseline**

From the repo root of this worktree, run, in order:

```bash
npm install
npm test
npm run lint
npm run build
```

Write down the `npm test` pass/fail counts and the `npm run lint` problem count. These are your baseline; every later verification step in this plan compares against these two numbers. Do not edit any source file before you have them. If `npm run build` fails on a clean tree, stop and report — that is a pre-existing problem, not something this plan introduces.

- [ ] **Step 1: Read the resort marker's existing profile-opening pattern**

Read `src/components/PowderMap.jsx` lines 167-224 (`SkierRow`) and line 306 (`<SkierRow key={person.id} person={person} onViewProfile={setViewingUserId} />`).

Note the shape you are about to mirror: the marker itself carries no click handler; `SkierRow` is a plain `<div>` with `onClick={() => onViewProfile?.(person.id)}` and `cursor: "pointer"` in its inline style. No `role`, no `tabIndex`, no keyboard handler. Match that exactly — this task is about making the friend pin consistent with an existing pattern, not about upgrading that pattern's accessibility, which would leave it inconsistent with the `SkierRow` a hundred lines above it.

- [ ] **Step 2: Remove the marker-level click handler**

In `src/components/PowderMap.jsx`, the friend marker opening tag currently reads:

```jsx
            <CircleMarker
              key={`friend-${friendId}`}
              center={[loc.lat, loc.lng]}
              radius={10}
              pathOptions={{ color: "var(--color-warning)", fillColor: "var(--color-warning)", fillOpacity: 0.9, weight: 2 }}
              eventHandlers={{ click: () => setViewingUserId(friendId) }}
            >
```

Delete the `eventHandlers` line so it reads:

```jsx
            <CircleMarker
              key={`friend-${friendId}`}
              center={[loc.lat, loc.lng]}
              radius={10}
              pathOptions={{ color: "var(--color-warning)", fillColor: "var(--color-warning)", fillOpacity: 0.9, weight: 2 }}
            >
```

Leave `radius` and `pathOptions` exactly as they are — Task 2 changes those, and keeping this commit to the behavior fix alone keeps the two changes independently revertable.

- [ ] **Step 3: Make the popup's avatar/name block open the profile**

The popup body currently opens with a flex row that has no interaction affordance:

```jsx
              <Popup maxWidth={220}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
```

Replace those two lines with:

```jsx
              <Popup maxWidth={220}>
                {/* Tapping the avatar/name opens the full profile — the same pattern
                    SkierRow uses inside the resort popups above. The marker itself
                    deliberately carries NO click handler: Leaflet already opens this
                    popup on marker click, and a marker-level handler opened
                    UserProfileModal on that very same click, instantly covering the
                    popup it had just opened. */}
                <div
                  onClick={() => setViewingUserId(friendId)}
                  style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                >
```

Everything inside that `<div>` (the avatar chip at lines 334-354 and the name/status block at lines 355-358) is unchanged, and so are its closing `</div>` and `</Popup>`.

- [ ] **Step 4: Lint, test, build**

```bash
npm run lint
npm test
npm run build
```

Expected: lint problem count identical to your Step 0 baseline, test counts identical to your Step 0 baseline (no `src/lib` file was touched), build succeeds. If lint went up, the most likely cause is a stray unused variable from a mis-applied edit — read the output and fix it rather than suppressing it.

- [ ] **Step 5: Put a fake friend pin on the map so you can click it**

There is no real friend broadcasting a position in September, so create one locally. This stub is temporary and gets removed in Step 7.

First get your own user id: start the dev server (`npm run dev`), open the app at the URL Vite prints (usually `http://localhost:5173`), sign in, then run this in the browser devtools console:

```js
(() => { const k = Object.keys(localStorage).find((x) => x.startsWith("sb-") && x.endsWith("-auth-token")); return JSON.parse(localStorage.getItem(k)).user.id })()
```

Copy the UUID it prints. Using your own id (rather than a made-up one) means `UserProfileModal` will load a real profile instead of an empty/not-found state.

Now, in `src/components/PowderMap.jsx`, directly after line 236 (`const liveLocations = useLiveFriendLocations(friendIds)`), add:

```jsx
  // TEMP DEV STUB — delete before committing (see plan Task 1 Step 7)
  const liveLocationsStub = {
    "PASTE-YOUR-UUID-HERE": {
      lat: 39.2,
      lng: -105.4,
      name: "Test Friend",
      avatar_url: null,
      updatedAt: Date.now(),
    },
  }
```

and change the one call site from `Object.entries(liveLocations)` to `Object.entries(liveLocationsStub)`. The coordinates 39.2, -105.4 are an empty patch east of the I-70 ski corridor, so the pin will not land underneath a resort bubble.

- [ ] **Step 6: Manual browser verification of the fix**

With `npm run dev` running and signed in:

1. Go to the **Today** tab. In the segmented `List | Map` pill near the top, click **Map**. The Leaflet map renders, centered on Colorado.
2. Find the small friend dot east of the resort bubbles (around 39.2, -105.4). Pan or zoom if needed.
3. **Tap the dot once.** Expected: the white Leaflet popup opens showing the "TF" avatar initials and "Test Friend / On the mountain now" — **and nothing else**. The full-screen `UserProfileModal` must NOT appear. (Before this fix, the modal appeared instantly and covered the popup.)
4. **Tap the avatar circle inside the popup.** Expected: `UserProfileModal` opens with your own profile loaded.
5. Close the modal with its close control. Expected: you are back on the map.
6. Tap the dot again, then **tap the name text "Test Friend" inside the popup**. Expected: `UserProfileModal` opens again — the whole avatar+name row is the hit target, not just the avatar.
7. Tap the dot, then click on empty map tiles. Expected: the popup closes and no modal appears.
8. Regression check on the resort markers: tap any glowing resort bubble. Expected: its popup opens with Powder Score / Snow 24h / Skiers Today and the "Friends / crew at or heading to X" list, unchanged. If any friends are listed there, clicking one still opens `UserProfileModal` as before.

If step 3 still opens the modal, the `eventHandlers` line was not actually removed — recheck Step 2 before continuing.

- [ ] **Step 7: Remove the dev stub and confirm the diff is clean**

Delete the `liveLocationsStub` block you added in Step 5 and change `Object.entries(liveLocationsStub)` back to `Object.entries(liveLocations)`.

Then run `git diff src/components/PowderMap.jsx` and read it in full. It must contain exactly two things: the removed `eventHandlers` line, and the new comment plus `onClick` and `cursor: "pointer"` on the popup's flex row. If the word `Stub` or the UUID you pasted appears anywhere in the diff, you have not finished removing the stub. Also run `git status` and confirm no untracked files were created.

- [ ] **Step 8: Commit**

```bash
git add src/components/PowderMap.jsx
git commit -m "$(cat <<'EOF'
fix(map): open only the popup on a friend pin tap

The friend CircleMarker had both a bound Popup (which Leaflet opens on
click) and a marker-level click handler that opened UserProfileModal, so
one tap fired both and the modal instantly covered the popup it had just
opened. Drop the marker handler and put the profile-opening onClick on
the popup's avatar/name row instead, matching how SkierRow already works
inside the resort popups in this same file.
EOF
)"
```

---

### Task 2: Shrink and recolor the friend live-location pin

**Files:**
- Modify: `src/components/PowderMap.jsx` (new module constants after line 46; the friend `CircleMarker`'s `radius`/`pathOptions`; the stale block comment above it)

**Interfaces:**
- Consumes: nothing new — the same `CircleMarker` primitive with the same props, different values. No new imports, no icon asset, no `L.divIcon`.
- Produces: module-level `FRIEND_PIN_*` constants scoped to this file; nothing else imports them.
- Depends on Task 1 having landed (it edits the same JSX element).

Per spec section 2: a ~12px dot in fixed hex `#06B6D4`, down from a 22px amber blob (`radius: 10` + `weight: 2` = 22px outer diameter, despite the spec prose saying 20px — verified against the actual file), with a thin contrasting ring.

- [ ] **Step 1: Observe what the pin actually renders as today**

Before changing anything, put the Task 1 Step 5 dev stub back in place (same snippet, same one-line call-site change), run `npm run dev`, open the Today tab's Map sub-view, right-click the friend dot and choose **Inspect**. Look at the selected `<path>` element's `stroke` and `fill` attributes in the Elements panel, and at its computed color.

You are checking one specific thing: `pathOptions` currently passes the *string* `"var(--color-warning)"`, and Leaflet's SVG renderer writes that through the SVG `stroke` and `fill` presentation attributes via `setAttribute` — and `var()` substitution does not apply in a presentation attribute in Chrome or Safari. If the rendered stroke/fill is Leaflet's default blue (`#3388ff`) rather than the theme's amber, then the pin has never actually been amber and this task incidentally fixes that too.

Write down what you observe. You will use it in Step 2's comment: keep the final parenthetical note if the pin really is falling back to default blue, delete that parenthetical if it genuinely renders amber. Do not guess — look.

- [ ] **Step 2: Add the pin color/size constants**

In `src/components/PowderMap.jsx`, directly after line 46 (`const ICON_HEIGHT = 92`) and before the `resortBubbleIcon` comment block, add:

```jsx
// Friend live-location pin. Fixed hex, not var(--color-*) tokens, for the reason
// src/lib/crewColors.js spells out at length: a marker whose entire job is to stay
// identifiable has to hold one hue across all five themes x light/dark, and a theme
// token reskins into whatever that theme's warning/accent happens to be. #06B6D4
// (cyan) collides with no CREW_COLORS hue and no TIER_COLORS/TIER_BORDER_COLORS
// value, so a live friend pin can never be misread as a crew-membership badge or a
// resort-tier bubble.
//
// The ring, not the fill, is what carries the shape: #06B6D4 is only ~2.1:1 against
// OpenStreetMap's #F2EFE9 tile ground, while #0F172A is ~15.6:1 against that ground
// and ~7.3:1 against the fill. #0F172A is already used literally elsewhere in this
// file (the resort bubble's score text).
//
// (This also retires a value that never rendered: the old pathOptions passed the
// string "var(--color-warning)", which Leaflet writes into an SVG presentation
// attribute, where var() does not resolve.)
const FRIEND_PIN_FILL = "#06B6D4"
const FRIEND_PIN_RING = "#0F172A"
// radius 5 + weight 2 = 12px outer diameter, down from radius 10 + weight 2 = 22px.
const FRIEND_PIN_RADIUS = 5
const FRIEND_PIN_WEIGHT = 2
```

If Step 1 showed the pin genuinely rendering amber, delete the final parenthetical paragraph (the three lines starting `// (This also retires`) and keep the rest.

- [ ] **Step 3: Apply the constants to the marker**

The friend marker's opening tag (as Task 1 left it) reads:

```jsx
            <CircleMarker
              key={`friend-${friendId}`}
              center={[loc.lat, loc.lng]}
              radius={10}
              pathOptions={{ color: "var(--color-warning)", fillColor: "var(--color-warning)", fillOpacity: 0.9, weight: 2 }}
            >
```

Replace it with:

```jsx
            <CircleMarker
              key={`friend-${friendId}`}
              center={[loc.lat, loc.lng]}
              radius={FRIEND_PIN_RADIUS}
              pathOptions={{
                color: FRIEND_PIN_RING,
                fillColor: FRIEND_PIN_FILL,
                fillOpacity: 1,
                weight: FRIEND_PIN_WEIGHT,
              }}
            >
```

`fillOpacity` goes from `0.9` to `1` — at 12px a translucent fill lets the tile texture bleed through and muddies an already-small dot.

- [ ] **Step 4: Update the now-wrong block comment**

The comment above the friend-pin map (currently lines 317-320) still describes the old marker:

```jsx
          {/* Live friend location pins (S28-T3) — visually distinct (amber ring)
              from the resort powder-score markers above. Disappear within ~90s
              of a friend stopping sharing (staleness cleanup in the hook), or
              immediately on an explicit "stopped" broadcast. */}
```

Replace it with:

```jsx
          {/* Live friend location pins (S28-T3) — a small teal dot with a dark ring,
              deliberately quiet next to the glowing resort powder-score bubbles above
              (see FRIEND_PIN_* at the top of this file). Disappear within ~90s of a
              friend stopping sharing (staleness cleanup in the hook), or immediately
              on an explicit "stopped" broadcast. */}
```

- [ ] **Step 5: Lint, test, build**

```bash
npm run lint
npm test
npm run build
```

Expected: all three match your Task 1 Step 0 baseline. A new `no-unused-vars` error here almost certainly means one of the four `FRIEND_PIN_*` constants was declared but not wired into Step 3 — fix the wiring rather than deleting the constant.

- [ ] **Step 6: Manual browser verification of the new pin**

With the dev stub from Step 1 still in place and `npm run dev` running:

1. Today tab → **Map**. Find the friend dot around 39.2, -105.4.
2. Confirm it is now a **small solid teal dot with a thin near-black ring**, visibly smaller than before — roughly the size of a lowercase letter, and clearly smaller than the 56px resort bubbles.
3. Inspect the `<path>` in devtools. Expected attributes: `stroke="#0F172A"`, `fill="#06B6D4"`, `fill-opacity="1"`, `stroke-width="2"`, `r="5"`. No `var(` anywhere in them.
4. Zoom the map out two steps and back in. The dot should stay legible against the tiles at every zoom — the ring is what makes it readable once the fill gets small.
5. Confirm it is not confusable with anything else on the map: it should read as neither a tier-colored resort bubble nor a crew color.
6. Re-run Task 1's interaction checks on the new, smaller dot: one tap opens only the popup (no modal), and tapping the avatar or name inside the popup opens `UserProfileModal`. The smaller hit target must still be tappable — if you cannot reliably hit it with a mouse click at default zoom, say so in your task report rather than silently bumping the radius back up.
7. Toggle the app between light and dark mode (Profile tab → theme setting) with the map open. The pin's teal and ring should look identical in both — that is the whole point of the fixed hex.

- [ ] **Step 7: Remove the dev stub and confirm the diff is clean**

Delete the `liveLocationsStub` block and restore `Object.entries(liveLocations)`.

Inspect the working tree with `git diff src/components/PowderMap.jsx` and `git status`. The diff must show only: the new `FRIEND_PIN_*` constant block, the marker's `radius`/`pathOptions` change, and the reworded block comment. No `Stub`, no pasted UUID, no untracked files.

- [ ] **Step 8: Commit**

```bash
git add src/components/PowderMap.jsx
git commit -m "$(cat <<'EOF'
refactor(map): shrink the friend live-location pin to a 12px teal dot

Was a 22px amber CircleMarker at 90% fill. Now a 12px #06B6D4 dot with a
thin #0F172A ring: the ring carries the contrast against OSM's light
tiles, and the fixed hex holds one hue across all five themes rather than
reskinning per theme, same reasoning as src/lib/crewColors.js. #06B6D4
matches no CREW_COLORS or TIER_COLORS value, so the pin cannot be misread
as a crew badge or a tier bubble.
EOF
)"
```

---

### Task 3: Revert the share-location toggle and say so when a GPS fix fails

**Files:**
- Modify: `src/components/ActiveSessionBar.jsx` (new `shareError` state near line 48; the live-sharing effect at lines 56-115; a derived sub-label near line 128; the toggle block at lines 253-306)

**Interfaces:**
- Consumes: `useState` (already imported at line 1), the existing `sharingLocation` state (line 46) and its effect (lines 56-115).
- Produces: a `shareError` string rendered in the toggle's existing sub-label `<div>`. Nothing outside this component reads it.
- Independent of Tasks 1 and 2 (different file), but sequenced last so the two `PowderMap.jsx` commits stay adjacent in history.

The bug: inside the live-sharing effect, both `getCurrentPosition` calls (lines 101 and 103) pass an empty arrow function as their error callback. If the position request fails, nothing is broadcast, but `sharingLocation` stays `true` and the toggle keeps rendering as on.

**Read this before you write the fix — it defines what you are and are not covering.** When geolocation is denied outright *before* the session starts, `useGpsTracker`'s watch error handler sets `tracker.status === "error"`, and this component already responds: the effect at lines 119-121 flips `sharingLocation` to `false`, the toggle button is `disabled` (line 276), and the sub-label already reads "GPS tracking requires location permission" (lines 269-271). That path is covered and you must not change it. The uncovered path — the one this task fixes — is a `getCurrentPosition` failure while the tracker is otherwise fine: `POSITION_UNAVAILABLE`, `TIMEOUT`, or permission revoked after a good fix.

- [ ] **Step 1: Confirm this component's existing inline-message convention**

Read `src/components/ActiveSessionBar.jsx` lines 252-306 (the "Share my location" toggle block).

Note what is there: there is **no** toast, banner, snackbar, or alert anywhere in this component — grepping it for `toast`, `banner`, or `alert(` returns nothing. The component's one and only inline-message affordance is the 11px `var(--ink-50)` sub-label `<div>` at lines 268-272, whose copy already swaps on a GPS problem:

```jsx
              <div style={{ fontSize: 11, color: "var(--ink-50)", marginTop: 2 }}>
                {tracker.status === "error"
                  ? "GPS tracking requires location permission"
                  : "Friends see a live pin on the map while this is on"}
              </div>
```

That slot is the convention the spec means by "reuse whatever lightweight inline-error/toast convention `ActiveSessionBar.jsx` already uses elsewhere — no new UI pattern." The fix below writes into it. Do not add a banner, and do not reach for `NudgeBanner.jsx` (a different component, for a different, unrelated nudge flow).

- [ ] **Step 2: Add the `shareError` state**

Directly after line 48 (`const intervalRef = useRef(null)`), add:

```jsx
  // Set when a getCurrentPosition call for the live-location broadcast fails
  // (permission denied, position unavailable, timeout). Rendered in the toggle's
  // existing sub-label slot below — this component has no toast or banner of its
  // own, and that sub-label is already how it explains a GPS problem, so the error
  // reuses it rather than adding a second error surface.
  const [shareError, setShareError] = useState(null)
```

- [ ] **Step 3: Add a real error callback inside the sharing effect**

At the top of the effect body (line 57, immediately before `function stopSharing() {`), add:

```jsx
    let cancelled = false
```

Then, directly after the `broadcastPosition` function (after its closing brace on line 88) and before the `// Wait for the private channel's...` comment, add:

```jsx
    // This error callback used to be an empty arrow function, so a denied or
    // unavailable GPS left the toggle reading "on" while nothing was ever
    // broadcast. Revert the toggle and say why. Setting sharingLocation to false
    // re-runs this effect, and its cleanup clears the 30s interval — so this fires
    // once per toggle-on attempt rather than on every failed tick. `cancelled`
    // additionally drops any callback that lands after teardown (an in-flight
    // position request can resolve after the user has already toggled off).
    function handlePositionError(err) {
      if (cancelled) return
      console.warn("Live location position error:", err)
      setShareError(
        err?.code === err?.PERMISSION_DENIED
          ? "Location permission denied — sharing turned off."
          : "Couldn't get your location — sharing turned off."
      )
      setSharingLocation(false)
    }
```

Use `err.code === err.PERMISSION_DENIED` rather than a bare `1` — that is the comparison `src/lib/useGpsTracker.js` line 158 already uses on the same error object. The `console.warn` prefix matches the existing `console.warn("Live location channel error:", err)` on line 106.

- [ ] **Step 4: Wire the callback into both position requests**

Inside `channel.subscribe(...)`, the `SUBSCRIBED` branch currently reads:

```jsx
        navigator.geolocation.getCurrentPosition(broadcastPosition, () => {}, { enableHighAccuracy: false })
        intervalRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(broadcastPosition, () => {}, { enableHighAccuracy: false })
        }, 30000)
```

Replace both empty arrow functions with `handlePositionError`:

```jsx
        navigator.geolocation.getCurrentPosition(broadcastPosition, handlePositionError, { enableHighAccuracy: false })
        intervalRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(broadcastPosition, handlePositionError, { enableHighAccuracy: false })
        }, 30000)
```

- [ ] **Step 5: Set `cancelled` in the effect cleanup**

The effect currently ends with a bare `return stopSharing` (line 114), directly under the "Cleanup fires on toggle-off AND on unmount" comment. Replace that single line with:

```jsx
    return () => {
      cancelled = true
      stopSharing()
    }
```

Leave the comment above it as-is — it still describes exactly what happens.

- [ ] **Step 6: Derive the sub-label copy**

After line 128 (`const isPaused = tracker.status === "paused"`), add:

```jsx
  // Toggle sub-label copy, most specific first: a live sharing error beats the
  // static "GPS needs permission" hint, which beats the default explainer.
  const shareSubLabel =
    shareError ||
    (tracker.status === "error"
      ? "GPS tracking requires location permission"
      : "Friends see a live pin on the map while this is on")
```

- [ ] **Step 7: Render the error in the existing sub-label slot**

Replace the sub-label `<div>` (lines 268-272) with:

```jsx
              <div
                role="status"
                style={{ fontSize: 11, color: shareError ? "var(--color-danger)" : "var(--ink-50)", marginTop: 2 }}
              >
                {shareSubLabel}
              </div>
```

`role="status"` makes the swap announce to screen readers, since the toggle silently flipping back is otherwise invisible to them. `var(--color-danger)` is the same token the End Day button already uses in this file (line 399).

- [ ] **Step 8: Clear the error when the user retries**

The toggle button's handler (line 275) currently reads:

```jsx
              onClick={(e) => { e.stopPropagation(); setSharingLocation((v) => !v) }}
```

Replace it with:

```jsx
              onClick={(e) => { e.stopPropagation(); setShareError(null); setSharingLocation((v) => !v) }}
```

Clearing on every press (not just on turn-on) is deliberate: a stale error should not survive the user turning sharing off either.

- [ ] **Step 9: Lint, test, build**

```bash
npm run lint
npm test
npm run build
```

Expected: all three match your Task 1 Step 0 baseline. Watch specifically for a `react-hooks/exhaustive-deps` warning on the sharing effect — you added no new external dependency (`cancelled` is effect-local, and the two state setters are stable), so the dep array `[sharingLocation, currentProfile?.id]` stays exactly as it is. If lint now complains about it, do not add deps blindly: re-read Step 3 and check you did not accidentally close over something new.

- [ ] **Step 10: Manual browser verification — the forced-timeout repro (primary)**

This repro breaks *only* the `getCurrentPosition` path, leaving the GPS tracker's own watch healthy, so what you observe is unambiguously the new code and not the pre-existing `tracker.status === "error"` handling.

1. Open Chrome devtools, then the three-dot menu → **More tools → Sensors**. Under **Location**, choose **Other…** and enter Latitude `39.6403`, Longitude `-106.3742` (Vail).
2. Temporarily change **both** `getCurrentPosition` option objects in the effect from `{ enableHighAccuracy: false }` to `{ enableHighAccuracy: false, timeout: 1 }`. A 1ms timeout guarantees a `TIMEOUT` error on every call. **You will revert this in Step 12.**
3. Run `npm run dev`, open the app, sign in, and allow the location permission prompt if the browser shows one.
4. Go to the **Track** tab and click the **"Ready to ski?"** card's start button. The floating Active Session bar appears pinned above the bottom nav, showing a status dot, "Active", and an elapsed timer.
5. Click the floating bar to expand the session sheet.
6. Find the "Share my location" row. Confirm the sub-label reads "Friends see a live pin on the map while this is on" in normal gray, and the pill toggle is enabled (not dimmed).
7. **Tap the toggle on.** The knob slides right.
8. Within about a second: the knob **snaps back to off**, and the sub-label turns **red** reading "Couldn't get your location — sharing turned off." The devtools console shows one `Live location position error:` warning whose error object has `code` `3`.
9. **Leave it for 90 seconds without touching anything.** Confirm no further console warnings appear and the message does not re-fire or duplicate — the interval must have been torn down, not left ticking.
10. **Tap the toggle on again.** Confirm the red message clears the instant you press it (then the failure repeats, as expected, while the 1ms timeout is still in place).
11. Click **End My Day** to close out the session.

- [ ] **Step 11: Manual browser verification — the realistic repros (secondary)**

Revert the `timeout: 1` from Step 10 first (back to `{ enableHighAccuracy: false }` in both places), then, still with Sensors set to the Vail override:

1. Start a session, expand the sheet, and toggle sharing **on**. This time it should stay on — no error message, knob stays right. Leave it on for 35 seconds and confirm it is still on after the first 30s interval tick (the happy path still works).
2. With sharing on, switch the Sensors **Location** dropdown to **"Location unavailable"**.
3. Within 30 seconds, the toggle snaps off and the red sub-label appears. (The GPS tracker's own watch will also error here and flip `tracker.status` to `"error"`, which disables the toggle — that part is pre-existing. The **red message** is the part that is new; without this task's change you would get a silently reverted toggle and no explanation at all.)
4. To get back to a working state, tap **End My Day**, set Sensors **Location** back to **Other… / Vail**, and start a session again.
5. Finally, check the untouched pre-existing path: with Sensors set to **"Location unavailable"** *from the start*, reload, start a session, and expand the sheet. Expected, unchanged from before this task: the GPS dot is red and pulsing, the sub-label reads "GPS tracking requires location permission", and the toggle is dimmed and unclickable. Confirm you did **not** break this.

- [ ] **Step 12: Confirm the temporary timeout is gone and the diff is clean**

Grep `src/components/ActiveSessionBar.jsx` for `timeout: 1` — it must print nothing. Then read `git diff src/components/ActiveSessionBar.jsx` in full and check `git status` for untracked files. The diff must contain only: the `shareError` state, `let cancelled = false`, `handlePositionError`, the two `handlePositionError` wirings, the new cleanup closure, `shareSubLabel`, the sub-label `<div>` rewrite, and the `setShareError(null)` in the toggle's `onClick`. Re-run `npm run lint`, `npm test`, and `npm run build` one last time and confirm all three still match the Task 1 Step 0 baseline.

- [ ] **Step 13: Commit**

```bash
git add src/components/ActiveSessionBar.jsx
git commit -m "$(cat <<'EOF'
fix: revert the share-location toggle when a GPS fix fails

The position request's error callback was a no-op, so a denied,
unavailable, or timed-out fix left sharingLocation true and the toggle
showing "on" while nothing was ever broadcast. Flip the toggle back and
surface the reason in the toggle's existing sub-label, in red. Turning
sharing off tears down the 30s interval via the effect cleanup, so this
reports once per toggle-on attempt instead of on every failed tick, and a
`cancelled` flag drops callbacks that land after teardown.
EOF
)"
```

---

## Post-plan note

Three tasks, in this order for a reason: Tasks 1 and 2 edit the same eight lines of `PowderMap.jsx`, so the behavior fix lands first and the purely visual change second, keeping either one revertable on its own. Task 3 is a different file and could have gone anywhere; it is last so the two map commits stay adjacent in history.

Deliberately **not** in this plan, per the spec's "Out of scope":

- clustering nearby friend pins,
- any further work on the resort bubbles or the "Top of the List" sheet,
- changes to `SkierRow` or the resort popup's friends list,
- any change at all to `src/lib/useLiveFriendLocations.js` (audited, no bugs found — the 90s staleness timeout, the 15s sweep, and the `private: true` channel wiring are all correct as written),
- retinting the friend popup's amber interior,
- a real multi-device field test, which is deferred to the season.

Also deliberately not here: a whole-branch review task and a merge/push task. The controlling session runs those separately, via `superpowers:requesting-code-review` and `superpowers:finishing-a-development-branch`, after Task 3's commit.
