import { afterEach, describe, expect, it, vi } from "vitest";
import { JOIN_HOLD_MS } from "@/playback/joinHold";
import {
  createQueueJoin,
  isHardJoinBlock,
  isNaturalEnded,
} from "@/playback/queueJoin";

describe("queueJoin", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("onPlaySucceeded then unintentional fail before JOIN_HOLD_MS calls attempt at 1s, then 2s, 4s, 8s", async () => {
    vi.useFakeTimers();
    const attempt = vi.fn(async () => {});
    const join = createQueueJoin(attempt);
    join.onPlaySucceeded();
    join.onFailedJoin();
    expect(attempt).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(attempt).toHaveBeenCalledTimes(1);
    join.onFailedJoin();
    await vi.advanceTimersByTimeAsync(2000);
    expect(attempt).toHaveBeenCalledTimes(2);
    join.onFailedJoin();
    await vi.advanceTimersByTimeAsync(4000);
    expect(attempt).toHaveBeenCalledTimes(3);
    join.onFailedJoin();
    await vi.advanceTimersByTimeAsync(8000);
    expect(attempt).toHaveBeenCalledTimes(4);
  });

  it("markUserPause + onIntentionalPause during hold does not call attempt", async () => {
    vi.useFakeTimers();
    const attempt = vi.fn(async () => {});
    const join = createQueueJoin(attempt);
    join.onPlaySucceeded();
    expect(join.holdPending).toBe(true);
    join.markUserPause();
    join.onIntentionalPause();
    expect(join.holdPending).toBe(false);
    expect(join.rejoinActive).toBe(false);
    await vi.advanceTimersByTimeAsync(JOIN_HOLD_MS);
    expect(attempt).not.toHaveBeenCalled();
  });

  it("onPlaySucceeded + wait JOIN_HOLD_MS + later fail does not call attempt", async () => {
    vi.useFakeTimers();
    const attempt = vi.fn(async () => {});
    const join = createQueueJoin(attempt);
    join.onPlaySucceeded();
    await vi.advanceTimersByTimeAsync(JOIN_HOLD_MS);
    expect(join.holdPending).toBe(false);
    // Player only treats a fail as a join fail while the hold is pending.
    if (join.holdPending) join.onFailedJoin();
    await vi.advanceTimersByTimeAsync(8000);
    expect(attempt).not.toHaveBeenCalled();
  });

  it("isHardJoinBlock matches the settled hard-block set", () => {
    const hard = [
      "codec_unsupported",
      "exclusive_needs_device",
      "exclusive_no_format",
      "exclusive_readonly",
      "exclusive_lossy",
      "missing",
      "broken",
      "no_id",
      "offline_no_local",
      "cd_not_ready",
    ];
    for (const reason of hard) {
      expect(isHardJoinBlock(reason)).toBe(true);
    }
    expect(isHardJoinBlock("play_failed")).toBe(false);
    expect(isHardJoinBlock("exclusive_failed")).toBe(false);
    expect(isHardJoinBlock("exclusive_not_ready")).toBe(false);
    expect(isHardJoinBlock(null)).toBe(false);
    expect(isHardJoinBlock(undefined)).toBe(false);
  });

  it("isNaturalEnded uses the 3s near-end epsilon", () => {
    expect(isNaturalEnded(97, 100)).toBe(true);
    expect(isNaturalEnded(100, 100)).toBe(true);
    expect(isNaturalEnded(10, 12)).toBe(true);
    expect(isNaturalEnded(96.9, 100)).toBe(false);
    expect(isNaturalEnded(8, 12)).toBe(false);
    expect(isNaturalEnded(0, 0)).toBe(false);
    expect(isNaturalEnded(5, 0)).toBe(false);
    expect(isNaturalEnded(Number.NaN, 100)).toBe(false);
  });

  it("kick after a scheduled fail waits the min floor and resets delay", async () => {
    vi.useFakeTimers();
    const attempt = vi.fn(async () => {});
    const join = createQueueJoin(attempt);
    join.onFailedJoin();
    join.kick();
    await vi.advanceTimersByTimeAsync(249);
    expect(attempt).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(attempt).toHaveBeenCalledTimes(1);
    join.onFailedJoin();
    await vi.advanceTimersByTimeAsync(999);
    expect(attempt).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("cancel drops a pending timer", async () => {
    vi.useFakeTimers();
    const attempt = vi.fn(async () => {});
    const join = createQueueJoin(attempt);
    join.onFailedJoin();
    join.cancel();
    await vi.advanceTimersByTimeAsync(8000);
    expect(attempt).not.toHaveBeenCalled();
    expect(join.rejoinActive).toBe(false);
    expect(join.holdPending).toBe(false);
  });
});
