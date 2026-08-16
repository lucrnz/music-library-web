/**
 * Pure loader for the offline Downloads library browse mode.
 * Track lists are projected to the client Track type.
 */

import { kindForTracks, type AlbumLossyKind } from "@/lossyKind";
import { fromCatalogRecord, type Track } from "@/models/track";
import { getLocalArtistImageUrl, getLocalCoverUrl } from "@/downloads/catalog";
import {
  buildDownloadsHierarchy,
  type DownloadsHierarchyAlbum,
} from "@/downloads/hierarchy";

export interface DownloadsBrowseArtist {
  id: string;
  name: string;
  album_count: number;
  track_count: number;
}

export interface DownloadsBrowseAlbum {
  id: string;
  title: string;
  artist: string;
  trackCount: number;
  lossyKind: AlbumLossyKind | null;
}

export interface DownloadsBrowseState {
  title: string;
  showBack: boolean;
  emptyMsg: string;
  artists: DownloadsBrowseArtist[];
  albums: DownloadsBrowseAlbum[];
  tracks: Track[];
  albumGrid: boolean;
  artUrls: Record<string, string>;
  parentArtistId?: string;
}

export interface DownloadsBrowseOpts {
  routeName: string;
  artistId?: string;
  albumId?: string;
  enabled: boolean;
}

export async function loadDownloadsView(
  opts: DownloadsBrowseOpts,
): Promise<DownloadsBrowseState> {
  const empty: DownloadsBrowseState = {
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
  const artUrls: Record<string, string> = {};

  if (opts.routeName === "downloads-album") {
    const id = opts.albumId;
    let found: DownloadsHierarchyAlbum | null = null;
    let parentArtistId: string | undefined;
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
        trackCount: al.tracks.length,
        lossyKind: kindForTracks(al.tracks),
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
