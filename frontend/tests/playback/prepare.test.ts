import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/playback/deliveryPolicy", () => ({
  activeDelivery: vi.fn(),
}));

import { catalogIndex } from "@/downloads/catalog";
import { activeDelivery } from "@/playback/deliveryPolicy";
import {
  preparedKeys,
  prepareTracks,
  tracksToPrepare,
} from "@/playback/prepare";
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

function prepareBodies() {
  return vi.mocked(fetch).mock.calls.map(([, init]) =>
    JSON.parse(String(init?.body)) as {
      ids: string[];
      codec: string;
      replace: boolean;
      urgent: boolean;
    },
  );
}

describe("prepareTracks", () => {
  beforeEach(() => {
    preparedKeys.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
        text: async () => "",
      }),
    );
    vi.mocked(activeDelivery).mockReturnValue({
      sink: "htmlAudio",
      profileFor: () => settings.streamCodec,
    });
    catalogIndex.byTrack = {};
    settings.playbackPolicy = "prefer_better";
    settings.options = [
      { id: "opus_192_48000", kind: "opus" },
      { id: "flac_16_44100", kind: "flac" },
    ];
    settings.streamCodec = "opus_192_48000";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exclusive groups by tag and does not pass the browser codec", () => {
    vi.mocked(activeDelivery).mockReturnValue({
      sink: "companion",
      profileFor: (t) => (t?.id === "a" ? "flac_16_44100" : "flac_24_96000"),
    });
    prepareTracks([track("a"), track("b")]);
    const tags = prepareBodies().map((b) => b.codec);
    expect(tags).toHaveLength(2);
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
    const bodies = prepareBodies();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].ids).toEqual(["b"]);
    expect(bodies[0].codec).toBe("opus_192_48000");
  });
});
