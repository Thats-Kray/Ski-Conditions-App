import { useEffect, useMemo, useState } from "react";
import {
  searchProfiles,
  sendFriendRequest,
  cancelOutgoingFriendRequest,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  respondToFriendRequest,
  getAcceptedFriends,
  getFriendsLeaderboard,
  createCrewInvite,
  getReceivedCrewInvites,
  getSentCrewInvites,
  respondToCrewInvite,
  getMySkiPlans,
} from "../lib/socialApi";

function getDisplayName(person) {
  return (
    person?.full_name ||
    [person?.first_name, person?.last_name].filter(Boolean).join(" ") ||
    person?.username ||
    "Unknown Skier"
  );
}

function Avatar({ profile, size = 44 }) {
  const displayName = getDisplayName(profile);
  const initial = displayName.charAt(0).toUpperCase();

  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={displayName}
        style={{
          width: size,
          height: size,
          borderRadius: "999px",
          objectFit: "cover",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "999px",
        background: "rgba(255,255,255,0.1)",
        border: "1px solid rgba(255,255,255,0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        color: "#fff",
      }}
    >
      {initial}
    </div>
  );
}


function formatPlanDate(dateString) {
  if (!dateString) return "Unknown date"

  const date = new Date(`${dateString}T12:00:00`)
  if (Number.isNaN(date.getTime())) return dateString

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function formatPlanEta(eta) {
  if (!eta) return "Time TBD"

  const date = new Date(eta)
  if (Number.isNaN(date.getTime())) return "Time TBD"

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

function isPastPlan(plan) {
  if (!plan?.ski_date) return false

  const today = new Date()
  const todayKey = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  )

  const planDate = new Date(`${plan.ski_date}T12:00:00`)

  if (Number.isNaN(planDate.getTime())) return false

  return planDate < todayKey
}

const RESORT_NAME_MAP = {
  arapahoebasin: "Arapahoe Basin",
  coppermountain: "Copper Mountain",
  winterpark: "Winter Park",
  vail: "Vail",
  beavercreek: "Beaver Creek",
  breckenridge: "Breckenridge",
  keystone: "Keystone",
  crestedbutte: "Crested Butte",
  telluride: "Telluride",
  steamboat: "Steamboat",
  eldora: "Eldora",
  aspen: "Aspen Snowmass",
}

function formatResortName(resortValue) {
  if (!resortValue) return "Unknown resort"

  // If it's already an object (rare but possible)
  if (typeof resortValue === "object") {
    return resortValue?.name || "Unknown resort"
  }

  const value = String(resortValue).trim()

  // If it's a JSON string (old bad data)
  if (value.startsWith("{") && value.endsWith("}")) {
    try {
      const parsed = JSON.parse(value)
      return parsed?.name || parsed?.resortKey || "Unknown resort"
    } catch {
      return value
    }
  }

  // Normalize key (remove spaces, lowercase)
  const normalized = value.toLowerCase().replace(/\s+/g, "")

  // If we have a clean mapping, use it
  if (RESORT_NAME_MAP[normalized]) {
    return RESORT_NAME_MAP[normalized]
  }

  // Fallback: make it look human
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase → words
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}




function SectionCard({ title, subtitle, children }) {
  return (
    <section
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 18,
        padding: 16,
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: "1.05rem", color: "#fff" }}>{title}</h2>
        {subtitle ? (
          <p
            style={{
              margin: "6px 0 0",
              fontSize: "0.92rem",
              color: "rgba(255,255,255,0.68)",
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>

      {children}
    </section>
  );
}

function EmptyState({ text }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        background: "rgba(255,255,255,0.04)",
        color: "rgba(255,255,255,0.66)",
        fontSize: "0.93rem",
      }}
    >
      {text}
    </div>
  );
}

function RowCard({ left, right }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: 12,
        borderRadius: 14,
        background: "rgba(255,255,255,0.04)",
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>{left}</div>
      <div>{right}</div>
    </div>
  );
}

const primaryButtonStyle = {
  border: "none",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#3b82f6",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  border: "none",
  borderRadius: 10,
  padding: "8px 12px",
  background: "rgba(255,255,255,0.12)",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: "0.9rem",
  color: "rgba(255,255,255,0.78)",
};

