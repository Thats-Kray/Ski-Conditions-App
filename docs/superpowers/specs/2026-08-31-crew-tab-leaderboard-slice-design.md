# Design — Crew Tab: Leaderboard Sub-Tab Mockup Fidelity Pass (Slice 3 of 5)

**Date:** 2026-08-31
**Status:** Approved for planning
**Origin:** ROADMAP.md TASK 22.0, continuing the Crew tab's mockup-fidelity pass after the Crews
and Board slices (both shipped and live). Source of truth is `mockups/PowDays.app mockup
design/PowDays Reorg Mockup.dc.html`'s `crewLeader`/`metricChips`/`leaderRows` render branch
(lines 420-435, sample data at 687-701) — there is no dedicated static screenshot for
Leaderboard, same situation Board and the other non-Friends sub-tabs were in.

## 1. The problem

The very first Crew-tab gap audit (done before the Crews slice) flagged Leaderboard and Feed as
needing "real new data-model/taxonomy work," unlike Crews/Board's pure restyles. That prediction
holds: `LeaderboardPage.jsx` (479 lines) is unmodified since before the mockup existed and
currently routes to as-is from `MessagingCenter.jsx`'s Leaderboard chip.

**Metric mismatch.** The mockup shows exactly 7 horizontally-scrolling metric chips: `Vertical /
Days / Powder Days / Resorts / Miles / Runs / Longest Day`. The live component's `CATEGORIES`
array has 8 different ones: `Days / Powder Days / Vertical / Miles / Top Speed / Longest Run /
Most Lifts / Time on Mountain`. Two mockup metrics (`Resorts`, `Runs`) don't exist as sortable
tabs today even though their data is already fetched by `leaderboardApi.js` (`entry.resorts`,
`entry.totalRuns`) for other uses (the season-snapshot strip). Three of today's tabs (`Top
Speed`, `Most Lifts`, `Time on Mountain`) have no mockup equivalent at all.

**Row visual.** The mockup's row is a single compact line: rank number, colored-initials avatar,
name, one right-aligned value string with its unit baked in (e.g. "96 mi"). The live
`LeaderboardRow` is taller — medal emoji for top 3, a real `Avatar.jsx` avatar, name + an
optional "YOU" badge + an optional `topResort` subtitle line, a stat block showing the number and
its unit on two separate lines, and (for non-self rows) a row of 4 emoji-reaction buttons with
counts underneath.

**Everything else on the page** — the Friends/Global mode toggle, the 2-step "Log a Ski Day"
modal (the actual path that creates `ski_sessions` rows and feeds the activity feed), the
season-snapshot stat strip, the collapsible "your logged days" list with delete, and the
reactions themselves — has no mockup equivalent, because the mockup's screen is a minimal
2-skier sample, not a claim that this functionality shouldn't exist.

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Tab row matches the mockup's 7 metrics exactly**: `Vertical / Days / Powder Days / Resorts / Miles / Runs / Longest Day`. Add `resorts`/`runs` as new sortable categories; drop `topSpeed`/`totalLifts`/`timeOnMountain` from the visible tab row entirely. | Kyle's choice. `resorts` and `totalRuns` are already fetched per entry — no new query, no schema change. The 3 dropped categories' underlying data isn't deleted (still fetched by `getLeaderboard`/`getPublicLeaderboard`, still used by `SessionStatsForm`'s input fields when logging a day) — only their sortable-tab presence on this page goes away. |
| 2 | **`longestRun`'s tab adopts the mockup's label "Longest Day," but keeps its existing stat** (`entry.longestRun`, longest single run in feet — unchanged). | Kyle's choice, made after flagging that "Longest Day" could plausibly mean a different (non-existent) day-level stat. Treating the mockup's wording as the label, not a new stat to build, avoids inventing a metric nobody asked for. |
| 3 | **Every existing feature not shown in the mockup's minimal sample survives, unmodified**: Friends/Global toggle, the Log-a-Ski-Day modal and its write path, the season-snapshot stat strip, the collapsible my-logged-days list with delete, and per-user emoji reactions. | Kyle's choice, same precedent as Board: a restyle to match the mockup's visual language, not a feature cut. The mockup's sparse sample data reflects it being a 2-row illustrative screen, not a product decision to remove real functionality. |
| 4 | **Row restyles to the mockup's compact single line**, but medals, the "YOU" badge, the `topResort` subtitle, and the reactions row all fold into the new compact layout rather than disappearing. The one real formatting change: the stat value switches from today's two-line "big number, small unit word below" to the mockup's single inline string (e.g. "18 days", "96 mi", "7 resorts"). | This is what actually achieves the mockup's compact row height — keeping the two-line stat block would keep the row nearly as tall as it is today regardless of what else changes. Everything else about the row's information is preserved, just laid out on one line. |
| 5 | **`Avatar.jsx` stays the avatar source**, not the mockup's own hardcoded per-skier color object. | Same reasoning as Board's Avatar reuse — avoids introducing a third avatar-color implementation into a codebase that's already found two disagreeing ones once (the Friends-slice `FriendAvatar` finding). |

## 3. The design

### 3.1 `CATEGORIES` changes

```js
const CATEGORIES = [
  { key: "vertical",   label: "↕️ Vertical",     stat: (e) => e.verticalFt,  unit: "ft"      },
  { key: "days",       label: "🎿 Days",         stat: (e) => e.days,        unit: "days"    },
  { key: "powderDays", label: "❄️ Powder Days",  stat: (e) => e.powderDays,  unit: "days"    },
  { key: "resorts",    label: "⛰️ Resorts",      stat: (e) => e.resorts,     unit: "resorts" },
  { key: "miles",      label: "🛣️ Miles",        stat: (e) => e.milesSki,    unit: "mi"      },
  { key: "runs",       label: "🎿 Runs",         stat: (e) => e.totalRuns,   unit: "runs"    },
  { key: "longestRun", label: "📏 Longest Day",  stat: (e) => e.longestRun,  unit: "ft"      },
]
```

Order matches the mockup's chip order exactly (`Vertical` first, not `Days` — today's array
currently leads with `days`). `topSpeed`/`totalLifts`/`timeOnMountain` entries are deleted from
this array; `formatMinutes()` (used only to format `timeOnMountain`'s display) is deleted as
dead code in the same change, since nothing else in this file calls it.

No change to `leaderboardApi.js` — `resorts` and `totalRuns` are already present on every
returned entry (confirmed at `leaderboardApi.js:222-230` and `:283-291`).

### 3.2 Row layout (`LeaderboardRow`)

Single-line restyle, all existing information retained:

```
🥇  (DS)  Devin Shaw  YOU        96 mi
          ⛷️ Vail
    [🎿 3] [❄️] [🔥ᐧ2] [👑]
