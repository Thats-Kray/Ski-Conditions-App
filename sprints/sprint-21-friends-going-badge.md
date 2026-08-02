# Sprint 21 — "Friends Going This Weekend" Badge

**Goal:** ROADMAP TASK 6.1 — show a stacked-avatar badge on each resort card when 1+ friends have an upcoming trip there in the next 7 days, with a tap-to-expand popover listing names.
**Estimated effort:** 1 day
**Depends on:** Nothing new — uses existing `ski_trips`/`trip_rsvps` tables and the existing `friend_requests`-based friend model.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**`src/App.jsx`** — `ResortCard` (lines 375-494) currently receives `{ r, skierCounts, skierDetails }`. The dashboard grid (lines 1612-1616):
```jsx
<main className="resort-grid">
  {rows.map((r) => (
    <ResortCard key={r.name} r={r} skierCounts={skierCounts} skierDetails={skierDetails} />
  ))}
</main>
```
`r.resortKey` is the field to key friend-trip lookups on (matches `RESORTS` static config).

**`src/lib/socialApi.js`** — no existing "trips grouped by resort" helper. The closest analog, `getFriendsUpcomingTrips()` (lines 1978-2083), groups the same underlying data (friends' hosted trips + "going" RSVPs, next 14 days) **by date**, not by resort. **Read this function in full before writing S21-T1** — mirror its exact Supabase query structure (which tables it queries, how it joins `profiles`, how it filters to friends + upcoming + date range) rather than guessing at the join syntax; only the final grouping key changes (from `ski_date` to `resort_key`), and this sprint uses a 7-day window (not 14) per ROADMAP's "this weekend" framing.

`getAcceptedFriendIds(currentUserId)` (private helper, same file, lines 405-424, returns `Promise<Set<uuid>>`) — since the new function lives in the same file, call it directly; no export change needed.

**Note on pre-existing dead stubs:** `getResortSkierCounts()`/`getResortSkierDetails()` (lines 393-399) are unrelated, unimplemented stubs (always return `[]`) currently feeding `ResortCard`'s `skierCounts`/`skierDetails` props — those represent a different concept (who's checked in today via `daily_plans`) and are **not** what this sprint builds or touches. Don't confuse the two.

---

## Tasks

S21-T1 (data function) has no dependency. S21-T2 (badge UI + wiring) depends on S21-T1.

---

### S21-T1 — `getFriendUpcomingTripsByResort()`

**File to modify:** `src/lib/socialApi.js`

```js
export async function getFriendUpcomingTripsByResort() {
  const user = await getCurrentUser()
  const friendIds = [...(await getAcceptedFriendIds(user.id))]
  if (!friendIds.length) return {}

  const today = new Date().toISOString().slice(0, 10)
  const end = new Date()
  end.setDate(end.getDate() + 7)
  const endDate = end.toISOString().slice(0, 10)

  // Mirror getFriendsUpcomingTrips()'s exact query shape here (hosted trips + "going" RSVPs,
  // filtered to friendIds, status upcoming, ski_date between today and endDate) — adapt the
  // real query syntax from that function rather than trusting this sketch verbatim, since the
  // exact embedded-relation join syntax needs to match what Supabase actually accepts for this
  // schema (verify against the working function, don't guess).

  const byResort = {}
  function addFriend(resortKey, profile) {
    if (!resortKey || !profile) return
    byResort[resortKey] = byResort[resortKey] || []
    if (!byResort[resortKey].some((p) => p.id === profile.id)) {
      byResort[resortKey].push(profile)
    }
  }

  // for each hosted trip: addFriend(trip.resort_key, trip.host_profile)
  // for each "going" RSVP: addFriend(rsvp.trip.resort_key, rsvp.profile)

  return byResort // { [resort_key]: [profile, profile, ...] }
}
```

**Acceptance criteria:**
- Returns an object keyed by `resort_key`, each value a de-duplicated array of friend profile objects (no friend appears twice for the same resort even if they both hosted AND RSVP'd, or RSVP'd to two different trips at the same resort).
- Only includes trips in the next 7 days (`today` through `today + 7`), status `upcoming`.
- Only includes friends (never the current user themselves, and never non-friends).
- Returns `{}` (not an error) for a user with zero accepted friends.

