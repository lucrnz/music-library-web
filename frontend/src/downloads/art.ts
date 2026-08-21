/**
 * Local album/artist art: OPFS files + blob-URL cache.
 */

import { reactive } from "vue";
import { artistImageUrl } from "@/api";
import type { Artist } from "@/models/artist";
import { getOne } from "@/downloads/db";
import {
  albumCoverDirParts,
  albumCoverFileName,
  artistCoverDirParts,
  artistCoverFileName,
  readBinary,
  writeFromResponse,
} from "@/downloads/opfs";
import type {
  CatalogAlbumRecord,
  CatalogArtistRecord,
} from "@/downloads/writer";

/** Vue-readable object-URL cache (same keys as blobUrlFor). */
export const artUrlCache = reactive({
  urls: {} as Record<string, string>,
});

export function revokeArtCached(key: string) {
  const u = artUrlCache.urls[key];
  if (u) {
    URL.revokeObjectURL(u);
    const next = { ...artUrlCache.urls };
    delete next[key];
    artUrlCache.urls = next;
  }
}

export function wipeArtUrlCache() {
  for (const key of Object.keys(artUrlCache.urls)) revokeArtCached(key);
}

async function blobUrlFor(
  cacheKey: string,
  dirParts: string[],
  fileName: string,
): Promise<string | null> {
  const cached = artUrlCache.urls[cacheKey];
  if (cached) return cached;
  const blob = await readBinary(dirParts, fileName);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  artUrlCache.urls = { ...artUrlCache.urls, [cacheKey]: url };
  return url;
}

/** Overwrite OPFS + publish a new blob URL when this artist is in Downloads. */
export async function refreshArtistArtFile(
  id: string,
  artistDict: Artist,
) {
  if (!id || id === "_unknown") return;
  const existing = await getOne<CatalogArtistRecord>("artists", id);
  if (!existing) return;
  try {
    const res = await fetch(artistImageUrl(artistDict, "thumb"));
    if (!res.ok) return;
    await writeFromResponse(
      artistCoverDirParts(),
      artistCoverFileName(id, "thumb"),
      res,
    );
    const blob = await readBinary(
      artistCoverDirParts(),
      artistCoverFileName(id, "thumb"),
    );
    if (!blob) return;
    const key = `artist:${id}:thumb`;
    const prev = artUrlCache.urls[key];
    const nextUrl = URL.createObjectURL(blob);
    artUrlCache.urls = { ...artUrlCache.urls, [key]: nextUrl };
    if (prev) URL.revokeObjectURL(prev);
  } catch (err: unknown) {
    console.warn("Artist art refresh failed", err);
  }
}

export async function getLocalCoverUrl(
  albumId: string,
  size: "thumb" | "full" = "thumb",
) {
  if (!albumId) return null;
  const album = await getOne<CatalogAlbumRecord>("albums", albumId);
  if (!album) return null;
  let use = size;
  if (use === "full" && !album.hasFull) use = "thumb";
  if (use === "thumb" && !album.hasThumb && album.hasFull) use = "full";
  if (use === "thumb" && !album.hasThumb) return null;
  if (use === "full" && !album.hasFull) return null;
  return blobUrlFor(
    `cover:${albumId}:${use}`,
    albumCoverDirParts(),
    albumCoverFileName(albumId, use)
  );
}

export async function getLocalArtistImageUrl(
  artistId: string,
  _size: "thumb" | "full" = "thumb",
) {
  if (!artistId) return null;
  const artist = await getOne<CatalogArtistRecord>("artists", artistId);
  if (!artist || !artist.hasThumb) return null;
  return blobUrlFor(
    `artist:${artistId}:thumb`,
    artistCoverDirParts(),
    artistCoverFileName(artistId, "thumb")
  );
}

async function fetchArtIfMissing(
  url: string,
  dirParts: string[],
  fileName: string,
  already: boolean,
): Promise<boolean> {
  if (already) return true;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    await writeFromResponse(dirParts, fileName, res);
    return true;
  } catch (err: unknown) {
    console.warn("Art download failed", err);
    return false;
  }
}

/** Network + OPFS only — no IDB refcount. */
export async function ensureAlbumArtFiles(albumId: string) {
  if (!albumId) return { hasThumb: false, hasFull: false };
  const existing = await getOne<CatalogAlbumRecord>("albums", albumId);
  const hasThumb = await fetchArtIfMissing(
    `/api/cover?album_id=${encodeURIComponent(albumId)}&size=thumb`,
    albumCoverDirParts(),
    albumCoverFileName(albumId, "thumb"),
    !!existing?.hasThumb
  );
  const hasFull = await fetchArtIfMissing(
    `/api/cover?album_id=${encodeURIComponent(albumId)}&size=full`,
    albumCoverDirParts(),
    albumCoverFileName(albumId, "full"),
    !!existing?.hasFull
  );
  return {
    hasThumb: hasThumb || !!existing?.hasThumb,
    hasFull: hasFull || !!existing?.hasFull,
  };
}

export async function ensureArtistArtFile(artistId: string) {
  if (!artistId || artistId === "_unknown") return false;
  const existing = await getOne<CatalogArtistRecord>("artists", artistId);
  return fetchArtIfMissing(
    `/api/artist-image?artist_id=${encodeURIComponent(artistId)}&size=thumb`,
    artistCoverDirParts(),
    artistCoverFileName(artistId, "thumb"),
    !!existing?.hasThumb
  );
}
