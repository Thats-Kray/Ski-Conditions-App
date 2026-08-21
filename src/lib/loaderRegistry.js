/**
 * Per-block loading with per-block failure.
 *
 * The problem this exists to solve: a page that awaits N calls in one Promise.all
 * loses ALL of them when any ONE rejects. On 2026-08-18 a stale-bundle 403 on
 * `profiles` blanked the entire Social tab — nine healthy sections rendered empty
 * behind a toast that auto-dismissed after three seconds.
 *
 * A loader is a plain descriptor:
 *
 *   { key, label, fn, fallback, apply }
 *
 *   key      — stable id, used for the failure flag and for subset retries
 *   label    — human phrase for the failure notice ("your friends list")
 *   fn       — async () => value
 *   fallback — the value to use when fn rejects, or resolves null/undefined
 *   apply    — (value) => void; the caller's setState. Not called by this module.
 *
 * `apply` deliberately stays with the caller: this module is pure so it can be
 * tested under `node --test`, which has no DOM and no React.
 *
 * IMPORTANT for loader authors: never .catch() inside `fn`. A swallowed rejection
 * resolves the loader as fulfilled, so the block reports healthy while holding
 * empty data — no retry notice, no console error, no way to notice. Let it throw.
 */

/**
 * Runs every loader to completion regardless of which ones reject.
 *
 * @param {Array} list loader descriptors
 * @param {object} [opts]
 * @param {string} [opts.logPrefix] component name, for the console line
 * @param {Function} [opts.logger] injectable for tests; defaults to console.error
 * @returns {Promise<{ values: Map<string, any>, failed: Map<string, any> }>}
 *   `values` holds one entry per loader — the resolved value, or the fallback if it
 *   rejected — so the caller can apply state unconditionally and never leave a block
 *   showing stale data. `failed` maps key → rejection reason.
 */
export async function runLoaders(list, { logPrefix = "", logger = console.error } = {}) {
  const results = await Promise.allSettled(list.map((l) => l.fn()))

  const values = new Map()
  const failed = new Map()

  results.forEach((res, i) => {
    const loader = list[i]

    if (res.status === "fulfilled") {
      // ?? and not ||: a loader legitimately resolving 0 or "" keeps its value.
      values.set(loader.key, res.value ?? loader.fallback)
      return
    }

    values.set(loader.key, loader.fallback)
    failed.set(loader.key, res.reason)

    // Keep the real error reachable. The UI shows friendly copy, but during beta the
    // raw PostgREST message is what makes a bug diagnosable — that is how the
    // 2026-08-18 stale-bundle 403 was traced in minutes.
    logger(`[${logPrefix}] "${loader.key}" failed to load:`, res.reason)
  })

  return { values, failed }
}

/**
 * Folds one run's results into the page's `failed` flag object.
 *
 * The subtle part, and the reason this is a named function with its own tests:
 * it clears only the keys that actually RAN. Retrying one block must not wipe a
 * different block's failure notice off the screen — that would make a still-broken
 * section look healthy because something unrelated succeeded.
 *
 * @param {object} prev previous flag object, not mutated
 * @param {Iterable<string>} ranKeys keys included in this run
 * @param {Iterable<string>} failedKeys keys that failed (pass `failed.keys()`)
 * @returns {object} new flag object, key → true
 */
export function mergeFailed(prev, ranKeys, failedKeys) {
  const next = { ...prev }
  for (const key of ranKeys) delete next[key]
  for (const key of failedKeys) next[key] = true
  return next
}

/** The subset of `list` matching `keys`, or all of `list` when `keys` is falsy. */
export function selectLoaders(list, keys) {
  return keys ? list.filter((l) => keys.includes(l.key)) : list
}
