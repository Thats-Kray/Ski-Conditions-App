// Server-side Powder Score algorithm — mirrors PRD.md 7.1 and the client
// implementation in src/lib/powderScore.js.
//
// This is a HAND-MIRRORED copy, not an import: server/ is a separate npm
// package deployed to Render and cannot resolve src/lib. The two files must be
// changed together, and PRD.md 7.1 updated with them. The one deliberate
// difference from the client is temperature handling: here a null tempF scores
// 0 and the bands are exclusive, which predates this file and is out of scope.

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

// null means "we don't have this data", which is different from 0% open.
function terrainPercent(open, total) {
  if (open == null || total == null || total <= 0) return null
  return open / total
}

// Weighted components excluding terrain: fresh 40 + incoming 20 + temp 20 +
// base 5. Terrain is the other 15.
const POSITIVE_MAX_WITHOUT_TERRAIN = 85

export function computePowderScore({
  isOpen = true,
  snowPrev24in = 0, snowPrev48in = 0, snow24in = 0, snow48in = 0,
  tempF, windMph = 0,
  runsOpen = null, runsTotal = null, liftsOpen = null, liftsTotal = null,
  baseDepth = 0, forecastText = "", driveRisk = "Low",
}) {
  if (!isOpen) return { powderScore: null, powderTier: "Closed" }

  const freshSnow = Math.min(snowPrev24in * 5.0, 32) + Math.min(snowPrev48in * 1.5, 8)
  const incomingSnow = Math.min(snow24in * 3.5, 15) + Math.min(snow48in * 1.0, 5)
  const tempScore = temperatureScore(tempF)

  // Terrain: both pairs -> runs 10 + lifts 5. One pair -> that pair alone
  // scaled to the full 15. Neither -> terrain leaves the formula and the
  // remaining components are rescaled below, so a resort with great snow but
  // an unparseable mountain report is no longer capped at 85/100.
  const runsPct = terrainPercent(runsOpen, runsTotal)
  const liftsPct = terrainPercent(liftsOpen, liftsTotal)
  const hasTerrainData = runsPct != null || liftsPct != null
  const terrainScore =
    runsPct != null && liftsPct != null ? runsPct * 10 + liftsPct * 5 :
    runsPct != null                     ? runsPct * 15 :
    liftsPct != null                    ? liftsPct * 15 :
                                          0

  const baseScore = Math.min(baseDepth / 20, 5)
  const snowHint = /snow|powder|flurr|wintry/i.test(forecastText || "") ? 2 : 0
  const windPenalty = Math.min(windMph * 0.75, 15)
  const drivePenalty = driveRisk === "Moderate" ? 5 : driveRisk === "High" || driveRisk === "Severe" ? 10 : 0

  // Hint and penalties are applied AFTER any rescale — they are modifiers, not
  // part of the 100-point weighting.
  const positive = freshSnow + incomingSnow + tempScore + baseScore
  const weighted = hasTerrainData
    ? positive + terrainScore
    : positive * (100 / POSITIVE_MAX_WITHOUT_TERRAIN)

  const raw = weighted + snowHint - windPenalty - drivePenalty
  const powderScore = Math.max(0, Math.min(100, raw))

  return { powderScore, powderTier: tierForScore(powderScore) }
}
