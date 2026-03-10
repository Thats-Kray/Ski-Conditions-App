import { useEffect, useState } from "react"
import {
  getCurrentUser,
  getMyProfile,
  upsertMyProfile,
  uploadProfilePhoto,
} from "../lib/socialApi"

const PASS_OPTIONS = ["Epic", "Ikon", "Mountain Collective", "Indy", "Loveland", "A-Basin"]

const FAVORITE_MOUNTAIN_OPTIONS = [
  "Vail",
  "Beaver Creek",
  "Breckenridge",
  "Keystone",
  "Crested Butte",
  "Telluride",
  "Winter Park",
  "Copper Mountain",
  "Arapahoe Basin",
  "Steamboat",
  "Eldora",
  "Aspen Snowmass",
]

export default function ProfileSetup() {
  const [user, setUser] = useState(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [username, setUsername] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [favoriteMountain, setFavoriteMountain] = useState("")
  const [skiPasses, setSkiPasses] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [message, setMessage] = useState("")

  async function loadProfile() {
    setInitialLoading(true)
    setMessage("")

    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)

      if (!currentUser) return

      const profile = await getMyProfile()

      if (profile) {
        setFirstName(profile.first_name || "")
        setLastName(profile.last_name || "")
        setUsername(profile.username || "")
        setAvatarUrl(profile.avatar_url || "")
        setFavoriteMountain(profile.favorite_mountain || "")
        setSkiPasses(profile.ski_passes || [])
      }
    } catch (err) {
      setMessage(err.message || "Could not load profile.")
    } finally {
      setInitialLoading(false)
    }
  }

  useEffect(() => {
    loadProfile()
  }, [])

  function togglePass(passName) {
    setSkiPasses((prev) =>
      prev.includes(passName)
        ? prev.filter((p) => p !== passName)
        : [...prev, passName]
    )
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setMessage("")

    try {
      const publicUrl = await uploadProfilePhoto(file)
      setAvatarUrl(publicUrl)
      setMessage("Photo uploaded successfully.")
    } catch (err) {
      setMessage(err.message || "Could not upload photo.")
    } finally {
      setUploading(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setLoading(true)
    setMessage("")

    try {
      await upsertMyProfile({
        first_name: firstName,
        last_name: lastName,
        username,
        avatar_url: avatarUrl,
        ski_passes: skiPasses,
        favorite_mountain: favoriteMountain,
      })

      setMessage("Profile saved successfully.")
    } catch (err) {
      setMessage(err.message || "Could not save profile.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 18,
        padding: 16,
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 16 }}>Profile</div>

      {!user && !initialLoading ? (
        <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>
          Sign in to create your profile.
        </div>
      ) : initialLoading ? (
        <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>
          Loading profile...
        </div>
      ) : (
        <form onSubmit={handleSave} style={{ display: "grid", gap: 12 }}>
          {avatarUrl && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <img
                src={avatarUrl}
                alt="Profile"
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 999,
                  objectFit: "cover",
                  border: "2px solid rgba(255,255,255,0.14)",
                }}
              />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "white",
                padding: "10px 12px",
                borderRadius: 12,
                outline: "none",
              }}
              required
            />

            <input
              type="text"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "white",
                padding: "10px 12px",
                borderRadius: 12,
                outline: "none",
              }}
              required
            />
          </div>

          <input
            type="text"
            placeholder="Username (example: kraypowder)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "white",
              padding: "10px 12px",
              borderRadius: 12,
              outline: "none",
            }}
            required
          />

          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 13, color: "rgba(255,255,255,0.76)" }}>
              Favorite mountain
            </label>
            <select
              value={favoriteMountain}
              onChange={(e) => setFavoriteMountain(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "white",
                padding: "10px 12px",
                borderRadius: 12,
                outline: "none",
              }}
            >
              <option value="">Select a mountain</option>
              {FAVORITE_MOUNTAIN_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.76)" }}>
              Ski passes
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {PASS_OPTIONS.map((passName) => {
                const active = skiPasses.includes(passName)

                return (
                  <button
                    key={passName}
                    type="button"
                    onClick={() => togglePass(passName)}
                    style={{
                      background: active
                        ? "linear-gradient(135deg, #22c55e, #14b8a6)"
                        : "rgba(255,255,255,0.06)",
                      color: active ? "#052e2b" : "white",
                      border: "1px solid rgba(255,255,255,0.12)",
                      padding: "8px 12px",
                      borderRadius: 999,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {passName}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 13, color: "rgba(255,255,255,0.76)" }}>
              Profile photo
            </label>

            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "white",
                padding: "10px 12px",
                borderRadius: 12,
                outline: "none",
              }}
            />

            {uploading && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
                Uploading photo...
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading
                ? "rgba(255,255,255,0.12)"
                : "linear-gradient(135deg, #2563eb, #0891b2)",
              color: "white",
              border: "none",
              padding: "10px 12px",
              borderRadius: 12,
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            {loading ? "Saving..." : "Save Profile"}
          </button>
        </form>
      )}

      {message && (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>
          {message}
        </div>
      )}
    </div>
  )
}