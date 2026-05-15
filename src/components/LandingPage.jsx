import { useEffect, useState } from "react"

// ── Swap headline here (1, 2, or 3) ──────────────────────────────────────────
const HEADLINE = "The group chat for your ski season."
// const HEADLINE = "Plan the season with your crew. Powered by 10 years of snow data."
// const HEADLINE = "Where's your crew skiing next? Plan it here."

const SUBHEAD = "Add your friends, plan trips together, track your season, and use a decade of snowfall data to pick the right week."

const RESORTS = [
  "Breckenridge", "Vail", "Winter Park", "Copper Mountain",
  "Steamboat", "Telluride", "Arapahoe Basin", "Crested Butte",
  "Keystone", "Eldora", "Aspen Snowmass", "Beaver Creek",
]

// ── Nav ───────────────────────────────────────────────────────────────────────

function Nav({ scrolled, onSignIn, onSignUp, onBrowse, scrollTo }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: "0 20px",
      background: scrolled ? "rgba(2,6,23,0.95)" : "transparent",
      backdropFilter: scrolled ? "blur(16px)" : "none",
      borderBottom: scrolled ? "1px solid rgba(255,255,255,0.07)" : "none",
      transition: "background 0.25s, backdrop-filter 0.25s, border 0.25s",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#2563eb,#0891b2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>❄️</div>
          <span style={{ fontSize: 17, fontWeight: 900, color: "white", letterSpacing: -0.3 }}>PowderDays</span>
        </div>

        {/* Desktop nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, "@media(max-width:640px)": { display: "none" } }}>
          <button onClick={() => scrollTo("features")} style={navLink}>Features</button>
          <button onClick={() => scrollTo("how-it-works")} style={navLink}>How It Works</button>
          <button onClick={onBrowse} style={navLink}>Live Conditions</button>
          <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.12)", margin: "0 6px" }} />
          <button onClick={onSignIn} style={navLinkBold}>Sign In</button>
          <button onClick={onSignUp} style={navCta}>Start your season</button>
        </div>

        {/* Mobile: Sign In + hamburger placeholder */}
        <div style={{ display: "none" }}>
          <button onClick={onSignIn} style={navLinkBold}>Sign In</button>
        </div>
      </div>

      {/* Responsive: two CTA buttons row on small screens below nav */}
      <style>{`
        @media(max-width:640px) {
          .nav-desktop { display: none !important; }
          .nav-mobile { display: flex !important; }
        }
      `}</style>
    </nav>
  )
}

