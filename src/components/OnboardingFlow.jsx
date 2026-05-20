import { useState } from "react"
import { upsertMyProfile, searchProfiles, sendFriendRequest } from "../lib/socialApi"

const STEPS = ["welcome", "profile", "friends", "done"]

const PASS_OPTIONS = ["Epic", "Ikon", "Mountain Collective", "Indy", "Loveland"]
const SPORT_OPTIONS = [
  { key: "ski",       label: "Skier",      emoji: "⛷️" },
  { key: "snowboard", label: "Boarder",    emoji: "🏂" },
  { key: "both",      label: "Both",       emoji: "🤙" },
]
const SKILL_OPTIONS = [
  { key: "green",        label: "Green",       color: "#22c55e", desc: "Groomers & cruisers" },
  { key: "blue",         label: "Blue",         color: "#60a5fa", desc: "Solid intermediate" },
  { key: "black",        label: "Black",        color: "rgba(255,255,255,0.9)", desc: "Advanced" },
  { key: "double_black", label: "Double Black", color: "#f43f5e", desc: "Expert lines" },
  { key: "experts_only", label: "Experts Only", color: "#c084fc", desc: "No boundaries" },
]

const overlay = { position: "fixed", inset: 0, background: "rgba(2,6,23,0.94)", backdropFilter: "blur(16px)", zIndex: 500, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "20px 16px max(40px, env(safe-area-inset-bottom)) 16px" }
const card = { width: "100%", maxWidth: 480, background: "#0b1424", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 28, boxShadow: "0 40px 100px rgba(0,0,0,0.75)", display: "flex", flexDirection: "column", maxHeight: "calc(100dvh - 40px)" }

const inputStyle = { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "white", padding: "11px 14px", borderRadius: 12, outline: "none", fontSize: 16, fontFamily: "inherit", width: "100%", boxSizing: "border-box" }

// ── Step 1: Welcome ──────────────────────────────────────────────────────────
function WelcomeStep({ onNext }) {
  return (
    <div style={{ padding: "40px 32px 36px", textAlign: "center", display: "grid", gap: 20 }}>
      <div style={{ fontSize: 52 }}>⛷️</div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 900, color: "white", letterSpacing: -0.5, lineHeight: 1.1 }}>Welcome to PowderDays</div>
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", marginTop: 10, lineHeight: 1.7 }}>
          Plan powder days with your crew.<br />
          Let's get you set up in 3 quick steps.
        </div>
      </div>
      <div style={{ display: "grid", gap: 10, textAlign: "left", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "16px 18px" }}>
        {[
          { n: "1", label: "Build your skier profile", desc: "Pass, skill level & ride style" },
          { n: "2", label: "Find your crew",           desc: "Add friends to plan trips with" },
          { n: "3", label: "Drop your first trip",     desc: "Pick a mountain and send invites" },
        ].map(({ n, label, desc }) => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 999, background: "rgba(96,165,250,0.2)", border: "1px solid rgba(96,165,250,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: "#60a5fa", flexShrink: 0 }}>{n}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{label}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={onNext} style={{ background: "linear-gradient(135deg,#2563eb,#0891b2)", color: "white", border: "none", borderRadius: 16, padding: "14px", fontSize: 15, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 28px rgba(37,99,235,0.4)" }}>
        Let's Go 🏔️
      </button>
    </div>
  )
}

