/**
 * Offline download catalog: codec helpers, projection/status, art, IDB records.
 */

import { reactive } from "vue";
import { SOURCE_TAG, sourceFileMedia } from "@/lossyKind";
import {
  artistIdsOf,
  normalizeTrack,
  primaryArtistIdOf,
  primaryArtistNameOf,
  type CatalogTrackRecord,
  type Track,
} from "@/models/track";
import { settings } from "@/stores/settings";
import {
  getAll,
  getOne,
  putOne,
  reqToPromise,
  wipeDownloadsDb,
  withStores,
} from "@/downloads/db";
import { deleteLyricsRecord } from "@/downloads/lyricsStore";
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
} from "@/downloads/opfs";
import { downloads } from "@/downloads/state";

// ---------------------------------------------------------------------------
// Codec helpers
// ---------------------------------------------------------------------------

export function codecExt(codec: string, sourceCodec?: string | null) {
  if (codec === SOURCE_TAG) return sourceFileMedia(sourceCodec).ext;
  if (typeof codec === "string" && codec.startsWith("flac")) return "flac";
  return "opus";
}

export function codecMediaType(codec: string, sourceCodec?: string | null) {
  if (codec === SOURCE_TAG) return sourceFileMedia(sourceCodec).mediaType;
  if (typeof codec === "string" && codec.startsWith("flac")) return "audio/flac";
  return "audio/ogg";
}

export { audioDirParts, audioFileName } from "@/downloads/opfs";
export { normalizeTrack } from "@/models/track";

// ---------------------------------------------------------------------------
// Catalog projection + UI status join
// ---------------------------------------------------------------------------

/** Queue states that overlay catalog status for a track. */
export const QUEUE_UI_STATES = new Set(["pending", "active", "failed", "paused"]);

export interface CatalogProjectionEntry {
  codec: string;
  status: string;
}

export type CatalogUiStatus = "ready" | "other" | "failed";

export type DownloadUiStatus =
  | "none"
  | "ready"
  | "other"
  | "failed"
  | "pending"
  | "active"
  | "paused";

export interface CatalogAlbumRecord {
  albumId: string;
  title: string;
  artistName: string;
  refCount: number;
  hasThumb: boolean;
  hasFull: boolean;
}

export interface CatalogArtistRecord {
  artistId: string;
  name: string;
  refCount: number;
  hasThumb: boolean;
}

export type { CatalogTrackRecord };

export interface CatalogTrackAudioMeta {
  bytes: number;
  mediaType?: string;
  ext?: string;
}

/** Catalog-only projection: trackId → { codec, status }. */
const emptyProjection: Record<string, CatalogProjectionEntry> = {};

export const catalogIndex = reactive({
  byTrack: emptyProjection,
});

/** Pure catalog UI status vs preferred download codec. */
export function catalogUiStatus(
  rec: { codec?: string; status?: string } | null | undefined,
  preferredDownloadCodec: string | null | undefined,
): CatalogUiStatus | null {
  if (!rec) return null;
  if (rec.status === "broken") return "failed";
  if (!rec.codec) return null;
  if (rec.codec === SOURCE_TAG) return "ready";
  if (rec.codec !== preferredDownloadCodec) return "other";
  return "ready";
}

function projectionFromRecord(
  rec: CatalogTrackRecord | null | undefined,
): CatalogProjectionEntry | null {
  if (!rec || !rec.trackId || !rec.codec) return null;
  return {
    codec: rec.codec,
    status: rec.status || "ready",
  };
}

/** Replace entire catalog projection (boot hydrate). */
export function setCatalogProjectionMap(
  map: Record<string, CatalogProjectionEntry> | null | undefined,
) {
  catalogIndex.byTrack = map && typeof map === "object" ? map : {};
}

