# Light/Dark mode — click-test list for Kyle

Assembled by Task 22 (whole-app verification gate), the last task of
`docs/superpowers/plans/2026-09-10-light-dark-mode.md`. Every retrofit task (1-21) contributed a
line to Section B; verified against the shipped code before handoff — see
`task-22-report.md` in `.superpowers/sdd/2026-09-10-light-dark-mode/` for what was checked and how.

**Before you start:** run `migrations/048_theme_mode.sql` in the Supabase SQL editor and then
`NOTIFY pgrst, 'reload schema';`. Then sign in, go to **Profile > Appearance**, and flip to
**Light**.

## A. Dark mode first — this branch changed dark mode in four small, deliberate ways.

1. In each of Alpine Dawn, Storm Chaser, Aurora Peak and Base Lodge: the top nav, mobile top bar
   and bottom nav should now match that theme's own background instead of Blizzard's blue-black,
   and links should match the theme's accent. This is a fix for a bug that shipped with the theme
   system.
2. Body text that used to be pure white is now each theme's near-white tint. It should read as
   *more* consistent, not less. If you hate it, say so — it is a one-line rollback
   (`--color-text-1: #ffffff` in `:root`).
3. Modal backdrops are all one of three dim levels now (`--scrim-soft` / `--scrim` /
   `--scrim-strong`) instead of seven slightly different ones.
4. Modal and sheet panels are fully opaque and take their theme's hue.

## B. Light mode, screen by screen.

5. **Shell:** top nav, mobile top bar, bottom nav, the unread badges on the bell and on the
   bottom-nav tabs, the notification dropdown, the default no-photo avatar.
6. **Today:** card view, list view, an expanded resort row, map view and a marker popup, the
   Today's Crew strip, a nudge banner, the events widget. *The resort hero photo keeps its dark
   gradient and white chips — correct, by design (E3 photo-overlay exception).*
7. **Shared primitives:** any card, a tier badge and a risk badge (check all six rating colours),
   a stat strip, a score ring, an initials avatar, a primary button, the resort picker, the GIF
   picker, the photo message composer.
8. **Plans:** the plan list, both sub-tabs, the month calendar with today and a weekend visible, a
   day with a plan, the plan editor, the date matchmaker, the friends calendar, the Profile season
   grid (all five heat tiers must still be ordered and distinguishable).
9. **Trips:** create a trip end to end including the resort photo picker and the theme picker;
   then a trip card in the list, its avatar stack, the "Who's going" badge in both variants, and
   trip chat with your bubble beside someone else's.
10. **Trip detail:** header, all seven cosmetic trip themes, going/maybe/out chips, date-vote rows,
    car seats, packing list, chat tab, edit sheet. *The densest screen in the app — spend the
    longest here.*
11. **Crew chat:** crew list, an open chat, the member avatar stack with a +N disc, the invite
    sheet, create-crew mid-save, a pending invite.
12. **Crew boards:** leaderboard in both modes with every category chip, the powder-day toggle
    knob, your highlighted row, the log-a-day sheet; the ski-buddy board with a post and a
    response; posting a buddy request including its error state; the mountain board with each
    filter selected; the activity feed with a comment thread and the report dialog.
13. **Crew people:** friends list with a pending request, the tag picker, a friend's mini profile
    modal (its header banner especially), the messaging centre at mobile and desktop widths, a DM
    thread, the ski-ping composer with nobody and with two people selected, a nudge sheet.
14. **Profile:** hero, both stat strips, the season/all-time toggle, the season grid, the
    Appearance card (both rows), Edit Profile's skill picker (its five colour chips are
    deliberately untokenised — confirm they still look right), Season Passes pills, Vehicle card,
    all five settings rows and their sheets, the history list. Then a friend's profile — the
    Appearance card must be absent (verified in source: it is gated on `isOwnProfile`).
15. **Share card:** Profile > Create share card, in all 5 themes. Light background, dark text,
    visible mountains and snowflakes, a themed Share button. Then a session card from a resort
    with a hero photo — that one stays dark with white text in both modes, by design.
16. **Onboarding and integrations:** force light mode first
    (`localStorage.setItem("pd_theme_mode","light")`), then run onboarding start to finish, the
    profile setup screen with the seat stepper at zero, the Strava connect card, a sync review, the
    verification upgrade modal mid-save.
17. **Track and session:** start a session, the active session bar collapsed and expanded plus its
    toggle knob, the check-in form, end the session and go through the recap including a photo
    upload and its error state, edit a logged session, add day details with a photo and a friend
    tag.
18. **Auth:** sign out while in light mode. The landing page, sign-in panel and sign-up form render
    **dark**, because a signed-out visitor has no `data-mode` attribute set on `<html>`. Confirm
    nothing looks half-light.

## C. The two things most likely to be wrong.

19. **Anything you can barely read.** The `--ink-20` to `--ink-40` steps are deliberately below
    the 4.5:1 contrast line in both modes, matching how dark mode already looks. If a specific
    caption is worse in light than in dark, that is a bug — tell us the screen.
20. **Anything that stayed dark.** A black panel, a black chip or dark ring on a light page is a
    missed Rule 3 substitution. Screenshot it; the fix is one line.

## Known, deliberate exceptions (not bugs — do not report these)

- `ProfilePage.jsx` / `UserProfileModal.jsx` / `ProfileSetup.jsx` / `OnboardingFlow.jsx`: the
  "Black" skill-level swatch is a fixed `rgba(255,255,255,0.85-0.9)` on all five colour chips,
  theme-invariant by design (E2).
- `TripDetailModal.jsx` (THEME table + the snowflake/wind-streak/"You're hosting" caption),
  `PowderMap.jsx` (marker gloss highlight), `TodayScreen.jsx`/`TripCard.jsx`/
  `CreateTripModal.jsx`/`HeroPhotoHeader.jsx`/`HeroBannerStrip.jsx`/`ShareStatCard.jsx` (resort
  and session hero-photo overlays): all frozen dark/white-alpha literals on top of real photos,
  confirmed exceptions (E3).
- `ui/StatStrip.jsx`: one frozen white-alpha label paired with an equally-frozen dark background,
  deliberately non-adaptive.
- `shareCardTokens.js`: the 5 dark themes' `ink: "#ffffff"` and the 5 light themes' `bgElevated:
  "#ffffff"` are both correct values for their mode, not leftover literals.
