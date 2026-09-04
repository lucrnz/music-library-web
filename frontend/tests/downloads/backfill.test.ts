import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const canReachServer = vi.hoisted(() => vi.fn(() => true));
const isHardOffline = vi.hoisted(() => vi.fn(() => false));
const getTrackRecord = vi.hoisted(() => vi.fn());
const listTrackRecords = vi.hoisted(() => vi.fn());
const getOne = vi.hoisted(() => vi.fn());
const ensureAlbumArtFiles = vi.hoisted(() => vi.fn());
const ensureArtistPhoto = vi.hoisted(() => vi.fn());
const cacheLyricsForDownload = vi.hoisted(() => vi.fn());
const getLyricsRecord = vi.hoisted(() => vi.fn());
const queueHasWork = vi.hoisted(() => vi.fn());

vi.mock("@/connectivity", () => ({
  canReachServer,
  isHardOffline,
}));

vi.mock("@/downloads/writer", () => ({
  getTrackRecord,
  listTrackRecords,
}));

vi.mock("@/downloads/db", () => ({
  getOne,
}));

vi.mock("@/downloads/art", () => ({
  ensureAlbumArtFiles,
  ensureArtistPhoto,
}));

vi.mock("@/lyrics/cache", () => ({
  cacheLyricsForDownload,
}));

vi.mock("@/downloads/lyricsStore", () => ({
  getLyricsRecord,
}));

vi.mock("@/downloads/queue", () => ({
  queueHasWork,
}));

import {
  backfillTrack,
  requestCompanionsBackfill,
  resetCompanionsBackfillForTests,
} from "@/downloads/backfill";

describe("companions backfill", () => {
  beforeEach(() => {
    resetCompanionsBackfillForTests();
    canReachServer.mockReturnValue(true);
    isHardOffline.mockReturnValue(false);
    getTrackRecord.mockReset();
    listTrackRecords.mockReset();
    getOne.mockReset();
    ensureAlbumArtFiles.mockReset();
    ensureArtistPhoto.mockReset();
    cacheLyricsForDownload.mockReset();
    getLyricsRecord.mockReset();
    queueHasWork.mockReset();
    queueHasWork.mockResolvedValue(false);
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetCompanionsBackfillForTests();
    vi.useRealTimers();
  });

  it("walker no-ops when the server is unreachable", async () => {
    canReachServer.mockReturnValue(false);
    requestCompanionsBackfill();
    await vi.runAllTimersAsync();
    expect(listTrackRecords).not.toHaveBeenCalled();
    expect(ensureAlbumArtFiles).not.toHaveBeenCalled();
  });

  it("backfillTrack fills missing album art, artist photo, and lyrics", async () => {
    getTrackRecord.mockResolvedValue({
      trackId: "t1",
      albumId: "alb1",
      artistIds: ["ar1"],
    });
    getOne.mockImplementation(async (store: string) => {
      if (store === "albums") {
        return { albumId: "alb1", hasThumb: false, hasFull: false };
      }
      if (store === "artists") {
        return { artistId: "ar1" };
      }
      return undefined;
    });
    getLyricsRecord.mockResolvedValue(null);
    await backfillTrack("t1");
    expect(ensureAlbumArtFiles).toHaveBeenCalledWith("alb1");
    expect(ensureArtistPhoto).toHaveBeenCalledWith("ar1");
    expect(cacheLyricsForDownload).toHaveBeenCalledWith("t1");
  });

  it("does not start a second walk while one is in flight", async () => {
    let release: (() => void) | undefined;
    listTrackRecords.mockReturnValue(
      new Promise<unknown[]>((resolve) => {
        release = () => resolve([{ trackId: "t1" }]);
      }),
    );
    getTrackRecord.mockResolvedValue({ trackId: "t1" });
    getLyricsRecord.mockResolvedValue({
      payload: { status: "ok" },
    });
    requestCompanionsBackfill();
    await vi.runOnlyPendingTimersAsync();
    requestCompanionsBackfill();
    await vi.runOnlyPendingTimersAsync();
    expect(listTrackRecords).toHaveBeenCalledTimes(1);
    release?.();
    await vi.runAllTimersAsync();
  });

  it("stops without ensure when the user queue has work", async () => {
    listTrackRecords.mockResolvedValue([{ trackId: "t1", albumId: "alb1" }]);
    queueHasWork.mockResolvedValue(true);
    requestCompanionsBackfill();
    await vi.advanceTimersByTimeAsync(0);
    expect(ensureAlbumArtFiles).not.toHaveBeenCalled();
    expect(ensureArtistPhoto).not.toHaveBeenCalled();
    expect(getTrackRecord).not.toHaveBeenCalled();
  });
});
