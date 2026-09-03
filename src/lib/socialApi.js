import { supabase } from "./supabase";
import { localDateKey } from "./calendarDates";
import { OPEN_RESORT_KEY, resortName } from "./resorts";
import { formatDate } from "./format";
import { buildPlanUpsert } from "./planUpsert";
import { clampTitle, groupPhotosBySession, groupTagsBySession } from "./skiDayDetails";

/* -----------------------------
   Constants
----------------------------- */

// Columns safe to request in RETURNING/select clauses on `profiles` writes.
// Sprint 33 (migration 030) revokes SELECT on strava_access_token,
// strava_refresh_token, and strava_token_expires_at from `authenticated`.
// A bare `.select()` after insert/update/upsert/delete makes PostgREST issue
// `RETURNING *`, and Postgres requires SELECT privilege on every column named
// in RETURNING — so a bare `.select()` on a `profiles` write fails once that
// migration is live. Keep this list as the single source of truth for
// `profiles` write-returning columns; never add the token columns to it.
const PROFILE_SELECT_COLUMNS =
  "id, first_name, last_name, full_name, username, avatar_url, skill_level, sport_type, ski_passes, favorite_mountain, vehicle_label, vehicle_seats, powder_alerts_enabled, alert_phone, theme, is_admin, strava_athlete_id";

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
    .select(PROFILE_SELECT_COLUMNS)
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
   Verification (Sprint 30)
----------------------------- */

export async function getMyVerificationTier() {
  const user = await getCurrentUser()

  const { data, error } = await supabase
    .from("user_verification")
    .select("tier, oauth_provider, oauth_linked_at, phone_verified_at")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) throw error
  return data || { tier: 0, oauth_provider: null, oauth_linked_at: null, phone_verified_at: null }
}

