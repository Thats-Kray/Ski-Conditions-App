import express from "express"
import cors from "cors"
import fetch from "node-fetch"
import * as cheerio from "cheerio"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"
import stravaRouter from "./routes/strava.js"
import { computePowderScore } from "./powderScore.js"
import { registerWeeklyBriefingCron } from "./cron.js"
import { signAlertToken, verifyAlertToken } from "./alertTokens.js"

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

const app = express()
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(",") : "*",
}))
app.use(express.json())
app.use(stravaRouter)

const PORT = process.env.PORT || 8787
const cache = new Map()
const TTL = 5 * 60 * 1000
const CONDITIONS_TTL = 30 * 60 * 1000

async function cached(key, fn, ttl = TTL) {
  const hit = cache.get(key)
  const now = Date.now()

  if (hit && now - hit.time < ttl) {
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

// Colorado resorts live in Mountain Time, so bucket calendar days using that
// zone rather than the server's local/UTC clock — otherwise late-night/early
// -morning grid values can land in the wrong day bucket.
function mountainDateKey(date) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Denver" })
}

// Short weekday label anchored to the same America/Denver zone as
// mountainDateKey — using Date#getDay() here would read the server
// process's local/UTC clock and could desync from the paired `date` key
// (e.g. after ~5pm Denver, once UTC has already rolled to the next
// calendar date).
function mountainDayLabel(date) {
  return date.toLocaleDateString("en-US", { timeZone: "America/Denver", weekday: "short" })
}

// Buckets the same snowfall grid `values` used by sumSnowInches/sumSnowPreviousInches
// into 7 daily totals (today through +6 days), reusing the exact same
// parseValidTime/toInches conversion so there's no unit drift vs snow24in/snow48in.
function bucketSnowfallByDay(values) {
  const now = new Date()

  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000)
    days.push({
      day: mountainDayLabel(d),
      date: mountainDateKey(d),
      inches: 0,
    })
  }

  const indexByDate = new Map(days.map((d, i) => [d.date, i]))

  for (const v of values || []) {
    if (!v || !v.validTime) continue
    const { start } = parseValidTime(v.validTime)
    const key = mountainDateKey(start)
    const idx = indexByDate.get(key)
    if (idx == null) continue // outside the 7-day window we care about

    days[idx].inches += toInches(v.value, v.unitCode)
  }

  return days.map((d) => ({ ...d, inches: Math.round(d.inches * 10) / 10 }))
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
    `&past_days=2&forecast_days=3`

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

// ─────────────────────────────────────────────────────────────────────────────

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

// ── Callable NWS helpers (used by both the HTTP routes below and the cron job) ──

export async function getNwsPoint(lat, lon) {
  const url = `https://api.weather.gov/points/${lat},${lon}`
  return cached(url, async () => {
    const r = await fetch(url, { headers: NWS_HEADERS })
    if (!r.ok) throw new Error(`NWS points error ${r.status}`)
    return r.json()
  })
}

export async function getNwsForecast(url) {
  return cached(url, async () => {
    const r = await fetch(url, { headers: NWS_HEADERS })
    if (!r.ok) throw new Error(`NWS forecast error ${r.status}`)
    return r.json()
  })
}

// Returns the snowfall-amount grid data for a point, including snowPrev48in —
// which the original /api/nws/snow route never computed (it only ever called
// sumSnowPreviousInches with hoursBack=24). computePowderScore() needs the 48h
// lookback too, and sumSnowPreviousInches already supports an arbitrary window,
// so this extraction adds that field rather than silently defaulting it to 0.
export async function getNwsSnow(lat, lon) {
  const point = await getNwsPoint(lat, lon)

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
  const prev48 = sumSnowPreviousInches(values, 48)
  const next24 = sumSnowInches(values, 24)
  const next48 = sumSnowInches(values, 48)
  const dailySnow = bucketSnowfallByDay(values)

  return {
    lat,
    lon,
    snowPrev24in: prev24.totalIn,
    snowPrev48in: prev48.totalIn,
    snow24in: next24.totalIn,
    snow48in: next48.totalIn,
    dailySnow,
    unitCode,
    updated: grid?.properties?.updateTime || null,
  }
}

