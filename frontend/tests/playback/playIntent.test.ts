import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePlayIntent } from "@/playback/playIntent";
import type { Track } from "@/models/track";

vi.mock("@/downloads/resolve", async () => {
  const actual = await vi.importActual<typeof import("@/downloads/resolve")>(
    "@/downloads/resolve",
  );
  return {
    ...actual,
    resolvePlaySource: vi.fn(),
  };
});

import { resolvePlaySource } from "@/downloads/resolve";

function track(partial: Partial<Track> = {}): Track {
  return {
    id: "t1",
    path: "a.flac",
    title: "Song",
    artist: "A",
    album: "B",
    albumId: null,
    artistId: null,
    albumArtist: "A",
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
    sourceCodec: "flac",
    bitrateKbps: null,
    bitrateMode: null,
    ...partial,
  };
}

describe("resolvePlayIntent", () => {
  beforeEach(() => {
    vi.mocked(resolvePlaySource).mockReset();
  });

  it("blocks exclusive lossy", async () => {
    const intent = await resolvePlayIntent(track({ isLossy: true }), {
      exclusiveEnabled: true,
      exclusiveTag: "flac_16_44100",
      exclusiveGate: { ok: true },
      enabled: false,
      offline: false,
      activeStreamCodec: "opus_192_48000",
    });
    expect(intent.source).toBe("unavailable");
    if (intent.source !== "unavailable") return;
    expect(intent.block).toBe("exclusive_lossy");
    expect("url" in intent).toBe(false);
  });

  it("exclusive without a gate is ready companion (sink owns the device poll)", async () => {
    const intent = await resolvePlayIntent(track(), {
      exclusiveEnabled: true,
      exclusiveTag: "flac_16_44100",
      enabled: false,
      offline: false,
      activeStreamCodec: "opus_192_48000",
    });
    expect(intent.source).toBe("streaming");
    if (intent.source === "unavailable") return;
    expect(intent.sink).toBe("companion");
    expect(intent.url).toContain("codec=flac_16_44100");
  });

  it("exclusive lossless is companion streaming with exclusive tag", async () => {
    const intent = await resolvePlayIntent(track(), {
      exclusiveEnabled: true,
      exclusiveTag: "flac_16_44100",
      exclusiveGate: { ok: true },
      enabled: true,
      offline: false,
      activeStreamCodec: "opus_192_48000",
      absoluteStream: false,
    });
    expect(intent.source).toBe("streaming");
    if (intent.source === "unavailable") return;
    expect(intent.sink).toBe("companion");
    expect(intent.profile).toBe("flac_16_44100");
    expect(intent.url).toContain("codec=flac_16_44100");
  });

  it("exclusive without a tag is exclusive_no_format", async () => {
    const intent = await resolvePlayIntent(track(), {
      exclusiveEnabled: true,
      exclusiveTag: null,
      exclusiveGate: { ok: true },
      enabled: false,
      offline: false,
      activeStreamCodec: "opus_192_48000",
    });
    expect(intent.source).toBe("unavailable");
    if (intent.source !== "unavailable") return;
    expect(intent.block).toBe("exclusive_no_format");
  });

  it("HTML offline with no download is offline_no_local", async () => {
    vi.mocked(resolvePlaySource).mockResolvedValue({
      type: "unavailable",
      url: null,
      reason: "offline_no_local",
      message: "You're offline and this track isn't downloaded.",
      codec: "opus_192_48000",
    });
    const intent = await resolvePlayIntent(track(), {
      exclusiveEnabled: false,
      exclusiveTag: null,
      enabled: true,
      offline: true,
      activeStreamCodec: "opus_192_48000",
    });
    expect(intent.source).toBe("unavailable");
    if (intent.source !== "unavailable") return;
    expect(intent.block).toBe("offline_no_local");
  });

  it("HTML prefer-local download is downloaded", async () => {
    vi.mocked(resolvePlaySource).mockResolvedValue({
      type: "downloaded",
      url: "blob:local",
      reason: null,
      message: null,
      codec: "flac_16_44100",
    });
    const intent = await resolvePlayIntent(track(), {
      exclusiveEnabled: false,
      exclusiveTag: null,
      enabled: true,
      offline: false,
      activeStreamCodec: "opus_192_48000",
    });
    expect(intent.source).toBe("downloaded");
    if (intent.source === "unavailable") return;
    expect(intent.sink).toBe("htmlAudio");
    expect(intent.url).toBe("blob:local");
  });

  it("localBroken online falls back to streaming", async () => {
    const intent = await resolvePlayIntent(track(), {
      exclusiveEnabled: false,
      exclusiveTag: null,
      enabled: true,
      offline: false,
      activeStreamCodec: "opus_192_48000",
      localBroken: true,
    });
    expect(intent.source).toBe("streaming");
    if (intent.source === "unavailable") return;
    expect(intent.url).toContain("codec=opus_192_48000");
    expect(resolvePlaySource).not.toHaveBeenCalled();
  });

  it("unsupported source codec blocks HTML", async () => {
    const intent = await resolvePlayIntent(
      track({ isLossy: true, sourceCodec: "mp3" }),
      {
        exclusiveEnabled: false,
        exclusiveTag: null,
        enabled: false,
        offline: false,
        activeStreamCodec: "opus_192_48000",
        sourceKindSupported: false,
      },
    );
    expect(intent.source).toBe("unavailable");
    if (intent.source !== "unavailable") return;
    expect(intent.block).toBe("codec_unsupported");
    expect(intent.profile).toBe("source");
  });
});
