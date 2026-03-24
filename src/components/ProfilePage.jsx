import ProfileSetup from "./ProfileSetup"

export default function ProfilePage() {
  return (
    <div
      style={{
        display: "grid",
        gap: 14,
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 18,
          padding: 18,
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 6 }}>
          Your Profile
        </div>
        <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>
          View your current skier profile, then jump into edit mode whenever you want to update your info.
        </div>
      </div>

      <ProfileSetup />
    </div>
  )
}