import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api", () => ({
  fetchRadioNow: vi.fn(),
  coverUrl: vi.fn(() => "/static/img/placeholder.svg"),
  streamUrl: vi.fn((track: { id?: string }, codec: string) =>
    track?.id ? `/api/stream?id=${track.id}&codec=${codec}` : null,
  ),
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

import { fromApiTrack } from "@/models/track";
import { SOURCE_TAG } from "@/lossyKind";
import { discard, startCycle } from "@/listens/bridge";
import { streamUrl } from "@/api";
import {
  applySnapshot,
  connect,
  heardPosition,
  interpolatedPosition,
  onPlaybackPolicyChanged,
  radio,
  radioAudio,
  radioChromeActive,
  radioPlayState,
  radioSubtitle,
  resetRadioStore,
  setTabOpen,
  tuneIn,
  tuneOut,
} from "@/stores/radio";
import { fetchRadioNow } from "@/api";
import { getActiveStreamCodec } from "@/stores/settings";

const currentPayload = {
  face: "current",
  id: "t1",
  title: "Song",
  artist: "Artist",
  album: "Album",
  duration: 180,
  duration_ms: 180000,
  is_lossy: false,
  position: 12,
};

describe("radio store", () => {
  beforeEach(() => {
    resetRadioStore();
    vi.mocked(fetchRadioNow).mockReset();
    vi.mocked(streamUrl).mockClear();
    vi.mocked(startCycle).mockClear();
    vi.mocked(discard).mockClear();
  });

  it("does not call fromApiTrack without an id", () => {
    for (const face of ["catching_up", "skip_pending", "idle"] as const) {
      applySnapshot({ face, title: "Nope" });
      expect(radio.face).toBe(face);
      expect(radio.track).toBeNull();
    }
    applySnapshot({ face: "current", title: "No id" });
    expect(radio.track).toBeNull();
  });

  it("hydrates current only when face is current and id is present", () => {
    applySnapshot(currentPayload);
    expect(radio.face).toBe("current");
    expect(radio.track).toEqual(fromApiTrack(currentPayload));
    expect(radio.track?.title).toBe("Song");
    expect(radioSubtitle(radio.track)).toBe("Artist — Album");
  });

  it("interpolates official position between snapshots", () => {
    applySnapshot(currentPayload, 1_000);
    expect(interpolatedPosition(1_000)).toBe(12);
    expect(interpolatedPosition(4_000)).toBe(15);
    applySnapshot({ ...currentPayload, position: 20 }, 10_000);
    expect(interpolatedPosition(10_000)).toBe(20);
    expect(interpolatedPosition(10_000 + 200_000)).toBe(180);
  });

  it("heardPosition follows the official clock until tuned", () => {
    applySnapshot(currentPayload, 1_000);
    expect(heardPosition(1_000)).toBe(12);
    radio.chrome = "tuned";
    expect(heardPosition(1_000)).toBe(0);
  });

  it("heardPosition when tuned follows the live element clock", () => {
    applySnapshot(currentPayload, 1_000);
    radio.chrome = "tuned";
    if (!radioAudio.el) return;
    radioAudio.el.currentTime = 44;
    expect(heardPosition(1_000)).toBe(radioAudio.el.currentTime);
    expect(heardPosition(1_000)).not.toBe(0);
    expect(heardPosition(1_000)).not.toBe(interpolatedPosition(1_000));
  });

  it("connect hydrates via GET and does not send tune_in", async () => {
    vi.mocked(fetchRadioNow).mockResolvedValue(currentPayload);
    await connect();
    expect(fetchRadioNow).toHaveBeenCalledTimes(1);
    expect(radio.chrome).toBe("inactive");
    expect(radio.face).toBe("current");
    expect(radio.track?.id).toBe("t1");
  });

  it("keeps catching_up distinct from idle", () => {
    applySnapshot({ face: "catching_up" });
    expect(radio.face).toBe("catching_up");
    expect(radio.track).toBeNull();
    applySnapshot({ face: "idle" });
    expect(radio.face).toBe("idle");
  });

  it("opening the tab is inactive and does not steal chrome", async () => {
    vi.mocked(fetchRadioNow).mockResolvedValue(currentPayload);
    setTabOpen(true);
    await Promise.resolve();
    expect(radio.chrome).toBe("inactive");
    expect(radio.tabOpen).toBe(true);
    expect(radioChromeActive()).toBe(false);
    expect(startCycle).not.toHaveBeenCalled();
    setTabOpen(false);
    expect(radio.connected).toBe(false);
  });

  it("radioPlayState is streaming with the tuner profile, never exclusive", () => {
    applySnapshot(currentPayload);
    radio.tunerProfile = "opus_192_48000";
    const state = radioPlayState();
    expect(state.session).toBe("radio");
    expect(state.playSource).toBe("streaming");
    expect(state.playProfileId).toBe("opus_192_48000");
    expect(state.track?.isLossy).toBe(false);
    applySnapshot({ ...currentPayload, is_lossy: true });
    expect(radioPlayState().playProfileId).toBeNull();
  });

  it("radioPlayState reports a downloaded catalog profile", () => {
    applySnapshot(currentPayload);
    radio.tunerProfile = "opus_192_48000";
    radio.playSource = "downloaded";
    radio.playProfileId = "flac_16_44100";
    const state = radioPlayState();
    expect(state.playSource).toBe("downloaded");
    expect(state.playProfileId).toBe("flac_16_44100");
    applySnapshot({ ...currentPayload, is_lossy: true });
    radio.playSource = "downloaded";
    radio.playProfileId = "flac_16_44100";
    expect(radioPlayState().playProfileId).toBeNull();
    expect(radioPlayState().playSource).toBe("downloaded");
  });

  it("tune_in codec is the streaming profile, never source", () => {
    expect(getActiveStreamCodec()).not.toBe(SOURCE_TAG);
  });

  it("lossy current would load SOURCE_TAG", () => {
    applySnapshot({ ...currentPayload, is_lossy: true });
    const url = streamUrl(
      radio.track,
      radio.isLossy ? SOURCE_TAG : getActiveStreamCodec(),
    );
    expect(url).toContain("codec=source");
  });

  it("tuneIn on idle stays stopped and does not load stream", async () => {
    vi.mocked(fetchRadioNow).mockResolvedValue({ face: "idle" });
    await connect();
    await tuneIn();
    expect(radio.chrome).toBe("stopped");
    expect(radioChromeActive()).toBe(true);
    expect(streamUrl).not.toHaveBeenCalled();
  });

  it("RadioView unmount does not disconnect while chrome is on", async () => {
    vi.mocked(fetchRadioNow).mockResolvedValue(currentPayload);
    setTabOpen(true);
    radio.chrome = "tuned";
    radio.connected = true;
    setTabOpen(false);
    expect(radio.tabOpen).toBe(false);
    expect(radio.chrome).toBe("tuned");
  });

  it("setStreamCodec replace:true may drop radio prewarm until tune_in", () => {
    // settings.ts stays radio-free and always requestPrepare({ replace: true }).
    // Dropped radio next-2 is accepted until onStreamProfileChanged / next advance.
    expect(radioChromeActive()).toBe(false);
  });

  it("stays tuned when the official current id changes", async () => {
    applySnapshot(currentPayload);
    radio.chrome = "tuned";
    applySnapshot({ ...currentPayload, id: "t2", title: "Next" });
    await Promise.resolve();
    expect(radio.chrome).toBe("tuned");
    expect(radio.track?.id).toBe("t2");
  });

  it("socket stays required after tuneOut off the tab", async () => {
    vi.mocked(fetchRadioNow).mockResolvedValue(currentPayload);
    setTabOpen(true);
    await tuneIn();
    vi.mocked(discard).mockClear();
    tuneOut();
    expect(discard).toHaveBeenCalled();
    expect(radio.chrome).toBe("stopped");
    setTabOpen(false);
    expect(radioChromeActive()).toBe(true);
    resetRadioStore();
    expect(radio.chrome).toBe("inactive");
    expect(radio.connected).toBe(false);
    expect(radio.playSource).toBe("none");
  });

  it("resetRadioStore clears playSource", () => {
    radio.playSource = "downloaded";
    radio.playProfileId = "flac_16_44100";
    resetRadioStore();
    expect(radio.playSource).toBe("none");
    expect(radio.playProfileId).toBeNull();
  });

  it("onPlaybackPolicyChanged reloads while tuned", async () => {
    applySnapshot(currentPayload);
    radio.chrome = "tuned";
    radio.tunerProfile = "opus_192_48000";
    vi.spyOn(radioAudio, "load").mockResolvedValue();
    vi.spyOn(radioAudio, "seek").mockResolvedValue();
    vi.spyOn(radioAudio, "play").mockResolvedValue();
    await onPlaybackPolicyChanged();
    expect(radioAudio.load).toHaveBeenCalled();
  });

  it("onPlaybackPolicyChanged does not load while stopped", async () => {
    applySnapshot(currentPayload);
    radio.chrome = "stopped";
    const load = vi.spyOn(radioAudio, "load").mockResolvedValue();
    load.mockClear();
    await onPlaybackPolicyChanged();
    expect(load).not.toHaveBeenCalled();
  });
});
