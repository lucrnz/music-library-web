/**
 * Named queue row state transitions (in-memory; caller persists).
 */

/** @typedef {'pending'|'active'|'paused'|'failed'|'canceled'} QueueStateName */

export const QueueState = Object.freeze({
  PENDING: "pending",
  ACTIVE: "active",
  PAUSED: "paused",
  FAILED: "failed",
  CANCELED: "canceled",
});

/**
 * @param {object} item
 * @returns {object}
 */
export function markPending(item) {
  item.state = QueueState.PENDING;
  item.error = null;
  return item;
}

/**
 * @param {object} item
 * @returns {object}
 */
export function markActive(item) {
  item.state = QueueState.ACTIVE;
  item.error = null;
  return item;
}

/**
 * @param {object} item
 * @param {string} [_reason]
 * @returns {object}
 */
export function markPaused(item, _reason) {
  item.state = QueueState.PAUSED;
  return item;
}

/**
 * @param {object} item
 * @param {string} [error]
 * @returns {object}
 */
export function markFailed(item, error) {
  item.state = QueueState.FAILED;
  item.error = error || "Download failed";
  return item;
}

/**
 * @param {object} item
 * @returns {object}
 */
export function markCanceled(item) {
  item.state = QueueState.CANCELED;
  return item;
}

/**
 * Abort race: canceled if cancel already won, otherwise paused.
 * @param {object|null|undefined} item
 * @returns {'canceled'|'paused'}
 */
export function resolveAbortKind(item) {
  return item?.state === QueueState.CANCELED
    ? QueueState.CANCELED
    : QueueState.PAUSED;
}
