# Crew Tab — Board Sub-Tab Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Crew tab's Board sub-tab (`SkiBuddyBoard.jsx`) to match the mockup — a single 6-chip filter row (`All/Ikon/Epic/Indy/Local/Carpool`) replacing today's 4 separate filter dimensions, and a compact card layout (avatar + name + colored pass badge header, subtitle line, tag pills, actions) — while every existing piece of information and every existing action (Respond, Report, response threads, verification gating, Filled status, carpool seat counts) keeps working exactly as it does today.

**Architecture:** Small, surgical change to one component plus one shared-logic addition. `skiBuddyOptions.js` gains a `passColor()`/`passBadgeStyle()` helper (new, tested, pure functions — no component depends on them yet except the one this plan updates). `socialApi.js`'s `getSkiBuddyPosts()` gains one new optional filter param, additive only. `SkiBuddyBoard.jsx` itself changes in two independent places: its filter state/UI, and its per-post card JSX. No schema change, no new data-fetch shape beyond one boolean param, no new component files.

**Tech Stack:** React (inline styles, no CSS framework), Supabase (Postgres), `node --test` for pure-logic unit tests.

## Global Constraints

- No new npm dependencies.
- Inline `style={{}}` objects; colors via `var(--color-*)` tokens for anything semantic/stateful. The 4 new pass-badge colors are a deliberate, already-precedented exception (same reasoning as `crewColors.js`'s fixed hex values — see that file's own header comment).
- Re-verify the `npm test`/`npx eslint .` baseline in the fresh worktree before starting — do not trust the last-recorded numbers (139 tests / 89 lint problems as of 2026-08-27), they drift between sessions and `main`'s own lint count runs persistently higher than a fresh worktree's true baseline.
- No subagent in this environment has browser or Supabase-auth tooling. Every task is verified via `npm test`/`npx eslint .`/`npm run build`/diff review only — say so plainly in each task's report, don't imply a browser check happened.
- Follow existing patterns exactly where one already exists (see each task's "Consumes" — these are real, already-in-the-codebase functions, not to be reimplemented).
- Ask before pushing to `main` — it auto-deploys to `powdays.app` live, no staging step. This plan's execution stays on a worktree branch; pushing/merging to `main` happens only after Kyle signs off.

---

## File Structure

| File | Change |
|---|---|
| `src/lib/skiBuddyOptions.js` | *modify* — add `passColor()`/`passBadgeStyle()` |
| `src/lib/skiBuddyOptions.test.js` | *new* — distinctness/contrast tests for the 4 pass colors |
| `src/lib/socialApi.js` | *modify* — `getSkiBuddyPosts()` gains a `hasCarpool` filter param |
| `src/components/SkiBuddyBoard.jsx` | *modify* — filter state/UI consolidation (4 dimensions → 6-chip row); per-post card restyle |

---

### Task 1: Pass-badge color helper

**Files:**
- Modify: `src/lib/skiBuddyOptions.js`
- Test: `src/lib/skiBuddyOptions.test.js`

**Interfaces:**
- Consumes: nothing new — `PASS_TYPES` already exists in this file (keys `ikon`, `epic`, `independent`, `other`).
- Produces: `passColor(key: string) => string` (a `#rrggbb` hex string, falls back to the `other` color for an unrecognized key). `passBadgeStyle(key: string) => { fontSize, fontWeight, padding, borderRadius, color, background, border }` (a complete inline-style object for a pass-type badge). Both consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/skiBuddyOptions.test.js`:

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { PASS_TYPES, passColor, passBadgeStyle } from "./skiBuddyOptions.js"

// ── Palette math, mirroring crewColors.test.js's approach: these colors need
// to be tellable apart and readable on a dark card, so that's a test, not an
// opinion. ──

function toRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  assert.ok(m, `${hex} must be a 6-digit hex color`)
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function hue(hex) {
  const [r, g, b] = toRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 0
  let h
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return (h * 60 + 360) % 360
}

function hueGap(a, b) {
  const d = Math.abs(hue(a) - hue(b)) % 360
  return d > 180 ? 360 - d : d
}

function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const DARKEST_BG = "#020510" // aurora-peak, the darkest of the 5 theme backgrounds

const KEYS = PASS_TYPES.map((p) => p.key)

test("every PASS_TYPES key has a distinct badge color", () => {
  const colors = KEYS.map(passColor)
  assert.equal(new Set(colors).size, KEYS.length)
})

test("passColor returns a literal hex color, not a theme token", () => {
  KEYS.forEach((k) => assert.match(passColor(k), /^#[0-9A-Fa-f]{6}$/))
})

test("no two pass colors sit within 20 degrees of hue", () => {
  for (let i = 0; i < KEYS.length; i++) {
    for (let j = i + 1; j < KEYS.length; j++) {
      const gap = hueGap(passColor(KEYS[i]), passColor(KEYS[j]))
      assert.ok(gap >= 20, `${KEYS[i]} and ${KEYS[j]} are only ${gap.toFixed(1)}° apart`)
    }
  }
})

test("every pass color clears 3:1 contrast against the darkest theme background", () => {
  KEYS.forEach((k) => {
    const ratio = contrast(passColor(k), DARKEST_BG)
    assert.ok(ratio >= 3, `${k} (${passColor(k)}) on ${DARKEST_BG} is only ${ratio.toFixed(2)}:1`)
  })
})

test("passColor falls back to the 'other' color for an unrecognized key", () => {
  assert.equal(passColor("nonsense"), passColor("other"))
})

test("passBadgeStyle returns a complete style object using passColor's value", () => {
  const style = passBadgeStyle("ikon")
  assert.equal(style.color, passColor("ikon"))
  assert.equal(typeof style.background, "string")
  assert.equal(typeof style.border, "string")
  assert.equal(style.fontWeight, 900)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx --node-options= node --test src/lib/skiBuddyOptions.test.js`
Expected: FAIL — `passColor`/`passBadgeStyle` are not exported from `skiBuddyOptions.js` yet.

- [ ] **Step 3: Implement `passColor`/`passBadgeStyle`**

Append to `src/lib/skiBuddyOptions.js`:

```js
// Pass-badge colors, one per PASS_TYPES key (TASK 22.0 Board-slice redesign).
// Ikon/Epic match the mockup's sample board post's badge colors exactly;
// independent/other are new choices (the mockup's 2-item sample never shows
// either) picked for the same hue-separation and contrast bar the mockup's
// pair implies — see skiBuddyOptions.test.js for the actual thresholds.
const PASS_BADGE_COLORS = {
  ikon:        { text: "#8ef6d1", bg: "rgba(142,246,209,0.12)", border: "rgba(142,246,209,0.25)" },
  epic:        { text: "#9bc6ff", bg: "rgba(155,198,255,0.12)", border: "rgba(155,198,255,0.25)" },
  independent: { text: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.25)" },
  other:       { text: "#f472b6", bg: "rgba(244,114,182,0.12)", border: "rgba(244,114,182,0.25)" },
}

export function passColor(key) {
  return (PASS_BADGE_COLORS[key] || PASS_BADGE_COLORS.other).text
}

export function passBadgeStyle(key) {
  const c = PASS_BADGE_COLORS[key] || PASS_BADGE_COLORS.other
  return {
    fontSize: 10,
    fontWeight: 900,
    padding: "4px 9px",
    borderRadius: 999,
    color: c.text,
    background: c.bg,
    border: `1px solid ${c.border}`,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx --node-options= node --test src/lib/skiBuddyOptions.test.js`
Expected: all tests PASS. If the hue-gap or contrast test fails for `independent`/`other`, adjust those two hex values (keep `ikon`/`epic` fixed — they're the mockup's literal colors) until both pass; re-run.

- [ ] **Step 5: Run the full suite to confirm no regression**

Run: `npm test`
Expected: fresh-worktree baseline count + 6 (this file's new tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/skiBuddyOptions.js src/lib/skiBuddyOptions.test.js
git commit -m "feat: add pass-type badge color helper for Board redesign"
```

---

### Task 2: Filter consolidation — one 6-chip row

**Files:**
- Modify: `src/lib/socialApi.js:283-314` (`getSkiBuddyPosts`)
- Modify: `src/components/SkiBuddyBoard.jsx:86-131` (state + `fetchPosts`), `:246-297` (filter JSX)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `getSkiBuddyPosts({ passType, hasCarpool })` — `hasCarpool: true` now filters to `carpool_status !== "none"`. The component's `passTypeFilter` state values are `"all" | "ikon" | "epic" | "independent" | "other"` (matching `PASS_TYPES` keys exactly) — Task 3 reads `post.pass_type`/`post.carpool_status` directly and doesn't touch this state, so no interface dependency there beyond what already exists on `post`.

- [ ] **Step 1: Extend `getSkiBuddyPosts` with the `hasCarpool` filter**

In `src/lib/socialApi.js`, inside `getSkiBuddyPosts` (currently lines 283-314), find:

```js
  if (filters.passType) query = query.eq("pass_type", filters.passType)
  if (filters.resortKey) query = query.eq("resort_key", filters.resortKey)
  if (filters.carpoolStatus) query = query.eq("carpool_status", filters.carpoolStatus)
  if (filters.ridingStyle) query = query.contains("riding_style", [filters.ridingStyle])
```

Add one line directly below it (leave the four existing lines untouched — `resortKey`/`carpoolStatus`/`ridingStyle` become unused by `SkiBuddyBoard.jsx` after this task but stay as working, harmless capabilities of this shared data-fetch function):

```js
  if (filters.hasCarpool) query = query.neq("carpool_status", "none")
```

- [ ] **Step 2: Replace `SkiBuddyBoard.jsx`'s filter state**

Find (currently lines 91-94):

```js
  const [passTypeFilter, setPassTypeFilter] = useState("all")
  const [resortFilter, setResortFilter] = useState("all")
  const [carpoolFilter, setCarpoolFilter] = useState("all")
  const [ridingStyleFilter, setRidingStyleFilter] = useState("all")
```

Replace with:

```js
  const [passTypeFilter, setPassTypeFilter] = useState("all")
  const [hasCarpool, setHasCarpool] = useState(false)
```

- [ ] **Step 3: Update `fetchPosts`**

Find (currently lines 124-131):

```js
  const fetchPosts = useCallback(() => {
    return getSkiBuddyPosts({
      passType: passTypeFilter === "all" ? null : passTypeFilter,
      resortKey: resortFilter === "all" ? null : resortFilter,
      carpoolStatus: carpoolFilter === "all" ? null : carpoolFilter,
      ridingStyle: ridingStyleFilter === "all" ? null : ridingStyleFilter,
    })
  }, [passTypeFilter, resortFilter, carpoolFilter, ridingStyleFilter])
```

Replace with:

```js
  const fetchPosts = useCallback(() => {
    return getSkiBuddyPosts({
      passType: passTypeFilter === "all" ? null : passTypeFilter,
      hasCarpool,
    })
  }, [passTypeFilter, hasCarpool])
```

- [ ] **Step 4: Replace the filter JSX**

Find the `{/* Filters */}` block (currently lines 246-297, from `<div style={{ display: "grid", gap: 8 }}>` through the closing `</select>` and its wrapping `</div>`). Replace the entire block with:

```jsx
      {/* Filters */}
      <div className="pd-x" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none" }}>
        {BOARD_FILTER_CHIPS.map(({ key, label }) => {
          const active = key === "carpool" ? hasCarpool : passTypeFilter === key
          return (
            <button
              key={key}
              onClick={() => (key === "carpool" ? setHasCarpool((v) => !v) : setPassTypeFilter(key))}
              style={{
                flexShrink: 0,
                padding: "8px 16px", borderRadius: 999, fontSize: 13, fontWeight: 800, cursor: "pointer",
                background: active ? "var(--color-accent)" : "rgba(255,255,255,0.05)",
                color: active ? "var(--color-bg)" : "rgba(255,255,255,0.6)",
                border: active ? "1px solid var(--color-accent)" : "1px solid rgba(255,255,255,0.1)",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
```

This reuses the exact chip visual language already established for the Crew tab's own top-level tab bar (`MessagingCenter.jsx`) — no new chip idiom.

Add the `BOARD_FILTER_CHIPS` constant at module scope, above the `ResponseThread` function (near the top of the file, alongside `passLabel`/`formatDate`):

```js
// Chip labels match the mockup's copy exactly. "Local" is a friendlier UI
// label for PASS_TYPES' "other" key — no data-model change, this file just
// displays a nicer word for that one chip. "carpool" isn't a pass-type key at
// all; it's handled as an independent boolean toggle, not part of the
// pass-type selection (see the click handler above).
const BOARD_FILTER_CHIPS = [
  { key: "all", label: "All" },
  { key: "ikon", label: "Ikon" },
  { key: "epic", label: "Epic" },
  { key: "independent", label: "Indy" },
  { key: "other", label: "Local" },
  { key: "carpool", label: "Carpool" },
]
```

- [ ] **Step 5: Verify no other caller of the removed filter params exists**

Run: `grep -rn "resortFilter\|ridingStyleFilter\|carpoolFilter" src/`
Expected: no matches anywhere (confirms the old state names are fully gone, not just shadowed).

Run: `grep -rn "getSkiBuddyPosts(" src/`
Expected: only the one call site inside `SkiBuddyBoard.jsx`'s `fetchPosts`, now passing `{ passType, hasCarpool }`.

- [ ] **Step 6: Build and lint**

Run: `npm run build`
Expected: succeeds. Watch for unused-import warnings — `RESORT_NAMES`/`RESORT_EMOJI` are still used elsewhere in this file (the card render, untouched by this task) so they should NOT be flagged as unused; if they are, Task 3 hasn't run yet in this task's context, which is expected — don't remove those imports in this task.

Run: `npx eslint .`
Expected: at or below the fresh-worktree baseline.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: same count as after Task 1 (this task adds no new `src/lib` tests of its own — `hasCarpool` is a one-line additive change to an already-untested query builder, consistent with `getSkiBuddyPosts`'s other filter branches, none of which have unit tests today).

- [ ] **Step 8: Commit**

```bash
git add src/lib/socialApi.js src/components/SkiBuddyBoard.jsx
git commit -m "refactor: consolidate Board's 4 filter dimensions into one 6-chip row"
```

---

### Task 3: Card layout restyle

**Files:**
- Modify: `src/components/SkiBuddyBoard.jsx` (imports; the per-post card JSX inside `visiblePosts.map(...)`, currently lines 306-417 — line numbers will have shifted slightly after Task 2's edits above it in the same file, locate by the `visiblePosts.map((post) => {` line instead)

**Interfaces:**
- Consumes: `passColor(key)`/`passBadgeStyle(key)` from Task 1 (`src/lib/skiBuddyOptions.js`); `Avatar` from `src/components/ui/Avatar.jsx` (props: `profile` — an object with `full_name`/`username`/`avatar_url`, exactly `post.profiles`'s shape — and `size`).
- Produces: nothing new consumed by a later task — this is the last content task before final review.

- [ ] **Step 1: Add imports**

At the top of `src/components/SkiBuddyBoard.jsx`, add:

```js
import { passColor, passBadgeStyle } from "../lib/skiBuddyOptions"
import Avatar from "./ui/Avatar"
```

(`passColor` is imported for potential future use consuming the raw hex value directly; if the implementer finds `passBadgeStyle` alone covers every use in this task, drop the unused `passColor` import before committing — don't leave an unused import.)

- [ ] **Step 2: Replace the per-post card JSX**

Inside `visiblePosts.map((post) => { ... })`, the `const author = ...` / `const isOwner = ...` / `const styles = ...` lines stay unchanged. Replace everything from the `return (` through its matching `)` — i.e. the whole `<AccentCard>...</AccentCard>` block — with:

```jsx
            return (
              <AccentCard key={post.id} accentColor="var(--color-accent)">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar profile={post.profiles} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{author}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                      {RESORT_EMOJI[post.resort_key]} {RESORT_NAMES[post.resort_key] || post.resort_key} · {formatDate(post.ski_date)} · {timeAgo(post.created_at)}
                    </div>
                  </div>
                  <span style={passBadgeStyle(post.pass_type)}>{passLabel(post.pass_type)}</span>
                </div>

                {post.is_held_for_review && isOwner && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-danger)", marginTop: 10 }}>
                    ⏳ Under review — only you can see this post right now.
                  </div>
                )}

                {post.description && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 10 }}>{post.description}</div>}

                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
                    {passLabel(post.pass_type)}
                  </span>
                  {styles.map((s) => (
                    <span key={s.key} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
                      {s.emoji} {s.label}
                    </span>
                  ))}
                  {post.carpool_status !== "none" && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(56,189,248,0.15)", color: "var(--color-accent)" }}>
                      {CARPOOL_STATUSES.find((c) => c.key === post.carpool_status)?.label}
                      {post.carpool_status === "offering" && post.carpool_seats ? ` (${post.carpool_seats})` : ""}
                    </span>
                  )}
                  {post.status === "filled" && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(34,197,94,0.15)", color: "var(--color-success-strong)" }}>Filled</span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  {isOwner ? (
                    <button onClick={() => setExpandedPostId(expandedPostId === post.id ? null : post.id)} style={{ background: "none", border: "none", color: "var(--color-accent)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      {expandedPostId === post.id ? "Hide responses" : "View responses"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRespondClick(post.id)}
                      disabled={post.status !== "open" || respondedPostIds.has(post.id)}
                      style={{
                        background: "none", border: "none",
                        color: post.status === "open" && !respondedPostIds.has(post.id) ? "var(--color-accent)" : "rgba(255,255,255,0.3)",
                        fontSize: 11, fontWeight: 700,
                        cursor: post.status === "open" && !respondedPostIds.has(post.id) ? "pointer" : "default",
                      }}
                    >
                      {respondedPostIds.has(post.id) ? "✓ Response Sent" : "Respond"}
                    </button>
                  )}
                  {!isOwner && (
                    <button onClick={() => setReportingId(reportingId === post.id ? null : post.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 11, cursor: "pointer" }}>
                      🚩 Report
                    </button>
                  )}
                </div>

                {respondingPostId === post.id && (
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    <textarea
                      value={responseMessage}
                      onChange={(e) => setResponseMessage(e.target.value.slice(0, 300))}
                      placeholder="Say hi, mention your plan…"
                      rows={2}
                      style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 8, color: "white", fontSize: 12, resize: "none" }}
                    />
                    {responseError && <div style={{ fontSize: 11, color: "var(--color-danger)" }}>{responseError}</div>}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setRespondingPostId(null)} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12 }}>Cancel</button>
                      <button onClick={() => handleSubmitResponse(post.id)} disabled={responding} style={{ flex: 2, padding: 8, borderRadius: 8, border: "none", background: "var(--gradient-primary)", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 12, opacity: responding ? 0.6 : 1 }}>
                        {responding ? "Sending…" : "Send"}
                      </button>
                    </div>
                  </div>
                )}

                {reportingId === post.id && (
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    <textarea
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value.slice(0, 300))}
                      placeholder="Why are you reporting this?"
                      rows={2}
                      style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 8, color: "white", fontSize: 12, resize: "none" }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setReportingId(null); setReportReason("") }} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12 }}>Cancel</button>
                      <button onClick={() => handleReportSubmit(post.id)} disabled={!reportReason.trim()} style={{ flex: 2, padding: 8, borderRadius: 8, border: "none", background: "var(--color-danger)", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 12, opacity: reportReason.trim() ? 1 : 0.5 }}>
                        Submit Report
                      </button>
                    </div>
                  </div>
                )}

                {expandedPostId === post.id && isOwner && (
                  <ResponseThread post={post} currentUserId={currentUserId} onStatusChange={handleStatusChange} />
                )}
              </AccentCard>
            )
