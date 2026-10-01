/**
 * The single source of truth for URL paths.
 *
 * Lives in lib/ rather than App.jsx for the same reason calendarDates.js does:
 * react-refresh/only-export-components forbids a component file from exporting
 * anything but its component. Being pure also makes it testable under the
 * existing `node --test src/lib/*.test.js` runner, which has no DOM.
 *
 * "today" maps to "/" rather than "/today" so the PWA start_url ("/" in
 * public/manifest.json) and the service worker's offline fallback
 * (caches.match("/")) both land on a real route with no redirect.
 */

/** Tab keys in nav order. Must match BOTTOM_TABS / NAV_ICONS in App.jsx. */
export const TABS = ["today", "plans", "track", "crew", "me"]

const PATH_BY_TAB = {
  today: "/",
  plans: "/plans",
  track: "/track",
  crew: "/crew",
  me: "/me",
}

/**
 * Detail routes that belong to a tab, so the nav highlight stays correct on
 * a detail page. Matched on a full segment boundary — "/tracksuit" must not
 * match "/track".
 */
const NESTED_PREFIX_TO_TAB = {
  "/trip": "plans",
  "/u": "crew",
  "/mountain": "today",
}

export function pathForTab(tab) {
  return PATH_BY_TAB[tab] || "/"
}

export function tabForPath(pathname) {
  if (!pathname) return "today"
  // Strip trailing slashes so "/plans/" behaves like "/plans", but keep bare "/".
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
  if (clean === "/" || clean === "") return "today"

  const exact = TABS.find((tab) => PATH_BY_TAB[tab] === clean)
  if (exact) return exact

  const prefix = Object.keys(NESTED_PREFIX_TO_TAB).find(
    (p) => clean === p || clean.startsWith(`${p}/`)
  )
  if (prefix) return NESTED_PREFIX_TO_TAB[prefix]

  // Unknown path renders the app on Today rather than a blank screen.
  return "today"
}

/**
 * Upgrades the pre-router share link (`/?trip=<id>`) to its real route.
 * Returns null when there is nothing to upgrade — importantly, it must not
 * claim Strava's or Supabase recovery's params.
 */
export function legacyTripPath(search) {
  const tripId = new URLSearchParams(search || "").get("trip")
  return tripId ? `/trip/${tripId}` : null
}
