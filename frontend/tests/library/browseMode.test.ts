import { describe, expect, it } from "vitest";
import { effectiveLibraryMode } from "@/components/library/browseMode";

describe("effectiveLibraryMode", () => {
  it("uses route mode on a library pane", () => {
    expect(effectiveLibraryMode({ mode: "artists", pane: "library" }, "folders")).toBe(
      "artists",
    );
  });

  it("uses last library mode on /queue", () => {
    expect(effectiveLibraryMode({ pane: "queue" }, "artists")).toBe("artists");
  });

  it("defaults to folders when /queue has no last mode", () => {
    expect(effectiveLibraryMode({ pane: "queue" }, undefined)).toBe("folders");
    expect(effectiveLibraryMode({ pane: "queue" }, "")).toBe("folders");
  });

  it("defaults to folders when a library route has no mode", () => {
    expect(effectiveLibraryMode({ pane: "library" }, "artists")).toBe("folders");
  });
});
