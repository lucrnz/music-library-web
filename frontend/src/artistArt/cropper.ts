/**
 * Singleton cropper open state — same shape as stores/dialog.ts.
 */
import { reactive } from "vue";
import { acquireModalLock, releaseModalLock } from "@/stores/modalLock";
import type { CropSource } from "@/artistArt/exportCrop";

export interface CropperState {
  open: boolean;
  source: CropSource | null;
  width: number;
  height: number;
}

let pendingResolve: ((value: Blob | null) => void) | null = null;
let poppingHistory = false;

export const cropper = reactive<CropperState>({
  open: false,
  source: null,
  width: 0,
  height: 0,
});

type HistoryState = Record<string, unknown> & { musicwebCropper?: boolean };

function cropperOnTop(): boolean {
  const state = history.state as HistoryState | null;
  return !!(state && state.musicwebCropper);
}

function pushCropperHistory() {
  const prev =
    history.state && typeof history.state === "object"
      ? (history.state as HistoryState)
      : {};
  history.pushState(
    { ...prev, musicwebCropper: true },
    "",
    location.href,
  );
}

function popCropperHistory() {
  if (!cropperOnTop()) return;
  poppingHistory = true;
  history.back();
}

function closeBitmap() {
  const src = cropper.source;
  cropper.source = null;
  cropper.width = 0;
  cropper.height = 0;
  if (src && typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap) {
    src.close();
  }
}

function settle(value: Blob | null) {
  if (!cropper.open && !pendingResolve) return;
  cropper.open = false;
  closeBitmap();
  releaseModalLock("image-cropper");
  popCropperHistory();
  const resolve = pendingResolve;
  pendingResolve = null;
  if (resolve) resolve(value);
}

export function cancelImageCropper() {
  settle(null);
}

export function resolveImageCropper(blob: Blob) {
  settle(blob);
}

function onPopState() {
  if (poppingHistory) {
    poppingHistory = false;
    return;
  }
  if (cropper.open) settle(null);
}

async function decodeSource(
  file: File | Blob,
): Promise<{ source: CropSource; width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width >= 1 && bitmap.height >= 1) {
        return { source: bitmap, width: bitmap.width, height: bitmap.height };
      }
      bitmap.close();
    } catch {
      /* Image fallback */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    if (img.naturalWidth < 1 || img.naturalHeight < 1) {
      throw new Error("decode");
    }
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function openImageCropper(file: File | Blob): Promise<Blob | null> {
  if (pendingResolve) {
    const prev = pendingResolve;
    pendingResolve = null;
    prev(null);
    closeBitmap();
    releaseModalLock("image-cropper");
    popCropperHistory();
  }

  return decodeSource(file).then(({ source, width, height }) => {
    cropper.source = source;
    cropper.width = width;
    cropper.height = height;
    cropper.open = true;
    acquireModalLock("image-cropper");
    pushCropperHistory();
    window.addEventListener("popstate", onPopState);
    return new Promise((resolve) => {
      pendingResolve = (value) => {
        window.removeEventListener("popstate", onPopState);
        resolve(value);
      };
    });
  });
}
