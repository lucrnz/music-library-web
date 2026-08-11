/**
 * Reactive mirror of platform connectivity (online / offline / server_down).
 * Non-Vue truth + probes live in connectivity.js; this is the SPA surface.
 */
import { reactive } from "vue";
import {
  bindWindowConnectivity,
  getConnectivityState,
  onConnectivityChange,
  reportFailure,
  reportSuccess,
} from "../connectivity.js";

/** @typedef {'online'|'offline'|'server_down'} ConnectivityState */

export const connectivity = reactive({
  /** @type {ConnectivityState} */
  state: /** @type {ConnectivityState} */ (getConnectivityState()),
});

let bound = false;

function syncFromPlatform() {
  connectivity.state = getConnectivityState();
}

/**
 * Bind window + connectivity listeners once. Call from app boot before downloads.
 */
export function bindConnectivityStore() {
  if (bound || typeof window === "undefined") return;
  bound = true;
  bindWindowConnectivity();
  onConnectivityChange(() => {
    syncFromPlatform();
  });
  syncFromPlatform();
}

export function getState() {
  return connectivity.state;
}

/** @param {unknown} [err] */
export function noteServerUnreachable(err) {
  reportFailure(err);
  syncFromPlatform();
}

export function noteServerReachable() {
  reportSuccess();
  syncFromPlatform();
}
