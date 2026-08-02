# Sprint 27 — Vibe Score

**Goal:** ROADMAP TASK 8.2 — a secondary "Vibe Score" badge per resort card, blending recent check-ins and upcoming RSVPs with the Powder Score into a 🔥 High / 👍 Active / 😶 Quiet social-energy signal.
**Estimated effort:** 1 day
**Depends on:** Sprint 8 (UI component library) merged, for `Badge`.

**Scope decision, explained:** ROADMAP's tooltip copy says "Based on friend activity and recent check-ins," implying a friends-only scope. This plan instead scopes the Vibe Score **community-wide** (all users' check-ins and RSVPs, not just the current user's friends) — matching the PRD's own framing of Vibe Score as a resort feeling "alive with data" from the broader user base (see `PRD.md` Phase 4 description and the `Ski Tracking PRD.md` competitor note on Slopes' "expected stats based on other users"), and avoiding redundancy with sprint-21's already-friends-scoped "Friends Going This Weekend" badge — a resort could show 0 friends going but still have a lively Vibe Score from the wider community, which is a more useful and differentiated signal than duplicating sprint-21's friends-only data under a different name. The tooltip copy is adjusted accordingly (see S27-T2).

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**Data sources:**
- **Check-ins** = `daily_plans` rows (the "I'm skiing today/soon" check-in, from `SkiCheckInForm.jsx`) with `ski_date` in the last 7 days, grouped by `resort_key`. This table has no existing per-resort aggregation helper — this sprint adds one.
- **Upcoming RSVPs** = `trip_rsvps` with `status = 'going'`, joined to `ski_trips` with `status = 'upcoming'` and `ski_date` in the next 7 days, grouped by `resort_key`. This is the same underlying data sprint-21's `getFriendUpcomingTripsByResort()` uses, but **not friend-filtered** here — this sprint queries across all users, matching the community-wide scope decision above.
- **Powder Score** — already computed client-side per resort in `App.jsx`'s `refresh()` (`r.powderScore`), used directly in the formula.

**Formula (from ROADMAP TASK 8.2, unchanged):**
```
vibeScore = clamp((checkins × 2) + (upcomingRsvps × 3) + (powderScore × 0.2), 0, 100)
```
Tiers: `≥ 70` → 🔥 High, `40–69` → 👍 Active, `< 40` → 😶 Quiet.

---

## Tasks

S27-T1 (`getResortVibeData()`) has no dependency. S27-T2 (badge UI + wiring) depends on S27-T1.

---

### S27-T1 — `getResortVibeData()`

**File to modify:** `src/lib/socialApi.js`

```js
export async function getResortVibeData() {
  const today = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekAgoStr = weekAgo.toISOString().slice(0, 10)
  const weekAhead = new Date()
  weekAhead.setDate(weekAhead.getDate() + 7)
  const weekAheadStr = weekAhead.toISOString().slice(0, 10)

  const [{ data: checkins, error: checkinErr }, { data: rsvpRows, error: rsvpErr }] = await Promise.all([
    supabase.from("daily_plans").select("resort_key").gte("ski_date", weekAgoStr).lte("ski_date", today),
    supabase
      .from("trip_rsvps")
      .select("status, ski_trips!inner(resort_key, ski_date, status)")
      .eq("status", "going")
      .eq("ski_trips.status", "upcoming")
      .gte("ski_trips.ski_date", today)
      .lte("ski_trips.ski_date", weekAheadStr),
  ])
  if (checkinErr) throw checkinErr
  if (rsvpErr) throw rsvpErr

  const checkinCounts = {}
  for (const c of checkins || []) checkinCounts[c.resort_key] = (checkinCounts[c.resort_key] || 0) + 1

  const rsvpCounts = {}
  for (const r of rsvpRows || []) {
    const key = r.ski_trips?.resort_key
    if (key) rsvpCounts[key] = (rsvpCounts[key] || 0) + 1
  }

  return { checkinCounts, rsvpCounts } // both { [resort_key]: count }
}
```
Verify the exact embedded-relation join syntax (`ski_trips!inner(...)`) against a working example elsewhere in this codebase (e.g. however `rsvpToTrip`/`getTripDetail` query `trip_rsvps` joined to `ski_trips`) before trusting this sketch verbatim — Supabase's PostgREST embedding syntax needs to match how foreign keys are actually declared in this schema.

**Acceptance criteria:**
- Returns `{ checkinCounts, rsvpCounts }`, each an object keyed by `resort_key` with integer counts, covering **all users** (not friend-filtered).
- `checkinCounts` covers the last 7 days; `rsvpCounts` covers the next 7 days, "going" status only, upcoming trips only.
- Resorts with zero activity simply have no key in the object (not a `0` entry) — callers must default missing keys to `0`.

---

### S27-T2 — Vibe Score badge on resort cards

**File to modify:** `src/App.jsx`

**Step 1 — Fetch once per dashboard load:**
```js
const [vibeData, setVibeData] = useState({ checkinCounts: {}, rsvpCounts: {} })

useEffect(() => {
  getResortVibeData()
    .then(setVibeData)
    .catch(() => setVibeData({ checkinCounts: {}, rsvpCounts: {} }))
}, [])
```
Import `getResortVibeData` from `./lib/socialApi`. This fetch is not gated on `currentUser` — Vibe Score is a public, community-wide signal like sprint-22's activity count.

**Step 2 — Add the compute helpers** (module-level, near `tierColor`/`riskColor`):
```js
function computeVibeScore(checkins, rsvps, powderScore) {
  const raw = checkins * 2 + rsvps * 3 + (powderScore ?? 0) * 0.2
  return Math.max(0, Math.min(100, raw))
}

function vibeTier(score) {
  if (score >= 70) return { label: "🔥 High", color: "#ff9d9d" }
  if (score >= 40) return { label: "👍 Active", color: "#ffe39a" }
  return { label: "😶 Quiet", color: "#64748b" }
}
```

**Step 3 — Render the badge** on `ResortCard`, using `Badge` from `./components/ui/Badge` (sprint-8) rather than a hand-rolled pill:
```jsx
import Badge from "./components/ui/Badge"

const checkins = vibeData.checkinCounts[r.resortKey] || 0
const rsvps = vibeData.rsvpCounts[r.resortKey] || 0
const vibeScore = computeVibeScore(checkins, rsvps, r.powderScore)
const vibe = vibeTier(vibeScore)

<span title="Based on check-ins and upcoming trips at this resort">
  <Badge label={vibe.label} color={vibe.color} size="sm" />
</span>
```
Note the tooltip text is **"Based on check-ins and upcoming trips at this resort"** — not ROADMAP's literal "friend activity and recent check-ins" — matching this sprint's documented community-wide scope decision (see top of this file). Place the Vibe badge visually secondary to the Powder Score badge (smaller, or positioned below/beside it), per ROADMAP's explicit framing of Powder Score as primary and Vibe Score as a secondary signal.

**Acceptance criteria:**
- Every resort card shows a Vibe Score badge (🔥/👍/😶) computed from the documented formula.
- A resort with zero check-ins and zero RSVPs but a high powder score can still show 😶 Quiet if `powderScore × 0.2` alone doesn't clear 40 — confirm this isn't confusing in practice by checking a real example (a 100-powder-score, zero-activity resort scores `20` on the vibe formula, correctly "Quiet" — the formula is activity-dominant by design, not powder-dominant, which is intentional per ROADMAP's framing of Vibe as a *social* signal distinct from Powder Score).
- Tooltip/title text is present and accurate to the community-wide scope.

**Verify in browser:**
```bash
npm run dev
```
With varying check-in/RSVP test data across a couple of resorts, confirm the Vibe badges differ appropriately and the tooltip shows on hover.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add src/lib/socialApi.js src/App.jsx
git commit -m "feat: add community Vibe Score badge to resort cards"
```

---

## Sprint Acceptance Criteria

- [ ] `getResortVibeData()` returns community-wide check-in and upcoming-RSVP counts per resort
- [ ] Vibe Score is computed per the documented formula and tiered correctly (High/Active/Quiet)
- [ ] Every resort card shows the Vibe badge as a secondary signal alongside the primary Powder Score badge
- [ ] `npm run build` succeeds
- [ ] Verified in browser with varying activity levels across resorts

## Out of Scope for This Sprint

- Friends-only Vibe scoping (deliberately rejected — see the scope decision note; sprint-21 already covers the friends-only case under a different, non-redundant badge).
- Persisting or caching Vibe Score server-side — it's computed fresh client-side on every dashboard load, same as the Powder Score.
</content>
