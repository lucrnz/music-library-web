import { describe, expect, it, vi } from "vitest";
import { buildAlbumMenuItems } from "@/components/library/albumMenuItems";
import { buildFolderMenuItems } from "@/components/library/folderMenuItems";
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
};

describe("buildAlbumMenuItems", () => {
  it("orders add, optional download, then copies", () => {
    expect(
      buildAlbumMenuItems({
        album,
        addAll: () => {},
        download: () => {},
      }).map((i) => i.id),
    ).toEqual(["add-all", "download", "copy-album", "copy-artist"]);
  });

  it("omits download and empty copies", () => {
    expect(
      buildAlbumMenuItems({
        album: { ...album, title: "", artist: "" },
        addAll: () => {},
      }).map((i) => i.id),
    ).toEqual(["add-all"]);
  });
});

describe("buildTrackMenuItems", () => {
  it("orders add then copies", () => {
    expect(
      buildTrackMenuItems({
        title: "Song",
        artist: "A",
        album: "LP",
        addToPlaylist: () => {},
      }).map((i) => i.id),
    ).toEqual(["add-to-playlist", "copy-title", "copy-artist", "copy-album"]);
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

describe("buildFolderMenuItems", () => {
  it("copies name and path", () => {
    expect(
      buildFolderMenuItems({
        dir: { name: "Jazz", path: "/music/Jazz" },
        addAll: () => {},
      }).map((i) => i.id),
    ).toEqual(["add-all", "copy-folder-name", "copy-folder-path"]);
  });
});

describe("buildNowPlayingMenuItems", () => {
  it("is copy-focused then go-to", () => {
    expect(
      buildNowPlayingMenuItems({
        track,
        offerCopyLyrics: true,
        copyLyrics: () => {},
      }).map((i) => i.id),
    ).toEqual([
      "copy-title",
      "copy-artist",
      "copy-album",
      "copy-lyrics",
      "go-album",
      "go-artist",
    ]);
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
});
