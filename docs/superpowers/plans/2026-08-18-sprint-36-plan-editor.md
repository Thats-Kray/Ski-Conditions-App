# Ski Plan Editor Implementation Plan (Sprint 36)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-08-18-plan-editor-design.md` — read it first. Section
references below (§3.3, decision #5) point into it.

**Goal:** Make recording a ski plan obvious and complete — a modal you can't miss, an optional
ETA snapped to quarter hours, an "Open — no preference" option, and a join button that says
what it will actually do.

**Architecture:** Two new pure functions and one new modal component. Everything else is
threading props through components that already exist. No migration, no schema change, no
change to `upsertDailyPlan` or `joinPlanAtResort` — the write path was verified in Sprint 35
and must not move.

**Tech Stack:** React 19 (no router), Supabase JS v2, Vite, inline `style={{}}` objects,
`node --test` (built into Node — **not** a new dependency).

## Global Constraints

Every task's requirements implicitly include this section.

- **No new npm dependencies.** `npm test` runs `node --test src/lib/*.test.js`. Only pure
  `src/lib/` modules are testable — there is no React component harness and adding one is
  forbidden.
- **`npm test` currently passes 39 tests.** Tasks that add tests raise that number; no task
  may lower it.
- **`npm run lint` baseline is 91 problems (82 errors, 9 warnings).** Diff against that
  number, never against zero. Do not fix unrelated lint errors.
- **`npm run build` must succeed.**
- **Inline `style={{}}` objects only** — no CSS modules, no Tailwind, no new `.css` files, no
  `className` used for styling.
- **Colors via `var(--color-*)` tokens**, except where a value feeds a hex-alpha template
  literal (`` `${c}22` ``), which must stay a literal hex. Never concatenate a `var()` string
  with an alpha suffix.
- **Never `select("*")` on `profiles`** — a migration revoked table-level SELECT.
- **Date keys are built from local date parts, never `toISOString()`.**
- **`upsertDailyPlan` writes the whole row**; every omitted field becomes `null`. Any save
  path must carry `status`, `arrived_at` and `note` forward.
- **Branch from `main`. Commit after every task.**

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/format.js` | *modify* — add `snapToQuarterHour(hhmm)` |
| `src/lib/format.test.js` | *modify* — tests for the above |
| `src/lib/resorts.js` | *modify* — `OPEN_RESORT_KEY`, `OPEN_RESORT_LABEL`, sentinel handling inside `resortName`/`resortEmoji` |
| `src/lib/resorts.test.js` | *new* — tests for sentinel handling and picker purity |
| `src/lib/calendarGrouping.js` | *modify* — pin the Open group last within each day |
| `src/lib/calendarGrouping.test.js` | *modify* — tests for the pinning rule |
| `src/components/PlanEditorModal.jsx` | *new* — the editor of spec §3.1 |
| `src/components/SkiPlansTab.jsx` | *modify* — tap a day opens the modal; delete the inline editor |
| `src/components/TodaysCrew.jsx` | *modify* — delete the duplicated resort-name map |
| `src/components/calendar/DayPlanCard.jsx` | *modify* — switch label, "N free", `Add ETA` |
| `src/components/calendar/WeekView.jsx` | *modify* — thread two new props through `renderCard` |
| `src/components/FriendsCalendar.jsx` | *modify* — own the modal, supply your plan per date |

---

## Task 1: `snapToQuarterHour`

**Files:**
- Modify: `src/lib/format.js`
- Modify: `src/lib/format.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `snapToQuarterHour(hhmm: string|null) -> string|null` — rounds an `"HH:MM"`
  string to the nearest quarter hour, returns `null` for null/unparseable input.

**Why this exists.** Kyle asked for 15-minute increments. `<input type="time" step="900">`
gives the stepper on desktop, but **iOS Safari's time wheel ignores `step`**, so a phone can
still submit `08:07`. This function is the actual guarantee, applied on save.

Rounding boundaries, from spec §3.2: `:00-:07`→`:00`, `:08-:22`→`:15`, `:23-:37`→`:30`,
`:38-:52`→`:45`, `:53-:59`→ next hour at `:00`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/format.test.js`:

```js
import { snapToQuarterHour } from "./format.js"

test("snapToQuarterHour leaves an exact quarter hour alone", () => {
  assert.equal(snapToQuarterHour("08:00"), "08:00")
  assert.equal(snapToQuarterHour("08:15"), "08:15")
  assert.equal(snapToQuarterHour("08:30"), "08:30")
  assert.equal(snapToQuarterHour("08:45"), "08:45")
})

test("snapToQuarterHour rounds to the nearest quarter at every boundary", () => {
  assert.equal(snapToQuarterHour("08:07"), "08:00")
  assert.equal(snapToQuarterHour("08:08"), "08:15")
  assert.equal(snapToQuarterHour("08:22"), "08:15")
  assert.equal(snapToQuarterHour("08:23"), "08:30")
  assert.equal(snapToQuarterHour("08:37"), "08:30")
  assert.equal(snapToQuarterHour("08:38"), "08:45")
  assert.equal(snapToQuarterHour("08:52"), "08:45")
})

test("snapToQuarterHour carries into the next hour past :52", () => {
  assert.equal(snapToQuarterHour("08:53"), "09:00")
  assert.equal(snapToQuarterHour("08:59"), "09:00")
})

test("snapToQuarterHour wraps midnight rather than producing hour 24", () => {
  assert.equal(snapToQuarterHour("23:53"), "00:00")
})

test("snapToQuarterHour zero-pads a single-digit hour", () => {
  assert.equal(snapToQuarterHour("9:07"), "09:00")
})

test("snapToQuarterHour returns null for empty or unparseable input", () => {
  assert.equal(snapToQuarterHour(null), null)
  assert.equal(snapToQuarterHour(undefined), null)
  assert.equal(snapToQuarterHour(""), null)
  assert.equal(snapToQuarterHour("not a time"), null)
  assert.equal(snapToQuarterHour("25:00"), null)
  assert.equal(snapToQuarterHour("08:99"), null)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `does not provide an export named 'snapToQuarterHour'`

- [ ] **Step 3: Implement**

Append to `src/lib/format.js`:

```js
/**
 * Rounds an "HH:MM" string to the nearest quarter hour.
 *
 * `<input type="time" step="900">` gives a 15-minute stepper on desktop, but iOS
 * Safari's time wheel ignores `step` — so a phone can still hand us "08:07". This
 * is the actual guarantee, applied on save rather than trusted from the input.
 *
 * Returns null for null/unparseable input so clearing an ETA stays possible.
 */
export function snapToQuarterHour(hhmm) {
  if (!hhmm) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim())
  if (!m) return null

  let hour = Number(m[1])
  const minute = Number(m[2])
  if (hour > 23 || minute > 59) return null

  let snapped = Math.round(minute / 15) * 15
  if (snapped === 60) {
    snapped = 0
    hour = (hour + 1) % 24     // 23:53 becomes 00:00, never hour 24
  }
  return `${String(hour).padStart(2, "0")}:${String(snapped).padStart(2, "0")}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 45 tests total (39 existing + 6 here).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: 91 problems.

- [ ] **Step 6: Commit**

```bash
git add src/lib/format.js src/lib/format.test.js
git commit -m "feat: add snapToQuarterHour for 15-minute ETA increments"
```

---

## Task 2: The "Open" sentinel

**Files:**
- Modify: `src/lib/resorts.js`
- Create: `src/lib/resorts.test.js`
- Modify: `src/components/TodaysCrew.jsx` (delete `prettifyResortKey`, ~line 40)

**Interfaces:**
- Consumes: nothing
- Produces: `OPEN_RESORT_KEY = "open"`, `OPEN_RESORT_LABEL = "Open — no preference"`, and
  `resortName`/`resortEmoji` returning those for the sentinel. Signatures unchanged.

**The critical constraint — read this before touching the file.** `open` must **NOT** be
added to `RESORT_NAMES` or `RESORT_EMOJI`. `Object.keys(RESORT_NAMES)` builds the resort
dropdowns at `MountainBoard.jsx:164`, `PostSkiBuddyForm.jsx:117` and `SkiBuddyBoard.jsx:293`
— adding the sentinel there would offer "Open — no preference" as a selectable mountain when
posting to the Community board. The sentinel is handled **inside the helpers, ahead of the
map lookup**, so display gets the label and every picker stays clean.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/resorts.test.js`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import {
  OPEN_RESORT_KEY, OPEN_RESORT_LABEL,
  RESORT_NAMES, RESORT_EMOJI,
  resortName, resortEmoji, normalizeResortKey,
} from "./resorts.js"

test("the open sentinel resolves to a friendly label", () => {
  assert.equal(OPEN_RESORT_KEY, "open")
  assert.equal(resortName(OPEN_RESORT_KEY), OPEN_RESORT_LABEL)
})

test("the open sentinel has its own emoji, not the generic fallback", () => {
  assert.notEqual(resortEmoji(OPEN_RESORT_KEY), "⛷️")
  assert.equal(typeof resortEmoji(OPEN_RESORT_KEY), "string")
})

test("the sentinel survives normalizeResortKey untouched", () => {
  assert.equal(normalizeResortKey("open"), OPEN_RESORT_KEY)
  assert.equal(normalizeResortKey(" Open "), OPEN_RESORT_KEY)
  assert.equal(resortName("Open"), OPEN_RESORT_LABEL)
})

test("the sentinel is NOT in the resort maps that build pickers", () => {
  // Object.keys(RESORT_NAMES) populates the mountain dropdowns in MountainBoard,
  // PostSkiBuddyForm and SkiBuddyBoard. "Open" is not a mountain and must never
  // appear in them.
  assert.equal(RESORT_NAMES[OPEN_RESORT_KEY], undefined)
  assert.equal(RESORT_EMOJI[OPEN_RESORT_KEY], undefined)
  assert.ok(!Object.keys(RESORT_NAMES).includes(OPEN_RESORT_KEY))
})

test("real resorts are unaffected", () => {
  assert.equal(resortName("vail"), "Vail")
  assert.equal(resortName("Beaver Creek"), "Beaver Creek")
  assert.equal(resortName("coppermountain"), "Copper Mountain")
})

test("an unknown key still falls back to the raw string", () => {
  assert.equal(resortName("madeupmountain"), "madeupmountain")
  assert.equal(resortEmoji("madeupmountain"), "⛷️")
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `does not provide an export named 'OPEN_RESORT_KEY'`

- [ ] **Step 3: Implement the sentinel**

In `src/lib/resorts.js`, add these exports above `normalizeResortKey`:

```js
/**
 * "I'm skiing that day, I don't care where." daily_plans.resort_key is NOT NULL,
 * so this is a real sentinel value rather than an absent one.
 *
 * Deliberately NOT a member of RESORT_NAMES/RESORT_EMOJI: Object.keys(RESORT_NAMES)
 * builds the mountain dropdowns in MountainBoard, PostSkiBuddyForm and SkiBuddyBoard,
 * and "Open" is not a mountain you can post a buddy request for. The helpers below
 * special-case it so display works everywhere without polluting those pickers.
 */
export const OPEN_RESORT_KEY = "open"
export const OPEN_RESORT_LABEL = "Open — no preference"
export const OPEN_RESORT_EMOJI = "✳️"
```

Then replace `resortName` and `resortEmoji` with:

```js
export function resortName(key) {
  if (!key) return ""
  const k = normalizeResortKey(key)
  if (k === OPEN_RESORT_KEY) return OPEN_RESORT_LABEL
  return RESORT_NAMES[k] || key
}

export function resortEmoji(key) {
  if (!key) return "⛷️"
  const k = normalizeResortKey(key)
  if (k === OPEN_RESORT_KEY) return OPEN_RESORT_EMOJI
  return RESORT_EMOJI[k] || "⛷️"
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 51 tests total (45 + 6 here).

- [ ] **Step 5: Retire the duplicated map in `TodaysCrew`**

`src/components/TodaysCrew.jsx` carries `prettifyResortKey` (~line 40) — a local hardcoded
copy of `RESORT_NAMES` that predates this sprint and is the one display path that would show
a raw `open`. Delete the whole function and its map, add `resortName` to the existing import
from `../lib/resorts`, and change its single call site (~line 323) from
`prettifyResortKey(plan.resort_key)` to `resortName(plan.resort_key)`.

`resortName` returns `""` for a falsy key where `prettifyResortKey` returned
`"Unknown resort"`. Check the call site: if a plan with no resort could render there, keep the
old copy by writing `resortName(plan.resort_key) || "Unknown resort"`. `resort_key` is
`NOT NULL` in the schema, so this is belt-and-braces, not a live case.

- [ ] **Step 6: Verify no other consumer broke**

Run: `grep -rn "prettifyResortKey" src`
Expected: no output — the function and its call site are both gone.

Run: `npm run lint`
Expected: 91 problems.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/resorts.js src/lib/resorts.test.js src/components/TodaysCrew.jsx
git commit -m "feat: add the Open resort sentinel; retire TodaysCrew's duplicated name map"
```

---

## Task 3: Pin the Open group last

**Files:**
- Modify: `src/lib/calendarGrouping.js` (the `groups.sort` at ~line 95)
- Modify: `src/lib/calendarGrouping.test.js`

**Interfaces:**
- Consumes: `OPEN_RESORT_KEY` from `src/lib/resorts.js` (Task 2)
- Produces: no signature change. `groupByDayAndMountain` output is unchanged except that a
  group whose `resortKey` is the sentinel sorts after every real mountain in its day.

**Why (spec decision #5).** Mountain cards sort by headcount because the top card answers
"where should we go". Open is not a destination — it is available people. Four open users
outranking three at Copper would make the layout lie in the one place it must not.

`bucket()` already runs `normalizeResortKey`, so the sentinel arrives as `"open"` and needs
no special handling on the way in — only on the way out.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/calendarGrouping.test.js`:

```js
test("the Open group sorts last even when it has the most people", () => {
  const out = groupByDayAndMountain({
    plans: [
      p("u1", "2026-08-22", "open", "Amy"),
      p("u2", "2026-08-22", "open", "Ben"),
      p("u3", "2026-08-22", "open", "Cal"),
      p("u4", "2026-08-22", "open", "Dee"),
      p("u5", "2026-08-22", "coppermountain", "Eve"),
    ],
    trips: [], currentUserId: "me",
  })
  const groups = out.get("2026-08-22")
  assert.deepEqual(groups.map((g) => g.resortKey), ["coppermountain", "open"])
  assert.equal(groups[1].attendees.length, 4, "Open still holds everyone, it just sorts last")
})

test("Open sorts last against several mountains, which keep their headcount order", () => {
  const out = groupByDayAndMountain({
    plans: [
      p("u1", "2026-08-22", "open", "Amy"),
      p("u2", "2026-08-22", "vail", "Ben"),
      p("u3", "2026-08-22", "coppermountain", "Cal"),
      p("u4", "2026-08-22", "coppermountain", "Dee"),
    ],
    trips: [], currentUserId: "me",
  })
  assert.deepEqual(
    out.get("2026-08-22").map((g) => g.resortKey),
    ["coppermountain", "vail", "open"]
  )
})

test("a day of only Open still returns the group", () => {
  const out = groupByDayAndMountain({
    plans: [p("u1", "2026-08-22", "open", "Amy")],
    trips: [], currentUserId: "me",
  })
  assert.deepEqual(out.get("2026-08-22").map((g) => g.resortKey), ["open"])
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — the first test reports `["open", "coppermountain"]`, because Open currently
wins on headcount.

- [ ] **Step 3: Implement**

Add the import at the top of `src/lib/calendarGrouping.js`:

```js
import { normalizeResortKey, OPEN_RESORT_KEY } from "./resorts"
```

(The file already imports `normalizeResortKey` — extend that import rather than adding a
second one.)

Replace the sort with:

```js
    // Busiest mountain first — this is the single most important sort in the
    // feature, because it is literally the answer. Ties break on resortKey so the
    // order does not jitter between renders.
    //
    // "Open — no preference" is pinned below every real mountain regardless of its
    // headcount. The top card is supposed to answer "where should we go", and
    // available people are not a where (spec decision #5).
    groups.sort((a, b) => {
      const aOpen = a.resortKey === OPEN_RESORT_KEY
      const bOpen = b.resortKey === OPEN_RESORT_KEY
      if (aOpen !== bOpen) return aOpen ? 1 : -1
      return b.attendees.length - a.attendees.length || a.resortKey.localeCompare(b.resortKey)
    })
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 54 tests total (51 + 3 here). The pre-existing sort tests must still pass
untouched — if one now fails, the pinning branch is firing for a real mountain.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: 91 problems.

- [ ] **Step 6: Commit**

```bash
git add src/lib/calendarGrouping.js src/lib/calendarGrouping.test.js
git commit -m "feat: pin the Open group below every real mountain"
```

---

## Task 4: The plan editor modal

**Files:**
- Create: `src/components/PlanEditorModal.jsx`

**Interfaces:**
- Consumes: `snapToQuarterHour` (Task 1); `etaToTimeInput` from `src/lib/format`;
  `OPEN_RESORT_KEY`, `OPEN_RESORT_LABEL`, `OPEN_RESORT_EMOJI` (Task 2); `useMobile` (named
  export) from `src/lib/useMobile`; `formatDate` from `src/lib/format`
- Produces:

```jsx
<PlanEditorModal
  dateKey={string}                 // "YYYY-MM-DD"
  plan={Object|null}               // existing daily_plans row, or null for a new day
  resorts={[{ resortKey, name }]}  // real mountains only; the modal adds Open itself
  busy={boolean}
  error={string|null}
  onSave={({ resortKey, eta, visibility }) => void}   // eta is "HH:MM" or null
  onRemove={() => void}            // omit to hide the Remove button
  onClose={() => void}
/>
```

**The modal does not talk to Supabase.** It collects three values and hands them up. Both
call sites (Tasks 5 and 7) already own a save path, and duplicating write logic here would
be a third place to get `upsertDailyPlan`'s whole-row semantics wrong.

**Presets** are `First chair` 08:30, `9:00` 09:00, `10:00` 10:00, `Afternoon` 13:00 — all
already on quarter hours.

- [ ] **Step 1: Create the component**

Create `src/components/PlanEditorModal.jsx`:

```jsx
import { useState } from "react"
import { useMobile } from "../lib/useMobile"
import { formatDate, etaToTimeInput, snapToQuarterHour } from "../lib/format"
import { OPEN_RESORT_KEY, OPEN_RESORT_LABEL, OPEN_RESORT_EMOJI } from "../lib/resorts"

const PRESETS = [
  { label: "First chair", value: "08:30" },
  { label: "9:00",        value: "09:00" },
  { label: "10:00",       value: "10:00" },
  { label: "Afternoon",   value: "13:00" },
]

const fieldStyle = {
  width: "100%", background: "var(--color-surface)",
  border: "1px solid var(--color-border)", borderRadius: 10,
  padding: "11px 12px", color: "var(--color-text-1)", fontSize: 15,
  boxSizing: "border-box", outline: "none", colorScheme: "dark",
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, letterSpacing: 1,
      color: "var(--color-text-3)", textTransform: "uppercase",
    }}>
      {children}
    </div>
  )
}

/**
 * Make or edit one day's ski plan.
 *
 * Lives in a modal because the previous inline editor rendered below the calendar,
 * off the part of the screen the user was looking at, and went unnoticed.
 *
 * Bottom sheet on mobile, centered dialog on desktop — the same responsive shape
 * CalendarFilterSheet uses, so this codebase has one modal idiom rather than two.
 *
 * Collects values only; the caller owns the write. upsertDailyPlan writes the whole
 * row, and a second copy of that logic here would be a second place to get it wrong.
 */
export default function PlanEditorModal({
  dateKey, plan = null, resorts = [], busy = false, error = null,
  onSave, onRemove, onClose,
}) {
  const isMobile = useMobile()
  const [resortKey, setResortKey] = useState(plan?.resort_key || "")
  const [eta, setEta] = useState(() => etaToTimeInput(plan?.eta) || "")
  const [visibility, setVisibility] = useState(plan?.visibility || "friends")

  function handleSave() {
    if (!resortKey) return
    onSave?.({
      resortKey,
      // Snap on the way out: iOS Safari's time wheel ignores step="900", so the
      // raw input value cannot be trusted to sit on a quarter hour.
      eta: snapToQuarterHour(eta),
      visibility,
    })
  }

  const panel = (
    <div
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={`Ski plan for ${formatDate(dateKey)}`}
      style={{
        background: "var(--color-modal-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: isMobile ? "20px 20px 0 0" : 18,
        padding: "18px 20px 24px",
        width: isMobile ? "100%" : 380,
        maxHeight: "85vh", overflowY: "auto",
        display: "grid", gap: 14,
        boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: "var(--color-text-1)" }}>
          {formatDate(dateKey)}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "none", border: "none", color: "var(--color-text-3)",
            fontSize: 22, cursor: "pointer", minHeight: 44, minWidth: 44,
          }}
        >
          ×
        </button>
      </div>

      {/* Where */}
      <div style={{ display: "grid", gap: 6 }}>
        <SectionLabel>Where</SectionLabel>
        <select
          value={resortKey}
          onChange={(e) => setResortKey(e.target.value)}
          style={fieldStyle}
          disabled={busy}
          aria-label="Mountain"
        >
          <option value="">Pick a mountain…</option>
          {resorts.map((r) => (
            <option key={r.resortKey} value={r.resortKey}>{r.name}</option>
          ))}
          {/* Added here, not to RESORT_NAMES — that map builds the Community
              board's mountain pickers, where "Open" would be nonsense. */}
          <option value={OPEN_RESORT_KEY}>{OPEN_RESORT_EMOJI} {OPEN_RESORT_LABEL}</option>
        </select>
      </div>

      {/* When */}
      <div style={{ display: "grid", gap: 6 }}>
        <SectionLabel>When — optional</SectionLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => setEta(preset.value)}
              disabled={busy}
              style={{
                flex: "1 1 auto", borderRadius: 999, padding: "8px 12px", minHeight: 44,
                fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer",
                border: eta === preset.value
                  ? "1px solid var(--color-accent)"
                  : "1px solid var(--color-border)",
                background: eta === preset.value ? "var(--color-accent-dim)" : "transparent",
                color: eta === preset.value ? "var(--color-text-1)" : "var(--color-text-3)",
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="time"
            step="900"
            value={eta}
            onChange={(e) => setEta(e.target.value)}
            disabled={busy}
            aria-label="Arrival time"
            style={{ ...fieldStyle, flex: 1 }}
          />
          {eta && (
            <button
              onClick={() => setEta("")}
              disabled={busy}
              style={{
                background: "none", border: "1px solid var(--color-border)",
                borderRadius: 10, color: "var(--color-text-3)",
                padding: "0 14px", minHeight: 44, fontSize: 12,
                fontWeight: 700, cursor: busy ? "default" : "pointer",
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Who can see */}
      <div style={{ display: "grid", gap: 6 }}>
        <SectionLabel>Who can see</SectionLabel>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { key: "friends", label: "👥 Friends & Crews" },
            { key: "private", label: "🔒 Private" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setVisibility(key)}
              disabled={busy}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 999, fontSize: 12, fontWeight: 700,
                border: visibility === key
                  ? "1px solid var(--color-accent)"
                  : "1px solid var(--color-border)",
                background: visibility === key ? "var(--color-accent-dim)" : "transparent",
                color: visibility === key ? "var(--color-text-1)" : "var(--color-text-3)",
                cursor: busy ? "default" : "pointer", minHeight: 44,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: "var(--color-danger)" }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {plan && onRemove && (
          <button
            onClick={onRemove}
            disabled={busy}
            style={{
              padding: "12px 16px", borderRadius: 12,
              border: "1px solid var(--color-danger)", background: "var(--color-danger-bg)",
              color: "var(--color-danger)", fontWeight: 800, fontSize: 14,
              cursor: busy ? "default" : "pointer", minHeight: 44,
            }}
          >
            Remove day
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={busy || !resortKey}
          style={{
            flex: 1, padding: "12px 0", borderRadius: 12, border: "none",
            background: resortKey ? "var(--gradient-cta)" : "var(--color-surface)",
            color: "white", fontWeight: 800, fontSize: 14,
            cursor: busy || !resortKey ? "default" : "pointer",
            opacity: busy ? 0.6 : 1, minHeight: 44,
          }}
        >
          {busy ? "Saving…" : plan ? "Update plan" : "Save plan"}
        </button>
      </div>
    </div>
  )

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 20,
      }}
    >
      {panel}
    </div>
  )
}
```

- [ ] **Step 2: Lint and build**

Run: `npm run lint`
Expected: 91 problems.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/PlanEditorModal.jsx
git commit -m "feat: add the ski plan editor modal"
```

*(This component is first mounted in Task 5, which is where it gets browser verification. Do
not add a throwaway mount.)*

---

## Task 5: Mount the modal on Profile → Ski Plans

**Files:**
- Modify: `src/components/SkiPlansTab.jsx`

**Interfaces:**
- Consumes: `PlanEditorModal` (Task 4); `snapToQuarterHour` (Task 1)
- Produces: nothing new

Tapping a day on your own Ski Plans calendar opens the modal. The inline editor — the
`<select>`, the visibility pills, the Save/Remove row inside `renderDayDetail` — is deleted.

**What stays:** the read-only plan summary inside `renderDayDetail` (a friend's calendar has
no modal and still needs it), the past-day message, and `handleSave`/`handleRemove`'s
optimistic-update-and-rollback logic.

**What changes in `handleSave`:** it takes the modal's three values as an argument instead of
reading `draftResort`/`draftVisibility` state, and it now writes the ETA.

- [ ] **Step 1: Replace the draft state with modal state**

Delete `draftResort`, `setDraftResort`, `draftVisibility`, `setDraftVisibility` and the
`fieldStyle` constant. Add:

```jsx
  const [editorOpen, setEditorOpen] = useState(false)
```

- [ ] **Step 2: Open the modal from a day tap**

Replace `handleSelectDay` with:

```jsx
  function handleSelectDay(key) {
    setSelectedDate(key)
    setSaveError(null)
    // Past days and a friend's calendar stay read-only — the summary below the
    // grid is all there is to show.
    const isPastDay = key ? key < todayKey : false
    setEditorOpen(Boolean(key) && editable && !isPastDay)
  }
```

- [ ] **Step 3: Rewrite `handleSave` to take the modal's values**

```jsx
  async function handleSave({ resortKey, eta, visibility }) {
    if (!resortKey || !selectedDate) return
    setBusy(true); setSaveError(null)
    const previous = plans
    try {
      // upsertDailyPlan writes the whole row (onConflict user_id,ski_date), so
      // every field we omit is written as null. Carry the check-in fields forward
      // or editing a day you already checked into would wipe them.
      const saved = await upsertDailyPlan({
        ski_date: selectedDate,
        resort_key: resortKey,
        visibility,
        eta,                                   // already snapped by the modal
        status: selectedPlan?.status || "planned",
        note: selectedPlan?.note ?? null,
        arrived_at: selectedPlan?.arrived_at ?? null,
      })
      setPlans((prev) => [
        ...prev.filter((p) => (p.ski_date || "").slice(0, 10) !== selectedDate),
        saved,
      ])
      setEditorOpen(false)
    } catch (err) {
      setPlans(previous)
      setSaveError(err?.message || "Couldn't save that plan. Try again.")
    } finally {
      setBusy(false)
    }
  }
```

`handleRemove` keeps its body; add `setEditorOpen(false)` immediately after the successful
`await deleteDailyPlan(...)`, and delete its now-dangling `setDraftResort("")` line.

- [ ] **Step 4: Delete the inline editor and mount the modal**

In `renderDayDetail`, delete the entire `{canEdit && (<>…</>)}` block — the `<select>`, the
visibility pills, the `saveError` line and the Save/Remove row. Keep the plan summary, the
`No plans this day.` line and the past-day message.

Then, after the closing `/>` of `<PlanCalendar …>` and before the component's closing `</div>`:

```jsx
      {editorOpen && selectedDate && (
        <PlanEditorModal
          dateKey={selectedDate}
          plan={selectedPlan}
          resorts={resorts}
          busy={busy}
          error={saveError}
          onSave={handleSave}
          onRemove={selectedPlan ? handleRemove : undefined}
          onClose={() => setEditorOpen(false)}
        />
      )}
```

Add the import at the top:

```jsx
import PlanEditorModal from "./PlanEditorModal"
```

- [ ] **Step 5: Update the hint copy**

The line above the calendar reads "Tap a day to mark where you're skiing…". Change it to
mention the time, since that is now offered:

```jsx
          Tap a day to set where and when you&apos;re skiing. Friends and crewmates can see it;
          mark a day Private to hide it.
```

- [ ] **Step 6: Lint, build, and browser-verify**

Run: `npm run lint` → 91 problems. Run: `npm run build` → succeeds.

Then `npm run dev` and check:
1. Profile → 📅 Ski Plans → tap a future day → the modal opens **over** the calendar.
2. Save a mountain with no ETA → succeeds, day gets a dot.
3. Re-open that day → the modal shows the saved mountain.
4. Tap `First chair`, save, re-open → the time field shows `08:30`.
5. `Clear` then save → the ETA is gone, the plan remains.
6. `Remove day` → the plan is gone, the dot clears.
7. Tap a **past** day → no modal; the read-only summary and past-day message still render.
8. Open a **friend's** profile → Ski Plans → tap a day → no modal, summary inline as before.

- [ ] **Step 7: Commit**

```bash
git add src/components/SkiPlansTab.jsx
git commit -m "feat: open the plan editor in a modal instead of below the calendar"
```

---

## Task 6: Honest join/switch labeling on the mountain card

**Files:**
- Modify: `src/components/calendar/DayPlanCard.jsx`

**Interfaces:**
- Consumes: `OPEN_RESORT_KEY` (Task 2)
- Produces: `DayPlanCard` gains two optional props:
  - `myResortKey: string|null` — the `resort_key` you already have on this card's date, or
    `null` if you have no plan that day
  - `onEditPlan: () => void` — opens the editor for your own plan; when omitted the
    `Add ETA` button is not rendered

Existing props (`group`, `colorCtx`, `currentUserId`, `canJoin`, `joining`, `onJoin`,
`onOpenTrip`, `compact`) are unchanged.

**Label rules (spec §3.4):**

| Condition | Button |
|---|---|
| `alreadyIn` | `✓ You're in` plus `Add ETA` (when `onEditPlan` is supplied) |
| `myResortKey` is null/absent | `I'm in` |
| `myResortKey` is another resort | `Switch from <that resort's name>` |

**Also:** when this card is the Open group, the headcount reads `N free` rather than
`N going`.

- [ ] **Step 1: Add the props and the derived label**

Extend the signature:

```jsx
export default function DayPlanCard({
  group, colorCtx, currentUserId, canJoin = false, joining = false,
  onJoin, onOpenTrip, compact = false, myResortKey = null, onEditPlan,
}) {
```

Add the import:

```jsx
import { resortName, resortEmoji, OPEN_RESORT_KEY } from "../../lib/resorts"
```

After the existing `alreadyIn` line, add:

```jsx
  const isOpenGroup = resortKey === OPEN_RESORT_KEY
  // daily_plans is UNIQUE (user_id, ski_date), so joining a second mountain moves
  // the plan rather than adding one. The button has to say so before the tap, not
  // leave the user to discover it after.
  const switchingFrom = !alreadyIn && myResortKey && myResortKey !== resortKey
    ? resortName(myResortKey)
    : null
  const joinLabel = switchingFrom ? `Switch from ${switchingFrom}` : "I'm in"
```

- [ ] **Step 2: Use the label and the Open headcount**

Change the headcount line from `{attendees.length} going` to:

```jsx
          {attendees.length} {isOpenGroup ? "free" : "going"}
```

Change the join button's text from `{joining ? "Joining…" : "I'm in"}` to:

```jsx
          {joining ? "Saving…" : joinLabel}
```

- [ ] **Step 3: Add the `Add ETA` affordance**

Replace the existing `{alreadyIn && (…)}` block with:

```jsx
      {alreadyIn && (
        <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--color-success)" }}>
            ✓ You&apos;re in
          </span>
          {onEditPlan && !compact && (
            <button
              onClick={onEditPlan}
              style={{
                background: "transparent", border: "1px solid var(--color-border)",
                borderRadius: 10, padding: "8px 12px", minHeight: 44,
                fontSize: 12, fontWeight: 700, color: "var(--color-text-2)",
                cursor: "pointer",
              }}
            >
              Add ETA
            </button>
          )}
        </div>
      )}
```

`!compact` suppresses it inside the narrow desktop week column, where a second button will
not fit.

- [ ] **Step 4: Lint and build**

Run: `npm run lint` → 91 problems. Run: `npm run build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/calendar/DayPlanCard.jsx
git commit -m "feat: say Switch from X when joining would move an existing plan"
```

*(The new props have no supplier until Task 7, so the card still renders `I'm in` everywhere
right now. That is expected — both props are optional and default to the old behavior.)*

---

## Task 7: Wire the new props and the modal into the friends calendar

**Files:**
- Modify: `src/components/calendar/WeekView.jsx`
- Modify: `src/components/FriendsCalendar.jsx`

**Interfaces:**
- Consumes: `DayPlanCard`'s `myResortKey` and `onEditPlan` (Task 6); `PlanEditorModal`
  (Task 4); `snapToQuarterHour` (Task 1)
- Produces: `WeekView` gains two props, `myResortByDate: Map<string,string>` and
  `onEditPlan: (dateKey) => void`, both passed straight through to `renderCard`.

- [ ] **Step 1: Thread the props through `WeekView`**

Extend the signature:

```jsx
export default function WeekView({
  anchorDate, groupsByDay, colorCtx, currentUserId, todayKey,
  joiningKey, onJoin, onOpenTrip, myResortByDate, onEditPlan,
}) {
```

Inside `renderCard`, add two props to the `<DayPlanCard …>` element:

```jsx
    myResortKey={myResortByDate?.get(day.key) || null}
    onEditPlan={onEditPlan ? () => onEditPlan(day.key) : undefined}
```

`renderCard` is a single shared definition used by both orientation branches, so this is one
edit, not two.

- [ ] **Step 2: Build the date→resort map in `FriendsCalendar`**

Add after the existing `friendIds` memo:

```jsx
  // Your own plan per date, for the join button's Switch label and for opening the
  // editor on a day you already planned. Built from `plans`, which already covers
  // the visible range.
  const myResortByDate = useMemo(() => {
    const m = new Map()
    if (!currentUserId) return m
    for (const p of plans) {
      if (p.user_id !== currentUserId) continue
      const key = (p.ski_date || "").slice(0, 10)
      if (key) m.set(key, p.resort_key)
    }
    return m
  }, [plans, currentUserId])

  const myPlanByDate = useMemo(() => {
    const m = new Map()
    if (!currentUserId) return m
    for (const p of plans) {
      if (p.user_id !== currentUserId) continue
      const key = (p.ski_date || "").slice(0, 10)
      if (key) m.set(key, p)
    }
    return m
  }, [plans, currentUserId])
```

- [ ] **Step 3: Add editor state and its save path**

```jsx
  const [editorDate, setEditorDate] = useState(null)
  const [editorError, setEditorError] = useState(null)
  const [editorBusy, setEditorBusy] = useState(false)

  async function handleEditorSave({ resortKey, eta, visibility }) {
    if (!editorDate) return
    setEditorBusy(true); setEditorError(null)
    const existing = myPlanByDate.get(editorDate) || null
    try {
      // upsertDailyPlan writes the whole row, so status/note/arrived_at must be
      // carried forward or editing a day you already checked into would wipe them.
      await upsertDailyPlan({
        ski_date: editorDate,
        resort_key: resortKey,
        visibility,
        eta,                                   // already snapped by the modal
        status: existing?.status || "planned",
        note: existing?.note ?? null,
        arrived_at: existing?.arrived_at ?? null,
      })
      await loadPlans()
      setEditorDate(null)
    } catch (err) {
      console.error("[FriendsCalendar] plan save failed:", err)
      setEditorError(err?.message || "Couldn't save that plan.")
    } finally {
      setEditorBusy(false)
    }
  }
```

Extend the `socialApi` import to include `upsertDailyPlan`.

- [ ] **Step 4: Pass the props to both views and mount the modal**

On `<WeekView …>` add:

```jsx
            myResortByDate={myResortByDate}
            onEditPlan={(dateKey) => { setEditorError(null); setEditorDate(dateKey) }}
```

On the month branch's `<DayPlanCard …>` inside `renderDayDetail` add:

```jsx
                  myResortKey={myResortByDate.get(dateKey) || null}
                  onEditPlan={() => { setEditorError(null); setEditorDate(dateKey) }}
```

Then, just before the closing `</div>` of the component's return, beside the existing
`{sheetOpen && …}` block:

```jsx
      {editorDate && (
        <PlanEditorModal
          dateKey={editorDate}
          plan={myPlanByDate.get(editorDate) || null}
          resorts={resorts}
          busy={editorBusy}
          error={editorError}
          onSave={handleEditorSave}
          onClose={() => setEditorDate(null)}
        />
      )}
```

`onRemove` is deliberately omitted — deleting a plan belongs on Profile → Ski Plans, where
the day you are deleting is the one you are looking at.

Add the import:

```jsx
import PlanEditorModal from "./PlanEditorModal"
```

- [ ] **Step 5: Accept and forward `resorts`**

`FriendsCalendar` does not currently receive the resort list. Add `resorts = []` to its props
and pass it from `SkiPlansPage`, which already takes a `resorts` prop:

```jsx
          <FriendsCalendar
            currentUser={currentUser}
            trips={flatTrips}
            loading={loading}
            onOpenTrip={setStripTrip}
            onRequireLogin={onRequireLogin}
            onPlanADay={() => { setSubTab("trips"); handleCreateClick() }}
            resorts={resorts}
          />
```

- [ ] **Step 6: Lint, build, and browser-verify**

Run: `npm run lint` → 91 problems. Run: `npm run build` → succeeds.

Then `npm run dev` and check:
1. With **no** plan on a day, a friend's mountain card reads `I'm in`.
2. With a plan at Vail that day, a Copper card reads `Switch from Vail`. Tap it → you move to
   Copper.
3. **Set an ETA on that Vail plan first, then switch.** The ETA survives the move. *This is
   the highest-risk assertion in the sprint.*
4. Your own card reads `✓ You're in` with an `Add ETA` button; tapping it opens the modal
   pre-filled with that day and mountain.
5. Saving from that modal updates the card without leaving the tab.
6. Pick **Open — no preference** for a day → the day shows an Open card **below** a real
   mountain that has fewer people on it, reading `N free`.
7. Month view: tap a day → the day panel's cards show the same labels and `Add ETA`.
8. Past days show no join button and no `Add ETA`.
9. Check 375px and 1440px; the modal clears the bottom nav on mobile.

- [ ] **Step 7: Commit**

```bash
git add src/components/calendar/WeekView.jsx src/components/FriendsCalendar.jsx src/components/SkiPlansPage.jsx
git commit -m "feat: wire switch labeling and the plan editor into the friends calendar"
```

- [ ] **Step 8: Update the roadmap**

In `ROADMAP.md`, under Kyle's Notes, record the Sprint 36 outcome: the plan editor modal,
optional ETA snapped to quarter hours, the Open sentinel, and honest switch labeling. Note
that per-crew plan visibility remains open and is scoped as Sprint 37.

```bash
git add ROADMAP.md
git commit -m "docs: record Sprint 36 outcome"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3.1 modal, presets, Clear, Remove, save-gating, past dates | 4, 5 |
| §3.2 ETA read/write round-trip and snapping | 1, 4, 5, 7 |
| §3.3 Open sentinel, helpers, `RESORT_NAMES` purity, `TodaysCrew` cleanup | 2 |
| decision #5 Open pinned last | 3 |
| §3.4 switch labeling, `Add ETA`, "N free" | 6, 7 |
| §4 file structure | all |
| §7 verification items 1-6 | 5 step 6 |
| §7 verification items 7-13 | 7 step 6 |
| §7 item 8b (Open absent from Community pickers) | 2 step 1 (unit test) |

**Type consistency:** `PlanEditorModal`'s `onSave` payload is `{ resortKey, eta, visibility }`
in Tasks 4, 5 and 7. `myResortByDate` is `Map<dateKey, resort_key>` in Task 7 and consumed as
`myResortKey: string|null` in Task 6. `OPEN_RESORT_KEY`/`OPEN_RESORT_LABEL`/
`OPEN_RESORT_EMOJI` are defined in Task 2 and used in Tasks 3, 4 and 6.

**Known gap, accepted:** the modal opened from the friends calendar omits `onRemove`, so a
plan can only be deleted from Profile → Ski Plans. Recorded here so a reviewer does not read
it as an omission.
