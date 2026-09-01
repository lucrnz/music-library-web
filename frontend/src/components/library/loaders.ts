/**
 * Library page loaders. Each returns a discriminated LibraryPage:
 * { chrome, body } where body.kind selects the list shape.
 */

import {
  fetchAlbum,
  fetchAlbums,
  fetchAlbumTracks,
  fetchArtist,
  fetchArtistAlbums,
  fetchArtists,
  fetchSearch,
} from "@/api";
import type { Album } from "@/models/album";
import type { Artist } from "@/models/artist";
import type { Track } from "@/models/track";

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
  duration?: number | null;
  durationMs?: number | null;
  hasCover?: boolean;
  lossyKind?: string | null;
};

export type LibraryBody =
  | { kind: "artists"; artists: Artist[] }
  | { kind: "albumGrid"; albums: LibraryAlbum[] }
  | { kind: "tracks"; tracks: Track[] }
  | {
      kind: "search";
      sections: {
        artists: Artist[];
        albums: Album[];
        tracks: Track[];
      };
    }
  | { kind: "empty"; message: string };

export interface LibraryPage {
  chrome: LibraryChrome;
  body: LibraryBody;
  headerArtist?: Artist | null;
  headerAlbum?: LibraryAlbum | null;
  /** Offline browse blob URLs (`artist:{id}:thumb`, `cover:{id}:thumb`). */
  artUrls?: Record<string, string>;
}

/**
 * @param {LibraryChrome} chrome
 * @param {LibraryBody} body
 * @returns {LibraryPage}
 */
export function page(
  chrome: LibraryChrome,
  body: LibraryBody,
  extra?: Pick<LibraryPage, "headerArtist" | "headerAlbum" | "artUrls">,
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
  let headerArtist: Artist | null = null;
  try {
    const artist = await fetchArtist(id);
    title = artist.name || "Artist";
    headerArtist = artist;
  } catch {
    return page(
      { title: "Artist", showBack: true },
      { kind: "empty", message: "Artist not found" },
      { headerArtist: null },
    );
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
  const artists = await fetchArtists();
  if (!artists.length) {
    return page(chrome, {
      kind: "empty",
      message:
        "No artists yet - wait for library scan or re-scan in Settings",
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
        "No albums yet - wait for library scan or re-scan in Settings",
    });
  }
  return page(chrome, { kind: "albumGrid", albums });
}

/**
 * Resolve which loader to run for the current location.
 */
export async function loadLibraryPage(loc: {
  mode: string;
  routeName: string | symbol | null | undefined;
  artistId?: string;
  albumId?: string;
  searchQuery: string;
}): Promise<LibraryPage> {
  if (loc.mode === "search") return loadSearch(loc.searchQuery);
  if (loc.routeName === "artist") return loadArtistDetail(loc.artistId || "");
  if (loc.routeName === "album") return loadAlbumDetail(loc.albumId || "");
  if (loc.mode === "artists") return loadArtistsList();
  if (loc.mode === "albums") return loadAlbumsList();
  return emptyPage({ title: "Library", message: "Unknown view" });
}
