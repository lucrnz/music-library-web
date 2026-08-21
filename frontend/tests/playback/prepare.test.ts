import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api", () => ({
  requestPrepare: vi.fn(),
}));
vi.mock("@/stores/exclusiveAudio", () => ({
  isExclusiveEnabled: vi.fn(() => false),
  getExclusiveProfileTag: vi.fn(() => null),
}));

import { requestPrepare } from "@/api";
import { catalogIndex } from "@/downloads/catalog";
import { prepareTracks, tracksToPrepare } from "@/playback/prepare";
import {
  getExclusiveProfileTag,
  isExclusiveEnabled,
} from "@/stores/exclusiveAudio";
import { settings } from "@/stores/settings";
import type { Track } from "@/models/track";

function track(id: string, extra: Partial<Track> = {}): Track {
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
    sampleRateHz: 44100,
    bitDepth: 16,
    isLossy: false,
    sourceCodec: "flac",
    bitrateKbps: null,
    bitrateMode: null,
    ...extra,
  };
}

describe("prepareTracks", () => {
  beforeEach(() => {
    vi.mocked(requestPrepare).mockClear();
    vi.mocked(isExclusiveEnabled).mockReturnValue(false);
    vi.mocked(getExclusiveProfileTag).mockReturnValue(null);
    catalogIndex.byTrack = {};
    settings.playbackPolicy = "prefer_better";
    settings.options = [
      { id: "opus_192_48000", kind: "opus" },
      { id: "flac_16_44100", kind: "flac" },
    ];
    settings.streamCodec = "opus_192_48000";
  });

  it("exclusive groups by tag and does not pass the browser codec", () => {
    vi.mocked(isExclusiveEnabled).mockReturnValue(true);
    vi.mocked(getExclusiveProfileTag).mockImplementation((t) =>
      t?.id === "a" ? "flac_16_44100" : "flac_24_96000",
    );
    prepareTracks([track("a"), track("b")]);
    expect(requestPrepare).toHaveBeenCalledTimes(2);
    const tags = vi.mocked(requestPrepare).mock.calls.map((c) => c[1]);
    expect(tags).toContain("flac_16_44100");
    expect(tags).toContain("flac_24_96000");
    expect(tags).not.toContain("opus_192_48000");
  });

  it("HTML skips a projected local-better id", () => {
    catalogIndex.byTrack = {
      a: { codec: "flac_16_44100", status: "ready" },
    };
    const need = tracksToPrepare(
      [track("a"), track("b")],
      "opus_192_48000",
    );
    expect(need.map((t) => t.id)).toEqual(["b"]);
    prepareTracks([track("a"), track("b")]);
    expect(requestPrepare).toHaveBeenCalledOnce();
    expect(vi.mocked(requestPrepare).mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: "b" }),
    ]);
    expect(vi.mocked(requestPrepare).mock.calls[0][1]).toBe("opus_192_48000");
  });
});
