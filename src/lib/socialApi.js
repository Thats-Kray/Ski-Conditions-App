import { supabase } from "./supabase";
/* -----------------------------
   Helpers
----------------------------- */

export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error("Not authenticated.");

  return user;
}

export async function signUpWithProfile({
  first_name,
  last_name,
  email,
  password,
  username,
  ski_passes,
  favorite_mountain,
  ride_type,
}) {
  const full_name = [first_name, last_name].filter(Boolean).join(" ").trim();

  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name,
        last_name,
        full_name,
        username,
      },
    },
  });

  if (signUpError) throw signUpError;

  const user = authData?.user;
  if (!user) {
    throw new Error("Signup succeeded, but no user was returned.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      first_name: first_name || null,
      last_name: last_name || null,
      full_name: full_name || null,
      username: username || null,
      ski_passes: ski_passes || [],
      favorite_mountain: favorite_mountain || null,
      ride_type: ride_type || null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (profileError) throw profileError;

  return { user, profile };
}

export async function logInWithPassword({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function logOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  return true;
}

export async function sendPasswordReset(email) {
  const redirectTo =
    window.location.hostname === "localhost"
      ? "http://localhost:5173"
      : window.location.origin

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  })

  if (error) throw error
  return data
}

export async function updateMyPassword(newPassword) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (error) throw error
  return data
}



/* -----------------------------
   Profiles
----------------------------- */

