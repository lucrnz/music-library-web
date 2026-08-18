import { beforeEach, describe, expect, it, vi } from "vitest";

const getLyricsRecord = vi.hoisted(() => vi.fn());
const fetchLyrics = vi.hoisted(() => vi.fn());

vi.mock("@/api", () => ({ fetchLyrics }));
vi.mock("@/downloads/lyricsStore", () => ({
  getLyricsRecord,
  putLyricsRecord: vi.fn(),
}));
vi.mock("@/downloads/catalog", () => ({ getTrackRecord: vi.fn() }));

import { peekLyricsMemory, resolveLyrics } from "@/lyrics/cache";
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
});
