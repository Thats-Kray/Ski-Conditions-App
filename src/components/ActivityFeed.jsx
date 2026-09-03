import { useState, useEffect } from "react"
import {
  getActivityFeed,
  getActivityReactions,
  addActivityReaction,
  getActivityComments,
  addActivityComment,
  deleteActivityComment,
  reportContent,
  getCurrentUser,
} from "../lib/socialApi"
import Avatar from "./ui/Avatar"
import AccentCard from "./ui/AccentCard"
import { timeAgo, formatSessionStat } from "../lib/format"
import { resortName } from "../lib/resorts"
import { groupCommentsByActivity } from "../lib/activityComments"
import { formatTaggedNames } from "../lib/skiDayDetails"

const TYPE_COPY = {
  // Name is deliberately omitted from these sentences — the card header above already
  // shows the actor's name, so these read as a continuation fragment, not a full sentence.
  ski_session: (name, m) => `Skied ${m?.resort_name ? resortName(m.resort_name) : "a resort"}${m?.is_powder_day ? " on a powder day ❄️" : ""}`,
  trip_rsvp: () => "Is going on a trip",
  trip_created: (name, m) => `Planned a trip${m?.resort_key ? ` to ${resortName(m.resort_key)}` : ""}`,
}
const EMOJIS = ["🎿", "❄️", "🔥", "👑"]

