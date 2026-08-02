# Sprint 18 — Post-Session Share Card

**Goal:** ROADMAP TASK 5.1 — add a per-session share card (resort, date, vertical, runs, top speed, powder badge) alongside the existing season-recap share card, triggered from Profile's session history rows.
**Estimated effort:** 1 day
**Depends on:** Sprint 15 (Session history + calendar heatmap) merged, for the List-view session rows this sprint adds a Share icon to.

**Correction to ROADMAP.md before you start:** ROADMAP TASK 5.1 says to export via `html2canvas`. That's unnecessary — `src/components/ShareStatCard.jsx` **already** renders entirely via native Canvas 2D drawing (manual gradients, hand-drawn mountain silhouettes, procedural snowflakes, a custom avatar drawer) and already exports via `canvas.toDataURL("image/png")` plus a working `navigator.share()` / download-fallback flow. There is no `html2canvas` dependency anywhere in this repo (confirmed) and none is needed — this sprint **extends** the existing Canvas-based component with a new per-session mode, it does not introduce a new rendering library. `SessionRecapModal.jsx` (ROADMAP's other stated trigger point) does not exist yet in this codebase — it's part of `sprints/sprint-4-active-session-ui.md`, not yet executed. Wire the Share trigger there too if/when sprint-4 has landed by the time you do this work; otherwise S18-T2 (Profile session-row Share icon) is this sprint's only trigger point and stands on its own.

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**`src/components/ShareStatCard.jsx` (368 lines) — read in full before editing.** Current shape: fixed `1080×1080` canvas, `renderCard()` (lines 118-274) does all the drawing (background gradient, `drawMountains`, `drawSnowflakes`, `drawAvatar`, then a 2×2 stat grid + "Top Resort" banner + branding header specific to **season** stats), `handleShare()` (lines 295-315) handles the `navigator.share()`/download-fallback export. Current props: `{ profile, stats, season, onClose }` where `stats = { days, vertical, miles, powderDays, resorts, topResort }` (season-level, from `computeStats()` in `ProfilePage.jsx`).

**Current only call site** — `src/components/ProfilePage.jsx` lines 655-661:
```jsx
{showShare && seasonStats && (
  <ShareStatCard profile={{ ...profile, full_name: fullName }} stats={seasonStats} season={season} onClose={() => setShowShare(false)} />
)}
```

**`src/lib/resorts.js`** exports `RESORT_PHOTOS` (a map of resort key → hero photo path, already used elsewhere in the app for resort card backgrounds) — use this for the new per-session card's hero photo background, don't add a second photo-path source.

