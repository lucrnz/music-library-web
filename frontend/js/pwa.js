import { emit } from "./diag/log.js";

/**
 * Service worker registration for shell-only PWA.
 * Registers only in a secure context; if MUSICWEB_PUBLIC_ORIGIN was injected
 * and differs from location.origin, skips registration to avoid split storage.
 * Idempotent: safe to call more than once.
 */

/** @type {Promise<ServiceWorkerRegistration | null> | null} */
let registrationPromise = null;

function readPublicOrigin() {
  const el = document.getElementById("musicweb-config");
  if (!el) return "";
  try {
    const data = JSON.parse(el.textContent || "{}");
    return typeof data.publicOrigin === "string" ? data.publicOrigin.trim() : "";
  } catch {
    return "";
  }
}

/**
 * @returns {Promise<ServiceWorkerRegistration | null>}
 */
export async function registerServiceWorker() {
  if (registrationPromise) return registrationPromise;
  registrationPromise = doRegister();
  return registrationPromise;
}

/**
 * @returns {Promise<ServiceWorkerRegistration | null>}
 */
async function doRegister() {
  if (import.meta.env.DEV) {
    emit("pwa.sw", { result: "skipped_vite_dev" }, "info");
    return null;
  }
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) {
    emit("pwa.sw", { result: "unsupported" }, "info");
    return null;
  }

  // Browsers only allow SW in secure contexts (https or localhost loopback).
  if (!window.isSecureContext) {
    console.info(
      "[pwa] Skipping service worker: not a secure context. " +
        "Open via https://… or http://localhost / http://127.0.0.1 " +
        "(see MUSICWEB_PUBLIC_ORIGIN / docs/development/environment.md)."
    );
    emit("pwa.sw", { result: "skipped_insecure" }, "info");
    return null;
  }

  const configured = readPublicOrigin();
  if (configured && configured !== window.location.origin) {
    console.info(
      `[pwa] Skipping service worker: page origin ${window.location.origin} ` +
        `≠ MUSICWEB_PUBLIC_ORIGIN ${configured}. Open the configured URL to install ` +
        `(host string must match exactly, e.g. localhost vs 127.0.0.1).`
    );
    emit("pwa.sw", { result: "skipped_origin" }, "info");
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
    // Quiet updates: check for a new worker when the tab becomes visible again.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        reg.update().catch(() => {});
      }
    });
    emit("pwa.sw", { result: "registered" }, "info");
    return reg;
  } catch (err) {
    console.warn("[pwa] Service worker registration failed:", err);
    emit(
      "pwa.sw",
      { result: "error", message: err && err.message ? err.message : String(err) },
      "error"
    );
    return null;
  }
}
