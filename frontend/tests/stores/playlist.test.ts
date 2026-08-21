import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { requestForget } from "@/playback/prepare";
import {
  clearPlaylist,
  computeNextIndex,
  commit,
  idsLeavingQueue,
  loadPlaylist,
  pl,
  removeIndices,
} from "@/stores/playlist";
import type { PlaylistCursor } from "@/stores/playlist";
import type { Track } from "@/models/track";

function track(id: string): Track {
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
    duration: 1,
    durationMs: 1000,
    isMissing: false,
    sampleRateHz: null,
    bitDepth: null,
    isLossy: false,
    sourceCodec: null,
    bitrateKbps: null,
    bitrateMode: null,
  };
}

function cursor(partial: Partial<PlaylistCursor>): PlaylistCursor {
  return {
    tracks: [],
    index: 0,
    shuffle: false,
    shuffleOrder: [],
    shufflePos: 0,
    repeat: "off",
    ...partial,
  };
}

describe("computeNextIndex", () => {
  const three = [track("a"), track("b"), track("c")];

  it("covers off / one / all and shuffle peek", () => {
    expect(computeNextIndex(cursor({ tracks: [] }))).toBe(-1);
    expect(
      computeNextIndex(cursor({ tracks: three, index: 1, repeat: "one" })),
    ).toBe(1);
    expect(
      computeNextIndex(cursor({ tracks: three, index: 0, repeat: "off" })),
    ).toBe(1);
    expect(
      computeNextIndex(cursor({ tracks: three, index: 2, repeat: "all" })),
    ).toBe(0);
    expect(
      computeNextIndex(cursor({ tracks: three, index: 2, repeat: "off" })),
    ).toBe(-1);
    expect(
      computeNextIndex(
        cursor({
          tracks: three,
          index: 0,
          shuffle: true,
          shuffleOrder: [2, 0, 1],
          shufflePos: 0,
        }),
      ),
    ).toBe(0);
    expect(
      computeNextIndex(
        cursor({
          tracks: three,
          index: 1,
          shuffle: true,
          shuffleOrder: [0, 1, 2],
          shufflePos: 2,
        }),
      ),
    ).toBe(-1);
  });
});

describe("playlist store", () => {
  beforeEach(() => {
    pl.clear();
    pl.repeat = "off";
    pl.shuffle = false;
    vi.mocked(requestForget).mockClear();
  });

  it("adds, removes, reorders, and persists", () => {
    pl.add([track("a"), track("b")]);
    expect(pl.tracks.map((t) => t.id)).toEqual(["a", "b"]);
    pl.reorder(0, 1);
    expect(pl.tracks.map((t) => t.id)).toEqual(["b", "a"]);
    pl.removeIndices([0]);
    expect(pl.tracks.map((t) => t.id)).toEqual(["a"]);
    commit();
    const raw = localStorage.getItem("musicweb.playlist.v1");
    expect(raw).toBeTruthy();
    pl.clear();
    expect(pl.tracks).toEqual([]);
    loadPlaylist();
    expect(pl.tracks.map((t) => t.id)).toEqual(["a"]);
  });

  it("next/prev honor repeat modes", () => {
    pl.add([track("a"), track("b"), track("c")]);
    pl.index = 2;
    pl.repeat = "off";
    expect(pl.nextIndex()).toBe(-1);
    pl.index = 2;
    pl.repeat = "all";
    expect(pl.nextIndex()).toBe(0);
    pl.index = 1;
    pl.repeat = "one";
    expect(pl.nextIndex()).toBe(1);
    pl.index = 0;
    pl.repeat = "off";
    expect(pl.prevIndex()).toBe(0);
    pl.repeat = "all";
    expect(pl.prevIndex()).toBe(2);
  });

  it("rebuildShuffle is a permutation", () => {
    pl.add([track("a"), track("b"), track("c")]);
    pl.index = 1;
    pl.rebuildShuffle();
    expect([...pl.shuffleOrder].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it("idsLeavingQueue is last-occurrence only", () => {
    expect(idsLeavingQueue(["a"], [{ id: "b" }, { id: "a" }])).toEqual([]);
    expect(idsLeavingQueue(["a", "a"], [{ id: "b" }])).toEqual(["a"]);
    expect(idsLeavingQueue(["a", "b"], [{ id: "c" }])).toEqual(["a", "b"]);
  });

  it("clearPlaylist forgets unique ids", () => {
    pl.add([track("a"), track("b"), track("a")]);
    const stop = vi.fn();
    clearPlaylist(stop);
    expect(stop).toHaveBeenCalledOnce();
    expect(pl.tracks).toEqual([]);
    expect(requestForget).toHaveBeenCalledWith(["a", "b"]);
  });

  it("removeIndices forgets only when the last row of an id is gone", () => {
    pl.add([track("a"), track("b"), track("a")]);
    pl.index = 0;
    removeIndices([0], vi.fn(), vi.fn());
    expect(requestForget).toHaveBeenCalledWith([]);
    expect(pl.tracks.map((t) => t.id)).toEqual(["b", "a"]);
    removeIndices([1], vi.fn(), vi.fn());
    expect(requestForget).toHaveBeenLastCalledWith(["a"]);
    expect(pl.tracks.map((t) => t.id)).toEqual(["b"]);
  });
});
