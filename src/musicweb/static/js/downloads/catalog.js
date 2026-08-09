/**
 * Download catalog: tracks + album/artist refcount GC + local art URLs.
 */

import {
  getAll,
  getOne,
  putOne,
  reqToPromise,
  wipeDownloadsDb,
  withStores,
} from "./db.js";
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
  writeFromResponse,
} from "./opfs.js";

/** @type {Map<string, string>} object URL cache for art only */
const urlCache = new Map();

function revokeCached(key) {
  const u = urlCache.get(key);
  if (u) {
    URL.revokeObjectURL(u);
    urlCache.delete(key);
  }
}

async function blobUrlFor(cacheKey, dirParts, fileName) {
  if (urlCache.has(cacheKey)) return urlCache.get(cacheKey);
  const blob = await readBinary(dirParts, fileName);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(cacheKey, url);
  return url;
}

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
 * @param {string} trackId
 * @param {string} codec
 * @returns {Promise<'ready'|'other'|'none'|'failed'>}
 */
export async function downloadStatusFor(trackId, codec) {
  const rec = await getTrackRecord(trackId);
  if (!rec) return "none";
  if (rec.status === "broken") return "failed";
  if (rec.codec === codec) return "ready";
  return "other";
}

/**
 * Caller owns the URL and must revoke it.
 * @param {string} trackId
 * @param {string} codec
 */
export async function getLocalAudioUrl(trackId, codec) {
  const rec = await getTrackRecord(trackId);
  if (!rec || rec.codec !== codec || rec.status === "broken") return null;
  const name = audioFileName(
    trackId,
    rec.codec,
    rec.ext || codecExt(rec.codec)
  );
  const blob = await readBinary(audioDirParts(), name);
  if (!blob) return null;
  return URL.createObjectURL(blob);
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
async function ensureAlbumArtFiles(albumId) {
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

async function ensureArtistArtFile(artistId) {
  if (!artistId || artistId === "_unknown") return false;
  const existing = await getOne("artists", artistId);
  return fetchArtIfMissing(
    `/api/artist-image?artist_id=${encodeURIComponent(artistId)}&size=thumb`,
    artistCoverDirParts(),
    artistCoverFileName(artistId, "thumb"),
    !!existing?.hasThumb
  );
}

/**
 * Finalize a successful audio download into the catalog.
 * Art is fetched first; metadata + refcounts commit in one IDB transaction.
 * @param {object} track API / row track
 * @param {string} codec
 * @param {{ bytes: number, mediaType?: string, ext?: string }} audioMeta
 */
export async function commitTrackDownload(track, codec, audioMeta) {
  const n = normalizeTrack(track);
  const existing = await getTrackRecord(n.id);
  const pArtistId = primaryArtistIdOf(n);
  const pArtistName = primaryArtistNameOf(n);
  const aIds = artistIdsOf(n);
  const pinArtists = aIds.length ? aIds : pArtistId === "_unknown" ? ["_unknown"] : aIds;

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
 * Delete one downloaded track and GC orphaned art (atomic metadata).
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
      revokeCached(`cover:${cleanup.albumId}:thumb`);
      await deleteBinary(
        albumCoverDirParts(),
        albumCoverFileName(cleanup.albumId, "thumb")
      );
    }
    if (cleanup.albumHadFull) {
      revokeCached(`cover:${cleanup.albumId}:full`);
      await deleteBinary(
        albumCoverDirParts(),
        albumCoverFileName(cleanup.albumId, "full")
      );
    }
  }
  for (const aid of cleanup.dropArtists) {
    if (cleanup.artistHadThumb[aid]) {
      revokeCached(`artist:${aid}:thumb`);
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
  for (const key of [...urlCache.keys()]) revokeCached(key);
  await wipeOpfsDownloads();
  await wipeDownloadsDb();
}

/**
 * Hierarchy for manager / offline library.
 */
export async function buildDownloadsHierarchy() {
  const [tracks, albums, artists] = await Promise.all([
    listTrackRecords(),
    listAlbumRecords(),
    listArtistRecords(),
  ]);
  const albumMap = new Map(albums.map((a) => [a.albumId, a]));
  const artistMap = new Map(artists.map((a) => [a.artistId, a]));

  /** @type {Map<string, Map<string, object[]>>} */
  const tree = new Map();
  for (const t of tracks) {
    const aid = t.primaryArtistId || "_unknown";
    const alid = t.albumId || "_no_album";
    if (!tree.has(aid)) tree.set(aid, new Map());
    const am = tree.get(aid);
    if (!am.has(alid)) am.set(alid, []);
    am.get(alid).push(t);
  }

  const result = [];
  for (const [artistId, albumTracks] of tree) {
    const artistRec = artistMap.get(artistId);
    const albumsOut = [];
    for (const [albumId, trs] of albumTracks) {
      trs.sort((a, b) => {
        const d = (a.disc || 0) - (b.disc || 0);
        if (d) return d;
        return (a.trackNum || 0) - (b.trackNum || 0);
      });
      const albumRec = albumMap.get(albumId);
      albumsOut.push({
        albumId,
        title: albumRec?.title || trs[0]?.album || "Unknown album",
        hasThumb: !!albumRec?.hasThumb,
        tracks: trs,
      });
    }
    albumsOut.sort((a, b) => a.title.localeCompare(b.title));
    result.push({
      artistId,
      name:
        artistRec?.name ||
        albumTracks.values().next().value?.[0]?.primaryArtistName ||
        "Unknown artist",
      hasThumb: !!artistRec?.hasThumb,
      albums: albumsOut,
    });
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  return { artists: result };
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
  writeFromResponse,
};
