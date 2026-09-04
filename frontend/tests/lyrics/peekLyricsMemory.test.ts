import { beforeEach, describe, expect, it, vi } from "vitest";

const getLyricsRecord = vi.hoisted(() => vi.fn());
const putLyricsRecord = vi.hoisted(() => vi.fn());
const fetchLyrics = vi.hoisted(() => vi.fn());
const getOne = vi.hoisted(() => vi.fn());

vi.mock("@/api", () => ({ fetchLyrics }));
vi.mock("@/downloads/lyricsStore", () => ({
  getLyricsRecord,
  putLyricsRecord,
}));
vi.mock("@/downloads/db", () => ({ getOne }));
vi.mock("@/downloads/catalog", () => ({ getTrackRecord: vi.fn() }));

import {
  cacheLyricsForDownload,
  dropLyricsMemory,
  peekLyricsMemory,
  rememberLyricsMemory,
  resolveLyrics,
} from "@/lyrics/cache";
import { emptyLyrics } from "@/models/lyrics";

describe("peekLyricsMemory", () => {
  beforeEach(() => {
    getLyricsRecord.mockReset();
    putLyricsRecord.mockReset();
    fetchLyrics.mockReset();
    getOne.mockReset();
    getLyricsRecord.mockResolvedValue(null);
    getOne.mockResolvedValue(null);
  });

  it("returns undefined on a miss", () => {
    expect(peekLyricsMemory("missing")).toBeUndefined();
    expect(peekLyricsMemory("")).toBeUndefined();
  });

  it("returns a remembered instrumental without treating miss as not_found", async () => {
    fetchLyrics.mockResolvedValue({
      ...emptyLyrics("t-inst"),
      trackId: "t-inst",
      status: "instrumental",
      instrumental: true,
    });
    await resolveLyrics("t-inst");
    const peek = peekLyricsMemory("t-inst");
    expect(peek?.status).toBe("instrumental");
    expect(peekLyricsMemory("other")).toBeUndefined();
  });

  it("dropLyricsMemory removes cdrom: keys only", async () => {
    rememberLyricsMemory("cdrom:Music/01.mp3", {
      ...emptyLyrics("cdrom:Music/01.mp3"),
      status: "ok",
      plainText: "old disc",
    });
    rememberLyricsMemory("lib-track", {
      ...emptyLyrics("lib-track"),
      status: "ok",
      plainText: "library",
    });
    dropLyricsMemory("cdrom:");
    expect(peekLyricsMemory("cdrom:Music/01.mp3")).toBeUndefined();
    expect(peekLyricsMemory("lib-track")?.plainText).toBe("library");
  });

  it("persists not_found for a catalog track", async () => {
    getOne.mockResolvedValue({ trackId: "t-nf" });
    fetchLyrics.mockResolvedValue({
      ...emptyLyrics("t-nf"),
      status: "not_found",
    });
    const payload = await resolveLyrics("t-nf");
    expect(payload.status).toBe("not_found");
    expect(putLyricsRecord).toHaveBeenCalledWith(
      "t-nf",
      expect.objectContaining({ status: "not_found" }),
    );
  });

  it("revalidates IDB not_found when allowNetwork", async () => {
    getLyricsRecord.mockResolvedValue({
      trackId: "t-reval",
      payload: { ...emptyLyrics("t-reval"), status: "not_found" },
      savedAt: 1,
    });
    getOne.mockResolvedValue({ trackId: "t-reval" });
    fetchLyrics.mockResolvedValue({
      ...emptyLyrics("t-reval"),
      status: "ok",
      plainText: "found now",
    });
    const payload = await resolveLyrics("t-reval", { allowNetwork: true });
    expect(payload.status).toBe("ok");
    expect(payload.plainText).toBe("found now");
    expect(fetchLyrics).toHaveBeenCalledWith("t-reval");
    expect(putLyricsRecord).toHaveBeenCalled();
  });

  it("cacheLyricsForDownload persists not_found", async () => {
    fetchLyrics.mockResolvedValue({
      ...emptyLyrics("t-dl"),
      status: "not_found",
    });
    await cacheLyricsForDownload("t-dl");
    expect(putLyricsRecord).toHaveBeenCalledWith(
      "t-dl",
      expect.objectContaining({ status: "not_found" }),
    );
  });
});
