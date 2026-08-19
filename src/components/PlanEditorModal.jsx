import { useState } from "react"
import { useMobile } from "../lib/useMobile"
import { formatDate, etaToTimeInput, snapToQuarterHour } from "../lib/format"
import { OPEN_RESORT_KEY, OPEN_RESORT_LABEL, OPEN_RESORT_EMOJI } from "../lib/resorts"

const PRESETS = [
  { label: "First chair", value: "08:30" },
  { label: "9:00",        value: "09:00" },
  { label: "10:00",       value: "10:00" },
  { label: "Afternoon",   value: "13:00" },
]

const fieldStyle = {
  width: "100%", background: "var(--color-surface)",
  border: "1px solid var(--color-border)", borderRadius: 10,
  padding: "11px 12px", color: "var(--color-text-1)", fontSize: 15,
  boxSizing: "border-box", outline: "none", colorScheme: "dark",
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, letterSpacing: 1,
      color: "var(--color-text-3)", textTransform: "uppercase",
    }}>
      {children}
    </div>
  )
}

/**
 * Make or edit one day's ski plan.
 *
 * Lives in a modal because the previous inline editor rendered below the calendar,
 * off the part of the screen the user was looking at, and went unnoticed.
 *
 * Bottom sheet on mobile, centered dialog on desktop — the same responsive shape
 * CalendarFilterSheet uses, so this codebase has one modal idiom rather than two.
 *
 * Collects values only; the caller owns the write. upsertDailyPlan writes the whole
 * row, and a second copy of that logic here would be a second place to get it wrong.
 */
export default function PlanEditorModal({
  dateKey, plan = null, resorts = [], busy = false, error = null,
  defaultResortKey = null, onSave, onRemove, onClose,
}) {
  const isMobile = useMobile()
  const [resortKey, setResortKey] = useState(plan?.resort_key || defaultResortKey || "")
  const [eta, setEta] = useState(() => etaToTimeInput(plan?.eta) || "")
  const [visibility, setVisibility] = useState(plan?.visibility || "friends")

  function handleSave() {
    if (!resortKey) return
    onSave?.({
      resortKey,
      // Snap on the way out: iOS Safari's time wheel ignores step="900", so the
      // raw input value cannot be trusted to sit on a quarter hour.
      eta: snapToQuarterHour(eta),
      visibility,
    })
  }

  const panel = (
    <div
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={`Ski plan for ${formatDate(dateKey)}`}
      style={{
        background: "var(--color-modal-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: isMobile ? "20px 20px 0 0" : 18,
        padding: "18px 20px 24px",
        width: isMobile ? "100%" : 380,
        maxHeight: "85vh", overflowY: "auto",
        display: "grid", gap: 14,
        boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: "var(--color-text-1)" }}>
          {formatDate(dateKey)}
        </div>
        <button
          onClick={busy ? undefined : onClose}
          aria-label="Close"
          style={{
            background: "none", border: "none", color: "var(--color-text-3)",
            fontSize: 22, cursor: busy ? "default" : "pointer", minHeight: 44, minWidth: 44,
          }}
        >
          ×
        </button>
      </div>

      {/* Where */}
      <div style={{ display: "grid", gap: 6 }}>
        <SectionLabel>Where</SectionLabel>
        <select
          value={resortKey}
          onChange={(e) => setResortKey(e.target.value)}
          style={fieldStyle}
          disabled={busy}
          aria-label="Mountain"
        >
          <option value="">Pick a mountain…</option>
          {resorts.map((r) => (
            <option key={r.resortKey} value={r.resortKey}>{r.name}</option>
          ))}
          {/* Added here, not to RESORT_NAMES — that map builds the Community
              board's mountain pickers, where "Open" would be nonsense. */}
          <option value={OPEN_RESORT_KEY}>{OPEN_RESORT_EMOJI} {OPEN_RESORT_LABEL}</option>
        </select>
      </div>

      {/* When */}
      <div style={{ display: "grid", gap: 6 }}>
        <SectionLabel>When — optional</SectionLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => setEta(preset.value)}
              disabled={busy}
              style={{
                flex: "1 1 auto", borderRadius: 999, padding: "8px 12px", minHeight: 44,
                fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer",
                border: eta === preset.value
                  ? "1px solid var(--color-accent)"
                  : "1px solid var(--color-border)",
                background: eta === preset.value ? "var(--color-accent-dim)" : "transparent",
                color: eta === preset.value ? "var(--color-text-1)" : "var(--color-text-3)",
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="time"
            step="900"
            value={eta}
            onChange={(e) => setEta(e.target.value)}
            disabled={busy}
            aria-label="Arrival time"
            style={{ ...fieldStyle, flex: 1 }}
          />
          {eta && (
            <button
              onClick={() => setEta("")}
              disabled={busy}
              style={{
                background: "none", border: "1px solid var(--color-border)",
                borderRadius: 10, color: "var(--color-text-3)",
                padding: "0 14px", minHeight: 44, fontSize: 12,
                fontWeight: 700, cursor: busy ? "default" : "pointer",
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Who can see */}
      <div style={{ display: "grid", gap: 6 }}>
        <SectionLabel>Who can see</SectionLabel>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { key: "friends", label: "👥 Friends & Crews" },
            { key: "private", label: "🔒 Private" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setVisibility(key)}
              disabled={busy}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 999, fontSize: 12, fontWeight: 700,
                border: visibility === key
                  ? "1px solid var(--color-accent)"
                  : "1px solid var(--color-border)",
                background: visibility === key ? "var(--color-accent-dim)" : "transparent",
                color: visibility === key ? "var(--color-text-1)" : "var(--color-text-3)",
                cursor: busy ? "default" : "pointer", minHeight: 44,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: "var(--color-danger)" }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {plan && onRemove && (
          <button
            onClick={onRemove}
            disabled={busy}
            style={{
              padding: "12px 16px", borderRadius: 12,
              border: "1px solid var(--color-danger)", background: "var(--color-danger-bg)",
              color: "var(--color-danger)", fontWeight: 800, fontSize: 14,
              cursor: busy ? "default" : "pointer", minHeight: 44,
            }}
          >
            Remove day
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={busy || !resortKey}
          style={{
            flex: 1, padding: "12px 0", borderRadius: 12, border: "none",
            background: resortKey ? "var(--gradient-cta)" : "var(--color-surface)",
            color: "white", fontWeight: 800, fontSize: 14,
            cursor: busy || !resortKey ? "default" : "pointer",
            opacity: busy ? 0.6 : 1, minHeight: 44,
          }}
        >
          {busy ? "Saving…" : plan ? "Update plan" : "Save plan"}
        </button>
      </div>
    </div>
  )

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 20,
      }}
    >
      {panel}
    </div>
  )
}
