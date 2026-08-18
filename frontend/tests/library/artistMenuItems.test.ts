import { describe, expect, it } from "vitest";
import { downloadAllOutcome } from "@/components/library/artistMenuItems";
import { artistArtOverlays, menuHasPreferred } from "@/artistArt/state";
import { buildArtistMenuItems } from "@/components/library/artistMenuItems";
import type { ArtistListItem } from "@/api";

function artist(partial: Partial<ArtistListItem> = {}): ArtistListItem {
  return {
    id: "a1",
    name: "A",
    album_count: 1,
    track_count: 2,
    has_preferred_image: false,
    preferred_rev: 0,
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
    });
    expect(items.map((i) => i.id)).toEqual([
      "add-all",
      "copy-artist",
      "change-photo",
    ]);
  });

  it("includes download and use-library when enabled / preferred", () => {
    artistArtOverlays.clear();
    const items = buildArtistMenuItems({
      artist: artist({ has_preferred_image: true }),
      includePhoto: true,
      addAll: () => {},
      downloadAll: () => {},
    });
    expect(items.map((i) => i.id)).toEqual([
      "add-all",
      "download-all",
      "copy-artist",
      "change-photo",
      "use-library",
    ]);
    expect(menuHasPreferred(artist({ has_preferred_image: true }))).toBe(true);
  });

  it("drops photo items when includePhoto is false", () => {
    const items = buildArtistMenuItems({
      artist: artist({ has_preferred_image: true }),
      includePhoto: false,
      addAll: () => {},
      downloadAll: () => {},
    });
    expect(items.map((i) => i.id)).toEqual([
      "add-all",
      "download-all",
      "copy-artist",
    ]);
  });

  it("omits copy when the artist name is empty", () => {
    const items = buildArtistMenuItems({
      artist: artist({ name: "  " }),
      includePhoto: false,
      addAll: () => {},
    });
    expect(items.map((i) => i.id)).toEqual(["add-all"]);
  });
});
