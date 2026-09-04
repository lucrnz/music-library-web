<script setup lang="ts">
import { computed, ref } from "vue";
import CdFilesystem from "@/components/cd/CdFilesystem.vue";
import CdRomQueue from "@/components/cd/CdRomQueue.vue";
import { CDROM_SPLIT_MIN_PX, setCdromSplitHeight, ui } from "@/stores/ui";

const handle = ref<HTMLElement | null>(null);
const dragging = ref(false);
let startY = 0;
let startH = 0;

const paneStyle = computed(() => {
  if (ui.cdromSplitHeightPx == null) return undefined;
  return { "--cdrom-fs-h": `${ui.cdromSplitHeightPx}px` };
});

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  const el = handle.value;
  if (!el) return;
  e.preventDefault();
  const fs = el.previousElementSibling as HTMLElement | null;
  startY = e.clientY;
  startH = fs?.getBoundingClientRect().height || CDROM_SPLIT_MIN_PX;
  dragging.value = true;
  el.setPointerCapture(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return;
  const pane = handle.value?.parentElement;
  const paneH = pane?.getBoundingClientRect().height || 0;
  const max = Math.max(
    CDROM_SPLIT_MIN_PX,
    Math.round(paneH - CDROM_SPLIT_MIN_PX - 8),
  );
  const next = Math.round(startH + (e.clientY - startY));
  setCdromSplitHeight(Math.min(max, Math.max(CDROM_SPLIT_MIN_PX, next)));
}

function onPointerUp(e: PointerEvent) {
  if (!dragging.value) return;
  dragging.value = false;
  try {
    handle.value?.releasePointerCapture(e.pointerId);
  } catch {
    /* already released */
  }
}
</script>

<template>
  <section
    id="view-cdrom"
    class="view cdrom-pane"
    :class="{ 'has-cdrom-split': ui.cdromSplitHeightPx != null }"
    :style="paneStyle"
    aria-label="Data CD"
  >
    <CdFilesystem />
    <div
      ref="handle"
      class="cdrom-split"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize disc and queue"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
    />
    <CdRomQueue />
  </section>
</template>
