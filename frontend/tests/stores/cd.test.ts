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

  it("second desktop toggle leaves and does not rewrite the playlist", async () => {
    localStorage.setItem("musicweb.playlist.v1", '{"tracks":[{"id":"keep"}]}');
    const {
      enterCdMode,
      leaveCdMode,
      toggleCdSession,
      setCdEnabled,
      setCdSelectedDriveId,
    } = await import("@/stores/cd");
    const { activeSession, onLeaveCd } = await import("@/playback/session");
    setCdEnabled(true);
    setCdSelectedDriveId("/dev/rdisk2");
    onLeaveCd(() => leaveCdMode());
    enterCdMode();
    expect(activeSession()).toBe("cd");
    toggleCdSession();
    expect(activeSession()).toBe("none");
    expect(localStorage.getItem("musicweb.playlist.v1")).toContain("keep");
    onLeaveCd(null);
  });

  it("re-enter while already cd keeps a live data queue", async () => {
    const { cd, enterCdMode, setCdEnabled, setCdSelectedDriveId, setCdTracks } =
      await import("@/stores/cd");
    setCdEnabled(true);
    setCdSelectedDriveId("/dev/rdisk2");
    enterCdMode();
    setCdTracks([
      {
        id: "cdrom:a.mp3",
        path: "a.mp3",
        title: "A",
        artist: "",
        album: "",
        albumId: null,
        artistId: null,
        albumArtist: "",
        albumArtistId: null,
        track: 1,
        disc: null,
        year: null,
        duration: 1,
        durationMs: 1000,
        isMissing: false,
        sampleRateHz: null,
        bitDepth: null,
        isLossy: true,
        sourceCodec: "mp3",
        bitrateKbps: null,
        bitrateMode: null,
      },
    ]);
    cd.shuffle = true;
    cd.repeat = "all";
    enterCdMode();
    expect(cd.tracks).toHaveLength(1);
    expect(cd.tracks[0].id).toBe("cdrom:a.mp3");
    expect(cd.shuffle).toBe(true);
    expect(cd.repeat).toBe("all");
  });

  it("re-enter while already cd keeps shuffle", async () => {
    const { cd, enterCdMode, setCdEnabled, setCdSelectedDriveId } = await import(
      "@/stores/cd"
    );
    setCdEnabled(true);
    setCdSelectedDriveId("/dev/rdisk2");
    enterCdMode();
    cd.shuffle = true;
    enterCdMode();
    expect(cd.shuffle).toBe(true);
  });

  it("cdEntryAllowed needs capable, enable, and a stored drive", async () => {
    const {
      cd,
      cdEntryAllowed,
      setCdEnabled,
      setCdSelectedDriveId,
      setCdLive,
    } = await import("@/stores/cd");
    expect(cdEntryAllowed()).toBe(false);
    setCdEnabled(true);
    expect(cdEntryAllowed()).toBe(false);
    setCdSelectedDriveId("/dev/rdisk2");
    expect(cdEntryAllowed()).toBe(true);
    setCdLive({ drives: [] });
    expect(cd.selectedDriveId).toBe("/dev/rdisk2");
    expect(cdEntryAllowed()).toBe(true);
    setCdEnabled(false);
    expect(cdEntryAllowed()).toBe(false);
    expect(cd.selectedDriveId).toBe("/dev/rdisk2");
  });

  it("disabling while session is cd leaves and keeps the drive", async () => {
    const {
      cd,
      setCdEnabled,
      setCdSelectedDriveId,
      enterCdMode,
      leaveCdMode,
    } = await import("@/stores/cd");
    const { activeSession, onLeaveCd } = await import("@/playback/session");
    setCdEnabled(true);
    setCdSelectedDriveId("/dev/rdisk2");
    onLeaveCd(() => leaveCdMode());
    enterCdMode();
    expect(activeSession()).toBe("cd");
    setCdEnabled(false);
    expect(activeSession()).toBe("none");
    expect(cd.selectedDriveId).toBe("/dev/rdisk2");
    expect(localStorage.getItem("musicweb.cd.driveId")).toBe("/dev/rdisk2");
    onLeaveCd(null);
  });

  it("clearing the drive while session is cd leaves", async () => {
    const { setCdEnabled, setCdSelectedDriveId, enterCdMode, leaveCdMode } =
      await import("@/stores/cd");
    const { activeSession, onLeaveCd } = await import("@/playback/session");
    setCdEnabled(true);
    setCdSelectedDriveId("/dev/rdisk2");
    onLeaveCd(() => leaveCdMode());
    enterCdMode();
    expect(activeSession()).toBe("cd");
    setCdSelectedDriveId(null);
    expect(activeSession()).toBe("none");
    onLeaveCd(null);
  });

  it("enterCdMode without enable and drive does not occupy cd", async () => {
    const { enterCdMode } = await import("@/stores/cd");
    const { activeSession } = await import("@/playback/session");
    enterCdMode();
    expect(activeSession()).toBe("none");
  });

  it("disabling while session is none stays none", async () => {
    const { setCdEnabled, setCdSelectedDriveId } = await import("@/stores/cd");
    const { activeSession } = await import("@/playback/session");
    setCdEnabled(true);
    setCdSelectedDriveId("/dev/rdisk2");
    expect(activeSession()).toBe("none");
    setCdEnabled(false);
    expect(activeSession()).toBe("none");
  });

  it("does not auto-pick a drive", async () => {
    const { cd, setCdEnabled, setCdLive } = await import("@/stores/cd");
    setCdEnabled(true);
    setCdLive({ drives: [{ id: "a", name: "SuperDrive", key: "Apple|SuperDrive" }] });
    expect(cd.selectedDriveId).toBeNull();
  });

  it("rematch adopts a unique hardware key after the BSD id changes", async () => {
    const { cd, setCdEnabled, setCdSelectedDriveId, setCdLive, refreshCdFace } =
      await import("@/stores/cd");
    setCdEnabled(true);
    setCdLive({
      drives: [
        { id: "/dev/rdisk2", name: "Apple SuperDrive", key: "Apple|SuperDrive" },
      ],
    });
    setCdSelectedDriveId("/dev/rdisk2");
    expect(localStorage.getItem("musicweb.cd.driveKey")).toBe("Apple|SuperDrive");
    setCdLive({
      drives: [
        { id: "/dev/rdisk3", name: "Apple SuperDrive", key: "Apple|SuperDrive" },
      ],
    });
    expect(cd.selectedDriveId).toBe("/dev/rdisk3");
    expect(cd.selectedDriveKey).toBe("Apple|SuperDrive");
    expect(localStorage.getItem("musicweb.cd.driveId")).toBe("/dev/rdisk3");
    expect(localStorage.getItem("musicweb.cd.driveKey")).toBe("Apple|SuperDrive");
    refreshCdFace();
    expect(cd.face).not.toBe("drive_missing");
  });

  it("ambiguous key does not auto-pick; empty list keeps the stored key", async () => {
    const { cd, setCdEnabled, setCdSelectedDriveId, setCdLive, refreshCdFace } =
      await import("@/stores/cd");
    setCdEnabled(true);
    setCdLive({
      drives: [
        { id: "/dev/rdisk2", name: "Apple SuperDrive", key: "Apple|SuperDrive" },
      ],
    });
    setCdSelectedDriveId("/dev/rdisk2");
    setCdLive({
      drives: [
        { id: "/dev/rdisk3", name: "Apple SuperDrive", key: "Apple|SuperDrive" },
        { id: "/dev/rdisk4", name: "Apple SuperDrive", key: "Apple|SuperDrive" },
      ],
    });
    expect(cd.selectedDriveId).toBe("/dev/rdisk2");
    const { exclusiveAudio } = await import("@/stores/exclusiveAudio");
    exclusiveAudio.connection = "connected";
    refreshCdFace();
    expect(cd.face).toBe("drive_missing");
    setCdLive({ drives: [] });
    expect(cd.selectedDriveId).toBe("/dev/rdisk2");
    expect(cd.selectedDriveKey).toBe("Apple|SuperDrive");
    expect(localStorage.getItem("musicweb.cd.driveKey")).toBe("Apple|SuperDrive");
  });
});

