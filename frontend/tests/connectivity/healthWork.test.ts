import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/diag/log", () => ({ emit: () => {} }));

import {
  hasHealthWork,
  requestHealthProbe,
  setHealthWork,
} from "@/connectivity";

describe("setHealthWork OR", () => {
  beforeEach(() => {
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
    setHealthWork("downloads", false);
    setHealthWork("artist-art", false);
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
});
