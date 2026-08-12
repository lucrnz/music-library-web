/**
 * Albums tree: album → tracks.
 */
import { apiGet, coverUrl, fetchAlbumTracks } from "../../../api.js";

/**
 * @typedef {import('./artistsSource.js').TreeNode} TreeNode
 */

export async function listAlbumRoots() {
  const data = await apiGet("/api/albums?limit=500&sort=title");
  const items = data.items || [];
  return items.map(
    /** @returns {TreeNode} */ (al) => ({
      key: `album:${al.id}`,
      isLeaf: false,
      kind: "album",
      title: al.title || "Unknown album",
      subtitle: al.artist_name || al.artist || "",
      cover: coverUrl({ albumId: al.id }, "thumb", false),
      data: al,
    })
  );
}

/**
 * @param {TreeNode} node
 * @returns {Promise<TreeNode[]>}
 */
export async function loadAlbumChildren(node) {
  if (node.kind !== "album") return [];
  const tracks = await fetchAlbumTracks(node.data.id);
  return tracks.map((t) => ({
    key: `track:${t.id}`,
    isLeaf: true,
    kind: "track",
    title: t.title || "",
    subtitle: t.artist || "",
    cover: coverUrl(t, "thumb", false),
    data: t,
  }));
}