/** Upsert or remove one catalog projection entry after an IDB track write. */
export function syncCatalogProjection(
  trackId: string,
  rec: CatalogTrackRecord | null | undefined,
) {
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
export function joinDownloadUiStatus(
  trackId: string,
  ctx: {
    enabled?: boolean;
    queue?: Array<{ trackId: string; state: string }>;
    preferredCodec?: string;
    byTrack?: Record<string, CatalogProjectionEntry>;
  } = {},
): DownloadUiStatus {
  const enabled = ctx.enabled ?? downloads.enabled;
  if (!enabled || !trackId) return "none";

  const queue = ctx.queue ?? downloads.queue;
  let queueState: string | null = null;
  for (const q of queue) {
    if (q.trackId === trackId && QUEUE_UI_STATES.has(q.state)) {
      queueState = q.state;
    }
  }
  if (
    queueState === "pending" ||
    queueState === "active" ||
    queueState === "failed" ||
    queueState === "paused"
  ) {
    return queueState;
  }

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
export function trackDownloadState(trackId: string) {
  return joinDownloadUiStatus(trackId, {
    enabled: downloads.enabled,
    queue: downloads.queue,
    preferredCodec: settings.download,
    byTrack: catalogIndex.byTrack,
  });
}

/** True when the catalog has a playable local file (ready or other quality). */
export function isLocallyPlayableDownload(trackId: string) {
  const st = trackDownloadState(trackId);
  return st === "ready" || st === "other";
}

// ---------------------------------------------------------------------------
// Local album/artist art
// ---------------------------------------------------------------------------

const urlCache = new Map<string, string>();

export function revokeArtCached(key: string) {
  const u = urlCache.get(key);
  if (u) {
    URL.revokeObjectURL(u);
    urlCache.delete(key);
  }
}

export function wipeArtUrlCache() {
  for (const key of [...urlCache.keys()]) revokeArtCached(key);
}

async function blobUrlFor(
  cacheKey: string,
  dirParts: string[],
  fileName: string,
): Promise<string | null> {
  const cached = urlCache.get(cacheKey);
  if (cached) return cached;
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

/**
 * @param {string} artistId
 * @param {'thumb'|'full'} size
 */
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

// ---------------------------------------------------------------------------
// Track / album / artist IDB records
// ---------------------------------------------------------------------------

export async function getTrackRecord(
  trackId: string,
): Promise<CatalogTrackRecord | undefined> {
  return getOne<CatalogTrackRecord>("tracks", trackId);
}

export async function listTrackRecords(): Promise<CatalogTrackRecord[]> {
  return getAll<CatalogTrackRecord>("tracks");
}

export async function listAlbumRecords(): Promise<CatalogAlbumRecord[]> {
  return getAll<CatalogAlbumRecord>("albums");
}

export async function listArtistRecords(): Promise<CatalogArtistRecord[]> {
  return getAll<CatalogArtistRecord>("artists");
}

/**
 * Catalog status vs preferred download codec (async wrapper over record fetch).
 * @param {string} trackId
 * @param {string} [preferredCodec]
 * @returns {Promise<'ready'|'other'|'none'|'failed'>}
 */
export async function downloadStatusFor(
  trackId: string,
  preferredCodec?: string,
): Promise<"ready" | "other" | "none" | "failed"> {
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
export async function getLocalAudioUrlForRecord(
  rec: CatalogTrackRecord,
): Promise<string | null> {
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
export async function getLocalAudioUrl(trackId: string, codec: string) {
  const rec = await getTrackRecord(trackId);
  if (!rec || rec.codec !== codec || rec.status === "broken") return null;
  return getLocalAudioUrlForRecord(rec);
}

export async function markTrackBroken(trackId: string) {
  const rec = await getTrackRecord(trackId);
  if (!rec) return;
  rec.status = "broken";
  await putOne("tracks", rec);
  syncCatalogProjection(trackId, rec);
}

export async function markTrackOrphan(trackId: string) {
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
export async function commitTrackDownload(
  track: Track,
  codec: string,
  audioMeta: CatalogTrackAudioMeta,
) {
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

  if (existing && existing.codec && existing.codec !== codec) {
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
  const artistArt: Record<string, boolean> = {};
  for (const aid of pinArtists) {
    if (aid === "_unknown") {
      artistArt[aid] = false;
      continue;
    }
    artistArt[aid] = await ensureArtistArtFile(aid);
  }

  const rec: CatalogTrackRecord = {
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
        (await reqToPromise<CatalogAlbumRecord | undefined>(
          stores.albums.get(n.albumId),
        )) || {
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
          (await reqToPromise<CatalogArtistRecord | undefined>(
            stores.artists.get(aid),
          )) || {
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
        const artist = await reqToPromise<CatalogArtistRecord | undefined>(
          stores.artists.get(aid),
        );
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
export async function deleteTrackDownload(trackId: string) {
  const rec = await getTrackRecord(trackId);
  if (!rec || !rec.codec) return;

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

  const cleanup: {
    albumId: string | null;
    dropAlbum: boolean;
    dropArtists: string[];
    albumHadThumb: boolean;
    albumHadFull: boolean;
    artistHadThumb: Record<string, boolean>;
  } = {
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
      const album = await reqToPromise<CatalogAlbumRecord | undefined>(
        stores.albums.get(rec.albumId),
      );
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
      const artist = await reqToPromise<CatalogArtistRecord | undefined>(
        stores.artists.get(aid),
      );
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

export async function deleteAlbumDownloads(albumId: string) {
  const tracks = await listTrackRecords();
  for (const t of tracks) {
    if (t.albumId === albumId) await deleteTrackDownload(t.trackId);
  }
}

export async function deleteArtistDownloads(artistId: string) {
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
