<script setup lang="ts">
import { computed } from "vue";
import { artistImageUrl } from "@/api";
import { useDesktopViewport } from "@/layout";
import Icon from "@/components/icons/Icon.vue";
import type { ArtistListItem } from "@/api";
const props = withDefaults(defineProps<{
  artist: ArtistListItem;
  coverSrc?: string;
  showCounts?: boolean;
  showMenu?: boolean;
  includePhoto?: boolean;
}>(), { coverSrc: "", showCounts: true, showMenu: false, includePhoto: false });
const emit = defineEmits<{
  open: [artist: ArtistListItem];
  "menu-click": [artist: ArtistListItem, e: MouseEvent];
  "row-contextmenu": [artist: ArtistListItem, e: MouseEvent];
  "thumb-drop": [artist: ArtistListItem, file: File];
}>();
const desktop = useDesktopViewport();
const cover = computed(
      () => props.coverSrc || artistImageUrl(props.artist, "thumb", false)
    );
    const sub = computed(() => {
      if (!props.showCounts) return "";
      const a = props.artist;
      const n = a.album_count;
      const albums = `${n} album${n === 1 ? "" : "s"}`;
      return `${albums} · ${a.track_count} tracks`;
    });
    function onClick() {
      emit("open", props.artist);
    }
    function onMenuClick(e: MouseEvent) {
      e.stopPropagation();
      e.preventDefault();
      emit("menu-click", props.artist, e);
    }
    function onContext(e: MouseEvent) {
      if (!props.showMenu) return;
      emit("row-contextmenu", props.artist, e);
    }
    function onDragOver(e: DragEvent) {
      if (!props.includePhoto) return;
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      (e.currentTarget as HTMLElement).classList.add("thumb-drop-over");
    }
    function onDragLeave(e: DragEvent) {
      (e.currentTarget as HTMLElement).classList.remove("thumb-drop-over");
    }
    function onDrop(e: DragEvent) {
      (e.currentTarget as HTMLElement).classList.remove("thumb-drop-over");
      if (!props.includePhoto) return;
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer?.files?.[0];
      if (file) emit("thumb-drop", props.artist, file);
    }
</script>

<template>
    <div class="row" @click="onClick" @contextmenu="onContext">
      <span
        class="row-cover-wrap"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <img class="row-cover" :src="cover" alt="" loading="lazy" />
      </span>
      <span class="row-meta">
        <span class="row-title">{{ artist.name }}</span>
        <span v-if="sub" class="row-sub">{{ sub }}</span>
      </span>
      <button
        v-if="showMenu"
        type="button"
        class="icon-btn row-menu"
        title="Artist actions"
        aria-label="Artist actions"
        :aria-haspopup="desktop ? 'menu' : 'dialog'"
        @click="onMenuClick"
      ><Icon name="more-vert" /></button>
      <span v-else class="row-chevron"><Icon name="chevron-right" /></span>
    </div>
</template>
