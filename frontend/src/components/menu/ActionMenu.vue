<script setup lang="ts">
/**
 * Thin picker: centered card below 900px, anchored menu at/above.
 * Does not import vue-router. Caller owns route/edit close.
 */
import { nextTick, watch } from "vue";
import { useDesktopViewport } from "@/layout";
import ActionCard from "@/components/menu/ActionCard.vue";
import AnchoredMenu from "@/components/menu/AnchoredMenu.vue";
import type { ActionItem } from "@/components/menu/actionItem";
import type { MenuAnchor } from "@/components/menu/actionItem";
const props = withDefaults(defineProps<{
  open?: boolean;
  items?: ActionItem[];
  anchor?: MenuAnchor | null;
  restoreEl?: HTMLElement | null;
}>(), { open: false, items: () => [], anchor: null, restoreEl: null });
const emit = defineEmits<{
  close: [];
}>();
const desktop = useDesktopViewport();

    watch(desktop, (now, was) => {
      if (props.open && was != null && now !== was) emit("close");
    });

    async function onPick(item: ActionItem) {
      if (!item || item.disabled) return;
      emit("close");
      await nextTick();
      const el = props.restoreEl;
      if (el && typeof el.focus === "function" && document.contains(el)) {
        el.focus();
      }
      if (typeof item.run === "function") await item.run();
    }
</script>

<template>
    <ActionCard
      v-if="open && !desktop"
      :items="items"
      @close="$emit('close')"
      @pick="onPick"
    />
    <AnchoredMenu
      v-else-if="open && anchor"
      :items="items"
      :anchor="anchor"
      :restore-el="restoreEl"
      @close="$emit('close')"
      @pick="onPick"
    />
</template>
