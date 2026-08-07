export default function AccentCard({ accentColor = "#38bdf8", children }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 14,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderLeft: `3px solid ${accentColor}`,
      }}
    >
      {children}
    </div>
  )
}
