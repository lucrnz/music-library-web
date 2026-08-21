import { describe, expect, it } from "vitest";
import { resolveRowCover } from "@/components/library/rowCover";
import { libraryShowTree } from "@/components/library/browseChrome";

describe("resolveRowCover", () => {
  it("uses remote fallback when coverSrc is omitted or null", () => {
    expect(resolveRowCover(undefined, "/api/cover?x=1")).toBe("/api/cover?x=1");
    expect(resolveRowCover(null, "/api/cover?x=1")).toBe("/api/cover?x=1");
  });

  it("uses a provided URL", () => {
    expect(resolveRowCover("blob:local", "/api/cover?x=1")).toBe("blob:local");
  });

  it("uses the placeholder when coverSrc is empty", () => {
    expect(resolveRowCover("", "/api/cover?x=1")).toBe(
      "/static/img/placeholder.svg",
    );
  });
});

describe("libraryShowTree", () => {
  it("shows the tree for downloads layout", () => {
    expect(
      libraryShowTree({ layout: "tree", isSearch: false, mode: "downloads" }),
    ).toBe(true);
  });
});
