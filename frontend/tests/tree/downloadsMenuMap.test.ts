import { describe, expect, it } from "vitest";
import {
  albumFromDl,
  artistFromDl,
  trackFromDl,
} from "@/components/tree/sources/downloadsSource";
import type { CatalogTrackRecord } from "@/models/track";

describe("downloads tree projectors", () => {
  it("maps artistId to ArtistListItem.id", () => {
    const artist = artistFromDl({
      artistId: "ar-1",
      name: "A",
      hasThumb: false,
      albums: [
        {
          albumId: "al-1",
          title: "LP",
          hasThumb: false,
          tracks: [{ trackId: "t1" }, { trackId: "t2" }],
        },
      ],
    });
    expect(artist.id).toBe("ar-1");
    expect(artist.name).toBe("A");
    expect(artist.album_count).toBe(1);
    expect(artist.track_count).toBe(2);
    expect(artist.has_preferred_image).toBe(false);
  });

  it("maps albumId and parent artist name", () => {
    const album = albumFromDl(
      {
        albumId: "al-1",
        title: "LP",
        hasThumb: false,
        tracks: [{ trackId: "t1" }],
      },
      "Parent",
    );
    expect(album.id).toBe("al-1");
    expect(album.title).toBe("LP");
    expect(album.artist).toBe("Parent");
  });

  it("projects a catalog track", () => {
    const rec: CatalogTrackRecord = {
      trackId: "t1",
      title: "Song",
      albumId: "al-1",
      primaryArtistId: "ar-1",
    };
    expect(trackFromDl(rec).id).toBe("t1");
    expect(trackFromDl(rec).title).toBe("Song");
  });
});
