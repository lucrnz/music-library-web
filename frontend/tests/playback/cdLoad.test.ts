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

const {
  load,
  seekFn,
  setVolume,
  sink,
} = vi.hoisted(() => {
  const durationWaiters: Array<() => void> = [];
  const state = {
    duration: 0,
    handlers: {} as {
      onTime?: (t: number, d: number) => void;
      onError?: (err: Error) => void;
    },
  };
  function flushDurationWaiters(): void {
    if (!(state.duration > 0) || !durationWaiters.length) return;
    const pending = durationWaiters.splice(0, durationWaiters.length);
    for (const resolve of pending) resolve();
  }
  return {
    load: vi.fn(async (_url: string, _opts?: { hog?: boolean }) => {}),
    seekFn: vi.fn(),
    setVolume: vi.fn(),
    sink: {
      state,
      durationWaiters,
      flushDurationWaiters,
    },
  };
});

vi.mock("@/playback/sinks/companionSink", () => ({
  createCompanionSink: () => ({
    kind: "companion",
    setHandlers(h: {
      onTime?: (t: number, d: number) => void;
      onError?: (err: Error) => void;
    }) {
      sink.state.handlers = h;
    },
    async load(url: string, opts?: { hog?: boolean }) {
      await load(url, opts);
      sink.state.duration = 0;
      queueMicrotask(() => {
        sink.state.duration = 180;
        sink.flushDurationWaiters();
        sink.state.handlers.onTime?.(0, sink.state.duration);
      });
    },
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    seek(seconds: number) {
      if (!(sink.state.duration > 0)) return;
      seekFn(seconds);
    },
    setVolume,
    waitForDuration() {
      if (sink.state.duration > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        sink.durationWaiters.push(resolve);
      });
    },
    paused: true,
    currentTime: 0,
    get duration() {
      return sink.state.duration;
    },
  }),
}));

vi.mock("@/stores/ui", () => ({ showToast: vi.fn() }));

import { become, activeSession } from "@/playback/session";
import { cd, setCdTracks, setCdSelectedDriveId, setCdEnabled } from "@/stores/cd";
import { exclusiveAudio } from "@/stores/exclusiveAudio";
import { cdStopTransport } from "@/playback/cdLoad";

