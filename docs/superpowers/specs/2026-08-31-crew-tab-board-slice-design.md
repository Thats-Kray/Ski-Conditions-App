# Design — Crew Tab: Board Sub-Tab Mockup Fidelity Pass (Slice 2 of 5)

**Date:** 2026-08-31
**Status:** Approved for planning
**Origin:** ROADMAP.md TASK 22.0, continuing the Crew tab's mockup-fidelity pass after the Crews
slice (shipped, `17aa68f`). Source of truth is `mockups/PowDays.app mockup design/PowDays Reorg
Mockup.dc.html`'s `crewBoard`/`boardChips`/`board` render branch (lines 396-418, sample data at
676-682) — there is no dedicated static screenshot for Board at all, same situation the Crews
slice found for the other non-Friends sub-tabs.

## 1. The problem

`SkiBuddyBoard.jsx` (422 lines) is unmodified since before the mockup existed and currently
routes to as-is from `MessagingCenter.jsx`'s Board chip (a deliberate interim state from the
Crews slice). Two kinds of gap:

**Visual.** The mockup's board post is a compact card: colored-initials avatar + author name +
relative time in one header row, a color-coded pass-type badge top-right, one body-text line,
then a wrapping row of small tag pills. The current card is an `AccentCard` with a
resort-emoji-and-name/date header row, a separate pass-type label, an under-review notice, body
text, a tag row (riding styles + carpool + filled status), an author/time footer line, and a row
of Respond/View-responses/Report action links — more information-dense, no color-coding on the
pass label, and a completely different visual rhythm than the mockup.

**Structural — filters.** The mockup shows exactly one horizontally-scrolling 6-chip filter row:
`All / Ikon / Epic / Indy / Local / Carpool`. The live component has 4 independent filter
dimensions rendered as 3 chip rows plus a resort `<select>`: `passTypeFilter`, `resortFilter`,
`carpoolFilter` (none/offering/needing), `ridingStyleFilter`. This is a real consolidation, not a
restyle — resolved in §2.

No new data model or write path is needed for either gap; this slice is a redesign of one
existing component plus a small new pure-logic helper.

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Drop the resort and riding-style filters entirely** — the visible filter row matches the mockup's 6 chips exactly: `All / Ikon / Epic / Indy / Local / Carpool`. | Kyle's choice. Resort is already visible per-card (in the header/body); riding style is already visible as a tag pill on each card. Losing the ability to *narrow* by either matches the mockup's own simpler, browse-everything design rather than inventing a secondary filter UI the mockup doesn't show. |
| 2 | **Chip → filter mapping:** `Ikon`→`PASS_TYPES.ikon`, `Epic`→`PASS_TYPES.epic`, `Indy`→`PASS_TYPES.independent`, `Local`→`PASS_TYPES.other`. The chip's UI label is `"Local"`; the underlying `PASS_TYPES` key/label (`"other"`/`"Other"`) is unchanged. | Kyle's choice. Matches the mockup's exact copy without any data-model change — `"Local"` is purely a friendlier UI label for this one chip, same pattern as any other UI-copy-vs-key divergence already in the app (e.g. `CARPOOL_STATUSES`'s labels vs. keys). |
| 3 | **`Carpool` chip collapses the old 3-way `carpoolFilter` into one boolean: any post where `carpool_status !== "none"`** (offering OR needing), not a specific direction. | Kyle's choice. Matches how the mockup's own sample post reads ("2 seats open") — the chip means "this listing has a carpool angle," not "offering only." |
| 4 | **Card restyles to the mockup's compact layout, but every current piece of information and every action stays** — resort, date, filled-status, carpool-seat-count, group-size, and the Respond/View-responses/Report actions and response-thread expansion all remain, just re-laid-out into the new compact shape. | Kyle's choice. Same principle as `BestBetCard`/`ResortListRow` in the Today slice: adopt the mockup's visual language without deleting real functionality the mockup's minimal 2-item sample simply doesn't happen to show. |
| 5 | **New pass-badge coloring becomes a small shared helper in `skiBuddyOptions.js`**, next to `PASS_TYPES`, rather than staying local to `SkiBuddyBoard.jsx`. | Kyle's choice. `PostSkiBuddyForm.jsx` already renders its own pass-type chips from the same `PASS_TYPES` list; a shared helper is one source of truth if that form ever wants the same coloring, avoiding the kind of duplicate-implementation bug the Friends-slice audit already found once (`FriendAvatar` vs. `Avatar.jsx`). |
| 6 | **Post-author avatar switches to the shared `Avatar.jsx`** component, replacing a new local avatar div. | `post.profiles` already has the `full_name`/`username`/`avatar_url` shape `Avatar.jsx` expects — no reason to hand-roll a third avatar-color implementation in this codebase. |

