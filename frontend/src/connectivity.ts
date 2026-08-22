import { emit } from "@/diag/log";

/**
 * Platform network connectivity: online / offline / server_down.
 * Health probes, error classification, banner/toast copy.
 * No Vue imports — stores mirror state via onConnectivityChange.
 */

export type ConnectivityState = "online" | "offline" | "server_down";
export type ErrorClass = "offline" | "server_down" | "item_fail" | "abort" | "unknown";
export type AutoPauseReason = "offline" | "server";

const BACKOFF_START_MS = 1000;
const BACKOFF_CAP_MS = 60000;

let state: ConnectivityState = "online";
let windowBound = false;
let healthTimer: ReturnType<typeof setTimeout> | null = null;
let healthInFlight = false;
let backoffMs = BACKOFF_START_MS;
export type HealthWorkSource = "downloads" | "artist-art";

const healthWork: Record<HealthWorkSource, boolean> = {
  downloads: false,
  "artist-art": false,
};
/**
 * Private: schedule/run a health probe without advertising server_down.
 * Not part of ConnectivityState; never emitted to listeners.
 * Cleared on success, real server_down, hard offline, or when health is disabled.
 */
let probeRequested = false;
/** True after reportSuccess() treated the server as up this page lifetime. */
let reachabilityConfirmed = false;

const listeners = new Set<
  (s: ConnectivityState, prev: ConnectivityState) => void
>();
const recoveredListeners = new Set<() => void>();

function browserOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function errorName(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name?: unknown }).name;
    return name ? String(name) : "";
  }
  return "";
}

function errorMessage(err: unknown): string {
  if (err == null) return "";
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    return String(message || err);
  }
  return String(err);
}

/**
 * Snapshot changed (state and/or confirmed). from/to may be equal.
 */
function notify(prevState: ConnectivityState) {
  emit("connectivity.state", { from: prevState, to: state }, "info");
  for (const fn of listeners) {
    try {
      fn(state, prevState);
    } catch (err: unknown) {
      console.error(err);
    }
  }
}

/** @returns whether the enum changed */
function setState(next: ConnectivityState): boolean {
  if (state === next) return false;
  const prev = state;
  state = next;
  notify(prev);
  if (prev !== "online" && next === "online") {
    for (const fn of recoveredListeners) {
      try {
        fn();
      } catch (err: unknown) {
        console.error(err);
      }
    }
  }
  syncHealthLoop();
  return true;
}

export function getConnectivityState(): ConnectivityState {
  return state;
}

export function isHardOffline() {
  return state === "offline" || browserOffline();
}

export function canReachServer() {
  return state === "online" && !browserOffline();
}

export function hasConfirmedReachability() {
  return reachabilityConfirmed;
}

