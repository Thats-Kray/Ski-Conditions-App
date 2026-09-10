export default function AccentCard({ accentColor = "var(--color-accent)", children }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 14,
        background: "var(--overlay-03)",
        border: "1px solid var(--overlay-08)",
        borderLeft: `3px solid ${accentColor}`,
      }}
    >
      {children}
    </div>
  )
}
