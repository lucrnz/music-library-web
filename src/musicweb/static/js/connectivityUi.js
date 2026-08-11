/**
 * Shell binder: connectivity transitions → muted toasts.
 * Owned by app boot, not the downloads package.
 */
import {
  connectivityToastLabel,
  onConnectivityChange,
} from "./connectivity.js";
import { showToast } from "./stores/ui.js";

let bound = false;

/**
 * Subscribe once to connectivity changes and show transition toasts.
 * Idempotent — safe if called twice.
 * Cold start stays quiet (subscription only fires on later transitions).
 */
export function bindConnectivityToasts() {
  if (bound || typeof window === "undefined") return;
  bound = true;
  onConnectivityChange((next, prev) => {
    const label = connectivityToastLabel(next, prev);
    if (label) showToast(label);
  });
}
