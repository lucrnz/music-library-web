import { describe, expect, it } from "vitest";
import { fromApiAlbum } from "@/models/album";

describe("fromApiAlbum", () => {
  it("maps snake_case API fields including lossy_kind", () => {
    const album = fromApiAlbum({
      id: "alb",
      title: "OK Computer",
      artist: "Radiohead",
      artist_id: "art",
      track_count: 12,
      has_cover: true,
      lossy_kind: "mixed",
    });
    expect(album.artistId).toBe("art");
    expect(album.trackCount).toBe(12);
    expect(album.hasCover).toBe(true);
    expect(album.lossyKind).toBe("mixed");
  });
});
