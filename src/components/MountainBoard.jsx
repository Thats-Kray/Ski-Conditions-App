import { useEffect, useMemo, useState } from "react"
import {
  getBoardPosts,
  createBoardPost,
  reportBoardPost,
} from "../lib/socialApi"
import { useCurrentPosition } from "../lib/useCurrentPosition"
import { RESORT_NAMES, RESORT_EMOJI } from "../lib/resorts"
import { timeAgo } from "../lib/format"

const CATEGORIES = [
  { key: "safety",     label: "Safety",       emoji: "🚨" },
  { key: "lost_found", label: "Lost & Found", emoji: "🔍" },
  { key: "social",     label: "Social",       emoji: "🤙" },
  { key: "general",    label: "General",      emoji: "💬" },
]

const OWNER_EMAIL = "raykyle1104@gmail.com"
const KRAMES_BUTTE_KEY = "kramesbutte"

function displayName(key) {
  return key === KRAMES_BUTTE_KEY ? "Krames Butte" : (RESORT_NAMES[key] || key)
}

// `resortKey` prop, when present, "locks" the board to that resort — no
// resort-switcher chips are shown and the value can't change. This is how
// MountainPage (see src/lib/mountainPageWidgets.js) embeds this component
// as a per-resort widget. When absent (the standalone "📋 Board" tab in
// App.jsx), behavior is unchanged: a free-standing multi-resort switcher
// defaulting to `defaultResortKey`.
export default function MountainBoard({ defaultResortKey, currentUserEmail, resortKey: lockedResortKey }) {
  const [selectedResortKey, setSelectedResortKey] = useState(defaultResortKey || "vail")
  const resortKey = lockedResortKey || selectedResortKey
  const [posts, setPosts] = useState([])
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [category, setCategory] = useState("general")
  const [content, setContent] = useState("")
  const [postError, setPostError] = useState(null)
  const [posting, setPosting] = useState(false)

  const { requestPosition } = useCurrentPosition()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    getBoardPosts(resortKey)
      .then((rows) => { if (!cancelled) setPosts(rows) })
      .catch((err) => { if (!cancelled) { setPosts([]); setLoadError(err) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [resortKey])

  const visiblePosts = useMemo(
    () => (categoryFilter === "all" ? posts : posts.filter((p) => p.category === categoryFilter)),
    [posts, categoryFilter]
  )

  async function handleSubmitPost() {
    if (!content.trim()) return
    setPosting(true)
    setPostError(null)
    try {
      const coords = await requestPosition()
      const newPost = await createBoardPost({
        resortKey, category, content: content.trim(), lat: coords.lat, lng: coords.lng,
      })
      setPosts((prev) => [newPost, ...prev])
      setContent("")
      setComposerOpen(false)
    } catch (err) {
      if (err?.code === 1 || /denied/i.test(err?.message || "")) {
        setPostError("Location access is needed to post — check your browser/device location permission.")
      } else if (err?.message?.includes("TOO_FAR")) {
        const miles = err.message.split(":").pop()
        setPostError(`You're about ${miles} miles from ${displayName(resortKey)} — you need to be on the mountain to post here.`)
      } else if (err?.message?.includes("NOT_AUTHORIZED")) {
        setPostError("This board is private.")
      } else {
        setPostError("Couldn't post right now. Try again in a bit.")
      }
    } finally {
      setPosting(false)
    }
  }

  async function handleReport(postId) {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, _reported: true } : p)))
    try {
      await reportBoardPost(postId)
    } catch {
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, _reported: false } : p)))
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {!lockedResortKey && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          {Object.keys(RESORT_NAMES).map((key) => (
            <button
              key={key}
              onClick={() => setSelectedResortKey(key)}
              style={{
                flexShrink: 0, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800,
                border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer",
                background: resortKey === key ? "linear-gradient(135deg,#0284c7,#38bdf8)" : "rgba(255,255,255,0.06)",
                color: "white",
              }}
            >
              {RESORT_EMOJI[key]} {RESORT_NAMES[key]}
            </button>
          ))}
          {currentUserEmail === OWNER_EMAIL && (
            <button
              key={KRAMES_BUTTE_KEY}
              onClick={() => setSelectedResortKey(KRAMES_BUTTE_KEY)}
              style={{
                flexShrink: 0, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 800,
                border: "1px dashed rgba(163,230,53,0.5)", cursor: "pointer",
                background: resortKey === KRAMES_BUTTE_KEY ? "linear-gradient(135deg,#65a30d,#a3e635)" : "rgba(163,230,53,0.08)",
                color: "white",
              }}
            >
              🧪 Krames Butte (Dev)
            </button>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        {["all", ...CATEGORIES.map((c) => c.key)].map((key) => {
          const cat = CATEGORIES.find((c) => c.key === key)
          return (
            <button
              key={key}
              onClick={() => setCategoryFilter(key)}
              style={{
                padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer",
                background: categoryFilter === key ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.04)",
                color: "white",
              }}
            >
              {key === "all" ? "All" : `${cat.emoji} ${cat.label}`}
            </button>
          )
        })}
      </div>

      {!composerOpen ? (
        <button
          onClick={() => setComposerOpen(true)}
          style={{ padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(56,189,248,0.4)", background: "rgba(56,189,248,0.1)", color: "#38bdf8", fontWeight: 800, cursor: "pointer" }}
        >
          📍 Post to {displayName(resortKey)}
        </button>
      ) : (
        <div style={{ display: "grid", gap: 8, padding: 14, borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                style={{
                  padding: "5px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: category === c.key ? "rgba(56,189,248,0.3)" : "rgba(255,255,255,0.05)",
                  color: "white",
                }}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, 280))}
            placeholder="What's happening on the mountain?"
            rows={3}
            style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 10, color: "white", fontSize: 13, resize: "none" }}
          />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right" }}>{content.length}/280</div>
          {postError && <div style={{ fontSize: 12, color: "#f87171" }}>{postError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setComposerOpen(false); setPostError(null) }} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>
              Cancel
            </button>
            <button
              onClick={handleSubmitPost}
              disabled={posting || !content.trim()}
              style={{ flex: 2, padding: "10px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#0284c7,#38bdf8)", color: "white", fontWeight: 800, cursor: posting ? "wait" : "pointer", opacity: posting || !content.trim() ? 0.6 : 1 }}
            >
              {posting ? "Checking location…" : "Post"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 20, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Loading…</div>
      ) : loadError ? (
        <div style={{ padding: 20, fontSize: 13, color: "#f87171" }}>
          Couldn't load the board. Try again in a bit.
        </div>
      ) : !visiblePosts.length ? (
        <div style={{ padding: 20, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
          No posts yet at {displayName(resortKey)}. Be the first.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {visiblePosts.map((post) => {
            const cat = CATEGORIES.find((c) => c.key === post.category)
            const author = post.profiles?.full_name || post.profiles?.username || "Someone"
            return (
              <div key={post.id} style={{ padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8" }}>{cat?.emoji} {cat?.label || post.category}</span>
                  <button onClick={() => handleReport(post.id)} disabled={post._reported} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 11, cursor: "pointer" }}>
                    {post._reported ? "Reported" : "🚩 Report"}
                  </button>
                </div>
                <div style={{ fontSize: 14, color: "white", marginBottom: 6 }}>{post.content}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{author} · {timeAgo(post.created_at)}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