## 3. The design

### 3.1 Filter row

Replaces the current 3 chip rows + resort `<select>` block with one horizontally-scrolling
6-chip row, visually matching the tab-bar chip style already established in
`MessagingCenter.jsx` (filled accent pill when active, translucent pill when not — no new chip
idiom invented):

```
[ All ] [ Ikon ] [ Epic ] [ Indy ] [ Local ] [ Carpool ] →
```

- Component state shrinks from 4 filter variables to 2: `passTypeFilter`
  (`all|ikon|epic|independent|other`) and `hasCarpool` (boolean, default `false`). `resortFilter`
  and `ridingStyleFilter` state, and the resort `<select>` element, are deleted.
- `Carpool` is a toggle chip (on/off), not part of the same mutually-exclusive group as the 5
  pass chips — a post can be both "Epic" and "has carpool" at once, so both chips can be active
  together. Visually it's the same pill style; behaviorally it's independent of the pass-type
  selection.
- `fetchPosts()`'s `getSkiBuddyPosts()` call passes `passType` (mapped from `passTypeFilter`,
  `null` when `"all"`) and a new `hasCarpool: true` flag only when the Carpool chip is active. It
  no longer passes `resortKey` or `ridingStyle`.

### 3.2 Data layer: `getSkiBuddyPosts()`

Confirmed by grep: `SkiBuddyBoard.jsx` is the only caller. Add support for the new boolean
filter without removing the existing `resortKey`/`ridingStyle`/`carpoolStatus` param handling
(those become simply unused by this slice's only caller — pruning them is unrelated cleanup, out
of scope here, not a gap this slice needs to fix):

```js
if (filters.hasCarpool) query = query.neq("carpool_status", "none")
```

### 3.3 Pass-badge color helper (`src/lib/skiBuddyOptions.js`)

New exports alongside the existing `PASS_TYPES`:

```js
export function passColor(key) { ... }       // returns a hex/rgba string per pass key
export function passBadgeStyle(key) { ... }  // returns the full badge style object (bg/border/color/text)
```

Four colors, one per `PASS_TYPES` key (`ikon`, `epic`, `independent`, `other`) — mint for Ikon
and blue for Epic per the mockup's sample; two more distinct hues chosen for `independent`/
`other` (not shown in the mockup's 2-item sample, so these are a new but reasoned choice, not a
literal copy). Gets a small test file, `skiBuddyOptions.test.js`, asserting all 4 are distinct
hues and readable against the app's dark card background — mirroring `crewColors.test.js`'s
pattern, the kind of check that has caught real contrast problems before in this codebase.

### 3.4 Card layout (`SkiBuddyBoard.jsx`)

Re-skins the per-post `AccentCard` body into the mockup's rhythm without removing any existing
piece of content or action:

```
┌──────────────────────────────────────────┐
│ (DS)  Devin Shaw            [ Ikon ]      │
│       Vail · Sat Jan 18 · 1h ago          │
│                                            │
│  Driving to A-Basin Sat 6am, 2 seats      │
│  open. Advanced groomers + bumps.         │
│                                            │
│  [Ikon] [Carpool ×2] [Advanced] [Filled]  │
│  ──────────────────────────────────────── │
│  Respond            🚩 Report             │
└──────────────────────────────────────────┘
```

- **Header row:** `Avatar.jsx` (Decision 6) at ~38px, author name, pass badge
  (`passBadgeStyle(post.pass_type)`, Decision 5/§3.3) right-aligned — replacing the current
  plain-text pass label.
- **Subtitle line** (new, folds in what the old header row had): resort emoji + name, ski date,
  "· Xh ago" — all three pieces of info the mockup's card keeps distinct (resort/date) or implies
  (time-ago), just consolidated into one line under the header per the mockup's density.
- **Body text:** unchanged, `post.description`.
- **Tag-pill row:** unchanged set of pills (riding styles, carpool status + seat count, "Filled"
  badge), restyled to match the mockup's smaller pill visual — the pass name itself is *also*
  still shown here as a tag (matching the mockup's own sample, which repeats "Ikon" as both the
  header badge and a tag), so no information is dropped even though the badge already shows it.
