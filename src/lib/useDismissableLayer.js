import { useEffect, useRef } from "react"

/**
 * Keyboard behaviour for a modal layer: Escape to close, Tab trapped inside, focus
 * moved in on open and returned to the opener on close.
 *
 * Before this hook there was NOTHING of the kind anywhere in src/ — no keydown
 * handler, no focus trap, no modal base component. Fine on a phone, where every
 * modal is dismissed by tapping the backdrop. On desktop a keyboard user could open
 * the plan editor and have no way to close it without reaching for the mouse, and
 * Tab would walk straight out of the dialog into the page behind it.
 *
 * Usage:
 *   const panelRef = useDismissableLayer({ onClose, enabled: !busy })
 *   ...
 *   <div ref={panelRef} role="dialog" aria-modal="true"> ... </div>
 *
 * Attach the ref to the PANEL, not the backdrop — the trap searches inside it.
 *
 * `enabled` gates Escape only, not the trap. A modal mid-save should refuse to
 * close (matching the backdrop and X button, which already no-op while busy) but
 * must still keep focus inside itself.
 *
 * No unit tests: `npm test` runs node --test over src/lib with no DOM, so there is
 * nothing here to assert against. Verified by hand in a desktop browser.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

export function useDismissableLayer({ onClose, enabled = true } = {}) {
  const panelRef = useRef(null)

  // Callers pass inline arrows, so onClose is a new function every render. Holding
  // it in a ref keeps the document listener from being torn down and re-added on
  // each keystroke-triggered re-render.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // Move focus into the dialog on open, and put it back where it came from on
  // close. Without the restore, dismissing a modal drops focus onto <body> and a
  // keyboard user has to Tab from the top of the page again.
  useEffect(() => {
    const opener = document.activeElement

    const first = panelRef.current?.querySelector(FOCUSABLE)
    if (first instanceof HTMLElement) first.focus()

    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus()
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        if (!enabled) return
        e.stopPropagation()
        onCloseRef.current?.()
        return
      }

      if (e.key !== "Tab") return

      const panel = panelRef.current
      if (!panel) return

      const items = panel.querySelectorAll(FOCUSABLE)
      if (items.length === 0) {
        e.preventDefault()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      // Focus escaped the panel (or never entered it) — pull it back rather than
      // letting Tab continue into the page behind the backdrop.
      if (!panel.contains(active)) {
        e.preventDefault()
        first.focus()
        return
      }

      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    // Capture phase: Escape should reach the modal before any handler underneath it.
    document.addEventListener("keydown", handleKeyDown, true)
    return () => document.removeEventListener("keydown", handleKeyDown, true)
  }, [enabled])

  return panelRef
}
