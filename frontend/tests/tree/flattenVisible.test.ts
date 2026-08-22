import { describe, expect, it } from "vitest";
import { flattenVisible } from "@/components/tree/flattenVisible";
import type { TreeNode } from "@/components/tree/treeNode";

function node(key: string, extra: { isLeaf?: boolean } = {}): TreeNode {
  return {
    key,
    isLeaf: extra.isLeaf ?? true,
    kind: "dir",
    path: key,
    title: key,
  };
}

describe("flattenVisible", () => {
  it("includes children only when expanded", () => {
    const child = node("child");
    const parent = node("parent", { isLeaf: false });
    const other = node("other");
    const children: Record<string, TreeNode[]> = { parent: [child] };
    const expanded = new Set<string>(["parent"]);

    const rows = flattenVisible(
      [parent, other],
      (key) => expanded.has(key),
      (key) => children[key] || [],
      (n) => n.key,
      (n) => n.isLeaf,
    );
    expect(rows.map((r) => r.key)).toEqual(["parent", "child", "other"]);
    expect(rows[1].parentKey).toBe("parent");
    expect(rows[1].depth).toBe(1);
    expect(rows[0].depth).toBe(0);

    const collapsed = flattenVisible(
      [parent, other],
      () => false,
      (key) => children[key] || [],
      (n) => n.key,
      (n) => n.isLeaf,
    );
    expect(collapsed.map((r) => r.key)).toEqual(["parent", "other"]);
  });

  it("returns empty for no roots", () => {
    expect(
      flattenVisible(
        [],
        () => false,
        () => [],
        (n) => n.key,
        () => true,
      ),
    ).toEqual([]);
  });
});
