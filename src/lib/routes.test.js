import { test } from "node:test"
import assert from "node:assert/strict"
import { TABS, pathForTab, tabForPath, legacyTripPath } from "./routes.js"

test("TABS is the five-tab IA in nav order", () => {
  assert.deepEqual(TABS, ["today", "plans", "track", "crew", "me"])
})

test("today is the root path, not /today", () => {
  assert.equal(pathForTab("today"), "/")
  assert.equal(tabForPath("/"), "today")
})

test("every tab round-trips through path and back", () => {
  for (const tab of TABS) {
    assert.equal(tabForPath(pathForTab(tab)), tab, `round-trip failed for ${tab}`)
  }
})

test("non-root tabs get their own path", () => {
  assert.equal(pathForTab("plans"), "/plans")
  assert.equal(pathForTab("crew"), "/crew")
})

test("an unknown tab falls back to root rather than throwing", () => {
  assert.equal(pathForTab("nope"), "/")
})

test("an unknown path resolves to today, so a bad URL still renders the app", () => {
  assert.equal(tabForPath("/garbage"), "today")
  assert.equal(tabForPath(""), "today")
})

test("a trip detail page keeps the Plans tab highlighted", () => {
  assert.equal(tabForPath("/trip/abc-123"), "plans")
})

test("a user profile page keeps the Crew tab highlighted", () => {
  assert.equal(tabForPath("/u/some-uuid"), "crew")
})

test("a mountain page keeps the Today tab highlighted", () => {
  assert.equal(tabForPath("/mountain/vail"), "today")
})

test("a trailing slash does not break tab resolution", () => {
  assert.equal(tabForPath("/plans/"), "plans")
})

test("a prefix must not match a different tab by accident", () => {
  // "/tracksuit" is not "/track".
  assert.equal(tabForPath("/tracksuit"), "today")
})

test("legacyTripPath upgrades the old ?trip= share link", () => {
  assert.equal(legacyTripPath("?trip=abc-123"), "/trip/abc-123")
})

test("legacyTripPath ignores unrelated params so Strava and recovery survive", () => {
  assert.equal(legacyTripPath("?strava_connected=true"), null)
  assert.equal(legacyTripPath(""), null)
})
