import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const companionListeners = new Set<(evt: { type: string; t?: unknown; d?: unknown }) => void>();

vi.mock("@/exclusive/companionClient", () => ({
  ensurePreferredDevice: vi.fn(),
  companionLoad: vi.fn(),
  companionSeek: vi.fn(),
  companionStop: vi.fn(),
  companionResume: vi.fn(),
  companionSetVolume: vi.fn(),
  companionPause: vi.fn(),
  onCompanionEvent: vi.fn((fn: (evt: { type: string }) => void) => {
    companionListeners.add(fn);
    return () => companionListeners.delete(fn);
  }),
}));

import {
  createRadioAudio,
  RADIO_LOAD_TIMEOUT_MS,
  shouldIgnorePause,
  shouldIgnoreTransport,
} from "@/radio/audio";
import {
  companionLoad,
  companionSeek,
  ensurePreferredDevice,
} from "@/exclusive/companionClient";
import { PlayBlockError } from "@/playBlock";

function emitCompanion(evt: { type: string; t?: unknown; d?: unknown }): void {
  for (const fn of companionListeners) fn(evt);
}

describe("radio audio latch", () => {
  beforeEach(() => {
    companionListeners.clear();
    vi.mocked(ensurePreferredDevice).mockReset();
    vi.mocked(companionLoad).mockReset();
    vi.mocked(companionSeek).mockReset();
    vi.mocked(ensurePreferredDevice).mockResolvedValue({ ok: true });
    vi.mocked(companionLoad).mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ignores pause/ended while load or seek is in flight", () => {
    expect(shouldIgnoreTransport(true, false)).toBe(true);
    expect(shouldIgnoreTransport(false, true)).toBe(true);
    expect(shouldIgnoreTransport(true, true)).toBe(true);
    expect(shouldIgnoreTransport(false, false)).toBe(false);
  });

  it("ignores pause when the element has ended", () => {
    expect(shouldIgnorePause(false, false, true)).toBe(true);
    expect(shouldIgnorePause(true, false, true)).toBe(true);
    expect(shouldIgnorePause(false, true, false)).toBe(true);
    expect(shouldIgnorePause(false, false, false)).toBe(false);
  });

  it("exposes an htmlAudio PlaybackSink with sync seek", () => {
    const radio = createRadioAudio();
    expect(radio.sink.kind).toBe("htmlAudio");
    expect(radio.sink.seek.length).toBe(1);
    radio.sink.seek(3);
    if (radio.el) {
      expect(radio.el.currentTime).toBe(3);
    }
  });

  it("currentTime tracks the element after successive seeks", () => {
    const radio = createRadioAudio();
    if (!radio.el) return;
    radio.sink.seek(3);
    expect(radio.currentTime).toBe(radio.el.currentTime);
    radio.el.currentTime = 7;
    expect(radio.currentTime).toBe(radio.el.currentTime);
  });

  it("transport fields are live getters", () => {
    const radio = createRadioAudio();
    for (const key of [
      "currentTime",
      "paused",
      "ended",
      "loadInFlight",
      "seekInFlight",
      "duration",
    ] as const) {
      expect(Object.getOwnPropertyDescriptor(radio, key)?.get).toEqual(
        expect.any(Function),
      );
    }
  });

  it("load rejects after 8s if canplay never fires", async () => {
    vi.useFakeTimers();
    const radio = createRadioAudio();
    if (!radio.el) return;
    const pending = radio.load("");
    await vi.advanceTimersByTimeAsync(RADIO_LOAD_TIMEOUT_MS);
    await expect(pending).rejects.toThrow();
    expect(radio.loadInFlight).toBe(false);
  });

  it("setBackend companion flips sink kind and keeps live getters", () => {
    const radio = createRadioAudio();
    radio.setBackend("companion");
    expect(radio.sink.kind).toBe("companion");
    for (const key of [
      "currentTime",
      "paused",
      "ended",
      "loadInFlight",
      "seekInFlight",
      "duration",
    ] as const) {
      expect(Object.getOwnPropertyDescriptor(radio, key)?.get).toEqual(
        expect.any(Function),
      );
    }
  });

  it("companion load waits until a time event reports duration", async () => {
    const radio = createRadioAudio();
    radio.setBackend("companion");
    const pending = radio.load("https://lib.example/api/stream?id=t1");
    await Promise.resolve();
    emitCompanion({ type: "time", t: 0, d: 123 });
    await pending;
    expect(companionLoad).toHaveBeenCalledWith(
      "https://lib.example/api/stream?id=t1",
    );
    expect(radio.duration).toBe(123);
    expect(radio.loadInFlight).toBe(false);
  });

  it("companion load rejects after 8s if duration never arrives", async () => {
    vi.useFakeTimers();
    const radio = createRadioAudio();
    radio.setBackend("companion");
    const pending = radio.load("https://lib.example/api/stream?id=t1");
    const rejected = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(RADIO_LOAD_TIMEOUT_MS);
    await rejected;
    expect(radio.loadInFlight).toBe(false);
  });

  it("companion load rejects with exclusive_needs_device", async () => {
    vi.mocked(ensurePreferredDevice).mockResolvedValue({
      ok: false,
      reason: "exclusive_needs_device",
    });
    const radio = createRadioAudio();
    radio.setBackend("companion");
    try {
      await radio.load("https://lib.example/api/stream?id=t1");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PlayBlockError);
      expect((err as PlayBlockError).reason).toBe("exclusive_needs_device");
    }
    expect(companionLoad).not.toHaveBeenCalled();
  });

  it("released clears companion transport without ending", async () => {
    const radio = createRadioAudio();
    radio.setBackend("companion");
    const pending = radio.load("https://lib.example/api/stream?id=t1");
    await Promise.resolve();
    emitCompanion({ type: "time", t: 8, d: 200 });
    await pending;
    const ended = vi.fn();
    radio.onEnded(ended);
    emitCompanion({ type: "released" });
    expect(ended).not.toHaveBeenCalled();
    expect(radio.currentTime).toBe(0);
    expect(radio.paused).toBe(true);
  });

  it("companion seek after duration calls companionSeek", async () => {
    const radio = createRadioAudio();
    radio.setBackend("companion");
    const pending = radio.load("https://lib.example/api/stream?id=t1");
    await Promise.resolve();
    emitCompanion({ type: "time", t: 0, d: 200 });
    await pending;
    await radio.seek(12);
    expect(companionSeek).toHaveBeenCalledWith(12);
    expect(radio.currentTime).toBe(12);
  });
});
