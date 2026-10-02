import { useEffect, useState } from "react"
import { getConditionsReports } from "../lib/socialApi"
import { timeAgo } from "../lib/format"
import { RESORT_NAMES } from "../lib/resorts"
import AccentCard from "./ui/AccentCard"

const SNOW_QUALITY_LABEL = {
  powder: "❄️ Powder",
  groomed: "🪨 Groomed",
  icy: "🧊 Icy",
  slushy: "💦 Slushy",
}

const CROWD_LEVEL_LABEL = {
  empty: "🫥 Empty",
  light: "🙂 Light",
  moderate: "😐 Moderate",
  packed: "😬 Packed",
}

const chipLabelStyle = {
  fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
  border: "1px solid var(--overlay-12)", background: "var(--overlay-05)", color: "var(--ink-70)",
}

// MountainPage renders every widget's Component with exactly { resortKey,
// currentUserEmail } (mountainPageWidgets.js's own contract) — currentUserEmail is
// unused here, matching EventsWidget's existing precedent of ignoring props it
// doesn't need rather than requiring every widget use every prop.
export default function ConditionsReportsWidget({ resortKey }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    getConditionsReports(resortKey)
      .then((rows) => { if (!cancelled) setReports(rows) })
      .catch((err) => { if (!cancelled) { setReports([]); setLoadError(err) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [resortKey])

  if (loading) {
    return <div style={{ padding: 20, fontSize: 13, color: "var(--ink-40)" }}>Loading…</div>
  }
  if (loadError) {
    return (
      <div style={{ padding: 20, fontSize: 13, color: "var(--color-danger)" }}>
        Couldn't load recent reports. Try again in a bit.
      </div>
    )
  }
  if (!reports.length) {
    return (
      <div style={{ padding: 20, fontSize: 13, color: "var(--ink-40)" }}>
        No conditions reports at {RESORT_NAMES[resortKey] || resortKey} in the last two weeks. Log
        a ski day here to add one.
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {reports.map((r) => {
        const reporter = r.profiles?.full_name || r.profiles?.username || "Someone"
        const snow = r.snow_quality ? SNOW_QUALITY_LABEL[r.snow_quality] : null
        const crowd = r.crowd_level ? CROWD_LEVEL_LABEL[r.crowd_level] : null
        return (
          <AccentCard key={r.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "var(--color-text-1)" }}>{reporter}</span>
              {/* "T12:00:00" anchors the bare DATE string to local noon before parsing — the
                  same reasoning src/lib/format.js's formatDate()/formatDateFull() already
                  document: parsing "YYYY-MM-DD" bare is UTC midnight, which can read as the
                  PREVIOUS calendar day once shifted to Mountain Time. */}
              <span style={{ fontSize: 11, color: "var(--ink-40)" }}>{timeAgo(`${r.session_date}T12:00:00`)}</span>
            </div>
            {(snow || crowd) && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: r.conditions_comment ? 6 : 0 }}>
                {snow && <span style={chipLabelStyle}>{snow}</span>}
                {crowd && <span style={chipLabelStyle}>{crowd}</span>}
              </div>
            )}
            {r.conditions_comment && (
              <div style={{ fontSize: 13, color: "var(--color-text-1)" }}>{r.conditions_comment}</div>
            )}
          </AccentCard>
        )
      })}
    </div>
  )
}
