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
import { invalidateDownloadsCatalogView } from "@/downloads/snapshot";
import { deleteLyricsRecord } from "@/downloads/lyricsStore";
import { codecExt, codecMediaType } from "@/downloads/media";
import { canUseCompanionDownloads } from "@/exclusive/capability";
import {
  albumArtBlobKey,
  artistArtBlobKey,
  audioBlobKey,
  deleteKey,
  fileUrl,
} from "@/downloads/companionBlob";
import {
  albumCoverDirParts,
  albumCoverFileName,
  artistCoverDirParts,
  artistCoverFileName,
  audioDirParts,
  audioFileName,
  deleteBinary,
  readBinary,
  sumExistingFileSizes,
  wipeOpfsDownloads,
  type ArtFileSpec,
} from "@/downloads/opfs";
import {
  ensureAlbumArtFiles,
  ensureArtistPhoto,
  notifyArtFilesChanged,
  revokeArtCached,
  wipeArtUrlCache,
} from "@/downloads/art";
import { cacheLyricsForDownload } from "@/lyrics/cache";
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
  thumbBytes?: number;
  fullBytes?: number;
}

export interface CatalogArtistRecord {
  artistId: string;
  name: string;
  refCount: number;
  hasThumb: boolean;
  hasFull: boolean;
  thumbBytes?: number;
  fullBytes?: number;
  hasImage: boolean;
  hasPreferredImage: boolean;
  isVa: boolean;
  preferredRev: number;
}

function newArtistRecord(id: string, name: string): CatalogArtistRecord {
  return {
    artistId: id,
    name,
    refCount: 0,
    hasThumb: false,
    hasFull: false,
    hasImage: false,
    hasPreferredImage: false,
    isVa: false,
    preferredRev: 0,
  };
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
  const ext = rec.ext || codecExt(rec.codec, rec.sourceCodec);
  const name = audioFileName(rec.trackId, rec.codec, ext);
  if (canUseCompanionDownloads()) {
    const key = audioBlobKey(rec.trackId, rec.codec, ext);
    try {
      const res = await fetch(fileUrl(key), { method: "HEAD" });
      if (res.ok) return fileUrl(key);
    } catch {
      /* leftover OPFS may still play in HTML until migrate Yes */
    }
  }
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
  invalidateDownloadsCatalogView();
}

export async function markTrackOrphan(trackId: string) {
  const rec = await getTrackRecord(trackId);
  if (!rec) return;
  if (rec.status !== "broken") rec.status = "orphan";
  await putOne("tracks", rec);
  syncCatalogProjection(trackId, rec);
  invalidateDownloadsCatalogView();
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
          )) ||
          newArtistRecord(
            aid,
            aid === "_unknown" ? "Unknown artist" : pArtistName,
          );
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
    const ext =
      replaced.audio.ext ||
      codecExt(replaced.audio.codec, replaced.audio.sourceCodec);
    try {
      if (canUseCompanionDownloads()) {
        deleteKey(audioBlobKey(n.id, replaced.audio.codec, ext));
      } else {
        await deleteBinary(
          audioDirParts(),
          audioFileName(n.id, replaced.audio.codec, ext),
        );
      }
    } catch {
      /* best-effort unlink of replaced codec */
    }
  }
  return rec;
}

