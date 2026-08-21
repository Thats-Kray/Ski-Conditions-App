# Check-In Status — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Home's "Check In Today" actually set your status. Ask where you are — not left
yet, driving, or arrived — and ask for an ETA when that's still a question.

**Origin:** Kyle, 2026-08-21, testing live: *"when I select check in for todays plan, my status
does not update to arrived. When clicking the check in for todays plan, it should ask the user
to mark their status. Driving or Arrived, if they select Driving, they should be asked for their
ETA."* Follow-up decision: *"If they check in but mark status as planned and still haven't left,
they should be asked to update/confirm their ETA."*

**Root cause of the bug half:** `SkiCheckInForm` writes the plan's resort, ETA and note but
never passes a `status`. `buildPlanUpsert` doesn't accept one — it falls back to
`existing?.status` then `"planned"` — so checking in can never move you to `driving` or
`arrived`. Those two values are only reachable from `TodaysCrew`'s buttons.

**Architecture:** Extend the pure `buildPlanUpsert` to accept an explicit status (and an
arrival timestamp), with tests. Then add a three-way status control to `SkiCheckInForm` and make
the ETA field's presence and copy follow it.

## Global Constraints

- **No new npm dependencies.** `npm test` runs `node --test src/lib/*.test.js`; only pure
  `src/lib/` modules are testable and no component harness exists.
- **`npm test` is at 64 passing.** You are adding tests, so it must rise, never fall.
- **`npm run lint` baseline is 88 problems (80 errors, 8 warnings).** Diff against that.
- **`npm run build` must succeed.**
- **Inline `style={{}}` objects only**; colors via `var(--color-*)` tokens, never concatenated
  with a hex alpha suffix.
- **Date keys from local date parts, never `toISOString()`** — except `arrived_at`, which is a
  real UTC instant and correctly uses `new Date().toISOString()`.
- `daily_plans.status` has a CHECK constraint allowing exactly `planned | driving | arrived`.
  No other value may ever be written.

---

## Task 1: Teach `buildPlanUpsert` about status

**Files:**
- Modify: `src/lib/planUpsert.js`
- Modify: `src/lib/planUpsert.test.js`

**Interfaces:**
- Produces: `buildPlanUpsert(existing, { skiDate, resortKey, eta, visibility, note, status, arrivedAt })`
  — two new optional fields. Every existing caller keeps working unchanged.

**Rules:**
- `status` omitted → current behavior exactly: fall back to `existing?.status`, then `"planned"`.
- `status` passed → use it. It must be one of `planned | driving | arrived`; anything else falls
  back as if omitted, so a bad value can never reach the CHECK constraint.
- `arrivedAt` omitted → fall back to `existing?.arrived_at ?? null`, as today.
- `arrivedAt` passed → use it (including an explicit `null` to clear).
- **An explicit `status` overrides the resort-change reset.** The existing rule resets
  `status`/`arrived_at` when the resort changes, because you can't have arrived at a mountain
  you're no longer going to. But a user who changes mountain *and* says "I'm arrived" in the same
  save means it — honor them. The reset only applies when the caller passed no `status`.
- Keep `buildPlanUpsert` **pure**: it must never call `new Date()`. The caller supplies
  `arrivedAt`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/planUpsert.test.js`:

```js
test("status is carried forward when the caller omits it", () => {
  const out = buildPlanUpsert(
    { resort_key: "vail", status: "driving", arrived_at: null },
    { skiDate: "2026-08-21", resortKey: "vail" }
  )
  assert.equal(out.status, "driving")
})

test("an explicit status is used", () => {
  const out = buildPlanUpsert(
    { resort_key: "vail", status: "planned", arrived_at: null },
    { skiDate: "2026-08-21", resortKey: "vail", status: "arrived", arrivedAt: "2026-08-21T16:30:00.000Z" }
  )
  assert.equal(out.status, "arrived")
  assert.equal(out.arrived_at, "2026-08-21T16:30:00.000Z")
})

