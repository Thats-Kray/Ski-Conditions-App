export default function StatStrip({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 1, background: "rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
      {items.map((item, i) => (
        <div key={i} style={{ /* TODO(theming): unclear semantic, ask before tokenizing — no existing
          token matches this exact surface shade, and Task 1 must stay pixel-lossless */
          background: "#0b1424", padding: "14px 8px", display: "grid", justifyItems: "center", gap: 4 }}>
          <span style={{ fontSize: 20 }}>{item.icon}</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: "white" }}>{item.value}</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.5 }}>{item.label}</span>
        </div>
      ))}
    </div>
  )
}
