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
  const { bitDepth = null, ...rest } = overrides;
  return {
    isLossy: true,
    sourceCodec: "mp3",
    bitrateKbps: 320,
    sampleRateHz: 44100,
    bitrateMode: "vbr",
    bitDepth,
    ...rest,
  };
}

function lossyState(
  overrides: Partial<PlayStatusState> = {},
  trackOverrides: Partial<NonNullable<PlayStatusState["track"]>> = {},
): PlayStatusState {
  return {
    session: "queue",
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
      session: "queue",
      playSource: "streaming",
      playProfileId: "flac_16_44100",
      track: {
        isLossy: false,
        sourceCodec: "flac",
        bitrateKbps: null,
        sampleRateHz: 44100,
        bitrateMode: "vbr",
        bitDepth: 16,
      },
    }, [
      {
        id: "flac_16_44100",
        label: "FLAC 16/44.1",
        kind: "flac",
        bitDepth: 16,
        sampleRate: 44100,
        bitrateKbps: 0,
      },
    ]);
    expect(keys(rows)).not.toContain("encoding");
    expect(keys(rows)).not.toContain("lossy");
    expect(value(rows, "codec")).toBe("FLAC");
  });

  it("exclusive lossy lists source-format rows, not Profile source", () => {
    const exclusive: ExclusiveFaceSnapshot = {
      enabled: true,
      connection: "connected",
      role: "controller",
      preferenceId: "dev1",
      liveId: "dev1",
      devices: [{ id: "dev1", name: "DAC" }],
    };
    const rows = buildPlaybackDetailsRows(
      lossyState({ playProfileId: "source" }),
      [],
      { exclusiveSnap: exclusive },
    );
    expect(value(rows, "output")).toBe("Exclusive");
    expect(value(rows, "device")).toBe("DAC");
    expect(value(rows, "codec")).toBe("MP3");
    expect(value(rows, "bitrate")).toBe("320 kbps");
    expect(value(rows, "encoding")).toBe("VBR");
    expect(value(rows, "sample_rate")).toBe("44.1 kHz");
    expect(value(rows, "lossy")).toBe(LOSSY_SOURCE_COPY);
    expect(keys(rows)).not.toContain("profile");
  });

  it("exclusive lossless still lists profile and bit depth", () => {
    const exclusive: ExclusiveFaceSnapshot = {
      enabled: true,
      connection: "connected",
      role: "controller",
      preferenceId: "dev1",
      liveId: "dev1",
      devices: [{ id: "dev1", name: "DAC" }],
    };
    const rows = buildPlaybackDetailsRows(
      {
        session: "queue",
        playSource: "streaming",
        playProfileId: "flac_24_96000",
        track: {
          isLossy: false,
          sourceCodec: "flac",
          bitrateKbps: null,
          sampleRateHz: 96000,
          bitrateMode: null,
          bitDepth: 24,
        },
      },
      [],
      {
        exclusiveSnap: exclusive,
        exclusiveFormats: [
          {
            tag: "flac_24_96000",
            label: "FLAC 24/96",
            sample_rate: 96000,
            bit_depth: 24,
          },
        ],
      },
    );
    expect(value(rows, "output")).toBe("Exclusive");
    expect(value(rows, "profile")).toBe("FLAC 24/96");
    expect(value(rows, "bit_depth")).toBe("24-bit");
    expect(value(rows, "sample_rate")).toBe("96 kHz");
    expect(keys(rows)).not.toContain("encoding");
    expect(keys(rows)).not.toContain("lossy");
  });
});