export default function FriendsPage() {
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [acceptedFriends, setAcceptedFriends] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [receivedInvites, setReceivedInvites] = useState([]);
  const [sentInvites, setSentInvites] = useState([]);
  const [skiPlans, setSkiPlans] = useState([]);
  const [showPastPlans, setShowPastPlans] = useState(false);

  const [loadingPage, setLoadingPage] = useState(true);
  const [searching, setSearching] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [inviteFriendId, setInviteFriendId] = useState(null);
  const [inviteForm, setInviteForm] = useState({
    resort_key: "",
    ski_date: "",
    departure_time: "06:00 AM",
    seats_available: 3,
    message: "",
  });

  async function loadPageData() {
    setLoadingPage(true);
    setErrorMessage("");

    try {
      const [
        incoming,
        outgoing,
        accepted,
        leaderboardData,
        receivedCrewInvites,
        sentCrewInvites,
        mySkiPlans,
      ] = await Promise.all([
        getIncomingFriendRequests(),
        getOutgoingFriendRequests(),
        getAcceptedFriends(),
        getFriendsLeaderboard(),
        getReceivedCrewInvites(),
        getSentCrewInvites(),
        getMySkiPlans(),
      ]);

      setIncomingRequests(incoming || []);
      setOutgoingRequests(outgoing || []);
      setAcceptedFriends(accepted || []);
      setLeaderboard(leaderboardData || []);
      setReceivedInvites(receivedCrewInvites || []);
      setSentInvites(sentCrewInvites || []);
      setSkiPlans(mySkiPlans || []);
    } catch (error) {
      console.error("Failed to load friends page:", error);
      setErrorMessage(error.message || "Failed to load friends page.");
    } finally {
      setLoadingPage(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  async function handleSearch(event) {
    event.preventDefault();
    setSearching(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const results = await searchProfiles(searchText.trim());
      setSearchResults(results || []);
    } catch (error) {
      console.error("Search failed:", error);
      setErrorMessage(error.message || "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function refreshSearchResultsIfNeeded() {
    if (!searchText.trim()) return;

    const refreshedResults = await searchProfiles(searchText.trim());
    setSearchResults(refreshedResults || []);
  }

  async function handleSendFriendRequest(profileId) {
    setWorkingId(profileId);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const result = await sendFriendRequest(profileId);

      await loadPageData();
      await refreshSearchResultsIfNeeded();

      if (result?.action === "created") {
        setSuccessMessage("Friend request sent.");
      } else if (result?.action === "revived") {
        setSuccessMessage("Friend request re-sent.");
      } else if (result?.action === "already_sent") {
        setSuccessMessage("You already sent this friend request.");
      } else if (result?.action === "incoming_pending") {
        setSuccessMessage("This skier already sent you a friend request. Check Incoming Requests.");
      } else if (result?.action === "already_friends") {
        setSuccessMessage("You’re already friends.");
      } else {
        setSuccessMessage("Friend request updated.");
      }
    } catch (error) {
      console.error("Failed to send friend request:", error);
      setErrorMessage(error.message || "Could not send friend request.");
    } finally {
      setWorkingId(null);
    }
  }

  async function handleRespondToRequest(requestId, status) {
    setWorkingId(requestId);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await respondToFriendRequest(requestId, status);
      await loadPageData();
      await refreshSearchResultsIfNeeded();
      setSuccessMessage(
        status === "accepted"
          ? "Friend request accepted."
          : "Friend request declined."
      );
    } catch (error) {
      console.error("Failed to respond to request:", error);
      setErrorMessage(error.message || "Could not update friend request.");
    } finally {
      setWorkingId(null);
    }
  }

  async function handleCancelOutgoingRequest(requestId) {
    setWorkingId(requestId);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await cancelOutgoingFriendRequest(requestId);
      await loadPageData();
      await refreshSearchResultsIfNeeded();
      setSuccessMessage("Friend request canceled.");
    } catch (error) {
      console.error("Failed to cancel outgoing request:", error);
      setErrorMessage(error.message || "Could not cancel friend request.");
    } finally {
      setWorkingId(null);
    }
  }

  function openInviteComposer(friendId) {
    setInviteFriendId(friendId);
    setInviteForm({
      resort_key: "",
      ski_date: "",
      departure_time: "06:00 AM",
      seats_available: 3,
      message: "",
    });
    setErrorMessage("");
    setSuccessMessage("");
  }

  function closeInviteComposer() {
    setInviteFriendId(null);
  }

  async function handleSendCrewInvite(friendId) {
    setWorkingId(friendId);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const result = await createCrewInvite(friendId, inviteForm);
      await loadPageData();
      setInviteFriendId(null);

      setSuccessMessage(
        result?.action === "updated"
          ? "Crew invite updated and re-sent."
          : "Crew invite sent."
      );
    } catch (error) {
      console.error("Failed to send crew invite:", error);
      setErrorMessage(error.message || "Could not send crew invite.");
    } finally {
      setWorkingId(null);
    }
  }

  async function handleRespondToCrewInvite(inviteId, status) {
    setWorkingId(inviteId);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await respondToCrewInvite(inviteId, status);
      await loadPageData();
      setSuccessMessage(
        status === "accepted"
          ? "Invite accepted. Your crew plan has been created."
          : "Invite declined."
      );
    } catch (error) {
      console.error("Failed to respond to crew invite:", error);
      setErrorMessage(error.message || "Could not update crew invite.");
    } finally {
      setWorkingId(null);
    }
  }

  const pendingOutgoingRecipientIds = useMemo(() => {
    return new Set(outgoingRequests.map((request) => request.recipient_id));
  }, [outgoingRequests]);

  const incomingRequesterIds = useMemo(() => {
    return new Set(incomingRequests.map((request) => request.requester_id));
  }, [incomingRequests]);

  const acceptedFriendIds = useMemo(() => {
    return new Set(acceptedFriends.map((friend) => friend.id));
  }, [acceptedFriends]);

  const leaderboardById = useMemo(() => {
    return new Map(leaderboard.map((friend) => [friend.id, friend]));
  }, [leaderboard]);

  const decoratedSearchResults = useMemo(() => {
    return searchResults.map((profile) => {
      const isPending = pendingOutgoingRecipientIds.has(profile.id);
      const hasIncomingRequest = incomingRequesterIds.has(profile.id);
      const isFriend = acceptedFriendIds.has(profile.id);
      const friendData = leaderboardById.get(profile.id);

      return {
        ...profile,
        isPending,
        hasIncomingRequest,
        isFriend,
        daysTogether: friendData?.daysTogether ?? 0,
      };
    });
  }, [
    searchResults,
    pendingOutgoingRecipientIds,
    incomingRequesterIds,
    acceptedFriendIds,
    leaderboardById,
  ]);

  const decoratedAcceptedFriends = useMemo(() => {
    return acceptedFriends.map((friend) => {
      const friendData = leaderboardById.get(friend.id);

      return {
        ...friend,
        daysTogether: friendData?.daysTogether ?? 0,
        daysOnMountain: friendData?.daysOnMountain ?? 0,
        topResort: friendData?.topResort ?? "—",
      };
    });
  }, [acceptedFriends, leaderboardById]);

  const upcomingPlans = useMemo(() => {
    return [...skiPlans]
      .filter((plan) => !isPastPlan(plan))
      .sort((a, b) => {
        const aTime = a.eta ? new Date(a.eta).getTime() : new Date(`${a.ski_date}T23:59:00`).getTime()
        const bTime = b.eta ? new Date(b.eta).getTime() : new Date(`${b.ski_date}T23:59:00`).getTime()
        return aTime - bTime
      })
  }, [skiPlans])

  const pastPlans = useMemo(() => {
    return [...skiPlans]
      .filter((plan) => isPastPlan(plan))
      .sort((a, b) => {
        const aTime = a.eta ? new Date(a.eta).getTime() : new Date(`${a.ski_date}T23:59:00`).getTime()
        const bTime = b.eta ? new Date(b.eta).getTime() : new Date(`${b.ski_date}T23:59:00`).getTime()
        return bTime - aTime
      })
  }, [skiPlans])



  return (
    <div style={{ padding: 20, color: "#fff", maxWidth: 1150, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: "1.7rem" }}>Friends</h1>
        <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.72)" }}>
          Build your ski network, manage requests, and send Partiful-style ski crew invites.
        </p>
      </div>

      {errorMessage ? (
        <div
          style={{
            marginBottom: 14,
            padding: "12px 14px",
            borderRadius: 12,
            background: "rgba(239,68,68,0.15)",
            border: "1px solid rgba(239,68,68,0.35)",
            color: "#fecaca",
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div
          style={{
            marginBottom: 14,
            padding: "12px 14px",
            borderRadius: 12,
            background: "rgba(34,197,94,0.15)",
            border: "1px solid rgba(34,197,94,0.35)",
            color: "#bbf7d0",
          }}
        >
          {successMessage}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 0.9fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 16 }}>
          <SectionCard
            title="Find Ski Friends"
            subtitle="Search by username or full name."
          >
            <form
              onSubmit={handleSearch}
              style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 14 }}
            >
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search skiers..."
                style={inputStyle}
              />
              <button style={primaryButtonStyle} type="submit" disabled={searching}>
                {searching ? "Searching..." : "Search"}
              </button>
            </form>

            <div style={{ display: "grid", gap: 10 }}>
              {!searching && searchResults.length === 0 ? (
                <EmptyState text="Search for friends to start building your ski network." />
              ) : null}

              {decoratedSearchResults.map((profile) => (
                <RowCard
                  key={profile.id}
                  left={
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <Avatar profile={profile} />
                      <div>
                        <div style={{ fontWeight: 700 }}>{getDisplayName(profile)}</div>
                        <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.72)" }}>
                          @{profile?.username || "no-username"}
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.58)" }}>
                          Favorite mountain: {profile?.favorite_mountain || "—"}
                        </div>
                        {profile.isFriend ? (
                          <div style={{ fontSize: "0.85rem", color: "#93c5fd", marginTop: 4 }}>
                            Friends · {profile.daysTogether} shared ski day{profile.daysTogether === 1 ? "" : "s"}
                          </div>
                        ) : null}
                        {profile.hasIncomingRequest ? (
                          <div style={{ fontSize: "0.85rem", color: "#fde68a", marginTop: 4 }}>
                            Sent you a request
                          </div>
                        ) : null}
                      </div>
                    </div>
                  }
                  right={
                    profile.isFriend ? (
                      <span style={{ color: "#86efac", fontWeight: 700 }}>Friends</span>
                    ) : profile.hasIncomingRequest ? (
                      <span style={{ color: "#fde68a", fontWeight: 700 }}>Incoming Request</span>
                    ) : profile.isPending ? (
                      <span style={{ color: "#fde68a", fontWeight: 700 }}>Pending</span>
                    ) : (
                      <button
                        style={primaryButtonStyle}
                        onClick={() => handleSendFriendRequest(profile.id)}
                        disabled={workingId === profile.id}
                      >
                        {workingId === profile.id ? "Sending..." : "Add Friend"}
                      </button>
                    )
                  }
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Your Friends"
            subtitle="Your real ski circle, plus quick invite access."
          >
            <div style={{ display: "grid", gap: 10 }}>
              {loadingPage ? <EmptyState text="Loading friends..." /> : null}

              {!loadingPage && decoratedAcceptedFriends.length === 0 ? (
                <EmptyState text="No accepted friends yet. Accept a request or send one to get this list going." />
              ) : null}

              {decoratedAcceptedFriends.map((friend) => (
                <div
                  key={friend.id}
                  style={{
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    padding: 14,
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <Avatar profile={friend} size={48} />
                      <div>
                        <div style={{ fontWeight: 800 }}>{getDisplayName(friend)}</div>
                        <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.72)" }}>
                          @{friend?.username || "no-username"}
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.58)" }}>
                          Favorite mountain: {friend?.favorite_mountain || "—"}
                        </div>
                      </div>
                    </div>

                    <button
                      style={primaryButtonStyle}
                      onClick={() => openInviteComposer(friend.id)}
                    >
                      Invite to Crew
                    </button>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        padding: 10,
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.58)" }}>
                        Shared Ski Days
                      </div>
                      <div style={{ fontWeight: 800, marginTop: 4 }}>{friend.daysTogether}</div>
                    </div>
                    <div
                      style={{
                        padding: 10,
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.58)" }}>
                        Their Ski Days
                      </div>
                      <div style={{ fontWeight: 800, marginTop: 4 }}>{friend.daysOnMountain}</div>
                    </div>
                    <div
                      style={{
                        padding: 10,
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.58)" }}>
                        Top Shared Resort
                      </div>
                      <div style={{ fontWeight: 800, marginTop: 4 }}>{friend.topResort}</div>
                    </div>
                  </div>

                  {inviteFriendId === friend.id ? (
                    <div
                      style={{
                        borderRadius: 16,
                        padding: 14,
                        background: "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(236,72,153,0.12))",
                        border: "1px solid rgba(255,255,255,0.12)",
                        display: "grid",
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, fontSize: "1rem" }}>
                          Invite {getDisplayName(friend)} to ski
                        </div>
                        <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.72)", marginTop: 4 }}>
                          Partiful vibes, but for carpool degenerates and powder days.
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={labelStyle}>Resort Key</label>
                          <input
                            style={inputStyle}
                            value={inviteForm.resort_key}
                            onChange={(event) =>
                              setInviteForm((current) => ({
                                ...current,
                                resort_key: event.target.value,
                              }))
                            }
                            placeholder="coppermountain"
                          />
                        </div>

                        <div>
                          <label style={labelStyle}>Ski Date</label>
                          <input
                            style={inputStyle}
                            type="date"
                            value={inviteForm.ski_date}
                            onChange={(event) =>
                              setInviteForm((current) => ({
                                ...current,
                                ski_date: event.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={labelStyle}>Departure Time</label>
                          <input
                            style={inputStyle}
                            value={inviteForm.departure_time}
                            onChange={(event) =>
                              setInviteForm((current) => ({
                                ...current,
                                departure_time: event.target.value,
                              }))
                            }
                            placeholder="6:00 AM"
                          />
                        </div>

                        <div>
                          <label style={labelStyle}>Extra Seats</label>
                          <input
                            style={inputStyle}
                            type="number"
                            min="0"
                            value={inviteForm.seats_available}
                            onChange={(event) =>
                              setInviteForm((current) => ({
                                ...current,
                                seats_available: event.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div>
                        <label style={labelStyle}>Invite Note</label>
                        <textarea
                          style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                          value={inviteForm.message}
                          onChange={(event) =>
                            setInviteForm((current) => ({
                              ...current,
                              message: event.target.value,
                            }))
                          }
                          placeholder="Kyle invites you to ski Copper on Saturday. Leaving at 6:00 AM, 3 extra seats."
                        />
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          style={primaryButtonStyle}
                          onClick={() => handleSendCrewInvite(friend.id)}
                          disabled={workingId === friend.id}
                        >
                          {workingId === friend.id ? "Sending Invite..." : "Send Invite"}
                        </button>
                        <button
                          style={secondaryButtonStyle}
                          onClick={closeInviteComposer}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Incoming Requests"
            subtitle="People who want to connect with you."
          >
            <div style={{ display: "grid", gap: 10 }}>
              {loadingPage ? <EmptyState text="Loading incoming requests..." /> : null}

              {!loadingPage && incomingRequests.length === 0 ? (
                <EmptyState text="No incoming requests right now." />
              ) : null}

              {incomingRequests.map((request) => {
                const profile = request.requester_profile;

                return (
                  <RowCard
                    key={request.id}
                    left={
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Avatar profile={profile} />
                        <div>
                          <div style={{ fontWeight: 700 }}>{getDisplayName(profile)}</div>
                          <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.72)" }}>
                            @{profile?.username || "no-username"}
                          </div>
                        </div>
                      </div>
                    }
                    right={
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          style={primaryButtonStyle}
                          onClick={() => handleRespondToRequest(request.id, "accepted")}
                          disabled={workingId === request.id}
                        >
                          Accept
                        </button>
                        <button
                          style={secondaryButtonStyle}
                          onClick={() => handleRespondToRequest(request.id, "declined")}
                          disabled={workingId === request.id}
                        >
                          Decline
                        </button>
                      </div>
                    }
                  />
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            title="Outgoing Requests"
            subtitle="Requests you’ve already sent."
          >
            <div style={{ display: "grid", gap: 10 }}>
              {loadingPage ? <EmptyState text="Loading outgoing requests..." /> : null}

              {!loadingPage && outgoingRequests.length === 0 ? (
                <EmptyState text="No outgoing requests right now." />
              ) : null}

              {outgoingRequests.map((request) => {
                const profile = request.recipient_profile;

                return (
                  <RowCard
                    key={request.id}
                    left={
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Avatar profile={profile} />
                        <div>
                          <div style={{ fontWeight: 700 }}>{getDisplayName(profile)}</div>
                          <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.72)" }}>
                            @{profile?.username || "no-username"}
                          </div>
                        </div>
                      </div>
                    }
                    right={
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "#fde68a", fontWeight: 700 }}>Pending</span>
                        <button
                          style={secondaryButtonStyle}
                          onClick={() => handleCancelOutgoingRequest(request.id)}
                          disabled={workingId === request.id}
                        >
                          {workingId === request.id ? "Canceling..." : "Cancel"}
                        </button>
                      </div>
                    }
                  />
                );
              })}
            </div>
          </SectionCard>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
                    <SectionCard
            title="Upcoming Ski Plans"
            subtitle="Your upcoming ski crew plans, plus a quick toggle for past trips."
          >
            <div style={{ display: "grid", gap: 10 }}>
              {loadingPage ? <EmptyState text="Loading ski plans..." /> : null}

              {!loadingPage && upcomingPlans.length === 0 ? (
                <EmptyState text="No upcoming ski plans yet. Accept a crew invite or create a plan to see it here." />
              ) : null}

              {upcomingPlans.map((plan) => (
                <div
                  key={plan.id}
                  style={{
                    borderRadius: 16,
                    padding: 14,
                    background: "linear-gradient(135deg, rgba(59,130,246,0.14), rgba(34,197,94,0.12))",
                    border: "1px solid rgba(255,255,255,0.1)",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                   <div style={{ fontWeight: 800 }}>{formatResortName(plan.resort_key)}</div> 
                    <div style={{ fontSize: "0.9rem", color: "#bfdbfe", fontWeight: 700 }}>
                      {formatPlanDate(plan.ski_date)}
                    </div>
                  </div>

                  <div style={{ fontSize: "0.92rem", color: "rgba(255,255,255,0.82)" }}>
                    Departing: <strong>{formatPlanEta(plan.eta)}</strong>
                  </div>

                  <div style={{ fontSize: "0.86rem", color: "rgba(255,255,255,0.64)" }}>
                    Visibility: {plan.visibility || "public"} · Status: {plan.status || "planned"}
                  </div>

                  {plan.note ? (
                    <div
                      style={{
                        borderRadius: 12,
                        padding: 10,
                        background: "rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.82)",
                        fontSize: "0.92rem",
                        lineHeight: 1.45,
                      }}
                    >
                      {plan.note}
                    </div>
                  ) : null}
                </div>
              ))}

              <div style={{ marginTop: 4 }}>
                <button
                  style={secondaryButtonStyle}
                  onClick={() => setShowPastPlans((current) => !current)}
                >
                  {showPastPlans ? "Hide Previous Ski Plans" : "See Previous Ski Plans"}
                </button>
              </div>

              {showPastPlans ? (
                <div style={{ display: "grid", gap: 10, marginTop: 6 }}>
                  {pastPlans.length === 0 ? (
                    <EmptyState text="No previous ski plans found." />
                  ) : (
                    pastPlans.map((plan) => (
                      <div
                        key={plan.id}
                        style={{
                          borderRadius: 14,
                          padding: 12,
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          display: "grid",
                          gap: 6,
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{formatResortName(plan.resort_key)}</div>
                        <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.72)" }}>
                          {formatPlanDate(plan.ski_date)} · {formatPlanEta(plan.eta)}
                        </div>
                        {plan.note ? (
                          <div style={{ fontSize: "0.88rem", color: "rgba(255,255,255,0.58)" }}>
                            {plan.note}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </SectionCard>
          <SectionCard
            title="Crew Invites"
            subtitle="Your Partiful-style ski invitations and RSVPs."
          >
            <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.72)", fontWeight: 700 }}>
                Received
              </div>

              {!loadingPage && receivedInvites.length === 0 ? (
                <EmptyState text="No crew invites waiting on your RSVP." />
              ) : null}

              {receivedInvites.map((invite) => {
                const profile = invite.inviter_profile;

                return (
                  <div
                    key={invite.id}
                    style={{
                      borderRadius: 16,
                      padding: 14,
                      background: "linear-gradient(135deg, rgba(236,72,153,0.14), rgba(59,130,246,0.14))",
                      border: "1px solid rgba(255,255,255,0.1)",
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <Avatar profile={profile} />
                      <div>
                        <div style={{ fontWeight: 800 }}>
                          {getDisplayName(profile)} invited you to ski
                        </div>
                        <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.72)" }}>
                          {invite.resort_key} · {invite.ski_date}
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: "0.92rem", color: "rgba(255,255,255,0.82)", lineHeight: 1.5 }}>
                      Leaving at <strong>{invite.departure_time || "TBD"}</strong> ·{" "}
                      <strong>{invite.seats_available}</strong> extra seat{invite.seats_available === 1 ? "" : "s"}
                    </div>

                    {invite.message ? (
                      <div
                        style={{
                          borderRadius: 12,
                          padding: 12,
                          background: "rgba(255,255,255,0.06)",
                          color: "rgba(255,255,255,0.82)",
                        }}
                      >
                        {invite.message}
                      </div>
                    ) : null}

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {invite.status === "pending" ? (
                        <>
                          <button
                            style={primaryButtonStyle}
                            onClick={() => handleRespondToCrewInvite(invite.id, "accepted")}
                            disabled={workingId === invite.id}
                          >
                            Accept RSVP
                          </button>
                          <button
                            style={secondaryButtonStyle}
                            onClick={() => handleRespondToCrewInvite(invite.id, "declined")}
                            disabled={workingId === invite.id}
                          >
                            Decline
                          </button>
                        </>
                      ) : (
                        <span
                          style={{
                            color: invite.status === "accepted" ? "#86efac" : "#fde68a",
                            fontWeight: 800,
                          }}
                        >
                          {invite.status === "accepted" ? "Accepted" : "Declined"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.72)", fontWeight: 700 }}>
                Sent
              </div>

              {!loadingPage && sentInvites.length === 0 ? (
                <EmptyState text="No crew invites sent yet." />
              ) : null}

              {sentInvites.map((invite) => {
                const profile = invite.invitee_profile;

                return (
                  <div
                    key={invite.id}
                    style={{
                      borderRadius: 14,
                      padding: 12,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{getDisplayName(profile)}</div>
                    <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.72)", marginTop: 4 }}>
                      {invite.resort_key} · {invite.ski_date} · depart {invite.departure_time || "TBD"}
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.58)", marginTop: 6 }}>
                      Status: <span style={{ fontWeight: 700 }}>{invite.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            title="Friends Leaderboard"
            subtitle="Your most frequent mountain companions."
          >
            <div style={{ display: "grid", gap: 10 }}>
              {loadingPage ? <EmptyState text="Loading leaderboard..." /> : null}

              {!loadingPage && leaderboard.length === 0 ? (
                <EmptyState text="No friends yet. Accept a request or send one to get the board going." />
              ) : null}

              {leaderboard.map((friend, index) => (
                <RowCard
                  key={friend.id}
                  left={
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: "999px",
                          background: "rgba(255,255,255,0.1)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.85rem",
                          fontWeight: 700,
                        }}
                      >
                        {index + 1}
                      </div>
                      <Avatar profile={friend} />
                      <div>
                        <div style={{ fontWeight: 700 }}>{getDisplayName(friend)}</div>
                        <div style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.72)" }}>
                          {friend.daysTogether} days together · {friend.daysOnMountain} total ski days
                        </div>
                      </div>
                    </div>
                  }
                  right={
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700 }}>{friend.topResort || "—"}</div>
                      <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.58)" }}>
                        top shared resort
                      </div>
                    </div>
                  }
                />
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}