import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/downloads/art", () => ({
  getLocalArtistFlip: vi.fn(async () => null),
}));

import {
  artistHasFlipPhoto,
  clearCoverFlipCache,
  coverFlipArtistId,
  flipImageUrl,
  resolveCoverFlip,
} from "@/components/player/coverFlip";
import { fromApiTrack, type Track } from "@/models/track";
import type { Artist } from "@/models/artist";

afterEach(() => {
  clearCoverFlipCache();
});

function track(partial: Record<string, unknown> = {}): Track {
  return fromApiTrack({ id: "t1", title: "Song", ...partial });
}

function artist(partial: Partial<Artist> = {}): Artist {
  return {
    id: "art1",
    name: "Artist",
    sortName: null,
    albumCount: 1,
    trackCount: 1,
    hasImage: false,
    hasPreferredImage: false,
    preferredRev: 0,
    ...partial,
  };
}

describe("coverFlipArtistId", () => {
  it("returns null for a null track", () => {
    expect(coverFlipArtistId(null)).toBeNull();
  });

  it("returns null when both artist ids are missing (_unknown)", () => {
    expect(coverFlipArtistId(track())).toBeNull();
  });

  it("prefers album artist over track artist", () => {
    expect(
      coverFlipArtistId(
        track({ album_artist_id: "aa", artist_id: "ta" }),
      ),
    ).toBe("aa");
  });

  it("falls back to track artist", () => {
    expect(coverFlipArtistId(track({ artist_id: "ta" }))).toBe("ta");
  });
});

describe("artistHasFlipPhoto", () => {
  it("is true for scanned or preferred", () => {
    expect(artistHasFlipPhoto({ hasImage: true })).toBe(true);
    expect(artistHasFlipPhoto({ hasPreferredImage: true })).toBe(true);
    expect(
      artistHasFlipPhoto({ hasImage: false, hasPreferredImage: false }),
    ).toBe(false);
    expect(artistHasFlipPhoto({ isVa: true })).toBe(true);
  });
});

describe("flipImageUrl", () => {
  it("uses size=full and preferred_rev", () => {
    const url = flipImageUrl(
      artist({ id: "a1", preferredRev: 3, hasPreferredImage: true }),
    );
    expect(url).toContain("artist_id=a1");
    expect(url).toContain("size=full");
    expect(url).toContain("rev=3");
  });
});

