import { resortName, resortEmoji, OPEN_RESORT_KEY } from "../../lib/resorts"
import { ringColorFor, crewBadgesFor } from "../../lib/crewColors"
import { earliestEta } from "../../lib/calendarGrouping"
import { formatEtaShort } from "../../lib/format"
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
 * @param {string|null} props.myResortKey - the signed-in user's own resort_key for
 *   this date, if any, so the join button can say "Switch from X" honestly.
 * @param {Function} [props.onEditPlan] - called with this card's resortKey when the
 *   "Add ETA"/"Edit plan" affordance is tapped, so the caller can seed the plan
 *   editor with the mountain the user actually clicked from.
 * @param {boolean} [props.myPlanHasEta] - whether the signed-in user's plan for
 *   this date already has an ETA set, purely to choose the affordance's label.
 */
export default function DayPlanCard({
  group, colorCtx, currentUserId, canJoin = false, joining = false,
  onJoin, onOpenTrip, compact = false, myResortKey = null, onEditPlan,
  myPlanHasEta = false, onAskToJoin, askingPartyId = null, askedPartyIds,
  onLeave, leaving = false,
}) {
  const openProfile = useProfileNav()
  const { resortKey, attendees, trip } = group
  const alreadyIn = attendees.some((a) => a.userId === currentUserId)
  const isOpenGroup = resortKey === OPEN_RESORT_KEY
  // daily_plans is UNIQUE (user_id, ski_date), so joining a second mountain moves
  // the plan rather than adding one. The button has to say so before the tap, not
  // leave the user to discover it after.
  const switchingFrom = !alreadyIn && myResortKey && myResortKey !== resortKey
    ? resortName(myResortKey)
    : null
  // "I'm also going", not "I'm in". This button sets YOUR plan for this mountain; it does not
  // put you in anyone's group. "I'm in" was read as joining the people on the card — which is
  // exactly the confusion that prompted parties — and the label was the lie, not the code.
  const joinLabel = switchingFrom ? `Switch from ${switchingFrom}` : "I'm also going"

  const { parties = [], solo = [] } = group
  // Which of these groups I am in, if any. Only meaningful when I am on this mountain.
  const myPartyId = attendees.find((a) => a.userId === currentUserId)?.partyId ?? null

  function partyLabel(g) {
    if (g.name) return g.name
    const owner = g.attendees.find((a) => a.userId === g.ownerId)
    if (owner) return `${shortName(owner.profile)}'s group`
    // The owner is in this party but skiing a different mountain today.
    return "Group"
  }

  function canAsk(g) {
    return Boolean(canJoin && currentUserId && g.partyId !== myPartyId && g.ownerId !== currentUserId)
  }
  const shown = attendees.slice(0, MAX_AVATARS)
  const overflow = attendees.length - shown.length
  const names = attendees.slice(0, MAX_NAMES).map((a) => shortName(a.profile)).join(", ")
  const nameOverflow = attendees.length - Math.min(attendees.length, MAX_NAMES)
  const groupEta = formatEtaShort(earliestEta(attendees))

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
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-3)" }}>
            {attendees.length} {isOpenGroup ? "free" : "going"}
          </div>
          {/* First chair. Sprint 36 let people set an ETA and then showed it
              nowhere; this is the output side. The EARLIEST of the group, not any
              one person's — it answers "when is everyone on the hill", which is
              the decision the calendar exists to support.

              Rendered only when somebody actually set one, so a card for a day of
              undecided people keeps its original two-line shape. One extra line
              that never wraps, which is what survives the 7-column desktop grid. */}
          {groupEta && (
            <div style={{
              fontSize: 10, fontWeight: 700, color: "var(--color-text-2)",
              whiteSpace: "nowrap", marginTop: 1,
            }}>
              from {groupEta}
            </div>
          )}
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
          const crewPart = badges.length > 1 && crewNames.length > 0 ? ` · ${crewNames.join(", ")}` : ""
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

      {/* Groups — who is actually skiing TOGETHER.
          Being at the same mountain is not being in the same group: several crews ski Copper
          on a Saturday and stay with their own people, linking up by asking. The mountain
          headcount above still counts everyone; this says who is with whom.
          Hidden when compact — the desktop week column has no room, and the day detail is
          where you decide who to ask. */}
      {!compact && parties.length > 0 && (
        <div style={{ display: "grid", gap: 4 }}>
          {parties.map((g) => (
            <div
              key={g.partyId}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                background: "var(--color-surface)", border: "1px solid var(--color-border)",
                borderRadius: 10, padding: "6px 8px",
              }}
            >
              <span style={{
                fontSize: 11, fontWeight: 700, color: "var(--color-text-1)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {g.partyId === myPartyId ? "👥 Your group" : `👥 ${partyLabel(g)}`}
                <span style={{ color: "var(--color-text-3)", fontWeight: 600 }}>
                  {" · "}{g.attendees.length}
                </span>
              </span>
              {canAsk(g) && askedPartyIds?.has?.(g.partyId) && (
                <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: "var(--color-text-3)" }}>
                  Asked
                </span>
              )}
              {canAsk(g) && !askedPartyIds?.has?.(g.partyId) && (
                <button
                  onClick={() => onAskToJoin?.(g)}
                  disabled={askingPartyId === g.partyId}
                  style={{
                    flexShrink: 0, background: "transparent",
                    border: "1px solid var(--color-accent)", borderRadius: 999,
                    padding: "5px 10px", fontSize: 11, fontWeight: 800,
                    color: "var(--color-accent)", minHeight: 32,
                    cursor: askingPartyId === g.partyId ? "wait" : "pointer",
                    opacity: askingPartyId === g.partyId ? 0.6 : 1,
                  }}
                >
                  {askingPartyId === g.partyId ? "Asking…" : "Ask to join"}
                </button>
              )}
            </div>
          ))}
          {solo.length > 0 && (
            <div style={{ fontSize: 10, color: "var(--color-text-3)" }}>
              {solo.length} not in a group
            </div>
          )}
        </div>
      )}

      {/* Crew badges footnote — only when !compact, and only for multi-crew attendees */}
      {!compact && attendees.some((a) => crewBadgesFor(a.userId, colorCtx).length > 1) && (
        <div style={{ display: "grid", gap: 2 }}>
          {attendees
            .map((a) => {
              const badges = crewBadgesFor(a.userId, colorCtx)
              if (badges.length < 2) return null
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
          {joining ? "Saving…" : joinLabel}
        </button>
      )}
      {alreadyIn && (
        <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--color-success)" }}>
            ✓ You&apos;re in
          </span>
          {onEditPlan && !compact && canJoin && (
            <button
              onClick={() => onEditPlan(resortKey)}
              style={{
                background: "transparent", border: "1px solid var(--color-border)",
                borderRadius: 10, padding: "8px 12px", minHeight: 44,
                fontSize: 12, fontWeight: 700, color: "var(--color-text-2)",
                cursor: "pointer",
              }}
            >
              {myPlanHasEta ? "Edit plan" : "Add ETA"}
            </button>
          )}
          {/* Changing your mind has to be possible from the card you changed it on. Saying
              you're in was one tap here; backing out used to mean leaving for your profile.
              A separate labelled button rather than making "✓ You're in" itself a toggle —
              an accidental tap should not silently cancel your weekend. */}
          {/* Only when YOUR PLAN is what puts you on this card. You can also be here via a
              trip RSVP with no plan of your own, and there "Not going" would delete nothing —
              a button that silently does nothing is worse than no button. Leaving a trip is a
              different action, on the trip card. */}
          {onLeave && canJoin && myResortKey === resortKey && (
            <button
              onClick={() => onLeave(resortKey)}
              disabled={leaving}
              style={{
                background: "transparent", border: "none",
                padding: compact ? "6px 4px" : "8px 6px", minHeight: compact ? 32 : 44,
                fontSize: compact ? 10 : 11, fontWeight: 700,
                color: "var(--color-text-3)", textDecoration: "underline",
                cursor: leaving ? "wait" : "pointer", opacity: leaving ? 0.6 : 1,
              }}
            >
              {leaving ? "…" : "Not going"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
