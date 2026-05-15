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

export async function sendPhoneOtp(phone) {
  const { error } = await supabase.auth.signInWithOtp({ phone })
  if (error) throw error
}

export async function verifyPhoneOtp(phone, token) {
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" })
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
    sport_type: profile.sport_type || null,
    skill_level: profile.skill_level || null,
    vehicle_label: profile.vehicle_label || null,
    vehicle_seats: profile.vehicle_seats || null,
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

    // Notify the recipient
    const { data: senderData } = await supabase
      .from("profiles")
      .select("full_name, username")
      .eq("id", user.id)
      .single()
    const senderName = senderData?.full_name || senderData?.username || "Someone"
    insertNotification({
      userId: recipientId,
      type: "friend_request",
      title: `${senderName} sent you a friend request`,
      actorId: user.id,
    })

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

/* ─────────────────────────────────────────────────────────────────────────────
   SKI TRIPS  (Partiful-style social planning)

   Required Supabase tables:

   ski_trips:
     id          uuid primary key default gen_random_uuid()
     created_at  timestamptz default now()
     host_id     uuid references auth.users(id) on delete cascade
     resort_key  text not null
     ski_date    date not null
     title       text
     description text
     meeting_spot text
     departure_time text
     status      text default 'upcoming'   -- upcoming | cancelled

   trip_rsvps:
     id       uuid primary key default gen_random_uuid()
     trip_id  uuid references ski_trips(id) on delete cascade
     user_id  uuid references auth.users(id) on delete cascade
     status   text not null               -- going | maybe | cantgo
     created_at timestamptz default now()
     unique(trip_id, user_id)

   trip_comments:
     id         uuid primary key default gen_random_uuid()
     trip_id    uuid references ski_trips(id) on delete cascade
     user_id    uuid references auth.users(id) on delete cascade
     content    text not null
     created_at timestamptz default now()

   Enable RLS on all three tables.  Suggested policies:
     - ski_trips: SELECT for authenticated users; INSERT/UPDATE/DELETE for host_id = auth.uid()
     - trip_rsvps: SELECT for authenticated users; INSERT/UPDATE for user_id = auth.uid(); DELETE for user_id = auth.uid()
     - trip_comments: SELECT for authenticated users; INSERT for user_id = auth.uid(); DELETE for user_id = auth.uid()
───────────────────────────────────────────────────────────────────────────── */

async function enrichTrips(trips, userId) {
  if (!trips.length) return []

  const tripIds = trips.map((t) => t.id)

  const [rsvpRes, commentRes] = await Promise.all([
    supabase
      .from("trip_rsvps")
      .select("id, trip_id, user_id, status, plus_ones, rsvp_message, rsvp_gif_url, created_at")
      .in("trip_id", tripIds),
    supabase
      .from("trip_comments")
      .select("id, trip_id, user_id, content, created_at")
      .in("trip_id", tripIds)
      .order("created_at", { ascending: true }),
  ])

  const rsvps = rsvpRes.data || []
  const comments = commentRes.data || []

  const userIds = new Set()
  trips.forEach((t) => userIds.add(t.host_id))
  rsvps.forEach((r) => userIds.add(r.user_id))
  comments.forEach((c) => userIds.add(c.user_id))

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", [...userIds])

  const pm = new Map((profiles || []).map((p) => [p.id, p]))

  return trips.map((trip) => {
    const tripRsvps = rsvps
      .filter((r) => r.trip_id === trip.id)
      .map((r) => ({ ...r, profile: pm.get(r.user_id) || null }))

    const tripComments = comments
      .filter((c) => c.trip_id === trip.id)
      .map((c) => ({ ...c, profile: pm.get(c.user_id) || null }))

    return {
      ...trip,
      host_profile: pm.get(trip.host_id) || null,
      rsvps: tripRsvps,
      comments: tripComments,
      my_rsvp_status: userId
        ? (tripRsvps.find((r) => r.user_id === userId)?.status || null)
        : null,
    }
  })
}

export async function createTrip({ resort_key, ski_date, title, description, meeting_spot, departure_time, spotify_playlist_url, theme }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be logged in to create a trip.")

  const { data, error } = await supabase
    .from("ski_trips")
    .insert({
      host_id: user.id,
      resort_key,
      ski_date,
      title: title || null,
      description: description || null,
      meeting_spot: meeting_spot || null,
      departure_time: departure_time || null,
      spotify_playlist_url: spotify_playlist_url || null,
      theme: theme || "default",
      status: "upcoming",
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getAllVisibleTrips() {
  const user = await getCurrentUser()
  if (!user) return { mine: [], friends: [], rsvpd: [], invited: [] }

  const today = new Date().toISOString().slice(0, 10)
  const friendIds = await getAcceptedFriendIds(user.id)
  const friendIdArray = [...friendIds]

  const [myRaw, myRsvpRaw, friendsRaw, pendingInvitesRaw] = await Promise.all([
    supabase
      .from("ski_trips")
      .select("*")
      .eq("host_id", user.id)
      .eq("status", "upcoming")
      .gte("ski_date", today)
      .order("ski_date", { ascending: true }),
    supabase
      .from("trip_rsvps")
      .select("trip_id, status")
      .eq("user_id", user.id)
      .in("status", ["going", "maybe"]),
    friendIdArray.length > 0
      ? supabase
          .from("ski_trips")
          .select("*")
          .in("host_id", friendIdArray)
          .eq("status", "upcoming")
          .gte("ski_date", today)
          .order("ski_date", { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase
      .from("trip_invites")
      .select("trip_id")
      .eq("invitee_id", user.id)
      .eq("status", "pending"),
  ])

  const myTripsRaw = myRaw.data || []
  const rsvpdIds = new Set((myRsvpRaw.data || []).map((r) => r.trip_id))
  const myTripIds = new Set(myTripsRaw.map((t) => t.id))
  const allFriendsTrips = friendsRaw.data || []
  const allFriendsTripIds = new Set(allFriendsTrips.map((t) => t.id))
  const pendingInviteTripIds = (pendingInvitesRaw.data || []).map((i) => i.trip_id)

  const rsvpdRaw = allFriendsTrips.filter((t) => rsvpdIds.has(t.id) && !myTripIds.has(t.id))
  const discoverRaw = allFriendsTrips.filter((t) => !rsvpdIds.has(t.id) && !myTripIds.has(t.id))

  // Invited trips = pending invites that aren't already mine, rsvpd, or visible via friends
  const newInviteIds = pendingInviteTripIds.filter(
    (id) => !myTripIds.has(id) && !allFriendsTripIds.has(id) && !rsvpdIds.has(id)
  )

  let invitedTripsRaw = []
  if (newInviteIds.length > 0) {
    const { data } = await supabase
      .from("ski_trips")
      .select("*")
      .in("id", newInviteIds)
      .eq("status", "upcoming")
      .gte("ski_date", today)
      .order("ski_date", { ascending: true })
    invitedTripsRaw = data || []
  }

  const [mine, rsvpd, friends, invited] = await Promise.all([
    enrichTrips(myTripsRaw, user.id),
    enrichTrips(rsvpdRaw, user.id),
    enrichTrips(discoverRaw, user.id),
    enrichTrips(invitedTripsRaw, user.id),
  ])

  return { mine, friends, rsvpd, invited }
}

export async function rsvpToTrip(tripId, status) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be logged in to RSVP.")
  if (!["going", "maybe", "cantgo"].includes(status)) throw new Error("Invalid RSVP status.")

  const { data, error } = await supabase
    .from("trip_rsvps")
    .upsert(
      { trip_id: tripId, user_id: user.id, status },
      { onConflict: "trip_id,user_id" }
    )
    .select()
    .single()

  if (error) throw error

  // Dismiss any pending invite when user RSVPs
  const inviteStatus = status === "cantgo" ? "declined" : "accepted"
  await supabase
    .from("trip_invites")
    .update({ status: inviteStatus })
    .eq("trip_id", tripId)
    .eq("invitee_id", user.id)
    .eq("status", "pending")

  return data
}

export async function cancelTripRsvp(tripId) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be logged in.")

  const { error } = await supabase
    .from("trip_rsvps")
    .delete()
    .eq("trip_id", tripId)
    .eq("user_id", user.id)

  if (error) throw error
}

export async function addTripComment(tripId, content) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be logged in to comment.")

  const { data, error } = await supabase
    .from("trip_comments")
    .insert({ trip_id: tripId, user_id: user.id, content: content.trim() })
    .select("id, trip_id, user_id, content, created_at")
    .single()

  if (error) throw error

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .eq("id", user.id)
    .single()

  const actorName = profile?.full_name || profile?.username || "Someone"
  const { data: trip } = await supabase.from("ski_trips").select("title, resort_key").eq("id", tripId).single()
  const tripTitle = trip?.title || RESORT_DISPLAY[trip?.resort_key] || "the trip"
  notifyTripChat(tripId, tripTitle, user.id, actorName)  // fire-and-forget

  return { ...data, profile: profile || null }
}

export async function deleteTrip(tripId) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be logged in.")

  const { error } = await supabase
    .from("ski_trips")
    .delete()
    .eq("id", tripId)
    .eq("host_id", user.id)

  if (error) throw error
}

/* ─────────────────────────────────────────────────────────────────────────── */

export async function rsvpWithMessage(tripId, status, { message, gifUrl, plusOnes } = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be logged in to RSVP.")
  if (!["going", "maybe", "cantgo"].includes(status)) throw new Error("Invalid RSVP status.")

  const { data, error } = await supabase
    .from("trip_rsvps")
    .upsert({
      trip_id: tripId,
      user_id: user.id,
      status,
      plus_ones: plusOnes || 0,
      rsvp_message: message?.trim() || null,
      rsvp_gif_url: gifUrl?.trim() || null,
    }, { onConflict: "trip_id,user_id" })
    .select()
    .single()

  if (error) throw error

  // Dismiss any pending invite when user RSVPs with message
  const inviteStatus = status === "cantgo" ? "declined" : "accepted"
  await supabase
    .from("trip_invites")
    .update({ status: inviteStatus })
    .eq("trip_id", tripId)
    .eq("invitee_id", user.id)
    .eq("status", "pending")

  // Notify host of RSVP
  const { data: trip } = await supabase.from("ski_trips").select("title, resort_key").eq("id", tripId).single()
  const { data: actorProfile } = await supabase.from("profiles").select("full_name, username").eq("id", user.id).single()
  const actorName = actorProfile?.full_name || actorProfile?.username || "Someone"
  const tripTitle = trip?.title || RESORT_DISPLAY[trip?.resort_key] || "the trip"
  notifyRsvp(tripId, tripTitle, actorName, status, user.id)  // fire-and-forget

  return data
}

export async function addTripUpdate(tripId, content) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")

  const { data, error } = await supabase
    .from("trip_updates")
    .insert({ trip_id: tripId, host_id: user.id, content: content.trim() })
    .select()
    .single()

  if (error) throw error

  const { data: trip } = await supabase.from("ski_trips").select("title, resort_key").eq("id", tripId).single()
  const tripTitle = trip?.title || RESORT_DISPLAY[trip?.resort_key] || "the trip"
  notifyTripUpdate(tripId, tripTitle, content.trim(), user.id)  // fire-and-forget

  return data
}

export async function deleteTripUpdate(updateId) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")

  const { error } = await supabase
    .from("trip_updates")
    .delete()
    .eq("id", updateId)
    .eq("host_id", user.id)

  if (error) throw error
}

