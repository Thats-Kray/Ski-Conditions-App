import { useDismissableLayer } from "../../lib/useDismissableLayer"

/**
 * Bottom-sheet chrome shared by all five Profile settings rows. Geometry copied
 * from ProfilePage's EditProfileModal (drag handle, 22px top corners, 92dvh cap,
 * its own scroll container) so settings and editing feel like one system.
 *
 * zIndex is 350, NOT the 600 EditProfileModal uses. StravaSyncReview — which the
 * Connected apps sheet can open from inside itself — is fixed at zIndex 400
 * (StravaSyncReview.jsx:54), so a 600 sheet would cover Strava's own review
 * modal and strand the user. 350 sits above every nav and header layer in
 * App.jsx (max 210) and below Strava's 400.
 */
export default function SettingsSheet({ title, onClose, children }) {
  const panelRef = useDismissableLayer({ onClose })

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 350,
        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          width: "100%", maxWidth: 480,
          background: "linear-gradient(160deg, var(--color-modal-bg), var(--color-bg-deep))",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "22px 22px 0 0",
          maxHeight: "92dvh",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{ flexShrink: 0, padding: "16px 20px 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.2)", margin: "0 auto 18px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: "white" }}>{title}</div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.4)",
                fontSize: 22, lineHeight: 1, cursor: "pointer",
                minWidth: 44, minHeight: 44,
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div style={{
          flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch",
          padding: "12px 20px max(24px, env(safe-area-inset-bottom))",
        }}>
          {children}
        </div>
      </div>
    </div>
  )
}
