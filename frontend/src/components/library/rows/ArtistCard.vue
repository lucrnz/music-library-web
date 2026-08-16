<script setup lang="ts">
/** Grid card for an artist (image + name + counts). */
import { computed } from "vue";
import { artistImageUrl } from "@/api";
import type { ArtistListItem } from "@/api";
const props = withDefaults(defineProps<{
  artist: ArtistListItem;
  coverSrc?: string;
  showCounts?: boolean;
}>(), { coverSrc: "", showCounts: true });
const emit = defineEmits<{
  open: [artist: ArtistListItem];
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
</script>

<template>
    <button type="button" class="media-card" @click="onClick">
      <img class="media-card-cover" :src="cover" alt="" loading="lazy" />
      <span class="media-card-title">{{ artist.name }}</span>
      <span v-if="sub" class="media-card-sub">{{ sub }}</span>
    </button>
</template>