export async function addCarpool(tripId, { driverName, seatsTotal, carLabel, note }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")

  const { data, error } = await supabase
    .from("trip_carpools")
    .insert({ trip_id: tripId, driver_user_id: user.id, driver_name: driverName, seats_total: seatsTotal, car_label: carLabel || null, note: note || null })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function removeCarpool(carpoolId) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")

  const { error } = await supabase
    .from("trip_carpools")
    .delete()
    .eq("id", carpoolId)

  if (error) throw error
}

export async function claimSeat(tripId, carpoolId) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")

  // Release any existing seat in this trip first
  const { data: existingCars } = await supabase
    .from("trip_carpools")
    .select("id")
    .eq("trip_id", tripId)

  if (existingCars?.length) {
    await supabase
      .from("trip_carpool_riders")
      .delete()
      .in("carpool_id", existingCars.map((c) => c.id))
      .eq("user_id", user.id)
  }

  const { data, error } = await supabase
    .from("trip_carpool_riders")
    .insert({ carpool_id: carpoolId, user_id: user.id })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function releaseSeat(carpoolId) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")

  const { error } = await supabase
    .from("trip_carpool_riders")
    .delete()
    .eq("carpool_id", carpoolId)
    .eq("user_id", user.id)

  if (error) throw error
}

