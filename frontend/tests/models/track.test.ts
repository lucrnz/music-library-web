import { describe, expect, it } from "vitest";
import { fromApiTrack } from "@/models/track";

describe("fromApiTrack", () => {
  it("maps snake_case API fields", () => {
    const track = fromApiTrack({
      id: "t1",
      path: "a/b.flac",
      title: "Song",
      artist: "A",
      album: "B",
      album_id: "alb",
      artist_id: "art",
      is_missing: false,
      is_lossy: true,
      source_codec: "mp3",
    });
    expect(track.albumId).toBe("alb");
    expect(track.isLossy).toBe(true);
    expect(track.sourceCodec).toBe("mp3");
    expect(track.path).toBe("a/b.flac");
  });

  it("keeps a null path for missing tracks", () => {
    const track = fromApiTrack({
      id: "t1",
      path: null,
      is_missing: true,
    });
    expect(track.path).toBeNull();
    expect(track.isMissing).toBe(true);
  });
});
