# Sprint 26 — 7-Day Snowfall Forecast Panel

**Goal:** ROADMAP TASK 8.1 — an expandable "This Week ▾" panel on each resort card showing 7 daily snowfall mini-bars, with the best day highlighted.
**Estimated effort:** 1 day
**Depends on:** Nothing new — reuses existing NWS proxy routes.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**Important correction to scope:** ROADMAP TASK 8.1 says to confirm "NWS 7-day forecast data is accessible from `/api/nws/forecast`." That endpoint (`server/index.js:291-305`) is a thin pass-through proxy for NWS's `/forecast` text-forecast endpoint — it returns ~14 day/night periods with `shortForecast`/`detailedForecast` **text** and temperature/wind numbers, but **no structured numeric snowfall-inches value**. The app already fetches numeric snowfall data from a **different** route, `/api/nws/snow` (the snowfall-amount grid endpoint), which is what currently feeds `snowPrev24in`/`snow24in`/`snow48in` into the Powder Score calculation in `src/App.jsx`. This sprint's 7-day *numeric* forecast bars must be built from `/api/nws/snow`'s grid data (bucketed into 7 daily totals), not from `/api/nws/forecast`'s text periods.

**Read `src/App.jsx`'s existing snow-grid parsing logic before starting** — find wherever it currently computes `snow24in`/`snow48in` from the `/api/nws/snow` response (grid `values` array, typically `[{ validTime: "...duration...", value: N }, ...]` in millimeters per NWS convention) and whatever `toInches()`-style helper it already uses for the mm→inches conversion (the PRD explicitly notes this conversion already exists and has a known edge case around NWS unit codes — reuse the existing helper, don't write a second one). This sprint **extends** that same parsing to bucket the full grid into 7 daily sums instead of just today's/tomorrow's total, rather than writing new grid-parsing logic from scratch.

**Existing expandable-accordion pattern in `ResortCard`** (`src/App.jsx`) — `expanded` state (line ~376) + toggle button (~454-459, "▼ Show Details" / "▲ Hide Details") + conditional render block (~453-480). This sprint adds a **second, independent** expandable row — "This Week ▾" — collapsed by default, separate from the existing details toggle (don't merge them; ROADMAP asks for a distinct row).

---

## Tasks

S26-T1 (7-day snow data) has no dependency. S26-T2 (UI panel) depends on S26-T1.

---

### S26-T1 — Bucket the snowfall grid into 7 daily totals

**File to modify:** `src/App.jsx` (or, if the existing snow-grid-parsing logic already lives in a `src/lib/*.js` helper module rather than inline in `App.jsx`, modify that file instead — check first)

Write a function that takes the same raw `/api/nws/snow` response already being fetched per resort and returns 7 `{ day, date, inches }` entries (today through +6 days), reusing the existing grid-value-to-inches conversion:

```js
function bucketSnowfallByDay(snowGridResponse) {
  // Read the existing snow24in/snow48in computation first — this function should follow
  // the exact same grid-value extraction + unit conversion, just bucketed by calendar day
  // instead of collapsed into a single 24h/48h total. Each grid `values[i]` entry has a
  // `validTime` (an ISO8601 interval string, "start/duration") and a `value` (assume mm,
  // per the existing helper's established convention — confirm, don't guess).
  //
  // For each value entry, determine which calendar day (0-6 from today) its validTime start
  // falls into, and sum inches into that day's bucket.
}
```

**Acceptance criteria:**
- Returns exactly 7 entries, ordered today → +6 days, each `{ day: "Mon", date: "2026-01-05", inches: <number> }`.
- Uses the exact same mm→inches conversion as the existing `snow24in`/`snow48in` computation — no unit drift between the powder score's numbers and this panel's numbers for the overlapping days.
- Handles a resort with no/partial grid data for future days by defaulting missing days to `inches: 0`, not `NaN` or `undefined`.

**Verify:**
```bash
npm run dev
```
Temporarily log the bucketed output for one resort in the browser console, compare day-1's total against the existing `snow24in` value for the same resort — they should be very close (not necessarily identical, since `snow24in` may use a slightly different rolling window, but same order of magnitude).

---

### S26-T2 — "This Week ▾" expandable panel

**File to modify:** `src/App.jsx`

Add a new local component:
```jsx
function SevenDayForecastPanel({ dailySnow }) {
  if (!dailySnow?.length) {
    return <div style={{ fontSize: 12, color: "var(--color-text-3)" }}>Forecast unavailable.</div>
  }
  const max = Math.max(...dailySnow.map((d) => d.inches), 1)
  const best = dailySnow.reduce((a, b) => (b.inches > a.inches ? b : a), dailySnow[0])

  return (
    <div>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 60 }}>
        {dailySnow.map((d) => (
          <div key={d.date} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
            <div
              style={{
                width: "100%",
                height: Math.max(4, (d.inches / max) * 44),
                background: d.date === best.date && best.inches > 0 ? "var(--color-accent)" : "rgba(255,255,255,0.15)",
                borderRadius: 3,
              }}
              title={`${d.inches.toFixed(1)}"`}
            />
            <div style={{ fontSize: 10, color: "var(--color-text-3)" }}>{d.day}</div>
          </div>
        ))}
      </div>
      {best.inches > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-text-2)" }}>
          Best day: {best.day} ❄️ {best.inches.toFixed(0)}"
        </div>
      )}
    </div>
  )
}
```

Wire it into `ResortCard` as a second, independent toggle:
```jsx
const [weekExpanded, setWeekExpanded] = useState(false)

