import { beforeEach, describe, expect, it, vi } from "vitest";

const getLyricsRecord = vi.hoisted(() => vi.fn());
const fetchLyrics = vi.hoisted(() => vi.fn());

vi.mock("@/api", () => ({ fetchLyrics }));
vi.mock("@/downloads/lyricsStore", () => ({
  getLyricsRecord,
  putLyricsRecord: vi.fn(),
}));
vi.mock("@/downloads/catalog", () => ({ getTrackRecord: vi.fn() }));

import { dropLyricsMemory, peekLyricsMemory, rememberLyricsMemory, resolveLyrics } from "@/lyrics/cache";
import { emptyLyrics } from "@/models/lyrics";

describe("peekLyricsMemory", () => {
  beforeEach(() => {
    getLyricsRecord.mockReset();
    fetchLyrics.mockReset();
    getLyricsRecord.mockResolvedValue(null);
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
});
