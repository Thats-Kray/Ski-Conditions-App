import { useEffect, useMemo, useRef, useState } from "react"
import { useMobile } from "./lib/useMobile"
import AuthForm from "./components/AuthForm"
import OnboardingFlow from "./components/OnboardingFlow"
import PowderMap from "./components/PowderMap"
import MessagingCenter from "./components/MessagingCenter"
import ProfilePage from "./components/ProfilePage"
import SkiPlansPage from "./components/SkiPlansPage"
import TripDetailModal from "./components/TripDetailModal"
import NotificationBell from "./components/NotificationBell"
import LandingPage from "./components/LandingPage"
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
  // ── Fresh snow (0–40 pts) ────────────────────────────────────────
  const freshSnow =
    clamp((snowPrev24in ?? 0) * 5, 0, 32) +   // last 24 h is king
    clamp((snowPrev48in ?? 0) * 1.5, 0, 8)     // 2-day accumulation bonus

  // ── Incoming snow (0–20 pts) ─────────────────────────────────────
  const incomingSnow =
    clamp((snow24in ?? 0) * 3.5, 0, 15) +      // next 24 h forecast
    clamp((snow48in ?? 0) * 1.0, 0, 5)          // 48 h forecast

  // ── Temperature (0–20 pts) — absolute bands ──────────────────────
  // 20-30°F = sweet spot | 30-40°F = warm bluebird | 40°F+ = slushy
  // 10-20°F = chilly | 0-10°F = frigid | sub-zero = freezing
  const t = tempF ?? 25
  const tempScore =
    t >= 20 && t <= 30 ? 20 :   // sweet spot: perfect powder temp
    t > 30 && t <= 35  ? 17 :   // warm, still great
    t > 35 && t <= 40  ? 11 :   // warm bluebird, snow softening
    t > 40 && t <= 48  ?  4 :   // slushy spring conditions
    t > 48             ?  0 :   // full spring slush
    t >= 12 && t < 20  ? 15 :   // chilly, dry powder
    t >=  0 && t < 12  ?  8 :   // frigid, icy
                          2     // sub-zero, brutal cold

  // ── Terrain (0–15 pts) ───────────────────────────────────────────
  const runsPct  = safePercent(runsOpen,  runsTotal)
  const liftsPct = safePercent(liftsOpen, liftsTotal)
  const terrainScore = clamp(
    (runsPct  != null ? runsPct  * 10 : 5) +   // runs open %
    (liftsPct != null ? liftsPct *  5 : 2.5),  // lifts open %
    0, 15
  )

  // ── Base depth (0–5 pts) ─────────────────────────────────────────
  const baseScore = clamp((baseDepth ?? 0) / 14, 0, 5)  // 70" base = 5 pts

  // ── Snow-in-forecast text hint (+2 pts) ─────────────────────────
  const snowHint = /snow|powder|flurr|wintry/i.test(forecastText || "") ? 2 : 0

  // ── Wind penalty (up to –15 pts) ────────────────────────────────
  const windPenalty = clamp((windMph ?? 0) * 0.75, 0, 15)

  // ── Drive penalty (up to –10 pts) ───────────────────────────────
  const driveAdj = clamp(drivePenalty ?? 0, 0, 10)

  const raw =
    freshSnow + incomingSnow + tempScore + terrainScore +
    baseScore + snowHint - windPenalty - driveAdj

  return Math.round(clamp(raw, 0, 100) * 10) / 10
}

