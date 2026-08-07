export default function HeroPhotoHeader({ photoPath, title, badges, scoreSlot, children }) {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 24,
        overflow: "hidden",
        padding: 20,
        background: photoPath
          ? `linear-gradient(to top, rgba(4,8,15,0.88), rgba(2,6,23,0.3)), url(${photoPath}) center/cover`
          : "linear-gradient(135deg, #1e293b, #334155)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      {title && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              {badges}
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "white" }}>{title}</h1>
          </div>
          {scoreSlot}
        </div>
      )}
      {children}
    </div>
  )
}
