<script setup lang="ts">
import { computed } from "vue";
import { coverUrl } from "@/api";
import { resolveRowCover } from "@/components/library/rowCover";
import { kindForAlbum } from "@/lossyKind";
import { useDesktopViewport } from "@/layout";
import Icon from "@/components/icons/Icon.vue";
import LossyMark from "@/components/lossy/LossyMark.vue";
import type { LibraryAlbum } from "@/components/library/loaders";
const props = withDefaults(defineProps<{
  album: LibraryAlbum;
  coverSrc?: string | null;
  showMenu?: boolean;
}>(), { coverSrc: null, showMenu: false });
const emit = defineEmits<{
  open: [album: LibraryAlbum];
  "menu-click": [album: LibraryAlbum, e: MouseEvent];
  "row-contextmenu": [album: LibraryAlbum, e: MouseEvent];
}>();
const desktop = useDesktopViewport();
const cover = computed(() =>
      resolveRowCover(
        props.coverSrc,
        coverUrl({ albumId: props.album.id }, "thumb", false),
      )
    );
    const sub = computed(() =>
      [props.album.artist, props.album.year].filter(Boolean).join(" · ")
    );
    const lossyKind = computed(() => kindForAlbum(props.album));
    function onClick() {
      emit("open", props.album);
    }
    function onMenuClick(e: MouseEvent) {
      e.stopPropagation();
      e.preventDefault();
      emit("menu-click", props.album, e);
    }
    function onContext(e: MouseEvent) {
      if (!props.showMenu) return;
      emit("row-contextmenu", props.album, e);
    }
</script>

<template>
    <div class="media-card-wrap" @contextmenu="onContext">
      <button type="button" class="media-card" @click="onClick">
        <img class="media-card-cover" :src="cover" alt="" loading="lazy" />
        <span class="media-card-title">{{ album.title }}</span>
        <span class="media-card-sub">{{ sub }}</span>
      </button>
      <LossyMark class="media-card-lossy" :kind="lossyKind" />
      <button
        v-if="showMenu"
        type="button"
        class="icon-btn row-menu media-card-menu"
        title="Album actions"
        aria-label="Album actions"
        :aria-haspopup="desktop ? 'menu' : 'dialog'"
        @click="onMenuClick"
      ><Icon name="more-vert" /></button>
    </div>
</template>