// Assigns absolute tier labels — no relative normalization.
// Closed resorts show no score so they can't mislead users.
function normalizePowderScores(rows) {
  return rows.map((r) => {
    if (r.isOpen === false) {
      return { ...r, powderScore: null, powderTier: "Closed" }
    }
    if (typeof r.rawPowderScore !== "number") {
      return { ...r, powderScore: null, powderTier: "Unknown" }
    }
    const powderScore = Math.round(r.rawPowderScore)
    let powderTier = "Poor"
    if      (powderScore >= 80) powderTier = "Elite"
    else if (powderScore >= 65) powderTier = "Very Good"
    else if (powderScore >= 50) powderTier = "Good"
    else if (powderScore >= 35) powderTier = "Okay"
    return { ...r, powderScore, powderTier }
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
  if (tier === "Elite")     return "#8ef6d1"
  if (tier === "Very Good") return "#9bc6ff"
  if (tier === "Good")      return "#ffe39a"
  if (tier === "Okay")      return "#ffc996"
  if (tier === "Closed")    return "#64748b"
  return "#ff9d9d" // Poor
}

function riskColor(risk) {
  if (risk === "Low") return "#8ef6d1"
  if (risk === "Moderate") return "#ffe39a"
  if (risk === "High") return "#ffc996"
  return "#ff9d9d"
}

function scoreGradient(score) {
  if (score == null) return "linear-gradient(135deg, #334155, #1e293b)"
  if (score >= 80) return "linear-gradient(135deg, #0f766e, #2563eb)"   // Elite
  if (score >= 65) return "linear-gradient(135deg, #1d4ed8, #4338ca)"   // Very Good
  if (score >= 50) return "linear-gradient(135deg, #475569, #334155)"   // Good
  if (score >= 35) return "linear-gradient(135deg, #7c2d12, #92400e)"   // Okay
  return "linear-gradient(135deg, #7f1d1d, #451a03)"                    // Poor
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

function AuthGate({ icon, title, desc, onSignIn, onSignUp }) {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: 360, padding: "40px 20px" }}>
      <div style={{ textAlign: "center", maxWidth: 320, display: "grid", gap: 16, justifyItems: "center" }}>
        <div style={{ fontSize: 48 }}>{icon}</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "white", letterSpacing: -0.4 }}>{title}</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.48)", lineHeight: 1.6 }}>{desc}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button onClick={onSignUp} style={{ background: "linear-gradient(135deg,#2563eb,#0891b2)", color: "white", border: "none", borderRadius: 12, padding: "12px 22px", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>
            Create Free Account
          </button>
          <button onClick={onSignIn} style={{ background: "rgba(255,255,255,0.07)", color: "white", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "12px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Sign In
          </button>
        </div>
      </div>
    </div>
  )
}

const BOTTOM_TABS = [
  { key: "dashboard", icon: "🏔️", label: "Conditions" },
  { key: "plans",     icon: "🎿",  label: "Plans" },
  { key: "friends",   icon: "💬",  label: "Messages" },
  { key: "profile",   icon: "👤",  label: "Profile" },
]

function ProfileAvatar({ profile, size, isActive }) {
  const name = profile?.full_name || profile?.username || "U"
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
  const border = `2px solid ${isActive ? "#60a5fa" : "rgba(255,255,255,0.22)"}`
  const shadow = isActive ? "0 0 8px rgba(96,165,250,0.55)" : "none"
  return profile?.avatar_url ? (
    <img src={profile.avatar_url} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border, boxShadow: shadow, flexShrink: 0 }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg,rgba(37,99,235,0.7),rgba(8,145,178,0.7))", border, boxShadow: shadow, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: size * 0.38, color: "white" }}>
      {initials}
    </div>
  )
}

