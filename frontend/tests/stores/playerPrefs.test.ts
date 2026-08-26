import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  fetchPlaylistTracks: vi.fn(),
  fetchTracksMeta: vi.fn(),
}));
vi.mock("@/playback/prepare", () => ({
  prepareTracks: vi.fn(),
  preparedKeys: new Set<string>(),
  requestForget: vi.fn(),
  requestPrepare: vi.fn(),
}));
vi.mock("@/diag/log", () => ({ emit: vi.fn() }));

import {
  applyExpanded,
  applyPlaybackPosition,
  hydrateOutputVolume,
  initOutputVolume,
  openQueueRail,
  openRadioRail,
  setExpanded,
  setOutputVolume,
  subscribeOutputVolume,
  toggleRadioRail,
} from "@/stores/playerPrefs";
import { writePlaybackPosition } from "@/stores/playbackPosition";
import { pl } from "@/stores/playlist";
import { player } from "@/stores/playerState";
import type { Track } from "@/models/track";
import { nextTick } from "vue";

function track(id: string, duration: number): Track {
  return {
    id,
    path: `${id}.flac`,
    title: id,
    artist: "A",
    album: "B",
    albumId: null,
    artistId: null,
    albumArtist: "A",
    albumArtistId: null,
    track: 1,
    disc: 1,
    year: null,
    duration,
    durationMs: duration * 1000,
    isMissing: false,
    sampleRateHz: null,
    bitDepth: null,
    isLossy: false,
    sourceCodec: null,
    bitrateKbps: null,
    bitrateMode: null,
  };
}

describe("applyPlaybackPosition", () => {
  beforeEach(() => {
    pl.clear();
    player.currentTime = 0;
    player.duration = 0;
    player.playSource = "none";
  });

  it("hydrates currentTime from a matching saved slot", () => {
    pl.add([track("a", 200)]);
    pl.index = 0;
    writePlaybackPosition("a", 42);
    applyPlaybackPosition();
    expect(player.currentTime).toBe(42);
    expect(player.duration).toBe(200);
    expect(player.playSource).toBe("none");
  });

  it("leaves the face at 0 when the slot is for another track", () => {
    pl.add([track("a", 200)]);
    pl.index = 0;
    writePlaybackPosition("other", 42);
    applyPlaybackPosition();
    expect(player.currentTime).toBe(0);
    expect(player.duration).toBe(0);
  });
});

describe("output volume", () => {
  const VOLUME_KEY = "musicweb.volume";
  const unsubs: Array<() => void> = [];

  beforeEach(() => {
    player.volume = 1;
    localStorage.removeItem(VOLUME_KEY);
  });

  afterEach(() => {
    while (unsubs.length) unsubs.pop()?.();
  });

  it("hydrateOutputVolume sets player.volume from storage when in [0, 1]", () => {
    localStorage.setItem(VOLUME_KEY, "0.5");
    hydrateOutputVolume();
    expect(player.volume).toBe(0.5);
  });

  it("notifies a subscriber on setOutputVolume and writes storage", async () => {
    initOutputVolume();
    const fn = vi.fn();
    unsubs.push(subscribeOutputVolume(fn));
    expect(fn).toHaveBeenCalledWith(1);
    fn.mockClear();
    setOutputVolume(0.4);
    await nextTick();
    expect(fn).toHaveBeenCalledWith(0.4);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(VOLUME_KEY)).toBe("0.4");
  });

  it("unsubscribe stops further notifies", async () => {
    initOutputVolume();
    const fn = vi.fn();
    const stop = subscribeOutputVolume(fn);
    fn.mockClear();
    stop();
    setOutputVolume(0.2);
    await nextTick();
    expect(fn).not.toHaveBeenCalled();
  });

  it("initOutputVolume twice does not double-notify", async () => {
    const fn = vi.fn();
    unsubs.push(subscribeOutputVolume(fn));
    initOutputVolume();
    initOutputVolume();
    fn.mockClear();
    setOutputVolume(0.4);
    await nextTick();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(0.4);
  });

  it("setOutputVolume notifySinks false updates the face without notifying sinks", async () => {
    initOutputVolume();
    const fn = vi.fn();
    unsubs.push(subscribeOutputVolume(fn));
    fn.mockClear();
    setOutputVolume(0.25, { notifySinks: false });
    await nextTick();
    expect(player.volume).toBe(0.25);
    expect(localStorage.getItem(VOLUME_KEY)).toBe("0.25");
    expect(fn).not.toHaveBeenCalled();
    setOutputVolume(0.5);
    await nextTick();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(0.5);
  });
});

describe("now-playing rail", () => {
  const EXPANDED_KEY = "musicweb.nowPlayingExpanded.v1";
  const RAIL_KEY = "musicweb.nowPlayingRail.v1";

  beforeEach(() => {
    pl.clear();
    player.expanded = false;
    player.railFace = "queue";
    localStorage.removeItem(EXPANDED_KEY);
    localStorage.removeItem(RAIL_KEY);
  });

  it("openRadioRail sets expanded radio face and writes both keys with an empty playlist", () => {
    expect(pl.length).toBe(0);
    openRadioRail();
    expect(player.expanded).toBe(true);
    expect(player.railFace).toBe("radio");
    expect(localStorage.getItem(EXPANDED_KEY)).toBe("1");
    expect(localStorage.getItem(RAIL_KEY)).toBe("radio");
  });

  it("applyExpanded restores a radio rail when the playlist is empty", () => {
    localStorage.setItem(EXPANDED_KEY, "1");
    localStorage.setItem(RAIL_KEY, "radio");
    applyExpanded();
    expect(pl.length).toBe(0);
    expect(player.expanded).toBe(true);
    expect(player.railFace).toBe("radio");
  });

  it("applyExpanded stays collapsed for queue face when the playlist is empty", () => {
    localStorage.setItem(EXPANDED_KEY, "1");
    localStorage.setItem(RAIL_KEY, "queue");
    applyExpanded();
    expect(pl.length).toBe(0);
    expect(player.expanded).toBe(false);
    expect(player.railFace).toBe("queue");
  });

  it("toggleRadioRail opens then collapses without clearing railFace", () => {
    toggleRadioRail();
    expect(player.expanded).toBe(true);
    expect(player.railFace).toBe("radio");
    toggleRadioRail();
    expect(player.expanded).toBe(false);
    expect(player.railFace).toBe("radio");
  });

  it("openQueueRail then setExpanded(false) leaves railFace queue", () => {
    pl.add([track("a", 200)]);
    openQueueRail();
    expect(player.expanded).toBe(true);
    expect(player.railFace).toBe("queue");
    setExpanded(false);
    expect(player.expanded).toBe(false);
    expect(player.railFace).toBe("queue");
  });
});