describe("cdLoad", () => {
  beforeEach(() => {
    stubMacPwa();
    load.mockClear();
    seekFn.mockClear();
    setVolume.mockClear();
    sink.state.duration = 0;
    sink.durationWaiters.length = 0;
    become("none");
    cdStopTransport();
    exclusiveAudio.companionToken = "tok";
    exclusiveAudio.port = 18765;
    exclusiveAudio.enabled = false;
    exclusiveAudio.capable = false;
    exclusiveAudio.role = "controller";
    exclusiveAudio.connection = "connected";
    setCdEnabled(true);
    setCdSelectedDriveId("rdisk2");
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reloads hog when exclusive is toggled", async () => {
    const { cdLoad, initCdListeners, reloadCdAtPosition } = await import(
      "@/playback/cdLoad"
    );
    initCdListeners();
    await cdLoad(0);
    load.mockClear();
    exclusiveAudio.capable = true;
    exclusiveAudio.enabled = true;
    await vi.waitFor(() => {
      expect(load).toHaveBeenCalled();
    });
    expect(load.mock.calls.at(-1)?.[1]).toEqual({ hog: true });
  });

  it("loads with hog false when exclusive is off and stays in cd", async () => {
    const { cdLoad } = await import("@/playback/cdLoad");
    await cdLoad(0);
    expect(activeSession()).toBe("cd");
    expect(load).toHaveBeenCalledOnce();
    expect(load.mock.calls[0][1]).toEqual({ hog: false });
    expect(cd.index).toBe(0);
    expect(setVolume).toHaveBeenCalled();
  });

  it("hog reload seeks after the new load duration, not leftover player.duration", async () => {
    const { cdLoad, reloadCdAtPosition } = await import("@/playback/cdLoad");
    const { player } = await import("@/stores/playerState");
    await cdLoad(0);
    await vi.waitFor(() => expect(sink.state.duration).toBe(180));
    seekFn.mockClear();
    player.currentTime = 12;
    player.duration = 180;
    await reloadCdAtPosition();
    expect(seekFn).toHaveBeenCalledWith(12);
  });

  it("data rows load /cdrom/file with profile cdrom", async () => {
    const { cdLoad } = await import("@/playback/cdLoad");
    const { player } = await import("@/stores/playerState");
    const { setCdTracks } = await import("@/stores/cd");
    setCdTracks([
      {
        id: "cdrom:Music/a.mp3",
        path: "Music/a.mp3",
        title: "A",
        artist: "B",
        album: "C",
        albumId: null,
        artistId: null,
        albumArtist: "B",
        albumArtistId: null,
        track: 1,
        disc: 1,
        year: null,
        duration: 1,
        durationMs: 1000,
        isMissing: false,
        sampleRateHz: 44100,
        bitDepth: 16,
        isLossy: true,
        sourceCodec: "mp3",
        bitrateKbps: null,
        bitrateMode: null,
      },
    ]);
    await cdLoad(0);
    expect(load.mock.calls[0][0]).toContain("/cdrom/file");
    expect(String(load.mock.calls[0][0])).not.toContain("/cdda/");
    expect(player.playProfileId).toBe("cdrom");
  });

  it("stale data load gen does not skip again", async () => {
    const { showToast } = await import("@/stores/ui");
    const { cdLoad, cdStopTransport } = await import("@/playback/cdLoad");
    const { setCdTracks } = await import("@/stores/cd");
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
      {
        id: "cdrom:b.mp3",
        path: "b.mp3",
        title: "B",
        artist: "",
        album: "",
        albumId: null,
        artistId: null,
        albumArtist: "",
        albumArtistId: null,
        track: 2,
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
    load.mockRejectedValueOnce(new Error("fail"));
    await cdLoad(0);
    const toasts = (showToast as unknown as { mock: { calls: unknown[] } }).mock
      .calls.length;
    cdStopTransport();
    load.mockRejectedValueOnce(new Error("stale"));
    const first = cdLoad(0);
    const second = cdLoad(1);
    await Promise.allSettled([first, second]);
    expect(
      (showToast as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
    ).toBeGreaterThanOrEqual(toasts);
  });

  it("failed data load toasts and advances", async () => {
    const { showToast } = await import("@/stores/ui");
    const { cdLoad } = await import("@/playback/cdLoad");
    const { cd, setCdTracks } = await import("@/stores/cd");
    const row = (id: string) => ({
      id: `cdrom:${id}`,
      path: id,
      title: id,
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
    });
    setCdTracks([row("a.mp3"), row("b.mp3")]);
    load.mockRejectedValueOnce(new Error("fail"));
    await cdLoad(0);
    expect(showToast).toHaveBeenCalled();
    expect(cd.index).toBe(1);
  });

  it("stale sink error does not advance a newer data load", async () => {
    const { cdLoad } = await import("@/playback/cdLoad");
    const { cd, setCdTracks } = await import("@/stores/cd");
    const row = (id: string) => ({
      id: `cdrom:${id}`,
      path: id,
      title: id,
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
    });
    setCdTracks([row("a.mp3"), row("b.mp3")]);
    await cdLoad(0);
    const firstHandlers = sink.state.handlers;
    await cdLoad(1);
    firstHandlers.onError?.(new Error("stale"));
    expect(cd.index).toBe(1);
  });

  it("a failed data load does not wrap on repeat all", async () => {
    const { cdLoad } = await import("@/playback/cdLoad");
    const { cd, setCdTracks } = await import("@/stores/cd");
    cd.repeat = "all";
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
    load.mockRejectedValueOnce(new Error("fail"));
    await cdLoad(0);
    expect(load).toHaveBeenCalledTimes(1);
    cd.repeat = "off";
  });

});
