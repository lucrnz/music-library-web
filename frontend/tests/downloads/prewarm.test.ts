import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/playback/prepare", () => ({
  requestPrepare: vi.fn(),
  requestForget: vi.fn(),
}));

vi.mock("@/stores/playlist", () => ({
  pl: { tracks: [] as Array<{ id?: string }> },
}));

vi.mock("@/connectivity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/connectivity")>();
  return { ...actual, canReachServer: vi.fn(() => true) };
});

import { canReachServer } from "@/connectivity";
import { downloads } from "@/downloads/state";
import {
  DOWNLOAD_PREWARM_WINDOW,
  forgetDownloadPrewarm,
  resetDownloadPrewarmState,
  selectDownloadPrewarmWindow,
  syncDownloadPrewarm,
  type DownloadPrewarmRow,
} from "@/downloads/prewarm";
import { requestForget, requestPrepare } from "@/playback/prepare";
import { pl } from "@/stores/playlist";

function row(
  trackId: string,
  extra: Partial<DownloadPrewarmRow> = {},
): DownloadPrewarmRow {
  return {
    trackId,
    codec: "opus_192_48000",
    state: "pending",
    addedAt: 1,
    snapshot: { isLossy: false },
    ...extra,
  };
}

describe("selectDownloadPrewarmWindow", () => {
  it("keeps the first 8 of 12 pending lossless rows", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row(`t${i + 1}`, { addedAt: i + 1, id: i + 1 }),
    );
    const groups = selectDownloadPrewarmWindow(rows);
    expect(groups).toEqual([
      {
        codec: "opus_192_48000",
        ids: Array.from({ length: DOWNLOAD_PREWARM_WINDOW }, (_, i) => `t${i + 1}`),
      },
    ]);
  });

  it("skips active, failed, and canceled; includes paused", () => {
    const groups = selectDownloadPrewarmWindow([
      row("active", { state: "active", addedAt: 1 }),
      row("failed", { state: "failed", addedAt: 2 }),
      row("canceled", { state: "canceled", addedAt: 3 }),
      row("paused", { state: "paused", addedAt: 4 }),
      row("pending", { state: "pending", addedAt: 5 }),
    ]);
    expect(groups[0]?.ids).toEqual(["paused", "pending"]);
  });

  it("skips lossy and source codec", () => {
    const groups = selectDownloadPrewarmWindow([
      row("lossy", { snapshot: { isLossy: true }, addedAt: 1 }),
      row("src", { codec: "source", addedAt: 2 }),
      row("ok", { addedAt: 3 }),
    ]);
    expect(groups[0]?.ids).toEqual(["ok"]);
  });

  it("groups two codecs in first-seen window order", () => {
    const groups = selectDownloadPrewarmWindow([
      row("a", { codec: "opus_192_48000", addedAt: 1 }),
      row("b", { codec: "flac_16_44100", addedAt: 2 }),
      row("c", { codec: "opus_192_48000", addedAt: 3 }),
    ]);
    expect(groups).toEqual([
      { codec: "opus_192_48000", ids: ["a", "c"] },
      { codec: "flac_16_44100", ids: ["b"] },
    ]);
  });

  it("breaks addedAt ties by id", () => {
    const groups = selectDownloadPrewarmWindow([
      row("late", { addedAt: 1, id: 20 }),
      row("early", { addedAt: 1, id: 3 }),
    ]);
    expect(groups[0]?.ids).toEqual(["early", "late"]);
  });
});

describe("syncDownloadPrewarm / forgetDownloadPrewarm", () => {
  beforeEach(() => {
    resetDownloadPrewarmState();
    downloads.enabled = true;
    vi.mocked(canReachServer).mockReturnValue(true);
    vi.mocked(requestPrepare).mockClear();
    vi.mocked(requestForget).mockClear();
    (pl as { tracks: Array<{ id?: string }> }).tracks = [];
  });

  it("posts one download-tier group of 8", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row(`t${i + 1}`, { addedAt: i + 1, id: i + 1 }),
    );
    syncDownloadPrewarm(rows);
    expect(requestPrepare).toHaveBeenCalledTimes(1);
    expect(requestPrepare).toHaveBeenCalledWith(
      Array.from({ length: 8 }, (_, i) => `t${i + 1}`),
      "opus_192_48000",
      { tier: "download" },
    );
  });

  it("does not re-POST an unchanged window", () => {
    const rows = [row("a", { addedAt: 1, id: 1 })];
    syncDownloadPrewarm(rows);
    syncDownloadPrewarm(rows);
    expect(requestPrepare).toHaveBeenCalledTimes(1);
  });

  it("skips when the server is unreachable", () => {
    vi.mocked(canReachServer).mockReturnValue(false);
    syncDownloadPrewarm([row("a", { addedAt: 1, id: 1 })]);
    expect(requestPrepare).not.toHaveBeenCalled();
  });

  it("forgets ids that are not on the play queue", () => {
    (pl as { tracks: Array<{ id?: string }> }).tracks = [
      { id: "keep" },
      { id: "also" },
    ];
    forgetDownloadPrewarm(["keep", "drop", "drop", "also"]);
    expect(requestForget).toHaveBeenCalledWith(["drop"]);
  });
});
