import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function stubMacPwa() {
  vi.stubGlobal("navigator", {
    userAgentData: { platform: "macOS" },
    userAgent: "Mozilla/5.0 Macintosh",
    platform: "MacIntel",
  });
  vi.stubGlobal("window", {
    matchMedia: (q: string) => ({ matches: q.includes("display-mode: standalone") }),
  });
}

describe("cd store prefs", () => {
  beforeEach(() => {
    localStorage.clear();
    stubMacPwa();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("persists enable and drive; missing drive keeps the id", async () => {
    const { cd, setCdEnabled, setCdSelectedDriveId, setCdLive } = await import(
      "@/stores/cd"
    );
    setCdEnabled(true);
    setCdSelectedDriveId("/dev/rdisk2");
    expect(localStorage.getItem("musicweb.cd.enabled")).toBe("1");
    expect(localStorage.getItem("musicweb.cd.driveId")).toBe("/dev/rdisk2");
    setCdLive({ drives: [] });
    expect(cd.selectedDriveId).toBe("/dev/rdisk2");
    expect(cd.enabled).toBe(true);
  });

  it("cursor writes do not touch playlist storage", async () => {
    localStorage.setItem("musicweb.playlist.v1", '{"tracks":[{"id":"keep"}]}');
    const { setCdTracks, clearCdCursor, cd } = await import("@/stores/cd");
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
    expect(cd.tracks).toHaveLength(1);
    clearCdCursor();
    expect(cd.tracks).toHaveLength(0);
    expect(localStorage.getItem("musicweb.playlist.v1")).toContain("keep");
  });

  it("sentinel ids are cd:unknown:n", async () => {
    const { cd, setCdLive } = await import("@/stores/cd");
    const { sentinelTracksFromMedia } = await import("@/cd/identifyFlow");
    setCdLive({
      mediaPresent: true,
      toc: { first_track: 1, last_audio_track: 2, leadout_lba: 15000, offsets: [0, 7500] },
      cdText: { album: null, artist: null, tracks: [] },
    });
    const rows = sentinelTracksFromMedia();
    expect(rows.map((t) => t.id)).toEqual(["cd:unknown:1", "cd:unknown:2"]);
    expect(cd.toc?.last_audio_track).toBe(2);
  });

  it("does not auto-pick a drive", async () => {
    const { cd, setCdEnabled, setCdLive } = await import("@/stores/cd");
    setCdEnabled(true);
    setCdLive({ drives: [{ id: "a", name: "SuperDrive" }] });
    expect(cd.selectedDriveId).toBeNull();
  });
});
