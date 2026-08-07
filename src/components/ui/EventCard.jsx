export default function EventCard({ event, accentColor }) {
  const date = new Date(event.event_date + "T00:00:00")
  const month = date.toLocaleDateString(undefined, { month: "short" }).toUpperCase()
  const day = date.getDate()

  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: 14,
        borderRadius: 14,
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${accentColor}33`,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 52,
          height: 52,
          borderRadius: 10,
          border: `1.5px solid ${accentColor}`,
          display: "grid",
          placeItems: "center",
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: accentColor }}>{month}</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "white", lineHeight: 1 }}>{day}</div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: "white" }}>{event.title}</div>
        {event.description && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 3, lineHeight: 1.4 }}>
            {event.description}
          </div>
        )}
        {event.link_url && (
          <a
            href={event.link_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block", marginTop: 8, fontSize: 11, fontWeight: 800,
              color: accentColor, border: `1px solid ${accentColor}66`, borderRadius: 999,
              padding: "4px 10px", textDecoration: "none", textTransform: "uppercase", letterSpacing: 0.4,
            }}
          >
            Learn More
          </a>
        )}
      </div>
    </div>
  )
}