const navLink = {
  background: "none", border: "none", color: "rgba(255,255,255,0.55)",
  fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "6px 10px",
  borderRadius: 8, transition: "color 0.15s",
}
const navLinkBold = { ...navLink, color: "rgba(255,255,255,0.85)", fontWeight: 700 }
const navCta = {
  padding: "8px 16px", borderRadius: 10, border: "none",
  background: "linear-gradient(135deg,#2563eb,#0891b2)",
  color: "white", fontWeight: 800, fontSize: 14, cursor: "pointer",
  boxShadow: "0 2px 12px rgba(37,99,235,0.4)",
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero({ onSignUp, scrollTo }) {
  return (
    <section style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      padding: "100px 20px 80px",
      background: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(37,99,235,0.18) 0%, transparent 70%), rgba(2,6,23,1)",
      position: "relative", overflow: "hidden",
    }}>
      {/* Background glow accents */}
      <div style={{ position: "absolute", top: "15%", left: "5%", width: 300, height: 300, borderRadius: "50%", background: "rgba(37,99,235,0.06)", filter: "blur(80px)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "20%", right: "5%", width: 250, height: 250, borderRadius: "50%", background: "rgba(8,145,178,0.07)", filter: "blur(60px)", pointerEvents: "none" }} />

      <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%", display: "flex", alignItems: "center", gap: 60, flexWrap: "wrap", position: "relative", zIndex: 1 }}>

        {/* Left: copy */}
        <div style={{ flex: "1 1 320px", minWidth: 280 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(37,99,235,0.12)", border: "1px solid rgba(96,165,250,0.25)",
            borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700,
            color: "#93c5fd", marginBottom: 24,
          }}>
            ❄️ Now open for 2025–26 season
          </div>

          <h1 style={{
            margin: 0, fontSize: "clamp(2.2rem, 6vw, 3.4rem)", fontWeight: 900,
            lineHeight: 1.1, letterSpacing: -1.5, color: "white",
            marginBottom: 20,
          }}>
            {HEADLINE}
          </h1>

          <p style={{
            margin: 0, fontSize: "clamp(1rem, 2.5vw, 1.15rem)",
            color: "rgba(255,255,255,0.58)", lineHeight: 1.65,
            marginBottom: 36, maxWidth: 480,
          }}>
            {SUBHEAD}
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={onSignUp}
              style={{
                padding: "14px 28px", borderRadius: 12, border: "none",
                background: "linear-gradient(135deg,#2563eb,#0891b2)",
                color: "white", fontWeight: 800, fontSize: 16, cursor: "pointer",
                boxShadow: "0 4px 24px rgba(37,99,235,0.45)",
                letterSpacing: -0.2,
              }}
            >
              Start your season →
            </button>
            <button
              onClick={() => scrollTo("how-it-works")}
              style={{
                padding: "14px 24px", borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.8)", fontWeight: 700, fontSize: 16, cursor: "pointer",
              }}
            >
              See how it works
            </button>
          </div>

          <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 10 }}>
            {["K","S","J","A","M"].map((l, i) => (
              <div key={l} style={{
                width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(2,6,23,1)",
                marginLeft: i === 0 ? 0 : -10,
                background: ["#2563eb","#16a34a","#9333ea","#ea580c","#0891b2"][i],
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800, color: "white",
              }}>{l}</div>
            ))}
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginLeft: 6 }}>Your crew is waiting</span>
          </div>
        </div>

        {/* Right: hero mockup */}
        <div style={{ flex: "1 1 300px", maxWidth: 380, position: "relative" }}>
          <div style={{ position: "relative" }}>
            {/* Main card */}
            <img src="/screenshots/IMG_7796.PNG" alt="PowderDays trip planner" style={{ width: "100%", borderRadius: 16, display: "block", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }} />
            {/* Floating leaderboard badge */}
            <div style={{
              position: "absolute", bottom: -24, right: -20,
              background: "rgba(8,12,28,0.98)", border: "1px solid rgba(251,191,36,0.25)",
              borderRadius: 14, padding: "10px 14px", boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{ fontSize: 20 }}>🏆</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: "white" }}>Sarah leads</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>47 days · your crew</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Social Proof ──────────────────────────────────────────────────────────────

function SocialProof() {
  const stats = [
    { val: "90+",      label: "Resorts tracked" },
    { val: "10 yrs",   label: "Of snowfall data" },
    { val: "Colorado", label: "Home mountain range" },
    { val: "Free",     label: "To start" },
  ]
  return (
    <div style={{
      borderTop: "1px solid rgba(255,255,255,0.07)",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
      background: "rgba(255,255,255,0.02)",
      padding: "24px 20px",
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "16px 40px" }}>
        {stats.map((s) => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "white", letterSpacing: -0.5 }}>{s.val}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Features ──────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    emoji: "🎿",
    title: "Plan Trips With Your Crew",
    desc: "Group trip planner with shared dates, who's in / who's out, lodging notes, and a group chat per trip. No more coordinating across seven group texts.",
    accent: "#2563eb",
    mockup: <img src="/screenshots/IMG_7796.PNG" alt="Trip planner showing Spring Skiing at Arapahoe Basin with shared logistics" style={{ width: "100%", borderRadius: 12, display: "block" }} />,
  },
  {
    emoji: "🏆",
    title: "The Season Leaderboard",
    desc: "Track your days, vertical, and resorts. Settle who actually skied the most this season — and brag (or humble-brag) accordingly.",
    accent: "#fbbf24",
    mockup: <img src="/screenshots/IMG_7797.PNG" alt="Trip chat showing guest list and crew coordination" style={{ width: "100%", borderRadius: 12, display: "block" }} />,
  },
  {
    emoji: "❄️",
    title: "Pick the Right Week",
    desc: "Powder probability and 10 years of historical snowfall for 90+ resorts. Find the best week to book before someone else does.",
    accent: "#67e8f9",
    mockup: <img src="/screenshots/IMG_7798.PNG" alt="Conditions dashboard showing powder scores and pass filters" style={{ width: "100%", borderRadius: 12, display: "block" }} />,
  },
  {
    emoji: "📍",
    title: "Your Season, One Place",
    desc: "Trips, friends, stats, and snow data all in one app instead of seven group chats and three browser tabs.",
    accent: "#a78bfa",
    mockup: <img src="/screenshots/IMG_7799.PNG" alt="Profile page showing season stats, passes, vehicle, and crew" style={{ width: "100%", borderRadius: 12, display: "block" }} />,
  },
]

