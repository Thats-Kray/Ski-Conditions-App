import { test } from "node:test"
import assert from "node:assert/strict"
import {
  groupPhotosBySession,
  groupTagsBySession,
  validatePhotoSelection,
  formatTaggedNames,
  clampTitle,
  MAX_PHOTOS_PER_SESSION,
  MAX_PHOTO_BYTES,
  TITLE_MAX_LENGTH,
} from "./skiDayDetails.js"

const photo = (id, session_id, created_at) => ({
  id,
  session_id,
  user_id: "u1",
  storage_path: `u1/${session_id}/${id}.jpg`,
  created_at,
})

const tag = (id, session_id, tagged_user_id, created_at, profiles = null) => ({
  id,
  session_id,
  tagged_user_id,
  tagged_by: "owner",
  created_at,
  profiles,
})

// A stand-in for a browser File. validatePhotoSelection only ever reads .name, .size
// and .type, deliberately, so it is unit-testable with no DOM and no upload harness.
const file = (name, size, type = "image/jpeg") => ({ name, size, type })

/* ── constants ─────────────────────────────────────────────────────────────── */

test("exports the three caps the whole slice is written against", () => {
  // These are asserted rather than assumed because the migration's CHECK constraint
  // (60) and the storage/UI limits (6, 5MB) are duplicated in SQL and in three
  // components. If someone edits one of these numbers, this is the test that says so.
  assert.equal(MAX_PHOTOS_PER_SESSION, 6)
  assert.equal(MAX_PHOTO_BYTES, 5 * 1024 * 1024)
  assert.equal(TITLE_MAX_LENGTH, 60)
})

/* ── groupPhotosBySession ──────────────────────────────────────────────────── */

test("groupPhotosBySession buckets rows by session_id", () => {
  const rows = [photo("p1", "s1", "2026-09-01T10:00:00Z"), photo("p2", "s2", "2026-09-01T11:00:00Z")]
  const grouped = groupPhotosBySession(rows)
  assert.deepEqual(Object.keys(grouped).sort(), ["s1", "s2"])
  assert.deepEqual(grouped.s1.map((r) => r.id), ["p1"])
  assert.deepEqual(grouped.s2.map((r) => r.id), ["p2"])
})

test("groupPhotosBySession sorts each bucket oldest-first", () => {
  // The thumbnail strip reads left-to-right in upload order, which is the opposite of
  // the feed's own newest-first ordering. Getting it backwards is silently wrong.
  const rows = [
    photo("late", "s1", "2026-09-01T12:00:00Z"),
    photo("early", "s1", "2026-09-01T08:00:00Z"),
    photo("mid", "s1", "2026-09-01T10:00:00Z"),
  ]
  assert.deepEqual(groupPhotosBySession(rows).s1.map((r) => r.id), ["early", "mid", "late"])
})

test("groupPhotosBySession returns {} for empty, null and undefined input", () => {
  assert.deepEqual(groupPhotosBySession([]), {})
  assert.deepEqual(groupPhotosBySession(null), {})
  assert.deepEqual(groupPhotosBySession(undefined), {})
})

test("groupPhotosBySession drops rows with no session_id", () => {
  const rows = [photo("p1", "s1", "2026-09-01T10:00:00Z"), photo("p2", null, "2026-09-01T11:00:00Z")]
  const grouped = groupPhotosBySession(rows)
  assert.deepEqual(Object.keys(grouped), ["s1"])
  assert.equal(grouped.s1.length, 1)
})

test("groupPhotosBySession never mutates or reorders the caller's array", () => {
  const rows = [
    photo("late", "s1", "2026-09-01T12:00:00Z"),
    photo("early", "s1", "2026-09-01T08:00:00Z"),
  ]
  groupPhotosBySession(rows)
  assert.deepEqual(rows.map((r) => r.id), ["late", "early"])
})

/* ── groupTagsBySession ────────────────────────────────────────────────────── */

test("groupTagsBySession buckets rows by session_id and keeps profiles attached", () => {
  const rows = [
    tag("t1", "s1", "friendA", "2026-09-01T10:00:00Z", { id: "friendA", full_name: "Jane Doe" }),
    tag("t2", "s2", "friendB", "2026-09-01T11:00:00Z", { id: "friendB", full_name: "Mike" }),
  ]
  const grouped = groupTagsBySession(rows)
  assert.deepEqual(Object.keys(grouped).sort(), ["s1", "s2"])
  assert.equal(grouped.s1[0].profiles.full_name, "Jane Doe")
})

test("groupTagsBySession sorts a row with no created_at last, not first", () => {
  // Mirrors groupCommentsByActivity's Infinity rule exactly: a locally-spliced row that
  // has not round-tripped yet has no created_at, and it belongs at the END of the list.
  // Treating an unparseable timestamp as 0 would jump it to the front.
  const rows = [
    tag("pending", "s1", "friendB", undefined),
    tag("existing", "s1", "friendA", "2026-09-01T08:00:00Z"),
  ]
  assert.deepEqual(groupTagsBySession(rows).s1.map((r) => r.id), ["existing", "pending"])
})

