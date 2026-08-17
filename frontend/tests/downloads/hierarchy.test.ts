import { describe, expect, it } from "vitest";
import { assembleDownloadsHierarchy } from "@/downloads/hierarchy";
import type { CatalogTrackRecord } from "@/models/track";

describe("assembleDownloadsHierarchy", () => {
  it("groups, sorts, and falls back titles", () => {
    const tracks: CatalogTrackRecord[] = [
      {
        trackId: "t2",
        albumId: "alb-a",
        primaryArtistId: "art-z",
        primaryArtistName: "Zebra",
        album: "Zebra LP",
        disc: 1,
        trackNum: 2,
      },
      {
        trackId: "t1",
        albumId: "alb-a",
        primaryArtistId: "art-z",
        album: "Zebra LP",
        disc: 1,
        trackNum: 1,
      },
      {
        trackId: "orphan",
        album: "Orphan album",
      },
    ];
    const tree = assembleDownloadsHierarchy(
      tracks,
      [{ albumId: "alb-a", title: "Sorted A", hasThumb: true }],
      [{ artistId: "art-z", name: "Zebra", hasThumb: false }],
    );
    expect(tree.artists.map((a) => a.name)).toEqual(["Unknown artist", "Zebra"]);
    const zebra = tree.artists.find((a) => a.artistId === "art-z")!;
    expect(zebra.albums[0].title).toBe("Sorted A");
    expect(zebra.albums[0].tracks.map((t) => t.trackId)).toEqual(["t1", "t2"]);
    const unknown = tree.artists.find((a) => a.artistId === "_unknown")!;
    expect(unknown.albums[0].title).toBe("Orphan album");
    expect(unknown.albums[0].albumId).toBe("_no_album");
  });
});
