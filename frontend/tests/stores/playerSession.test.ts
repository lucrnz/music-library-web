import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const canUseRemote = vi.fn(() => false);

vi.mock("@/connectivity", () => ({
  canUseRemoteMedia: () => canUseRemote(),
  onConnectivityChange: vi.fn(() => () => {}),
}));

vi.mock("@/api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  fetchPlaylistTracks: vi.fn(),
  fetchTracksMeta: vi.fn(),
  coverUrl: (_ref: unknown, size: string) => `/api/cover?size=${size}`,
}));

vi.mock("@/playback/prepare", () => ({
  prepareTracks: vi.fn(),
  preparedKeys: new Set<string>(),
  requestForget: vi.fn(),
  requestPrepare: vi.fn(),
}));

vi.mock("@/downloads/resolve", () => ({
  resolveCoverUrl: vi.fn(
    async (
      _albumId: string | null,
      _size: string,
      remoteUrl: string | null,
      _enabled: boolean,
      opts: { offline?: boolean } = {},
    ) => {
      if (opts.offline) return "/static/img/placeholder.svg";
      return remoteUrl || "/static/img/placeholder.svg";
    },
  ),
}));

vi.mock("@/downloads/state", () => ({
  downloads: { enabled: false },
}));

import { pl } from "@/stores/playlist";
import { player } from "@/stores/playerState";
import {
  clearCovers,
  invalidateCoverCache,
  updateMediaSession,
} from "@/stores/playerSession";
import type { Track } from "@/models/track";
import { PLACEHOLDER_COVER } from "@/util";

function track(): Track {
  return {
    id: "t1",
    path: "t1.flac",
    title: "This Is a Call",
    artist: "Foo Fighters",
    album: "Foo Fighters",
    albumId: "alb1",
    artistId: null,
    albumArtist: "Foo Fighters",
    albumArtistId: null,
    track: 1,
    disc: 1,
    year: null,
    duration: 234,
    durationMs: 234000,
    isMissing: false,
    sampleRateHz: null,
    bitDepth: null,
    isLossy: false,
    sourceCodec: null,
    bitrateKbps: null,
    bitrateMode: null,
  };
}

describe("updateMediaSession covers", () => {
  beforeEach(() => {
    pl.clear();
    pl.add([track()]);
    pl.index = 0;
    invalidateCoverCache();
    clearCovers();
    canUseRemote.mockReturnValue(false);
  });

  afterEach(() => {
    pl.clear();
    invalidateCoverCache();
    clearCovers();
  });

  it("does not latch a placeholder when remote media is not yet confirmed", async () => {
    await updateMediaSession();
    expect(player.coverFull).toBe(PLACEHOLDER_COVER);
    canUseRemote.mockReturnValue(true);
    await updateMediaSession();
    expect(player.coverFull).toBe("/api/cover?size=full");
    expect(player.coverThumb).toBe("/api/cover?size=thumb");
  });

  it("latches after a remote resolve so a later call is a no-op", async () => {
    canUseRemote.mockReturnValue(true);
    await updateMediaSession();
    expect(player.coverFull).toBe("/api/cover?size=full");
    player.coverFull = "stale";
    await updateMediaSession();
    expect(player.coverFull).toBe("stale");
  });
});
