import { useState } from "react"
import { rsvpToTrip, cancelTripRsvp, addTripComment, deleteTrip } from "../lib/socialApi"

const RESORT_NAMES = {
  vail: "Vail",
  beavercreek: "Beaver Creek",
  breckenridge: "Breckenridge",
  keystone: "Keystone",
  crestedbutte: "Crested Butte",
  telluride: "Telluride",
  winterpark: "Winter Park",
  coppermountain: "Copper Mountain",
  arapahoebasin: "Arapahoe Basin",
  steamboat: "Steamboat",
  eldora: "Eldora",
  aspensnowmass: "Aspen Snowmass",
}

const RESORT_PHOTOS = {
  vail: "/resorts/vail.jpg",
  beavercreek: "/resorts/beaver-creek.jpg",
  breckenridge: "/resorts/breckenridge.jpg",
  keystone: "/resorts/keystone.jpg",
  crestedbutte: "/resorts/crested-butte.jpg",
  telluride: "/resorts/telluride.jpg",
  winterpark: "/resorts/winter-park.jpg",
  coppermountain: "/resorts/copper-mountain.jpg",
  arapahoebasin: "/resorts/arapahoe-basin.jpg",
  steamboat: "/resorts/steamboat.jpg",
  eldora: "/resorts/eldora.jpg",
  aspensnowmass: "/resorts/aspen-snowmass.jpg",
}

const RESORT_ACCENTS = {
  vail: "#60a5fa",
  beavercreek: "#fbbf24",
  breckenridge: "#34d399",
  keystone: "#818cf8",
  crestedbutte: "#c084fc",
  telluride: "#fb7185",
  winterpark: "#fb923c",
  coppermountain: "#f97316",
  arapahoebasin: "#94a3b8",
  steamboat: "#d97706",
  eldora: "#2dd4bf",
  aspensnowmass: "#e2e8f0",
}

const QUICK_HYPES = ["🎿", "🔥", "❄️", "🏔️", "🤙", "💪", "🙌"]

function daysUntil(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + "T00:00:00")
  const diff = Math.round((target - today) / (1000 * 60 * 60 * 24))
  if (diff < 0) return null
  if (diff === 0) return "Today! 🔥"
  if (diff === 1) return "Tomorrow"
  if (diff <= 6) return `In ${diff} days`
  return null
}

function formatDateFull(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

function CardAvatar({ profile, size = 32 }) {
  const name = profile?.full_name || profile?.username || "?"
  const initial = name.charAt(0).toUpperCase()

  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          border: "2px solid rgba(8,17,31,0.85)",
          flexShrink: 0,
        }}
      />
    )
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.14)",
        border: "2px solid rgba(8,17,31,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.38),
        fontWeight: 800,
        color: "white",
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  )
}