export async function getMyProfile() {
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertMyProfile(profile) {
  const user = await getCurrentUser();

  const payload = {
  id: user.id,
  first_name: profile.first_name || null,
  last_name: profile.last_name || null,
  full_name:
    profile.full_name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
    null,
  username: profile.username || null,
  avatar_url: profile.avatar_url || null,
  ski_passes: profile.ski_passes || [],
  favorite_mountain: profile.favorite_mountain || null,
  ride_type: profile.ride_type || null,
  updated_at: new Date().toISOString(),
};

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function uploadProfilePhoto(file) {
  const user = await getCurrentUser();

  if (!file) {
    throw new Error("No file provided.");
  }

  const fileExt = file.name.split(".").pop();
  const filePath = `${user.id}/avatar-${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("profile-photos")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("profile-photos").getPublicUrl(filePath);

  return data.publicUrl;
}

/* -----------------------------
   Daily Plans
----------------------------- */

function buildPlanEta(skiDate, etaValue) {
  if (!skiDate || !etaValue) return null

  const trimmed = String(etaValue).trim()

  let hours
  let minutes

  const twentyFourHourMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  const twelveHourMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)

  if (twentyFourHourMatch) {
    hours = Number(twentyFourHourMatch[1])
    minutes = Number(twentyFourHourMatch[2])
  } else if (twelveHourMatch) {
    hours = Number(twelveHourMatch[1])
    minutes = Number(twelveHourMatch[2])
    const meridiem = twelveHourMatch[3].toUpperCase()

    if (meridiem === "AM") {
      if (hours === 12) hours = 0
    } else {
      if (hours !== 12) hours += 12
    }
  } else {
    return null
  }

  const [year, month, day] = skiDate.split("-").map(Number)

  if (!year || !month || !day) return null

  const date = new Date(year, month - 1, day, hours, minutes, 0)

  if (Number.isNaN(date.getTime())) return null

  return date.toISOString()
}


export async function upsertDailyPlan(plan) {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error("You must be logged in to save a ski plan.")
  }

  const skiDate =
    plan?.ski_date ||
    new Date().toISOString().slice(0, 10)

  if (!skiDate) {
    throw new Error("Missing ski date.")
  }

  if (!plan?.resort_key) {
    throw new Error("Missing resort key.")
  }

  const eta = buildPlanEta(skiDate, plan?.eta)

  const payload = {
    user_id: user.id,
    ski_date: skiDate,
    resort_key: plan.resort_key,
    eta,
    status: plan.status || "planned",
    visibility: plan.visibility || "friends",
    arrived_at: plan.arrived_at || null,
    note: plan.note || null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from("daily_plans")
    .upsert(payload, {
      onConflict: "user_id,ski_date",
    })
    .select()
    .single()

  if (error) throw error

  return data
}

export async function getMyDailyPlan(skiDate) {
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("daily_plans")
    .select("*")
    .eq("user_id", user.id)
    .eq("ski_date", skiDate)
    .maybeSingle();

  if (error) throw error;
  return data;
}




export async function getMySkiPlans() {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error("You must be logged in to view ski plans.")
  }

  const { data, error } = await supabase
    .from("daily_plans")
    .select("*")
    .eq("user_id", user.id)
    .order("ski_date", { ascending: true })
    .order("eta", { ascending: true })

  if (error) throw error

  return data || []
}




export async function getTodaysVisiblePlans(skiDate) {
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("daily_plans")
    .select(`
      *,
      profile:profiles (
        id,
        first_name,
        last_name,
        full_name,
        username,
        avatar_url,
        favorite_mountain
      )
    `)
    .eq("ski_date", skiDate)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const acceptedFriendIds = await getAcceptedFriendIds(user.id);

  return (data || []).filter((plan) => {
    if (plan.user_id === user.id) return true;
    if (plan.visibility === "public") return true;
    if (plan.visibility === "friends" && acceptedFriendIds.has(plan.user_id)) return true;
    return false;
  });
}

export async function markDriving(planId) {
  const { data, error } = await supabase
    .from("daily_plans")
    .update({
      status: "driving",
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function markArrival(planId) {
  const { data, error } = await supabase
    .from("daily_plans")
    .update({
      status: "arrived",
      arrived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/* -----------------------------
   Mountain Data
   Stubbed / keep your existing logic if already working
----------------------------- */

export async function getResortSkierCounts() {
  return [];
}

export async function getResortSkierDetails() {
  return [];
}

/* -----------------------------
   Friend / Social Helpers
----------------------------- */

async function getAcceptedFriendIds(currentUserId) {
  const { data, error } = await supabase
    .from("friend_requests")
    .select("requester_id, recipient_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`);

  if (error) throw error;

  const friendIds = new Set();

  for (const row of data || []) {
    if (row.requester_id === currentUserId) {
      friendIds.add(row.recipient_id);
    } else if (row.recipient_id === currentUserId) {
      friendIds.add(row.requester_id);
    }
  }

  return friendIds;
}

/* -----------------------------
   Search Profiles
----------------------------- */

export async function searchProfiles(searchText) {
  const user = await getCurrentUser();
  const trimmed = (searchText || "").trim();

  if (!trimmed) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select(`
      id,
      first_name,
      last_name,
      full_name,
      username,
      avatar_url,
      favorite_mountain,
      ski_passes
    `)
    .or(`username.ilike.%${trimmed}%,full_name.ilike.%${trimmed}%`)
    .neq("id", user.id)
    .limit(20);

  if (error) throw error;
  return data || [];
}

/* -----------------------------
   Friend Requests
----------------------------- */

export async function sendFriendRequest(recipientId) {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error("You must be logged in to send a friend request.")
  }

  if (!recipientId) {
    throw new Error("Missing recipient ID.")
  }

  if (recipientId === user.id) {
    throw new Error("You cannot send a friend request to yourself.")
  }

  const now = new Date().toISOString()

  const { data: existingRows, error: existingError } = await supabase
    .from("friend_requests")
    .select("*")
    .or(
      `and(requester_id.eq.${user.id},recipient_id.eq.${recipientId}),and(requester_id.eq.${recipientId},recipient_id.eq.${user.id})`
    )

  if (existingError) throw existingError

  const existing = existingRows?.[0] || null

  if (!existing) {
    const { data, error } = await supabase
      .from("friend_requests")
      .insert({
        requester_id: user.id,
        recipient_id: recipientId,
        status: "pending",
        created_at: now,
        updated_at: now,
      })
      .select()
      .single()

    if (error) throw error

    return { action: "created", request: data }
  }

  if (existing.status === "accepted") {
    return { action: "already_friends", request: existing }
  }

  if (existing.status === "pending") {
    if (existing.requester_id === user.id) {
      return { action: "already_sent", request: existing }
    }

    return { action: "incoming_pending", request: existing }
  }

  if (existing.status === "declined") {
    const { data, error } = await supabase
      .from("friend_requests")
      .update({
        requester_id: user.id,
        recipient_id: recipientId,
        status: "pending",
        updated_at: now,
      })
      .eq("id", existing.id)
      .select()
      .single()

    if (error) throw error

    return { action: "revived", request: data }
  }

  return { action: "unchanged", request: existing }
}

