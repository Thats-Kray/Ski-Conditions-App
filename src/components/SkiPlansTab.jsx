import { useEffect, useState } from "react"
import PlanCalendar from "./PlanCalendar"
import { localDateKey, monthBounds } from "../lib/calendarDates"
import {
  getCurrentUser,
  getVisiblePlansInRange,
  upsertDailyPlan,
  deleteDailyPlan,
} from "../lib/socialApi"
import { resortName, resortEmoji } from "../lib/resorts"
import { formatDate } from "../lib/format"

// Literal hex: feeds `${PLAN_COLOR}11`/`33` alpha-suffix template literals below.
const PLAN_COLOR = "#67e8f9"

const fieldStyle = {
  width: "100%", background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10,
  padding: "10px 12px", color: "white", fontSize: 14,
  boxSizing: "border-box", outline: "none", colorScheme: "dark",
}

/**
 * daily_plans.eta is stored as a timestamptz, but upsertDailyPlan() re-parses
 * whatever it is given through buildPlanEta(), which only accepts "HH:MM" or
 * "H:MM AM/PM" and returns null for anything else — including an ISO timestamp.
 *
 * Without this conversion, editing a day that already has a check-in would
 * silently blank its ETA, because upsertDailyPlan writes the whole row.
 */
function etaToTimeInput(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

/**
 * "Days I plan to ski" — a month calendar of one person's daily_plans.
 *
 * `userId` null  => the signed-in user's own plans, editable when `editable`.
 * `userId` set   => that friend's plans, read-only.
 */
export default function SkiPlansTab({ userId = null, editable = false, resorts = [] }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [plans, setPlans] = useState([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [draftResort, setDraftResort] = useState("")
  const [draftVisibility, setDraftVisibility] = useState("friends")
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const todayKey = localDateKey()

  // Resolve whose plans to show and fetch them in one effect.
  //
  // Single effect on purpose: as two, a null result from getCurrentUser() left
  // ownerId null, the fetch effect early-returned, and `loading` was never
  // cleared — a permanent "Loading plans...". The finally here always clears it.
  //
  // On a friend's profile the owner is the userId prop; on your own it's the
  // signed-in user, which getVisiblePlansInRange cannot tell us on its own since
  // the range query also returns friends' and crewmates' rows.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadError(null)
      try {
        const id = userId || (await getCurrentUser())?.id || null
        if (cancelled) return
        if (!id) { setPlans([]); return }

        const { start, end } = monthBounds(month)
        const rows = await getVisiblePlansInRange(start, end)
        // RLS already scoped these rows to what we may see; narrow to the one
        // person whose profile this is.
        if (!cancelled) setPlans(rows.filter((p) => p.user_id === id))
      } catch (err) {
        if (!cancelled) { setPlans([]); setLoadError(err) }
      } finally {
        if (!cancelled) setHasLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [userId, month])

  const entriesByDate = new Map()
  for (const p of plans) {
    const key = (p.ski_date || "").slice(0, 10)
    if (!key) continue
    if (!entriesByDate.has(key)) entriesByDate.set(key, [])
    entriesByDate.get(key).push(p)
  }

  const selectedPlan = selectedDate
    ? plans.find((p) => (p.ski_date || "").slice(0, 10) === selectedDate) || null
    : null
  const isPast = selectedDate ? selectedDate < todayKey : false
  const canEdit = editable && !isPast

  function handleSelectDay(key) {
    setSelectedDate(key)
    setSaveError(null)
    const existing = key ? plans.find((p) => (p.ski_date || "").slice(0, 10) === key) : null
    setDraftResort(existing?.resort_key || "")
    setDraftVisibility(existing?.visibility || "friends")
  }

  async function handleSave() {
    if (!draftResort || !selectedDate) return
    setBusy(true); setSaveError(null)
    const previous = plans
    try {
      // upsertDailyPlan writes the whole row (onConflict user_id,ski_date), so
      // every field we omit is written as null. Carry the check-in fields
      // forward or editing a day you already checked into would wipe them.
      const saved = await upsertDailyPlan({
        ski_date: selectedDate,
        resort_key: draftResort,
        visibility: draftVisibility,
        status: selectedPlan?.status || "planned",
        eta: etaToTimeInput(selectedPlan?.eta),
        note: selectedPlan?.note ?? null,
        arrived_at: selectedPlan?.arrived_at ?? null,
      })
      setPlans((prev) => [
        ...prev.filter((p) => (p.ski_date || "").slice(0, 10) !== selectedDate),
        saved,
      ])
    } catch (err) {
      setPlans(previous)
      setSaveError(err?.message || "Couldn't save that plan. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (!selectedPlan) return
    setBusy(true); setSaveError(null)
    const previous = plans
    setPlans((prev) => prev.filter((p) => p.id !== selectedPlan.id))
    try {
      await deleteDailyPlan(selectedPlan.id)
      setDraftResort("")
    } catch (err) {
      setPlans(previous)
      setSaveError(err?.message || "Couldn't remove that plan. Try again.")
    } finally {
      setBusy(false)
    }
  }

  // Only the first load blocks the tab. Returning the placeholder on a month
  // change would unmount PlanCalendar, and it would remount with its viewDate
  // re-initialised to the current month — making it impossible to page forward.
  if (!hasLoaded) {
    return <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Loading plans…</div>
  }

  return (
    <div>
      {/* Inline, not an early return: unmounting PlanCalendar here would take
          the month nav with it, and loadError only clears in the effect keyed on
          [userId, month] — so one failed fetch would brick the tab for good. */}
      {loadError && (
        <div style={{ color: "var(--color-danger)", fontSize: 13, marginBottom: 12 }}>
          Couldn&apos;t load ski plans for this month. Try another month, or come back in a bit.
        </div>
      )}

      {editable && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
          Tap a day to mark where you&apos;re skiing. Friends and crewmates can see it; mark a day Private to hide it.
        </div>
      )}

      <PlanCalendar
        entriesByDate={entriesByDate}
        dotColorFor={() => PLAN_COLOR}
        legend={[{ color: PLAN_COLOR, label: "Planned ski day" }]}
        selectedDate={selectedDate}
        onSelectDay={handleSelectDay}
        onMonthChange={(d) => { setMonth(d); setSelectedDate(null) }}
        renderDayDetail={(dateKey) => (
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 16px", display: "grid", gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.7)" }}>{formatDate(dateKey)}</div>

            {selectedPlan && (
              <div style={{
                background: `${PLAN_COLOR}11`, border: `1px solid ${PLAN_COLOR}33`,
                borderLeft: `3px solid ${PLAN_COLOR}`, borderRadius: "0 12px 12px 0",
                padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>{resortEmoji(selectedPlan.resort_key)}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "white" }}>
                    {resortName(selectedPlan.resort_key) || selectedPlan.resort_key}
                  </div>
                  <div style={{ fontSize: 11, color: PLAN_COLOR, fontWeight: 700, marginTop: 2 }}>
                    {selectedPlan.visibility === "private" ? "🔒 Private" : "👥 Visible to friends & crews"}
                  </div>
                </div>
              </div>
            )}

            {!selectedPlan && !canEdit && (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>No plans this day.</div>
            )}

            {canEdit && (
              <>
                <select
                  value={draftResort}
                  onChange={(e) => setDraftResort(e.target.value)}
                  style={fieldStyle}
                  disabled={busy}
                  aria-label="Mountain"
                >
                  <option value="">Pick a mountain…</option>
                  {resorts.map((r) => (
                    <option key={r.resortKey} value={r.resortKey}>{r.name}</option>
                  ))}
                </select>

                <div style={{ display: "flex", gap: 6 }}>
                  {[{ key: "friends", label: "👥 Friends & Crews" }, { key: "private", label: "🔒 Private" }].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setDraftVisibility(key)}
                      disabled={busy}
                      style={{
                        flex: 1, padding: "8px 0", borderRadius: 999, fontSize: 12, fontWeight: 700,
                        border: draftVisibility === key ? "1px solid rgba(56,189,248,0.5)" : "1px solid rgba(255,255,255,0.12)",
                        background: draftVisibility === key ? "rgba(56,189,248,0.25)" : "transparent",
                        color: draftVisibility === key ? "white" : "rgba(255,255,255,0.5)",
                        cursor: busy ? "default" : "pointer", minHeight: 44,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {saveError && (
                  <div style={{ fontSize: 12, color: "var(--color-danger)" }}>{saveError}</div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleSave}
                    disabled={busy || !draftResort}
                    style={{
                      flex: 1, padding: "11px 0", borderRadius: 12, border: "none",
                      background: draftResort ? "var(--gradient-cta)" : "rgba(255,255,255,0.08)",
                      color: "white", fontWeight: 800, fontSize: 14,
                      cursor: busy || !draftResort ? "default" : "pointer",
                      opacity: busy ? 0.6 : 1, minHeight: 44,
                    }}
                  >
                    {busy ? "Saving…" : selectedPlan ? "Update Plan" : "Save Plan"}
                  </button>
                  {selectedPlan && (
                    <button
                      onClick={handleRemove}
                      disabled={busy}
                      style={{
                        padding: "11px 16px", borderRadius: 12,
                        border: "1px solid var(--color-danger)", background: "var(--color-danger-bg)",
                        color: "var(--color-danger)", fontWeight: 800, fontSize: 14,
                        cursor: busy ? "default" : "pointer", minHeight: 44,
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </>
            )}

            {editable && isPast && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                Past days can&apos;t be edited here — log a session from the Leaderboard instead.
              </div>
            )}
          </div>
        )}
      />
    </div>
  )
}
