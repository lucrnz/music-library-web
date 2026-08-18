<script setup lang="ts">
/** Album row (list, not grid card) — Search + library list layout. */
import { computed } from "vue";
import { coverUrl } from "@/api";
import { kindForAlbum } from "@/lossyKind";
import { useDesktopViewport } from "@/layout";
import Icon from "@/components/icons/Icon.vue";
import LossyMark from "@/components/lossy/LossyMark.vue";
import type { LibraryAlbum } from "@/components/library/loaders";
const props = withDefaults(defineProps<{
  album: LibraryAlbum;
  coverSrc?: string;
  showMenu?: boolean;
}>(), { coverSrc: "", showMenu: false });
const emit = defineEmits<{
  open: [album: LibraryAlbum];
  "menu-click": [album: LibraryAlbum, e: MouseEvent];
  "row-contextmenu": [album: LibraryAlbum, e: MouseEvent];
}>();
const desktop = useDesktopViewport();
const cover = computed(
      () =>
        props.coverSrc ||
        coverUrl({ albumId: props.album.id }, "thumb", false)
    );
    const sub = computed(() => {
      const a = props.album;
      const year = a.year ? ` · ${a.year}` : "";
      return `${a.artist || ""}${year} · ${a.trackCount ?? 0} tracks`;
    });
    const lossyKind = computed(() => kindForAlbum(props.album));
    function onClick(e: MouseEvent) {
      if (
        e.target instanceof Element &&
        (e.target.closest(".lossy-mark") || e.target.closest(".row-menu"))
      ) {
        return;
      }
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
    <div class="row" @click="onClick" @contextmenu="onContext">
      <span class="row-cover-wrap">
        <img class="row-cover" :src="cover" alt="" loading="lazy" />
      </span>
      <span class="row-meta">
        <span class="row-title-line">
          <span class="row-title">{{ album.title }}</span>
          <LossyMark :kind="lossyKind" />
        </span>
        <span class="row-sub">{{ sub }}</span>
      </span>
      <button
        v-if="showMenu"
        type="button"
        class="icon-btn row-menu"
        title="Album actions"
        aria-label="Album actions"
        :aria-haspopup="desktop ? 'menu' : 'dialog'"
        @click="onMenuClick"
      ><Icon name="more-vert" /></button>
      <span v-else class="row-chevron"><Icon name="chevron-right" /></span>
    </div>
</template>