export async function updateRideStatus(tripId, status) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")

  const { data, error } = await supabase
    .from("trip_rsvps")
    .update({ ride_status: status })
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getTripDetail(tripId) {
  const user = await getCurrentUser()

  const [tripRes, rsvpRes, commentRes] = await Promise.all([
    supabase.from("ski_trips").select("*").eq("id", tripId).single(),
    supabase
      .from("trip_rsvps")
      .select("id, trip_id, user_id, status, ride_status, plus_ones, rsvp_message, rsvp_gif_url, created_at")
      .eq("trip_id", tripId),
    supabase
      .from("trip_comments")
      .select("id, trip_id, user_id, content, created_at")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true }),
  ])

  if (tripRes.error) throw tripRes.error

  let updates = []
  try {
    const updateRes = await supabase
      .from("trip_updates")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
    if (!updateRes.error) updates = updateRes.data || []
  } catch {}

  let polls = []
  try {
    const pollsRes = await supabase
      .from("trip_polls")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true })
    if (!pollsRes.error && pollsRes.data?.length) {
      const pollIds = pollsRes.data.map((p) => p.id)
      const [optRes, voteRes] = await Promise.all([
        supabase.from("trip_poll_options").select("*").in("poll_id", pollIds).order("position"),
        supabase.from("trip_poll_votes").select("*").in("poll_id", pollIds),
      ])
      const opts = optRes.data || []
      const votes = voteRes.data || []
      polls = pollsRes.data.map((poll) => {
        const options = opts
          .filter((o) => o.poll_id === poll.id)
          .map((opt) => ({ ...opt, vote_count: votes.filter((v) => v.option_id === opt.id).length }))
        const myVote = user ? votes.find((v) => v.poll_id === poll.id && v.user_id === user.id) : null
        return {
          ...poll,
          options,
          total_votes: votes.filter((v) => v.poll_id === poll.id).length,
          my_vote_option_id: myVote?.option_id || null,
        }
      })
    }
  } catch {}

  let carpools = []
  try {
    const carRes = await supabase
      .from("trip_carpools")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true })

    if (!carRes.error && carRes.data?.length) {
      const carpoolIds = carRes.data.map((c) => c.id)
      const { data: riderRows } = await supabase
        .from("trip_carpool_riders")
        .select("*")
        .in("carpool_id", carpoolIds)

      const cpUserIds = [
        ...carRes.data.filter((c) => c.driver_user_id).map((c) => c.driver_user_id),
        ...(riderRows || []).map((r) => r.user_id),
      ]
      let cpProfiles = []
      if (cpUserIds.length) {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, username, avatar_url")
          .in("id", [...new Set(cpUserIds)])
        cpProfiles = data || []
      }
      const cpMap = new Map(cpProfiles.map((p) => [p.id, p]))

      carpools = carRes.data.map((car) => {
        const riders = (riderRows || [])
          .filter((r) => r.carpool_id === car.id)
          .map((r) => ({ ...r, profile: cpMap.get(r.user_id) || null }))
        return {
          ...car,
          driver_profile: car.driver_user_id ? cpMap.get(car.driver_user_id) || null : null,
          riders,
          seats_taken: riders.length,
          seats_available: car.seats_total - riders.length,
        }
      })
    }
  } catch {}

  let invites = []
  try {
    const invRes = await supabase
      .from("trip_invites")
      .select("*")
      .eq("trip_id", tripId)
      .eq("status", "pending")
    if (!invRes.error && invRes.data?.length) {
      const inviteeIds = invRes.data.filter((i) => i.invitee_id).map((i) => i.invitee_id)
      let invProfiles = []
      if (inviteeIds.length) {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, username, avatar_url")
          .in("id", inviteeIds)
        invProfiles = data || []
      }
      const invPm = new Map(invProfiles.map((p) => [p.id, p]))
      invites = invRes.data.map((inv) => ({
        ...inv,
        profile: inv.invitee_id ? invPm.get(inv.invitee_id) || null : null,
      }))
    }
  } catch {}

  const trip = tripRes.data
  const rsvps = rsvpRes.data || []
  const comments = commentRes.data || []

  const userIds = new Set([
    trip.host_id,
    ...rsvps.map((r) => r.user_id),
    ...comments.map((c) => c.user_id),
    ...updates.map((u) => u.host_id),
  ])

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", [...userIds])

  const pm = new Map((profiles || []).map((p) => [p.id, p]))

  return {
    ...trip,
    host_profile: pm.get(trip.host_id) || null,
    rsvps: rsvps.map((r) => ({ ...r, profile: pm.get(r.user_id) || null })),
    comments: comments.map((c) => ({ ...c, profile: pm.get(c.user_id) || null })),
    updates: updates.map((u) => ({ ...u, host_profile: pm.get(u.host_id) || null })),
    polls,
    invites,
    carpools,
    my_rsvp: user ? (rsvps.find((r) => r.user_id === user.id) || null) : null,
    current_user_id: user?.id || null,
  }
}

