import { useState } from "react"
import {
  linkOAuthIdentity,
  startPhoneVerificationForTier1,
  verifyPhoneForTier1,
} from "../lib/socialApi"

const E164_RE = /^\+[1-9]\d{7,14}$/

const fieldStyle = {
  width: "100%",
  padding: "11px 13px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.07)",
  color: "white",
  fontSize: 15,
  outline: "none",
  boxSizing: "border-box",
}

const fieldLabelStyle = {
  fontSize: 11,
  fontWeight: 800,
  color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase",
  letterSpacing: 0.8,
  marginBottom: 7,
}

const secondaryButtonStyle = {
  flex: 1,
  minWidth: 100,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 14,
  padding: "12px 14px",
  color: "white",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
}

export default function VerificationUpgradeModal({ onClose, onVerified }) {
  const [phoneStep, setPhoneStep] = useState("enter") // enter | otp
  const [phone, setPhone] = useState("")
  const [otp, setOtp] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function handleOAuthClick(provider) {
    setBusy(true)
    setError("")
    try {
      await linkOAuthIdentity(provider)
      // Browser redirects away here — nothing after this line runs.
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  async function handleSendOtp(e) {
    e.preventDefault()
    if (!E164_RE.test(phone)) {
      setError("Enter your phone number in +1XXXXXXXXXX format.")
      return
    }
    setBusy(true)
    setError("")
    try {
      await startPhoneVerificationForTier1(phone)
      setPhoneStep("otp")
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const row = await verifyPhoneForTier1(phone, otp.trim())
      if (row?.tier >= 1) onVerified?.(row)
      else onClose?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 600,
        background: "rgba(4,8,15,0.85)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px 16px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--color-bg-deep)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 24,
          boxShadow: "0 40px 120px rgba(0,0,0,0.85)",
          padding: 22,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "white" }}>Verify your account</div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "50%",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: 18,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginBottom: 20 }}>
          Link one account and confirm your phone number to unlock this action.
        </div>

        {error && (
          <div
            style={{
              fontSize: 13,
              color: "var(--color-danger)",
              background: "var(--color-danger-bg)",
              border: "1px solid rgba(248,113,113,0.25)",
              borderRadius: 12,
              padding: "10px 13px",
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {/* OAuth options */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          <button
            disabled={busy}
            onClick={() => handleOAuthClick("google")}
            style={{ ...secondaryButtonStyle, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
          >
            Continue with Google
          </button>
          <button
            disabled={busy}
            onClick={() => handleOAuthClick("facebook")}
            style={{ ...secondaryButtonStyle, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
          >
            Continue with Facebook
          </button>
        </div>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            or
          </div>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
        </div>

        {/* Phone verification */}
        {phoneStep === "enter" ? (
          <form onSubmit={handleSendOtp}>
            <div style={fieldLabelStyle}>Phone number</div>
            <input
              type="tel"
              placeholder="+15551234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ ...fieldStyle, marginBottom: 14 }}
            />
            <button
              type="submit"
              disabled={busy}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 14,
                border: "none",
                background: busy ? "rgba(255,255,255,0.1)" : "var(--gradient-cta)",
                color: "white",
                fontWeight: 900,
                fontSize: 15,
                cursor: busy ? "default" : "pointer",
              }}
            >
              {busy ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <div style={fieldLabelStyle}>Enter the 6-digit code sent to {phone}</div>
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              style={{ ...fieldStyle, marginBottom: 14 }}
            />
            <button
              type="submit"
              disabled={busy}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 14,
                border: "none",
                background: busy ? "rgba(255,255,255,0.1)" : "var(--gradient-cta)",
                color: "white",
                fontWeight: 900,
                fontSize: 15,
                cursor: busy ? "default" : "pointer",
              }}
            >
              {busy ? "Confirming…" : "Confirm"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
