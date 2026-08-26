import { useEffect, useRef, useState } from "react"
import { supabase } from "../lib/supabase"
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  acceptCrewInvite,
  declineCrewInvite,
} from "../lib/socialApi"
import { timeAgo } from "../lib/format"

// TYPE_META.color feeds `${meta.color}1a`/`${meta.color}33` hex-alpha-suffix template
// literals below (notification-icon badge tinting), which requires literal hex — a
// var(--token) reference would produce invalid CSS. Same documented exception pattern as
// SKILL_OPTIONS (see ProfileSetup.jsx/UserProfileModal.jsx) — do not tokenize.
const TYPE_META = {
  invite:        { icon: "✉️", color: "#60a5fa" },
  rsvp:          { icon: "✓",  color: "#22c55e" },
  host_update:   { icon: "📢", color: "#fbbf24" },
  chat:          { icon: "💬", color: "#a78bfa" },
  friend_request:{ icon: "🤝", color: "#fb923c" },
  trip_update:   { icon: "🎿", color: "#67e8f9" },
  crew_invite:   { icon: "🤙", color: "#2563eb" },
  // Migration 043. Distinct icons on purpose: at a glance you should be able to tell
  // "someone wants in" from "you're in" without reading the sentence.
  trip_request:          { icon: "🙋", color: "#38bdf8" },
  trip_request_approved: { icon: "🎉", color: "#22c55e" },
  trip_request_declined: { icon: "—",  color: "#94a3b8" },
  trip_request_vote:     { icon: "👍", color: "#a3e635" },
  party_request:         { icon: "🙋", color: "#f472b6" },
  party_joined:          { icon: "🤝", color: "#22c55e" },
}

function getNotifCrewId(notif) {
  if (notif.crew_id) return notif.crew_id
  try { return JSON.parse(notif.body || "{}").crewId || null } catch { return null }
}

