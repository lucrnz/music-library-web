<script setup lang="ts">
import { useDesktopViewport } from "@/layout";
import Icon from "@/components/icons/Icon.vue";
import type { BrowseDir } from "@/api";
const props = withDefaults(defineProps<{
  dir: BrowseDir;
  selected?: boolean;
  showMenu?: boolean;
}>(), { selected: false, showMenu: false });
const emit = defineEmits<{
  open: [dir: BrowseDir];
  select: [dir: BrowseDir, e?: MouseEvent];
  "menu-click": [dir: BrowseDir, e: MouseEvent];
  "row-contextmenu": [dir: BrowseDir, e: MouseEvent];
}>();
const desktop = useDesktopViewport();
function onClick(e: MouseEvent) {
      if (e.target instanceof Element && e.target.closest(".row-menu")) return;
      if (e.metaKey || e.ctrlKey) {
        emit("select", props.dir, e);
        return;
      }
      emit("open", props.dir);
    }
    function onMenuClick(e: MouseEvent) {
      e.stopPropagation();
      e.preventDefault();
      emit("menu-click", props.dir, e);
    }
    function onContext(e: MouseEvent) {
      if (!props.showMenu) return;
      emit("row-contextmenu", props.dir, e);
    }
</script>

<template>
    <div
      class="row"
      :class="{ selected }"
      @click="onClick"
      @contextmenu="onContext"
    >
      <span class="row-icon"><Icon name="folder" /></span>
      <span class="row-meta"><span class="row-title">{{ dir.name }}</span></span>
      <button
        v-if="showMenu"
        type="button"
        class="icon-btn row-menu"
        title="Folder actions"
        aria-label="Folder actions"
        :aria-haspopup="desktop ? 'menu' : 'dialog'"
        @click="onMenuClick"
      ><Icon name="more-vert" /></button>
      <span v-else class="row-chevron"><Icon name="chevron-right" /></span>
    </div>
</template>
