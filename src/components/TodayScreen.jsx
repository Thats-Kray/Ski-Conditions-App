import { useEffect, useState } from "react"
import PowderMap from "./PowderMap"
import Badge, { TIER_COLORS } from "./ui/Badge"
import ScoreRing from "./ui/ScoreRing"
import Avatar from "./ui/Avatar"

const OWNER_EMAIL = "raykyle1104@gmail.com"
const KRAMES_BUTTE_KEY = "kramesbutte"

function formatPercent(open, total) {
  if (open == null || total == null || total === 0) return "—"
  return `${Math.round((open / total) * 100)}%`
}

function mapsUrl(destination) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destination
  )}`
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

function SevenDayForecastPanel({ dailySnow }) {
  if (!dailySnow?.length) {
    return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Forecast unavailable.</div>
  }
  const max = Math.max(...dailySnow.map((d) => d.inches), 1)
  const best = dailySnow.reduce((a, b) => (b.inches > a.inches ? b : a), dailySnow[0])

  return (
    <div>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 60 }}>
        {dailySnow.map((d) => (
          <div key={d.date} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
            <div
              style={{
                width: "100%",
                height: Math.max(4, (d.inches / max) * 44),
                background: d.date === best.date && best.inches > 0 ? "var(--color-success)" : "rgba(255,255,255,0.15)",
                borderRadius: 3,
              }}
              title={`${d.inches.toFixed(1)}"`}
            />
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{d.day}</div>
          </div>
        ))}
      </div>
      {best.inches > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
          Best day: {best.day} ❄️ {best.inches.toFixed(0)}"
        </div>
      )}
    </div>
  )
}

function tierColor(tier) {
  if (tier === "Elite")     return "var(--rating-mint)"
  if (tier === "Very Good") return "var(--rating-sky)"
  if (tier === "Good")      return "var(--rating-gold)"
  if (tier === "Okay")      return "var(--rating-peach)"
  if (tier === "Closed")    return "var(--rating-slate)"
  return "var(--rating-coral)" // Poor
}

function riskColor(risk) {
  if (risk === "Low") return "var(--rating-mint)"
  if (risk === "Moderate") return "var(--rating-gold)"
  if (risk === "High") return "var(--rating-peach)"
  return "var(--rating-coral)"
}

function computeVibeScore(checkins, rsvps, powderScore) {
  const raw = checkins * 2 + rsvps * 3 + (powderScore ?? 0) * 0.2
  return Math.max(0, Math.min(100, raw))
}

function vibeTier(score) {
  if (score >= 70) return { label: "🔥 High", color: "var(--rating-coral)" }
  if (score >= 40) return { label: "👍 Active", color: "var(--rating-gold)" }
  return { label: "😶 Quiet", color: "var(--rating-slate)" }
}

function scoreGradient(score) {
  if (score == null) return "linear-gradient(135deg, #334155, #1e293b)"
  if (score >= 80) return "var(--gradient-elite)"                       // Elite
  if (score >= 65) return "linear-gradient(135deg, #1d4ed8, #4338ca)"   // Very Good
  if (score >= 50) return "linear-gradient(135deg, #475569, #334155)"   // Good
  if (score >= 35) return "linear-gradient(135deg, #7c2d12, #92400e)"   // Okay
  return "linear-gradient(135deg, #7f1d1d, #451a03)"                    // Poor
}

