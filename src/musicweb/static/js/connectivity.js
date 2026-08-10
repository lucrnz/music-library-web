/**
 * Platform network connectivity: online / offline / server_down.
 * Health probes, error classification, and banner copy.
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
/** @type {boolean} */
let downloadsEnabledForNotes = false;

/** @type {Set<(s: ConnectivityState) => void>} */
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
  for (const fn of listeners) {
    try {
      fn(state);
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
 * @param {boolean} enabled
 */
export function setDownloadsEnabledForNotes(enabled) {
  downloadsEnabledForNotes = !!enabled;
}

/**
 * Banner copy for UI.
 * @param {boolean} [enabled]
 */
export function connectivityNote(enabled = downloadsEnabledForNotes) {
  if (state === "offline" || browserOffline()) {
    return enabled
      ? "You're offline. Use the Downloads tab to browse and play saved music."
      : "You're offline. Enable Downloads in Settings to save music for offline use.";
  }
  if (state === "server_down") {
    return enabled
      ? "Can't reach the library server. Use the Downloads tab for saved music."
      : "Can't reach the library server.";
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
    setState("offline");
    return;
  }
  backoffMs = BACKOFF_START_MS;
  setState("online");
}

/**
 * @param {unknown} [err]
 * @param {number} [httpStatus]
 */
export function reportFailure(err, httpStatus) {
  if (browserOffline()) {
    setState("offline");
    return;
  }
  const c = classifyError(err, httpStatus);
  if (c === "offline") {
    setState("offline");
    return;
  }
  if (c === "server_down") {
    setState("server_down");
    return;
  }
  // item_fail / abort / unknown app errors — do not flip global connectivity
}

/**
 * @param {(s: ConnectivityState) => void} fn
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
  // Probe while server_down, or when online but we want confirmation after work exists
  // Only probe when not confidently online OR recovering
  return state === "server_down" || state !== "online";
}

function syncHealthLoop() {
  if (!healthEnabled || !healthQueueHasWork) {
    stopHealthLoop();
    return;
  }
  if (browserOffline() || state === "offline") {
    stopHealthLoop();
    return;
  }
  if (state === "online") {
    stopHealthLoop();
    return;
  }
  // server_down — ensure a probe is scheduled
  if (!healthTimer && !healthInFlight) {
    scheduleHealthProbe(backoffMs);
  }
}

async function runHealthProbe() {
  if (healthInFlight) return;
  if (!healthEnabled || !healthQueueHasWork) {
    stopHealthLoop();
    return;
  }
  if (browserOffline()) {
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

/** Request an immediate health probe (e.g. after going online with queue work). */
export function requestHealthProbe(delayMs = 0) {
  if (!healthEnabled || !healthQueueHasWork) return;
  if (browserOffline()) {
    setState("offline");
    return;
  }
  if (state === "online") {
    // Still verify when asked after recovery
    setState("server_down");
  }
  scheduleHealthProbe(delayMs);
}

export function bindWindowConnectivity() {
  if (windowBound || typeof window === "undefined") return;
  windowBound = true;
  window.addEventListener("offline", () => {
    setState("offline");
  });
  window.addEventListener("online", () => {
    // Do not assume server is up — leave server_down or set online then probe
    if (healthEnabled && healthQueueHasWork) {
      setState("server_down");
      scheduleHealthProbe(0);
    } else {
      // No queue work: optimistic online; browse will reportFailure if wrong
      setState("online");
    }
  });
  if (browserOffline()) {
    state = "offline";
  }
}
