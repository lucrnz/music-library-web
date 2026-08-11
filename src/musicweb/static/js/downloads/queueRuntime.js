/**
 * In-flight download jobs: active set + AbortControllers.
 */

/** @type {Set<number>} */
export const activeIds = new Set();

/** @type {Map<number, AbortController>} */
export const controllers = new Map();

/**
 * @param {number} id
 * @param {string} [reason]
 */
export function abortJob(id, reason = "pause") {
  const c = controllers.get(id);
  if (c) {
    try {
      c.abort(reason);
    } catch {
      /* ignore */
    }
  }
}

/**
 * @param {string} [reason]
 */
export function abortAllJobs(reason = "pause") {
  for (const id of [...controllers.keys()]) {
    abortJob(id, reason);
  }
}
