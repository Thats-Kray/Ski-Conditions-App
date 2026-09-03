/**
 * Pure, dependency-free logic for ski day details (Feed slice C1): grouping photo and
 * tag rows by session, validating a photo selection before any upload happens, and
 * formatting the Feed's "with …" line and the title.
 *
 * This module imports NOTHING on purpose. `npm test` runs `node --test src/lib/*.test.js`
 * with no DOM, no bundler and no Supabase client, so anything reachable from here must be
 * plain JS. Every consumer of these functions (socialApi.js, SkiDayDetailsForm.jsx,
 * ActivityFeed.jsx) does its own I/O and passes plain data in.
 */

/** Max photos attached to one ski day, counting photos already stored. */
export const MAX_PHOTOS_PER_SESSION = 6

/** Max bytes for a single photo. Inclusive — a file exactly this size is allowed. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

/**
 * Max title length, in CODEPOINTS — deliberately the same unit as the
 * ski_sessions_title_length CHECK constraint's char_length(), not UTF-16 code units.
 */
export const TITLE_MAX_LENGTH = 60

/**
 * Bucket rows into { [key]: [row, ...] }, oldest-first, without touching the input.
 *
 * Shared by both grouping functions below because the rule is identical and duplicating
 * it is how the two drift apart. The behaviour reproduces groupCommentsByActivity
 * (src/lib/activityComments.js) exactly:
 *
 *   - a fresh plain object, never the caller's array
 *   - a falsy key is skipped, not collected under "undefined" — such a bucket could
 *     never match a card and would only confuse whoever reads the object next
 *   - each bucket is sorted with a stamp() that returns Date.parse(...) when finite and
 *     Infinity otherwise, so an unparseable or missing created_at sorts LAST. That is
 *     the shape of a row spliced in locally before it has round-tripped, and it belongs
 *     at the end of the strip, not the front.
 */
function groupByKey(rows, keyField) {
  const grouped = {}

  for (const row of rows || []) {
    const key = row?.[keyField]
    if (!key) continue
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(row)
  }

  const stamp = (row) => {
    const ms = Date.parse(row?.created_at)
    return Number.isFinite(ms) ? ms : Infinity
  }

  for (const key of Object.keys(grouped)) {
    grouped[key].sort((a, b) => stamp(a) - stamp(b))
  }

  return grouped
}

/**
 * @param {Array<{id: string, session_id: string, user_id: string, storage_path: string, created_at: string, url?: string}> | null | undefined} rows
 * @returns {Record<string, Array<object>>} never null; {} when there is nothing to group
 */
export function groupPhotosBySession(rows) {
  return groupByKey(rows, "session_id")
}

/**
 * @param {Array<{id: string, session_id: string, tagged_user_id: string, tagged_by: string, created_at: string, profiles?: object|null}> | null | undefined} rows
 * @returns {Record<string, Array<object>>} never null; {} when there is nothing to group
 */
export function groupTagsBySession(rows) {
  return groupByKey(rows, "session_id")
}

/**
 * Split a picked file list into what may be uploaded and what may not, given how many
 * photos the session already has.
 *
 * Three rules, applied per file in this order:
 *   1. not an image (MIME type does not start with "image/") → "not-an-image"
 *   2. larger than MAX_PHOTO_BYTES → "too-large"
 *   3. no free slot left → "limit-reached"
 *
 * The order matters. A rejected file must NOT consume one of the remaining slots — if it
 * did, picking a 12MB burst shot would silently cost the user a photo slot they never
 * filled. And rejection is per file, never all-or-nothing: picking three photos where one
 * is oversized still uploads the other two (Global Constraints).
 *
 * Only .name, .size and .type are read, so a plain object stands in for a File in tests —
 * there is no DOM here and no upload harness.
 *
 * A junk existingCount (NaN, negative, undefined) clamps to 0 rather than becoming
 * "unlimited". Worst case the user is offered a full 6; the picker re-checks against its
 * own live count and the RLS/DB layer is the real boundary either way.
 *
 * @param {ArrayLike<{name?: string, size?: number, type?: string}> | null | undefined} files
 * @param {number} [existingCount=0] photos already attached to this session
 * @returns {{accepted: Array<object>, rejected: Array<{name: string, reason: "not-an-image"|"too-large"|"limit-reached"}>}}
 */
export function validatePhotoSelection(files, existingCount = 0) {
  const accepted = []
  const rejected = []

  const already = Number.isFinite(Number(existingCount)) && Number(existingCount) > 0
    ? Math.floor(Number(existingCount))
    : 0
  let remaining = Math.max(0, MAX_PHOTOS_PER_SESSION - already)

  for (const file of files || []) {
    const name = file?.name || "photo"

    if (!String(file?.type || "").startsWith("image/")) {
      rejected.push({ name, reason: "not-an-image" })
      continue
    }
    if (Number(file?.size) > MAX_PHOTO_BYTES) {
      rejected.push({ name, reason: "too-large" })
      continue
    }
    if (remaining <= 0) {
      rejected.push({ name, reason: "limit-reached" })
      continue
    }

    accepted.push(file)
    remaining -= 1
  }

  return { accepted, rejected }
}

/**
 * Render a tag list as the Feed's "with …" text: "Jane", "Jane and Mike",
 * "Jane, Mike and 1 other", "Jane, Mike and 2 others".
 *
 * Returns "" for an empty/null list — that empty string is the signal ActivityFeed.jsx
 * uses to omit the whole line, so it must never be "undefined" or a bare "with ".
 *
 * A tag whose profile lookup failed still COUNTS, rendered as "Someone". Dropping it
 * would make a transient profiles-query failure quietly understate who was there, which
 * is worse than an honest placeholder.
 *
 * @param {Array<{tagged_user_id: string, profiles?: {full_name?: string, username?: string}|null}> | null | undefined} tags
 * @param {number} [maxNames=2] names shown before collapsing the rest into "and N others"
 * @returns {string}
 */
export function formatTaggedNames(tags, maxNames = 2) {
  const names = []
  for (const row of tags || []) {
    names.push(row?.profiles?.full_name || row?.profiles?.username || "Someone")
  }

  if (names.length === 0) return ""
  if (names.length === 1) return names[0]

  const cap = Number.isFinite(maxNames) && maxNames >= 1 ? Math.floor(maxNames) : 2

  if (names.length <= cap) {
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
  }

  const extra = names.length - cap
  return `${names.slice(0, cap).join(", ")} and ${extra} other${extra === 1 ? "" : "s"}`
}

/**
 * Trim a typed title and cap it at TITLE_MAX_LENGTH codepoints.
 *
 * Array.from(), not String.prototype.slice: the DB CHECK is char_length(title) <= 60,
 * and char_length counts codepoints. slice() counts UTF-16 code units, which would cut a
 * 61-emoji title down to 30 characters (needlessly strict) and — worse — could cut
 * between a surrogate pair and store a lone surrogate.
 *
 * trimEnd() after the cut so a truncation landing on a space does not store a title that
 * ends in whitespace.
 *
 * Non-strings return "" rather than being coerced — "null"/"undefined"/"42" are not
 * titles. The caller (saveSkiDayDetails) turns "" into SQL NULL.
 *
 * @param {unknown} value
 * @returns {string} "" when there is no usable title
 */
export function clampTitle(value) {
  if (typeof value !== "string") return ""

  const trimmed = value.trim()
  const chars = Array.from(trimmed)
  if (chars.length <= TITLE_MAX_LENGTH) return trimmed

  return chars.slice(0, TITLE_MAX_LENGTH).join("").trimEnd()
}