async function refreshCatalogArt(n: Track) {
  const pinArtists = pinArtistIdsOf(n);
  const albumHad = n.albumId
    ? await getOne<CatalogAlbumRecord>("albums", n.albumId)
    : null;
  const albumArt = n.albumId
    ? await ensureAlbumArtFiles(n.albumId)
    : { hasThumb: false, hasFull: false };
  const artistArt: Record<string, Awaited<ReturnType<typeof ensureArtistPhoto>>> =
    {};
  for (const aid of pinArtists) {
    if (aid === "_unknown") continue;
    artistArt[aid] = await ensureArtistPhoto(aid);
  }
  let albumArtChanged = false;
  await withCatalogLock(async () => {
    await withStores(["albums", "artists"], "readwrite", async (stores) => {
      if (n.albumId) {
        const album = await reqToPromise<CatalogAlbumRecord | undefined>(
          stores.albums.get(n.albumId),
        );
        if (album) {
          const nextThumb = album.hasThumb || albumArt.hasThumb;
          const nextFull = album.hasFull || albumArt.hasFull;
          albumArtChanged =
            nextThumb !== !!albumHad?.hasThumb ||
            nextFull !== !!albumHad?.hasFull ||
            (!!albumArt.hasThumb && !albumHad?.hasThumb) ||
            (!!albumArt.hasFull && !albumHad?.hasFull);
          album.hasThumb = nextThumb;
          album.hasFull = nextFull;
          if (albumArt.thumbBytes != null) album.thumbBytes = albumArt.thumbBytes;
          if (albumArt.fullBytes != null) album.fullBytes = albumArt.fullBytes;
          stores.albums.put(album);
        }
      }
      for (const aid of pinArtists) {
        const got = artistArt[aid];
        if (!got) continue;
        const artist = await reqToPromise<CatalogArtistRecord | undefined>(
          stores.artists.get(aid),
        );
        if (artist) {
          artist.hasThumb = artist.hasThumb || got.hasThumb;
          artist.hasFull = artist.hasFull || got.hasFull;
          artist.hasImage = got.hasImage;
          artist.hasPreferredImage = got.hasPreferredImage;
          artist.isVa = got.isVa;
          artist.preferredRev = got.preferredRev;
          if (got.thumbBytes != null) artist.thumbBytes = got.thumbBytes;
          if (got.fullBytes != null) artist.fullBytes = got.fullBytes;
          stores.artists.put(artist);
        }
      }
    });
  });
  if (albumArtChanged && n.albumId) {
    notifyArtFilesChanged(n.albumId);
  }
  try {
    await cacheLyricsForDownload(n.id);
  } catch {
    /* companion miss must not fail the audio job */
  }
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
  invalidateDownloadsCatalogView();
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
      artistHadFull: Record<string, boolean>;
    } = {
      rec,
      albumId: rec.albumId || null,
      dropAlbum: false,
      dropArtists: [],
      albumHadThumb: false,
      albumHadFull: false,
      artistHadThumb: {},
      artistHadFull: {},
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
          cleanup.artistHadFull[aid] = !!artist.hasFull;
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
    if (canUseCompanionDownloads()) {
      deleteKey(audioBlobKey(trackId, rec.codec!, rec.ext || codecExt(rec.codec!, rec.sourceCodec)));
    } else {
      await deleteBinary(audioDirParts(), name);
    }
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
      if (canUseCompanionDownloads()) {
        deleteKey(albumArtBlobKey(cleanup.albumId, "thumb"));
      } else {
        await deleteBinary(
          albumCoverDirParts(),
          albumCoverFileName(cleanup.albumId, "thumb")
        );
      }
    }
    if (cleanup.albumHadFull) {
      revokeArtCached(`cover:${cleanup.albumId}:full`);
      if (canUseCompanionDownloads()) {
        deleteKey(albumArtBlobKey(cleanup.albumId, "full"));
      } else {
        await deleteBinary(
          albumCoverDirParts(),
          albumCoverFileName(cleanup.albumId, "full")
        );
      }
    }
  }
  for (const aid of cleanup.dropArtists) {
    if (cleanup.artistHadThumb[aid]) {
      revokeArtCached(`artist:${aid}:thumb`);
      if (canUseCompanionDownloads()) {
        deleteKey(artistArtBlobKey(aid, "thumb"));
      } else {
        await deleteBinary(
          artistCoverDirParts(),
          artistCoverFileName(aid, "thumb")
        );
      }
    }
    if (cleanup.artistHadFull[aid]) {
      revokeArtCached(`artist:${aid}:full`);
      if (canUseCompanionDownloads()) {
        deleteKey(artistArtBlobKey(aid, "full"));
      } else {
        await deleteBinary(
          artistCoverDirParts(),
          artistCoverFileName(aid, "full")
        );
      }
    }
  }
  invalidateDownloadsCatalogView();
}

