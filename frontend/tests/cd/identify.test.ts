import { describe, expect, it, vi } from "vitest";
import { decideIdentify, unknownTrackId } from "@/cd/identify";
import type { CdApplied, CdIdentifyResponse, CdMatch } from "@/cd/types";

const tocMatch = (id: string): CdMatch => ({
  release_mbid: id,
  title: "Demo",
  artist: "Band",
  year: 2000,
  country: "DE",
  label: "BMG",
  track_count: 2,
  tracks: [],
});

const applied: CdApplied = {
  discid: "D",
  release_mbid: "mb",
  album_id: "alb",
  album: "Demo",
  artist: "Band",
  year: 2000,
  has_cover: true,
  tracks: [
    { id: "lib-1", track_no: 1, title: "One", artist: "Band", duration_ms: 1000 },
  ],
};

const identified = (matches: CdMatch[]): CdIdentifyResponse => ({
  discid: "D",
  matches,
  cd_text: null,
});

describe("decideIdentify", () => {
  it("applies remembered DTO without picker", () => {
    expect(
      decideIdentify({ memory: applied, identify: identified([tocMatch("a"), tocMatch("b")]), cdText: null }),
    ).toEqual({ kind: "apply_memory", dto: applied });
  });

  it("prefers identify.applied over matches", () => {
    expect(
      decideIdentify({
        memory: null,
        identify: { ...identified([tocMatch("a"), tocMatch("b")]), applied },
        cdText: null,
      }),
    ).toEqual({ kind: "apply_memory", dto: applied });
  });

  it("confirms a unique match", () => {
    const match = tocMatch("only");
    expect(
      decideIdentify({ memory: null, identify: identified([match]), cdText: null }),
    ).toEqual({ kind: "confirm_unique", match });
  });

  it("opens picker for several matches", () => {
    const matches = [tocMatch("a"), tocMatch("b")];
    expect(
      decideIdentify({ memory: null, identify: identified(matches), cdText: null }),
    ).toEqual({ kind: "open_picker", matches });
  });

  it("uses CD-Text when there are no matches", () => {
    expect(
      decideIdentify({
        memory: null,
        identify: identified([]),
        cdText: { album: "Live", artist: "Band", tracks: ["A"] },
      }),
    ).toEqual({ kind: "cdtext" });
  });

  it("falls back to unknown Track N", () => {
    expect(
      decideIdentify({ memory: null, identify: identified([]), cdText: null }),
    ).toEqual({ kind: "unknown" });
    expect(unknownTrackId(3)).toBe("cd:unknown:3");
  });
});

describe("applyCdDto", () => {
  it("uses snapshot album title", async () => {
    const { applyCdDto } = await import("@/cd/identifyFlow");
    const { cd } = await import("@/stores/cd");
    applyCdDto(applied);
    expect(cd.tracks[0]?.album).toBe("Demo");
    expect(cd.tracks[0]?.artist).toBe("Band");
  });

  it("keeps the current track number on apply without transport", async () => {
    const { become } = await import("@/playback/session");
    const { applyCdDto } = await import("@/cd/identifyFlow");
    const { cd, setCdTracks } = await import("@/stores/cd");
    become("cd");
    setCdTracks(
      [1, 2, 3, 4].map((n) => ({
        id: `cd:unknown:${n}`,
        path: null,
        title: `Track ${n}`,
        artist: "Unknown Artist",
        album: "Audio CD",
        albumId: null,
        artistId: null,
        albumArtist: "Unknown Artist",
        albumArtistId: null,
        track: n,
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
      })),
      3,
    );
    applyCdDto({
      ...applied,
      tracks: [1, 2, 3, 4].map((n) => ({
        id: `lib-${n}`,
        track_no: n,
        title: `T${n}`,
        artist: "Band",
        duration_ms: 1000,
      })),
    });
    expect(cd.index).toBe(3);
    expect(cd.tracks[3]?.id).toBe("lib-4");
    become("none");
  });

  it("does not apply a Red Book snapshot onto a data disc", async () => {
    const { applyCdDto } = await import("@/cd/identifyFlow");
    const { cd, setCdLive, setCdTracks } = await import("@/stores/cd");
    setCdLive({ mediaKind: "data", mediaPresent: true });
    setCdTracks([
      {
        id: "cdrom:a.mp3",
        path: "a.mp3",
        title: "File",
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
    applyCdDto(applied);
    expect(cd.tracks[0]?.id).toBe("cdrom:a.mp3");
    setCdLive({ mediaKind: "none" });
  });
});

describe("runIdentify force", () => {
  it("Change disc with empty matches still force-identifies", async () => {
    const api = await import("@/api");
    const spy = vi.spyOn(api, "identifyCd").mockResolvedValue({
      discid: "D",
      matches: [],
      applied: null,
      cd_text: null,
    });
    const { become } = await import("@/playback/session");
    const { cd, reopenPicker, setCdLive } = await import("@/stores/cd");
    become("cd");
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
    cd.matches = [];
    reopenPicker();
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls.at(-1)?.[2]).toEqual({ force: true });
    spy.mockRestore();
    become("none");
  });
});