- **Under-review notice:** unchanged, still shown to the owner above the body text when
  `post.is_held_for_review`.
- **Actions row + response thread:** unchanged — Respond/View-responses/Report and the expanding
  `ResponseThread`, restyled only for spacing/border to sit under the new tag-pill row instead of
  the old author/time footer line (author/time moved up into the header per above).

## 4. Architecture

| File | Responsibility |
|---|---|
| `src/components/SkiBuddyBoard.jsx` | *modify* — filter state/UI consolidation (§3.1), card layout re-skin (§3.4); no change to data-fetch logic beyond the new `hasCarpool` param, no change to respond/report/status-update logic |
| `src/lib/socialApi.js` | *modify (minimal, additive)* — `getSkiBuddyPosts()` gains `hasCarpool` handling (§3.2); existing `resortKey`/`ridingStyle`/`carpoolStatus` handling left in place, unused after this slice |
| `src/lib/skiBuddyOptions.js` | *modify* — new `passColor()`/`passBadgeStyle()` exports (§3.3) |
| `src/lib/skiBuddyOptions.test.js` | *new* — distinctness/contrast assertions for the 4 pass colors |
| `src/components/ui/Avatar.jsx` | *unmodified* — reused as-is for the post-author avatar (Decision 6) |
| `src/components/PostSkiBuddyForm.jsx`, `src/components/VerificationUpgradeModal.jsx` | *unmodified* — post-creation and verification-gating flows untouched |

## 5. Constraints inherited from the repo

- No new npm dependencies.
- Inline `style={{}}` objects; colors via `var(--color-*)` tokens for anything semantic/stateful.
  The 4 new pass colors are a deliberate exception, same reasoning already on record for
  `crewColors.js`'s fixed hex values — pass-type identity needs to stay visually distinct and
  consistent, which a theme-token remap across 5 themes can't guarantee for 4 arbitrary
  categories.
- Re-verify the test/lint baseline in a fresh worktree at build time, not from a cited number —
  it drifts between sessions (last recorded: 139 tests / 89 lint problems as of the Crews slice,
  2026-08-27, both due for re-verification here).
- No subagent in this environment has browser or Supabase-auth tooling — every task, and the
  final whole-branch review, are verified via `npm test`/`npx eslint .`/`npm run build`/diff
  review only. Kyle does the real click-through after it ships, same as every prior slice.
- Ask before pushing to `main` — it auto-deploys to `powdays.app` live, no staging step.

## 6. Out of scope

- **Leaderboard, Feed, Friends sub-tab redesigns** — Board is slice 2 of 5; the rest follow in
  Kyle's confirmed order (Leaderboard → Feed → Friends).
- **Pruning `getSkiBuddyPosts()`'s unused `resortKey`/`ridingStyle`/`carpoolStatus` filter
  branches** — left in place per §3.2, not this slice's job.
- **Any change to post creation, tier-1 verification gating, respond/accept/decline, or report
  flows** — reused unmodified, only their visual container moves.
- **A realtime subscription for the Board feed** — none exists today and none is being added;
  noted explicitly because the Crews-slice final review caught a subscription-inside-a-tab-gated-
  component bug last time, and this slice introduces no subscription to repeat that pattern with.

## 7. Verification

No browser/Supabase-auth tooling is available to any subagent in this environment (standing
limitation, every prior slice). Verification is:

1. `passColor()`/`passBadgeStyle()` unit tests pass (`skiBuddyOptions.test.js`) — 4 distinct,
   readable colors.
2. `npm test` still passes at (or above) the fresh-worktree baseline captured at build time.
3. `npx eslint .` does not exceed the fresh-worktree baseline captured at build time.
4. `npm run build` succeeds.
5. Diff review confirms: the 6-chip filter row renders and maps to the right `PASS_TYPES` keys
   (§3.1/§3.2); the `Carpool` chip is an independent toggle, not part of the pass-type
   mutual-exclusion group; no resort/riding-style filter UI remains; every existing card action
   (Respond, View-responses/Report, response thread expand, owner under-review notice, Filled
   badge, carpool seat count) is still present in the re-skinned card, just relocated per §3.4;
   the post-author avatar renders via `Avatar.jsx`, not a new local implementation.
6. Kyle does the real authenticated click-through after it ships (filter chips actually filter
   the list correctly, cards render as expected on mobile width, Respond/Report still work end
   to end) — same gate every prior slice has used.