export async function inviteFriendsToTrip(tripId, userIds) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")
  if (!userIds?.length) return []

  const rows = userIds.map((id) => ({
    trip_id: tripId,
    inviter_id: user.id,
    invitee_id: id,
    status: "pending",
  }))

  const { data, error } = await supabase
    .from("trip_invites")
    .upsert(rows, { onConflict: "trip_id,invitee_id", ignoreDuplicates: true })
    .select()

  if (error) throw error

  // Notify each invitee
  const { data: trip } = await supabase.from("ski_trips").select("title, resort_key").eq("id", tripId).single()
  const { data: inviterProfile } = await supabase.from("profiles").select("full_name, username").eq("id", user.id).single()
  const inviterName = inviterProfile?.full_name || inviterProfile?.username || "Someone"
  const tripTitle = trip?.title || RESORT_DISPLAY[trip?.resort_key] || "a ski trip"
  await Promise.allSettled(
    userIds.map((uid) =>
      insertNotification({ userId: uid, type: "invite", title: `${inviterName} invited you to ${tripTitle}`, tripId, actorId: user.id })
    )
  )

  return data || []
}

export async function inviteByEmailToTrip(tripId, { email, name }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")
  if (!email?.trim()) throw new Error("Email is required.")

  const { data, error } = await supabase
    .from("trip_invites")
    .insert({ trip_id: tripId, inviter_id: user.id, email: email.trim(), invitee_name: name?.trim() || null, status: "pending" })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function removeTripInvite(inviteId) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")

  const { error } = await supabase
    .from("trip_invites")
    .delete()
    .eq("id", inviteId)
    .eq("inviter_id", user.id)

  if (error) throw error
}

export async function createTripPoll(tripId, { question, options }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")
  if (!question?.trim()) throw new Error("Question is required.")
  if (!options?.length || options.length < 2) throw new Error("At least 2 options required.")

  const { data: poll, error: pollError } = await supabase
    .from("trip_polls")
    .insert({ trip_id: tripId, creator_id: user.id, question: question.trim() })
    .select()
    .single()

  if (pollError) throw pollError

  const optionRows = options
    .filter((o) => o?.trim())
    .map((o, i) => ({ poll_id: poll.id, text: o.trim(), position: i }))

  const { error: optError } = await supabase.from("trip_poll_options").insert(optionRows)
  if (optError) throw optError

  return poll
}

export async function voteOnPoll(pollId, optionId) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")

  const { data, error } = await supabase
    .from("trip_poll_votes")
    .upsert({ poll_id: pollId, option_id: optionId, user_id: user.id }, { onConflict: "poll_id,user_id" })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteTripPoll(pollId) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")

  const { error } = await supabase
    .from("trip_polls")
    .delete()
    .eq("id", pollId)
    .eq("creator_id", user.id)

  if (error) throw error
}

export async function updateTripMeta(tripId, { spotify_playlist_url, title, description, meeting_spot, departure_time, theme } = {}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")

  const payload = {}
  if (spotify_playlist_url !== undefined) payload.spotify_playlist_url = spotify_playlist_url || null
  if (title !== undefined) payload.title = title || null
  if (description !== undefined) payload.description = description || null
  if (meeting_spot !== undefined) payload.meeting_spot = meeting_spot || null
  if (departure_time !== undefined) payload.departure_time = departure_time || null
  if (theme !== undefined) payload.theme = theme || "default"

  const { data, error } = await supabase
    .from("ski_trips")
    .update(payload)
    .eq("id", tripId)
    .eq("host_id", user.id)
    .select()
    .single()

  if (error) throw error
  return data
}

/* ─────────────────────────────────────────────────────────────────────────── */

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

/* ── Notifications ──────────────────────────────────────────────────────────── */