function FriendsGoingBadge({ friends }) {
  const [open, setOpen] = useState(false)
  if (!friends?.length) return null
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 999, padding: "4px 10px 4px 6px", cursor: "pointer" }}
      >
        <div style={{ display: "flex" }}>
          {friends.slice(0, 3).map((f, i) => (
            <div key={f.id} style={{ marginLeft: i > 0 ? -8 : 0, border: "2px solid var(--color-bg)", borderRadius: "50%" }}>
              <Avatar profile={f} size={22} />
            </div>
          ))}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>
          {friends.length} friend{friends.length === 1 ? "" : "s"} going this weekend
        </span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "110%", left: 0, background: "var(--color-surface-popover)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 10, zIndex: 20, minWidth: 160, boxShadow: "0 12px 40px rgba(0,0,0,0.4)" }}>
          {friends.map((f) => (
            <div key={f.id} style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", padding: "4px 0" }}>{f.full_name || f.username}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function ResortCard({ r, skierCounts, skierDetails, activityCount = 0, friendsGoing, vibeData, onOpenMountainPage }) {
  const [expanded, setExpanded] = useState(false)
  const [weekExpanded, setWeekExpanded] = useState(false)

  const vibeCheckins = vibeData?.checkinCounts?.[r.resortKey] || 0
  const vibeRsvps = vibeData?.rsvpCounts?.[r.resortKey] || 0
  const vibeScore = computeVibeScore(vibeCheckins, vibeRsvps, r.powderScore)
  const vibe = vibeTier(vibeScore)

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
            ? `linear-gradient(to top, rgba(4,8,15,0.82), rgba(2,6,23,0.2)), url(${r.photoPath}) center/cover`
            : scoreGradient(r.powderScore),
        }}
      >
        <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {r.isOpen === false && (
            <div style={{ background: "rgba(30,10,10,0.75)", border: "1px solid rgba(239,68,68,0.5)", borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 900, color: "var(--color-danger)", backdropFilter: "blur(8px)", letterSpacing: 0.3 }}>Closed for Season</div>
          )}
          {r.isOpen === true && (
            <div style={{ background: "rgba(10,30,10,0.75)", border: "1px solid rgba(34,197,94,0.5)", borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 900, color: "var(--color-success)", backdropFilter: "blur(8px)", letterSpacing: 0.3 }}>Open</div>
          )}
          <div style={{ background: "rgba(4,8,15,0.65)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 900, backdropFilter: "blur(8px)", letterSpacing: 0.3 }}>{r.pass}</div>
          <div style={{ background: "rgba(4,8,15,0.65)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 900, color: riskColor(r.driveRisk), backdropFilter: "blur(8px)", letterSpacing: 0.3 }}>{r.driveRisk || "Unknown"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, paddingTop: 44 }}>
          <ResortLogo resort={r} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.05 }}>{r.name}</div>
            <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Badge label={r.powderTier ?? "Closed"} color={TIER_COLORS[r.powderTier] ?? TIER_COLORS.Closed} />
              {/* A closed resort is quiet by definition — "😶 Quiet" next to
                  "Closed for Season" is noise, not a signal. */}
              {r.isOpen && (
                <span title="Based on check-ins and upcoming trips at this resort">
                  <Badge label={vibe.label} color={vibe.color} size="sm" />
                </span>
              )}
            </div>
          </div>
          <ScoreRing score={r.powderScore} tier={r.powderTier ?? "Closed"} size={72} strokeWidth={6} />
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
            <div key={label} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: "12px 12px" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
              <div style={{ marginTop: 4, fontSize: 22, fontWeight: 900 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Community activity signal — aggregate across all users, distinct from any friends-only badge */}
        {activityCount > 0 && (
          <div style={{ fontSize: 12, color: "var(--color-text-3)", display: "flex", alignItems: "center", gap: 4 }}>
            ⛷️ {activityCount} user{activityCount === 1 ? "" : "s"} skied here this week
          </div>
        )}

        <FriendsGoingBadge friends={friendsGoing} />

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
                Resort report: {r.observedUpdated || "—"}{r.conditionsSource ? ` (${r.conditionsSource})` : ""}<br />
                Forecast: {r.forecastUpdated ? new Date(r.forecastUpdated).toLocaleString() : "—"}
              </div>
            )}
          </div>
        )}

        {/* This Week toggle */}
        <button
          onClick={() => setWeekExpanded((v) => !v)}
          style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "7px 12px", color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, transition: "color 0.15s" }}
        >
          {weekExpanded ? "▲ This Week" : "▼ This Week"}
        </button>

        {weekExpanded && (
          <div style={{ padding: "4px 0" }}>
            <SevenDayForecastPanel dailySnow={r.dailySnow} />
          </div>
        )}

        {/* Mountain Page */}
        <button
          onClick={() => onOpenMountainPage(r.resortKey)}
          style={{ display: "grid", placeItems: "center", border: "1px solid rgba(56,189,248,0.3)", color: "var(--color-accent)", fontWeight: 800, padding: "11px 14px", borderRadius: 14, background: "rgba(56,189,248,0.08)", fontSize: 13, cursor: "pointer" }}
        >
          🏔️ Mountain Page →
        </button>

        {/* Directions */}
        <a
          href={mapsUrl(r.directionsQuery)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "grid", placeItems: "center", textDecoration: "none", color: "var(--color-pass-pill-text)", fontWeight: 900, padding: "11px 14px", borderRadius: 14, background: "linear-gradient(135deg, var(--color-success), var(--color-success-strong))", fontSize: 13 }}
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
        background: "linear-gradient(135deg, var(--color-surface-popover), var(--color-text-muted))",
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

