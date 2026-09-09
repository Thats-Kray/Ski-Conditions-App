// Powder Score — the absolute 0-100 formula documented in PRD.md 7.1.
//
// Extracted from src/App.jsx so it can be unit-tested under this repo's
// `npm test` convention (node --test src/lib/*.test.js, which only globs
// src/lib). Pure: no React, no imports, no I/O.
//
// server/powderScore.js is a HAND-MIRRORED copy of this logic for the Render
// backend, which is a separate npm package and cannot import from src/lib.
// Any change here must be mirrored there, and in PRD.md 7.1.

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

// null means "we don't have this data", which is different from 0% open.
export function safePercent(open, total) {
  if (open == null || total == null || total === 0) return null
  return open / total
}

// Weighted components excluding terrain: fresh 40 + incoming 20 + temp 20 +
// base 5. Terrain is the other 15. When terrain is unavailable we rescale by
// 100 / POSITIVE_MAX_WITHOUT_TERRAIN so the remaining signal fills 0-100.
export const POSITIVE_MAX_WITHOUT_TERRAIN = 85

export function computeRawPowderScore({
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

  // ── Terrain (0–15 pts), excluded when we have no data ────────────
  // Both pairs: runs 10 + lifts 5. One pair: that pair alone, scaled to the
  // full 15. Neither: terrain leaves the formula and the rest is rescaled
  // below — never scored as 0 (which would cap the resort at 85) and never
  // assumed half-open (which used to hand it 7.5 free points).
  const runsPct  = safePercent(runsOpen,  runsTotal)
  const liftsPct = safePercent(liftsOpen, liftsTotal)
  const hasTerrainData = runsPct != null || liftsPct != null
  const terrainScore =
    runsPct != null && liftsPct != null ? clamp(runsPct * 10 + liftsPct * 5, 0, 15) :
    runsPct  != null                    ? clamp(runsPct  * 15, 0, 15) :
    liftsPct != null                    ? clamp(liftsPct * 15, 0, 15) :
                                          0

  // ── Base depth (0–5 pts) ─────────────────────────────────────────
  const baseScore = clamp((baseDepth ?? 0) / 20, 0, 5)  // 100" base = 5 pts

  // ── Snow-in-forecast text hint (+2 pts) ─────────────────────────
  const snowHint = /snow|powder|flurr|wintry/i.test(forecastText || "") ? 2 : 0

  // ── Wind penalty (up to –15 pts) ────────────────────────────────
  const windPenalty = clamp((windMph ?? 0) * 0.75, 0, 15)

  // ── Drive penalty (up to –10 pts) ───────────────────────────────
  const driveAdj = clamp(drivePenalty ?? 0, 0, 10)

  // The weighted "how good are conditions" core. The hint and the two
  // penalties are minor modifiers applied AFTER any rescale — they are not
  // part of the 100-point weighting.
  const positive = freshSnow + incomingSnow + tempScore + baseScore
  const weighted = hasTerrainData
    ? positive + terrainScore
    : positive * (100 / POSITIVE_MAX_WITHOUT_TERRAIN)

  const raw = weighted + snowHint - windPenalty - driveAdj

  return Math.round(clamp(raw, 0, 100) * 10) / 10
}

// Absolute tiers — no relative normalization, no percentile curve.
export function powderTierForScore(score) {
  if (score >= 80) return "Elite"
  if (score >= 65) return "Very Good"
  if (score >= 50) return "Good"
  if (score >= 35) return "Okay"
  return "Poor"
}

// Assigns absolute tier labels — no relative normalization.
// Closed resorts show no score so they can't mislead users.
export function normalizePowderScores(rows) {
  return rows.map((r) => {
    if (r.isOpen === false) {
      return { ...r, powderScore: null, powderTier: "Closed" }
    }
    if (typeof r.rawPowderScore !== "number") {
      return { ...r, powderScore: null, powderTier: "Unknown" }
    }
    const powderScore = Math.round(r.rawPowderScore)
    return { ...r, powderScore, powderTier: powderTierForScore(powderScore) }
  })
}