describe("resolveCoverFlip", () => {
  it("denies a null track without fetching", async () => {
    const fetchArtist = vi.fn();
    const result = await resolveCoverFlip(null, {
      fetchArtist,
      canReachServer: () => true,
    });
    expect(result).toEqual({ ok: false });
    expect(fetchArtist).not.toHaveBeenCalled();
  });

  it("denies _unknown without fetching", async () => {
    const fetchArtist = vi.fn();
    const result = await resolveCoverFlip(track(), {
      fetchArtist,
      canReachServer: () => true,
    });
    expect(result).toEqual({ ok: false });
    expect(fetchArtist).not.toHaveBeenCalled();
  });

  it("denies when unreachable and does not fetch", async () => {
    const fetchArtist = vi.fn();
    const result = await resolveCoverFlip(track({ album_artist_id: "aa" }), {
      fetchArtist,
      canReachServer: () => false,
    });
    expect(result).toEqual({ ok: false });
    expect(fetchArtist).not.toHaveBeenCalled();
  });

  it("allows has_image and returns a full image URL", async () => {
    const fetchArtist = vi.fn().mockResolvedValue(
      artist({ id: "aa", hasImage: true }),
    );
    const result = await resolveCoverFlip(track({ album_artist_id: "aa" }), {
      fetchArtist,
      canReachServer: () => true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artistId).toBe("aa");
    expect(result.imageUrl).toContain("artist_id=aa");
    expect(result.imageUrl).toContain("size=full");
    expect(fetchArtist).toHaveBeenCalledOnce();
    expect(fetchArtist).toHaveBeenCalledWith("aa");
  });

  it("allows preferred-only and puts rev= on the URL", async () => {
    const fetchArtist = vi.fn().mockResolvedValue(
      artist({
        id: "aa",
        hasImage: false,
        hasPreferredImage: true,
        preferredRev: 4,
      }),
    );
    const result = await resolveCoverFlip(track({ album_artist_id: "aa" }), {
      fetchArtist,
      canReachServer: () => true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.imageUrl).toContain("rev=4");
    expect(result.imageUrl).toContain("size=full");
  });

  it("denies when both photo flags are false", async () => {
    const fetchArtist = vi.fn().mockResolvedValue(
      artist({ hasImage: false, hasPreferredImage: false }),
    );
    const result = await resolveCoverFlip(track({ album_artist_id: "aa" }), {
      fetchArtist,
      canReachServer: () => true,
    });
    expect(result).toEqual({ ok: false });
  });

  it("does not cache a thrown fetch; retries when reachable", async () => {
    const fetchArtist = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(artist({ id: "aa", hasImage: true }));
    const t = track({ album_artist_id: "aa" });
    const deps = { fetchArtist, canReachServer: () => true };
    expect(await resolveCoverFlip(t, deps)).toEqual({ ok: false });
    const again = await resolveCoverFlip(t, deps);
    expect(again.ok).toBe(true);
    expect(fetchArtist).toHaveBeenCalledTimes(2);
  });

  it("caches a successful payload (one fetch for two resolves)", async () => {
    const fetchArtist = vi.fn().mockResolvedValue(
      artist({ id: "aa", hasImage: true }),
    );
    const t = track({ album_artist_id: "aa" });
    const deps = { fetchArtist, canReachServer: () => true };
    const first = await resolveCoverFlip(t, deps);
    const second = await resolveCoverFlip(t, deps);
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    expect(fetchArtist).toHaveBeenCalledOnce();
  });

  it("denies after a cache hit when the server becomes unreachable", async () => {
    const fetchArtist = vi.fn().mockResolvedValue(
      artist({ id: "aa", hasImage: true }),
    );
    const t = track({ album_artist_id: "aa" });
    expect(
      (await resolveCoverFlip(t, {
        fetchArtist,
        canReachServer: () => true,
      })).ok,
    ).toBe(true);
    const later = await resolveCoverFlip(t, {
      fetchArtist,
      canReachServer: () => false,
    });
    expect(later).toEqual({ ok: false });
    expect(fetchArtist).toHaveBeenCalledOnce();
  });

  it("uses a local full while unreachable and does not fetch", async () => {
    const fetchArtist = vi.fn();
    const result = await resolveCoverFlip(track({ album_artist_id: "aa" }), {
      fetchArtist,
      canReachServer: () => false,
      getLocalArtist: async () => ({
        imageUrl: "blob:artist-full",
        hasImage: true,
        hasPreferredImage: false,
        isVa: false,
        hasFull: true,
      }),
    });
    expect(result).toEqual({
      ok: true,
      artistId: "aa",
      imageUrl: "blob:artist-full",
    });
    expect(fetchArtist).not.toHaveBeenCalled();
  });

  it("flips VA to the packaged portrait while unreachable", async () => {
    const fetchArtist = vi.fn();
    const result = await resolveCoverFlip(track({ album_artist_id: "va1" }), {
      fetchArtist,
      canReachServer: () => false,
      getLocalArtist: async () => ({
        imageUrl: null,
        hasImage: false,
        hasPreferredImage: false,
        isVa: true,
        hasFull: false,
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artistId).toBe("va1");
    expect(result.imageUrl).toContain("artist_id=va1");
    expect(result.imageUrl).toContain("size=full");
    expect(fetchArtist).not.toHaveBeenCalled();
  });

  it("denies thumb-only local while unreachable", async () => {
    const fetchArtist = vi.fn();
    const result = await resolveCoverFlip(track({ album_artist_id: "aa" }), {
      fetchArtist,
      canReachServer: () => false,
      getLocalArtist: async () => ({
        imageUrl: null,
        hasImage: true,
        hasPreferredImage: false,
        isVa: false,
        hasFull: false,
      }),
    });
    expect(result).toEqual({ ok: false });
    expect(fetchArtist).not.toHaveBeenCalled();
  });
});