async function insertNotification({ userId, type, title, body = null, tripId = null, actorId = null, crewId = null }) {
  if (!userId) return
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      type,
      title,
      body,
      trip_id: tripId,
      actor_id: actorId,
      crew_id: crewId,
    })
  } catch (e) {
    console.warn("Notification insert failed:", e)
  }
}

export async function getNotifications() {
  const user = await getCurrentUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) throw error
  return data || []
}

export async function markNotificationRead(id) {
  const user = await getCurrentUser()
  if (!user) return
  await supabase.from("notifications").update({ read: true }).eq("id", id).eq("user_id", user.id)
}

export async function markAllNotificationsRead() {
  const user = await getCurrentUser()
  if (!user) return
  await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false)
}

export async function deleteNotification(id) {
  const user = await getCurrentUser()
  if (!user) return
  await supabase.from("notifications").delete().eq("id", id).eq("user_id", user.id)
}

// Fire-and-forget: notify trip participants of a new chat message
export async function notifyTripChat(tripId, tripTitle, actorId, actorName) {
  try {
    // Get host + all going/maybe RSVPs
    const { data: trip } = await supabase.from("ski_trips").select("host_id").eq("id", tripId).single()
    const { data: rsvps } = await supabase.from("trip_rsvps").select("user_id").eq("trip_id", tripId).in("status", ["going", "maybe"])

    const recipients = new Set([...(rsvps || []).map((r) => r.user_id)])
    if (trip?.host_id) recipients.add(trip.host_id)
    recipients.delete(actorId) // don't notify sender

    const inserts = [...recipients].map((uid) =>
      insertNotification({ userId: uid, type: "chat", title: `${actorName} in ${tripTitle}`, body: null, tripId, actorId })
    )
    await Promise.allSettled(inserts)
  } catch (e) {
    console.warn("notifyTripChat failed:", e)
  }
}

// Fire-and-forget: notify trip participants of a host update
export async function notifyTripUpdate(tripId, tripTitle, content, actorId) {
  try {
    const { data: rsvps } = await supabase.from("trip_rsvps").select("user_id").eq("trip_id", tripId).in("status", ["going", "maybe"])

    const recipients = new Set((rsvps || []).map((r) => r.user_id))
    recipients.delete(actorId)

    const inserts = [...recipients].map((uid) =>
      insertNotification({ userId: uid, type: "host_update", title: `📢 Update: ${tripTitle}`, body: content, tripId, actorId })
    )
    await Promise.allSettled(inserts)
  } catch (e) {
    console.warn("notifyTripUpdate failed:", e)
  }
}

// Fire-and-forget: notify host of new RSVP
export async function notifyRsvp(tripId, tripTitle, actorName, status, actorId) {
  try {
    const { data: trip } = await supabase.from("ski_trips").select("host_id").eq("id", tripId).single()
    if (!trip?.host_id || trip.host_id === actorId) return

    const statusLabel = status === "going" ? "is going" : status === "maybe" ? "might be going" : "can't make it"
    await insertNotification({
      userId: trip.host_id,
      type: "rsvp",
      title: `${actorName} ${statusLabel} to ${tripTitle}`,
      tripId,
      actorId,
    })
  } catch (e) {
    console.warn("notifyRsvp failed:", e)
  }
}

/* ── Friends' Weekend Planner ───────────────────────────────────────────────── */

const RESORT_DISPLAY = {
  vail: "Vail", beavercreek: "Beaver Creek", breckenridge: "Breckenridge",
  keystone: "Keystone", crestedbutte: "Crested Butte", telluride: "Telluride",
  winterpark: "Winter Park", coppermountain: "Copper Mountain",
  arapahoebasin: "Arapahoe Basin", steamboat: "Steamboat", eldora: "Eldora",
  aspensnowmass: "Aspen Snowmass",
}

