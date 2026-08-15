import { emit } from "./diag/log.js";

/**
 * Platform network connectivity: online / offline / server_down.
 * Health probes, error classification, banner/toast copy.
 * No Vue imports — stores mirror state via onConnectivityChange.
 */

/** @typedef {'online'|'offline'|'server_down'} ConnectivityState */
/** @typedef {'offline'|'server_down'|'item_fail'|'abort'|'unknown'} ErrorClass */

const BACKOFF_START_MS = 1000;
const BACKOFF_CAP_MS = 60000;

/** @type {ConnectivityState} */
let state = "online";
let windowBound = false;
let healthTimer = null;
let healthInFlight = false;
let backoffMs = BACKOFF_START_MS;
let healthEnabled = false;
let healthQueueHasWork = false;
/**
 * Private: schedule/run a health probe without advertising server_down.
 * Not part of ConnectivityState; never emitted to listeners.
 * Cleared on success, real server_down, hard offline, or when health is disabled.
 */
let probeRequested = false;

/** @type {Set<(s: ConnectivityState, prev: ConnectivityState) => void>} */
const listeners = new Set();
/** @type {Set<() => void>} */
const recoveredListeners = new Set();

function browserOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * @param {ConnectivityState} next
 */
function setState(next) {
  if (state === next) return;
  const prev = state;
  state = next;
  emit("connectivity.state", { from: prev, to: state }, "info");
  for (const fn of listeners) {
    try {
      fn(state, prev);
    } catch (err) {
      console.error(err);
    }
  }
  if (prev !== "online" && next === "online") {
    for (const fn of recoveredListeners) {
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
    }
  }
  syncHealthLoop();
}

export function getConnectivityState() {
  return state;
}

export function isHardOffline() {
  return state === "offline" || browserOffline();
}

export function canReachServer() {
  return state === "online" && !browserOffline();
}

/**
 * Single copy table for banner / load error / toast labels.
 * One source string per meaning — getters only look up and gate.
 */
const MESSAGES = {
  offline: {
    toast: "Offline",
    banner: "You're offline. Enable Downloads in Settings to save music for offline use.",
    loadOn: "Offline — use the Downloads tab for saved music.",
  },
  server_down: {
    toast: "Can't reach server",
    banner: "Can't reach the library server.",
    loadOn: "Can't reach server — use the Downloads tab for saved music.",
  },
  online: {
    toastRecovered: "Back online",
  },
};

/**
 * Resolve effective connectivity for copy (hard browser offline wins).
 * @param {ConnectivityState} s
 * @returns {ConnectivityState}
 */
function effectiveConnectivityState(s) {
  if (browserOffline() || s === "offline") return "offline";
  return s;
}

/**
 * Persistent guidance banner when Downloads are off and the library is unreachable.
 * Empty when Downloads are enabled (intentional offline uses a toast instead).
 * Pure: pass reactive `(state, enabled)` so Vue tracks deps.
 * @param {ConnectivityState} s
 * @param {boolean} enabled
 */
export function connectivityBanner(s, enabled) {
  if (enabled) return "";
  const eff = effectiveConnectivityState(s);
  if (eff === "offline") return MESSAGES.offline.banner;
  if (eff === "server_down") return MESSAGES.server_down.banner;
  return "";
}

/**
 * Short copy for in-view load failures when the library is unreachable.
 * Pure: pass reactive `(state, enabled)` so Vue tracks deps.
 * @param {ConnectivityState} s
 * @param {boolean} enabled
 */
export function connectivityLoadError(s, enabled) {
  const eff = effectiveConnectivityState(s);
  if (eff === "offline") {
    return enabled ? MESSAGES.offline.loadOn : MESSAGES.offline.banner;
  }
  if (eff === "server_down") {
    return enabled ? MESSAGES.server_down.loadOn : MESSAGES.server_down.banner;
  }
  return "";
}

/**
 * Minimal toast label for a connectivity transition. Empty if none needed.
 * @param {ConnectivityState} next
 * @param {ConnectivityState} [prev]
 */
export function connectivityToastLabel(next, prev) {
  if (prev != null && prev === next) return "";
  if (next === "offline") return MESSAGES.offline.toast;
  if (next === "server_down") return MESSAGES.server_down.toast;
  if (next === "online" && prev != null && prev !== "online") {
    return MESSAGES.online.toastRecovered;
  }
  return "";
}

/**
 * @param {'offline'|'server'} [forQueue]
 * @returns {null | 'offline' | 'server'}
 */
export function autoPauseReason() {
  if (state === "offline" || browserOffline()) return "offline";
  if (state === "server_down") return "server";
  return null;
}

/**
 * @param {unknown} err
 * @param {number} [httpStatus]
 * @returns {ErrorClass}
 */
export function classifyError(err, httpStatus) {
  if (browserOffline() || state === "offline") return "offline";

  if (httpStatus === 429) return "server_down";
  if (httpStatus != null && httpStatus >= 500) return "server_down";
  if (httpStatus != null && httpStatus >= 400 && httpStatus < 500) {
    return "item_fail";
  }

  if (!err && httpStatus == null) return "unknown";

  const name = err && /** @type {Error} */ (err).name ? /** @type {Error} */ (err).name : "";
  const msg = err != null ? String(/** @type {Error} */ (err).message || err) : "";

  if (name === "AbortError" || name === "DownloadWriteAbortError") return "abort";
  if (name === "QuotaExceededError" || /quota/i.test(msg)) return "item_fail";
  if (name === "TypeError") return "server_down";
  if (/failed to fetch|networkerror|network error|load failed|network/i.test(msg)) {
    return "server_down";
  }
  if (/HTTP 5\d\d|HTTP 429/.test(msg)) return "server_down";
  if (/HTTP 4\d\d/.test(msg)) return "item_fail";

  return "unknown";
}

