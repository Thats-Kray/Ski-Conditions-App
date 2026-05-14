import { useEffect, useMemo, useRef, useState } from "react"
import { useMobile } from "./lib/useMobile"
import AuthForm from "./components/AuthForm"
import OnboardingFlow from "./components/OnboardingFlow"
import PowderMap from "./components/PowderMap"
import FriendsPage from "./components/FriendsPage"
import ProfilePage from "./components/ProfilePage"
import SkiPlansPage from "./components/SkiPlansPage"
import TripDetailModal from "./components/TripDetailModal"
import NotificationBell from "./components/NotificationBell"
import {
  getCurrentUser,
  getMyProfile,
  getResortSkierCounts,
  getResortSkierDetails,
  getTripDetail,
  logOut,
} from "./lib/socialApi"

import { supabase } from "./lib/supabase"

const RESORTS = [
  // Epic
  {
    name: "Vail",
    pass: "Epic",
    lat: 39.6403,
    lon: -106.3742,
    resortKey: "vail",
    photoPath: "/resorts/vail.jpg",
    directionsQuery: "Vail Parking Structure, Vail CO",
    isOpen: false,
  },
  {
    name: "Beaver Creek",
    pass: "Epic",
    lat: 39.6042,
    lon: -106.5165,
    resortKey: "beavercreek",
    photoPath: "/resorts/beaver-creek.jpg",
    directionsQuery: "Beaver Creek Elk Lot, Avon CO",
    isOpen: false,
  },
  {
    name: "Breckenridge",
    pass: "Epic",
    lat: 39.4817,
    lon: -106.0384,
    resortKey: "breckenridge",
    photoPath: "/resorts/breckenridge.jpg",
    directionsQuery: "Breckenridge Gondola Lot, Breckenridge CO",
    isOpen: false,
  },
  {
    name: "Keystone",
    pass: "Epic",
    lat: 39.6084,
    lon: -105.9437,
    resortKey: "keystone",
    photoPath: "/resorts/keystone.jpg",
    directionsQuery: "River Run Parking Lot, Keystone CO",
    isOpen: false,
  },
  {
    name: "Crested Butte",
    pass: "Epic",
    lat: 38.8996,
    lon: -106.9653,
    resortKey: "crestedbutte",
    photoPath: "/resorts/crested-butte.jpg",
    directionsQuery: "Crested Butte Mountain Resort Parking, Mt Crested Butte CO",
    isOpen: false,
  },
  {
    name: "Telluride",
    pass: "Epic",
    lat: 37.9363,
    lon: -107.8466,
    resortKey: "telluride",
    photoPath: "/resorts/telluride.jpg",
    directionsQuery: "Telluride Mountain Village Parking Garage, Mountain Village CO",
    isOpen: false,
  },

  // Ikon
  {
    name: "Winter Park",
    pass: "Ikon",
    lat: 39.8863,
    lon: -105.7626,
    resortKey: "winterpark",
    photoPath: "/resorts/winter-park.jpg",
    directionsQuery: "Winter Park Resort Parking Garage, Winter Park CO",
    isOpen: false,
  },
  {
    name: "Copper Mountain",
    pass: "Ikon",
    lat: 39.5022,
    lon: -106.1512,
    resortKey: "coppermountain",
    photoPath: "/resorts/copper-mountain.jpg",
    directionsQuery: "Copper Mountain Alpine Lot, Frisco CO",
    isOpen: false,
  },
  {
    name: "Arapahoe Basin",
    pass: "Ikon",
    lat: 39.6423,
    lon: -105.8717,
    resortKey: "arapahoebasin",
    photoPath: "/resorts/arapahoe-basin.jpg",
    directionsQuery: "Arapahoe Basin Ski Area Parking Lot, Dillon CO",
    isOpen: true,
  },
  {
    name: "Steamboat",
    pass: "Ikon",
    lat: 40.4572,
    lon: -106.8047,
    resortKey: "steamboat",
    photoPath: "/resorts/steamboat.jpg",
    directionsQuery: "Steamboat Gondola Square Parking, Steamboat Springs CO",
    isOpen: false,
  },
  {
    name: "Eldora",
    pass: "Ikon",
    lat: 39.9372,
    lon: -105.5842,
    resortKey: "eldora",
    photoPath: "/resorts/eldora.jpg",
    directionsQuery: "Eldora Mountain Resort Parking, Nederland CO",
    isOpen: false,
  },
  {
    name: "Aspen Snowmass",
    pass: "Ikon",
    lat: 39.2097,
    lon: -106.9499,
    resortKey: "aspensnowmass",
    photoPath: "/resorts/aspen-snowmass.jpg",
    directionsQuery: "Snowmass Base Village Parking, Snowmass Village CO",
    isOpen: false,
  },
]

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function safePercent(open, total) {
  if (open == null || total == null || total === 0) return null
  return open / total
}

function formatPercent(open, total) {
  if (open == null || total == null || total === 0) return "—"
  return `${Math.round((open / total) * 100)}%`
}