export async function deleteAlbumDownloads(albumId: string) {
  const tracks = await listTrackRecords();
  for (const t of tracks) {
    if (t.albumId === albumId) await deleteTrackDownload(t.trackId);
  }
  invalidateDownloadsCatalogView();
}

export async function deleteArtistDownloads(artistId: string) {
  const tracks = await listTrackRecords();
  for (const t of tracks) {
    const match =
      t.primaryArtistId === artistId ||
      (t.artistIds && t.artistIds.includes(artistId));
    if (match) await deleteTrackDownload(t.trackId);
  }
  invalidateDownloadsCatalogView();
}

export async function wipeAllDownloads() {
  wipeArtUrlCache();
  if (canUseCompanionDownloads()) {
    const tracks = await listTrackRecords();
    const albums = await listAlbumRecords();
    const artists = await listArtistRecords();
    for (const t of tracks) {
      if (!t.codec) continue;
      deleteKey(
        audioBlobKey(
          t.trackId,
          t.codec,
          t.ext || codecExt(t.codec, t.sourceCodec),
        ),
      );
    }
    for (const al of albums) {
      if (al.hasThumb) deleteKey(albumArtBlobKey(al.albumId, "thumb"));
      if (al.hasFull) deleteKey(albumArtBlobKey(al.albumId, "full"));
    }
    for (const ar of artists) {
      if (ar.hasThumb) deleteKey(artistArtBlobKey(ar.artistId, "thumb"));
      if (ar.hasFull) deleteKey(artistArtBlobKey(ar.artistId, "full"));
    }
  }
  await wipeOpfsDownloads();
  await wipeDownloadsDb();
  clearCatalogProjection();
  invalidateDownloadsCatalogView();
}

export function artFileSpecsFromRecords(
  albums: {
    albumId: string;
    hasThumb?: boolean;
    hasFull?: boolean;
    thumbBytes?: number;
    fullBytes?: number;
  }[],
  artists: {
    artistId: string;
    hasThumb?: boolean;
    hasFull?: boolean;
    thumbBytes?: number;
    fullBytes?: number;
  }[],
): ArtFileSpec[] {
  const specs: ArtFileSpec[] = [];
  for (const al of albums) {
    if (al.hasThumb && al.thumbBytes == null) {
      specs.push({
        dirParts: albumCoverDirParts(),
        fileName: albumCoverFileName(al.albumId, "thumb"),
      });
    }
    if (al.hasFull && al.fullBytes == null) {
      specs.push({
        dirParts: albumCoverDirParts(),
        fileName: albumCoverFileName(al.albumId, "full"),
      });
    }
  }
  for (const ar of artists) {
    if (ar.hasThumb && ar.thumbBytes == null) {
      specs.push({
        dirParts: artistCoverDirParts(),
        fileName: artistCoverFileName(ar.artistId, "thumb"),
      });
    }
    if (ar.hasFull && ar.fullBytes == null) {
      specs.push({
        dirParts: artistCoverDirParts(),
        fileName: artistCoverFileName(ar.artistId, "full"),
      });
    }
  }
  return specs;
}

export async function sumDownloadedBytes() {
  const tracks = await listTrackRecords();
  let total = 0;
  for (const t of tracks) {
    if (t.status === "ready") total += t.bytes || 0;
  }
  const albums = await listAlbumRecords();
  const artists = await listArtistRecords();
  for (const al of albums) {
    if (al.hasThumb && al.thumbBytes != null) total += al.thumbBytes;
    if (al.hasFull && al.fullBytes != null) total += al.fullBytes;
  }
  for (const ar of artists) {
    if (ar.hasThumb && ar.thumbBytes != null) total += ar.thumbBytes;
    if (ar.hasFull && ar.fullBytes != null) total += ar.fullBytes;
  }
  if (!canUseCompanionDownloads()) {
    total += await sumExistingFileSizes(artFileSpecsFromRecords(albums, artists));
  }
  return total;
}
