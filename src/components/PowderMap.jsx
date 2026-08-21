import { useState } from "react"
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import UserProfileModal from "./UserProfileModal"
import { useLiveFriendLocations } from "../lib/useLiveFriendLocations"
import { formatEtaShort } from "../lib/format"

function scoreColor(score) {
  if (score == null) return "var(--rating-slate)"  // no data
  if (score >= 88) return "var(--rating-mint)"      // elite / best snow
  if (score >= 76) return "var(--rating-sky)"       // very good
  if (score >= 63) return "var(--rating-gold)"      // good
  if (score >= 50) return "var(--rating-peach)"     // okay / decent
  return "var(--rating-coral)"                      // low powder score
}

function markerRadius(count) {
  if (!count || count <= 0) return 8
  if (count >= 10) return 20
  if (count >= 7) return 17
  if (count >= 4) return 14
  if (count >= 2) return 11
  return 9
}

function displayName(person) {
  return person.full_name || person.username || "Skier"
}

function statusLabel(status) {
  if (status === "arrived") return "On mountain"
  if (status === "driving") return "On the way"
  if (status === "planning") return "Planning"
  if (status === "done") return "Done"
  return status || "Unknown"
}

function avatarFallback(name) {
  return (name || "S")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

// Renders only inside a Leaflet <Popup>, which uses leaflet.css's fixed white
// popup chrome (no app dark-theme override exists for it) — colors below are
// intentionally literal hex chosen for contrast on that white surface, not
// app-theme tokens which are calibrated for the dark app chrome.
function SkierRow({ person, onViewProfile }) {
  const name = displayName(person)
  const eta = formatEtaShort(person.eta)

  return (
    <div
      onClick={() => onViewProfile?.(person.id)}
      style={{
        display: "grid",
        gridTemplateColumns: "34px 1fr",
        gap: 8,
        alignItems: "center",
        marginTop: 8,
        cursor: person.id ? "pointer" : "default",
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          overflow: "hidden",
          background: "#dbeafe",
          display: "grid",
          placeItems: "center",
          fontSize: 11,
          fontWeight: 900,
          color: "#0f172a",
          flexShrink: 0,
        }}
      >
        {person.avatar_url ? (
          <img
            src={person.avatar_url}
            alt={name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          avatarFallback(name)
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{name}</div>
        <div style={{ fontSize: 12, color: "#475569" }}>
          {statusLabel(person.status)}
          {eta && (person.status === "planning" || person.status === "driving")
            ? ` · ETA ${eta}`
            : ""}
        </div>
      </div>
    </div>
  )
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          background: color,
          border: "1px solid rgba(255,255,255,0.25)",
        }}
      />
      <div>{label}</div>
    </div>
  )
}

function MarkerSizeItem({ size, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          background: "var(--color-accent-deep)",
          border: "1px solid rgba(255,255,255,0.25)",
        }}
      />
      <div>{label}</div>
    </div>
  )
}

export default function PowderMap({
  resorts,
  skierCounts = {},
  skierDetails = {},
  friendIds = [],
}) {
  const [viewingUserId, setViewingUserId] = useState(null)
  // Live "N friends on mountain now" pins (S28-T3) — ephemeral Realtime
  // Broadcast, only ever shown for accepted friends.
  const liveLocations = useLiveFriendLocations(friendIds)

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 16,
            padding: 14,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 14 }}>
            Powder Score Color
          </div>

          <LegendItem color="var(--rating-coral)" label="Low powder score" />
          <LegendItem color="var(--rating-peach)" label="Okay / decent" />
          <LegendItem color="var(--rating-gold)" label="Good" />
          <LegendItem color="var(--rating-sky)" label="Very good" />
          <LegendItem color="var(--rating-mint)" label="Elite / best snow" />
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 16,
            padding: 14,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 14 }}>
            Marker Size = Skier Density
          </div>

          <MarkerSizeItem size={8} label="0–1 skiers" />
          <MarkerSizeItem size={11} label="2–3 skiers" />
          <MarkerSizeItem size={14} label="4–6 skiers" />
          <MarkerSizeItem size={17} label="7–9 skiers" />
          <MarkerSizeItem size={20} label="10+ skiers" />
        </div>
      </div>

      <div
        style={{
          height: "min(520px, calc(100dvh - 340px))",
          minHeight: 280,
          borderRadius: 20,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <MapContainer
          center={[39.5, -106.2]}
          zoom={7}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution="OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {resorts.map((r) => {
            const count = skierCounts?.[r.resortKey] || 0
            const people = skierDetails?.[r.resortKey] || []

            return (
              <CircleMarker
                key={r.name}
                center={[r.lat, r.lon]}
                radius={markerRadius(count)}
                pathOptions={{
                  color: scoreColor(r.powderScore),
                  fillColor: scoreColor(r.powderScore),
                  fillOpacity: 0.88,
                  weight: 2,
                }}
              >
                <Popup maxWidth={320}>
                  <div style={{ minWidth: 240 }}>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{r.name}</div>

                    <div style={{ marginTop: 6, fontSize: 13 }}>
                      Powder Score: <strong>{r.powderScore ?? "—"}</strong>
                    </div>

                    <div style={{ fontSize: 13 }}>
                      Snow 24h: <strong>{r.snowPrev24in ?? "—"}"</strong>
                    </div>

                    <div style={{ fontSize: 13 }}>
                      Skiers Today: <strong>{count}</strong>
                    </div>

                    {/* Popup interior renders on Leaflet's fixed white chrome (see
                        SkierRow comment above) — border/text colors below stay literal. */}
                    <div
                      style={{
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: "1px solid #e2e8f0",
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 13 }}>
                        Friends / crew at or heading to {r.name}
                      </div>

                      {people.length === 0 ? (
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
                          Nobody from your visible crew has posted here yet.
                        </div>
                      ) : (
                        <div>
                          {people.map((person) => (
                            <SkierRow key={person.id} person={person} onViewProfile={setViewingUserId} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}

          {/* Live friend location pins (S28-T3) — visually distinct (amber ring)
              from the resort powder-score markers above. Disappear within ~90s
              of a friend stopping sharing (staleness cleanup in the hook), or
              immediately on an explicit "stopped" broadcast. */}
          {Object.entries(liveLocations).map(([friendId, loc]) => (
            <CircleMarker
              key={`friend-${friendId}`}
              center={[loc.lat, loc.lng]}
              radius={10}
              pathOptions={{ color: "var(--color-warning)", fillColor: "var(--color-warning)", fillOpacity: 0.9, weight: 2 }}
              eventHandlers={{ click: () => setViewingUserId(friendId) }}
            >
              {/* Popup interior renders on Leaflet's fixed white chrome (see SkierRow
                  comment above) — avatar/text colors below stay literal, not app-theme
                  tokens. */}
              <Popup maxWidth={220}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      overflow: "hidden",
                      background: "#fef3c7",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 11,
                      fontWeight: 900,
                      color: "#92400e",
                      flexShrink: 0,
                    }}
                  >
                    {loc.avatar_url ? (
                      <img src={loc.avatar_url} alt={loc.name || "Friend"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      avatarFallback(loc.name)
                    )}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>{loc.name || "Friend"}</div>
                    <div style={{ fontSize: 11, color: "#92400e" }}>📍 On the mountain now</div>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      {viewingUserId && (
        <UserProfileModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />
      )}
    </div>
  )
}