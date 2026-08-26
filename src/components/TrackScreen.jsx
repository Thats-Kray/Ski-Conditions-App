import { useState, useEffect } from "react"
import { getMyDailyPlan } from "../lib/socialApi"
import SkiCheckInForm from "./SkiCheckInForm"
import TodaysCrew from "./TodaysCrew"
import Card from "./ui/Card"
import HeroPhotoHeader from "./ui/HeroPhotoHeader"
import { localDateKey } from "../lib/calendarDates"

// Generic scenic photo behind the "Ready to ski?" hero — shown whenever no
// specific open resort's own photo is available (e.g. offseason), so the
// hero always reads as a premium photo header rather than a flat gradient.
const HERO_FALLBACK_PHOTO = "/hero-mountain.jpg"

// ── Start My Day CTA ──────────────────────────────────────────────────────────
// Relocated verbatim from HomeDashboard.jsx (Task 4).

function StartMyDayCta({ currentUser, sessionActive, resorts, onStartSession }) {
  if (!currentUser) return null

  if (sessionActive) {
    return (
      <div style={{
        background: "rgba(34,197,94,0.08)",
        border: "1px solid rgba(34,197,94,0.2)",
        borderRadius: 14,
        padding: "10px 16px",
        marginBottom: 16,
        fontSize: 13,
        color: "var(--color-success)",
        fontWeight: 700,
      }}>
        ● Session active — tracking your day
      </div>
    )
  }

  const topResort = (resorts || [])
    .filter(r => r.isOpen !== false && r.powderScore != null)
    .sort((a, b) => (b.powderScore ?? -1) - (a.powderScore ?? -1))[0]

  return (
    <div style={{
      marginBottom: 16,
      width: "100vw",
      marginLeft: "calc(50% - 50vw)",
      marginRight: "calc(50% - 50vw)",
    }}>
      <HeroPhotoHeader
        photoPath={topResort?.photoPath || HERO_FALLBACK_PHOTO}
        title=""
        badges={[]}
        scoreSlot={null}
        rounded={false}
      >
        <div style={{
          background: "rgba(30,41,59,0.45)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.16)",
          borderRadius: 20,
          padding: "20px 22px",
        }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "white" }}>Ready to ski?</h2>
          <button
            onClick={() => onStartSession(topResort?.name ?? "Unknown Resort")}
            style={{
              width: "100%",
              marginTop: 14,
              background: "var(--gradient-primary)",
              border: "none",
              borderRadius: 999,
              padding: "14px 20px",
              color: "white",
              fontWeight: 900,
              fontSize: 15,
              cursor: "pointer",
              boxShadow: "0 4px 20px rgba(56,189,248,0.45)",
            }}
          >
            Start My Day ⛷
          </button>
          <div style={{ fontSize: 13, color: "rgba(226,232,240,0.75)", marginTop: 10, textAlign: "center" }}>
            Track your runs, vertical, and speed.
          </div>
        </div>
      </HeroPhotoHeader>
    </div>
  )
}

// ── Check In Today CTA ────────────────────────────────────────────────────────
// Relocated verbatim from HomeDashboard.jsx (Task 4).

function CheckInTodayCta({ resorts, currentUser, onCheckedIn }) {
  const [hasChecked, setHasChecked] = useState(null) // null = still loading
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!currentUser) { setHasChecked(true); return } // logged-out: hide the CTA entirely
    let cancelled = false
    // Local date key, not UTC — this decides whether the check-in CTA still shows,
    // and a UTC key would look up tomorrow's (nonexistent) plan after ~5pm Mountain.
    const today = localDateKey()
    getMyDailyPlan(today)
      // Hide only once the user has actually arrived — not merely because a plan exists.
      // Sprint 36 gave plans an ETA and a visibility setting, so "I have a plan today"
      // is no longer a reason to remove the only entry point for editing it.
      .then((plan) => { if (!cancelled) setHasChecked(plan?.status === "arrived") })
      .catch(() => { if (!cancelled) setHasChecked(false) })
    return () => { cancelled = true }
  }, [currentUser])

  if (hasChecked === null || hasChecked) return null // hide once checked in, or while loading, or if logged out

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          display: "block", margin: "0 auto 16px", padding: "10px 22px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.18)",
          color: "var(--color-text-1)", fontWeight: 700, fontSize: 14, cursor: "pointer",
        }}
      >
        📍 Check In Today
      </button>
    )
  }

  return (
    <Card>
      <SkiCheckInForm
        resorts={resorts}
        onSaved={() => { setExpanded(false); setHasChecked(true); onCheckedIn?.() }}
      />
    </Card>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
//
// Track tab (Task 4): the GPS session CTA, the arrival check-in flow, and
// "who's out today" — the Planned→Driving→Arrived state machine. Relocated
// from HomeDashboard.jsx's old "Home" tab. Not yet wired into App.jsx's
// tab-switch dispatch (Task 7 does that); this component is standalone,
// mirroring the same prop shapes App.jsx already passes to HomeDashboard
// today (currentUser, sessionActive, resorts, onStartSession).
//
// Note: HomeDashboard previously owned local `crewRefreshKey`/`onCheckedIn`
// state used to refresh its *separate* WhosSkiingTodayCard widget after a
// check-in. That widget isn't part of this relocation (it stays in
// HomeDashboard), and TodaysCrew itself takes no refresh-key prop — it loads
// and reloads its own plans internally. So there is no refresh wiring to
// carry over here; `onCheckedIn` is left as CheckInTodayCta's normal optional
// callback with nothing attached, matching a faithful (not restructured)
// relocation.

export default function TrackScreen({ currentUser, sessionActive = false, resorts, onStartSession }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <StartMyDayCta currentUser={currentUser} sessionActive={sessionActive} resorts={resorts} onStartSession={onStartSession} />
      <CheckInTodayCta resorts={resorts} currentUser={currentUser} />
      <Card>
        <TodaysCrew />
      </Card>
    </div>
  )
}
