import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postListen = vi.fn();
const reportSuccess = vi.fn();
const reportFailure = vi.fn();
const canReachServer = vi.fn(() => false);
const recovered: Array<() => void> = [];

vi.mock("@/api", () => ({
  postListen: (...args: unknown[]) => postListen(...args),
}));

vi.mock("@/connectivity", () => ({
  reportSuccess: (...args: unknown[]) => reportSuccess(...args),
  reportFailure: (...args: unknown[]) => reportFailure(...args),
  canReachServer: () => canReachServer(),
  onConnectivityRecovered: (fn: () => void) => {
    recovered.push(fn);
    return () => {};
  },
}));

import { BACKOFF_START_MS, enqueueListen, flushListens } from "@/listens/flush";
import { enqueuePending, readPendingListens } from "@/listens/outbox";

function event(id: string) {
  return {
    id,
    trackId: "t1",
    profile: "source",
    playSource: "streaming" as const,
    origin: "queue" as const,
    countedAt: "2026-08-20T12:00:00.000Z",
  };
}

describe("listen flush", () => {
  beforeEach(() => {
    postListen.mockReset();
    reportSuccess.mockReset();
    reportFailure.mockReset();
    canReachServer.mockReturnValue(false);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("classifies 204, 422, and network and still POSTs when unreachable", async () => {
    enqueuePending({
      id: "a",
      track_id: "t1",
      profile: "source",
      play_source: "streaming",
      origin: "queue",
      counted_at: "2026-08-20T12:00:00.000Z",
    });
    enqueuePending({
      id: "b",
      track_id: "t1",
      profile: "source",
      play_source: "streaming",
      origin: "queue",
      counted_at: "2026-08-20T12:00:01.000Z",
    });
    enqueuePending({
      id: "c",
      track_id: "t1",
      profile: "source",
      play_source: "streaming",
      origin: "queue",
      counted_at: "2026-08-20T12:00:02.000Z",
    });
    postListen
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ status: 422 })
      .mockResolvedValueOnce({ status: 0 });

    await flushListens();

    expect(canReachServer()).toBe(false);
    expect(postListen).toHaveBeenCalledTimes(3);
    expect(postListen).toHaveBeenCalledWith(
      expect.objectContaining({ origin: "queue" }),
    );
    expect(readPendingListens().map((item) => item.id)).toEqual(["c"]);
    expect(reportSuccess).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalledTimes(1);
  });

  it("does not POST when enqueue storage throws", () => {
    const orig = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => {
      throw new Error("quota");
    };
    expect(enqueueListen(event("drop"))).toBe(false);
    localStorage.setItem = orig;
    expect(postListen).not.toHaveBeenCalled();
    expect(readPendingListens()).toEqual([]);
  });

  it("does not overlap flushes", async () => {
    let release!: (value: { ok: true }) => void;
    postListen.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    enqueuePending({
      id: "held",
      track_id: "t1",
      profile: "source",
      play_source: "streaming",
      origin: "queue",
      counted_at: "2026-08-20T12:00:00.000Z",
    });
    const first = flushListens();
    const second = flushListens();
    await Promise.resolve();
    expect(postListen).toHaveBeenCalledTimes(1);
    release({ ok: true });
    await first;
    await second;
    expect(postListen).toHaveBeenCalledTimes(1);
  });

  it("retries after a network fail on the backoff timer", async () => {
    enqueuePending({
      id: "retry",
      track_id: "t1",
      profile: "source",
      play_source: "streaming",
      origin: "queue",
      counted_at: "2026-08-20T12:00:00.000Z",
    });
    postListen
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ ok: true });

    await flushListens();
    expect(readPendingListens()).toHaveLength(1);
    expect(reportFailure).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(BACKOFF_START_MS);
    expect(postListen).toHaveBeenCalledTimes(2);
    expect(readPendingListens()).toEqual([]);
    expect(reportSuccess).toHaveBeenCalledTimes(1);
  });
});
