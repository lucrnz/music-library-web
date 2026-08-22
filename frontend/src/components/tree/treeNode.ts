/**
 * Discriminated library tree node. Sources construct one member; hosts switch on kind.
 */
import type { BrowseDir } from "@/api";
import type { FileRowModel, LibraryAlbum } from "@/components/library/loaders";
import type { Artist } from "@/models/artist";
import type { Track } from "@/models/track";

export type TreeTrackData = Track & {
  codec?: string;
  bytes?: number | null;
  status?: string;
};

interface TreeNodeBase {
  key: string;
  isLeaf: boolean;
  title: string;
  subtitle?: string;
  cover?: string;
  lossyKind?: string | null;
  children?: TreeNode[];
}

export type TreeNode =
  | (TreeNodeBase & { kind: "artist"; data: Artist })
  | (TreeNodeBase & { kind: "album"; data: LibraryAlbum })
  | (TreeNodeBase & { kind: "track"; data: TreeTrackData })
  | (TreeNodeBase & { kind: "dir"; path: string; data?: BrowseDir })
  | (TreeNodeBase & { kind: "file"; data: FileRowModel });

export function treeNodeId(node: TreeNode): string {
  if (node.kind === "artist" || node.kind === "album" || node.kind === "track") {
    return node.data.id || "";
  }
  return "";
}

export function treeNodePath(node: TreeNode): string {
  if (node.kind === "dir") return node.path || "";
  if (node.kind === "file") return node.data.path || "";
  return "";
}