function mapsUrl(destination) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destination
  )}`
}

function initialsFromText(text) {
  const clean = (text || "SK").replace(/@.*/, "").trim()

  if (!clean) return "SK"

  return clean
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function computeRawPowderScore({
  tempF,
  windMph,
  forecastText,
  snowPrev24in,
  snowPrev48in,
  snow24in,
  snow48in,
  baseDepth,
  liftsOpen,
  liftsTotal,
  runsOpen,
  runsTotal,
  drivePenalty,
}) {
  const snowHint = /snow|flurr|sleet|wintry/i.test(forecastText || "") ? 2 : 0

  const observedSnowScore =
    clamp((snowPrev24in ?? 0) * 4.5, 0, 40) +
    clamp((snowPrev48in ?? 0) * 1.5, 0, 12)

  const forecastSnowScore =
    clamp((snow24in ?? 0) * 3.5, 0, 24) +
    clamp((snow48in ?? 0) * 1.2, 0, 10)

  const tempScore = clamp(18 - Math.abs((tempF ?? 30) - 21), 0, 18)
  const windPenalty = clamp((windMph ?? 0) * 0.9, 0, 22)

  const runsPct = safePercent(runsOpen, runsTotal)
  const liftsPct = safePercent(liftsOpen, liftsTotal)

  const terrainScore =
    (runsPct != null ? runsPct * 14 : 0) +
    (liftsPct != null ? liftsPct * 8 : 0)

  const baseDepthScore = clamp((baseDepth ?? 0) / 8, 0, 10)

  const raw =
    observedSnowScore +
    forecastSnowScore +
    tempScore +
    terrainScore +
    baseDepthScore +
    snowHint -
    windPenalty -
    (drivePenalty ?? 0)

  return Math.round(raw * 10) / 10
}

function normalizePowderScores(rows) {
  const valid = rows.filter((r) => typeof r.rawPowderScore === "number")
  if (valid.length === 0) return rows

  const rawScores = valid.map((r) => r.rawPowderScore)
  const min = Math.min(...rawScores)
  const max = Math.max(...rawScores)
  const spread = max - min

  return rows.map((r) => {
    if (typeof r.rawPowderScore !== "number") {
      return { ...r, powderScore: null, powderTier: "Unknown" }
    }

    const normalized =
      spread < 0.01 ? 70 : 35 + ((r.rawPowderScore - min) / spread) * 60

    const powderScore = Math.round(normalized)

    let powderTier = "Decent"
    if (powderScore >= 88) powderTier = "Elite"
    else if (powderScore >= 76) powderTier = "Very Good"
    else if (powderScore >= 63) powderTier = "Good"
    else if (powderScore >= 50) powderTier = "Okay"
    else powderTier = "Low"

    return {
      ...r,
      powderScore,
      powderTier,
    }
  })
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8787"

async function fetchJson(url, errorMessage) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(errorMessage)
  const data = await r.json()
  if (data?.error) throw new Error(data.error)
  return data
}

async function fetchNwsNowish(lat, lon) {
  const point = await fetchJson(
    `${API_BASE}/api/nws/point?lat=${lat}&lon=${lon}`,
    `Point lookup failed for ${lat}, ${lon}`
  )

  const hourlyUrl = point?.properties?.forecastHourly
  const forecastUrl = point?.properties?.forecast

  if (!hourlyUrl || !forecastUrl) {
    throw new Error("Missing NWS forecast URLs for this point.")
  }

  const [hourly, daily] = await Promise.all([
    fetchJson(
      `${API_BASE}/api/nws/forecast?url=${encodeURIComponent(hourlyUrl)}`,
      "Hourly forecast fetch failed."
    ),
    fetchJson(
      `${API_BASE}/api/nws/forecast?url=${encodeURIComponent(forecastUrl)}`,
      "Daily forecast fetch failed."
    ),
  ])

  const h0 = hourly?.properties?.periods?.[0]
  const d0 = daily?.properties?.periods?.[0]

  return {
    tempF: h0?.temperature,
    wind: h0?.windSpeed,
    windMph: parseInt((h0?.windSpeed || "0").match(/\d+/)?.[0] || "0", 10),
    shortForecast: d0?.shortForecast || h0?.shortForecast || "",
    detailedForecast: d0?.detailedForecast || "",
    updated: hourly?.properties?.updated || null,
  }
}

async function fetchNwsSnow(lat, lon) {
  return fetchJson(
    `${API_BASE}/api/nws/snow?lat=${lat}&lon=${lon}`,
    `Snow forecast fetch failed for ${lat}, ${lon}`
  )
}

async function fetchResortSnow(resortKey) {
  return fetchJson(
    `${API_BASE}/api/resort-snow?resort=${encodeURIComponent(resortKey)}`,
    `Resort snow fetch failed for ${resortKey}`
  )
}

async function fetchDriveRisk(resortKey) {
  return fetchJson(
    `${API_BASE}/api/drive-risk?resort=${encodeURIComponent(resortKey)}`,
    `Drive risk fetch failed for ${resortKey}`
  )
}

function Row({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 13,
      }}
    >
      <div style={{ color: "rgba(255,255,255,0.62)" }}>{label}</div>
      <div style={{ textAlign: "right", fontWeight: 700 }}>{value}</div>
    </div>
  )
}

function tierColor(tier) {
  if (tier === "Elite") return "#8ef6d1"
  if (tier === "Very Good") return "#9bc6ff"
  if (tier === "Good") return "#ffe39a"
  if (tier === "Okay") return "#ffc996"
  return "#ff9d9d"
}

function riskColor(risk) {
  if (risk === "Low") return "#8ef6d1"
  if (risk === "Moderate") return "#ffe39a"
  if (risk === "High") return "#ffc996"
  return "#ff9d9d"
}

function scoreGradient(score) {
  if (score == null) return "linear-gradient(135deg, #334155, #1e293b)"
  if (score >= 88) return "linear-gradient(135deg, #0f766e, #2563eb)"
  if (score >= 76) return "linear-gradient(135deg, #1d4ed8, #4338ca)"
  if (score >= 63) return "linear-gradient(135deg, #475569, #334155)"
  if (score >= 50) return "linear-gradient(135deg, #7c2d12, #92400e)"
  return "linear-gradient(135deg, #7f1d1d, #451a03)"
}

function ResortCard({ r, skierCounts, skierDetails }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="resort-card"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: r.isOpen ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(255,255,255,0.08)",
        borderRadius: 24,
        overflow: "hidden",
        transition: "transform .2s ease, box-shadow .2s ease",
        boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
        backdropFilter: "blur(12px)",
        opacity: r.isOpen === false ? 0.72 : 1,
      }}
    >
      {/* Hero */}
      <div
        className="resort-card-hero"
        style={{
          position: "relative",
          padding: 16,
          background: r.photoPath
            ? `linear-gradient(to top, rgba(2,6,23,0.82), rgba(2,6,23,0.2)), url(${r.photoPath}) center/cover`
            : scoreGradient(r.powderScore),
        }}
      >
        <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {r.isOpen === false && (
            <div style={{ background: "rgba(30,10,10,0.75)", border: "1px solid rgba(239,68,68,0.5)", borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 900, color: "#f87171" }}>Closed for Season</div>
          )}
          {r.isOpen === true && (
            <div style={{ background: "rgba(10,30,10,0.75)", border: "1px solid rgba(34,197,94,0.5)", borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 900, color: "#4ade80" }}>Open</div>
          )}
          <div style={{ background: "rgba(2,6,23,0.55)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 900 }}>{r.pass}</div>
          <div style={{ background: "rgba(2,6,23,0.55)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 900, color: riskColor(r.driveRisk) }}>{r.driveRisk || "Unknown"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, paddingTop: 44 }}>
          <ResortLogo resort={r} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.05 }}>{r.name}</div>
            <div style={{ marginTop: 5, display: "inline-flex", gap: 8, alignItems: "center", background: "rgba(2,6,23,0.55)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 900, color: tierColor(r.powderTier) }}>
              Score {r.powderScore ?? "—"} · {r.powderTier || "Unknown"}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "14px 16px 16px", display: "grid", gap: 12 }}>
        {/* Key 3 metrics */}
        <div className="metric-grid">
          {[
            { label: "24h Snow", value: r.snowPrev24in != null ? `${r.snowPrev24in}"` : "—" },
            { label: "Base",     value: r.baseDepth  != null ? `${r.baseDepth}"` : "—" },
            { label: "Skiers",   value: skierCounts?.[r.resortKey] ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
              <div style={{ marginTop: 3, fontSize: 20, fontWeight: 900 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Forecast */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
          {r.shortForecast || "—"}
        </div>

        {/* Travel alerts */}
        {r.driveAlerts && r.driveAlerts.length > 0 && (
          <div style={{ background: "rgba(255,195,0,0.04)", border: "1px solid rgba(255,195,0,0.14)", borderRadius: 12, padding: "10px 12px", fontSize: 12, color: "rgba(255,255,255,0.65)", display: "grid", gap: 4 }}>
            <div style={{ fontWeight: 800, color: "rgba(255,195,0,0.75)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Travel Alerts</div>
            {r.driveAlerts.slice(0, 2).map((alert, idx) => <div key={idx}>• {alert}</div>)}
          </div>
        )}

        {/* Details toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "7px 12px", color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, transition: "color 0.15s" }}
        >
          {expanded ? "▲ Hide Details" : "▼ Show Details"}
        </button>

        {/* Collapsible detail rows */}
        {expanded && (
          <div style={{ display: "grid", gap: 7, padding: "4px 0" }}>
            <Row label="Snow (prev 48h)"  value={r.snowPrev48in != null ? `${r.snowPrev48in}"` : "—"} />
            <Row label="Snow (next 24h)"  value={r.snow24in     != null ? `${r.snow24in}"` : "—"} />
            <Row label="Snow (next 48h)"  value={r.snow48in     != null ? `${r.snow48in}"` : "—"} />
            <Row label="Summit Depth"     value={r.summitDepth  != null ? `${r.summitDepth}"` : "—"} />
            <Row label="Temp"             value={r.tempF        != null ? `${r.tempF}°F` : "—"} />
            <Row label="Wind"             value={r.wind || "—"} />
            <Row label="Lifts"            value={r.liftsOpen != null && r.liftsTotal != null ? `${r.liftsOpen}/${r.liftsTotal} (${formatPercent(r.liftsOpen, r.liftsTotal)})` : "—"} />
            <Row label="Runs"             value={r.runsOpen  != null && r.runsTotal  != null ? `${r.runsOpen}/${r.runsTotal} (${formatPercent(r.runsOpen, r.runsTotal)})` : "—"} />
            <Row label="Drive Risk"       value={<span style={{ color: riskColor(r.driveRisk), fontWeight: 900 }}>{r.driveRisk || "Unknown"}</span>} />
            {(r.observedUpdated || r.forecastUpdated) && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4, lineHeight: 1.5 }}>
                Resort report: {r.observedUpdated || "—"}<br />
                Forecast: {r.forecastUpdated ? new Date(r.forecastUpdated).toLocaleString() : "—"}
              </div>
            )}
          </div>
        )}

        {/* Directions */}
        <a
          href={mapsUrl(r.directionsQuery)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "grid", placeItems: "center", textDecoration: "none", color: "#052e2b", fontWeight: 900, padding: "11px 14px", borderRadius: 14, background: "linear-gradient(135deg, #34d399, #22c55e)", fontSize: 13 }}
        >
          📍 Directions
        </a>
      </div>
    </div>
  )
}

