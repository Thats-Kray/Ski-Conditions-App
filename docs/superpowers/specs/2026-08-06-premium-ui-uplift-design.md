# Premium UI Uplift — Design Spec

**Date:** 2026-08-06
**Status:** Approved for planning
**Source mockups:** `mockups/Stitch_Premium_Redesigns/crew_planning_dashboard_1/`

## Goal

Redesign the app toward a sleeker, premium look and feel, using the Stitch mockups as
visual reference, while staying within the existing dark "Blizzard Theme" design-token
system already established in `src/index.css` and `src/components/ui/`.

## Scope

Five screens, one plan, phased execution:

1. Mountain Page (`Mountain Report Hub` mockup)
2. Crew Planning / Plans tab, mobile only (`Crew Planning Dashboard 2` mockup)
3. Home dashboard (`Powdays Home Page` mockup)
4. Social Feed (`Social Feed` mockup) — visual reskin only, see constraints below
5. Profile (`profile page and season` mockup)

The `Snow Conditions dashboard` mockup's per-resort card style is adopted as a new shared
component (`ResortSummaryCard`) used wherever resort listings render, rather than being
its own standalone screen. The desktop `Crew Planning Dashboard` mockup (grid layout) is
**not** pursued this sprint — Plans/Crew is mobile-first only.

## Locked decisions

- **Accent color:** existing `--color-accent` blue/cyan tokens only. The gold/amber
  accent seen in the Crew Planning mockups is explicitly deferred — revisit once more
  screens are mapped out. Do not introduce a gold token this sprint.
- **Navigation:** unchanged. Bottom nav stays `Home / Snow / Plans / Social / Profile`
  (`src/App.jsx` `NAV_ITEMS` + `BottomNav`/`TopNav`). The mockups' varying nav
  taxonomies (desktop Dashboard/Crew/Trips/Chat, Report Hub's Home/Reports/Cams/
  Tickets/Profile) are not implemented — they were mockup-generation artifacts or,
  in the Report Hub's case, screen-local tab chrome that the real global nav already
  supersedes.
- **Powder score scale/logic:** unchanged. The mockups show the same score (12) labeled
  both "Good" and "Poor" on different screens — confirmed to be a mockup/screenshot
  artifact, not a real scoring bug. No changes to scoring logic this sprint.
- **Social Feed:** reskin the existing text-based `ActivityFeed.jsx` (avatar + one-line
  description + emoji reactions) with the mockup's premium card styling. The mockup's
  photo + route-map-thumbnail post type (vertical gained, run name, elevation profile)
  is **out of scope** — it would require new photo upload storage and route/polyline
  capture that don't exist today. Do not build it as part of this sprint.
- **Mountain Page Events:** build as a real minimal feature (not a static/mock stub).
- **Active Crew rail:** resurrect and restyle `src/components/TodaysCrew.jsx`. Confirmed
  via `git log -S"TodaysCrew"` that it was orphaned when the Home dashboard was
  rewritten in sprints 10/11 (commit `4447549` only cleaned up dead scroll-helper
  functions that pointed to it, not a deliberate product decision to cut it) — safe to
  build on top of.

## Sequencing

1. **Mountain Page** — deepest screen; produces most new shared primitives as a
   byproduct (hero/scrim treatment, stat strip, colored bulletin card, events card).
2. **Extract shared primitives** into `src/components/ui/` for reuse.
3. **Crew/Plans (mobile)** — Active Crew rail (from `TodaysCrew.jsx`) + restyled
   `UpcomingStrip` (already exists in `SkiPlansPage.jsx`, close to the mockup already)
   + "Plan a Trip" CTA into `CreateTripModal`.
4. **Home dashboard** reskin.
5. **Social Feed** reskin.
6. **Profile** reskin.

## New shared primitives (`src/components/ui/`)

| Component | Purpose | Notes |
|---|---|---|
| `HeroPhotoHeader` | Photo + gradient scrim + title/badges/score overlay | Generalizes the hero block already in `MountainPage.jsx`; reusable on Home |
| `StatStrip` | Row of icon/value/label stat tiles | Mountain Stats block (fresh/base/lifts) |
| `AccentCard` | Colored-left-border card variant | New variant alongside existing `Card`; used for bulletin posts |
| `ResortSummaryCard` | Resort logo, pass badge, dual `ScoreRing`, 24h/base/skiers stat row, action buttons | Replaces ad hoc resort-listing markup; must render real varied per-resort data, not the mockup's duplicated placeholder |
| `EventCard` | Date block + title/description + link | Mountain Page events widget |
| `AvatarStatusRail` | Horizontal scroll of avatars with status dot + label | Generalized from `TodaysCrew.jsx`'s existing status logic (`arrived`/`driving`/`planning`/`done`) |

All new primitives are styled via existing CSS custom properties in `index.css` — no new
styling framework, no Tailwind migration.

## Data model change

New table `mountain_events`:

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `resort_key` | text | matches existing resort key convention |
| `title` | text | |
| `description` | text | |
| `event_date` | date | |
| `link_url` | text, nullable | "Learn More" target |
| `created_by` | uuid, fk → auth user | |
| `created_at` | timestamptz | |

Permission model: any authenticated user can create an event, all events are publicly
readable — same shape as bulletin board posts in `MountainBoard.jsx`. Follow the
existing RLS pattern used there; do **not** write a policy that references `auth.users`
directly (see `[[project_schema_gotchas]]` — RLS policies can't reference `auth.users`
directly, this bit the project before with the Mountain Board).

## Widget registry integration

`src/lib/mountainPageWidgets.js` gains a new `events` entry alongside the existing
`board` entry, following the established `{ key, label, rolloutResorts, Component }`
shape:

```js
export const MOUNTAIN_PAGE_WIDGETS = [
  { key: "board", label: "📋 Board", rolloutResorts: "all", Component: MountainBoard },
  { key: "events", label: "📅 Events", rolloutResorts: ["kramesbutte"], Component: EventsWidget },
]
```

Starting the new widget on `kramesbutte`-only rollout follows the project's established
pattern of staging new Mountain Page features on the dev resort before promoting to
`"all"` (see `[[project_2026_08_04_mountain_page_session]]`).

## Error handling / empty states

- `EventsWidget`: loading state, empty state ("No upcoming events yet")
- `ResortSummaryCard`: null-safe stat rendering (`—` fallback), matching the existing
  pattern already used for resort stats in `App.jsx` (e.g.
  `r.snowPrev24in != null ? \`${r.snowPrev24in}"\` : "—"`)
- `AvatarStatusRail`: empty state when no crew members have an active plan today

## Testing / verification

No automated test framework exists in this repo (confirmed — no test runner in
`package.json`, no `*.test.*` files). Verification is manual per this project's existing
convention: run `npm run dev`, walk each screen in the browser against its mockup,
checking both populated and empty states.

## Git workflow

Build on a feature branch, not directly on `main`. `main` is currently clean at
`a6b458c`. The pre-redesign version remains fully intact in git history and on `main`
until the branch is merged.
