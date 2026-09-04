import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listCdrom, cdLoad } = vi.hoisted(() => ({
  listCdrom: vi.fn(() => true),
  cdLoad: vi.fn(async () => {}),
}));

vi.mock("@/exclusive/opticalClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/exclusive/opticalClient")>();
  return { ...actual, listCdrom };
});

vi.mock("@/playback/cdLoad", () => ({ cdLoad }));

import {
  applyCdromIndex,
  applyCdromList,
  clearCdromTree,
  collectFilesRecursive,
  forgetCdromIndex,
  formatCdromLabel,
  listingOf,
  sortCdromFiles,
  startCdromSession,
  trackFromCdromFile,
  type CdromFileNode,
} from "@/cd/cdrom";
import {
  cdromAdd,
  cdromClear,
  cdromPlayAll,
  cdromPlayOrQueue,
  cdromRemoveAt,
  cdromReorder,
} from "@/cd/cdromQueue";
import { rememberLyricsMemory, peekLyricsMemory } from "@/lyrics/cache";
import { handleOpticalMessage } from "@/exclusive/opticalClient";
import { cd, setCdLive, setCdTracks } from "@/stores/cd";
import { player } from "@/stores/playerState";

function file(
  rel: string,
  extra: Partial<CdromFileNode> = {},
): CdromFileNode {
  const name = rel.includes("/") ? rel.slice(rel.lastIndexOf("/") + 1) : rel;
  return {
    name,
    rel,
    sourceCodec: "mp3",
    title: extra.title ?? null,
    artist: extra.artist ?? null,
    album: extra.album ?? null,
    albumartist: extra.albumartist ?? null,
    track: extra.track ?? null,
    disc: extra.disc ?? null,
    year: extra.year ?? null,
    duration: extra.duration ?? null,
    sampleRateHz: extra.sampleRateHz ?? null,
    bitDepth: extra.bitDepth ?? null,
    channels: extra.channels ?? null,
    hasCover: extra.hasCover ?? false,
    hasLocalLyrics: extra.hasLocalLyrics ?? false,
    ...extra,
  };
}

