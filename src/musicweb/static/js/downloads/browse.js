/**
 * Pure loader for the offline Downloads library browse mode.
 * Track lists are projected to the client Track type.
 */

import { fromCatalogRecord } from "../models/track.js";
import { getLocalArtistImageUrl, getLocalCoverUrl } from "./catalog.js";
import { buildDownloadsHierarchy } from "./hierarchy.js";

/**
 * @typedef {object} DownloadsBrowseState
 * @property {string} title
 * @property {boolean} showBack
 * @property {string} emptyMsg
 * @property {object[]} artists
 * @property {object[]} albums
 * @property {object[]} tracks
 * @property {boolean} albumGrid
 * @property {Record<string, string>} artUrls  keys: a:{id} | al:{id}
 * @property {string} [parentArtistId] For album detail → artist Back
 */

/**
 * @param {{ routeName: string, artistId?: string, albumId?: string, enabled: boolean }} opts
 * @returns {Promise<DownloadsBrowseState>}
 */
export async function loadDownloadsView(opts) {
  /** @type {DownloadsBrowseState} */
  const empty = {
    title: "Downloads",
    showBack: false,
    emptyMsg: "",
    artists: [],
    albums: [],
    tracks: [],
    albumGrid: false,
    artUrls: {},
  };

  if (!opts.enabled) {
    return {
      ...empty,
      emptyMsg: "Enable downloads in Settings to browse offline library",
    };
  }

  const tree = await buildDownloadsHierarchy();
  const artUrls = {};

  if (opts.routeName === "downloads-album") {
    const id = opts.albumId;
    let found = null;
    /** @type {string|undefined} */
    let parentArtistId;
    for (const ar of tree.artists) {
      found = ar.albums.find((al) => al.albumId === id) || null;
      if (found) {
        parentArtistId = ar.artistId;
        break;
      }
    }
    if (!found) {
      return {
        ...empty,
        title: "Album",
        showBack: true,
        emptyMsg: "Album not in downloads",
      };
    }
    if (found.hasThumb) {
      const u = await getLocalCoverUrl(found.albumId, "thumb");
      if (u) artUrls[`al:${found.albumId}`] = u;
    }
    return {
      title: found.title || "Album",
      showBack: true,
      emptyMsg: "",
      artists: [],
      albums: [],
      tracks: found.tracks.map((t) => fromCatalogRecord(t)),
      albumGrid: false,
      artUrls,
      parentArtistId,
    };
  }

  if (opts.routeName === "downloads-artist") {
    const ar = tree.artists.find((a) => a.artistId === opts.artistId);
    if (!ar) {
      return {
        ...empty,
        title: "Artist",
        showBack: true,
        emptyMsg: "Artist not in downloads",
      };
    }
    if (ar.hasThumb) {
      const u = await getLocalArtistImageUrl(ar.artistId, "thumb");
      if (u) artUrls[`a:${ar.artistId}`] = u;
    }
    for (const al of ar.albums) {
      if (al.hasThumb) {
        const u = await getLocalCoverUrl(al.albumId, "thumb");
        if (u) artUrls[`al:${al.albumId}`] = u;
      }
    }
    return {
      title: ar.name || "Artist",
      showBack: true,
      emptyMsg: ar.albums.length ? "" : "No albums",
      artists: [],
      albums: ar.albums.map((al) => ({
        id: al.albumId,
        title: al.title,
        artist: ar.name,
        track_count: al.tracks.length,
      })),
      tracks: [],
      albumGrid: true,
      artUrls,
    };
  }

  // Root: artist list
  for (const ar of tree.artists) {
    if (ar.hasThumb) {
      const u = await getLocalArtistImageUrl(ar.artistId, "thumb");
      if (u) artUrls[`a:${ar.artistId}`] = u;
    }
  }
  return {
    title: "Downloads",
    showBack: false,
    emptyMsg: tree.artists.length
      ? ""
      : "No downloads yet — download tracks from the library",
    artists: tree.artists.map((ar) => ({
      id: ar.artistId,
      name: ar.name,
      album_count: ar.albums.length,
      track_count: ar.albums.reduce((n, al) => n + al.tracks.length, 0),
    })),
    albums: [],
    tracks: [],
    albumGrid: false,
    artUrls,
  };
}