/** Play/queue-offline gate: reachable and this page has confirmed the origin. */
export function canUseRemoteMedia() {
  return canReachServer() && reachabilityConfirmed;
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

/** Resolve effective connectivity for copy (hard browser offline wins). */
function effectiveConnectivityState(s: ConnectivityState): ConnectivityState {
  if (browserOffline() || s === "offline") return "offline";
  return s;
}

/**
 * Persistent guidance banner when Downloads are off and the library is unreachable.
 * Empty when Downloads are enabled (intentional offline uses a toast instead).
 * Pure: pass reactive `(state, enabled)` so Vue tracks deps.
 */
export function connectivityBanner(s: ConnectivityState, enabled: boolean) {
  if (enabled) return "";
  const eff = effectiveConnectivityState(s);
  if (eff === "offline") return MESSAGES.offline.banner;
  if (eff === "server_down") return MESSAGES.server_down.banner;
  return "";
}

/**
 * Short copy for in-view load failures when the library is unreachable.
 * Pure: pass reactive `(state, enabled)` so Vue tracks deps.
 */
export function connectivityLoadError(s: ConnectivityState, enabled: boolean) {
  const eff = effectiveConnectivityState(s);
  if (eff === "offline") {
    return enabled ? MESSAGES.offline.loadOn : MESSAGES.offline.banner;
  }
  if (eff === "server_down") {
    return enabled ? MESSAGES.server_down.loadOn : MESSAGES.server_down.banner;
  }
  return "";
}

/** Minimal toast label for a connectivity transition. Empty if none needed. */
export function connectivityToastLabel(
  next: ConnectivityState,
  prev?: ConnectivityState,
) {
  if (prev != null && prev === next) return "";
  if (next === "offline") return MESSAGES.offline.toast;
  if (next === "server_down") return MESSAGES.server_down.toast;
  if (next === "online" && prev != null && prev !== "online") {
    return MESSAGES.online.toastRecovered;
  }
  return "";
}

export function autoPauseReason(): AutoPauseReason | null {
  if (state === "offline" || browserOffline()) return "offline";
  if (state === "server_down") return "server";
  return null;
}

export function classifyError(err: unknown, httpStatus?: number): ErrorClass {
  if (browserOffline() || state === "offline") return "offline";

  if (httpStatus === 429) return "server_down";
  if (httpStatus != null && httpStatus >= 500) return "server_down";
  if (httpStatus != null && httpStatus >= 400 && httpStatus < 500) {
    return "item_fail";
  }

  if (!err && httpStatus == null) return "unknown";

  const name = errorName(err);
  const msg = errorMessage(err);

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

export function isItemFailHttpStatus(status: number) {
  if (status === 429) return false;
  return status >= 400 && status < 500;
}

export function isNetworkClassError(err: unknown, httpStatus?: number) {
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
  const wasConfirmed = reachabilityConfirmed;
  reachabilityConfirmed = true;
  const prev = state;
  const enumChanged = setState("online");
  if (!wasConfirmed && !enumChanged) {
    notify(prev);
  }
}

export function reportFailure(err?: unknown, httpStatus?: number) {
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

export function onConnectivityChange(
  fn: (s: ConnectivityState, prev: ConnectivityState) => void,
) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Fired when transitioning into online (after offline/server_down). */
export function onConnectivityRecovered(fn: () => void) {
  recoveredListeners.add(fn);
  return () => recoveredListeners.delete(fn);
}

export function hasHealthWork(): boolean {
  return healthWork.downloads || healthWork["artist-art"];
}

export function setHealthWork(source: HealthWorkSource, hasWork: boolean) {
  healthWork[source] = !!hasWork;
  syncHealthLoop();
}

function stopHealthLoop() {
  if (healthTimer) {
    clearTimeout(healthTimer);
    healthTimer = null;
  }
}

function scheduleHealthProbe(delayMs: number) {
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
  if (!hasHealthWork()) return false;
  if (browserOffline() || state === "offline") return false;
  // Probe on real server_down, or while a recovery/confirmation probe was requested
  // without flipping public state to server_down.
  return state === "server_down" || probeRequested;
}

function syncHealthLoop() {
  if (!hasHealthWork()) {
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
  if (!hasHealthWork()) {
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
    const data: unknown = await res.json().catch(() => ({}));
    const ok =
      data && typeof data === "object" && "ok" in data
        ? (data as { ok?: unknown }).ok
        : undefined;
    if (ok === false) throw new Error("health not ok");
    backoffMs = BACKOFF_START_MS;
    reportSuccess();
  } catch (err: unknown) {
    reportFailure(err);
    backoffMs = Math.min(
      BACKOFF_CAP_MS,
      Math.max(BACKOFF_START_MS, backoffMs * 2)
    );
    if (hasHealthWork() && !browserOffline()) {
      scheduleHealthProbe(backoffMs);
    }
  } finally {
    healthInFlight = false;
  }
}

/**
 * Request a health probe without flipping public state for bookkeeping.
 * server_down is set only if the probe (or other reportFailure) proves the server is down.
 */
export function requestHealthProbe(delayMs = 0) {
  if (!hasHealthWork()) return;
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
    if (hasHealthWork()) {
      probeRequested = true;
      scheduleHealthProbe(0);
    }
  });
  if (browserOffline()) {
    state = "offline";
  }
}
