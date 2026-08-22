import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api", () => ({
  fetchRadioNow: vi.fn(),
  streamUrl: vi.fn((track: { id?: string }, codec: string) =>
    track?.id ? `/api/stream?id=${track.id}&codec=${codec}` : null,
  ),
  coverUrl: vi.fn(() => "/static/img/placeholder.svg"),
}));
vi.mock("@/listens/bridge", () => ({ discard: vi.fn() }));
vi.mock("@/playback/session", () => ({
  restoreMediaSession: vi.fn(),
  suspendMediaSession: vi.fn(),
  become: vi.fn(),
  onLeaveRadio: vi.fn(),
}));
vi.mock("@/stores/ui", () => ({ showToast: vi.fn() }));

import { streamUrl } from "@/api";
import {
  bumpRadioGen,
  loadCurrent,
  onFaceOrTrack,
} from "@/radio/session";
import { radio, radioAudio, resetRadioStore } from "@/stores/radio";

describe("radio session", () => {
  beforeEach(() => {
    resetRadioStore();
    vi.mocked(streamUrl).mockClear();
    vi.spyOn(radioAudio, "load").mockResolvedValue();
    vi.spyOn(radioAudio, "seek").mockResolvedValue();
    vi.spyOn(radioAudio, "play").mockResolvedValue();
    vi.spyOn(radioAudio, "stop").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("idle while tuning tunes out", async () => {
    radio.chrome = "tuning";
    radio.face = "idle";
    await onFaceOrTrack(null);
    expect(radio.chrome).toBe("stopped");
    expect(radioAudio.stop).toHaveBeenCalled();
  });

  it("loadCurrent loads, seeks, then plays", async () => {
    radio.chrome = "tuning";
    radio.face = "current";
    radio.track = { id: "t1", title: "Song", artist: "A", album: "B" } as never;
    radio.tunerProfile = "opus_192_48000";
    await loadCurrent(false);
    expect(streamUrl).toHaveBeenCalledWith(radio.track, "opus_192_48000");
    expect(radioAudio.load).toHaveBeenCalled();
    expect(radioAudio.seek).toHaveBeenCalled();
    expect(radioAudio.play).toHaveBeenCalled();
    expect(radio.chrome).toBe("tuned");
    const loadOrder = (radioAudio.load as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const seekOrder = (radioAudio.seek as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const playOrder = (radioAudio.play as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    expect(loadOrder).toBeLessThan(seekOrder);
    expect(seekOrder).toBeLessThan(playOrder);
  });

  it("stale gen skips seek and play", async () => {
    let finishLoad: (() => void) | undefined;
    vi.spyOn(radioAudio, "load").mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishLoad = resolve;
        }),
    );
    radio.chrome = "tuning";
    radio.face = "current";
    radio.track = { id: "t1", title: "Song" } as never;
    const pending = loadCurrent(false);
    bumpRadioGen();
    finishLoad?.();
    await pending;
    expect(radioAudio.seek).not.toHaveBeenCalled();
    expect(radioAudio.play).not.toHaveBeenCalled();
    expect(radio.chrome).toBe("tuning");
  });
});