export async function cancelOutgoingFriendRequest(requestId) {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error("You must be logged in to cancel a friend request.")
  }

  if (!requestId) {
    throw new Error("Missing friend request ID.")
  }

  const { data: existing, error: existingError } = await supabase
    .from("friend_requests")
    .select("*")
    .eq("id", requestId)
    .single()

  if (existingError) throw existingError

  if (!existing) {
    throw new Error("Friend request not found.")
  }

  if (existing.requester_id !== user.id) {
    throw new Error("You can only cancel requests you sent.")
  }

  if (existing.status !== "pending") {
    throw new Error("Only pending requests can be canceled.")
  }

  const { error } = await supabase
    .from("friend_requests")
    .delete()
    .eq("id", requestId)

  if (error) throw error

  return { success: true, requestId }
}


export async function createCrewInvite(inviteeId, invite) {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error("You must be logged in to send a crew invite.")
  }

  if (!inviteeId) {
    throw new Error("Missing invitee ID.")
  }

  if (inviteeId === user.id) {
    throw new Error("You cannot invite yourself.")
  }

  if (!invite?.resort_key || !invite?.ski_date) {
    throw new Error("Resort and ski date are required.")
  }

  const now = new Date().toISOString()

  const payload = {
    inviter_id: user.id,
    invitee_id: inviteeId,
    resort_key: invite.resort_key,
    ski_date: invite.ski_date,
    departure_time: invite.departure_time || null,
    seats_available: Number.isFinite(Number(invite.seats_available))
      ? Number(invite.seats_available)
      : 0,
    message: invite.message?.trim() || null,
    status: "pending",
    updated_at: now,
  }

  const { data: existing, error: existingError } = await supabase
    .from("crew_invites")
    .select("*")
    .eq("inviter_id", user.id)
    .eq("invitee_id", inviteeId)
    .eq("resort_key", invite.resort_key)
    .eq("ski_date", invite.ski_date)
    .maybeSingle()

  if (existingError) throw existingError

  if (existing) {
    const { data, error } = await supabase
      .from("crew_invites")
      .update({
        ...payload,
        status: "pending",
      })
      .eq("id", existing.id)
      .select()
      .single()

    if (error) throw error
    return { action: "updated", invite: data }
  }

  const { data, error } = await supabase
    .from("crew_invites")
    .insert({
      ...payload,
      created_at: now,
    })
    .select()
    .single()

  if (error) throw error

  return { action: "created", invite: data }
}

export async function getReceivedCrewInvites() {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error("You must be logged in to view crew invites.")
  }

  const { data: invites, error } = await supabase
    .from("crew_invites")
    .select("*")
    .eq("invitee_id", user.id)
    .order("created_at", { ascending: false })

  if (error) throw error
  if (!invites?.length) return []

  const inviterIds = Array.from(new Set(invites.map((invite) => invite.inviter_id)))

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*")
    .in("id", inviterIds)

  if (profilesError) throw profilesError

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]))

  return invites.map((invite) => ({
    ...invite,
    inviter_profile: profileMap.get(invite.inviter_id) || null,
  }))
}

