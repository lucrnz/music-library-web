<script setup lang="ts">
/**
 * Centered action card (viewport below 900px).
 */
import { nextTick, onMounted, onUnmounted, ref } from "vue";
import {
  acquireModalLock,
  releaseModalLock,
} from "@/stores/modalLock";
import ActionMenuItem from "@/components/menu/ActionMenuItem.vue";

const LOCK = "action-menu";
import type { ActionItem } from "@/components/menu/actionItem";
const props = defineProps<{
  items: ActionItem[];
}>();
const emit = defineEmits<{
  close: [];
  pick: [item: ActionItem];
}>();
const sheetEl = ref<HTMLElement | null>(null);

    function enabledButtons() {
      const root = sheetEl.value;
      if (!root) return [];
      return [...root.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        emit("close");
        return;
      }
      if (e.key !== "Tab") return;
      const list = enabledButtons();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    onMounted(async () => {
      acquireModalLock(LOCK);
      document.addEventListener("keydown", onKey, true);
      await nextTick();
      enabledButtons()[0]?.focus?.();
    });

    onUnmounted(() => {
      document.removeEventListener("keydown", onKey, true);
      releaseModalLock(LOCK);
    });
</script>

<template>
    <Teleport to="body">
      <div class="action-card" role="dialog" aria-modal="true" aria-label="Track actions">
        <div class="action-card-backdrop" @click="$emit('close')"></div>
        <div ref="sheetEl" class="action-card-sheet">
          <ActionMenuItem
            v-for="item in items"
            :key="item.id"
            :item="item"
            item-role="none"
            @pick="$emit('pick', $event)"
          />
        </div>
      </div>
    </Teleport>
</template>
