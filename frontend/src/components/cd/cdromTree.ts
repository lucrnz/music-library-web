/**
 * Private Yellow Book tree nodes. Do not import library treeNode.ts.
 */
import type { CdromFileNode } from "@/cd/cdrom";

export type CdRomTreeNode =
  | {
      kind: "folder";
      id: string;
      name: string;
      rel: string;
      children: CdRomTreeNode[];
    }
  | {
      kind: "file";
      id: string;
      name: string;
      rel: string;
      file: CdromFileNode;
    };

export function parentRel(rel: string): string {
  const norm = rel.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!norm.includes("/")) return "";
  return norm.slice(0, norm.lastIndexOf("/"));
}
