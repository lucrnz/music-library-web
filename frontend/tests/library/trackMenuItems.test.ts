import { describe, expect, it } from "vitest";
import { buildAlbumMenuItems } from "@/components/library/albumMenuItems";
import { buildTrackMenuItems } from "@/components/library/trackMenuItems";
import { become } from "@/playback/session";

describe("CD session hides queue mutations", () => {
  it("hides add-all and add-to-playlist while CD is on", () => {
    become("cd");
    const albumItems = buildAlbumMenuItems({
      album: { id: "a", title: "LP", artist: "A" },
      addAll: () => {},
      playAll: () => {},
    });
    expect(albumItems.map((i) => i.id)).not.toContain("add-all");
    expect(albumItems.map((i) => i.id)).toContain("play-all");
    const trackItems = buildTrackMenuItems({
      title: "Song",
      artist: "A",
      album: "LP",
      addToPlaylist: () => {},
    });
    expect(trackItems.map((i) => i.id)).not.toContain("add-to-playlist");
    become("none");
  });
});
