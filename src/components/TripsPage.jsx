import { useEffect, useState, useCallback } from "react"
import { getCurrentUser, getAllVisibleTrips } from "../lib/socialApi"
import TripCard from "./TripCard"
import CreateTripModal from "./CreateTripModal"

const RESORT_PREVIEWS = [
  "/resorts/vail.jpg",
  "/resorts/breckenridge.jpg",
  "/resorts/steamboat.jpg",
  "/resorts/telluride.jpg",
]

function EmptyState({ onCreateTrip }) {
  return (
    <div
      style={{
        borderRadius: 28,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        padding: "52px 32px",
        textAlign: "center",
        display: "grid",
        gap: 22,
        justifyItems: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
      }}
    >
      {/* Tilted resort photo collage */}
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          alignItems: "center",
          height: 72,
        }}
      >
        {RESORT_PREVIEWS.map((photo, i) => (
          <div
            key={i}
            style={{
              width: 62,
              height: 62,
              borderRadius: 16,
              backgroundImage: `url(${photo})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              opacity: 0.75,
              transform: `rotate(${[-5, -1.5, 1.5, 5][i]}deg)`,
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
            }}
          />
        ))}
      </div>

      <div>
        <div
          style={{ fontSize: 26, fontWeight: 900, color: "white", letterSpacing: -0.5 }}
        >
          Plan your first powder day
        </div>
        <div
          style={{
            fontSize: 15,
            color: "rgba(255,255,255,0.5)",
            marginTop: 8,
            maxWidth: 380,
            lineHeight: 1.6,
          }}
        >
          Create a trip, pick a mountain and date, then let your crew RSVP in one tap.
        </div>
      </div>

      <button
        onClick={onCreateTrip}
        style={{
          background: "linear-gradient(135deg, #2563eb, #0891b2)",
          color: "white",
          border: "none",
          borderRadius: 16,
          padding: "14px 30px",
          fontSize: 15,
          fontWeight: 900,
          cursor: "pointer",
          boxShadow: "0 10px 32px rgba(37,99,235,0.45)",
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
        }}
        className="cta-btn"
      >
        Drop Your First Trip 🎿
      </button>
    </div>
  )
}

function NotLoggedIn({ onLogin }) {
  return (
    <div
      style={{
        borderRadius: 28,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        padding: "52px 32px",
        textAlign: "center",
        display: "grid",
        gap: 20,
        justifyItems: "center",
      }}
    >
      <div style={{ fontSize: 44 }}>🎿</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "white", letterSpacing: -0.4 }}>
          Plan ski trips with your crew
        </div>
        <div
          style={{
            fontSize: 14,
            color: "rgba(255,255,255,0.5)",
            marginTop: 8,
            maxWidth: 340,
            lineHeight: 1.6,
          }}
        >
          Create trips, RSVP to friend plans, and coordinate powder days together — all in one place.
        </div>
      </div>
      <button
        onClick={onLogin}
        style={{
          background: "linear-gradient(135deg, #2563eb, #0891b2)",
          color: "white",
          border: "none",
          borderRadius: 14,
          padding: "13px 26px",
          fontSize: 14,
          fontWeight: 900,
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(37,99,235,0.4)",
        }}
      >
        Sign In to Get Started
      </button>
    </div>
  )
}

function TripSection({ title, subtitle, badge, trips, currentUser, onUpdate, onRequireLogin }) {
  const [deletedIds, setDeletedIds] = useState(new Set())
  const visible = trips.filter((t) => !deletedIds.has(t.id))
  if (!visible.length) return null

  return (
    <section>
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 19, fontWeight: 900, color: "white" }}>{title}</div>
          {badge != null && (
            <div
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 999,
                padding: "3px 10px",
                fontSize: 12,
                fontWeight: 800,
                color: "rgba(255,255,255,0.6)",
              }}
            >
              {badge}
            </div>
          )}
        </div>
        {subtitle && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.42)", marginTop: 4 }}>
            {subtitle}
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))",
          gap: 20,
        }}
      >
        {visible.map((trip) => (
          <TripCard
            key={trip.id}
            trip={trip}
            currentUser={currentUser}
            onUpdate={onUpdate}
            onRequireLogin={onRequireLogin}
            onDeleted={() => {
              setDeletedIds((prev) => new Set([...prev, trip.id]))
              onUpdate()
            }}
          />
        ))}
      </div>
    </section>
  )
}

export default function TripsPage({ onRequireLogin }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [myTrips, setMyTrips] = useState([])
  const [rsvpdTrips, setRsvpdTrips] = useState([])
  const [friendsTrips, setFriendsTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState("")

  const loadTrips = useCallback(async (user) => {
    try {
      const { mine, friends, rsvpd } = await getAllVisibleTrips()
      setMyTrips(mine)
      setRsvpdTrips(rsvpd)
      setFriendsTrips(friends)
    } catch (err) {
      console.warn("Trips load failed:", err)
    }
  }, [])

  useEffect(() => {
    async function init() {
      try {
        const user = await getCurrentUser()
        setCurrentUser(user)
        if (user) await loadTrips(user)
      } catch (err) {
        setError(err.message || "Something went wrong.")
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [loadTrips])

  function handleCreateClick() {
    if (!currentUser) {
      onRequireLogin?.()
    } else {
      setShowCreate(true)
    }
  }

  const hasAnyTrips = myTrips.length + rsvpdTrips.length + friendsTrips.length > 0

  return (
    <div style={{ paddingBottom: 48 }}>
      <style>{`
        .trip-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 36px 90px rgba(0,0,0,0.65) !important;
        }
        .hype-btn:hover {
          transform: scale(1.22) !important;
          background: rgba(255,255,255,0.13) !important;
        }
        .cta-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 40px rgba(37,99,235,0.55) !important;
        }
        .plan-trip-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 36px rgba(37,99,235,0.5) !important;
        }
      `}</style>

      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 30,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 12,
              color: "rgba(255,255,255,0.55)",
              marginBottom: 13,
            }}
          >
            🎿 Social Hub
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: -0.9,
              lineHeight: 1.05,
            }}
          >
            Ski Trips
          </h2>
          <p
            style={{
              margin: "9px 0 0",
              color: "rgba(255,255,255,0.52)",
              fontSize: 15,
            }}
          >
            Coordinate powder days with your crew
          </p>
        </div>

        <button
          onClick={handleCreateClick}
          className="plan-trip-btn"
          style={{
            background: "linear-gradient(135deg, #2563eb, #0891b2)",
            color: "white",
            border: "none",
            borderRadius: 16,
            padding: "14px 22px",
            fontSize: 15,
            fontWeight: 900,
            cursor: "pointer",
            boxShadow: "0 8px 28px rgba(37,99,235,0.42)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
            flexShrink: 0,
          }}
        >
          + Plan a Trip
        </button>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div
          style={{
            textAlign: "center",
            padding: "70px 0",
            color: "rgba(255,255,255,0.35)",
            fontSize: 14,
          }}
        >
          Loading trips…
        </div>
      ) : error ? (
        <div
          style={{
            background: "rgba(244,63,94,0.1)",
            border: "1px solid rgba(244,63,94,0.2)",
            borderRadius: 14,
            padding: "14px 18px",
            fontSize: 13,
            color: "#fda4af",
          }}
        >
          {error}
        </div>
      ) : !currentUser ? (
        <NotLoggedIn onLogin={onRequireLogin} />
      ) : !hasAnyTrips ? (
        <EmptyState onCreateTrip={handleCreateClick} />
      ) : (
        <div style={{ display: "grid", gap: 38 }}>
          <TripSection
            title="Your Trips"
            subtitle="Trips you're hosting"
            badge={myTrips.length || null}
            trips={myTrips}
            currentUser={currentUser}
            onUpdate={() => loadTrips(currentUser)}
            onRequireLogin={onRequireLogin}
          />

          <TripSection
            title="You're Going"
            subtitle="Trips you've RSVP'd to"
            badge={rsvpdTrips.length || null}
            trips={rsvpdTrips}
            currentUser={currentUser}
            onUpdate={() => loadTrips(currentUser)}
            onRequireLogin={onRequireLogin}
          />

          <TripSection
            title="Friends' Trips"
            subtitle="Your crew is planning — jump in"
            badge={friendsTrips.length || null}
            trips={friendsTrips}
            currentUser={currentUser}
            onUpdate={() => loadTrips(currentUser)}
            onRequireLogin={onRequireLogin}
          />
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateTripModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            loadTrips(currentUser)
          }}
        />
      )}
    </div>
  )
}
