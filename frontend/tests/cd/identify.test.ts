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
});
