import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet"
import "leaflet/dist/leaflet.css"

function scoreColor(score) {
  if (score == null) return "#bfdbfe"   // fallback light blue
  if (score >= 88) return "#0f172a"     // dark navy
  if (score >= 76) return "#1e3a8a"     // strong navy-blue
  if (score >= 63) return "#2563eb"     // medium blue
  if (score >= 50) return "#60a5fa"     // lighter blue
  return "#bae6fd"                      // very light blue
}

function markerRadius(count) {
  if (!count || count <= 0) return 8
  if (count >= 10) return 20
  if (count >= 7) return 17
  if (count >= 4) return 14
  if (count >= 2) return 11
  return 9
}

function formatPlanTime(isoString) {
  if (!isoString) return null
  const d = new Date(isoString)
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
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

function SkierRow({ person }) {
  const name = displayName(person)
  const eta = formatPlanTime(person.eta)

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "34px 1fr",
        gap: 8,
        alignItems: "center",
        marginTop: 8,
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
          background: "#2563eb",
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
}) {
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

          <LegendItem color="#bae6fd" label="Low powder score" />
          <LegendItem color="#60a5fa" label="Okay / decent" />
          <LegendItem color="#2563eb" label="Good" />
          <LegendItem color="#1e3a8a" label="Very good" />
          <LegendItem color="#0f172a" label="Elite / best snow" />
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
          height: 520,
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
                            <SkierRow key={person.id} person={person} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}
        </MapContainer>
      </div>
    </div>
  )
}