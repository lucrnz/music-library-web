/**
 * One offline catalog snapshot: hierarchy + artUrls + pre-primed tree roots.
 */
import type { Artist } from "@/models/artist";
import type { LibraryAlbum } from "@/components/library/loaders";
import type { TreeNode } from "@/components/tree/sources/artistsSource";
import {
  getLocalArtistImageUrl,
  getLocalCoverUrl,
} from "@/downloads/catalog";
import {
  buildDownloadsHierarchy,
  type DownloadsHierarchy,
  type DownloadsHierarchyAlbum,
  type DownloadsHierarchyArtist,
} from "@/downloads/hierarchy";
import { kindForTrack, kindForTracks } from "@/lossyKind";
import { fromCatalogRecord, type CatalogTrackRecord, type Track } from "@/models/track";

export interface DownloadsCatalogView {
  hierarchy: DownloadsHierarchy;
  artUrls: Record<string, string>;
  roots: TreeNode[];
}

export function artistFromDl(artist: DownloadsHierarchyArtist): Artist {
  return {
    id: artist.artistId,
    name: artist.name,
    sortName: null,
    albumCount: artist.albums.length,
    trackCount: artist.albums.reduce((n, al) => n + al.tracks.length, 0),
    hasImage: false,
    hasPreferredImage: false,
    preferredRev: 0,
  };
}

export function albumFromDl(
  album: DownloadsHierarchyAlbum,
  artistName: string,
): LibraryAlbum {
  return {
    id: album.albumId,
    title: album.title,
    artist: artistName,
    trackCount: album.tracks.length,
  };
}

export function trackFromDl(rec: CatalogTrackRecord): Track {
  return fromCatalogRecord(rec);
}

export async function loadDownloadsCatalogView(): Promise<DownloadsCatalogView> {
  const hierarchy = await buildDownloadsHierarchy();
  const artUrls: Record<string, string> = {};

  for (const ar of hierarchy.artists) {
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
  }

  const roots: TreeNode[] = hierarchy.artists.map((ar) => {
    const albumNodes: TreeNode[] = ar.albums.map((al) => {
      const trackNodes: TreeNode[] = (al.tracks || []).map((tr) => ({
        key: `track:${tr.trackId}`,
        isLeaf: true,
        kind: "track",
        title: tr.title || "",
        subtitle: "",
        cover: artUrls[`cover:${al.albumId}:thumb`] || "",
        data: {
          ...trackFromDl(tr),
          codec: tr.codec,
          bytes: tr.bytes ?? null,
          status: tr.status,
        },
        lossyKind: kindForTrack(tr),
        children: undefined,
      }));
      return {
        key: `album:${al.albumId}`,
        isLeaf: false,
        kind: "album",
        title: al.title || "Unknown album",
        subtitle: `${al.tracks?.length || 0} tracks`,
        cover: artUrls[`cover:${al.albumId}:thumb`] || "/static/img/placeholder.svg",
        data: albumFromDl(al, ar.name),
        children: trackNodes,
        lossyKind: kindForTracks(al.tracks),
      };
    });
    return {
      key: `artist:${ar.artistId}`,
      isLeaf: false,
      kind: "artist",
      title: ar.name || "Unknown artist",
      subtitle: `${ar.albums.length} albums`,
      cover: artUrls[`artist:${ar.artistId}:thumb`] || "/static/img/placeholder.svg",
      data: artistFromDl(ar),
      children: albumNodes,
    };
  });

  return { hierarchy, artUrls, roots };
}
