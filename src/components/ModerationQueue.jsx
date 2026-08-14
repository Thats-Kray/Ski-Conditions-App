import { useEffect, useState } from "react"
import { getHeldPosts, releaseHeldPost } from "../lib/socialApi"
import { RESORT_NAMES } from "../lib/resorts"

// Owner-only admin surface (Sprint 32 / TASK 15.1). Lists ski_buddy_posts
// currently held for review (is_held_for_review = true) and lets an admin
// release them one at a time. The real security boundary is server-side —
// get_held_posts()/release_held_post() both raise NOT_ADMIN for non-admins —
// this component assumes its caller (MountainBoard) already gated rendering
// on getMyAdminStatus(), not just the OWNER_EMAIL render hint.
export default function ModerationQueue() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [releasingId, setReleasingId] = useState(null)
  const [releaseError, setReleaseError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    getHeldPosts()
      .then((rows) => { if (!cancelled) setPosts(rows) })
      .catch((err) => { if (!cancelled) { setPosts([]); setLoadError(err) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function handleRelease(postId) {
    setReleasingId(postId)
    setReleaseError(null)
    const previous = posts
    setPosts((prev) => prev.filter((p) => p.id !== postId)) // optimistic removal
    try {
      await releaseHeldPost(postId)
    } catch (err) {
      setPosts(previous) // roll back — this post is still held
      if (err?.message?.includes("NOT_ADMIN")) {
        setReleaseError("You don't have permission to release posts.")
      } else if (err?.message?.includes("POST_NOT_FOUND")) {
        setReleaseError("That post no longer exists.")
      } else {
        setReleaseError("Couldn't release that post. Try again in a bit.")
      }
    } finally {
      setReleasingId(null)
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: 14,
        borderRadius: 16,
        border: "1px dashed rgba(163,230,53,0.5)",
        background: "rgba(163,230,53,0.05)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--color-dev-badge)" }}>
        🛡️ Held Posts (Admin)
      </div>

      {releaseError && (
        <div
          style={{
            fontSize: 12,
            color: "var(--color-danger)",
            background: "var(--color-danger-bg)",
            border: "1px solid rgba(248,113,113,0.25)",
            borderRadius: 10,
            padding: "8px 10px",
          }}
        >
          {releaseError}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: "var(--color-text-3)" }}>Loading…</div>
      ) : loadError ? (
        <div style={{ fontSize: 12, color: "var(--color-danger)" }}>
          Couldn't load held posts. Try again in a bit.
        </div>
      ) : !posts.length ? (
        <div style={{ fontSize: 12, color: "var(--color-text-3)" }}>
          No posts held for review.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {posts.map((post) => {
            const author = post.profiles?.full_name || post.profiles?.username || "Someone"
            const isReleasing = releasingId === post.id
            return (
              <div
                key={post.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                }}
              >
                <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-1)" }}>
                    {RESORT_NAMES[post.resort_key] || post.resort_key} · {post.ski_date}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-3)" }}>{author}</div>
                  {post.description && (
                    <div style={{ fontSize: 12, color: "var(--color-text-2)" }}>
                      {post.description}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleRelease(post.id)}
                  disabled={isReleasing}
                  style={{
                    flexShrink: 0,
                    padding: "6px 12px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 800,
                    border: "1px solid var(--color-success-strong)",
                    background: isReleasing ? "rgba(255,255,255,0.05)" : "var(--color-success-bg)",
                    color: "var(--color-success)",
                    cursor: isReleasing ? "wait" : "pointer",
                  }}
                >
                  {isReleasing ? "Releasing…" : "Release"}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
