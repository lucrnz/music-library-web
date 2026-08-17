/** Locked 1:1 crop framing: cover-fit min zoom, clamped pan, source rect. */

export const MAX_ZOOM_MULT = 8;
export const EXPORT_MAX = 1000;
export const EXPORT_MIN = 200;

export interface CropView {
  imgW: number;
  imgH: number;
  viewSize: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export function minZoom(imgW: number, imgH: number, viewSize: number): number {
  if (imgW <= 0 || imgH <= 0 || viewSize <= 0) return 1;
  return Math.max(viewSize / imgW, viewSize / imgH);
}

export function maxZoom(imgW: number, imgH: number, viewSize: number): number {
  return minZoom(imgW, imgH, viewSize) * MAX_ZOOM_MULT;
}

export function clampZoom(
  zoom: number,
  imgW: number,
  imgH: number,
  viewSize: number,
): number {
  const lo = minZoom(imgW, imgH, viewSize);
  return Math.min(maxZoom(imgW, imgH, viewSize), Math.max(lo, zoom));
}

export function clampOffset(state: CropView): { offsetX: number; offsetY: number } {
  const dispW = state.imgW * state.zoom;
  const dispH = state.imgH * state.zoom;
  return {
    offsetX: Math.min(0, Math.max(state.viewSize - dispW, state.offsetX)),
    offsetY: Math.min(0, Math.max(state.viewSize - dispH, state.offsetY)),
  };
}

export function resetView(imgW: number, imgH: number, viewSize: number): CropView {
  const zoom = minZoom(imgW, imgH, viewSize);
  const next: CropView = {
    imgW,
    imgH,
    viewSize,
    zoom,
    offsetX: (viewSize - imgW * zoom) / 2,
    offsetY: (viewSize - imgH * zoom) / 2,
  };
  return { ...next, ...clampOffset(next) };
}

export function sourceCropRect(state: CropView): {
  x: number;
  y: number;
  size: number;
} {
  return {
    x: -state.offsetX / state.zoom,
    y: -state.offsetY / state.zoom,
    size: state.viewSize / state.zoom,
  };
}

export function zoomAround(
  state: CropView,
  newZoom: number,
  px: number,
  py: number,
): CropView {
  const zoom = clampZoom(newZoom, state.imgW, state.imgH, state.viewSize);
  const imgX = (px - state.offsetX) / state.zoom;
  const imgY = (py - state.offsetY) / state.zoom;
  const next: CropView = {
    ...state,
    zoom,
    offsetX: px - imgX * zoom,
    offsetY: py - imgY * zoom,
  };
  return { ...next, ...clampOffset(next) };
}

export function exportEdge(sourceCropPx: number): number {
  return Math.min(EXPORT_MAX, Math.floor(sourceCropPx));
}
