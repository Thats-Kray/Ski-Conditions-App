import { useEffect, useMemo, useState } from "react"
import AuthPanel from "./components/AuthPanel"
import SkiCheckInForm from "./components/SkiCheckInForm"
import TodaysCrew from "./components/TodaysCrew"
import PowderMap from "./components/PowderMap"
import { getResortSkierCounts, getResortSkierDetails } from "./lib/socialApi"
import ProfileSetup from "./components/ProfileSetup"


const RESORTS = [
  // Epic
  {
    name: "Vail",
    pass: "Epic",
    lat: 39.6403,
    lon: -106.3742,
    resortKey: "vail",
    logoPath: "/logos/vail.png",
    photoPath: "/resorts/vail.jpg",
    directionsQuery: "Vail Parking Structure, Vail CO",
  },
  {
    name: "Beaver Creek",
    pass: "Epic",
    lat: 39.6042,
    lon: -106.5165,
    resortKey: "beavercreek",
    logoPath: "/logos/beaver-creek.png",
    photoPath: "/resorts/beaver-creek.jpg",
    directionsQuery: "Beaver Creek Elk Lot, Avon CO",
  },
  {
    name: "Breckenridge",
    pass: "Epic",
    lat: 39.4817,
    lon: -106.0384,
    resortKey: "breckenridge",
    logoPath: "/logos/breckenridge.png",
    photoPath: "/resorts/breckenridge.jpg",
    directionsQuery: "Breckenridge Gondola Lot, Breckenridge CO",
  },
  {
    name: "Keystone",
    pass: "Epic",
    lat: 39.6084,
    lon: -105.9437,
    resortKey: "keystone",
    logoPath: "/logos/keystone.png",
    photoPath: "/resorts/keystone.jpg",
    directionsQuery: "River Run Parking Lot, Keystone CO",
  },
  {
    name: "Crested Butte",
    pass: "Epic",
    lat: 38.8996,
    lon: -106.9653,
    resortKey: "crestedbutte",
    logoPath: "/logos/crested-butte.png",
    photoPath: "/resorts/crested-butte.jpg",
    directionsQuery: "Crested Butte Mountain Resort Parking, Mt Crested Butte CO",
  },
  {
    name: "Telluride",
    pass: "Epic",
    lat: 37.9363,
    lon: -107.8466,
    resortKey: "telluride",
    logoPath: "/logos/telluride.png",
    photoPath: "/resorts/telluride.jpg",
    directionsQuery: "Telluride Mountain Village Parking Garage, Mountain Village CO",
  },

  // Ikon
  {
    name: "Winter Park",
    pass: "Ikon",
    lat: 39.8863,
    lon: -105.7626,
    resortKey: "winterpark",
    logoPath: "/logos/winter-park.png",
    photoPath: "/resorts/winter-park.jpg",
    directionsQuery: "Winter Park Resort Parking Garage, Winter Park CO",
  },
  {
    name: "Copper Mountain",
    pass: "Ikon",
    lat: 39.5022,
    lon: -106.1512,
    resortKey: "coppermountain",
    logoPath: "/logos/copper-mountain.png",
    photoPath: "/resorts/copper-mountain.jpg",
    directionsQuery: "Copper Mountain Alpine Lot, Frisco CO",
  },
  {
    name: "Arapahoe Basin",
    pass: "Ikon",
    lat: 39.6423,
    lon: -105.8717,
    resortKey: "arapahoebasin",
    logoPath: "/logos/arapahoe-basin.png",
    photoPath: "/resorts/arapahoe-basin.jpg",
    directionsQuery: "Arapahoe Basin Ski Area Parking Lot, Dillon CO",
  },
  {
    name: "Steamboat",
    pass: "Ikon",
    lat: 40.4572,
    lon: -106.8047,
    resortKey: "steamboat",
    logoPath: "/logos/steamboat.png",
    photoPath: "/resorts/steamboat.jpg",
    directionsQuery: "Steamboat Gondola Square Parking, Steamboat Springs CO",
  },
  {
    name: "Eldora",
    pass: "Ikon",
    lat: 39.9372,
    lon: -105.5842,
    resortKey: "eldora",
    logoPath: "/logos/eldora.png",
    photoPath: "/resorts/eldora.jpg",
    directionsQuery: "Eldora Mountain Resort Parking, Nederland CO",
  },
  {
    name: "Aspen Snowmass",
    pass: "Ikon",
    lat: 39.2097,
    lon: -106.9499,
    resortKey: "aspensnowmass",
    logoPath: "/logos/aspen-snowmass.png",
    photoPath: "/resorts/aspen-snowmass.jpg",
    directionsQuery: "Snowmass Base Village Parking, Snowmass Village CO",
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

async function fetchJson(url, errorMessage) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(errorMessage)
  const data = await r.json()
  if (data?.error) throw new Error(data.error)
  return data
}

async function fetchNwsNowish(lat, lon) {
  const point = await fetchJson(
    `http://localhost:8787/api/nws/point?lat=${lat}&lon=${lon}`,
    `Point lookup failed for ${lat}, ${lon}`
  )

  const hourlyUrl = point?.properties?.forecastHourly
  const forecastUrl = point?.properties?.forecast

  if (!hourlyUrl || !forecastUrl) {
    throw new Error("Missing NWS forecast URLs for this point.")
  }

  const [hourly, daily] = await Promise.all([
    fetchJson(
      `http://localhost:8787/api/nws/forecast?url=${encodeURIComponent(hourlyUrl)}`,
      "Hourly forecast fetch failed."
    ),
    fetchJson(
      `http://localhost:8787/api/nws/forecast?url=${encodeURIComponent(forecastUrl)}`,
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
    `http://localhost:8787/api/nws/snow?lat=${lat}&lon=${lon}`,
    `Snow forecast fetch failed for ${lat}, ${lon}`
  )
}

async function fetchResortSnow(resortKey) {
  return fetchJson(
    `http://localhost:8787/api/resort-snow?resort=${encodeURIComponent(resortKey)}`,
    `Resort snow fetch failed for ${resortKey}`
  )
}

async function fetchDriveRisk(resortKey) {
  return fetchJson(
    `http://localhost:8787/api/drive-risk?resort=${encodeURIComponent(resortKey)}`,
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
        overflow: "hidden",
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.14)",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
      }}
    >
      <img
        src={resort.logoPath}
        alt={`${resort.name} logo`}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
        onError={(e) => {
          e.currentTarget.style.display = "none"
          const fallback = e.currentTarget.nextSibling
          if (fallback) fallback.style.display = "grid"
        }}
      />
      <div
        style={{
          display: "none",
          width: "100%",
          height: "100%",
          placeItems: "center",
          fontSize: 12,
          fontWeight: 900,
          color: "white",
          background: "linear-gradient(135deg, #1e293b, #334155)",
        }}
      >
        {initials}
      </div>
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
  const [activeTab, setActiveTab] = useState("dashboard")
  const [passFilter, setPassFilter] = useState("All")
  const [query, setQuery] = useState("")
  const [sortBy, setSortBy] = useState("Powder Score")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [live, setLive] = useState({})
  const [skierCounts, setSkierCounts] = useState({})
  const [skierDetails, setSkierDetails] = useState({})

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
    () => [...rows].filter((r) => r.powderScore != null).sort((a, b) => b.powderScore - a.powderScore),
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
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .leader-crown {
          animation: floaty 2.8s ease-in-out infinite;
        }
        @keyframes floaty {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-4px) scale(1.03); }
        }
        .resort-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 24px 60px rgba(0,0,0,0.38);
        }
      `}</style>

      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "30px 20px 48px" }}>
        <header
          style={{
            display: "grid",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 18,
              alignItems: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.74)",
                  marginBottom: 12,
                }}
              >
                ❄️ Morning Decision Engine
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 40,
                  lineHeight: 1.05,
                  letterSpacing: -1.1,
                }}
              >
                Colorado Powder Dashboard
              </h1>
              <p
                style={{
                  margin: "10px 0 0",
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 15,
                  maxWidth: 760,
                }}
              >
                Resort-reported snow, NWS forecast, terrain-open metrics, and live COtrip travel friction — blended into one actually-useful morning ski dashboard.
              </p>
            </div>

            <button
              onClick={refresh}
              disabled={loading}
              style={{
                background: loading
                  ? "rgba(255,255,255,0.12)"
                  : "linear-gradient(135deg, #2563eb, #0891b2)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.12)",
                padding: "12px 16px",
                borderRadius: 14,
                fontWeight: 800,
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: "0 12px 30px rgba(37,99,235,0.28)",
              }}
            >
              {loading ? "Refreshing…" : "Refresh Live Data"}
            </button>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <TabButton
              active={activeTab === "dashboard"}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </TabButton>
            <TabButton
              active={activeTab === "map"}
              onClick={() => setActiveTab("map")}
            >
              Map
            </TabButton>
            <TabButton
              active={activeTab === "crew"}
              onClick={() => setActiveTab("crew")}
            >
              Crew
            </TabButton>
          </div>

          {error && (
            <div
              style={{
                background: "rgba(255,0,0,0.12)",
                border: "1px solid rgba(255,0,0,0.25)",
                padding: 12,
                borderRadius: 14,
                color: "#ffd1d1",
              }}
            >
              <strong>Error:</strong> {error}
            </div>
          )}
        </header>

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

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: 14,
                  }}
                >
                  <LeaderCard title="Best Epic Resort" icon="🎿" resort={topEpic} />
                  <LeaderCard title="Best Ikon Resort" icon="🏔️" resort={topIkon} />
                </div>
              </div>
            )}

            <section
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
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

            <main
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(305px, 1fr))",
                gap: 18,
              }}
            >
              {rows.map((r) => (
                <div
                  key={r.name}
                  className="resort-card"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 24,
                    overflow: "hidden",
                    transition: "transform .2s ease, box-shadow .2s ease",
                    boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      padding: 16,
                      minHeight: 128,
                      background: r.photoPath
                        ? `linear-gradient(to top, rgba(2,6,23,0.82), rgba(2,6,23,0.2)), url(${r.photoPath}) center/cover`
                        : scoreGradient(r.powderScore),
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 14,
                        right: 14,
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                      }}
                    >
                      <div
                        style={{
                          background: "rgba(2,6,23,0.55)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 999,
                          padding: "6px 10px",
                          fontSize: 12,
                          fontWeight: 900,
                        }}
                      >
                        {r.pass}
                      </div>
                      <div
                        style={{
                          background: "rgba(2,6,23,0.55)",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 999,
                          padding: "6px 10px",
                          fontSize: 12,
                          fontWeight: 900,
                          color: riskColor(r.driveRisk),
                        }}
                      >
                        {r.driveRisk || "Unknown"}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "flex-end", gap: 12, paddingTop: 44 }}>
                      <ResortLogo resort={r} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.05 }}>
                          {r.name}
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            display: "inline-flex",
                            gap: 8,
                            alignItems: "center",
                            background: "rgba(2,6,23,0.55)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: 999,
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 900,
                            color: tierColor(r.powderTier),
                          }}
                        >
                          Score {r.powderScore ?? "—"} · {r.powderTier || "Unknown"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: 18, display: "grid", gap: 14 }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 16,
                          padding: 12,
                        }}
                      >
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                          24h Snow
                        </div>
                        <div style={{ marginTop: 4, fontSize: 22, fontWeight: 900 }}>
                          {r.snowPrev24in != null ? `${r.snowPrev24in}"` : "—"}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 16,
                          padding: 12,
                        }}
                      >
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                          Base
                        </div>
                        <div style={{ marginTop: 4, fontSize: 22, fontWeight: 900 }}>
                          {r.baseDepth != null ? `${r.baseDepth}"` : "—"}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 16,
                          padding: 12,
                        }}
                      >
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                          Skiers
                        </div>
                        <div style={{ marginTop: 4, fontSize: 22, fontWeight: 900 }}>
                          {skierCounts?.[r.resortKey] ?? 0}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <Row label="Snow (prev 48h)" value={r.snowPrev48in != null ? `${r.snowPrev48in}"` : "—"} />
                      <Row label="Snow (next 24h)" value={r.snow24in != null ? `${r.snow24in}"` : "—"} />
                      <Row label="Snow (next 48h)" value={r.snow48in != null ? `${r.snow48in}"` : "—"} />
                      <Row label="Temp" value={r.tempF != null ? `${r.tempF}°F` : "—"} />
                      <Row label="Wind" value={r.wind || "—"} />
                      <Row label="Lifts" value={r.liftsOpen != null && r.liftsTotal != null ? `${r.liftsOpen}/${r.liftsTotal}` : "—"} />
                      <Row label="Lift Open %" value={formatPercent(r.liftsOpen, r.liftsTotal)} />
                      <Row label="Runs" value={r.runsOpen != null && r.runsTotal != null ? `${r.runsOpen}/${r.runsTotal}` : "—"} />
                      <Row label="Terrain Open %" value={formatPercent(r.runsOpen, r.runsTotal)} />
                      <Row label="Raw Score" value={r.rawPowderScore != null ? r.rawPowderScore : "—"} />
                      <Row
                        label="Drive Risk"
                        value={
                          <span style={{ color: riskColor(r.driveRisk), fontWeight: 900 }}>
                            {r.driveRisk || "Unknown"}
                          </span>
                        }
                      />
                    </div>

                    <div
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 16,
                        padding: 12,
                        fontSize: 13,
                        color: "rgba(255,255,255,0.78)",
                        minHeight: 58,
                      }}
                    >
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.58)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
                        Forecast
                      </div>
                      {r.shortForecast || "—"}
                    </div>

                    {r.driveAlerts && r.driveAlerts.length > 0 && (
                      <div
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 16,
                          padding: 12,
                          fontSize: 12,
                          color: "rgba(255,255,255,0.68)",
                          display: "grid",
                          gap: 6,
                        }}
                      >
                        <div style={{ fontWeight: 900, color: "rgba(255,255,255,0.78)" }}>
                          Travel Alerts
                        </div>
                        {r.driveAlerts.slice(0, 3).map((alert, idx) => (
                          <div key={idx}>• {alert}</div>
                        ))}
                      </div>
                    )}

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr",
                        gap: 10,
                      }}
                    >
                      <a
                        href={mapsUrl(r.directionsQuery)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "grid",
                          placeItems: "center",
                          textDecoration: "none",
                          color: "#052e2b",
                          fontWeight: 900,
                          padding: "12px 14px",
                          borderRadius: 14,
                          background: "linear-gradient(135deg, #34d399, #22c55e)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        Open Directions
                      </a>
                    </div>

                    {(r.observedUpdated || r.forecastUpdated) && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.5)",
                          lineHeight: 1.5,
                        }}
                      >
                        Resort report: {r.observedUpdated || "—"}
                        <br />
                        Forecast update:{" "}
                        {r.forecastUpdated
                          ? new Date(r.forecastUpdated).toLocaleString()
                          : "—"}
                      </div>
                    )}
                  </div>
                </div>
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


                {activeTab === "crew" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 14,
              marginTop: 8,
            }}
          >
            <AuthPanel />
            <ProfileSetup />
            <SkiCheckInForm resorts={RESORTS} />
            <TodaysCrew />
          </div>
        )}
                
      </div>
    </div>
  )
}