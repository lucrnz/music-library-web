/**
 * Artists tree: artist → album → tracks.
 */
import {
  artistImageUrl,
  coverUrl,
  fetchAlbumTracks,
  fetchArtistAlbums,
  fetchArtists,
} from "@/api";
import { kindForAlbum, kindForTrack } from "@/lossyKind";
import { treeNodeId, type TreeNode } from "@/components/tree/treeNode";
import { formatAlbumMeta } from "@/util";

export async function listArtistRoots(): Promise<TreeNode[]> {
  const items = await fetchArtists();
  return items.map((a): TreeNode => {
    const n = a.albumCount;
    const albums = `${n} album${n === 1 ? "" : "s"}`;
    return {
      key: `artist:${a.id}`,
      isLeaf: false,
      kind: "artist",
      title: a.name || "Unknown artist",
      subtitle: `${albums} · ${a.trackCount ?? 0} tracks`,
      cover: artistImageUrl(a, "thumb", false),
      data: a,
    };
  });
}

export async function loadArtistChildren(node: TreeNode): Promise<TreeNode[]> {
  if (node.kind === "artist") {
    const albums = await fetchArtistAlbums(treeNodeId(node));
    return albums.map(
      (al): TreeNode => ({
        key: `album:${al.id}`,
        isLeaf: false,
        kind: "album",
        title: al.title || "Unknown album",
        subtitle: formatAlbumMeta({
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
  if (node.kind === "album") {
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
  return [];
}