describe("cd live media and watch", () => {
  const watchOptical = vi.fn(() => true);
  const identifyCd = vi.fn(async () => ({
    discid: "x",
    matches: [],
    applied: null,
    cd_text: null,
  }));

  beforeEach(() => {
    localStorage.clear();
    stubMacPwa();
    watchOptical.mockReset();
    watchOptical.mockReturnValue(true);
    identifyCd.mockReset();
    identifyCd.mockResolvedValue({
      discid: "x",
      matches: [],
      applied: null,
      cd_text: null,
    });
    vi.resetModules();
    vi.doMock("@/exclusive/opticalClient", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/exclusive/opticalClient")>();
      return { ...actual, watchOptical };
    });
    vi.doMock("@/api", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/api")>();
      return { ...actual, identifyCd };
    });
  });

  afterEach(() => {
    vi.doUnmock("@/exclusive/opticalClient");
    vi.doUnmock("@/api");
    vi.resetModules();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("hello re-sends watch when session is cd", async () => {
    const { cd, setCdEnabled, setCdSelectedDriveId, setCdLive, enterCdMode } =
      await import("@/stores/cd");
    const { onCompanionHello } = await import("@/exclusive/opticalClient");
    setCdEnabled(true);
    setCdLive({
      drives: [{ id: "/dev/rdisk2", name: "SuperDrive", key: "Apple|SuperDrive" }],
    });
    setCdSelectedDriveId("/dev/rdisk2");
    enterCdMode();
    watchOptical.mockClear();
    onCompanionHello();
    expect(watchOptical).toHaveBeenCalledWith(true, "/dev/rdisk2");
    expect(cd.selectedDriveId).toBe("/dev/rdisk2");
  });

  it("rematch plus hello watches the new bsd id", async () => {
    const { setCdEnabled, setCdSelectedDriveId, setCdLive, enterCdMode } =
      await import("@/stores/cd");
    const { onCompanionHello } = await import("@/exclusive/opticalClient");
    setCdEnabled(true);
    setCdLive({
      drives: [{ id: "/dev/rdisk2", name: "SuperDrive", key: "Apple|SuperDrive" }],
    });
    setCdSelectedDriveId("/dev/rdisk2");
    enterCdMode();
    setCdLive({
      drives: [{ id: "/dev/rdisk3", name: "SuperDrive", key: "Apple|SuperDrive" }],
    });
    watchOptical.mockClear();
    onCompanionHello();
    expect(watchOptical).toHaveBeenCalledWith(true, "/dev/rdisk3");
  });

  it("data kind starts cdrom session and does not identify", async () => {
    const { cd, enterCdMode, setCdEnabled, setCdSelectedDriveId } = await import(
      "@/stores/cd"
    );
    const { handleOpticalMessage } = await import("@/exclusive/opticalClient");
    setCdEnabled(true);
    setCdSelectedDriveId("/dev/rdisk2");
    enterCdMode();
    handleOpticalMessage({
      type: "optical_media",
      present: true,
      kind: "data",
      toc: null,
      cd_text: null,
    });
    await vi.waitFor(() => expect(cd.face).toBe("data"));
    expect(cd.tracks).toHaveLength(0);
    expect(identifyCd).not.toHaveBeenCalled();
  });

  it("kind data drops leftover Red Book rows without waiting for cdrom index", async () => {
    const { cd, enterCdMode, setCdEnabled, setCdSelectedDriveId, setCdTracks } =
      await import("@/stores/cd");
    const { handleOpticalMessage } = await import("@/exclusive/opticalClient");
    setCdEnabled(true);
    setCdSelectedDriveId("/dev/rdisk2");
    enterCdMode();
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
    handleOpticalMessage({
      type: "optical_media",
      present: true,
      kind: "data",
      toc: null,
      cd_text: null,
    });
    expect(cd.tracks).toHaveLength(0);
    expect(identifyCd).not.toHaveBeenCalled();
  });

  it("leave drops cdrom lyrics memory", async () => {
    const { enterCdMode, leaveCdMode, setCdEnabled, setCdSelectedDriveId } =
      await import("@/stores/cd");
    const { rememberLyricsMemory, peekLyricsMemory } = await import(
      "@/lyrics/cache"
    );
    const { onLeaveCd } = await import("@/playback/session");
    setCdEnabled(true);
    setCdSelectedDriveId("/dev/rdisk2");
    onLeaveCd(() => leaveCdMode());
    enterCdMode();
    rememberLyricsMemory("cdrom:a.mp3", {
      trackId: "cdrom:a.mp3",
      status: "ok",
      source: "lrclib",
      isSynced: false,
      plainText: "old disc",
      syncedLrc: null,
      instrumental: false,
    });
    leaveCdMode();
    await vi.waitFor(() =>
      expect(peekLyricsMemory("cdrom:a.mp3")).toBeUndefined(),
    );
    onLeaveCd(null);
  });

  it("Leave then Enter with data already set starts the cdrom session", async () => {
    const {
      cd,
      enterCdMode,
      leaveCdMode,
      setCdEnabled,
      setCdSelectedDriveId,
      setCdLive,
    } = await import("@/stores/cd");
    const { activeSession, become, onLeaveCd } = await import("@/playback/session");
    const cdrom = await import("@/cd/cdrom");
    const start = vi.spyOn(cdrom, "startCdromSession");
    setCdEnabled(true);
    setCdSelectedDriveId("/dev/rdisk2");
    setCdLive({ mediaPresent: true, mediaKind: "data", volumeName: "MYCD" });
    onLeaveCd(() => leaveCdMode());
    enterCdMode();
    await vi.waitFor(() => expect(start).toHaveBeenCalled());
    start.mockClear();
    expect(activeSession()).toBe("cd");
    become("none");
    expect(activeSession()).toBe("none");
    enterCdMode();
    await vi.waitFor(() => expect(start).toHaveBeenCalled());
    expect(identifyCd).not.toHaveBeenCalled();
    expect(cd.mediaKind).toBe("data");
    onLeaveCd(null);
    start.mockRestore();
  });

  it("does not re-identify on a repeated present message", async () => {
    const { cd, enterCdMode, setCdEnabled, setCdSelectedDriveId, setCdLive } =
      await import("@/stores/cd");
    const { handleOpticalMessage } = await import("@/exclusive/opticalClient");
    const { activeSession } = await import("@/playback/session");
    setCdEnabled(true);
    setCdLive({
      drives: [{ id: "/dev/rdisk2", name: "SuperDrive", key: "Apple|SuperDrive" }],
    });
    setCdSelectedDriveId("/dev/rdisk2");
    enterCdMode();
    expect(activeSession()).toBe("cd");
    const msg = {
      type: "optical_media",
      present: true,
      kind: "audio",
      toc: {
        first_track: 1,
        last_audio_track: 2,
        leadout_lba: 15000,
        offsets: [0, 7500],
      },
      cd_text: null,
    };
    const handled = handleOpticalMessage(msg);
    expect(handled).toBe(true);
    expect(cd.mediaPresent).toBe(true);
    expect(cd.mediaKind).toBe("audio");
    expect(cd.toc?.last_audio_track).toBe(2);
    await vi.waitFor(() => expect(cd.tracks.length).toBe(2));
    await vi.waitFor(() => expect(identifyCd).toHaveBeenCalledTimes(1));
    handleOpticalMessage(msg);
    await new Promise((r) => setTimeout(r, 30));
    expect(identifyCd).toHaveBeenCalledTimes(1);
    expect(cd.tracks.length).toBe(2);
  });

  it("already-cd enter does not re-identify", async () => {
    const { cd, enterCdMode, setCdLive, setCdEnabled, setCdSelectedDriveId } =
      await import("@/stores/cd");
    setCdEnabled(true);
    setCdSelectedDriveId("/dev/rdisk2");
    enterCdMode();
    setCdLive({
      mediaPresent: true,
      mediaKind: "audio",
      toc: {
        first_track: 1,
        last_audio_track: 2,
        leadout_lba: 15000,
        offsets: [0, 7500],
      },
    });
    identifyCd.mockClear();
    enterCdMode();
    await new Promise((r) => setTimeout(r, 30));
    expect(identifyCd).not.toHaveBeenCalled();
    expect(cd.shuffle).toBe(false);
  });
});
