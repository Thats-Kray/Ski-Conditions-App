import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "../lib/supabase"
import { useMobile } from "../lib/useMobile"
import { getCurrentUser, getAcceptedFriends, getDMConversations, markDMsRead, getMyCrews } from "../lib/socialApi"
import { isCrewUnread } from "../lib/crewUnread"
import CrewGroupChat from "./CrewGroupChat"
import FriendsPage from "./FriendsPage"
import ActivityFeed from "./ActivityFeed"
import SkiBuddyBoard from "./SkiBuddyBoard"
import LeaderboardPage from "./LeaderboardPage"
import DirectMessageView from "./DirectMessageView"

const TABS = [
  { key: "crews",       label: "Crews" },
  { key: "friends",     label: "Friends" },
  { key: "feed",        label: "Feed" },
  { key: "board",       label: "Board" },
  { key: "leaderboard", label: "Leaderboard" },
]

export default function MessagingCenter() {
  const isMobile = useMobile()
  const [crewSubTab, setCrewSubTab] = useState("crews")
  const [selectedDM, setSelectedDM] = useState(null)
  const [dmConversations, setDmConversations] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [friends, setFriends] = useState([])
  const [hasUnreadCrewMsg, setHasUnreadCrewMsg] = useState(false)
  const [crewChatOpen, setCrewChatOpen] = useState(false)
  const channelRef = useRef(null)
  const crewIdsRef = useRef([])

  const loadInbox = useCallback(async () => {
    try {
      const user = await getCurrentUser()
      setCurrentUser(user)
      const [friendList, dms] = await Promise.all([
        getAcceptedFriends(),
        getDMConversations().catch(() => []),
      ])
      setFriends(friendList || [])
      setDmConversations(dms || [])
    } catch (e) {
      console.warn("MessagingCenter load error:", e)
    }
  }, [])

  useEffect(() => { loadInbox() }, [loadInbox])

  useEffect(() => {
    if (!currentUser) return
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    channelRef.current = supabase
      .channel("msg-center-dms")
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "direct_messages",
      }, (payload) => {
        const msg = payload.new
        if (!msg) return
        const uid = currentUser?.id
        if (!uid) return
        const isFromMe = msg.sender_id === uid
        const partnerId = isFromMe ? msg.recipient_id : msg.sender_id
        setDmConversations((prev) => {
          const existing = prev.find((d) => d.partnerId === partnerId)
          if (!existing) { loadInbox(); return prev }
          return prev.map((d) =>
            d.partnerId === partnerId
              ? { ...d, lastMessage: msg, unread: !isFromMe && selectedDM?.partnerId !== partnerId }
              : d
          )
        })
      })
      .subscribe()

    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [currentUser, loadInbox, selectedDM?.partnerId])

  const checkCrewUnread = useCallback(async () => {
    try {
      const crews = await getMyCrews()
      const crewIds = crews.map((c) => c.id)
      crewIdsRef.current = crewIds
      if (crewIds.length === 0) { setHasUnreadCrewMsg(false); return }
      const { data: recentMsgs } = await supabase
        .from("crew_messages")
        .select("crew_id, created_at")
        .in("crew_id", crewIds)
        .order("created_at", { ascending: false })
        .limit(Math.min(crewIds.length * 6, 120))
      const lastMsgByCrewId = {}
      for (const msg of (recentMsgs || [])) {
        if (!lastMsgByCrewId[msg.crew_id]) lastMsgByCrewId[msg.crew_id] = msg
      }
      setHasUnreadCrewMsg(crewIds.some((id) => isCrewUnread(lastMsgByCrewId[id], id)))
    } catch (e) {
      console.warn("Crew unread check failed:", e)
    }
  }, [])

  useEffect(() => {
    if (!currentUser) return
    checkCrewUnread()

    const channel = supabase
      .channel("msg-center-crew-unread")
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "crew_messages",
      }, (payload) => {
        const crewId = payload.new?.crew_id
        if (crewId && crewIdsRef.current.includes(crewId)) setHasUnreadCrewMsg(true)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [currentUser, checkCrewUnread])

  useEffect(() => {
    if (!crewChatOpen) checkCrewUnread()
  }, [crewChatOpen, checkCrewUnread])

  function openDM(dm) {
    if (dm.partnerId) markDMsRead(dm.partnerId).catch(() => {})
    setDmConversations((prev) => prev.map((d) => d.partnerId === dm.partnerId ? { ...d, unread: false } : d))
    setSelectedDM(dm)
  }

  function handleMessageFriend(friend) {
    const existing = dmConversations.find((d) => d.partnerId === friend.id)
    openDM(existing || { partnerId: friend.id, partner: friend, lastMessage: null, unread: false })
  }

  const hasUnreadDM = dmConversations.some((d) => d.unread)

  if (selectedDM) {
    const containerHeight = isMobile ? "calc(100dvh - 88px)" : "calc(100dvh - 132px)"
    return (
      <div style={{
        height: containerHeight,
        background: "rgba(4,8,20,0.85)",
        borderRadius: isMobile ? 0 : 18,
        overflow: "hidden",
        border: isMobile ? "none" : "1px solid rgba(255,255,255,0.07)",
      }}>
        <DirectMessageView
          partner={selectedDM.partner}
          partnerId={selectedDM.partnerId}
          currentUser={currentUser}
          onBack={() => setSelectedDM(null)}
        />
      </div>
    )
  }

  return (
    <div style={{ padding: crewChatOpen ? 0 : "0 0 80px", color: "var(--color-text-1)" }}>
      {!crewChatOpen && (
        <>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5, color: "white", marginBottom: 14 }}>
            Crew
          </div>

          <div className="pd-x" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 16, scrollbarWidth: "none" }}>
            {TABS.map(({ key, label }) => {
              const active = crewSubTab === key
              const showDot = (key === "crews" && hasUnreadCrewMsg) || (key === "friends" && hasUnreadDM)
              return (
                <button
                  key={key}
                  onClick={() => setCrewSubTab(key)}
                  style={{
                    position: "relative", flexShrink: 0,
                    padding: "8px 16px", borderRadius: 999, fontSize: 13, fontWeight: 800, cursor: "pointer",
                    background: active ? "var(--color-accent)" : "rgba(255,255,255,0.05)",
                    color: active ? "var(--color-bg)" : "rgba(255,255,255,0.6)",
                    border: active ? "1px solid var(--color-accent)" : "1px solid rgba(255,255,255,0.1)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                  {showDot && (
                    <span style={{ position: "absolute", top: -2, right: -2, width: 9, height: 9, borderRadius: "50%", background: "var(--color-accent-strong)", border: "2px solid rgba(6,10,22,1)" }} />
                  )}
                </button>
              )
            })}
          </div>
          <style>{`.pd-x::-webkit-scrollbar { display: none; }`}</style>
        </>
      )}

      {crewSubTab === "crews" && (
        <CrewGroupChat friends={friends} onCrewChatOpenChange={setCrewChatOpen} />
      )}
      {crewSubTab === "friends" && (
        <FriendsPage onMessageFriend={handleMessageFriend} />
      )}
      {crewSubTab === "feed" && <ActivityFeed />}
      {crewSubTab === "board" && <SkiBuddyBoard />}
      {crewSubTab === "leaderboard" && <LeaderboardPage />}
    </div>
  )
}
