import { describe, expect, it } from "vitest";
import {
  createRadioAudio,
  shouldIgnorePause,
  shouldIgnoreTransport,
} from "@/radio/audio";

describe("radio audio latch", () => {
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
});
