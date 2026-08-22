/**
 * Pure flatten of expanded tree into visible rows (render + keyboard).
 */
import type { TreeNode } from "@/components/tree/treeNode";

export interface VisibleNode {
  node: TreeNode;
  key: string;
  depth: number;
  isLeaf: boolean;
  parentKey: string | null;
  index: number;
}

export function flattenVisible(
  roots: TreeNode[],
  isExpanded: (key: string) => boolean,
  getChildren: (key: string) => TreeNode[],
  keyOf: (node: TreeNode) => string,
  isLeafOf: (node: TreeNode) => boolean,
): VisibleNode[] {
  const out: VisibleNode[] = [];

  function walk(
    nodes: TreeNode[] | undefined,
    depth: number,
    parentKey: string | null,
  ) {
    for (const node of nodes || []) {
      const key = keyOf(node);
      const isLeaf = isLeafOf(node);
      out.push({
        node,
        key,
        depth,
        isLeaf,
        parentKey,
        index: out.length,
      });
      if (!isLeaf && isExpanded(key)) {
        walk(getChildren(key), depth + 1, key);
      }
    }
  }

  walk(roots, 0, null);
  return out;
}
