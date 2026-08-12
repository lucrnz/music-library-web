/**
 * Downloads offline tree: always artist → album → tracks.
 */
import {
  buildDownloadsHierarchy,
  getLocalArtistImageUrl,
  getLocalCoverUrl,
} from "../../../downloads/index.js";
import { resolveDownloadsFocusPath } from "../treeNavigation.js";

/**
 * @typedef {import('./artistsSource.js').TreeNode} TreeNode
 */

/**
 * @returns {Promise<{ roots: TreeNode[], hierarchy: object, artUrls: Record<string, string> }>}
 */
export async function loadDownloadsTree() {
  const hierarchy = await buildDownloadsHierarchy();
  /** @type {Record<string, string>} */
  const artUrls = {};

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

  /** @type {TreeNode[]} */
  const roots = hierarchy.artists.map((ar) => {
    /** @type {TreeNode[]} */
    const albumNodes = ar.albums.map((al) => {
      /** @type {TreeNode[]} */
      const trackNodes = (al.tracks || []).map((tr) => ({
        key: `dl-track:${tr.trackId}`,
        isLeaf: true,
        kind: "dl-track",
        title: tr.title || "",
        subtitle: "",
        cover: artUrls[`al:${al.albumId}`] || "",
        /** Catalog record; project with fromCatalogRecord for play/UI Track. */
        data: tr,
        /** @type {TreeNode[]|undefined} */
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

/**
 * In-memory children (already on node).
 * @param {TreeNode & { children?: TreeNode[] }} node
 */
export async function loadDownloadsChildren(node) {
  return node.children || [];
}

export { resolveDownloadsFocusPath };
