import { describe, expect, it, vi } from "vitest";

vi.mock("@/router", () => ({ router: { push: vi.fn() } }));
vi.mock("@/stores/player", () => ({
  playIndex: vi.fn(),
  stopPlayback: vi.fn(),
}));
vi.mock("@/downloads/ui", () => ({
  confirmRemoveDownloadedTrack: vi.fn(),
  downloadTrack: vi.fn(),
}));

import { pl } from "@/stores/playlist";
import {
  buildQueueMenuItems,
  slotKey,
} from "@/components/playlist/queueMenuItems";
import type { Track } from "@/models/track";

function track(partial: Partial<Track> = {}): Track {
  return {
    id: "t1",
    path: null,
    title: "Song",
    artist: "A",
    album: "LP",
    albumId: "al1",
    artistId: "ar1",
    albumArtist: "",
    albumArtistId: null,
    track: 1,
    disc: 1,
    year: null,
    duration: null,
    durationMs: null,
    isMissing: false,
    sampleRateHz: null,
    bitDepth: null,
    isLossy: false,
    sourceCodec: null,
    bitrateKbps: null,
    bitrateMode: null,
    ...partial,
  };
}

describe("buildQueueMenuItems", () => {
  it("puts copies between go-to and download/remove", () => {
    const t = track();
    pl.tracks = [t];
    const items = buildQueueMenuItems({
      track: t,
      index: 0,
      openedKey: slotKey(t),
    });
    const ids = items.map((i) => i.id);
    const go = ids.indexOf("go-artist");
    const copy = ids.indexOf("copy-title");
    const remove = ids.indexOf("remove");
    expect(go).toBeGreaterThanOrEqual(0);
    expect(copy).toBeGreaterThan(go);
    expect(remove).toBeGreaterThan(copy);
    expect(ids).toContain("copy-artist");
    expect(ids).toContain("copy-album");
    expect(
      items.filter((i) => i.id.startsWith("copy-")).every((i) => i.icon === "copy"),
    ).toBe(true);
  });

  it("omits empty copies", () => {
    const t = track({ title: "", artist: "", album: "" });
    const ids = buildQueueMenuItems({
      track: t,
      index: 0,
      openedKey: slotKey(t),
    }).map((i) => i.id);
    expect(ids).not.toContain("copy-title");
    expect(ids).not.toContain("copy-artist");
    expect(ids).not.toContain("copy-album");
  });
});
