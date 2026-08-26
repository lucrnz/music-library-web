/**
 * Pure loader for the offline Downloads library browse mode.
 * Returns the shared LibraryPage shape.
 */

import { kindForTracks } from "@/lossyKind";
import { fromCatalogRecord } from "@/models/track";
import { emptyPage, page, type LibraryPage } from "@/components/library/loaders";
import {
  albumFromDl,
  artistFromDl,
  loadDownloadsCatalogView,
} from "@/downloads/snapshot";
import type { DownloadsHierarchyAlbum } from "@/downloads/hierarchy";

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

  const snap = await loadDownloadsCatalogView();
  const tree = snap.hierarchy;
  const artUrls = { ...snap.artUrls };

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
        headerAlbum: albumFromDl(found, parentArtistName),
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
    return page(
      { title: ar.name || "Artist", showBack: true },
      {
        kind: "albumGrid",
        albums: ar.albums.map((al) => ({
          ...albumFromDl(al, ar.name),
          lossyKind: kindForTracks(al.tracks),
        })),
      },
      {
        artUrls,
        headerArtist: artistFromDl(ar),
      },
    );
  }

  if (!tree.artists.length) {
    return page(
      { title: "Downloads", showBack: false },
      {
        kind: "empty",
        message: "No downloads yet - download tracks from the library",
      },
      { artUrls },
    );
  }
  return page(
    { title: "Downloads", showBack: false },
    {
      kind: "artists",
      artists: tree.artists.map((ar) => artistFromDl(ar)),
    },
    { artUrls },
  );
}
