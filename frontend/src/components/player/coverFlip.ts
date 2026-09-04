/**
 * Whether the now-playing cover may flip to the album-artist photo.
 * No Vue. Does not import player.ts or radio.ts.
 */
import {
  artistImageUrl,
  fetchArtist as fetchArtistDefault,
} from "@/api";
import { canReachServer as canReachServerDefault } from "@/connectivity";
import { getLocalArtistFlip as getLocalArtistFlipDefault } from "@/downloads/art";
import type { Artist } from "@/models/artist";
import { primaryArtistIdOf, type Track } from "@/models/track";

const UNKNOWN = "_unknown";

const cache = new Map<string, Artist>();

export type CoverFlipOk = {
  ok: true;
  artistId: string;
  imageUrl: string;
};

export type CoverFlipDenied = { ok: false };

export type CoverFlipResult = CoverFlipOk | CoverFlipDenied;

export type CoverFlipDeps = {
  fetchArtist?: (id: string) => Promise<Artist>;
  canReachServer?: () => boolean;
  getLocalArtist?: typeof getLocalArtistFlipDefault;
};

export function coverFlipArtistId(track: Track | null): string | null {
  if (!track) return null;
  const id = primaryArtistIdOf(track);
  if (!id || id === UNKNOWN) return null;
  return id;
}

export function artistHasFlipPhoto(
  artist: Partial<Pick<Artist, "hasImage" | "hasPreferredImage" | "isVa">>,
): boolean {
  return !!artist.hasImage || !!artist.hasPreferredImage || !!artist.isVa;
}

export function flipImageUrl(artist: Artist): string {
  return artistImageUrl(artist, "full", false);
}

/** Test seam. Not for product callers. */
export function clearCoverFlipCache(): void {
  cache.clear();
}

export async function resolveCoverFlip(
  track: Track | null,
  deps: CoverFlipDeps = {},
): Promise<CoverFlipResult> {
  const canReach = deps.canReachServer ?? canReachServerDefault;
  const fetchArtist = deps.fetchArtist ?? fetchArtistDefault;
  const getLocalArtist = deps.getLocalArtist ?? getLocalArtistFlipDefault;

  const artistId = coverFlipArtistId(track);
  if (!artistId) return { ok: false };

  try {
    const local = await getLocalArtist(artistId);
    if (local?.isVa) {
      return {
        ok: true,
        artistId,
        imageUrl:
          local.imageUrl ||
          flipImageUrl({
            id: artistId,
            name: "",
            sortName: null,
            albumCount: 0,
            trackCount: 0,
            hasImage: false,
            hasPreferredImage: false,
            preferredRev: 0,
            isVa: true,
          }),
      };
    }
    if (local?.hasFull && local.imageUrl) {
      return { ok: true, artistId, imageUrl: local.imageUrl };
    }
  } catch {
    /* catalog optional — fall through to remote */
  }

  if (!canReach()) return { ok: false };

  let artist = cache.get(artistId);
  if (!artist) {
    try {
      artist = await fetchArtist(artistId);
    } catch {
      return { ok: false };
    }
    cache.set(artistId, artist);
  }

  if (!artistHasFlipPhoto(artist)) return { ok: false };
  return { ok: true, artistId, imageUrl: flipImageUrl(artist) };
}
