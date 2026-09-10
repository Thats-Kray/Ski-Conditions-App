import { test } from "node:test"
import assert from "node:assert/strict"
import { PROFILE_WRITE_FIELDS, buildProfileUpdate } from "./profileForm.js"

// A profile row as getMyProfile() returns it (PROFILE_SELECT_COLUMNS in socialApi.js),
// including the two columns that are selectable but NOT writable.
const LOADED = {
  id: "u1",
  first_name: "Kyle", last_name: "Ray", full_name: "Kyle Ray",
  username: "kray", avatar_url: "https://example.test/a.png",
  skill_level: "black", sport_type: "ski", ski_passes: ["Ikon"],
  favorite_mountain: "Winter Park",
  vehicle_label: "Blue Subaru", vehicle_seats: 3,
  powder_alerts_enabled: true, alert_phone: "555-0100",
  theme: "storm-chaser",
  theme_mode: "light",
  is_admin: false, strava_athlete_id: 12345,
}

test("buildProfileUpdate returns exactly the writable field set", () => {
  assert.deepEqual(Object.keys(buildProfileUpdate(LOADED)).sort(), [...PROFILE_WRITE_FIELDS].sort())
  assert.equal(PROFILE_WRITE_FIELDS.includes("id"), false)
  assert.equal(PROFILE_WRITE_FIELDS.includes("is_admin"), false)
  assert.equal(PROFILE_WRITE_FIELDS.includes("strava_athlete_id"), false)
})

test("buildProfileUpdate carries every untouched field through", () => {
  // The live bug this exists to prevent: Edit Profile used to send an object
  // with no username and no favorite_mountain, and upsertMyProfile writes any
  // missing column as null — silently clearing both.
  const out = buildProfileUpdate(LOADED, { skill_level: "double_black" })
  assert.equal(out.username, "kray")
  assert.equal(out.favorite_mountain, "Winter Park")
  assert.equal(out.vehicle_label, "Blue Subaru")
  assert.equal(out.theme, "storm-chaser")
  assert.equal(out.skill_level, "double_black")
})

test("buildProfileUpdate preserves the powder-alert fields when another screen saves", () => {
  // Edit Profile no longer renders these; the Notifications sheet owns them.
  const out = buildProfileUpdate(LOADED, { vehicle_seats: 4 })
  assert.equal(out.powder_alerts_enabled, true)
  assert.equal(out.alert_phone, "555-0100")
})

test("buildProfileUpdate preserves everything else when the Notifications sheet saves", () => {
  const out = buildProfileUpdate(LOADED, { powder_alerts_enabled: false, alert_phone: null })
  assert.equal(out.powder_alerts_enabled, false)
  assert.equal(out.alert_phone, null)
  assert.equal(out.username, "kray")
  assert.equal(out.ski_passes.length, 1)
})

test("a name change recomputes full_name instead of keeping the stale one", () => {
  const out = buildProfileUpdate(LOADED, { first_name: "Kyle", last_name: "Rayburn" })
  assert.equal(out.full_name, "Kyle Rayburn")
})

test("an explicit full_name wins over the derived one", () => {
  const out = buildProfileUpdate(LOADED, { first_name: "K", last_name: "R", full_name: "DJ Pow" })
  assert.equal(out.full_name, "DJ Pow")
})

test("a single-word name leaves last_name null and full_name that word", () => {
  const out = buildProfileUpdate(LOADED, { first_name: "Cher", last_name: "" })
  assert.equal(out.last_name, null)
  assert.equal(out.full_name, "Cher")
})

test("buildProfileUpdate keeps false as false and turns undefined into null", () => {
  const out = buildProfileUpdate({ powder_alerts_enabled: false })
  assert.equal(out.powder_alerts_enabled, false)   // not null
  assert.equal(out.username, null)
  assert.equal(out.theme, null)                    // upsertMyProfile defaults this to "blizzard"
})

test("buildProfileUpdate tolerates a null profile", () => {
  const out = buildProfileUpdate(null, { theme: "aurora-peak" })
  assert.equal(out.theme, "aurora-peak")
  assert.deepEqual(Object.keys(out).sort(), [...PROFILE_WRITE_FIELDS].sort())
})

test("buildProfileUpdate carries theme_mode through when another screen saves", () => {
  // theme_mode is written by exactly one control (the Appearance card's light/dark
  // toggle). Every other save on the Profile page must preserve it, or flipping to
  // light mode and then editing your name would silently put you back in dark.
  const out = buildProfileUpdate(LOADED, { first_name: "Kyle", last_name: "Rayburn" })
  assert.equal(out.theme_mode, "light")
  assert.equal(PROFILE_WRITE_FIELDS.includes("theme_mode"), true)
})

test("buildProfileUpdate lets the Appearance toggle set theme_mode without disturbing theme", () => {
  const out = buildProfileUpdate(LOADED, { theme_mode: "dark" })
  assert.equal(out.theme_mode, "dark")
  assert.equal(out.theme, "storm-chaser")
  assert.equal(out.username, "kray")
})
