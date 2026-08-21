import { crewColor } from "../../lib/crewColors"
import { useMobile } from "../../lib/useMobile"
import { useDismissableLayer } from "../../lib/useDismissableLayer"
import Avatar from "../ui/Avatar"

function Row({ checked, tint, onToggle, children }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        background: "none", border: "none", padding: "10px 4px", minHeight: 44,
        cursor: "pointer", textAlign: "left", color: "var(--color-text-1)", fontSize: 14,
      }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
        border: `1.5px solid ${checked ? (tint || "var(--color-accent)") : "var(--color-border)"}`,
        background: checked ? (tint || "var(--color-accent)") : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, color: "var(--color-bg)", fontWeight: 900,
      }}>
        {checked ? "✓" : ""}
      </span>
      {children}
    </button>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, letterSpacing: 1, color: "var(--color-text-3)",
      padding: "12px 4px 4px", borderBottom: "1px solid var(--color-border-subtle)",
    }}>
      {children}
    </div>
  )
}

/** The mockup's "My calendars" sidebar: a bottom sheet on mobile, a popover on desktop. */
export default function CalendarFilterSheet({
  crews = [], crewMemberIds, friends = [], selected, onToggle, onClose,
}) {
  const isMobile = useMobile()
  const panelRef = useDismissableLayer({ onClose })

  const panel = (
    <div
      ref={panelRef}
      onClick={(e) => e.stopPropagation()}
      // This sheet had neither role="dialog" nor aria-modal, so a screen reader
      // announced it as a plain div and never trapped its virtual cursor.
      role="dialog"
      aria-modal="true"
      aria-label="Filter the calendar by crew or friend"
      style={{
        background: "var(--color-modal-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: isMobile ? "20px 20px 0 0" : 18,
        padding: "16px 18px 24px",
        width: isMobile ? "100%" : 340,
        maxHeight: "70vh", overflowY: "auto",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1, color: "var(--color-text-2)" }}>
          SHOW ON CALENDAR
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "var(--color-text-3)", fontSize: 20, cursor: "pointer", minHeight: 44, minWidth: 44 }}
          aria-label="Close filter"
        >
          ×
        </button>
      </div>

      <Row checked={selected.has("me")} onToggle={() => onToggle("me")}>🙋 Me</Row>
      <Row checked={selected.has("friends")} onToggle={() => onToggle("friends")}>👥 All Friends</Row>

      {crews.length > 0 && <SectionLabel>CREWS</SectionLabel>}
      {crews.map((c, i) => (
        <Row
          key={c.id}
          checked={selected.has(`crew:${c.id}`)}
          tint={crewColor(i)}
          onToggle={() => onToggle(`crew:${c.id}`)}
        >
          <span style={{ flex: 1 }}>{c.emoji || "🤙"} {c.name}</span>
          <span style={{ fontSize: 11, color: "var(--color-text-3)" }}>
            {crewMemberIds?.get(c.id)?.size ?? 0}
          </span>
        </Row>
      ))}

      {friends.length > 0 && <SectionLabel>FRIENDS</SectionLabel>}
      {friends.map((f) => (
        <Row
          key={f.id}
          checked={selected.has(`friend:${f.id}`)}
          onToggle={() => onToggle(`friend:${f.id}`)}
        >
          <Avatar profile={f} size={22} />
          <span>{f.full_name || f.username || "Friend"}</span>
        </Row>
      ))}
    </div>
  )

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.5)",
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
