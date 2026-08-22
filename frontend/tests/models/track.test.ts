import { describe, expect, it } from "vitest";
import { fromApiTrack, fromCatalogRecord } from "@/models/track";

describe("fromApiTrack", () => {
  it("maps snake_case API fields", () => {
    const track = fromApiTrack({
      id: "t1",
      path: "a/b.flac",
      title: "Song",
      artist: "A",
      album: "B",
      album_id: "alb",
      artist_id: "art",
      is_missing: false,
      is_lossy: true,
      source_codec: "mp3",
      bitrate_kbps: 320,
      bitrate_mode: "vbr",
      sample_rate_hz: 44100,
    });
    expect(track.albumId).toBe("alb");
    expect(track.isLossy).toBe(true);
    expect(track.sourceCodec).toBe("mp3");
    expect(track.path).toBe("a/b.flac");
    expect(track.bitrateKbps).toBe(320);
    expect(track.bitrateMode).toBe("vbr");
    expect(track.sampleRateHz).toBe(44100);
  });

  it("keeps a null path for missing tracks", () => {
    const track = fromApiTrack({
      id: "t1",
      path: null,
      is_missing: true,
    });
    expect(track.path).toBeNull();
    expect(track.isMissing).toBe(true);
  });
});

describe("fromCatalogRecord", () => {
  it("round-trips sampleRateHz and bitrateMode", () => {
    const track = fromCatalogRecord({
      trackId: "t1",
      title: "Song",
      artist: "A",
      album: "B",
      isLossy: true,
      sourceCodec: "aac",
      bitrateKbps: 256,
      sampleRateHz: 48000,
      bitrateMode: "cbr",
    });
    expect(track.sampleRateHz).toBe(48000);
    expect(track.bitrateMode).toBe("cbr");
    expect(track.bitrateKbps).toBe(256);
  });

  it("uses camel catalog fields only", () => {
    const track = fromCatalogRecord({
      trackId: "t2",
      title: "Old",
      artist: "A",
      album: "B",
      isLossy: true,
      sourceCodec: "mp3",
      bitrateKbps: 320,
      sampleRateHz: 44100,
      bitrateMode: "vbr",
    });
    expect(track.isLossy).toBe(true);
    expect(track.sourceCodec).toBe("mp3");
    expect(track.bitrateKbps).toBe(320);
    expect(track.sampleRateHz).toBe(44100);
    expect(track.bitrateMode).toBe("vbr");
  });
});
