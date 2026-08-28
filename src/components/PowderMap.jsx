import { useState } from "react"
import { MapContainer, TileLayer, CircleMarker, Marker, Popup } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import UserProfileModal from "./UserProfileModal"
import { useLiveFriendLocations } from "../lib/useLiveFriendLocations"
import { formatEtaShort } from "../lib/format"
import { TIER_COLORS, TIER_BORDER_COLORS } from "./ui/Badge"

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

// L.divIcon's `html` is raw innerHTML, not JSX — nothing here is auto-escaped the way React
// escapes {}. resort.name is static config, but people[0]'s name flows from user profile data
// before avatarFallback() reduces it to 2 initials, so escape both defensively.
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]))
}

const BUBBLE_SIZE = 56
const ICON_WIDTH = 110
const ICON_HEIGHT = 92

// Mockup's friend-initials badge has no existing design token to match (not a tier/risk/status
// color) — literal hex chosen to match the mockup exactly, same convention as this file's other
// one-off literal colors (see the Popup-chrome comment below).
function resortBubbleIcon(resort, people) {
  const tierLabel = resort.powderTier || "Closed"
  const fill = TIER_COLORS[tierLabel] || TIER_COLORS.Closed
  const scoreText = escapeHtml(resort.powderScore ?? "—")
  const name = escapeHtml(resort.name)

  const badge = people.length > 0
    ? `<div style="position:absolute;top:-4px;right:-4px;width:20px;height:20px;border-radius:999px;background:#f97316;color:#fff;font-size:9px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid #0A1628;">${escapeHtml(avatarFallback(displayName(people[0])))}</div>`
    : ""

  const html = `
    <div style="width:${ICON_WIDTH}px;height:${ICON_HEIGHT}px;display:flex;flex-direction:column;align-items:center;">
      <div class="resort-bubble-hit" style="position:relative;width:${BUBBLE_SIZE}px;height:${BUBBLE_SIZE}px;">
        <div style="width:100%;height:100%;border-radius:999px;background:radial-gradient(circle at 35% 30%, rgba(255,255,255,0.35), ${fill} 60%);box-shadow:0 0 24px 6px ${fill};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;color:#0f172a;">
          ${scoreText}
        </div>
        ${badge}
      </div>
      <div style="margin-top:6px;font-weight:800;font-size:12px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.8);white-space:nowrap;">
        ${name}
      </div>
    </div>
  `

  return L.divIcon({
    html,
    className: "resort-bubble-marker",
    iconSize: [ICON_WIDTH, ICON_HEIGHT],
    iconAnchor: [ICON_WIDTH / 2, BUBBLE_SIZE / 2],
    popupAnchor: [0, -BUBBLE_SIZE / 2],
  })
}

function SheetRow({ resort }) {
  const tierLabel = resort.powderTier || "Closed"
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
      <div
        style={{
          minWidth: 36,
          height: 28,
          borderRadius: 8,
          background: TIER_BORDER_COLORS[tierLabel] || TIER_BORDER_COLORS.Closed,
          color: TIER_COLORS[tierLabel] || TIER_COLORS.Closed,
          fontWeight: 900,
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {resort.powderScore ?? "—"}
      </div>
      <div style={{ flex: 1, fontWeight: 700, fontSize: 14, color: "var(--color-text-1)" }}>
        {resort.name}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-accent)" }}>
        {resort.snowPrev24in != null ? `${resort.snowPrev24in}" new` : "—"}
      </div>
    </div>
  )
}

function TopOfTheListSheet({ resorts, expanded, onToggle }) {
  const top3 = resorts.slice(0, 3)
  if (top3.length === 0) return null

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1100,
        background: "var(--color-modal-bg)",
        borderTop: "1px solid var(--color-border)",
        borderRadius: "20px 20px 0 0",
        padding: "8px 16px 14px",
        boxShadow: "0 -8px 30px rgba(0,0,0,0.4)",
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse top of the list" : "Expand top of the list"}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "2px 0",
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 999, background: "var(--color-border)" }} />
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: "var(--color-text-2)" }}>
          TOP OF THE LIST
        </div>
      </button>

      {expanded && (
        <div>
          {top3.map((r) => (
            <SheetRow key={r.name} resort={r} />
          ))}
        </div>
      )}
    </div>
  )
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

export default function PowderMap({
  resorts,
  skierCounts = {},
  skierDetails = {},
  friendIds = [],
}) {
  const [viewingUserId, setViewingUserId] = useState(null)
  const [sheetExpanded, setSheetExpanded] = useState(true)
  // Live "N friends on mountain now" pins (S28-T3) — ephemeral Realtime
  // Broadcast, only ever shown for accepted friends.
  const liveLocations = useLiveFriendLocations(friendIds)

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          position: "relative",
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
              <Marker
                key={r.name}
                position={[r.lat, r.lon]}
                icon={resortBubbleIcon(r, people)}
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
              </Marker>
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

        <TopOfTheListSheet
          resorts={resorts}
          expanded={sheetExpanded}
          onToggle={() => setSheetExpanded((e) => !e)}
        />
      </div>
      {viewingUserId && (
        <UserProfileModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />
      )}
    </div>
  )
}