// Mirrors src/App.jsx's fetchNwsNowish() — point → hourly (temp/wind) + daily
// (forecast text) — but as a server-side callable used only by the cron job's
// briefing composition (the existing HTTP routes don't need this combined shape).
export async function getNwsNowish(lat, lon) {
  const point = await getNwsPoint(lat, lon)

  const hourlyUrl = point?.properties?.forecastHourly
  const forecastUrl = point?.properties?.forecast
  if (!hourlyUrl || !forecastUrl) throw new Error("Missing NWS forecast URLs for this point.")

  const [hourly, daily] = await Promise.all([
    getNwsForecast(hourlyUrl),
    getNwsForecast(forecastUrl),
  ])

  const h0 = hourly?.properties?.periods?.[0]
  const d0 = daily?.properties?.periods?.[0]

  return {
    tempF: h0?.temperature ?? null,
    windMph: parseInt((h0?.windSpeed || "0").match(/\d+/)?.[0] || "0", 10),
    shortForecast: d0?.shortForecast || h0?.shortForecast || "",
    detailedForecast: d0?.detailedForecast || "",
    updated: hourly?.properties?.updated || null,
  }
}

app.get("/api/nws/point", async (req, res) => {
  const { lat, lon } = req.query

  try {
    const data = await getNwsPoint(lat, lon)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get("/api/nws/forecast", async (req, res) => {
  const { url } = req.query

  try {
    const data = await getNwsForecast(url)
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
    const data = await getNwsSnow(lat, lon)
    res.json(data)
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

export async function getDriveRisk(resortParam) {
  const resortKey = normalizeResortKey(resortParam)

  const config = COTRIP_ROUTE_CONFIG[resortKey]
  if (!config) {
    const err = new Error(`Unknown resort "${resortParam}"`)
    err.status = 404
    throw err
  }

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

  return {
    resort: resortKey,
    risk,
    penalty,
    alertCount: alerts.length,
    alerts: alerts.slice(0, 8),
    sourceUrl: config.url,
    fetchedAt: new Date().toISOString(),
  }
}

app.get("/api/drive-risk", async (req, res) => {
  const resortParam = req.query.resort

  if (!resortParam) {
    return res.status(400).json({ error: "resort parameter is required" })
  }

  try {
    const data = await getDriveRisk(resortParam)
    res.json(data)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message })
  }
})

// ── Resort Conditions (lifts / runs / depths) ────────────────────────────────

// Vail Resorts properties share a common JSON API endpoint
const VAIL_RESORT_DOMAINS = {
  vail:         "www.vail.com",
  beavercreek:  "www.beavercreek.com",
  breckenridge: "www.breckenridge.com",
  keystone:     "www.keystoneresort.com",
  crestedbutte: "www.skicb.com",
}

// Ikon resorts + Telluride (Epic but independently operated) — scrape HTML
// NOTE: verify these URLs when 2026/27 season opens in November 2026
const IKON_RESORT_REPORT_URLS = {
  steamboat:      "https://www.steamboat.com/the-mountain/mountain-report",
  winterpark:     "https://www.winterparkresort.com/the-mountain/mountain-report",
  coppermountain: "https://www.coppercolorado.com/the-mountain/mountain-report",
  arapahoebasin:  "https://www.arapahoebasin.com/snow-report/",
  eldora:         "https://www.eldora.com/the-mountain/mountain-report",
  aspensnowmass:  "https://www.aspensnowmass.com/our-mountains/mountain-report",
  telluride:      "https://www.tellurideskiresort.com/mountain-information/snow-conditions/",
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json,*/*",
  "Accept-Language": "en-US,en;q=0.9",
}

async function fetchVailResortsConditions(domain) {
  const url = `https://${domain}/api/resort-data/mountain/v2/conditions/`
  try {
    const data = await cached(url, async () => {
      const r = await fetch(url, { headers: BROWSER_HEADERS })
      if (!r.ok) throw new Error(`Vail API ${r.status}`)
      return r.json()
    }, CONDITIONS_TTL)

    const sr     = data?.SnowReport || {}
    const lifts  = data?.Lifts      || {}
    const terrain = data?.Terrain   || {}
    const status  = (data?.MountainStatus || "").toLowerCase()

    return {
      isOpen:       status === "open",
      liftsOpen:    lifts.Open      ?? null,
      liftsTotal:   lifts.Total     ?? null,
      runsOpen:     terrain.Open    ?? null,
      runsTotal:    terrain.Total   ?? null,
      baseDepth:    sr.BaseDepth    ?? null,
      summitDepth:  sr.SummitDepth  ?? sr.MidMtnDepth ?? null,
      snowLast24in: sr.NewSnow24Hrs ?? null,
      source:       "vailresorts-api",
    }
  } catch {
    return null
  }
}

function parseConditionsHtml(html) {
  const $ = cheerio.load(html)

  // 1. JSON-LD schema.org SkiResort
  let fromJsonLd = null
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const d = JSON.parse($(el).html())
      const entry = Array.isArray(d) ? d.find(x => x["@type"] === "SkiResort") : (d["@type"] === "SkiResort" ? d : null)
      if (entry) fromJsonLd = entry
    } catch {}
  })

  // 2. Aggregate all inline script text for pattern matching
  const scripts = $("script:not([src])").map((_, el) => $(el).html() || "").get().join("\n")
  const allText = scripts + "\n" + $("body").text()

  // 3. __NEXT_DATA__ / window data blobs — try to parse any JSON containing lift counts
  let fromPageData = {}
  const nextDataEl = $("#__NEXT_DATA__").html()
  if (nextDataEl) {
    try {
      const nd = JSON.parse(nextDataEl)
      const str = JSON.stringify(nd)
      // Look for common keys
      const lo = str.match(/"(?:liftsOpen|openLifts|OpenLifts|openLiftCount|lifts_open)"\s*:\s*(\d+)/i)
      const lt = str.match(/"(?:liftsTotal|totalLifts|TotalLifts|totalLiftCount|lifts_total)"\s*:\s*(\d+)/i)
      const ro = str.match(/"(?:runsOpen|openTrails|OpenTrails|openRunCount|trails_open|openRuns)"\s*:\s*(\d+)/i)
      const rt = str.match(/"(?:runsTotal|totalTrails|TotalTrails|totalRunCount|trails_total|totalRuns)"\s*:\s*(\d+)/i)
      const bd = str.match(/"(?:baseDepth|baseDepthIn|BaseDepth|base_depth_in|baseIn)"\s*:\s*(\d+(?:\.\d+)?)/i)
      const sd = str.match(/"(?:summitDepth|summitDepthIn|SummitDepth|summit_depth_in|summitIn)"\s*:\s*(\d+(?:\.\d+)?)/i)
      fromPageData = {
        liftsOpen:   lo ? parseInt(lo[1]) : null,
        liftsTotal:  lt ? parseInt(lt[1]) : null,
        runsOpen:    ro ? parseInt(ro[1]) : null,
        runsTotal:   rt ? parseInt(rt[1]) : null,
        baseDepth:   bd ? parseFloat(bd[1]) : null,
        summitDepth: sd ? parseFloat(sd[1]) : null,
      }
    } catch {}
  }

  // 4. Inline script patterns (SnoCountry, custom widgets, etc.)
  const liftPairMatch =
    scripts.match(/"openLifts"\s*:\s*(\d+)[^}]*"totalLifts"\s*:\s*(\d+)/i) ||
    scripts.match(/"liftsOpen"\s*:\s*(\d+)[^}]*"liftsTotal"\s*:\s*(\d+)/i) ||
    scripts.match(/(\d+)\s*(?:of|\/)\s*(\d+)\s*lifts?\s*(?:open|operating)/i)

  const runPairMatch =
    scripts.match(/"openTrails"\s*:\s*(\d+)[^}]*"totalTrails"\s*:\s*(\d+)/i) ||
    scripts.match(/"runsOpen"\s*:\s*(\d+)[^}]*"runsTotal"\s*:\s*(\d+)/i) ||
    scripts.match(/(\d+)\s*(?:of|\/)\s*(\d+)\s*(?:runs?|trails?)\s*(?:open|operating)/i)

  // 5. Data attributes (SnoCountry widget pattern)
  const condWidget = $("[data-lifts-open], [data-open-lifts]").first()
  const fromDataAttrs = condWidget.length ? {
    liftsOpen:  parseInt(condWidget.attr("data-lifts-open") || condWidget.attr("data-open-lifts"))  || null,
    liftsTotal: parseInt(condWidget.attr("data-lifts-total") || condWidget.attr("data-total-lifts")) || null,
    runsOpen:   parseInt(condWidget.attr("data-runs-open") || condWidget.attr("data-open-runs"))     || null,
    runsTotal:  parseInt(condWidget.attr("data-runs-total") || condWidget.attr("data-total-runs"))   || null,
  } : {}

  // 6. Base depth from text — "42" snow-depth
  const baseMatch =
    allText.match(/base[^:]*?:\s*(\d+(?:\.\d+)?)\s*[""""]/) ||
    allText.match(/(\d+(?:\.\d+)?)["""″]\s*base/) ||
    scripts.match(/"baseDepthIn"\s*:\s*(\d+(?:\.\d+)?)/)

  // 7. Open status from common markers
  const isOpen =
    /resort.{0,30}(?:is\s+)?open|now\s+open|lifts?\s+open/i.test(allText) &&
    !/closed\s+for\s+(?:the\s+)?season|resort\s+(?:is\s+)?closed/i.test(allText)

  // Merge — priority: fromPageData > fromDataAttrs > inline scripts
  return {
    isOpen,
    liftsOpen:   fromPageData.liftsOpen   ?? fromDataAttrs.liftsOpen  ?? (liftPairMatch ? parseInt(liftPairMatch[1]) : null),
    liftsTotal:  fromPageData.liftsTotal  ?? fromDataAttrs.liftsTotal ?? (liftPairMatch ? parseInt(liftPairMatch[2]) : null),
    runsOpen:    fromPageData.runsOpen    ?? fromDataAttrs.runsOpen   ?? (runPairMatch  ? parseInt(runPairMatch[1])  : null),
    runsTotal:   fromPageData.runsTotal   ?? fromDataAttrs.runsTotal  ?? (runPairMatch  ? parseInt(runPairMatch[2])  : null),
    baseDepth:   fromPageData.baseDepth   ?? (baseMatch ? parseFloat(baseMatch[1]) : null),
    summitDepth: fromPageData.summitDepth ?? null,
    source:      "html-scrape",
  }
}

async function fetchHtmlConditions(url) {
  try {
    const html = await cached(url, async () => {
      const r = await fetch(url, { headers: BROWSER_HEADERS })
      if (!r.ok) throw new Error(`Conditions page ${r.status}`)
      return r.text()
    }, CONDITIONS_TTL)
    return parseConditionsHtml(html)
  } catch {
    return null
  }
}

export async function getResortConditions(resortParam) {
  const resortKey = normalizeResortKey(resortParam)

  let conditions = null

  if (VAIL_RESORT_DOMAINS[resortKey]) {
    conditions = await fetchVailResortsConditions(VAIL_RESORT_DOMAINS[resortKey])
  } else if (IKON_RESORT_REPORT_URLS[resortKey]) {
    conditions = await fetchHtmlConditions(IKON_RESORT_REPORT_URLS[resortKey])
  }

  return {
    resort: resortKey,
    fetchedAt: new Date().toISOString(),
    isOpen:      conditions?.isOpen      ?? null,
    liftsOpen:   conditions?.liftsOpen   ?? null,
    liftsTotal:  conditions?.liftsTotal  ?? null,
    runsOpen:    conditions?.runsOpen    ?? null,
    runsTotal:   conditions?.runsTotal   ?? null,
    baseDepth:   conditions?.baseDepth   ?? null,
    summitDepth: conditions?.summitDepth ?? null,
    snowLast24in: conditions?.snowLast24in ?? null,
    source:      conditions?.source      ?? null,
  }
}

app.get("/api/resort-conditions", async (req, res) => {
  const resortParam = req.query.resort

  if (!resortParam) {
    return res.status(400).json({ error: "resort parameter is required" })
  }

  try {
    const data = await getResortConditions(resortParam)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Signed, no-login-required unsubscribe/resubscribe links (weekly briefing emails) ──

app.get("/api/unsubscribe", async (req, res) => {
  try {
    const payload = verifyAlertToken(req.query.token)
    if (payload.action !== "unsubscribe") throw new Error("Wrong token action")
    const { error } = await getSupabase().from("profiles").update({ powder_alerts_enabled: false }).eq("id", payload.userId)
    if (error) throw error
    const resubscribeToken = signAlertToken(payload.userId, "resubscribe")
    res.send(`
      <html><body style="font-family:sans-serif;background:#04080f;color:#e0f2fe;padding:40px;text-align:center;">
        <h2>You've been unsubscribed.</h2>
        <p>You won't receive weekly powder briefings anymore.</p>
        <a href="/api/resubscribe?token=${resubscribeToken}" style="color:#38bdf8;">Click here to re-enable alerts.</a>
      </body></html>
    `)
  } catch (e) {
    res.status(400).send(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;">This link is invalid or has expired.</body></html>`)
  }
})

app.get("/api/resubscribe", async (req, res) => {
  try {
    const payload = verifyAlertToken(req.query.token)
    if (payload.action !== "resubscribe") throw new Error("Wrong token action")
    const { error } = await getSupabase().from("profiles").update({ powder_alerts_enabled: true }).eq("id", payload.userId)
    if (error) throw error
    res.send(`
      <html><body style="font-family:sans-serif;background:#04080f;color:#e0f2fe;padding:40px;text-align:center;">
        <h2>You're back in! ❄️</h2>
        <p>Weekly powder briefings are re-enabled.</p>
      </body></html>
    `)
  } catch (e) {
    res.status(400).send(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;">This link is invalid or has expired.</body></html>`)
  }
})

// ── Server-side content moderation (OpenAI Moderation API) ──
// server/moderation.js's moderateText() is ready to use, but the route that
// calls it (POST /api/moderate-content) is intentionally not wired up yet —
// there's no real caller until Sprint 31's board ships. Wire it back in then,
// with request attribution (req.userId on the moderation_flags row) and input
// validation this sprint's version was missing. See Sprint 30's final review
// for the full reasoning.

// ── Aggregate conditions + Powder Score, for the cron job (no HTTP round-trip) ──

// Loops RESORT_COORDS, calls the per-resort conditions/NWS/drive-risk functions
// above, and runs each result through computePowderScore(). Wrapped in cached()
// (default 5-minute TTL) so a manual test run and the real cron tick within the
// same window don't re-scrape/re-fetch everything twice — the per-source fetches
// underneath are already individually cached too, but this keeps the aggregate
// itself cheap to call repeatedly.
export async function getAllResortConditions() {
  return cached("all-resort-conditions", async () => {
    return Promise.all(
      Object.entries(RESORT_COORDS).map(async ([resortKey, { name, lat, lon }]) => {
        try {
          const [conditions, snow, driveRisk, nowish] = await Promise.all([
            getResortConditions(resortKey),
            getNwsSnow(lat, lon).catch(() => null),
            getDriveRisk(resortKey).catch(() => null),
            getNwsNowish(lat, lon).catch(() => null),
          ])

          const isOpen = conditions.isOpen ?? false

          const { powderScore, powderTier } = computePowderScore({
            isOpen,
            snowPrev24in: snow?.snowPrev24in ?? 0,
            snowPrev48in: snow?.snowPrev48in ?? 0,
            snow24in: snow?.snow24in ?? 0,
            snow48in: snow?.snow48in ?? 0,
            tempF: nowish?.tempF,
            windMph: nowish?.windMph ?? 0,
            runsOpen: conditions.runsOpen ?? 0,
            runsTotal: conditions.runsTotal ?? 0,
            liftsOpen: conditions.liftsOpen ?? 0,
            liftsTotal: conditions.liftsTotal ?? 0,
            baseDepth: conditions.baseDepth ?? 0,
            forecastText: nowish?.shortForecast || nowish?.detailedForecast || "",
            driveRisk: driveRisk?.risk ?? "Low",
          })

          return {
            resortKey,
            name,
            isOpen,
            powderScore,
            powderTier,
            liftsOpen: conditions.liftsOpen,
            liftsTotal: conditions.liftsTotal,
            runsOpen: conditions.runsOpen,
            runsTotal: conditions.runsTotal,
            baseDepth: conditions.baseDepth,
            summitDepth: conditions.summitDepth,
            snowLast24in: conditions.snowLast24in,
            snowPrev24in: snow?.snowPrev24in ?? null,
            snowPrev48in: snow?.snowPrev48in ?? null,
            snow24in: snow?.snow24in ?? null,
            snow48in: snow?.snow48in ?? null,
            tempF: nowish?.tempF ?? null,
            windMph: nowish?.windMph ?? null,
            forecastText: nowish?.shortForecast || nowish?.detailedForecast || null,
            driveRisk: driveRisk?.risk ?? null,
            drivePenalty: driveRisk?.penalty ?? null,
            source: conditions.source,
            fetchedAt: conditions.fetchedAt,
          }
        } catch (err) {
          // One resort's total failure shouldn't take down the whole briefing —
          // treat it as unscoreable/closed rather than throwing.
          return {
            resortKey,
            name,
            isOpen: false,
            powderScore: null,
            powderTier: "Closed",
            error: err.message,
          }
        }
      })
    )
  })
}

// Only boot the live server + cron schedule when this file is the actual
// process entry point (`node index.js`). Without this gate, anything that
// imports index.js as a module — including cron.js, which imports
// getAllResortConditions from here — forces a full module evaluation that
// starts a stray Express server and registers a real cron job as a side
// effect, hanging the importing process (e.g. `node -e "import('./cron.js')..."`,
// which is exactly the sprint's own manual-verification command for
// sendWeeklyBriefing()).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  registerWeeklyBriefingCron()

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`)
  })
}