function BottomNav({ activeTab, onTabChange, currentProfile, currentUser, onNotifTabChange, onNotifOpenTrip }) {
  return (
    <nav className="bottom-nav">
      {BOTTOM_TABS.map(({ key, icon, label }) => {
        const isActive = activeTab === key
        const isProfile = key === "profile"
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
              position: "relative",
            }}
          >
            {isProfile && currentProfile ? (
              <ProfileAvatar profile={currentProfile} size={26} isActive={isActive} />
            ) : (
              <span style={{
                fontSize: 22,
                lineHeight: 1,
                filter: isActive ? "drop-shadow(0 0 6px rgba(96,165,250,0.6))" : "none",
                transition: "filter 0.15s ease",
              }}>
                {icon}
              </span>
            )}
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
      {/* Notification bell as a nav tab */}
      <NotificationBell
        currentUser={currentUser}
        onTabChange={onNotifTabChange}
        onOpenTrip={onNotifOpenTrip}
        variant="tab"
        dropUp
      />
    </nav>
  )
}

function TopNav({ activeTab, onTabChange, currentProfile, currentUser, onNotifTabChange, onNotifOpenTrip }) {
  return (
    <nav className="top-nav">
      <div className="top-nav-inner">
        {/* Branding */}
        <div style={{ fontSize: 17, fontWeight: 900, color: "white", letterSpacing: -0.3, flexShrink: 0 }}>
          ❄️ PowderDays
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4 }}>
          {BOTTOM_TABS.map(({ key, icon, label }) => {
            const isActive = activeTab === key
            const isProfile = key === "profile"
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
                {isProfile && currentProfile ? (
                  <ProfileAvatar profile={currentProfile} size={20} isActive={isActive} />
                ) : (
                  <span style={{ fontSize: 16 }}>{icon}</span>
                )}
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

        {/* Right side: notification bell */}
        <div style={{ flexShrink: 0 }}>
          <NotificationBell
            currentUser={currentUser}
            onTabChange={onNotifTabChange}
            onOpenTrip={onNotifOpenTrip}
          />
        </div>
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


export default function App() {
  const isMobile = useMobile()
  const [activeTab, setActiveTab] = useState("dashboard")
  const [conditionsSubTab, setConditionsSubTab] = useState("conditions")
  const [passFilter, setPassFilter] = useState("All")
  const [query, setQuery] = useState("")
  const [sortBy, setSortBy] = useState("Powder Score")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [live, setLive] = useState({})
  const [skierCounts, setSkierCounts] = useState({})
  const [skierDetails, setSkierDetails] = useState({})
  const [currentUser, setCurrentUser] = useState(null)
  const [currentProfile, setCurrentProfile] = useState(null)
  const [authModalMode, setAuthModalMode] = useState(null)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)
  const [deepLinkTrip, setDeepLinkTrip] = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [pendingInviteId, setPendingInviteId] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [browseModeOverride, setBrowseModeOverride] = useState(false)

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
      if (!profile && !localStorage.getItem("skicrew_onboarded") && !localStorage.getItem("powderdays_onboarded")) {
        setShowOnboarding(true)
      }
    } catch (err) {
      console.warn("Header profile load failed:", err)
      setCurrentUser(null)
      setCurrentProfile(null)
    } finally {
      setAuthReady(true)
    }
  }

  function openAuthModal(mode) {
    setAuthModalMode(mode)

  }

  function closeAuthModal() {
    setAuthModalMode(null)
  }

  async function handleAuthSuccess() {
    setBrowseModeOverride(false)
    await loadHeaderUser()
    setAuthModalMode(null)

    // If user arrived via an invite link, open that trip automatically
    const storedId = sessionStorage.getItem("pending_invite_trip")
    if (storedId) {
      sessionStorage.removeItem("pending_invite_trip")
      setPendingInviteId(null)
      try {
        const trip = await getTripDetail(storedId)
        setDeepLinkTrip(trip)
        setActiveTab("plans")
      } catch {
        // trip may not exist or user isn't invited — silently ignore
      }
    }
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
  
    }
  })

  return () => subscription.unsubscribe()
}, [])

  // Deep-link: ?trip=<id> → capture invite ID; resolve after auth check completes
  useEffect(() => {
    const tripId =
      new URLSearchParams(window.location.search).get("trip") ||
      sessionStorage.getItem("pending_invite_trip")
    if (!tripId) return
    window.history.replaceState({}, "", window.location.pathname)
    setPendingInviteId(tripId)
    sessionStorage.setItem("pending_invite_trip", tripId)
  }, [])

  // Once we know the auth state, handle the pending invite
  useEffect(() => {
    if (!authReady || !pendingInviteId) return
    if (!currentUser) return // invite overlay will prompt login
    // Logged in — fetch and open the trip
    getTripDetail(pendingInviteId)
      .then((trip) => {
        setDeepLinkTrip(trip)
        setActiveTab("plans")
        setPendingInviteId(null)
        sessionStorage.removeItem("pending_invite_trip")
      })
      .catch(() => {
        setPendingInviteId(null)
        sessionStorage.removeItem("pending_invite_trip")
      })
  }, [authReady, currentUser, pendingInviteId])

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
        .filter((r) => r.powderScore != null && r.isOpen !== false)
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

  function openFriendsPage() {
    setActiveTab("friends")

  }

  function openCrewPlan() {
    setActiveTab("plans")


    setTimeout(() => {
      planSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    }, 50)
  }

  function openTodaysCrew() {
    setActiveTab("plans")


    setTimeout(() => {
      crewSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    }, 50)
  }

  // Show landing page for unauthenticated users (unless they chose to browse)
  const showLandingPage = authReady && !currentUser && !browseModeOverride && !isRecoveryMode

  if (showLandingPage) {
    return (
      <>
        <style>{`body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif; margin: 0; }`}</style>
        {/* Auth modals render on top of landing page */}
        {authModalMode && (
          <div
            onClick={closeAuthModal}
            style={{
              position: "fixed", inset: 0, background: "rgba(2,6,23,0.72)",
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "flex-start", overflowY: "auto",
              padding: "20px 16px max(20px, env(safe-area-inset-bottom)) 16px",
              zIndex: 200,
            }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560 }}>
              <AuthForm
                mode={authModalMode}
                onSuccess={() => { handleAuthSuccess(); setBrowseModeOverride(false) }}
                onPasswordResetSuccess={handlePasswordResetSuccess}
                onCancel={closeAuthModal}
              />
            </div>
          </div>
        )}
        <LandingPage
          onSignIn={() => openAuthModal("login")}
          onSignUp={() => openAuthModal("signup")}
          onBrowse={() => setBrowseModeOverride(true)}
        />
      </>
    )
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
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      overflowY: "auto",
      padding: "20px 16px max(20px, env(safe-area-inset-bottom)) 16px",
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
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      overflowY: "auto",
      padding: "20px 16px max(20px, env(safe-area-inset-bottom)) 16px",
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

      {/* Invite landing — shown when an unauthenticated user opens a ?trip= link */}
      {pendingInviteId && !currentUser && authReady && !authModalMode && !isRecoveryMode && (
        <div style={{
          position: "fixed",
          inset: 0,
          zIndex: 190,
          background: "linear-gradient(170deg,rgba(2,6,23,0.98) 0%,rgba(8,17,30,1) 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 20px max(24px,env(safe-area-inset-bottom)) 20px",
        }}>
          <div style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
            <div style={{ fontSize: 64, marginBottom: 18 }}>🎿</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "white", lineHeight: 1.15, marginBottom: 12 }}>
              You're invited to a ski trip!
            </div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,0.58)", marginBottom: 36, lineHeight: 1.6 }}>
              Sign in or create a free account to view the details, RSVP, and join the crew.
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <button
                onClick={() => openAuthModal("login")}
                style={{ padding: "14px 20px", borderRadius: 14, background: "linear-gradient(135deg,#2563eb,#0891b2)", border: "none", color: "white", fontWeight: 800, fontSize: 16, cursor: "pointer", boxShadow: "0 4px 20px rgba(37,99,235,0.4)" }}
              >
                Sign In
              </button>
              <button
                onClick={() => openAuthModal("signup")}
                style={{ padding: "14px 20px", borderRadius: 14, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "white", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
              >
                Create Free Account
              </button>
              <button
                onClick={() => { setPendingInviteId(null); sessionStorage.removeItem("pending_invite_trip") }}
                style={{ marginTop: 6, background: "none", border: "none", color: "rgba(255,255,255,0.32)", fontSize: 13, cursor: "pointer", fontWeight: 600 }}
              >
                Browse without an account
              </button>
            </div>

            <div style={{ marginTop: 40, fontSize: 12, color: "rgba(255,255,255,0.2)", fontWeight: 600, letterSpacing: 0.4 }}>
              ❄️ PowderDays — Plan your ski season with your crew
            </div>
          </div>
        </div>
      )}

      <TopNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        currentProfile={currentProfile}
        currentUser={currentUser}
        onNotifTabChange={setActiveTab}
        onNotifOpenTrip={async (tripId) => { try { setDeepLinkTrip(await getTripDetail(tripId)) } catch (e) { console.warn(e) } }}
      />
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        currentProfile={currentProfile}
        currentUser={currentUser}
        onNotifTabChange={setActiveTab}
        onNotifOpenTrip={async (tripId) => { try { setDeepLinkTrip(await getTripDetail(tripId)) } catch (e) { console.warn(e) } }}
      />

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
              <div style={{ fontSize: 18, fontWeight: 900, color: "white", letterSpacing: -0.3 }}>❄️ PowderDays</div>
            )}
          </div>

          {/* Right: actions */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {activeTab === "dashboard" && conditionsSubTab === "conditions" && (
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
          </div>
        </header>

        {/* Dashboard description — only shown on conditions sub-tab */}
        {activeTab === "dashboard" && conditionsSubTab === "conditions" && (
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
            {/* Sub-tab switcher */}
            <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
              {[
                { key: "conditions", label: "🏔️ Conditions" },
                { key: "map",        label: "🗺️ Map" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setConditionsSubTab(key)}
                  style={{
                    background: conditionsSubTab === key
                      ? "linear-gradient(135deg, #2563eb, #0891b2)"
                      : "rgba(255,255,255,0.06)",
                    color: "white",
                    border: "1px solid rgba(255,255,255,0.12)",
                    padding: "9px 16px",
                    borderRadius: 12,
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    boxShadow: conditionsSubTab === key ? "0 4px 14px rgba(37,99,235,0.3)" : "none",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {conditionsSubTab === "map" && (
              <PowderMap
                resorts={rows}
                skierCounts={skierCounts}
                skierDetails={skierDetails}
              />
            )}

            {conditionsSubTab === "conditions" && topResort && (
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

            {conditionsSubTab === "conditions" && (
              <>
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
          </>
        )}

        {activeTab === "friends" && (
          <div style={{ marginTop: 8 }}>
            {currentUser ? (
              <MessagingCenter />
            ) : (
              <AuthGate onSignIn={() => openAuthModal("login")} onSignUp={() => openAuthModal("signup")}
                icon="💬" title="Your Crew is waiting" desc="Sign in to chat with your crew, add friends, and coordinate the season." />
            )}
          </div>
        )}

        {activeTab === "profile" && (
          <div style={{ marginTop: 8 }}>
            {currentUser ? (
              <ProfilePage onLogOut={handleLogOut} onTabChange={setActiveTab} />
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
          currentUser ? (
            <SkiPlansPage onRequireLogin={requireLogin} resorts={RESORTS} />
          ) : (
            <AuthGate onSignIn={() => openAuthModal("login")} onSignUp={() => openAuthModal("signup")}
              icon="🎿" title="Plan trips with your crew" desc="Sign in to create trips, invite friends, share rides, and track your whole season." />
          )
        )}
      </div>
    </div>
  )
}