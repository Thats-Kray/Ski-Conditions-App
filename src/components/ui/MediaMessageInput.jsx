import { useState, useRef } from "react"
import GifPicker from "./GifPicker"
import { uploadChatMedia } from "../../lib/socialApi"

// Renders an uploaded image/video/gif inside a message bubble
export function MessageMedia({ mediaUrl, mediaType }) {
  const [lightbox, setLightbox] = useState(false)
  if (!mediaUrl) return null

  if (mediaType === "video") {
    return (
      <video
        src={mediaUrl}
        controls
        style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 10, display: "block" }}
      />
    )
  }

  return (
    <>
      <img
        src={mediaUrl}
        alt=""
        onClick={() => setLightbox(true)}
        style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 10, display: "block", cursor: "zoom-in", objectFit: "contain" }}
      />
      {lightbox && (
        <div
          onClick={() => setLightbox(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.92)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          <img src={mediaUrl} alt="" style={{ maxWidth: "95vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 12 }} />
        </div>
      )}
    </>
  )
}

function detectMediaType(file) {
  if (file.type.startsWith("video/"))     return "video"
  if (file.name.toLowerCase().endsWith(".gif") || file.type === "image/gif") return "image"
  return "image"
}

// onSend(text, mediaUrl, mediaType) — called when user hits Send
export default function MediaMessageInput({ placeholder = "Message…", onSend, sending, inputRef: externalInputRef }) {
  const [text, setText]       = useState("")
  const [file, setFile]       = useState(null)       // { raw, previewUrl, type }
  const [gifUrl, setGifUrl]   = useState(null)
  const [showGifs, setShowGifs] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  const internalRef  = useRef(null)
  const inputRef     = externalInputRef || internalRef

  const canSend = (text.trim() || file || gifUrl) && !sending && !uploading

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const previewUrl = URL.createObjectURL(f)
    setFile({ raw: f, previewUrl, type: detectMediaType(f) })
    setGifUrl(null)
    e.target.value = ""
  }

  function clearMedia() {
    if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl)
    setFile(null)
    setGifUrl(null)
  }

  async function handleSubmit(e) {
    e?.preventDefault()
    if (!canSend) return

    let mediaUrl  = gifUrl || null
    let mediaType = gifUrl ? "gif" : null

    if (file) {
      setUploading(true)
      try {
        mediaUrl  = await uploadChatMedia(file.raw)
        mediaType = file.type
      } catch {
        setUploading(false)
        return
      }
      setUploading(false)
    }

    const t = text.trim()
    setText("")
    clearMedia()
    setShowGifs(false)
    await onSend(t, mediaUrl, mediaType)
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const busy = sending || uploading

  return (
    <div style={{ position: "relative" }}>
      {/* GIF picker overlay */}
      {showGifs && (
        <GifPicker
          onSelect={(url) => { setGifUrl(url); setFile(null); setShowGifs(false) }}
          onClose={() => setShowGifs(false)}
        />
      )}

      {/* Media preview */}
      {(file || gifUrl) && (
        <div style={{
          padding: "8px 12px 0",
          display: "flex", alignItems: "flex-start", gap: 8,
        }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            {file?.type === "video" ? (
              <video src={file.previewUrl} style={{ height: 72, width: 96, objectFit: "cover", borderRadius: 8 }} />
            ) : (
              <img src={gifUrl || file?.previewUrl} alt="" style={{ height: 72, maxWidth: 120, objectFit: "cover", borderRadius: 8 }} />
            )}
            <button
              onClick={clearMedia}
              style={{
                position: "absolute", top: -6, right: -6,
                width: 18, height: 18, borderRadius: "50%",
                background: "#1e293b", border: "1px solid rgba(255,255,255,0.2)",
                color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 1,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                padding: 0,
              }}
            >×</button>
          </div>
        </div>
      )}

      {/* Input row */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex", gap: 6, padding: "10px 12px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          alignItems: "flex-end",
        }}
      >
        {/* Attach file */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Attach photo or video"
          style={{
            flexShrink: 0, width: 36, height: 36, borderRadius: "50%",
            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.55)", fontSize: 16, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >📎</button>

        {/* GIF button */}
        <button
          type="button"
          onClick={() => setShowGifs(v => !v)}
          title="Search GIFs"
          style={{
            flexShrink: 0, borderRadius: 8, height: 36, padding: "0 10px",
            background: showGifs ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.07)",
            border: showGifs ? "1px solid rgba(96,165,250,0.3)" : "1px solid rgba(255,255,255,0.1)",
            color: showGifs ? "#60a5fa" : "rgba(255,255,255,0.55)",
            fontSize: 11, fontWeight: 800, cursor: "pointer", letterSpacing: 0.3,
          }}
        >GIF</button>

        {/* Text input */}
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={busy}
          style={{
            flex: 1, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 999, padding: "10px 16px", color: "white", fontSize: 14, outline: "none",
          }}
        />

        {/* Send */}
        <button
          type="submit"
          disabled={!canSend}
          style={{
            flexShrink: 0, width: 40, height: 40, borderRadius: "50%",
            background: canSend ? "linear-gradient(135deg,#2563eb,#0891b2)" : "rgba(255,255,255,0.08)",
            border: "none", color: "white", fontSize: 16, cursor: canSend ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {uploading ? "…" : "↑"}
        </button>
      </form>
    </div>
  )
}
