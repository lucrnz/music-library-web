import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRejoinClock,
  nextRejoinDelay,
  RADIO_REJOIN_CAP_MS,
  RADIO_REJOIN_INITIAL_MS,
} from "@/radio/rejoin";

describe("radio rejoin clock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("doubles delay from 1s up to 8s", () => {
    expect(nextRejoinDelay(null)).toBe(RADIO_REJOIN_INITIAL_MS);
    expect(nextRejoinDelay(1000)).toBe(2000);
    expect(nextRejoinDelay(2000)).toBe(4000);
    expect(nextRejoinDelay(4000)).toBe(RADIO_REJOIN_CAP_MS);
    expect(nextRejoinDelay(8000)).toBe(RADIO_REJOIN_CAP_MS);
  });

  it("coalesces two schedule calls into one timer", async () => {
    vi.useFakeTimers();
    const attempt = vi.fn(async () => {});
    const clock = createRejoinClock(attempt);
    clock.schedule();
    clock.schedule();
    expect(attempt).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("kick runs immediately and resets backoff", async () => {
    vi.useFakeTimers();
    const attempt = vi.fn(async () => {});
    const clock = createRejoinClock(attempt);
    clock.kick();
    await Promise.resolve();
    expect(attempt).toHaveBeenCalledTimes(1);
    clock.schedule();
    await vi.advanceTimersByTimeAsync(999);
    expect(attempt).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("cancel prevents a pending schedule from running", async () => {
    vi.useFakeTimers();
    const attempt = vi.fn(async () => {});
    const clock = createRejoinClock(attempt);
    clock.schedule();
    clock.cancel();
    await vi.advanceTimersByTimeAsync(8000);
    expect(attempt).not.toHaveBeenCalled();
  });

  it("does not start a second attempt when kick is already in flight", async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const attempt = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const clock = createRejoinClock(attempt);
    clock.kick();
    await Promise.resolve();
    clock.kick();
    await Promise.resolve();
    expect(attempt).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.resolve();
  });

  it("schedule during an attempt arms one timer after it finishes", async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const attempt = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const clock = createRejoinClock(attempt);
    clock.kick();
    await Promise.resolve();
    clock.schedule();
    clock.schedule();
    release?.();
    await Promise.resolve();
    expect(attempt).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});
