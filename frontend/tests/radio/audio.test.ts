import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRadioAudio,
  RADIO_LOAD_TIMEOUT_MS,
  shouldIgnorePause,
  shouldIgnoreTransport,
} from "@/radio/audio";

describe("radio audio latch", () => {
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
});
