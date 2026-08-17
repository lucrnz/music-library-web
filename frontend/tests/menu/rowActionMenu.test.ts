import { afterEach, describe, expect, it, vi } from "vitest";
import { isDesktopContextMenu, nextOpenKey } from "@/components/menu/rowActionMenu";

describe("nextOpenKey", () => {
  it("opens a new artist id", () => {
    expect(nextOpenKey("", "artist-a")).toBe("artist-a");
  });

  it("toggles the same artist id closed", () => {
    expect(nextOpenKey("artist-a", "artist-a")).toBe("");
  });

  it("switches to a different artist id", () => {
    expect(nextOpenKey("artist-a", "artist-b")).toBe("artist-b");
  });
});

describe("isDesktopContextMenu", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is true at desktop width", () => {
    vi.stubGlobal("window", {
      matchMedia: (q: string) => ({ matches: q === "(min-width: 900px)" }),
    });
    expect(isDesktopContextMenu()).toBe(true);
  });

  it("is false below desktop width", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
    });
    expect(isDesktopContextMenu()).toBe(false);
  });
});
