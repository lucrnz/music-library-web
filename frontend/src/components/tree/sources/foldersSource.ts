/**
 * Folders FS tree: directory → nested dirs/files (lazy browse).
 */
import { browseFolder } from "@/components/library/loaders";
import { treeNodePath, type TreeNode } from "@/components/tree/treeNode";

export async function listFolderChildren(
  folderPath: string,
): Promise<TreeNode[]> {
  const { dirs, files } = await browseFolder(folderPath);
  const nodes: TreeNode[] = [];

  for (const dir of dirs) {
    nodes.push({
      key: `dir:${dir.path}`,
      isLeaf: false,
      kind: "dir",
      path: dir.path,
      title: dir.name || dir.path || "",
      subtitle: "",
      cover: "",
      data: dir,
    });
  }

  for (const file of files) {
    nodes.push({
      key: `file:${file.path}`,
      isLeaf: true,
      kind: "file",
      title: file.displayName || file.name || "",
      subtitle: "",
      cover: file.cover,
      data: file,
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
