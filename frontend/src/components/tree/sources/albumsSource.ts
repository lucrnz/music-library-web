/**
 * Albums tree: album → tracks.
 */
import { coverUrl, fetchAlbums, fetchAlbumTracks } from "@/api";
import { kindForAlbum, kindForTrack } from "@/lossyKind";
import { treeNodeId, type TreeNode } from "@/components/tree/treeNode";
import { formatAlbumMeta } from "@/util";

export async function listAlbumRoots(): Promise<TreeNode[]> {
  const items = await fetchAlbums();
  return items.map(
    (al): TreeNode => ({
      key: `album:${al.id}`,
      isLeaf: false,
      kind: "album",
      title: al.title || "Unknown album",
      subtitle: formatAlbumMeta({
        artist: al.artist,
        year: al.year,
        trackCount: al.trackCount,
        durationSec: al.duration,
      }),
      cover: coverUrl({ albumId: al.id }, "thumb", false),
      lossyKind: kindForAlbum(al),
      data: al,
    }),
  );
}

export async function loadAlbumChildren(node: TreeNode): Promise<TreeNode[]> {
  if (node.kind !== "album") return [];
  const tracks = await fetchAlbumTracks(treeNodeId(node));
  return tracks.map(
    (t): TreeNode => ({
      key: `track:${t.id}`,
      isLeaf: true,
      kind: "track",
      title: t.title || "",
      subtitle: t.artist || "",
      cover: coverUrl(t, "thumb", false),
      lossyKind: kindForTrack(t),
      data: t,
    }),
  );
}