**Session row shape** (from `ski_sessions`): `resort_name` (actually a resort key, see sprint-15's note), `session_date`, `is_powder_day`, `vertical_feet`, `runs_logged`, `top_speed_mph`.

---

## Tasks

S18-T1 (extend `ShareStatCard` for per-session mode) has no dependency. S18-T2 (Profile session-row Share icon) depends on S18-T1. S18-T3 (SessionRecapModal wiring) is conditional on sprint-4 having landed — attempt it only if `src/components/SessionRecapModal.jsx` exists when you start this sprint.

---

### S18-T1 — Add a per-session mode to `ShareStatCard.jsx`

**File to modify:** `src/components/ShareStatCard.jsx`

**Step 1 — Change the props contract to accept either mode:**
```js
export default function ShareStatCard({ profile, stats, season, session, onClose }) {
  const mode = session ? "session" : "season"
  // ...
}
```
`stats`/`season` (existing season mode) and `session` (new mode) are mutually exclusive — the caller passes one or the other.

**Step 2 — Branch `renderCard()`'s stat-drawing section on `mode`.** Keep the shared visual chrome (background gradient, mountain silhouettes, snowflakes, avatar, branding header/footer) identical between both modes — only the stat content block differs:
- **Season mode** (existing, unchanged): 2×2 grid (Days, Vertical, Resorts, Powder Days) + Top Resort banner.
- **Session mode** (new): resort name (large headline, using `resortName(session.resort_name)` from `../lib/resorts`), date (`session.session_date`, formatted via the existing `../lib/format` helpers already used elsewhere in the app), then a stat row: Vertical (`session.vertical_feet ?? "—"` ft), Runs (`session.runs_logged ?? "—"`), Top Speed (`session.top_speed_mph != null ? \`${session.top_speed_mph} mph\` : "—"`), and a powder-day badge (❄️) if `session.is_powder_day`.

**Step 3 — Add the resort hero photo as a background layer in session mode.** Load `RESORT_PHOTOS[session.resort_name]` as an `Image`, draw it behind the gradient overlay (gradient on top at reduced opacity for text legibility, matching the existing resort-card convention elsewhere in the app: dark gradient overlay on a photo background). Follow whatever async-image-loading pattern `drawAvatar` already uses for `profile.avatar_url` (it necessarily loads a remote image before drawing) — mirror that same load-then-draw approach for the hero photo rather than inventing a new one. If `RESORT_PHOTOS[session.resort_name]` is missing for some resort key, fall back to the existing plain gradient background (season mode's current background) rather than failing to render.

**Step 4 — Update the filename** in `handleShare()` to branch on mode too: session mode should use something like `` `powderdays-${session.resort_name}-${session.session_date}.png` `` instead of the season-based filename.

**Acceptance criteria:**
- `<ShareStatCard profile={p} session={s} onClose={fn} />` renders a card showing resort name, date, vertical, runs, top speed, and a powder badge when applicable — with the resort's hero photo as a background if available.
- `<ShareStatCard profile={p} stats={stats} season={season} onClose={fn} />` (existing call signature) still renders exactly as before — zero regression to season mode.
- Both modes export via the same `handleShare()` (`navigator.share()` with file, falling back to download) with mode-appropriate filenames.

**Verify in browser:**
```bash
npm run dev
```
Trigger season mode from Profile's existing "Share Season" button (unchanged), confirm no regression. You won't have a session-mode trigger until S18-T2 — verify session mode by temporarily rendering `<ShareStatCard profile={testProfile} session={testSession} onClose={() => {}} />` from a scratch location, or wait and verify via S18-T2's UI once wired.

**Build check:**
```bash
npm run build
```

---

### S18-T2 — Share icon on Profile session history rows

**File to modify:** `src/components/ProfilePage.jsx`

In `RecentSessionsFeed` (the ✏️ edit-stats icon was added by sprint-13; the `limit` prop for full-list display was added by sprint-15), add a second icon/button per row — "📤 Share" — next to the existing ✏️ edit icon (a row can show either or both icons depending on state; a session can be shared regardless of whether it has stats, unlike editing which is gated on missing stats).

```jsx
const [shareSession, setShareSession] = useState(null)

// per-row:
<button onClick={() => setShareSession(session)} aria-label="Share this session">📤</button>

// render site, alongside the component's existing modals:
{shareSession && (
  <ShareStatCard
    profile={{ ...profile, full_name: fullName }}
    session={shareSession}
    onClose={() => setShareSession(null)}
  />
)}
```
Import `ShareStatCard` if not already imported in this exact scope (it's already imported once for season mode — reuse the same import, don't add a duplicate).

**Acceptance criteria:**
- Every session row in List view (from sprint-15) has a working Share icon, independent of whether that row also shows the edit-stats icon.
- Clicking it opens `ShareStatCard` in session mode for that specific session.
- Closing the card returns to the session list with no stale state.

**Verify in browser:**
```bash
npm run dev
```
Open Profile, List view, click Share on a session, confirm the card renders with that session's data and the hero photo (if the resort has one), test the share/download action.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add src/components/ShareStatCard.jsx src/components/ProfilePage.jsx
git commit -m "feat: add per-session share card, triggered from Profile session history"
```

---

### S18-T3 — Wire Share into `SessionRecapModal.jsx` (conditional — only if sprint-4 has landed)

**Check first:** `ls src/components/SessionRecapModal.jsx`. If it does not exist, **skip this task entirely** — it's not a blocker for the rest of this sprint, and there's nothing to wire yet.

If it exists: read its current props (per sprint-4's spec it should already receive a `stats summary` and have a "Share" CTA placeholder hooking toward this sprint). Wire its Share button to open `ShareStatCard` in session mode with the just-completed session's data, following the same pattern as S18-T2.

**Acceptance criteria (if applicable):**
- `SessionRecapModal`'s "Share" button opens `ShareStatCard` in session mode for the session that was just recorded.

**Commit (if this task was done):**
```bash
git add src/components/SessionRecapModal.jsx
git commit -m "feat: wire session share card into end-of-day recap modal"
```

---

## Sprint Acceptance Criteria

- [ ] `ShareStatCard.jsx` supports both season mode (unchanged) and a new session mode (resort, date, vertical, runs, top speed, powder badge, resort hero photo background)
- [ ] Profile's session history rows have a working Share icon that opens session-mode `ShareStatCard`
- [ ] `npm run build` succeeds
- [ ] Verified in browser: both season-mode (regression check) and session-mode sharing work end-to-end
- [ ] SessionRecapModal wiring done if and only if that component already exists

## Out of Scope for This Sprint

- Building `SessionRecapModal.jsx` itself if it doesn't exist yet — that's sprint-4's job, not this sprint's.
- Adding `html2canvas` or any new rendering dependency — explicitly not needed, see the correction note above.
- Redesigning the season-mode card's visuals — only the session mode is new; season mode is untouched aside from the mode-branching refactor needed to support both.
</content>
