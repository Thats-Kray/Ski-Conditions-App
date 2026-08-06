import { useEffect, useState } from "react"
import { getMountainEvents, createMountainEvent } from "../lib/socialApi"
import EventCard from "./ui/EventCard"
import { accentForIndex } from "./ui/accentColors"

export default function EventsWidget({ resortKey }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [eventDate, setEventDate] = useState("")
  const [linkUrl, setLinkUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    getMountainEvents(resortKey)
      .then((rows) => { if (!cancelled) setEvents(rows) })
      .catch((err) => { if (!cancelled) { setEvents([]); setLoadError(err) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [resortKey])

  async function handleCreate() {
    if (!title.trim() || !eventDate) return
    setSaving(true)
    setSaveError(null)
    try {
      const created = await createMountainEvent({ resortKey, title, description, eventDate, linkUrl })
      setEvents((prev) => [...prev, created].sort((a, b) => a.event_date.localeCompare(b.event_date)))
      setTitle(""); setDescription(""); setEventDate(""); setLinkUrl("")
      setComposerOpen(false)
    } catch (err) {
      setSaveError(err.message || "Couldn't create the event.")
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    background: "rgba(255,255,255,0.07)", border: "1.5px solid rgba(255,255,255,0.11)",
    borderRadius: 10, padding: "10px 12px", color: "white", fontSize: 14, outline: "none",
    width: "100%", boxSizing: "border-box", fontFamily: "inherit",
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {!composerOpen ? (
        <button
          onClick={() => setComposerOpen(true)}
          style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(56,189,248,0.4)", background: "rgba(56,189,248,0.1)", color: "#38bdf8", fontWeight: 800, cursor: "pointer", justifySelf: "start" }}
        >
          + Add Event
        </button>
      ) : (
        <div style={{ display: "grid", gap: 8, padding: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" maxLength={120} style={inputStyle} />
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} maxLength={500} style={{ ...inputStyle, resize: "vertical" }} />
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Link (optional)" style={inputStyle} />
          {saveError && <div style={{ fontSize: 12, color: "#f87171" }}>{saveError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setComposerOpen(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>Cancel</button>
            <button onClick={handleCreate} disabled={saving || !title.trim() || !eventDate} style={{ flex: 2, padding: "10px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#0284c7,#38bdf8)", color: "white", fontWeight: 800, cursor: saving ? "wait" : "pointer", opacity: saving || !title.trim() || !eventDate ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Create Event"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 20, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Loading…</div>
      ) : loadError ? (
        <div style={{ padding: 20, fontSize: 13, color: "#f87171" }}>Couldn't load events. Try again in a bit.</div>
      ) : !events.length ? (
        <div style={{ padding: 20, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>No upcoming events yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {events.map((event, i) => (
            <EventCard key={event.id} event={event} accentColor={accentForIndex(i)} />
          ))}
        </div>
      )}
    </div>
  )
}
