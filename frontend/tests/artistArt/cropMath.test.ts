import { describe, expect, it } from "vitest";
import {
  clampOffset,
  exportEdge,
  minZoom,
  resetView,
  sourceCropRect,
  zoomAround,
} from "@/artistArt/cropMath";

const VIEW = 400;

describe("cropMath cover-fit", () => {
  it("landscape 3000×2000 covers the square at min zoom", () => {
    expect(minZoom(3000, 2000, VIEW)).toBeCloseTo(0.2);
    const v = resetView(3000, 2000, VIEW);
    expect(v.zoom).toBeCloseTo(0.2);
    expect(v.offsetY).toBeCloseTo(0);
    expect(v.offsetX).toBeCloseTo(-100);
    const rect = sourceCropRect(v);
    expect(rect.size).toBeCloseTo(2000);
    expect(rect.y).toBeCloseTo(0);
  });

  it("portrait 2000×3000 covers the square at min zoom", () => {
    expect(minZoom(2000, 3000, VIEW)).toBeCloseTo(0.2);
    const v = resetView(2000, 3000, VIEW);
    expect(v.offsetX).toBeCloseTo(0);
    expect(v.offsetY).toBeCloseTo(-100);
  });

  it("square 1000×1000 fills exactly", () => {
    const v = resetView(1000, 1000, VIEW);
    expect(v.zoom).toBeCloseTo(0.4);
    expect(v.offsetX).toBeCloseTo(0);
    expect(v.offsetY).toBeCloseTo(0);
  });
});

describe("cropMath clamp", () => {
  it("cannot expose landscape edges", () => {
    const v = resetView(3000, 2000, VIEW);
    const left = clampOffset({ ...v, offsetX: 80 });
    expect(left.offsetX).toBeLessThanOrEqual(0);
    const right = clampOffset({ ...v, offsetX: -9999 });
    expect(right.offsetX + 3000 * v.zoom).toBeGreaterThanOrEqual(VIEW);
    const y = clampOffset({ ...v, offsetY: 40 });
    expect(y.offsetY).toBeCloseTo(0);
  });

  it("reset recenters at min zoom", () => {
    const a = resetView(3000, 2000, VIEW);
    const zoomed = zoomAround(a, a.zoom * 3, 200, 200);
    expect(zoomed.zoom).toBeGreaterThan(a.zoom);
    const back = resetView(3000, 2000, VIEW);
    expect(back.zoom).toBeCloseTo(a.zoom);
    expect(back.offsetX).toBeCloseTo(a.offsetX);
  });

  it("export edge caps at 1000", () => {
    expect(exportEdge(2000)).toBe(1000);
    expect(exportEdge(512.9)).toBe(512);
  });
});