// The Snow/dashboard tab, lifted verbatim out of App.jsx (Task 2 of the IA
// restructure). `conditionsSubTab` is pure UI state that belonged here, not
// on App.jsx — everything else is threaded through as props with the exact
// names App.jsx already used, so this is a relocation, not a rewrite.
//
// App.jsx's shared header still renders the Refresh button and the dashboard
// description paragraph inline with the title (their original position) —
// both need to know whether the sub-tab is "conditions", so `onSubTabChange`
// reports this component's conditionsSubTab up to App.jsx as a read-only
// mirror. App.jsx never sets it back down; TodayScreen remains the one
// source of truth for the sub-tab itself.
export default function TodayScreen({
  rows,
  passFilter,
  setPassFilter,
  query,
  setQuery,
  sortBy,
  setSortBy,
  skierCounts,
  skierDetails,
  friendIds,
  resortActivityCounts,
  friendTripsByResort,
  vibeData,
  loading,
  refresh,
  currentUser,
  topResort,
  secondResort,
  thirdResort,
  topEpic,
  topIkon,
  setMountainPageResortKey,
  onSubTabChange,
}) {
  const [conditionsSubTab, setConditionsSubTab] = useState("conditions")

  // Report the current sub-tab to App.jsx on mount and on every change, so its
  // header (Refresh button + description) can stay in sync without owning
  // this state itself.
  useEffect(() => {
    onSubTabChange?.(conditionsSubTab)
  }, [conditionsSubTab, onSubTabChange])

  return (
    <>
      {/* Sub-tab switcher */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {[
          { key: "conditions", label: "🏔️ Snow" },
          { key: "map",        label: "🗺️ Map" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setConditionsSubTab(key)}
            style={{
              background: conditionsSubTab === key
                ? "var(--gradient-primary)"
                : "rgba(255,255,255,0.06)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.12)",
              padding: "9px 16px",
              borderRadius: 12,
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: conditionsSubTab === key ? "0 4px 14px rgba(56,189,248,0.2)" : "none",
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
          friendIds={friendIds}
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
          {currentUser?.email === OWNER_EMAIL && (
            <button
              onClick={() => setMountainPageResortKey(KRAMES_BUTTE_KEY)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "12px 16px", marginBottom: 16, borderRadius: 14,
                border: "1px dashed rgba(163,230,53,0.5)", background: "rgba(163,230,53,0.08)",
                color: "var(--color-dev-badge)", fontWeight: 800, fontSize: 13, cursor: "pointer",
              }}
            >
              🧪 Krames Butte — Dev Testing Ground →
            </button>
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
                        ? "var(--gradient-pass-pill)"
                        : "rgba(255,255,255,0.06)",
                    color: passFilter === p ? "var(--color-pass-pill-text)" : "white",
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
              <ResortCard key={r.name} r={r} skierCounts={skierCounts} skierDetails={skierDetails} activityCount={resortActivityCounts[r.resortKey] || 0} friendsGoing={friendTripsByResort[r.resortKey] || []} vibeData={vibeData} onOpenMountainPage={setMountainPageResortKey} />
            ))}
          </main>
        </>
      )}
    </>
  )
}