```

Note what changed vs. what stayed on purpose:
- **New:** the header row (`Avatar` + author name + subtitle line combining resort/date/time-ago + pass badge), matching the mockup's compact card shape.
- **Moved, not removed:** the pass label now also appears as the first tag pill (matching the mockup's own sample, which repeats "Ikon" as both the header badge and a tag) — this duplicates the pass name in two places on the card, which is intentional per the design spec (§3.4), not an oversight.
- **Unchanged:** the under-review notice, description text, riding-style/carpool/filled tag pills, the Respond/View-responses/Report actions row (only its divider styling and position moved — content and behavior identical), the respond/report inline forms, and `ResponseThread`.
- **Removed:** the old top-right plain-text pass label and the old bottom-left "{author} · {timeAgo}" footer line — both are now represented in the new header (badge and subtitle respectively), not duplicated a second time.

- [ ] **Step 3: Build and lint**

Run: `npm run build`
Expected: succeeds with no errors. If `passColor` is unused per Step 1's note, remove that import now and rebuild.

Run: `npx eslint .`
Expected: at or below the fresh-worktree baseline.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: unchanged from Task 2 (this task is pure JSX/presentation, no new `src/lib` logic).

- [ ] **Step 5: Diff self-check**

Run: `git diff src/components/SkiBuddyBoard.jsx`
Confirm: no `onClick`/`onChange`/prop is missing compared to the pre-restyle version — every handler reference in the new JSX above (`handleRespondClick`, `setExpandedPostId`, `setReportingId`, `handleReportSubmit`, `handleSubmitResponse`, `setRespondingPostId`, `onStatusChange`) matches a function already defined earlier in this same file, unmodified by this task.

- [ ] **Step 6: Commit**

```bash
git add src/components/SkiBuddyBoard.jsx
git commit -m "feat: restyle Board post cards to match mockup layout"
```

---

### Task 4: Whole-branch final review + fix wave

Dispatch a review of the full branch diff (all 3 tasks combined) on the most capable available model, per the project's established pattern — this step has caught real cross-task bugs in every prior TASK 22.0 slice (a stale-state save bug and two offseason-data bugs in the Today List slice; a z-index/hitbox/tier-mismatch trio in the Today Map slice; 4 bugs including a tab-switch-killed realtime subscription and a viewport-height duplication in the Crews slice).

- [ ] **Step 1: Review the full diff**

Review `git diff main...HEAD` (the whole branch, not per-task diffs) against `docs/superpowers/specs/2026-08-31-crew-tab-board-slice-design.md` in full. Specifically check for:
- **Filter correctness:** does every one of the 6 chips actually filter to the right subset? Is "Carpool" genuinely independent of pass-type selection (can both be active at once), or did it accidentally get folded into the same mutually-exclusive chip group as the 5 pass chips?
- **No dropped functionality:** every action available on a Board card before this slice (Respond, View responses, Report, response accept/decline, verification-tier gating, Filled badge, carpool seat count, under-review notice) still works exactly as before — this slice is a restyle, not a feature cut.
- **No leftover dead state or imports:** `resortFilter`/`carpoolFilter`/`ridingStyleFilter` and the resort `<select>` are fully gone, not just unused; `passColor` import isn't left in if `passBadgeStyle` alone was sufficient.
- **This slice introduces no realtime subscription** — confirm that's still true (nothing to break on tab-switch, unlike the Crews slice's bug).
- **Card rendering** doesn't break on a post with no `carpool_status` variety, no `riding_style` entries, or a missing `post.profiles` (deleted/missing author profile) — `Avatar.jsx` already handles a null/undefined `profile` gracefully (falls back to `"?"` name), confirm nothing upstream assumes `post.profiles` is always present in a way `Avatar` doesn't already cover.
- **Test/lint baseline:** `npm test` and `npx eslint .` are at or better than the fresh-worktree baseline recorded before Task 1 started.

- [ ] **Step 2: Fix any findings**

Apply fixes for anything the review surfaces, in a single consolidated fix-wave commit (not one commit per finding), same pattern as every prior slice's fix wave. Re-run `npm test`/`npx eslint .`/`npm run build` after fixing.

- [ ] **Step 3: Commit the fix wave (only if there were findings)**

```bash
git add -A
git commit -m "fix: final-review fix wave — Board sub-tab slice"
```

- [ ] **Step 4: Report final state**

Record in the task report: final `npm test` pass count, final `npx eslint .` problem count, and an explicit statement that no subagent in this build had browser/Supabase-auth tooling — verification was tests/lint/build/diff-review only, and Kyle needs to do the real authenticated click-through before this is considered fully verified (same standing gap as every prior slice).

---

## Self-Review Notes (for the plan author, already applied above)

- **Spec coverage:** §3.1 (filter row, chip mapping, Carpool-as-independent-toggle) → Task 2. §3.2 (`getSkiBuddyPosts` `hasCarpool`) → Task 2 Step 1. §3.3 (pass-badge color helper) → Task 1. §3.4 (card layout, what's new/moved/unchanged/removed) → Task 3. §5's "no realtime subscription" callout → Task 4 Step 1 explicitly checks for it.
- **Type consistency checked:** `passBadgeStyle`'s return shape (Task 1) matches exactly how Task 3 consumes it (`style={passBadgeStyle(post.pass_type)}`, spread as a full style object, not destructured). `BOARD_FILTER_CHIPS`' `key` values (`"all"|"ikon"|"epic"|"independent"|"other"|"carpool"`) match `PASS_TYPES`' actual keys (Task 2) exactly, and match what Task 3's `passLabel`/`passBadgeStyle` calls expect (`post.pass_type`, one of the same 4 non-"all"/"carpool" values).
- **No placeholders:** every step has complete, real code — nothing deferred.
