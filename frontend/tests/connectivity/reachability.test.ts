import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/diag/log", () => ({
  emit: () => {},
}));

import {
  canReachServer,
  canUseRemoteMedia,
  getConnectivityState,
  hasConfirmedReachability,
  reportSuccess,
  resetConnectivityForTests,
} from "@/connectivity";

describe("reachability", () => {
  afterEach(() => {
    resetConnectivityForTests();
    vi.unstubAllGlobals();
  });

  it("reportSuccess confirms even when navigator.onLine is false", () => {
    resetConnectivityForTests();
    expect(hasConfirmedReachability()).toBe(false);
    expect(canUseRemoteMedia()).toBe(false);
    vi.stubGlobal("navigator", { onLine: false });
    reportSuccess();
    expect(getConnectivityState()).toBe("online");
    expect(canReachServer()).toBe(true);
    expect(hasConfirmedReachability()).toBe(true);
    expect(canUseRemoteMedia()).toBe(true);
  });

  it("reportSuccess is the confirm path after reset", () => {
    resetConnectivityForTests();
    vi.stubGlobal("navigator", { onLine: true });
    expect(canReachServer()).toBe(true);
    expect(canUseRemoteMedia()).toBe(false);
    reportSuccess();
    expect(canUseRemoteMedia()).toBe(true);
  });
});
