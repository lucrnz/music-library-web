import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/diag/log", () => ({
  emit: () => {},
}));

import {
  classifyError,
  connectivityBanner,
  connectivityLoadError,
  getConnectivityState,
  isItemFailHttpStatus,
  reportFailure,
  resetConnectivityForTests,
} from "@/connectivity";

describe("classifyError", () => {
  afterEach(() => {
    delete (globalThis as { navigator?: unknown }).navigator;
  });

  it("classifies http and abort", () => {
    expect(classifyError(null, 404)).toBe("item_fail");
    expect(classifyError(null, 500)).toBe("server_down");
    expect(classifyError(null, 429)).toBe("server_down");
    expect(classifyError({ name: "AbortError" })).toBe("abort");
    expect(isItemFailHttpStatus(404)).toBe(true);
    expect(isItemFailHttpStatus(429)).toBe(false);
  });

  it("does not classify from navigator.onLine; reportFailure picks the copy", () => {
    resetConnectivityForTests();
    (globalThis as { navigator: { onLine: boolean } }).navigator = {
      onLine: false,
    };
    expect(classifyError(new TypeError("Failed to fetch"))).toBe("server_down");
    reportFailure(new TypeError("Failed to fetch"));
    expect(getConnectivityState()).toBe("offline");
    resetConnectivityForTests();
  });
});

describe("connectivity copy", () => {
  it("returns banner and load-error strings", () => {
    expect(connectivityBanner("offline", false)).toMatch(/offline/i);
    expect(connectivityBanner("server_down", false)).toMatch(/server/i);
    expect(connectivityBanner("online", false)).toBe("");
    expect(connectivityLoadError("offline", false)).toMatch(/offline/i);
    expect(connectivityLoadError("server_down", true)).toMatch(/server/i);
    expect(connectivityLoadError("online", false)).toBe("");
  });
});
