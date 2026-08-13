import { useEffect, useMemo, useState } from "react"
import {
  getSkiBuddyPosts,
  getSkiBuddyResponses,
  respondToSkiBuddyPost,
  respondToSkiBuddyResponse,
  updateSkiBuddyPostStatus,
  reportContent,
  syncVerificationFromAuth,
  getCurrentUser,
} from "../lib/socialApi"
import { RIDING_STYLES, PASS_TYPES, CARPOOL_STATUSES } from "../lib/skiBuddyOptions"
import { RESORT_NAMES, RESORT_EMOJI } from "../lib/resorts"
import { timeAgo } from "../lib/format"
import AccentCard from "./ui/AccentCard"
import VerificationUpgradeModal from "./VerificationUpgradeModal"
import PostSkiBuddyForm from "./PostSkiBuddyForm"

function passLabel(key) {
  return PASS_TYPES.find((p) => p.key === key)?.label || key
}

function formatDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}

// Local, unexported — tightly coupled to how each post renders in the list
// (expand-in-place), not reused elsewhere. See Task 4's design note.
function ResponseThread({ post, currentUserId, onStatusChange }) {
  const [responses, setResponses] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getSkiBuddyResponses(post.id)
      .then((rows) => { if (!cancelled) setResponses(rows) })
      .catch(() => { if (!cancelled) setResponses([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [post.id])

  async function handleDecision(responseId, status) {
    setResponses((prev) => prev.map((r) => (r.id === responseId ? { ...r, status } : r)))
    try {
      await respondToSkiBuddyResponse(responseId, status)
      if (status === "accepted") onStatusChange?.(post.id, "filled")
    } catch {
      setResponses((prev) => prev.map((r) => (r.id === responseId ? { ...r, status: "pending" } : r)))
    }
  }

  if (loading) return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "8px 0" }}>Loading responses…</div>
  if (!responses?.length) return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "8px 0" }}>No responses yet.</div>

  return (
    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
      {responses.map((r) => {
        const name = r.profiles?.full_name || r.profiles?.username || "Someone"
        const isOwner = post.user_id === currentUserId
        return (
          <div key={r.id} style={{ padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.04)", fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "white" }}>{name}</span>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>{timeAgo(r.created_at)}</span>
            </div>
            {r.message && <div style={{ color: "rgba(255,255,255,0.7)", marginTop: 3 }}>{r.message}</div>}
            {isOwner && r.status === "pending" && (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => handleDecision(r.id, "accepted")} style={{ padding: "4px 10px", borderRadius: 8, border: "none", background: "var(--color-success-strong)", color: "white", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Accept</button>
                <button onClick={() => handleDecision(r.id, "declined")} style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.6)", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Decline</button>
              </div>
            )}
            {r.status !== "pending" && (
              <div style={{ marginTop: 4, fontWeight: 700, color: r.status === "accepted" ? "var(--color-success-strong)" : "rgba(255,255,255,0.4)" }}>
                {r.status === "accepted" ? "✅ Accepted" : "Declined"}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function SkiBuddyBoard() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [currentUserId, setCurrentUserId] = useState(null)

  const [passTypeFilter, setPassTypeFilter] = useState("all")
  const [resortFilter, setResortFilter] = useState("all")
  const [carpoolFilter, setCarpoolFilter] = useState("all")
  const [ridingStyleFilter, setRidingStyleFilter] = useState("all")

  const [showForm, setShowForm] = useState(false)
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [expandedPostId, setExpandedPostId] = useState(null)

  const [respondingPostId, setRespondingPostId] = useState(null)
  const [responseMessage, setResponseMessage] = useState("")
  const [responseError, setResponseError] = useState(null)
  const [responding, setResponding] = useState(false)

  const [reportingId, setReportingId] = useState(null)
  const [reportReason, setReportReason] = useState("")

  useEffect(() => {
    getCurrentUser().then((u) => setCurrentUserId(u.id)).catch(() => setCurrentUserId(null))
  }, [])

  function loadPosts() {
    setLoading(true)
    setLoadError(null)
    getSkiBuddyPosts({
      passType: passTypeFilter === "all" ? null : passTypeFilter,
      resortKey: resortFilter === "all" ? null : resortFilter,
      carpoolStatus: carpoolFilter === "all" ? null : carpoolFilter,
      ridingStyle: ridingStyleFilter === "all" ? null : ridingStyleFilter,
    })
      .then(setPosts)
      .catch((err) => { setPosts([]); setLoadError(err) })
      .finally(() => setLoading(false))
  }

  useEffect(loadPosts, [passTypeFilter, resortFilter, carpoolFilter, ridingStyleFilter])

  async function requireTier1(action) {
    try {
      const { tier } = await syncVerificationFromAuth()
      if (tier >= 1) { action(); return }
    } catch {
      // fall through to the modal — if we can't confirm tier, don't assume it
    }
    setShowVerifyModal(true)
  }

  function handleNewPostClick() {
    requireTier1(() => setShowForm(true))
  }

  function handleRespondClick(postId) {
    requireTier1(() => { setRespondingPostId(postId); setResponseMessage(""); setResponseError(null) })
  }

  async function handleSubmitResponse(postId) {
    setResponding(true)
    setResponseError(null)
    try {
      await respondToSkiBuddyPost(postId, responseMessage.trim())
      setRespondingPostId(null)
      setExpandedPostId(postId)
    } catch (err) {
      if (err?.message?.includes("CANNOT_RESPOND_TO_OWN_POST")) {
        setResponseError("You can't respond to your own post.")
      } else if (err?.message?.includes("POST_NOT_OPEN")) {
        setResponseError("This post is no longer open.")
      } else {
        setResponseError("Couldn't send your response. Try again in a bit.")
      }
    } finally {
      setResponding(false)
    }
  }

  function handleStatusChange(postId, status) {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status } : p)))
    updateSkiBuddyPostStatus(postId, status).catch(() => loadPosts())
  }

  async function handleReportSubmit(targetId) {
    if (!reportReason.trim()) return
    try {
      await reportContent("post", targetId, reportReason.trim())
      setReportingId(null)
      setReportReason("")
    } catch {
      // leave the report UI open so the user can retry
    }
  }

  const visiblePosts = useMemo(() => posts, [posts])

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {!showForm ? (
        <button
          onClick={handleNewPostClick}
          style={{ padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(56,189,248,0.4)", background: "rgba(56,189,248,0.1)", color: "var(--color-accent)", fontWeight: 800, cursor: "pointer" }}
        >
          🎿 Post a Listing
        </button>
      ) : (
        <PostSkiBuddyForm
          onClose={() => setShowForm(false)}
          onCreated={(newPost) => { setPosts((prev) => [newPost, ...prev]); setShowForm(false) }}
        />
      )}

      {showVerifyModal && (
        <VerificationUpgradeModal
          onClose={() => setShowVerifyModal(false)}
          onVerified={() => setShowVerifyModal(false)}
        />
      )}

      {/* Filters */}
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["all", ...PASS_TYPES.map((p) => p.key)].map((key) => (
            <button key={key} onClick={() => setPassTypeFilter(key)} style={{
              padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.1)",
              background: passTypeFilter === key ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.04)", color: "white",
            }}>
              {key === "all" ? "All Passes" : passLabel(key)}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["all", ...CARPOOL_STATUSES.map((c) => c.key)].map((key) => {
            const c = CARPOOL_STATUSES.find((c) => c.key === key)
            return (
              <button key={key} onClick={() => setCarpoolFilter(key)} style={{
                padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: "1px solid rgba(255,255,255,0.1)",
                background: carpoolFilter === key ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.04)", color: "white",
              }}>
                {key === "all" ? "Any Carpool" : c.label}
              </button>
            )
          })}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["all", ...RIDING_STYLES.map((s) => s.key)].map((key) => {
            const s = RIDING_STYLES.find((s) => s.key === key)
            return (
              <button key={key} onClick={() => setRidingStyleFilter(key)} style={{
                padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: "1px solid rgba(255,255,255,0.1)",
                background: ridingStyleFilter === key ? "rgba(56,189,248,0.25)" : "rgba(255,255,255,0.04)", color: "white",
              }}>
                {key === "all" ? "Any Style" : `${s.emoji} ${s.label}`}
              </button>
            )
          })}
        </div>
        <select
          value={resortFilter}
          onChange={(e) => setResortFilter(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "white", fontSize: 13, colorScheme: "dark" }}
        >
          <option value="all">All Resorts</option>
          {Object.keys(RESORT_NAMES).map((key) => (
            <option key={key} value={key}>{RESORT_EMOJI[key]} {RESORT_NAMES[key]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 20, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Loading…</div>
      ) : loadError ? (
        <div style={{ padding: 20, fontSize: 13, color: "var(--color-danger)" }}>Couldn't load the board. Try again in a bit.</div>
      ) : !visiblePosts.length ? (
        <div style={{ padding: 20, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>No listings match your filters yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {visiblePosts.map((post) => {
            const author = post.profiles?.full_name || post.profiles?.username || "Someone"
            const isOwner = post.user_id === currentUserId
            const styles = RIDING_STYLES.filter((s) => post.riding_style?.includes(s.key))
            return (
              <AccentCard key={post.id} accentColor="var(--color-accent)">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{RESORT_EMOJI[post.resort_key]} {RESORT_NAMES[post.resort_key] || post.resort_key}</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginLeft: 8 }}>{formatDate(post.ski_date)}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--color-accent)" }}>{passLabel(post.pass_type)}</span>
                </div>

                {post.is_held_for_review && isOwner && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-danger)", marginBottom: 6 }}>
                    ⏳ Under review — only you can see this post right now.
                  </div>
                )}

                {post.description && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 6 }}>{post.description}</div>}

                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                  {styles.map((s) => (
                    <span key={s.key} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
                      {s.emoji} {s.label}
                    </span>
                  ))}
                  {post.carpool_status !== "none" && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(56,189,248,0.15)", color: "var(--color-accent)" }}>
                      {CARPOOL_STATUSES.find((c) => c.key === post.carpool_status)?.label}
                      {post.carpool_status === "offering" && post.carpool_seats ? ` (${post.carpool_seats})` : ""}
                    </span>
                  )}
                  {post.status === "filled" && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(34,197,94,0.15)", color: "var(--color-success-strong)" }}>Filled</span>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{author} · {timeAgo(post.created_at)}</span>
                  <div style={{ display: "flex", gap: 10 }}>
                    {isOwner ? (
                      <button onClick={() => setExpandedPostId(expandedPostId === post.id ? null : post.id)} style={{ background: "none", border: "none", color: "var(--color-accent)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        {expandedPostId === post.id ? "Hide responses" : "View responses"}
                      </button>
                    ) : (
                      <button onClick={() => handleRespondClick(post.id)} disabled={post.status !== "open"} style={{ background: "none", border: "none", color: post.status === "open" ? "var(--color-accent)" : "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: 700, cursor: post.status === "open" ? "pointer" : "default" }}>
                        Respond
                      </button>
                    )}
                    {!isOwner && (
                      <button onClick={() => setReportingId(reportingId === post.id ? null : post.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 11, cursor: "pointer" }}>
                        🚩 Report
                      </button>
                    )}
                  </div>
                </div>

                {respondingPostId === post.id && (
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    <textarea
                      value={responseMessage}
                      onChange={(e) => setResponseMessage(e.target.value.slice(0, 300))}
                      placeholder="Say hi, mention your plan…"
                      rows={2}
                      style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 8, color: "white", fontSize: 12, resize: "none" }}
                    />
                    {responseError && <div style={{ fontSize: 11, color: "var(--color-danger)" }}>{responseError}</div>}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setRespondingPostId(null)} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12 }}>Cancel</button>
                      <button onClick={() => handleSubmitResponse(post.id)} disabled={responding} style={{ flex: 2, padding: 8, borderRadius: 8, border: "none", background: "var(--gradient-primary)", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 12, opacity: responding ? 0.6 : 1 }}>
                        {responding ? "Sending…" : "Send"}
                      </button>
                    </div>
                  </div>
                )}

                {reportingId === post.id && (
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    <textarea
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value.slice(0, 300))}
                      placeholder="Why are you reporting this?"
                      rows={2}
                      style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 8, color: "white", fontSize: 12, resize: "none" }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setReportingId(null); setReportReason("") }} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12 }}>Cancel</button>
                      <button onClick={() => handleReportSubmit(post.id)} disabled={!reportReason.trim()} style={{ flex: 2, padding: 8, borderRadius: 8, border: "none", background: "var(--color-danger)", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 12, opacity: reportReason.trim() ? 1 : 0.5 }}>
                        Submit Report
                      </button>
                    </div>
                  </div>
                )}

                {expandedPostId === post.id && isOwner && (
                  <ResponseThread post={post} currentUserId={currentUserId} onStatusChange={handleStatusChange} />
                )}
              </AccentCard>
            )
          })}
        </div>
      )}
    </div>
  )
}