describe("cdrom queue", () => {
  beforeEach(() => {
    listCdrom.mockClear();
    cdLoad.mockClear();
    forgetCdromIndex();
    setCdTracks([]);
    setCdLive({ mediaKind: "data", mediaPresent: true });
    player.paused = true;
  });

  afterEach(() => {
    clearCdromTree();
  });

  it("auto-adds a one-folder index", () => {
    applyCdromIndex({
      volumeName: "MYCD",
      autoAddRel: "Music",
      folders: [{ rel: "Music", fileCount: 2 }],
    });
    applyCdromList({
      rel: "Music",
      dirs: [],
      files: [
        {
          name: "a.mp3",
          rel: "Music/a.mp3",
          source_codec: "mp3",
          title: "One",
          artist: "A",
          album: "Disc",
        },
        {
          name: "b.flac",
          rel: "Music/b.flac",
          source_codec: "flac",
          title: "Two",
          artist: "A",
          album: "Disc",
        },
      ],
    });
    expect(cd.tracks.map((t) => t.id)).toEqual([
      "cdrom:Music/a.mp3",
      "cdrom:Music/b.flac",
    ]);
    expect(cd.tracks[0].isLossy).toBe(true);
    expect(cd.tracks[1].isLossy).toBe(false);
    expect(cd.face).toBe("data");
  });

  it("two folders leave the queue empty; empty walk is no_playable", () => {
    applyCdromIndex({
      volumeName: "MYCD",
      autoAddRel: null,
      folders: [
        { rel: "A", fileCount: 1 },
        { rel: "B", fileCount: 1 },
      ],
    });
    applyCdromList({
      rel: "A",
      dirs: [],
      files: [{ name: "a.mp3", rel: "A/a.mp3", source_codec: "mp3" }],
    });
    applyCdromList({
      rel: "B",
      dirs: [],
      files: [{ name: "b.mp3", rel: "B/b.mp3", source_codec: "mp3" }],
    });
    expect(cd.tracks).toHaveLength(0);
    expect(cd.face).toBe("data");

    applyCdromIndex({
      volumeName: "EMPTY",
      autoAddRel: null,
      folders: [{ rel: "", fileCount: 0 }],
    });
    applyCdromList({ rel: "", dirs: [], files: [] });
    expect(cd.face).toBe("no_playable");
  });

  it("mount-pending stays data / Data CD", () => {
    applyCdromIndex({
      volumeName: null,
      autoAddRel: null,
      folders: [{ rel: "", fileCount: 0 }],
    });
    applyCdromList({ rel: "", dirs: [], files: [] });
    expect(cd.face).toBe("data");
    expect(cd.volumeName).toBeNull();
  });

  it("listingOf sorts numbered files first", () => {
    applyCdromIndex({
      volumeName: "MYCD",
      autoAddRel: "",
      folders: [{ rel: "", fileCount: 3 }],
    });
    applyCdromList({
      rel: "",
      dirs: [],
      files: [
        { name: "z.mp3", rel: "z.mp3", source_codec: "mp3" },
        { name: "b.mp3", rel: "b.mp3", source_codec: "mp3", track: 2, disc: 1 },
        { name: "a.mp3", rel: "a.mp3", source_codec: "mp3", track: 1, disc: 1 },
      ],
    });
    expect(listingOf("").files.map((f) => f.rel)).toEqual([
      "a.mp3",
      "b.mp3",
      "z.mp3",
    ]);
  });

  it("recursive collect stays in folder order, sorted per folder", () => {
    applyCdromIndex({
      volumeName: "MYCD",
      autoAddRel: null,
      folders: [
        { rel: "B", fileCount: 1 },
        { rel: "A", fileCount: 2 },
      ],
    });
    applyCdromList({
      rel: "",
      dirs: [
        { name: "B", rel: "B" },
        { name: "A", rel: "A" },
      ],
      files: [],
    });
    applyCdromList({
      rel: "A",
      dirs: [],
      files: [
        { name: "z.mp3", rel: "A/z.mp3", source_codec: "mp3" },
        { name: "a.mp3", rel: "A/a.mp3", source_codec: "mp3", track: 1 },
      ],
    });
    applyCdromList({
      rel: "B",
      dirs: [],
      files: [{ name: "b.mp3", rel: "B/b.mp3", source_codec: "mp3", track: 1 }],
    });
    expect(collectFilesRecursive("").map((f) => f.rel)).toEqual([
      "A/a.mp3",
      "A/z.mp3",
      "B/b.mp3",
    ]);
  });

  it("sorts numbered first then filename", () => {
    const sorted = sortCdromFiles([
      file("z.mp3"),
      file("b.mp3", { track: 2, disc: 1 }),
      file("a.mp3", { track: 1, disc: 1 }),
    ]);
    expect(sorted.map((f) => f.rel)).toEqual(["a.mp3", "b.mp3", "z.mp3"]);
  });

  it("play-or-queue starts only when empty or paused", () => {
    const a = trackFromCdromFile(file("a.mp3", { title: "A" }));
    const b = trackFromCdromFile(file("b.mp3", { title: "B" }));
    cdromPlayOrQueue(a);
    expect(cdLoad).toHaveBeenCalledWith(0);
    cdLoad.mockClear();
    player.paused = false;
    cdromPlayOrQueue(b);
    expect(cdLoad).not.toHaveBeenCalled();
    expect(cd.tracks).toHaveLength(2);
    player.paused = true;
    cdromPlayOrQueue(trackFromCdromFile(file("c.mp3", { title: "C" })));
    expect(cdLoad).toHaveBeenCalled();
  });

  it("play all replaces the CD queue", () => {
    applyCdromIndex({
      volumeName: "MYCD",
      autoAddRel: null,
      folders: [{ rel: "Music", fileCount: 2 }],
    });
    applyCdromList({
      rel: "Music",
      dirs: [],
      files: [
        { name: "a.mp3", rel: "Music/a.mp3", source_codec: "mp3" },
        { name: "b.mp3", rel: "Music/b.mp3", source_codec: "mp3" },
      ],
    });
    setCdTracks([trackFromCdromFile(file("old.mp3", { title: "Old" }))]);
    cdromPlayAll("Music");
    expect(cd.tracks.map((t) => t.path)).toEqual([
      "Music/a.mp3",
      "Music/b.mp3",
    ]);
    expect(cdLoad).toHaveBeenCalledWith(0);
  });

  it("patches queue titles by rel without moving the cursor", () => {
    applyCdromIndex({
      volumeName: "MYCD",
      autoAddRel: "Music",
      folders: [{ rel: "Music", fileCount: 1 }],
    });
    applyCdromList({
      rel: "Music",
      dirs: [],
      files: [{ name: "a.mp3", rel: "Music/a.mp3", source_codec: "mp3" }],
    });
    cd.index = 0;
    applyCdromList({
      rel: "Music",
      dirs: [],
      files: [
        {
          name: "a.mp3",
          rel: "Music/a.mp3",
          source_codec: "mp3",
          title: "Tagged",
          artist: "Band",
          album: "LP",
          has_cover: true,
        },
      ],
    });
    expect(cd.index).toBe(0);
    expect(cd.tracks[0].title).toBe("Tagged");
    expect(cd.tracks[0].artist).toBe("Band");
  });

  it("startCdromSession without an index does not auto-add a premature list", () => {
    startCdromSession();
    applyCdromList({
      rel: "",
      dirs: [],
      files: [{ name: "a.mp3", rel: "a.mp3", source_codec: "mp3" }],
    });
    expect(cd.tracks).toHaveLength(0);
  });

  it("a new index drops cdrom lyrics memory", () => {
    rememberLyricsMemory("cdrom:Music/a.mp3", {
      trackId: "cdrom:Music/a.mp3",
      status: "ok",
      source: "lrclib",
      isSynced: false,
      plainText: "old disc",
      syncedLrc: null,
      instrumental: false,
    });
    rememberLyricsMemory("lib-track", {
      trackId: "lib-track",
      status: "ok",
      source: "lrclib",
      isSynced: false,
      plainText: "library",
      syncedLrc: null,
      instrumental: false,
    });
    applyCdromIndex({
      volumeName: "NEW",
      autoAddRel: null,
      folders: [{ rel: "", fileCount: 0 }],
    });
    expect(peekLyricsMemory("cdrom:Music/a.mp3")).toBeUndefined();
    expect(peekLyricsMemory("lib-track")?.plainText).toBe("library");
  });

  it("startCdromSession without an index drops leftover Red Book rows", () => {
    setCdTracks([
      {
        id: "cd:unknown:1",
        path: null,
        title: "Track 1",
        artist: "Unknown Artist",
        album: "Audio CD",
        albumId: null,
        artistId: null,
        albumArtist: "Unknown Artist",
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
        sourceCodec: "cdda",
        bitrateKbps: null,
        bitrateMode: null,
      },
    ]);
    startCdromSession();
    expect(cd.tracks).toHaveLength(0);
  });

  it("Leave then startCdromSession re-lists and auto-adds from lastIndex", () => {
    applyCdromIndex({
      volumeName: "MYCD",
      autoAddRel: "Music",
      folders: [{ rel: "Music", fileCount: 1 }],
      generation: 2,
    });
    applyCdromList({
      rel: "Music",
      dirs: [],
      files: [{ name: "a.mp3", rel: "Music/a.mp3", source_codec: "mp3" }],
    });
    expect(cd.tracks).toHaveLength(1);
    clearCdromTree();
    setCdTracks([]);
    listCdrom.mockClear();
    startCdromSession();
    expect(listCdrom).toHaveBeenCalled();
    applyCdromList({
      rel: "Music",
      dirs: [],
      files: [{ name: "a.mp3", rel: "Music/a.mp3", source_codec: "mp3" }],
    });
    expect(cd.tracks.map((t) => t.id)).toEqual(["cdrom:Music/a.mp3"]);
  });

  it("parses generation from a pushed cdrom_index", () => {
    handleOpticalMessage({
      type: "cdrom_index",
      volume_name: "MYCD",
      auto_add_rel: "Music",
      folders: [{ rel: "Music", file_count: 1 }],
      generation: 7,
    });
    applyCdromList({
      rel: "Music",
      dirs: [],
      files: [{ name: "a.mp3", rel: "Music/a.mp3", source_codec: "mp3" }],
    });
    expect(cd.tracks).toHaveLength(1);
    handleOpticalMessage({
      type: "cdrom_index",
      volume_name: "MYCD",
      auto_add_rel: "Music",
      folders: [{ rel: "Music", file_count: 1 }],
      generation: 7,
    });
    expect(cd.tracks.map((t) => t.id)).toEqual(["cdrom:Music/a.mp3"]);
  });

  it("same generation index does not wipe a live queue", () => {
    applyCdromIndex({
      volumeName: "MYCD",
      autoAddRel: "Music",
      folders: [{ rel: "Music", fileCount: 1 }],
      generation: 3,
    });
    applyCdromList({
      rel: "Music",
      dirs: [],
      files: [{ name: "a.mp3", rel: "Music/a.mp3", source_codec: "mp3", title: "A" }],
    });
    expect(cd.tracks).toHaveLength(1);
    listCdrom.mockClear();
    applyCdromIndex({
      volumeName: "MYCD",
      autoAddRel: "Music",
      folders: [{ rel: "Music", fileCount: 1 }],
      generation: 3,
    });
    expect(cd.tracks.map((t) => t.id)).toEqual(["cdrom:Music/a.mp3"]);
    expect(cd.tracks[0].title).toBe("A");
    expect(listCdrom).not.toHaveBeenCalled();
  });

  it("new generation rebuilds the queue", () => {
    applyCdromIndex({
      volumeName: "MYCD",
      autoAddRel: "Music",
      folders: [{ rel: "Music", fileCount: 1 }],
      generation: 3,
    });
    applyCdromList({
      rel: "Music",
      dirs: [],
      files: [{ name: "a.mp3", rel: "Music/a.mp3", source_codec: "mp3" }],
    });
    applyCdromIndex({
      volumeName: "OTHER",
      autoAddRel: "Music",
      folders: [{ rel: "Music", fileCount: 1 }],
      generation: 4,
    });
    expect(cd.tracks).toHaveLength(0);
  });

  it("ignores cdrom_index while a Red Book disc is live", () => {
    setCdLive({ mediaKind: "audio", mediaPresent: true });
    setCdTracks([
      {
        id: "cd:unknown:1",
        path: null,
        title: "Track 1",
        artist: "Unknown Artist",
        album: "Audio CD",
        albumId: null,
        artistId: null,
        albumArtist: "Unknown Artist",
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
        sourceCodec: "cdda",
        bitrateKbps: null,
        bitrateMode: null,
      },
    ]);
    applyCdromIndex({
      volumeName: "MYCD",
      autoAddRel: "",
      folders: [{ rel: "", fileCount: 1 }],
    });
    expect(cd.tracks[0]?.id).toBe("cd:unknown:1");
  });

  it("add / remove / clear / reorder mutate only the CD cursor", () => {
    const a = trackFromCdromFile(file("a.mp3", { title: "A" }));
    const b = trackFromCdromFile(file("b.mp3", { title: "B" }));
    const c = trackFromCdromFile(file("c.mp3", { title: "C" }));
    cdromAdd(a);
    cdromAdd(b);
    cdromAdd(c);
    expect(cd.tracks.map((t) => t.title)).toEqual(["A", "B", "C"]);
    cdromReorder(0, 2);
    expect(cd.tracks.map((t) => t.title)).toEqual(["B", "C", "A"]);
    cdromRemoveAt(1);
    expect(cd.tracks.map((t) => t.title)).toEqual(["B", "A"]);
    cdromClear();
    expect(cd.tracks).toHaveLength(0);
  });

  it("formats labels with title/artist/album fallbacks", () => {
    expect(formatCdromLabel({ name: "x.mp3" })).toBe("x");
    expect(formatCdromLabel({ name: "x.mp3", title: "Hi" })).toBe("Hi");
    expect(formatCdromLabel({ name: "x.mp3", title: "Hi", artist: "A" })).toBe(
      "Hi - A",
    );
    expect(
      formatCdromLabel({ name: "x.mp3", title: "Hi", artist: "A", album: "B" }),
    ).toBe("Hi - A [B]");
  });
});
