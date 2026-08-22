import { describe, expect, it } from "vitest";
import { downloadAllOutcome } from "@/components/library/artistMenuItems";
import { artistArtOverlays, menuHasPreferred } from "@/artistArt/state";
import { buildArtistMenuItems } from "@/components/library/artistMenuItems";
import type { Artist } from "@/models/artist";

function artist(partial: Partial<Artist> = {}): Artist {
  return {
    id: "a1",
    name: "A",
    sortName: null,
    albumCount: 1,
    trackCount: 2,
    hasImage: false,
    hasPreferredImage: false,
    preferredRev: 0,
    ...partial,
  };
}

describe("downloadAllOutcome", () => {
  it("splits nothing vs already vs confirm", () => {
    expect(downloadAllOutcome(0, 0)).toBe("nothing");
    expect(downloadAllOutcome(0, 4)).toBe("already");
    expect(downloadAllOutcome(3, 0)).toBe("confirm");
    expect(downloadAllOutcome(3, 1)).toBe("confirm");
  });
});

describe("buildArtistMenuItems", () => {
  it("omits download when disabled and omit use-library without preferred", () => {
    const items = buildArtistMenuItems({
      artist: artist(),
      includePhoto: true,
      addAll: () => {},
      playAll: () => {},
    });
    expect(items.map((i) => i.id)).toEqual([
      "add-all",
      "play-all",
      "copy-artist",
      "change-photo",
    ]);
    expect(items.find((i) => i.id === "copy-artist")?.icon).toBe("copy");
  });

  it("includes download and use-library when enabled / preferred", () => {
    artistArtOverlays.clear();
    const items = buildArtistMenuItems({
      artist: artist({ hasPreferredImage: true }),
      includePhoto: true,
      addAll: () => {},
      playAll: () => {},
      downloadAll: () => {},
    });
    expect(items.map((i) => i.id)).toEqual([
      "add-all",
      "play-all",
      "download-all",
      "copy-artist",
      "change-photo",
      "use-library",
    ]);
    expect(menuHasPreferred(artist({ hasPreferredImage: true }))).toBe(true);
  });

  it("drops photo items when includePhoto is false", () => {
    const items = buildArtistMenuItems({
      artist: artist({ hasPreferredImage: true }),
      includePhoto: false,
      addAll: () => {},
      playAll: () => {},
      downloadAll: () => {},
    });
    expect(items.map((i) => i.id)).toEqual([
      "add-all",
      "play-all",
      "download-all",
      "copy-artist",
    ]);
  });

  it("omits copy when the artist name is empty", () => {
    const items = buildArtistMenuItems({
      artist: artist({ name: "  " }),
      includePhoto: false,
      addAll: () => {},
      playAll: () => {},
    });
    expect(items.map((i) => i.id)).toEqual(["add-all", "play-all"]);
  });
});
