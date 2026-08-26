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
vi.mock("@/stores/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/stores/settings")>();
  return { ...actual, openSettings: vi.fn() };
});
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
vi.mock("@/radio/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/radio/runtime")>();
  return { ...actual, sendTuneIn: vi.fn(async () => true) };
});
vi.mock("@/playback/exclusiveDelivery", () => ({
  exclusiveDelivery: vi.fn(),
}));
vi.mock("@/stores/exclusiveAudio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/stores/exclusiveAudio")>();
  return {
    ...actual,
    isExclusiveEnabled: vi.fn(() => false),
    getExclusiveProfileTag: vi.fn(() => "flac_24_96000"),
  };
});
vi.mock("@/playback/prepare", () => ({
  requestPrepare: vi.fn(),
}));

import { streamUrl } from "@/api";
import { markTrackBroken } from "@/downloads/catalog";
import { resolvePlaySource } from "@/downloads/resolve";
import { exclusiveDelivery } from "@/playback/exclusiveDelivery";
import { requestPrepare } from "@/playback/prepare";
import { discard, startCycle } from "@/listens/bridge";
import {
  bumpRadioGen,
  loadCurrent,
  onFaceOrTrack,
} from "@/radio/session";
import { sendTuneIn } from "@/radio/runtime";
import { isExclusiveEnabled } from "@/stores/exclusiveAudio";
import { radio, radioAudio, resetRadioStore } from "@/stores/radio";
import { showToast } from "@/stores/ui";
import { PLAY_BLOCK_MESSAGES } from "@/playBlock";

