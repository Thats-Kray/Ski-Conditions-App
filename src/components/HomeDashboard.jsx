import { useState, useEffect } from "react"
import { useMobile, useIsStandalone } from "../lib/useMobile"
import { supabase } from "../lib/supabase"
import {
  getMyCrews,
  getAcceptedFriends,
  getAllVisibleTrips,
  getTodaysVisiblePlans,
  getMyDailyPlan,
  rsvpToTrip,
} from "../lib/socialApi"
import CreateTripModal from "./CreateTripModal"
import SkiCheckInForm from "./SkiCheckInForm"
import TodaysCrew from "./TodaysCrew"
import { resortName, resortEmoji } from "../lib/resorts"
import { timeAgo, formatDate } from "../lib/format"
import Avatar from "./ui/Avatar"
import { SkiPingComposer } from "./SkiPingModal"
import { useLiveFriendLocations } from "../lib/useLiveFriendLocations"
import Card from "./ui/Card"
import Badge, { TIER_COLORS } from "./ui/Badge"
import ScoreRing from "./ui/ScoreRing"
import SnowStat from "./ui/SnowStat"
import HeroPhotoHeader from "./ui/HeroPhotoHeader"
import { MountainIcon } from "./ui/NavIcons"
import { localDateKey } from "../lib/calendarDates"

// Generic scenic photo behind the "Ready to ski?" hero — shown whenever no
// specific open resort's own photo is available (e.g. offseason), so the
// hero always reads as a premium photo header rather than a flat gradient.
const HERO_FALLBACK_PHOTO = "/hero-mountain.jpg"

function driveRiskColor(risk) {
  const r = (risk || "").toLowerCase()
  if (r === "low") return "var(--color-success)"
  if (r === "medium" || r === "moderate") return "var(--color-warning)"
  if (r === "high") return "var(--color-danger)"
  return "var(--color-text-2)"
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LS_PREFIX = "pd_cr_"
function getLastRead(id) { try { return localStorage.getItem(LS_PREFIX + id) || null } catch { return null } }
function markRead(id)    { try { localStorage.setItem(LS_PREFIX + id, new Date().toISOString()) } catch {} }

// ── Shared primitives ─────────────────────────────────────────────────────────

function DashCard({ children, style = {} }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 20,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      ...style,
    }}>
      {children}
    </div>
  )
}

function CardHeader({ title, action }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      flexShrink: 0,
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 0.9 }}>
        {title}
      </div>
      {action}
    </div>
  )
}

function EmptyState({ icon, text, sub }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 8, padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 32 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>{text}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", lineHeight: 1.5 }}>{sub}</div>}
    </div>
  )
}

// ── Card 1: Today's Best Mountain ─────────────────────────────────────────────

function TodaysBestMountainCard({ resorts, onTabChange }) {
  const best = [...(resorts || [])]
    .filter((r) => r.isOpen && r.powderScore != null)
    .sort((a, b) => b.powderScore - a.powderScore)[0]

  if (!best) {
    return (
      <Card>
        <div style={{ fontSize: 13, color: "var(--color-text-2)" }}>
          No resorts open right now — check back for the season opener.
        </div>
      </Card>
    )
  }

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 12, color: "var(--color-text-3)" }}>
          Today's Best Mountain
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.15, marginTop: 2 }}>
          {resortName(best.resortKey)}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <ScoreRing
          score={best.powderScore}
          tier={best.powderTier ?? "Closed"}
          size={112}
          strokeWidth={9}
          label="Powder Score"
          showTier
        />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 14, color: "var(--color-text-2)" }}>
            Snow 24h: <strong style={{ color: "var(--color-text-1)" }}>{best.snowPrev24in != null ? `${best.snowPrev24in}"` : "—"}</strong>
          </div>
          <div style={{ fontSize: 14, color: "var(--color-text-2)" }}>
            Drive Risk: <strong style={{ color: driveRiskColor(best.driveRisk) }}>{best.driveRisk ?? "—"}</strong>
          </div>
          <div style={{
            width: 34, height: 34, borderRadius: "50%", marginTop: 4,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-3)",
          }}>
            <MountainIcon size={17} />
          </div>
        </div>
      </div>
      <button
        onClick={() => onTabChange("dashboard")}
        style={{ background: "none", border: "none", color: "var(--color-accent)", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, textAlign: "left" }}
      >
        View All Resorts →
      </button>
    </Card>
  )
}

