import { useState, useRef, useEffect } from "react"
import FriendTagPicker from "./FriendTagPicker"
import {
  validatePhotoSelection,
  clampTitle,
  MAX_PHOTOS_PER_SESSION,
  MAX_PHOTO_BYTES,
  TITLE_MAX_LENGTH,
} from "../lib/skiDayDetails"

const labelStyle = {
  display: "block", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)",
  marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5,
}

const inputStyle = {
  width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10, padding: "10px 12px", color: "white", fontSize: 14, boxSizing: "border-box",
  outline: "none",
}

const REJECT_COPY = {
  "not-an-image": "isn't an image",
  "too-large": `is over ${Math.round(MAX_PHOTO_BYTES / (1024 * 1024))}MB`,
  "limit-reached": `didn't fit — ${MAX_PHOTOS_PER_SESSION} photos max`,
}

/**
 * The shared "add details to this ski day" sub-form: an optional title, up to
 * MAX_PHOTOS_PER_SESSION photos, and a friends-only tag picker. Used by LogDayModal's
 * third step, SessionRecapModal's details section, and SessionEditForm.
 *
 * This component makes NO API calls. onSave receives a diff —
 * { title, addedPhotoFiles, removedPhotoIds, tagUserIds } — and the consumer hands that to
 * saveSkiDayDetails(). Keeping the translation in one place (socialApi.js) is why all
 * three consumers stay this small.
 *
 * Contract notes, all three load-bearing:
 *
 *  - initialTitle === undefined hides the title section and emits title: undefined. That
 *    is how SessionEditForm avoids two title fields — it owns its own Title input and
 *    saves it through updateSessionStats (Corrections 4 and 5).
 *  - tagUserIds is emitted only when the picker was actually touched. An untouched picker
 *    emits undefined, so saving an edit that only changed the resort cannot wipe existing
 *    tags.
 *  - Every piece of state is seeded from props ON MOUNT ONLY. Consumers that load
 *    initialPhotos/initialTags asynchronously must not mount this until the data is in
 *    hand, and should remount with a fresh key after a successful save.
 *
 * @param {{
 *   initialTitle?: string|null,
 *   initialPhotos?: Array<{id: string, url: string|null}>,
 *   initialTags?: Array<{tagged_user_id: string}>,
 *   saving?: boolean,
 *   onSave: (diff: object) => void,
 *   onSkip?: () => void,
 * }} props
 */
