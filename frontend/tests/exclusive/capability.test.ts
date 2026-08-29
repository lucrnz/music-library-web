import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canShowCdUi,
  canShowExclusiveUi,
  canUseCompanionDownloads,
  isDesktopPlatform,
} from "@/exclusive/capability";

type HintNav = Navigator & {
  userAgentData?: { platform?: string };
  standalone?: boolean;
};

function stubNav(opts: {
  platform?: string;
  userAgent?: string;
  uaDataPlatform?: string | null;
  standalone?: boolean;
  displayMode?: "browser" | "standalone" | "minimal-ui";
}) {
  const next: Partial<HintNav> = {
    platform: opts.platform ?? "",
    userAgent: opts.userAgent ?? "",
    standalone: opts.standalone,
  };
  if (opts.uaDataPlatform !== null) {
    next.userAgentData =
      opts.uaDataPlatform != null
        ? { platform: opts.uaDataPlatform }
        : undefined;
  }
  vi.stubGlobal("navigator", next);
  vi.stubGlobal("window", {
    matchMedia: (q: string) => ({
      matches:
        (opts.displayMode === "standalone" &&
          q.includes("display-mode: standalone")) ||
        (opts.displayMode === "minimal-ui" &&
          q.includes("display-mode: minimal-ui")),
    }),
  });
}

describe("companion capability", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Mac + standalone: exclusive and companion", () => {
    stubNav({ uaDataPlatform: "macOS", displayMode: "standalone" });
    expect(canShowExclusiveUi()).toBe(true);
    expect(canShowCdUi()).toBe(true);
    expect(canUseCompanionDownloads()).toBe(true);
  });

  it("Windows + standalone: companion only", () => {
    stubNav({ uaDataPlatform: "Windows", displayMode: "standalone" });
    expect(canShowExclusiveUi()).toBe(false);
    expect(canShowCdUi()).toBe(false);
    expect(canUseCompanionDownloads()).toBe(true);
    expect(isDesktopPlatform()).toBe(true);
  });

  it("Android + standalone: neither", () => {
    stubNav({
      uaDataPlatform: "Android",
      userAgent: "Mozilla/5.0 (Linux; Android 14)",
      displayMode: "standalone",
    });
    expect(canShowExclusiveUi()).toBe(false);
    expect(canUseCompanionDownloads()).toBe(false);
    expect(isDesktopPlatform()).toBe(false);
  });

  it("Mac tab is not companion downloads", () => {
    stubNav({ uaDataPlatform: "macOS", displayMode: "browser" });
    expect(canShowExclusiveUi()).toBe(false);
    expect(canShowCdUi()).toBe(false);
    expect(canUseCompanionDownloads()).toBe(false);
  });

  it("Linux UA with Android is not desktop", () => {
    stubNav({
      uaDataPlatform: null,
      platform: "Linux armv8l",
      userAgent: "Mozilla/5.0 (Linux; Android 13)",
      displayMode: "standalone",
    });
    expect(isDesktopPlatform()).toBe(false);
    expect(canUseCompanionDownloads()).toBe(false);
  });

  it("Linux + standalone: companion, not exclusive", () => {
    stubNav({ uaDataPlatform: "Linux", displayMode: "standalone" });
    expect(canShowExclusiveUi()).toBe(false);
    expect(canUseCompanionDownloads()).toBe(true);
  });
});
