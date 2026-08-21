import { describe, expect, it, vi } from "vitest";
import type { BrowseSource } from "@/components/library/browseSource";
import { entityActionsFor } from "@/components/library/entityActions";
import { onlineBrowse } from "@/components/library/sources/onlineBrowse";
import { downloadsBrowse } from "@/components/library/sources/downloadsBrowse";
import type { Artist } from "@/models/artist";
import type { LibraryAlbum } from "@/components/library/loaders";

vi.mock("@/router", () => ({ router: { push: vi.fn() } }));
vi.mock("@/components/library/rows", () => ({
  queueOnly: vi.fn(),
}));

const artist: Artist = {
  id: "ar1",
  name: "A",
  sortName: null,
  albumCount: 1,
  trackCount: 2,
  hasImage: false,
  hasPreferredImage: false,
  preferredRev: 0,
};

const album: LibraryAlbum = {
  id: "al1",
  title: "LP",
  artist: "A",
};

function idsFor(
  source: BrowseSource,
  ctx: { downloadsEnabled: boolean; includePhoto: boolean },
  target:
    | { kind: "artist"; artist: Artist }
    | { kind: "album"; album: LibraryAlbum },
) {
  return entityActionsFor(source, ctx)(target).map((i) => i.id);
}

describe("entityActionsFor", () => {
  it("online injects download runs when enabled", () => {
    expect(
      idsFor(
        onlineBrowse,
        { downloadsEnabled: true, includePhoto: false },
        { kind: "artist", artist },
      ),
    ).toEqual(["add-all", "download-all", "copy-artist"]);
    expect(
      idsFor(
        onlineBrowse,
        { downloadsEnabled: true, includePhoto: false },
        { kind: "album", album },
      ),
    ).toEqual(["add-all", "download", "copy-album", "copy-artist"]);
  });

  it("online omits download runs when disabled", () => {
    expect(
      idsFor(
        onlineBrowse,
        { downloadsEnabled: false, includePhoto: false },
        { kind: "artist", artist },
      ),
    ).toEqual(["add-all", "copy-artist"]);
    expect(
      idsFor(
        onlineBrowse,
        { downloadsEnabled: false, includePhoto: false },
        { kind: "album", album },
      ),
    ).toEqual(["add-all", "copy-album", "copy-artist"]);
  });

  it("downloads source never injects download runs", () => {
    expect(
      idsFor(
        downloadsBrowse,
        { downloadsEnabled: true, includePhoto: false },
        { kind: "artist", artist },
      ),
    ).toEqual(["add-all", "copy-artist"]);
    expect(
      idsFor(
        downloadsBrowse,
        { downloadsEnabled: true, includePhoto: false },
        { kind: "album", album },
      ),
    ).toEqual(["add-all", "copy-album", "copy-artist"]);
  });

  it("photo items follow includePhoto", () => {
    expect(
      idsFor(
        onlineBrowse,
        { downloadsEnabled: false, includePhoto: true },
        { kind: "artist", artist },
      ),
    ).toEqual(["add-all", "copy-artist", "change-photo"]);
    expect(
      idsFor(
        downloadsBrowse,
        { downloadsEnabled: false, includePhoto: false },
        { kind: "artist", artist },
      ),
    ).not.toContain("change-photo");
  });
});
