import { resortName, resortEmoji } from "../../lib/resorts"
import { ringColorFor, crewBadgesFor } from "../../lib/crewColors"
import { useProfileNav } from "../../lib/profileNav"
import Avatar from "../ui/Avatar"

const MAX_AVATARS = 6
const MAX_NAMES = 3

function shortName(profile) {
  return profile?.first_name || profile?.full_name?.split(" ")[0] || profile?.username || "Someone"
}

/**
 * One mountain on one day: who is going, whether there is a trip for it, and a way
 * to join.
 *
 * The card surface is deliberately NEUTRAL — never a crew color. A mountain can hold
 * skiers from two different crews, so coloring the card would need an arbitrary
 * tie-break (spec decision #7). The crew color rides each person's avatar ring
 * instead, which is never ambiguous.
 *
 * @param {Object} props
 * @param {Object} props.group - from Task 3: { resortKey, attendees, trip }
 * @param {Object} props.colorCtx - crew color context; optionally includes crewNameById (Map<crewId, string>)
 * @param {string|null} props.currentUserId
 * @param {boolean} props.canJoin
 * @param {boolean} props.joining
 * @param {Function} props.onJoin
 * @param {Function} props.onOpenTrip
 * @param {boolean} props.compact
 */
export default function DayPlanCard({
  group, colorCtx, currentUserId, canJoin = false, joining = false,
  onJoin, onOpenTrip, compact = false,
}) {
  const openProfile = useProfileNav()
  const { resortKey, attendees, trip } = group
  const alreadyIn = attendees.some((a) => a.userId === currentUserId)
  const shown = attendees.slice(0, MAX_AVATARS)
  const overflow = attendees.length - shown.length
  const names = attendees.slice(0, MAX_NAMES).map((a) => shortName(a.profile)).join(", ")
  const nameOverflow = attendees.length - Math.min(attendees.length, MAX_NAMES)

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        padding: compact ? "9px 10px" : "12px 14px",
        display: "grid",
        gap: 8,
      }}
    >
      {/* Mountain headline + headcount */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div style={{
          fontSize: compact ? 12 : 14, fontWeight: 800, color: "var(--color-text-1)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {resortEmoji(resortKey)} {resortName(resortKey) || resortKey}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-3)", flexShrink: 0 }}>
          {attendees.length} going
        </div>
      </div>

      {/* Trip badge — a trip at this resort folds into this card rather than
          sitting beside it, so one day's answer is not split across two lists. */}
      {trip && (
        <button
          onClick={() => onOpenTrip?.(trip)}
          style={{
            justifySelf: "start", display: "inline-flex", alignItems: "center", gap: 6,
            background: "var(--color-accent-dim)", border: "1px solid var(--color-border)",
            borderRadius: 999, padding: "3px 10px", cursor: "pointer",
            fontSize: 10, fontWeight: 800, color: "var(--color-text-1)",
            maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          🎿 TRIP · {trip.title || "Untitled"}
        </button>
      )}

      {/* Avatars, ringed by crew */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        {shown.map((a) => {
          const badges = crewBadgesFor(a.userId, colorCtx)
          const crewNames = badges
            .map((id) => colorCtx.crewNameById?.get?.(id))
            .filter(Boolean)
          const crewPart = crewNames.length > 1 ? ` · ${crewNames.join(", ")}` : ""
          const displayTitle = (a.profile?.full_name || a.profile?.username || "Someone") + crewPart
          return (
            <button
              key={a.userId}
              onClick={() => a.userId !== currentUserId && openProfile(a.userId)}
              title={displayTitle}
              style={{
                background: "none", border: "none", padding: 0, lineHeight: 0,
                cursor: a.userId === currentUserId ? "default" : "pointer",
                borderRadius: "50%",
                boxShadow: `0 0 0 2px ${ringColorFor(a.userId, colorCtx)}`,
              }}
            >
              <Avatar profile={a.profile} size={compact ? 22 : 26} />
            </button>
          )
        })}
        {overflow > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-3)" }}>+{overflow}</span>
        )}
      </div>

      {/* Names */}
      <div style={{ fontSize: 11, color: "var(--color-text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {names}{nameOverflow > 0 ? `, +${nameOverflow}` : ""}
      </div>

      {/* Crew badges footnote — only when !compact, and only for multi-crew attendees */}
      {!compact && attendees.some((a) => crewBadgesFor(a.userId, colorCtx).length > 1) && (
        <div style={{ display: "grid", gap: 2 }}>
          {attendees
            .filter((a) => crewBadgesFor(a.userId, colorCtx).length > 1)
            .map((a) => {
              const badges = crewBadgesFor(a.userId, colorCtx)
              const crewNames = badges
                .map((id) => colorCtx.crewNameById?.get?.(id))
                .filter(Boolean)
              if (crewNames.length === 0) return null
              return (
                <div
                  key={a.userId}
                  style={{
                    fontSize: 10,
                    color: "var(--color-text-3)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {shortName(a.profile)} · {crewNames.join(", ")}
                </div>
              )
            })
            .filter(Boolean)}
        </div>
      )}

      {/* Join — hidden once you are on this mountain, and on past dates */}
      {canJoin && !alreadyIn && (
        <button
          onClick={() => onJoin?.(resortKey)}
          disabled={joining}
          style={{
            justifySelf: "end", background: "var(--gradient-cta)", color: "white",
            border: "none", borderRadius: 10, padding: "8px 14px",
            fontSize: 12, fontWeight: 800, minHeight: 44,
            cursor: joining ? "wait" : "pointer", opacity: joining ? 0.6 : 1,
          }}
        >
          {joining ? "Joining…" : "I'm in"}
        </button>
      )}
      {alreadyIn && (
        <div style={{ justifySelf: "end", fontSize: 11, fontWeight: 800, color: "var(--color-success)" }}>
          ✓ You're in
        </div>
      )}
    </div>
  )
}
