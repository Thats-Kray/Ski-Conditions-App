import { supabase } from "./supabase"

export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) throw error
  return user
}

export async function getMyProfile() {
  const user = await getCurrentUser()
  if (!user) return null

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  if (error) throw error
  return data
}

export async function uploadProfilePhoto(file) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in.")
  if (!file) throw new Error("No file selected.")

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"
  const filePath = `${user.id}/avatar-${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from("profile-photos")
    .upload(filePath, file, {
      upsert: true,
    })

  if (uploadError) throw uploadError

  const { data } = supabase.storage
    .from("profile-photos")
    .getPublicUrl(filePath)

  return data.publicUrl
}

export async function upsertMyProfile({
  first_name,
  last_name,
  username,
  avatar_url,
  ski_passes,
  favorite_mountain,
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in.")

  const cleanFirstName = first_name?.trim() || null
  const cleanLastName = last_name?.trim() || null
  const cleanUsername = username?.trim().toLowerCase() || null
  const cleanAvatarUrl = avatar_url?.trim() || null
  const cleanFavoriteMountain = favorite_mountain?.trim() || null
  const cleanPasses = Array.isArray(ski_passes) ? ski_passes : []

  if (!cleanFirstName) throw new Error("First name is required.")
  if (!cleanLastName) throw new Error("Last name is required.")
  if (!cleanUsername) throw new Error("Username is required.")

  const full_name = `${cleanFirstName} ${cleanLastName}`.trim()

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        first_name: cleanFirstName,
        last_name: cleanLastName,
        full_name,
        username: cleanUsername,
        avatar_url: cleanAvatarUrl,
        ski_passes: cleanPasses,
        favorite_mountain: cleanFavoriteMountain,
      },
      {
        onConflict: "id",
      }
    )
    .select()
    .single()

  if (error) {
    if (
      error.message?.toLowerCase().includes("duplicate") ||
      error.message?.toLowerCase().includes("unique")
    ) {
      throw new Error("That username is already taken.")
    }
    throw error
  }

  return data
}

export async function upsertDailyPlan({
  skiDate,
  resortKey,
  eta,
  status = "planning",
  visibility = "friends",
  note = null,
}) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in.")

  const { data, error } = await supabase
    .from("daily_plans")
    .upsert(
      {
        user_id: user.id,
        ski_date: skiDate,
        resort_key: resortKey,
        eta,
        status,
        visibility,
        note,
      },
      {
        onConflict: "user_id,ski_date",
      }
    )
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getMyDailyPlan(skiDate) {
  const user = await getCurrentUser()
  if (!user) return null

  const { data, error } = await supabase
    .from("daily_plans")
    .select("*")
    .eq("user_id", user.id)
    .eq("ski_date", skiDate)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getTodaysVisiblePlans(skiDate) {
  const user = await getCurrentUser()
  if (!user) return []

  const { data, error } = await supabase
    .from("daily_plans")
    .select(`
      id,
      ski_date,
      resort_key,
      eta,
      arrived_at,
      status,
      visibility,
      note,
      user_id,
      profiles (
        username,
        full_name,
        first_name,
        last_name,
        avatar_url,
        ski_passes,
        favorite_mountain
      )
    `)
    .eq("ski_date", skiDate)
    .neq("status", "cancelled")
    .order("eta", { ascending: true })

  if (error) throw error
  return data || []
}

export async function markDriving(skiDate) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in.")

  const { data, error } = await supabase
    .from("daily_plans")
    .update({
      status: "driving",
    })
    .eq("user_id", user.id)
    .eq("ski_date", skiDate)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function markArrival(skiDate) {
  const user = await getCurrentUser()
  if (!user) throw new Error("You must be signed in.")

  const { data, error } = await supabase
    .from("daily_plans")
    .update({
      status: "arrived",
      arrived_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("ski_date", skiDate)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getResortSkierCounts(skiDate) {
  const plans = await getTodaysVisiblePlans(skiDate)

  const counts = {}

  for (const plan of plans) {
    const key = plan.resort_key
    if (!key) continue
    counts[key] = (counts[key] || 0) + 1
  }

  return counts
}

export async function getResortSkierDetails(skiDate) {
  const plans = await getTodaysVisiblePlans(skiDate)

  const grouped = {}

  for (const plan of plans) {
    const key = plan.resort_key
    if (!key) continue

    if (!grouped[key]) grouped[key] = []

    grouped[key].push({
      id: plan.id,
      user_id: plan.user_id,
      status: plan.status,
      eta: plan.eta,
      arrived_at: plan.arrived_at,
      note: plan.note,
      full_name: plan?.profiles?.full_name || null,
      first_name: plan?.profiles?.first_name || null,
      last_name: plan?.profiles?.last_name || null,
      username: plan?.profiles?.username || null,
      avatar_url: plan?.profiles?.avatar_url || null,
      ski_passes: plan?.profiles?.ski_passes || [],
      favorite_mountain: plan?.profiles?.favorite_mountain || null,
    })
  }

  return grouped
}