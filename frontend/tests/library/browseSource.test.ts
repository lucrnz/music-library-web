import { afterEach, describe, expect, it } from "vitest";
import { downloadsBrowse } from "@/components/library/sources/downloadsBrowse";
import { artUrlCache } from "@/downloads/catalog";
import type { TreeNode } from "@/components/tree/treeNode";

const loc = {
  mode: "downloads",
  routeName: "downloads",
  folderPath: "",
  searchQuery: "",
  downloadsEnabled: false,
};

function artistNode(id: string): TreeNode {
  return {
    key: `artist:${id}`,
    isLeaf: false,
    kind: "artist",
    title: "A",
    data: {
      id,
      name: "A",
      sortName: null,
      albumCount: 0,
      trackCount: 0,
      hasImage: false,
      hasPreferredImage: false,
      preferredRev: 0,
    },
  };
}

afterEach(() => {
  artUrlCache.urls = {};
});

describe("downloadsBrowse.cover", () => {
  it("reads artist:${id}:thumb and ignores a: keys", () => {
    artUrlCache.urls = {};
    const url = downloadsBrowse.cover(
      { kind: "tree", node: artistNode("ar1") },
      {
        "a:ar1": "blob:old",
        "artist:ar1:thumb": "blob:new",
      },
    );
    expect(url).toBe("blob:new");
  });

  it("prefers the live artUrlCache over a: leftovers", () => {
    artUrlCache.urls = { "artist:ar1:thumb": "blob:cached" };
    const url = downloadsBrowse.cover(
      { kind: "tree", node: artistNode("ar1") },
      {
        "a:ar1": "blob:old",
      },
    );
    expect(url).toBe("blob:cached");
  });
});

describe("downloadsBrowse.loadRoots", () => {
  it("returns empty BrowseTreeLoad when downloads are off", async () => {
    const packed = await downloadsBrowse.loadRoots(loc);
    expect(packed.roots).toEqual([]);
    expect(packed.artUrls).toEqual({});
    expect("hierarchy" in packed).toBe(false);
  });
});
