import { beforeEach, describe, expect, it } from "vitest";
import {
  LIBRARY_PANE_MIN_PX,
  LIBRARY_PANE_QUEUE_MIN_PX,
  clampLibraryPaneWidth,
  parseLibraryPaneWidth,
  setLibraryPaneWidth,
  ui,
} from "@/stores/ui";

const PANE_KEY = "musicweb.libraryPaneWidth.v1";

describe("library pane width", () => {
  beforeEach(() => {
    setLibraryPaneWidth(null);
  });

  it("parses a stored integer and rejects junk", () => {
    expect(parseLibraryPaneWidth(null)).toBeNull();
    expect(parseLibraryPaneWidth("")).toBeNull();
    expect(parseLibraryPaneWidth("nope")).toBeNull();
    expect(parseLibraryPaneWidth("0")).toBeNull();
    expect(parseLibraryPaneWidth(String(LIBRARY_PANE_MIN_PX - 1))).toBeNull();
    expect(parseLibraryPaneWidth("420")).toBe(420);
    expect(parseLibraryPaneWidth("420.4")).toBe(420);
  });

  it("persists a custom width and clears back to the CSS default", () => {
    setLibraryPaneWidth(420);
    expect(ui.libraryPaneWidthPx).toBe(420);
    expect(localStorage.getItem(PANE_KEY)).toBe("420");
    setLibraryPaneWidth(null);
    expect(ui.libraryPaneWidthPx).toBeNull();
    expect(localStorage.getItem(PANE_KEY)).toBeNull();
  });

  it("ignores values below the minimum", () => {
    setLibraryPaneWidth(LIBRARY_PANE_MIN_PX - 1);
    expect(ui.libraryPaneWidthPx).toBeNull();
    expect(localStorage.getItem(PANE_KEY)).toBeNull();
  });

  it("clamps to the library min and the leftover queue min", () => {
    expect(clampLibraryPaneWidth(100, 900)).toBe(LIBRARY_PANE_MIN_PX);
    expect(clampLibraryPaneWidth(400, 900)).toBe(400);
    expect(clampLibraryPaneWidth(800, 900)).toBe(900 - LIBRARY_PANE_QUEUE_MIN_PX);
    expect(clampLibraryPaneWidth(Number.NaN, 900)).toBe(LIBRARY_PANE_MIN_PX);
  });
});