function ResortLogo({ resort }) {
  const initials = resort.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase()

  return (
    <div
      style={{
        width: 46,
        height: 46,
        borderRadius: 14,
        background: "linear-gradient(135deg, #1e293b, #334155)",
        border: "1px solid rgba(255,255,255,0.14)",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        fontSize: 12,
        fontWeight: 900,
        color: "white",
      }}
    >
      {initials}
    </div>
  )
}

function LeaderCard({ title, icon, resort }) {
  if (!resort) return null

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 22,
        padding: 18,
        display: "grid",
        gap: 8,
        boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.58)",
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontSize: 26 }}>{icon}</div>
        <div>
          <div style={{ fontSize: 19, fontWeight: 900 }}>{resort.name}</div>
          <div
            style={{
              marginTop: 2,
              color: tierColor(resort.powderTier),
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            Score {resort.powderScore} · {resort.powderTier}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>
        {resort.snowPrev24in != null ? `${resort.snowPrev24in}" last 24h` : "—"} ·{" "}
        {resort.snow24in != null ? `${resort.snow24in}" next 24h` : "—"} ·{" "}
        <span style={{ color: riskColor(resort.driveRisk), fontWeight: 800 }}>
          Drive {resort.driveRisk}
        </span>
      </div>
    </div>
  )
}

