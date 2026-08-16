/**
 * Exclusive UI is Mac installed PWA only (v1).
 */

/**
 * @returns {boolean}
 */
export function isMacPlatform() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  // navigator.userAgentData may be more accurate when present
  const uaData = /** @type {{ platform?: string } | undefined} */ (
    navigator.userAgentData
  );
  if (uaData?.platform) {
    return /mac/i.test(uaData.platform);
  }
  return /Mac/i.test(platform) || /Macintosh|Mac OS X/i.test(ua);
}

/**
 * Installed PWA: standalone or minimal-ui display mode.
 * @returns {boolean}
 */
export function isInstalledPwa() {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
  } catch {
    /* ignore */
  }
  // iOS legacy — not used for exclusive v1, but harmless
  const nav = /** @type {Navigator & { standalone?: boolean }} */ (navigator);
  if (nav.standalone === true) return true;
  return false;
}

/**
 * Whether exclusive settings / companion UI may appear.
 * @returns {boolean}
 */
export function canShowExclusiveUi() {
  return isMacPlatform() && isInstalledPwa();
}
