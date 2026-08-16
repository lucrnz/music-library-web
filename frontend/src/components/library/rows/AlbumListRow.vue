<script setup lang="ts">
/** Album row (list, not grid card) — Search + library list layout. */
import { computed } from "vue";
import { coverUrl } from "@/api";
import { kindForAlbum } from "@/lossyKind";
import Icon from "@/components/icons/Icon.vue";
import LossyMark from "@/components/lossy/LossyMark.vue";
import type { LibraryAlbum } from "@/components/library/loaders";
const props = withDefaults(defineProps<{
  album: LibraryAlbum;
  coverSrc?: string;
}>(), { coverSrc: "" });
const emit = defineEmits<{
  open: [album: LibraryAlbum];
}>();
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
      if (e.target instanceof Element && e.target.closest(".lossy-mark")) return;
      emit("open", props.album);
    }
</script>

<template>
    <div class="row" @click="onClick">
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
      <span class="row-chevron"><Icon name="chevron-right" /></span>
    </div>
</template>