export async function getFriendsUpcomingTrips() {
  const user = await getCurrentUser()
  if (!user) return []

  const friendIds = await getAcceptedFriendIds(user.id)
  if (friendIds.size === 0) return []

  const friendIdArray = [...friendIds]
  const today = new Date()
  const todayKey = today.toISOString().slice(0, 10)
  const twoWeeksOut = new Date(today)
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14)
  const maxDateKey = twoWeeksOut.toISOString().slice(0, 10)

  const [friendsTripsRes, friendProfilesRes, rsvpRes] = await Promise.all([
    // Trips hosted by friends
    supabase
      .from("ski_trips")
      .select("id, title, resort_key, ski_date, host_id, status")
      .in("host_id", friendIdArray)
      .eq("status", "upcoming")
      .gte("ski_date", todayKey)
      .lte("ski_date", maxDateKey),
    // Friend profiles
    supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .in("id", friendIdArray),
    // RSVPs from friends on any upcoming trips
    supabase
      .from("trip_rsvps")
      .select("trip_id, user_id, status")
      .in("user_id", friendIdArray)
      .eq("status", "going"),
  ])

  const friendProfiles = new Map((friendProfilesRes.data || []).map((p) => [p.id, p]))
  const hostedTrips = friendsTripsRes.data || []

  // Collect trip IDs from RSVPs that aren't already in hosted trips
  const hostedIds = new Set(hostedTrips.map((t) => t.id))
  const rsvpdTripIds = [...new Set((rsvpRes.data || []).map((r) => r.trip_id).filter((id) => !hostedIds.has(id)))]

  let rsvpdTrips = []
  if (rsvpdTripIds.length > 0) {
    const { data } = await supabase
      .from("ski_trips")
      .select("id, title, resort_key, ski_date, host_id, status")
      .in("id", rsvpdTripIds)
      .eq("status", "upcoming")
      .gte("ski_date", todayKey)
      .lte("ski_date", maxDateKey)
    rsvpdTrips = data || []
  }

  const allTrips = [...hostedTrips, ...rsvpdTrips]
  const rsvpsByTrip = new Map()
  for (const r of (rsvpRes.data || [])) {
    if (!rsvpsByTrip.has(r.trip_id)) rsvpsByTrip.set(r.trip_id, [])
    rsvpsByTrip.get(r.trip_id).push(r.user_id)
  }

  // Build enriched trips with which friends are going
  const enriched = allTrips.map((trip) => {
    const goingFriendIds = new Set(rsvpsByTrip.get(trip.id) || [])
    // Include host if host is a friend
    if (friendIds.has(trip.host_id)) goingFriendIds.add(trip.host_id)

    const friends = [...goingFriendIds]
      .map((id) => friendProfiles.get(id))
      .filter(Boolean)

    return {
      id: trip.id,
      title: trip.title || `Trip to ${RESORT_DISPLAY[trip.resort_key] || trip.resort_key}`,
      resort_key: trip.resort_key,
      resort_name: RESORT_DISPLAY[trip.resort_key] || trip.resort_key,
      ski_date: trip.ski_date,
      friends,
    }
  })

  // Group by date
  const byDate = new Map()
  for (const trip of enriched) {
    if (!byDate.has(trip.ski_date)) byDate.set(trip.ski_date, [])
    byDate.get(trip.ski_date).push(trip)
  }

  // Build sorted array of date groups
  const result = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, trips]) => {
      const d = new Date(`${date}T12:00:00`)
      const isWeekend = d.getDay() === 0 || d.getDay() === 6
      return {
        date,
        dayName: d.toLocaleDateString(undefined, { weekday: "short" }),
        dateLabel: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        isWeekend,
        trips,
      }
    })

  return result
}

// ─── Ski Pings ────────────────────────────────────────────────────────────────

export async function createSkiPing({ recipientIds, message, resort_key, ski_date }) {
  const user = await getCurrentUser()
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

  const { data: ping, error } = await supabase
    .from("ski_pings")
    .insert({ sender_id: user.id, message: message || null, resort_key: resort_key || null, ski_date: ski_date || null, expires_at: expiresAt })
    .select()
    .single()
  if (error) throw error

  if (recipientIds?.length > 0) {
    const rows = recipientIds.map((uid) => ({ ping_id: ping.id, user_id: uid }))
    const { error: recErr } = await supabase.from("ski_ping_recipients").insert(rows)
    if (recErr) throw recErr
  }

  return ping
}

export async function respondToPing(pingId, response) {
  const user = await getCurrentUser()
  const { error } = await supabase
    .from("ski_ping_responses")
    .upsert({ ping_id: pingId, user_id: user.id, response }, { onConflict: "ping_id,user_id" })
  if (error) throw error
}

export async function getMyPings() {
  const user = await getCurrentUser()

  const [sentRes, receivedIdsRes] = await Promise.all([
    supabase
      .from("ski_pings")
      .select("*, ski_ping_recipients(user_id), ski_ping_responses(user_id, response)")
      .eq("sender_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("ski_ping_recipients")
      .select("ping_id")
      .eq("user_id", user.id),
  ])

  const sentPings = sentRes.data || []

  const receivedPingIds = (receivedIdsRes.data || []).map((r) => r.ping_id)
  let receivedPings = []
  if (receivedPingIds.length > 0) {
    const { data } = await supabase
      .from("ski_pings")
      .select("*, ski_ping_recipients(user_id), ski_ping_responses(user_id, response)")
      .in("id", receivedPingIds)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
    receivedPings = data || []
  }

  // Collect all sender/recipient user ids to fetch profiles
  const allPings = [...sentPings, ...receivedPings]
  const userIds = new Set()
  for (const p of allPings) {
    userIds.add(p.sender_id)
    for (const r of p.ski_ping_recipients || []) userIds.add(r.user_id)
    for (const r of p.ski_ping_responses || []) userIds.add(r.user_id)
  }

  let profileMap = new Map()
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .in("id", [...userIds])
    for (const p of profiles || []) profileMap.set(p.id, p)
  }

  const enrich = (ping) => ({
    ...ping,
    senderProfile: profileMap.get(ping.sender_id) || null,
    recipientProfiles: (ping.ski_ping_recipients || [])
      .map((r) => profileMap.get(r.user_id))
      .filter(Boolean),
    responses: (ping.ski_ping_responses || []).map((r) => ({
      ...r,
      profile: profileMap.get(r.user_id) || null,
    })),
    myResponse: (ping.ski_ping_responses || []).find((r) => r.user_id === user.id)?.response || null,
    isMine: ping.sender_id === user.id,
  })

  return {
    sent: sentPings.map(enrich),
    received: receivedPings.filter((p) => p.sender_id !== user.id).map(enrich),
    myUserId: user.id,
  }
}

// ─── Date Matchmaker ──────────────────────────────────────────────────────────

