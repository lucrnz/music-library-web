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

function stubUnlock(devUnlockPwa: boolean, hostname: string) {
  vi.stubGlobal("location", { hostname });
  vi.stubGlobal("document", {
    getElementById: (id: string) =>
      id === "musicweb-config"
        ? {
            textContent: JSON.stringify({
              publicOrigin: "",
              devUnlockPwa,
            }),
          }
        : null,
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

  it("Windows + standalone: exclusive, not CD", () => {
    stubNav({ uaDataPlatform: "Windows", displayMode: "standalone" });
    expect(canShowExclusiveUi()).toBe(true);
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

  it("Windows tab + unlock + loopback: exclusive, not CD", () => {
    stubNav({ uaDataPlatform: "Windows", displayMode: "browser" });
    stubUnlock(true, "127.0.0.1");
    expect(canShowExclusiveUi()).toBe(true);
    expect(canShowCdUi()).toBe(false);
    expect(canUseCompanionDownloads()).toBe(true);
  });

  it("Windows tab + unlock + LAN host stays gated", () => {
    stubNav({ uaDataPlatform: "Windows", displayMode: "browser" });
    stubUnlock(true, "192.168.1.10");
    expect(canShowExclusiveUi()).toBe(false);
    expect(canShowCdUi()).toBe(false);
  });

  it("Mac tab + unlock + loopback: exclusive and CD", () => {
    stubNav({ uaDataPlatform: "macOS", displayMode: "browser" });
    stubUnlock(true, "localhost");
    expect(canShowExclusiveUi()).toBe(true);
    expect(canShowCdUi()).toBe(true);
  });
});
