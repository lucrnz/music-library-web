import { afterEach, describe, expect, it } from "vitest";
import {
  artistArtOverlays,
  coverSrc,
  menuHasPreferred,
} from "@/artistArt/state";
import type { Artist } from "@/models/artist";

function artist(partial: Partial<Artist> = {}): Artist {
  return {
    id: "a1",
    name: "Artist",
    sortName: null,
    albumCount: 1,
    trackCount: 1,
    hasImage: false,
    hasPreferredImage: true,
    preferredRev: 1,
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
    const a = artist({ preferredRev: 3 });
    expect(coverSrc(a)).toContain("rev=3");
    expect(menuHasPreferred(a)).toBe(false);
  });

  it("menuHasPreferred is not a truthy pending check", () => {
    artistArtOverlays.set("a1", {
      hasPreferred: false,
      preferredRev: 1,
      pending: "upload",
    });
    expect(menuHasPreferred(artist({ hasPreferredImage: false }))).toBe(true);
    artistArtOverlays.set("a1", {
      hasPreferred: true,
      preferredRev: 1,
    });
    expect(menuHasPreferred(artist())).toBe(true);
    artistArtOverlays.delete("a1");
    expect(menuHasPreferred(artist({ hasPreferredImage: true }))).toBe(true);
    expect(menuHasPreferred(artist({ hasPreferredImage: false }))).toBe(false);
  });
});