// ── Step 2: Profile ──────────────────────────────────────────────────────────
function ProfileStep({ onNext, onSkip }) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName]   = useState("")
  const [username, setUsername]   = useState("")
  const [sportType, setSportType] = useState("")
  const [skillLevel, setSkillLevel] = useState("")
  const [skiPasses, setSkiPasses] = useState([])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState("")

  function togglePass(p) { setSkiPasses((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]) }

  async function handleSave() {
    if (!firstName.trim() || !username.trim()) { setError("First name and username are required."); return }
    setSaving(true); setError("")
    try {
      await upsertMyProfile({ first_name: firstName.trim(), last_name: lastName.trim(), username: username.trim(), ski_passes: skiPasses, sport_type: sportType || null, skill_level: skillLevel || null })
      onNext()
    } catch (e) { setError(e.message || "Could not save profile.") }
    finally { setSaving(false) }
  }

  return (
    <>
      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "28px 24px 8px", display: "grid", gap: 18 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "white" }}>Your Skier Profile</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>This helps your crew know who you are</div>
        </div>

        {/* Name */}
        <div style={{ display: "grid", gap: 10 }}>
          <input type="text" placeholder="First name *" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} />
          <input type="text" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} />
          <input type="text" placeholder="Username * (e.g. kraypowder)" value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} />
        </div>

        {/* Sport */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>I ride on…</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {SPORT_OPTIONS.map(({ key, label, emoji }) => {
              const active = sportType === key
              return (
                <button key={key} type="button" onClick={() => setSportType(active ? "" : key)}
                  style={{ padding: "12px 8px", borderRadius: 12, border: active ? "1.5px solid #60a5fa" : "1.5px solid rgba(255,255,255,0.1)", background: active ? "rgba(96,165,250,0.14)" : "rgba(255,255,255,0.04)", color: active ? "#60a5fa" : "rgba(255,255,255,0.65)", fontWeight: 800, fontSize: 12, cursor: "pointer", display: "grid", gap: 4, justifyItems: "center" }}
                >
                  <span style={{ fontSize: 22 }}>{emoji}</span><span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Skill */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Skill Level</div>
          <div style={{ display: "grid", gap: 6 }}>
            {SKILL_OPTIONS.map(({ key, label, color, desc }) => {
              const active = skillLevel === key
              return (
                <button key={key} type="button" onClick={() => setSkillLevel(active ? "" : key)}
                  style={{ padding: "10px 14px", borderRadius: 12, border: active ? `1.5px solid ${color}55` : "1.5px solid rgba(255,255,255,0.08)", background: active ? `${color}18` : "rgba(255,255,255,0.03)", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                >
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0 }} />
                  <span style={{ fontWeight: 800, fontSize: 13, color: active ? color : "rgba(255,255,255,0.7)" }}>{label}</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.32)", marginLeft: "auto" }}>{desc}</span>
                  {active && <span style={{ color }}>✓</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Passes */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Season Passes</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {PASS_OPTIONS.map((p) => {
              const active = skiPasses.includes(p)
              return (
                <button key={p} type="button" onClick={() => togglePass(p)}
                  style={{ background: active ? "linear-gradient(135deg,#22c55e,#14b8a6)" : "rgba(255,255,255,0.06)", color: active ? "#052e2b" : "rgba(255,255,255,0.75)", border: "none", padding: "8px 14px", borderRadius: 999, fontWeight: 800, fontSize: 13, cursor: "pointer" }}
                >
                  {p}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Sticky footer — always visible */}
      <div style={{ flexShrink: 0, padding: "12px 24px 28px", borderTop: "1px solid rgba(255,255,255,0.07)", background: "#0b1424" }}>
        {error && <div style={{ fontSize: 13, color: "#fda4af", background: "rgba(244,63,94,0.1)", borderRadius: 10, padding: "9px 12px", marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onSkip} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "12px 18px", color: "rgba(255,255,255,0.5)", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Skip</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 1, background: saving ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#2563eb,#0891b2)", color: saving ? "rgba(255,255,255,0.4)" : "white", border: "none", borderRadius: 14, padding: "13px", fontWeight: 900, cursor: saving ? "wait" : "pointer", fontSize: 14, boxShadow: saving ? "none" : "0 6px 24px rgba(37,99,235,0.35)" }}>
            {saving ? "Saving…" : "Save & Continue →"}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Step 3: Find friends ─────────────────────────────────────────────────────
function FriendsStep({ onNext }) {
  const [query, setQuery]       = useState("")
  const [results, setResults]   = useState([])
  const [sent, setSent]         = useState(new Set())
  const [searching, setSearching] = useState(false)

  async function handleSearch(e) {
    const q = e.target.value
    setQuery(q)
    if (q.trim().length < 2) { setResults([]); return }
    setSearching(true)
    try {
      const users = await searchProfiles(q.trim())
      setResults(users || [])
    } catch { setResults([]) }
    finally { setSearching(false) }
  }

  async function handleAdd(userId) {
    try {
      await sendFriendRequest(userId)
      setSent((prev) => new Set([...prev, userId]))
    } catch {}
  }

  return (
    <>
      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "28px 24px 8px", display: "grid", gap: 18, alignContent: "start" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "white" }}>Find Your Crew</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>Search by name or username to add friends</div>
        </div>

        <div style={{ position: "relative" }}>
          <input
            type="text"
            placeholder="Search by name or @username…"
            value={query}
            onChange={handleSearch}
            style={{ ...inputStyle, paddingLeft: 40 }}
            autoFocus
          />
          <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 16, opacity: 0.5 }}>🔍</span>
        </div>

        {searching && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>Searching…</div>}

        {results.length > 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            {results.map((u) => {
              const added = sent.has(u.id)
              return (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 12px" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 999, background: "rgba(96,165,250,0.2)", border: "1px solid rgba(96,165,250,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#93c5fd", overflow: "hidden", flexShrink: 0 }}>
                    {u.avatar_url ? <img src={u.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (u.full_name || u.username || "?").charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{u.full_name || u.username}</div>
                    {u.username && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>@{u.username}</div>}
                  </div>
                  <button
                    onClick={() => handleAdd(u.id)}
                    disabled={added}
                    style={{ background: added ? "rgba(34,197,94,0.15)" : "rgba(96,165,250,0.15)", border: `1px solid ${added ? "rgba(34,197,94,0.3)" : "rgba(96,165,250,0.3)"}`, borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 800, color: added ? "#22c55e" : "#60a5fa", cursor: added ? "default" : "pointer" }}
                  >
                    {added ? "✓ Sent" : "+ Add"}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {query.length >= 2 && !searching && results.length === 0 && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "12px 0" }}>No users found. They may not have signed up yet.</div>
        )}

        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "12px 14px", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 20 }}>💬</span>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>
            You can also share your invite link from your Profile page to bring friends onto PowderDays.
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div style={{ flexShrink: 0, padding: "12px 24px 28px", borderTop: "1px solid rgba(255,255,255,0.07)", background: "#0b1424" }}>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onNext} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "12px 18px", color: "rgba(255,255,255,0.5)", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Skip</button>
          <button onClick={onNext} style={{ flex: 1, background: "linear-gradient(135deg,#2563eb,#0891b2)", color: "white", border: "none", borderRadius: 14, padding: "13px", fontWeight: 900, cursor: "pointer", fontSize: 14, boxShadow: "0 6px 24px rgba(37,99,235,0.35)" }}>
            {sent.size > 0 ? `Added ${sent.size} — Continue →` : "Continue →"}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Step 4: Done ─────────────────────────────────────────────────────────────
function DoneStep({ onFinish }) {
  return (
    <div style={{ padding: "40px 32px 36px", textAlign: "center", display: "grid", gap: 20 }}>
      <div style={{ fontSize: 52 }}>🎉</div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 900, color: "white", letterSpacing: -0.4 }}>You're all set!</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginTop: 10, lineHeight: 1.7 }}>
          Head to <strong style={{ color: "white" }}>Plans</strong> to create your first trip and send invites to your crew.
        </div>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {[
          { icon: "🏔️", text: "Check today's conditions on the Dashboard" },
          { icon: "🎿", text: "Create a trip on the Plans tab" },
          { icon: "❤️", text: "Browse friends' trips under Friends" },
          { icon: "👤", text: "Fine-tune your profile anytime" },
        ].map(({ icon, text }) => (
          <div key={text} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "10px 14px" }}>
            <span style={{ fontSize: 18 }}>{icon}</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{text}</span>
          </div>
        ))}
      </div>
      <button onClick={onFinish} style={{ background: "linear-gradient(135deg,#22c55e,#14b8a6)", color: "#052e16", border: "none", borderRadius: 16, padding: "14px", fontSize: 15, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 28px rgba(34,197,94,0.35)" }}>
        Let's Ride 🎿
      </button>
    </div>
  )
}

// ── Progress dots ────────────────────────────────────────────────────────────
function StepDots({ step }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "16px 0 0" }}>
      {STEPS.map((s, i) => (
        <div key={s} style={{ width: i === STEPS.indexOf(step) ? 22 : 8, height: 8, borderRadius: 999, background: i <= STEPS.indexOf(step) ? "#60a5fa" : "rgba(255,255,255,0.15)", transition: "all 0.25s ease", boxShadow: i === STEPS.indexOf(step) ? "0 0 8px rgba(96,165,250,0.6)" : "none" }} />
      ))}
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────
export default function OnboardingFlow({ onComplete }) {
  const [step, setStep] = useState("welcome")

  function next() {
    const idx = STEPS.indexOf(step)
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1])
  }

  function finish() {
    localStorage.setItem("powderdays_onboarded", "1")
    onComplete?.()
  }

  return (
    <div style={overlay}>
      <div style={card}>
        {step !== "welcome" && step !== "done" && <StepDots step={step} />}
        {step === "welcome" && <WelcomeStep onNext={next} />}
        {step === "profile" && <ProfileStep onNext={next} onSkip={next} />}
        {step === "friends" && <FriendsStep onNext={next} />}
        {step === "done"    && <DoneStep    onFinish={finish} />}
      </div>
    </div>
  )
}