test("an invalid status falls back instead of reaching the CHECK constraint", () => {
  const out = buildPlanUpsert(
    { resort_key: "vail", status: "driving", arrived_at: null },
    { skiDate: "2026-08-21", resortKey: "vail", status: "teleporting" }
  )
  assert.equal(out.status, "driving")
})

test("an explicit status overrides the resort-change reset", () => {
  // Changing mountain normally resets status to planned. Saying "I'm arrived" in the
  // same breath is deliberate, so it wins.
  const out = buildPlanUpsert(
    { resort_key: "vail", status: "arrived", arrived_at: "2026-08-21T15:00:00.000Z" },
    { skiDate: "2026-08-21", resortKey: "coppermountain", status: "arrived", arrivedAt: "2026-08-21T17:00:00.000Z" }
  )
  assert.equal(out.resort_key, "coppermountain")
  assert.equal(out.status, "arrived")
  assert.equal(out.arrived_at, "2026-08-21T17:00:00.000Z")
})

test("a resort change with no explicit status still resets status and arrival", () => {
  const out = buildPlanUpsert(
    { resort_key: "vail", status: "arrived", arrived_at: "2026-08-21T15:00:00.000Z" },
    { skiDate: "2026-08-21", resortKey: "coppermountain" }
  )
  assert.equal(out.status, "planned")
  assert.equal(out.arrived_at, null)
})

test("arrivedAt can be explicitly cleared", () => {
  const out = buildPlanUpsert(
    { resort_key: "vail", status: "arrived", arrived_at: "2026-08-21T15:00:00.000Z" },
    { skiDate: "2026-08-21", resortKey: "vail", status: "driving", arrivedAt: null }
  )
  assert.equal(out.status, "driving")
  assert.equal(out.arrived_at, null)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — the explicit-status tests report `"planned"`/`"driving"` where `"arrived"` was
expected, because the function currently ignores a `status` argument entirely.

- [ ] **Step 3: Implement**

In `src/lib/planUpsert.js`, add the constant above the function:

```js
// daily_plans.status has a CHECK constraint allowing exactly these three values.
// Anything else must never reach the database.
const VALID_STATUSES = ["planned", "driving", "arrived"]
```

Destructure the two new fields, and replace the status/arrived_at resolution so an explicit
status wins over the resort-change reset. Adapt to the function's actual current shape rather
than pasting blindly — in particular keep the existing `eta` handling exactly as it is:

```js
  const explicitStatus = VALID_STATUSES.includes(status) ? status : null
  const resortChanged = resort_key !== existing?.resort_key

  // A resort change normally clears status and arrival — you cannot have arrived at a
  // mountain you are no longer going to. But an explicit status is the user telling us
  // directly, so it outranks the inference.
  const statusOut = explicitStatus
    ?? (resortChanged ? "planned" : (existing?.status || "planned"))

  const arrivedOut = arrivedAt !== undefined
    ? arrivedAt
    : (explicitStatus ? (existing?.arrived_at ?? null)
                      : (resortChanged ? null : (existing?.arrived_at ?? null)))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 70 tests (64 + 6). **Every pre-existing `planUpsert` test must still pass
untouched** — they cover the omitted-status path that all four current writers rely on. If one
fails, the fallback branch is wrong; do not edit those tests.

- [ ] **Step 5: Lint and commit**

Run: `npm run lint` → 88 problems.

```bash
git add src/lib/planUpsert.js src/lib/planUpsert.test.js
git commit -m "feat: let buildPlanUpsert accept an explicit plan status"
```

---

## Task 2: Ask for status in the check-in form

**Files:**
- Modify: `src/components/SkiCheckInForm.jsx`

**Interfaces:**
- Consumes: `buildPlanUpsert`'s new `status`/`arrivedAt` fields (Task 1).

**The three states and what each shows:**

| Choice | Writes | ETA field |
|---|---|---|
| **Not left yet** (default) | `status: "planned"` | Shown. If an ETA already exists, prompt to confirm or update it. |
| **🚗 Driving** | `status: "driving"` | Shown, asking when they'll arrive. |
| **⛷️ Arrived** | `status: "arrived"`, `arrivedAt: new Date().toISOString()` | Hidden — they're already there. |

- [ ] **Step 1: Add status state, seeded from the existing plan**

Add alongside the other `useState` declarations:

```jsx
  const [status, setStatus] = useState("planned")
```

In the effect that loads the existing plan (where `setNote(existingPlan.note || "")` already
runs), seed it:

```jsx
          setStatus(existingPlan.status || "planned")
```

- [ ] **Step 2: Render the status control**

Place it directly **above** the ETA field, so the answer to "where are you" precedes the
question it governs. Match the visibility-pill styling already used in
`src/components/PlanEditorModal.jsx` — read that component's visibility row and copy its shape,
sizing and token usage rather than inventing a new control:

```jsx
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: 1,
            color: "var(--color-text-3)", textTransform: "uppercase",
          }}>
            Where are you?
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { key: "planned", label: "Not left yet" },
              { key: "driving", label: "🚗 Driving" },
              { key: "arrived", label: "⛷️ Arrived" },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatus(key)}
                disabled={loading}
                aria-pressed={status === key}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 999, fontSize: 12, fontWeight: 700,
                  border: status === key
                    ? "1px solid var(--color-accent)"
                    : "1px solid var(--color-border)",
                  background: status === key ? "var(--color-accent-dim)" : "transparent",
                  color: status === key ? "var(--color-text-1)" : "var(--color-text-3)",
                  cursor: loading ? "default" : "pointer", minHeight: 44,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
