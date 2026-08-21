import { test } from "node:test"
import assert from "node:assert/strict"
import { runLoaders, mergeFailed } from "./loaderRegistry.js"

// A logger that records instead of printing, so a test asserting on failure
// behaviour does not spray console noise through the run.
function spyLogger() {
  const calls = []
  const fn = (...args) => calls.push(args)
  fn.calls = calls
  return fn
}

const ok = (key, value, fallback) => ({ key, fallback, fn: async () => value })
const boom = (key, fallback, reason = new Error("nope")) => ({
  key, fallback, fn: async () => { throw reason },
})

test("every loader's resolved value is returned under its key", async () => {
  const { values, failed } = await runLoaders(
    [ok("friends", ["a"], []), ok("crews", ["x"], [])],
    { logger: spyLogger() }
  )
  assert.deepEqual(values.get("friends"), ["a"])
  assert.deepEqual(values.get("crews"), ["x"])
  assert.equal(failed.size, 0)
})

test("a rejected loader yields its fallback, not a missing key", async () => {
  // This is the whole point of the registry: state stays deterministic. The old
  // Promise.all skipped every setter, leaving nine healthy sections stale.
  const { values, failed } = await runLoaders(
    [ok("friends", ["a"], []), boom("crews", { rows: [] })],
    { logger: spyLogger() }
  )
  assert.deepEqual(values.get("friends"), ["a"])
  assert.deepEqual(values.get("crews"), { rows: [] })
  assert.ok(failed.has("crews"))
})

test("one loader failing does not stop the others resolving", async () => {
  const { values, failed } = await runLoaders(
    [boom("a", "fa"), ok("b", "vb", "fb"), boom("c", "fc")],
    { logger: spyLogger() }
  )
  assert.equal(values.get("b"), "vb")
  assert.deepEqual([...failed.keys()].sort(), ["a", "c"])
})

test("the rejection reason is kept, not just the fact of failure", async () => {
  const reason = new Error("permission denied for table profiles")
  const { failed } = await runLoaders([boom("crews", [], reason)], { logger: spyLogger() })
  assert.equal(failed.get("crews"), reason)
})

test("a failure is logged with its key so beta bugs stay diagnosable", async () => {
  const logger = spyLogger()
  const reason = new Error("boom")
  await runLoaders([boom("crews", [], reason)], { logPrefix: "FriendsPage", logger })

  assert.equal(logger.calls.length, 1)
  const [message, loggedReason] = logger.calls[0]
  assert.match(message, /FriendsPage/)
  assert.match(message, /crews/)
  assert.equal(loggedReason, reason)
})

test("a loader resolving undefined falls back instead of storing undefined", async () => {
  const { values, failed } = await runLoaders([ok("friends", undefined, [])], { logger: spyLogger() })
  assert.deepEqual(values.get("friends"), [])
  assert.equal(failed.size, 0, "resolving undefined is success, not failure")
})

test("a loader resolving null falls back too", async () => {
  const { values } = await runLoaders([ok("friends", null, [])], { logger: spyLogger() })
  assert.deepEqual(values.get("friends"), [])
})

test("an empty loader list is not an error", async () => {
  const { values, failed } = await runLoaders([], { logger: spyLogger() })
  assert.equal(values.size, 0)
  assert.equal(failed.size, 0)
})

test("mergeFailed clears a key that ran and succeeded", () => {
  assert.deepEqual(mergeFailed({ crews: true }, ["crews"], []), {})
})

test("mergeFailed records a key that ran and failed", () => {
  assert.deepEqual(mergeFailed({}, ["crews"], ["crews"]), { crews: true })
})

test("a subset retry does not clear another block's failure", () => {
  // Retrying only "crews" must leave the "friends" notice on screen. Blowing it
  // away would make a second broken block look healthy after an unrelated retry.
  assert.deepEqual(
    mergeFailed({ crews: true, friends: true }, ["crews"], []),
    { friends: true }
  )
})

test("mergeFailed does not mutate the previous state object", () => {
  const prev = { crews: true }
  const next = mergeFailed(prev, ["crews"], [])
  assert.deepEqual(prev, { crews: true }, "React state must not be mutated in place")
  assert.notEqual(next, prev)
})

test("mergeFailed accepts the failed Map's keys directly", () => {
  const failed = new Map([["crews", new Error("x")]])
  assert.deepEqual(mergeFailed({}, ["crews", "friends"], failed.keys()), { crews: true })
})
