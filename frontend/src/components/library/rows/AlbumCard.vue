<script setup lang="ts">
import { computed } from "vue";
import { coverUrl } from "@/api";
import { kindForAlbum } from "@/lossyKind";
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
    const sub = computed(() =>
      [props.album.artist, props.album.year].filter(Boolean).join(" · ")
    );
    const lossyKind = computed(() => kindForAlbum(props.album));
    function onClick() {
      emit("open", props.album);
    }
</script>

<template>
    <div class="media-card-wrap">
      <button type="button" class="media-card" @click="onClick">
        <img class="media-card-cover" :src="cover" alt="" loading="lazy" />
        <span class="media-card-title">{{ album.title }}</span>
        <span class="media-card-sub">{{ sub }}</span>
      </button>
      <LossyMark class="media-card-lossy" :kind="lossyKind" />
    </div>
</template>
