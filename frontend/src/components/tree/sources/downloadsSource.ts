/**
 * Downloads offline tree: always artist → album → tracks.
 */
import {
  getLocalArtistImageUrl,
  getLocalCoverUrl,
} from "@/downloads/catalog";
import {
  buildDownloadsHierarchy,
  type DownloadsHierarchy,
} from "@/downloads/hierarchy";
import { resolveDownloadsFocusPath } from "@/components/tree/treeNavigation";
import { kindForTrack, kindForTracks } from "@/lossyKind";
import type { TreeNode } from "@/components/tree/sources/artistsSource";

export type { DownloadsHierarchy };

export interface DownloadsTreePacked {
  roots: TreeNode[];
  hierarchy: DownloadsHierarchy;
  artUrls: Record<string, string>;
}

export async function loadDownloadsTree(): Promise<DownloadsTreePacked> {
  const hierarchy = await buildDownloadsHierarchy();
  const artUrls: Record<string, string> = {};

  for (const ar of hierarchy.artists) {
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
  }

  const roots: TreeNode[] = hierarchy.artists.map((ar) => {
    const albumNodes: TreeNode[] = ar.albums.map((al) => {
      const trackNodes: TreeNode[] = (al.tracks || []).map((tr) => ({
        key: `dl-track:${tr.trackId}`,
        isLeaf: true,
        kind: "dl-track",
        title: tr.title || "",
        subtitle: "",
        cover: artUrls[`al:${al.albumId}`] || "",
        /** Catalog record; project with fromCatalogRecord for play/UI Track. */
        data: tr,
        lossyKind: kindForTrack(tr),
        children: undefined,
      }));
      return {
        key: `dl-album:${al.albumId}`,
        isLeaf: false,
        kind: "dl-album",
        title: al.title || "Unknown album",
        subtitle: `${al.tracks?.length || 0} tracks`,
        cover: artUrls[`al:${al.albumId}`] || "/static/img/placeholder.svg",
        data: al,
        children: trackNodes,
        lossyKind: kindForTracks(al.tracks),
      };
    });
    return {
      key: `dl-artist:${ar.artistId}`,
      isLeaf: false,
      kind: "dl-artist",
      title: ar.name || "Unknown artist",
      subtitle: `${ar.albums.length} albums`,
      cover: artUrls[`a:${ar.artistId}`] || "/static/img/placeholder.svg",
      data: ar,
      children: albumNodes,
    };
  });

  return { roots, hierarchy, artUrls };
}

/** In-memory children (already on node). */
export async function loadDownloadsChildren(node: TreeNode): Promise<TreeNode[]> {
  return node.children || [];
}

export { resolveDownloadsFocusPath };