**Verify:**
```bash
npm run dev
```
With at least one friend having an upcoming trip in the next 7 days, call this function from the browser console (or temporarily log its output in `App.jsx`) and confirm the shape.

---

### S21-T2 — Badge UI + wiring into `App.jsx`

**File to modify:** `src/App.jsx`

**Step 1 — Import** `getFriendUpcomingTripsByResort` from `./lib/socialApi` and `Avatar` from `./components/ui/Avatar` (check if `Avatar` is already imported into `App.jsx` — it's used extensively elsewhere in the app, but confirm for this specific file before adding a duplicate import).

**Step 2 — Fetch once per dashboard load**, alongside wherever other social-signal data is fetched (or in a standalone `useEffect` if `App.jsx` doesn't currently fetch other social data):
```js
const [friendTripsByResort, setFriendTripsByResort] = useState({})

useEffect(() => {
  if (!currentUser) { setFriendTripsByResort({}); return }
  let cancelled = false
  getFriendUpcomingTripsByResort()
    .then((map) => { if (!cancelled) setFriendTripsByResort(map) })
    .catch(() => { if (!cancelled) setFriendTripsByResort({}) })
  return () => { cancelled = true }
}, [currentUser])
```

**Step 3 — Add the badge component** (module-level in `App.jsx`, or extract to `src/components/ui/` if you prefer — either is fine, this component is small enough to keep local):
```jsx
function FriendsGoingBadge({ friends }) {
  const [open, setOpen] = useState(false)
  if (!friends?.length) return null
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.06)", border: "none", borderRadius: "var(--radius-pill)", padding: "4px 10px 4px 6px", cursor: "pointer" }}
      >
        <div style={{ display: "flex" }}>
          {friends.slice(0, 3).map((f, i) => (
            <div key={f.id} style={{ marginLeft: i > 0 ? -8 : 0, border: "2px solid var(--color-bg)", borderRadius: "50%" }}>
              <Avatar profile={f} size={22} />
            </div>
          ))}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-2)" }}>
          {friends.length} friend{friends.length === 1 ? "" : "s"} going this weekend
        </span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "110%", left: 0, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 10, zIndex: 20, minWidth: 160, boxShadow: "var(--shadow-card)" }}>
          {friends.map((f) => (
            <div key={f.id} style={{ fontSize: 13, color: "var(--color-text-1)", padding: "4px 0" }}>{f.full_name || f.username}</div>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 4 — Render it on each `ResortCard`.** Pass `friendsGoing={friendTripsByResort[r.resortKey] || []}` into `ResortCard`'s props at the grid render site, and render `<FriendsGoingBadge friends={friendsGoing} />` somewhere sensible in the card body (read `ResortCard`'s current JSX to pick a spot that doesn't crowd the existing tier badge/score — likely below the primary stats row).

**Acceptance criteria:**
- Resort cards for resorts with 0 friends going next 7 days show no badge (component returns `null`).
- Resort cards with 1+ friends going show stacked avatars (max 3 shown) + count text.
- Tapping the badge opens a popover listing every friend's name (not just the first 3 shown as avatars); tapping again closes it.
- Logged-out users see no badges anywhere (the fetch is gated on `currentUser`).

**Verify in browser:**
```bash
npm run dev
```
With test data (a friend with an upcoming trip in the next 7 days), confirm the badge appears on the correct resort card, the popover works, and cards with no friend activity show nothing.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add src/lib/socialApi.js src/App.jsx
git commit -m "feat: add friends-going-this-weekend badge to resort cards"
```

---

## Sprint Acceptance Criteria

- [ ] `getFriendUpcomingTripsByResort()` exists and returns a correctly deduplicated, friends-only, 7-day-windowed map
- [ ] Resort cards show a stacked-avatar badge with count when friends are going, nothing otherwise
- [ ] Tapping the badge opens a popover with full friend names
- [ ] `npm run build` succeeds
- [ ] Verified in browser with real friend/trip test data

## Out of Scope for This Sprint

- Sprint-22 (community activity signal) — a separate, non-friends-scoped "X users skied here this week" badge, built next.
- Any change to `getFriendsUpcomingTrips()` (the existing date-grouped function stays as-is, used elsewhere).
</content>
