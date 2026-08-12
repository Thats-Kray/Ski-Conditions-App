import { useState, useEffect } from "react"
import { getActivityFeed, getActivityReactions, addActivityReaction, getCurrentUser } from "../lib/socialApi"
import Avatar from "./ui/Avatar"
import AccentCard from "./ui/AccentCard"
import { timeAgo } from "../lib/format"
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
    <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
      {items.map((item) => {
        const actorName = item.profiles?.full_name || item.profiles?.username || "Someone"
        const describe = TYPE_COPY[item.type]
        const itemReactions = reactions[item.id] || []
        // trip_created/default accents have no exact :root token match — left literal as
        // per-type decorative differentiators (rule 5), same precedent as MountainBoard.jsx's
        // CATEGORY_COLORS social/general entries (Task 7).
        const typeAccent = item.type === "ski_session" ? "var(--color-accent)" : item.type === "trip_created" ? "#fb923c" : "#a78bfa"
        return (
          <AccentCard key={item.id} accentColor={typeAccent}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Avatar profile={item.profiles} size={36} />
              <div style={{ fontSize: 13, flex: 1 }}>
                <div>{describe ? describe(actorName, item.metadata) : `${actorName} did something`}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-3)", marginTop: 2 }}>{timeAgo(item.created_at)}</div>
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  {EMOJIS.map((emoji) => {
                    const count = itemReactions.filter((r) => r.emoji === emoji).length
                    const mine = itemReactions.some((r) => r.user_id === currentUserId && r.emoji === emoji)
                    return (
                      <button
                        key={emoji}
                        onClick={() => handleReact(item.id, emoji)}
                        style={{
                          display: "flex", alignItems: "center", gap: 3, padding: "2px 6px",
                          borderRadius: "var(--radius-pill)", border: "none", cursor: "pointer", fontSize: 12,
                          background: mine ? "var(--color-accent)" : "rgba(255,255,255,0.06)",
                          color: mine ? "var(--color-bg)" : "var(--color-text-2)",
                        }}
                      >
                        {emoji}
                        {count > 0 && <span style={{ fontSize: 10, fontWeight: 700 }}>{count}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </AccentCard>
        )
      })}
    </div>
  )
}