// ── Card 2: Your Next Trip / pending invite ───────────────────────────────────

function NextTripCard({ currentUser, onTabChange }) {
  const [loading, setLoading] = useState(true)
  const [invited, setInvited] = useState([])
  const [nextTrip, setNextTrip] = useState(null)
  const [dismissed, setDismissed] = useState(new Set())
  const [rsvpBusyId, setRsvpBusyId] = useState(null)
  const [showCreateTrip, setShowCreateTrip] = useState(false)

  useEffect(() => {
    if (!currentUser) { setLoading(false); return }
    let cancelled = false
    getAllVisibleTrips()
      .then(({ mine = [], rsvpd = [], invited: invitedTrips = [] }) => {
        if (cancelled) return
        setInvited(invitedTrips)
        const upcoming = [...mine, ...rsvpd].sort((a, b) => (a.ski_date || "").localeCompare(b.ski_date || ""))
        setNextTrip(upcoming[0] || null)
      })
      .catch(() => { if (!cancelled) { setInvited([]); setNextTrip(null) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [currentUser])

  const pendingInvite = invited.find((t) => !dismissed.has(t.id))

  async function handleRsvp(tripId, status) {
    setRsvpBusyId(tripId)
    setDismissed((prev) => new Set([...prev, tripId])) // optimistic
    try {
      await rsvpToTrip(tripId, status)
    } catch (e) {
      console.warn("RSVP failed:", e)
      setDismissed((prev) => { const next = new Set(prev); next.delete(tripId); return next }) // rollback
    } finally {
      setRsvpBusyId(null)
    }
  }

  const cardHeader = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ fontSize: 11, color: "var(--color-text-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {pendingInvite ? "Trip Invite" : "Your Next Trip"}
      </div>
      <button
        onClick={() => onTabChange("plans")}
        style={{ background: "none", border: "none", color: "var(--color-accent)", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 }}
      >
        See all trips →
      </button>
    </div>
  )

  if (!currentUser || loading) {
    return (
      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {cardHeader}
        <div style={{ fontSize: 13, color: "var(--color-text-2)" }}>
          {!currentUser ? "Sign in to see your plans." : "Loading…"}
        </div>
      </Card>
    )
  }

  // State A — pending invite
  if (pendingInvite) {
    const host = pendingInvite.host_profile
    return (
      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {cardHeader}
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>
            {resortEmoji(pendingInvite.resort_key)} {resortName(pendingInvite.resort_key) || pendingInvite.resort_key}
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-2)", marginTop: 4 }}>
            {formatDate(pendingInvite.ski_date)}
            {host && ` · Hosted by ${host.full_name || host.username || "a friend"}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => handleRsvp(pendingInvite.id, "going")}
            disabled={rsvpBusyId === pendingInvite.id}
            style={{
              flex: 1, background: "var(--gradient-cta)", color: "white",
              border: "none", borderRadius: 10, padding: "10px 14px", fontWeight: 800, fontSize: 13,
              cursor: rsvpBusyId === pendingInvite.id ? "not-allowed" : "pointer",
            }}
          >
            Accept
          </button>
          <button
            onClick={() => handleRsvp(pendingInvite.id, "cantgo")}
            disabled={rsvpBusyId === pendingInvite.id}
            style={{
              flex: 1, background: "rgba(255,255,255,0.06)", color: "var(--color-text-1)",
              border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 14px",
              fontWeight: 800, fontSize: 13, cursor: rsvpBusyId === pendingInvite.id ? "not-allowed" : "pointer",
            }}
          >
            Decline
          </button>
        </div>
      </Card>
    )
  }

  // State B — next upcoming trip
  if (nextTrip) {
    const goingCount = (nextTrip.rsvps || []).filter((r) => r.status === "going").length
    return (
      <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {cardHeader}
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>
            {resortEmoji(nextTrip.resort_key)} {resortName(nextTrip.resort_key) || nextTrip.resort_key}
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-2)", marginTop: 4 }}>
            {formatDate(nextTrip.ski_date)} · {goingCount} going
          </div>
        </div>
      </Card>
    )
  }

  // State C — no invite, no upcoming trips
  return (
    <>
      <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {cardHeader}
        <button
          onClick={() => setShowCreateTrip(true)}
          style={{ background: "none", border: "none", color: "var(--color-accent)", fontWeight: 700, fontSize: 14, cursor: "pointer", padding: 0, textAlign: "left" }}
        >
          Plan a ski day with your crew →
        </button>
      </Card>
      {showCreateTrip && (
        <CreateTripModal
          onClose={() => setShowCreateTrip(false)}
          onCreated={() => setShowCreateTrip(false)}
        />
      )}
    </>
  )
}

// ── Card 3: Who's Skiing Today ────────────────────────────────────────────────

function WhosSkiingTodayCard({ currentUser, onTabChange, refreshKey }) {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [friendIds, setFriendIds] = useState([])

  useEffect(() => {
    let cancelled = false
    // Local date key, not UTC — this feeds the same "who's skiing today" widget
    // TodaysCrew shows, and a UTC key would show tomorrow's plans after ~5pm Mountain.
    const today = localDateKey()
    getTodaysVisiblePlans(today)
      .then((rows) => { if (!cancelled) setPlans(rows || []) })
      .catch(() => { if (!cancelled) setPlans([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [refreshKey])

  // Friend IDs feed the live "N friends on mountain now" count (S28-T4).
  useEffect(() => {
    if (!currentUser) { setFriendIds([]); return }
    let cancelled = false
    getAcceptedFriends()
      .then((friends) => { if (!cancelled) setFriendIds((friends || []).map((f) => f.id)) })
      .catch(() => { if (!cancelled) setFriendIds([]) })
    return () => { cancelled = true }
  }, [currentUser])

  const liveLocations = useLiveFriendLocations(friendIds)
  const liveCount = Object.keys(liveLocations).length

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 11, color: "var(--color-text-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Who's Skiing Today
      </div>
      {liveCount > 0 && (
        <div style={{ fontSize: 12, color: "var(--color-accent)", fontWeight: 700 }}>
          📍 {liveCount} friend{liveCount === 1 ? "" : "s"} on the mountain right now
        </div>
      )}
      {loading ? (
        <div style={{ fontSize: 13, color: "var(--color-text-3)" }}>Loading…</div>
      ) : plans.length === 0 ? (
        <button
          onClick={() => onTabChange("plans")}
          style={{ background: "none", border: "none", color: "var(--color-accent)", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, textAlign: "left" }}
        >
          Be the first to check in today →
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {plans.slice(0, 5).map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar profile={p.profile} size={28} />
              <div style={{ fontSize: 13 }}>
                <strong>{p.profile?.full_name ?? p.profile?.username ?? "Someone"}</strong>{" "}
                <span style={{ color: "var(--color-text-3)" }}>· {resortName(p.resort_key)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Check In Today CTA ────────────────────────────────────────────────────────

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

// ── Mobile: Crew list (tap → Friends tab) ────────────────────────────────────

function MobileCrewListWidget({ currentUser, onTabChange }) {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentUser) { setLoading(false); return }
    ;(async () => {
      try {
        const crews = await getMyCrews()
        if (!crews.length) { setConversations([]); setLoading(false); return }

        const crewIds = crews.map(c => c.id)
        const { data: msgs } = await supabase
          .from("crew_messages")
          .select("crew_id, content, is_system, created_at, profile:user_id(full_name, username)")
          .in("crew_id", crewIds)
          .order("created_at", { ascending: false })
          .limit(Math.min(crewIds.length * 6, 120))

        const lastMsgMap = {}
        for (const m of (msgs || [])) {
          if (!lastMsgMap[m.crew_id]) lastMsgMap[m.crew_id] = m
        }

        const enriched = crews.map(crew => {
          const lastMessage = lastMsgMap[crew.id] || null
          const lastRead = getLastRead(crew.id)
          const unread = lastMessage && (!lastRead || new Date(lastMessage.created_at) > new Date(lastRead))
          return { ...crew, lastMessage, unread }
        }).sort((a, b) =>
          new Date(b.lastMessage?.created_at || b.created_at) -
          new Date(a.lastMessage?.created_at || a.created_at)
        ).slice(0, 4)

        setConversations(enriched)
      } catch (e) {
        console.warn("MobileCrewListWidget:", e)
      } finally {
        setLoading(false)
      }
    })()
  }, [currentUser])

  return (
    <DashCard>
      <CardHeader
        title="💬 Messages"
        action={
          <button
            onClick={() => onTabChange("friends")}
            style={{ background: "none", border: "none", color: "var(--color-accent-soft)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "4px 8px", borderRadius: 8 }}
          >
            Open →
          </button>
        }
      />
      <div>
        {!currentUser ? (
          <EmptyState icon="💬" text="Sign in to see messages" />
        ) : loading ? (
          <EmptyState icon="⏳" text="Loading…" />
        ) : conversations.length === 0 ? (
          <EmptyState icon="💬" text="No crew chats yet" sub="Join a crew to get started" />
        ) : conversations.map((crew, i) => {
          const lastMsg = crew.lastMessage
          const preview = (() => {
            if (!lastMsg) return "No messages yet"
            const sender = lastMsg.profile?.full_name?.split(" ")[0] || lastMsg.profile?.username || "Someone"
            const content = lastMsg.content || ""
            return `${sender}: ${content.length > 42 ? content.slice(0, 42) + "…" : content}`
          })()
          return (
            <div
              key={crew.id}
              onClick={() => onTabChange("friends")}
              className="conv-row"
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "13px 16px",
                borderBottom: i < conversations.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                cursor: "pointer",
              }}
            >
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: "linear-gradient(135deg,rgba(37,99,235,0.2),rgba(8,145,178,0.15))",
                  border: "1px solid rgba(96,165,250,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                }}>
                  {crew.emoji}
                </div>
                {crew.unread && (
                  <div style={{ position: "absolute", top: -2, right: -2, width: 10, height: 10, borderRadius: "50%", background: "var(--color-accent-strong)", border: "2px solid rgba(6,10,22,1)" }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4, marginBottom: 3 }}>
                  <div style={{ fontWeight: crew.unread ? 800 : 600, fontSize: 14, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {crew.name}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", flexShrink: 0 }}>
                    {timeAgo(lastMsg?.created_at)}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {preview}
                </div>
              </div>
              <div style={{ fontSize: 16, color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>›</div>
            </div>
          )
        })}
      </div>
    </DashCard>
  )
}

// ── Ski Ping CTA ──────────────────────────────────────────────────────────────

function PingCta({ currentUser }) {
  const [open, setOpen] = useState(false)
  const [friends, setFriends] = useState(null)

  if (!currentUser) return null

  async function handleOpen() {
    setOpen(true)
    if (!friends) {
      getAcceptedFriends().then(setFriends).catch(() => setFriends([]))
    }
  }

  return (
    <>
      <div style={{ textAlign: "center", padding: "4px 0 2px" }}>
        <button
          onClick={handleOpen}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--color-accent-soft)", fontSize: 13, fontWeight: 700,
            textDecoration: "underline", textUnderlineOffset: 3,
            padding: "6px 12px",
          }}
        >
          👋 Ping a friend to ski →
        </button>
      </div>
      {open && friends !== null && (
        <SkiPingComposer
          friends={friends}
          onClose={() => setOpen(false)}
          onSent={() => setOpen(false)}
        />
      )}
    </>
  )
}

// ── Add to Home Screen nudge ──────────────────────────────────────────────────
//
// Sprint plan says this should key off `sessionActive` (GPS session started),
// a prop introduced by Sprint 4. This sprint runs independently and in
// isolation from Sprint 4's changes, so `sessionActive` may not actually be
// wired up by any parent yet — it's accepted here as an optional prop
// (defaults to false) so it "just works" once Sprint 4 lands. In the
// meantime we fall back to the visit-count trigger the plan also describes
// ("the GPS session has started OR a certain number of visits have passed"),
// so the nudge is functional on its own rather than permanently dormant.
const A2HS_DISMISS_KEY = "pd_a2hs_dismissed"
const A2HS_VISIT_KEY = "pd_a2hs_visit_count"
const A2HS_VISIT_THRESHOLD = 3

function AddToHomeScreenNudge({ currentUser, sessionActive }) {
  const isStandalone = useIsStandalone()
  const [showNudge, setShowNudge] = useState(false)

  useEffect(() => {
    let visitCount = 0
    try {
      visitCount = (parseInt(localStorage.getItem(A2HS_VISIT_KEY), 10) || 0) + 1
      localStorage.setItem(A2HS_VISIT_KEY, String(visitCount))
    } catch {
      // localStorage unavailable — treat as first visit, non-fatal
    }

    let dismissed = false
    try {
      dismissed = localStorage.getItem(A2HS_DISMISS_KEY) === "true"
    } catch {
      // ignore
    }

    if (
      currentUser &&
      !isStandalone &&
      !dismissed &&
      (sessionActive || visitCount >= A2HS_VISIT_THRESHOLD)
    ) {
      setShowNudge(true)
    }
  }, [currentUser, isStandalone, sessionActive])

  function dismissNudge() {
    try { localStorage.setItem(A2HS_DISMISS_KEY, "true") } catch {}
    setShowNudge(false)
  }

  if (!showNudge) return null

  return (
    <div style={{
      background: "rgba(56,189,248,0.08)",
      border: "1px solid rgba(56,189,248,0.2)",
      borderRadius: 14,
      padding: "10px 14px",
      marginBottom: 12,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      fontSize: 13,
    }}>
      <span style={{ color: "rgba(255,255,255,0.8)" }}>
        📲 Add to Home Screen for better GPS tracking
      </span>
      <button
        onClick={dismissNudge}
        style={{
          background: "none", border: "none", color: "rgba(255,255,255,0.4)",
          fontSize: 12, cursor: "pointer", fontWeight: 700, flexShrink: 0,
        }}
      >
        Dismiss
      </button>
    </div>
  )
}

// ── Start My Day CTA ──────────────────────────────────────────────────────────

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

// ── Offseason launch banner ───────────────────────────────────────────────────

function OffseasonBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("pd_offseason_banner_26") === "1" } catch { return false }
  })

  if (dismissed) return null

  return (
    <div style={{
      position: "relative",
      background: "var(--gradient-banner-offseason)",
      border: "1px solid rgba(96,165,250,0.3)",
      borderRadius: 20,
      padding: "20px 48px 20px 24px",
      display: "flex",
      alignItems: "flex-start",
      gap: 16,
    }}>
      {/* Snowflake accent */}
      <div style={{ fontSize: 36, flexShrink: 0, lineHeight: 1 }}>❄️</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: 1.2,
          color: "var(--color-accent-soft)", textTransform: "uppercase", marginBottom: 6,
        }}>
          Colorado Season Wrap — Winter 2025/26
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-banner-heading)", marginBottom: 6, lineHeight: 1.4 }}>
          The mountains are closing for the summer. See you on the slopes this fall! ⛷️
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
          PowderDays is officially launching for the <span style={{ color: "var(--color-banner-highlight)", fontWeight: 700 }}>2026/27 season</span>.
          Invite your crew now — resort conditions, trip planning, and leaderboards
          will be live when the lifts spin up in <span style={{ color: "var(--color-banner-highlight)", fontWeight: 700 }}>November 2026</span>.
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.25)",
            borderRadius: 20, padding: "5px 14px",
            fontSize: 12, fontWeight: 700, color: "var(--color-banner-highlight)",
          }}>
            🎿 Rope Drops Winter 2026
          </div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
            borderRadius: 20, padding: "5px 14px",
            fontSize: 12, fontWeight: 700, color: "var(--color-banner-badge-mint)",
          }}>
            11 Colorado Resorts Tracked
          </div>
        </div>
      </div>

      {/* Dismiss button */}
      <button
        onClick={() => {
          try { localStorage.setItem("pd_offseason_banner_26", "1") } catch {}
          setDismissed(true)
        }}
        style={{
          position: "absolute", top: 12, right: 12,
          background: "none", border: "none", cursor: "pointer",
          color: "rgba(255,255,255,0.35)", fontSize: 18, lineHeight: 1,
          padding: 4, borderRadius: 6,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

// ── Mobile layout ─────────────────────────────────────────────────────────────

function MobileHomeDashboard({ resorts, currentUser, onTabChange, onStartSession, sessionActive, crewRefreshKey, onCheckedIn }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StartMyDayCta currentUser={currentUser} sessionActive={sessionActive} resorts={resorts} onStartSession={onStartSession} />
      <AddToHomeScreenNudge currentUser={currentUser} sessionActive={sessionActive} />
      <OffseasonBanner />
      <CheckInTodayCta resorts={resorts} currentUser={currentUser} onCheckedIn={onCheckedIn} />
      <Card>
        <TodaysCrew />
      </Card>
      <TodaysBestMountainCard resorts={resorts} onTabChange={onTabChange} />
      <NextTripCard currentUser={currentUser} onTabChange={onTabChange} />
      <WhosSkiingTodayCard currentUser={currentUser} onTabChange={onTabChange} refreshKey={crewRefreshKey} />
      <MobileCrewListWidget currentUser={currentUser} onTabChange={onTabChange} />
      <PingCta currentUser={currentUser} />
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function HomeDashboard({ resorts, currentUser, onTabChange, onStartSession, sessionActive = false }) {
  const isMobile = useMobile()
  const [crewRefreshKey, setCrewRefreshKey] = useState(0)
  const handleCheckedIn = () => setCrewRefreshKey((k) => k + 1)

  if (isMobile) {
    return (
      <MobileHomeDashboard
        resorts={resorts}
        currentUser={currentUser}
        onTabChange={onTabChange}
        onStartSession={onStartSession}
        sessionActive={sessionActive}
        crewRefreshKey={crewRefreshKey}
        onCheckedIn={handleCheckedIn}
      />
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Start My Day CTA */}
      <StartMyDayCta currentUser={currentUser} sessionActive={sessionActive} resorts={resorts} onStartSession={onStartSession} />

      {/* Offseason launch banner */}
      <OffseasonBanner />

      {/* Check In Today CTA */}
      <CheckInTodayCta resorts={resorts} currentUser={currentUser} onCheckedIn={handleCheckedIn} />

      {/* Today's Crew — who's on the mountain right now */}
      <Card>
        <TodaysCrew />
      </Card>

      {/* 3-card feed */}
      <TodaysBestMountainCard resorts={resorts} onTabChange={onTabChange} />
      <NextTripCard currentUser={currentUser} onTabChange={onTabChange} />
      <WhosSkiingTodayCard currentUser={currentUser} onTabChange={onTabChange} refreshKey={crewRefreshKey} />

      {/* Ping CTA */}
      <PingCta currentUser={currentUser} />
    </div>
  )
}
