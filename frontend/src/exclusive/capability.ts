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

function platformHint(): { ua: string; platform: string; uaData?: string } {
  const n = nav();
  if (!n) return { ua: "", platform: "" };
  return {
    ua: n.userAgent || "",
    platform: n.platform || "",
    uaData: n.userAgentData?.platform,
  };
}

export function isMacPlatform(): boolean {
  const { ua, platform, uaData } = platformHint();
  if (uaData) return /mac/i.test(uaData);
  return /Mac/i.test(platform) || /Macintosh|Mac OS X/i.test(ua);
}

export function isWindowsPlatform(): boolean {
  const { ua, platform, uaData } = platformHint();
  if (uaData) return /win/i.test(uaData);
  return /Win/i.test(platform) || /Windows/i.test(ua);
}

export function isLinuxPlatform(): boolean {
  const { ua, platform, uaData } = platformHint();
  if (/android/i.test(uaData || "") || /android/i.test(ua)) return false;
  if (uaData) return /linux/i.test(uaData);
  return /Linux/i.test(platform) || /Linux/i.test(ua);
}

export function isDesktopPlatform(): boolean {
  return isMacPlatform() || isWindowsPlatform() || isLinuxPlatform();
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

/** Whether exclusive settings / hog UI may appear. */
export function canShowExclusiveUi(): boolean {
  return isMacPlatform() && isInstalledPwa();
}

/** Installed desktop PWA may use companion-disk Downloads. */
export function canUseCompanionDownloads(): boolean {
  return isDesktopPlatform() && isInstalledPwa();
}