describe("radio session", () => {
  beforeEach(() => {
    resetRadioStore();
    vi.mocked(streamUrl).mockClear();
    vi.mocked(resolvePlaySource).mockClear();
    vi.mocked(markTrackBroken).mockClear();
    vi.mocked(startCycle).mockClear();
    vi.mocked(discard).mockClear();
    vi.mocked(exclusiveDelivery).mockReset();
    vi.mocked(requestPrepare).mockReset();
    vi.mocked(isExclusiveEnabled).mockReturnValue(false);
    vi.spyOn(radioAudio, "load").mockResolvedValue();
    vi.spyOn(radioAudio, "seek").mockResolvedValue();
    vi.spyOn(radioAudio, "play").mockResolvedValue();
    vi.spyOn(radioAudio, "stop").mockImplementation(() => {});
    vi.spyOn(radioAudio, "setBackend").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
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
    await loadCurrent();
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
    await loadCurrent();
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
    await loadCurrent();
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
    const pending = loadCurrent();
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
    const pending = loadCurrent();
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
    await loadCurrent();
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
    await loadCurrent();
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

  it("official id change while tuned reloads and stays in session", async () => {
    radio.chrome = "tuned";
    radio.face = "current";
    radio.track = { id: "t2", title: "Next" } as never;
    radio.tunerProfile = "opus_192_48000";
    await onFaceOrTrack("t1");
    expect(radioAudio.load).toHaveBeenCalled();
    expect(radio.chrome).toBe("tuned");
    expect(radio.chrome).not.toBe("stopped");
  });

  it("unavailable delivery while tuned stays tuning", async () => {
    vi.mocked(resolvePlaySource).mockResolvedValue({
      source: "unavailable",
      profile: null,
      block: "play_failed",
      message: null,
    });
    radio.chrome = "tuned";
    radio.face = "current";
    radio.track = { id: "t1", title: "Song" } as never;
    await loadCurrent();
    expect(radio.chrome).toBe("tuning");
    expect(radio.chrome).not.toBe("stopped");
  });

  it("pause while tuning does not tune out", async () => {
    radio.chrome = "tuning";
    radio.face = "catching_up";
    await onFaceOrTrack(null);
    expect(radio.chrome).toBe("tuning");
    radioAudio.el?.dispatchEvent(new Event("pause"));
    expect(radio.chrome).toBe("tuning");
  });

  it("failed load stays tuning and retries to tuned", async () => {
    vi.useFakeTimers();
    vi.mocked(sendTuneIn).mockResolvedValue(true);
    vi.mocked(resolvePlaySource)
      .mockResolvedValueOnce({
        source: "unavailable",
        profile: null,
        block: "play_failed",
        message: null,
      })
      .mockResolvedValue({
        source: "streaming",
        url: "/api/stream?id=t1&codec=opus_192_48000",
        profile: "opus_192_48000",
      });
    radio.chrome = "tuning";
    radio.face = "current";
    radio.track = { id: "t1", title: "Song" } as never;
    radio.tunerProfile = "opus_192_48000";
    radio.connected = true;
    await loadCurrent();
    expect(radio.chrome).toBe("tuning");
    await vi.advanceTimersByTimeAsync(1000);
    expect(radio.chrome).toBe("tuned");
    vi.useRealTimers();
  });

  it("exclusive off still resolves HTML with offline false", async () => {
    radio.chrome = "tuning";
    radio.face = "current";
    radio.track = { id: "t1", title: "Song" } as never;
    radio.tunerProfile = "opus_192_48000";
    await loadCurrent();
    expect(radioAudio.setBackend).toHaveBeenCalledWith("htmlAudio");
    expect(exclusiveDelivery).not.toHaveBeenCalled();
    expect(resolvePlaySource).toHaveBeenCalledWith(
      radio.track,
      expect.objectContaining({ offline: false }),
    );
  });

  it("exclusive lossless stream loads companion and prepares the tag", async () => {
    vi.mocked(isExclusiveEnabled).mockReturnValue(true);
    vi.mocked(exclusiveDelivery).mockResolvedValue({
      source: "streaming",
      url: "https://lib.example/api/stream?id=t1&codec=flac_24_96000",
      profile: "flac_24_96000",
    });
    radio.chrome = "tuning";
    radio.face = "current";
    radio.track = { id: "t1", title: "Song", isLossy: false } as never;
    await loadCurrent();
    expect(radioAudio.setBackend).toHaveBeenCalledWith("companion");
    expect(radioAudio.load).toHaveBeenCalledWith(
      "https://lib.example/api/stream?id=t1&codec=flac_24_96000",
    );
    expect(requestPrepare).toHaveBeenCalledWith([radio.track], "flac_24_96000", {
      urgent: true,
    });
    expect(radioAudio.seek).toHaveBeenCalled();
    expect(radioAudio.play).toHaveBeenCalled();
    expect(radio.playSource).toBe("streaming");
    expect(radio.playProfileId).toBe("flac_24_96000");
    expect(radio.chrome).toBe("tuned");
  });

  it("exclusive lossy source does not prepare", async () => {
    vi.mocked(isExclusiveEnabled).mockReturnValue(true);
    vi.mocked(exclusiveDelivery).mockResolvedValue({
      source: "streaming",
      url: "https://lib.example/api/stream?id=t1&codec=source",
      profile: "source",
    });
    radio.chrome = "tuning";
    radio.face = "current";
    radio.isLossy = true;
    radio.track = { id: "t1", title: "Song", isLossy: true } as never;
    await loadCurrent();
    expect(radioAudio.load).toHaveBeenCalledWith(
      "https://lib.example/api/stream?id=t1&codec=source",
    );
    expect(requestPrepare).not.toHaveBeenCalled();
    expect(radio.playProfileId).toBeNull();
  });

  it("exclusive locker download loads companion without prepare", async () => {
    vi.mocked(isExclusiveEnabled).mockReturnValue(true);
    vi.mocked(exclusiveDelivery).mockResolvedValue({
      source: "downloaded",
      url: "http://127.0.0.1:18765/files/audio/t1.flac",
      profile: "flac_16_44100",
    });
    radio.chrome = "tuning";
    radio.face = "current";
    radio.track = { id: "t1", title: "Song" } as never;
    await loadCurrent();
    expect(radioAudio.setBackend).toHaveBeenCalledWith("companion");
    expect(radioAudio.load).toHaveBeenCalledWith(
      "http://127.0.0.1:18765/files/audio/t1.flac",
    );
    expect(requestPrepare).not.toHaveBeenCalled();
    expect(radio.playSource).toBe("downloaded");
  });

  it("exclusive unavailable does not load HTML", async () => {
    vi.mocked(isExclusiveEnabled).mockReturnValue(true);
    vi.mocked(exclusiveDelivery).mockResolvedValue({
      source: "unavailable",
      profile: null,
      block: "exclusive_needs_device",
      message: PLAY_BLOCK_MESSAGES.exclusive_needs_device,
    });
    radio.chrome = "tuning";
    radio.face = "current";
    radio.track = { id: "t1", title: "Song" } as never;
    await loadCurrent();
    expect(radioAudio.load).not.toHaveBeenCalled();
    expect(resolvePlaySource).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      PLAY_BLOCK_MESSAGES.exclusive_needs_device,
    );
    expect(radio.chrome).toBe("tuning");
  });

  it("HTML remint still only runs when exclusive is off", async () => {
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
    await loadCurrent();
    expect(exclusiveDelivery).not.toHaveBeenCalled();
    expect(radioAudio.load).toHaveBeenNthCalledWith(2, "/api/stream?id=t1&codec=opus_192_48000");
  });
});