```

`type="button"` is required — this form has a `<select required>` and a submit handler, and a
bare `<button>` inside a `<form>` defaults to `type="submit"`, so omitting it would submit the
form on every status tap.

- [ ] **Step 3: Make the ETA field follow the status**

Wrap the existing ETA field so it renders only when `status !== "arrived"`, and give it copy
that changes with the state. When the user is still planning and already has an ETA on record,
prompt them to confirm it — that is Kyle's explicit ask:

```jsx
        {status !== "arrived" && (
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: 1,
              color: "var(--color-text-3)", textTransform: "uppercase",
            }}>
              {status === "driving" ? "When will you get there?" : "When are you planning to arrive?"}
            </div>

            {/* ...the existing ETA input, unchanged... */}

            {status === "planned" && eta && (
              <div style={{ fontSize: 11, color: "var(--color-text-3)" }}>
                Still arriving around {eta}? Update it if that has changed.
              </div>
            )}
          </div>
        )}
```

Keep the existing `<input>` exactly as it is — only its surrounding label and the confirm line
are new.

- [ ] **Step 4: Pass status through on save**

In the submit handler, extend the `buildPlanUpsert` call with the two new fields:

```jsx
        status,
        // A real UTC instant, not a date key — arrived_at is a timestamptz.
        arrivedAt: status === "arrived" ? new Date().toISOString() : undefined,
```

`undefined` for the non-arrived cases means "carry forward whatever exists", which is the
established convention in this function and leaves an earlier arrival timestamp intact if the
user flips back and forth.

- [ ] **Step 5: Verify and commit**

Run: `npm test` → 70 passing.
Run: `npm run lint` → 88 problems.
Run: `npm run build` → succeeds.

```bash
git add src/components/SkiCheckInForm.jsx
git commit -m "feat: ask for driving/arrived status when checking in"
```

## Verification the human runs

1. Home → **Check In Today** shows three choices, defaulting to **Not left yet**.
2. Picking **Arrived** hides the ETA field; saving shows you as arrived in Today's Crew, and the
   check-in pin disappears.
3. Picking **Driving** shows the ETA field asking when you'll get there; saving shows you as
   driving in Today's Crew.
4. Picking **Not left yet** with an ETA already saved shows the "Still arriving around 9:00?"
   confirm line.
5. Re-opening the form shows the status you last saved, not the default.
6. Tapping a status button does **not** submit the form.
7. Changing mountain *and* selecting Arrived in one save keeps you arrived at the new mountain.
8. Editing today's plan from Profile → Ski Plans does **not** reset a `driving`/`arrived` status.