const BOTTOM_TABS = [
  { key: "dashboard", icon: "🏔️", label: "Conditions" },
  { key: "map",       icon: "🗺️",  label: "Map" },
  { key: "plans",     icon: "🎿",  label: "Plans" },
  { key: "friends",   icon: "❤️",  label: "Friends" },
  { key: "profile",   icon: "👤",  label: "Profile" },
]

function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav className="bottom-nav">
      {BOTTOM_TABS.map(({ key, icon, label }) => {
        const isActive = activeTab === key
        return (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 2px",
              color: isActive ? "#60a5fa" : "rgba(255,255,255,0.42)",
              transition: "color 0.15s ease",
              minWidth: 0,
            }}
          >
            <span style={{
              fontSize: 22,
              lineHeight: 1,
              filter: isActive ? "drop-shadow(0 0 6px rgba(96,165,250,0.6))" : "none",
              transition: "filter 0.15s ease",
            }}>
              {icon}
            </span>
            <span style={{
              fontSize: 10,
              fontWeight: isActive ? 800 : 500,
              letterSpacing: 0.2,
              lineHeight: 1,
            }}>
              {label}
            </span>
            {isActive && (
              <div style={{
                position: "absolute",
                bottom: "max(10px, var(--safe-bottom, 0px))",
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "#60a5fa",
                boxShadow: "0 0 6px #60a5fa",
                marginTop: 1,
              }} />
            )}
          </button>
        )
      })}
    </nav>
  )
}

function TopNav({ activeTab, onTabChange }) {
  return (
    <nav className="top-nav">
      <div className="top-nav-inner">
        {/* Branding */}
        <div style={{ fontSize: 17, fontWeight: 900, color: "white", letterSpacing: -0.3, flexShrink: 0 }}>
          ⛷️ SkiCrew
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4 }}>
          {BOTTOM_TABS.map(({ key, icon, label }) => {
            const isActive = activeTab === key
            return (
              <button
                key={key}
                onClick={() => onTabChange(key)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 10, border: "none",
                  background: isActive ? "rgba(96,165,250,0.18)" : "transparent",
                  color: isActive ? "#60a5fa" : "rgba(255,255,255,0.55)",
                  fontWeight: isActive ? 800 : 500,
                  fontSize: 13, cursor: "pointer",
                  transition: "all 0.15s",
                  position: "relative",
                }}
              >
                <span style={{ fontSize: 16 }}>{icon}</span>
                {label}
                {isActive && (
                  <div style={{
                    position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)",
                    width: 4, height: 4, borderRadius: "50%",
                    background: "#60a5fa", boxShadow: "0 0 6px #60a5fa",
                  }} />
                )}
              </button>
            )
          })}
        </div>

        {/* Spacer to balance branding on left */}
        <div style={{ width: 100, flexShrink: 0 }} />
      </div>
    </nav>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active
          ? "linear-gradient(135deg, #2563eb, #0891b2)"
          : "rgba(255,255,255,0.06)",
        color: "white",
        border: "1px solid rgba(255,255,255,0.12)",
        padding: "10px 14px",
        borderRadius: 14,
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  )
}

