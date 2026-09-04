import { describe, expect, it } from "vitest";
import { leftoverSpecsFromRecords } from "@/downloads/migrate";

describe("leftoverSpecsFromRecords", () => {
  it("emits audio + album thumb specs", () => {
    const specs = leftoverSpecsFromRecords(
      [
        {
          trackId: "t1",
          codec: "flac_16_44100",
          ext: "flac",
          status: "ready",
        },
      ],
      [{ albumId: "alb", hasThumb: true }],
      [],
    );
    expect(specs.map((s) => s.key)).toEqual([
      "audio/t1.flac_16_44100.flac",
      "covers/albums/alb.thumb.webp",
    ]);
  });

  it("includes flagged files even when the track is broken", () => {
    const specs = leftoverSpecsFromRecords(
      [{ trackId: "t2", codec: "source", ext: "mp3", status: "broken" }],
      [],
      [{ artistId: "ar", hasThumb: true, hasFull: true }],
    );
    expect(specs.map((s) => s.key)).toEqual([
      "audio/t2.source.mp3",
      "covers/artists/ar.thumb.webp",
      "covers/artists/ar.full.webp",
    ]);
  });
});
