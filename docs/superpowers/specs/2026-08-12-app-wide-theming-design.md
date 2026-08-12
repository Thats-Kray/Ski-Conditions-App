# App-Wide Theming Follow-Up — Design Spec

**Date:** 2026-08-12
**Status:** Approved for planning
**Depends on:** Task 10.1 (User Theme Switching MVP, ROADMAP.md Section 10) — must already be live.

## Goal

Task 10.1 shipped 5 themes (Blizzard, Alpine Dawn, Storm Chaser, Aurora Peak, Base Lodge)
via `[data-theme]` blocks in `src/index.css`, but only repainted Home, Leaderboard,
Profile, and the `ui/` primitives. Everywhere else — trip modals, messaging/crew chat,
landing/onboarding, PowderMap, Mountain Page/Board, session flow, social/friends screens —
still renders hardcoded Blizzard-blue hex regardless of the picked theme. This spec scopes
closing that gap: every remaining screen repaints correctly across all 5 themes.

## Architecture

Extend the existing CSS custom-property system — no new dependency, no new styling
paradigm. Every component already uses inline `style={{...}}` objects; this is a
mechanical swap of raw hex for `var(--token)` references, plus adding new semantic tokens
to `index.css`'s 5 `[data-theme]` blocks wherever an existing token doesn't cover a needed
shade (e.g. modal-specific surfaces, chat-bubble backgrounds, map marker colors).

Two other approaches were considered and rejected: a JS theme-object/hook (would run a
second theming mechanism alongside the CSS-var one the MVP already shipped, no upside) and
adopting CSS Modules/styled-components (a full styling-paradigm rewrite disproportionate
to the problem).

## Three-way color classification

Every hardcoded color found in the remaining ~26 files falls into one of three buckets:

1. **Retheme** — structural/brand colors (backgrounds, surfaces, borders, accent
   gradients) → replaced with `var(--token)`, changes per theme. This is the bulk of the
   work.
2. **Consolidate, don't retheme** — status/tier/risk colors that already have
   `--rating-*` tokens (from Task 10.1) but are duplicated as raw hex instead of
   referencing them. `App.jsx`'s `tierColor()`, `riskColor()`, and `vibeTier()` duplicate
   `Badge.jsx`'s `TIER_COLORS`/`RISK_COLORS` exactly. Point these at the existing tokens.
   No visual change (status colors are intentionally theme-invariant) — this just removes
   a second source of truth while the color logic is already being touched.
3. **Leave alone — documented exceptions:**
   - Third-party brand colors: Strava orange (`#FC4C02` in `StravaConnect.jsx`,
     `StravaSyncReview.jsx`, `SessionRecapModal.jsx`), Spotify green (`#1ed760` in
     `TripDetailModal.jsx`). These represent an external brand, not the app's own palette,
     and must render exactly as those brands specify regardless of in-app theme.
   - `ShareStatCard.jsx` — draws via Canvas 2D (`ctx.fillStyle`), which cannot consume
     `var(--token)` directly (would need `getComputedStyle().getPropertyValue()` resolved
     at draw-time, a different technique from everywhere else in the app). It's also an
     external-facing artifact (a downloadable/shareable PNG representing the PowderDays
     brand) — stays fixed on the Blizzard look regardless of the viewer's picked theme,
     same reasoning as the third-party brand colors above.
   - Decorative name-hash-indexed avatar-fallback palette (`ProfilePage.jsx` and
     equivalents elsewhere) — same precedent as Task 0.2's `SKILL_OPTIONS` exception:
     single-use, decorative variety independent of the app's brand palette, not worth a
     dedicated token.

## Scope — 8 functional groups

One full pass, one spec/plan, executed like Section 13 (Premium UI Uplift). Grouped by
functional area for task breakdown, not by file:

| Group | Files | Hex literals (approx.) |
|---|---|---|
| Resort cards + status-color consolidation | `App.jsx` | 66 |
| Trip flow | `TripDetailModal.jsx`, `CreateTripModal.jsx`, `TripCard.jsx`, `TripChatView.jsx` | 109 |
| Messaging / crew chat | `MessagingCenter.jsx`, `CrewGroupChat.jsx`, `DirectMessageView.jsx` (+ `SKILL_COLORS`), `DateMatchmaker.jsx` | 81 |
| Landing / onboarding / auth | `LandingPage.jsx`, `OnboardingFlow.jsx`, `ProfileSetup.jsx`, `AuthForm.jsx`, `AuthPanel.jsx` | 65 |
| PowderMap | `PowderMap.jsx` | 22 |
| Mountain Page / Board | `MountainBoard.jsx`, `MountainPage.jsx`, `EventsWidget.jsx` | 25 |
| Social / friends | `FriendsPage.jsx`, `UserProfileModal.jsx`, `NotificationBell.jsx`, `ActivityFeed.jsx`, `TodaysCrew.jsx` | 61 |
| Session flow | `ActiveSessionBar.jsx`, `SessionRecapModal.jsx`*, `SessionEditForm.jsx`, `SessionStatsForm.jsx`, `SkiCheckInForm.jsx`, `SkiPingModal.jsx`, `SkiPlansPage.jsx` (`DOT_COLORS`) | 62 |

\* Keeps its Strava brand-orange accent untouched; everything else in the file retheme.

Not included above: `StravaConnect.jsx`, `StravaSyncReview.jsx`, `ShareStatCard.jsx` — these
are the documented exceptions, not part of the retheme groups, but should get an explicit
one-line comment in each file marking the exception (`/* Strava brand color — do not
tokenize */` or equivalent) so a future pass doesn't "fix" them by mistake.

## Sequencing

Same execution mechanics as Section 13: isolated git worktree
(`superpowers:using-git-worktrees`) + `superpowers:subagent-driven-development`, one task
per functional group above, final whole-branch review pass before merge (Section 13's
final review caught 6 real issues this way — expect the same value here given similar
size).

Suggested order: `App.jsx` first (status-color consolidation touches the same functions
every card-rendering group below indirectly depends on for a consistent pattern reference),
then trip flow and messaging (highest-traffic screens), then the rest in any order.

## Verification

- `npm run lint` — run locally by the app owner (no node/npm available in this sandbox).
- **Required visual verification step:** drive all 5 themes through every touched screen
  via Playwright (real Chrome, logged in with a test account) — a trip detail + create-trip
  flow, a chat thread, the map, Mountain Page, friends list, an active session — confirming
  correct repaint and no regressions. Home/Leaderboard/Profile are already covered by the
  MVP's own verification; this extends coverage to the newly-touched screens only.
- Confirm the three documented exceptions (Strava/Spotify brand colors, share-card canvas,
  avatar-fallback palette) render identically across all 5 themes, i.e. prove they're
  actually invariant, not just unreachable in the diff.

## Out of scope

- Any change to the token *values* themselves (the 5 theme palettes are locked from
  Task 10.1).
- Any new theme (still exactly 5).
- Rewriting `ShareStatCard.jsx` to retheme (explicitly rejected above).
- Anything not reachable from the 8 functional groups above (e.g. dead code, unused
  components) — if found during implementation, note it but don't fix it as part of this
  pass.
