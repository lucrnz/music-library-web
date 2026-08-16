/**
 * Connection cost hints via Network Information API.
 * Reachability (online/offline) stays in connectivity.ts.
 */

export type ConstraintListener = () => void;

/** Subset of the Network Information API used for cellular / Data Saver hints. */
export interface NetworkInformation extends EventTarget {
  readonly type?: string;
  readonly saveData?: boolean;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
  mozConnection?: NetworkInformation;
  webkitConnection?: NetworkInformation;
}

const listeners = new Set<ConstraintListener>();
let bound = false;
let connTarget: EventTarget | null = null;

export function getConnection(): NetworkInformation | null {
  if (typeof navigator === "undefined") return null;
  const n = navigator as NavigatorWithConnection;
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
    } catch (err: unknown) {
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

export function onConstraintChange(fn: ConstraintListener): () => void {
  listeners.add(fn);
  ensureBound();
  return () => listeners.delete(fn);
}
