/**
 * A persistent, dismissable "this block didn't load" row.
 *
 * Deliberately NOT a toast. Toasts auto-dismiss, and the section they described
 * stays empty afterwards with no explanation — which is how a broken Social tab
 * looked identical to an empty one on 2026-08-18. This stays on screen until the
 * data loads or the user dismisses it.
 *
 * Two shapes:
 *   <FailureNotice label="your crews" onRetry={...} />        block failed to load
 *   <FailureNotice message="Couldn't save (...)" onDismiss={...} onRetry={...} />
 *                                                             one action failed
 */
export default function FailureNotice({ label, message, onRetry, onDismiss }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      background: "var(--color-danger-bg)", border: "1px solid var(--color-danger)",
      borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "var(--color-text-1)",
      marginBottom: 10,
    }}>
      <span>{message || `Couldn't load ${label}.`}</span>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              background: "transparent", border: "1px solid var(--color-danger)", borderRadius: 8,
              color: "var(--color-text-1)", padding: "6px 12px", fontSize: 12, fontWeight: 800,
              cursor: "pointer", minHeight: 44,
            }}
          >
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            style={{
              background: "transparent", border: "none",
              color: "var(--color-text-1)", padding: "6px 10px", fontSize: 16, fontWeight: 800,
              cursor: "pointer", minHeight: 44, lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}
