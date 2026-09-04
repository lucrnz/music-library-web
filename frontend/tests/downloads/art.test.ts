import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getOne = vi.hoisted(() => vi.fn());
const putOne = vi.hoisted(() => vi.fn());
const fetchArtist = vi.hoisted(() => vi.fn());
const writeFromResponse = vi.hoisted(() => vi.fn());
const readBinary = vi.hoisted(() => vi.fn());

vi.mock("@/downloads/db", () => ({
  getOne,
  putOne,
}));

vi.mock("@/api", () => ({
  fetchArtist,
  artistImageUrl: (artist: { id: string }, size: string) =>
    `/api/artist-image?artist_id=${artist.id}&size=${size}`,
}));

vi.mock("@/exclusive/capability", () => ({
  canUseCompanionDownloads: () => false,
}));

vi.mock("@/downloads/opfs", async () => {
  const actual = await vi.importActual<typeof import("@/downloads/opfs")>(
    "@/downloads/opfs",
  );
  return { ...actual, writeFromResponse, readBinary };
});

import {
  ensureArtistPhoto,
  getLocalArtistFlip,
  getLocalArtistImageUrl,
  wipeArtUrlCache,
} from "@/downloads/art";

function artistRow(partial: Record<string, unknown> = {}) {
  return {
    artistId: "ar1",
    name: "A",
    refCount: 1,
    hasThumb: false,
    hasFull: false,
    hasImage: false,
    hasPreferredImage: false,
    isVa: false,
    preferredRev: 0,
    ...partial,
  };
}

function apiArtist(partial: Record<string, unknown> = {}) {
  return {
    id: "ar1",
    name: "A",
    sortName: null,
    albumCount: 1,
    trackCount: 1,
    hasImage: false,
    hasPreferredImage: false,
    preferredRev: 0,
    isVa: false,
    ...partial,
  };
}

describe("ensureArtistPhoto", () => {
  beforeEach(() => {
    getOne.mockReset();
    putOne.mockReset();
    fetchArtist.mockReset();
    writeFromResponse.mockReset();
    readBinary.mockReset();
    wipeArtUrlCache();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    wipeArtUrlCache();
    vi.unstubAllGlobals();
  });

  it("skips image fetch when flags say there is no photo", async () => {
    getOne.mockResolvedValue(artistRow());
    fetchArtist.mockResolvedValue(apiArtist());
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await ensureArtistPhoto("ar1");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.hasFull).toBe(false);
    expect(result.hasImage).toBe(false);
    expect(putOne).toHaveBeenCalled();
  });

  it("skips image bytes for VA", async () => {
    getOne.mockResolvedValue(artistRow());
    fetchArtist.mockResolvedValue(apiArtist({ isVa: true }));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await ensureArtistPhoto("ar1");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.isVa).toBe(true);
    expect(result.hasFull).toBe(false);
  });

  it("does not set hasFull on a no-store placeholder response", async () => {
    getOne.mockResolvedValue(artistRow());
    fetchArtist.mockResolvedValue(apiArtist({ hasImage: true }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: { get: (name: string) => (name === "Cache-Control" ? "no-store" : null) },
        blob: async () => new Blob(["x"]),
      })),
    );
    const result = await ensureArtistPhoto("ar1");
    expect(result.hasFull).toBe(false);
    expect(writeFromResponse).not.toHaveBeenCalled();
  });

  it("getLocalArtistImageUrl full returns a blob URL when hasFull", async () => {
    getOne.mockResolvedValue(artistRow({ hasFull: true }));
    readBinary.mockResolvedValue(new Blob(["full"]));
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => "blob:artist-full",
      revokeObjectURL: () => {},
    });
    await expect(getLocalArtistImageUrl("ar1", "full")).resolves.toBe(
      "blob:artist-full",
    );
  });

  it("getLocalArtistFlip returns a full url only when hasFull", async () => {
    getOne.mockResolvedValue(artistRow({ hasFull: true, hasImage: true }));
    readBinary.mockResolvedValue(new Blob(["full"]));
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => "blob:artist-full",
      revokeObjectURL: () => {},
    });
    await expect(getLocalArtistFlip("ar1")).resolves.toEqual({
      imageUrl: "blob:artist-full",
      hasImage: true,
      hasPreferredImage: false,
      isVa: false,
      hasFull: true,
    });

    wipeArtUrlCache();
    getOne.mockResolvedValue(artistRow({ hasThumb: true, hasFull: false }));
    await expect(getLocalArtistFlip("ar1")).resolves.toEqual({
      imageUrl: null,
      hasImage: false,
      hasPreferredImage: false,
      isVa: false,
      hasFull: false,
    });
  });
});
