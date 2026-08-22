import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api", () => ({
  apiGet: vi.fn(),
  apiFetch: vi.fn(),
  apiPost: vi.fn(),
}));
vi.mock("@/diag/log", () => ({ emit: vi.fn() }));
vi.mock("@/connectivity", () => ({
  reportFailure: vi.fn(),
  reportSuccess: vi.fn(),
}));

import { apiGet } from "@/api";
import {
  formatApproxMbPerHour,
  getActiveStreamCodec,
  loadCodecs,
  setDownloadCodec,
  setPlaybackPolicy,
  setStreamCodec,
  settings,
} from "@/stores/settings";

const FLAC = {
  id: "flac_16_44100",
  label: "FLAC 16/44.1",
  kind: "flac",
  bit_depth: 16,
  sample_rate: 44100,
};
const OPUS = {
  id: "opus_192_48000",
  label: "Opus 192k",
  kind: "opus",
  bitrate_kbps: 192,
  sample_rate: 48000,
};

describe("settings persist and active stream", () => {
  beforeEach(() => {
    settings.options = [OPUS, FLAC];
    settings.streamCodec = "opus_192_48000";
    settings.download = "opus_192_48000";
    settings.playbackPolicy = "prefer_better";
  });

  it("writes playback policy, download, and stream keys", () => {
    expect(setPlaybackPolicy("prefer_stream")).toBe(true);
    expect(localStorage.getItem("musicweb.playbackPolicy")).toBe("prefer_stream");
    expect(setDownloadCodec("flac_16_44100")).toBe(true);
    expect(localStorage.getItem("musicweb.downloadCodec")).toBe("flac_16_44100");
    expect(setStreamCodec("flac_16_44100")).toBe(true);
    expect(localStorage.getItem("musicweb.streamCodec")).toBe("flac_16_44100");
  });

  it("returns streamCodec", () => {
    settings.streamCodec = "flac_16_44100";
    expect(getActiveStreamCodec()).toBe(settings.streamCodec);
  });
});

describe("approx size hint", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
  });

  it("formats decimal MB/hour with a tilde", () => {
    expect(formatApproxMbPerHour(29)).toBe("~29 MB/h");
  });

  it("maps approx_mb_per_hour from a cached catalog", async () => {
    vi.mocked(apiGet).mockResolvedValue({ codecs: [] });
    localStorage.setItem(
      "musicweb.codecCatalog.v1",
      JSON.stringify({
        codecs: [
          {
            id: "opus_64_48000",
            label: "Opus 64k 48kHz",
            kind: "opus",
            approx_mb_per_hour: 29,
          },
          {
            id: "opus_192_48000",
            label: "Opus 192k 48kHz",
            kind: "opus",
          },
        ],
        default: "opus_192_48000",
      }),
    );
    await loadCodecs();
    expect(
      settings.options.find((o) => o.id === "opus_64_48000")?.approxMbPerHour,
    ).toBe(29);
    expect(
      settings.options.find((o) => o.id === "opus_192_48000")?.approxMbPerHour,
    ).toBeUndefined();
  });
});
