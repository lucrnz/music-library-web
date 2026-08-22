/**
 * Catalog IDB writes: lock, pin/refcount, commit/delete.
 */

import {
  artistIdsOf,
  fromApiTrack,
  primaryArtistIdOf,
  primaryArtistNameOf,
  type CatalogTrackRecord,
  type Track,
} from "@/models/track";
import {
  getAll,
  getOne,
  putOne,
  reqToPromise,
  wipeDownloadsDb,
  withStores,
} from "@/downloads/db";
import { deleteLyricsRecord } from "@/downloads/lyricsStore";
import { codecExt, codecMediaType } from "@/downloads/media";
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
} from "@/downloads/opfs";
import {
  ensureAlbumArtFiles,
  ensureArtistArtFile,
  revokeArtCached,
  wipeArtUrlCache,
} from "@/downloads/art";
import {
  clearCatalogProjection,
  syncCatalogProjection,
} from "@/downloads/projection";

export type { CatalogTrackRecord };

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

export interface CatalogTrackAudioMeta {
  bytes: number;
  mediaType?: string;
  ext?: string;
}

let catalogTail: Promise<void> = Promise.resolve();

export function withCatalogLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = catalogTail.then(fn, fn);
  catalogTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function pinArtistIdsOf(n: Track): string[] {
  const aIds = artistIdsOf(n);
  if (aIds.length) return aIds;
  const pArtistId = primaryArtistIdOf(n);
  return pArtistId === "_unknown" ? ["_unknown"] : aIds;
}

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

function buildCatalogRecord(
  n: Track,
  codec: string,
  audioMeta: CatalogTrackAudioMeta,
  pinArtists: string[],
): CatalogTrackRecord {
  return {
    trackId: n.id,
    codec,
    ext: audioMeta.ext || codecExt(codec, n.sourceCodec),
    mediaType: audioMeta.mediaType || codecMediaType(codec, n.sourceCodec),
    isLossy: !!n.isLossy,
    sourceCodec: n.sourceCodec || null,
    bitrateKbps: n.bitrateKbps ?? null,
    sampleRateHz: n.sampleRateHz ?? null,
    bitrateMode: n.bitrateMode ?? null,
    bytes: audioMeta.bytes || 0,
    albumId: n.albumId,
    artistIds: pinArtists,
    primaryArtistId: primaryArtistIdOf(n),
    primaryArtistName: primaryArtistNameOf(n),
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
}

/** IDB upsert + optional queue delete. Caller holds the catalog lock. */
async function persistCatalogTrack(
  n: Track,
  codec: string,
  audioMeta: CatalogTrackAudioMeta,
  queueId?: number,
): Promise<CatalogTrackRecord> {
  const pinArtists = pinArtistIdsOf(n);
  const rec = buildCatalogRecord(n, codec, audioMeta, pinArtists);
  const pArtistName = primaryArtistNameOf(n);
  const storeNames =
    queueId != null
      ? ["tracks", "albums", "artists", "queue"]
      : ["tracks", "albums", "artists"];
  const replaced: {
    audio: {
      codec: string;
      ext?: string;
      sourceCodec?: string | null;
    } | null;
  } = { audio: null };

  await withStores(storeNames, "readwrite", async (stores) => {
    const existing = await reqToPromise<CatalogTrackRecord | undefined>(
      stores.tracks.get(n.id),
    );
    if (existing?.codec && existing.codec !== codec) {
      replaced.audio = {
        codec: existing.codec,
        ext: existing.ext,
        sourceCodec: existing.sourceCodec,
      };
    }
    const firstPin = !existing;

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
        artist.refCount = (artist.refCount || 0) + 1;
        stores.artists.put(artist);
      }
    }

    stores.tracks.put(rec);
    if (queueId != null) stores.queue.delete(queueId);
  });

  if (replaced.audio) {
    const name = audioFileName(
      n.id,
      replaced.audio.codec,
      replaced.audio.ext ||
        codecExt(replaced.audio.codec, replaced.audio.sourceCodec),
    );
    try {
      await deleteBinary(audioDirParts(), name);
    } catch {
      /* best-effort unlink of replaced codec */
    }
  }
  return rec;
}

async function refreshCatalogArt(n: Track) {
  const pinArtists = pinArtistIdsOf(n);
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
  await withCatalogLock(async () => {
    await withStores(["albums", "artists"], "readwrite", async (stores) => {
      if (n.albumId) {
        const album = await reqToPromise<CatalogAlbumRecord | undefined>(
          stores.albums.get(n.albumId),
        );
        if (album) {
          album.hasThumb = album.hasThumb || albumArt.hasThumb;
          album.hasFull = album.hasFull || albumArt.hasFull;
          stores.albums.put(album);
        }
      }
      for (const aid of pinArtists) {
        if (aid === "_unknown" || !artistArt[aid]) continue;
        const artist = await reqToPromise<CatalogArtistRecord | undefined>(
          stores.artists.get(aid),
        );
        if (artist && !artist.hasThumb) {
          artist.hasThumb = true;
          stores.artists.put(artist);
        }
      }
    });
  });
}

export async function finalizeTrackDownload(
  track: Track,
  codec: string,
  audioMeta: CatalogTrackAudioMeta,
  queueId: number,
) {
  const n = fromApiTrack(track);
  const rec = await withCatalogLock(() =>
    persistCatalogTrack(n, codec, audioMeta, queueId),
  );
  syncCatalogProjection(n.id, rec);
  await refreshCatalogArt(n);
  return rec;
}

export async function deleteTrackDownload(trackId: string) {
  const dropped = await withCatalogLock(async () => {
    const rec = await getTrackRecord(trackId);
    if (!rec || !rec.codec) return null;

    const cleanup: {
      rec: CatalogTrackRecord;
      albumId: string | null;
      dropAlbum: boolean;
      dropArtists: string[];
      albumHadThumb: boolean;
      albumHadFull: boolean;
      artistHadThumb: Record<string, boolean>;
    } = {
      rec,
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

    syncCatalogProjection(trackId, null);
    return cleanup;
  });

  if (!dropped) return;

  const rec = dropped.rec;
  const name = audioFileName(
    trackId,
    rec.codec!,
    rec.ext || codecExt(rec.codec!, rec.sourceCodec),
  );
  try {
    await deleteBinary(audioDirParts(), name);
  } catch {
    /* catalog row is already gone */
  }
  try {
    await deleteLyricsRecord(trackId);
  } catch {
    /* optional store */
  }

  const cleanup = dropped;
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
