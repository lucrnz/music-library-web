import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/downloads/catalog", () => ({
  getTrackRecord: vi.fn(),
  getLocalAudioUrlForRecord: vi.fn(),
  getLocalCoverUrl: vi.fn(),
}));

import {
  getLocalAudioUrlForRecord,
  getTrackRecord,
} from "@/downloads/catalog";
import { resolvePlaySource, shouldPreferLocalOnline } from "@/downloads/resolve";

const catalog = [{ id: "flac_16_44100" }, { id: "opus_192_48000" }];

describe("shouldPreferLocalOnline", () => {
  it("honors the three playback policies", () => {
    expect(
      shouldPreferLocalOnline(
        "flac_16_44100",
        "opus_192_48000",
        "prefer_offline",
        catalog,
      ),
    ).toBe(true);
    expect(
      shouldPreferLocalOnline(
        "flac_16_44100",
        "opus_192_48000",
        "prefer_stream",
        catalog,
      ),
    ).toBe(false);
    expect(
      shouldPreferLocalOnline(
        "flac_16_44100",
        "opus_192_48000",
        "prefer_better",
        catalog,
      ),
    ).toBe(true);
  });
});

describe("resolvePlaySource probeRemote", () => {
  beforeEach(() => {
    vi.mocked(getTrackRecord).mockReset();
    vi.mocked(getLocalAudioUrlForRecord).mockReset();
  });

  it("falls through to stream when offline, no local, and probeRemote", async () => {
    vi.mocked(getTrackRecord).mockResolvedValue(undefined);
    const source = await resolvePlaySource(
      { id: "t1", title: "Song" },
      {
        enabled: true,
        offline: true,
        activeStreamCodec: "opus_192_48000",
        probeRemote: true,
      },
    );
    expect(source).toEqual({
      source: "streaming",
      url: "/api/stream?id=t1&codec=opus_192_48000",
      profile: "opus_192_48000",
    });
  });

  it("still plays a local file when offline and probeRemote", async () => {
    vi.mocked(getTrackRecord).mockResolvedValue({
      trackId: "t1",
      codec: "flac_16_44100",
      status: "ready",
    });
    vi.mocked(getLocalAudioUrlForRecord).mockResolvedValue("blob:local");
    const source = await resolvePlaySource(
      { id: "t1", title: "Song" },
      {
        enabled: true,
        offline: true,
        activeStreamCodec: "opus_192_48000",
        probeRemote: true,
      },
    );
    expect(source).toEqual({
      source: "downloaded",
      url: "blob:local",
      profile: "flac_16_44100",
    });
  });
});
