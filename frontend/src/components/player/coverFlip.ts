/**
 * Whether the now-playing cover may flip to the album-artist photo.
 * No Vue. Does not import player.ts or radio.ts.
 */
import {
  artistImageUrl,
  fetchArtist as fetchArtistDefault,
  type ArtistListItem,
} from "@/api";
import { canReachServer as canReachServerDefault } from "@/connectivity";
import { primaryArtistIdOf, type Track } from "@/models/track";

const UNKNOWN = "_unknown";

const cache = new Map<string, ArtistListItem>();

export type CoverFlipOk = {
  ok: true;
  artistId: string;
  imageUrl: string;
};

export type CoverFlipDenied = { ok: false };

export type CoverFlipResult = CoverFlipOk | CoverFlipDenied;

export type CoverFlipDeps = {
  fetchArtist?: (id: string) => Promise<ArtistListItem>;
  canReachServer?: () => boolean;
};

export function coverFlipArtistId(track: Track | null): string | null {
  if (!track) return null;
  const id = primaryArtistIdOf(track);
  if (!id || id === UNKNOWN) return null;
  return id;
}

export function artistHasFlipPhoto(
  artist: Pick<ArtistListItem, "has_image" | "has_preferred_image">,
): boolean {
  return !!artist.has_image || !!artist.has_preferred_image;
}

export function flipImageUrl(artist: ArtistListItem): string {
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
  if (!canReach()) return { ok: false };

  const artistId = coverFlipArtistId(track);
  if (!artistId) return { ok: false };

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
