import { describe, expect, it, vi } from "vitest";
import { buildAlbumMenuItems } from "@/components/library/albumMenuItems";
import { buildTrackMenuItems } from "@/components/library/trackMenuItems";
import { buildNowPlayingMenuItems } from "@/components/player/nowPlayingMenuItems";
import type { LibraryAlbum } from "@/components/library/loaders";
import type { Track } from "@/models/track";

vi.mock("@/router", () => ({ router: { push: vi.fn() } }));

const album: LibraryAlbum = {
  id: "al1",
  title: "LP",
  artist: "A",
};

const track: Track = {
  id: "t1",
  path: null,
  title: "Song",
  artist: "A",
  album: "LP",
  albumId: "al1",
  artistId: "ar1",
  albumArtist: "",
  albumArtistId: null,
  track: 1,
  disc: 1,
  year: null,
  duration: null,
  durationMs: null,
  isMissing: false,
  sampleRateHz: null,
  bitDepth: null,
  isLossy: false,
  sourceCodec: null,
  bitrateKbps: null,
  bitrateMode: null,
  artistBrowsable: true,
};

describe("buildAlbumMenuItems", () => {
  it("orders add, optional download, then copies", () => {
    const items = buildAlbumMenuItems({
      album,
      addAll: () => {},
      playAll: () => {},
      download: () => {},
    });
    expect(items.map((i) => i.id)).toEqual([
      "add-all",
      "play-all",
      "download",
      "copy-album",
      "copy-artist",
    ]);
    expect(items.filter((i) => i.id.startsWith("copy-")).every((i) => i.icon === "copy")).toBe(
      true,
    );
  });

  it("omits download and empty copies", () => {
    expect(
      buildAlbumMenuItems({
        album: { ...album, title: "", artist: "" },
        addAll: () => {},
        playAll: () => {},
      }).map((i) => i.id),
    ).toEqual(["add-all", "play-all"]);
  });
});

function expectCopyIcons(items: { id: string; icon?: string }[]) {
  expect(
    items.filter((i) => i.id.startsWith("copy-")).every((i) => i.icon === "copy"),
  ).toBe(true);
}

describe("buildTrackMenuItems", () => {
  it("orders add then copies", () => {
    const items = buildTrackMenuItems({
      title: "Song",
      artist: "A",
      album: "LP",
      addToPlaylist: () => {},
    });
    expect(items.map((i) => i.id)).toEqual([
      "add-to-playlist",
      "copy-title",
      "copy-artist",
      "copy-album",
    ]);
    expectCopyIcons(items);
  });

  it("omits empty copies", () => {
    expect(
      buildTrackMenuItems({
        title: "Song",
        addToPlaylist: () => {},
      }).map((i) => i.id),
    ).toEqual(["add-to-playlist", "copy-title"]);
  });
});

describe("buildNowPlayingMenuItems", () => {
  it("is copy-focused then go-to", () => {
    const items = buildNowPlayingMenuItems({
      track,
      offerCopyLyrics: true,
      copyLyrics: () => {},
    });
    expect(items.map((i) => i.id)).toEqual([
      "copy-title",
      "copy-artist",
      "copy-album",
      "copy-lyrics",
      "go-album",
      "go-artist",
    ]);
    expectCopyIcons(items);
  });

  it("hides copy-lyrics when not offered", () => {
    expect(
      buildNowPlayingMenuItems({
        track,
        offerCopyLyrics: false,
        copyLyrics: () => {},
      }).map((i) => i.id),
    ).toEqual(["copy-title", "copy-artist", "copy-album", "go-album", "go-artist"]);
  });

  it("omits go-artist when the performer is not browsable", () => {
    expect(
      buildNowPlayingMenuItems({
        track: { ...track, artistBrowsable: false },
        offerCopyLyrics: false,
        copyLyrics: () => {},
      }).map((i) => i.id),
    ).toEqual(["copy-title", "copy-artist", "copy-album", "go-album"]);
  });
});