/**
 * @param {number} status
 */
export function isItemFailHttpStatus(status) {
  if (status === 429) return false;
  return status >= 400 && status < 500;
}

/**
 * @param {unknown} err
 * @param {number} [httpStatus]
 */
export function isNetworkClassError(err, httpStatus) {
  const c = classifyError(err, httpStatus);
  return c === "offline" || c === "server_down";
}

export function reportSuccess() {
  if (browserOffline()) {
    probeRequested = false;
    setState("offline");
    return;
  }
  backoffMs = BACKOFF_START_MS;
  probeRequested = false;
  setState("online");
}

/**
 * @param {unknown} [err]
 * @param {number} [httpStatus]
 */
export function reportFailure(err, httpStatus) {
  if (browserOffline()) {
    probeRequested = false;
    setState("offline");
    return;
  }
  const c = classifyError(err, httpStatus);
  if (c === "offline") {
    probeRequested = false;
    setState("offline");
    return;
  }
  if (c === "server_down") {
    // Real failure — public server_down drives further probing; drop private flag.
    probeRequested = false;
    setState("server_down");
    return;
  }
  // item_fail / abort / unknown app errors — do not flip global connectivity
}

/**
 * @param {(s: ConnectivityState, prev: ConnectivityState) => void} fn
 */
export function onConnectivityChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Fired when transitioning into online (after offline/server_down).
 * @param {() => void} fn
 */
export function onConnectivityRecovered(fn) {
  recoveredListeners.add(fn);
  return () => recoveredListeners.delete(fn);
}

/**
 * @param {{ enabled?: boolean, queueHasWork?: boolean }} ctx
 */
export function setHealthContext(ctx) {
  if (ctx.enabled != null) healthEnabled = !!ctx.enabled;
  if (ctx.queueHasWork != null) healthQueueHasWork = !!ctx.queueHasWork;
  syncHealthLoop();
}

function stopHealthLoop() {
  if (healthTimer) {
    clearTimeout(healthTimer);
    healthTimer = null;
  }
}

function scheduleHealthProbe(delayMs) {
  if (healthTimer) {
    clearTimeout(healthTimer);
    healthTimer = null;
  }
  healthTimer = setTimeout(() => {
    healthTimer = null;
    runHealthProbe().catch(console.error);
  }, Math.max(0, delayMs));
}

function needsHealthProbe() {
  if (!healthEnabled || !healthQueueHasWork) return false;
  if (browserOffline() || state === "offline") return false;
  // Probe on real server_down, or while a recovery/confirmation probe was requested
  // without flipping public state to server_down.
  return state === "server_down" || probeRequested;
}

function syncHealthLoop() {
  if (!healthEnabled || !healthQueueHasWork) {
    probeRequested = false;
    stopHealthLoop();
    return;
  }
  if (browserOffline() || state === "offline") {
    stopHealthLoop();
    return;
  }
  if (!needsHealthProbe()) {
    stopHealthLoop();
    return;
  }
  // server_down or probeRequested — ensure a probe is scheduled
  if (!healthTimer && !healthInFlight) {
    scheduleHealthProbe(backoffMs);
  }
}

async function runHealthProbe() {
  if (healthInFlight) return;
  if (!healthEnabled || !healthQueueHasWork) {
    probeRequested = false;
    stopHealthLoop();
    return;
  }
  if (browserOffline()) {
    probeRequested = false;
    setState("offline");
    return;
  }

  healthInFlight = true;
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (!res.ok) throw new Error(`health ${res.status}`);
    const data = await res.json().catch(() => ({}));
    if (data && data.ok === false) throw new Error("health not ok");
    backoffMs = BACKOFF_START_MS;
    reportSuccess();
  } catch (err) {
    reportFailure(err);
    backoffMs = Math.min(
      BACKOFF_CAP_MS,
      Math.max(BACKOFF_START_MS, backoffMs * 2)
    );
    if (healthEnabled && healthQueueHasWork && !browserOffline()) {
      scheduleHealthProbe(backoffMs);
    }
  } finally {
    healthInFlight = false;
  }
}

/**
 * Request a health probe without flipping public state for bookkeeping.
 * server_down is set only if the probe (or other reportFailure) proves the server is down.
 * @param {number} [delayMs]
 */
export function requestHealthProbe(delayMs = 0) {
  if (!healthEnabled || !healthQueueHasWork) return;
  if (browserOffline()) {
    probeRequested = false;
    setState("offline");
    return;
  }
  probeRequested = true;
  scheduleHealthProbe(delayMs);
}

export function bindWindowConnectivity() {
  if (windowBound || typeof window === "undefined") return;
  windowBound = true;
  window.addEventListener("offline", () => {
    probeRequested = false;
    setState("offline");
  });
  window.addEventListener("online", () => {
    // Optimistic online — do not advertise server_down just to start a probe.
    // If the server is still down, the probe (or the next request) sets server_down.
    setState("online");
    if (healthEnabled && healthQueueHasWork) {
      probeRequested = true;
      scheduleHealthProbe(0);
    }
  });
  if (browserOffline()) {
    state = "offline";
  }
}