function menuButtonStyle() {
  return {
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.1)",
    padding: "10px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 700,
    textAlign: "left",
  }
}

export default function App() {
  const isMobile = useMobile()
  const [activeTab, setActiveTab] = useState("dashboard")
  const [passFilter, setPassFilter] = useState("All")
  const [query, setQuery] = useState("")
  const [sortBy, setSortBy] = useState("Powder Score")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [live, setLive] = useState({})
  const [skierCounts, setSkierCounts] = useState({})
  const [skierDetails, setSkierDetails] = useState({})
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [currentProfile, setCurrentProfile] = useState(null)
  const [authModalMode, setAuthModalMode] = useState(null)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)
  const [deepLinkTrip, setDeepLinkTrip] = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const userMenuRef = useRef(null)
  const planSectionRef = useRef(null)
  const crewSectionRef = useRef(null)

  async function refresh() {
    setLoading(true)
    setError("")

    try {
      const entries = await Promise.all(
        RESORTS.map(async (r) => {
          const [wxRes, nwsSnowRes, resortSnowRes, driveRes] = await Promise.allSettled([
            fetchNwsNowish(r.lat, r.lon),
            fetchNwsSnow(r.lat, r.lon),
            fetchResortSnow(r.resortKey),
            fetchDriveRisk(r.resortKey),
          ])

          const wx = wxRes.status === "fulfilled" ? wxRes.value : {}
          const nwsSnow = nwsSnowRes.status === "fulfilled" ? nwsSnowRes.value : {}
          const resortSnow = resortSnowRes.status === "fulfilled" ? resortSnowRes.value : {}
          const driveRisk =
            driveRes.status === "fulfilled"
              ? driveRes.value
              : { risk: "Unknown", penalty: 0, alertCount: 0, alerts: [] }

          const rawPowderScore = computeRawPowderScore({
            tempF: wx.tempF,
            windMph: wx.windMph,
            forecastText: wx.shortForecast,
            snowPrev24in: resortSnow.snowPrev24in,
            snowPrev48in: resortSnow.snowPrev48in,
            snow24in: nwsSnow.snow24in,
            snow48in: nwsSnow.snow48in,
            baseDepth: resortSnow.baseDepth,
            liftsOpen: resortSnow.liftsOpen,
            liftsTotal: resortSnow.liftsTotal,
            runsOpen: resortSnow.runsOpen,
            runsTotal: resortSnow.runsTotal,
            drivePenalty: driveRisk.penalty,
          })

          return [
            r.name,
            {
              ...wx,
              ...r,
              snowPrev24in: resortSnow.snowPrev24in,
              snowPrev48in: resortSnow.snowPrev48in,
              snow24in: nwsSnow.snow24in,
              snow48in: nwsSnow.snow48in,
              baseDepth: resortSnow.baseDepth,
              summitDepth: resortSnow.summitDepth,
              liftsOpen: resortSnow.liftsOpen,
              liftsTotal: resortSnow.liftsTotal,
              runsOpen: resortSnow.runsOpen,
              runsTotal: resortSnow.runsTotal,
              observedUpdated: resortSnow.updatedLabel || resortSnow.fetchedAt,
              forecastUpdated: nwsSnow.updated || wx.updated,
              rawPowderScore,
              driveRisk: driveRisk.risk,
              drivePenalty: driveRisk.penalty,
              driveAlertCount: driveRisk.alertCount,
              driveAlerts: driveRisk.alerts,
            },
          ]
        })
      )

      const merged = Object.fromEntries(entries)
      const normalizedRows = normalizePowderScores(
        RESORTS.map((r) => ({
          ...r,
          ...(merged[r.name] || {}),
        }))
      )

      setLive(Object.fromEntries(normalizedRows.map((r) => [r.name, r])))
    } catch (e) {
      setError(e?.message || "Failed to fetch live data.")
    } finally {
      setLoading(false)
    }
  }

  async function loadSkierIntel() {
    try {
      const today = new Date().toISOString().slice(0, 10)

      const [counts, details] = await Promise.all([
        getResortSkierCounts(today),
        getResortSkierDetails(today),
      ])

      setSkierCounts(counts || {})
      setSkierDetails(details || {})
    } catch (err) {
      console.warn("Skier intel refresh failed:", err)
    }
  }

  async function loadHeaderUser() {
    try {
      const user = await getCurrentUser()
      setCurrentUser(user)

      if (!user) {
        setCurrentProfile(null)
        return
      }

      const profile = await getMyProfile().catch(() => null)
      setCurrentProfile(profile || null)

      // Show onboarding for new users who haven't completed it and have no profile
      if (!profile && !localStorage.getItem("skicrew_onboarded")) {
        setShowOnboarding(true)
      }
    } catch (err) {
      console.warn("Header profile load failed:", err)
      setCurrentUser(null)
      setCurrentProfile(null)
    }
  }

  function openAuthModal(mode) {
    setAuthModalMode(mode)
    setUserMenuOpen(false)
  }

  function closeAuthModal() {
    setAuthModalMode(null)
  }

  async function handleAuthSuccess() {
    await loadHeaderUser()
    setAuthModalMode(null)
  }

  function handleOnboardingComplete() {
    setShowOnboarding(false)
    loadHeaderUser()
    setActiveTab("plans")
  }

  async function handlePasswordResetSuccess() {
    await loadHeaderUser()
    setIsRecoveryMode(false)
    setAuthModalMode(null)
  }

  async function handleLogOut() {
    try {
      await logOut()
      setUserMenuOpen(false)
      setCurrentUser(null)
      setCurrentProfile(null)
      setActiveTab("dashboard")
    } catch (err) {
      console.error("Logout failed:", err)
      alert(err.message || "Failed to log out.")
    }
  }

  function requireLogin(mode = "login") {
    openAuthModal(mode)
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 10 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    loadSkierIntel()

    const t = setInterval(loadSkierIntel, 15 * 1000)

    function handleFocus() {
      loadSkierIntel()
    }

    window.addEventListener("focus", handleFocus)

    return () => {
      clearInterval(t)
      window.removeEventListener("focus", handleFocus)
    }
  }, [])

  useEffect(() => {
  loadHeaderUser()

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event) => {
    loadHeaderUser()

    if (event === "PASSWORD_RECOVERY") {
      setIsRecoveryMode(true)
      setAuthModalMode("reset")
      setUserMenuOpen(false)
    }
  })

  return () => subscription.unsubscribe()
}, [])

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!userMenuOpen) return
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleOutsideClick)
    return () => { document.removeEventListener("mousedown", handleOutsideClick) }
  }, [userMenuOpen])

  // Deep-link: ?trip=<id> → fetch trip and open detail modal
  useEffect(() => {
    const tripId = new URLSearchParams(window.location.search).get("trip")
    if (!tripId) return
    // Remove param from URL without reloading
    window.history.replaceState({}, "", window.location.pathname)
    getTripDetail(tripId)
      .then((trip) => { setDeepLinkTrip(trip); setActiveTab("plans") })
      .catch(() => {})
  }, [])

  const headerDisplayName =
    currentProfile?.full_name ||
    currentProfile?.username ||
    currentUser?.email ||
    "Skier"

  const visibleResorts = useMemo(() => {
    return RESORTS.filter((r) => {
      const passOk = passFilter === "All" || r.pass === passFilter
      const qOk = r.name.toLowerCase().includes(query.toLowerCase())
      return passOk && qOk
    }).map((r) => ({
      ...r,
      ...(live[r.name] || {}),
    }))
  }, [live, passFilter, query])

  const rows = useMemo(() => {
    const merged = [...visibleResorts]

    if (sortBy === "Powder Score") {
      merged.sort((a, b) => (b.powderScore ?? -1) - (a.powderScore ?? -1))
    } else if (sortBy === "Name") {
      merged.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy === "Temp") {
      merged.sort((a, b) => (a.tempF ?? 999) - (b.tempF ?? 999))
    } else if (sortBy === "Snow 24h") {
      merged.sort((a, b) => (b.snowPrev24in ?? -1) - (a.snowPrev24in ?? -1))
    } else if (sortBy === "Travel Risk") {
      const rank = { Low: 0, Moderate: 1, High: 2, Severe: 3, Unknown: 4 }
      merged.sort((a, b) => (rank[a.driveRisk] ?? 99) - (rank[b.driveRisk] ?? 99))
    }

    return merged
  }, [visibleResorts, sortBy])

  const rankedResorts = useMemo(
    () =>
      [...rows]
        .filter((r) => r.powderScore != null)
        .sort((a, b) => b.powderScore - a.powderScore),
    [rows]
  )

  const rankedEpic = useMemo(
    () => rankedResorts.filter((r) => r.pass === "Epic"),
    [rankedResorts]
  )

  const rankedIkon = useMemo(
    () => rankedResorts.filter((r) => r.pass === "Ikon"),
    [rankedResorts]
  )

  const topResort = rankedResorts[0]
  const secondResort = rankedResorts[1]
  const thirdResort = rankedResorts[2]
  const topEpic = rankedEpic[0]
  const topIkon = rankedIkon[0]

  function openProfilePage() {
    setActiveTab("profile")
    setUserMenuOpen(false)
  }

  function openFriendsPage() {
    setActiveTab("friends")
    setUserMenuOpen(false)
  }

  function openCrewPlan() {
    setActiveTab("plans")
    setUserMenuOpen(false)

    setTimeout(() => {
      planSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    }, 50)
  }

  function openTodaysCrew() {
    setActiveTab("plans")
    setUserMenuOpen(false)

    setTimeout(() => {
      crewSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    }, 50)
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(37,99,235,0.18), transparent 35%), linear-gradient(180deg, #08111f 0%, #020617 100%)",
        color: "white",
      }}
    >
      <style>{`
        body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif; }
        .leader-crown { animation: floaty 2.8s ease-in-out infinite; }
        @keyframes floaty {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-4px) scale(1.03); }
        }
        .bottom-nav button { position: relative; }
      `}</style>

