import { useState, useEffect } from "react"
import { supabase, authHeaders } from "../lib/supabase"

// Matches the API_BASE fallback pattern used elsewhere in the app
// (src/App.jsx, src/components/TripDetailModal.jsx).
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8787"

const StravaIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="#FC4C02">
    <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
  </svg>
)

export default function StravaConnect({ userId }) {
  const [loading, setLoading]         = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [athleteId, setAthleteId]     = useState(null)
  const [syncing, setSyncing]         = useState(false)
  const [syncResult, setSyncResult]   = useState(null)
  const [toast, setToast]             = useState(null) // { type: 'success'|'error', message }

  useEffect(() => {
    if (!userId) return

    async function load() {
      setLoading(true)
      try {
        const { data } = await supabase
          .from("profiles")
          .select("strava_athlete_id")
          .eq("id", userId)
          .single()
        setIsConnected(!!data?.strava_athlete_id)
        setAthleteId(data?.strava_athlete_id ?? null)
      } finally {
        setLoading(false)
      }
    }
    load()

    // Check for OAuth redirect result in the URL
    const params = new URLSearchParams(window.location.search)
    if (params.get("strava_connected") === "true") {
      setToast({ type: "success", message: "Strava connected!" })
      params.delete("strava_connected")
      window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`)
    } else if (params.get("strava_error")) {
      setToast({ type: "error", message: `Strava connection failed: ${params.get("strava_error")}` })
      params.delete("strava_error")
      window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`)
    }
  }, [userId])

  function handleConnect() {
    window.location.href = `${API_BASE}/api/strava/auth?userId=${userId}`
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      // The server derives the user from the bearer token — no userId in body.
      const res = await fetch(`${API_BASE}/api/strava/sync`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({}),
      })
      const result = await res.json()
      setSyncResult(result)
    } catch (err) {
      setSyncResult({ error: err.message })
    } finally {
      setSyncing(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Strava? Your imported sessions will remain.")) return
    try {
      const res = await fetch(`${API_BASE}/api/strava/disconnect`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({}),
      })
      if (res.ok) {
        setIsConnected(false)
        setAthleteId(null)
        setSyncResult(null)
      }
    } catch {
      // no-op — user can retry
    }
  }

  if (loading) {
    return (
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 16px", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 16px" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StravaIcon />
          <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>Strava</div>
        </div>
        {isConnected && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: "#22c55e" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} />
            Connected
          </div>
        )}
      </div>

      {/* Toast from OAuth redirect */}
      {toast && (
        <div style={{
          marginBottom: 12, padding: "9px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700,
          background: toast.type === "success" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
          color: toast.type === "success" ? "#22c55e" : "#f87171",
        }}>
          {toast.message}
        </div>
      )}

      {!isConnected ? (
        <>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>
            Import your ski activities automatically
          </div>
          <button
            onClick={handleConnect}
            style={{
              width: "100%", padding: "11px 0", borderRadius: 12, border: "none",
              background: "#FC4C02", color: "white", fontWeight: 800, fontSize: 14, cursor: "pointer",
            }}
          >
            Connect Strava →
          </button>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "var(--color-surface, rgba(255,255,255,0.06))",
                color: "white", fontWeight: 800, fontSize: 13,
                cursor: syncing ? "default" : "pointer",
                opacity: syncing ? 0.6 : 1,
              }}
            >
              {syncing ? "Syncing…" : "Sync Now"}
            </button>
            <button
              onClick={handleDisconnect}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 12,
                border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)",
                color: "#f87171", fontWeight: 800, fontSize: 13, cursor: "pointer",
              }}
            >
              Disconnect
            </button>
          </div>

          {syncResult && (
            <div style={{
              marginTop: 12, fontSize: 12, fontWeight: 700,
              color: syncResult.error ? "#f87171" : "rgba(255,255,255,0.6)",
            }}>
              {syncResult.error
                ? `Sync failed: ${syncResult.error}`
                : `Synced ${syncResult.synced} session${syncResult.synced === 1 ? "" : "s"}, ${syncResult.skipped} skipped${syncResult.errors?.length ? ` (${syncResult.errors.length} error${syncResult.errors.length === 1 ? "" : "s"})` : ""}`
              }
            </div>
          )}

          {athleteId && (
            <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
              Strava athlete #{athleteId}
            </div>
          )}
        </>
      )}
    </div>
  )
}
