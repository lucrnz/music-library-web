import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/diag/log", () => ({ emit: () => {} }));

import {
  hasHealthWork,
  requestHealthProbe,
  resetConnectivityForTests,
  setHealthWork,
} from "@/connectivity";

describe("setHealthWork OR", () => {
  beforeEach(() => {
    resetConnectivityForTests();
    setHealthWork("downloads", false);
    setHealthWork("artist-art", false);
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true }),
        }),
      ),
    );
    vi.stubGlobal("navigator", { onLine: true });
  });

  afterEach(() => {
    resetConnectivityForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps artist-art work when downloads health is cleared", () => {
    setHealthWork("artist-art", true);
    setHealthWork("downloads", false);
    expect(hasHealthWork()).toBe(true);
  });

  it("requestHealthProbe schedules when only artist-art has work", async () => {
    setHealthWork("artist-art", true);
    setHealthWork("downloads", false);
    requestHealthProbe(0);
    await vi.runAllTimersAsync();
    expect(fetch).toHaveBeenCalled();
  });

  it("requestHealthProbe hits /api/health with both health sources false", async () => {
    setHealthWork("downloads", false);
    setHealthWork("artist-art", false);
    expect(hasHealthWork()).toBe(false);
    requestHealthProbe(0);
    await vi.runAllTimersAsync();
    expect(fetch).toHaveBeenCalledWith("/api/health", { cache: "no-store" });
  });
});
