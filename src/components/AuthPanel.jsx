import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

export default function AuthPanel() {
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleMagicLink(e) {
    e.preventDefault()
    setMessage("")

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage("Check your email for the sign-in link.")
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setMessage("Signed out.")
  }

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 18,
        padding: 16,
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 16 }}>Account</div>

      {user ? (
        <>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 14 }}>
            Signed in as <strong>{user.email}</strong>
          </div>
          <button
            onClick={handleSignOut}
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.12)",
              padding: "10px 12px",
              borderRadius: 12,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Sign Out
          </button>
        </>
      ) : (
        <form onSubmit={handleMagicLink} style={{ display: "grid", gap: 10 }}>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "white",
              padding: "10px 12px",
              borderRadius: 12,
              outline: "none",
            }}
            required
          />
          <button
            type="submit"
            style={{
              background: "linear-gradient(135deg, #2563eb, #0891b2)",
              color: "white",
              border: "none",
              padding: "10px 12px",
              borderRadius: 12,
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Send Magic Link
          </button>
        </form>
      )}

      {message && (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)" }}>
          {message}
        </div>
      )}
    </div>
  )
}