export default function ActivityFeed() {
  const [items, setItems] = useState([])
  const [reactions, setReactions] = useState({}) // { [activity_id]: [{user_id, emoji}] }
  const [currentUserId, setCurrentUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [comments, setComments] = useState({}) // { [activity_id]: [row, ...] }, oldest-first
  // One thread open at a time, mirroring SkiBuddyBoard's expandedPostId. That is what
  // lets the composer and the report form be single shared pieces of state instead of
  // per-card maps: only one of each can be on screen.
  const [expandedId, setExpandedId] = useState(null)
  const [draft, setDraft] = useState("")
  const [posting, setPosting] = useState(false)
  const [reportingId, setReportingId] = useState(null) // a comment id, not an activity id
  const [reportReason, setReportReason] = useState("")

  useEffect(() => {
    let cancelled = false
    Promise.all([getActivityFeed(30), getCurrentUser()])
      .then(async ([rows, user]) => {
        if (cancelled) return
        setItems(rows)
        setCurrentUserId(user?.id ?? null)
        const ids = rows.map((r) => r.id)
        const [reactionRows, commentRows] = await Promise.all([
          getActivityReactions(ids).catch(() => []),
          // Warned, not silently swallowed. A PostgREST relationship error or an RLS
          // refusal here is otherwise indistinguishable from "nobody has commented yet" —
          // the exact silent-failure class Feed-A's session-stats join had to guard
          // against. An empty list still renders the feed; it just says so in the console.
          getActivityComments(ids).catch((e) => {
            console.warn("getActivityComments failed", e)
            return []
          }),
        ])
        if (cancelled) return
        const grouped = {}
        for (const r of reactionRows) {
          grouped[r.activity_id] = grouped[r.activity_id] || []
          grouped[r.activity_id].push(r)
        }
        setReactions(grouped)
        setComments(groupCommentsByActivity(commentRows))
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

  function toggleThread(activityId) {
    // Opening a different card resets the composer and any open report form, so a draft
    // can never be posted onto the wrong activity or a reason submitted for the wrong
    // comment.
    setExpandedId((prev) => (prev === activityId ? null : activityId))
    setDraft("")
    setReportingId(null)
    setReportReason("")
  }

  async function handlePostComment(activityId) {
    const text = draft.trim()
    if (!text || posting) return
    setPosting(true)
    try {
      const row = await addActivityComment(activityId, text)
      // Appended rather than refetched: the new row is by definition the newest in the
      // thread, and it comes back with its profile already resolved.
      setComments((prev) => ({ ...prev, [activityId]: [...(prev[activityId] || []), row] }))
      setDraft("")
    } catch (e) {
      console.warn("addActivityComment failed", e)
    } finally {
      setPosting(false)
    }
  }

  async function handleDeleteComment(activityId, commentId) {
    // The removed row is captured from inside this functional updater (not a render-
    // scoped variable) so two rapid deletes in the same thread can't restore a stale
    // array on failure and resurrect an already-deleted comment.
    let removed = null
    setComments((prev) => {
      const list = prev[activityId] || []
      removed = list.find((c) => c.id === commentId) || null
      return { ...prev, [activityId]: list.filter((c) => c.id !== commentId) }
    })
    try {
      await deleteActivityComment(commentId)
    } catch (e) {
      // RLS refused it, or the network did. Put the comment back rather than leaving the
      // UI claiming a deletion that did not happen — reinserted against CURRENT state at
      // restore time, not the stale snapshot from before the optimistic removal.
      console.warn("deleteActivityComment failed", e)
      if (removed) {
        setComments((prev) => {
          const list = [...(prev[activityId] || []), removed]
          list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
          return { ...prev, [activityId]: list }
        })
      }
    }
  }

  async function handleReportComment(commentId) {
    if (!reportReason.trim()) return
    try {
      await reportContent("activity_comment", commentId, reportReason.trim())
      setReportingId(null)
      setReportReason("")
    } catch (e) {
      // Leave the report UI open so the user can retry, same as SkiBuddyBoard's
      // handleReportSubmit. Warned rather than fully swallowed: "activity_comment" is only
      // an accepted target_type because migration 045 widened the allowlist, so if that
      // migration were ever rolled back this would be the one visible symptom.
      console.warn("reportContent(activity_comment) failed", e)
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
        const itemComments = comments[item.id] || []
        const threadOpen = expandedId === item.id
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

        // The three fields getActivityFeed attaches to ski_session items (Task 6). The
        // `|| []` fallbacks are not defensive noise: non-ski_session items never get these
        // keys at all, and .length on undefined throws INSIDE this render map, which would
        // blank the entire feed rather than one card.
        const sessionTitle = item.type === "ski_session" ? item.sessionStats?.title || "" : ""
        const sessionPhotos = item.sessionPhotos || []
        const sessionTags = item.sessionTags || []
        // Two names then "and N others". The avatar cap below is 3, deliberately higher:
        // three overlapped 18px avatars cost ~42px of width, whereas a third display name
        // can be twenty characters and would push the line into an ellipsis at 375px.
        const taggedNames = formatTaggedNames(sessionTags)

        return (
          <AccentCard key={item.id} accentColor={typeAccent}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar profile={item.profiles} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--color-text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{actorName}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {subtitle}
                </div>
              </div>
            </div>

            {sessionTitle && (
              /* The user's own words, so it outranks the generated stat line visually and
                 sits above it. wordBreak: break-word because a 60-char title with no
                 spaces (a URL, a hashtag run) would otherwise overflow the card at 375px
                 instead of wrapping. */
              <div style={{ fontSize: 14, fontWeight: 900, color: "var(--color-text-1)", lineHeight: 1.3, marginTop: 10, wordBreak: "break-word" }}>
                {sessionTitle}
              </div>
            )}

            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-1)", lineHeight: 1.4, marginTop: sessionTitle ? 4 : 10 }}>
              {bodyLine}
            </div>

            {taggedNames && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: "var(--color-text-3)", minWidth: 0 }}>
                <span style={{ flexShrink: 0 }}>with</span>
                <div style={{ display: "flex", flexShrink: 0 }}>
                  {sessionTags.slice(0, 3).map((t, i) => (
                    /* Overlapped by -6px, with a bg-coloured ring so the stack reads as
                       separate faces. flexShrink: 0 on the stack and on "with" means the
                       NAMES absorb the ellipsis, not the avatars. */
                    <div
                      key={t.id}
                      style={{ marginLeft: i === 0 ? 0 : -6, borderRadius: "50%", border: "1.5px solid var(--color-bg)", display: "flex" }}
                    >
                      <Avatar profile={t.profiles} size={18} />
                    </div>
                  ))}
                </div>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {taggedNames}
                </span>
              </div>
            )}

            {sessionPhotos.length > 0 && (
              /* flexWrap, NOT overflowX: auto. A horizontally-scrolling strip nested
                 inside TodayScreen's own scrolling page is a touch-gesture conflict, and
                 the Board slice already shipped two mobile-layout regressions this
                 session. Width arithmetic at a 375px viewport: 375 − 32 (parent padding)
                 − 3 (AccentCard's accent border) − 24 (AccentCard's 12px padding each
                 side) ≈ 316px usable. Four 72px thumbs plus three 6px gaps = 306px, so
                 four fit per row and six photos wrap to two rows. Nothing overflows and
                 nothing scrolls sideways. */
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {sessionPhotos.map((p) => (
                  /* Plain, non-interactive <img>. No onClick, no lightbox, no role, no
                     tabIndex — thumbnails only, per the Global Constraints. loading="lazy"
                     because a 30-card page can carry up to 180 images. alt="" because the
                     photo is decorative here: the card's title, stat line and "with" line
                     already carry the meaning, and there are no captions in this slice. */
                  <img
                    key={p.id}
                    src={p.url}
                    alt=""
                    loading="lazy"
                    style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, flexShrink: 0, display: "block" }}
                  />
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
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
              <button
                onClick={() => toggleThread(item.id)}
                aria-expanded={threadOpen}
                style={{
                  display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
                  borderRadius: "var(--radius-pill)", border: "none", cursor: "pointer", fontSize: 13,
                  marginLeft: "auto",
                  background: threadOpen ? "var(--color-accent)" : "rgba(255,255,255,0.06)",
                  color: threadOpen ? "var(--color-bg)" : "var(--color-text-2)",
                }}
              >
                💬
                {itemComments.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{itemComments.length}</span>
                )}
              </button>
            </div>

            {threadOpen && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", display: "grid", gap: 6 }}>
                {itemComments.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--color-text-3)" }}>No comments yet.</div>
                )}

                {itemComments.map((c) => {
                  const commenterName = c.profiles?.full_name || c.profiles?.username || "Someone"
                  const isMine = c.user_id === currentUserId
                  return (
                    <div key={c.id} style={{ padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.04)", fontSize: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Avatar profile={c.profiles} size={20} />
                        <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: "var(--color-text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {commenterName}
                        </span>
                        <span style={{ color: "var(--color-text-3)", marginLeft: "auto", flexShrink: 0 }}>
                          {timeAgo(c.created_at)}
                        </span>
                      </div>

                      <div style={{ color: "var(--color-text-2)", marginTop: 3, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {c.content}
                      </div>

                      <div style={{ display: "flex", gap: 12, marginTop: 5 }}>
                        {isMine ? (
                          <button
                            onClick={() => handleDeleteComment(item.id, c.id)}
                            style={{ background: "none", border: "none", padding: 0, color: "var(--color-text-3)", fontSize: 11, cursor: "pointer" }}
                          >
                            Delete
                          </button>
                        ) : (
                          <button
                            onClick={() => { setReportingId(reportingId === c.id ? null : c.id); setReportReason("") }}
                            style={{ background: "none", border: "none", padding: 0, color: "var(--color-text-3)", fontSize: 11, cursor: "pointer" }}
                          >
                            🚩 Report
                          </button>
                        )}
                      </div>

                      {reportingId === c.id && (
                        <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                          <textarea
                            value={reportReason}
                            onChange={(e) => setReportReason(e.target.value.slice(0, 300))}
                            placeholder="Why are you reporting this?"
                            rows={2}
                            style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 8, color: "var(--color-text-1)", fontSize: 12, resize: "none", fontFamily: "inherit" }}
                          />
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() => { setReportingId(null); setReportReason("") }}
                              style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "var(--color-text-2)", cursor: "pointer", fontSize: 12 }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleReportComment(c.id)}
                              disabled={!reportReason.trim()}
                              style={{ flex: 2, padding: 8, borderRadius: 8, border: "none", background: "var(--color-danger)", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 12, opacity: reportReason.trim() ? 1 : 0.5 }}
                            >
                              Submit Report
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 2 }}>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.slice(0, 500))}
                    placeholder="Add a comment…"
                    rows={2}
                    style={{ flex: 1, minWidth: 0, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 8, color: "var(--color-text-1)", fontSize: 12, resize: "none", fontFamily: "inherit" }}
                  />
                  <button
                    onClick={() => handlePostComment(item.id)}
                    disabled={!draft.trim() || posting}
                    style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 10, border: "none", background: "var(--gradient-primary)", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 12, opacity: !draft.trim() || posting ? 0.5 : 1 }}
                  >
                    {posting ? "Sending…" : "Send"}
                  </button>
                </div>
              </div>
            )}
          </AccentCard>
        )
      })}
    </div>
  )
}
