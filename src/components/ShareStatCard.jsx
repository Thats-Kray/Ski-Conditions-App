import { useEffect, useRef, useState } from "react"
import { fmt, formatDateFull } from "../lib/format"
import { RESORT_PHOTOS, resortName } from "../lib/resorts"

const SKILL_COLORS = {
  green:        "#22c55e",
  blue:         "#60a5fa",
  black:        "#e2e8f0",
  double_black: "#f43f5e",
  experts_only: "#c084fc",
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function drawMountains(ctx, W, H) {
  // Layered mountain silhouettes at the bottom
  // Back range
  ctx.fillStyle = "rgba(37,99,235,0.09)"
  ctx.beginPath()
  ctx.moveTo(0, H)
  ctx.lineTo(0, H * 0.72)
  ctx.lineTo(W * 0.12, H * 0.58)
  ctx.lineTo(W * 0.22, H * 0.68)
  ctx.lineTo(W * 0.35, H * 0.48)
  ctx.lineTo(W * 0.48, H * 0.63)
  ctx.lineTo(W * 0.58, H * 0.52)
  ctx.lineTo(W * 0.68, H * 0.60)
  ctx.lineTo(W * 0.80, H * 0.42)
  ctx.lineTo(W * 0.92, H * 0.56)
  ctx.lineTo(W, H * 0.50)
  ctx.lineTo(W, H)
  ctx.closePath()
  ctx.fill()

  // Front range
  ctx.fillStyle = "rgba(8,145,178,0.08)"
  ctx.beginPath()
  ctx.moveTo(0, H)
  ctx.lineTo(0, H * 0.84)
  ctx.lineTo(W * 0.08, H * 0.76)
  ctx.lineTo(W * 0.18, H * 0.82)
  ctx.lineTo(W * 0.28, H * 0.68)
  ctx.lineTo(W * 0.40, H * 0.78)
  ctx.lineTo(W * 0.52, H * 0.65)
  ctx.lineTo(W * 0.62, H * 0.75)
  ctx.lineTo(W * 0.74, H * 0.60)
  ctx.lineTo(W * 0.86, H * 0.72)
  ctx.lineTo(W, H * 0.66)
  ctx.lineTo(W, H)
  ctx.closePath()
  ctx.fill()
}

function drawSnowflakes(ctx, W, H, seed) {
  const rng = (i) => ((seed * 9301 + i * 49297) % 233280) / 233280
  ctx.fillStyle = "rgba(255,255,255,0.18)"
  for (let i = 0; i < 28; i++) {
    const x = rng(i * 3) * W
    const y = rng(i * 3 + 1) * H * 0.75
    const r = rng(i * 3 + 2) * 3 + 1
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawAvatar(ctx, name, x, y, size, skillLevel) {
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
  const r = size / 2
  const cx = x + r
  const cy = y + r

  // Outer glow
  const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.4)
  glow.addColorStop(0, "rgba(37,99,235,0.35)")
  glow.addColorStop(1, "rgba(37,99,235,0)")
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2)
  ctx.fill()

  // Circle bg
  const grad = ctx.createLinearGradient(x, y, x + size, y + size)
  grad.addColorStop(0, "#1d4ed8")
  grad.addColorStop(1, "#0891b2")
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  // Border
  const skillColor = SKILL_COLORS[skillLevel] || "#60a5fa"
  ctx.strokeStyle = skillColor
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  // Initials
  ctx.font = `900 ${size * 0.38}px -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif`
  ctx.fillStyle = "white"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(initials, cx, cy)
}

// Normalize a resort key/name the same way `resortName()`/`resortEmoji()` do,
// so lookups into RESORT_PHOTOS (which is keyed like "vail", "crestedbutte") are reliable
// even if the stored value has mixed case or spaces.
function resortPhotoKey(key) {
  if (!key) return ""
  return String(key).trim().toLowerCase().replace(/\s+/g, "")
}

// Loads a remote/static image for canvas drawing. There's no pre-existing async
// image-loading helper elsewhere in the app to mirror (drawAvatar only draws
// initials, it never loads profile.avatar_url) — this is a standard load-then-draw
// pattern for canvas.
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`failed to load image: ${src}`))
    img.src = src
  })
}

