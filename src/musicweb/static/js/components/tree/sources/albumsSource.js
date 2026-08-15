/**
 * Albums tree: album → tracks.
 */
import { coverUrl, fetchAlbums, fetchAlbumTracks } from "../../../api.js";
import { kindForAlbum, kindForTrack } from "../../../lossyKind.js";

/**
 * @typedef {import('./artistsSource.js').TreeNode} TreeNode
 */

export async function listAlbumRoots() {
  const items = await fetchAlbums();
  return items.map(
    /** @returns {TreeNode} */ (al) => ({
      key: `album:${al.id}`,
      isLeaf: false,
      kind: "album",
      title: al.title || "Unknown album",
      subtitle: al.artist || "",
      cover: coverUrl({ albumId: al.id }, "thumb", false),
      lossyKind: kindForAlbum(al),
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
    lossyKind: kindForTrack(t),
    data: t,
  }));
}