test("groupTagsBySession returns {} for empty, null and undefined input", () => {
  assert.deepEqual(groupTagsBySession([]), {})
  assert.deepEqual(groupTagsBySession(null), {})
  assert.deepEqual(groupTagsBySession(undefined), {})
})

test("groupTagsBySession keeps buckets independent", () => {
  const rows = [tag("t1", "s1", "a", "2026-09-01T10:00:00Z"), tag("t2", "s2", "b", "2026-09-01T11:00:00Z")]
  const grouped = groupTagsBySession(rows)
  grouped.s1.push(tag("t3", "s1", "c", "2026-09-01T12:00:00Z"))
  assert.equal(grouped.s2.length, 1)
})

/* ── validatePhotoSelection ────────────────────────────────────────────────── */

test("validatePhotoSelection accepts a normal in-budget selection", () => {
  const files = [file("a.jpg", 1000), file("b.png", 2000, "image/png")]
  const { accepted, rejected } = validatePhotoSelection(files, 0)
  assert.deepEqual(accepted.map((f) => f.name), ["a.jpg", "b.png"])
  assert.deepEqual(rejected, [])
})

test("validatePhotoSelection rejects an oversized file individually, keeping the rest", () => {
  // Global Constraint: oversized files are rejected one at a time, NOT by refusing the
  // whole selection. Picking 3 photos where one is a 12MB burst shot must still upload
  // the other two.
  const files = [file("ok.jpg", 1000), file("huge.jpg", MAX_PHOTO_BYTES + 1), file("ok2.jpg", 1000)]
  const { accepted, rejected } = validatePhotoSelection(files, 0)
  assert.deepEqual(accepted.map((f) => f.name), ["ok.jpg", "ok2.jpg"])
  assert.deepEqual(rejected, [{ name: "huge.jpg", reason: "too-large" }])
})

test("validatePhotoSelection accepts a file exactly at the size cap", () => {
  // Boundary: the cap is a maximum, not an exclusive bound. An off-by-one here rejects
  // a legitimate file with no explanation the user can act on.
  const { accepted, rejected } = validatePhotoSelection([file("edge.jpg", MAX_PHOTO_BYTES)], 0)
  assert.equal(accepted.length, 1)
  assert.deepEqual(rejected, [])
})

test("validatePhotoSelection rejects non-images by MIME type", () => {
  const files = [file("clip.mov", 1000, "video/quicktime"), file("notes.pdf", 500, "application/pdf")]
  const { accepted, rejected } = validatePhotoSelection(files, 0)
  assert.deepEqual(accepted, [])
  assert.deepEqual(rejected, [
    { name: "clip.mov", reason: "not-an-image" },
    { name: "notes.pdf", reason: "not-an-image" },
  ])
})

test("validatePhotoSelection stops at the remaining slot count, counting already-attached photos", () => {
  // existingCount = 4 leaves 2 free slots out of MAX_PHOTOS_PER_SESSION = 6.
  const files = [file("1.jpg", 10), file("2.jpg", 10), file("3.jpg", 10)]
  const { accepted, rejected } = validatePhotoSelection(files, 4)
  assert.deepEqual(accepted.map((f) => f.name), ["1.jpg", "2.jpg"])
  assert.deepEqual(rejected, [{ name: "3.jpg", reason: "limit-reached" }])
})

test("validatePhotoSelection accepts nothing when the session is already full", () => {
  const { accepted, rejected } = validatePhotoSelection([file("1.jpg", 10)], MAX_PHOTOS_PER_SESSION)
  assert.deepEqual(accepted, [])
  assert.deepEqual(rejected, [{ name: "1.jpg", reason: "limit-reached" }])
})

test("validatePhotoSelection does not let a rejected file consume a slot", () => {
  // The oversized file must NOT count against the 6-photo budget — otherwise picking a
  // huge file silently costs the user a slot they never filled. existingCount = 5 leaves
  // exactly 1 slot; the huge file is rejected for size and "good.jpg" still takes it.
  const files = [file("huge.jpg", MAX_PHOTO_BYTES * 2), file("good.jpg", 10)]
  const { accepted, rejected } = validatePhotoSelection(files, 5)
  assert.deepEqual(accepted.map((f) => f.name), ["good.jpg"])
  assert.deepEqual(rejected, [{ name: "huge.jpg", reason: "too-large" }])
})

