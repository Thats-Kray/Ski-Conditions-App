# Today Tab Friends Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Friends" section to the bottom of the Today tab that shows live friend status (planning/driving/arrived) and the recent activity feed, by reusing two already-shipped components unchanged.

**Architecture:** Pure composition in `src/components/TodayScreen.jsx` — import `TodaysCrew` (already live on the Track tab) and `ActivityFeed` (already live on the Crew tab's Feed sub-tab), and render them, unmodified, in a new section placed after both of `TodayScreen`'s existing List/Map sub-tab branches so it appears below whichever is active. No new components, no new lib functions, no data-layer changes.

**Tech Stack:** React (function components, inline styles, no CSS modules for this file), no new dependencies.

## Global Constraints

- No changes to `TodaysCrew.jsx` or `ActivityFeed.jsx` — both are reused exactly as they exist today (per spec: `docs/superpowers/specs/2026-08-31-today-friends-feed-design.md`).
- Crew tab's Feed sub-tab and Track tab's `TodaysCrew` placement are not removed or altered — this is additive only.
- No new `src/lib` code, so no new `node --test` coverage is expected or required.
- Section header styling must match the existing "X More Resorts" header pattern in this same file (`fontSize 11, fontWeight 800, uppercase, letterSpacing 0.8, color rgba(255,255,255,0.5)`).
- Baseline measured on `main` at plan-writing time: `npm test` → 145 passing, 0 failing. `npm run lint` → 96 problems (88 errors, 8 warnings). Per project convention, re-verify this baseline at execution time rather than trusting this number — the main checkout has historically shown drift vs. a fresh worktree/checkout (see `docs/superpowers/plans/` history / project memory). If the number you measure differs, use your own fresh measurement as the "before" baseline for comparison, not this one.

---

### Task 1: Add the Friends section to the Today tab

**Files:**
- Modify: `src/components/TodayScreen.jsx` (imports at top; new JSX section inserted after line 726, before line 728)

**Interfaces:**
- Consumes: `TodaysCrew` (default export, no props) from `src/components/TodaysCrew.jsx`; `ActivityFeed` (default export, no props) from `src/components/ActivityFeed.jsx`. Both are already fully self-contained (own data fetching, own loading/empty/signed-out states) — verify this by reading both files before starting, but do not modify either.
- Produces: nothing consumed by other tasks — this is the only task in this plan.

This is a single, small, purely additive change with no new logic to unit test, so this task is verified by lint, build, and a manual browser click-through rather than TDD steps.

- [ ] **Step 1: Read both reused components to confirm they take no required props**

Read `src/components/TodaysCrew.jsx` and `src/components/ActivityFeed.jsx` in full. Confirm both export a default function component that takes no props (as of this plan, both are `export default function TodaysCrew()` and `export default function ActivityFeed()` — zero-arg). If either has since gained a required prop, note it and adjust Step 3 below to pass it; otherwise proceed with zero-prop usage exactly as written below.

- [ ] **Step 2: Add the two imports**

In `src/components/TodayScreen.jsx`, the top of the file currently reads:

```javascript
import { useEffect, useState } from "react"
import PowderMap from "./PowderMap"
import Badge, { TIER_COLORS } from "./ui/Badge"
import ScoreRing from "./ui/ScoreRing"
import FriendsGoingBadge from "./FriendsGoingBadge"
import BestBetCard from "./BestBetCard"
import ResortListRow from "./ResortListRow"
import PlanEditorModal from "./PlanEditorModal"
import { planButtonState } from "../lib/planUpsert"
import { localDateKey } from "../lib/calendarDates"
import { useIsStandalone } from "../lib/useMobile"
import { mapsUrl } from "../lib/resorts"
```

Add two new imports directly after the `PlanEditorModal` import line, so the component-import block reads:

```javascript
import { useEffect, useState } from "react"
import PowderMap from "./PowderMap"
import Badge, { TIER_COLORS } from "./ui/Badge"
import ScoreRing from "./ui/ScoreRing"
import FriendsGoingBadge from "./FriendsGoingBadge"
import BestBetCard from "./BestBetCard"
import ResortListRow from "./ResortListRow"
import PlanEditorModal from "./PlanEditorModal"
import TodaysCrew from "./TodaysCrew"
import ActivityFeed from "./ActivityFeed"
import { planButtonState } from "../lib/planUpsert"
import { localDateKey } from "../lib/calendarDates"
import { useIsStandalone } from "../lib/useMobile"
import { mapsUrl } from "../lib/resorts"
```

- [ ] **Step 3: Insert the Friends section JSX**

In `src/components/TodayScreen.jsx`, find this exact block (the end of the `conditionsSubTab === "conditions"` branch, immediately followed by the `skiHereModalResortKey` modal):

```javascript
          })()}
        </>
      )}

      {skiHereModalResortKey && (
```

Replace it with (inserting the new section between the closing `)}` of the conditions branch and the modal):

```javascript
          })()}
        </>
      )}

      <div style={{ marginTop: 28 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.8,
            color: "rgba(255,255,255,0.5)",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Friends
        </div>
        <TodaysCrew />

        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.8,
            color: "rgba(255,255,255,0.5)",
            textTransform: "uppercase",
            marginTop: 20,
            marginBottom: 10,
          }}
        >
          Recent Activity
        </div>
        <ActivityFeed />
      </div>

      {skiHereModalResortKey && (
```

This places the new `<div>` block outside both the `map` and `conditions` sub-tab conditionals (so it always renders regardless of which sub-tab is active), and before the `skiHereModalResortKey` modal render (whose position in the tree doesn't matter since it's an overlay).

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: same problem count as your Step-0 baseline measurement (96, or whatever you measured fresh) — no new errors or warnings introduced by this change. If the count went up, read the new lint output and fix it (likely causes: unused import if Step 2 was mistyped, or a missing key/prop-types issue — there should be none here since both components are used exactly as their existing call sites use them).

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: 145 passing (or your fresh baseline count), 0 failing — unchanged, since no `src/lib` file was touched.

- [ ] **Step 6: Run a production build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 7: Manual browser verification**

Run: `npm run dev`, open the app, sign in.

Confirm all of the following:
- On the Today tab, List sub-tab: scroll down past the resort list. The "Friends" label, `TodaysCrew`'s content (or its own loading/empty state), the "Recent Activity" label, and `ActivityFeed`'s content (or its own loading/empty state) all render, in that order.
- Switch to the Map sub-tab: scroll down past the map. The same Friends section renders below it, in the same order.
- If you have an active plan for today, the "Driving" and "Arrived" buttons inside `TodaysCrew` on the Today tab work exactly as they do on the Track tab (clicking them updates status and the plan re-renders with the new status).
- Visit the Track tab and the Crew tab's Feed sub-tab and confirm they are unchanged — `TodaysCrew` and `ActivityFeed` still render there exactly as before.

If anything above fails or renders unexpectedly, fix it before proceeding to commit — do not commit with a known-broken manual verification.

- [ ] **Step 8: Commit**

```bash
git add src/components/TodayScreen.jsx
git commit -m "$(cat <<'EOF'
feat: add Friends section to Today tab

Reuses the existing TodaysCrew (live plan status) and ActivityFeed
(recent activity) components, unchanged, below the Today tab's
List/Map content so friends' plans and activity are visible without
switching tabs.
EOF
)"
```

---

## Post-plan note

This plan is a single task because the change is a small, self-contained composition with no new logic. Do not add speculative extra tasks (e.g. a "unified feed" merge, new action buttons, or removing the Crew/Track placements) — those were explicitly scoped out in the design doc.
