<script setup lang="ts">
/**
 * Desktop splitter between library and queue. Drag, arrows, or double-click to reset.
 */
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  LIBRARY_PANE_MIN_PX,
  LIBRARY_PANE_QUEUE_MIN_PX,
  clampLibraryPaneWidth,
  setLibraryPaneWidth,
  ui,
} from "@/stores/ui";

const STEP_PX = 16;
const STEP_LARGE_PX = 48;

const handle = ref<HTMLElement | null>(null);
const dragging = ref(false);
const measuredPx = ref(0);
const availablePx = ref(0);

let resizeObs: ResizeObserver | null = null;
let startX = 0;
let startW = 0;
let moved = false;

const valueNow = computed(() =>
  ui.libraryPaneWidthPx != null ? ui.libraryPaneWidthPx : measuredPx.value,
);

const valueMax = computed(() =>
  Math.max(LIBRARY_PANE_MIN_PX, availablePx.value - LIBRARY_PANE_QUEUE_MIN_PX),
);

function measure() {
  const main = handle.value?.closest("main");
  availablePx.value = Math.round(main?.getBoundingClientRect().width || 0);
  const lib = document.getElementById("view-library");
  measuredPx.value = Math.round(lib?.getBoundingClientRect().width || 0);
}

function apply(px: number) {
  measure();
  setLibraryPaneWidth(clampLibraryPaneWidth(px, availablePx.value));
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  const el = handle.value;
  if (!el) return;
  e.preventDefault();
  measure();
  startX = e.clientX;
  startW = valueNow.value;
  moved = false;
  dragging.value = true;
  document.documentElement.classList.add("is-resizing-library-pane");
  el.setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return;
  const dx = e.clientX - startX;
  if (!moved && Math.abs(dx) < 2) return;
  moved = true;
  apply(startW + dx);
}

function stopDrag(e: PointerEvent) {
  if (!dragging.value) return;
  dragging.value = false;
  document.documentElement.classList.remove("is-resizing-library-pane");
  try {
    handle.value?.releasePointerCapture(e.pointerId);
  } catch {
    /* already released */
  }
}

function onDblClick() {
  setLibraryPaneWidth(null);
}

function onKeydown(e: KeyboardEvent) {
  const step = e.shiftKey ? STEP_LARGE_PX : STEP_PX;
  const current = valueNow.value;
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    apply(current - step);
    return;
  }
  if (e.key === "ArrowRight") {
    e.preventDefault();
    apply(current + step);
    return;
  }
  if (e.key === "Home") {
    e.preventDefault();
    apply(LIBRARY_PANE_MIN_PX);
    return;
  }
  if (e.key === "End") {
    e.preventDefault();
    apply(valueMax.value);
    return;
  }
}

onMounted(() => {
  measure();
  const main = handle.value?.closest("main");
  if (!main || typeof ResizeObserver === "undefined") return;
  resizeObs = new ResizeObserver(() => measure());
  resizeObs.observe(main);
  const lib = document.getElementById("view-library");
  if (lib) resizeObs.observe(lib);
});

onUnmounted(() => {
  resizeObs?.disconnect();
  resizeObs = null;
  document.documentElement.classList.remove("is-resizing-library-pane");
});
</script>

<template>
  <div
    ref="handle"
    class="library-pane-resizer"
    :class="{ 'is-dragging': dragging }"
    role="separator"
    aria-orientation="vertical"
    aria-controls="view-library"
    aria-label="Resize library"
    title="Drag to resize. Double-click to reset."
    tabindex="0"
    :aria-valuemin="LIBRARY_PANE_MIN_PX"
    :aria-valuemax="valueMax"
    :aria-valuenow="valueNow"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="stopDrag"
    @pointercancel="stopDrag"
    @dblclick="onDblClick"
    @keydown="onKeydown"
  />
</template>
