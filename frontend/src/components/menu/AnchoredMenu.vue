<script setup lang="ts">
/**
 * Viewport-clamped action dropdown (viewport at/above 900px).
 */
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import ActionMenuItem from "@/components/menu/ActionMenuItem.vue";
import type { ActionItem, MenuAnchor } from "@/components/menu/actionItem";

const PAD = 8;

function placeAnchoredMenu(el: HTMLElement, anchor: MenuAnchor) {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = 0;
  let y = 0;
  const rect = anchor.kind === "el" && anchor.el
    ? anchor.el.getBoundingClientRect()
    : null;

  if (rect) {
    x = rect.right - w;
    y = rect.bottom + 4;
    if (x < PAD) x = rect.left;
    if (y + h > vh - PAD) y = rect.top - h - 4;
  } else {
    x = anchor.kind === "point" ? Number(anchor.x) || 0 : 0;
    y = anchor.kind === "point" ? Number(anchor.y) || 0 : 0;
    if (y + h > vh - PAD) y = y - h;
  }

  if (x + w > vw - PAD) x = vw - PAD - w;
  if (y + h > vh - PAD) y = vh - PAD - h;
  if (x < PAD) x = PAD;
  if (y < PAD) y = PAD;
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
}

const props = withDefaults(
  defineProps<{
    items: ActionItem[];
    anchor: MenuAnchor | null;
    restoreEl?: HTMLElement | null;
  }>(),
  { restoreEl: null },
);
const emit = defineEmits<{
  close: [];
  pick: [item: ActionItem];
}>();
const rootEl = ref<HTMLElement | null>(null);
const activeIndex = ref(0);

function enabledIndexes() {
  return props.items
    .map((item, i) => (item.disabled ? -1 : i))
    .filter((i) => i >= 0);
}

function place() {
  if (rootEl.value && props.anchor) {
    placeAnchoredMenu(rootEl.value, props.anchor);
  }
}

function onDocPointer(e: PointerEvent) {
  const t = e.target;
  if (!(t instanceof Node)) return;
  if (rootEl.value?.contains(t)) return;
  const trigger = props.restoreEl;
  if (trigger && (trigger === t || trigger.contains(t))) {
    return;
  }
  emit("close");
}

function onDismiss() {
  emit("close");
}

function moveActive(delta: number) {
  const enabled = enabledIndexes();
  if (!enabled.length) return;
  const cur = enabled.indexOf(activeIndex.value);
  const next =
    cur < 0
      ? enabled[0]
      : enabled[(cur + delta + enabled.length) % enabled.length];
  activeIndex.value = next ?? 0;
}

function onDocKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    emit("close");
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    moveActive(1);
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    moveActive(-1);
    return;
  }
  if (e.key === "Home") {
    e.preventDefault();
    activeIndex.value = enabledIndexes()[0] ?? 0;
    return;
  }
  if (e.key === "End") {
    e.preventDefault();
    const enabled = enabledIndexes();
    activeIndex.value = enabled[enabled.length - 1] ?? 0;
    return;
  }
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    const item = props.items[activeIndex.value];
    if (item && !item.disabled) emit("pick", item);
  }
}

watch(
  () => props.items,
  () => {
    const enabled = enabledIndexes();
    if (!enabled.includes(activeIndex.value)) {
      activeIndex.value = enabled[0] ?? 0;
    }
  },
  { immediate: true },
);

onMounted(async () => {
  await nextTick();
  place();
  document.addEventListener("pointerdown", onDocPointer, true);
  document.addEventListener("keydown", onDocKey, true);
  document.addEventListener("scroll", onDismiss, true);
  window.addEventListener("resize", onDismiss);
});

onUnmounted(() => {
  document.removeEventListener("pointerdown", onDocPointer, true);
  document.removeEventListener("keydown", onDocKey, true);
  document.removeEventListener("scroll", onDismiss, true);
  window.removeEventListener("resize", onDismiss);
});
</script>

<template>
    <Teleport to="body">
      <div
        ref="rootEl"
        class="action-menu-list"
        role="menu"
        aria-label="Track actions"
      >
        <ActionMenuItem
          v-for="(item, i) in items"
          :key="item.id"
          :item="item"
          :active="activeIndex === i"
          @pick="$emit('pick', $event)"
          @mouseenter="activeIndex = i"
        />
      </div>
    </Teleport>
</template>
