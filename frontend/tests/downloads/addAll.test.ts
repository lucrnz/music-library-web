import { beforeEach, describe, expect, it, vi } from "vitest";

const loadDownloadsCatalogView = vi.hoisted(() => vi.fn());
const addToQueue = vi.hoisted(() => vi.fn());
const playAllTracks = vi.hoisted(() => vi.fn());

vi.mock("@/downloads/snapshot", () => ({ loadDownloadsCatalogView }));
vi.mock("@/stores/playlist", () => ({ addToQueue }));
vi.mock("@/stores/player", () => ({ playAllTracks }));

import {
  addAllDownloadedAlbum,
  addAllDownloadedArtist,
  playAllDownloadedAlbum,
  playAllDownloadedArtist,
} from "@/downloads/addAll";
import type { CatalogTrackRecord } from "@/models/track";

const t1: CatalogTrackRecord = {
  trackId: "t1",
  title: "One",
  albumId: "alb-1",
  primaryArtistId: "art-1",
};
const t2: CatalogTrackRecord = {
  trackId: "t2",
  title: "Two",
  albumId: "alb-2",
  primaryArtistId: "art-1",
};

describe("addAllDownloaded*", () => {
  beforeEach(() => {
    loadDownloadsCatalogView.mockReset();
    addToQueue.mockReset();
    addToQueue.mockResolvedValue(undefined);
    playAllTracks.mockReset();
    playAllTracks.mockResolvedValue(undefined);
    loadDownloadsCatalogView.mockResolvedValue({
      artUrls: {},
      roots: [],
      hierarchy: {
      artists: [
        {
          artistId: "art-1",
          name: "A",
          hasThumb: false,
          albums: [
            { albumId: "alb-1", title: "L1", hasThumb: false, tracks: [t1] },
            { albumId: "alb-2", title: "L2", hasThumb: false, tracks: [t2] },
          ],
        },
      ],
      },
    });
  });

  it("queues one album from the catalog", async () => {
    await addAllDownloadedAlbum("alb-2");
    expect(loadDownloadsCatalogView).toHaveBeenCalled();
    expect(addToQueue).toHaveBeenCalledOnce();
    const queued = addToQueue.mock.calls[0][0];
    expect(queued.map((t: { id: string }) => t.id)).toEqual(["t2"]);
  });

  it("flattens every album for an artist", async () => {
    await addAllDownloadedArtist("art-1");
    const queued = addToQueue.mock.calls[0][0];
    expect(queued.map((t: { id: string }) => t.id)).toEqual(["t1", "t2"]);
  });

  it("does not queue when the id is missing", async () => {
    await addAllDownloadedAlbum("nope");
    expect(addToQueue).not.toHaveBeenCalled();
  });

  it("plays one album from the catalog", async () => {
    await playAllDownloadedAlbum("alb-2");
    expect(playAllTracks).toHaveBeenCalledOnce();
    const queued = playAllTracks.mock.calls[0][0];
    expect(queued.map((t: { id: string }) => t.id)).toEqual(["t2"]);
    expect(addToQueue).not.toHaveBeenCalled();
  });

  it("plays every album for an artist", async () => {
    await playAllDownloadedArtist("art-1");
    const queued = playAllTracks.mock.calls[0][0];
    expect(queued.map((t: { id: string }) => t.id)).toEqual(["t1", "t2"]);
  });

  it("does not play when the album id is missing", async () => {
    await playAllDownloadedAlbum("nope");
    expect(playAllTracks).not.toHaveBeenCalled();
  });
});
