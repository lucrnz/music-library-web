<script setup lang="ts">
/** Grid card for an artist (image + name + counts). */
import { computed } from "vue";
import { artistImageUrl } from "@/api";
import { isDesktopContextMenu } from "@/components/menu/rowActionMenu";
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
      if (!props.showMenu || !isDesktopContextMenu()) return;
      e.preventDefault();
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
    <div class="media-card-wrap" @contextmenu="onContext">
      <button type="button" class="media-card" @click="onClick">
        <span
          class="media-card-cover-wrap"
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop"
        >
          <img class="media-card-cover" :src="cover" alt="" loading="lazy" />
        </span>
        <span class="media-card-title">{{ artist.name }}</span>
        <span v-if="sub" class="media-card-sub">{{ sub }}</span>
      </button>
      <button
        v-if="showMenu"
        type="button"
        class="icon-btn row-menu media-card-menu"
        title="Artist actions"
        aria-label="Artist actions"
        :aria-haspopup="desktop ? 'menu' : 'dialog'"
        @click="onMenuClick"
      ><Icon name="more-vert" /></button>
    </div>
</template>
