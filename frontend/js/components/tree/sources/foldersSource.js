/**
 * Folders FS tree: directory → nested dirs/files (lazy browse).
 */
import {
  apiGet,
  coverUrl,
  fetchTracksMeta,
} from "../../../api.js";
import { formatTrackLabel } from "../../../util.js";

/**
 * @typedef {import('./artistsSource.js').TreeNode} TreeNode
 */

/**
 * @param {string} folderPath
 * @returns {Promise<TreeNode[]>}
 */
export async function listFolderChildren(folderPath) {
  const data = await apiGet(
    `/api/browse?path=${encodeURIComponent(folderPath || "")}`
  );
  const dirs = data.dirs || [];
  const rawFiles = data.files || [];

  /** @type {Map<string, import("../../../models/track.js").Track>} */
  let byId = new Map();
  const ids = rawFiles.map((f) => f.id).filter(Boolean);
  if (ids.length) {
    try {
      const meta = await fetchTracksMeta(ids);
      byId = new Map(meta.map((m) => [m.id, m]));
    } catch (err) {
      console.error(err);
    }
  }

  /** @type {TreeNode[]} */
  const nodes = [];

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

export async function listFolderRoots() {
  return listFolderChildren("");
}

/**
 * @param {TreeNode} node
 */
export async function loadFolderNodeChildren(node) {
  if (node.kind !== "dir") return [];
  return listFolderChildren(node.data.path || "");
}
