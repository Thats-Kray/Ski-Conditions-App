import { useEffect, useState } from "react"
import {
  logInWithPassword,
  signUpWithProfile,
  sendPasswordReset,
  updateMyPassword,
  sendPhoneOtp,
  verifyPhoneOtp,
} from "../lib/socialApi"

const fieldStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  outline: "none",
  boxSizing: "border-box",
  fontSize: 16,
}

const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: "0.9rem",
  color: "rgba(255,255,255,0.82)",
}

const buttonStyle = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#3b82f6",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
}

const secondaryButtonStyle = {
  ...buttonStyle,
  background: "rgba(255,255,255,0.1)",
}

const passOptions = ["Epic", "Ikon", "A-Basin", "Loveland", "Cooper", "Indy", "None"]
const rideOptions = ["ski", "snowboard", "both"]

function toE164(raw) {
  const digits = raw.replace(/\D/g, "")
  if (raw.trim().startsWith("+")) return "+" + digits
  // assume US if no country code
  return "+1" + (digits.startsWith("1") ? digits.slice(1) : digits)
}

export default function AuthForm({
  mode = "login",
  onSuccess,
  onCancel,
  onPasswordResetSuccess,
}) {
  const [formMode, setFormMode] = useState(mode)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  // email signup fields
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [favoriteMountain, setFavoriteMountain] = useState("")
  const [rideType, setRideType] = useState("ski")
  const [skiPasses, setSkiPasses] = useState([])
  const [resetPassword, setResetPassword] = useState("")
  const [confirmResetPassword, setConfirmResetPassword] = useState("")

  // phone fields
  const [phone, setPhone] = useState("")
  const [otp, setOtp] = useState("")
  const [confirmedPhone, setConfirmedPhone] = useState("")

  useEffect(() => {
    setFormMode(mode)
    setErrorMessage("")
    setSuccessMessage("")
  }, [mode])

  useEffect(() => {
    const hash = window.location.hash || ""
    const search = window.location.search || ""
    const looksLikeRecoveryLink =
      hash.includes("type=recovery") || search.includes("type=recovery")
    if (looksLikeRecoveryLink) {
      setFormMode("reset")
      setErrorMessage("")
      setSuccessMessage("Enter your new password below.")
    }
  }, [])

  function togglePass(pass) {
    setSkiPasses((current) =>
      current.includes(pass)
        ? current.filter((value) => value !== pass)
        : [...current, pass]
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setErrorMessage("")
    setSuccessMessage("")

    try {
      if (formMode === "login") {
        await logInWithPassword({ email, password })
        if (onSuccess) onSuccess()

      } else if (formMode === "signup") {
        await signUpWithProfile({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          password,
          username: username.trim(),
          ski_passes: skiPasses,
          favorite_mountain: favoriteMountain.trim(),
          ride_type: rideType,
        })
        setSuccessMessage(
          "Account created! Check your email and click the confirmation link before logging in."
        )

      } else if (formMode === "forgot") {
        await sendPasswordReset(email.trim())
        setSuccessMessage("Password reset email sent. Check your inbox.")

      } else if (formMode === "reset") {
        if (!resetPassword || resetPassword.length < 6) {
          throw new Error("Password must be at least 6 characters.")
        }
        if (resetPassword !== confirmResetPassword) {
          throw new Error("Passwords do not match.")
        }
        await updateMyPassword(resetPassword)
        setSuccessMessage("Password updated successfully.")
        setPassword("")
        setResetPassword("")
        setConfirmResetPassword("")
        window.history.replaceState({}, document.title, window.location.pathname)
        if (onPasswordResetSuccess) {
          onPasswordResetSuccess()
        } else if (onSuccess) {
          onSuccess()
        } else {
          setFormMode("login")
        }

      } else if (formMode === "phone") {
        const formatted = toE164(phone)
        await sendPhoneOtp(formatted)
        setConfirmedPhone(formatted)
        setOtp("")
        setFormMode("phone_otp")

      } else if (formMode === "phone_otp") {
        await verifyPhoneOtp(confirmedPhone, otp.trim())
        if (onSuccess) onSuccess()
      }

    } catch (error) {
      console.error("Auth form error:", error)
      setErrorMessage(error.message || "Authentication failed.")
    } finally {
      setLoading(false)
    }
  }

  function switchMode(nextMode) {
    setFormMode(nextMode)
    setErrorMessage("")
    setSuccessMessage("")
  }

  const titles = {
    login: "Log In",
    signup: "Create Your Account",
    forgot: "Forgot Password",
    reset: "Set New Password",
    phone: "Sign In with Phone",
    phone_otp: "Enter Verification Code",
  }

  const subtitles = {
    login: "Log in with your email and password.",
    signup: "Create your skier/rider profile to join the crew.",
    forgot: "Enter your email and we'll send you a password reset link.",
    reset: "Choose a new password for your account.",
    phone: "Enter your mobile number and we'll text you a code.",
    phone_otp: `We sent a 6-digit code to ${confirmedPhone}. Enter it below.`,
  }

  const signedUp = formMode === "signup" && !!successMessage

  return (
    <div
      style={{
        background: "rgba(20,24,34,0.96)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 18,
        padding: 20,
        width: "100%",
        maxWidth: 520,
        color: "#fff",
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: "1.25rem" }}>{titles[formMode]}</h2>
        <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.68)" }}>
          {subtitles[formMode]}
        </p>
      </div>

      {errorMessage ? (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(239,68,68,0.14)",
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
            borderRadius: 10,
            background: "rgba(34,197,94,0.14)",
            border: "1px solid rgba(34,197,94,0.35)",
            color: "#bbf7d0",
            lineHeight: 1.5,
          }}
        >
          {successMessage}
        </div>
      ) : null}

      {/* ── Signed-up confirmation state ── */}
      {signedUp ? (
        <div style={{ display: "grid", gap: 10 }}>
          <button style={secondaryButtonStyle} onClick={() => switchMode("login")}>
            Back to Log In
          </button>
          {onCancel ? (
            <button style={secondaryButtonStyle} onClick={onCancel}>
              Close
            </button>
          ) : null}
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>

          {/* ── Phone entry ── */}
          {formMode === "phone" ? (
            <div>
              <label style={labelStyle}>Mobile Number</label>
              <input
                style={fieldStyle}
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoComplete="tel"
              />
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                US numbers: enter 10 digits. International: include + and country code.
              </p>
            </div>
          ) : null}

          {/* ── OTP entry ── */}
          {formMode === "phone_otp" ? (
            <div>
              <label style={labelStyle}>6-Digit Code</label>
              <input
                style={{ ...fieldStyle, letterSpacing: "0.25em", textAlign: "center", fontSize: 22, fontWeight: 700 }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="------"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                autoFocus
              />
            </div>
          ) : null}

          {/* ── Signup fields ── */}
          {formMode === "signup" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>First Name</label>
                  <input
                    style={fieldStyle}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle}>Last Name</label>
                  <input
                    style={fieldStyle}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Username</label>
                <input
                  style={fieldStyle}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={labelStyle}>Favorite Mountain</label>
                <input
                  style={fieldStyle}
                  value={favoriteMountain}
                  onChange={(e) => setFavoriteMountain(e.target.value)}
                  placeholder="Winter Park, Vail, Copper..."
                  required
                />
              </div>

              <div>
                <label style={labelStyle}>Do you ski, snowboard, or both?</label>
                <select
                  style={fieldStyle}
                  value={rideType}
                  onChange={(e) => setRideType(e.target.value)}
                  required
                >
                  {rideOptions.map((option) => (
                    <option key={option} value={option} style={{ color: "#000" }}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Passes</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {passOptions.map((pass) => {
                    const selected = skiPasses.includes(pass)
                    return (
                      <button
                        key={pass}
                        type="button"
                        onClick={() => togglePass(pass)}
                        style={{
                          border: "1px solid rgba(255,255,255,0.14)",
                          borderRadius: 999,
                          padding: "8px 12px",
                          background: selected ? "#3b82f6" : "rgba(255,255,255,0.06)",
                          color: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        {pass}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          ) : null}

          {/* ── Email field ── */}
          {formMode === "login" || formMode === "signup" || formMode === "forgot" ? (
            <div>
              <label style={labelStyle}>Email</label>
              <input
                style={fieldStyle}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          ) : null}

          {/* ── Password field ── */}
          {formMode === "login" || formMode === "signup" ? (
            <div>
              <label style={labelStyle}>Password</label>
              <input
                style={fieldStyle}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          ) : null}

          {/* ── Reset password fields ── */}
          {formMode === "reset" ? (
            <>
              <div>
                <label style={labelStyle}>New Password</label>
                <input
                  style={fieldStyle}
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Confirm New Password</label>
                <input
                  style={fieldStyle}
                  type="password"
                  value={confirmResetPassword}
                  onChange={(e) => setConfirmResetPassword(e.target.value)}
                  required
                />
              </div>
            </>
          ) : null}

          {/* ── Action row ── */}
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "space-between",
              marginTop: 4,
              flexWrap: "wrap",
            }}
          >
            <button type="submit" style={buttonStyle} disabled={loading}>
              {loading
                ? "Please wait…"
                : formMode === "login"
                ? "Log In"
                : formMode === "signup"
                ? "Create Account"
                : formMode === "forgot"
                ? "Send Reset Email"
                : formMode === "reset"
                ? "Update Password"
                : formMode === "phone"
                ? "Send Code"
                : "Verify Code"}
            </button>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {formMode === "login" ? (
                <>
                  <button type="button" style={secondaryButtonStyle} onClick={() => switchMode("signup")}>
                    Need an account?
                  </button>
                  <button type="button" style={secondaryButtonStyle} onClick={() => switchMode("forgot")}>
                    Forgot Password?
                  </button>
                </>
              ) : null}

              {formMode === "signup" ? (
                <button type="button" style={secondaryButtonStyle} onClick={() => switchMode("login")}>
                  Already have an account?
                </button>
              ) : null}

              {formMode === "forgot" ? (
                <button type="button" style={secondaryButtonStyle} onClick={() => switchMode("login")}>
                  Back to Log In
                </button>
              ) : null}

              {formMode === "phone" ? (
                <button type="button" style={secondaryButtonStyle} onClick={() => switchMode("login")}>
                  Use Email Instead
                </button>
              ) : null}

              {formMode === "phone_otp" ? (
                <>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={() => { setOtp(""); switchMode("phone") }}
                  >
                    Change Number
                  </button>
                  <button
                    type="button"
                    style={{ ...secondaryButtonStyle, fontSize: "0.85em" }}
                    disabled={loading}
                    onClick={async () => {
                      setLoading(true)
                      setErrorMessage("")
                      try {
                        await sendPhoneOtp(confirmedPhone)
                        setSuccessMessage("New code sent!")
                      } catch (e) {
                        setErrorMessage(e.message || "Could not resend.")
                      } finally {
                        setLoading(false)
                      }
                    }}
                  >
                    Resend Code
                  </button>
                </>
              ) : null}

              {onCancel ? (
                <button type="button" style={secondaryButtonStyle} onClick={onCancel}>
                  Close
                </button>
              ) : null}
            </div>
          </div>
        </form>
      )}
    </div>
  )
}
