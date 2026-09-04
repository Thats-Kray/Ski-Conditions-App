import { resortName, resortEmoji, OPEN_RESORT_KEY } from "../../lib/resorts"
import { ringColorFor, crewBadgesFor } from "../../lib/crewColors"
import { earliestEta } from "../../lib/calendarGrouping"
import { formatEtaShort } from "../../lib/format"
import { useProfileNav } from "../../lib/profileNav"
import Avatar from "../ui/Avatar"

const MAX_AVATARS = 5
const MAX_NAMES = 3

function shortName(profile) {
  return profile?.first_name || profile?.full_name?.split(" ")[0] || profile?.username || "Someone"
}

/**
 * One mountain on one day: who is going, in which groups, and how to join.
 *
 * Structure follows the mockup: an unbordered heading row (mountain + "N going")
 * over one BORDERED CARD PER PARTY. It used to be the reverse — one card per
 * mountain with the parties as thin rows inside it — which showed every avatar at
 * the mountain on a card labelled with one crew's name.
 *
 * Each party card carries a left accent bar in its OWNER's crew color
 * (ringColorFor(ownerId, colorCtx)), reusing the existing crew-color system rather
 * than inventing a second one. The card surface itself stays neutral: a mountain
 * can hold skiers from two crews, so coloring the surface would need an arbitrary
 * tie-break (the original spec decision #7 — still true, now applied one level down).
 *
 * There is no "open"/direct-join party. Every party you are not in shows the locked
 * "Ask to join", which is the only thing migrations 037/038 actually support.
 *
 * @param {Object} props
 * @param {Object} props.group - { resortKey, attendees, parties, solo, trip }
 * @param {Object} props.colorCtx - crew color context; optionally includes crewNameById (Map<crewId, string>)
 * @param {string|null} props.currentUserId
 * @param {boolean} props.canJoin
 * @param {boolean} props.joining
 * @param {Function} props.onJoin
 * @param {Function} props.onOpenTrip
 * @param {string|null} props.myResortKey - the signed-in user's own resort_key for
 *   this date, if any, so the join button can say "Switch from X" honestly.
 * @param {Function} [props.onEditPlan] - called with this card's resortKey when the
 *   "Add ETA"/"Edit plan" affordance is tapped.
 * @param {boolean} [props.myPlanHasEta] - purely to choose that affordance's label.
 * @param {Function} [props.onAskToJoin] - called with the party object.
 * @param {string|null} [props.askingPartyId]
 * @param {Set<string>} [props.askedPartyIds]
 * @param {Function} [props.onLeave]
 * @param {boolean} [props.leaving]
 */
