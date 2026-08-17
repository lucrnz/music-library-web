import { beforeEach, describe, expect, it, vi } from "vitest";

const { canDetectConnectionType, isConstrainedConnection } = vi.hoisted(() => ({
  canDetectConnectionType: vi.fn(() => false),
  isConstrainedConnection: vi.fn(() => false),
}));

vi.mock("@/api", () => ({
  apiGet: vi.fn(),
  requestPrepare: vi.fn(),
  preparedKeys: { clear: vi.fn() },
}));
vi.mock("@/networkConstraints", () => ({
  canDetectConnectionType,
  isConstrainedConnection,
  onConstraintChange: vi.fn(),
}));
vi.mock("@/diag/log", () => ({ emit: vi.fn() }));
vi.mock("@/connectivity", () => ({
  reportFailure: vi.fn(),
  reportSuccess: vi.fn(),
}));

import {
  getActiveStreamCodec,
  setDownloadCodec,
  setPlaybackPolicy,
  setStreamWifi,
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
    settings.streamWifi = "opus_192_48000";
    settings.streamCellular = "opus_192_48000";
    settings.download = "opus_192_48000";
    settings.playbackPolicy = "prefer_better";
    canDetectConnectionType.mockReturnValue(false);
    isConstrainedConnection.mockReturnValue(false);
  });

  it("writes playback policy, download, and wifi keys", () => {
    expect(setPlaybackPolicy("prefer_stream")).toBe(true);
    expect(localStorage.getItem("musicweb.playbackPolicy")).toBe("prefer_stream");
    expect(setDownloadCodec("flac_16_44100")).toBe(true);
    expect(localStorage.getItem("musicweb.downloadCodec")).toBe("flac_16_44100");
    expect(
      setStreamWifi("flac_16_44100", {
        tracks: [],
        index: 0,
        playIndex: () => {},
      }),
    ).toBe(true);
    expect(localStorage.getItem("musicweb.streamCodec")).toBe("flac_16_44100");
  });

  it("picks wifi vs cellular from networkConstraints mocks", () => {
    settings.streamWifi = "flac_16_44100";
    settings.streamCellular = "opus_192_48000";
    canDetectConnectionType.mockReturnValue(false);
    expect(getActiveStreamCodec()).toBe("flac_16_44100");
    canDetectConnectionType.mockReturnValue(true);
    isConstrainedConnection.mockReturnValue(false);
    expect(getActiveStreamCodec()).toBe("flac_16_44100");
    isConstrainedConnection.mockReturnValue(true);
    expect(getActiveStreamCodec()).toBe("opus_192_48000");
    settings.streamCellular = null;
    expect(getActiveStreamCodec()).toBe("flac_16_44100");
  });
});
