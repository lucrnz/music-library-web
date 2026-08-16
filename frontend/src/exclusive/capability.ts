/**
 * Exclusive UI is Mac installed PWA only (v1).
 */

type NavigatorWithExclusiveHints = Navigator & {
  userAgentData?: { platform?: string };
  standalone?: boolean;
};

function nav(): NavigatorWithExclusiveHints | null {
  if (typeof navigator === "undefined") return null;
  return navigator as NavigatorWithExclusiveHints;
}

export function isMacPlatform(): boolean {
  const n = nav();
  if (!n) return false;
  const ua = n.userAgent || "";
  const platform = n.platform || "";
  // navigator.userAgentData may be more accurate when present
  const uaData = n.userAgentData;
  if (uaData?.platform) {
    return /mac/i.test(uaData.platform);
  }
  return /Mac/i.test(platform) || /Macintosh|Mac OS X/i.test(ua);
}

/** Installed PWA: standalone or minimal-ui display mode. */
export function isInstalledPwa(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
  } catch {
    /* ignore */
  }
  // iOS legacy — not used for exclusive v1, but harmless
  const n = nav();
  if (n?.standalone === true) return true;
  return false;
}

/** Whether exclusive settings / companion UI may appear. */
export function canShowExclusiveUi(): boolean {
  return isMacPlatform() && isInstalledPwa();
}