export async function getSentCrewInvites() {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error("You must be logged in to view crew invites.")
  }

  const { data: invites, error } = await supabase
    .from("crew_invites")
    .select("*")
    .eq("inviter_id", user.id)
    .order("created_at", { ascending: false })

  if (error) throw error
  if (!invites?.length) return []

  const inviteeIds = Array.from(new Set(invites.map((invite) => invite.invitee_id)))

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*")
    .in("id", inviteeIds)

  if (profilesError) throw profilesError

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]))

  return invites.map((invite) => ({
    ...invite,
    invitee_profile: profileMap.get(invite.invitee_id) || null,
  }))
}


function buildEtaFromInvite(skiDate, departureTime) {
  if (!skiDate || !departureTime) return null

  const trimmed = String(departureTime).trim()
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)

  if (!match) return null

  let hours = Number(match[1])
  const minutes = Number(match[2])
  const meridiem = match[3].toUpperCase()

  if (meridiem === "AM") {
    if (hours === 12) hours = 0
  } else if (meridiem === "PM") {
    if (hours !== 12) hours += 12
  }

  const [year, month, day] = skiDate.split("-").map(Number)

  if (!year || !month || !day) return null

  const date = new Date(year, month - 1, day, hours, minutes, 0)

  if (Number.isNaN(date.getTime())) return null

  return date.toISOString()
}

export async function respondToCrewInvite(inviteId, status) {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error("You must be logged in to respond to a crew invite.")
  }

  if (!inviteId) {
    throw new Error("Missing invite ID.")
  }

  if (!["accepted", "declined"].includes(status)) {
    throw new Error("Invalid invite response.")
  }

  const { data: existing, error: existingError } = await supabase
    .from("crew_invites")
    .select("*")
    .eq("id", inviteId)
    .single()

  if (existingError) throw existingError

  if (existing.invitee_id !== user.id) {
    throw new Error("You can only respond to invites sent to you.")
  }

  const now = new Date().toISOString()

  const { data: updatedInvite, error: updateError } = await supabase
    .from("crew_invites")
    .update({
      status,
      updated_at: now,
    })
    .eq("id", inviteId)
    .select()
    .single()

  if (updateError) throw updateError

  if (status === "accepted") {
    const eta = buildEtaFromInvite(existing.ski_date, existing.departure_time)

    const { error: planError } = await supabase
      .from("daily_plans")
      .upsert({
        user_id: user.id,
        ski_date: existing.ski_date,
        resort_key: existing.resort_key,
        eta,
        status: "planned",
        visibility: "public",
        note: existing.message || null,
      })

    if (planError) throw planError
  }

  return updatedInvite
}


export async function getIncomingFriendRequests() {
  const user = await getCurrentUser();

  const { data: requests, error: requestsError } = await supabase
    .from("friend_requests")
    .select(`
      id,
      requester_id,
      recipient_id,
      status,
      created_at,
      updated_at
    `)
    .eq("recipient_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (requestsError) throw requestsError;

  if (!requests || requests.length === 0) {
    return [];
  }

  const requesterIds = [...new Set(requests.map((request) => request.requester_id))];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select(`
      id,
      first_name,
      last_name,
      full_name,
      username,
      avatar_url,
      favorite_mountain,
      ski_passes
    `)
    .in("id", requesterIds);

  if (profilesError) throw profilesError;

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));

  return requests.map((request) => ({
    ...request,
    requester_profile: profileMap.get(request.requester_id) || null,
  }));
}

