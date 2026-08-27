import { useState } from "react"
import Avatar from "./ui/Avatar"

/**
 * "N friends going" — click-to-reveal-names popover over a stacked avatar row.
 *
 * `variant="subtle"` (default) matches the original inline-card treatment: a faint
 * rgba pill with a row of overlapping avatar thumbnails.
 * `variant="solid"` is for the Today hero card: a filled accent pill with a dark
 * headcount bubble instead of avatar images — same data, same click behavior, no new
 * logic, just presented larger and bolder for the one "best bet" card on the page.
 */
export default function FriendsGoingBadge({ friends, variant = "subtle" }) {
  const [open, setOpen] = useState(false)
  if (!friends?.length) return null

  const isSolid = variant === "solid"

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={
          isSolid
            ? {
                display: "flex", alignItems: "center", gap: 10,
                background: "var(--gradient-primary)", border: "none",
                borderRadius: 999, padding: "12px 18px", cursor: "pointer",
                boxShadow: "0 6px 20px rgba(56,189,248,0.25)",
              }
            : {
                display: "flex", alignItems: "center", gap: 6,
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 999, padding: "4px 10px 4px 6px", cursor: "pointer",
              }
        }
      >
        {isSolid ? (
          <span style={{
            display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: "50%",
            background: "rgba(4,8,15,0.35)", color: "white", fontSize: 12, fontWeight: 900,
          }}>
            {friends.length}
          </span>
        ) : (
          <div style={{ display: "flex" }}>
            {friends.slice(0, 3).map((f, i) => (
              <div key={f.id} style={{ marginLeft: i > 0 ? -8 : 0, border: "2px solid var(--color-bg)", borderRadius: "50%" }}>
                <Avatar profile={f} size={22} />
              </div>
            ))}
          </div>
        )}
        <span style={{
          fontSize: isSolid ? 14 : 12, fontWeight: isSolid ? 800 : 700,
          color: isSolid ? "white" : "rgba(255,255,255,0.75)",
        }}>
          {isSolid ? "Who's going" : `${friends.length} friend${friends.length === 1 ? "" : "s"} going this weekend`}
        </span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "110%", left: 0, background: "var(--color-surface-popover)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 10, zIndex: 20, minWidth: 160, boxShadow: "0 12px 40px rgba(0,0,0,0.4)" }}>
          {friends.map((f) => (
            <div key={f.id} style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", padding: "4px 0" }}>{f.full_name || f.username}</div>
          ))}
        </div>
      )}
    </div>
  )
}
