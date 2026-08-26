import { useState, useEffect } from "react"
import { useMobile, useIsStandalone } from "../lib/useMobile"
import { supabase } from "../lib/supabase"
import {
  getMyCrews,
  getAcceptedFriends,
  getTodaysVisiblePlans,
} from "../lib/socialApi"
import { resortName } from "../lib/resorts"
import { timeAgo } from "../lib/format"
import Avatar from "./ui/Avatar"
import { useLiveFriendLocations } from "../lib/useLiveFriendLocations"
import Card from "./ui/Card"
import Badge, { TIER_COLORS } from "./ui/Badge"
import ScoreRing from "./ui/ScoreRing"
import SnowStat from "./ui/SnowStat"
import { MountainIcon } from "./ui/NavIcons"
import { localDateKey } from "../lib/calendarDates"

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

function MobileHomeDashboard({ resorts, currentUser, onTabChange, sessionActive, crewRefreshKey }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <AddToHomeScreenNudge currentUser={currentUser} sessionActive={sessionActive} />
      <OffseasonBanner />
      <TodaysBestMountainCard resorts={resorts} onTabChange={onTabChange} />
      <WhosSkiingTodayCard currentUser={currentUser} onTabChange={onTabChange} refreshKey={crewRefreshKey} />
      <MobileCrewListWidget currentUser={currentUser} onTabChange={onTabChange} />
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function HomeDashboard({ resorts, currentUser, onTabChange, sessionActive = false }) {
  const isMobile = useMobile()
  // crewRefreshKey previously bumped whenever CheckInTodayCta (now in TrackScreen,
  // Task 4) reported a check-in, so WhosSkiingTodayCard would refetch right away.
  // That trigger moved out with the widget; refreshKey now only reflects this
  // card's own mount, same as it would for any other prop that never changes.
  const [crewRefreshKey] = useState(0)

  if (isMobile) {
    return (
      <MobileHomeDashboard
        resorts={resorts}
        currentUser={currentUser}
        onTabChange={onTabChange}
        sessionActive={sessionActive}
        crewRefreshKey={crewRefreshKey}
      />
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Offseason launch banner */}
      <OffseasonBanner />

      {/* 3-card feed */}
      <TodaysBestMountainCard resorts={resorts} onTabChange={onTabChange} />
      <WhosSkiingTodayCard currentUser={currentUser} onTabChange={onTabChange} refreshKey={crewRefreshKey} />
    </div>
  )
}
