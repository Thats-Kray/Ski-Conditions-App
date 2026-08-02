# Sprint 19 — Season Milestone Notifications

**Goal:** ROADMAP TASK 5.2 — celebrate newly-crossed season milestones (10 days, 25 days, first powder day, 50k/100k vertical, 100 runs, 5 resorts) with a one-time modal that can share to the existing season share card.
**Estimated effort:** 1 day
**Depends on:** Sprint 14 (Season Passport upgrade) merged — milestones read `stats.totalRuns`, which sprint-14 adds to `computeStats()`'s return shape. Sprint 8 (UI component library) merged, for `Card`/`Button`.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**`localStorage` convention already used elsewhere in this codebase** (match this, don't invent a new pattern): all reads/writes wrapped in `try { } catch { }`, keys as flat string constants (e.g. `"pd_offseason_banner_26"`). This sprint follows the same `try/catch`-wrapped style with a `pd_milestones_shown_<startYear>` key per season.

**Deviation from ROADMAP's literal wording, explained:** ROADMAP says to store a single `last_milestone_shown` value. That under-specifies the real requirement ("if a milestone is newly crossed, show a modal") — a user could cross multiple thresholds between two app loads (e.g. a multi-day trip that pushes them past both "10 days" and "first powder day" at once), and a single last-shown pointer can't represent "show me both, once each." This plan instead stores a **JSON array of already-shown milestone IDs, scoped per season** (`pd_milestones_shown_${startYear}`), and queues any newly-crossed-but-not-yet-shown milestones to celebrate one at a time. Functionally this satisfies the same goal (never show the same milestone twice) while handling the multi-milestone-at-once case correctly.

**`computeStats(sessions)`** (`src/components/ProfilePage.jsx`, extended in sprint-14) returns `{ days, vertical, miles, powderDays, resorts, topResort, totalRuns, topSpeed, timeOnMountain }` — this sprint's milestone checks read `days`, `powderDays`, `vertical`, `totalRuns`, `resorts` from this object.

**Existing "Share Season" flow** (`ProfilePage.jsx`, unchanged by this sprint) — `showShare` state + `<ShareStatCard profile={...} stats={seasonStats} season={season} onClose={...} />`. This sprint's milestone modal's Share button reuses this exact existing season-mode share card (not a new milestone-specific canvas mode) — a milestone is fundamentally about season stats, so sharing the season card is the correct reuse, not a new rendering path.

---

## Tasks

S19-T1 (milestone definitions + localStorage helpers) has no dependency. S19-T2 (detection + queue wiring) depends on S19-T1. S19-T3 (`MilestoneModal` UI) depends on S19-T2.

---

### S19-T1 — Milestone definitions + localStorage helpers

**File to modify:** `src/components/ProfilePage.jsx` (add near the top, module-level, alongside other local constants/helpers like `computeStats`)

```js
const MILESTONES = [
  { id: "days_10",      check: (s) => s.days >= 10,      label: "10 Days on the Mountain", icon: "🎿" },
  { id: "days_25",      check: (s) => s.days >= 25,      label: "25 Days on the Mountain", icon: "🏔️" },
  { id: "first_powder", check: (s) => s.powderDays >= 1, label: "First Powder Day",         icon: "❄️" },
  { id: "vertical_50k", check: (s) => s.vertical >= 50000,  label: "50,000 ft Vertical",    icon: "⬇️" },
  { id: "vertical_100k",check: (s) => s.vertical >= 100000, label: "100,000 ft Vertical",   icon: "🚀" },
  { id: "runs_100",     check: (s) => s.totalRuns >= 100, label: "100 Runs",                icon: "💯" },
  { id: "resorts_5",    check: (s) => s.resorts >= 5,     label: "5 Resorts Visited",        icon: "🗺️" },
]

function getShownMilestones(startYear) {
  try {
    const raw = localStorage.getItem(`pd_milestones_shown_${startYear}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function markMilestoneShown(startYear, id) {
  try {
    const shown = getShownMilestones(startYear)
    if (!shown.includes(id)) {
      localStorage.setItem(`pd_milestones_shown_${startYear}`, JSON.stringify([...shown, id]))
    }
  } catch {
    // private browsing / storage disabled — fail silently, matching existing convention
  }
}
```

**Acceptance criteria:**
- `MILESTONES` has exactly the 7 thresholds from ROADMAP TASK 5.2.
- `getShownMilestones(startYear)` returns `[]` if nothing stored or storage is unavailable — never throws.
- `markMilestoneShown` is idempotent (calling it twice with the same id doesn't duplicate the array entry).

---

### S19-T2 — Detect newly-crossed milestones and queue them on Profile load

**File to modify:** `src/components/ProfilePage.jsx`

In the same load function where `currentStats` is computed (from sprint-14's `computeStats(currentSessions)`), add:
```js
const [milestoneQueue, setMilestoneQueue] = useState([])