function AvatarStack({ profiles, max = 6 }) {
  const shown = profiles.slice(0, max)
  const overflow = profiles.length - max

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {shown.map((p, i) => (
        <div
          key={p?.id || i}
          style={{ marginLeft: i === 0 ? 0 : -9, zIndex: shown.length - i, position: "relative" }}
        >
          <CardAvatar profile={p} size={26} />
        </div>
      ))}
      {overflow > 0 && (
        <div
          style={{
            marginLeft: -9,
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.12)",
            border: "2px solid rgba(8,17,31,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 900,
            color: "rgba(255,255,255,0.8)",
            position: "relative",
            zIndex: 0,
            flexShrink: 0,
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}

export default function TripCard({ trip, currentUser, onUpdate, onRequireLogin, onDeleted }) {
  const [myRsvp, setMyRsvp] = useState(trip.my_rsvp_status || null)
  const [prevServerRsvp] = useState(trip.my_rsvp_status || null)
  const [rsvpLoading, setRsvpLoading] = useState(false)
  const [rsvpPop, setRsvpPop] = useState(null)
  const [comments, setComments] = useState(trip.comments || [])
  const [showComments, setShowComments] = useState(false)
  const [commentInput, setCommentInput] = useState("")
  const [commentLoading, setCommentLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { resort_key: resortKey, ski_date: skiDate } = trip
  const accent = RESORT_ACCENTS[resortKey] || "#60a5fa"
  const photo = RESORT_PHOTOS[resortKey]
  const resortName = RESORT_NAMES[resortKey] || resortKey
  const countdown = daysUntil(skiDate)
  const isHost = currentUser?.id === trip.host_id
  const isPast = !countdown && new Date(skiDate + "T00:00:00") < new Date()

  // Compute going/maybe counts with optimistic local update
  const rsvps = trip.rsvps || []
  const goingRsvps = rsvps.filter((r) => r.status === "going")
  const maybeRsvps = rsvps.filter((r) => r.status === "maybe")
  const goingProfiles = goingRsvps.map((r) => r.profile).filter(Boolean)

  let goingCount = goingRsvps.length
  let maybeCount = maybeRsvps.length
  if (prevServerRsvp !== myRsvp) {
    if (prevServerRsvp === "going") goingCount = Math.max(0, goingCount - 1)
    if (prevServerRsvp === "maybe") maybeCount = Math.max(0, maybeCount - 1)
    if (myRsvp === "going") goingCount++
    if (myRsvp === "maybe") maybeCount++
  }

  const hostFirstName =
    trip.host_profile?.full_name?.split(" ")[0] ||
    trip.host_profile?.username ||
    "Someone"

  const tripTitle =
    trip.title ||
    (isHost ? "Your Powder Day" : `${hostFirstName}'s Powder Day`)

  async function handleRsvp(status) {
    if (!currentUser) { onRequireLogin?.(); return }
    if (rsvpLoading) return

    const prev = myRsvp
    const next = myRsvp === status ? null : status

    setMyRsvp(next)
    setRsvpLoading(true)
    if (next) {
      setRsvpPop(status)
      setTimeout(() => setRsvpPop(null), 700)
    }

    try {
      if (next === null) {
        await cancelTripRsvp(trip.id)
      } else {
        await rsvpToTrip(trip.id, next)
      }
      onUpdate?.()
    } catch {
      setMyRsvp(prev)
    } finally {
      setRsvpLoading(false)
    }
  }

  async function handleQuickHype(emoji) {
    if (!currentUser) { onRequireLogin?.(); return }
    const optimistic = {
      id: `opt-${Date.now()}`,
      content: emoji,
      user_id: currentUser.id,
      profile: null,
      created_at: new Date().toISOString(),
    }
    setComments((prev) => [...prev, optimistic])
    setShowComments(true)
    try {
      const saved = await addTripComment(trip.id, emoji)
      setComments((prev) => prev.map((c) => (c.id === optimistic.id ? saved : c)))
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id))
    }
  }

  async function handleComment(e) {
    e.preventDefault()
    if (!commentInput.trim() || commentLoading) return
    if (!currentUser) { onRequireLogin?.(); return }

    const text = commentInput
    setCommentLoading(true)
    const optimistic = {
      id: `opt-${Date.now()}`,
      content: text,
      user_id: currentUser.id,
      profile: null,
      created_at: new Date().toISOString(),
    }
    setComments((prev) => [...prev, optimistic])
    setCommentInput("")

    try {
      const saved = await addTripComment(trip.id, text)
      setComments((prev) => prev.map((c) => (c.id === optimistic.id ? saved : c)))
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== optimistic.id))
      setCommentInput(text)
    } finally {
      setCommentLoading(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm("Cancel this trip?")) return
    setDeleting(true)
    try {
      await deleteTrip(trip.id)
      onDeleted?.()
    } catch {
      setDeleting(false)
    }
  }

  return (
    <div
      className="trip-card"
      style={{
        borderRadius: 28,
        overflow: "hidden",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.09)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        transition: "transform 0.22s ease, box-shadow 0.22s ease",
      }}
    >
      {/* ── Hero photo section ── */}
      <div
        style={{
          position: "relative",
          height: 196,
          background: photo
            ? `linear-gradient(to bottom, rgba(2,6,23,0.12) 0%, rgba(2,6,23,0.88) 100%), url(${photo}) center/cover no-repeat`
            : "linear-gradient(135deg, #1e293b, #0f172a)",
          overflow: "hidden",
        }}
      >
        {/* Countdown badge */}
        {countdown && (
          <div
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              background: accent,
              color: "#020617",
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: 0.3,
              boxShadow: `0 4px 18px ${accent}77`,
            }}
          >
            {countdown}
          </div>
        )}

        {/* Host / Past badge */}
        {isHost && !isPast && (
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              background: "rgba(255,255,255,0.13)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 999,
              padding: "5px 12px",
              fontSize: 11,
              fontWeight: 900,
              color: "white",
              letterSpacing: 0.3,
            }}
          >
            Your Trip
          </div>
        )}
        {isPast && (
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              background: "rgba(255,255,255,0.08)",
              borderRadius: 999,
              padding: "5px 12px",
              fontSize: 11,
              fontWeight: 700,
              color: "rgba(255,255,255,0.5)",
            }}
          >
            Past Trip
          </div>
        )}

        {/* Bottom info over photo */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "18px 20px 16px",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: `${accent}22`,
              border: `1px solid ${accent}44`,
              borderRadius: 999,
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 900,
              color: accent,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              marginBottom: 9,
            }}
          >
            🏔️ {resortName}
          </div>

          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              lineHeight: 1.1,
              color: "white",
              letterSpacing: -0.4,
            }}
          >
            {tripTitle}
          </div>

          <div
            style={{
              marginTop: 6,
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 13,
              color: "rgba(255,255,255,0.7)",
              flexWrap: "wrap",
            }}
          >
            <span>📅 {formatDateFull(skiDate)}</span>
            {trip.departure_time && <span>🚗 {trip.departure_time}</span>}
          </div>
        </div>
      </div>

      {/* ── Card body ── */}
      <div style={{ padding: "16px 20px 20px", display: "grid", gap: 14 }}>

        {/* Host row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CardAvatar profile={trip.host_profile} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>
              {isHost
                ? "You're hosting"
                : `Hosted by ${trip.host_profile?.full_name || trip.host_profile?.username || "Someone"}`}
            </div>
            {trip.meeting_spot && (
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.48)",
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                📍 {trip.meeting_spot}
              </div>
            )}
          </div>

          {/* Going / maybe counts */}
          {(goingCount > 0 || maybeCount > 0) && (
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              {goingCount > 0 && (
                <div style={{ fontSize: 12, fontWeight: 800, color: "#34d399" }}>
                  {goingCount} going
                </div>
              )}
              {maybeCount > 0 && (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                  {maybeCount} maybe
                </div>
              )}
            </div>
          )}
        </div>

        {/* Description */}
        {trip.description && (
          <div
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.7)",
              lineHeight: 1.55,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 14,
              padding: "10px 14px",
            }}
          >
            {trip.description}
          </div>
        )}

        {/* Avatar stack — who's going */}
        {goingProfiles.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <AvatarStack profiles={goingProfiles} max={7} />
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.52)", fontWeight: 600 }}>
              {goingCount === 1 ? "1 person going" : `${goingCount} people going`}
            </span>
          </div>
        )}

        {/* ── RSVP buttons ── */}
        {!isHost && !isPast && currentUser && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              {
                status: "going",
                label: "Going",
                icon: "✓",
                activeColor: "#22c55e",
                activeText: "#052e16",
                glow: "rgba(34,197,94,0.38)",
              },
              {
                status: "maybe",
                label: "Maybe",
                icon: "〜",
                activeColor: "#fbbf24",
                activeText: "#1c1004",
                glow: "rgba(251,191,36,0.38)",
              },
              {
                status: "cantgo",
                label: "Can't",
                icon: "✕",
                activeColor: "#f43f5e",
                activeText: "#200008",
                glow: "rgba(244,63,94,0.38)",
              },
            ].map(({ status, label, icon, activeColor, activeText, glow }) => {
              const isActive = myRsvp === status
              const popping = rsvpPop === status
              return (
                <button
                  key={status}
                  onClick={() => handleRsvp(status)}
                  disabled={rsvpLoading}
                  style={{
                    padding: "11px 6px",
                    borderRadius: 14,
                    border: isActive
                      ? `1.5px solid ${activeColor}`
                      : "1.5px solid rgba(255,255,255,0.1)",
                    background: isActive ? activeColor : "rgba(255,255,255,0.05)",
                    color: isActive ? activeText : "rgba(255,255,255,0.68)",
                    fontWeight: 900,
                    fontSize: 13,
                    cursor: rsvpLoading ? "wait" : "pointer",
                    transition: "all 0.18s cubic-bezier(0.175,0.885,0.32,1.275)",
                    transform: popping ? "scale(1.1)" : "scale(1)",
                    boxShadow: isActive ? `0 0 22px ${glow}` : "none",
                    display: "grid",
                    gap: 3,
                    justifyItems: "center",
                  }}
                >
                  <span style={{ fontSize: 18, display: "block", lineHeight: 1 }}>{icon}</span>
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Not logged in CTA */}
        {!currentUser && (
          <button
            onClick={() => onRequireLogin?.()}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              padding: "12px",
              color: "rgba(255,255,255,0.65)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              textAlign: "center",
              width: "100%",
            }}
          >
            Sign in to RSVP &amp; join the hype →
          </button>
        )}

        {/* ── Hype / Comments section ── */}
        <div>
          {/* Quick emoji row + comments toggle */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {QUICK_HYPES.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleQuickHype(emoji)}
                className="hype-btn"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 999,
                  padding: "5px 8px",
                  fontSize: 16,
                  cursor: "pointer",
                  transition: "transform 0.12s ease, background 0.12s ease",
                  lineHeight: 1,
                }}
              >
                {emoji}
              </button>
            ))}

            <button
              onClick={() => setShowComments((v) => !v)}
              style={{
                marginLeft: "auto",
                background: showComments
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 999,
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(255,255,255,0.6)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                whiteSpace: "nowrap",
              }}
            >
              💬 {comments.length > 0 ? comments.length : "Hype it"}
            </button>
          </div>

          {/* Comments list + input */}
          {showComments && (
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {comments.length === 0 && (
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.38)",
                    textAlign: "center",
                    padding: "10px 0",
                  }}
                >
                  Be the first to hype this trip ☝️
                </div>
              )}

              {comments.slice(-10).map((c, i) => (
                <div
                  key={c.id || i}
                  style={{ display: "flex", alignItems: "flex-start", gap: 8 }}
                >
                  <CardAvatar profile={c.profile} size={24} />
                  <div
                    style={{
                      flex: 1,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: "0 14px 14px 14px",
                      padding: "7px 11px",
                      fontSize: 13,
                      color: "rgba(255,255,255,0.85)",
                      wordBreak: "break-word",
                      lineHeight: 1.4,
                    }}
                  >
                    {c.profile && (
                      <span
                        style={{
                          fontWeight: 800,
                          color: "rgba(255,255,255,0.5)",
                          fontSize: 11,
                          marginRight: 6,
                        }}
                      >
                        {c.profile.full_name?.split(" ")[0] || c.profile.username}
                      </span>
                    )}
                    {c.content}
                  </div>
                </div>
              ))}

              {currentUser && (
                <form
                  onSubmit={handleComment}
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                >
                  <CardAvatar profile={currentUser?.user_metadata} size={24} />
                  <input
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    placeholder="Add hype… 🎿"
                    maxLength={280}
                    style={{
                      flex: 1,
                      background: "rgba(255,255,255,0.07)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 999,
                      padding: "7px 14px",
                      fontSize: 13,
                      color: "white",
                      outline: "none",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!commentInput.trim() || commentLoading}
                    style={{
                      background: commentInput.trim() ? accent : "rgba(255,255,255,0.07)",
                      color: commentInput.trim() ? "#020617" : "rgba(255,255,255,0.35)",
                      border: "none",
                      borderRadius: 999,
                      padding: "7px 16px",
                      fontSize: 12,
                      fontWeight: 900,
                      cursor: commentInput.trim() ? "pointer" : "default",
                      transition: "all 0.15s ease",
                      flexShrink: 0,
                    }}
                  >
                    Send
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Host-only: cancel trip */}
        {isHost && !isPast && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                background: "none",
                border: "none",
                color: "rgba(255,100,100,0.55)",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: 700,
                padding: 0,
              }}
            >
              {deleting ? "Cancelling…" : "Cancel trip"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
