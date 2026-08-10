/**
 * Library page loaders. Each returns a discriminated LibraryPage:
 * { chrome, body } where body.kind selects the list shape.
 */

import {
  apiGet,
  coverUrl,
  fetchAlbum,
  fetchAlbumTracks,
  fetchArtist,
  fetchArtistAlbums,
  fetchSearch,
  fetchTracksMeta,
} from "../../api.js";
import { formatTrackLabel } from "../../util.js";

/**
 * Folder file row: path chrome + optional full Track.
 * @typedef {object} FileRowModel
 * @property {string} path
 * @property {string} name
 * @property {string|null} id
 * @property {import("../../models/track.js").Track|null} track
 * @property {string} displayName
 * @property {string} cover
 */

/**
 * @typedef {object} LibraryChrome
 * @property {string} title
 * @property {boolean} showBack
 */

/**
 * @typedef {|
 *   { kind: 'folders', dirs: object[], files: FileRowModel[] } |
 *   { kind: 'artists', artists: object[] } |
 *   { kind: 'albumGrid', albums: object[] } |
 *   { kind: 'tracks', tracks: import("../../models/track.js").Track[] } |
 *   { kind: 'search', sections: { artists: object[], albums: object[], tracks: import("../../models/track.js").Track[] } } |
 *   { kind: 'empty', message: string }
 * } LibraryBody
 */

/**
 * @typedef {{ chrome: LibraryChrome, body: LibraryBody }} LibraryPage
 */

/**
 * @param {LibraryChrome} chrome
 * @param {LibraryBody} body
 * @returns {LibraryPage}
 */
export function page(chrome, body) {
  return { chrome, body };
}

/**
 * @param {Partial<LibraryChrome> & { message?: string }} opts
 * @returns {LibraryPage}
 */
export function emptyPage(opts = {}) {
  const { message = "", title = "Library", showBack = false } = opts;
  return page({ title, showBack }, { kind: "empty", message });
}

export async function loadFolders(folderPath) {
  const title = folderPath
    ? folderPath.split("/").filter(Boolean).pop() || "Folders"
    : "Folders";
  const chrome = { title, showBack: Boolean(folderPath) };
  const data = await apiGet(
    `/api/browse?path=${encodeURIComponent(folderPath)}`
  );
  const dirs = data.dirs || [];
  const rawFiles = data.files || [];

  if (!dirs.length && !rawFiles.length) {
    return page(chrome, { kind: "empty", message: "This folder is empty" });
  }

  /** @type {Map<string, import("../../models/track.js").Track>} */
  let byId = new Map();
  const ids = rawFiles.map((f) => f.id).filter(Boolean);
  if (ids.length) {
    try {
      const meta = await fetchTracksMeta(ids);
      byId = new Map(meta.map((m) => [m.id, m]));
    } catch (err) {
      console.error(err);
    }
  }

  /** @type {FileRowModel[]} */
  const files = rawFiles.map((f) => {
    const track = f.id ? byId.get(f.id) || null : null;
    return {
      path: f.path,
      name: f.name || "",
      id: f.id || null,
      track,
      displayName: track ? formatTrackLabel(track) : f.name || "",
      cover: track
        ? coverUrl(track, "thumb", false)
        : "/static/img/placeholder.svg",
    };
  });

  return page(chrome, { kind: "folders", dirs, files });
}

export async function loadSearch(q) {
  const chrome = { title: "Search", showBack: false };
  if (!q) {
    return page(chrome, {
      kind: "empty",
      message: "Type to search the library index",
    });
  }
  const data = await fetchSearch(q);
  const artists = data.artists || [];
  const albums = data.albums || [];
  const tracks = data.tracks || [];
  if (!artists.length && !albums.length && !tracks.length) {
    return page(chrome, {
      kind: "empty",
      message: `No results for “${q}”`,
    });
  }
  return page(chrome, {
    kind: "search",
    sections: { artists, albums, tracks },
  });
}

export async function loadArtistDetail(id) {
  let title = "Artist";
  try {
    const artist = await fetchArtist(id);
    title = artist.name || "Artist";
  } catch {
    /* keep default */
  }
  const chrome = { title, showBack: true };
  const albums = await fetchArtistAlbums(id);
  if (!albums.length) {
    return page(chrome, {
      kind: "empty",
      message: "No albums for this artist",
    });
  }
  return page(chrome, { kind: "albumGrid", albums });
}

export async function loadAlbumDetail(id) {
  let title = "Album";
  try {
    const album = await fetchAlbum(id);
    title = album.title || "Album";
  } catch {
    /* keep default */
  }
  const chrome = { title, showBack: true };
  const tracks = await fetchAlbumTracks(id);
  if (!tracks.length) {
    return page(chrome, { kind: "empty", message: "No tracks" });
  }
  return page(chrome, { kind: "tracks", tracks });
}

export async function loadArtistsList() {
  const chrome = { title: "Artists", showBack: false };
  const data = await apiGet("/api/artists?limit=500");
  const artists = data.items || [];
  if (!artists.length) {
    return page(chrome, {
      kind: "empty",
      message:
        "No artists yet — wait for library scan or re-scan in Settings",
    });
  }
  return page(chrome, { kind: "artists", artists });
}

export async function loadAlbumsList() {
  const chrome = { title: "Albums", showBack: false };
  const data = await apiGet("/api/albums?limit=500&sort=title");
  const albums = data.items || [];
  if (!albums.length) {
    return page(chrome, {
      kind: "empty",
      message:
        "No albums yet — wait for library scan or re-scan in Settings",
    });
  }
  return page(chrome, { kind: "albumGrid", albums });
}

/**
 * Resolve which loader to run for the current location.
 * @param {{ mode: string, routeName: string|symbol|null|undefined, folderPath: string, artistId?: string, albumId?: string, searchQuery: string }} loc
 * @returns {Promise<LibraryPage>}
 */
export async function loadLibraryPage(loc) {
  if (loc.mode === "folders") return loadFolders(loc.folderPath);
  if (loc.mode === "search") return loadSearch(loc.searchQuery);
  if (loc.routeName === "artist") return loadArtistDetail(loc.artistId);
  if (loc.routeName === "album") return loadAlbumDetail(loc.albumId);
  if (loc.mode === "artists") return loadArtistsList();
  if (loc.mode === "albums") return loadAlbumsList();
  return emptyPage({ title: "Library", message: "Unknown view" });
}
