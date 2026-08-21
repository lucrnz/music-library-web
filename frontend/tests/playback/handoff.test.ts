import { describe, expect, it, vi } from "vitest";
import {
  claimOnDemand,
  setOnDemandClaimHook,
} from "@/playback/onDemandControl";

describe("session handoff", () => {
  it("claimOnDemand runs the radio-exit hook", () => {
    const hook = vi.fn();
    setOnDemandClaimHook(hook);
    claimOnDemand();
    expect(hook).toHaveBeenCalledOnce();
    setOnDemandClaimHook(null);
  });
});
