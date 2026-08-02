// Server-side Powder Score algorithm — reproduced exactly from PRD.md §7.1.
// This must stay in lockstep with the documented spec (not with src/App.jsx's
// client-side implementation, which is a separate concern if it ever drifts).

const TEMP_BANDS = [
  { max: 0, points: 2 },
  { max: 12, points: 8 },
  { max: 20, points: 15 },
  { max: 30, points: 20 },
  { max: 35, points: 17 },
  { max: 40, points: 11 },
  { max: 48, points: 4 },
]

function temperatureScore(tempF) {
  if (tempF == null) return 0
  for (const band of TEMP_BANDS) {
    if (tempF < band.max) return band.points
  }
  return 0 // >= 48
}

function tierForScore(score) {
  if (score >= 80) return "Elite"
  if (score >= 65) return "Very Good"
  if (score >= 50) return "Good"
  if (score >= 35) return "Okay"
  return "Poor"
}

export function computePowderScore({
  isOpen = true,
  snowPrev24in = 0, snowPrev48in = 0, snow24in = 0, snow48in = 0,
  tempF, windMph = 0,
  runsOpen = 0, runsTotal = 0, liftsOpen = 0, liftsTotal = 0,
  baseDepth = 0, forecastText = "", driveRisk = "Low",
}) {
  if (!isOpen) return { powderScore: null, powderTier: "Closed" }

  const freshSnow = Math.min(snowPrev24in * 5.0, 32) + Math.min(snowPrev48in * 1.5, 8)
  const incomingSnow = Math.min(snow24in * 3.5, 15) + Math.min(snow48in * 1.0, 5)
  const tempScore = temperatureScore(tempF)
  const terrainScore = (runsTotal > 0 ? (runsOpen / runsTotal) * 10 : 0) + (liftsTotal > 0 ? (liftsOpen / liftsTotal) * 5 : 0)
  const baseScore = Math.min(baseDepth / 14, 5)
  const snowHint = /snow|powder|flurr|wintry/i.test(forecastText || "") ? 2 : 0
  const windPenalty = Math.min(windMph * 0.75, 15)
  const drivePenalty = driveRisk === "Moderate" ? 5 : driveRisk === "High" || driveRisk === "Severe" ? 10 : 0

  const raw = freshSnow + incomingSnow + tempScore + terrainScore + baseScore + snowHint - windPenalty - drivePenalty
  const powderScore = Math.max(0, Math.min(100, raw))

  return { powderScore, powderTier: tierForScore(powderScore) }
}