export default function SkiDayDetailsForm({
  initialTitle,
  initialPhotos,
  initialTags,
  saving = false,
  onSave,
  onSkip,
}) {
  const showTitle = initialTitle !== undefined

  const [title, setTitle] = useState(() => clampTitle(initialTitle ?? ""))
  const [existingPhotos] = useState(() => initialPhotos || [])
  const [removedIds, setRemovedIds] = useState(() => new Set())
  // { key, file, previewUrl } — newly picked files that have not been uploaded yet.
  const [pending, setPending] = useState([])
  const [tagIds, setTagIds] = useState(
    () => new Set((initialTags || []).map((t) => t.tagged_user_id))
  )
  // Rule 2 of the contract. Flipped only by FriendTagPicker's onChange.
  const [tagsTouched, setTagsTouched] = useState(false)
  const [notice, setNotice] = useState("")

  // Every object URL this component has ever created, held in a REF and not in state.
  //
  // This is the detail that decides whether the previews work. The obvious version —
  // useEffect(() => () => pending.forEach(p => URL.revokeObjectURL(p.previewUrl)), [pending])
  // — re-runs its cleanup on every single change to `pending`, so adding a second photo
  // revokes the first one's URL and its live thumbnail goes blank. Deps of [] with a
  // stale closure over `pending` is the opposite bug: it captures the empty initial array
  // and revokes nothing at unmount, leaking every blob for the page's lifetime.
  //
  // A ref sidesteps both: the cleanup below runs exactly once, at unmount, and reads the
  // ref's CURRENT contents at that moment rather than a render-time snapshot.
  const objectUrlsRef = useRef(new Set())

  useEffect(() => {
    const urls = objectUrlsRef.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  const keptPhotos = existingPhotos.filter((p) => !removedIds.has(p.id))
  const photoCount = keptPhotos.length + pending.length
  const full = photoCount >= MAX_PHOTOS_PER_SESSION

  function handlePick(e) {
    const picked = Array.from(e.target.files || [])
    // Reset the input immediately, before any early return. Without this, picking the
    // same file again after removing it fires no change event (the value is unchanged)
    // and the photo simply cannot be re-added.
    e.target.value = ""
    if (!picked.length) return

    const { accepted, rejected } = validatePhotoSelection(picked, photoCount)

    const added = accepted.map((file) => {
      const previewUrl = URL.createObjectURL(file)
      objectUrlsRef.current.add(previewUrl)
      return {
        // Not file.name: picking two photos with the same name from different folders is
        // ordinary, and a duplicate React key silently drops one of the thumbnails.
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl,
      }
    })
    if (added.length) setPending((prev) => [...prev, ...added])

    setNotice(
      rejected.length
        ? rejected.map((r) => `"${r.name}" ${REJECT_COPY[r.reason] || "was skipped"}`).join(". ")
        : ""
    )
  }

  function removePending(key) {
    // Read from render scope and revoke BEFORE the setState, so the side effect stays out
    // of the updater (React 19 double-invokes updaters in development).
    const row = pending.find((p) => p.key === key)
    if (row) {
      URL.revokeObjectURL(row.previewUrl)
      objectUrlsRef.current.delete(row.previewUrl)
    }
    setPending((prev) => prev.filter((p) => p.key !== key))
    setNotice("")
  }

  function removeExisting(id) {
    // Marked, not deleted. Nothing is destroyed until the consumer calls
    // saveSkiDayDetails, so closing the modal without saving is a real cancel.
    setRemovedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    setNotice("")
  }

  function handleSave() {
    onSave({
      title: showTitle ? clampTitle(title) : undefined,
      addedPhotoFiles: pending.map((p) => p.file),
      removedPhotoIds: [...removedIds],
      tagUserIds: tagsTouched ? [...tagIds] : undefined,
    })
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {showTitle && (
        <div>
          <div style={labelStyle}>
            Title <span style={{ opacity: 0.5 }}>(optional)</span>
          </div>
          <input
            style={inputStyle}
            value={title}
            placeholder="Bluebird laps on the back bowls"
            /* Array.from + slice, not value.slice: TITLE_MAX_LENGTH is a CODEPOINT cap
               (char_length in the DB CHECK), and a code-unit slice would both halve an
               emoji-heavy title's allowance and risk storing a lone surrogate.
               clampTitle() is NOT used here — it trims, which would eat the space the
               moment the user types one mid-sentence. Trimming happens at save. */
            onChange={(e) =>
              setTitle(Array.from(e.target.value).slice(0, TITLE_MAX_LENGTH).join(""))
            }
          />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4, textAlign: "right" }}>
            {Array.from(title).length}/{TITLE_MAX_LENGTH}
          </div>
        </div>
      )}

      <div>
        <div style={labelStyle}>
          Photos <span style={{ opacity: 0.5 }}>({photoCount}/{MAX_PHOTOS_PER_SESSION})</span>
        </div>

        {photoCount > 0 && (
          /* flexWrap, not a fixed-column grid: at 375px a 6-wide row would shrink each
             thumbnail to ~45px. Wrapping keeps them at a legible 64px and grows the
             modal downward, which it already scrolls. */
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {keptPhotos.map((p) => (
              <div key={p.id} style={{ position: "relative", width: 64, height: 64 }}>
                {/* Non-interactive by design: no onClick, no lightbox anywhere in this
                    slice (Global Constraints). */}
                <img
                  src={p.url}
                  alt=""
                  style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, display: "block" }}
                />
                <button
                  type="button"
                  onClick={() => removeExisting(p.id)}
                  aria-label="Remove photo"
                  style={{
                    position: "absolute", top: -6, right: -6, width: 20, height: 20,
                    borderRadius: "50%", border: "none", background: "var(--color-danger)",
                    color: "white", fontSize: 11, lineHeight: 1, cursor: "pointer", padding: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}

            {pending.map((p) => (
              <div key={p.key} style={{ position: "relative", width: 64, height: 64 }}>
                <img
                  src={p.previewUrl}
                  alt=""
                  style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, display: "block", opacity: 0.85 }}
                />
                <button
                  type="button"
                  onClick={() => removePending(p.key)}
                  aria-label="Remove photo"
                  style={{
                    position: "absolute", top: -6, right: -6, width: 20, height: 20,
                    borderRadius: "50%", border: "none", background: "var(--color-danger)",
                    color: "white", fontSize: 11, lineHeight: 1, cursor: "pointer", padding: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <label
          style={{
            display: "inline-block", padding: "9px 14px", borderRadius: 10,
            border: "1px dashed rgba(255,255,255,0.2)", fontSize: 13, fontWeight: 700,
            color: full ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.75)",
            cursor: full ? "default" : "pointer",
          }}
        >
          {full ? `${MAX_PHOTOS_PER_SESSION} photos max` : "📷 Add Photos"}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={full}
            onChange={handlePick}
            style={{ display: "none" }}
          />
        </label>

        {notice && (
          <div style={{ fontSize: 12, color: "var(--color-warning)", marginTop: 6 }}>{notice}</div>
        )}
      </div>

      <div>
        <div style={labelStyle}>Who did you ski with?</div>
        <FriendTagPicker
          selectedIds={tagIds}
          onChange={(next) => {
            setTagsTouched(true)
            setTagIds(next)
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            disabled={saving}
            style={{
              flex: 1, padding: "12px", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)", background: "transparent",
              color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            Skip
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 2, padding: "12px", borderRadius: 12, border: "none",
            background: "var(--gradient-cta)", color: "white", fontSize: 14, fontWeight: 900,
            cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Saving…" : "Save Details"}
        </button>
      </div>
    </div>
  )
}