// Draws `img` into the box (x,y,w,h) cropped to cover it, matching CSS `background-size: cover`.
function drawImageCover(ctx, img, x, y, w, h) {
  const boxRatio = w / h
  const imgRatio = img.width / img.height
  let sx, sy, sw, sh
  if (imgRatio > boxRatio) {
    sh = img.height
    sw = sh * boxRatio
    sx = (img.width - sw) / 2
    sy = 0
  } else {
    sw = img.width
    sh = sw / boxRatio
    sx = 0
    sy = (img.height - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

async function renderCard(canvas, { profile, stats, season, session }) {
  const mode = session ? "session" : "season"
  const W = 1080
  const H = 1080
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")

  // Session mode: try to load the resort's hero photo as a background layer.
  let heroImg = null
  if (mode === "session") {
    const photoSrc = RESORT_PHOTOS[resortPhotoKey(session.resort_name)]
    if (photoSrc) {
      try {
        heroImg = await loadImage(photoSrc)
      } catch {
        heroImg = null // fall back to the plain gradient background below
      }
    }
  }

  if (heroImg) {
    // Photo background + dark gradient overlay on top for text legibility,
    // matching the resort-card convention used elsewhere in the app (TripCard.jsx):
    // light at top, dark toward the bottom.
    drawImageCover(ctx, heroImg, 0, 0, W, H)
    const overlay = ctx.createLinearGradient(0, 0, 0, H)
    overlay.addColorStop(0, "rgba(2,6,23,0.35)")
    overlay.addColorStop(0.45, "rgba(2,6,23,0.72)")
    overlay.addColorStop(1, "rgba(2,6,23,0.94)")
    ctx.fillStyle = overlay
    ctx.fillRect(0, 0, W, H)
  } else {
    // Plain gradient background (existing season-mode look, also the session-mode fallback).
    const bg = ctx.createLinearGradient(0, 0, W * 0.6, H)
    bg.addColorStop(0, "#050e20")
    bg.addColorStop(0.5, "#061628")
    bg.addColorStop(1, "#040b18")
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    // Ambient glow top-right
    const glow1 = ctx.createRadialGradient(W * 0.85, H * 0.15, 0, W * 0.85, H * 0.15, W * 0.55)
    glow1.addColorStop(0, "rgba(37,99,235,0.18)")
    glow1.addColorStop(1, "rgba(37,99,235,0)")
    ctx.fillStyle = glow1
    ctx.fillRect(0, 0, W, H)
  }

  // Snowflakes
  drawSnowflakes(ctx, W, H, 42)

  // Mountain silhouettes
  drawMountains(ctx, W, H)

  // Top bar: branding
  ctx.font = `800 44px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`
  ctx.fillStyle = "#60a5fa"
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.fillText("❄️  PowderDays", 76, 108)

  // Season label (top right) — season mode only, `season` isn't passed in session mode.
  if (mode === "season" && season) {
    ctx.font = `600 36px -apple-system, system-ui, sans-serif`
    ctx.fillStyle = "rgba(255,255,255,0.38)"
    ctx.textAlign = "right"
    ctx.fillText(`${season.label} Season`, W - 76, 108)
  }

  // Divider
  ctx.strokeStyle = "rgba(96,165,250,0.2)"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(76, 134)
  ctx.lineTo(W - 76, 134)
  ctx.stroke()

  // Avatar
  const avatarSize = 152
  const avatarX = 76
  const avatarY = 168
  drawAvatar(ctx, profile?.full_name || profile?.username, avatarX, avatarY, avatarSize, profile?.skill_level)

  // Name + handle
  const name = profile?.full_name || profile?.username || "Skier"
  ctx.font = `900 72px -apple-system, system-ui, sans-serif`
  ctx.fillStyle = "white"
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.fillText(name, avatarX + avatarSize + 36, avatarY + 88)

  if (profile?.username) {
    ctx.font = `500 36px -apple-system, system-ui, sans-serif`
    ctx.fillStyle = "rgba(255,255,255,0.38)"
    ctx.fillText(`@${profile.username}`, avatarX + avatarSize + 36, avatarY + 132)
  }

  if (mode === "season") {
    // ── Stats grid (2×2) ─────────────────────────────────────────────────────
    const statItems = [
      { label: "Days on Snow",  value: String(stats.days),          emoji: "⛷️" },
      { label: "Vertical",      value: fmt(stats.vertical) + " ft", emoji: "📏" },
      { label: "Resorts",       value: String(stats.resorts),       emoji: "🏔️" },
      { label: "Powder Days",   value: String(stats.powderDays),    emoji: "❄️" },
    ]

    const gridTop    = 390
    const colW       = (W - 152) / 2
    const rowH       = 188

    statItems.forEach((item, idx) => {
      const col = idx % 2
      const row = Math.floor(idx / 2)
      const bx  = 76 + col * (colW + 8)
      const by  = gridTop + row * (rowH + 12)
      const bw  = colW
      const bh  = rowH

      // Card background
      drawRoundedRect(ctx, bx, by, bw, bh, 24)
      const cardBg = ctx.createLinearGradient(bx, by, bx + bw, by + bh)
      cardBg.addColorStop(0, "rgba(255,255,255,0.065)")
      cardBg.addColorStop(1, "rgba(255,255,255,0.03)")
      ctx.fillStyle = cardBg
      ctx.fill()

      // Card border
      drawRoundedRect(ctx, bx, by, bw, bh, 24)
      ctx.strokeStyle = "rgba(255,255,255,0.1)"
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Emoji
      ctx.font = "56px sans-serif"
      ctx.textAlign = "left"
      ctx.textBaseline = "top"
      ctx.fillText(item.emoji, bx + 28, by + 26)

      // Big number
      ctx.font = `900 88px -apple-system, system-ui, sans-serif`
      ctx.fillStyle = "white"
      ctx.textAlign = "left"
      ctx.textBaseline = "alphabetic"
      ctx.fillText(item.value, bx + 28, by + bh - 46)

      // Label
      ctx.font = `600 28px -apple-system, system-ui, sans-serif`
      ctx.fillStyle = "rgba(255,255,255,0.42)"
      ctx.fillText(item.label, bx + 28, by + bh - 14)
    })

    // ── Top resort ───────────────────────────────────────────────────────────
    if (stats.topResort) {
      const trY = gridTop + 2 * (rowH + 12) + 16
      drawRoundedRect(ctx, 76, trY, W - 152, 88, 18)
      const trBg = ctx.createLinearGradient(76, trY, W - 76, trY + 88)
      trBg.addColorStop(0, "rgba(251,191,36,0.12)")
      trBg.addColorStop(1, "rgba(234,88,12,0.07)")
      ctx.fillStyle = trBg
      ctx.fill()
      drawRoundedRect(ctx, 76, trY, W - 152, 88, 18)
      ctx.strokeStyle = "rgba(251,191,36,0.22)"
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.font = "42px sans-serif"
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText("🏔️", 108, trY + 44)

      ctx.font = `700 34px -apple-system, system-ui, sans-serif`
      ctx.fillStyle = "rgba(255,255,255,0.5)"
      ctx.fillText("Top Resort", 168, trY + 36)

      ctx.font = `800 38px -apple-system, system-ui, sans-serif`
      ctx.fillStyle = "white"
      ctx.fillText(stats.topResort, 168, trY + 70)
    }
  } else {
    // ── Session mode: resort headline + date + stat row + powder badge ───────
    const headlineY = 430

    ctx.font = `900 76px -apple-system, system-ui, sans-serif`
    ctx.fillStyle = "white"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(resortName(session.resort_name), 76, headlineY)

    ctx.font = `600 36px -apple-system, system-ui, sans-serif`
    ctx.fillStyle = "rgba(255,255,255,0.55)"
    ctx.fillText(formatDateFull(session.session_date), 76, headlineY + 50)

    // Stat row (Vertical / Runs / Top Speed)
    const sessionStatItems = [
      { label: "Vertical",   value: session.vertical_feet != null ? `${fmt(session.vertical_feet)} ft` : "—", emoji: "📏" },
      { label: "Runs",       value: session.runs_logged != null ? String(session.runs_logged) : "—",          emoji: "⛷️" },
      { label: "Top Speed",  value: session.top_speed_mph != null ? `${session.top_speed_mph} mph` : "—",     emoji: "⚡" },
    ]

    const rowTop = 560
    const gap    = 8
    const colW3  = (W - 152 - gap * 2) / 3
    const rowH3  = 220

    sessionStatItems.forEach((item, idx) => {
      const bx = 76 + idx * (colW3 + gap)
      const by = rowTop
      const bw = colW3
      const bh = rowH3

      drawRoundedRect(ctx, bx, by, bw, bh, 24)
      const cardBg = ctx.createLinearGradient(bx, by, bx + bw, by + bh)
      cardBg.addColorStop(0, "rgba(255,255,255,0.10)")
      cardBg.addColorStop(1, "rgba(255,255,255,0.04)")
      ctx.fillStyle = cardBg
      ctx.fill()

      drawRoundedRect(ctx, bx, by, bw, bh, 24)
      ctx.strokeStyle = "rgba(255,255,255,0.14)"
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Emoji
      ctx.font = "48px sans-serif"
      ctx.textAlign = "left"
      ctx.textBaseline = "top"
      ctx.fillText(item.emoji, bx + 24, by + 24)

      // Value
      ctx.font = `900 56px -apple-system, system-ui, sans-serif`
      ctx.fillStyle = "white"
      ctx.textAlign = "left"
      ctx.textBaseline = "alphabetic"
      ctx.fillText(item.value, bx + 24, by + bh - 46)

      // Label
      ctx.font = `600 24px -apple-system, system-ui, sans-serif`
      ctx.fillStyle = "rgba(255,255,255,0.5)"
      ctx.fillText(item.label, bx + 24, by + bh - 16)
    })

    // Powder-day badge
    if (session.is_powder_day) {
      const pbY = rowTop + rowH3 + 16
      drawRoundedRect(ctx, 76, pbY, W - 152, 88, 18)
      const pbBg = ctx.createLinearGradient(76, pbY, W - 76, pbY + 88)
      pbBg.addColorStop(0, "rgba(96,165,250,0.18)")
      pbBg.addColorStop(1, "rgba(8,145,178,0.10)")
      ctx.fillStyle = pbBg
      ctx.fill()
      drawRoundedRect(ctx, 76, pbY, W - 152, 88, 18)
      ctx.strokeStyle = "rgba(96,165,250,0.3)"
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.font = "42px sans-serif"
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText("❄️", 108, pbY + 44)

      ctx.font = `800 38px -apple-system, system-ui, sans-serif`
      ctx.fillStyle = "white"
      ctx.fillText("Powder Day", 168, pbY + 52)
    }
  }

  // ── Watermark ──────────────────────────────────────────────────────────────
  ctx.font = `500 28px -apple-system, system-ui, sans-serif`
  ctx.fillStyle = "rgba(255,255,255,0.2)"
  ctx.textAlign = "center"
  ctx.textBaseline = "alphabetic"
  ctx.fillText("powderdays.app", W / 2, H - 44)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShareStatCard({ profile, stats, season, session, onClose }) {
  const mode = session ? "session" : "season"
  const canvasRef  = useRef(null)
  const [imgUrl, setImgUrl]       = useState(null)
  const [rendering, setRendering] = useState(true)
  const [sharing, setSharing]     = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    renderCard(canvas, { profile, stats, season, session })
      .then(() => {
        setImgUrl(canvas.toDataURL("image/png"))
        setRendering(false)
      })
      .catch(() => setRendering(false))
  }, [])

  async function handleShare() {
    if (!imgUrl || sharing) return
    setSharing(true)
    try {
      const filename = mode === "session"
        ? `powderdays-${session.resort_name}-${session.session_date}.png`
        : `powderdays-${season.label.replace("–", "-")}.png`
      if (navigator.share) {
        const res  = await fetch(imgUrl)
        const blob = await res.blob()
        const file = new File([blob], filename, { type: "image/png" })
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: mode === "session" ? "My PowderDays Session" : "My PowderDays Season" })
          return
        }
      }
      // fallback: download
      const a = document.createElement("a")
      a.href = imgUrl
      a.download = filename
      a.click()
    } catch {}
    finally { setSharing(false) }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)", padding: "16px" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: "100%", maxWidth: 440, background: "rgba(8,14,28,0.98)", borderRadius: 24, padding: "20px", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>

        {/* Hidden canvas for rendering */}
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 16, color: "white" }}>{mode === "session" ? "Session Card" : "Season Card"}</div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 18, cursor: "pointer", padding: "4px 8px", borderRadius: 8, lineHeight: 1 }}>✕</button>
        </div>

        {/* Preview */}
        <div style={{ borderRadius: 16, overflow: "hidden", background: "rgba(255,255,255,0.04)", minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {rendering ? (
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Rendering…</div>
          ) : imgUrl ? (
            <img src={imgUrl} alt={mode === "session" ? "Session stat card" : "Season stat card"} style={{ width: "100%", display: "block", borderRadius: 12 }} />
          ) : (
            <div style={{ color: "#f87171", fontSize: 13 }}>Failed to render card.</div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button
            onClick={handleShare}
            disabled={rendering || sharing || !imgUrl}
            style={{
              flex: 1, padding: "13px", borderRadius: 14, border: "none",
              background: (rendering || !imgUrl) ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#2563eb,#0891b2)",
              color: "white", fontWeight: 800, fontSize: 14,
              cursor: (rendering || !imgUrl) ? "default" : "pointer",
            }}
          >
            {sharing ? "Sharing…" : "📤 Share / Save"}
          </button>
          <button
            onClick={onClose}
            style={{ padding: "13px 18px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
