export default function SnowStat({ icon, label, value, unit }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 11, color: "var(--color-text-3)", display: "flex", alignItems: "center", gap: 4 }}>
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "var(--color-text-1)" }}>
        {value}
        {unit && <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-2)", marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  )
}