describe("formatPrimaryStatus", () => {
  it("keeps the compact lossy face without encoding or sample rate", () => {
    const face = formatPrimaryStatus(lossyState());
    expect(face.text).toBe("Streaming · MP3 320k");
  });

  it("radio session with exclusive enabled uses the exclusive face", () => {
    const exclusive: ExclusiveFaceSnapshot = {
      enabled: true,
      connection: "connected",
      role: "controller",
      preferenceId: "dev",
      liveId: "dev",
      devices: [{ id: "dev", name: "DAC" }],
    };
    const face = formatPrimaryStatus(
      lossyState({ session: "radio", playProfileId: "source" }),
      [],
      exclusive,
    );
    expect(face.text).toBe("Ready · DAC");
    const rows = buildPlaybackDetailsRows(
      lossyState({ session: "radio", playProfileId: "source" }),
      [],
      { exclusiveSnap: exclusive },
    );
    expect(value(rows, "output")).toBe("Exclusive");
    expect(value(rows, "codec")).toBe("MP3");
    expect(keys(rows)).not.toContain("profile");
  });

  it("radio session ignores a disabled exclusive snap", () => {
    const exclusive: ExclusiveFaceSnapshot = {
      enabled: false,
      connection: "disconnected",
      role: null,
      preferenceId: null,
      liveId: null,
    };
    const face = formatPrimaryStatus(
      lossyState({ session: "radio" }),
      [],
      exclusive,
    );
    expect(face.text).toBe("Streaming · MP3 320k");
    const rows = buildPlaybackDetailsRows(
      lossyState({ session: "radio" }),
      [],
      { exclusiveSnap: exclusive },
    );
    expect(value(rows, "output")).toBeUndefined();
    expect(value(rows, "source")).toBe("Streaming");
  });

  it("exclusive-on radio lossless lists the exclusive profile", () => {
    const exclusive: ExclusiveFaceSnapshot = {
      enabled: true,
      connection: "connected",
      role: "controller",
      preferenceId: "dev",
      liveId: "dev",
      devices: [{ id: "dev", name: "DAC" }],
    };
    const rows = buildPlaybackDetailsRows(
      {
        session: "radio",
        playSource: "streaming",
        playProfileId: "flac_24_96000",
        track: {
          isLossy: false,
          sourceCodec: "flac",
          bitrateKbps: null,
          sampleRateHz: 96000,
          bitrateMode: null,
          bitDepth: 24,
        },
      },
      [],
      {
        exclusiveSnap: exclusive,
        exclusiveFormats: [
          {
            tag: "flac_24_96000",
            label: "FLAC 24/96",
            sample_rate: 96000,
            bit_depth: 24,
          },
        ],
      },
    );
    expect(value(rows, "output")).toBe("Exclusive");
    expect(value(rows, "profile")).toBe("FLAC 24/96");
    expect(value(rows, "bit_depth")).toBe("24-bit");
  });

  it("radio downloaded lossless uses the Downloaded source word", () => {
    const catalog = [
      {
        id: "flac_16_44100",
        label: "FLAC 16/44.1",
        kind: "flac",
        bitDepth: 16,
        sampleRate: 44100,
        bitrateKbps: 0,
      },
    ];
    const state: PlayStatusState = {
      session: "radio",
      playSource: "downloaded",
      playProfileId: "flac_16_44100",
      track: {
        isLossy: false,
        sourceCodec: "flac",
        bitrateKbps: null,
        sampleRateHz: 44100,
        bitrateMode: null,
        bitDepth: 16,
      },
    };
    const face = formatPrimaryStatus(state, catalog);
    expect(face.text.startsWith("Downloaded ·")).toBe(true);
    expect(value(buildPlaybackDetailsRows(state, catalog), "source")).toBe(
      "Downloaded",
    );
  });

  it("cd not_audio face is Not an audio CD", () => {
    const face = formatPrimaryStatus({
      session: "cd",
      playSource: "cd",
      cdFace: "not_audio",
    });
    expect(face.text).toBe("Not an audio CD");
    expect(face.icon).toBe("cd");
  });

  it("cdda details list Source CD and 16/44.1", () => {
    const track = {
      isLossy: false,
      sourceCodec: "cdda",
      bitrateKbps: null,
      sampleRateHz: 44100,
      bitrateMode: null,
      bitDepth: 16,
    };
    const rows = buildPlaybackDetailsRows({
      session: "cd",
      playSource: "cd",
      playProfileId: "cdda",
      track,
    });
    expect(value(rows, "source")).toBe("CD");
    expect(value(rows, "bit_depth")).toBe("16-bit");
    expect(value(rows, "sample_rate")).toBe("44.1 kHz");
  });

  it("exclusive-on cdda details include hog device and 16/44.1", () => {
    const exclusive: ExclusiveFaceSnapshot = {
      enabled: true,
      connection: "connected",
      role: "controller",
      preferenceId: "dev",
      liveId: "dev",
      devices: [{ id: "dev", name: "DAC" }],
    };
    const rows = buildPlaybackDetailsRows(
      {
        session: "cd",
        playSource: "cd",
        playProfileId: "cdda",
        track: {
          isLossy: false,
          sourceCodec: "cdda",
          bitrateKbps: null,
          sampleRateHz: 44100,
          bitrateMode: null,
          bitDepth: 16,
        },
      },
      [],
      { exclusiveSnap: exclusive },
    );
    expect(value(rows, "output")).toBe("Exclusive");
    expect(value(rows, "device")).toBe("DAC");
    expect(value(rows, "source")).toBe("CD");
    expect(value(rows, "bit_depth")).toBe("16-bit");
    expect(value(rows, "sample_rate")).toBe("44.1 kHz");
  });
});
