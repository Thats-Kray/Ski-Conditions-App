import { useState, useEffect } from "react"
import { upsertMyProfile } from "../../lib/socialApi"
import { buildProfileUpdate } from "../../lib/profileForm"
import { authHeaders } from "../../lib/supabase"
import StravaConnect from "../StravaConnect"
import SettingsSheet from "./SettingsSheet"

// Matches the API_BASE fallback pattern used elsewhere (StravaConnect.jsx, App.jsx).
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8787"

/**
 * The mockup's five-row Settings list (PowDays Reorg Mockup.dc.html:480-484) and
 * the sheet each row opens. OWNER-ONLY — every row acts on the signed-in user,
 * so ProfilePage must not render this on a friend's profile.
 */

// PLACEHOLDER. The design spec flagged this for Kyle and it was still unanswered
// when the plan was written; nothing in the repo defines a real support address.
// This is the only place it is written down — change it here.
const SUPPORT_EMAIL = "support@powdays.app"

const ROWS = [
  { key: "account",       label: "Account" },
  { key: "notifications", label: "Notifications" },
  { key: "privacy",       label: "Privacy & visibility" },
  { key: "connected",     label: "Connected apps" },
  { key: "help",          label: "Help & feedback" },
]

const fieldStyle = {
  width: "100%", padding: "11px 13px", borderRadius: 12,
  border: "1px solid var(--overlay-12)", background: "var(--overlay-07)",
  color: "var(--color-text-1)", fontSize: 15, outline: "none", boxSizing: "border-box",
}

const labelStyle = {
  fontSize: 11, fontWeight: 800, color: "var(--ink-45)",
  textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7,
}

function AccountSheet({ email, onLogOut, onClose }) {
  return (
    <SettingsSheet title="Account" onClose={onClose}>
      <div style={labelStyle}>Signed in as</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-1)", wordBreak: "break-all" }}>
        {email || "—"}
      </div>
      <button
        onClick={() => onLogOut?.()}
        style={{
          marginTop: 24, width: "100%", minHeight: 44, padding: 14, borderRadius: 14,
          border: "1px solid rgba(239,68,68,0.25)", background: "var(--color-danger-bg)",
          color: "var(--color-danger)", fontWeight: 900, fontSize: 15, cursor: "pointer",
        }}
      >
        🚪 Sign Out
      </button>
    </SettingsSheet>
  )
}

const DAY_OPTIONS = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
]

const TIME_SLOT_OPTIONS = [
  { value: "morning", label: "Early morning" },
  { value: "midday", label: "Midday" },
  { value: "evening", label: "Evening" },
]

