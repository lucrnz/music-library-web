import { describe, expect, it } from "vitest";
import { LOSSY_SOURCE_COPY } from "@/lossyKind";
import {
  buildPlaybackDetailsRows,
  formatPrimaryStatus,
  type PlayStatusState,
} from "@/playbackStatus";
import type { ExclusiveFaceSnapshot } from "@/exclusive/statusFace";

function lossyTrack(
  overrides: Partial<NonNullable<PlayStatusState["track"]>> = {},
): NonNullable<PlayStatusState["track"]> {
  return {
    isLossy: true,
    sourceCodec: "mp3",
    bitrateKbps: 320,
    sampleRateHz: 44100,
    bitrateMode: "vbr",
    ...overrides,
  };
}

function lossyState(
  overrides: Partial<PlayStatusState> = {},
  trackOverrides: Partial<NonNullable<PlayStatusState["track"]>> = {},
): PlayStatusState {
  return {
    playSource: "streaming",
    track: lossyTrack(trackOverrides),
    ...overrides,
  };
}

function keys(rows: { key: string }[]): string[] {
  return rows.map((r) => r.key);
}

function value(rows: { key: string; value: string }[], key: string): string | undefined {
  return rows.find((r) => r.key === key)?.value;
}

describe("buildPlaybackDetailsRows lossy", () => {
  it("lists codec, bitrate, encoding, sample rate, and source file", () => {
    const rows = buildPlaybackDetailsRows(lossyState());
    expect(keys(rows)).toEqual([
      "source",
      "codec",
      "bitrate",
      "encoding",
      "sample_rate",
      "lossy",
    ]);
    expect(value(rows, "source")).toBe("Streaming");
    expect(value(rows, "codec")).toBe("MP3");
    expect(value(rows, "bitrate")).toBe("320 kbps");
    expect(value(rows, "encoding")).toBe("VBR");
    expect(value(rows, "sample_rate")).toBe("44.1 kHz");
    expect(value(rows, "lossy")).toBe(LOSSY_SOURCE_COPY);
  });

  it("omits encoding and sample rate when those fields are missing", () => {
    const rows = buildPlaybackDetailsRows(
      lossyState({ playSource: "downloaded" }, {
        sourceCodec: "aac",
        bitrateKbps: 256,
        bitrateMode: null,
        sampleRateHz: null,
      }),
    );
    expect(keys(rows)).toEqual(["source", "codec", "bitrate", "lossy"]);
    expect(value(rows, "source")).toBe("Downloaded");
    expect(value(rows, "codec")).toBe("AAC");
    expect(value(rows, "bitrate")).toBe("256 kbps");
  });

  it("shows ABR and omits unknown encoding tokens", () => {
    const abr = buildPlaybackDetailsRows(lossyState({}, { bitrateMode: "abr" }));
    expect(value(abr, "encoding")).toBe("ABR");
    const unknown = buildPlaybackDetailsRows(
      lossyState({}, { bitrateMode: "unknown" }),
    );
    expect(keys(unknown)).not.toContain("encoding");
  });

  it("does not add lossy encoding rows for lossless profile playback", () => {
    const rows = buildPlaybackDetailsRows({
      playSource: "streaming",
      playProfileId: "flac_16_44100",
      track: {
        isLossy: false,
        sourceCodec: "flac",
        bitrateKbps: null,
        sampleRateHz: 44100,
        bitrateMode: "vbr",
      },
    }, [
      {
        id: "flac_16_44100",
        label: "FLAC 16/44.1",
        kind: "flac",
        bit_depth: 16,
        sample_rate: 44100,
        bitrate_kbps: 0,
      },
    ]);
    expect(keys(rows)).not.toContain("encoding");
    expect(keys(rows)).not.toContain("lossy");
    expect(value(rows, "codec")).toBe("FLAC");
  });

  it("does not add lossy encoding rows in exclusive mode", () => {
    const exclusive: ExclusiveFaceSnapshot = {
      enabled: true,
      connection: "connected",
      role: "controller",
      preferenceId: "dev1",
      liveId: "dev1",
      devices: [{ id: "dev1", name: "DAC" }],
    };
    const rows = buildPlaybackDetailsRows(
      lossyState({ playProfileId: "flac_24_96000" }),
      [],
      { exclusiveSnap: exclusive },
    );
    expect(keys(rows)).not.toContain("encoding");
    expect(keys(rows)).not.toContain("lossy");
    expect(value(rows, "output")).toBe("Exclusive");
  });
});

describe("formatPrimaryStatus", () => {
  it("keeps the compact lossy face without encoding or sample rate", () => {
    const face = formatPrimaryStatus(lossyState());
    expect(face.text).toBe("Streaming · MP3 320k");
  });
});
