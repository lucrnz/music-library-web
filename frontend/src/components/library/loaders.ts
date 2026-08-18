/**
 * Library page loaders. Each returns a discriminated LibraryPage:
 * { chrome, body } where body.kind selects the list shape.
 */

import {
  apiGet,
  coverUrl,
  fetchAlbum,
  fetchAlbums,
  fetchAlbumTracks,
  fetchArtist,
  fetchArtistAlbums,
  fetchSearch,
  fetchTracksMeta,
  type ArtistListItem,
  type BrowseDir,
  type BrowseResponse,
} from "@/api";
import { formatTrackLabel } from "@/util";
import type { Album } from "@/models/album";
import type { Track } from "@/models/track";

/** Folder file row: path chrome + optional full Track. */
export interface FileRowModel {
  path: string;
  name: string;
  id: string | null;
  track: Track | null;
  displayName: string;
  cover: string;
}

export interface LibraryChrome {
  title: string;
  showBack: boolean;
  backArtistId?: string;
}

/** Album row/card fields used by library + downloads browse. */
export type LibraryAlbum = Pick<Album, "id" | "title" | "artist"> & {
  artistId?: string | null;
  year?: number | null;
  trackCount?: number | null;
  hasCover?: boolean;
  lossyKind?: string | null;
};

export type LibraryBody =
  | { kind: "folders"; dirs: BrowseDir[]; files: FileRowModel[] }
  | { kind: "artists"; artists: ArtistListItem[] }
  | { kind: "albumGrid"; albums: LibraryAlbum[] }
  | { kind: "tracks"; tracks: Track[] }
  | {
      kind: "search";
      sections: {
        artists: ArtistListItem[];
        albums: Album[];
        tracks: Track[];
      };
    }
  | { kind: "empty"; message: string };

export interface LibraryPage {
  chrome: LibraryChrome;
  body: LibraryBody;
  headerArtist?: ArtistListItem | null;
  headerAlbum?: LibraryAlbum | null;
}

/**
 * @param {LibraryChrome} chrome
 * @param {LibraryBody} body
 * @returns {LibraryPage}
 */
export function page(
  chrome: LibraryChrome,
  body: LibraryBody,
  extra?: Pick<LibraryPage, "headerArtist" | "headerAlbum">,
): LibraryPage {
  return { chrome, body, ...extra };
}

/**
 * @param {Partial<LibraryChrome> & { message?: string }} opts
 * @returns {LibraryPage}
 */
export function emptyPage(opts: Partial<LibraryChrome> & { message?: string } = {}) {
  const { message = "", title = "Library", showBack = false } = opts;
  return page({ title, showBack }, { kind: "empty", message });
}

export async function loadFolders(folderPath: string): Promise<LibraryPage> {
  const title = folderPath
    ? folderPath.split("/").filter(Boolean).pop() || "Folders"
    : "Folders";
  const chrome = { title, showBack: Boolean(folderPath) };
  const data = await apiGet<BrowseResponse>(
    `/api/browse?path=${encodeURIComponent(folderPath)}`
  );
  const dirs = data.dirs || [];
  const rawFiles = data.files || [];

  if (!dirs.length && !rawFiles.length) {
    return page(chrome, { kind: "empty", message: "This folder is empty" });
  }

  /** @type {Map<string, import("../../models/track.js").Track>} */
  let byId = new Map<string, Track>();
  const ids = rawFiles.map((f) => f.id).filter((id): id is string => !!id);
  if (ids.length) {
    try {
      const meta = await fetchTracksMeta(ids);
      byId = new Map(meta.map((m) => [m.id, m]));
    } catch (err: unknown) {
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

export async function loadSearch(q: string): Promise<LibraryPage> {
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

export async function loadArtistDetail(id: string): Promise<LibraryPage> {
  let title = "Artist";
  let headerArtist: ArtistListItem | null = null;
  try {
    const artist = await fetchArtist(id);
    title = artist.name || "Artist";
    headerArtist = artist;
  } catch {
    /* keep default */
  }
  const chrome = { title, showBack: true };
  const albums = await fetchArtistAlbums(id);
  if (!albums.length) {
    return page(
      chrome,
      {
        kind: "empty",
        message: "No albums for this artist",
      },
      { headerArtist },
    );
  }
  return page(chrome, { kind: "albumGrid", albums }, { headerArtist });
}

export async function loadAlbumDetail(id: string): Promise<LibraryPage> {
  let title = "Album";
  /** @type {string|undefined} */
  let backArtistId;
  let headerAlbum: LibraryAlbum | null = null;
  try {
    const album = await fetchAlbum(id);
    title = album.title || "Album";
    headerAlbum = album;
    const aid = album.artistId;
    if (aid) backArtistId = String(aid);
  } catch {
    /* keep default */
  }
  const chrome = { title, showBack: true, backArtistId };
  const tracks = await fetchAlbumTracks(id);
  if (!tracks.length) {
    return page(chrome, { kind: "empty", message: "No tracks" }, { headerAlbum });
  }
  // Fallback: first track's album artist if album meta lacked id.
  if (!chrome.backArtistId && tracks[0]) {
    const t = tracks[0];
    const aid = t.albumArtistId || t.artistId;
    if (aid) chrome.backArtistId = String(aid);
  }
  return page(chrome, { kind: "tracks", tracks }, { headerAlbum });
}

export async function loadArtistsList(): Promise<LibraryPage> {
  const chrome = { title: "Artists", showBack: false };
  const data = await apiGet<{ items?: ArtistListItem[] }>("/api/artists?limit=500");
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

export async function loadAlbumsList(): Promise<LibraryPage> {
  const chrome = { title: "Albums", showBack: false };
  const albums = await fetchAlbums();
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
export async function loadLibraryPage(loc: {
  mode: string;
  routeName: string | symbol | null | undefined;
  folderPath: string;
  artistId?: string;
  albumId?: string;
  searchQuery: string;
}): Promise<LibraryPage> {
  if (loc.mode === "folders") return loadFolders(loc.folderPath);
  if (loc.mode === "search") return loadSearch(loc.searchQuery);
  if (loc.routeName === "artist") return loadArtistDetail(loc.artistId || "");
  if (loc.routeName === "album") return loadAlbumDetail(loc.albumId || "");
  if (loc.mode === "artists") return loadArtistsList();
  if (loc.mode === "albums") return loadAlbumsList();
  return emptyPage({ title: "Library", message: "Unknown view" });
}