function NotificationsSheet({ profile, onSaved, onClose }) {
  const [enabled, setEnabled] = useState(profile?.powder_alerts_enabled ?? false)
  const [phone, setPhone]     = useState(profile?.alert_phone ?? "")
  const [dayOfWeek, setDayOfWeek] = useState(profile?.alert_day_of_week ?? "wed")
  const [timeSlot, setTimeSlot]   = useState(profile?.alert_time_slot ?? "morning")
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState("")

  const [channel, setChannel] = useState(profile?.alert_channel === "sms" ? "sms" : "email")
  const [smsAvailable, setSmsAvailable] = useState(false)
  const [verifiedPhone, setVerifiedPhone] = useState(
    profile?.alert_phone_verified_at ? profile?.alert_phone : null
  )
  const [verifiedAt, setVerifiedAt] = useState(profile?.alert_phone_verified_at ?? null)
  const [otpStage, setOtpStage] = useState("idle") // 'idle' | 'sent'
  const [otpCode, setOtpCode] = useState("")
  const [otpError, setOtpError] = useState("")
  const [otpSending, setOtpSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/config`)
      .then((res) => (res.ok ? res.json() : { smsAlertsAvailable: false }))
      .then((data) => { if (!cancelled) setSmsAvailable(!!data.smsAlertsAvailable) })
      .catch(() => { if (!cancelled) setSmsAvailable(false) })
    return () => { cancelled = true }
  }, [])

  const phoneIsVerified = verifiedPhone !== null && verifiedPhone === phone.trim()

  async function handleSendCode() {
    setOtpError(""); setOtpSending(true)
    try {
      const res = await fetch(`${API_BASE}/api/alerts/send-phone-code`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ phone: phone.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || "Could not send a verification code.")
      setOtpStage("sent")
    } catch (e) {
      setOtpError(e.message)
    } finally {
      setOtpSending(false)
    }
  }

  async function handleVerifyCode() {
    setOtpError(""); setOtpSending(true)
    try {
      const res = await fetch(`${API_BASE}/api/alerts/verify-phone-code`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ code: otpCode.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || "That code didn't work.")
      setVerifiedPhone(body.phone)
      setVerifiedAt(body.verifiedAt)
      setPhone(body.phone)
      setOtpStage("idle")
      setOtpCode("")
    } catch (e) {
      setOtpError(e.message)
    } finally {
      setOtpSending(false)
    }
  }

  async function handleSave() {
    if (smsAvailable && channel === "sms" && !phoneIsVerified) {
      setError("Verify your phone number before saving Text message delivery.")
      return
    }
    setSaving(true); setError("")
    try {
      // buildProfileUpdate, never a bare object: upsertMyProfile writes a WHOLE
      // row, so a partial payload here would null this user's username,
      // favourite mountain, vehicle and passes. See src/lib/profileForm.js.
      await upsertMyProfile(buildProfileUpdate(profile, {
        powder_alerts_enabled: enabled,
        alert_phone: phone.trim() || null,
        alert_phone_verified_at: phoneIsVerified ? verifiedAt : null,
        alert_channel: smsAvailable ? channel : "email",
        alert_day_of_week: dayOfWeek,
        alert_time_slot: timeSlot,
      }))
      await onSaved()
    } catch (e) {
      setError(e.message || "Could not save notification settings.")
      setSaving(false)
    }
  }

  return (
    <SettingsSheet title="Notifications" onClose={onClose}>
      <div style={labelStyle}>Powder Alerts</div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--color-text-1)", cursor: "pointer", minHeight: 44 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        📧 Weekly powder forecast
      </label>
      {enabled && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
            <div>
              <div style={labelStyle}>Day</div>
              <select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} style={fieldStyle}>
                {DAY_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <div style={labelStyle}>Time</div>
              <select value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)} style={fieldStyle}>
                {TIME_SLOT_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          {smsAvailable && (
            <div style={{ marginTop: 14 }}>
              <div style={labelStyle}>Delivery</div>
              <div style={{ display: "flex", gap: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--color-text-1)", cursor: "pointer" }}>
                  <input type="radio" name="alert-channel" checked={channel === "email"} onChange={() => setChannel("email")} />
                  📧 Email
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--color-text-1)", cursor: "pointer" }}>
                  <input type="radio" name="alert-channel" checked={channel === "sms"} onChange={() => setChannel("sms")} />
                  📱 Text message
                </label>
              </div>
            </div>
          )}

          {smsAvailable && channel === "sms" && (
            <div style={{ marginTop: 12 }}>
              <input
                type="tel"
                placeholder="Phone number"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setOtpStage("idle") }}
                style={fieldStyle}
              />
              {phoneIsVerified ? (
                <div style={{ fontSize: 13, color: "var(--color-success)", marginTop: 8 }}>✓ Verified</div>
              ) : otpStage === "idle" ? (
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={otpSending || !phone.trim()}
                  style={{ marginTop: 8, minHeight: 36, padding: "8px 14px", borderRadius: 10, border: "1px solid var(--overlay-12)", background: "var(--overlay-07)", color: "var(--color-text-1)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                >
                  {otpSending ? "Sending…" : "Send code"}
                </button>
              ) : (
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="6-digit code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    style={{ ...fieldStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={handleVerifyCode}
                    disabled={otpSending || otpCode.trim().length < 4}
                    style={{ minHeight: 44, padding: "0 16px", borderRadius: 10, border: "none", background: "var(--gradient-cta)", color: "var(--color-on-accent)", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
                  >
                    Verify
                  </button>
                </div>
              )}
              {otpError && <div style={{ fontSize: 13, color: "var(--color-danger)", marginTop: 8 }}>{otpError}</div>}
            </div>
          )}

          {(!smsAvailable || channel === "email") && (
            <input
              type="tel"
              placeholder="Phone number (optional, for future SMS alerts)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ ...fieldStyle, marginTop: 12 }}
            />
          )}
        </>
      )}
      {error && <div style={{ fontSize: 13, color: "var(--color-danger)", marginTop: 12 }}>{error}</div>}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: 20, width: "100%", minHeight: 44, padding: 14, borderRadius: 14, border: "none",
          background: saving ? "var(--overlay-10)" : "var(--gradient-cta)",
          color: saving ? "var(--color-text-1)" : "var(--color-on-accent)", fontWeight: 900, fontSize: 15, cursor: saving ? "default" : "pointer",
        }}
      >
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </SettingsSheet>
  )
}

function PrivacySheet({ onClose }) {
  // Deliberately inert. The design spec found ZERO account-wide privacy concept
  // in the schema — the only visibility field that exists is per-plan
  // (daily_plans.visibility, migration 037). Building an account-wide model is a
  // separate design pass, backlogged; this row exists to match the mockup.
  return (
    <SettingsSheet title="Privacy & visibility" onClose={onClose}>
      <div style={{ display: "grid", gap: 10, justifyItems: "center", textAlign: "center", padding: "12px 0 8px" }}>
        <div style={{ fontSize: 30 }}>🔒</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--color-text-1)" }}>Coming soon</div>
        <div style={{ fontSize: 13, color: "var(--color-text-2)", maxWidth: 300, lineHeight: 1.5 }}>
          Account-wide privacy controls aren&apos;t built yet. Today your season stats are
          visible to accepted friends only, and each ski day you add can be set to Friends
          or Private in the plan editor.
        </div>
      </div>
    </SettingsSheet>
  )
}

function ConnectedAppsSheet({ profile, onClose }) {
  return (
    <SettingsSheet title="Connected apps" onClose={onClose}>
      {/* StravaConnect is reused unchanged — it was an always-visible page card
          before this slice, and is now a tap-to-open destination. It opens its own
          StravaSyncReview modal at zIndex 400, which is why SettingsSheet is 350. */}
      <StravaConnect userId={profile?.id} />
    </SettingsSheet>
  )
}

function HelpSheet({ onClose }) {
  // Static placeholder content, flagged in the design spec. No support inbox or
  // FAQ page exists yet; these three answers are true of the app as shipped.
  const FAQ = [
    ["How do I log a ski day?", "Check in from the Today tab, or connect Strava under Connected apps and sync a ride."],
    ["Who can see my stats?", "Your season stats are visible to accepted friends only."],
    ["How do I add friends?", "Crew tab, then Friends — search by name or username and send a request."],
  ]
  return (
    <SettingsSheet title="Help & feedback" onClose={onClose}>
      <div style={{ display: "grid", gap: 16 }}>
        {FAQ.map(([q, a]) => (
          <div key={q}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--color-text-1)" }}>{q}</div>
            <div style={{ fontSize: 13, color: "var(--color-text-2)", marginTop: 4, lineHeight: 1.5 }}>{a}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--overlay-07)" }}>
        <div style={labelStyle}>Still stuck?</div>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          style={{ fontSize: 14, fontWeight: 700, color: "var(--color-accent-soft)", textDecoration: "none" }}
        >
          {SUPPORT_EMAIL}
        </a>
      </div>
    </SettingsSheet>
  )
}

export default function ProfileSettingsList({ profile, email, onLogOut, onProfileSaved }) {
  const [openRow, setOpenRow] = useState(null)
  const close = () => setOpenRow(null)

  return (
    <>
      <div style={{
        fontSize: 11, fontWeight: 800, color: "var(--ink-40)",
        textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10,
      }}>
        Settings
      </div>

      <div style={{
        background: "var(--overlay-03)", border: "1px solid var(--overlay-08)",
        borderRadius: 16, overflow: "hidden",
      }}>
        {ROWS.map((row, i) => (
          <button
            key={row.key}
            onClick={() => setOpenRow(row.key)}
            style={{
              width: "100%", minHeight: 44,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "15px 16px", background: "none", border: "none",
              borderTop: i > 0 ? "1px solid var(--overlay-06)" : "none",
              color: "var(--color-text-1)", textAlign: "left", cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>{row.label}</span>
            <span aria-hidden="true" style={{ fontSize: 18, color: "var(--color-accent-soft)", opacity: 0.6 }}>›</span>
          </button>
        ))}
      </div>

      {openRow === "account" && (
        <AccountSheet email={email} onLogOut={onLogOut} onClose={close} />
      )}
      {openRow === "notifications" && (
        <NotificationsSheet
          profile={profile}
          onClose={close}
          onSaved={async () => { await onProfileSaved?.(); close() }}
        />
      )}
      {openRow === "privacy"   && <PrivacySheet onClose={close} />}
      {openRow === "connected" && <ConnectedAppsSheet profile={profile} onClose={close} />}
      {openRow === "help"      && <HelpSheet onClose={close} />}
    </>
  )
}
