# Roadmap Update: Trust Tiers + Ski Buddy Board

## Where this sits

```
Sprint 29 (merged, live) → Mountain Board
  Per-resort, geofenced, GPS-verified public posting

Sprint 30 (new)          → Trust Tier & Verification Infrastructure
  OAuth linking, phone verification, tier system, moderation service
  wiring, report/review queue. Foundational — no user-facing board yet.

Sprint 31 (new)          → Ski Buddy Board
  Matchmaking + carpool board, depends on Sprint 30's is_verified() gate
```

## Why verification is its own sprint

Both Mountain Board and Ski Buddy Board are public-facing surfaces where strangers interact. Building the trust-tier system once, as shared infrastructure, is cheaper than bolting verification onto each board separately — and it means whatever decision gets made about gating Mountain Board posting behind Tier 1 later doesn't require re-architecting.

## Open decision to flag for a future sprint (not this one)

Sprint 29's Mountain Board currently gates posting on GPS-verified resort presence, not account verification tier. Once Sprint 30 ships, it's worth deciding whether Mountain Board should *also* require Tier 1 to post — right now a Tier 0 (unverified) account could still post to Mountain Board as long as it's within a resort geofence. That's a product call, not a technical blocker, and it's called out here so it doesn't get lost.

## Sequencing recommendation

1. ~~Finish Sprint 29 (Mountain Board) as currently scoped~~ — already merged and live (all sprints 1–29 shipped per ROADMAP.md)
2. Sprint 30 — Verification infrastructure (this is plumbing; low visual payoff but everything else depends on it)
3. Sprint 31 — Ski Buddy Board UI + posting flow
4. Revisit: should Mountain Board adopt Tier 1 gating too?

## Tech debt to fold in opportunistically

- ~~Arapahoe Basin missing from resort maps~~ — **already fixed.** Reconciled 2026-08-12 against the live repo: S29-T0 landed this fix (`src/lib/resorts.js`'s `RESORT_NAMES`/`RESORT_EMOJI`/`RESORT_PHOTOS`/`RESORT_ACCENTS` all have an `arapahoebasin` key), and Sprint 29 is fully merged. Sprint 31's pre-flight checklist item for this is already satisfied — no action needed.
- Resort coordinates hardcoded in three places (`App.jsx`'s `RESORTS` constant, `server/index.js`, and the `resort_coordinates` table) — still true as of 2026-08-12. Sprint 31 should not add a fourth; consume the shared reference table only.
