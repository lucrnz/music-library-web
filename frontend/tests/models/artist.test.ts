import { describe, expect, it } from "vitest";
import { fromApiArtist, mapArtists } from "@/models/artist";

describe("fromApiArtist", () => {
  it("maps snake_case API fields", () => {
    const artist = fromApiArtist({
      id: "ar1",
      name: "Radiohead",
      sort_name: "Radiohead",
      album_count: 9,
      track_count: 120,
      has_image: true,
      has_preferred_image: true,
      preferred_rev: 3,
    });
    expect(artist.id).toBe("ar1");
    expect(artist.name).toBe("Radiohead");
    expect(artist.sortName).toBe("Radiohead");
    expect(artist.albumCount).toBe(9);
    expect(artist.trackCount).toBe(120);
    expect(artist.hasImage).toBe(true);
    expect(artist.hasPreferredImage).toBe(true);
    expect(artist.preferredRev).toBe(3);
    expect(artist.isVa).toBe(false);
  });

  it("maps is_va", () => {
    const artist = fromApiArtist({ id: "va", name: "Various Artists", is_va: true });
    expect(artist.isVa).toBe(true);
  });

  it("defaults missing optional flags", () => {
    const artist = fromApiArtist({ id: "ar1", name: "A" });
    expect(artist.sortName).toBeNull();
    expect(artist.albumCount).toBe(0);
    expect(artist.trackCount).toBe(0);
    expect(artist.hasImage).toBe(false);
    expect(artist.hasPreferredImage).toBe(false);
    expect(artist.preferredRev).toBe(0);
    expect(artist.isVa).toBe(false);
  });
});

describe("mapArtists", () => {
  it("skips unmappable rows", () => {
    expect(mapArtists([{ name: "no id" }, { id: "ok", name: "Ok" }])).toEqual([
      {
        id: "ok",
        name: "Ok",
        sortName: null,
        albumCount: 0,
        trackCount: 0,
        hasImage: false,
        hasPreferredImage: false,
        preferredRev: 0,
        isVa: false,
      },
    ]);
  });
});
