import { useState } from "react"
import { upsertMyProfile } from "../../lib/socialApi"
import { buildProfileUpdate } from "../../lib/profileForm"
import StravaConnect from "../StravaConnect"
import SettingsSheet from "./SettingsSheet"

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
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)",
  color: "white", fontSize: 15, outline: "none", boxSizing: "border-box",
}

const labelStyle = {
  fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 7,
}

function AccountSheet({ email, onLogOut, onClose }) {
  return (
    <SettingsSheet title="Account" onClose={onClose}>
      <div style={labelStyle}>Signed in as</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "white", wordBreak: "break-all" }}>
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

function NotificationsSheet({ profile, onSaved, onClose }) {
  const [enabled, setEnabled] = useState(profile?.powder_alerts_enabled ?? false)
  const [phone, setPhone]     = useState(profile?.alert_phone ?? "")
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState("")

  async function handleSave() {
    setSaving(true); setError("")
    try {
      // buildProfileUpdate, never a bare object: upsertMyProfile writes a WHOLE
      // row, so a partial payload here would null this user's username,
      // favourite mountain, vehicle and passes. See src/lib/profileForm.js.
      await upsertMyProfile(buildProfileUpdate(profile, {
        powder_alerts_enabled: enabled,
        alert_phone: phone.trim() || null,
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
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "white", cursor: "pointer", minHeight: 44 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        📧 Weekly powder forecast every Wednesday
      </label>
      {enabled && (
        <input
          type="tel"
          placeholder="Phone number (for future SMS alerts)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ ...fieldStyle, marginTop: 12 }}
        />
      )}
      {error && <div style={{ fontSize: 13, color: "var(--color-danger)", marginTop: 12 }}>{error}</div>}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: 20, width: "100%", minHeight: 44, padding: 14, borderRadius: 14, border: "none",
          background: saving ? "rgba(255,255,255,0.1)" : "var(--gradient-cta)",
          color: "white", fontWeight: 900, fontSize: 15, cursor: saving ? "default" : "pointer",
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
        <div style={{ fontSize: 15, fontWeight: 800, color: "white" }}>Coming soon</div>
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
            <div style={{ fontSize: 14, fontWeight: 800, color: "white" }}>{q}</div>
            <div style={{ fontSize: 13, color: "var(--color-text-2)", marginTop: 4, lineHeight: 1.5 }}>{a}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
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
        fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)",
        textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10,
      }}>
        Settings
      </div>

      <div style={{
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
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
              borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
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
