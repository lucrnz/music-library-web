/**
 * Pure loader for the offline Downloads library browse mode.
 * Returns the shared LibraryPage shape.
 */

import { kindForTracks } from "@/lossyKind";
import { fromCatalogRecord } from "@/models/track";
import { getLocalArtistImageUrl, getLocalCoverUrl } from "@/downloads/catalog";
import { emptyPage, page, type LibraryPage } from "@/components/library/loaders";
import {
  buildDownloadsHierarchy,
  type DownloadsHierarchyAlbum,
} from "@/downloads/hierarchy";

export interface DownloadsBrowseOpts {
  routeName: string;
  artistId?: string;
  albumId?: string;
  enabled: boolean;
}

export async function loadDownloadsView(
  opts: DownloadsBrowseOpts,
): Promise<LibraryPage> {
  if (!opts.enabled) {
    return emptyPage({
      title: "Downloads",
      showBack: false,
      message: "Enable downloads in Settings to browse offline library",
    });
  }

  const tree = await buildDownloadsHierarchy();
  const artUrls: Record<string, string> = {};

  if (opts.routeName === "downloads-album") {
    const id = opts.albumId;
    let found: DownloadsHierarchyAlbum | null = null;
    let parentArtistId: string | undefined;
    let parentArtistName = "";
    for (const ar of tree.artists) {
      found = ar.albums.find((al) => al.albumId === id) || null;
      if (found) {
        parentArtistId = ar.artistId;
        parentArtistName = ar.name;
        break;
      }
    }
    if (!found) {
      return emptyPage({
        title: "Album",
        showBack: true,
        message: "Album not in downloads",
      });
    }
    if (found.hasThumb) {
      const u = await getLocalCoverUrl(found.albumId, "thumb");
      if (u) artUrls[`cover:${found.albumId}:thumb`] = u;
    }
    return page(
      {
        title: found.title || "Album",
        showBack: true,
        backArtistId: parentArtistId,
      },
      {
        kind: "tracks",
        tracks: found.tracks.map((t) => fromCatalogRecord(t)),
      },
      {
        artUrls,
        headerAlbum: {
          id: found.albumId,
          title: found.title,
          artist: parentArtistName,
          trackCount: found.tracks.length,
        },
      },
    );
  }

  if (opts.routeName === "downloads-artist") {
    const ar = tree.artists.find((a) => a.artistId === opts.artistId);
    if (!ar) {
      return emptyPage({
        title: "Artist",
        showBack: true,
        message: "Artist not in downloads",
      });
    }
    if (ar.hasThumb) {
      const u = await getLocalArtistImageUrl(ar.artistId, "thumb");
      if (u) artUrls[`artist:${ar.artistId}:thumb`] = u;
    }
    for (const al of ar.albums) {
      if (al.hasThumb) {
        const u = await getLocalCoverUrl(al.albumId, "thumb");
        if (u) artUrls[`cover:${al.albumId}:thumb`] = u;
      }
    }
    return page(
      { title: ar.name || "Artist", showBack: true },
      {
        kind: "albumGrid",
        albums: ar.albums.map((al) => ({
          id: al.albumId,
          title: al.title,
          artist: ar.name,
          trackCount: al.tracks.length,
          lossyKind: kindForTracks(al.tracks),
        })),
      },
      {
        artUrls,
        headerArtist: {
          id: ar.artistId,
          name: ar.name,
          sortName: null,
          albumCount: ar.albums.length,
          trackCount: ar.albums.reduce((n, al) => n + al.tracks.length, 0),
          hasImage: false,
          hasPreferredImage: false,
          preferredRev: 0,
        },
      },
    );
  }

  for (const ar of tree.artists) {
    if (ar.hasThumb) {
      const u = await getLocalArtistImageUrl(ar.artistId, "thumb");
      if (u) artUrls[`artist:${ar.artistId}:thumb`] = u;
    }
  }
  if (!tree.artists.length) {
    return page(
      { title: "Downloads", showBack: false },
      {
        kind: "empty",
        message: "No downloads yet — download tracks from the library",
      },
      { artUrls },
    );
  }
  return page(
    { title: "Downloads", showBack: false },
    {
      kind: "artists",
      artists: tree.artists.map((ar) => ({
        id: ar.artistId,
        name: ar.name,
        sortName: null,
        albumCount: ar.albums.length,
        trackCount: ar.albums.reduce((n, al) => n + al.tracks.length, 0),
        hasImage: false,
        hasPreferredImage: false,
        preferredRev: 0,
      })),
    },
    { artUrls },
  );
}
