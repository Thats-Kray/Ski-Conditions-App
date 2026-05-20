import { useState, useEffect, useRef } from "react"

const TENOR_KEY = import.meta.env.VITE_TENOR_API_KEY
const TENOR_BASE = "https://tenor.googleapis.com/v2"

async function tenorFetch(endpoint, params = {}) {
  const qs = new URLSearchParams({ key: TENOR_KEY, limit: 20, ...params }).toString()
  const res = await fetch(`${TENOR_BASE}/${endpoint}?${qs}`)
  if (!res.ok) throw new Error("Tenor request failed")
  return res.json()
}

export default function GifPicker({ onSelect, onClose }) {
  const [query, setQuery]   = useState("")
  const [gifs, setGifs]     = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    if (!TENOR_KEY) return
    loadGifs("")
  }, [])

  async function loadGifs(q) {
    setLoading(true)
    try {
      const endpoint = q.trim() ? "search" : "featured"
      const params   = q.trim() ? { q: q.trim(), media_filter: "gif" } : { media_filter: "gif" }
      const json     = await tenorFetch(endpoint, params)
      setGifs((json.results || []).map(r => ({
        id:       r.id,
        url:      r.media_formats?.gif?.url || r.media_formats?.tinygif?.url,
        preview:  r.media_formats?.tinygif?.url || r.media_formats?.gif?.url,
        title:    r.title || "",
      })).filter(g => g.url))
    } catch {
      setGifs([])
    } finally {
      setLoading(false)
    }
  }

  function handleQueryChange(e) {
    const v = e.target.value
    setQuery(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => loadGifs(v), 400)
  }

  if (!TENOR_KEY) {
    return (
      <div style={{
        position: "absolute", bottom: "100%", left: 0, right: 0, zIndex: 100,
        background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 16, padding: 24, marginBottom: 8, textAlign: "center",
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🎞️</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>
          GIF search needs a Tenor API key
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
          Add <code style={{ color: "#93c5fd" }}>VITE_TENOR_API_KEY</code> to your{" "}
          <code style={{ color: "#93c5fd" }}>.env.local</code> to enable GIF search.
          <br />Get a free key at{" "}
          <a href="https://developers.google.com/tenor/guides/quickstart" target="_blank" rel="noreferrer"
            style={{ color: "#60a5fa" }}>
            developers.google.com/tenor
          </a>
        </div>
        <button onClick={onClose} style={{ marginTop: 16, background: "rgba(255,255,255,0.08)", border: "none", color: "white", borderRadius: 8, padding: "6px 16px", cursor: "pointer", fontSize: 13 }}>
          Close
        </button>
      </div>
    )
  }

  return (
    <div style={{
      position: "absolute", bottom: "100%", left: 0, right: 0, zIndex: 100,
      background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 16, marginBottom: 8, overflow: "hidden",
      boxShadow: "0 -4px 24px rgba(0,0,0,0.6)",
      display: "flex", flexDirection: "column", maxHeight: 340,
    }}>
      {/* Search bar */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        <input
          ref={inputRef}
          value={query}
          onChange={handleQueryChange}
          placeholder="Search GIFs…"
          style={{
            flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 999, padding: "7px 14px", color: "white", fontSize: 13, outline: "none",
          }}
        />
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "0 2px" }}>×</button>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.35)", fontSize: 13 }}>Loading…</div>
        )}
        {!loading && gifs.length === 0 && (
          <div style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
            {query ? "No GIFs found" : "Type to search GIFs"}
          </div>
        )}
        {!loading && gifs.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {gifs.map(gif => (
              <button
                key={gif.id}
                onClick={() => onSelect(gif.url)}
                style={{
                  padding: 0, border: "none", borderRadius: 8, overflow: "hidden",
                  cursor: "pointer", background: "rgba(255,255,255,0.05)", aspectRatio: "1",
                }}
                title={gif.title}
              >
                <img
                  src={gif.preview}
                  alt={gif.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
        {!loading && gifs.length > 0 && (
          <div style={{ textAlign: "center", paddingTop: 8 }}>
            <img src="https://www.gstatic.com/tenor/web/attribution/PB_tenor_logo_blue_horizontal.png" alt="Powered by Tenor" style={{ height: 14, opacity: 0.4 }} />
          </div>
        )}
      </div>
    </div>
  )
}
