<script setup lang="ts">
/** Grid card for an artist (image + name + counts). */
import { computed } from "vue";
import { artistImageUrl } from "@/api";
import { isDesktopContextMenu } from "@/components/menu/rowActionMenu";
import type { ArtistListItem } from "@/api";
const props = withDefaults(defineProps<{
  artist: ArtistListItem;
  coverSrc?: string;
  showCounts?: boolean;
  menuEnabled?: boolean;
}>(), { coverSrc: "", showCounts: true, menuEnabled: false });
const emit = defineEmits<{
  open: [artist: ArtistListItem];
  "row-contextmenu": [artist: ArtistListItem, e: MouseEvent];
  "thumb-drop": [artist: ArtistListItem, file: File];
}>();
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
    function onContext(e: MouseEvent) {
      if (!props.menuEnabled || !isDesktopContextMenu()) return;
      e.preventDefault();
      emit("row-contextmenu", props.artist, e);
    }
    function onDragOver(e: DragEvent) {
      if (!props.menuEnabled) return;
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
      if (!props.menuEnabled) return;
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer?.files?.[0];
      if (file) emit("thumb-drop", props.artist, file);
    }
</script>

<template>
    <button type="button" class="media-card" @click="onClick" @contextmenu="onContext">
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
</template>
