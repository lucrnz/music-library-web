import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchCdromLyrics = vi.hoisted(() => vi.fn());
const canReachServer = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/api", () => ({ fetchCdromLyrics, fetchLyrics: vi.fn() }));
vi.mock("@/connectivity", () => ({ canReachServer }));

import { dropLyricsMemory } from "@/lyrics/cache";
import { resolveCdromLyrics } from "@/lyrics/cdrom";
import { cd, setCdTracks } from "@/stores/cd";
import { exclusiveAudio } from "@/stores/exclusiveAudio";

describe("resolveCdromLyrics", () => {
  beforeEach(() => {
    dropLyricsMemory("cdrom:");
    fetchCdromLyrics.mockReset();
    canReachServer.mockReturnValue(true);
    exclusiveAudio.companionToken = "tok";
    exclusiveAudio.port = 18765;
    cd.selectedDriveId = "dev";
    setCdTracks([
      {
        id: "cdrom:Music/a.mp3",
        path: "Music/a.mp3",
        title: "Song",
        artist: "Band",
        album: "LP",
        albumId: null,
        artistId: null,
        albumArtist: "Band",
        albumArtistId: null,
        track: 1,
        disc: null,
        year: null,
        duration: 12,
        durationMs: 12000,
        isMissing: false,
        sampleRateHz: null,
        bitDepth: null,
        isLossy: true,
        sourceCodec: "mp3",
        bitrateKbps: null,
        bitrateMode: null,
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ plain: null, synced: null, source: null }),
      })),
    );
  });

  it("does not call /api/tracks/ lyrics", async () => {
    fetchCdromLyrics.mockResolvedValue({
      trackId: null,
      status: "ok",
      source: "lrclib",
      isSynced: false,
      plainText: "from lrclib",
      syncedLrc: null,
      instrumental: false,
    });
    const got = await resolveCdromLyrics("cdrom:Music/a.mp3");
    expect(got.plainText).toBe("from lrclib");
    expect(fetchCdromLyrics).toHaveBeenCalledWith({
      title: "Song",
      artist: "Band",
      album: "LP",
      duration_ms: 12000,
    });
    expect(String(fetchCdromLyrics.mock.calls[0])).not.toContain("/api/tracks/");
  });

  it("offline skips LRCLIB and keeps local lyrics", async () => {
    canReachServer.mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          plain: "local only",
          synced: null,
          source: "local_lrc",
        }),
      })),
    );
    const got = await resolveCdromLyrics("cdrom:Music/a.mp3");
    expect(got.plainText).toBe("local only");
    expect(fetchCdromLyrics).not.toHaveBeenCalled();
  });

  it("offline with no local lyrics does not call LRCLIB", async () => {
    canReachServer.mockReturnValue(false);
    const got = await resolveCdromLyrics("cdrom:Music/a.mp3");
    expect(got.status).toBe("not_found");
    expect(fetchCdromLyrics).not.toHaveBeenCalled();
  });

  it("uses sidecar text without LRCLIB", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          plain: "hello from sidecar",
          synced: "[00:01.00]hello from sidecar",
          source: "local_lrc",
        }),
      })),
    );
    const got = await resolveCdromLyrics("cdrom:Music/a.mp3");
    expect(got.plainText).toContain("sidecar");
    expect(fetchCdromLyrics).not.toHaveBeenCalled();
  });
});
