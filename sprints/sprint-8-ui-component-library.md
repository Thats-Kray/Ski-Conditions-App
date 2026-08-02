# Sprint 8 — Shared UI Component Library

**Goal:** Build the shared `src/components/ui/` primitives from ROADMAP TASK 0.3 (`Card`, `Badge`, `Button`, `ScoreRing`, `SnowStat`) plus two CSS texture utility classes, then prove them out by wiring `Badge` + `ScoreRing` into the one place in the app that currently duplicates tier-badge markup three times.
**Estimated effort:** 1.5–2 days
**Depends on:** Sprint 7 (design tokens) merged — this sprint's components consume `--radius-*`, `--space-*`, `--font-*`, `--color-*`, `--shadow-*` tokens from `src/index.css`.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**Stack:** React 19 + Vite. No test runner is installed in this repo (no vitest/jest in `package.json`) — the existing `sprints/` plans verify work via `npm run dev` + manual browser check + `npm run build`, not automated tests. Follow that same verification style here.

**The one existing shared UI component — `src/components/ui/Avatar.jsx` (read it before starting, it's the pattern to match):**
```jsx
const COLORS = ["#2563eb", "#0891b2", "#7c3aed", "#16a34a", "#ea580c"]

export default function Avatar({ profile, size = 32 }) {
  const name = profile?.full_name || profile?.username || "?"
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: COLORS[name.length % COLORS.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.42), fontWeight: 800, color: "white" }}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
```
Conventions to match: default export, function component, props destructured with defaults inline, pure `style={{}}` objects (no `<style>` tags, no CSS classes except where noted below), no PropTypes/TypeScript.

**The exact current tier-badge logic you are extracting into `Badge.jsx` — `src/App.jsx` lines 350–373 (do not delete this yet, S8-T6 will replace its call sites):**
```js
function tierColor(tier) {
  if (tier === "Elite")     return "#8ef6d1"
  if (tier === "Very Good") return "#9bc6ff"
  if (tier === "Good")      return "#ffe39a"
  if (tier === "Okay")      return "#ffc996"
  if (tier === "Closed")    return "#64748b"
  return "#ff9d9d" // Poor
}

function riskColor(risk) {
  if (risk === "Low") return "#8ef6d1"
  if (risk === "Moderate") return "#ffe39a"
  if (risk === "High") return "#ffc996"
  return "#ff9d9d"
}
```
Tier thresholds (`App.jsx` lines 239–255): `powderScore >= 80` → `"Elite"`, `>= 65` → `"Very Good"`, `>= 50` → `"Good"`, `>= 35` → `"Okay"`, else `"Poor"`; `"Closed"` is a separate explicit state, not score-derived. The badge markup itself is currently duplicated 3 times in `App.jsx`: the resort card hero badge (~line 417), a second resort-card-body badge (~lines 557–562), and the "Best Powder Right Now" hero banner badge (~lines 1492–1505) — each reimplements `borderRadius: 999`, a translucent dark background, a 1px border, `padding: "5–6px 9–10px"`, `color: tierColor(...)`.

**Card-shell values already in use across the app (what `Card.jsx` needs to generalize, not invent from scratch):** border-radius clusters at **14–16px** (small info boxes, e.g. `CreateTripModal.jsx` sub-cards), **20–24px** (primary cards, e.g. `App.jsx` `ResortCard` at 24px, `ProfilePage.jsx` stat card at 20px), and **28px** (`TripCard.jsx`, an outlier — treat as its own "xl" size, don't force it down to 24). Backgrounds cluster around `rgba(255,255,255,0.03–0.05)` fill + `rgba(255,255,255,0.07–0.12)` border. Box-shadows cluster around `0 Npx 40–64px rgba(0,0,0,0.28–0.5)`. None of these currently reference the `--radius-card` (18px) or `--shadow-card` tokens in `index.css` — `Card.jsx` should default to those tokens while still supporting the sizes actually in use via a `size` prop.

**Button patterns already in use (what `Button.jsx` needs to generalize):** the dominant primary-CTA gradient across the app is `linear-gradient(135deg,#2563eb,#0891b2)` (blue→teal), repeated verbatim in `LandingPage.jsx` (7+ times), `OnboardingFlow.jsx` (3 times), `TripCard.jsx`. Border-radius on buttons varies 10–16px with no shared constant; padding varies (`"7px 14px"` to `"14px"`). `CreateTripModal.jsx`'s submit button (lines 560–579) is the best existing loading-state reference: disabled state swaps to `background: rgba(255,255,255,0.07)`, dims text to `rgba(255,255,255,0.35)`, drops the `boxShadow`.

---

## Tasks

S8-T1 (Card) and S8-T2 (Badge) have no dependency on each other. S8-T3 (Button) is independent of both. S8-T4 (ScoreRing) depends on S8-T2 (it imports Badge's tier-color map to stay DRY). S8-T5 (SnowStat) is independent. S8-T6 (CSS textures) is independent. S8-T7 (wire Badge + ScoreRing into `App.jsx`) depends on S8-T2 and S8-T4 and must go last.

---

### S8-T1 — `Card.jsx`

**File to create:** `src/components/ui/Card.jsx`

```jsx
const RADIUS = { sm: 16, md: 18, lg: 24, xl: 28 }

export default function Card({
  variant = "glass",   // "glass" | "solid"
  size = "md",         // "sm" | "md" | "lg" | "xl" — controls border-radius
  padding = 20,
  style,
  children,
  ...rest
}) {
  const base = {
    borderRadius: RADIUS[size] ?? RADIUS.md,
    padding,
    boxShadow: "var(--shadow-card)",
  }

  const variantStyle =
    variant === "solid"
      ? {
          background: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border)",
        }
      : {
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(12px)",
        }

  return (
    <div style={{ ...base, ...variantStyle, ...style }} {...rest}>
      {children}
    </div>
  )
}
```

**Acceptance criteria:**
- `Card` renders `children` inside a `div` with the documented `variant`/`size`/`padding` props.
- Passing a `style` prop overrides individual keys (spread order: base → variant → caller `style`).
- `...rest` forwards arbitrary props (e.g. `onClick`) — needed because several existing cards are clickable.

---

### S8-T2 — `Badge.jsx`

**File to create:** `src/components/ui/Badge.jsx`

```jsx
export const TIER_COLORS = {
  "Elite": "#8ef6d1",
  "Very Good": "#9bc6ff",
  "Good": "#ffe39a",
  "Okay": "#ffc996",
  "Poor": "#ff9d9d",
  "Closed": "#64748b",
}

export const RISK_COLORS = {
  "Low": "#8ef6d1",
  "Moderate": "#ffe39a",
  "High": "#ffc996",
  "Severe": "#ff9d9d",
}

export default function Badge({ label, color, size = "md" }) {
  const pad = size === "sm" ? "4px 8px" : "5px 10px"
  const fontSize = size === "sm" ? 11 : 12
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "var(--radius-pill)",
        padding: pad,
        fontSize,
        fontWeight: 800,
        color,
        background: "rgba(0,0,0,0.35)",
        border: `1px solid ${color}33`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  )
}
```

Note the component itself is generic (`label` + `color` in, pill out) — `TIER_COLORS` and `RISK_COLORS` are exported lookup maps so callers do `<Badge label={tier} color={TIER_COLORS[tier]} />` rather than the component hardcoding domain logic. This keeps `Badge` reusable for any future badge type without editing this file again.

**Acceptance criteria:**
- `TIER_COLORS` has exactly the 6 keys/values from the extracted `tierColor()` function above (Elite, Very Good, Good, Okay, Poor, Closed).
- `RISK_COLORS` has exactly the 4 keys/values from `riskColor()` (Low, Moderate, High, Severe — note `riskColor()` today has no explicit `"Severe"` branch, it falls into the `Poor`-equivalent `#ff9d9d` catch-all; add `"Severe": "#ff9d9d"` explicitly here since the PRD's drive-risk levels are Low/Moderate/High/Severe).
- `<Badge label="Elite" color={TIER_COLORS.Elite} />` renders a pill with `color: #8ef6d1` and matching border tint.

---

### S8-T3 — `Button.jsx`

**File to create:** `src/components/ui/Button.jsx`

```jsx
const VARIANTS = {
  primary: {
    background: "var(--gradient-primary)",
    color: "var(--color-bg)",
    border: "none",
  },
  secondary: {
    background: "var(--color-surface)",
    color: "var(--color-text-1)",
    border: "1px solid var(--color-border)",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-accent)",
    border: "none",
  },
  danger: {
    background: "linear-gradient(135deg, #ef4444, #b91c1c)",
    color: "#fff",
    border: "none",
  },
}

export default function Button({
  variant = "primary",
  size = "md",          // "sm" | "md"
  loading = false,
  loadingText,
  disabled = false,
  children,
  style,
  ...rest
}) {
  const isDisabled = disabled || loading
  const variantStyle = VARIANTS[variant] ?? VARIANTS.primary

  return (
    <button
      disabled={isDisabled}
      style={{
        ...variantStyle,
        borderRadius: "var(--radius-button)",
        padding: size === "sm" ? "8px 16px" : "12px 22px",
        fontWeight: 800,
        fontSize: size === "sm" ? 13 : 15,
        cursor: isDisabled ? "default" : "pointer",
        opacity: isDisabled ? 0.5 : 1,
        transition: "all var(--transition-fast)",
        ...style,
      }}
      {...rest}
    >
      {loading ? (loadingText ?? "Loading…") : children}
    </button>
  )
}
```

**Acceptance criteria:**
- All 4 variants (`primary`, `secondary`, `ghost`, `danger`) render with the documented colors.
- `loading={true}` disables the button, drops opacity to 0.5, and swaps the label to `loadingText` (or `"Loading…"` if not given) — matching the existing loading-state convention used in `CreateTripModal.jsx` ("Dropping the trip…") and `TripDetailModal.jsx` ("Sending…").
- `disabled` and `loading` are independent props but both result in `isDisabled === true`.

---

### S8-T4 — `ScoreRing.jsx`

**File to create:** `src/components/ui/ScoreRing.jsx`

There is no existing circular/ring progress UI anywhere in the codebase (confirmed: no SVG `<circle>`, no `conic-gradient`, no `stroke-dasharray` in `App.jsx` or any `src/components/*.jsx`) — this is new. Build it as an SVG ring, not Canvas (Canvas is reserved for `ShareStatCard.jsx`'s static PNG export use case — this is live DOM UI).

```jsx
import { TIER_COLORS } from "./Badge"

export default function ScoreRing({ score, tier, size = 96, strokeWidth = 8 }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100
  const offset = circumference * (1 - pct)
  const color = TIER_COLORS[tier] ?? "#64748b"

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--color-text-1)"
        fontSize={size * 0.28}
        fontWeight={900}
      >
        {score == null ? "—" : Math.round(score)}
      </text>
    </svg>
  )
}
```

**Acceptance criteria:**
- `score={null}` (closed resort) renders an empty ring (0% fill) with `"—"` in the center — must not throw or render `NaN`.
- `score={92}` renders a ring filled to ~92% circumference in the `TIER_COLORS.Elite` color (since 92 ≥ 80).
- Ring fill is driven by the explicit `tier` prop's color, not recomputed from `score` inside this component — tier-threshold logic stays in the caller (`App.jsx`) so this component has no domain knowledge of what score ranges mean.

---

### S8-T5 — `SnowStat.jsx`

**File to create:** `src/components/ui/SnowStat.jsx`

```jsx
export default function SnowStat({ icon, label, value, unit }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 11, color: "var(--color-text-3)", display: "flex", alignItems: "center", gap: 4 }}>
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "var(--color-text-1)" }}>
        {value}
        {unit && <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-2)", marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  )
}
```

**Acceptance criteria:**
- `<SnowStat icon="❄️" label="Snow 24h" value={8} unit="in" />` renders the icon+label on one line, the value with a smaller unit suffix below it.
- `unit` is optional — omitting it renders just the bare value with no trailing span.

---

### S8-T6 — Mountain silhouette / snow texture CSS utility classes

**File to modify:** `src/index.css`

Add two utility classes near the end of the file (after the existing `.snowflake` rule):

```css
/* Card background textures */
.texture-snow-noise {
  background-image: radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: 14px 14px;
}

.texture-mountain-silhouette {
  background-image: linear-gradient(
    170deg,
    transparent 0%,
    transparent 60%,
    rgba(255,255,255,0.03) 60%,
    rgba(255,255,255,0.03) 62%,
    transparent 62%
  );
  background-repeat: no-repeat;
  background-position: bottom;
}
```

These are additive classes meant to be combined with `Card` (e.g. `<Card className="texture-snow-noise">`) — note `Card.jsx` from S8-T1 doesn't currently forward `className`; add `className` to the `...rest` pass-through implicitly (it already works since `...rest` spreads onto the `div`, and React allows a plain `className` prop through JSX spread — no code change needed, just confirm it works in S8-T6's verification step).

**Acceptance criteria:**
- Both classes exist in `src/index.css`.
- Adding `className="texture-snow-noise"` to a `<Card>` visibly shows a faint dot pattern in the browser (verify in S8-T7's manual check).

---

### S8-T7 — Wire `Badge` + `ScoreRing` into the resort card hero badge in `App.jsx`

This is the proof-of-concept adoption — it does NOT touch the other 2 duplicate badge sites in `App.jsx` (the resort-card-body badge and the "Best Powder Right Now" hero banner) or any of the ~558 hardcoded hex values elsewhere. Just the one hero badge, to prove the components work end-to-end against real data.

**File to modify:** `src/App.jsx`

**Step 1 — Import the new components** near the top of `App.jsx`, alongside existing local imports:
```js
import Badge, { TIER_COLORS } from "./components/ui/Badge"
import ScoreRing from "./components/ui/ScoreRing"
```

**Step 2 — Find the resort card hero badge** (`ResortCard` component, ~line 417, where the tier badge is currently rendered inline using `tierColor(r.powderTier)`). Read the surrounding ~15 lines to see the exact current JSX before editing — do not guess at the structure, the exact prop names on `r` (e.g. `r.powderTier`, `r.powderScore`) must match what's already being read a few lines above/below this block.

**Step 3 — Replace the inline badge markup** with:
```jsx
<Badge label={r.powderTier ?? "Closed"} color={TIER_COLORS[r.powderTier] ?? TIER_COLORS.Closed} />
```
Do not remove the existing `tierColor()` function definition in `App.jsx` yet — it's still used by the other 2 badge sites this sprint doesn't touch. Leaving it in place (temporarily duplicated with `Badge.jsx`'s `TIER_COLORS`) is intentional and acceptable; a future cleanup sprint can remove `tierColor()`/`riskColor()` once all 3 call sites are migrated.

**Step 4 — Add the score ring** somewhere visually sensible in the same card region (e.g. replacing or sitting alongside the existing large powder-score number) — read the current score-number rendering just above the badge to decide exact placement, then add:
```jsx
<ScoreRing score={r.powderScore} tier={r.powderTier ?? "Closed"} size={72} strokeWidth={6} />
```

**Step 5 — Verify in the browser:**
```bash
npm run dev
```
Open the dashboard (Snow tab). Confirm: every resort card's hero badge still shows the correct tier label and color (spot-check one Elite/Very-Good/Poor/Closed resort if the current data has variety, otherwise confirm at least one resort renders correctly), and a new ring now appears showing the powder score visually filled proportional to the score. Closed resorts must show an empty ring with `—`, not crash.

**Step 6 — Build check:**
```bash
npm run build
```
Expected: succeeds, no import errors.

**Step 7 — Commit:**
```bash
git add src/components/ui/Card.jsx src/components/ui/Badge.jsx src/components/ui/Button.jsx src/components/ui/ScoreRing.jsx src/components/ui/SnowStat.jsx src/index.css src/App.jsx
git commit -m "feat: add shared UI component library, wire Badge/ScoreRing into resort card hero"
```

---

## Sprint Acceptance Criteria

- [ ] `src/components/ui/Card.jsx`, `Badge.jsx`, `Button.jsx`, `ScoreRing.jsx`, `SnowStat.jsx` all exist and match the documented props interfaces
- [ ] `src/index.css` has `.texture-snow-noise` and `.texture-mountain-silhouette` utility classes
- [ ] `App.jsx`'s `ResortCard` hero badge uses `<Badge>` + `<ScoreRing>` instead of inline duplicated markup
- [ ] `npm run build` succeeds
- [ ] Dashboard visually verified in the browser — tier badges and score rings render correctly for at least one Elite/Good/Poor and one Closed resort

## Out of Scope for This Sprint

- Migrating the other 2 duplicate tier-badge sites in `App.jsx` (resort-card-body badge, "Best Powder Right Now" hero banner) — only the hero badge is migrated as proof-of-concept.
- Removing `tierColor()`/`riskColor()`/`scoreGradient()` from `App.jsx` — they stay until all call sites are migrated in a future sprint.
- Migrating `TripCard.jsx`, `ProfilePage.jsx`, or any other component's card-shell styling to use the new `Card.jsx` — those adopt it organically in later sprints that touch those files (e.g. sprint-14 Season Passport, sprint-21 social proof badges).
- Adding a test runner (vitest/jest) to the project — this repo has none today and adding one is a separate infrastructure decision, not part of a UI component sprint.
</content>
