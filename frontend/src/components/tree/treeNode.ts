/**
 * Discriminated library tree node. Sources construct one member; hosts switch on kind.
 */
import type { LibraryAlbum } from "@/components/library/loaders";
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
  | (TreeNodeBase & { kind: "track"; data: TreeTrackData });

export function treeNodeId(node: TreeNode): string {
  if (node.kind === "artist" || node.kind === "album" || node.kind === "track") {
    return node.data.id || "";
  }
  return "";
}
