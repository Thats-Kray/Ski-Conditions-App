import { useState } from "react"
import SkiDayDetailsForm from "./SkiDayDetailsForm"
import { saveSkiDayDetails, logActivityOnce } from "../lib/socialApi"
import { isSessionUntouched } from "../lib/skiDayNudge"
import { resortName } from "../lib/resorts"
import { formatDate } from "../lib/format"

/**
 * The next-login nudge's modal (Feed slice C2): a thin shell around the SkiDayDetailsForm
 * that Feed-C1 already ships, opened from NudgeBanner for one specific ski day.
 *
 * It is NOT a second SessionRecapModal. That modal is the end of the GPS flow and carries
 * runs, stats, GPX export, Strava upload and a share card; this one carries a form. The
 * only things the two share are SkiDayDetailsForm and saveSkiDayDetails, which is exactly
 * the point of extracting them in C1.
 *
 * WHY THE FORM IS SEEDED EMPTY
 *
 * NudgeBanner only ever opens this for a session getRecentIncompleteSession() has already
 * proved has no title, no photos and no tags, so ""/[]/[] is correct by construction and
 * no pre-fetch is needed. The one gap that leaves is a session edited on ANOTHER device
 * between the banner's fetch and this save; if the user then touches the tag picker,
 * reconcileSessionTags would diff against an empty seed and drop those tags. That is
 * accepted rather than fixed: it needs a second device editing the same day inside the
 * same page view, and pre-fetching here would cost two queries on every open to close it.
 *
 * WHY initialTitle IS "" AND NOT OMITTED
 *
 * SkiDayDetailsForm.jsx:67 is `const showTitle = initialTitle !== undefined`. Omitting the
 * prop hides the entire title section and emits title: undefined, which saveSkiDayDetails
 * then skips — the banner would promise "add a title" and offer no title field, with no
 * error anywhere. The empty string is load-bearing.
 *
 * WHY logActivityOnce IS CALLED, AND THE ONE THING IT IS GATED ON
 *
 * Migration 039's log_session_on_arrival() trigger inserts a bare ski_sessions row and
 * never touches activity_feed, so a day logged by tapping "Arrived" on a plan is invisible
 * to the Feed forever. Completing the nudge is where that row gets backfilled. There is no
 * "does it already have one?" check here on purpose: logActivityOnce does that check
 * itself, on the tighter (actor_id, type, subject_id) key that actually decides, and
 * returns early when a row exists. A looser pre-check would only create the risk of
 * skipping a backfill that was still needed.
 *
 * The ONE gate is on the save having written something — see handleSave. That is not a
 * duplicate of logActivityOnce's dedupe (which asks "was this day already published?");
 * it asks "is there anything worth publishing?", which nothing else checks.
 *
 * It also cannot throw — its whole body is wrapped in try/catch (socialApi.js:3896-3898) —
 * so it is awaited outside the details save's own error handling only in the sense that a
 * feed-logging failure must never make a successful details save look failed.
 */
export default function NudgeDetailsModal({ session, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Both hooks are above this guard. A hook below it would change the hook count between
  // the session-null and session-present renders and React would throw — the same
  // discipline SessionRecapModal.jsx:59 documents.
  if (!session) return null

  async function handleSave(diff) {
    setSaving(true)
    setError("")
    try {
      await saveSkiDayDetails(session.id, diff)

      // Backfill for the check-in-only path. Deliberately AFTER the details save: if the
      // save failed there is nothing worth publishing to the Feed yet.
      //
      // Gated on the save having actually written something. SkiDayDetailsForm's Save
      // button is disabled only while `saving` — there is no "nothing changed" guard — so
      // opening the nudge and tapping "Save Details" on the untouched form it seeds is a
      // reachable path that writes NOTHING (title "" becomes null, both arrays empty,
      // tagUserIds undefined and skipped). Publishing a feed row there would put a
      // permanent, contentless card in front of the user's friends for a day they
      // declined to fill in, and it is irreversible: logActivityOnce dedupes forever and
      // the banner is dismissed on the same path. "Skip" is the intended decline; this
      // makes an empty Save behave the same way.
      if (!isSessionUntouched({ title: diff?.title, photos: diff?.addedPhotoFiles, tags: diff?.tagUserIds })) {
        await logActivityOnce("ski_session", {
          subjectId:   session.id,
          subjectType: "ski_sessions",
          metadata:    {
            resort_name:   session.resort_name,
            is_powder_day: session.is_powder_day,
          },
        })
      }

      onSaved(session.id)
    } catch (err) {
      // Stay open with the reason showing. Closing would silently discard picked files.
      setError(err.message || "Could not save. Try again.")
    } finally {
      // onSaved() above unmounts this component. Setting state on an unmounted component
      // is a no-op in React 18+ (the old warning was removed), so this is safe and keeps
      // the button re-enabled on the error path.
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "rgba(4,8,15,0.85)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px 16px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 500,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--color-bg-deep)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 24,
          boxShadow: "0 40px 120px rgba(0,0,0,0.85)",
          padding: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>🎿 Finish your ski day</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
              {resortName(session.resort_name)} · {formatDate(session.session_date)}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "50%",
              width: 32,
              height: 32,
              flexShrink: 0,
              color: "rgba(255,255,255,0.6)",
              fontSize: 16,
              lineHeight: 1,
              cursor: "pointer",
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div
            style={{
              background: "var(--color-danger-bg)",
              border: "1px solid rgba(248,113,113,0.3)",
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 13,
              color: "var(--color-danger)",
              margin: "12px 0 0",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <SkiDayDetailsForm
            initialTitle=""
            initialPhotos={[]}
            initialTags={[]}
            saving={saving}
            onSave={handleSave}
            onSkip={onClose}
          />
        </div>
      </div>
    </div>
  )
}
