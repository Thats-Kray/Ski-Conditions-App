import express from "express"
import cors from "cors"
import fetch from "node-fetch"
import * as cheerio from "cheerio"

const app = express()
app.use(cors())

const PORT = 8787
const cache = new Map()
const TTL = 5 * 60 * 1000

async function cached(key, fn) {
  const hit = cache.get(key)
  const now = Date.now()

  if (hit && now - hit.time < TTL) {
    return hit.value
  }

  const value = await fn()
  cache.set(key, { time: now, value })
  return value
}

function parseValidTime(validTime) {
  const [startIso, durationIso] = validTime.split("/")
  const start = new Date(startIso)

  let ms = 0
  const dayMatch = durationIso.match(/(\d+)D/)
  const hourMatch = durationIso.match(/T.*?(\d+)H/)
  const minMatch = durationIso.match(/T.*?(\d+)M/)
  const secMatch = durationIso.match(/T.*?(\d+)S/)

  if (dayMatch) ms += parseInt(dayMatch[1], 10) * 24 * 60 * 60 * 1000
  if (hourMatch) ms += parseInt(hourMatch[1], 10) * 60 * 60 * 1000
  if (minMatch) ms += parseInt(minMatch[1], 10) * 60 * 1000
  if (secMatch) ms += parseInt(secMatch[1], 10) * 1000

  const end = new Date(start.getTime() + ms)
  return { start, end }
}

function toInches(value, unitCode) {
  if (value == null) return 0

  const u = (unitCode || "").toLowerCase()

  if (u.includes(":mm")) return value / 25.4
  if (u.includes(":cm")) return value / 2.54
  if (u.includes(":m")) return (value * 1000) / 25.4
  if (u.includes("inch")) return value
  if (u.includes(":in")) return value

  return value / 25.4
}

function sumSnowInches(values, hoursAhead) {
  const now = new Date()
  const cutoff = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000)

  let totalIn = 0
  let unitCode = null

  for (const v of values || []) {
    if (!v || !v.validTime) continue
    const { start, end } = parseValidTime(v.validTime)

    if (end <= now) continue
    if (start >= cutoff) continue

    unitCode = unitCode || v.unitCode
    totalIn += toInches(v.value, v.unitCode)
  }

  return { totalIn: Math.round(totalIn * 10) / 10, unitCode }
}

function sumSnowPreviousInches(values, hoursBack) {
  const now = new Date()
  const startWindow = new Date(now.getTime() - hoursBack * 60 * 60 * 1000)

  let totalIn = 0
  let unitCode = null

  for (const v of values || []) {
    if (!v || !v.validTime) continue
    const { start, end } = parseValidTime(v.validTime)

    if (end <= startWindow) continue
    if (start >= now) continue

    unitCode = unitCode || v.unitCode
    totalIn += toInches(v.value, v.unitCode)
  }

  return { totalIn: Math.round(totalIn * 10) / 10, unitCode }
}

