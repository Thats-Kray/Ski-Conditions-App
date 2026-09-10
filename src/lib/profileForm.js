/**
 * The one place a profiles write payload is assembled (TASK 22.0, Profile slice).
 *
 * upsertMyProfile() in socialApi.js builds its payload from an explicit column
 * list with `|| null` / `?? false` fallbacks, so it writes a WHOLE ROW: any
 * column missing from the object handed to it is written as null or false.
 *
 * Before this module, three of the four write paths on the Profile page spread
 * `...profile` and one — Edit Profile's Save — did not. That one sent no
 * `username` and no `favorite_mountain`, so saving Edit Profile silently
 * cleared the user's handle and favourite mountain. Splitting the powder-alert
 * fields into their own Notifications screen would have made a second, worse
 * version of the same bug (Save on Edit Profile turning the alert back off).
 *
 * So: never hand upsertMyProfile a bare object literal. Always
 * buildProfileUpdate(loadedProfile, { justTheFieldsThisScreenOwns }).
 */

/**
 * Exactly the columns upsertMyProfile writes (socialApi.js:446-466), minus the
 * ones it derives itself (`id`, `updated_at`). `is_admin` and `strava_athlete_id`
 * are readable via PROFILE_SELECT_COLUMNS but are NOT writable here — that is
 * why this whitelists rather than spreading the loaded row wholesale.
 */
export const PROFILE_WRITE_FIELDS = [
  "first_name",
  "last_name",
  "full_name",
  "username",
  "avatar_url",
  "ski_passes",
  "favorite_mountain",
  "sport_type",
  "skill_level",
  "vehicle_label",
  "vehicle_seats",
  "powder_alerts_enabled",
  "alert_phone",
  "theme",
  "theme_mode",
]

/**
 * Merge the fields one screen owns onto the profile row that screen loaded, and
 * return the full writable row.
 *
 * @param {object|null|undefined} profile the row from getMyProfile()
 * @param {object} [changes] only the fields this screen edits
 * @returns {object} every key in PROFILE_WRITE_FIELDS, never undefined values
 */
export function buildProfileUpdate(profile, changes = {}) {
  const merged = { ...(profile || {}), ...changes }

  const payload = {}
  for (const field of PROFILE_WRITE_FIELDS) {
    payload[field] = merged[field] ?? null
  }

  // full_name is stored, not derived, so a rename that only sets first/last
  // would otherwise write the OLD full_name back and the change would appear
  // to have been ignored everywhere full_name is displayed.
  const renamed = changes.first_name !== undefined || changes.last_name !== undefined
  if (renamed && changes.full_name === undefined) {
    payload.full_name = [payload.first_name, payload.last_name].filter(Boolean).join(" ") || null
  }

  // "" is not a value any of these columns should hold; upsertMyProfile would
  // coerce it to null anyway, so normalise here where it is testable.
  for (const field of PROFILE_WRITE_FIELDS) {
    if (payload[field] === "") payload[field] = null
  }

  return payload
}