export async function getOutgoingFriendRequests() {
  const user = await getCurrentUser();

  const { data: requests, error: requestsError } = await supabase
    .from("friend_requests")
    .select(`
      id,
      requester_id,
      recipient_id,
      status,
      created_at,
      updated_at
    `)
    .eq("requester_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (requestsError) throw requestsError;

  if (!requests || requests.length === 0) {
    return [];
  }

  const recipientIds = [...new Set(requests.map((request) => request.recipient_id))];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select(`
      id,
      first_name,
      last_name,
      full_name,
      username,
      avatar_url,
      favorite_mountain,
      ski_passes
    `)
    .in("id", recipientIds);

  if (profilesError) throw profilesError;

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));

  return requests.map((request) => ({
    ...request,
    recipient_profile: profileMap.get(request.recipient_id) || null,
  }));
}

export async function respondToFriendRequest(requestId, status) {
  const user = await getCurrentUser();

  if (!["accepted", "declined"].includes(status)) {
    throw new Error("Invalid request response.");
  }

  const { data: requestRow, error: requestError } = await supabase
    .from("friend_requests")
    .select("*")
    .eq("id", requestId)
    .eq("recipient_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  if (requestError) throw requestError;
  if (!requestRow) {
    throw new Error("Friend request not found or already handled.");
  }

  const { data, error } = await supabase
    .from("friend_requests")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getAcceptedFriends() {
  const user = await getCurrentUser()

  if (!user) {
    throw new Error("You must be logged in to view friends.")
  }

  const { data: rows, error } = await supabase
    .from("friend_requests")
    .select("*")
    .eq("status", "accepted")
    .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)

  if (error) throw error

  const friendIds = Array.from(
    new Set(
      (rows || []).map((row) =>
        row.requester_id === user.id ? row.recipient_id : row.requester_id
      )
    )
  )

  if (friendIds.length === 0) return []

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*")
    .in("id", friendIds)

  if (profilesError) throw profilesError

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]))

  return friendIds
    .map((id) => profileMap.get(id))
    .filter(Boolean)
}

/* -----------------------------
   Friends Leaderboard
----------------------------- */

export async function getFriendsLeaderboard() {
  const user = await getCurrentUser();
  const friendIds = await getAcceptedFriendIds(user.id);

  if (friendIds.size === 0) return [];

  const friendIdArray = [...friendIds];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select(`
      id,
      first_name,
      last_name,
      full_name,
      username,
      avatar_url,
      favorite_mountain
    `)
    .in("id", friendIdArray);

  if (profilesError) throw profilesError;

  const { data: allPlans, error: plansError } = await supabase
    .from("daily_plans")
    .select("user_id, ski_date, resort_key")
    .in("user_id", [user.id, ...friendIdArray]);

  if (plansError) throw plansError;

  const myPlans = (allPlans || []).filter((plan) => plan.user_id === user.id);

  const leaderboard = (profiles || []).map((friend) => {
    const friendPlans = (allPlans || []).filter((plan) => plan.user_id === friend.id);

    const daysOnMountain = new Set(friendPlans.map((plan) => plan.ski_date)).size;

    const myDayResortSet = new Set(myPlans.map((plan) => `${plan.ski_date}__${plan.resort_key}`));
    const friendDayResortSet = new Set(
      friendPlans.map((plan) => `${plan.ski_date}__${plan.resort_key}`)
    );

    let daysTogether = 0;
    for (const value of friendDayResortSet) {
      if (myDayResortSet.has(value)) daysTogether += 1;
    }

    const resortCounts = {};
    for (const plan of friendPlans) {
      const key = plan.resort_key || "Unknown";
      resortCounts[key] = (resortCounts[key] || 0) + 1;
    }

    let topResort = null;
    let topResortCount = 0;

    for (const [resort, count] of Object.entries(resortCounts)) {
      if (count > topResortCount) {
        topResort = resort;
        topResortCount = count;
      }
    }

    return {
      ...friend,
      daysOnMountain,
      daysTogether,
      topResort,
      topResortCount,
    };
  });

  leaderboard.sort((a, b) => {
    if (b.daysTogether !== a.daysTogether) {
      return b.daysTogether - a.daysTogether;
    }
    return b.daysOnMountain - a.daysOnMountain;
  });

  return leaderboard;
}