import { crewColor } from "../../lib/crewColors"

function Chip({ active, tint, onClick, children, isToggle = true }) {
  const ariaProps = isToggle
    ? { "aria-pressed": active }
    : { "aria-haspopup": "dialog" }

  return (
    <button
      onClick={onClick}
      {...ariaProps}
      style={{
        flexShrink: 0, borderRadius: 999, padding: "7px 14px", minHeight: 44,
        fontSize: 12, fontWeight: 700, cursor: "pointer",
        border: `1px solid ${active ? (tint || "var(--color-accent)") : "var(--color-border)"}`,
        background: active ? "var(--color-accent-dim)" : "transparent",
        color: active ? "var(--color-text-1)" : "var(--color-text-3)",
        display: "inline-flex", alignItems: "center", gap: 6,
      }}
    >
      {tint && (
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: tint, flexShrink: 0 }} />
      )}
      {children}
    </button>
  )
}

/**
 * The mockup's left sidebar, rewritten for a phone.
 *
 * Google Calendar can afford an always-visible checkbox column because it is a
 * two-pane desktop app. This app is mobile-first with a bottom nav, so the everyday
 * toggles live in a horizontal chip row and the full per-friend list lives behind
 * the Filter button (CalendarFilterSheet).
 */
export default function FilterChipRow({ crews = [], selected, onToggle, onOpenSheet, friendFilterCount = 0 }) {
  return (
    <div style={{
      display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4,
      scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
    }}>
      <Chip active={selected.has("me")} onClick={() => onToggle("me")}>🙋 Me</Chip>
      <Chip active={selected.has("friends")} onClick={() => onToggle("friends")}>👥 All Friends</Chip>
      {crews.map((c, i) => (
        <Chip
          key={c.id}
          active={selected.has(`crew:${c.id}`)}
          tint={crewColor(i)}
          onClick={() => onToggle(`crew:${c.id}`)}
        >
          {c.emoji || "🤙"} {c.name}
        </Chip>
      ))}
      <Chip active={friendFilterCount > 0} onClick={onOpenSheet} isToggle={false}>
        ☰ Filter{friendFilterCount > 0 ? ` (${friendFilterCount})` : ""}
      </Chip>
    </div>
  )
}
