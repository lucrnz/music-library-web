import { describe, expect, it } from "vitest";
import { formatAlbumMeta, formatPlayingSubtitle, formatTrackCount } from "@/util";

describe("formatTrackCount", () => {
  it("uses singular for one", () => {
    expect(formatTrackCount(1)).toBe("1 track");
  });

  it("uses plural otherwise", () => {
    expect(formatTrackCount(12)).toBe("12 tracks");
    expect(formatTrackCount(0)).toBe("0 tracks");
  });
});

describe("formatAlbumMeta", () => {
  it("joins artist, year, count, and duration", () => {
    expect(
      formatAlbumMeta({
        artist: "Artist",
        year: 1996,
        trackCount: 11,
        durationSec: 2912,
      }),
    ).toBe("Artist · 1996 · 11 tracks · 48:32");
  });

  it("omits year when missing", () => {
    expect(
      formatAlbumMeta({
        artist: "Artist",
        trackCount: 11,
        durationSec: 2912,
      }),
    ).toBe("Artist · 11 tracks · 48:32");
  });

  it("omits duration when null instead of printing 0:00", () => {
    expect(
      formatAlbumMeta({
        year: 1996,
        trackCount: 11,
        durationSec: null,
      }),
    ).toBe("1996 · 11 tracks");
  });

  it("formats artists-tree shape without artist", () => {
    expect(
      formatAlbumMeta({
        year: 1996,
        trackCount: 11,
        durationSec: 2912,
      }),
    ).toBe("1996 · 11 tracks · 48:32");
  });

  it("returns empty when nothing is present", () => {
    expect(formatAlbumMeta({})).toBe("");
  });

  it("keeps m:ss past 59 minutes", () => {
    expect(
      formatAlbumMeta({
        year: 1996,
        trackCount: 20,
        durationSec: 4212,
      }),
    ).toBe("1996 · 20 tracks · 70:12");
  });
});

describe("formatPlayingSubtitle", () => {
  it("joins artist and album with year in parentheses", () => {
    expect(
      formatPlayingSubtitle({
        artist: "Artist",
        album: "Album",
        year: 1996,
      }),
    ).toBe("Artist - Album (1996)");
  });

  it("omits parentheses when year is missing", () => {
    expect(
      formatPlayingSubtitle({ artist: "Artist", album: "Album" }),
    ).toBe("Artist - Album");
  });

  it("keeps a single side when the other is empty", () => {
    expect(formatPlayingSubtitle({ artist: "Artist" })).toBe("Artist");
  });

  it("returns empty when nothing is present", () => {
    expect(formatPlayingSubtitle({})).toBe("");
    expect(formatPlayingSubtitle({ year: 1996 })).toBe("");
  });
});
