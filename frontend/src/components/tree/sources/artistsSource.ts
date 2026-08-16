/**
 * Artists tree: artist → album → tracks.
 */
import {
  apiGet,
  artistImageUrl,
  coverUrl,
  fetchAlbumTracks,
  fetchArtistAlbums,
  type ArtistListItem,
} from "@/api";
import { kindForAlbum, kindForTrack } from "@/lossyKind";

export interface TreeNode {
  key: string;
  isLeaf: boolean;
  kind: string;
  title: string;
  subtitle?: string;
  cover?: string;
  lossyKind?: string | null;
  data?: unknown;
  children?: TreeNode[];
}

export function treeNodeId(node: TreeNode): string {
  const data = node.data;
  if (data && typeof data === "object" && "id" in data) {
    const id = (data as { id?: unknown }).id;
    if (typeof id === "string") return id;
  }
  return "";
}

export function treeNodePath(node: TreeNode): string {
  const data = node.data;
  if (data && typeof data === "object" && "path" in data) {
    const path = (data as { path?: unknown }).path;
    if (typeof path === "string") return path;
  }
  return "";
}

export async function listArtistRoots(): Promise<TreeNode[]> {
  const data = await apiGet<{ items?: ArtistListItem[] }>(
    "/api/artists?limit=500",
  );
  const items = data.items || [];
  return items.map((a: ArtistListItem): TreeNode => {
    const n = a.album_count;
    const albums = `${n} album${n === 1 ? "" : "s"}`;
    return {
      key: `artist:${a.id}`,
      isLeaf: false,
      kind: "artist",
      title: a.name || "Unknown artist",
      subtitle: `${albums} · ${a.track_count ?? 0} tracks`,
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
        subtitle: al.year ? String(al.year) : "",
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