function normalizeResortKey(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

async function fetchOpenMeteoSnow(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&hourly=snowfall,snow_depth` +
    `&timezone=America%2FDenver` +
    `&past_days=2&forecast_days=0`

  const data = await cached(url, async () => {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`Open-Meteo error ${r.status}`)
    return r.json()
  })

  const times = data.hourly?.time ?? []
  const snowfall = data.hourly?.snowfall ?? []   // mm per hour
  const snowDepth = data.hourly?.snow_depth ?? [] // meters

  const now = new Date()
  const cutoff24 = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const cutoff48 = new Date(now.getTime() - 48 * 60 * 60 * 1000)

  let sum24mm = 0
  let sum48mm = 0
  let latestDepthM = null

  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i])
    if (t <= now) {
      if (snowDepth[i] != null) latestDepthM = snowDepth[i]
      if (t >= cutoff48) sum48mm += snowfall[i] ?? 0
      if (t >= cutoff24) sum24mm += snowfall[i] ?? 0
    }
  }

  const mmToIn = (mm) => Math.round((mm / 25.4) * 10) / 10
  const mToIn = (m) => Math.round(m * 39.3701 * 10) / 10

  return {
    snowPrev24in: mmToIn(sum24mm),
    snowPrev48in: mmToIn(sum48mm),
    baseDepth: latestDepthM != null ? mToIn(latestDepthM) : null,
    summitDepth: null,
    liftsOpen: null,
    liftsTotal: null,
    runsOpen: null,
    runsTotal: null,
  }
}

function extractCotTripAlerts(text) {
  const cleaned = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()

  const patterns = [
    /I-70[^.]*?\./gi,
    /US 40[^.]*?\./gi,
    /CO 82[^.]*?\./gi,
    /CO 119[^.]*?\./gi,
    /CO 145[^.]*?\./gi,
    /CO 135[^.]*?\./gi,
    /US 6[^.]*?\./gi,
    /Loveland Pass[^.]*?\./gi,
    /Eisenhower Tunnel[^.]*?\./gi,
  ]

  const alerts = []
  for (const pattern of patterns) {
    const matches = cleaned.match(pattern)
    if (matches) alerts.push(...matches)
  }

  return [...new Set(alerts)]
}

function classifyDriveRiskFromAlerts(alerts) {
  let score = 0

  for (const alert of alerts) {
    const t = alert.toLowerCase()

    if (t.includes("road closed")) score += 12
    else if (t.includes("closed")) score += 10
    else if (t.includes("traction law")) score += 5
    else if (t.includes("chain law")) score += 7
    else if (t.includes("avalanche")) score += 10
    else if (t.includes("jackknifed")) score += 8
    else if (t.includes("crash")) score += 6
    else if (t.includes("incident")) score += 4
    else if (t.includes("winter driving")) score += 4
    else if (t.includes("drifting snow")) score += 4
    else if (t.includes("snow packed")) score += 4
    else if (t.includes("icy")) score += 5
    else if (t.includes("road construction")) score += 2
    else if (t.includes("lane closed")) score += 2
  }

  if (score >= 12) return { risk: "Severe", penalty: 16 }
  if (score >= 7) return { risk: "High", penalty: 10 }
  if (score >= 3) return { risk: "Moderate", penalty: 5 }
  return { risk: "Low", penalty: 0 }
}

const NWS_HEADERS = {
  "User-Agent": "ski-dashboard (contact@example.com)",
  Accept: "application/geo+json",
}

const RESORT_COORDS = {
  vail:           { name: "Vail",           lat: 39.6403, lon: -106.3742 },
  beavercreek:    { name: "Beaver Creek",   lat: 39.6042, lon: -106.5165 },
  breckenridge:   { name: "Breckenridge",   lat: 39.4817, lon: -106.0384 },
  keystone:       { name: "Keystone",       lat: 39.6084, lon: -105.9437 },
  crestedbutte:   { name: "Crested Butte",  lat: 38.8996, lon: -106.9653 },
  telluride:      { name: "Telluride",      lat: 37.9363, lon: -107.8466 },
  winterpark:     { name: "Winter Park",    lat: 39.8863, lon: -105.7626 },
  coppermountain: { name: "Copper Mountain",lat: 39.5022, lon: -106.1512 },
  arapahoebasin:  { name: "Arapahoe Basin", lat: 39.6423, lon: -105.8717 },
  steamboat:      { name: "Steamboat",      lat: 40.4572, lon: -106.8047 },
  eldora:         { name: "Eldora",         lat: 39.9372, lon: -105.5842 },
  aspensnowmass:  { name: "Aspen Snowmass", lat: 39.2097, lon: -106.9499 },
}

const COTRIP_ROUTE_CONFIG = {
  vail: {
    url: "https://maps.cotrip.org/list/events?page=1&pageRecordLimit=50&areas=I-70+Mountain+Corridor&routes=I-70&searchTerm=vail&show=winterDriving%2CroadReports%2CroadClosures%2CroadWork%2CchainLaws&sortBy=ROADWAY&sortDirection=DESC",
  },
  beavercreek: {
    url: "https://maps.cotrip.org/list/events?page=1&pageRecordLimit=50&areas=I-70+Mountain+Corridor&routes=I-70&searchTerm=beaver+creek&show=winterDriving%2CroadReports%2CroadClosures%2CroadWork%2CchainLaws&sortBy=ROADWAY&sortDirection=DESC",
  },
  breckenridge: {
    url: "https://maps.cotrip.org/list/events?page=1&pageRecordLimit=50&areas=I-70+Mountain+Corridor&routes=I-70&searchTerm=co+9&show=winterDriving%2CroadReports%2CroadClosures%2CroadWork%2CchainLaws&sortBy=ROADWAY&sortDirection=DESC",
  },
  keystone: {
    url: "https://maps.cotrip.org/list/events?page=1&pageRecordLimit=50&areas=I-70+Mountain+Corridor&routes=I-70&searchTerm=keystone&show=winterDriving%2CroadReports%2CroadClosures%2CroadWork%2CchainLaws&sortBy=ROADWAY&sortDirection=DESC",
  },
  coppermountain: {
    url: "https://maps.cotrip.org/list/events?page=1&pageRecordLimit=50&areas=I-70+Mountain+Corridor&routes=I-70&searchTerm=copper&show=winterDriving%2CroadReports%2CroadClosures%2CroadWork%2CchainLaws&sortBy=ROADWAY&sortDirection=DESC",
  },
  arapahoebasin: {
    url: "https://maps.cotrip.org/list/events?page=1&pageRecordLimit=50&areas=I-70+Mountain+Corridor&routes=I-70&searchTerm=loveland+pass&show=winterDriving%2CroadReports%2CroadClosures%2CroadWork%2CchainLaws&sortBy=ROADWAY&sortDirection=DESC",
  },
  winterpark: {
    url: "https://maps.cotrip.org/list/events?page=1&pageRecordLimit=50&searchTerm=us+40&show=winterDriving%2CroadReports%2CroadClosures%2CroadWork%2CchainLaws&sortBy=ROADWAY&sortDirection=DESC",
  },
  steamboat: {
    url: "https://maps.cotrip.org/list/events?page=1&pageRecordLimit=50&searchTerm=us+40&show=winterDriving%2CroadReports%2CroadClosures%2CroadWork%2CchainLaws&sortBy=ROADWAY&sortDirection=DESC",
  },
  eldora: {
    url: "https://maps.cotrip.org/list/events?page=1&pageRecordLimit=50&searchTerm=co+119&show=winterDriving%2CroadReports%2CroadClosures%2CroadWork%2CchainLaws&sortBy=ROADWAY&sortDirection=DESC",
  },
  aspensnowmass: {
    url: "https://maps.cotrip.org/list/events?page=1&pageRecordLimit=50&searchTerm=co+82&show=winterDriving%2CroadReports%2CroadClosures%2CroadWork%2CchainLaws&sortBy=ROADWAY&sortDirection=DESC",
  },
  crestedbutte: {
    url: "https://maps.cotrip.org/list/events?page=1&pageRecordLimit=50&searchTerm=co+135&show=winterDriving%2CroadReports%2CroadClosures%2CroadWork%2CchainLaws&sortBy=ROADWAY&sortDirection=DESC",
  },
  telluride: {
    url: "https://maps.cotrip.org/list/events?page=1&pageRecordLimit=50&searchTerm=co+145&show=winterDriving%2CroadReports%2CroadClosures%2CroadWork%2CchainLaws&sortBy=ROADWAY&sortDirection=DESC",
  },
}

app.get("/api/nws/point", async (req, res) => {
  const { lat, lon } = req.query
  const url = `https://api.weather.gov/points/${lat},${lon}`

  try {
    const data = await cached(url, async () => {
      const r = await fetch(url, { headers: NWS_HEADERS })
      if (!r.ok) throw new Error(`NWS points error ${r.status}`)
      return r.json()
    })

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get("/api/nws/forecast", async (req, res) => {
  const { url } = req.query

  try {
    const data = await cached(url, async () => {
      const r = await fetch(url, { headers: NWS_HEADERS })
      if (!r.ok) throw new Error(`NWS forecast error ${r.status}`)
      return r.json()
    })

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get("/api/nws/snow", async (req, res) => {
  const { lat, lon } = req.query
  if (!lat || !lon) {
    return res.status(400).json({ error: "lat and lon parameters are required" })
  }

  try {
    const pointUrl = `https://api.weather.gov/points/${lat},${lon}`
    const point = await cached(pointUrl, async () => {
      const r = await fetch(pointUrl, { headers: NWS_HEADERS })
      if (!r.ok) throw new Error(`NWS points error ${r.status}`)
      return r.json()
    })

    const gridUrl = point?.properties?.forecastGridData
    if (!gridUrl) throw new Error("Missing forecastGridData URL for this point.")

    const grid = await cached(gridUrl, async () => {
      const r = await fetch(gridUrl, { headers: NWS_HEADERS })
      if (!r.ok) throw new Error(`NWS grid error ${r.status}`)
      return r.json()
    })

    const snowfallSeries = grid?.properties?.snowfallAmount
    const values = snowfallSeries?.values
    const unitCode = snowfallSeries?.uom || null

    const prev24 = sumSnowPreviousInches(values, 24)
    const next24 = sumSnowInches(values, 24)
    const next48 = sumSnowInches(values, 48)

    res.json({
      lat,
      lon,
      snowPrev24in: prev24.totalIn,
      snow24in: next24.totalIn,
      snow48in: next48.totalIn,
      unitCode,
      updated: grid?.properties?.updateTime || null,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get("/api/resort-snow", async (req, res) => {
  const resortParam = req.query.resort
  const resortKey = normalizeResortKey(resortParam)

  if (!resortParam) {
    return res.status(400).json({ error: "resort parameter is required" })
  }

  const config = RESORT_COORDS[resortKey]
  if (!config) {
    return res.status(404).json({ error: `Unknown resort "${resortParam}"` })
  }

  try {
    const snow = await fetchOpenMeteoSnow(config.lat, config.lon)
    res.json({
      resort: config.name,
      source: "Open-Meteo (hourly snowfall + snow depth)",
      ...snow,
      fetchedAt: new Date().toISOString(),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get("/api/cotrip", async (_req, res) => {
  const url = "https://maps.cotrip.org/list/events?show=roadWork"

  try {
    const html = await cached(url, async () => {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`COtrip error ${r.status}`)
      return r.text()
    })

    res.send(html)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get("/api/drive-risk", async (req, res) => {
  const resortParam = req.query.resort
  const resortKey = normalizeResortKey(resortParam)

  if (!resortParam) {
    return res.status(400).json({ error: "resort parameter is required" })
  }

  const config = COTRIP_ROUTE_CONFIG[resortKey]
  if (!config) {
    return res.status(404).json({ error: `Unknown resort "${resortParam}"` })
  }

  try {
    const html = await cached(config.url, async () => {
      const r = await fetch(config.url, {
        headers: {
          "User-Agent": "ski-dashboard (contact@example.com)",
          Accept: "text/html,application/xhtml+xml",
        },
      })
      if (!r.ok) throw new Error(`COtrip route page error ${r.status}`)
      return r.text()
    })

    const $ = cheerio.load(html)
    const text = $("body").text()
    const alerts = extractCotTripAlerts(text)
    const { risk, penalty } = classifyDriveRiskFromAlerts(alerts)

    res.json({
      resort: resortKey,
      risk,
      penalty,
      alertCount: alerts.length,
      alerts: alerts.slice(0, 8),
      sourceUrl: config.url,
      fetchedAt: new Date().toISOString(),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})