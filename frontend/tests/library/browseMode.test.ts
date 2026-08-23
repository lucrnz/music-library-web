import { describe, expect, it } from "vitest";
import { effectiveLibraryMode } from "@/components/library/browseMode";

describe("effectiveLibraryMode", () => {
  it("uses route mode on a library pane", () => {
    expect(effectiveLibraryMode({ mode: "artists", pane: "library" }, "albums")).toBe(
      "artists",
    );
  });

  it("uses last library mode on /queue", () => {
    expect(effectiveLibraryMode({ pane: "queue" }, "artists")).toBe("artists");
  });

  it("defaults to artists when /queue has no last mode", () => {
    expect(effectiveLibraryMode({ pane: "queue" }, undefined)).toBe("artists");
    expect(effectiveLibraryMode({ pane: "queue" }, "")).toBe("artists");
  });

  it("defaults to artists when a library route has no mode", () => {
    expect(effectiveLibraryMode({ pane: "library" }, "albums")).toBe("artists");
  });

  it("does not treat radio as a library mode", () => {
    expect(effectiveLibraryMode({ pane: "radio" }, "albums")).toBe("artists");
  });
});
