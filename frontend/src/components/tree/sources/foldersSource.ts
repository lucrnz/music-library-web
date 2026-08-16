/**
 * Folders FS tree: directory → nested dirs/files (lazy browse).
 */
import {
  apiGet,
  coverUrl,
  fetchTracksMeta,
  type BrowseResponse,
} from "@/api";
import { formatTrackLabel } from "@/util";
import type { Track } from "@/models/track";
import {
  treeNodePath,
  type TreeNode,
} from "@/components/tree/sources/artistsSource";

export async function listFolderChildren(
  folderPath: string,
): Promise<TreeNode[]> {
  const data = await apiGet<BrowseResponse>(
    `/api/browse?path=${encodeURIComponent(folderPath || "")}`,
  );
  const dirs = data.dirs || [];
  const rawFiles = data.files || [];

  let byId = new Map<string, Track>();
  const ids = rawFiles
    .map((f) => f.id)
    .filter((id): id is string => Boolean(id));
  if (ids.length) {
    try {
      const meta = await fetchTracksMeta(ids);
      byId = new Map(meta.map((m) => [m.id, m]));
    } catch (err: unknown) {
      console.error(err);
    }
  }

  const nodes: TreeNode[] = [];

  for (const dir of dirs) {
    nodes.push({
      key: `dir:${dir.path}`,
      isLeaf: false,
      kind: "dir",
      title: dir.name || dir.path || "",
      subtitle: "",
      cover: "",
      data: dir,
    });
  }

  for (const f of rawFiles) {
    const track = f.id ? byId.get(f.id) || null : null;
    nodes.push({
      key: `file:${f.path}`,
      isLeaf: true,
      kind: "file",
      title: track ? formatTrackLabel(track) : f.name || "",
      subtitle: "",
      cover: track
        ? coverUrl(track, "thumb", false)
        : "/static/img/placeholder.svg",
      data: {
        path: f.path,
        name: f.name || "",
        id: f.id || null,
        track,
        displayName: track ? formatTrackLabel(track) : f.name || "",
        cover: track
          ? coverUrl(track, "thumb", false)
          : "/static/img/placeholder.svg",
      },
    });
  }

  return nodes;
}

export async function listFolderRoots(): Promise<TreeNode[]> {
  return listFolderChildren("");
}

export async function loadFolderNodeChildren(
  node: TreeNode,
): Promise<TreeNode[]> {
  if (node.kind !== "dir") return [];
  return listFolderChildren(treeNodePath(node) || "");
}
