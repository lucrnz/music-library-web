import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api", () => ({
  fetchRadioNow: vi.fn(),
  coverUrl: vi.fn(() => "/static/img/placeholder.svg"),
  streamUrl: vi.fn((track: { id?: string }, codec: string) =>
    track?.id ? `/api/stream?id=${track.id}&codec=${codec}` : null,
  ),
}));
vi.mock("@/listens/bridge", () => ({ discard: vi.fn() }));
vi.mock("@/playback/onDemandControl", () => ({
  restoreMediaSession: vi.fn(),
  stopOnDemandSinks: vi.fn(),
  suspendMediaSession: vi.fn(),
}));
vi.mock("@/stores/ui", () => ({ showToast: vi.fn() }));

import { fromApiTrack } from "@/models/track";
import { SOURCE_TAG } from "@/lossyKind";
import { streamUrl } from "@/api";
import {
  applySnapshot,
  connect,
  exitToQueue,
  interpolatedPosition,
  radio,
  radioChromeActive,
  radioSubtitle,
  resetRadioStore,
  setTabOpen,
  tuneIn,
  tuneInCodec,
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

  it("connect hydrates via GET and does not send tune_in", async () => {
    vi.mocked(fetchRadioNow).mockResolvedValue(currentPayload);
    await connect();
    expect(fetchRadioNow).toHaveBeenCalledTimes(1);
    expect(radio.chrome).toBe("preview");
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

  it("opening the tab is preview and does not steal chrome", async () => {
    vi.mocked(fetchRadioNow).mockResolvedValue(currentPayload);
    setTabOpen(true);
    await Promise.resolve();
    expect(radio.chrome).toBe("preview");
    expect(radioChromeActive()).toBe(false);
    setTabOpen(false);
    expect(radio.connected).toBe(false);
  });

  it("tune_in codec is the streaming profile, never source", () => {
    expect(tuneInCodec()).toBe(getActiveStreamCodec());
    expect(tuneInCodec()).not.toBe(SOURCE_TAG);
  });

  it("lossy current would load SOURCE_TAG", () => {
    applySnapshot({ ...currentPayload, is_lossy: true });
    const url = streamUrl(radio.track, radio.isLossy ? SOURCE_TAG : tuneInCodec());
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

  it("socket stays required after tuneOut off the tab", async () => {
    vi.mocked(fetchRadioNow).mockResolvedValue(currentPayload);
    setTabOpen(true);
    await tuneIn();
    tuneOut();
    expect(radio.chrome).toBe("stopped");
    setTabOpen(false);
    expect(radioChromeActive()).toBe(true);
    exitToQueue();
    expect(radio.chrome).toBe("inactive");
    expect(radio.connected).toBe(false);
  });
});
