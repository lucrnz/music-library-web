/**
 * Offline download catalog: codec helpers, projection/status, art, IDB records.
 */

import { reactive } from "vue";
import { SOURCE_TAG, sourceFileMedia } from "../lossyKind.js";
import {
  artistIdsOf,
  normalizeTrack,
  primaryArtistIdOf,
  primaryArtistNameOf,
} from "../models/track.js";
import { settings } from "../stores/settings.js";
import {
  getAll,
  getOne,
  putOne,
  reqToPromise,
  wipeDownloadsDb,
  withStores,
} from "./db.js";
import { deleteLyricsRecord } from "./lyricsStore.js";
import {
  albumCoverDirParts,
  albumCoverFileName,
  artistCoverDirParts,
  artistCoverFileName,
  audioDirParts,
  audioFileName,
  deleteBinary,
  readBinary,
  wipeOpfsDownloads,
  writeFromResponse,
} from "./opfs.js";
import { downloads } from "./state.js";

// ---------------------------------------------------------------------------
// Codec helpers
// ---------------------------------------------------------------------------

export function codecExt(codec, sourceCodec) {
  if (codec === SOURCE_TAG) return sourceFileMedia(sourceCodec).ext;
  if (typeof codec === "string" && codec.startsWith("flac")) return "flac";
  return "opus";
}

export function codecMediaType(codec, sourceCodec) {
  if (codec === SOURCE_TAG) return sourceFileMedia(sourceCodec).mediaType;
  if (typeof codec === "string" && codec.startsWith("flac")) return "audio/flac";
  return "audio/ogg";
}

export { audioDirParts, audioFileName } from "./opfs.js";
export { normalizeTrack } from "../models/track.js";

// ---------------------------------------------------------------------------
// Catalog projection + UI status join
// ---------------------------------------------------------------------------

/** Queue states that overlay catalog status for a track. */
export const QUEUE_UI_STATES = new Set(["pending", "active", "failed", "paused"]);

/**
 * Catalog-only projection: trackId → { codec, status }.
 * Single writer: hydrate (index) + record-layer hooks.
 * @type {{ byTrack: Record<string, { codec: string, status: string }> }}
 */
export const catalogIndex = reactive({
  byTrack: /** @type {Record<string, { codec: string, status: string }>} */ ({}),
});

/**
 * Pure catalog UI status vs preferred download codec.
 * @param {object|null|undefined} rec
 * @param {string} preferredDownloadCodec
 * @returns {'ready'|'other'|'failed'|null}
 */
export function catalogUiStatus(rec, preferredDownloadCodec) {
  if (!rec) return null;
  if (rec.status === "broken") return "failed";
  if (!rec.codec) return null;
  if (rec.codec === "source") return "ready";
  if (rec.codec !== preferredDownloadCodec) return "other";
  return "ready";
}

/**
 * @param {object|null|undefined} rec
 * @returns {{ codec: string, status: string }|null}
 */
function projectionFromRecord(rec) {
  if (!rec || !rec.trackId || !rec.codec) return null;
  return {
    codec: rec.codec,
    status: rec.status || "ready",
  };
}

/**
 * Replace entire catalog projection (boot hydrate).
 * @param {Record<string, { codec: string, status: string }>} map
 */
export function setCatalogProjectionMap(map) {
  catalogIndex.byTrack = map && typeof map === "object" ? map : {};
}

/**
 * Upsert or remove one catalog projection entry after an IDB track write.
 * @param {string} trackId
 * @param {object|null|undefined} rec full track record, or null to remove
 */
export function syncCatalogProjection(trackId, rec) {
  if (!trackId) return;
  const next = { ...catalogIndex.byTrack };
  const proj = projectionFromRecord(rec);
  if (proj) next[trackId] = proj;
  else delete next[trackId];
  catalogIndex.byTrack = next;
}

/** Clear catalog projection (wipe / disable with wipe). */
export function clearCatalogProjection() {
  catalogIndex.byTrack = {};
}

