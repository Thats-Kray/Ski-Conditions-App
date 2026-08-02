# Sprint 23 — Powder Alert Preference

**Goal:** ROADMAP TASK 7.1 — let users opt into a weekly Wednesday powder forecast email from their Profile settings.
**Estimated effort:** 0.5 day
**Depends on:** Nothing new. (Sprint 24, the cron job that actually sends the email, depends on this sprint.)

---

## Project Context

You are working on **PowderDays**, a ski conditions and social planning app for Colorado skiers.

**`src/components/ProfilePage.jsx`** — `EditProfileModal` (lines 169-321). Current form sections in order: Display Name (238-241), Sport (244-256), Skill Level (259-272), Ski Passes (275-291), Vehicle (294-300). `handleSave()` (183-203) calls `upsertMyProfile({ first_name, last_name, avatar_url, skill_level, sport_type, ski_passes, vehicle_label, vehicle_seats })` — a fixed field list.

**`upsertMyProfile(profile)`** (`src/lib/socialApi.js`, lines 140-170) hardcodes its payload shape — it does **not** currently pass through arbitrary new fields. You must add lines for the 2 new fields explicitly; passing them in the call from `ProfilePage.jsx` alone won't work without this change.

**`getMyProfile()`** (lines 127-138) already does `select("*")`, so once the migration lands, `powder_alerts_enabled`/`alert_phone` are automatically returned with no code change needed there.

---

## Tasks

S23-T1 (migration) has no dependency. S23-T2 (`upsertMyProfile` + UI) depends on S23-T1 being run against Supabase.

---

### S23-T1 — `migrations/015_powder_alerts.sql`

**File to create:** `migrations/015_powder_alerts.sql`

```sql
-- Migration 015: Powder alert preference
-- Run in Supabase SQL Editor.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS powder_alerts_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_phone TEXT;
```

No RLS changes needed — `profiles` already has RLS enabled with an existing "Users manage own profile" `FOR ALL` policy (`auth.uid() = id`), which already covers updates to these 2 new columns.

**Do not run this migration yourself** — reviewed and run manually against Supabase per this repo's convention.

**Acceptance criteria:**
- `profiles` gains `powder_alerts_enabled` (boolean, default `false`) and `alert_phone` (nullable text).
- No existing column or policy is touched.

---

### S23-T2 — Wire the toggle into `upsertMyProfile` and `EditProfileModal`

**File to modify:** `src/lib/socialApi.js`

In `upsertMyProfile`'s payload object, add:
```js
powder_alerts_enabled: profile.powder_alerts_enabled ?? false,
alert_phone: profile.alert_phone || null,
```
Match the exact style of the surrounding lines (nullish-coalescing vs. `||` — read the existing fields to see which convention each uses and stay consistent per-field-type; booleans typically want `??`, optional text typically wants `||` to also coerce empty string to `null`).

**File to modify:** `src/components/ProfilePage.jsx`

**Step 1 — Add state** in `EditProfileModal`, initialized from the current profile:
```js
const [powderAlertsEnabled, setPowderAlertsEnabled] = useState(profile?.powder_alerts_enabled ?? false)
const [alertPhone, setAlertPhone] = useState(profile?.alert_phone ?? "")
```

**Step 2 — Add a new form section**, after Vehicle (the last existing section) or wherever fits the visual flow best after reading the current layout:
```jsx
<div style={{ display: "grid", gap: 8 }}>
  <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
    <input
      type="checkbox"
      checked={powderAlertsEnabled}
      onChange={(e) => setPowderAlertsEnabled(e.target.checked)}
    />
    📧 Weekly powder forecast every Wednesday
  </label>
  {powderAlertsEnabled && (
    <input
      type="tel"
      placeholder="Phone number (for future SMS alerts)"
      value={alertPhone}
      onChange={(e) => setAlertPhone(e.target.value)}
      style={{ /* match existing input styling in this modal */ }}
    />
  )}
</div>
```
Match the existing `<input>` styling used elsewhere in this exact modal (border, background, radius, padding) — read a nearby field (e.g. Display Name's input) and copy its style object rather than leaving this bare.

**Step 3 — Include both fields in `handleSave()`'s `upsertMyProfile(...)` call:**
```js
await upsertMyProfile({
  // ...existing fields,
  powder_alerts_enabled: powderAlertsEnabled,
  alert_phone: alertPhone.trim() || null,
})
```

**Acceptance criteria:**
- The toggle defaults to the user's current saved preference (off for new users, matching the column default).
- The phone field only appears when the toggle is on, is optional (empty is valid), and saves as `null` if left blank.
- Saving the profile persists both fields; reopening the modal shows the previously saved state.

**Verify in browser:**
```bash
npm run dev
```
Open Profile → Edit Profile, toggle the alert preference on, optionally enter a phone number, save, reopen the modal, confirm the state persisted.

**Build check:**
```bash
npm run build
```

**Commit:**
```bash
git add migrations/015_powder_alerts.sql src/lib/socialApi.js src/components/ProfilePage.jsx
git commit -m "feat: add powder alert opt-in toggle to Profile settings"
```

---

## Sprint Acceptance Criteria

- [ ] `migrations/015_powder_alerts.sql` exists and has been run against Supabase
- [ ] `upsertMyProfile` accepts and persists `powder_alerts_enabled` and `alert_phone`
- [ ] Profile settings show a working toggle + conditional phone field
- [ ] `npm run build` succeeds
- [ ] Verified in browser: toggle persists across a reload

## Out of Scope for This Sprint

- Actually sending any email or SMS — that's sprint-24 (cron job) and a future SMS integration (Twilio, per PRD Phase 5 — explicitly deferred, the phone field is collected now but unused until then).
- Phone number format validation — the field accepts any string for now (labeled "for future SMS alerts," not active yet).
</content>