export async function createDatePoll({ title, resort_key, message, dates, recipientIds }) {
  const user = await getCurrentUser()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: poll, error } = await supabase
    .from("date_polls")
    .insert({ creator_id: user.id, title, resort_key: resort_key || null, message: message || null, expires_at: expiresAt })
    .select()
    .single()
  if (error) throw error

  if (dates?.length > 0) {
    const { error: optErr } = await supabase
      .from("date_poll_options")
      .insert(dates.map((d) => ({ poll_id: poll.id, ski_date: d })))
    if (optErr) throw optErr
  }

  if (recipientIds?.length > 0) {
    const { error: recErr } = await supabase
      .from("date_poll_recipients")
      .insert(recipientIds.map((uid) => ({ poll_id: poll.id, user_id: uid })))
    if (recErr) throw recErr
  }

  return poll
}

export async function voteOnDateOption(optionId, available) {
  const user = await getCurrentUser()
  const { error } = await supabase
    .from("date_poll_votes")
    .upsert({ option_id: optionId, user_id: user.id, available }, { onConflict: "option_id,user_id" })
  if (error) throw error
}

export async function getMyDatePolls() {
  const user = await getCurrentUser()

  const [createdRes, recipientRes] = await Promise.all([
    supabase
      .from("date_polls")
      .select("*, date_poll_options(id, ski_date, date_poll_votes(user_id, available)), date_poll_recipients(user_id)")
      .eq("creator_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("date_poll_recipients")
      .select("poll_id")
      .eq("user_id", user.id),
  ])

  const myPollIds = new Set((createdRes.data || []).map((p) => p.id))
  const receivedPollIds = (recipientRes.data || []).map((r) => r.poll_id).filter((id) => !myPollIds.has(id))

  let receivedPolls = []
  if (receivedPollIds.length > 0) {
    const { data } = await supabase
      .from("date_polls")
      .select("*, date_poll_options(id, ski_date, date_poll_votes(user_id, available)), date_poll_recipients(user_id)")
      .in("id", receivedPollIds)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
    receivedPolls = data || []
  }

  const allPolls = [...(createdRes.data || []), ...receivedPolls]
  const userIds = new Set()
  for (const poll of allPolls) {
    userIds.add(poll.creator_id)
    for (const r of poll.date_poll_recipients || []) userIds.add(r.user_id)
    for (const opt of poll.date_poll_options || []) {
      for (const v of opt.date_poll_votes || []) userIds.add(v.user_id)
    }
  }

  let profileMap = new Map()
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .in("id", [...userIds])
    for (const p of profiles || []) profileMap.set(p.id, p)
  }

  const enrich = (poll) => ({
    ...poll,
    creatorProfile: profileMap.get(poll.creator_id) || null,
    recipientProfiles: (poll.date_poll_recipients || [])
      .map((r) => profileMap.get(r.user_id))
      .filter(Boolean),
    options: (poll.date_poll_options || [])
      .sort((a, b) => a.ski_date.localeCompare(b.ski_date))
      .map((opt) => ({
        ...opt,
        votes: opt.date_poll_votes || [],
        yesCount: (opt.date_poll_votes || []).filter((v) => v.available).length,
        noCount: (opt.date_poll_votes || []).filter((v) => !v.available).length,
        myVote: (opt.date_poll_votes || []).find((v) => v.user_id === user.id) ?? null,
      })),
    isMine: poll.creator_id === user.id,
    participantCount: (poll.date_poll_recipients || []).length + 1,
  })

  return {
    created: (createdRes.data || []).map(enrich),
    received: receivedPolls.map(enrich),
    myUserId: user.id,
  }
}

// ─── Trip Recap & Media ───────────────────────────────────────────────────────

export async function submitTripRecap(tripId, { rating, conditions, highlight, notes }) {
  const user = await getCurrentUser()
  const { error } = await supabase
    .from("trip_recaps")
    .upsert({ trip_id: tripId, user_id: user.id, rating, conditions: conditions || null, highlight: highlight || null, notes: notes || null }, { onConflict: "trip_id,user_id" })
  if (error) throw error
}

export async function getTripRecaps(tripId) {
  const user = await getCurrentUser()
  const { data, error } = await supabase
    .from("trip_recaps")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
  if (error) throw error

  const userIds = [...new Set((data || []).map((r) => r.user_id))]
  let profileMap = new Map()
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .in("id", userIds)
    for (const p of profiles || []) profileMap.set(p.id, p)
  }

  return {
    recaps: (data || []).map((r) => ({ ...r, profile: profileMap.get(r.user_id) || null })),
    myRecap: (data || []).find((r) => r.user_id === user.id) || null,
  }
}

