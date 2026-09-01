import { useState, useEffect } from "react"
import { getActivityFeed, getActivityReactions, addActivityReaction, getCurrentUser } from "../lib/socialApi"
import Avatar from "./ui/Avatar"
import AccentCard from "./ui/AccentCard"
import { timeAgo, formatSessionStat } from "../lib/format"
import { resortName } from "../lib/resorts"

const TYPE_COPY = {
  ski_session: (name, m) => `${name} skied ${m?.resort_name ? resortName(m.resort_name) : "a resort"}${m?.is_powder_day ? " on a powder day ❄️" : ""}`,
  trip_rsvp: (name) => `${name} is going on a trip`,
  trip_created: (name, m) => `${name} planned a trip${m?.resort_key ? ` to ${resortName(m.resort_key)}` : ""}`,
}
const EMOJIS = ["🎿", "❄️", "🔥", "👑"]

export default function ActivityFeed() {
  const [items, setItems] = useState([])
  const [reactions, setReactions] = useState({}) // { [activity_id]: [{user_id, emoji}] }
  const [currentUserId, setCurrentUserId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.all([getActivityFeed(30), getCurrentUser()])
      .then(async ([rows, user]) => {
        if (cancelled) return
        setItems(rows)
        setCurrentUserId(user?.id ?? null)
        const reactionRows = await getActivityReactions(rows.map((r) => r.id)).catch(() => [])
        if (cancelled) return
        const grouped = {}
        for (const r of reactionRows) {
          grouped[r.activity_id] = grouped[r.activity_id] || []
          grouped[r.activity_id].push(r)
        }
        setReactions(grouped)
      })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function handleReact(activityId, emoji) {
    setReactions((prev) => {
      const existing = prev[activityId] || []
      const mine = existing.find((r) => r.user_id === currentUserId)
      const withoutMine = existing.filter((r) => r.user_id !== currentUserId)
      const next = mine?.emoji === emoji ? withoutMine : [...withoutMine, { user_id: currentUserId, emoji }]
      return { ...prev, [activityId]: next }
    })
    try {
      await addActivityReaction(activityId, emoji)
    } catch {
      const rows = await getActivityReactions([activityId]).catch(() => [])
      setReactions((prev) => ({ ...prev, [activityId]: rows }))
    }
  }

  if (loading) return <div style={{ padding: 20, fontSize: 13, color: "var(--color-text-3)" }}>Loading…</div>
  if (!items.length) return <div style={{ padding: 20, fontSize: 13, color: "var(--color-text-3)" }}>No recent activity from your crew yet.</div>

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
      {items.map((item) => {
        const actorName = item.profiles?.full_name || item.profiles?.username || "Someone"
        const describe = TYPE_COPY[item.type]
        const itemReactions = reactions[item.id] || []
        // trip_created/default accents have no exact :root token match — left literal as
        // per-type decorative differentiators (rule 5), same precedent as MountainBoard.jsx's
        // CATEGORY_COLORS social/general entries (Task 7).
        const typeAccent = item.type === "ski_session" ? "var(--color-accent)" : item.type === "trip_created" ? "#fb923c" : "#a78bfa"

        // Header subtitle: resort then time-ago, replacing the standalone time-ago line
        // that used to sit under the sentence. Resort is ski_session-only — trip_created
        // already names its resort inside its own sentence copy, and trip_rsvp has none.
        const resortLabel = item.type === "ski_session" && item.metadata?.resort_name
          ? resortName(item.metadata.resort_name)
          : ""
        const subtitle = [resortLabel, timeAgo(item.created_at)].filter(Boolean).join(" · ")

        // Body: the joined stat line for ski_session entries, the existing sentence copy
        // for everything else. formatSessionStat returns "" both when sessionStats is null
        // (session deleted, or logged before stats were tracked) and when the row holds
        // nothing worth showing, so a single `||` covers both fallbacks and no card is
        // ever left blank.
        const sentence = describe ? describe(actorName, item.metadata) : `${actorName} did something`
        const statLine = item.type === "ski_session" ? formatSessionStat(item.sessionStats) : ""
        const bodyLine = statLine || sentence

        return (
          <AccentCard key={item.id} accentColor={typeAccent}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar profile={item.profiles} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--color-text-1)" }}>{actorName}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {subtitle}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-1)", lineHeight: 1.4, marginTop: 10 }}>
              {bodyLine}
            </div>

            <div style={{ display: "flex", gap: 6, marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {EMOJIS.map((emoji) => {
                const count = itemReactions.filter((r) => r.emoji === emoji).length
                const mine = itemReactions.some((r) => r.user_id === currentUserId && r.emoji === emoji)
                return (
                  <button
                    key={emoji}
                    onClick={() => handleReact(item.id, emoji)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
                      borderRadius: "var(--radius-pill)", border: "none", cursor: "pointer", fontSize: 13,
                      background: mine ? "var(--color-accent)" : "rgba(255,255,255,0.06)",
                      color: mine ? "var(--color-bg)" : "var(--color-text-2)",
                    }}
                  >
                    {emoji}
                    {count > 0 && <span style={{ fontSize: 11, fontWeight: 700 }}>{count}</span>}
                  </button>
                )
              })}
            </div>
          </AccentCard>
        )
      })}
    </div>
  )
}
