import { useEffect, useState } from "react"
import {
  getCurrentUser,
  getMyProfile,
  upsertMyProfile,
  uploadProfilePhoto,
} from "../lib/socialApi"

const PASS_OPTIONS = [
  "Epic",
  "Ikon",
  "Mountain Collective",
  "Indy",
  "Loveland",
  "A-Basin",
]

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

function initialsFromName(name) {
  return (name || "S")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

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
  const [hasProfile, setHasProfile] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  async function loadProfile() {
    setInitialLoading(true)
    setMessage("")

    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)

      if (!currentUser) {
        setHasProfile(false)
        setIsEditing(false)
        return
      }

      const profile = await getMyProfile()

      if (profile) {
        setFirstName(profile.first_name || "")
        setLastName(profile.last_name || "")
        setUsername(profile.username || "")
        setAvatarUrl(profile.avatar_url || "")
        setFavoriteMountain(profile.favorite_mountain || "")
        setSkiPasses(profile.ski_passes || [])
        setHasProfile(true)
        setIsEditing(false)
      } else {
        setHasProfile(false)
        setIsEditing(true)
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

      setHasProfile(true)
      setIsEditing(false)
      setMessage("Profile saved successfully.")
    } catch (err) {
      setMessage(err.message || "Could not save profile.")
    } finally {
      setLoading(false)
    }
  }

  const fullName =
    [firstName, lastName].filter(Boolean).join(" ").trim() || "Unnamed Skier"

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
      ) : hasProfile && !isEditing ? (
        <div style={{ display: "grid", gap: 14 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "84px 1fr",
              gap: 14,
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: 999,
                overflow: "hidden",
                background: "rgba(255,255,255,0.08)",
                border: "2px solid rgba(255,255,255,0.14)",
                display: "grid",
                placeItems: "center",
                fontWeight: 900,
                fontSize: 24,
                color: "white",
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={fullName}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                initialsFromName(fullName)
              )}
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{fullName}</div>

              <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>
                {username ? `@${username}` : "No username yet"}
              </div>

              <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>
                Favorite mountain: {favoriteMountain || "Not set"}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 8,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: 12,
            }}
          >
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)" }}>
              Ski passes
            </div>

            {skiPasses.length === 0 ? (
              <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>
                No passes selected yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {skiPasses.map((passName) => (
                  <div
                    key={passName}
                    style={{
                      background: "linear-gradient(135deg, #22c55e, #14b8a6)",
                      color: "#052e2b",
                      borderRadius: 999,
                      padding: "8px 12px",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    {passName}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setIsEditing(true)
              setMessage("")
            }}
            style={{
              background: "linear-gradient(135deg, #2563eb, #0891b2)",
              color: "white",
              border: "none",
              padding: "10px 12px",
              borderRadius: 12,
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Edit Profile
          </button>
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

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
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

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
              {loading ? "Saving..." : hasProfile ? "Save Changes" : "Create Profile"}
            </button>

            {hasProfile && (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false)
                  setMessage("")
                }}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.12)",
                  padding: "10px 12px",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                Cancel
              </button>
            )}
          </div>
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