/**
 * Pure join: queue overlay wins, else catalog vs preferred codec.
 *
 * @param {string} trackId
 * @param {{
 *   enabled?: boolean,
 *   queue?: object[],
 *   preferredCodec?: string,
 *   byTrack?: Record<string, { codec: string, status: string }>,
 * }} [ctx]
 * @returns {'none'|'ready'|'other'|'failed'|'pending'|'active'|'paused'}
 */
export function joinDownloadUiStatus(trackId, ctx = {}) {
  const enabled = ctx.enabled ?? downloads.enabled;
  if (!enabled || !trackId) return "none";

  const queue = ctx.queue ?? downloads.queue;
  let queueState = null;
  for (const q of queue) {
    if (q.trackId === trackId && QUEUE_UI_STATES.has(q.state)) {
      queueState = q.state;
    }
  }
  if (queueState) return queueState;

  const byTrack = ctx.byTrack ?? catalogIndex.byTrack;
  const proj = byTrack[trackId];
  if (!proj) return "none";

  const preferred =
    ctx.preferredCodec != null ? ctx.preferredCodec : settings.download;
  const st = catalogUiStatus(
    { codec: proj.codec, status: proj.status },
    preferred
  );
  return st || "none";
}

/**
 * Reactive-friendly read for components (call inside computed).
 * @param {string} trackId
 */
export function trackDownloadState(trackId) {
  return joinDownloadUiStatus(trackId, {
    enabled: downloads.enabled,
    queue: downloads.queue,
    preferredCodec: settings.download,
    byTrack: catalogIndex.byTrack,
  });
}

// ---------------------------------------------------------------------------
// Local album/artist art
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Track / album / artist IDB records
// ---------------------------------------------------------------------------

/** @param {string} trackId */
export async function getTrackRecord(trackId) {
  return getOne("tracks", trackId);
}

export async function listTrackRecords() {
  return getAll("tracks");
}

export async function listAlbumRecords() {
  return getAll("albums");
}

export async function listArtistRecords() {
  return getAll("artists");
}

/**
 * Catalog status vs preferred download codec (async wrapper over record fetch).
 * @param {string} trackId
 * @param {string} [preferredCodec]
 * @returns {Promise<'ready'|'other'|'none'|'failed'>}
 */
export async function downloadStatusFor(trackId, preferredCodec) {
  const rec = await getTrackRecord(trackId);
  const st = catalogUiStatus(
    rec,
    preferredCodec != null ? preferredCodec : rec?.codec
  );
  if (st == null) return "none";
  return st;
}

/**
 * Open blob URL for a playable track record. Caller owns the URL and must revoke it.
 * @param {{ trackId: string, codec: string, ext?: string, status?: string }} rec
 * @returns {Promise<string|null>}
 */
