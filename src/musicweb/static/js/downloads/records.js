/**
 * Download catalog records: track/album/artist IDB + refcount GC.
 * Art files live in art.js; hierarchy in hierarchy.js.
 */

import {
  ensureAlbumArtFiles,
  ensureArtistArtFile,
  revokeArtCached,
  wipeArtUrlCache,
} from "./art.js";
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
  artistIdsOf,
  codecExt,
  codecMediaType,
  normalizeTrack,
  primaryArtistIdOf,
  primaryArtistNameOf,
} from "./normalize.js";
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
} from "./opfs.js";

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
 * Pure catalog UI status vs preferred download codec.
 * @param {object|null|undefined} rec
 * @param {string} preferredDownloadCodec
 * @returns {'ready'|'other'|'failed'|null}
 */
export function catalogUiStatus(rec, preferredDownloadCodec) {
  if (!rec) return null;
  if (rec.status === "broken") return "failed";
  if (!rec.codec) return null;
  if (rec.codec !== preferredDownloadCodec) return "other";
  return "ready";
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
    rec.ext || codecExt(rec.codec)
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
}

export async function markTrackOrphan(trackId) {
  const rec = await getTrackRecord(trackId);
  if (!rec) return;
  if (rec.status !== "broken") rec.status = "orphan";
  await putOne("tracks", rec);
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
      existing.ext || codecExt(existing.codec)
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
    ext: audioMeta.ext || codecExt(codec),
    mediaType: audioMeta.mediaType || codecMediaType(codec),
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
    rec.ext || codecExt(rec.codec)
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
}

export async function sumDownloadedBytes() {
  const tracks = await listTrackRecords();
  return tracks.reduce((s, t) => s + (t.bytes || 0), 0);
}

export {
  audioDirParts,
  audioFileName,
  codecExt,
  codecMediaType,
  normalizeTrack,
};