export default function DayPlanCard({
  group, colorCtx, currentUserId, canJoin = false, joining = false,
  onJoin, onOpenTrip, myResortKey = null, onEditPlan,
  myPlanHasEta = false, onAskToJoin, askingPartyId = null, askedPartyIds,
  onLeave, leaving = false,
}) {
  const openProfile = useProfileNav()
  const { resortKey, attendees, trip, parties = [], solo = [] } = group
  const alreadyIn = attendees.some((a) => a.userId === currentUserId)
  const isOpenGroup = resortKey === OPEN_RESORT_KEY
  // daily_plans is UNIQUE (user_id, ski_date), so joining a second mountain moves
  // the plan rather than adding one. The button has to say so before the tap.
  const switchingFrom = !alreadyIn && myResortKey && myResortKey !== resortKey
    ? resortName(myResortKey)
    : null
  // "I'm also going", not "I'm in". This sets YOUR plan for this mountain; it does
  // not put you in anyone's group. That is what "Ask to join" is for.
  const joinLabel = switchingFrom ? `Switch from ${switchingFrom}` : "I'm also going"
  // Which of these groups I am in, if any. Only meaningful when I am on this mountain.
  const myPartyId = attendees.find((a) => a.userId === currentUserId)?.partyId ?? null
  const groupEta = formatEtaShort(earliestEta(attendees))

  function partyLabel(p) {
    if (p.name) return p.name
    const owner = p.attendees.find((a) => a.userId === p.ownerId)
    if (owner) return `${shortName(owner.profile)}'s group`
    // The owner is in this party but skiing a different mountain today.
    return "Group"
  }

  function canAsk(p) {
    return Boolean(canJoin && currentUserId && p.partyId !== myPartyId && p.ownerId !== currentUserId)
  }

  /** One ringed, tappable avatar. `overlap` stacks it under the previous one. */
  function renderAvatar(a, index, overlap) {
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
          marginLeft: overlap && index > 0 ? -8 : 0,
          boxShadow: `0 0 0 2px ${ringColorFor(a.userId, colorCtx)}`,
        }}
      >
        <Avatar profile={a.profile} size={26} />
      </button>
    )
  }

  return (
    <div style={{ display: "grid", gap: 9 }}>
      {/* Mountain heading — a heading, not a card. The cards below are the groups. */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 14, fontWeight: 800, color: "var(--color-text-1)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {resortEmoji(resortKey)} {resortName(resortKey) || resortKey}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, color: "var(--color-accent)",
          background: "var(--color-accent-dim)", borderRadius: 999,
          padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0,
        }}>
          {attendees.length} {isOpenGroup ? "free" : "going"}
        </span>
        {/* First chair: the EARLIEST ETA of everyone on the mountain, not any one
            person's — it answers "when is everyone on the hill". Rendered only when
            somebody actually set one. */}
        {groupEta && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: "var(--color-text-3)", whiteSpace: "nowrap",
          }}>
            from {groupEta}
          </span>
        )}
      </div>

      {/* Trip badge — a trip at this resort folds in here rather than sitting beside
          it, so one day's answer is not split across two lists. */}
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

      {parties.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          {parties.map((p) => {
            const mine = p.partyId === myPartyId
            const shown = p.attendees.slice(0, MAX_AVATARS)
            const overflow = p.attendees.length - shown.length
            const asking = askingPartyId === p.partyId
            const asked = Boolean(askedPartyIds?.has?.(p.partyId))
            return (
              <div
                key={p.partyId}
                style={{
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  // The one place a color rides the surface, and it is unambiguous:
                  // a PARTY has exactly one owner, so there is nothing to tie-break.
                  borderLeft: `3px solid ${ringColorFor(p.ownerId, colorCtx)}`,
                  borderRadius: 12, padding: "11px 12px", display: "grid", gap: 10,
                }}
              >
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                }}>
                  <span style={{
                    fontSize: 13, fontWeight: 800, color: "var(--color-text-1)", minWidth: 0,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {mine ? "👥 Your group" : `👥 ${partyLabel(p)}`}
                    <span style={{ color: "var(--color-text-3)", fontWeight: 600 }}>
                      {" · "}{p.attendees.length}
                    </span>
                  </span>
                  {/* Avatars scoped to THIS party. The mountain headcount above still
                      counts everyone; this row says who is actually together. */}
                  <div style={{ display: "flex", paddingLeft: 8, flexShrink: 0 }}>
                    {shown.map((a, i) => renderAvatar(a, i, true))}
                    {overflow > 0 && (
                      <span style={{
                        marginLeft: -8, width: 26, height: 26, borderRadius: "50%",
                        background: "var(--color-surface-popover)", border: "2px solid var(--color-bg)",
                        display: "grid", placeItems: "center",
                        fontSize: 9, fontWeight: 800, color: "var(--color-text-2)",
                      }}>
                        +{overflow}
                      </span>
                    )}
                  </div>
                </div>

                {mine && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    background: "var(--color-success-bg)", border: "1px solid var(--color-success)",
                    color: "var(--color-success)", borderRadius: 10, padding: 9,
                    fontSize: 12, fontWeight: 800,
                  }}>
                    ✓ You&apos;re in this group
                  </div>
                )}
                {!mine && canAsk(p) && asked && (
                  <div style={{
                    textAlign: "center", borderRadius: 10, padding: 9,
                    border: "1px solid var(--color-border)",
                    fontSize: 12, fontWeight: 800, color: "var(--color-text-3)",
                  }}>
                    Asked
                  </div>
                )}
                {!mine && canAsk(p) && !asked && (
                  <button
                    onClick={() => onAskToJoin?.(p)}
                    disabled={asking}
                    style={{
                      width: "100%", display: "flex", alignItems: "center",
                      justifyContent: "center", gap: 7,
                      background: "transparent", color: "var(--color-accent)",
                      border: "1px solid var(--color-accent)", borderRadius: 10,
                      padding: 9, minHeight: 44, fontSize: 12, fontWeight: 800,
                      cursor: asking ? "wait" : "pointer", opacity: asking ? 0.6 : 1,
                    }}
                  >
                    {asking ? "Asking…" : "🔒 Ask to join"}
                  </button>
                )}
              </div>
            )
          })}
          {/* Solo attendees stay a footnote rather than becoming their own card shape:
              the mockup has no ungrouped sample to match, and inventing one is not
              warranted by anything in it. */}
          {solo.length > 0 && (
            <div style={{ fontSize: 10, color: "var(--color-text-3)" }}>
              {solo.length} not in a group
            </div>
          )}
        </div>
      ) : (
        // Nobody on this mountain is in a party — which is most of them, since
        // parties are opt-in. Without this fallback the card would show a headcount
        // and no faces at all.
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
            {attendees.slice(0, MAX_AVATARS).map((a, i) => renderAvatar(a, i, false))}
            {attendees.length > MAX_AVATARS && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-3)" }}>
                +{attendees.length - MAX_AVATARS}
              </span>
            )}
          </div>
          <div style={{
            fontSize: 11, color: "var(--color-text-2)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {attendees.slice(0, MAX_NAMES).map((a) => shortName(a.profile)).join(", ")}
            {attendees.length > MAX_NAMES ? `, +${attendees.length - MAX_NAMES}` : ""}
          </div>
        </div>
      )}

      {/* Crew badges footnote — only for attendees in two or more selected crews,
          whose ring can only show the first one. */}
      {attendees.some((a) => crewBadgesFor(a.userId, colorCtx).length > 1) && (
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

      {/* Mountain-level actions. "I'm also going" joins the MOUNTAIN, not a party —
          unchanged, deliberately named, and hidden once you are on this mountain or
          the date has passed. */}
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
          {onEditPlan && canJoin && (
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
          {/* Only when YOUR PLAN is what puts you on this card. You can also be here
              via a trip RSVP with no plan of your own, and there "Not going" would
              delete nothing — a button that silently does nothing is worse than none.
              Leaving a trip is a different action, on the trip card. */}
          {onLeave && canJoin && myResortKey === resortKey && (
            <button
              onClick={() => onLeave(resortKey)}
              disabled={leaving}
              style={{
                background: "transparent", border: "none",
                padding: "8px 6px", minHeight: 44,
                fontSize: 11, fontWeight: 700,
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
