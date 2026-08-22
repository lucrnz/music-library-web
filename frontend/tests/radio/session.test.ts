import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api", () => ({
  fetchRadioNow: vi.fn(),
  streamUrl: vi.fn((track: { id?: string }, codec: string) =>
    track?.id ? `/api/stream?id=${track.id}&codec=${codec}` : null,
  ),
  coverUrl: vi.fn(() => "/static/img/placeholder.svg"),
}));
vi.mock("@/listens/bridge", () => ({
  discard: vi.fn(),
  startCycle: vi.fn(),
  onTime: vi.fn(),
  onEnded: vi.fn(),
}));
vi.mock("@/playback/session", () => ({
  restoreMediaSession: vi.fn(),
  suspendMediaSession: vi.fn(),
  become: vi.fn(),
  onLeaveRadio: vi.fn(),
}));
vi.mock("@/stores/ui", () => ({ showToast: vi.fn() }));
vi.mock("@/downloads/resolve", () => ({
  resolvePlaySource: vi.fn(
    async (
      track: { id?: string },
      ctx: { activeStreamCodec: string },
    ) => ({
      source: "streaming" as const,
      url: track?.id
        ? `/api/stream?id=${track.id}&codec=${ctx.activeStreamCodec}`
        : "",
      profile: ctx.activeStreamCodec,
    }),
  ),
}));
vi.mock("@/downloads/catalog", () => ({
  markTrackBroken: vi.fn(() => Promise.resolve()),
}));

import { streamUrl } from "@/api";
import { markTrackBroken } from "@/downloads/catalog";
import { resolvePlaySource } from "@/downloads/resolve";
import { discard, startCycle } from "@/listens/bridge";
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
    vi.mocked(resolvePlaySource).mockClear();
    vi.mocked(markTrackBroken).mockClear();
    vi.mocked(startCycle).mockClear();
    vi.mocked(discard).mockClear();
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
    expect(resolvePlaySource).toHaveBeenCalledWith(
      radio.track,
      expect.objectContaining({
        offline: false,
        activeStreamCodec: "opus_192_48000",
      }),
    );
    expect(radioAudio.load).toHaveBeenCalledWith(
      "/api/stream?id=t1&codec=opus_192_48000",
    );
    expect(radioAudio.seek).toHaveBeenCalled();
    expect(radioAudio.play).toHaveBeenCalled();
    expect(radio.chrome).toBe("tuned");
    expect(radio.playSource).toBe("streaming");
    const loadOrder = (radioAudio.load as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const seekOrder = (radioAudio.seek as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const playOrder = (radioAudio.play as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    expect(loadOrder).toBeLessThan(seekOrder);
    expect(seekOrder).toBeLessThan(playOrder);
    expect(startCycle).toHaveBeenCalledTimes(1);
    expect(startCycle).toHaveBeenCalledWith({
      trackId: "t1",
      durationSec: null,
      profile: "opus_192_48000",
      playSource: "streaming",
      origin: "radio",
    });
  });

  it("loadCurrent plays a downloaded blob when resolve prefers local", async () => {
    vi.mocked(resolvePlaySource).mockResolvedValue({
      source: "downloaded",
      url: "blob:local-radio",
      profile: "flac_16_44100",
    });
    radio.chrome = "tuning";
    radio.face = "current";
    radio.track = { id: "t1", title: "Song" } as never;
    radio.tunerProfile = "opus_192_48000";
    await loadCurrent(false);
    expect(radioAudio.load).toHaveBeenCalledWith("blob:local-radio");
    expect(radio.playSource).toBe("downloaded");
    expect(radio.playProfileId).toBe("flac_16_44100");
    expect(radio.chrome).toBe("tuned");
    expect(startCycle).toHaveBeenCalledWith(
      expect.objectContaining({
        playSource: "downloaded",
        profile: "flac_16_44100",
        origin: "radio",
      }),
    );
  });

  it("remints a failed download to the official stream", async () => {
    vi.mocked(resolvePlaySource).mockResolvedValue({
      source: "downloaded",
      url: "blob:local-radio",
      profile: "flac_16_44100",
    });
    vi.spyOn(radioAudio, "load")
      .mockRejectedValueOnce(new Error("blob failed"))
      .mockResolvedValueOnce(undefined);
    radio.chrome = "tuning";
    radio.face = "current";
    radio.track = { id: "t1", title: "Song" } as never;
    radio.tunerProfile = "opus_192_48000";
    await loadCurrent(false);
    expect(markTrackBroken).toHaveBeenCalledWith("t1");
    expect(radioAudio.load).toHaveBeenNthCalledWith(1, "blob:local-radio");
    expect(radioAudio.load).toHaveBeenNthCalledWith(
      2,
      "/api/stream?id=t1&codec=opus_192_48000",
    );
    expect(streamUrl).toHaveBeenCalledWith(radio.track, "opus_192_48000");
    expect(radio.playSource).toBe("streaming");
    expect(radio.chrome).toBe("tuned");
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

  it("stale gen after a downloaded resolve skips seek and play", async () => {
    vi.mocked(resolvePlaySource).mockResolvedValue({
      source: "downloaded",
      url: "blob:local-radio",
      profile: "flac_16_44100",
    });
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
    await vi.waitFor(() => {
      expect(radioAudio.load).toHaveBeenCalledWith("blob:local-radio");
    });
    bumpRadioGen();
    finishLoad?.();
    await pending;
    expect(radioAudio.seek).not.toHaveBeenCalled();
    expect(radioAudio.play).not.toHaveBeenCalled();
    expect(radio.playSource).toBe("none");
    expect(radio.chrome).toBe("tuning");
  });

  it("loadCurrent discards then starts a new radio cycle", async () => {
    vi.mocked(resolvePlaySource).mockResolvedValue({
      source: "streaming",
      url: "/api/stream?id=t1&codec=opus_192_48000",
      profile: "opus_192_48000",
    });
    radio.chrome = "tuning";
    radio.face = "current";
    radio.track = {
      id: "t1",
      title: "Song",
      duration: 180,
    } as never;
    radio.tunerProfile = "opus_192_48000";
    await loadCurrent(false);
    expect(discard).toHaveBeenCalled();
    expect(startCycle).toHaveBeenCalledTimes(1);
    expect(startCycle).toHaveBeenCalledWith({
      trackId: "t1",
      durationSec: 180,
      profile: "opus_192_48000",
      playSource: "streaming",
      origin: "radio",
    });
    vi.mocked(startCycle).mockClear();
    vi.mocked(discard).mockClear();
    await loadCurrent(false);
    expect(discard).toHaveBeenCalled();
    expect(startCycle).toHaveBeenCalledTimes(1);
    expect(startCycle).toHaveBeenCalledWith(
      expect.objectContaining({ trackId: "t1", origin: "radio" }),
    );
  });

  it("catch-up while tuned discards and does not start a cycle", async () => {
    radio.chrome = "tuned";
    radio.face = "catching_up";
    await onFaceOrTrack(null);
    expect(discard).toHaveBeenCalled();
    expect(startCycle).not.toHaveBeenCalled();
    expect(radio.chrome).toBe("tuning");
  });
});
