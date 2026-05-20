import { useState, useRef, useEffect } from "react"

export default function GifPicker({ onSelect, onClose }) {
  const [url, setUrl] = useState("")
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    onSelect(trimmed)
  }

  return (
    <div style={{
      position: "absolute", bottom: "100%", left: 0, right: 0, zIndex: 100,
      background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 16, padding: "14px 14px 12px", marginBottom: 8,
      boxShadow: "0 -4px 24px rgba(0,0,0,0.6)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
        Paste a GIF URL
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          ref={inputRef}
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://media.giphy.com/..."
          style={{
            flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 999, padding: "8px 14px", color: "white", fontSize: 13, outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={!url.trim()}
          style={{
            background: url.trim() ? "linear-gradient(135deg,#2563eb,#0891b2)" : "rgba(255,255,255,0.08)",
            border: "none", color: "white", borderRadius: 999, padding: "8px 16px",
            fontWeight: 800, fontSize: 13, cursor: url.trim() ? "pointer" : "default", flexShrink: 0,
          }}
        >
          Add
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}
        >×</button>
      </form>

      {url.trim() && (
        <img
          src={url.trim()}
          alt="GIF preview"
          style={{ marginTop: 10, maxWidth: "100%", maxHeight: 160, borderRadius: 10, objectFit: "contain", display: "block" }}
          onError={e => { e.target.style.display = "none" }}
          onLoad={e => { e.target.style.display = "block" }}
        />
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
        Find a GIF at{" "}
        <a href="https://giphy.com" target="_blank" rel="noopener noreferrer" style={{ color: "#60a5fa", textDecoration: "none", fontWeight: 700 }}>Giphy →</a>
        {" "}then copy and paste the link above.
      </div>
    </div>
  )
}
