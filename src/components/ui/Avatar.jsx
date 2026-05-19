const COLORS = ["#2563eb", "#0891b2", "#7c3aed", "#16a34a", "#ea580c"]

export default function Avatar({ profile, size = 32 }) {
  const name = profile?.full_name || profile?.username || "?"
  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: "50%",
      flexShrink: 0,
      background: COLORS[name.length % COLORS.length],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: Math.round(size * 0.42),
      fontWeight: 800,
      color: "white",
    }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
