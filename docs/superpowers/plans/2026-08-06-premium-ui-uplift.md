# Premium UI Uplift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Mountain Page, Crew/Plans (mobile), Home, Social Feed, and Profile to the premium visual language shown in `mockups/Stitch_Premium_Redesigns/crew_planning_dashboard_1/`, per the approved spec at `docs/superpowers/specs/2026-08-06-premium-ui-uplift-design.md`.

**Architecture:** No new framework, no CSS migration. Every task styles components with inline style objects driven by the existing `--color-*` / `--gradient-*` / `--radius-*` custom properties in `src/index.css` — the same convention every existing component already uses. New reusable pieces (hero header, stat strip, accent card, event card, avatar rail) are built once as `src/components/ui/` primitives and consumed by every screen that needs them, rather than duplicated per screen.

**Tech Stack:** React 19, Vite, Supabase (Postgres + RLS), no CSS framework, no automated test runner (this repo has none — verification is manual, matching existing project convention).

## Global Constraints

- Accent color: existing `--color-accent` blue/cyan tokens only. Do not introduce a gold/amber token this sprint.
- Navigation stays exactly as implemented in `src/App.jsx` (`NAV_ITEMS`, `BottomNav`, `TopNav`) — no task in this plan touches nav taxonomy.
- Do not change powder-score scale/calculation logic anywhere in this plan.
- Any new Supabase RLS policy must not reference `auth.users` directly in the policy expression — use a `SECURITY DEFINER` helper function instead if an `auth.users` lookup is ever needed (see `migrations/022_fix_kramesbutte_rls_auth_users.sql` for why, and `[[project_schema_gotchas]]`).
- No automated tests exist in this repo. Every task's verification step is a manual "run `npm run dev`, do X, confirm Y" check — do not invent a fake automated test.
- Every task ends with its own commit. Commit messages follow this repo's existing style (`feat:`, `fix:`, `refactor:` prefixes, as seen in `git log`).

## Deviation from the approved spec (read before starting)

The spec's phasing said "Mountain Page first, then extract shared primitives into `ui/`." This plan builds the primitives directly into `src/components/ui/` as part of Phase 1 instead of hand-rolling them inline in `MountainPage.jsx` first and moving them afterward — the "extract later" step would be pure busywork now that every screen's requirements are already known from the mockup review. The ordering intent (deepest screen first, primitives fall out of real screen work, not upfront guessing) is preserved; only the inline-then-move mechanic is skipped. Flag to your human partner if you disagree — it's easy to revert to literal inline-first.

Also new since the spec was written: the **Snow Conditions dashboard mockup's card style is not adopted as a drop-in replacement** for `App.jsx`'s existing `ResortCard` (lines 470-633). That existing card already has real functionality the mockup's simplified card doesn't show (collapsible detail rows, travel alerts, 7-day forecast panel, friends-going badge) — swapping it for the simpler mockup card would be a functionality regression. Task 14 instead applies the *visual* language (badge/metric/ScoreRing polish) to the existing card in place, keeping every current feature.

---

## Phase 1: Mountain Page + new shared primitives

### Task 1: `mountain_events` migration

**Files:**
- Create: `migrations/023_mountain_events.sql`

**Interfaces:**
- Produces: table `mountain_events(id, resort_key, title, description, event_date, link_url, created_by, created_at)`, readable by all authenticated users, insertable by any authenticated user for `created_by = auth.uid()`.

- [ ] **Step 1: Write the migration**

```sql
-- Migration 023: Mountain Page Events widget
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

CREATE TABLE IF NOT EXISTS mountain_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resort_key   TEXT NOT NULL REFERENCES resort_coordinates(resort_key),
  title        TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description  TEXT CHECK (description IS NULL OR char_length(description) <= 500),
  event_date   DATE NOT NULL,
  link_url     TEXT,
  created_by   UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mountain_events_resort_date ON mountain_events (resort_key, event_date);

ALTER TABLE mountain_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mountain_events' AND policyname='Authenticated can read events') THEN
    CREATE POLICY "Authenticated can read events" ON mountain_events FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mountain_events' AND policyname='Authenticated can create own events') THEN
    CREATE POLICY "Authenticated can create own events" ON mountain_events FOR INSERT TO authenticated
      WITH CHECK (created_by = auth.uid());
  END IF;
END $$;
```

Note: `resort_key` references `resort_coordinates(resort_key)`, the table `migrations/020_mountain_board.sql` created. No new geofence/RPC logic is needed here — unlike board posts, events don't require proof of being on the mountain to post.

- [ ] **Step 2: Apply the migration**