export async function getLocalAudioUrlForRecord(rec) {
  if (!rec || !rec.codec || rec.status === "broken") return null;
  const name = audioFileName(
    rec.trackId,
    rec.codec,
    rec.ext || codecExt(rec.codec, rec.sourceCodec)
  );
  const blob = await readBinary(audioDirParts(), name);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

/**
 * Caller owns the URL and must revoke it.
 * @param {string} trackId
 * @param {string} codec
 */
export async function getLocalAudioUrl(trackId, codec) {
  const rec = await getTrackRecord(trackId);
  if (!rec || rec.codec !== codec || rec.status === "broken") return null;
  return getLocalAudioUrlForRecord(rec);
}

export async function markTrackBroken(trackId) {
  const rec = await getTrackRecord(trackId);
  if (!rec) return;
  rec.status = "broken";
  await putOne("tracks", rec);
  syncCatalogProjection(trackId, rec);
}

export async function markTrackOrphan(trackId) {
  const rec = await getTrackRecord(trackId);
  if (!rec) return;
  if (rec.status !== "broken") rec.status = "orphan";
  await putOne("tracks", rec);
  syncCatalogProjection(trackId, rec);
}

/**
 * Finalize a successful audio download into the catalog.
 * @param {import("../models/track.js").Track|object} track
 * @param {string} codec
 * @param {{ bytes: number, mediaType?: string, ext?: string }} audioMeta
 */
export async function commitTrackDownload(track, codec, audioMeta) {
  const n = normalizeTrack(track);
  const existing = await getTrackRecord(n.id);
  const pArtistId = primaryArtistIdOf(n);
  const pArtistName = primaryArtistNameOf(n);
  const aIds = artistIdsOf(n);
  const pinArtists = aIds.length
    ? aIds
    : pArtistId === "_unknown"
      ? ["_unknown"]
      : aIds;

  if (existing && existing.codec !== codec) {
    const oldName = audioFileName(
      n.id,
      existing.codec,
      existing.ext || codecExt(existing.codec, existing.sourceCodec)
    );
    await deleteBinary(audioDirParts(), oldName);
  }

  const firstPin = !existing;
  const albumArt = n.albumId
    ? await ensureAlbumArtFiles(n.albumId)
    : { hasThumb: false, hasFull: false };
  /** @type {Record<string, boolean>} */
  const artistArt = {};
  for (const aid of pinArtists) {
    if (aid === "_unknown") {
      artistArt[aid] = false;
      continue;
    }
    artistArt[aid] = await ensureArtistArtFile(aid);
  }

  const rec = {
    trackId: n.id,
    codec,
    ext: audioMeta.ext || codecExt(codec, n.sourceCodec),
    mediaType: audioMeta.mediaType || codecMediaType(codec, n.sourceCodec),
    isLossy: !!n.isLossy,
    sourceCodec: n.sourceCodec || null,
    bitrateKbps: n.bitrateKbps ?? null,
    bytes: audioMeta.bytes || 0,
    albumId: n.albumId,
    artistIds: pinArtists,
    primaryArtistId: pArtistId,
    primaryArtistName: pArtistName,
    title: n.title,
    artist: n.artist,
    album: n.album,
    trackNum: n.track,
    disc: n.disc,
    duration: n.duration,
    year: n.year,
    downloadedAt: Date.now(),
    status: "ready",
  };

  await withStores(["tracks", "albums", "artists"], "readwrite", async (stores) => {
    if (n.albumId) {
      const album =
        (await reqToPromise(stores.albums.get(n.albumId))) || {
          albumId: n.albumId,
          title: "",
          artistName: "",
          refCount: 0,
          hasThumb: false,
          hasFull: false,
        };
      album.title = n.album || album.title;
      album.artistName = pArtistName || album.artistName;
      album.hasThumb = album.hasThumb || albumArt.hasThumb;
      album.hasFull = album.hasFull || albumArt.hasFull;
      if (firstPin) album.refCount = (album.refCount || 0) + 1;
      stores.albums.put(album);
    }

    if (firstPin) {
      for (const aid of pinArtists) {
        const artist =
          (await reqToPromise(stores.artists.get(aid))) || {
            artistId: aid,
            name: aid === "_unknown" ? "Unknown artist" : pArtistName,
            refCount: 0,
            hasThumb: false,
          };
        if (aid === n.albumArtistId) artist.name = n.albumArtist || artist.name;
        else if (aid === n.artistId) artist.name = n.artist || artist.name;
        else if (!artist.name) artist.name = pArtistName;
        if (artistArt[aid]) artist.hasThumb = true;
        artist.refCount = (artist.refCount || 0) + 1;
        stores.artists.put(artist);
      }
    } else {
      for (const aid of pinArtists) {
        if (aid === "_unknown") continue;
        const artist = await reqToPromise(stores.artists.get(aid));
        if (artist && artistArt[aid] && !artist.hasThumb) {
          artist.hasThumb = true;
          stores.artists.put(artist);
        }
      }
    }

    stores.tracks.put(rec);
  });

  syncCatalogProjection(n.id, rec);
  return rec;
}

/**
 * @param {string} trackId
 */
export async function deleteTrackDownload(trackId) {
  const rec = await getTrackRecord(trackId);
  if (!rec) return;

  const name = audioFileName(
    trackId,
    rec.codec,
    rec.ext || codecExt(rec.codec, rec.sourceCodec)
  );
  await deleteBinary(audioDirParts(), name);
  try {
    await deleteLyricsRecord(trackId);
  } catch {
    /* optional store */
  }

  /** @type {{ albumId: string|null, dropAlbum: boolean, dropArtists: string[], albumHadThumb: boolean, albumHadFull: boolean, artistHadThumb: Record<string, boolean> }} */
  const cleanup = {
    albumId: rec.albumId || null,
    dropAlbum: false,
    dropArtists: [],
    albumHadThumb: false,
    albumHadFull: false,
    artistHadThumb: {},
  };

  await withStores(["tracks", "albums", "artists"], "readwrite", async (stores) => {
    stores.tracks.delete(trackId);

    if (rec.albumId) {
      const album = await reqToPromise(stores.albums.get(rec.albumId));
      if (album) {
        album.refCount = Math.max(0, (album.refCount || 1) - 1);
        if (album.refCount === 0) {
          cleanup.dropAlbum = true;
          cleanup.albumHadThumb = !!album.hasThumb;
          cleanup.albumHadFull = !!album.hasFull;
          stores.albums.delete(rec.albumId);
        } else {
          stores.albums.put(album);
        }
      }
    }

    const ids = rec.artistIds?.length
      ? rec.artistIds
      : rec.primaryArtistId
        ? [rec.primaryArtistId]
        : [];
    for (const aid of ids) {
      const artist = await reqToPromise(stores.artists.get(aid));
      if (!artist) continue;
      artist.refCount = Math.max(0, (artist.refCount || 1) - 1);
      if (artist.refCount === 0) {
        cleanup.dropArtists.push(aid);
        cleanup.artistHadThumb[aid] = !!artist.hasThumb;
        stores.artists.delete(aid);
      } else {
        stores.artists.put(artist);
      }
    }
  });

  if (cleanup.dropAlbum && cleanup.albumId) {
    if (cleanup.albumHadThumb) {
      revokeArtCached(`cover:${cleanup.albumId}:thumb`);
      await deleteBinary(
        albumCoverDirParts(),
        albumCoverFileName(cleanup.albumId, "thumb")
      );
    }
    if (cleanup.albumHadFull) {
      revokeArtCached(`cover:${cleanup.albumId}:full`);
      await deleteBinary(
        albumCoverDirParts(),
        albumCoverFileName(cleanup.albumId, "full")
      );
    }
  }
  for (const aid of cleanup.dropArtists) {
    if (cleanup.artistHadThumb[aid]) {
      revokeArtCached(`artist:${aid}:thumb`);
      await deleteBinary(
        artistCoverDirParts(),
        artistCoverFileName(aid, "thumb")
      );
    }
  }

  syncCatalogProjection(trackId, null);
}

export async function deleteAlbumDownloads(albumId) {
  const tracks = await listTrackRecords();
  for (const t of tracks) {
    if (t.albumId === albumId) await deleteTrackDownload(t.trackId);
  }
}

export async function deleteArtistDownloads(artistId) {
  const tracks = await listTrackRecords();
  for (const t of tracks) {
    const match =
      t.primaryArtistId === artistId ||
      (t.artistIds && t.artistIds.includes(artistId));
    if (match) await deleteTrackDownload(t.trackId);
  }
}

export async function wipeAllDownloads() {
  wipeArtUrlCache();
  await wipeOpfsDownloads();
  await wipeDownloadsDb();
  clearCatalogProjection();
}

export async function sumDownloadedBytes() {
  const tracks = await listTrackRecords();
  return tracks.reduce((s, t) => s + (t.bytes || 0), 0);
}
