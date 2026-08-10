/**
 * Local album/artist art: OPFS fetch + blob URL cache.
 */

import { getOne } from "./db.js";
import {
  albumCoverDirParts,
  albumCoverFileName,
  artistCoverDirParts,
  artistCoverFileName,
  readBinary,
  writeFromResponse,
} from "./opfs.js";

/** @type {Map<string, string>} object URL cache for art only */
const urlCache = new Map();

export function revokeArtCached(key) {
  const u = urlCache.get(key);
  if (u) {
    URL.revokeObjectURL(u);
    urlCache.delete(key);
  }
}

export function wipeArtUrlCache() {
  for (const key of [...urlCache.keys()]) revokeArtCached(key);
}

async function blobUrlFor(cacheKey, dirParts, fileName) {
  if (urlCache.has(cacheKey)) return urlCache.get(cacheKey);
  const blob = await readBinary(dirParts, fileName);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(cacheKey, url);
  return url;
}

/**
 * @param {string} albumId
 * @param {'thumb'|'full'} size
 */
export async function getLocalCoverUrl(albumId, size = "thumb") {
  if (!albumId) return null;
  const album = await getOne("albums", albumId);
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

/**
 * @param {string} artistId
 * @param {'thumb'|'full'} size
 */
export async function getLocalArtistImageUrl(artistId, size = "thumb") {
  if (!artistId) return null;
  const artist = await getOne("artists", artistId);
  if (!artist || !artist.hasThumb) return null;
  return blobUrlFor(
    `artist:${artistId}:thumb`,
    artistCoverDirParts(),
    artistCoverFileName(artistId, "thumb")
  );
}

async function fetchArtIfMissing(url, dirParts, fileName, already) {
  if (already) return true;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    await writeFromResponse(dirParts, fileName, res);
    return true;
  } catch (err) {
    console.warn("Art download failed", err);
    return false;
  }
}

/** Network + OPFS only — no IDB refcount. */
export async function ensureAlbumArtFiles(albumId) {
  if (!albumId) return { hasThumb: false, hasFull: false };
  const existing = await getOne("albums", albumId);
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

export async function ensureArtistArtFile(artistId) {
  if (!artistId || artistId === "_unknown") return false;
  const existing = await getOne("artists", artistId);
  return fetchArtIfMissing(
    `/api/artist-image?artist_id=${encodeURIComponent(artistId)}&size=thumb`,
    artistCoverDirParts(),
    artistCoverFileName(artistId, "thumb"),
    !!existing?.hasThumb
  );
}