```

- Rank/medal: unchanged logic (`RANK_MEDALS` for top 3, plain rank number otherwise).
- Avatar: unchanged, `Avatar.jsx`.
- Name row: unchanged — name, optional "YOU" badge, optional `topResort` subtitle line
  underneath.
- **Stat value**: changes from the current two-element block (large number, small unit label on
  its own line below) to one inline string combining `displayValue` and `cat.unit` (e.g.
  `${displayValue} ${cat.unit}`), matching the mockup's single right-aligned value. The
  `timeOnMountain`-specific `formatMinutes()` branch in `displayValue`'s computation is removed
  along with the category itself (§3.1).
- Reactions row: unchanged — still renders below the row, still hidden on the current user's own
  row, still the same 4 emojis with counts.

### 3.3 Everything else on the page (`LeaderboardPage`)

No changes: header, "+ Log Day" button and `LogDayModal` (both steps), Friends/Global toggle,
season-snapshot stat strip, collapsible my-logged-days list with delete, empty states, loading
states, and all data-fetching/sorting/reaction logic. Only `CATEGORIES` (§3.1) and
`LeaderboardRow`'s internal layout (§3.2) change.

## 4. Architecture

| File | Responsibility |
|---|---|
| `src/components/LeaderboardPage.jsx` | *modify* — `CATEGORIES` array edit (§3.1), delete `formatMinutes()`, `LeaderboardRow`'s stat-display JSX restyle (§3.2). Everything else in this 479-line file is unmodified. |
| `src/lib/leaderboardApi.js` | *unmodified* — `resorts`/`totalRuns` already present on every entry |
| `src/components/ui/Avatar.jsx` | *unmodified* — reused as-is (Decision 5) |
| `src/components/SessionStatsForm.jsx` | *unmodified* — still collects top speed/lifts/time-on-mountain input for logging a day; those fields simply aren't sortable-tab metrics on this page anymore |

## 5. Constraints inherited from the repo

- No new npm dependencies.
- Inline `style={{}}` objects; colors via `var(--color-*)` tokens for anything semantic/stateful
  — no new hardcoded color is introduced by this slice (unlike Board's pass-badge colors), so
  this constraint is satisfied trivially.
- Re-verify the test/lint baseline in a fresh worktree at build time, not from a cited number —
  last recorded (Board slice, 2026-08-31): 145 tests / 89 lint problems in a fresh worktree, both
  due for re-verification here.
- No subagent in this environment has browser or Supabase-auth tooling — every task, and the
  final whole-branch review, are verified via `npm test`/`npx eslint .`/`npm run build`/diff
  review only. Kyle does the real click-through after it ships, same as every prior slice.
- Ask before pushing to `main` — it auto-deploys to `powdays.app` live, no staging step.

## 6. Out of scope

- **Feed, Friends sub-tab redesigns** — Leaderboard is slice 3 of 5; Feed and Friends follow in
  that order.
- **Any change to `SessionStatsForm.jsx`, the Log-a-Ski-Day write path, reaction add/remove
  logic, or the Friends/Global data-fetch** — reused unmodified.
- **Reintroducing Top Speed/Most Lifts/Time on Mountain as sortable tabs elsewhere** (e.g. a
  "more stats" overflow) — considered and explicitly declined (Decision 1); their data still
  exists and is still collected, just not surfaced as a leaderboard tab.
- **A new "longest single day" stat** — the mockup's "Longest Day" label is treated as wording
  for the existing `longestRun` stat, not a new metric to build (Decision 2).

## 7. Verification

No browser/Supabase-auth tooling is available to any subagent in this environment (standing
limitation, every prior slice). Verification is:

1. `npm test` still passes at (or above) the fresh-worktree baseline captured at build time.
2. `npx eslint .` does not exceed the fresh-worktree baseline captured at build time — including
   confirming `formatMinutes()`'s removal doesn't leave a dangling reference anywhere else in the
   file.
3. `npm run build` succeeds.
4. Diff review confirms: the tab row shows exactly the 7 mockup metrics in the mockup's order;
   `Resorts`/`Runs` sort correctly (descending, matching every other category's sort direction);
   `Top Speed`/`Most Lifts`/`Time on Mountain` are gone from the tab row; the `Longest Day` tab
   sorts by the same `longestRun` value as before; every row still shows its medal/avatar/name/
   YOU-badge/topResort/reactions exactly as before, with only the stat-value display now inline;
   the Log Day modal, Friends/Global toggle, stat strip, and my-days list are all untouched in
   the diff.
5. Kyle does the real authenticated click-through after it ships (tabs sort correctly, row
   layout looks right on mobile, Log Day / reactions / toggle still work end to end) — same gate
   every prior slice has used.