Run the SQL in the Supabase SQL Editor for this project, then run `NOTIFY pgrst, 'reload schema';` (matches this repo's existing migration-application convention — there is no CLI migration runner in use here).

- [ ] **Step 3: Verify**

In the Supabase SQL Editor, run:
```sql
insert into mountain_events (resort_key, title, event_date, created_by)
values ('kramesbutte', 'Test Event', current_date, auth.uid());
select * from mountain_events;
```
Confirm the row inserts and reads back. Then delete it: `delete from mountain_events where title = 'Test Event';`

- [ ] **Step 4: Commit**

```bash
git add migrations/023_mountain_events.sql
git commit -m "feat: add mountain_events table for the Mountain Page Events widget"
```

---

### Task 2: `getMountainEvents` / `createMountainEvent` API functions

**Files:**
- Modify: `src/lib/socialApi.js` (append after `reportBoardPost`, ~line 3064)

**Interfaces:**
- Consumes: Supabase client `supabase` (already imported at top of `socialApi.js`).
- Produces: `getMountainEvents(resortKey, limit = 20)` → `Promise<Array<{id, resort_key, title, description, event_date, link_url, created_by, created_at, profiles: {id, full_name, username, avatar_url} | null}>>`; `createMountainEvent({resortKey, title, description, eventDate, linkUrl})` → `Promise<row>`.

- [ ] **Step 1: Add the functions**

```js
export async function getMountainEvents(resortKey, limit = 20) {
  // Same no-FK-to-profiles situation as getBoardPosts above — resolve
  // profiles with a separate query rather than a PostgREST embed.
  const { data, error } = await supabase
    .from("mountain_events")
    .select("*")
    .eq("resort_key", resortKey)
    .order("event_date", { ascending: true })
    .limit(limit)
  if (error) throw error
  const events = data || []
  if (!events.length) return events

  const authorIds = [...new Set(events.map((e) => e.created_by))]
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url")
    .in("id", authorIds)

  const pm = new Map((profiles || []).map((p) => [p.id, p]))
  return events.map((e) => ({ ...e, profiles: pm.get(e.created_by) || null }))
}

export async function createMountainEvent({ resortKey, title, description, eventDate, linkUrl }) {
  const { data: userData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from("mountain_events")
    .insert({
      resort_key: resortKey,
      title: title.trim(),
      description: description?.trim() || null,
      event_date: eventDate,
      link_url: linkUrl?.trim() || null,
      created_by: userData.user.id,
    })
    .select()
    .single()
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Verify**

Run `npm run dev`, open the browser console on any page while logged in, and run:
```js
const { getMountainEvents, createMountainEvent } = await import("/src/lib/socialApi.js")
await createMountainEvent({ resortKey: "kramesbutte", title: "Console Test", eventDate: "2026-09-01" })
console.log(await getMountainEvents("kramesbutte"))
```
Confirm the created event appears with `profiles` populated. Delete it via the Supabase SQL Editor afterward.

- [ ] **Step 3: Commit**

```bash
git add src/lib/socialApi.js
git commit -m "feat: add getMountainEvents/createMountainEvent API functions"
```

---

### Task 3: `EventCard` primitive + `EventsWidget` component

**Files:**
- Create: `src/components/ui/EventCard.jsx`
- Create: `src/components/EventsWidget.jsx`
- Modify: `src/lib/mountainPageWidgets.js`

**Interfaces:**
- Consumes: `getMountainEvents`, `createMountainEvent` from Task 2.
- Produces: `EventCard({ event, accentColor })` (presentational); `EventsWidget({ resortKey })`. `mountainPageWidgets.js` calls every widget with `{ resortKey, currentUserEmail }` (see the comment at the top of that file) — a widget is allowed to use only the props it needs, it just can't *require* anything beyond those two. `EventsWidget` doesn't need `currentUserEmail` (event creation isn't gated by owner status the way Krames Butte's board-widget visibility is), so it's fine for the component to simply not destructure it.

- [ ] **Step 1: Write `EventCard`**

```jsx
// src/components/ui/EventCard.jsx
const ACCENTS = ["#fb923c", "#38bdf8", "#2dd4bf"] // cycles per card, matches the mockup's per-event color coding

export function accentForIndex(i) {
  return ACCENTS[i % ACCENTS.length]
}

export default function EventCard({ event, accentColor }) {
  const date = new Date(event.event_date + "T00:00:00")
  const month = date.toLocaleDateString(undefined, { month: "short" }).toUpperCase()
  const day = date.getDate()

  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: 14,
        borderRadius: 14,
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${accentColor}33`,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 52,
          height: 52,
          borderRadius: 10,
          border: `1.5px solid ${accentColor}`,
          display: "grid",
          placeItems: "center",
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: accentColor }}>{month}</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "white", lineHeight: 1 }}>{day}</div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: "white" }}>{event.title}</div>
        {event.description && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 3, lineHeight: 1.4 }}>
            {event.description}
          </div>
        )}
        {event.link_url && (
          <a
            href={event.link_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block", marginTop: 8, fontSize: 11, fontWeight: 800,
              color: accentColor, border: `1px solid ${accentColor}66`, borderRadius: 999,
              padding: "4px 10px", textDecoration: "none", textTransform: "uppercase", letterSpacing: 0.4,
            }}
          >
            Learn More
          </a>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `EventsWidget`**

```jsx
// src/components/EventsWidget.jsx
import { useEffect, useState } from "react"
import { getMountainEvents, createMountainEvent } from "../lib/socialApi"
import EventCard, { accentForIndex } from "./ui/EventCard"

export default function EventsWidget({ resortKey }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [eventDate, setEventDate] = useState("")
  const [linkUrl, setLinkUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    getMountainEvents(resortKey)
      .then((rows) => { if (!cancelled) setEvents(rows) })
      .catch((err) => { if (!cancelled) { setEvents([]); setLoadError(err) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [resortKey])

  async function handleCreate() {
    if (!title.trim() || !eventDate) return
    setSaving(true)
    setSaveError(null)
    try {
      const created = await createMountainEvent({ resortKey, title, description, eventDate, linkUrl })
      setEvents((prev) => [...prev, created].sort((a, b) => a.event_date.localeCompare(b.event_date)))
      setTitle(""); setDescription(""); setEventDate(""); setLinkUrl("")
      setComposerOpen(false)
    } catch (err) {
      setSaveError(err.message || "Couldn't create the event.")
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    background: "rgba(255,255,255,0.07)", border: "1.5px solid rgba(255,255,255,0.11)",
    borderRadius: 10, padding: "10px 12px", color: "white", fontSize: 14, outline: "none",
    width: "100%", boxSizing: "border-box", fontFamily: "inherit",
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {!composerOpen ? (
        <button
          onClick={() => setComposerOpen(true)}
          style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(56,189,248,0.4)", background: "rgba(56,189,248,0.1)", color: "#38bdf8", fontWeight: 800, cursor: "pointer", justifySelf: "start" }}
        >
          + Add Event
        </button>
      ) : (
        <div style={{ display: "grid", gap: 8, padding: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" maxLength={120} style={inputStyle} />
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" rows={2} maxLength={500} style={{ ...inputStyle, resize: "vertical" }} />
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Link (optional)" style={inputStyle} />
          {saveError && <div style={{ fontSize: 12, color: "#f87171" }}>{saveError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setComposerOpen(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>Cancel</button>
            <button onClick={handleCreate} disabled={saving || !title.trim() || !eventDate} style={{ flex: 2, padding: "10px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#0284c7,#38bdf8)", color: "white", fontWeight: 800, cursor: saving ? "wait" : "pointer", opacity: saving || !title.trim() || !eventDate ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Create Event"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 20, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Loading…</div>
      ) : loadError ? (
        <div style={{ padding: 20, fontSize: 13, color: "#f87171" }}>Couldn't load events. Try again in a bit.</div>
      ) : !events.length ? (
        <div style={{ padding: 20, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>No upcoming events yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {events.map((event, i) => (
            <EventCard key={event.id} event={event} accentColor={accentForIndex(i)} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Register the widget**

In `src/lib/mountainPageWidgets.js`:

```js
import MountainBoard from "../components/MountainBoard"
import EventsWidget from "../components/EventsWidget"

export const MOUNTAIN_PAGE_WIDGETS = [
  { key: "board", label: "📋 Board", rolloutResorts: "all", Component: MountainBoard },
  { key: "events", label: "📅 Events", rolloutResorts: ["kramesbutte"], Component: EventsWidget },
]
```

- [ ] **Step 4: Verify**

Run `npm run dev`, log in as the Krames Butte owner account, navigate to the Krames Butte Mountain Page, click the "📅 Events" tab. Confirm: empty state shows "No upcoming events yet", "+ Add Event" opens the composer, creating an event with a title + date shows it in the list with a colored date block, and the "Learn More" link only appears when a link URL was provided. Then check a non-owner account or a different resort's Mountain Page and confirm the Events tab does *not* appear (rollout is Krames-Butte-only).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/EventCard.jsx src/components/EventsWidget.jsx src/lib/mountainPageWidgets.js
git commit -m "feat: add Mountain Page Events widget (Krames Butte rollout)"
```

---

### Task 4: `StatStrip` primitive + Mountain Stats block

**Files:**
- Create: `src/components/ui/StatStrip.jsx`
- Modify: `src/components/MountainPage.jsx`

**Interfaces:**
- Produces: `StatStrip({ items })` where `items: Array<{icon, value, label}>` — a generic row layout, reusable anywhere a set of 3-4 stat tiles is needed (Home dashboard reuses this in Phase 3).

- [ ] **Step 1: Write `StatStrip`**

```jsx
// src/components/ui/StatStrip.jsx
export default function StatStrip({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 1, background: "rgba(255,255,255,0.08)", borderRadius: 16, overflow: "hidden" }}>
      {items.map((item, i) => (
        <div key={i} style={{ background: "#0b1424", padding: "14px 8px", display: "grid", justifyItems: "center", gap: 4 }}>
          <span style={{ fontSize: 20 }}>{item.icon}</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: "white" }}>{item.value}</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.5 }}>{item.label}</span>
        </div>
      ))}
    </div>
  )
}
```

(The 1px gap + `rgba(255,255,255,0.08)` background creates hairline dividers between tiles without extra border code — matches the mockup's `Mountain Stats` row.)

- [ ] **Step 2: Wire it into `MountainPage.jsx`**

In `src/components/MountainPage.jsx`, add the import and insert the strip between the hero block (ends at the closing `</div>` after line 84) and the widget tab strip (starts at line 86):

```jsx
import StatStrip from "./ui/StatStrip"
```

```jsx
      {resort && (
        <StatStrip
          items={[
            { icon: "❄️", value: resort.snowPrev24in != null ? `${resort.snowPrev24in}"` : "—", label: "Fresh" },
            { icon: "📏", value: resort.baseDepth != null ? `${resort.baseDepth}"` : "—", label: "Base" },
            { icon: "🚡", value: resort.liftsOpen != null && resort.liftsTotal != null ? `${resort.liftsOpen}/${resort.liftsTotal}` : "—", label: "Lifts Open" },
          ]}
        />
      )}
```

- [ ] **Step 3: Verify**

Run `npm run dev`, open any resort's Mountain Page. Confirm the stat strip renders below the hero with fresh snow / base / lifts values matching what's shown elsewhere for that resort (cross-check against the resort's card on the Snow tab), and shows `—` gracefully for any resort with missing data (e.g. one that's closed for season).

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/StatStrip.jsx src/components/MountainPage.jsx
git commit -m "feat: add Mountain Stats strip to Mountain Page"
```

---

### Task 5: `HeroPhotoHeader` primitive + Mountain Page hero refactor

**Files:**
- Create: `src/components/ui/HeroPhotoHeader.jsx`
- Modify: `src/components/MountainPage.jsx:35-84` (the existing hero block)

**Interfaces:**
- Produces: `HeroPhotoHeader({ photoPath, title, badges, scoreSlot, children })` — `badges` is an array of already-built badge elements, `scoreSlot` is an element rendered at the trailing edge (e.g. a `ScoreRing`), `children` renders below the title/badges row (used by Home in Phase 3 for the "Ready to ski?" CTA block).

- [ ] **Step 1: Write `HeroPhotoHeader`**

```jsx
// src/components/ui/HeroPhotoHeader.jsx
export default function HeroPhotoHeader({ photoPath, title, badges, scoreSlot, children }) {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 24,
        overflow: "hidden",
        padding: 20,
        background: photoPath
          ? `linear-gradient(to top, rgba(4,8,15,0.88), rgba(2,6,23,0.3)), url(${photoPath}) center/cover`
          : "linear-gradient(135deg, #1e293b, #334155)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          {badges?.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              {badges}
            </div>
          )}
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "white" }}>{title}</h1>
        </div>
        {scoreSlot}
      </div>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Replace the inline hero in `MountainPage.jsx`**

Replace lines 44-84 (the hero `<div>` block, from `<div style={{ position: "relative", borderRadius: 24, ...` through its matching closing `</div>`) with:

```jsx
      <HeroPhotoHeader
        photoPath={resort?.photoPath}
        title={<>{emoji} {name}</>}
        badges={[
          resortKey === KRAMES_BUTTE_KEY && (
            <span key="dev" style={{ fontSize: 11, fontWeight: 900, color: "#a3e635", border: "1px dashed rgba(163,230,53,0.5)", borderRadius: 999, padding: "3px 8px" }}>
              🧪 DEV
            </span>
          ),
          resort?.isOpen === true && (
            <span key="open" style={{ fontSize: 11, fontWeight: 900, color: "#4ade80", border: "1px solid rgba(34,197,94,0.5)", borderRadius: 999, padding: "3px 8px" }}>
              Open
            </span>
          ),
          resort?.isOpen === false && (
            <span key="closed" style={{ fontSize: 11, fontWeight: 900, color: "#f87171", border: "1px solid rgba(239,68,68,0.5)", borderRadius: 999, padding: "3px 8px" }}>
              Closed for Season
            </span>
          ),
        ].filter(Boolean)}
        scoreSlot={
          resort?.powderScore != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <ScoreRing score={resort.powderScore} tier={resort.powderTier ?? "Closed"} size={64} strokeWidth={6} />
              <Badge label={resort.powderTier || "—"} color={TIER_COLORS[resort.powderTier] ?? TIER_COLORS.Closed} />
            </div>
          )
        }
      />
```

Add the import: `import HeroPhotoHeader from "./ui/HeroPhotoHeader"`.

- [ ] **Step 3: Verify**

Run `npm run dev`, open several different resorts' Mountain Pages (one open, one closed for season, Krames Butte as owner). Confirm the hero renders identically to before this change: photo background with gradient scrim, DEV/Open/Closed badges in the right position, title, and score ring + tier badge on the right. This is a pure refactor — there should be zero visual difference from before the change.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/HeroPhotoHeader.jsx src/components/MountainPage.jsx
git commit -m "refactor: extract HeroPhotoHeader primitive from MountainPage"
```

---

### Task 6: `AccentCard` primitive + Mountain Board restyle

**Files:**
- Create: `src/components/ui/AccentCard.jsx`
- Modify: `src/components/MountainBoard.jsx:213-232` (the post list render block)

**Interfaces:**
- Produces: `AccentCard({ accentColor, children })` — a card with a colored left border, matching the mockup's `Mountain Bulletin` post cards.

- [ ] **Step 1: Write `AccentCard`**

```jsx
// src/components/ui/AccentCard.jsx
export default function AccentCard({ accentColor = "#38bdf8", children }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 14,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderLeft: `3px solid ${accentColor}`,
      }}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Use it for board posts**

In `src/components/MountainBoard.jsx`, add `import AccentCard from "./ui/AccentCard"` and `import { accentForIndex } from "./ui/EventCard"`, then replace the post card block (lines 219-229):

```jsx
              <AccentCard key={post.id} accentColor={accentForIndex(CATEGORIES.findIndex((c) => c.key === post.category))}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8" }}>{cat?.emoji} {cat?.label || post.category}</span>
                  <button onClick={() => handleReport(post.id)} disabled={post._reported} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 11, cursor: "pointer" }}>
                    {post._reported ? "Reported" : "🚩 Report"}
                  </button>
                </div>
                <div style={{ fontSize: 14, color: "white", marginBottom: 6 }}>{post.content}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{author} · {timeAgo(post.created_at)}</div>
              </AccentCard>
```

(Remove the old `<div key={post.id} style={{ padding: 12, borderRadius: 14, ... }}>` wrapper and its matching `</div>` — `AccentCard` replaces it.)

- [ ] **Step 3: Verify**

Run `npm run dev`, open a resort's Mountain Page → Board tab with existing posts (or create a couple via the composer across different categories). Confirm each post card now shows a colored left border that varies by category, and the report button / content / author line still work exactly as before.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/AccentCard.jsx src/components/MountainBoard.jsx
git commit -m "feat: restyle Mountain Board posts with colored accent cards"
```

---

## Phase 2: Crew/Plans (mobile)

### Task 7: `AvatarStatusRail` primitive

**Files:**
- Create: `src/components/ui/AvatarStatusRail.jsx`

**Interfaces:**
- Consumes: `getTodaysVisiblePlans`, `getCurrentUser` from `src/lib/socialApi.js` (same functions `TodaysCrew.jsx` already uses — that component stays untouched and unused; this is a fresh, lighter presentational component built from the same data source).
- Produces: `AvatarStatusRail()` — a self-contained horizontal scroll of today's crew avatars with status label, no props needed (matches how `ActivityFeed` and `MountainBoard` are self-fetching too).

- [ ] **Step 1: Write the component**

```jsx
// src/components/ui/AvatarStatusRail.jsx
import { useEffect, useState } from "react"
import { getCurrentUser, getTodaysVisiblePlans } from "../../lib/socialApi"
import UserProfileModal from "../UserProfileModal"

function statusColor(status) {
  if (status === "arrived") return "#4ade80"
  if (status === "driving") return "#fbbf24"
  if (status === "planning") return "#60a5fa"
  if (status === "done") return "#c4b5fd"
  return "#94a3b8"
}

function statusLabel(status) {
  if (status === "arrived") return "On Mountain"
  if (status === "driving") return "En Route"
  if (status === "planning") return "Planning"
  if (status === "done") return "Done"
  return status || "Unknown"
}

function initialsFromName(name) {
  return (name || "S").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
}

export default function AvatarStatusRail() {
  const [user, setUser] = useState(null)
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewingUserId, setViewingUserId] = useState(null)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    let cancelled = false
    Promise.all([getCurrentUser(), getTodaysVisiblePlans(today)])
      .then(([currentUser, visiblePlans]) => {
        if (cancelled) return
        setUser(currentUser)
        setPlans(visiblePlans)
      })
      .catch(() => { if (!cancelled) setPlans([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return null
  if (!plans.length) {
    return (
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
        Nobody's posted a plan for today yet.
      </div>
    )
  }

  return (
    <>
      <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 4 }}>
        {plans.map((plan) => {
          const name = plan.user_id === user?.id ? "You" : (plan.profiles?.full_name || plan.profiles?.username || "Skier")
          const avatarUrl = plan.profiles?.avatar_url
          const color = statusColor(plan.status)
          return (
            <button
              key={plan.id}
              onClick={() => plan.user_id !== user?.id && setViewingUserId(plan.user_id)}
              style={{
                flexShrink: 0, display: "grid", justifyItems: "center", gap: 4, width: 68,
                background: "none", border: "none", cursor: plan.user_id !== user?.id ? "pointer" : "default", padding: 0,
              }}
            >
              <div style={{ position: "relative" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", overflow: "hidden", background: "#1e293b", display: "grid", placeItems: "center", fontSize: 16, fontWeight: 900, color: "white", border: `2px solid ${color}` }}>
                  {avatarUrl ? <img src={avatarUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initialsFromName(name)}
                </div>
                <div style={{ position: "absolute", bottom: 2, right: 2, width: 12, height: 12, borderRadius: "50%", background: color, border: "2px solid #04080f" }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "white", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{name}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color, textAlign: "center" }}>{statusLabel(plan.status)}</div>
            </button>
          )
        })}
      </div>
      {viewingUserId && <UserProfileModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />}
    </>
  )
}
```

- [ ] **Step 2: Verify in isolation**

Run `npm run dev`, and temporarily render `<AvatarStatusRail />` at the top of `SkiPlansPage.jsx`'s return (before doing Task 8's real wiring) to confirm it fetches and renders correctly with real data (avatars, status dot color, tap-to-view-profile on non-you avatars), then remove the temporary render — Task 8 does the real integration.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/AvatarStatusRail.jsx
git commit -m "feat: add AvatarStatusRail primitive (resurrects TodaysCrew's status data for a compact rail)"
```

---

### Task 8: Wire `AvatarStatusRail` into the Plans tab

**Files:**
- Modify: `src/components/SkiPlansPage.jsx`

**Interfaces:**
- Consumes: `AvatarStatusRail` from Task 7.

- [ ] **Step 1: Find the top-level return in `SkiPlansPage.jsx`**

Locate the `export default function SkiPlansPage(...)`'s `return (` (the outer container div that wraps the tab content — it's the same component whose end you already saw at line ~477 with `<CreateTripModal>`/`<TripDetailModal>` at the bottom). Add the import:

```jsx
import AvatarStatusRail from "./ui/AvatarStatusRail"
```

- [ ] **Step 2: Insert the rail above the existing tab content**

Add this block as the first child inside the outer return, before the existing sub-tab switcher content:

```jsx
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.38)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
          Active Crew
        </div>
        <AvatarStatusRail />
      </div>
```

(This mirrors the exact label style `UpcomingStrip` already uses for "Your Upcoming Plans" at line 21 of the same file — keep it visually consistent.)

- [ ] **Step 3: Verify**

Run `npm run dev`, log in, go to the Plans tab. Confirm "Active Crew" renders above the existing content with a horizontal scrollable avatar rail. If no one has posted a plan today, confirm the empty state message shows instead of a broken/empty rail.

- [ ] **Step 4: Commit**

```bash
git add src/components/SkiPlansPage.jsx
git commit -m "feat: show Active Crew rail at the top of the Plans tab"
```

---

### Task 9: Restyle `UpcomingStrip` header + make the "New Trip" CTA full-width on mobile

**Files:**
- Modify: `src/components/SkiPlansPage.jsx:22` (the `UpcomingStrip` section label)
- Modify: `src/components/SkiPlansPage.jsx:317-322` (the component's inline `<style>` block)
- Modify: `src/components/SkiPlansPage.jsx:336-349` (the header "+ New Trip" button)

**Interfaces:** none new — pure visual refinement.

The mockup shows "Plan a Trip" as a full-width button below the trips list, but this codebase already has an equivalent CTA ("+ New Trip", wired to `handleCreateClick` at line 337, which login-gates before opening `CreateTripModal`) placed in the page header instead. Relocating it into the JSX tree below `UpcomingStrip` would mean also reconciling the second identical-purpose button already in the empty state at line 403 — real but unnecessary churn for a "mobile-friendly" pass. This task instead keeps the header CTA where it is and makes it full-width and mockup-styled specifically on mobile, using the same `<style>`-block + CSS media query pattern this file already uses for `.strip-card:hover` etc. (lines 317-321) — simplest, lowest-regression-risk way to satisfy "mobile friendly" without moving working code.

- [ ] **Step 1: Relabel the strip header**

At `src/components/SkiPlansPage.jsx:22`, change the section label text from `Your Upcoming Plans` to `Upcoming Trips`, keeping the existing style object unchanged.

- [ ] **Step 2: Add a mobile full-width rule for `.plan-cta`**

In the inline `<style>` block at lines 317-322, add a new rule alongside the existing hover rules:

```css
@media (max-width: 767px) {
  .plan-cta {
    width: 100%;
    justify-content: center;
    padding: 14px 20px !important;
    font-size: 15px !important;
    box-shadow: 0 8px 24px rgba(37,99,235,0.35) !important;
  }
}
```

- [ ] **Step 3: Verify**

Run `npm run dev`, resize the browser to a mobile width (or use device emulation) and open the Plans tab. Confirm the "Upcoming Trips" strip (relabeled) still scrolls horizontally and opens `TripDetailModal` on tap, and the "+ New Trip" header button now spans the full width on mobile while staying its original compact size on desktop. Confirm it still opens `CreateTripModal` and that modal still scrolls correctly on mobile (the fix from the earlier commit).

- [ ] **Step 4: Commit**

```bash
git add src/components/SkiPlansPage.jsx
git commit -m "style: relabel Upcoming Trips strip, make New Trip CTA full-width on mobile"
```

---

## Phase 3: Home dashboard

### Task 10: Restyle `TodaysBestMountainCard`

**Files:**
- Modify: `src/components/HomeDashboard.jsx:91-118` (the return block of `TodaysBestMountainCard`)

**Interfaces:** none new. This card already uses `Card`, `Badge`/`TIER_COLORS`, `ScoreRing`, `SnowStat` — all existing `ui/` primitives. This task only changes layout/sizing to match the mockup's more prominent hero-style presentation, not the underlying components.

`riskColor` (the red/yellow/green mapping for drive risk) is a local, unexported function in `App.jsx:412` — it is not importable here. Do not duplicate its logic; `SnowStat`'s Drive Risk value stays plain-colored, matching current behavior. Adding risk-coloring to Home is a feature change, not a restyle, and is out of scope for this task.

- [ ] **Step 1: Replace the return block**

Replace `src/components/HomeDashboard.jsx:91-118` with:

```jsx
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 11, color: "var(--color-text-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Today's Best Mountain
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <ScoreRing score={best.powderScore} tier={best.powderTier ?? "Closed"} size={96} strokeWidth={8} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.1 }}>
            {resortEmoji(best.resortKey)} {resortName(best.resortKey)}
          </div>
          <div style={{ marginTop: 6, marginBottom: 10 }}>
            <Badge label={best.powderTier ?? "Closed"} color={TIER_COLORS[best.powderTier] ?? TIER_COLORS.Closed} />
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            <SnowStat icon="❄️" label="Snow 24h" value={best.snowPrev24in ?? "—"} unit="in" />
            <SnowStat icon="🚗" label="Drive Risk" value={best.driveRisk ?? "—"} />
          </div>
        </div>
      </div>
      <button
        onClick={() => onTabChange("dashboard")}
        style={{ background: "none", border: "none", color: "var(--color-accent)", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, textAlign: "left" }}
      >
        View All Resorts →
      </button>
    </Card>
  )
```

This keeps `best` selection (lines 77-79) and the "no resorts open" fallback (lines 81-89) untouched — only the populated-state layout changes: a large `size={96}` `ScoreRing` on the left (up from 64) and the resort name promoted to a bigger heading, matching the mockup's proportions.

- [ ] **Step 2: Verify**

Run `npm run dev`, go to Home. Confirm the card shows the same "best" resort it showed before this change (same selection logic, just a bigger layout), with the larger score ring on the left and the name/badge/stats stacked to its right, and "View All Resorts →" still navigates to the dashboard tab.

- [ ] **Step 3: Commit**

```bash
git add src/components/HomeDashboard.jsx
git commit -m "style: enlarge and restyle Today's Best Mountain card on Home"
```

---

### Task 11: Restyle the "Ready to ski?" hero

**Files:**
- Modify: `src/components/HomeDashboard.jsx:621-684` (`StartMyDayCta`)

**Interfaces:**
- Consumes: `HeroPhotoHeader` from Task 5, imported as `../ui/HeroPhotoHeader`... no — `HomeDashboard.jsx` lives in `src/components/` next to `MountainPage.jsx`, so the import path is `./ui/HeroPhotoHeader` (same as `MountainPage.jsx` uses), not `../ui/`.

The component currently has **no photo background at all** — it's a flat gradient card (lines 641-652 as read during planning: `background: "linear-gradient(135deg, rgba(56,189,248,0.12), rgba(2,132,199,0.08))"`). There's no single resort tied to this CTA before the user taps it, so rather than inventing a new generic stock-photo asset (out of scope — no such asset exists in this repo), reuse the same top-ranked-open-resort computation the button's `onClick` already does (lines 662-665) to source a real photo: the resort the button is about to start a session for.

- [ ] **Step 1: Replace `StartMyDayCta`**

Replace `src/components/HomeDashboard.jsx:621-684` with:

```jsx
function StartMyDayCta({ currentUser, sessionActive, resorts, onStartSession }) {
  if (!currentUser) return null

  if (sessionActive) {
    return (
      <div style={{
        background: "rgba(34,197,94,0.08)",
        border: "1px solid rgba(34,197,94,0.2)",
        borderRadius: 14,
        padding: "10px 16px",
        marginBottom: 16,
        fontSize: 13,
        color: "#4ade80",
        fontWeight: 700,
      }}>
        ● Session active — tracking your day
      </div>
    )
  }

  const topResort = resorts
    .filter(r => r.isOpen !== false && r.powderScore != null)
    .sort((a, b) => (b.powderScore ?? -1) - (a.powderScore ?? -1))[0]

  return (
    <div style={{ marginBottom: 16 }}>
      <HeroPhotoHeader
        photoPath={topResort?.photoPath}
        title="Ready to ski?"
        badges={[]}
        scoreSlot={null}
      >
        <div style={{ marginTop: 14 }}>
          <button
            onClick={() => onStartSession(topResort?.name ?? "Unknown Resort")}
            style={{
              width: "100%",
              background: "linear-gradient(135deg, #0284c7, #38bdf8)",
              border: "none",
              borderRadius: 14,
              padding: "14px 20px",
              color: "white",
              fontWeight: 900,
              fontSize: 15,
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(56,189,248,0.3)",
            }}
          >
            Start My Day ⛷
          </button>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 10, textAlign: "center" }}>
            Track your runs, vertical, and speed.
          </div>
        </div>
      </HeroPhotoHeader>
    </div>
  )
}
```

Add the import at the top of the file: `import HeroPhotoHeader from "./ui/HeroPhotoHeader"`.

Note `HeroPhotoHeader`'s `title` prop currently renders inside an `<h1>` (see Task 5) — check that having two `<h1>`s on the Home page (this one plus any other page-level heading `HomeDashboard.jsx` already renders) doesn't produce a duplicate top-level heading; if it does, that's a pre-existing pattern already established by `MountainPage.jsx` doing the same thing, so it's consistent with the rest of the app rather than a new problem.

- [ ] **Step 2: Verify**

Run `npm run dev`, go to Home while not in an active session. Confirm "Ready to ski?" now renders with a photo background (from the current top-ranked open resort) instead of the flat gradient, "Start My Day ⛷" still calls `onStartSession` with the same resort name it did before this change, and the in-session state (`sessionActive = true`) is completely unchanged (that branch wasn't touched).

- [ ] **Step 3: Commit**

```bash
git add src/components/HomeDashboard.jsx
git commit -m "style: restyle Ready to ski hero with a resort photo background"
```

---

## Phase 4: Social Feed

### Task 12: Restyle `ActivityFeed` cards

**Files:**
- Modify: `src/components/ActivityFeed.jsx:62-90` (the feed item render block)

**Interfaces:** none new — visual restyle of the existing text-based feed, per the approved spec's explicit scope limit (no photo/route-map post type this sprint).

- [ ] **Step 1: Wrap each feed item in `AccentCard`**

Add `import AccentCard from "./ui/AccentCard"`. Replace `src/components/ActivityFeed.jsx:66-92` (the `return (...)` for each mapped item, from the opening `<div key={item.id} ...>` through its matching closing `</div>`) with:

```jsx
        const typeAccent = item.type === "ski_session" ? "#38bdf8" : item.type === "trip_created" ? "#fb923c" : "#a78bfa"
        return (
          <AccentCard key={item.id} accentColor={typeAccent}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Avatar profile={item.profiles} size={36} />
              <div style={{ fontSize: 13, flex: 1 }}>
                <div>{describe ? describe(actorName, item.metadata) : `${actorName} did something`}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-3)", marginTop: 2 }}>{timeAgo(item.created_at)}</div>
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  {EMOJIS.map((emoji) => {
                    const count = itemReactions.filter((r) => r.emoji === emoji).length
                    const mine = itemReactions.some((r) => r.user_id === currentUserId && r.emoji === emoji)
                    return (
                      <button
                        key={emoji}
                        onClick={() => handleReact(item.id, emoji)}
                        style={{
                          display: "flex", alignItems: "center", gap: 3, padding: "2px 6px",
                          borderRadius: "var(--radius-pill)", border: "none", cursor: "pointer", fontSize: 12,
                          background: mine ? "var(--color-accent)" : "rgba(255,255,255,0.06)",
                          color: mine ? "var(--color-bg)" : "var(--color-text-2)",
                        }}
                      >
                        {emoji}
                        {count > 0 && <span style={{ fontSize: 10, fontWeight: 700 }}>{count}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </AccentCard>
        )
```

The only real changes from the original are: the outer wrapper is now `AccentCard` with a per-type accent color instead of a bare `<div>`, wrapped in an inner flex row (`AccentCard` doesn't itself lay out a flex row — Task 6's `AccentCard` is just padding/border/background, so the `display:flex, gap:10` row that used to be on the outer `<div>` moves to this new inner `<div>`), and `Avatar` size goes from `32` to `36`. The `describe`/`timeAgo`/emoji-reaction logic is byte-for-byte identical to what's there today.

- [ ] **Step 2: Verify**

Run `npm run dev`, go to the Social tab. Confirm existing activity items render inside bordered accent cards with the color varying by activity type, and that emoji reactions still work (click one, confirm it toggles) exactly as before this change.

- [ ] **Step 3: Commit**

```bash
git add src/components/ActivityFeed.jsx
git commit -m "style: restyle Social activity feed items with accent cards"
```

---

## Phase 5: Profile

### Task 13: Restyle `SeasonStatsCard`'s stat tiles + `RecentSessionsFeed` row spacing

**Files:**
- Modify: `src/components/ProfilePage.jsx:120-134` (`SeasonStatsCard`'s 2×2 stat grid)
- Modify: `src/components/ProfilePage.jsx:260-264` (`RecentSessionsFeed`'s row style)

**Interfaces:** none new. Both components already render almost exactly what the mockup shows — `SeasonStatsCard` already has the 4-tile Days/Vertical/Resorts/Powder-Days grid plus a delta row and top-resort/miles cards the mockup doesn't show at all, and `RecentSessionsFeed` already has the emoji + name + date + edit/share-icon row layout the mockup shows almost verbatim. Do not remove the delta row, top-resort/miles cards, or the edit/share modals — none of that is in the mockup, but all of it is real functionality already live in production. This task only tightens the two specific style objects called out above.

- [ ] **Step 1: Restyle the 2×2 stat tiles**

The tiles currently share hairline dividers via `gap: 1` (the same trick `StatStrip` from Task 4 uses). The mockup instead shows each tile as its own separated rounded card. Replace `src/components/ProfilePage.jsx:120-134`:

```jsx
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 14px 14px" }}>
        {statItems.map(item => (
          <div key={item.label} style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            padding: "16px 16px 14px",
          }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: "white", lineHeight: 1, letterSpacing: -1 }}>
              {item.value}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", marginTop: 5, textTransform: "uppercase", letterSpacing: 0.6 }}>
              {item.emoji} {item.label}
            </div>
          </div>
        ))}
      </div>
```

(Value font size drops from `48` to `32` since each tile is now half the width it effectively had with hairline dividers — `48` would wrap awkwardly on narrow tiles for larger numbers like vertical feet.)

- [ ] **Step 2: Add breathing room to session rows**

Replace `src/components/ProfilePage.jsx:260-264`:

```jsx
            <div key={s.id || i} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 16px",
              borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
            }}>
```

(Only `gap: 10 → 12` and `padding: "11px 16px" → "14px 16px"` change — everything inside the row, including the edit/share buttons and the powder-day indicator, stays exactly as-is.)

- [ ] **Step 3: Verify**

Run `npm run dev`, go to Profile. Confirm the 4 stat tiles now render as separated rounded cards instead of a hairline grid, the delta row / top-resort / miles cards below them are unchanged, and session history rows have slightly more vertical breathing room with the edit (✏️) and share (📤) buttons still functioning — open the edit modal on one session and the share card on another to confirm both still work.

- [ ] **Step 4: Commit**

```bash
git add src/components/ProfilePage.jsx
git commit -m "style: restyle Profile season stat tiles and session row spacing"
```

---

## Phase 6: Resort listing polish (existing `ResortCard`, in place — not a replacement)

### Task 14: Apply premium visual polish to `App.jsx`'s `ResortCard`

**Files:**
- Modify: `src/App.jsx:470-633` (`ResortCard`)

**Interfaces:** none new — every existing prop, piece of state (`expanded`, `weekExpanded`), and feature (travel alerts, 7-day forecast, friends-going badge, Mountain Page / Directions buttons) stays exactly as-is. Only visual treatment (badge styling, metric-tile styling, spacing) is updated to match the Snow Conditions mockup's aesthetic.

- [ ] **Step 1: Update the metric-grid tile styling**

Replace `src/App.jsx:536-547` (the 3-metric grid: 24h Snow / Base / Skiers):

```jsx
        <div className="metric-grid">
          {[
            { label: "24h Snow", value: r.snowPrev24in != null ? `${r.snowPrev24in}"` : "—" },
            { label: "Base",     value: r.baseDepth  != null ? `${r.baseDepth}"` : "—" },
            { label: "Skiers",   value: skierCounts?.[r.resortKey] ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, padding: "12px 12px" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
              <div style={{ marginTop: 4, fontSize: 22, fontWeight: 900 }}>{value}</div>
            </div>
          ))}
        </div>
```

Only the tile `background`/`border`/`borderRadius`/`padding`/label `letterSpacing`/value `fontSize` change (`0.04`→`0.05` bg opacity, `14`→`16` radius, `20`→`22` value size). The `.metric-grid` className (its grid layout rule lives in `src/index.css:248-259` and is not used anywhere else in the codebase — confirmed via `grep -n ".metric-grid" src/index.css`) and the three data entries are untouched.

- [ ] **Step 2: Update badge styling**

Replace `src/App.jsx:504-513` (the top-right badge row: Open/Closed, pass, drive risk):

```jsx
        <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {r.isOpen === false && (
            <div style={{ background: "rgba(30,10,10,0.75)", border: "1px solid rgba(239,68,68,0.5)", borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 900, color: "#f87171", backdropFilter: "blur(8px)", letterSpacing: 0.3 }}>Closed for Season</div>
          )}
          {r.isOpen === true && (
            <div style={{ background: "rgba(10,30,10,0.75)", border: "1px solid rgba(34,197,94,0.5)", borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 900, color: "#4ade80", backdropFilter: "blur(8px)", letterSpacing: 0.3 }}>Open</div>
          )}
          <div style={{ background: "rgba(4,8,15,0.65)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 900, backdropFilter: "blur(8px)", letterSpacing: 0.3 }}>{r.pass}</div>
          <div style={{ background: "rgba(4,8,15,0.65)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 900, color: riskColor(r.driveRisk), backdropFilter: "blur(8px)", letterSpacing: 0.3 }}>{r.driveRisk || "Unknown"}</div>
        </div>
```

Every condition (`r.isOpen === false`, `r.isOpen === true`, `r.pass`, `riskColor(r.driveRisk)`) and piece of displayed content is identical to the original — the only additions are `backdropFilter: "blur(8px)"` (frosted-glass look matching the mockup's badges) and `letterSpacing: 0.3`, plus `padding` going from `"5px 9px"` to `"5px 10px"`. Leave lines 518-526 (the tier/vibe badges, which already use the shared `Badge` component and `TIER_COLORS`) untouched — they already match the mockup's treatment since they're already componentized.

- [ ] **Step 3: Verify no functionality was dropped**

Run `npm run dev`, go to the Snow tab. For at least one resort: expand "Show Details" and confirm all detail rows still render (snow 48h, summit depth, temp, wind, lifts, runs, drive risk, timestamps); expand "This Week" and confirm the 7-day forecast panel still renders; confirm "Mountain Page →" still navigates and "📍 Directions" still opens the maps link. This is the one task in this plan with the highest regression risk — do not skip this verification step.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "style: apply premium visual polish to resort cards on the Snow tab"
```

---

## Post-plan check

After all 14 tasks: run `npm run lint` once at the end and confirm it's clean (each task should already keep it clean individually, but a final full-repo pass catches anything missed). Then walk all 5 redesigned screens plus the Snow tab in the browser end-to-end against the mockups in `mockups/Stitch_Premium_Redesigns/crew_planning_dashboard_1/` before considering the sprint done.
