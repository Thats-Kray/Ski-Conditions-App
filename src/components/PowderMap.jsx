import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet"
import "leaflet/dist/leaflet.css"

function scoreColor(score) {
  if (!score) return "#94a3b8"
  if (score >= 88) return "#22c55e"
  if (score >= 76) return "#38bdf8"
  if (score >= 63) return "#facc15"
  if (score >= 50) return "#fb923c"
  return "#ef4444"
}

export default function PowderMap({ resorts }) {
  return (
    <div
      style={{
        height: 420,
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

        {resorts.map((r) => (
          <CircleMarker
            key={r.name}
            center={[r.lat, r.lon]}
            radius={10}
            pathOptions={{
              color: scoreColor(r.powderScore),
              fillOpacity: 0.8,
            }}
          >
            <Popup>
              <strong>{r.name}</strong>
              <br />
              Powder Score: {r.powderScore || "—"}
              <br />
              Snow 24h: {r.snowPrev24in ?? "—"}"
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}