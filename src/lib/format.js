export function timeAgo(ts) {
  if (!ts) return ""
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (m < 1)  return "now"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d`
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function formatDate(dateStr) {
  if (!dateStr) return ""
  const d = new Date(`${dateStr}T12:00:00`)
  return isNaN(d) ? dateStr : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}

export function formatDateFull(dateStr) {
  if (!dateStr) return ""
  const d = new Date(`${dateStr}T12:00:00`)
  return isNaN(d) ? dateStr : d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
}

export function fmt(n) {
  if (!n) return "0"
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k"
  return String(n)
}