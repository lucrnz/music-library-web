import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  fetchPlaylistTracks: vi.fn(),
  fetchTracksMeta: vi.fn(),
  requestPrepare: vi.fn(),
  preparedKeys: () => [],
  requestForget: vi.fn(),
}));
vi.mock("@/diag/log", () => ({ emit: vi.fn() }));

import { applyPlaybackPosition } from "@/stores/playerPrefs";
import { writePlaybackPosition } from "@/stores/playbackPosition";
import { pl } from "@/stores/playlist";
import { player } from "@/stores/playerState";
import type { Track } from "@/models/track";

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
