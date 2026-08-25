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
    vi.mocked(resolvePlaySource).mockResolvedValue({
      source: "streaming",
      url: "/api/stream?id=t1&codec=opus_192_48000",
      profile: "opus_192_48000",
    });
  });

  it("exclusive lossy streams source into the companion", async () => {
    const intent = await resolvePlayIntent(track({ isLossy: true }), {
      sink: "companion",
      exclusiveTag: "flac_16_44100",
      enabled: false,
      offline: false,
      activeStreamCodec: "opus_192_48000",
    });
    expect(intent.source).toBe("streaming");
    if (intent.source === "unavailable") return;
    expect(intent.sink).toBe("companion");
    expect(intent.profile).toBe("source");
    expect(intent.url).toContain("codec=source");
  });

  it("exclusive lossy without an id is exclusive_lossy", async () => {
    const intent = await resolvePlayIntent(track({ isLossy: true, id: "" }), {
      sink: "companion",
      exclusiveTag: "flac_16_44100",
      enabled: false,
      offline: false,
      activeStreamCodec: "opus_192_48000",
    });
    expect(intent.source).toBe("unavailable");
    if (intent.source !== "unavailable") return;
    expect(intent.block).toBe("exclusive_lossy");
  });

  it("exclusive without a gate is ready companion (sink owns the device poll)", async () => {
    const intent = await resolvePlayIntent(track(), {
      sink: "companion",
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

  it("exclusive leftover OPFS blob is not sent to mpv", async () => {
    vi.mocked(resolvePlaySource).mockResolvedValue({
      source: "downloaded",
      url: "blob:http://localhost/leftover",
      profile: "flac_16_44100",
    });
    const intent = await resolvePlayIntent(track(), {
      sink: "companion",
      exclusiveTag: "flac_16_44100",
      enabled: true,
      offline: false,
      activeStreamCodec: "opus_192_48000",
    });
    expect(intent.source).toBe("streaming");
    if (intent.source === "unavailable") return;
    expect(intent.sink).toBe("companion");
    expect(intent.url).toContain("codec=flac_16_44100");
  });

  it("exclusive + downloaded catalog uses the local url on the companion sink", async () => {
    vi.mocked(resolvePlaySource).mockResolvedValue({
      source: "downloaded",
      url: "http://127.0.0.1:18765/files/audio/t1.flac",
      profile: "flac_16_44100",
    });
    const intent = await resolvePlayIntent(track(), {
      sink: "companion",
      exclusiveTag: "flac_16_44100",
      enabled: true,
      offline: false,
      activeStreamCodec: "opus_192_48000",
    });
    expect(intent.source).toBe("downloaded");
    if (intent.source === "unavailable") return;
    expect(intent.sink).toBe("companion");
    expect(intent.url).toContain("127.0.0.1");
  });

  it("exclusive lossy + downloaded is not exclusive_lossy", async () => {
    vi.mocked(resolvePlaySource).mockResolvedValue({
      source: "downloaded",
      url: "http://127.0.0.1:18765/files/audio/t1.mp3",
      profile: "source",
    });
    const intent = await resolvePlayIntent(track({ isLossy: true }), {
      sink: "companion",
      exclusiveTag: "flac_16_44100",
      enabled: true,
      offline: false,
      activeStreamCodec: "opus_192_48000",
    });
    expect(intent.source).toBe("downloaded");
    if (intent.source === "unavailable") return;
    expect(intent.sink).toBe("companion");
  });

  it("exclusive lossless is companion streaming with exclusive tag", async () => {
    const intent = await resolvePlayIntent(track(), {
      sink: "companion",
      exclusiveTag: "flac_16_44100",
      enabled: true,
      offline: false,
      activeStreamCodec: "opus_192_48000",
    });
    expect(intent.source).toBe("streaming");
    if (intent.source === "unavailable") return;
    expect(intent.sink).toBe("companion");
    expect(intent.profile).toBe("flac_16_44100");
    expect(intent.url).toContain("codec=flac_16_44100");
  });

  it("exclusive without a tag is exclusive_no_format", async () => {
    const intent = await resolvePlayIntent(track(), {
      sink: "companion",
      exclusiveTag: null,
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
      source: "unavailable",
      profile: "opus_192_48000",
      block: "offline_no_local",
      message: "You're offline and this track isn't downloaded.",
    });
    const intent = await resolvePlayIntent(track(), {
      sink: "htmlAudio",
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
      source: "downloaded",
      url: "blob:local",
      profile: "flac_16_44100",
    });
    const intent = await resolvePlayIntent(track(), {
      sink: "htmlAudio",
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
      sink: "htmlAudio",
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
        sink: "htmlAudio",
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
