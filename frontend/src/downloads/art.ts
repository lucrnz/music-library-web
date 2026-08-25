/**
 * Local album/artist art: OPFS files + blob-URL cache.
 */

import { reactive } from "vue";
import { artistImageUrl } from "@/api";
import type { Artist } from "@/models/artist";
import { getOne, putOne } from "@/downloads/db";
import { canUseCompanionDownloads } from "@/exclusive/capability";
import { fileUrl, putFromUrl } from "@/downloads/companionBlob";
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

function absoluteLibraryUrl(url: string): string {
  try {
    return new URL(url, location.origin).href;
  } catch {
    return url;
  }
}

async function blobUrlFor(
  cacheKey: string,
  dirParts: string[],
  fileName: string,
): Promise<string | null> {
  const cached = artUrlCache.urls[cacheKey];
  if (cached) return cached;
  let blob: Blob | null = null;
  if (canUseCompanionDownloads()) {
    try {
      const res = await fetch(fileUrl([...dirParts, fileName].join("/")));
      if (res.ok) blob = await res.blob();
    } catch {
      blob = null;
    }
  }
  if (!blob) blob = await readBinary(dirParts, fileName);
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
    let bytes = 0;
    if (canUseCompanionDownloads()) {
      const key = [...artistCoverDirParts(), artistCoverFileName(id, "thumb")].join("/");
      const written = await putFromUrl({
        requestId: `art-refresh-${id}`,
        key,
        url: absoluteLibraryUrl(artistImageUrl(artistDict, "thumb")),
      });
      bytes = written.bytes;
    } else {
      const written = await writeFromResponse(
        artistCoverDirParts(),
        artistCoverFileName(id, "thumb"),
        res,
      );
      bytes = written.bytes;
    }
    existing.hasThumb = true;
    existing.thumbBytes = bytes;
    await putOne("artists", existing);
    const blob = canUseCompanionDownloads()
      ? await (await fetch(fileUrl([...artistCoverDirParts(), artistCoverFileName(id, "thumb")].join("/")))).blob()
      : await readBinary(
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
): Promise<{ ok: boolean; bytes?: number }> {
  if (already) return { ok: true };
  try {
    if (canUseCompanionDownloads()) {
      const key = [...dirParts, fileName].join("/");
      const written = await putFromUrl({
        requestId: `art-${key}-${Date.now()}`,
        key,
        url: absoluteLibraryUrl(url),
      });
      return { ok: true, bytes: written.bytes };
    }
    const res = await fetch(url);
    if (!res.ok) return { ok: false };
    const written = await writeFromResponse(dirParts, fileName, res);
    return { ok: true, bytes: written.bytes };
  } catch (err: unknown) {
    console.warn("Art download failed", err);
    return { ok: false };
  }
}

/** Network + OPFS only — no IDB refcount. */
export async function ensureAlbumArtFiles(albumId: string): Promise<{
  hasThumb: boolean;
  hasFull: boolean;
  thumbBytes?: number;
  fullBytes?: number;
}> {
  if (!albumId) return { hasThumb: false, hasFull: false };
  const existing = await getOne<CatalogAlbumRecord>("albums", albumId);
  const thumb = await fetchArtIfMissing(
    `/api/cover?album_id=${encodeURIComponent(albumId)}&size=thumb`,
    albumCoverDirParts(),
    albumCoverFileName(albumId, "thumb"),
    !!existing?.hasThumb
  );
  const full = await fetchArtIfMissing(
    `/api/cover?album_id=${encodeURIComponent(albumId)}&size=full`,
    albumCoverDirParts(),
    albumCoverFileName(albumId, "full"),
    !!existing?.hasFull
  );
  return {
    hasThumb: thumb.ok || !!existing?.hasThumb,
    hasFull: full.ok || !!existing?.hasFull,
    thumbBytes: thumb.bytes ?? existing?.thumbBytes,
    fullBytes: full.bytes ?? existing?.fullBytes,
  };
}

export async function ensureArtistArtFile(
  artistId: string,
): Promise<{ ok: boolean; bytes?: number }> {
  if (!artistId || artistId === "_unknown") return { ok: false };
  const existing = await getOne<CatalogArtistRecord>("artists", artistId);
  return fetchArtIfMissing(
    `/api/artist-image?artist_id=${encodeURIComponent(artistId)}&size=thumb`,
    artistCoverDirParts(),
    artistCoverFileName(artistId, "thumb"),
    !!existing?.hasThumb
  );
}
