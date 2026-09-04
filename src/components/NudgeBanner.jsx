import { useEffect, useState } from "react"
import NudgeDetailsModal from "./NudgeDetailsModal"
import { getRecentIncompleteSession } from "../lib/socialApi"
import { nudgeDismissKey } from "../lib/skiDayNudge"
import { resortName } from "../lib/resorts"
import { formatDate } from "../lib/format"

/**
 * The next-login nudge (Feed slice C2). If the user's most recent ski day is within 7 days
 * and nobody has given it a title, a photo or a tag, offer to finish it — once, dismissibly,
 * for that one day.
 *
 * WHY THIS FETCHES ITSELF INSTEAD OF App.jsx DOING IT
 *
 * loadHeaderUser() looks like the natural hook point (it is where currentUser resolves, and
 * it is where the onboarding gate lives) but it is registered as the
 * supabase.auth.onAuthStateChange handler (App.jsx:970-991), so it re-runs on
 * INITIAL_SESSION, SIGNED_IN, USER_UPDATED and TOKEN_REFRESHED — the last of which fires
 * about hourly for as long as the tab is open. The onboarding gate can live there because
 * it is one synchronous localStorage read. This is up to three network round-trips.
 *
 * The pattern actually used in this codebase for "after currentUser resolves, fetch
 * something" is the block of useEffect(..., [currentUser]) hooks at App.jsx:993-1020, and
 * on this very screen AddToHomeScreenNudge (TodayScreen.jsx:333-361) already does the
 * component-local version. This is that, keyed on currentUser?.id rather than the object,
 * because loadHeaderUser() hands down a fresh object identity on every auth event.
 *
 * WHY THE CANDIDATE CARRIES THE USER ID
 *
 * The obvious alternative — `if (!currentUser) { setCandidate(null); return }` at the top
 * of the effect, which is what App.jsx:994 does — is a synchronous setState in an effect
 * body, and react-hooks/set-state-in-effect is an ERROR in this repo's eslint config (ten
 * pre-existing violations; do not add an eleventh). Stamping the fetch with the user it was
 * for, and checking that stamp at render time, handles log-out and account-switch without
 * any clearing write at all.
 *
 * DISMISSAL IS PER SESSION, NOT GLOBAL: the key is pd_nudge_dismissed_<sessionId>,
 * mirroring OffseasonBanner's pd_offseason_banner_26 shape. Dismissing today's prompt must
 * not suppress next week's. Every localStorage touch is wrapped in try/catch — Safari
 * private mode throws, and an uncaught throw here would blank the whole Today tab.
 *
 * A successful save counts as resolving the nudge, so it writes the same key.
 */
export default function NudgeBanner({ currentUser }) {
  // { userId, session } — the session, stamped with who it was fetched for.
  const [candidate, setCandidate] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    const userId = currentUser?.id
    if (!userId) return

    let cancelled = false

    getRecentIncompleteSession()
      .then((found) => {
        if (cancelled || !found) return

        let dismissed = false
        try {
          dismissed = localStorage.getItem(nudgeDismissKey(found.id)) === "1"
        } catch {
          // localStorage unavailable (Safari private mode) — treat as not dismissed. The
          // cost of being wrong is one extra banner, not a crash.
        }
        if (dismissed) return

        // setState inside an async callback, never synchronously in the effect body.
        setCandidate({ userId, session: found })
      })
      .catch((err) => {
        // A nudge is the most skippable thing in the app. Never surface this.
        console.warn("NudgeBanner: could not check for an incomplete ski day", err)
      })

    return () => {
      cancelled = true
    }
  }, [currentUser?.id])

  // Stale-stamp guard: a candidate fetched for a user who has since logged out or been
  // swapped is not rendered, and no clearing setState was needed to achieve that.
  const session = candidate && candidate.userId === currentUser?.id ? candidate.session : null

  /** Dismiss and save both resolve the nudge for this session, permanently and locally. */
  function resolve(sessionId) {
    const key = nudgeDismissKey(sessionId)
    if (key) {
      try { localStorage.setItem(key, "1") } catch {
        // localStorage unavailable (Safari private mode) — already handled in the fetch.
      }
    }
    setModalOpen(false)
    setCandidate(null)
  }

  if (!session) return null

  return (
    <>
      <div
        style={{
          position: "relative",
          background: "rgba(56,189,248,0.08)",
          border: "1px solid rgba(56,189,248,0.2)",
          borderRadius: 14,
          padding: "12px 40px 12px 14px",
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>🎿</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "white", marginBottom: 2 }}>
            Forgot to finish {resortName(session.resort_name)}, {formatDate(session.session_date)}?
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
            Add a title, photos, or tag who you skied with.
          </div>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          style={{
            background: "var(--gradient-cta)",
            border: "none",
            borderRadius: 999,
            padding: "9px 18px",
            color: "white",
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          Add Details
        </button>

        <button
          onClick={() => resolve(session.id)}
          aria-label="Dismiss"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.35)",
            fontSize: 18,
            lineHeight: 1,
            padding: 4,
            borderRadius: 6,
          }}
        >
          ×
        </button>
      </div>

      {modalOpen && (
        <NudgeDetailsModal
          session={session}
          onClose={() => setModalOpen(false)}
          onSaved={resolve}
        />
      )}
    </>
  )
}