function Features() {
  return (
    <section id="features" style={{ padding: "96px 20px", background: "rgba(2,6,23,1)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)",
            borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700,
            color: "#60a5fa", marginBottom: 16,
          }}>
            Everything your crew needs
          </div>
          <h2 style={{ margin: 0, fontSize: "clamp(1.8rem, 4vw, 2.6rem)", fontWeight: 900, color: "white", letterSpacing: -0.8, lineHeight: 1.15 }}>
            Built for how ski crews actually work
          </h2>
          <p style={{ margin: "14px auto 0", maxWidth: 480, fontSize: 16, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
            Not a weather app with a bolt-on social tab. The social layer is the point.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 20, padding: 24, display: "flex", flexDirection: "column", gap: 16,
              transition: "border-color 0.2s, transform 0.2s",
            }}>
              {/* Header */}
              <div>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, marginBottom: 12,
                  background: `${f.accent}18`, border: `1px solid ${f.accent}30`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                }}>
                  {f.emoji}
                </div>
                <div style={{ fontSize: 17, fontWeight: 900, color: "white", marginBottom: 6, letterSpacing: -0.3 }}>{f.title}</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{f.desc}</div>
              </div>
              {/* Mini mockup */}
              <div style={{ marginTop: "auto", opacity: 0.92 }}>
                {f.mockup}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── How It Works ──────────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    { n: "1", title: "Add your friends.", desc: "Find your crew by username. Build your network before the season kicks off." },
    { n: "2", title: "Plan a trip.", desc: "Pick a resort, lock dates, invite your crew. Share the link — even if they're not on PowderDays yet." },
    { n: "3", title: "Chase the leaderboard.", desc: "Log every day on the mountain. Track your stats. Settle who skied the most." },
  ]
  return (
    <section id="how-it-works" style={{
      padding: "96px 20px",
      background: "radial-gradient(ellipse 70% 40% at 50% 100%, rgba(37,99,235,0.1) 0%, transparent 70%), rgba(4,8,26,1)",
    }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700,
            color: "#86efac", marginBottom: 16,
          }}>
            Simple by design
          </div>
          <h2 style={{ margin: 0, fontSize: "clamp(1.8rem, 4vw, 2.6rem)", fontWeight: 900, color: "white", letterSpacing: -0.8, lineHeight: 1.15 }}>
            Up and running in 3 minutes
          </h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {steps.map((s, i) => (
            <div key={s.n} style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
              {/* Step number + connector */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: "linear-gradient(135deg,#2563eb,#0891b2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: 18, color: "white",
                  boxShadow: "0 0 0 6px rgba(37,99,235,0.12)",
                }}>
                  {s.n}
                </div>
                {i < steps.length - 1 && (
                  <div style={{ width: 2, height: 48, background: "linear-gradient(180deg,rgba(37,99,235,0.5),rgba(37,99,235,0.1))", margin: "6px 0" }} />
                )}
              </div>
              {/* Content */}
              <div style={{ paddingBottom: i < steps.length - 1 ? 32 : 0, paddingTop: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "white", marginBottom: 6, letterSpacing: -0.3 }}>{s.title}</div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.65 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Resorts ───────────────────────────────────────────────────────────────────

function Resorts() {
  return (
    <section id="resorts" style={{ padding: "64px 20px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Browse the data</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>Colorado resorts covered</div>
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
            90+ resorts · 10 years of snowfall history
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {RESORTS.map((r) => (
            <div
              key={r}
              style={{
                padding: "8px 16px", borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: 600,
              }}
            >
              {r}
            </div>
          ))}
          <div style={{
            padding: "8px 16px", borderRadius: 999,
            border: "1px solid rgba(96,165,250,0.2)",
            background: "rgba(96,165,250,0.08)",
            color: "#60a5fa", fontSize: 13, fontWeight: 700,
          }}>
            + more
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Closing CTA ───────────────────────────────────────────────────────────────

function ClosingCTA({ onSignUp }) {
  return (
    <section style={{
      padding: "96px 20px",
      background: "radial-gradient(ellipse 80% 50% at 50% 50%, rgba(37,99,235,0.15) 0%, transparent 70%), rgba(2,6,23,1)",
      borderTop: "1px solid rgba(255,255,255,0.07)",
      textAlign: "center",
    }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>🤙</div>
        <h2 style={{
          margin: 0, fontSize: "clamp(1.8rem, 4vw, 2.4rem)",
          fontWeight: 900, color: "white", letterSpacing: -0.8, lineHeight: 1.2,
          marginBottom: 16,
        }}>
          Your crew is already planning their season.
        </h2>
        <p style={{ margin: "0 0 36px", fontSize: 17, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
          Catch up.
        </p>
        <button
          onClick={onSignUp}
          style={{
            padding: "16px 36px", borderRadius: 14, border: "none",
            background: "linear-gradient(135deg,#2563eb,#0891b2)",
            color: "white", fontWeight: 900, fontSize: 17, cursor: "pointer",
            boxShadow: "0 6px 30px rgba(37,99,235,0.5)",
            letterSpacing: -0.3,
          }}
        >
          Start your season →
        </button>
        <div style={{ marginTop: 14, fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
          Free to start. No credit card required.
        </div>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer({ onBrowse }) {
  return (
    <footer style={{
      borderTop: "1px solid rgba(255,255,255,0.07)",
      padding: "32px 20px",
      background: "rgba(2,6,23,1)",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg,#2563eb,#0891b2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>❄️</div>
          <span style={{ fontSize: 14, fontWeight: 900, color: "rgba(255,255,255,0.7)" }}>PowderDays</span>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {[
            { label: "Live Conditions", action: onBrowse },
          ].map(({ label, action }) => (
            <button key={label} onClick={action} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 13, cursor: "pointer", padding: 0, fontWeight: 600 }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", fontWeight: 600 }}>
          Made for skiers by skiers · Colorado
        </div>
      </div>
    </footer>
  )
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function LandingPage({ onSignIn, onSignUp, onBrowse }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handle = () => setScrolled(window.scrollY > 24)
    window.addEventListener("scroll", handle, { passive: true })
    return () => window.removeEventListener("scroll", handle)
  }, [])

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div style={{ background: "rgba(2,6,23,1)", color: "white", minHeight: "100vh", overflowX: "hidden" }}>
      {/* Mobile sign-in bar at top (always visible on small screens) */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
        display: "none", // overridden by CSS below for mobile
        padding: "10px 16px",
        background: "rgba(2,6,23,0.97)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        justifyContent: "space-between", alignItems: "center",
        backdropFilter: "blur(12px)",
      }} className="mobile-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg,#2563eb,#0891b2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>❄️</div>
          <span style={{ fontSize: 15, fontWeight: 900, color: "white" }}>PowderDays</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onSignIn} style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.8)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Sign In</button>
          <button onClick={onSignUp} style={{ padding: "7px 14px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#2563eb,#0891b2)", color: "white", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Start →</button>
        </div>
      </div>

      <style>{`
        @media(max-width: 640px) {
          .mobile-bar { display: flex !important; }
          .desktop-nav { display: none !important; }
        }
        @media(min-width: 641px) {
          .desktop-nav { display: flex !important; }
        }
      `}</style>

      {/* Desktop nav */}
      <nav className="desktop-nav" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "0 20px",
        background: scrolled ? "rgba(2,6,23,0.95)" : "transparent",
        backdropFilter: scrolled ? "blur(16px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(255,255,255,0.07)" : "none",
        transition: "all 0.25s",
        display: "none",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#2563eb,#0891b2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>❄️</div>
            <span style={{ fontSize: 17, fontWeight: 900, color: "white", letterSpacing: -0.3 }}>PowderDays</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={() => scrollTo("features")} style={navLink}>Features</button>
            <button onClick={() => scrollTo("how-it-works")} style={navLink}>How It Works</button>
            <button onClick={onBrowse} style={navLink}>Live Conditions</button>
            <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.12)", margin: "0 8px" }} />
            <button onClick={onSignIn} style={navLinkBold}>Sign In</button>
            <button onClick={onSignUp} style={navCta}>Start your season</button>
          </div>
        </div>
      </nav>

      <Hero onSignUp={onSignUp} scrollTo={scrollTo} />
      <SocialProof />
      <Features />
      <HowItWorks />
      <Resorts />
      <ClosingCTA onSignUp={onSignUp} />
      <Footer onBrowse={onBrowse} />
    </div>
  )
}
