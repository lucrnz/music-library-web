/**
 * Connection cost hints via Network Information API.
 * Reachability (online/offline) stays in connectivity.js.
 */

/** @typedef {() => void} ConstraintListener */

/** @type {Set<ConstraintListener>} */
const listeners = new Set();
let bound = false;
/** @type {EventTarget | null} */
let connTarget = null;

/**
 * @returns {NetworkInformation | null}
 */
export function getConnection() {
  if (typeof navigator === "undefined") return null;
  const n = /** @type {Navigator & { connection?: NetworkInformation, mozConnection?: NetworkInformation, webkitConnection?: NetworkInformation }} */ (
    navigator
  );
  return n.connection || n.mozConnection || n.webkitConnection || null;
}

/**
 * True when the browser reports connection.type (e.g. Android Chrome).
 * Desktop Chromium often has connection without a usable type string.
 */
export function canDetectConnectionType() {
  const c = getConnection();
  return !!(c && typeof c.type === "string");
}

/**
 * Cellular (or Data Saver) when type detection works; otherwise unrestricted.
 */
export function isConstrainedConnection() {
  if (!canDetectConnectionType()) return false;
  const c = getConnection();
  if (!c) return false;
  if (c.type === "cellular") return true;
  if (c.saveData === true) return true;
  return false;
}

function emit() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  }
}

function ensureBound() {
  if (bound) return;
  bound = true;
  const c = getConnection();
  if (!c || typeof c.addEventListener !== "function") return;
  connTarget = c;
  c.addEventListener("change", emit);
}

/**
 * @param {ConstraintListener} fn
 * @returns {() => void}
 */
export function onConstraintChange(fn) {
  listeners.add(fn);
  ensureBound();
  return () => listeners.delete(fn);
}
