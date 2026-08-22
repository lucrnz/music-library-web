/**
 * Downloads offline tree: always artist → album → tracks.
 */
import type { TreeNode } from "@/components/tree/treeNode";
import { resolveDownloadsFocusPath } from "@/components/tree/treeNavigation";
import { loadDownloadsCatalogView } from "@/downloads/snapshot";

export {
  artistFromDl,
  albumFromDl,
  trackFromDl,
  type DownloadsCatalogView,
} from "@/downloads/snapshot";
export type { DownloadsHierarchy } from "@/downloads/hierarchy";

export interface DownloadsTreePacked {
  roots: TreeNode[];
  artUrls: Record<string, string>;
}

export async function loadDownloadsTree(): Promise<DownloadsTreePacked> {
  const snap = await loadDownloadsCatalogView();
  return { roots: snap.roots, artUrls: snap.artUrls };
}

/** In-memory children (already on node). */
export async function loadDownloadsChildren(node: TreeNode): Promise<TreeNode[]> {
  return node.children || [];
}

export { resolveDownloadsFocusPath };
