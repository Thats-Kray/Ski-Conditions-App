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
        full_name
      )
    `)
    .eq("ski_date", skiDate)
    .order("eta", { ascending: true })

  if (error) throw error
  return data || []
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
