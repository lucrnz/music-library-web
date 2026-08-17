<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";
import {
  cancelImageCropper,
  cropper,
  resolveImageCropper,
} from "@/artistArt/cropper";
import {
  EXPORT_MIN,
  resetView,
  zoomAround,
  clampOffset,
  type CropView,
} from "@/artistArt/cropMath";
import { exportCrop } from "@/artistArt/exportCrop";
import { showToast } from "@/stores/ui";

const VIEW = 320;
const canvasEl = ref<HTMLCanvasElement | null>(null);
const view = ref<CropView>(resetView(1, 1, VIEW));
const pointers = new Map<number, { x: number; y: number }>();
let pinchStartDist = 0;
let pinchStartZoom = 1;
let resizeObs: ResizeObserver | null = null;

function draw() {
  const canvas = canvasEl.value;
  const src = cropper.source;
  if (!canvas || !src) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const v = view.value;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = v.viewSize * dpr;
  canvas.height = v.viewSize * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, v.viewSize, v.viewSize);
  ctx.drawImage(
    src,
    v.offsetX,
    v.offsetY,
    v.imgW * v.zoom,
    v.imgH * v.zoom,
  );
}

function syncViewSize() {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const box = canvas.getBoundingClientRect();
  const size = Math.round(Math.min(box.width, box.height));
  if (size < 8) return;
  const prev = view.value;
  if (prev.viewSize === size && prev.imgW === cropper.width) return;
  view.value = resetView(cropper.width, cropper.height, size);
}

watch(
  () => cropper.open,
  async (open) => {
    if (!open) {
      pointers.clear();
      resizeObs?.disconnect();
      resizeObs = null;
      return;
    }
    await nextTick();
    syncViewSize();
    view.value = resetView(cropper.width, cropper.height, view.value.viewSize);
    draw();
    if (canvasEl.value && typeof ResizeObserver !== "undefined") {
      resizeObs = new ResizeObserver(() => {
        const before = view.value.viewSize;
        syncViewSize();
        if (view.value.viewSize !== before) draw();
      });
      resizeObs.observe(canvasEl.value);
    }
  },
);

watch(view, draw, { deep: true });

function clientPoint(e: PointerEvent | WheelEvent): { x: number; y: number } {
  const canvas = canvasEl.value;
  if (!canvas) return { x: 0, y: 0 };
  const box = canvas.getBoundingClientRect();
  return { x: e.clientX - box.left, y: e.clientY - box.top };
}

function onPointerDown(e: PointerEvent) {
  if (!cropper.open) return;
  e.preventDefault();
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, clientPoint(e));
  if (pointers.size === 2) {
    const pts = [...pointers.values()];
    pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    pinchStartZoom = view.value.zoom;
  }
}

function onPointerMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return;
  e.preventDefault();
  const next = clientPoint(e);
  const prev = pointers.get(e.pointerId);
  pointers.set(e.pointerId, next);
  if (!prev) return;

  if (pointers.size === 2) {
    const pts = [...pointers.values()];
    const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    if (pinchStartDist < 1) return;
    const midX = (pts[0].x + pts[1].x) / 2;
    const midY = (pts[0].y + pts[1].y) / 2;
    view.value = zoomAround(
      view.value,
      pinchStartZoom * (dist / pinchStartDist),
      midX,
      midY,
    );
    return;
  }

  if (pointers.size === 1) {
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const moved = {
      ...view.value,
      offsetX: view.value.offsetX + dx,
      offsetY: view.value.offsetY + dy,
    };
    view.value = { ...moved, ...clampOffset(moved) };
  }
}

function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) {
    pinchStartDist = 0;
  }
}

function onWheel(e: WheelEvent) {
  if (!cropper.open) return;
  e.preventDefault();
  const pt = clientPoint(e);
  const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
  view.value = zoomAround(view.value, view.value.zoom * factor, pt.x, pt.y);
}

function onReset() {
  view.value = resetView(cropper.width, cropper.height, view.value.viewSize);
}

async function onUse() {
  if (!cropper.source) return;
  const result = await exportCrop(cropper.source, view.value);
  if (!result.ok) {
    if (result.reason === "too_small") {
      showToast(`Photo is too small. Use at least ${EXPORT_MIN}px.`);
    } else {
      showToast("Couldn't export that crop. Try JPEG or PNG.");
    }
    return;
  }
  resolveImageCropper(result.blob);
}

function onKey(e: KeyboardEvent) {
  if (!cropper.open) return;
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    cancelImageCropper();
  }
}

watch(
  () => cropper.open,
  (open) => {
    if (open) document.addEventListener("keydown", onKey, true);
    else document.removeEventListener("keydown", onKey, true);
  },
);

onUnmounted(() => {
  document.removeEventListener("keydown", onKey, true);
  resizeObs?.disconnect();
});
</script>

<template>
  <div
    v-if="cropper.open"
    class="image-cropper"
    role="dialog"
    aria-modal="true"
    aria-labelledby="image-cropper-title"
  >
    <div class="image-cropper-backdrop" @click="cancelImageCropper" />
    <div class="image-cropper-panel">
      <div class="image-cropper-head">
        <h2 id="image-cropper-title" class="image-cropper-title">Crop photo</h2>
        <button type="button" class="pill" @click="onReset">Reset</button>
      </div>
      <div class="image-cropper-stage">
        <canvas
          ref="canvasEl"
          class="image-cropper-canvas"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @wheel="onWheel"
        />
      </div>
      <div class="image-cropper-actions">
        <button type="button" class="pill" @click="cancelImageCropper">Cancel</button>
        <button type="button" class="pill primary" @click="onUse">Use photo</button>
      </div>
    </div>
  </div>
</template>