test("validatePhotoSelection tolerates null/undefined input and a junk existingCount", () => {
  assert.deepEqual(validatePhotoSelection(null, 0), { accepted: [], rejected: [] })
  assert.deepEqual(validatePhotoSelection(undefined, 0), { accepted: [], rejected: [] })
  // A junk count must not silently become "unlimited": NaN/negative/undefined all clamp
  // to 0, so at worst the user is allowed a full 6 and RLS/UI re-check catches the rest.
  assert.equal(validatePhotoSelection([file("a.jpg", 10)], NaN).accepted.length, 1)
  assert.equal(validatePhotoSelection([file("a.jpg", 10)], -3).accepted.length, 1)
  assert.equal(validatePhotoSelection([file("a.jpg", 10)], undefined).accepted.length, 1)
})

/* ── formatTaggedNames ─────────────────────────────────────────────────────── */

test("formatTaggedNames renders one, two and three names in natural English", () => {
  const one = [tag("t1", "s1", "a", "2026-09-01T10:00:00Z", { full_name: "Jane Doe" })]
  const two = [...one, tag("t2", "s1", "b", "2026-09-01T11:00:00Z", { full_name: "Mike" })]
  const three = [...two, tag("t3", "s1", "c", "2026-09-01T12:00:00Z", { full_name: "Sam" })]
  assert.equal(formatTaggedNames(one), "Jane Doe")
  assert.equal(formatTaggedNames(two), "Jane Doe and Mike")
  assert.equal(formatTaggedNames(three), "Jane Doe, Mike and 1 other")
})

test("formatTaggedNames pluralises the overflow count", () => {
  const rows = ["a", "b", "c", "d"].map((id, i) =>
    tag(`t${i}`, "s1", id, `2026-09-0${i + 1}T10:00:00Z`, { full_name: id.toUpperCase() })
  )
  assert.equal(formatTaggedNames(rows), "A, B and 2 others")
})

test("formatTaggedNames falls back username → 'Someone' when a profile is missing", () => {
  // A tag whose profile lookup failed must still be COUNTED, not dropped — otherwise a
  // transient profiles query failure makes the "with …" line quietly understate reality.
  const rows = [
    tag("t1", "s1", "a", "2026-09-01T10:00:00Z", { username: "powhound" }),
    tag("t2", "s1", "b", "2026-09-01T11:00:00Z", null),
  ]
  assert.equal(formatTaggedNames(rows), "powhound and Someone")
})

test("formatTaggedNames returns an empty string for empty, null and undefined input", () => {
  // "" is the signal ActivityFeed.jsx uses to omit the whole "with …" line, so it must
  // never be "undefined" or "with ".
  assert.equal(formatTaggedNames([]), "")
  assert.equal(formatTaggedNames(null), "")
  assert.equal(formatTaggedNames(undefined), "")
})

test("formatTaggedNames honours a custom maxNames", () => {
  const rows = ["a", "b", "c"].map((id, i) =>
    tag(`t${i}`, "s1", id, `2026-09-0${i + 1}T10:00:00Z`, { full_name: id.toUpperCase() })
  )
  assert.equal(formatTaggedNames(rows, 3), "A, B and C")
  assert.equal(formatTaggedNames(rows, 1), "A and 2 others")
})

/* ── clampTitle ────────────────────────────────────────────────────────────── */

test("clampTitle trims and passes through a normal title", () => {
  assert.equal(clampTitle("  Powder day at Vail  "), "Powder day at Vail")
  assert.equal(clampTitle(""), "")
  assert.equal(clampTitle("   "), "")
})

test("clampTitle truncates at TITLE_MAX_LENGTH and never leaves a trailing space", () => {
  const long = "x".repeat(TITLE_MAX_LENGTH + 20)
  assert.equal(clampTitle(long).length, TITLE_MAX_LENGTH)
  // 59 x's then a space then more: the cut lands on the space, which must be trimmed off
  // rather than saved as a title ending in whitespace.
  const spacey = `${"x".repeat(TITLE_MAX_LENGTH - 1)} tail`
  assert.equal(clampTitle(spacey), "x".repeat(TITLE_MAX_LENGTH - 1))
})

test("clampTitle counts codepoints, not UTF-16 units, and never splits a surrogate pair", () => {
  // ski_sessions_title_length uses Postgres char_length(), which counts CODEPOINTS.
  // A naive s.slice(0, 60) counts UTF-16 code units, so 61 emoji would be cut to 30
  // characters (over-strict) AND a cut landing mid-pair would store a lone surrogate.
  const emoji = "🎿".repeat(TITLE_MAX_LENGTH + 5)
  const clamped = clampTitle(emoji)
  assert.equal([...clamped].length, TITLE_MAX_LENGTH)
  assert.equal(clamped, "🎿".repeat(TITLE_MAX_LENGTH))
  // Non-strings are coerced to "", never to "null"/"undefined"/"42".
  assert.equal(clampTitle(null), "")
  assert.equal(clampTitle(undefined), "")
  assert.equal(clampTitle(42), "")
})
