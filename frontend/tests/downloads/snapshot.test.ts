import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const buildDownloadsHierarchy = vi.hoisted(() => vi.fn());

vi.mock("@/downloads/hierarchy", async () => {
  const actual = await vi.importActual<typeof import("@/downloads/hierarchy")>(
    "@/downloads/hierarchy",
  );
  return {
    ...actual,
    buildDownloadsHierarchy,
  };
});
vi.mock("@/downloads/art", () => ({
  getLocalArtistImageUrl: vi.fn(async () => null),
  getLocalCoverUrl: vi.fn(async () => null),
}));

import {
  invalidateDownloadsCatalogView,
  loadDownloadsCatalogView,
} from "@/downloads/snapshot";

describe("loadDownloadsCatalogView cache", () => {
  beforeEach(() => {
    invalidateDownloadsCatalogView();
    buildDownloadsHierarchy.mockReset();
    buildDownloadsHierarchy.mockResolvedValue({ artists: [] });
  });

  afterEach(() => {
    invalidateDownloadsCatalogView();
  });

  it("reuses the first build until invalidated", async () => {
    const first = await loadDownloadsCatalogView();
    const second = await loadDownloadsCatalogView();
    expect(second).toBe(first);
    expect(buildDownloadsHierarchy).toHaveBeenCalledTimes(1);
    invalidateDownloadsCatalogView();
    const third = await loadDownloadsCatalogView();
    expect(third).not.toBe(first);
    expect(buildDownloadsHierarchy).toHaveBeenCalledTimes(2);
  });
});
