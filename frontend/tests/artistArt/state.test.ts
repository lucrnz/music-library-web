import { afterEach, describe, expect, it } from "vitest";
import {
  artistArtOverlays,
  coverSrc,
  menuHasPreferred,
} from "@/artistArt/state";
import type { ArtistListItem } from "@/api";

function artist(partial: Partial<ArtistListItem> = {}): ArtistListItem {
  return {
    id: "a1",
    name: "Artist",
    album_count: 1,
    track_count: 1,
    has_preferred_image: true,
    preferred_rev: 1,
    ...partial,
  };
}

afterEach(() => {
  artistArtOverlays.clear();
});

describe("artist art overlay", () => {
  it("coverSrc prefers overlay rev over the artist object", () => {
    artistArtOverlays.set("a1", { hasPreferred: true, preferredRev: 4 });
    expect(coverSrc(artist())).toContain("rev=4");
  });

  it("pending revert keeps the preferred thumb and hides the menu item", () => {
    artistArtOverlays.set("a1", {
      hasPreferred: true,
      preferredRev: 3,
      pending: "revert",
    });
    const a = artist({ preferred_rev: 3 });
    expect(coverSrc(a)).toContain("rev=3");
    expect(menuHasPreferred(a)).toBe(false);
  });

  it("menuHasPreferred is not a truthy pending check", () => {
    artistArtOverlays.set("a1", {
      hasPreferred: false,
      preferredRev: 1,
      pending: "upload",
    });
    expect(menuHasPreferred(artist({ has_preferred_image: false }))).toBe(true);
    artistArtOverlays.set("a1", {
      hasPreferred: true,
      preferredRev: 1,
    });
    expect(menuHasPreferred(artist())).toBe(true);
    artistArtOverlays.delete("a1");
    expect(menuHasPreferred(artist({ has_preferred_image: true }))).toBe(true);
    expect(menuHasPreferred(artist({ has_preferred_image: false }))).toBe(false);
  });
});
