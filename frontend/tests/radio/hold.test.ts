import { afterEach, describe, expect, it, vi } from "vitest";
import { createJoinHold, RADIO_JOIN_HOLD_MS } from "@/radio/hold";

describe("radio join hold", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("start makes pending true until the hold elapses", async () => {
    vi.useFakeTimers();
    const hold = createJoinHold();
    expect(hold.pending).toBe(false);
    hold.start();
    expect(hold.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(RADIO_JOIN_HOLD_MS - 1);
    expect(hold.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(hold.pending).toBe(false);
  });

  it("cancel after start leaves pending false and does not revive", async () => {
    vi.useFakeTimers();
    const hold = createJoinHold();
    hold.start();
    hold.cancel();
    expect(hold.pending).toBe(false);
    await vi.advanceTimersByTimeAsync(RADIO_JOIN_HOLD_MS);
    expect(hold.pending).toBe(false);
  });

  it("a second start resets the 8s window", async () => {
    vi.useFakeTimers();
    const hold = createJoinHold();
    hold.start();
    await vi.advanceTimersByTimeAsync(3000);
    hold.start();
    expect(hold.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(RADIO_JOIN_HOLD_MS - 1);
    expect(hold.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(hold.pending).toBe(false);
  });

  it("cancel on a fresh clock does not throw", () => {
    const hold = createJoinHold();
    expect(() => hold.cancel()).not.toThrow();
    expect(hold.pending).toBe(false);
  });
});
