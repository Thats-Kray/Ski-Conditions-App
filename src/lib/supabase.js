import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase environment variables. Check your .env.local file."
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Auth headers for calls to our own backend (server/routes/*), which verifies
 * the Supabase JWT rather than trusting a userId in the request body.
 * Throws when signed out so callers surface a real error instead of firing an
 * unauthenticated request that comes back as an opaque 401.
 */
export async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token

  if (!token) throw new Error("You must be signed in to do that.")

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }
}