export async function uploadTripMedia(tripId, file, caption) {
  const user = await getCurrentUser()
  const ext = file.name.split(".").pop().toLowerCase()
  const mediaType = ["mp4", "mov", "avi", "webm"].includes(ext) ? "video" : "photo"
  const path = `${tripId}/${user.id}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from("trip-media")
    .upload(path, file, { upsert: false })
  if (uploadError) throw uploadError

  const { error: dbError } = await supabase
    .from("trip_media")
    .insert({ trip_id: tripId, user_id: user.id, storage_path: path, media_type: mediaType, caption: caption || null })
  if (dbError) throw dbError

  return path
}

export async function getTripMedia(tripId) {
  const { data, error } = await supabase
    .from("trip_media")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
  if (error) throw error

  const userIds = [...new Set((data || []).map((m) => m.user_id))]
  let profileMap = new Map()
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, username, avatar_url")
      .in("id", userIds)
    for (const p of profiles || []) profileMap.set(p.id, p)
  }

  return (data || []).map((m) => {
    const { data: urlData } = supabase.storage.from("trip-media").getPublicUrl(m.storage_path)
    return {
      ...m,
      url: urlData?.publicUrl || null,
      profile: profileMap.get(m.user_id) || null,
    }
  })
}

export async function deleteTripMedia(mediaId, storagePath) {
  const { error: storErr } = await supabase.storage.from("trip-media").remove([storagePath])
  if (storErr) throw storErr
  const { error } = await supabase.from("trip_media").delete().eq("id", mediaId)
  if (error) throw error
}

// ── Crew Group Chat ───────────────────────────────────────────────────────────

export async function createCrew({ name, emoji = "⛷️", description = "", inviteOnly = true, memberIds = [] }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in to create a crew.")

  const { data: crew, error: crewErr } = await supabase
    .from("crews")
    .insert({ name, emoji, description, created_by: user.id, invite_only: inviteOnly })
    .select()
    .single()
  if (crewErr) throw crewErr

  const { error: adminErr } = await supabase
    .from("crew_members")
    .insert({ crew_id: crew.id, user_id: user.id, role: "admin" })
  if (adminErr) throw adminErr

  if (memberIds.length > 0) {
    await supabase
      .from("crew_members")
      .insert(memberIds.map((uid) => ({ crew_id: crew.id, user_id: uid, role: "member" })))
  }

  return crew
}

export async function getMyCrews() {
  const user = await getCurrentUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("crew_members")
    .select(`
      role,
      joined_at,
      crew:crew_id ( id, name, emoji, description, invite_only, created_by, created_at )
    `)
    .eq("user_id", user.id)
    .eq("status", "active")

  if (error) throw error
  return (data || [])
    .filter((r) => r.crew)
    .sort((a, b) => new Date(b.joined_at) - new Date(a.joined_at))
    .map((r) => ({ ...r.crew, myRole: r.role }))
}

export async function getCrewMembers(crewId) {
  const { data, error } = await supabase
    .from("crew_members")
    .select(`
      id, role, joined_at,
      profile:user_id ( id, full_name, username, avatar_url, skill_level )
    `)
    .eq("crew_id", crewId)
  if (error) throw error
  return data || []
}

export async function getCrewMessages(crewId, limit = 60) {
  const { data, error } = await supabase
    .from("crew_messages")
    .select(`
      id, content, created_at,
      profile:user_id ( id, full_name, username, avatar_url )
    `)
    .eq("crew_id", crewId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []).reverse()
}

export async function sendCrewMessage(crewId, content) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")

  const { data, error } = await supabase
    .from("crew_messages")
    .insert({ crew_id: crewId, user_id: user.id, content })
    .select(`
      id, content, created_at,
      profile:user_id ( id, full_name, username, avatar_url )
    `)
    .single()
  if (error) throw error
  return data
}

export async function inviteToCrewGroup(crewId, userId) {
  const inviter = await getCurrentUser()
  if (!inviter) throw new Error("Must be logged in.")

  const { error } = await supabase
    .from("crew_members")
    .insert({ crew_id: crewId, user_id: userId, role: "member", status: "pending" })
  if (error) throw error

  // Fire notification to the invited user
  const [{ data: inviterProfile }, { data: crew }] = await Promise.all([
    supabase.from("profiles").select("full_name, username").eq("id", inviter.id).single(),
    supabase.from("crews").select("name, emoji").eq("id", crewId).single(),
  ])
  const inviterName = inviterProfile?.full_name || inviterProfile?.username || "Someone"
  const crewName   = crew ? `${crew.emoji} ${crew.name}` : "a crew"
  insertNotification({
    userId,
    type: "crew_invite",
    title: `${inviterName} invited you to ${crewName}`,
    body: "Tap Accept to join the group chat.",
    crewId,
    actorId: inviter.id,
  })
}

export async function acceptCrewInvite(crewId) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")

  const { error } = await supabase
    .from("crew_members")
    .update({ status: "active" })
    .eq("crew_id", crewId)
    .eq("user_id", user.id)
  if (error) throw error

  // Post system message to the crew chat
  const { data: profile } = await supabase
    .from("profiles").select("full_name, username").eq("id", user.id).single()
  const name = profile?.full_name || profile?.username || "Someone"
  await supabase.from("crew_messages").insert({
    crew_id: crewId,
    user_id: user.id,
    content: `${name} has entered the chat 🤙`,
    is_system: true,
  })
}

export async function declineCrewInvite(crewId) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")
  const { error } = await supabase
    .from("crew_members")
    .delete()
    .eq("crew_id", crewId)
    .eq("user_id", user.id)
    .eq("status", "pending")
  if (error) throw error
}

export async function leaveCrewGroup(crewId) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")
  const { error } = await supabase
    .from("crew_members")
    .delete()
    .eq("crew_id", crewId)
    .eq("user_id", user.id)
  if (error) throw error
}

export async function removeCrewMember(crewId, userId) {
  const { error } = await supabase
    .from("crew_members")
    .delete()
    .eq("crew_id", crewId)
    .eq("user_id", userId)
  if (error) throw error
}

export async function updateCrewGroup(crewId, updates) {
  const { error } = await supabase
    .from("crews")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", crewId)
  if (error) throw error
}

export async function deleteCrew(crewId) {
  const { error } = await supabase
    .from("crews")
    .delete()
    .eq("id", crewId)
  if (error) throw error
}