// after currentStats is computed, in the same load effect:
const shownIds = getShownMilestones(startYear)
const newlyCrossed = MILESTONES.filter((m) => m.check(currentStats) && !shownIds.includes(m.id))
if (newlyCrossed.length) setMilestoneQueue(newlyCrossed)
```

Add a dismiss handler that marks the current front-of-queue milestone as shown and advances:
```js
function dismissMilestone() {
  const current = milestoneQueue[0]
  if (current) markMilestoneShown(startYear, current.id)
  setMilestoneQueue((q) => q.slice(1))
}
```

**Acceptance criteria:**
- A user crossing exactly one new threshold since their last visit gets exactly one milestone queued.
- A user crossing multiple thresholds at once (e.g. a session that pushes both `days_10` and `first_powder` over their line simultaneously) gets both queued, shown one at a time.
- A user with no newly-crossed thresholds gets an empty queue — no modal appears.
- Milestones already in `getShownMilestones(startYear)` are never re-queued, even if still "crossed" on every subsequent load.

---

### S19-T3 — `MilestoneModal` UI

**File to modify:** `src/components/ProfilePage.jsx` (add as a local component; this sprint does not create a separate file since it's small and tightly coupled to this page's state)

```jsx
import Card from "./ui/Card"
import Button from "./ui/Button"

function MilestoneModal({ milestone, onShare, onClose }) {
  if (!milestone) return null
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 700 }}>
      <Card style={{ textAlign: "center", padding: 32, maxWidth: 340 }}>
        <div style={{ fontSize: 48 }}>{milestone.icon}</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginTop: 12 }}>{milestone.label}</div>
        <div style={{ fontSize: 14, color: "var(--color-text-2)", marginTop: 6 }}>Milestone unlocked! 🎉</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
          <Button onClick={onShare}>Share</Button>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </Card>
    </div>
  )
}
```

Render it near the existing `ShareStatCard` render site:
```jsx
{milestoneQueue[0] && (
  <MilestoneModal
    milestone={milestoneQueue[0]}
    onShare={() => { setShowShare(true); dismissMilestone() }}
    onClose={dismissMilestone}
  />
)}
```
Clicking "Share" both opens the existing season `ShareStatCard` AND dismisses/advances the milestone queue in the same action (so if there's a second queued milestone, it appears after the share card is closed, not stacked underneath it).

**Acceptance criteria:**
- The modal shows the milestone's icon, label, and a celebratory message.
- "Share" opens the existing season-mode `ShareStatCard` and dismisses the current milestone from the queue.
- "Close" dismisses without opening the share card.
- If a second milestone is queued, it appears after the first is dismissed (whether via Share or Close), not simultaneously.

**Verify in browser:**
```bash
npm run dev
```
Since real milestone crossings require real season data, the easiest verification is temporarily lowering a threshold (e.g. `days >= 10` → `days >= 1`) locally to trigger the modal with test data, confirm the flow, then revert the temporary threshold change before committing.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add src/components/ProfilePage.jsx
git commit -m "feat: add season milestone celebration modal"
```

---

## Sprint Acceptance Criteria

- [ ] 7 milestone thresholds defined matching ROADMAP TASK 5.2
- [ ] Newly-crossed milestones (not previously shown this season) are detected on Profile load and queued
- [ ] `MilestoneModal` celebrates one milestone at a time, with working Share (→ existing season `ShareStatCard`) and Close actions
- [ ] Milestones are never re-shown once dismissed, tracked per-season in `localStorage`
- [ ] `npm run build` succeeds
- [ ] Verified in browser via a temporarily-lowered threshold, then reverted

## Out of Scope for This Sprint

- A dedicated "Achievements" gallery page showing all milestones (crossed or not) — this sprint only handles the celebratory pop-up moment.
- Milestone-specific share card art (reuses the existing season card, as documented above).
- Cross-season milestone tracking (e.g. "3 seasons with 10+ days") — thresholds are evaluated against the current season's `computeStats()` only.
</content>
