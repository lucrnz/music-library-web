/**
 * Shared body scroll lock for stacked modals (settings, downloads manager, dialog).
 * Each surface acquires a stable token on open and releases it on close.
 * body.modal-open is set iff at least one token is held.
 */

/** @type {Set<string>} */
const locks = new Set();

/** @param {string} id */
export function acquireModalLock(id) {
  const key = String(id || "").trim();
  if (!key) return;
  locks.add(key);
  document.body.classList.add("modal-open");
}

/** @param {string} id */
export function releaseModalLock(id) {
  const key = String(id || "").trim();
  if (!key) return;
  locks.delete(key);
  if (!locks.size) {
    document.body.classList.remove("modal-open");
  }
}