export async function linkOAuthIdentity(provider) {
  if (!["google", "facebook"].includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`)
  }

  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: { redirectTo: window.location.href },
  })
  if (error) throw error
  return data // { url } — Supabase redirects the browser there automatically
}

// Reconciles user_verification with whatever Supabase Auth already knows —
// call after any auth-state change (identity link redirect returning, phone
// verified) since linkIdentity()'s OAuth round-trip leaves the app with no
// other signal that an identity was just linked. Safe to call redundantly:
// mark_oauth_linked/mark_phone_verified are both idempotent and re-verify
// against auth.identities/auth.users server-side. Also self-heals the phone
// leg: if verifyPhoneForTier1()'s RPC call failed transiently after the OTP
// was already confirmed, calling this again (e.g. via a retry button, or
// automatically on the next auth event) recovers without needing a new OTP.
export async function syncVerificationFromAuth() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) return null

  const linkedProviders = (user.identities || [])
    .map((identity) => identity.provider)
    .filter((provider) => provider === "google" || provider === "facebook")

  for (const provider of linkedProviders) {
    await supabase.rpc("mark_oauth_linked", { p_provider: provider })
  }

  if (user.phone_confirmed_at) {
    await supabase.rpc("mark_phone_verified")
  }

  return getMyVerificationTier()
}

export async function startPhoneVerificationForTier1(phone) {
  const { error } = await supabase.auth.updateUser({ phone })
  if (error) throw error
}

export async function verifyPhoneForTier1(phone, otp) {
  const { error: verifyError } = await supabase.auth.verifyOtp({
    phone,
    token: otp,
    type: "phone_change",
  })
  if (verifyError) throw verifyError

  const { data, error } = await supabase.rpc("mark_phone_verified")
  if (error) throw error
  return data
}

export async function reportContent(targetType, targetId, reason) {
  const { data, error } = await supabase.rpc("report_content", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
  })
  if (error) throw error
  return data
}

/* -----------------------------
   Ski Buddy Board (Sprint 31)
----------------------------- */

const MODERATE_ENDPOINT = `${import.meta.env.VITE_API_URL || "http://localhost:8787"}/api/moderate-content`

// Best-effort — the post already exists (is_verified() already gated its
// creation at the RPC layer, which is the real security boundary) before
// this runs. A moderation-service outage must never undo or block a
// successful post; reports are the actual backstop (see PRD: "review, not
// auto-punish"). Failures are logged, never thrown.
async function moderatePostDescription(postId, description) {
  if (!description || !description.trim()) return
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch(MODERATE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ contentType: "ski_buddy_post", contentId: postId, text: description }),
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) {
    console.error("Post moderation check failed:", err?.message)
  }
}

export async function createSkiBuddyPost({
  passType, resortKey, skiDate, ridingStyle, groupSizeWanted, carpoolStatus, carpoolSeats, description,
}) {
  const { data, error } = await supabase.rpc("create_ski_buddy_post", {
    p_pass_type: passType,
    p_resort_key: resortKey,
    p_ski_date: skiDate,
    p_riding_style: ridingStyle,
    p_group_size_wanted: groupSizeWanted || null,
    p_carpool_status: carpoolStatus || "none",
    p_carpool_seats: carpoolSeats || null,
    p_description: description || null,
  })
  if (error) throw error

  await moderatePostDescription(data.id, description)

  // Re-fetch so the caller sees is_held_for_review if the moderation check
  // (which just ran, above) flagged it.
  const { data: fresh, error: freshError } = await supabase
    .from("ski_buddy_posts")
    .select("*")
    .eq("id", data.id)
    .single()
  if (freshError) throw freshError
  return fresh
}

export async function getSkiBuddyPosts(filters = {}) {
  let query = supabase
    .from("ski_buddy_posts")
    .select("*")
    .in("status", ["open", "filled"])
    .gte("ski_date", localDateKey())
    .order("ski_date", { ascending: true })

  if (filters.passType) query = query.eq("pass_type", filters.passType)
  if (filters.resortKey) query = query.eq("resort_key", filters.resortKey)
  if (filters.carpoolStatus) query = query.eq("carpool_status", filters.carpoolStatus)
  if (filters.ridingStyle) query = query.contains("riding_style", [filters.ridingStyle])
  if (filters.hasCarpool) query = query.neq("carpool_status", "none")
  if (filters.dateFrom) query = query.gte("ski_date", filters.dateFrom)
  if (filters.dateTo) query = query.lte("ski_date", filters.dateTo)

  const { data, error } = await query
  if (error) throw error
  const posts = data || []
  if (!posts.length) return posts

  // ski_buddy_posts.user_id only references auth.users, never profiles — no
  // FK path for a PostgREST embed. Resolve as a second query, matching
  // getBoardPosts()'s established fix for the same situation.
  const userIds = [...new Set(posts.map((p) => p.user_id))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", userIds)

  const pm = new Map((profiles || []).map((p) => [p.id, p]))
  return posts.map((p) => ({ ...p, profiles: pm.get(p.user_id) || null }))
}

export async function getMySkiBuddyPosts() {
  const user = await getCurrentUser()
  const { data, error } = await supabase
    .from("ski_buddy_posts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
  if (error) throw error
  return data || []
}

export async function respondToSkiBuddyPost(postId, message) {
  const { data, error } = await supabase.rpc("respond_to_ski_buddy_post", {
    p_post_id: postId,
    p_message: message || null,
  })
  if (error) throw error
  return data
}

export async function getSkiBuddyResponses(postId) {
  const { data, error } = await supabase
    .from("ski_buddy_responses")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
  if (error) throw error
  const responses = data || []
  if (!responses.length) return responses

  const responderIds = [...new Set(responses.map((r) => r.responder_id))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", responderIds)

  const pm = new Map((profiles || []).map((p) => [p.id, p]))
  return responses.map((r) => ({ ...r, profiles: pm.get(r.responder_id) || null }))
}

export async function respondToSkiBuddyResponse(responseId, status) {
  if (!["accepted", "declined"].includes(status)) {
    throw new Error("Invalid response status.")
  }
  const { data, error } = await supabase
    .from("ski_buddy_responses")
    .update({ status })
    .eq("id", responseId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSkiBuddyPostStatus(postId, status) {
  if (!["open", "filled", "removed"].includes(status)) {
    throw new Error("Invalid post status.")
  }
  const { data, error } = await supabase
    .from("ski_buddy_posts")
    .update({ status })
    .eq("id", postId)
    .select()
    .single()
  if (error) throw error
  return data
}

/* -----------------------------
   Admin Moderation (Sprint 32 / TASK 15.1)
----------------------------- */

// Reuses getMyProfile()'s existing fetch rather than a separate round trip —
// profiles.is_admin (added by migration 029) is in PROFILE_SELECT_COLUMNS, so
// it rides along with every other profile fetch. This is a cheap render hint only; the
// actual security boundary is server-side (is_admin() re-checked inside
// release_held_post/get_held_posts, both SECURITY DEFINER).
export async function getMyAdminStatus() {
  const profile = await getMyProfile()
  return !!profile?.is_admin
}

export async function getHeldPosts() {
  const { data, error } = await supabase.rpc("get_held_posts")
  if (error) throw error
  const posts = data || []
  if (!posts.length) return posts

  // Same no-FK-path situation as getSkiBuddyPosts() — resolve authors as a
  // second query.
  const userIds = [...new Set(posts.map((p) => p.user_id))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", userIds)

  const pm = new Map((profiles || []).map((p) => [p.id, p]))
  return posts.map((p) => ({ ...p, profiles: pm.get(p.user_id) || null }))
}

export async function releaseHeldPost(postId) {
  const { data, error } = await supabase.rpc("release_held_post", { p_post_id: postId })
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
    .select(PROFILE_SELECT_COLUMNS)
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
    powder_alerts_enabled: profile.powder_alerts_enabled ?? false,
    alert_phone: profile.alert_phone || null,
    theme: profile.theme || "blizzard",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(payload)
    .select(PROFILE_SELECT_COLUMNS)
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

export async function uploadCrewPhoto(crewId, file) {
  if (!file) {
    throw new Error("No file provided.");
  }

  const fileExt = file.name.split(".").pop();
  const filePath = `${crewId}/photo-${Date.now()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from("crew-photos")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("crew-photos").getPublicUrl(filePath);

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
    localDateKey()

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

/**
 * "I'm in" — set my mountain for a day I am looking at on the friends calendar.
 *
 * daily_plans is unique on (user_id, ski_date), so joining a mountain IS setting my
 * plan for that day. No RSVP table, no second concept.
 *
 * Reads first and merges via buildPlanUpsert(), because upsertDailyPlan writes the
 * whole row: without the merge, tapping "I'm in" on a day I had already planned
 * with an ETA would null the ETA, the note and the check-in. buildPlanUpsert also
 * resets status/arrived_at when the mountain actually changes — moving to a
 * different mountain cannot leave you marked as having arrived at the old one.
 */
export async function joinPlanAtResort(skiDate, resortKey) {
  const existing = await getMyDailyPlan(skiDate)
  return upsertDailyPlan(buildPlanUpsert(existing, {
    skiDate,
    resortKey,
  }))
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




// Plans the current user is allowed to see in a date range, inclusive.
// Visibility is enforced entirely by RLS (migration 032): own rows, plus
// non-private rows belonging to an accepted friend or an active crewmate.
// Do NOT re-filter by friendship on the client — the server already did it,
// and a second filter would silently drop crewmates who aren't friends.
export async function getVisiblePlansInRange(startDate, endDate) {
  const { data, error } = await supabase
    .from("daily_plans")
    .select(`
      id, user_id, ski_date, resort_key, eta, note, status, visibility, arrived_at,
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
    .gte("ski_date", startDate)
    .lte("ski_date", endDate)
    .order("ski_date", { ascending: true })
    // Secondary sort preserves the old getTodaysVisiblePlans ordering, which
    // HomeDashboard depends on: it renders plans.slice(0, 5), so newest-first
    // decides which five check-ins appear on the Home card.
    .order("created_at", { ascending: false })

  if (error) throw error
  return data || []
}

// Kept as a named function because TodaysCrew.jsx, HomeDashboard.jsx and
// ui/AvatarStatusRail.jsx all call it. Sprint 34 moved visibility enforcement
// into RLS, so the old client-side friend filter (and its dead
// visibility === "public" branch — the CHECK only allows friends|groups|private)
// is gone.
export async function getTodaysVisiblePlans(skiDate) {
  return getVisiblePlansInRange(skiDate, skiDate)
}

export async function markDriving(planId) {
  const { data, error } = await supabase
    .from("daily_plans")
    .update({
      status: "driving",
      // arrived_at is only meaningful when status === "arrived" — clear it here so
      // switching Arrived -> Driving doesn't leave a stale arrival stamp beside
      // your name in Today's Crew.
      arrived_at: null,
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

// Owner-only delete; covered by the existing "users can manage own daily plans"
// ALL policy, so no RPC is needed.
export async function deleteDailyPlan(planId) {
  const { error } = await supabase
    .from("daily_plans")
    .delete()
    .eq("id", planId)

  if (error) throw error
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

export async function getResortActivityCounts(fromDate) {
  const { data, error } = await supabase.rpc("get_resort_activity_counts", { from_date: fromDate })
  if (error) throw error
  return data || [] // [{ resort_name, session_count }]
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

export async function getProfileById(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url, skill_level, sport_type, favorite_mountain, ski_passes, vehicle_label, vehicle_seats")
    .eq("id", userId)
    .single()
  if (error) throw error
  return data
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
    // Delete + insert rather than UPDATE. Reviving a declined request can flip
    // the direction (the other person may have asked first), and migration 033
    // column-scopes UPDATE to (status, updated_at) so requester_id/recipient_id
    // can no longer be rewritten — that rewrite was the second half of a
    // privilege-escalation path where a recipient could point a row at a victim
    // and then accept it. Both statements are permitted: delete_own covers
    // either party, and insert_own requires requester = self, status = pending.
    const { error: delError } = await supabase
      .from("friend_requests")
      .delete()
      .eq("id", existing.id)

    if (delError) throw delError

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
    // 'invite' = I am asking you to ski with me. 'request' = I am asking to join YOUR party.
    // Same table, same accept path; only the direction of the ask differs. See migration 038's
    // header for why one function handles both.
    kind: invite.kind === "request" ? "request" : "invite",
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
    // kind must be part of the match. Without it, asking to join someone's party would
    // overwrite an invite they had already sent you for the same mountain and day, silently
    // turning their invitation into your request.
    .eq("kind", payload.kind)
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
    .select("id, first_name, last_name, full_name, username, avatar_url")
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
    .select("id, first_name, last_name, full_name, username, avatar_url")
    .in("id", inviteeIds)

  if (profilesError) throw profilesError

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]))

  return invites.map((invite) => ({
    ...invite,
    invitee_profile: profileMap.get(invite.invitee_id) || null,
  }))
}


// buildEtaFromInvite() used to live here, duplicating buildPlanEta() with a narrower
// regex (it required an AM/PM suffix and rejected a bare "09:00"). respondToCrewInvite
// was its only caller and now passes departure_time straight to buildPlanEta via
// buildPlanUpsert, which handles both formats. Deleted rather than kept "just in case".

/**
 * Turn down someone who asked to ski with you, optionally with a word.
 *
 * "Full group", not "declined". Same reasoning as declineTripRequest: this is one of the two
 * moments in the app that lands on somebody as a small rejection, and it should read as a fact
 * about the day rather than a verdict on them. The note goes to their message inbox, where
 * they can reply, rather than into a notification they cannot answer.
 */
async function sendPartyDeclineMessage(invite, note) {
  try {
    const user = await getCurrentUser()
    if (!user || user.id === invite.inviter_id) return

    const where = resortName(invite.resort_key) || "that day"
    const trimmed = (note || "").trim()
    const body = trimmed
      ? `${where} on ${formatDate(invite.ski_date)} — ${trimmed}`
      : `${where} on ${formatDate(invite.ski_date)} — I've got a full group this time. Next one!`

    await sendDM(invite.inviter_id, body)
  } catch (e) {
    console.warn("sendPartyDeclineMessage failed:", e)
  }
}

export async function respondToCrewInvite(inviteId, status, note = null) {
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

  // Write the plan BEFORE flipping the invite, not after.
  //
  // The old order flipped the invite to "accepted" first and then wrote the plan. The
  // write threw a 23514 every single time (it sent visibility:"public", which the CHECK
  // does not allow), which left the user with an accepted invite, no plan, and no way to
  // retry from the UI — the invite no longer showed as pending. Writing the plan first
  // means a failure leaves the invite pending and the whole action is retryable.
  // 'request' means THEY asked to join MY party, so I am the approver. Approving must not
  // touch my own plan — I already have one, and rewriting it with the requester's chosen
  // resort would move me to their mountain. Only an 'invite' (someone asking me to come ski
  // with them) sets my plan.
  const isRequest = existing.kind === "request"

  if (status === "accepted" && !isRequest && existing.ski_date && existing.resort_key) {
    const existingPlan = await getMyDailyPlan(existing.ski_date)

    // Merge, do not overwrite. This is the fifth daily_plans writer and was the last one
    // doing a raw .upsert() — no onConflict (so it collided with the (user_id, ski_date)
    // unique constraint) and no merge (so it blanked any ETA, note or check-in already on
    // that day). buildPlanUpsert is the one funnel; see src/lib/planUpsert.js.
    //
    // departure_time is passed straight through as `eta`: buildPlanEta accepts "H:MM AM/PM"
    // natively, so there is nothing to convert. Passing an ISO instant here would be
    // silently discarded — buildPlanEta returns null for ISO.
    //
    // Both eta and note fall back to `undefined`, not null, when the invite carries no
    // departure time or message. undefined carries the user's existing value forward;
    // null would clear it. Accepting an invite must not erase an ETA you already set.
    //
    // visibility is deliberately NOT passed: buildPlanUpsert carries the existing value
    // forward. Accepting a crew invite must never un-private a day you marked Private.
    await upsertDailyPlan(buildPlanUpsert(existingPlan, {
      skiDate: existing.ski_date,
      resortKey: existing.resort_key,
      eta: existing.departure_time || undefined,
      note: existing.message || undefined,
    }))
  }

  // Accepting wires up the party AND flips the invite, atomically, inside accept_plan_party().
  // It handles both directions from one authorization rule (the caller must be invitee_id) —
  // see migration 038. Declining is just a status change; there is no party to build.
  if (status === "accepted") {
    const { error: partyError } = await supabase.rpc("accept_plan_party", {
      p_invite_id: inviteId,
    })
    if (partyError) throw partyError
  } else {
    const { error: updateError } = await supabase
      .from("crew_invites")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", inviteId)
    if (updateError) throw updateError

    // Turning down someone who asked to ski with you gets the same treatment as turning down
    // a trip request: a note, and it goes to their inbox. It is the same moment for the person
    // on the other end, so it should not depend on which object they asked about.
    if (isRequest && existing.inviter_id !== user.id) {
      sendPartyDeclineMessage(existing, note).catch(() => {})
    }
  }

  const { data: updatedInvite, error: readError } = await supabase
    .from("crew_invites")
    .select("*")
    .eq("id", inviteId)
    .single()

  if (readError) throw readError

  // Approving somebody's request has to tell THEM. Without this the requester never learns
  // they were added — they would have to reopen the calendar and notice. Only for requests:
  // an accepted invitation is the invitee acting on their own choice, and telling them what
  // they just did is noise.
  if (status === "accepted" && existing.kind === "request" && existing.inviter_id !== user.id) {
    notifyPartyJoined(existing).catch(() => {})
  }

  return updatedInvite
}

async function notifyPartyJoined(invite) {
  try {
    const { data: me } = await supabase
      .from("profiles").select("full_name, username").eq("id", invite.invitee_id).single()
    const who = me?.full_name || me?.username || "They"

    await insertNotification({
      userId: invite.inviter_id,
      type: "party_joined",
      title: `${who} added you to their group`,
      body: `${resortName(invite.resort_key) || "Skiing"} · ${formatDate(invite.ski_date)}`,
      actorId: invite.invitee_id,
      targetType: "plan",
      targetId: invite.ski_date,
    })
  } catch (e) {
    console.warn("notifyPartyJoined failed:", e)
  }
}

/* -----------------------------
   Plan parties — who you are skiing WITH, as opposed to where
----------------------------- */

/**
 * Ask to join someone's party for a day.
 *
 * This does NOT set your ski plan and does not put you anywhere. Going to the same mountain
 * is always yours to decide (use upsertDailyPlan / joinPlanAtResort for that); this is only
 * the request to ski WITH them, which is theirs to approve.
 */
export async function requestToJoinParty(ownerId, { skiDate, resortKey, message } = {}) {
  const invite = await createCrewInvite(ownerId, {
    ski_date: skiDate,
    resort_key: resortKey,
    message,
    kind: "request",
  })

  // target 'plan' + the date key, not a trip id — this opens the Plans calendar on that day.
  // The whole reason migration 043 added target_type/target_id: before it, a notification
  // could only ever point at a trip, and a plan party is not one.
  notifyPartyRequest(ownerId, skiDate, resortKey).catch(() => {})
  return invite
}

async function notifyPartyRequest(ownerId, skiDate, resortKey) {
  try {
    const user = await getCurrentUser()
    if (!user || user.id === ownerId) return
    const { data: me } = await supabase
      .from("profiles").select("full_name, username").eq("id", user.id).single()

    const who = me?.full_name || me?.username || "Someone"
    await insertNotification({
      userId: ownerId,
      type: "party_request",
      title: `${who} wants to ski with you`,
      body: `${resortName(resortKey) || "Your day"} · ${formatDate(skiDate)}`,
      actorId: user.id,
      targetType: "plan",
      targetId: skiDate,
    })
  } catch (e) {
    console.warn("notifyPartyRequest failed:", e)
  }
}

/** Pending requests other people have sent ME, awaiting my approval. */
export async function getIncomingPartyRequests() {
  const user = await getCurrentUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("crew_invites")
    .select("*")
    .eq("invitee_id", user.id)
    .eq("kind", "request")
    .eq("status", "pending")
    .order("created_at", { ascending: false })

  if (error) throw error
  if (!data || data.length === 0) return []

  // Profiles fetched separately, not embedded: crew_invites.inviter_id references auth.users,
  // not profiles, so PostgREST has no relationship to traverse. Same trap as
  // getIncomingTripRequests and getReceivedCrewInvites.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", [...new Set(data.map((r) => r.inviter_id).filter(Boolean))])

  const byId = new Map((profiles || []).map((p) => [p.id, p]))
  return data.map((r) => ({ ...r, requester_profile: byId.get(r.inviter_id) || null }))
}

/**
 * Party membership for a date range, for the calendar.
 *
 * Returned separately from plans rather than embedded on them: membership lives in its own
 * table precisely so upsertDailyPlan cannot touch it (see migration 037's header), and a
 * PostgREST embed would tie the two back together.
 *
 * RLS returns only parties you are in, so this is the set you are allowed to see grouped.
 */
export async function getMyPartyMembershipsInRange(startDate, endDate) {
  const user = await getCurrentUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("plan_party_members")
    .select("party_id, user_id, ski_date, party:plan_parties ( id, owner_id, name )")
    .gte("ski_date", startDate)
    .lte("ski_date", endDate)

  if (error) throw error
  return data || []
}

/** Leave the group you are skiing with on a day. Your ski plan is untouched. */
export async function leaveParty(skiDate) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be logged in to leave a party.")

  const { error } = await supabase
    .from("plan_party_members")
    .delete()
    .eq("user_id", user.id)
    .eq("ski_date", skiDate)

  if (error) throw error
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
    .select("id, first_name, last_name, full_name, username, avatar_url")
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

  // Auto-log a ski day for the host if the trip date is today or already passed
  if (data) autoLogSessionForTrip(user.id, resort_key, ski_date, data.id)

  if (data) {
    logActivity("trip_created", { subjectId: data.id, subjectType: "ski_trips", metadata: { resort_key: data.resort_key, ski_date: data.ski_date } })
  }

  return data
}

export async function getAllVisibleTrips() {
  const user = await getCurrentUser()
  if (!user) return { mine: [], friends: [], rsvpd: [], invited: [] }

  const today = localDateKey()
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

// Inline session auto-log — avoids circular import with leaderboardApi
function autoLogSessionForTrip(userId, resortKey, skiDate, tripId) {
  if (!resortKey || !skiDate) return
  const today = localDateKey()
  if (skiDate > today) return
  supabase
    .from("ski_sessions")
    .upsert(
      { user_id: userId, resort_name: resortKey, session_date: skiDate, trip_id: tripId },
      { onConflict: "user_id,session_date,resort_name" }
    )
    .then(() => {}).catch(() => {})  // fire-and-forget
}

/* -----------------------------
   Asking to join someone else's trip
----------------------------- */

/**
 * Ask a trip's host to let you in.
 *
 * A request is a trip_invites row you create ABOUT YOURSELF: inviter and invitee are both you,
 * kind='request'. It is stored that way rather than "invitee = the host" because
 * trip_invites is UNIQUE (trip_id, invitee_id), and pointing every request at the host would
 * mean only one person could ever ask to join a given trip. This way that constraint means the
 * right thing — one pending membership record per person per trip.
 */
export async function requestToJoinTrip(tripId) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be logged in to ask to join a trip.")
  if (!tripId) throw new Error("Missing trip.")

  const { data, error } = await supabase
    .from("trip_invites")
    .upsert(
      { trip_id: tripId, inviter_id: user.id, invitee_id: user.id, kind: "request", status: "pending" },
      { onConflict: "trip_id,invitee_id" }
    )
    .select()
    .single()

  if (error) throw error

  // Fire-and-forget, and deliberately not awaited into the return: a notification that fails
  // to send must not make the user think their request did not go through. It did — the row
  // above is the request.
  notifyTripRequest(tripId, user.id).catch(() => {})

  return data
}

/** Tell the host somebody wants in. */
async function notifyTripRequest(tripId, actorId) {
  try {
    const [{ data: trip }, { data: me }] = await Promise.all([
      supabase.from("ski_trips").select("host_id, title, resort_key").eq("id", tripId).single(),
      supabase.from("profiles").select("full_name, username").eq("id", actorId).single(),
    ])
    if (!trip?.host_id || trip.host_id === actorId) return

    const who = me?.full_name || me?.username || "Someone"
    await insertNotification({
      userId: trip.host_id,
      type: "trip_request",
      title: `${who} is interested in ${trip.title || resortName(trip.resort_key)}`,
      body: "Tap to see them and decide.",
      tripId,
      actorId,
    })
  } catch (e) {
    console.warn("notifyTripRequest failed:", e)
  }
}

/** Pending join requests on trips I host. RLS already scopes this to my trips. */
export async function getIncomingTripRequests() {
  const user = await getCurrentUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("trip_invites")
    .select("*, trip:ski_trips ( id, title, ski_date, resort_key, host_id )")
    .eq("kind", "request")
    .eq("status", "pending")
    .order("created_at", { ascending: false })

  if (error) throw error

  // Belt and braces on top of RLS: only requests for trips I actually host.
  const mine = (data || []).filter((r) => r.trip?.host_id === user.id)
  if (mine.length === 0) return []

  // The requester's profile is fetched separately rather than embedded.
  // trip_invites.invitee_id references auth.users, not profiles, so PostgREST has no
  // relationship to traverse — the same reason getReceivedCrewInvites does this by hand.
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", [...new Set(mine.map((r) => r.invitee_id).filter(Boolean))])

  if (profileError) throw profileError

  const byId = new Map((profiles || []).map((p) => [p.id, p]))
  return mine.map((r) => ({ ...r, requester_profile: byId.get(r.invitee_id) || null }))
}

/**
 * Approve a request. Goes through the RPC because the HOST is the caller but the REQUESTER is
 * the one who needs the RSVP row — the same asymmetry that made accept_plan_party() necessary.
 */
export async function approveTripRequest(inviteId) {
  // Read the request BEFORE approving: the RPC flips its status, and once it is no longer
  // pending we would have to guess who to tell.
  const { data: invite } = await supabase
    .from("trip_invites").select("trip_id, invitee_id").eq("id", inviteId).single()

  const { data, error } = await supabase.rpc("approve_trip_request", { p_invite_id: inviteId })
  if (error) throw error

  notifyRequestDecision(invite, "approved").catch(() => {})
  return data
}

/** Tell the person who asked what the host decided. Both answers are worth knowing. */
async function notifyRequestDecision(invite, decision) {
  if (!invite?.invitee_id || !invite?.trip_id) return
  try {
    const { data: trip } = await supabase
      .from("ski_trips").select("title, resort_key").eq("id", invite.trip_id).single()
    const where = trip?.title || resortName(trip?.resort_key) || "the trip"

    await insertNotification({
      userId: invite.invitee_id,
      type: decision === "approved" ? "trip_request_approved" : "trip_request_declined",
      // "Full", not "declined" — see declineTripRequest for why the wording matters here.
      title: decision === "approved" ? `You're in for ${where}` : `${where} is full`,
      body: decision === "approved"
        ? "Tap to see the crew and the details."
        : "The host sent you a message.",
      tripId: invite.trip_id,
      // Approved: open the trip. Turned down: open messages, where the host's note actually
      // is. Opening the trip would land them on something they were just told they are not
      // part of — and since migration 042 they cannot see its chat anyway, so it would be a
      // conspicuously empty page.
      targetType: decision === "approved" ? "trip" : "messages",
      targetId: decision === "approved" ? invite.trip_id : null,
    })
  } catch (e) {
    console.warn("notifyRequestDecision failed:", e)
  }
}

/**
 * Everyone who has marked themselves Interested in one trip, with the crew's votes.
 *
 * Members advise, the host decides — so this returns the tally rather than a verdict. There is
 * deliberately no "enough yes votes means they're in" rule anywhere; admission only ever
 * happens when the host calls approveTripRequest().
 *
 * RLS (migration 041) already limits both the requests and the votes to people on the trip,
 * and hides votes from the person being voted on.
 */
export async function getTripRequestsForTrip(tripId) {
  const user = await getCurrentUser()
  if (!user || !tripId) return []

  const { data: requests, error } = await supabase
    .from("trip_invites")
    .select("*")
    .eq("trip_id", tripId)
    .eq("kind", "request")
    .eq("status", "pending")
    .order("created_at", { ascending: true })

  if (error) throw error
  if (!requests || requests.length === 0) return []

  const ids = requests.map((r) => r.id)

  // Profiles fetched separately: trip_invites.invitee_id references auth.users, not profiles,
  // so PostgREST has no relationship to embed through.
  const [{ data: votes, error: voteError }, { data: profiles, error: profileError }] =
    await Promise.all([
      supabase.from("trip_request_votes").select("request_id, voter_id, vote").in("request_id", ids),
      supabase
        .from("profiles")
        .select("id, full_name, username, avatar_url")
        .in("id", [...new Set(requests.map((r) => r.invitee_id).filter(Boolean))]),
    ])

  if (voteError) throw voteError
  if (profileError) throw profileError

  const byId = new Map((profiles || []).map((p) => [p.id, p]))

  return requests.map((r) => {
    const mine = (votes || []).filter((v) => v.request_id === r.id)
    return {
      ...r,
      requester_profile: byId.get(r.invitee_id) || null,
      yesVotes: mine.filter((v) => v.vote === "yes").length,
      noVotes: mine.filter((v) => v.vote === "no").length,
      myVote: mine.find((v) => v.voter_id === user.id)?.vote || null,
    }
  })
}

/**
 * Vote on someone who wants in. Members only, never the requester — enforced in the policy,
 * not just here. Voting again replaces your previous vote rather than adding a second.
 */
export async function voteOnTripRequest(requestId, vote) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be logged in to vote.")
  if (!["yes", "no"].includes(vote)) throw new Error("Invalid vote.")

  const { data, error } = await supabase
    .from("trip_request_votes")
    .upsert(
      { request_id: requestId, voter_id: user.id, vote },
      { onConflict: "request_id,voter_id" }
    )
    .select()
    .single()

  if (error?.code === "42501" || /row-level security/i.test(error?.message || "")) {
    throw new Error("Only people already on this trip can vote.")
  }
  if (error) throw error
  return data
}

/**
 * Turn someone down, optionally with a word from the host.
 *
 * The wording is "full", not "declined". A trip fills up; that is a fact about the car and the
 * condo, not a verdict on the person — and this is the one notification in the app that lands
 * on somebody as a small rejection. The note exists so a host can soften it or explain.
 *
 * The note goes to the requester's MESSAGE INBOX as a DM from the host, not into the
 * notification body. A note is the start of a conversation ("next time for sure") and the
 * inbox is where they can actually reply; a notification is a dead end.
 */
export async function declineTripRequest(inviteId, note = null) {
  const { data: invite } = await supabase
    .from("trip_invites").select("trip_id, invitee_id").eq("id", inviteId).single()

  const { error } = await supabase
    .from("trip_invites")
    .update({ status: "declined" })
    .eq("id", inviteId)
  if (error) throw error

  notifyRequestDecision(invite, "declined").catch(() => {})
  sendDeclineMessage(invite, note).catch(() => {})
}

async function sendDeclineMessage(invite, note) {
  if (!invite?.invitee_id || !invite?.trip_id) return
  try {
    const user = await getCurrentUser()
    // Declining your own request would DM yourself. Cannot normally happen — the host is not
    // the requester — but a self-message is a confusing artefact if it ever does.
    if (!user || user.id === invite.invitee_id) return

    const { data: trip } = await supabase
      .from("ski_trips").select("title, resort_key, ski_date").eq("id", invite.trip_id).single()
    const where = trip?.title || resortName(trip?.resort_key) || "that trip"

    const trimmed = (note || "").trim()
    const body = trimmed
      ? `${where} on ${formatDate(trip?.ski_date)} is full — ${trimmed}`
      : `${where} on ${formatDate(trip?.ski_date)} is full. Catch you on the next one.`

    await sendDM(invite.invitee_id, body)
  } catch (e) {
    console.warn("sendDeclineMessage failed:", e)
  }
}

/**
 * Turn migration 040's RLS refusal into something a user can act on.
 *
 * There are TWO writers to trip_rsvps that can be refused — rsvpToTrip and rsvpWithMessage —
 * and the first version of this shipped inside rsvpToTrip only. TripDetailModal uses the
 * other one, so joining through the modal failed silently: "Sending…" and then nothing.
 *
 * That is the fourth incident in this codebase caused by patching call sites one at a time
 * instead of the shared path (see planUpsert.js's writer census). Hence one function, called
 * by both. If a third RSVP writer ever appears, it calls this too.
 */
function asTripApprovalError(error) {
  if (!error) return null
  if (error.code === "42501" || /row-level security/i.test(error.message || "")) {
    const e = new Error("You need the host's OK to join this trip. Mark yourself Interested and they can approve you.")
    e.code = "NEEDS_TRIP_APPROVAL"
    return e
  }
  return null
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

  const approvalError = asTripApprovalError(error)
  if (approvalError) throw approvalError
  if (error) throw error

  // Dismiss any pending invite when user RSVPs
  const inviteStatus = status === "cantgo" ? "declined" : "accepted"
  await supabase
    .from("trip_invites")
    .update({ status: inviteStatus })
    .eq("trip_id", tripId)
    .eq("invitee_id", user.id)
    .eq("status", "pending")

  // Auto-log a ski day if going to a past/today trip
  if (status === "going") {
    const { data: trip } = await supabase
      .from("ski_trips").select("resort_key, ski_date").eq("id", tripId).single()
    if (trip) autoLogSessionForTrip(user.id, trip.resort_key, trip.ski_date, tripId)
  }

  if (status === "going") {
    logActivity("trip_rsvp", { subjectId: tripId, subjectType: "ski_trips", metadata: { status } })
  }

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

export async function addTripComment(tripId, content, mediaUrl = null, mediaType = null) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be logged in to comment.")

  const row = { trip_id: tripId, user_id: user.id, content: content.trim() }
  if (mediaUrl)  row.media_url  = mediaUrl
  if (mediaType) row.media_type = mediaType

  const { data, error } = await supabase
    .from("trip_comments")
    .insert(row)
    .select("id, trip_id, user_id, content, media_url, media_type, created_at")
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

  // The writer that was missed the first time. TripDetailModal RSVPs through here, so an
  // uninvited user saw "Sending…" and then silent failure.
  const approvalError = asTripApprovalError(error)
  if (approvalError) throw approvalError
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
  const { data: trip } = await supabase.from("ski_trips").select("title, resort_key, ski_date").eq("id", tripId).single()
  const { data: actorProfile } = await supabase.from("profiles").select("full_name, username").eq("id", user.id).single()
  const actorName = actorProfile?.full_name || actorProfile?.username || "Someone"
  const tripTitle = trip?.title || RESORT_DISPLAY[trip?.resort_key] || "the trip"
  notifyRsvp(tripId, tripTitle, actorName, status, user.id)  // fire-and-forget

  // Auto-log a ski day if going to a past/today trip
  if (status === "going" && trip) autoLogSessionForTrip(user.id, trip.resort_key, trip.ski_date, tripId)

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

  // Sprint 34: cap at today. Before migration 032 this query returned only the
  // caller's own rows (the friends RLS policy was dead), so every friend showed
  // 0 days. Now that friends' rows come back, forward-looking planned days would
  // inflate "days on mountain" — a plan for next Saturday is not a day skied.
  //
  // localDateKey, not toISOString(): ski_date is a plain local DATE, and in
  // Colorado toISOString() rolls over to tomorrow after ~5-6pm, which would let
  // tomorrow's planned day count as a day skied — the exact inflation this cap
  // exists to prevent.
  const todayISO = localDateKey();

  const { data: allPlans, error: plansError } = await supabase
    .from("daily_plans")
    .select("user_id, ski_date, resort_key")
    .in("user_id", [user.id, ...friendIdArray])
    .lte("ski_date", todayISO);

  if (plansError) throw plansError;

  const myPlans = (allPlans || []).filter((plan) => plan.user_id === user.id);

  const leaderboard = (profiles || []).map((friend) => {
    const friendPlans = (allPlans || []).filter((plan) => plan.user_id === friend.id);

    // "Open — no preference" is still a day skied, so it stays in daysOnMountain.
    // It is not a mountain, so it must not decide anyone's topResort, and two
    // people who both said "Open" the same day did not necessarily ski together
    // — so OPEN_RESORT_KEY rows are excluded below from both resortCounts and
    // the daysTogether match sets.
    const daysOnMountain = new Set(friendPlans.map((plan) => plan.ski_date)).size;

    const myDayResortSet = new Set(
      myPlans
        .filter((plan) => plan.resort_key !== OPEN_RESORT_KEY)
        .map((plan) => `${plan.ski_date}__${plan.resort_key}`)
    );
    const friendDayResortSet = new Set(
      friendPlans
        .filter((plan) => plan.resort_key !== OPEN_RESORT_KEY)
        .map((plan) => `${plan.ski_date}__${plan.resort_key}`)
    );

    let daysTogether = 0;
    for (const value of friendDayResortSet) {
      if (myDayResortSet.has(value)) daysTogether += 1;
    }

    const resortCounts = {};
    for (const plan of friendPlans) {
      if (plan.resort_key === OPEN_RESORT_KEY) continue;
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

async function insertNotification({
  userId, type, title, body = null, tripId = null, actorId = null, crewId = null,
  targetType = null, targetId = null,
}) {
  if (!userId) return
  // Build payload without crew_id to avoid schema-cache failures on older deployments.
  // crewId is already encoded in body JSON by callers that need it.
  const payload = {
    user_id:  userId,
    type,
    title,
    body:     body ?? null,
    actor_id: actorId ?? null,
  }
  if (tripId)  payload.trip_id  = tripId
  if (crewId)  payload.crew_id  = crewId

  // Where tapping this should take you (migration 043). A trip notification defaults to its
  // own trip, so every existing caller becomes clickable without being touched.
  const resolvedType = targetType ?? (tripId ? "trip" : null)
  const resolvedId = targetId ?? (tripId || null)
  if (resolvedType) payload.target_type = resolvedType
  if (resolvedId)   payload.target_id   = String(resolvedId)

  const { error } = await supabase.from("notifications").insert(payload)
  if (error) {
    // Log the full error so it's visible in the browser console.
    // If you see this, check: Supabase → Authentication → Policies → notifications table.
    console.error(
      `[PowderDays] Notification insert FAILED (type=${type} for user=${userId}):`,
      error.code, error.message, error.details
    )
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
  const todayKey = localDateKey(today)
  const twoWeeksOut = new Date(today)
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14)
  const maxDateKey = localDateKey(twoWeeksOut)

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

export async function getFriendUpcomingTripsByResort() {
  const user = await getCurrentUser()
  if (!user) return {}

  const friendIds = await getAcceptedFriendIds(user.id)
  if (friendIds.size === 0) return {}

  const friendIdArray = [...friendIds]
  const today = new Date()
  const todayKey = localDateKey(today)
  const weekOut = new Date(today)
  weekOut.setDate(weekOut.getDate() + 7)
  const maxDateKey = localDateKey(weekOut)

  const [friendsTripsRes, friendProfilesRes, rsvpRes] = await Promise.all([
    // Trips hosted by friends
    supabase
      .from("ski_trips")
      .select("id, resort_key, ski_date, host_id, status")
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
      .select("id, resort_key, ski_date, host_id, status")
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

  const byResort = {}
  function addFriend(resortKey, profile) {
    if (!resortKey || !profile) return
    byResort[resortKey] = byResort[resortKey] || []
    if (!byResort[resortKey].some((p) => p.id === profile.id)) {
      byResort[resortKey].push(profile)
    }
  }

  for (const trip of allTrips) {
    const goingFriendIds = new Set(rsvpsByTrip.get(trip.id) || [])
    // Include host if host is a friend
    if (friendIds.has(trip.host_id)) goingFriendIds.add(trip.host_id)

    for (const id of goingFriendIds) {
      addFriend(trip.resort_key, friendProfiles.get(id))
    }
  }

  return byResort // { [resort_key]: [profile, profile, ...] }
}

// ─── Vibe Score (sprint-27) ────────────────────────────────────────────────────
// Community-wide (not friend-filtered) check-in + upcoming-RSVP counts per resort,
// used to compute a secondary "social energy" signal alongside the Powder Score.
// Note: joins trip_rsvps -> ski_trips via two queries + client-side map, matching
// the pattern already used by getFriendUpcomingTripsByResort() above, rather than
// a PostgREST embedded-relation filter (`ski_trips!inner(...)`) — no other query
// in this file uses that embedding-with-foreign-filter syntax, so this avoids
// relying on an unverified join shape.
export async function getResortVibeData() {
  const today = new Date()
  const todayStr = localDateKey(today)
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekAgoStr = localDateKey(weekAgo)
  const weekAhead = new Date(today)
  weekAhead.setDate(weekAhead.getDate() + 7)
  const weekAheadStr = localDateKey(weekAhead)

  const [{ data: checkins, error: checkinErr }, { data: upcomingTrips, error: tripErr }] = await Promise.all([
    supabase.from("daily_plans").select("resort_key").gte("ski_date", weekAgoStr).lte("ski_date", todayStr),
    supabase
      .from("ski_trips")
      .select("id, resort_key")
      .eq("status", "upcoming")
      .gte("ski_date", todayStr)
      .lte("ski_date", weekAheadStr),
  ])
  if (checkinErr) throw checkinErr
  if (tripErr) throw tripErr

  const checkinCounts = {}
  for (const c of checkins || []) {
    if (c.resort_key) checkinCounts[c.resort_key] = (checkinCounts[c.resort_key] || 0) + 1
  }

  const rsvpCounts = {}
  const upcomingTripIds = (upcomingTrips || []).map((t) => t.id)
  if (upcomingTripIds.length > 0) {
    const tripResortById = new Map((upcomingTrips || []).map((t) => [t.id, t.resort_key]))
    const { data: rsvpRows, error: rsvpErr } = await supabase
      .from("trip_rsvps")
      .select("trip_id, status")
      .eq("status", "going")
      .in("trip_id", upcomingTripIds)
    if (rsvpErr) throw rsvpErr
    for (const r of rsvpRows || []) {
      const key = tripResortById.get(r.trip_id)
      if (key) rsvpCounts[key] = (rsvpCounts[key] || 0) + 1
    }
  }

  return { checkinCounts, rsvpCounts } // both { [resort_key]: count }, missing keys mean 0
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

// Goes through the SECURITY DEFINER create_crew RPC (migration 034) rather than
// writing crews/crew_members directly. The old client-side version relied on the
// crew_members INSERT policy branch `user_id = auth.uid()` to seed its own admin
// row — the same branch that let anyone insert themselves into ANY crew (and
// status DEFAULTs to 'active', so it was live immediately). That branch is gone;
// the RPC does both writes atomically instead.
//
// Invited members now land as 'pending' rather than the old 'active' default, so
// creating a crew invites people instead of force-joining them. That matches
// inviteToCrewGroup and the existing pending-invites UI.
export async function createCrew({ name, emoji = "⛷️", description = "", inviteOnly = true, memberIds = [] }) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in to create a crew.")

  const { data, error } = await supabase.rpc("create_crew", {
    p_name: name,
    p_emoji: emoji,
    p_description: description,
    p_invite_only: inviteOnly,
    p_member_ids: memberIds,
  })

  if (error) {
    if (error.message?.includes("CREW_NAME_REQUIRED")) {
      throw new Error("Give your crew a name.")
    }
    throw error
  }

  // RETURNS crews (a composite row); PostgREST hands back the object directly.
  return Array.isArray(data) ? data[0] : data
}

export async function getMyCrews() {
  const user = await getCurrentUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("crew_members")
    .select(`
      role,
      joined_at,
      crew:crew_id ( id, name, emoji, description, invite_only, created_by, created_at, photo_url )
    `)
    .eq("user_id", user.id)
    .eq("status", "active")

  if (error) throw error
  return (data || [])
    .filter((r) => r.crew)
    .sort((a, b) => new Date(b.joined_at) - new Date(a.joined_at))
    .map((r) => ({ ...r.crew, myRole: r.role }))
}

export async function getPendingCrewInvites() {
  const user = await getCurrentUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("crew_members")
    .select(`
      id,
      crew:crew_id ( id, name, emoji, description, created_by,
        creator:created_by ( full_name, username )
      )
    `)
    .eq("user_id", user.id)
    .eq("status", "pending")

  if (error) { console.error("getPendingCrewInvites error:", error); return [] }
  return (data || []).filter((r) => r.crew).map((r) => r.crew)
}

/**
 * @param {string} crewId
 * @param {Object} [opts]
 * @param {boolean} [opts.includePending=false] include rows with status !== 'active'.
 *
 * Defaults to active-only (ROADMAP 18.2): the friends calendar colors members by
 * crew and counts them in the chip, so a pending invitee must not appear to be in
 * your crew there. That is the real reason for the filter — NOT "RLS refuses their
 * rows anyway" (a prior version of this comment claimed that; it is wrong).
 * Migration 035's SELECT policy is `user_id = auth.uid() OR my_crew_role(crew_id)
 * IS NOT NULL`, and the second branch returns every row of a crew you are active
 * in, pending included — so active members already see pending rows at the RLS
 * layer, and this filter is the only thing hiding them.
 *
 * CrewGroupChat needs the opposite: an admin managing invites has to see pending
 * rows to confirm an invite landed, to exclude already-invited friends from the
 * invite picker (avoiding the unique (crew_id, user_id) constraint), and to revoke
 * a pending invite. Pass { includePending: true } there.
 */
export async function getCrewMembers(crewId, { includePending = false } = {}) {
  let query = supabase
    .from("crew_members")
    .select(`
      id, role, joined_at, status,
      profile:user_id ( id, full_name, username, avatar_url, skill_level )
    `)
    .eq("crew_id", crewId)
  if (!includePending) query = query.eq("status", "active")
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getCrewMessages(crewId, limit = 60) {
  const { data, error } = await supabase
    .from("crew_messages")
    .select(`
      id, content, media_url, media_type, is_system, created_at,
      profile:user_id ( id, full_name, username, avatar_url )
    `)
    .eq("crew_id", crewId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []).reverse()
}

export async function sendCrewMessage(crewId, content, mediaUrl = null, mediaType = null) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in.")

  const row = { crew_id: crewId, user_id: user.id, content }
  if (mediaUrl)  row.media_url  = mediaUrl
  if (mediaType) row.media_type = mediaType

  const { data, error } = await supabase
    .from("crew_messages")
    .insert(row)
    .select(`
      id, content, media_url, media_type, created_at,
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

  // Fetch all names + crew in parallel
  const [{ data: inviterProfile }, { data: inviteeProfile }, { data: crew }] = await Promise.all([
    supabase.from("profiles").select("full_name, username").eq("id", inviter.id).single(),
    supabase.from("profiles").select("full_name, username").eq("id", userId).single(),
    supabase.from("crews").select("name, emoji").eq("id", crewId).single(),
  ])
  const inviterName = inviterProfile?.full_name || inviterProfile?.username || "Someone"
  const inviteeName = inviteeProfile?.full_name || inviteeProfile?.username || "Someone"
  const crewName    = crew ? `${crew.emoji} ${crew.name}` : "a crew"

  // System message visible to all current crew members
  supabase.from("crew_messages").insert({
    crew_id: crewId,
    user_id: inviter.id,
    content: `${inviterName} added ${inviteeName} to the group`,
    is_system: true,
  }).then(() => {}).catch(() => {})

  // Notification to the invited user.
  // crewId is stored in both crew_id column (if schema cache has it) and body
  // JSON as a fallback so the insert succeeds even before schema cache refreshes.
  insertNotification({
    userId,
    type: "crew_invite",
    title: `${inviterName} added you to ${crewName}`,
    body: JSON.stringify({ crewId, text: "Tap Accept to join the group chat." }),
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

// ── Trip conversations (for MessagingCenter inbox) ────────────────────────────

export async function getMyTripConversations(userId) {
  if (!userId) return []

  const allTripIds = new Set()

  // Run all 4 sources in parallel, each independently resilient
  const [hostedRes, rsvpdRes, invitedRes, commentedRes] = await Promise.allSettled([
    supabase.from("ski_trips").select("id, title, resort_key, ski_date").eq("host_id", userId).order("ski_date", { ascending: false }),
    supabase.from("trip_rsvps").select("trip_id").eq("user_id", userId),
    supabase.from("trip_invites").select("trip_id").eq("invitee_id", userId),
    supabase.from("trip_comments").select("trip_id").eq("user_id", userId),
  ])

  // Collect hosted trips (already have full rows)
  const hostedTrips = hostedRes.status === "fulfilled" ? (hostedRes.value.data || []) : []
  for (const t of hostedTrips) allTripIds.add(t.id)

  // Collect extra IDs from rsvps, invites, comments
  const extraSources = [rsvpdRes, invitedRes, commentedRes]
  for (const res of extraSources) {
    if (res.status === "fulfilled") {
      for (const row of (res.value.data || [])) {
        if (row.trip_id) allTripIds.add(row.trip_id)
      }
    }
  }

  // Remove IDs already in hosted (we have full rows for those)
  const hostedIds = new Set(hostedTrips.map(t => t.id))
  const extraIds = [...allTripIds].filter(id => !hostedIds.has(id))

  let extraTrips = []
  if (extraIds.length > 0) {
    const { data } = await supabase
      .from("ski_trips")
      .select("id, title, resort_key, ski_date")
      .in("id", extraIds)
    extraTrips = data || []
  }

  return [...hostedTrips, ...extraTrips]
}

export async function getTripChatMessages(tripId) {
  const { data: comments, error } = await supabase
    .from("trip_comments")
    .select("id, trip_id, user_id, content, media_url, media_type, created_at")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true })
  if (error) throw error
  if (!comments?.length) return []
  const userIds = [...new Set(comments.map((c) => c.user_id))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", userIds)
  const pm = new Map((profiles || []).map((p) => [p.id, p]))
  return comments.map((c) => ({ ...c, profile: pm.get(c.user_id) || null }))
}

// ── Direct Messages ───────────────────────────────────────────────────────────

export async function getDMConversations() {
  const user = await getCurrentUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("direct_messages")
    .select("id, sender_id, recipient_id, content, created_at, read_at")
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(300)

  if (error) throw error

  const convMap = new Map()
  for (const msg of (data || [])) {
    const partnerId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id
    if (!convMap.has(partnerId)) convMap.set(partnerId, msg)
  }

  if (convMap.size === 0) return []

  const partnerIds = [...convMap.keys()]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url, skill_level")
    .in("id", partnerIds)

  const profileMap = new Map((profiles || []).map(p => [p.id, p]))

  return partnerIds
    .map(partnerId => ({
      partnerId,
      partner: profileMap.get(partnerId) || null,
      lastMessage: convMap.get(partnerId),
      unread: convMap.get(partnerId)?.recipient_id === user.id && !convMap.get(partnerId)?.read_at,
    }))
    .sort((a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at))
}

export async function getDMMessages(partnerId) {
  const user = await getCurrentUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("direct_messages")
    .select("id, sender_id, recipient_id, content, media_url, media_type, created_at, read_at")
    .or(`and(sender_id.eq.${user.id},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${user.id})`)
    .order("created_at", { ascending: true })

  if (error) throw error
  return data || []
}

export async function sendDM(recipientId, content, mediaUrl = null, mediaType = null) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in")

  const row = { sender_id: user.id, recipient_id: recipientId, content: content.trim() }
  if (mediaUrl)  row.media_url  = mediaUrl
  if (mediaType) row.media_type = mediaType

  const { data, error } = await supabase
    .from("direct_messages")
    .insert(row)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function uploadChatMedia(file) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Must be logged in")

  const ext  = file.name.split(".").pop().toLowerCase()
  const path = `${user.id}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from("chat-media")
    .upload(path, file, { cacheControl: "3600", upsert: false })
  if (error) throw error

  const { data } = supabase.storage.from("chat-media").getPublicUrl(path)
  return data.publicUrl
}

export async function markDMsRead(partnerId) {
  const user = await getCurrentUser()
  if (!user) return

  await supabase
    .from("direct_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .eq("sender_id", partnerId)
    .is("read_at", null)
}

// --- Activity feed ---

export async function logActivity(type, { subjectId = null, subjectType = null, metadata = null } = {}) {
  try {
    const user = await getCurrentUser()
    const { error } = await supabase
      .from("activity_feed")
      .insert({ actor_id: user.id, type, subject_id: subjectId, subject_type: subjectType, metadata })
    if (error) throw error
  } catch (e) {
    console.warn("logActivity failed", e) // non-blocking — never let a feed-logging failure break the user's real action
  }
}

/**
 * logActivity, but at most once per subject. ski_sessions is upserted on
 * (user_id, session_date, resort_name), so editing or re-logging the same ski
 * day returns the same row — while activity_feed has no uniqueness constraint
 * and would happily collect a duplicate entry per save. The existing feed row
 * for this subject is the dedupe signal (the upsert result itself can't
 * distinguish an insert from an update).
 */
export async function logActivityOnce(type, { subjectId = null, subjectType = null, metadata = null } = {}) {
  try {
    if (!subjectId) return logActivity(type, { subjectId, subjectType, metadata })

    const user = await getCurrentUser()
    // .limit(1) before .maybeSingle() matters: bare .maybeSingle() *errors* when
    // more than one row matches, and rows that predate this dedupe existed in
    // pairs — that error would leave `existing` null and let a third duplicate
    // through. We only care whether any row exists, so cap the result at one.
    const { data: existing } = await supabase
      .from("activity_feed")
      .select("id")
      .eq("actor_id", user.id)
      .eq("type", type)
      .eq("subject_id", subjectId)
      .limit(1)
      .maybeSingle()

    if (existing) return

    await logActivity(type, { subjectId, subjectType, metadata })
  } catch (e) {
    console.warn("logActivityOnce failed", e) // non-blocking, same as logActivity
  }
}

export async function getActivityFeed(limit = 30) {
  // No FK exists from activity_feed.actor_id to profiles (only to auth.users), so a
  // PostgREST embedded select here always 400s — the exact situation getBoardPosts
  // documents and fixes below. Resolve profiles with a separate query instead.
  //
  // Filtered to completed ski days only. trip_rsvp/trip_created rows are still written
  // (createSkiTrip/rsvpToTrip) and still exist in the table — nothing else reads them —
  // but Kyle found the Feed itself unusable once trip planning activity outnumbered
  // actual ski days. "Who's planning what" already has its own surface (TodaysCrew on
  // the Today tab, the trip pages themselves); the Feed is for what people actually did.
  const { data, error } = await supabase
    .from("activity_feed")
    .select("*")
    .eq("type", "ski_session")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  const items = data || []
  if (!items.length) return items

  const actorIds = [...new Set(items.map((i) => i.actor_id))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", actorIds)
  const pm = new Map((profiles || []).map((p) => [p.id, p]))
  const withProfiles = items.map((i) => ({ ...i, profiles: pm.get(i.actor_id) || null }))

  // Session stats are resolved as a second batched query rather than embedded,
  // the same resolve-as-a-second-query pattern getSkiBuddyPosts/getBoardPosts
  // already use for profiles above. Read-time, not a snapshot in activity_feed.metadata:
  // updateSessionStats lets a user edit a day's numbers afterwards, and a snapshot
  // would go stale the moment they did.
  const sessionIds = withProfiles
    .filter((i) => i.type === "ski_session" && i.subject_id)
    .map((i) => i.subject_id)
  if (!sessionIds.length) return withProfiles

  // These are ski_sessions' real column names. `runs_logged` comes from migration
  // 010; `vertical_feet`/`is_powder_day` from the base table. `total_runs`/`vertical_ft`
  // exist only as the get_leaderboard RPC's aggregate alias and as ski_runs' per-segment
  // column — selecting either name here would fail the request.
  const { data: sessions, error: sessionErr } = await supabase
    .from("ski_sessions")
    .select("id, runs_logged, vertical_feet, is_powder_day, title")
    .in("id", sessionIds)

  // Non-fatal, and no longer an early return. A failed stat lookup used to abandon the
  // whole enrichment pass; now it degrades to an empty stats map so that photos and tags
  // — three independent queries against three independent tables — still land. A wrong
  // column name in one select should not blank two unrelated features.
  if (sessionErr) {
    console.warn("getActivityFeed session stats lookup failed", sessionErr)
  }
  const statsById = new Map((sessions || []).map((s) => [s.id, s]))

  // Two more batched second-queries, the same read-time-not-snapshot pattern as the stats
  // lookup above and the same shape getActivityReactions/getActivityComments use: one
  // query for the whole page, not one per card. getSessionPhotos and getSessionTags are
  // declared further down this file — `export async function` declarations are hoisted, so
  // calling them from here is fine despite reading backwards.
  //
  // Each is independently non-fatal. A refused or broken photo query must degrade a card
  // to "no photos", not blank the feed, and — because an empty result is otherwise
  // indistinguishable from "nobody attached photos yet" — it warns rather than swallowing.
  const [photoRows, tagRows] = await Promise.all([
    getSessionPhotos(sessionIds).catch((e) => {
      console.warn("getActivityFeed session photos lookup failed", e)
      return []
    }),
    getSessionTags(sessionIds).catch((e) => {
      console.warn("getActivityFeed session tags lookup failed", e)
      return []
    }),
  ])

  const photosBySession = groupPhotosBySession(photoRows)
  const tagsBySession = groupTagsBySession(tagRows)

  return withProfiles.map((i) => {
    if (i.type !== "ski_session") return i
    return {
      ...i,
      sessionStats: statsById.get(i.subject_id) || null,
      sessionPhotos: photosBySession[i.subject_id] || [],
      sessionTags: tagsBySession[i.subject_id] || [],
    }
  })
}

export async function getActivityReactions(activityIds) {
  if (!activityIds?.length) return []
  const { data, error } = await supabase
    .from("activity_feed_reactions")
    .select("activity_id, user_id, emoji")
    .in("activity_id", activityIds)
  if (error) throw error
  return data || []
}

export async function addActivityReaction(activityId, emoji) {
  const user = await getCurrentUser()
  const { data: existing, error: findErr } = await supabase
    .from("activity_feed_reactions")
    .select("id, emoji")
    .eq("activity_id", activityId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (findErr) throw findErr

  if (existing?.emoji === emoji) {
    const { error } = await supabase.from("activity_feed_reactions").delete().eq("id", existing.id)
    if (error) throw error
    return null
  }

  const { data, error } = await supabase
    .from("activity_feed_reactions")
    .upsert({ activity_id: activityId, user_id: user.id, emoji }, { onConflict: "activity_id,user_id" })
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── Activity feed comments (Feed slice B, migration 045) ───────────────────

/**
 * Every comment on a batch of activities, in one query — the same batched shape as
 * getActivityReactions above, not a per-card lazy fetch. A feed page is 30 flat,
 * lightweight threads; one query beats 30 round trips if every card gets expanded.
 *
 * No visibility filtering belongs here: activity_feed_comments_select routes through
 * can_see_activity(), so Postgres has already restricted this to activities the caller
 * can see (migration 045).
 *
 * No FK exists from activity_feed_comments.user_id to profiles (only to auth.users),
 * so — same situation as getActivityFeed/getBoardPosts — profiles are resolved with a
 * separate query rather than a PostgREST embed, which always 400s here.
 */
export async function getActivityComments(activityIds) {
  if (!activityIds?.length) return []
  const { data, error } = await supabase
    .from("activity_feed_comments")
    .select("id, activity_id, user_id, content, created_at")
    .in("activity_id", activityIds)
    .order("created_at", { ascending: true })
  if (error) throw error
  const comments = data || []
  if (!comments.length) return comments

  const userIds = [...new Set(comments.map((c) => c.user_id))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", userIds)
  const pm = new Map((profiles || []).map((p) => [p.id, p]))
  return comments.map((c) => ({ ...c, profiles: pm.get(c.user_id) || null }))
}

/**
 * Post one comment and return the stored row with its author profile resolved, so the
 * caller can splice it straight into the open thread without a refetch (Decision 5: no
 * realtime, no auto-refresh timer).
 *
 * There is deliberately no client-side visibility check. activity_feed_comments_insert
 * requires BOTH user_id = auth.uid() AND can_see_activity(activity_id), so commenting on
 * an activity the caller cannot see is refused by Postgres — the real boundary — not by
 * a JS guard that an attacker never runs.
 *
 * No FK exists from activity_feed_comments.user_id to profiles (only to auth.users), so
 * the author's profile is resolved with a separate query after the insert, same as
 * getActivityComments/getActivityFeed/getBoardPosts — an embedded select on the INSERT's
 * .select() would always 400.
 */
export async function addActivityComment(activityId, content) {
  const trimmed = (content || "").trim()
  if (!trimmed) throw new Error("Comment can't be empty.")

  const user = await getCurrentUser()
  const { data, error } = await supabase
    .from("activity_feed_comments")
    .insert({ activity_id: activityId, user_id: user.id, content: trimmed })
    .select("id, activity_id, user_id, content, created_at")
    .single()
  if (error) throw error

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .eq("id", user.id)
    .maybeSingle()

  return { ...data, profiles: profile || null }
}

/**
 * Delete one comment. Ownership is enforced by activity_feed_comments_delete
 * (user_id = auth.uid()), which makes someone else's comment match zero rows rather than
 * error — so there is deliberately no second ownership check here, matching how
 * trip_comments' own DELETE policy is relied on.
 */
export async function deleteActivityComment(commentId) {
  const { error } = await supabase.from("activity_feed_comments").delete().eq("id", commentId)
  if (error) throw error
}

// ─── Ski day details: title, photos, friend tags (Feed slice C1, migration 046) ──

/**
 * Set (or clear) a ski day's title.
 *
 * Lives here and not in leaderboardApi.js on purpose: leaderboardApi.js:4 already imports
 * from this module, so putting it there and calling it from saveSkiDayDetails() below
 * would make the two modules mutually dependent.
 *
 * clampTitle() is applied server-bound as well as in the input's onChange, so a caller
 * that skips the form (or a future caller that does not exist yet) cannot trip the
 * ski_sessions_title_length CHECK and get a 400 instead of a clamp. "" becomes SQL NULL —
 * an empty-string title would render as a blank line in the Feed.
 *
 * .select("id, title").single() rather than a bare update: ski_sessions' UPDATE policy is
 * owner-only, and a refusal matches zero rows. Without the select that returns success
 * and silently saves nothing; with it, .single() raises and the caller can show the error.
 * Only two columns are named because a bare .select() makes PostgREST issue RETURNING *,
 * and this file's PROFILE_SELECT_COLUMNS comment explains why that pattern is avoided.
 */
export async function updateSessionTitle(sessionId, title) {
  const clamped = clampTitle(title)
  const { data, error } = await supabase
    .from("ski_sessions")
    .update({ title: clamped || null })
    .eq("id", sessionId)
    .select("id, title")
    .single()
  if (error) throw error
  return data?.title ?? null
}

/**
 * Every photo on a batch of sessions, in one query, with its public URL resolved at read
 * time — the batched shape of getActivityReactions/getActivityComments, not a per-card
 * lazy fetch. Single-session callers pass [sessionId].
 *
 * No visibility filtering belongs here: ski_session_photos_select routes through
 * can_see_ski_session(), so Postgres has already restricted this to days the caller can
 * see (migration 046).
 *
 * getPublicUrl() is synchronous and read-time, exactly as getTripMedia does it, so the
 * bucket can be renamed or fronted by a CDN without rewriting stored rows.
 */
export async function getSessionPhotos(sessionIds) {
  if (!sessionIds?.length) return []
  const { data, error } = await supabase
    .from("ski_session_photos")
    .select("id, session_id, user_id, storage_path, created_at")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: true })
  if (error) throw error

  return (data || []).map((p) => {
    const { data: urlData } = supabase.storage.from("ski-day-media").getPublicUrl(p.storage_path)
    return { ...p, url: urlData?.publicUrl || null }
  })
}

/**
 * Upload one photo and insert the row that points at it.
 *
 * Path is `${user.id}/${sessionId}/${timestamp}-${suffix}.${ext}` — USER ID FIRST, so the
 * bucket's self-delete policy's (storage.foldername(name))[1] = auth.uid()::text matches
 * (chat-media's shape, not trip-media's).
 *
 * The random suffix is a deliberate addition to the path convention migration 046
 * documents, and it is fully compatible with it: the migration constrains only the FIRST
 * folder segment, never the filename. uploadTripMedia uses a bare Date.now(), which is
 * safe there because a trip photo is picked one at a time — here a user picks up to six
 * at once, and two uploads landing in the same millisecond would collide under
 * `upsert: false` and fail the second one with a confusing storage error.
 *
 * On a failed DB insert the just-uploaded object is removed. uploadTripMedia does not do
 * this, and that is a gap rather than a precedent: ski_session_photos_insert can genuinely
 * refuse (it requires owns_ski_session(session_id)), and an orphaned object is invisible
 * to every UI in the app, so nothing would ever clean it up.
 */
export async function addSessionPhoto(sessionId, file) {
  const user = await getCurrentUser()
  const ext = (file?.name?.split(".").pop() || "jpg").toLowerCase()
  const suffix = Math.random().toString(36).slice(2, 8)
  const path = `${user.id}/${sessionId}/${Date.now()}-${suffix}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from("ski-day-media")
    .upload(path, file, { upsert: false })
  if (uploadError) throw uploadError

  const { data, error: dbError } = await supabase
    .from("ski_session_photos")
    .insert({ session_id: sessionId, user_id: user.id, storage_path: path })
    .select("id, session_id, user_id, storage_path, created_at")
    .single()

  if (dbError) {
    try {
      await supabase.storage.from("ski-day-media").remove([path])
    } catch {
      // Best effort. The insert error is the one worth surfacing — a leftover object is a
      // storage-cost problem, a swallowed insert failure is a data-loss problem.
    }
    throw dbError
  }

  const { data: urlData } = supabase.storage.from("ski-day-media").getPublicUrl(path)
  return { ...data, url: urlData?.publicUrl || null }
}

/**
 * Remove a photo: the stored object first, then the row that points at it — the same order
 * deleteTripMedia uses.
 *
 * That order is the safer failure mode of the two. If storage fails, the row survives and
 * still names the path, so the delete is retryable. If the row delete failed after storage
 * succeeded, the row would point at a missing object and render as a broken thumbnail —
 * bad, but recoverable by the user pressing remove again.
 *
 * Ownership is enforced by ski_session_photos_delete (owns_ski_session), which makes
 * someone else's photo match zero rows rather than error, so there is deliberately no
 * second ownership check here.
 */
export async function deleteSessionPhoto(photoId, storagePath) {
  const { error: storErr } = await supabase.storage.from("ski-day-media").remove([storagePath])
  if (storErr) throw storErr
  const { error } = await supabase.from("ski_session_photos").delete().eq("id", photoId)
  if (error) throw error
}

/**
 * Every tag on a batch of sessions, in one query, with the tagged person's profile
 * resolved. Single-session callers pass [sessionId].
 *
 * The profile resolve is a SECOND QUERY, not a `profiles:tagged_user_id(...)` embed. No FK
 * exists from ski_session_tags to profiles (only to auth.users), so an embed 400s at
 * runtime and the tagged-friends line would read as "nobody was tagged" forever — the
 * exact failure Feed-B's fix wave (commit 06404c9) had to undo across this file.
 */
export async function getSessionTags(sessionIds) {
  if (!sessionIds?.length) return []
  const { data, error } = await supabase
    .from("ski_session_tags")
    .select("id, session_id, tagged_user_id, tagged_by, created_at")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: true })
  if (error) throw error
  const tags = data || []
  if (!tags.length) return tags

  const userIds = [...new Set(tags.map((t) => t.tagged_user_id))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", userIds)
  const pm = new Map((profiles || []).map((p) => [p.id, p]))
  return tags.map((t) => ({ ...t, profiles: pm.get(t.tagged_user_id) || null }))
}

/**
 * Tag one friend onto one session. Returns the new row with its profile resolved, or null
 * if that person was already tagged.
 *
 * `ignoreDuplicates: true` matters and is not cosmetic. It makes PostgREST emit
 * ON CONFLICT DO NOTHING. A plain upsert would emit ON CONFLICT DO UPDATE, and
 * migration 046 creates **no UPDATE policy** on ski_session_tags — so the update branch
 * would be refused by RLS and a harmless re-tag (two devices saving the same set) would
 * surface as a permission error. DO NOTHING needs no UPDATE policy, and it is exactly the
 * idempotency the UNIQUE (session_id, tagged_user_id) constraint exists to provide.
 *
 * .maybeSingle(), not .single(): with DO NOTHING a duplicate returns zero rows, which
 * .single() would raise on.
 *
 * There is deliberately no client-side friendship check. ski_session_tags_insert requires
 * tagged_by = auth.uid() AND owns_ski_session(session_id) AND are_friends(tagged_user_id),
 * so tagging a stranger is refused by Postgres — the real boundary — not by a JS guard an
 * attacker never runs. And no notification row is written: tagging is silent by design.
 */
export async function addSessionTag(sessionId, friendUserId) {
  const user = await getCurrentUser()
  const { data, error } = await supabase
    .from("ski_session_tags")
    .upsert(
      { session_id: sessionId, tagged_user_id: friendUserId, tagged_by: user.id },
      { onConflict: "session_id,tagged_user_id", ignoreDuplicates: true }
    )
    .select("id, session_id, tagged_user_id, tagged_by, created_at")
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .eq("id", friendUserId)
    .maybeSingle()

  return { ...data, profiles: profile || null }
}

/**
 * Remove one tag by id. Used both by the owner (untag someone) and by the tagged person
 * (self-untag) — ski_session_tags_delete permits both and makes anything else match zero
 * rows, so no ownership branch is needed here.
 */
export async function removeSessionTag(tagId) {
  const { error } = await supabase.from("ski_session_tags").delete().eq("id", tagId)
  if (error) throw error
}

/**
 * Make the session's tag set equal `wantedUserIds`, adding and removing the difference.
 *
 * The UI is a checkbox list — it naturally produces a full wanted set, not a delta — but
 * writing that set blindly would either duplicate rows or need an UPDATE policy that does
 * not exist. So the diff is computed here, once, against the CURRENT rows read fresh at
 * save time (not against whatever the form was seeded with, which may be minutes stale if
 * the day was edited on another device meanwhile).
 *
 * Sequential awaits, not Promise.all: N is at most the caller's friend count, and a
 * partial failure inside Promise.all leaves an unpredictable half-applied set while
 * reporting only one of the errors. Adds run before removes so an interrupted reconcile
 * errs toward keeping people tagged rather than silently dropping them.
 *
 * @param {string} sessionId
 * @param {Array<string>|Set<string>|null|undefined} wantedUserIds the FULL wanted set
 * @returns {Promise<{added: number, removed: number}>}
 */
export async function reconcileSessionTags(sessionId, wantedUserIds) {
  const wanted = new Set([...(wantedUserIds || [])].filter(Boolean))
  const current = await getSessionTags([sessionId])
  const currentIds = new Set(current.map((t) => t.tagged_user_id))

  const toAdd = [...wanted].filter((id) => !currentIds.has(id))
  const toRemove = current.filter((t) => !wanted.has(t.tagged_user_id))

  for (const id of toAdd) {
    await addSessionTag(sessionId, id)
  }
  for (const t of toRemove) {
    await removeSessionTag(t.id)
  }

  return { added: toAdd.length, removed: toRemove.length }
}

/**
 * The single orchestrator all three UI consumers (LogDayModal, SessionRecapModal,
 * SessionEditForm) call, so the diff→API translation exists exactly once.
 *
 * `diff` is what SkiDayDetailsForm's onSave emits:
 *   { title, addedPhotoFiles, removedPhotoIds, tagUserIds }
 *
 * Two properties of that shape are load-bearing:
 *
 *   - `tagUserIds` is the FULL WANTED SET, never a delta. reconcileSessionTags does the
 *     diffing.
 *   - **An ABSENT key means "do not touch this".** `tagUserIds: undefined` leaves tags
 *     exactly as they are; `tagUserIds: []` clears them. That distinction is the whole
 *     mechanism behind Task 9's tag-wipe guard — a user who opens the edit modal, changes
 *     only the resort, and saves must not have every existing tag deleted. Same for
 *     `title: undefined` vs `title: ""`.
 *
 * Removals run before additions so a user who deletes two photos and adds two in one save
 * is never transiently over MAX_PHOTOS_PER_SESSION and refused by the picker's own count.
 *
 * Storage paths are re-read from the DB rather than trusted from the caller: a client-
 * supplied path would let a caller name any object in the bucket, and RLS on
 * storage.objects is keyed on the path's first folder — not on the ski_session_photos row.
 * Reading the row first means only paths that genuinely belong to this session are removed.
 *
 * Returns the session's photos and tags AFTER the save so the caller can reseed its form
 * (or splice the Feed) without a second refetch. No realtime anywhere in this slice.
 */
export async function saveSkiDayDetails(sessionId, diff) {
  if (!sessionId) throw new Error("saveSkiDayDetails needs a session id.")

  const { title, addedPhotoFiles, removedPhotoIds, tagUserIds } = diff || {}

  if (title !== undefined) {
    await updateSessionTitle(sessionId, title)
  }

  if (removedPhotoIds?.length) {
    const existing = await getSessionPhotos([sessionId])
    const byId = new Map(existing.map((p) => [p.id, p]))
    for (const photoId of removedPhotoIds) {
      const row = byId.get(photoId)
      // Already gone (a double-tap on remove, or another device deleted it). Skipping is
      // correct — calling storage remove on a missing object is not an error worth
      // failing the whole save over.
      if (!row) continue
      await deleteSessionPhoto(row.id, row.storage_path)
    }
  }

  if (addedPhotoFiles?.length) {
    for (const file of addedPhotoFiles) {
      await addSessionPhoto(sessionId, file)
    }
  }

  if (tagUserIds !== undefined) {
    await reconcileSessionTags(sessionId, tagUserIds)
  }

  const [photos, tags] = await Promise.all([
    getSessionPhotos([sessionId]),
    getSessionTags([sessionId]),
  ])
  return { photos, tags }
}

// ─── Mountain Board (sprint-29) ─────────────────────────────────────────────

export async function getResortCoordinates() {
  const { data, error } = await supabase.from("resort_coordinates").select("*")
  if (error) throw error
  return data || []
}

export async function getBoardPosts(resortKey, limit = 50) {
  // No FK exists from mountain_board_posts.author_id to profiles (only
  // to auth.users), so a PostgREST embedded select here always 400s.
  // Resolve profiles with a separate query instead, matching this file's
  // established pattern elsewhere (e.g. getTripDetail's host_profile/profile).
  const { data, error } = await supabase
    .from("mountain_board_posts")
    .select("*")
    .eq("resort_key", resortKey)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  const posts = data || []
  if (!posts.length) return posts

  const authorIds = [...new Set(posts.map((p) => p.author_id))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", authorIds)

  const pm = new Map((profiles || []).map((p) => [p.id, p]))
  return posts.map((p) => ({ ...p, profiles: pm.get(p.author_id) || null }))
}

export async function createBoardPost({ resortKey, category, content, lat, lng }) {
  const { data, error } = await supabase.rpc("create_board_post", {
    p_resort_key: resortKey, p_category: category, p_content: content, p_lat: lat, p_lng: lng,
  })
  if (error) throw error
  return data
}

export async function reportBoardPost(postId) {
  const { error } = await supabase.rpc("report_board_post", { p_post_id: postId })
  if (error) throw error
}

export async function getMountainEvents(resortKey, limit = 20) {
  // Same no-FK-to-profiles situation as getBoardPosts above — resolve
  // profiles with a separate query rather than a PostgREST embed.
  const { data, error } = await supabase
    .from("mountain_events")
    .select("*")
    .eq("resort_key", resortKey)
    .gte("event_date", localDateKey())
    .order("event_date", { ascending: true })
    .limit(limit)
  if (error) throw error
  const events = data || []
  if (!events.length) return events

  const authorIds = [...new Set(events.map((e) => e.created_by))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", authorIds)

  const pm = new Map((profiles || []).map((p) => [p.id, p]))
  return events.map((e) => ({ ...e, profiles: pm.get(e.created_by) || null }))
}

export async function createMountainEvent({ resortKey, title, description, eventDate, linkUrl }) {
  const user = await getCurrentUser()
  const { data, error } = await supabase
    .from("mountain_events")
    .insert({
      resort_key: resortKey,
      title: title.trim(),
      description: description?.trim() || null,
      event_date: eventDate,
      link_url: linkUrl?.trim() || null,
      created_by: user.id,
    })
    .select()
    .single()
  if (error) throw error
  return data
}