// somewhere in the card body, separate from the existing details toggle:
<button onClick={() => setWeekExpanded((v) => !v)} style={{ /* match existing toggle button style */ }}>
  {weekExpanded ? "▲ This Week" : "▼ This Week"}
</button>
{weekExpanded && <SevenDayForecastPanel dailySnow={r.dailySnow} />}
```
`r.dailySnow` needs to be computed (via S26-T1's bucketing function) and attached to each resort's merged object during `refresh()`, alongside the existing `snow24in`/`snow48in` computation — find that exact spot in `refresh()` and add the 7-day bucketing call there so it's available on `r` by the time `ResortCard` renders.

**Acceptance criteria:**
- Collapsed by default on every card.
- Expanding shows 7 mini bars sized proportional to that day's forecasted snowfall, with day labels.
- The highest-snowfall day is visually highlighted (accent color) and called out in text ("Best day: Saturday ❄️ 6\"" — using whole-inch rounding, or a range if you choose to bucket into ranges, matching the ROADMAP example format loosely, exact numeric formatting is your call as long as it's readable).
- A resort with zero forecasted snow all week still renders the bars (all at minimum height) without a "Best day" callout (since `best.inches > 0` is required to show that special text) or a crash.
- This toggle is independent of the existing "Show Details" toggle — both can be open/closed in any combination.

**Verify in browser:**
```bash
npm run dev
```
Expand "This Week" on a couple of resort cards, confirm bars render proportionally and the best day is called out correctly.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add src/App.jsx
git commit -m "feat: add 7-day snowfall forecast panel to resort cards"
```

---

## Sprint Acceptance Criteria

- [ ] 7-day snowfall data is bucketed per resort using the same grid-parsing/unit-conversion logic as the existing powder-score snow inputs
- [ ] Each resort card has a working, independently-collapsible "This Week ▾" panel with 7 proportional mini-bars
- [ ] The highest-snowfall day is highlighted and called out
- [ ] `npm run build` succeeds
- [ ] Verified in browser across multiple resorts, including one with low/no forecasted snow

## Out of Scope for This Sprint

- Any change to the Powder Score formula or its existing `snow24in`/`snow48in` inputs — this sprint only adds a new *display* derived from the same underlying grid data, it doesn't change scoring.
- Server-side changes — `/api/nws/snow` already returns the raw grid data needed; no new backend route.
</content>
