import { Component } from "react"

const RELOAD_FLAG = "pd_chunk_reload_attempted"

/**
 * Catches a failed dynamic import() (e.g. after a deploy invalidates the
 * chunk hashes a still-open tab/PWA is holding) and recovers with a single
 * automatic reload, falling back to a manual-reload prompt if that already
 * happened once this session — guarded by sessionStorage so it can't loop.
 */
export default class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    const isChunkError = /fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(
      error?.message || ""
    )
    if (isChunkError && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, "true")
      window.location.reload()
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 48, textAlign: "center", display: "grid", gap: 12, placeItems: "center" }}>
          <div style={{ opacity: 0.7 }}>Couldn't load this screen.</div>
          <button
            onClick={() => { sessionStorage.removeItem(RELOAD_FLAG); window.location.reload() }}
            style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid var(--ink-20, #ccc)", background: "none", cursor: "pointer", fontWeight: 700 }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
