import { beforeEach, describe, expect, it, vi } from "vitest";

const load = vi.fn(async (_url: string, _opts?: { hog?: boolean }) => {});

vi.mock("@/playback/sinks/companionSink", () => ({
  createCompanionSink: () => ({
    kind: "companion",
    setHandlers: vi.fn(),
    load,
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    paused: true,
    currentTime: 0,
    duration: 0,
  }),
}));

vi.mock("@/stores/ui", () => ({ showToast: vi.fn() }));

import { become, activeSession } from "@/playback/session";
import { cd, setCdTracks, setCdSelectedDriveId, setCdEnabled } from "@/stores/cd";
import { exclusiveAudio } from "@/stores/exclusiveAudio";

describe("cdLoad", () => {
  beforeEach(() => {
    load.mockClear();
    become("none");
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
  });
});