{isRecoveryMode ? (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(2,6,23,0.88)",
      display: "grid",
      placeItems: "center",
      padding: 20,
      zIndex: 210,
    }}
  >
    <div
      style={{
        width: "100%",
        maxWidth: 620,
        display: "grid",
        gap: 16,
        justifyItems: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20,
          padding: 18,
          color: "white",
          boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: "1.05rem", marginBottom: 8 }}>
          Finish resetting your password
        </div>
        <div style={{ color: "rgba(255,255,255,0.74)", lineHeight: 1.5, fontSize: 14 }}>
          You’re temporarily signed in through a recovery link. Set your new password below to unlock the app.
        </div>
      </div>

      <AuthForm
        mode="reset"
        onPasswordResetSuccess={handlePasswordResetSuccess}
      />
    </div>
  </div>
) : authModalMode ? (
  <div
    onClick={closeAuthModal}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(2,6,23,0.72)",
      display: "grid",
      placeItems: "center",
      padding: 20,
      zIndex: 200,
    }}
  >
    <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560 }}>
      <AuthForm
        mode={authModalMode}
        onSuccess={handleAuthSuccess}
        onPasswordResetSuccess={handlePasswordResetSuccess}
        onCancel={closeAuthModal}
      />
    </div>
  </div>
) : null}

      {/* Onboarding flow for new users */}
      {showOnboarding && (
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      )}

      {/* Deep-link trip modal (opened via ?trip= URL param or notification click) */}
      {deepLinkTrip && (
        <TripDetailModal
          trip={deepLinkTrip}
          currentUser={currentUser}
          onClose={() => setDeepLinkTrip(null)}
          onUpdate={() => {}}
        />
      )}

      <TopNav activeTab={activeTab} onTabChange={(tab) => { setActiveTab(tab); setUserMenuOpen(false) }} />
      <BottomNav activeTab={activeTab} onTabChange={(tab) => { setActiveTab(tab); setUserMenuOpen(false) }} />

      <div className="mobile-scroll-pad" style={{ maxWidth: 1320, margin: "0 auto", padding: isMobile ? "16px 14px 20px" : "30px 20px 48px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: activeTab === "dashboard" ? 20 : 16 }}>
          {/* Left: branding — full title on dashboard, compact elsewhere */}
          <div>
            {activeTab === "dashboard" ? (
              <div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", padding: "5px 10px", borderRadius: 999, fontSize: 11, color: "rgba(255,255,255,0.65)", marginBottom: 8 }}>
                  ❄️ Morning Decision Engine
                </div>
                <h1 style={{ margin: 0, fontSize: isMobile ? 24 : 30, fontWeight: 900, letterSpacing: -0.5 }}>
                  {isMobile ? "Pow Dashboard" : "Colorado Powder Dashboard"}
                </h1>
              </div>
            ) : (
              <div style={{ fontSize: 18, fontWeight: 900, color: "white", letterSpacing: -0.3 }}>⛷️ SkiCrew</div>
            )}
          </div>

          {/* Right: actions */}
          <div ref={userMenuRef} style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
            <NotificationBell
              currentUser={currentUser}
              onOpenTrip={async (tripId) => {
                try {
                  const trip = await getTripDetail(tripId)
                  setDeepLinkTrip(trip)
                } catch (e) { console.warn("Could not open trip from notification:", e) }
              }}
            />

            {activeTab === "dashboard" && (
              <button
                onClick={refresh}
                disabled={loading}
                style={{
                  background: loading ? "rgba(255,255,255,0.12)" : "linear-gradient(135deg, #2563eb, #0891b2)",
                  color: "white", border: "none", padding: isMobile ? "10px 12px" : "10px 16px",
                  borderRadius: 12, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer",
                  fontSize: 13, boxShadow: "0 6px 20px rgba(37,99,235,0.28)",
                }}
              >
                {loading ? "…" : isMobile ? "⟳" : "Refresh"}
              </button>
            )}

            <button
              onClick={() => setUserMenuOpen((prev) => !prev)}
              style={{ width: 40, height: 40, borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.07)", color: "white", cursor: "pointer", display: "grid", placeItems: "center", padding: 0, overflow: "hidden", flexShrink: 0 }}
            >
              {currentProfile?.avatar_url ? (
                <img src={currentProfile.avatar_url} alt={headerDisplayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 11, fontWeight: 900 }}>{initialsFromText(headerDisplayName)}</span>
              )}
            </button>

            {userMenuOpen && (
              <div style={{ position: "absolute", top: 50, right: 0, width: 240, background: "rgba(15,23,42,0.98)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 10, display: "grid", gap: 6, boxShadow: "0 18px 50px rgba(0,0,0,0.45)", zIndex: 50 }}>
                <div style={{ padding: "8px 10px 10px", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 2 }}>
                  <div style={{ fontWeight: 900, fontSize: 14 }}>{headerDisplayName}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{currentUser?.email || "Not signed in"}</div>
                </div>
                {currentUser ? (
                  <>
                    <button onClick={openCrewPlan} style={menuButtonStyle()}>Update Today’s Plan</button>
                    <button onClick={openFriendsPage} style={menuButtonStyle()}>Friends</button>
                    <button onClick={handleLogOut} style={{ ...menuButtonStyle(), background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.22)", color: "#fecaca" }}>Log Out</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => openAuthModal("login")} style={menuButtonStyle()}>Log In</button>
                    <button onClick={() => openAuthModal("signup")} style={menuButtonStyle()}>Sign Up</button>
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Dashboard description — only shown on dashboard tab */}
        {activeTab === "dashboard" && (
          <p style={{ margin: "0 0 20px", color: "rgba(255,255,255,0.55)", fontSize: 14, maxWidth: 680, lineHeight: 1.6 }}>
            Resort snow, NWS forecasts, terrain metrics, and live COtrip travel conditions — blended into one morning ski decision engine.
          </p>
        )}

        {error && (
          <div style={{ background: "rgba(255,0,0,0.12)", border: "1px solid rgba(255,0,0,0.25)", padding: 12, borderRadius: 14, color: "#ffd1d1", marginBottom: 16 }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {activeTab === "dashboard" && (
          <>
            {topResort && (
              <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
                <div
                  className="leader-crown"
                  style={{
                    background: scoreGradient(topResort.powderScore),
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: 24,
                    padding: 22,
                    display: "grid",
                    gap: 10,
                    boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 28 }}>👑</div>
                    <div style={{ fontSize: 24, fontWeight: 900 }}>
                      Best Powder Right Now: {topResort.name} — {topResort.powderScore}
                    </div>
                    <div
                      style={{
                        borderRadius: 999,
                        padding: "6px 10px",
                        background: "rgba(255,255,255,0.14)",
                        border: "1px solid rgba(255,255,255,0.16)",
                        color: tierColor(topResort.powderTier),
                        fontSize: 12,
                        fontWeight: 900,
                        textTransform: "uppercase",
                      }}
                    >
                      {topResort.powderTier}
                    </div>
                  </div>

                  <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 14 }}>
                    {topResort.snowPrev24in != null
                      ? `${topResort.snowPrev24in}" in the last 24h`
                      : "—"}{" "}
                    ·{" "}
                    {topResort.snow24in != null
                      ? `${topResort.snow24in}" forecast next 24h`
                      : "—"}{" "}
                    · {topResort.tempF != null ? `${topResort.tempF}°F` : "—"} ·{" "}
                    {topResort.wind || "—"} ·{" "}
                    <span style={{ color: riskColor(topResort.driveRisk), fontWeight: 900 }}>
                      Drive {topResort.driveRisk}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                      fontSize: 13,
                      color: "rgba(255,255,255,0.8)",
                    }}
                  >
                    {secondResort && <div>🥈 {secondResort.name} ({secondResort.powderScore})</div>}
                    {thirdResort && <div>🥉 {thirdResort.name} ({thirdResort.powderScore})</div>}
                  </div>
                </div>

                <div className="leader-grid">
                  <LeaderCard title="Best Epic Resort" icon="🎿" resort={topEpic} />
                  <LeaderCard title="Best Ikon Resort" icon="🏔️" resort={topIkon} />
                </div>
              </div>
            )}

            <section
              className="filter-bar"
              style={{
                marginTop: 4,
                marginBottom: 20,
              }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                {["All", "Epic", "Ikon"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPassFilter(p)}
                    style={{
                      background:
                        passFilter === p
                          ? "linear-gradient(135deg, #22c55e, #14b8a6)"
                          : "rgba(255,255,255,0.06)",
                      color: passFilter === p ? "#062018" : "white",
                      border: "1px solid rgba(255,255,255,0.1)",
                      padding: "10px 14px",
                      borderRadius: 999,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search resort…"
                style={{
                  flex: 1,
                  minWidth: 220,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "white",
                  padding: "12px 14px",
                  borderRadius: 14,
                  outline: "none",
                }}
              />

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "white",
                  padding: "12px 14px",
                  borderRadius: 14,
                  outline: "none",
                }}
              >
                <option>Powder Score</option>
                <option>Name</option>
                <option>Temp</option>
                <option>Snow 24h</option>
                <option>Travel Risk</option>
              </select>
            </section>

            <main className="resort-grid">
              {rows.map((r) => (
                <ResortCard key={r.name} r={r} skierCounts={skierCounts} skierDetails={skierDetails} />
              ))}
            </main>
          </>
        )}

        {activeTab === "map" && (
          <div style={{ marginTop: 8 }}>
            <PowderMap
              resorts={rows}
              skierCounts={skierCounts}
              skierDetails={skierDetails}
            />
          </div>
        )}

        {activeTab === "friends" && (
          <div style={{ marginTop: 8 }}>
            <FriendsPage />
          </div>
        )}

        {activeTab === "profile" && (
          <div style={{ marginTop: 8 }}>
            {currentUser ? (
              <ProfilePage />
            ) : (
              <div
                style={{
                  display: "grid",
                  placeItems: "center",
                  minHeight: 320,
                }}
              >
                <AuthForm
                  mode="login"
                  onSuccess={handleAuthSuccess}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === "plans" && (
          <SkiPlansPage onRequireLogin={requireLogin} resorts={RESORTS} />
        )}
      </div>
    </div>
  )
}