export function useNotificationCount(currentUser) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!currentUser) { setCount(0); return }
    let cancelled = false
    getNotifications().then((data) => { if (!cancelled) setCount(data.filter((n) => !n.read).length) }).catch(() => {})
    const channel = supabase
      .channel("notifications-count")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${currentUser.id}` },
        () => getNotifications().then((data) => { if (!cancelled) setCount(data.filter((n) => !n.read).length) }).catch(() => {})
      )
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [currentUser])
  return count
}

// Non-dropUp popup width/margin, used both for inline style and for clamping the
// fixed-position anchor calculation below (keep in sync with the width/maxWidth used
// in the panel's style block).
const POPUP_WIDTH = 340
const POPUP_MARGIN = 16

export default function NotificationBell({ currentUser, onOpenTrip, onTabChange, onOpenPlan, dropUp = false, variant = "icon" }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const panelRef = useRef(null)
  const buttonRef = useRef(null)
  // Bounding rect of the bell button, captured when the panel opens. The panel is
  // rendered with position:fixed (see below) so it can escape MessagingCenter's
  // overflow:hidden ancestor (that overflow exists to clip the rounded-corner chat
  // container, not this popup) — fixed positioning isn't relative to the button, so
  // we anchor it manually from this rect instead.
  const [anchorRect, setAnchorRect] = useState(null)

  const unread = notifications.filter((n) => !n.read).length

  async function load() {
    try {
      const data = await getNotifications()
      setNotifications(data)
    } catch (e) {
      console.warn("Notifications load failed:", e)
    }
  }

  useEffect(() => {
    if (!currentUser) return
    load()

    // Realtime: watch for new notifications for this user
    const channel = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${currentUser.id}` },
        () => load()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [currentUser])

  // Close panel on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  async function handleOpen() {
    if (!open && buttonRef.current) {
      setAnchorRect(buttonRef.current.getBoundingClientRect())
    }
    setOpen((v) => !v)
  }

  // Keep the anchored popup aligned to the button if the viewport is resized or
  // scrolled (including nested scrolling containers, via capture) while open.
  useEffect(() => {
    if (!open || dropUp) return
    function updateAnchor() {
      if (buttonRef.current) setAnchorRect(buttonRef.current.getBoundingClientRect())
    }
    window.addEventListener("resize", updateAnchor)
    window.addEventListener("scroll", updateAnchor, { capture: true, passive: true })
    return () => {
      window.removeEventListener("resize", updateAnchor)
      window.removeEventListener("scroll", updateAnchor, { capture: true, passive: true })
    }
  }, [open, dropUp])

  async function handleMarkAll() {
    await markAllNotificationsRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  async function handleClickNotif(notif) {
    if (notif.type === "crew_invite") return // handled by accept/decline buttons
    if (!notif.read) {
      await markNotificationRead(notif.id)
      setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, read: true } : n))
    }
    // Route on target_type (migration 043), falling back to the old trip_id/type rules so
    // notifications created before this still go somewhere.
    const targetType = notif.target_type || (notif.trip_id ? "trip" : null)
    const targetId = notif.target_id || notif.trip_id || null

    if (targetType === "trip" && targetId && onOpenTrip) {
      onOpenTrip(targetId)
    } else if (targetType === "plan" && onOpenPlan) {
      // A ski-plan day, not a trip — opens the Plans calendar on that date, where the
      // approve/decline strip for that day lives.
      onOpenPlan(targetId)
    } else if (targetType === "messages" && onTabChange) {
      // Where the host's note is. Used by "the trip is full" — see notifyRequestDecision.
      onTabChange("friends")
    } else if (notif.type === "friend_request" && onTabChange) {
      onTabChange("friends")
    } else if (onTabChange) {
      // Anything without a specific destination still lands somewhere sensible rather than
      // doing nothing, which reads as a broken tap.
      onTabChange("friends")
    }
    setOpen(false)
  }

  async function handleCrewAccept(e, notif) {
    e.stopPropagation()
    const crewId = getNotifCrewId(notif)
    if (!crewId) return
    try {
      await acceptCrewInvite(crewId)
      await markNotificationRead(notif.id)
      setNotifications((prev) => prev.filter((n) => n.id !== notif.id))
      if (onTabChange) onTabChange("friends")
      setOpen(false)
    } catch (err) {
      console.warn("Accept crew invite failed:", err)
    }
  }

  async function handleCrewDecline(e, notif) {
    e.stopPropagation()
    const crewId = getNotifCrewId(notif)
    if (!crewId) return
    try {
      await declineCrewInvite(crewId)
      await deleteNotification(notif.id)
      setNotifications((prev) => prev.filter((n) => n.id !== notif.id))
    } catch (err) {
      console.warn("Decline crew invite failed:", err)
    }
  }

  async function handleDelete(e, id) {
    e.stopPropagation()
    await deleteNotification(id)
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }

  if (!currentUser) return null

  const isTab = variant === "tab"

  // Anchor the fixed-position (non-dropUp) popup under the button, clamped so it
  // never extends past the viewport's left or right edge (with POPUP_MARGIN of
  // breathing room) regardless of where the button sits.
  let popupLeft = POPUP_MARGIN
  if (anchorRect) {
    const maxLeft = Math.max(POPUP_MARGIN, window.innerWidth - POPUP_MARGIN - POPUP_WIDTH)
    popupLeft = Math.min(Math.max(anchorRect.right - POPUP_WIDTH, POPUP_MARGIN), maxLeft)
  }

  return (
    <div ref={panelRef} style={{ position: "relative", ...(isTab ? { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" } : {}) }}>
      {/* Bell button — icon variant (round) or tab variant (column) */}
      <button
        ref={buttonRef}
        onClick={handleOpen}
        style={isTab ? {
          flex: 1,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px 2px",
          color: unread > 0 ? "var(--color-accent-soft)" : "rgba(255,255,255,0.42)",
          transition: "color 0.15s ease",
          minWidth: 0,
          position: "relative",
        } : {
          width: 46,
          height: 46,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.12)",
          background: open ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)",
          color: "white",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          padding: 0,
          flexShrink: 0,
          position: "relative",
          transition: "background 0.15s",
        }}
        title="Notifications"
      >
        {isTab ? (
          <>
            <span style={{ fontSize: 22, lineHeight: 1, position: "relative", filter: unread > 0 ? "drop-shadow(0 0 6px rgba(96,165,250,0.6))" : "none", transition: "filter 0.15s ease" }}>
              🔔
              {unread > 0 && (
                <span style={{
                  position: "absolute", top: -4, right: -6,
                  minWidth: 16, height: 16, borderRadius: 999,
                  background: "var(--gradient-danger)",
                  color: "white", fontSize: 9, fontWeight: 900,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "0 3px", border: "1.5px solid rgba(8,17,30,1)", lineHeight: 1,
                }}>
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </span>
            <span style={{ fontSize: 10, fontWeight: unread > 0 ? 800 : 500, letterSpacing: 0.2, lineHeight: 1 }}>
              Alerts
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 18, lineHeight: 1 }}>🔔</span>
            {unread > 0 && (
              <span style={{
                position: "absolute", top: -2, right: -2,
                minWidth: 18, height: 18, borderRadius: 999,
                background: "var(--gradient-danger)",
                color: "white", fontSize: 11, fontWeight: 900,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 4px", border: "2px solid rgba(2,6,23,1)", lineHeight: 1,
              }}>
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </>
        )}
      </button>

      {/* Dropdown / dropup panel */}
      {open && (
        <div
          style={dropUp ? {
            position: "fixed",
            bottom: "calc(68px + env(safe-area-inset-bottom, 0px))",
            left: 16,
            right: 16,
            maxWidth: 480,
            margin: "0 auto",
            maxHeight: "60vh",
            background: "rgba(10,14,30,0.98)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 20,
            boxShadow: "0 -12px 48px rgba(0,0,0,0.5)",
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          } : {
            // Fixed (not absolute) so the popup escapes MessagingCenter's
            // overflow:hidden ancestor instead of being clipped by it; position is
            // computed from the button's rect (anchorRect/popupLeft above) since
            // fixed positioning is relative to the viewport, not the button.
            position: "fixed",
            top: anchorRect ? anchorRect.bottom + 10 : 54,
            left: popupLeft,
            width: POPUP_WIDTH,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: 480,
            background: "rgba(10,14,30,0.98)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 20,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px 10px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: "white" }}>Notifications</div>
            {unread > 0 && (
              <button
                onClick={handleMarkAll}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-accent-soft)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderRadius: 8,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: "32px 20px",
                textAlign: "center",
                color: "rgba(255,255,255,0.35)",
                fontSize: 14,
              }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🔔</div>
                You're all caught up!
              </div>
            ) : notifications.map((notif) => {
              const meta = TYPE_META[notif.type] || { icon: "•", color: "#94a3b8" }
              return (
                <div
                  key={notif.id}
                  onClick={() => handleClickNotif(notif)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "12px 16px",
                    cursor: (notif.trip_id || notif.type === "friend_request") ? "pointer" : "default",

                    background: notif.read ? "transparent" : "rgba(96,165,250,0.06)",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    transition: "background 0.15s",
                    position: "relative",
                  }}
                  className="notif-item"
                >
                  {/* Unread dot */}
                  {!notif.read && (
                    <div style={{
                      position: "absolute",
                      left: 6,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: "var(--color-accent-soft)",
                    }} />
                  )}

                  {/* Type icon */}
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: `${meta.color}1a`,
                    border: `1px solid ${meta.color}33`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    flexShrink: 0,
                  }}>
                    {meta.icon}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: notif.read ? 500 : 700,
                      color: notif.read ? "rgba(255,255,255,0.75)" : "white",
                      lineHeight: 1.4,
                    }}>
                      {notif.title}
                    </div>
                    {notif.body && (() => {
                      let displayBody = notif.body
                      try {
                        const parsed = JSON.parse(notif.body)
                        displayBody = parsed.text || displayBody
                      } catch {}
                      return (
                      <div style={{
                        fontSize: 12,
                        color: "rgba(255,255,255,0.45)",
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {displayBody}
                      </div>
                      )
                    })()}
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>
                      {timeAgo(notif.created_at)}
                    </div>
                    {notif.type === "crew_invite" && getNotifCrewId(notif) && (
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <button
                          onClick={(e) => handleCrewAccept(e, notif)}
                          style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", background: "var(--gradient-cta)", color: "white", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                        >
                          Accept
                        </button>
                        <button
                          onClick={(e) => handleCrewDecline(e, notif)}
                          style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Delete (hidden for crew invites — use accept/decline instead) */}
                  <button
                    onClick={(e) => handleDelete(e, notif.id)}
                    style={{
                      display: notif.type === "crew_invite" ? "none" : undefined,
                      background: "none",
                      border: "none",
                      color: "rgba(255,255,255,0.25)",
                      cursor: "pointer",
                      fontSize: 16,
                      padding: "0 2px",
                      lineHeight: 1,
                      flexShrink: 0,
                      alignSelf: "center",
                    }}
                    className="notif-delete"
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
