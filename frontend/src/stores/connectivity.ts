/**
 * Reactive mirror of platform connectivity (online / offline / server_down).
 * Non-Vue truth + probes live in connectivity.ts; this is the SPA surface.
 */
import { reactive } from "vue";
import {
  bindWindowConnectivity,
  canUseRemoteMedia,
  getConnectivityState,
  hasConfirmedReachability,
  onConnectivityChange,
  reportFailure,
  reportSuccess,
  type ConnectivityState,
} from "@/connectivity";

export type { ConnectivityState };

export interface ConnectivityStore {
  state: ConnectivityState;
  confirmed: boolean;
  canUseRemote: boolean;
}

export const connectivity = reactive<ConnectivityStore>({
  state: getConnectivityState(),
  confirmed: false,
  canUseRemote: false,
});

let bound = false;

function syncFromPlatform() {
  connectivity.state = getConnectivityState();
  connectivity.confirmed = hasConfirmedReachability();
  connectivity.canUseRemote = canUseRemoteMedia();
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

export function noteServerUnreachable(err?: unknown) {
  reportFailure(err);
  syncFromPlatform();
}

export function noteServerReachable() {
  reportSuccess();
  syncFromPlatform();
}
